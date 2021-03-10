use std::io;

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
mod sys {
    use std::io;
    use winapi::um::processthreadsapi::{OpenProcess, TerminateProcess};
    use winapi::um::winnt::{HANDLE, PROCESS_ALL_ACCESS};

    fn get_handle(pid: u32) -> HANDLE {
        unsafe { OpenProcess(PROCESS_ALL_ACCESS, false as i32, pid) }
    }

    pub fn kill(pid: u32) -> io::Result<()> {
        let handle = get_handle(pid);
        match unsafe { TerminateProcess(handle, 0) } {
            1 => Ok(()),
            _ => Err(io::Error::last_os_error()),
        }
    }
}

/// Warning: This may kill invalid pid?
pub fn kill(pid: u32) -> io::Result<()> {
    sys::kill(pid)
}
