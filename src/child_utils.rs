// Based on [shared_child](https://github.com/oconnor663/shared_child.rs), thanks!

pub use sys::*;

#[cfg(not(windows))]
mod sys {
    extern crate libc;
    use std::io;
    use std::process::Child;

    fn send_signal(pid: u32, signal: libc::c_int) -> io::Result<()> {
        match unsafe { libc::kill(pid as _, signal) } {
            -1 => Err(io::Error::last_os_error()),
            _ => Ok(()),
        }
    }

    pub struct WaitHandle(u32);

    impl WaitHandle {
        pub fn from_child(child: &Child) -> Self {
            Self(child.id())
        }

        pub fn wait(&self) -> io::Result<()> {
            loop {
                let ret = unsafe {
                    let mut siginfo = std::mem::zeroed();
                    libc::waitid(
                        libc::P_PID,
                        self.0 as _,
                        &mut siginfo,
                        libc::WEXITED | libc::WNOWAIT,
                    )
                };
                if ret == 0 {
                    return Ok(());
                }
                let e = io::Error::last_os_error();
                if e.kind() != io::ErrorKind::Interrupted {
                    return Err(e);
                }
                // We were interrupted. Loop and retry.
            }
        }
    }

    pub fn suspend(child: &mut Child) -> io::Result<()> {
        if let Ok(None) = child.try_wait() {
        } else {
            return Ok(());
        }
        send_signal(child.id(), libc::SIGTSTP)
    }

    pub fn resume(child: &mut Child) -> io::Result<()> {
        if let Ok(None) = child.try_wait() {
        } else {
            return Ok(());
        }
        send_signal(child.id(), libc::SIGCONT)
    }
}

#[cfg(windows)]
#[allow(clippy::upper_case_acronyms)]
#[allow(non_snake_case)]
mod sys {
    // [oconnor663 / shared_child.rs] said:
    // Windows has actually always supported this, by preventing PID reuse
    // while there are still open handles to a child process.

    use std::io;
    use std::mem::transmute;
    use std::os::raw::{c_char, c_long, c_ulong, c_void};
    use std::os::windows::prelude::AsRawHandle;
    use std::process::Child;

    // Copy from [winapi-rs](https://github.com/retep998/winapi-rs)
    type LONG = c_long;
    type DWORD = c_ulong;
    type HANDLE = *mut c_void;
    type HMODULE = *mut c_void;
    type LPCSTR = *const c_char;
    type FARPROC = *mut c_void;
    type NTSTATUS = c_long;
    type FnNtProcess = extern "stdcall" fn(HANDLE) -> NTSTATUS;

    const INFINITE: DWORD = 0xFFFFFFFF;
    const WAIT_OBJECT_0: DWORD = 0x00000000_u32;
    const STATUS_SUCCESS: LONG = 0x00000000;
    extern "system" {
        fn GetProcAddress(hModule: HMODULE, lpProcName: LPCSTR) -> FARPROC;
        fn GetModuleHandleA(lpModuleName: LPCSTR) -> HMODULE;
        fn WaitForSingleObject(hHandle: HANDLE, dwMilliseconds: DWORD) -> DWORD;
    }

    unsafe fn get_nt_function(name: &[u8]) -> FnNtProcess {
        let module_handle = GetModuleHandleA(b"ntdll\0".as_ptr() as _);
        let address = GetProcAddress(module_handle, name.as_ptr() as _);
        transmute::<*const usize, FnNtProcess>(address as _)
    }

    pub struct WaitHandle(std::os::windows::io::RawHandle);

    impl WaitHandle {
        pub fn from_child(child: &Child) -> Self {
            Self(child.as_raw_handle())
        }
        pub fn wait(&self) -> io::Result<()> {
            match unsafe { WaitForSingleObject(self.0, INFINITE) } {
                WAIT_OBJECT_0 => Ok(()),
                _ => Err(io::Error::last_os_error()),
            }
        }
    }

    pub fn suspend(child: &mut Child) -> io::Result<()> {
        if let Ok(None) = child.try_wait() {
        } else {
            return Ok(());
        }
        let raw_handle = child.as_raw_handle();
        match unsafe { get_nt_function(b"NtSuspendProcess\0")(raw_handle) } {
            STATUS_SUCCESS => Ok(()),
            _ => Err(io::Error::last_os_error()),
        }
    }

    pub fn resume(child: &mut Child) -> io::Result<()> {
        if let Ok(None) = child.try_wait() {
        } else {
            return Ok(());
        }
        let raw_handle = child.as_raw_handle();
        match unsafe { get_nt_function(b"NtResumeProcess\0")(raw_handle) } {
            STATUS_SUCCESS => Ok(()),
            _ => Err(io::Error::last_os_error()),
        }
    }
}
