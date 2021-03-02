pub mod child;
mod config;
pub mod cui;
mod toml_seek;
use child::Child;
use config::Config;
use io::Write;
use std::convert::TryInto;
use std::fmt;
use std::fs;
use std::fs::File;
use std::io;
use std::path::PathBuf;
use std::process;
use std::process::Command;
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::thread;
use std::time::Duration;
use std::vec::IntoIter;

#[derive(Debug)]
enum ErrorKind {
    // ConfigTomlIllegal,
    ConfigIllegal,
    ConfigFileCanNotRead,
    UnknownError,
    // CanNotWriteLogFile,
    ExecutePanic,
}

#[derive(Debug)]
pub struct Error {
    kind: ErrorKind,
    inner: Option<Box<dyn std::error::Error>>,
    message: Option<String>,
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&format!("{:?}", self))
    }
}

impl std::error::Error for Error {}

enum Stdio {
    Normal,
    Ignore,
    ToFile(File),
}

struct Status {
    commands: IntoIter<Command>,
    childs: Vec<Option<Arc<Child>>>,
    actives_count: usize,
    error: Option<io::Error>,
    stdout: Stdio,
    stderr: Stdio,
    wait_cvar: Arc<Condvar>,
}

pub struct Order {
    threads_count: usize,
    commands_count: usize,
    skip_panic: bool,
    status: Arc<Mutex<Status>>,
}

impl Order {
    fn get_status(&self) -> MutexGuard<Status> {
        self.status.lock().unwrap()
    }

    fn stdpipe_set(command: &mut Command, status: &mut MutexGuard<Status>) {
        match status.stdout {
            Stdio::Ignore => command.stdout(process::Stdio::null()),
            Stdio::ToFile(_) => command.stdout(process::Stdio::piped()),
            Stdio::Normal => command,
        };
        match status.stderr {
            Stdio::Ignore => command.stderr(process::Stdio::null()),
            Stdio::ToFile(_) => command.stderr(process::Stdio::piped()),
            Stdio::Normal => command,
        };
    }

    fn stdpipe_write(child: &Arc<Child>, mut status: MutexGuard<Status>) -> io::Result<()> {
        if let Stdio::ToFile(file) = &mut status.stdout {
            file.write_all(&mut child.take_stdout()?)?;
        }
        if let Stdio::ToFile(file) = &mut status.stderr {
            file.write_all(&mut child.take_stderr()?)?;
        }
        Ok(())
    }

    fn spawn(&self, index: usize) {
        let skip_panic = self.skip_panic;
        let status_mutex = Arc::clone(&self.status);
        thread::spawn(move || {
            let get_status = || status_mutex.lock().unwrap();
            let exec = |mut command: Command| {
                let mut status = get_status();
                Self::stdpipe_set(&mut command, &mut status);
                let child = Arc::new(Child::spawn(&mut command)?);
                status.childs[index] = Some(Arc::clone(&child));
                drop(status);
                child.wait()?;
                Self::stdpipe_write(&child, get_status())?;
                Ok(())
            };
            while let Some(command) = {
                let mut status = get_status();
                status.commands.next()
            } {
                let result = exec(command);
                if result.is_err() && !skip_panic {
                    let mut status = get_status();
                    status.error = Some(result.unwrap_err());
                    break;
                }
            }
            let mut status = get_status();
            status.childs[index] = None;
            status.actives_count -= 1;
            status.wait_cvar.notify_one();
        });
    }

    pub fn start(&self) -> io::Result<()> {
        let mut status = self.get_status();
        status.childs.resize_with(self.threads_count, || None);
        status.actives_count = self.threads_count;
        for index in 0..self.threads_count {
            self.spawn(index);
        }
        Ok(())
    }

    /// Return the progress of order as `(finished, total)`.
    pub fn progress(&self) -> (usize, usize) {
        let status = self.get_status();
        let total = self.commands_count;
        let idle = status.commands.len();
        let mut finished = total - idle;
        let active = status.actives_count;
        if finished >= active {
            finished -= active;
        }
        (finished, total)
    }

    pub fn wait(&self) {
        let status = self.get_status();
        let cvar = Arc::clone(&status.wait_cvar);
        let condition = |s: &mut Status| s.actives_count > 0 && s.error.is_none();
        let _ = cvar.wait_while(status, condition).unwrap();
    }

