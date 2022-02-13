mod config;
mod log;
pub use config::{Config, Profile};
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
    Config,
    Other,
    ExecutePanic,
}

#[derive(Debug)]
pub struct Error {
    pub kind: ErrorKind,
    pub inner: Box<dyn fmt::Debug + Send + Sync>,
    pub message: String,
}

impl std::default::Default for Error {
    fn default() -> Self {
        Self {
            kind: ErrorKind::Other,
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

struct Status {
    commands: IntoIter<Command>,
    childs: Vec<Option<Arc<SharedChild>>>,
    result: Result<(), Arc<io::Error>>, // io::Error not impl Clone
}

pub struct Action {
    stdout: StdioCfg,
    stderr: StdioCfg,
    commands_count: usize,
    ignore_panic: bool,
    wait_cvar: Condvar,
    status: Mutex<Status>,
}

impl Action {
    fn once(&self, index: usize) -> io::Result<bool> {
        let mut status = self.status.lock().unwrap();
        let mut command = match status.commands.next() {
            Some(v) => v,
            None => return Ok(false),
        };
        command.stdout(&self.stdout).stderr(&self.stderr);
        let child = Arc::new(SharedChild::spawn(&mut command)?);
        status.childs[index] = Some(Arc::clone(&child));
        drop(status); // hold mutex until spawned, otherwise `stop()` will miss child!
        let exit_status = child.wait()?;
        match exit_status.success() {
            true => Ok(true),
            false => Err(io::Error::new(
                io::ErrorKind::Other,
                format!("process exit with non-zero: {:?}", exit_status),
            )),
        }
    }

    fn spawn(self: Arc<Self>, index: usize) {
        loop {
            match self.once(index) {
                // no next command, exit
                Ok(false) => break,

                // successfully
                Ok(true) => continue,

                // if `ignore_panic`, ignore execute error and no-zero exit
                Err(_) if self.ignore_panic => continue,

                // execute error or no-zero exit
                Err(e) => {
                    let _ = self.stop(); // make other threads to stop
                    self.status.lock().unwrap().result = Err(Arc::new(e));
                    break;
                }
            }
        }
        self.wait_cvar.notify_all(); // notify for `wait()`
    }

    pub fn start(self: &Arc<Self>) {
        for index in 0..self.status.lock().unwrap().childs.len() {
            let this = Arc::clone(self);
            thread::spawn(move || Self::spawn(this, index));
        }
    }

    /// Stop action. If killing the processes fails, return the first error.
    pub fn stop(&self) -> io::Result<()> {
        let mut status = self.status.lock().unwrap();
        status.commands.by_ref().count(); // clean the command list
        let mut result = Ok(()); // only store the first error
        for child in status.childs.iter().filter_map(|v| v.as_ref()) {
            let kill_result = child.kill();
            if kill_result.is_err() && result.is_ok() {
                result = kill_result;
            }
        }
        result
    }

    /// Return the progress as `(finished, total)`.
    pub fn progress(&self) -> (usize, usize) {
        let status = self.status.lock().unwrap();
        let total = self.commands_count;
        let remain = status.commands.len();
        let active_filter = |v: &Option<Arc<SharedChild>>| match v.as_ref()?.try_wait() {
            Ok(None) => Some(()), // still running
            _ => None,
        };
        let active = status.childs.iter().filter_map(active_filter).count();
        let finished = (total - remain).saturating_sub(active);
        (finished, total)
    }

    pub fn wait(self: &Arc<Self>) -> Result<(), Error> {
        loop {
            drop(self.wait_cvar.wait(self.status.lock().unwrap()));
            let progress = self.progress();
            if progress.0 == progress.1 {
                break;
            }
        }
        match &self.status.lock().unwrap().result {
            Ok(()) => Ok(()),
            Err(e) => Err(Error {
                kind: ErrorKind::ExecutePanic,
                inner: Box::new(Arc::clone(e)),
                ..Default::default()
            }),
        }
    }

    pub fn new(profile: &Profile) -> Result<Arc<Self>, Error> {
        let cfg = profile.get_current();

        fn visit_dir(dir: PathBuf, recursive: bool) -> io::Result<Vec<PathBuf>> {
            let mut ret = Vec::new();
            for item in fs::read_dir(dir)? {
                let item = item?.path();
                if item.is_file() {
                    ret.push(item);
                } else if recursive && item.is_dir() {
                    ret.append(&mut visit_dir(item, recursive)?);
                }
            }
            Ok(ret)
        }
        let read_dir = |dir| {
            let recursive = cfg.input_recursive.unwrap();
            let ret = visit_dir(dir, recursive).map_err(|e| Error {
                kind: ErrorKind::Config,
                inner: Box::new(e),
                message: "read input dir failed".to_string(),
            })?;
            Ok(ret)
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
                "allow" => Ok(()),
                "forbid" if input_file == output_file => Err(Error {
                    kind: ErrorKind::Config,
                    message: "output overwrite forbidden".to_string(),
                    ..Default::default()
                }),
                "forbid" => Ok(()),
                "force" => match fs::remove_file(&output_file) {
                    Err(e) if e.kind() != io::ErrorKind::NotFound => Err(Error {
                        kind: ErrorKind::Config,
                        inner: Box::new(e),
                        message: "remove output overwrite file failed".to_string(),
                    }),
                    _ => Ok(()),
                },
                _ => Err(Error {
                    kind: ErrorKind::Config,
                    message: "`output_overwrite` value invalid".to_string(),
                    ..Default::default()
                }),
            }?;

            pairs.push((input_file, output_file));
        }

        let args_template = {
            let splitted = cfg.args_template.as_ref().unwrap().split('"');
            if splitted.size_hint().0 % 2 == 1 {
                return Err(Error {
                    kind: ErrorKind::Config,
                    message: "args' quotation mask is not closed".to_string(),
                    ..Default::default()
                });
            }
            let mut parts = Vec::new();
            for (i, part) in splitted.enumerate() {
                match i % 2 {
                    1 => parts.push(part),
                    _ => parts.extend(part.split_whitespace()),
                };
            }
            parts
        };
        let mut commands = Vec::new();
        for (input_file, output_file) in pairs {
            for repeat_num in 1..cfg.repeat_count.unwrap() + 1 {
                let mut command = Command::new(cfg.program.as_ref().unwrap());
                for part in &args_template {
                    match *part {
                        "{input_file}" => command.arg(&input_file),
                        "{output_file}" if cfg.output_suffix_serial.unwrap() => {
                            let mut name = String::new();
                            if let Some(stem) = output_file.file_stem() {
                                name.push_str(&stem.to_string_lossy());
                                name.push('_');
                            }
                            name.push_str(&repeat_num.to_string());
                            if let Some(ext) = output_file.extension() {
                                name.push('.');
                                name.push_str(&ext.to_string_lossy());
                            }
                            command.arg(output_file.with_file_name(name))
                        }
                        "{output_file}" => command.arg(&output_file),
                        "{output_dir}" => command.arg(output_file.parent().unwrap()),
                        "{repeat_num}" => command.arg(repeat_num.to_string()),
                        _ => command.arg(part),
                    };
                }
                commands.push(command);
            }
        }

        if let Some(dir) = &cfg.current_dir {
            for command in &mut commands {
                command.current_dir(dir);
            }
        }

        if profile.cli_log_level.unwrap() >= 3 {
            for command in &commands {
                log!("command args = {:?}", command.get_args());
            }
        }

        if commands.is_empty() {
            return Err(Error {
                kind: ErrorKind::Config,
                message: "current config did not generate any commands".to_string(),
                ..Default::default()
            });
        }

        let stdio_gen = |kind: &String, path: Option<&String>| match kind.as_str() {
            "ignore" => Ok(StdioCfg::Ignore),
            "normal" => Ok(StdioCfg::Normal),
            "file" => {
                let mut open_option = fs::OpenOptions::new();
                open_option.write(true).create(true);
                let open_result = open_option.open(path.ok_or_else(|| Error {
                    kind: ErrorKind::Config,
                    message: "stdio's _type = 'file', but _file = None".to_string(),
                    ..Default::default()
                })?);
                Ok(StdioCfg::File(open_result.map_err(|e| Error {
                    kind: ErrorKind::Config,
                    inner: Box::new(e),
                    message: "write to stdio's _file failed".to_string(),
                })?))
            }
            _ => Err(Error {
                kind: ErrorKind::Config,
                message: "stdio's _type invalid".to_string(),
                ..Default::default()
            }),
        };
        Ok(Arc::new(Self {
            stdout: stdio_gen(cfg.stdout_type.as_ref().unwrap(), cfg.stdout_file.as_ref())?,
            stderr: stdio_gen(cfg.stderr_type.as_ref().unwrap(), cfg.stderr_file.as_ref())?,
            commands_count: commands.len(),
            ignore_panic: cfg.ignore_panic.unwrap(),
            wait_cvar: Condvar::new(),
            status: Mutex::new(Status {
                commands: commands.into_iter(),
                childs: vec![None; cfg.threads_count.unwrap() as _],
                result: Ok(()),
            }),
        }))
    }
}
