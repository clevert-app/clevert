use crate::Config;
use shared_child::SharedChild;
use std::env;
use std::fs;
use std::io;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::vec::IntoIter;

enum Pipe {
    Null,
    Inherit,
    File(fs::File),
}

impl From<&Pipe> for Stdio {
    fn from(s: &Pipe) -> Stdio {
        match s {
            Pipe::Null => Stdio::null(),
            Pipe::Inherit => Stdio::inherit(),
            Pipe::File(file) => file.try_clone().unwrap().into(),
        }
    }
}

struct Status {
    commands: IntoIter<Command>,
    childs: Vec<Option<Arc<SharedChild>>>,
    result: Result<(), String>,
}

pub struct Action {
    pipe: Pipe,
    commands_count: usize,
    ignore_panic: bool,
    wait_cvar: Condvar,
    status: Mutex<Status>,
}

impl Action {
    /// pop a command from list then execute it
    fn once(&self, index: usize) -> io::Result<bool> {
        let mut status = self.status.lock().unwrap();
        let mut command = match status.commands.next() {
            Some(v) => v,
            None => return Ok(false),
        };
        command.stdout(&self.pipe).stderr(&self.pipe);
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
                    self.stop().ok(); // make other threads to stop
                    self.status.lock().unwrap().result = Err(format!("{:?}", e));
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
        status.commands.by_ref().count(); // empty the command list
        let mut result = Ok(());
        for child in status.childs.iter().filter_map(|v| v.as_ref()) {
            let kill_result = child.kill();
            // only store the first error
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

    pub fn wait(self: &Arc<Self>) -> Result<(), String> {
        loop {
            drop(self.wait_cvar.wait(self.status.lock().unwrap()));
            let progress = self.progress();
            if progress.0 == progress.1 {
                break;
            }
        }
        match &self.status.lock().unwrap().result {
            Ok(()) => Ok(()),
            Err(e) => Err(format!("execute error: {:?}", e)),
        }
    }

    pub fn new(cfg: &Config) -> Result<Arc<Self>, String> {
        fn visit_dir(dir: PathBuf) -> io::Result<Vec<PathBuf>> {
            let mut ret = Vec::new();
            for item in fs::read_dir(dir)? {
                let item = item?.path();
                if item.is_file() {
                    ret.push(item);
                } else if item.is_dir() {
                    ret.append(&mut visit_dir(item)?);
                }
            }
            Ok(ret)
        }
        let mut input_files = Vec::new();
        for item in cfg.input_list.as_ref().unwrap() {
            let path = PathBuf::from(item);
            if path.is_dir() {
                input_files.append(
                    &mut visit_dir(path)
                        .map_err(|e| format!("read input items failed: {:?}", e))?,
                );
            } else {
                input_files.push(path);
            }
        }

        // current dir is different with exe dir
        let current_dir = env::current_dir().unwrap();
        let mut pairs = Vec::new(); // (from, to)
        for mut input_file in input_files {
            // stem name
            let file_name = input_file.file_stem().unwrap();
            let mut file_name = file_name.to_str().unwrap().to_string();

            // prefix and suffix
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

            // keep output recursive dirs structure
            if !cfg.output_recursive.unwrap() {
                output_file.push(file_name);
            } else if cfg.input_list.as_ref().unwrap().len() == 1 {
                let input_dir = cfg.input_list.as_ref().unwrap()[0].clone();
                let relative_path = input_file.strip_prefix(input_dir).unwrap();
                output_file.push(relative_path);
                output_file.set_file_name(file_name);
                let output_dir = output_file.parent().unwrap();
                fs::create_dir_all(output_dir).unwrap();
            } else {
                return Err(
                    "input_list must contain only 1 item while output_recursive".to_string()
                );
            }

            // extension
            if let Some(extension) = &cfg.output_extension {
                output_file.set_extension(extension);
            } else if let Some(extension) = input_file.extension() {
                output_file.set_extension(extension);
            }

            // expand repative path to absolute
            if cfg.input_absolute.unwrap() && !input_file.is_absolute() {
                input_file = current_dir.join(&input_file);
            }
            if cfg.output_absolute.unwrap() && !output_file.is_absolute() {
                output_file = current_dir.join(&output_file);
            }

            // force overwrite
            if cfg.output_force.unwrap() {
                // TODO: if-let-chain after rust 1.62
                if let Err(e) = fs::remove_file(&output_file) {
                    if e.kind() != io::ErrorKind::NotFound {
                        return Err("remove file for output_force failed".to_string());
                    }
                }
            }

            pairs.push((input_file, output_file));
        }

        let args_template = {
            let splitted = cfg.args_template.as_ref().unwrap().split('"');
            if splitted.size_hint().0 % 2 == 1 {
                return Err("args' quotation mask is not closed".to_string());
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
        for (input_file, output_file) in pairs.iter() {
            for repeat_num in 1..cfg.repeat_count.unwrap() + 1 {
                let mut command = Command::new(cfg.program.as_ref().unwrap());
                for part in &args_template {
                    match *part {
                        "{input_file}" => command.arg(&input_file),
                        "{output_file}" if cfg.output_serial.unwrap() => {
                            let name = output_file.file_name().unwrap();
                            let mut name = name.to_str().unwrap().to_string();
                            let idx = output_file.file_stem().unwrap().len();
                            name.insert_str(idx, &format!("_{repeat_num}"));
                            command.arg(output_file.with_file_name(name))
                        }
                        "{output_file}" => command.arg(&output_file),
                        "{output_dir}" => command.arg(output_file.parent().unwrap()),
                        "{repeat_num}" => command.arg(repeat_num.to_string()),
                        _ => command.arg(part),
                    };
                }
                commands.push(command);
                // log!("command args = {:?}", command.get_args());
            }
        }

        if let Some(dir) = &cfg.current_dir {
            for command in &mut commands {
                command.current_dir(dir);
            }
        }

        if commands.is_empty() {
            return Err("current config did not generate any commands".to_string());
        }

        let pipe = match &cfg.pipe {
            None => Pipe::Null,
            Some(v) if v == "<inherit>" => Pipe::Inherit,
            Some(v) => {
                let file = fs::OpenOptions::new().write(true).create(true).open(v);
                let file = file.map_err(|e| format!("write to pipe file failed: {:?}", e))?;
                Pipe::File(file)
            }
        };
        Ok(Arc::new(Self {
            pipe,
            commands_count: commands.len(),
            ignore_panic: cfg.ignore_panic.unwrap(),
            wait_cvar: Condvar::new(),
            status: Mutex::new(Status {
                commands: commands.into_iter(),
                childs: vec![None; cfg.threads_count.unwrap()],
                result: Ok(()),
            }),
        }))
    }
}

impl Drop for Action {
    fn drop(&mut self) {
        self.stop().ok();
    }
}
