mod config;
pub mod cui;
pub mod toml_seek;
use config::Config;
use os_pipe::PipeReader;
use shared_child::SharedChild;
use std::convert::TryInto;
use std::fmt;
use std::fs;
use std::fs::File;
use std::io;
use std::io::prelude::{Read, Write};
use std::path::PathBuf;
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
    // ExecutePanic,
}

#[derive(Debug)]
pub struct Error {
    kind: ErrorKind,
    inner: Option<Box<dyn std::error::Error>>,
    message: Option<String>,
}

impl std::error::Error for Error {}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&format!("{:?}", self))
        // use ErrorKind::*;
        // let mut content = match self.kind {
        //     ConfigTomlIllegal => "config is not a legal toml document",
        //     ConfigIllegal => "config is illegal",
        //     ConfigFileCanNotRead => "read config file failed",
        //     CanNotWriteLogFile => "write log file failed",
        //     ExecutePanic => "task process panic",
        // }
        // .to_string();
        // if let Some(message) = &self.message {
        //     content += &format!(", message = {}", message);
        // }
        // if let Some(inner) = &self.inner {
        //     content += &format!(", error = {}", inner);
        // }
    }
}

enum Stdio {
    Normal,
    Ignore,
    ToFile(PathBuf),
}
struct Status {
    commands: IntoIter<Command>,
    childs: Vec<Option<Arc<SharedChild>>>,
    threads: Vec<Option<thread::JoinHandle<io::Result<()>>>>,
    stdout_file: Option<File>,
    stderr_file: Option<File>,
    wait_cvar: Arc<Condvar>,
}

impl Status {
    fn from_commands(commands: Vec<Command>) -> Self {
        Self {
            commands: commands.into_iter(),
            childs: Vec::new(),
            threads: Vec::new(),
            stdout_file: None,
            stderr_file: None,
            wait_cvar: Arc::new(Condvar::new()),
        }
    }
}

pub struct Order {
    threads_count: usize,
    commands_count: usize,
    skip_panic: bool,
    stdout: Stdio,
    stderr: Stdio,
    status: Arc<Mutex<Status>>,
}

impl Order {
    fn get_status(&self) -> MutexGuard<Status> {
        self.status.lock().unwrap()
    }

    /// |command| (stdout_setter_option, stderr_setter_option)
    fn stdio_get_setter(
        &self,
    ) -> impl Fn(&mut Command) -> (Option<PipeReader>, Option<PipeReader>) {
        let stdout_setter = match self.stdout {
            Stdio::Normal => |_: &mut Command| None,
            Stdio::Ignore => |command: &mut Command| {
                command.stdout(std::process::Stdio::null());
                None
            },
            Stdio::ToFile(_) => |command: &mut Command| {
                let (reader, writer) = os_pipe::pipe().unwrap();
                command.stdout(writer);
                Some(reader)
            },
        };
        let stderr_setter = match self.stderr {
            Stdio::Normal => |_: &mut Command| None,
            Stdio::Ignore => |command: &mut Command| {
                command.stderr(std::process::Stdio::null());
                None
            },
            Stdio::ToFile(_) => |command: &mut Command| {
                let (reader, writer) = os_pipe::pipe().unwrap();
                command.stderr(writer);
                Some(reader)
            },
        };
        move |command: &mut Command| (stdout_setter(command), stderr_setter(command))
    }

    fn stdio_writer(
        stdio_pair: (Option<PipeReader>, Option<PipeReader>),
        status_mutex: &Arc<Mutex<Status>>,
    ) -> io::Result<()> {
        let get_status = || status_mutex.lock().unwrap();
        let (stdout, stderr) = stdio_pair;
        if let Some(mut reader) = stdout {
            let buf = &mut Vec::new();
            reader.read_to_end(buf)?;
            get_status().stdout_file.as_ref().unwrap().write_all(buf)?;
        }
        if let Some(mut reader) = stderr {
            let buf = &mut Vec::new();
            reader.read_to_end(buf)?;
            get_status().stderr_file.as_ref().unwrap().write_all(buf)?;
        }
        Ok(())
    }

