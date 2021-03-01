use std::io;
use std::process;
use std::process::{Command, ExitStatus};
use std::sync::{Condvar, Mutex};

mod sys;

// Publish the Unix-only SharedChildExt trait.
#[cfg(unix)]
pub mod unix;

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

use io::Read;
use State::*;
