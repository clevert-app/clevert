use io::Read;
use std::io;
use std::process;
use std::process::{Command, ExitStatus};
use std::sync::{Condvar, Mutex};

#[cfg(unix)]
#[path = "unix.rs"]
mod sys {
    extern crate libc;

    use std;
    use std::io;
    use std::process::Child;

    // A handle on Unix is just the PID.
    pub struct Handle(u32);

    pub fn get_handle(child: &Child) -> Handle {
        Handle(child.id())
    }

    // This blocks until a child exits, without reaping the child.
    pub fn wait_without_reaping(handle: Handle) -> io::Result<()> {
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
            let error = io::Error::last_os_error();
            if error.kind() != io::ErrorKind::Interrupted {
                return Err(error);
            }
            // We were interrupted. Loop and retry.
        }
    }
}

#[cfg(windows)]
#[path = "windows.rs"]
mod sys {
    use std::io;
    use std::os::windows::io::{AsRawHandle, RawHandle};
    use std::process::Child;
    use winapi::um::synchapi::WaitForSingleObject;
    use winapi::um::winbase::{INFINITE, WAIT_OBJECT_0};
    use winapi::um::winnt::HANDLE;

    pub struct Handle(RawHandle);

    // Kind of like a child PID on Unix, it's important not to keep the handle
    // around after the child has been cleaned up. The best solution would be to
    // have the handle actually borrow the child, but we need to keep the child
    // unborrowed. Instead we just avoid storing them.
    pub fn get_handle(child: &Child) -> Handle {
        Handle(child.as_raw_handle())
    }

    // This is very similar to libstd's Child::wait implementation, because the
    // basic wait on Windows doesn't reap. The main difference is that this can be
    // called without &mut Child.
    pub fn wait_without_reaping(handle: Handle) -> io::Result<()> {
        let wait_ret = unsafe { WaitForSingleObject(handle.0 as HANDLE, INFINITE) };
        if wait_ret != WAIT_OBJECT_0 {
            Err(io::Error::last_os_error())
        } else {
            Ok(())
        }
    }
}

#[derive(Debug)]
pub struct Child {
    // This lock provides shared access to kill() and wait(). We never hold it
    // during a blocking wait, though, so that non-blocking waits and kills can
    // go through. (Blocking waits use libc::waitid with the WNOWAIT flag.)
    child: Mutex<process::Child>,

    // When there are multiple waiting threads, one of them will actually wait
    // on the child, and the rest will block on this condvar.
    state_lock: Mutex<State>,
    state_condvar: Condvar,
}

impl Child {
    /// Spawn a new `SharedChild` from a `std::process::Command`.
    pub fn spawn(command: &mut Command) -> io::Result<Child> {
        let child = command.spawn()?;
        Ok(Child {
            child: Mutex::new(child),
            state_lock: Mutex::new(NotWaiting),
            state_condvar: Condvar::new(),
        })
    }

    fn get_handle(&self) -> sys::Handle {
        sys::get_handle(&self.child.lock().unwrap())
    }

    pub fn take_stdout(&self) -> io::Result<Vec<u8>> {
        let mut child = self.child.lock().unwrap();
        let mut stdout_buf = Vec::new();
        child.stdout.take().unwrap().read_to_end(&mut stdout_buf)?;
        Ok(stdout_buf)
    }

    pub fn take_stderr(&self) -> io::Result<Vec<u8>> {
        let mut child = self.child.lock().unwrap();
        let mut stderr_buf = Vec::new();
        child.stderr.take().unwrap().read_to_end(&mut stderr_buf)?;
        Ok(stderr_buf)
    }

    /// Wait for the child to exit, blocking the current thread, and return its
    /// exit status.
    pub fn wait(&self) -> io::Result<ExitStatus> {
        let mut state = self.state_lock.lock().unwrap();
        loop {
            match *state {
                NotWaiting => {
                    // Either no one is waiting on the child yet, or a previous
                    // waiter failed. That means we need to do it ourselves.
                    // Break out of this loop.
                    break;
                }
                Waiting => {
                    // Another thread is already waiting on the child. We'll
                    // block until it signal us on the condvar, then loop again.
                    // Spurious wakeups could bring us here multiple times
                    // though, see the Condvar docs.
                    state = self.state_condvar.wait(state).unwrap();
                }
                Exited(exit_status) => return Ok(exit_status),
            }
        }

        // If we get here, we have the state lock, and we're the thread
        // responsible for waiting on the child. Set the state to Waiting and
        // then release the state lock, so that other threads can observe it
        // while we block. Afterwards we must leave the Waiting state before
        // this function exits, or other waiters will deadlock.
        *state = Waiting;
        drop(state);

        // Block until the child exits without reaping it. (On Unix, that means
        // we need to call libc::waitid with the WNOWAIT flag. On Windows
        // waiting never reaps.) That makes it safe for another thread to kill
        // while we're here, without racing against some process reusing the
        // child's PID. Having only one thread in this section is important,
        // because POSIX doesn't guarantee much about what happens when multiple
        // threads wait on a child at the same time:
        // http://pubs.opengroup.org/onlinepubs/9699919799/functions/V2_chap02.html#tag_15_13
        let noreap_result = sys::wait_without_reaping(self.get_handle());

        // Now either we hit an error, or the child has exited and needs to be
        // reaped. Retake the state lock and handle all the different exit
        // cases. No matter what happened/happens, we'll leave the Waiting state
        // and signal the state condvar.
        let mut state = self.state_lock.lock().unwrap();
        // The child has already exited, so this wait should clean up without blocking.
        let final_result = noreap_result.and_then(|_| self.child.lock().unwrap().wait());
        *state = if let Ok(exit_status) = final_result {
            Exited(exit_status)
        } else {
            NotWaiting
        };
        self.state_condvar.notify_all();
        final_result
    }

    /// Send a kill signal to the child. On Unix this sends SIGKILL, and you
    /// should call `wait` afterwards to avoid leaving a zombie. If the process
    /// has already been waited on, this returns `Ok(())` and does nothing.
    pub fn kill(&self) -> io::Result<()> {
        let status = self.state_lock.lock().unwrap();
        if let Exited(_) = *status {
            return Ok(());
        }
        // The child is still running. Kill it. This assumes that the wait
        // functions above will never hold the child lock during a blocking
        // wait.
        self.child.lock().unwrap().kill()
    }
}

#[derive(Debug)]
enum State {
    NotWaiting,
    Waiting,
    Exited(ExitStatus),
}

use State::*;

// Publish the Unix-only SharedChildExt trait.
#[cfg(unix)]
pub mod unix_ext {

    //! Unix-only extensions, for sending signals.

    extern crate libc;

    use std::io;

    pub trait SharedChildExt {
        /// Send a signal to the child process with `libc::kill`. If the process
        /// has already been waited on, this returns `Ok(())` and does nothing.
        fn send_signal(&self, signal: libc::c_int) -> io::Result<()>;
    }

    impl SharedChildExt for super::SharedChild {
        fn send_signal(&self, signal: libc::c_int) -> io::Result<()> {
            let status = self.state_lock.lock().unwrap();
            if let super::ChildState::Exited(_) = *status {
                return Ok(());
            }
            // The child is still running. Signal it. Holding the state lock
            // is important to prevent a PID race.
            // This assumes that the wait methods will never hold the child
            // lock during a blocking wait, since we need it to get the pid.
            let pid = self.id() as libc::pid_t;
            match unsafe { libc::kill(pid, signal) } {
                -1 => Err(io::Error::last_os_error()),
                _ => Ok(()),
            }
        }
    }
}