    /// Must be called at least and most once.
    pub fn wait_result(&self) -> io::Result<()> {
        self.wait();
        let mut status = self.get_status();
        let error = status.error.take();
        drop(status);
        if let Some(e) = error {
            self.terminate()?;
            return Err(e);
        }
        Ok(())
    }

    // Should call `wait` afterwards.
    pub fn cease(&self) {
        self.get_status().commands.nth(std::usize::MAX);
    }

    // Should call `wait` afterwards.
    pub fn terminate(&self) -> io::Result<()> {
        self.cease();
        let mut status = self.get_status();
        for child_option in &mut status.childs {
            if let Some(child) = child_option.take() {
                child.kill()?;
            }
        }
        Ok(())
    }

    pub fn new(cfg: &Config) -> Result<Self, Error> {
        fn split_args(args: &str) -> Result<Vec<&str>, Error> {
            let mut vec = Vec::new();
            let mut wrapped = false;
            for item in args.split('"') {
                match wrapped {
                    true => vec.push(item),
                    false => vec.extend(item.split_whitespace()),
                };
                wrapped = !wrapped;
            }
            wrapped = !wrapped;
            match wrapped {
                true => Err(Error {
                    kind: ErrorKind::ConfigIllegal,
                    inner: None,
                    message: Some("args' quotation mask is not closed".to_string()),
                }),
                false => Ok(vec),
            }
        }
        let read_dir = |dir| {
            let mut vec = Vec::new();
            let recursive = cfg.input_recursive.unwrap();
            fn read(dir: PathBuf, vec: &mut Vec<PathBuf>, recursive: bool) -> io::Result<()> {
                for item in fs::read_dir(dir)? {
                    let item = item?.path();
                    if item.is_file() {
                        vec.push(item);
                    } else if recursive && item.is_dir() {
                        read(item, vec, recursive)?;
                    }
                }
                Ok(())
            }
            read(dir, &mut vec, recursive).map_err(|e| Error {
                kind: ErrorKind::ConfigIllegal,
                inner: Some(Box::new(e)),
                message: None,
            })?;
            Ok(vec)
        };
        let mut input_files = Vec::new();
        if let Some(input_list) = &cfg.input_list {
            for item in input_list {
                let path = PathBuf::from(item);
                if path.is_dir() {
                    input_files.append(&mut read_dir(path)?);
                } else {
                    input_files.push(path);
                }
            }
        } else if let Some(input_dir) = &cfg.input_dir {
            let input_dir = PathBuf::from(input_dir);
            input_files.append(&mut read_dir(input_dir)?);
        }

        let mut commands = Vec::new();
        let args_template = split_args(cfg.args_template.as_ref().unwrap())?;
        let args_switches = split_args(cfg.args_template.as_ref().unwrap())?;

        for input_file in input_files {
            let file_name = input_file.file_stem().unwrap();
            let mut file_name = file_name.to_str().unwrap().to_string();
            if let Some(prefix) = &cfg.output_prefix {
                file_name.insert_str(0, &prefix);
            }
            if let Some(suffix) = &cfg.output_suffix {
                file_name.push_str(&suffix);
            }
            let mut output_file = match &cfg.output_dir {
                Some(path) => PathBuf::from(path),
                None => input_file.parent().unwrap().into(),
            };
            if cfg.output_recursive.unwrap() && cfg.input_dir.is_some() {
                let input_dir = cfg.input_dir.as_ref().unwrap();
                let path = input_file.strip_prefix(input_dir).unwrap();
                output_file.push(path);
                output_file.set_file_name(file_name);
                let dir = output_file.parent().unwrap();
                fs::create_dir_all(dir).unwrap();
            } else {
                output_file.push(file_name);
            }
            if cfg.output_overwrite.unwrap() {
                let _ = fs::remove_file(&output_file);
            }
            if let Some(extension) = &cfg.output_extension {
                output_file.set_extension(extension);
            }

            for index in 0..cfg.repeat_count.unwrap() {
                let mut command = Command::new(cfg.program.as_ref().unwrap());
                args_template.iter().for_each(|item| match *item {
                    "{args_switches}" => {
                        command.args(&args_switches);
                    }
                    "{input_file}" => {
                        command.arg(input_file.to_str().unwrap());
                    }
                    "{output_file}" => {
                        command.arg(output_file.to_str().unwrap());
                    }
                    "{output_dir}" => {
                        command.arg(output_file.parent().unwrap().to_str().unwrap());
                    }
                    "{repeat_index}" => {
                        command.arg(index.to_string());
                    }
                    "{repeat_position}" => {
                        command.arg((index + 1).to_string());
                    }
                    _ => {
                        command.arg(item);
                    }
                });
                commands.push(command);
            }
        }

        if commands.is_empty() {
            Err(Error {
                kind: ErrorKind::ConfigIllegal,
                inner: None,
                message: Some("config generated commands's count is 0".to_string()),
            })?;
        }

        let threads_count = cfg.threads_count.unwrap().try_into().unwrap();
        let commands_count = commands.len();
        let stdpipe = |type_opt: &Option<String>, path_opt: &Option<String>| {
            let type_str = type_opt.as_ref().unwrap().as_str();
            match type_str {
                "ignore" => Ok(Stdio::Ignore),
                "normal" => Ok(Stdio::Normal),
                "file" => {
                    let path = path_opt.as_ref().ok_or_else(|| Error {
                        kind: ErrorKind::ConfigIllegal,
                        inner: None,
                        message: Some("std pipe file path is unknown".to_string()),
                    })?;
                    let mut opt = fs::OpenOptions::new();
                    let file = opt.write(true).open(path).map_err(|e| Error {
                        kind: ErrorKind::ConfigIllegal,
                        inner: Some(Box::new(e)),
                        message: Some("std pipe file could not write".to_string()),
                    })?;
                    Ok(Stdio::ToFile(file))
                }
                _ => Err(Error {
                    kind: ErrorKind::ConfigIllegal,
                    inner: None,
                    message: Some("std pipe type is unknown".to_string()),
                }),
            }
        };
        let status = Status {
            commands: commands.into_iter(),
            childs: (0..threads_count).map(|_| None).collect(),
            actives_count: 0,
            error: None,
            stdout: stdpipe(&cfg.stdout_type, &cfg.stdout_file)?,
            stderr: stdpipe(&cfg.stderr_type, &cfg.stderr_file)?,
            wait_cvar: Arc::new(Condvar::new()),
        };
        Ok(Self {
            threads_count,
            commands_count,
            skip_panic: cfg.skip_panic.unwrap(),
            status: Arc::new(Mutex::new(status)),
        })
    }
}

