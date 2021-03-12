mod child_kit;
mod config;
pub mod cui;
mod toml_seek;
use config::Config;
use std::fmt;
use std::fs;
use std::fs::File;
use std::io;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
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
    inner: Box<dyn fmt::Debug>,
    message: String,
}

impl Error {
    pub fn default() -> Self {
        Self {
            kind: ErrorKind::UnknownError,
            inner: Box::new(Option::<()>::None),
            message: String::new(),
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&format!("{:?}", self))
    }
}

impl std::error::Error for Error {}

enum StdioCfg {
    Normal,
    Ignore,
    ToFile(File),
}

struct Status {
    commands: IntoIter<Command>,
    childs: Vec<Option<u32>>,
    actives_count: usize,
    error: Option<io::Error>,
    stdout: StdioCfg,
    stderr: StdioCfg,
    cvar: Arc<Condvar>,
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

    fn output_set(command: &mut Command, status: &mut MutexGuard<Status>) {
        match status.stdout {
            StdioCfg::Ignore => command.stdout(Stdio::null()),
            StdioCfg::ToFile(_) => command.stdout(Stdio::piped()),
            StdioCfg::Normal => command,
        };
        match status.stderr {
            StdioCfg::Ignore => command.stderr(Stdio::null()),
            StdioCfg::ToFile(_) => command.stderr(Stdio::piped()),
            StdioCfg::Normal => command,
        };
    }

    fn output_write(child: &mut Child, status: &mut MutexGuard<Status>) -> io::Result<()> {
        if let StdioCfg::ToFile(file) = &mut status.stdout {
            let buf = &mut Vec::new();
            child.stdout.take().unwrap().read_to_end(buf)?;
            file.write_all(buf)?;
        }
        if let StdioCfg::ToFile(file) = &mut status.stderr {
            let buf = &mut Vec::new();
            child.stderr.take().unwrap().read_to_end(buf)?;
            file.write_all(buf)?;
        }
        Ok(())
    }

