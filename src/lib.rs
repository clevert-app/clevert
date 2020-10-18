mod config;
pub mod cui;
pub mod toml_seek;
use config::Config;
// use cui::print_log;
use os_pipe::PipeReader;
use shared_child::SharedChild;
use std::convert::TryInto;
use std::error;
use std::fmt;
use std::fs;
use std::fs::File;
use std::io;
use std::io::prelude::Read;
use std::io::prelude::Write;
use std::path::PathBuf;
use std::process::Command;
use std::process::Stdio;
use std::sync::Arc;
use std::sync::Condvar;
use std::sync::Mutex;
use std::sync::MutexGuard;
use std::thread;
use std::vec::IntoIter;

#[derive(Debug)]
enum ErrorKind {
    ConfigTomlIllegal,
    ConfigIllegal,
    ConfigFileCanNotRead,
    CanNotWriteLogFile,
    ExecutePanic,
}

#[derive(Debug)]
pub struct Error {
    kind: ErrorKind,
    inner: Option<Box<dyn error::Error>>,
    message: Option<String>,
}

impl error::Error for Error {}

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

enum OrderStdio {
    Normal,
    Ignore,
    ToFile(PathBuf),
}

struct OrderStatus {
    commands: IntoIter<Command>,
    childs: Vec<Option<Arc<SharedChild>>>,
    stdout_file: Option<File>,
    stderr_file: Option<File>,
    wait_cvar: Arc<Condvar>,
    active_threads_count: usize,
}

impl OrderStatus {
    fn from_commands(commands: Vec<Command>) -> Self {
        Self {
            commands: commands.into_iter(),
            childs: Vec::new(),
            stdout_file: None,
            stderr_file: None,
            wait_cvar: Arc::new(Condvar::new()),
            active_threads_count: 0,
        }
    }
}

struct Order {
    threads_count: usize,
    commands_count: usize,
    stdout: OrderStdio,
    stderr: OrderStdio,
    status: Arc<Mutex<OrderStatus>>,
}

impl Order {
    fn get_status(&self) -> MutexGuard<OrderStatus> {
        self.status.lock().unwrap()
    }

    /// |command| (stdout_setter_option, stderr_setter_option)
    fn stdio_get_setter(
        &self,
    ) -> impl Fn(&mut Command) -> (Option<PipeReader>, Option<PipeReader>) {
        let stdout_setter = match self.stdout {
            OrderStdio::Normal => |_: &mut Command| None,
            OrderStdio::Ignore => |command: &mut Command| {
                command.stdout(Stdio::null());
                None
            },
            OrderStdio::ToFile(_) => |command: &mut Command| {
                let (reader, writer) = os_pipe::pipe().unwrap();
                command.stdout(writer);
                Some(reader)
            },
        };
        let stderr_setter = match self.stderr {
            OrderStdio::Normal => |_: &mut Command| None,
            OrderStdio::Ignore => |command: &mut Command| {
                command.stderr(Stdio::null());
                None
            },
            OrderStdio::ToFile(_) => |command: &mut Command| {
                let (reader, writer) = os_pipe::pipe().unwrap();
                command.stderr(writer);
                Some(reader)
            },
        };
        move |command: &mut Command| (stdout_setter(command), stderr_setter(command))
    }

