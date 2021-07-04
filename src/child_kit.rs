/* Refer to [shared_child](https://github.com/oconnor663/shared_child.rs), thanks! */
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

    pub fn wait(pid: u32) -> io::Result<()> {
        loop {
            let ret = unsafe {
                let mut siginfo = std::mem::zeroed();
                libc::waitid(
                    libc::P_PID,
                    handle.0 as libc::id_t,
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

    pub fn kill(pid: u32) -> io::Result<()> {
        send_signal(pid, libc::SIGABRT)
    }

    pub fn suspend(pid: u32) -> io::Result<()> {
        send_signal(pid, libc::SIGTSTP)
    }

    pub fn resume(pid: u32) -> io::Result<()> {
        send_signal(pid, libc::SIGCONT)
    }
}

#[cfg(windows)]
#[allow(clippy::upper_case_acronyms)]
#[allow(non_snake_case)]
mod sys {
    use std::io;
    use std::mem::transmute;
    use std::os::raw::{c_char, c_int, c_long, c_uint, c_ulong, c_void};

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

    const TRUE: BOOL = true as BOOL;
    const FALSE: BOOL = false as BOOL;
    const INFINITE: DWORD = 0xFFFFFFFF;
    const WAIT_OBJECT_0: DWORD = 0x00000000 as u32;
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

    fn get_handle(pid: u32) -> HANDLE {
        unsafe { OpenProcess(PROCESS_ALL_ACCESS, FALSE, pid) }
    }

    unsafe fn getNtFn(name: &[u8]) -> FnNtProcess {
        let module_handle = GetModuleHandleA(b"ntdll\0".as_ptr() as LPCSTR);
        let address = GetProcAddress(module_handle, name.as_ptr() as LPCSTR);
        transmute::<*const usize, FnNtProcess>(address as *const usize)
    }

    pub fn wait(pid: u32) -> io::Result<()> {
        // [oconnor663 / shared_child.rs] said:
        // Windows has actually always supported this, by preventing PID reuse
        // while there are still open handles to a child process.
        let handle = get_handle(pid);
        match unsafe { WaitForSingleObject(handle, INFINITE) } {
            WAIT_OBJECT_0 => Ok(()),
            _ => Err(io::Error::last_os_error()),
        }
    }

    pub fn kill(pid: u32) -> io::Result<()> {
        let handle = get_handle(pid);
        match unsafe { TerminateProcess(handle, 0) } {
            TRUE => Ok(()),
            _ => Err(io::Error::last_os_error()),
        }
    }

    pub fn suspend(pid: u32) -> io::Result<()> {
        let handle = get_handle(pid);
        match unsafe { getNtFn(b"NtSuspendProcess\0")(handle) } {
            STATUS_SUCCESS => Ok(()),
            _ => Err(io::Error::last_os_error()),
        }
    }

    pub fn resume(pid: u32) -> io::Result<()> {
        let handle = get_handle(pid);
        match unsafe { getNtFn(b"NtResumeProcess\0")(handle) } {
            STATUS_SUCCESS => Ok(()),
            _ => Err(io::Error::last_os_error()),
        }
    }
}
