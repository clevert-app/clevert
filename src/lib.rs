mod config;
mod toml_seek;
pub use config::Config;
use shared_child::SharedChild;
use std::fmt;
use std::fs;
use std::io;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Condvar, Mutex};
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

impl std::default::Default for Error {
    fn default() -> Self {
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

#[derive(Default)]
struct Action {
    thread: Option<thread::JoinHandle<()>>,
    child: Option<Arc<SharedChild>>,
}

struct Status {
    commands: IntoIter<Command>,
    actions: Vec<Action>,
    paused: bool,
    cvar: Arc<Condvar>,
    stdout: StdioCfg,
    stderr: StdioCfg,

    // Some(Ok) => Successed or running
    // Some(Err) => Failed
    // None => Before start or be taken
    result: Option<io::Result<()>>,
}

pub struct Order {
    commands_count: usize,
    skip_panic: bool,
    status: Arc<Mutex<Status>>,
}

impl Order {
    fn spawn(&self, index: usize) {
        let skip_panic = self.skip_panic;
        let mutex = Arc::clone(&self.status);
        let handle = thread::spawn(move || {
            let exec = |mut command: Command| {
                let mut status = mutex.lock().unwrap();
                command.stdout(&status.stdout).stderr(&status.stderr);
                let child = SharedChild::spawn(&mut command)?;
                let child = Arc::new(child);
                status.actions[index].child = Some(Arc::clone(&child));
                drop(status); // Drop here to free the mutex

                let wait_result = child.wait();

                let mut status = mutex.lock().unwrap();
                status.actions[index].child = None;
                wait_result?; // defer throw
                Ok(())
            };
            while let Some(command) = {
                let mut status = mutex.lock().unwrap();
                if status.paused {
                    drop(status);
                    thread::park();
                    status = mutex.lock().unwrap();
                }
                status.commands.next()
            } {
                let result = exec(command);
                if !skip_panic && result.is_err() {
                    mutex.lock().unwrap().result = Some(result);
                    break;
                }
            }
            let mut status = mutex.lock().unwrap();
            status.actions[index] = Action::default();
            status.cvar.notify_one();
        });
        let mut status = self.status.lock().unwrap();
        status.actions[index].thread = Some(handle);
    }

    pub fn start(&self) {
        let mut status = self.status.lock().unwrap();
        status.result = Some(Ok(()));
        let actions_count = status.actions.len();
        drop(status);
        for index in 0..actions_count {
            self.spawn(index);
        }
    }

    /// Return the progress of order as `(finished, total)`.
    pub fn progress(&self) -> (usize, usize) {
        let status = self.status.lock().unwrap();
        let total = self.commands_count;
        let idle = status.commands.len();
        let active = status.actions.iter().filter(|o| o.thread.is_some()).count();
        let finished = (total - idle).saturating_sub(active);
        (finished, total)
    }

    pub fn wait(&self) -> io::Result<()> {
        let status = self.status.lock().unwrap();
        let cvar = Arc::clone(&status.cvar);
        let condition = |s: &mut Status| {
            // `false` means stop waiting
            if s.actions
                .iter()
                .all(|i| i.thread.is_none() && i.child.is_none())
            {
                // all actions finished
                false
            } else if let Some(r) = &s.result {
                r.is_ok()
            } else {
                false
            }
        };
        drop(cvar.wait_while(status, condition).unwrap());
        self.terminate()?;
        Ok(())
    }

    /// Must be called at least and most once.
    pub fn wait_result(&self) -> io::Result<()> {
        self.wait()?;
        // Because `io::Result` does not implement the `Clone` trait
        let msg = "`order.wait_result()` be called more than once";
        self.status.lock().unwrap().result.take().expect(msg)
    }

    // Should call `wait` afterwards.
    pub fn cease(&self) -> usize {
        self.status.lock().unwrap().commands.by_ref().count()
    }

    // Should call `wait` afterwards.
    pub fn terminate(&self) -> io::Result<()> {
        self.cease();
        let mut status = self.status.lock().unwrap();
        for action in &mut status.actions {
            if let Some(c) = &mut action.child.take() {
                c.kill()?;
            }
        }
        Ok(())
    }

    pub fn pause(&self) -> io::Result<()> {
        let mut status = self.status.lock().unwrap();
        status.paused = true;
        for action in &mut status.actions {
            if let Some(c) = &action.child {
                c.suspend()?;
            }
        }
        Ok(())
    }

    pub fn resume(&self) -> io::Result<()> {
        let mut status = self.status.lock().unwrap();
        status.paused = false;
        for action in &mut status.actions {
            if let Some(t) = &action.thread {
                t.thread().unpark();
            }
            if let Some(c) = &action.child {
                c.resume()?;
            }
        }
        Ok(())
    }

    pub fn new(cfg: &Config) -> Result<Self, Error> {
        fn visit_dir(dir: PathBuf, vec: &mut Vec<PathBuf>, recursive: bool) -> io::Result<()> {
            for item in fs::read_dir(dir)? {
                let item = item?.path();
                if item.is_file() {
                    vec.push(item);
                } else if recursive && item.is_dir() {
                    visit_dir(item, vec, recursive)?;
                }
            }
            Ok(())
        }
        let read_dir = |dir| {
            let mut vec = Vec::new();
            let recursive = cfg.input_recursive.unwrap();
            visit_dir(dir, &mut vec, recursive).map_err(|e| Error {
                kind: ErrorKind::ConfigIllegal,
                inner: Box::new(e),
                message: "read input dir failed".to_string(),
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

        // Current dir is different with exe dir
        let current_dir = std::env::current_dir().unwrap();
        let mut pairs = Vec::new(); // (from, to)
        for mut input_file in input_files {
            // Bare name
            let file_name = input_file.file_stem().unwrap().to_str().unwrap();
            let mut file_name = file_name.to_string();

            // Set prefix and suffix
            if let Some(prefix) = &cfg.output_prefix {
                file_name.insert_str(0, prefix);
            }
            if let Some(suffix) = &cfg.output_suffix {
                file_name.push_str(suffix);
            }

            let mut output_file = match &cfg.output_dir {
                Some(p) => PathBuf::from(p),
                None => input_file.parent().unwrap().into(),
            };

            // Keep output recursive directories structure
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

            // Set extension name
            if let Some(extension) = &cfg.output_extension {
                output_file.set_extension(extension);
            } else if let Some(extension) = input_file.extension() {
                output_file.set_extension(extension);
            }

            // Expand repative path to absolute
            if cfg.input_absolute.unwrap() && !input_file.is_absolute() {
                input_file = current_dir.join(&input_file);
            }
            if cfg.output_absolute.unwrap() && !output_file.is_absolute() {
                output_file = current_dir.join(&output_file);
            }

            // Overwrite
            match cfg.output_overwrite.as_ref().unwrap().as_str() {
                "allow" => {}
                "forbid" => {
                    if input_file == output_file {
                        return Err(Error {
                            kind: ErrorKind::ConfigIllegal,
                            message: "output overwrite forbidden".to_string(),
                            ..Default::default()
                        });
                    }
                }
                "force" => {
                    if let Err(e) = fs::remove_file(&output_file) {
                        if e.kind() != io::ErrorKind::NotFound {
                            return Err(Error {
                                kind: ErrorKind::ConfigIllegal,
                                message: "remove output overwrite file failed".to_string(),
                                inner: Box::new(e),
                            });
                        }
                    };
                }
                _ => {
                    return Err(Error {
                        kind: ErrorKind::ConfigIllegal,
                        message: "`output_overwrite` value invalid".to_string(),
                        ..Default::default()
                    });
                }
            };

            pairs.push((input_file, output_file));
        }

        fn split_args(args: &str) -> Result<Vec<&str>, Error> {
            let parts = args.split('"');
            if parts.size_hint().0 % 2 == 1 {
                return Err(Error {
                    kind: ErrorKind::ConfigIllegal,
                    message: "args' quotation mask is not closed".to_string(),
                    ..Default::default()
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
                let mut command = Command::new(cfg.program.as_ref().unwrap());
                for part in &args_template {
                    match *part {
                        "{args_switches}" => command.args(&args_switches),
                        "{input_file}" => command.arg(&input_file),
                        "{output_file}" => {
                            if cfg.output_suffix_serial.unwrap() {
                                let stem = output_file.file_stem().unwrap().to_str().unwrap();
                                let name = format!("{}_{}", stem, index + 1);
                                let mut path = output_file.with_file_name(name);
                                if let Some(ext) = output_file.extension() {
                                    path.set_extension(ext);
                                }
                                command.arg(path)
                            } else {
                                command.arg(&output_file)
                            }
                        }
                        "{output_dir}" => command.arg(output_file.parent().unwrap()),
                        "{repeat_num}" => command.arg((index + 1).to_string()),
                        _ => command.arg(part),
                    };
                }
                // command.get_args(); // https://github.com/rust-lang/rust/issues/44434
                commands.push(command);
            }
        }

        if commands.is_empty() {
            return Err(Error {
                kind: ErrorKind::ConfigIllegal,
                message: "order did not generate any commands".to_string(),
                ..Default::default()
            });
        }

        if let Some(dir) = &cfg.current_dir {
            for command in &mut commands {
                command.current_dir(dir);
            }
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
                        ..Default::default()
                    })?;
                    let file = fs::OpenOptions::new()
                        .write(true)
                        .create(true)
                        .open(path)
                        .map_err(|e| Error {
                            kind: ErrorKind::ConfigIllegal,
                            inner: Box::new(e),
                            message: "stdio file can't write".to_string(),
                        })?;
                    Ok(StdioCfg::File(file))
                }
                _ => Err(Error {
                    kind: ErrorKind::ConfigIllegal,
                    message: "stdio type unknown".to_string(),
                    ..Default::default()
                }),
            }
        };
        Ok(Self {
            commands_count: commands.len(),
            skip_panic: cfg.skip_panic.unwrap(),
            status: Arc::new(Mutex::new(Status {
                commands: commands.into_iter(),
                actions: (0..cfg.threads_count.unwrap())
                    .map(|_| Default::default())
                    .collect(),
                paused: false,
                cvar: Arc::new(Condvar::new()),
                stdout: stdpipe(&cfg.stdout_type, &cfg.stdout_file)?,
                stderr: stdpipe(&cfg.stderr_type, &cfg.stderr_file)?,
                result: None,
            })),
        })
    }
}