    fn stdio_writer(
        stdio_pair: (Option<PipeReader>, Option<PipeReader>),
        status_mutex: &Arc<Mutex<OrderStatus>>,
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

    fn spawn(&self, index: usize) -> thread::JoinHandle<Result<(), io::Error>> {
        let stdio_setter = self.stdio_get_setter();
        let status_mutex = Arc::clone(&self.status);
        thread::spawn(move || {
            let get_status = || status_mutex.lock().unwrap();
            while let Some(mut command) = {
                let mut status = get_status();
                status.commands.next()
            } {
                let stdio_pair = stdio_setter(&mut command);

                let child = Arc::new(SharedChild::spawn(&mut command)?);
                drop(command); // The "command" owns writers, and dropping it to closes them

                let mut status = get_status();
                status.childs[index] = Some(Arc::clone(&child));
                drop(status);
                child.wait()?;

                Self::stdio_writer(stdio_pair, &status_mutex)?;
            }
            let mut status = get_status();
            status.childs[index] = None;
            status.active_threads_count -= 1;
            status.wait_cvar.notify_one();
            Ok(())
        })
    }

    fn start(&self) -> io::Result<()> {
        let mut status = self.get_status();
        status.childs.resize_with(self.threads_count, || None);
        if let OrderStdio::ToFile(path) = &self.stdout {
            status.stdout_file = Some(fs::OpenOptions::new().write(true).open(path)?);
        }
        if let OrderStdio::ToFile(path) = &self.stderr {
            status.stderr_file = Some(fs::OpenOptions::new().write(true).open(path)?);
        }
        for index in 0..self.threads_count {
            self.spawn(index);
        }
        status.active_threads_count = self.threads_count;
        Ok(())
    }

    /// Return the progress of order as `(finished, total)`.
    fn progress(&self) -> (usize, usize) {
        let total = self.commands_count;
        let status = self.get_status();
        let active = status.childs.iter().fold(0, |active_count, child_option| {
            if child_option.is_some() {
                active_count + 1
            } else {
                active_count
            }
        });
        let remaining = status.commands.len() + active;
        (total - remaining, total)
    }

    fn wait(&self) {
        let status = self.get_status();
        let cvar = Arc::clone(&status.wait_cvar);
        let _ = cvar
            .wait_while(status, |s| s.active_threads_count != 0)
            .unwrap();
    }

    fn cease(&self) {
        self.get_status().commands.nth(std::usize::MAX);
    }

    fn terminate(&self) -> io::Result<()> {
        self.cease();
        let mut status = self.get_status();
        for child_option in &mut status.childs {
            if let Some(child) = child_option.take() {
                child.kill()?;
            }
        }
        Ok(())
    }

    fn new(cfg: &Config) -> Self {
        fn read_dir_recurse(dir: PathBuf) -> Result<Vec<PathBuf>, io::Error> {
            let mut files = Vec::new();
            for entry in fs::read_dir(dir)? {
                let entry = entry?.path();
                if entry.is_dir() {
                    files.append(&mut read_dir_recurse(entry)?);
                } else {
                    files.push(entry);
                }
            }
            Ok(files)
        }

        fn read_dir_foreach(dir: PathBuf) -> Result<Vec<PathBuf>, io::Error> {
            let mut files = Vec::new();
            for entry in fs::read_dir(dir)? {
                let entry = entry?.path();
                if entry.is_file() {
                    files.push(entry);
                }
            }
            Ok(files)
        }

        fn split_args(args_src: &str) -> Result<Vec<String>, Error> {
            let mut args = Vec::new();
            let mut is_in_quotation_mask = true;
            for entry in args_src.split('"') {
                is_in_quotation_mask = !is_in_quotation_mask;
                if is_in_quotation_mask {
                    args.push(String::from(entry));
                } else {
                    let entry_split = entry.split_whitespace().map(String::from);
                    let mut entry_split: Vec<String> = entry_split.collect();
                    args.append(&mut entry_split);
                }
            }
            if is_in_quotation_mask {
                Err(Error {
                    kind: ErrorKind::ConfigIllegal,
                    inner: None,
                    message: Some(String::from("args' quotation mask is not closed")),
                })
            } else {
                Ok(args)
            }
        };

        let read_dir = |dir| {
            if cfg.input_recursive.unwrap() {
                read_dir_recurse(dir)
            } else {
                read_dir_foreach(dir)
            }
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
            if cfg.output_keep_subdir.unwrap() && cfg.input_dir.is_some() {
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
                    match item.as_str() {
                        "{args_switches}" => {
                            for item in &args_switches {
                                command.arg(item);
                            }
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

        if commands.is_empty() {}

        fn std_pipe(
            pipe_name: &str,
            type_name: &Option<String>,
            file_path: &Option<String>,
        ) -> Result<OrderStdio, Error> {
            let type_name = type_name.as_ref().unwrap();
            match type_name.as_str() {
                "normal" => Ok(OrderStdio::Normal),
                "ignore" => Ok(OrderStdio::Ignore),
                "file" => {
                    if file_path.is_none() {
                        return Err(Error {
                            kind: ErrorKind::ConfigIllegal,
                            inner: None,
                            message: Some(format!("{} file path not specified", pipe_name)),
                        });
                    }
                    let path = PathBuf::from(file_path.as_ref().unwrap());
                    let meta = fs::metadata(&path);
                    if meta.is_err() {
                        if fs::write(&path, "").is_err() {
                            return Err(Error {
                                kind: ErrorKind::ConfigIllegal,
                                inner: None,
                                message: Some(format!("could not create {} file", pipe_name)),
                            });
                        }
                    } else if meta.unwrap().is_dir() {
                        return Err(Error {
                            kind: ErrorKind::ConfigIllegal,
                            inner: None,
                            message: Some(format!("a dir on {} file path existed", pipe_name)),
                        });
                    }
                    Ok(OrderStdio::ToFile(path))
                }
                _ => Err(Error {
                    kind: ErrorKind::ConfigIllegal,
                    inner: None,
                    message: Some(format!("unknown {} type", pipe_name)),
                }),
            }
        };

        Self {
            threads_count: cfg.threads_count.unwrap().try_into().unwrap(),
            commands_count: commands.len(),
            stdout: std_pipe("stdout", &cfg.stdout_type, &cfg.stdout_file).unwrap(),
            stderr: std_pipe("stderr", &cfg.stderr_type, &cfg.stderr_file).unwrap(),
            status: Arc::new(Mutex::new(OrderStatus::from_commands(commands))),
        }
    }
}

pub fn run() -> Result<(), Error> {
    // Foundry is one-off, Config is not one-off, change Config from gui and then new a Foundry.
    // let cfg = Config::_from_toml_test();
    let cfg = Config::new()?;
    let order = Arc::new(Order::new(&cfg));
    order.start();
    thread::spawn((|| {
        let order = Arc::clone(&order);
        move || loop {
            let mut user_input = String::new();
            io::stdin()
                .read_line(&mut user_input)
                .expect("Failed to read line");
            match user_input.trim() {
                "t" => {
                    cui::print_log::info("user terminate the foundry");
                    order.terminate();
                }
                _ => {
                    cui::print_log::info("unknown op");
                }
            }
        }
    })());
    thread::spawn((|| {
        let order = Arc::clone(&order);
        move || loop {
            let (finished, total) = order.progress();
            cui::print_log::info(format!("progress: {} / {}", finished, total));
            thread::sleep(std::time::Duration::from_secs(1));
        }
    })());
    order.wait();
    Ok(())
}
