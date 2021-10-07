// Based on [shared_child](https://github.com/oconnor663/shared_child.rs), thanks!

pub use sys::*;

#[cfg(unix)]
mod sys {
    extern crate libc;
    use std::io;

    fn send_signal(pid: u32, signal: libc::c_int) -> io::Result<()> {
        match unsafe { libc::kill(pid as libc::pid_t, signal) } {
            -1 => Err(io::Error::last_os_error()),
            _ => Ok(()),
        }
    }

    #[derive(Copy, Clone)]
    pub struct ChildHandle(u32);

    impl ChildHandle {
        pub fn from(child: std::process::Child) -> Self {
            Self(child.id())
        }

        pub fn wait(&self) -> io::Result<()> {
            loop {
                let ret = unsafe {
                    let mut siginfo = std::mem::zeroed();
                    libc::waitid(
                        libc::P_PID,
                        self.0 as libc::id_t,
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

        pub fn kill(&self) -> io::Result<()> {
            send_signal(self.0, libc::SIGABRT)
        }

        pub fn suspend(&self) -> io::Result<()> {
            send_signal(self.0, libc::SIGTSTP)
        }

        pub fn resume(&self) -> io::Result<()> {
            send_signal(self.0, libc::SIGCONT)
        }
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
    use std::os::raw::{c_char, c_int, c_long, c_uint, c_ulong, c_void};

    // Copy from [winapi-rs](https://github.com/retep998/winapi-rs)
    type BOOL = c_int;
    type UINT = c_uint;
    type LONG = c_long;
    type DWORD = c_ulong;
    type HANDLE = *mut c_void;
    type HMODULE = *mut c_void;
    type LPCSTR = *const c_char;
    type FARPROC = *mut c_void;
    type NTSTATUS = c_long;
    type FnNtProcess = extern "stdcall" fn(HANDLE) -> NTSTATUS;

    const FALSE: BOOL = false as BOOL;
    const INFINITE: DWORD = 0xFFFFFFFF;
    const WAIT_OBJECT_0: DWORD = 0x00000000_u32;
    const STATUS_SUCCESS: LONG = 0x00000000;
    const STANDARD_RIGHTS_REQUIRED: DWORD = 0x000F0000;
    const SYNCHRONIZE: DWORD = 0x00100000;
    const PROCESS_ALL_ACCESS: DWORD = STANDARD_RIGHTS_REQUIRED | SYNCHRONIZE | 0xFFFF;

    #[link(name = "kernel32", kind = "dylib")]
    extern "C" {
        fn OpenProcess(dwDesiredAccess: DWORD, bInheritHandle: BOOL, dwProcessId: DWORD) -> HANDLE;
        fn TerminateProcess(hProcess: HANDLE, uExitCode: UINT) -> BOOL;
        fn GetProcAddress(hModule: HMODULE, lpProcName: LPCSTR) -> FARPROC;
        fn GetModuleHandleA(lpModuleName: LPCSTR) -> HMODULE;
        fn WaitForSingleObject(hHandle: HANDLE, dwMilliseconds: DWORD) -> DWORD;
    }

    unsafe fn get_nt_function(name: &[u8]) -> FnNtProcess {
        let module_handle = GetModuleHandleA(b"ntdll\0".as_ptr() as LPCSTR);
        let address = GetProcAddress(module_handle, name.as_ptr() as LPCSTR);
        transmute::<*const usize, FnNtProcess>(address as *const usize)
    }

    #[derive(Copy, Clone)]
    pub struct ChildHandle(HANDLE);

    impl ChildHandle {
        pub fn from(child: std::process::Child) -> Self {
            Self(unsafe { OpenProcess(PROCESS_ALL_ACCESS, FALSE, child.id()) })
        }

        pub fn wait(&self) -> io::Result<()> {
            match unsafe { WaitForSingleObject(self.0, INFINITE) } {
                WAIT_OBJECT_0 => Ok(()),
                _ => Err(io::Error::last_os_error()),
            }
        }

        pub fn kill(&self) -> io::Result<()> {
            match unsafe { TerminateProcess(self.0, 0) } {
                FALSE => Err(io::Error::last_os_error()),
                _ => Ok(()),
            }
        }

        pub fn suspend(&self) -> io::Result<()> {
            match unsafe { get_nt_function(b"NtSuspendProcess\0")(self.0) } {
                STATUS_SUCCESS => Ok(()),
                _ => Err(io::Error::last_os_error()),
            }
        }

        pub fn resume(&self) -> io::Result<()> {
            match unsafe { get_nt_function(b"NtResumeProcess\0")(self.0) } {
                STATUS_SUCCESS => Ok(()),
                _ => Err(io::Error::last_os_error()),
            }
        }
    }

    unsafe impl std::marker::Send for ChildHandle {}
}
