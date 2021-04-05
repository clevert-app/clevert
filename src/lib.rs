mod child_kit;
mod config;
mod toml_seek;
pub use config::Config;
use std::fmt;
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::thread;
use std::vec::IntoIter;

#[derive(Debug)]
pub enum ErrorKind {
    ConfigIllegal,
    ConfigFileCanNotRead,
    UnknownError,
    ExecutePanic,
}

#[derive(Debug)]
pub struct Error {
    pub kind: ErrorKind,
    pub inner: Box<dyn fmt::Debug>,
    pub message: String,
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

impl StdioCfg {
    fn set_command(&self, command: &mut Command) {
        match self {
            StdioCfg::Ignore => command.stderr(Stdio::null()),
            StdioCfg::ToFile(_) => command.stderr(Stdio::piped()),
            StdioCfg::Normal => command,
        };
    }

    fn write(&mut self, stdio: &mut Option<impl Read>) -> io::Result<()> {
        if let StdioCfg::ToFile(file) = self {
            if let Some(mut stream) = stdio.take() {
                let buf = &mut Vec::new();
                stream.read_to_end(buf)?;
                file.write_all(buf)?;
            }
        }
        Ok(())
    }
}

struct Status {
    commands: IntoIter<Command>,
    childs: Vec<Option<u32>>,
    actives_count: usize,
    cvar: Arc<Condvar>,
    stdout: StdioCfg,
    stderr: StdioCfg,
    error: Option<io::Error>,
}

pub struct Order {
    commands_count: usize,
    skip_panic: bool,
    status: Arc<Mutex<Status>>,
}

impl Order {
    fn get_status(&self) -> MutexGuard<Status> {
        self.status.lock().unwrap()
    }

    fn spawn(&self, index: usize) {
        let skip_panic = self.skip_panic;
        let status_mutex = Arc::clone(&self.status);
        thread::spawn(move || {
            let get_status = || status_mutex.lock().unwrap();
            let exec = |mut command| {
                let mut status = get_status();
                status.stdout.set_command(&mut command);
                status.stderr.set_command(&mut command);
                let mut child = command.spawn()?;
                status.childs[index] = Some(child.id());
                drop(status);
                let wait_result = child.wait();
                let mut status = get_status();
                status.childs[index] = None; // MUST clear pid immediately!
                status.stdout.write(&mut child.stdout)?;
                status.stderr.write(&mut child.stderr)?;
                wait_result?;
                Ok(())
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

    pub fn start(&self) {
        let status = self.get_status();
        for index in 0..status.actives_count {
            self.spawn(index);
        }
    }

    /// Return the progress of order as `(finished, total)`.
    pub fn progress(&self) -> (usize, usize) {
        let status = self.get_status();
        let total = self.commands_count;
        let idle = status.commands.len();
        let active = status.actives_count;
        let finished = (total - idle).saturating_sub(active);
        (finished, total)
    }

    pub fn wait(&self) -> io::Result<()> {
        let status = self.get_status();
        let cvar = Arc::clone(&status.cvar);
        let condition = |s: &mut Status| s.actives_count > 0 && s.error.is_none();
        drop(cvar.wait_while(status, condition).unwrap());
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
        for pid_opt in &status.childs {
            if let Some(pid) = *pid_opt {
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
                if path.is_file() {
                    input_files.push(path);
                } else {
                    input_files.append(&mut read_dir(path)?);
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
        let actives_count = cfg.threads_count.unwrap() as usize;
        let commands_count = commands.len();
        let status = Status {
            commands: commands.into_iter(),
            childs: (0..actives_count).map(|_| None).collect(),
            actives_count,
            cvar: Arc::new(Condvar::new()),
            stdout: stdpipe(&cfg.stdout_type, &cfg.stdout_file)?,
            stderr: stdpipe(&cfg.stderr_type, &cfg.stderr_file)?,
            error: None,
        };
        Ok(Self {
            commands_count,
            skip_panic: cfg.skip_panic.unwrap(),
            status: Arc::new(Mutex::new(status)),
        })
    }
}
