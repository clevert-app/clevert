use crate::child_kit::ChildHandle;
use std::borrow::Borrow;
use std::fmt;
use std::fs;
use std::fs::File;
use std::io;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::vec::IntoIter;

enum StdioCfg {
    Normal,
    Ignore,
    File(fs::File),
}

impl From<&StdioCfg> for Stdio {
    fn from(s: &StdioCfg) -> Stdio {
        match s {
            StdioCfg::Normal => Stdio::inherit(),
            StdioCfg::Ignore => Stdio::null(),
            StdioCfg::File(file) => file.try_clone().unwrap().into(),
        }
    }
}

struct Status {
    current_command_index: usize,
}

struct Order {
    commands: Vec<Command>,
    status: Arc<Mutex<Status>>,
}

impl Order {
    fn start(self) {
        for mut command in self.commands {
            let mut file = File::open("stdout.txt").unwrap();
            command.stdout(file);
            let mut child = command.spawn().unwrap();
            child.wait().unwrap();
            let mut stdout = child.stdout.unwrap();
            // let mut buf = Vec::new();
            // stdout.read(&mut buf).unwrap();
            // let mut file = File::open("stdout.txt").unwrap();
            // file.write(&buf).unwrap();
        }
    }
}