    fn spawn(&self, index: usize) -> thread::JoinHandle<io::Result<()>> {
        let skip_panic = self.skip_panic;
        let stdio_setter = self.stdio_get_setter();
        let status_mutex = Arc::clone(&self.status);
        thread::spawn(move || {
            let get_status = || status_mutex.lock().unwrap();
            while let Some(mut command) = {
                let mut status = get_status();
                status.commands.next()
            } {
                let stdio_pair = stdio_setter(&mut command);

                let child = if skip_panic {
                    if let Ok(child) = SharedChild::spawn(&mut command) {
                        child
                    } else {
                        continue;
                    }
                } else {
                    SharedChild::spawn(&mut command)?
                };
                let child = Arc::new(child);
                drop(command); // The "command" owns writers, dropping it to closes writers.

                let mut status = get_status();
                status.childs[index] = Some(Arc::clone(&child));
                drop(status);
                child.wait()?;

                Self::stdio_writer(stdio_pair, &status_mutex)?;
            }
            let mut status = get_status();
            status.childs[index] = None;
            status.threads[index] = None;
            status.wait_cvar.notify_one();
            Ok(())
        })
    }

    pub fn start(&self) -> io::Result<()> {
        let mut status = self.get_status();
        status.childs.resize_with(self.threads_count, || None);
        if let Stdio::ToFile(path) = &self.stdout {
            status.stdout_file = Some(fs::OpenOptions::new().write(true).open(path)?);
        }
        if let Stdio::ToFile(path) = &self.stderr {
            status.stderr_file = Some(fs::OpenOptions::new().write(true).open(path)?);
        }
        status.threads.resize_with(self.threads_count, || None);
        for index in 0..self.threads_count {
            status.threads[index] = Some(self.spawn(index));
        }
        Ok(())
    }

    /// Return the progress of order as `(finished, total)`.
    pub fn progress(&self) -> (usize, usize) {
        let total = self.commands_count;
        let status = self.get_status();
        let active = status.childs.iter().fold(0, |count, child_option| {
            if child_option.is_some() {
                count + 1
            } else {
                count
            }
        });
        let remaining = status.commands.len() + active;
        (total - remaining, total)
    }

    pub fn wait(&self) {
        let status = self.get_status();
        let cvar = Arc::clone(&status.wait_cvar);
        let _ = cvar
            .wait_while(status, |s| {
                let no_childs = s.childs.iter().all(|child| child.is_none());
                no_childs
            })
            .unwrap();
    }

