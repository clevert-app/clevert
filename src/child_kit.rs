pub use sys::*;

#[cfg(unix)]
mod sys {
    extern crate libc;
    use std::io;

    fn send_signal(pid: u32, signal: libc::c_int) -> io::Result<()> {
        let pid = pid as libc::pid_t;
        match unsafe { libc::kill(pid, signal) } {
            -1 => Err(io::Error::last_os_error()),
            _ => Ok(()),
        }
    }

    pub fn kill(pid: u32) -> io::Result<()> {
        send_signal(pid, libc::SIGABRT)
    }
}

#[cfg(windows)]
#[allow(clippy::upper_case_acronyms)]
#[allow(non_snake_case)]
mod sys {
    use std::io;
    use std::mem::transmute;
    use std::os::raw::{c_char, c_int, c_uint, c_ulong, c_void};

    type BOOL = c_int;
    type UINT = c_uint;
    type DWORD = c_ulong;
    type HANDLE = *mut c_void;
    type HMODULE = *mut c_void;
    type LPCSTR = *const c_char;
    type FARPROC = *mut c_void;
    type FnNtProcess = extern "stdcall" fn(HANDLE);

    const TRUE: BOOL = true as BOOL;
    const FALSE: BOOL = false as BOOL;
    const STANDARD_RIGHTS_REQUIRED: DWORD = 0x000F0000;
    const SYNCHRONIZE: DWORD = 0x00100000;
    const PROCESS_ALL_ACCESS: DWORD = STANDARD_RIGHTS_REQUIRED | SYNCHRONIZE | 0xFFFF;

    #[link(name = "kernel32", kind = "dylib")]
    extern "C" {
        fn OpenProcess(dwDesiredAccess: DWORD, bInheritHandle: BOOL, dwProcessId: DWORD) -> HANDLE;
        fn TerminateProcess(hProcess: HANDLE, uExitCode: UINT) -> BOOL;
        fn GetProcAddress(hModule: HMODULE, lpProcName: LPCSTR) -> FARPROC;
        fn GetModuleHandleA(lpModuleName: LPCSTR) -> HMODULE;
    }

    fn get_handle(pid: u32) -> HANDLE {
        unsafe { OpenProcess(PROCESS_ALL_ACCESS, FALSE, pid) }
    }

    fn getNtFn(name: &[u8]) -> FnNtProcess {
        unsafe {
            let module_handle = GetModuleHandleA(b"ntdll\0".as_ptr() as LPCSTR);
            let address = GetProcAddress(module_handle, name.as_ptr() as LPCSTR);
            transmute::<*const usize, FnNtProcess>(address as *const usize)
        }
    }

    pub fn kill(pid: u32) -> io::Result<()> {
        let handle = get_handle(pid);
        match unsafe { TerminateProcess(handle, 0) } {
            TRUE => Ok(()),
            _ => Err(io::Error::last_os_error()),
        }
    }

    pub fn suspend(pid: u32) {
        let handle = get_handle(pid);
        getNtFn(b"NtSuspendProcess\0")(handle);
    }

    pub fn resume(pid: u32) {
        let handle = get_handle(pid);
        getNtFn(b"NtResumeProcess\0")(handle);
    }
}