    fn spawn(&self, index: usize) {
        let skip_panic = self.skip_panic;
        let status_mutex = Arc::clone(&self.status);
        thread::spawn(move || {
            let get_status = || status_mutex.lock().unwrap();
            let exec = |mut command| {
                let mut status = get_status();
                Self::output_set(&mut command, &mut status);
                let child = &mut command.spawn()?;
                status.childs[index] = Some(child.id());
                drop(status);
                let wait_result = child.wait();
                let mut status = get_status();
                status.childs[index] = None; // MUST clear pid immediately
                Self::output_write(child, &mut status)?;
                wait_result
            };
            while let Some(command) = {
                let mut status = get_status();
                status.commands.next()
            } {
                let result = exec(command);
                if !skip_panic && result.is_err() {
                    get_status().error = result.err();
                    break;
                }
            }
            let mut status = get_status();
            status.childs[index] = None; // Maybe useless?
            status.actives_count -= 1;
            status.cvar.notify_one();
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

    pub fn wait(&self) -> io::Result<()> {
        let status = self.get_status();
        let cvar = Arc::clone(&status.cvar);
        let condition = |s: &mut Status| s.actives_count > 0 && s.error.is_none();
        let cvar_status = cvar.wait_while(status, condition).unwrap();
        drop(cvar_status);
        self.terminate()?;
        Ok(())
    }

    /// Must be called at least and most once.
    pub fn wait_result(&self) -> io::Result<()> {
        self.wait()?;
        if let Some(e) = self.get_status().error.take() {
            return Err(e);
        }
        Ok(())
    }

    // Should call `wait` afterwards.
    pub fn cease(&self) {
        self.get_status().commands.nth(usize::MAX);
    }

    // Should call `wait` afterwards.
    pub fn terminate(&self) -> io::Result<()> {
        self.cease();
        let status = self.get_status();
        for opt in &status.childs {
            if let Some(pid) = *opt {
                child_kit::kill(pid)?;
            }
        }
        Ok(())
    }

    pub fn new(cfg: &Config) -> Result<Self, Error> {
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
                inner: Box::new(e),
                ..Error::default()
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
        let current_dir = std::env::current_dir().unwrap();
        let mut pairs = Vec::new();
        for mut input_file in input_files {
            let file_name = input_file.file_stem().unwrap().to_str().unwrap();
            let mut file_name = file_name.to_string();
            if let Some(prefix) = &cfg.output_prefix {
                file_name.insert_str(0, &prefix);
            }
            if let Some(suffix) = &cfg.output_suffix {
                file_name.push_str(&suffix);
            }
            let mut output_file = match &cfg.output_dir {
                Some(p) => PathBuf::from(p),
                None => input_file.parent().unwrap().into(),
            };
            if cfg.output_recursive.unwrap() && cfg.input_dir.is_some() {
                let input_dir = cfg.input_dir.as_ref().unwrap();
                let relative_path = input_file.strip_prefix(input_dir).unwrap();
                output_file.push(relative_path);
                output_file.set_file_name(file_name);
                let output_dir = output_file.parent().unwrap();
                fs::create_dir_all(output_dir).unwrap();
            } else {
                output_file.push(file_name);
            }
            if cfg.output_overwrite.unwrap() {
                let _result = fs::remove_file(&output_file);
            }
            if let Some(extension) = &cfg.output_extension {
                output_file.set_extension(extension);
            }
            if cfg.input_absolute.unwrap() && !input_file.is_absolute() {
                input_file = current_dir.join(&input_file);
            }
            if cfg.output_absolute.unwrap() && !output_file.is_absolute() {
                output_file = current_dir.join(&output_file);
            }
            pairs.push((input_file, output_file));
        }

        fn split_args(args: &str) -> Result<Vec<&str>, Error> {
            let parts = args.split('"');
            if parts.size_hint().0 % 2 == 1 {
                return Err(Error {
                    kind: ErrorKind::ConfigIllegal,
                    message: "args' quotation mask is not closed".to_string(),
                    ..Error::default()
                });
            }
            let mut vec = Vec::new();
            for (index, part) in parts.enumerate() {
                match index % 2 {
                    1 => vec.push(part),
                    _ => vec.extend(part.split_whitespace()),
                };
            }
            Ok(vec)
        }
        let args_template = split_args(cfg.args_template.as_ref().unwrap())?;
        let args_switches = split_args(cfg.args_switches.as_ref().unwrap())?;

        let mut commands = Vec::new();
        for (input_file, output_file) in pairs {
            for index in 0..cfg.repeat_count.unwrap() {
                let mut c = Command::new(cfg.program.as_ref().unwrap());
                for part in &args_template {
                    match *part {
                        "{args_switches}" => c.args(&args_switches),
                        "{input_file}" => c.arg(&input_file),
                        "{output_file}" => c.arg(&output_file),
                        "{output_dir}" => c.arg(output_file.parent().unwrap()),
                        "{repeat_index}" => c.arg(index.to_string()),
                        "{repeat_position}" => c.arg((index + 1).to_string()),
                        _ => c.arg(part),
                    };
                }
                commands.push(c);
            }
        }

        if commands.is_empty() {
            return Err(Error {
                kind: ErrorKind::ConfigIllegal,
                message: "no commands generated with order".to_string(),
                ..Error::default()
            });
        }

        let stdpipe = |type_opt: &Option<String>, path_opt: &Option<String>| {
            let type_str = type_opt.as_ref().unwrap().as_str();
            match type_str {
                "ignore" => Ok(StdioCfg::Ignore),
                "normal" => Ok(StdioCfg::Normal),
                "file" => {
                    let path = path_opt.as_ref().ok_or_else(|| Error {
                        kind: ErrorKind::ConfigIllegal,
                        message: "stdio file unknown".to_string(),
                        ..Error::default()
                    })?;
                    let mut opt = fs::OpenOptions::new();
                    let file = opt.write(true).open(path).map_err(|e| Error {
                        kind: ErrorKind::ConfigIllegal,
                        inner: Box::new(e),
                        message: "stdio file can't write".to_string(),
                    })?;
                    Ok(StdioCfg::ToFile(file))
                }
                _ => Err(Error {
                    kind: ErrorKind::ConfigIllegal,
                    message: "stdio type unknown".to_string(),
                    ..Error::default()
                }),
            }
        };
        let threads_count = cfg.threads_count.unwrap() as usize;
        let commands_count = commands.len();
        let status = Status {
            commands: commands.into_iter(),
            childs: (0..threads_count).map(|_| None).collect(),
            actives_count: 0,
            error: None,
            stdout: stdpipe(&cfg.stdout_type, &cfg.stdout_file)?,
            stderr: stdpipe(&cfg.stderr_type, &cfg.stderr_file)?,
            cvar: Arc::new(Condvar::new()),
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
    // Order is one-off, Config is not one-off, change cfg on GUI and then new an Order.
    let cfg = Config::new()?;
    // let cfg = Config::_from_toml_test();

    let order = Arc::new(Order::new(&cfg)?);
    order.start().map_err(|e| Error {
        inner: Box::new(e),
        ..Error::default()
    })?;

    // Progress message
    if cfg.cui_msg_level.unwrap() >= 2 {
        let order = Arc::clone(&order);
        let interval = cfg.cui_msg_interval.unwrap() as u64;
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
            println!();
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
        inner: Box::new(e),
        ..Error::default()
    })?;

    Ok(())
}