    /// Must called at least and most once.
    pub fn wait_result(&self) -> io::Result<()> {
        let mut status = self.get_status();
        let mut threads = Vec::new();
        for opt in &mut status.threads {
            let handle = opt.take().unwrap();
            threads.push(handle);
        }
        drop(status);
        for handle in threads {
            handle.join().unwrap()?;
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
                    message: Some("args' quotation mask is not closed".into()),
                }),
                false => Ok(vec),
            }
        }
        let read_dir = |dir| -> Result<Vec<PathBuf>, io::Error> {
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
            read(dir, &mut vec, recursive)?;
            Ok(vec)
        };
        let mut input_files = Vec::new();
        if let Some(input_list) = &cfg.input_list {
            for item in input_list {
                let path = PathBuf::from(item);
                if path.is_dir() {
                    input_files.append(&mut read_dir(path).unwrap());
                } else {
                    input_files.push(path);
                }
            }
        } else if let Some(input_dir) = &cfg.input_dir {
            let input_dir = PathBuf::from(input_dir);
            input_files.append(&mut read_dir(input_dir).unwrap());
        }

        let mut commands = Vec::new();
        let args_template = split_args(cfg.args_template.as_ref().unwrap()).unwrap();
        let args_switches = split_args(cfg.args_switches.as_ref().unwrap()).unwrap();

        for input_file in input_files {
            let mut file_name = input_file
                .file_stem()
                .unwrap()
                .to_str()
                .unwrap()
                .to_string();
            if let Some(prefix) = &cfg.output_prefix {
                file_name.insert_str(0, &prefix);
            }
            if let Some(suffix) = &cfg.output_suffix {
                file_name.push_str(&suffix);
            }
            let mut output_file = match &cfg.output_dir {
                Some(path) => PathBuf::from(path),
                None => input_file.parent().unwrap().to_path_buf(),
            };
            if cfg.output_recursive.unwrap() && cfg.input_dir.is_some() {
                let path = input_file
                    .strip_prefix(cfg.input_dir.as_ref().unwrap())
                    .unwrap()
                    .to_path_buf();
                output_file.push(path);
                output_file.set_file_name(file_name);
            } else {
                output_file.push(file_name);
            }
            if let Some(extension) = &cfg.output_extension {
                output_file.set_extension(extension);
            }

            for index in 0..cfg.repeat_count.unwrap() {
                let mut command = Command::new(cfg.program.as_ref().unwrap());
                for item in &args_template {
                    match *item {
                        "{args_switches}" => {
                            command.args(&args_switches);
                        }
                        "{input_file}" => {
                            command.arg(input_file.to_str().unwrap());
                        }
                        "{input_extension}" => {
                            command.arg(input_file.extension().unwrap().to_str().unwrap());
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
                    };
                }
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

        fn std_pipe(
            name: &str,
            kind: &Option<String>,
            file_path: &Option<String>,
        ) -> Result<Stdio, Error> {
            let type_name = kind.as_ref().unwrap();
            match type_name.as_str() {
                "normal" => Ok(Stdio::Normal),
                "ignore" => Ok(Stdio::Ignore),
                "file" => {
                    if file_path.is_none() {
                        return Err(Error {
                            kind: ErrorKind::ConfigIllegal,
                            inner: None,
                            message: Some(format!("{} file path not specified", name)),
                        });
                    }
                    let path = PathBuf::from(file_path.as_ref().unwrap());
                    let meta = fs::metadata(&path);
                    if meta.is_err() {
                        if fs::write(&path, "").is_err() {
                            return Err(Error {
                                kind: ErrorKind::ConfigIllegal,
                                inner: None,
                                message: Some(format!("could not create {} file", name)),
                            });
                        }
                    } else if meta.unwrap().is_dir() {
                        return Err(Error {
                            kind: ErrorKind::ConfigIllegal,
                            inner: None,
                            message: Some(format!("a dir on {} file path existed", name)),
                        });
                    }
                    Ok(Stdio::ToFile(path))
                }
                _ => Err(Error {
                    kind: ErrorKind::ConfigIllegal,
                    inner: None,
                    message: Some(format!("unknown {} type", name)),
                }),
            }
        };

        Ok(Self {
            threads_count: cfg.threads_count.unwrap().try_into().unwrap(),
            commands_count: commands.len(),
            skip_panic: cfg.skip_panic.unwrap(),
            stdout: std_pipe("stdout", &cfg.stdout_type, &cfg.stdout_file)?,
            stderr: std_pipe("stderr", &cfg.stderr_type, &cfg.stderr_file)?,
            status: Arc::new(Mutex::new(Status::from_commands(commands))),
        })
    }
}

pub fn run() -> Result<(), Error> {
    // Order is one-off, Config is not one-off, change Config from gui and then new a Order.
    // let cfg = Config::_from_toml_test();
    let cfg = Config::new()?;

    let order = Arc::new(Order::new(&cfg)?);
    order.start().or_else(|err| {
        Err(Error {
            kind: ErrorKind::UnknownError,
            inner: Some(Box::new(err)),
            message: None,
        })
    })?;

    // Command op
    if cfg.cui_operation.unwrap() {
        let order = Arc::clone(&order);
        let _op_thread = thread::spawn(move || {
            loop {
                let mut input = String::new();
                io::stdin().read_line(&mut input)?;
                match input.trim() {
                    "t" => {
                        cui::log::info("user terminate the cmdfactory");
                        order.terminate()?;
                    }
                    "i" => {
                        cui::log::info("user turn off the command op");
                        break;
                    }
                    _ => {
                        cui::log::info("unknown op");
                    }
                };
            }
            Result::<(), io::Error>::Ok(())
        });
        // op_thread.join().unwrap().or_else(|err| {
        //     Err(Error {
        //         kind: ErrorKind::UnknownError,
        //         inner: Some(Box::new(err)),
        //         message: None,
        //     })
        // })?;
    }

    // Progress message
    if cfg.cui_msg_level.unwrap() >= 2 {
        let order = Arc::clone(&order);
        let interval = cfg.cui_msg_interval.unwrap().try_into().unwrap();
        thread::spawn(move || loop {
            let (finished, total) = order.progress();
            if finished == total {
                break;
            }
            cui::log::info(format!("progress: {} / {}", finished, total));
            thread::sleep(Duration::from_millis(interval));
        });
    }

    order.wait_result().or_else(|err| {
        Err(Error {
            kind: ErrorKind::UnknownError,
            inner: Some(Box::new(err)),
            message: None,
        })
    })?;

    Ok(())
}