pub fn run() -> Result<(), Error> {
    // Order is one-off, Config is not one-off, change Config from gui and then new a Order.
    let cfg = Config::_from_toml_test();
    // let cfg = Config::new()?;

    let order = Arc::new(Order::new(&cfg)?);
    order.start().map_err(|e| Error {
        kind: ErrorKind::UnknownError,
        inner: Some(Box::new(e)),
        message: None,
    })?;

    // Progress message
    if cfg.cui_msg_level.unwrap() >= 2 {
        let order = Arc::clone(&order);
        let interval = cfg.cui_msg_interval.unwrap().try_into().unwrap();
        thread::spawn(move || loop {
            let (finished, total) = order.progress();
            cui::log::info(format!("progress: {} / {}", finished, total));
            if finished == total {
                break;
            }
            thread::sleep(Duration::from_millis(interval));
        });
    }

    // Command operation
    if cfg.cui_operation.unwrap() {
        let order = Arc::clone(&order);
        thread::spawn(move || loop {
            let mut input = String::new();
            io::stdin().read_line(&mut input).unwrap();
            match input.trim() {
                "t" => {
                    cui::log::info("user terminate the cmdfactory");
                    order.terminate().unwrap();
                }
                "c" => {
                    cui::log::info("user cease the cmdfactory");
                    order.cease();
                }
                "i" => {
                    cui::log::info("user turn off the command op");
                    break;
                }
                _ => {
                    cui::log::info("unknown op");
                }
            };
        });
    };

    order.wait_result().map_err(|e| Error {
        kind: ErrorKind::ExecutePanic,
        inner: Some(Box::new(e)),
        message: None,
    })?;

    Ok(())
}
