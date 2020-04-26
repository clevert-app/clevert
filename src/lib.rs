pub mod config;
pub mod cui;
use config::Config;
use cui::print_log;
use std::convert::TryInto;
use std::error;
use std::fmt;
use std::fs;
use std::fs::File;
use std::io;
use std::io::prelude::*;
use std::path::PathBuf;
use std::process::Child;
use std::process::Command;
use std::process::Stdio;
use std::sync::Arc;
use std::sync::Mutex;
use std::thread;
use std::time;
use std::vec::IntoIter;

#[derive(Debug)]
pub enum ErrorKind {
    ConfigTomlIllegal,
    ConfigIllegal,
    ConfigFileCanNotRead,
    CanNotWriteLogFile,
    ExecutePanic,
}

#[derive(Debug)]
pub struct Error {
    pub kind: ErrorKind,
    pub inner: Option<Box<dyn error::Error>>,
    pub message: Option<String>,
}

impl error::Error for Error {}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        use ErrorKind::*;
        let mut content = match &self.kind {
            ConfigTomlIllegal => "config isn not a legal toml document",
            ConfigIllegal => "config isn illegal",
            ConfigFileCanNotRead => "read config file failed",
            CanNotWriteLogFile => "write log file failed",
            ExecutePanic => "task process panic",
        }
        .to_string();
        if let Some(message) = &self.message {
            content += &format!(", message = {}", message);
        };
        if let Some(inner) = &self.inner {
            content += &format!(", error = {}", inner);
        };
        f.write_str(&content)
    }
}

struct Task {
    program: String,
    args: Vec<String>,
}

impl Task {
    fn generate(&self) -> Command {
        let mut command = Command::new(&self.program);
        command.args(&self.args);
        command
    }
}

enum OrderStdio {
    Normal,
    Ignore,
    ToFile(File),
}

struct Order {
    threads_count: i32,
    print_progress_msg: bool,
    stdout: OrderStdio,
    stderr: OrderStdio,
    tasks: Vec<Task>,
    current_commands_iter: Option<Arc<Mutex<IntoIter<Command>>>>,
    current_processes: Option<Arc<Mutex<Vec<Child>>>>,
}

impl Order {
    fn prepare(&self) -> Vec<Command> {
        let mut commands = Vec::new();
        for task in &self.tasks {
            let mut command = task.generate();
            {
                use OrderStdio::*;
                command.stdout(match &self.stdout {
                    Normal => Stdio::inherit(),
                    Ignore => Stdio::null(),
                    ToFile(_) => Stdio::piped(),
                });
                command.stderr(match &self.stderr {
                    Normal => Stdio::inherit(),
                    Ignore => Stdio::null(),
                    ToFile(_) => Stdio::piped(),
                });
            }
            commands.push(command);
        }
        commands
    }

    fn execute(&mut self) -> Result<(), io::Error> {
        let commands = self.prepare();
        let iter = commands.into_iter();
        self.current_commands_iter = Some(Arc::new(Mutex::new(iter)));
        self.current_processes = Some(Arc::new(Mutex::new(Vec::new())));
        if self.print_progress_msg {
            let amount: i32 = self.tasks.len().try_into().unwrap();
            let amount: f64 = amount.into();
            let commands_iter_mutex = Arc::clone(self.current_commands_iter.as_ref().unwrap());
            thread::spawn(move || loop {
                let iter = commands_iter_mutex.lock().unwrap();
                let remaining = iter.size_hint().0;
                if remaining == 0 {
                    break;
                }
                let remaining: i32 = remaining.try_into().unwrap();
                let remaining: f64 = remaining.into();
                let completed = amount - remaining;
                print_log::info(format!(
                    "progress: {} / {} ({:.0}%)",
                    completed,
                    amount,
                    completed / amount * 100.0
                ));
                drop(iter);
                thread::sleep(time::Duration::from_secs(1));
            });
        }
        let mut handles = Vec::new();
        for _ in 0..self.threads_count {
            let handle = self.spawn();
            handles.push(handle);
        }
        for handle in handles {
            if let Err(e) = handle.join().unwrap() {
                if self.print_progress_msg {
                    let mut iter = self.current_commands_iter.as_ref().unwrap().lock().unwrap();
                    iter.nth(self.tasks.len() - 1);
                }
                return Err(e);
            }
        }
        self.stop()?;
        Ok(())
    }

    fn stop(&mut self) -> Result<(), io::Error> {
        let mutex = self.current_processes.as_mut().unwrap();
        let mut mutex_guard = mutex.lock().unwrap();
        let childs: &mut Vec<std::process::Child> = mutex_guard.as_mut();
        for child in childs.iter_mut() {
            let _ = child.kill(); // error handling
        }
        if let OrderStdio::ToFile(file) = &mut self.stdout {
            for child in childs.iter_mut() {
                let mut stdout = Vec::<u8>::new();
                child.stdout.as_mut().unwrap().read_to_end(&mut stdout)?;
                file.write_all(&stdout)?;
            }
        }
        if let OrderStdio::ToFile(file) = &mut self.stderr {
            for child in childs.iter_mut() {
                let mut stderr = Vec::<u8>::new();
                child.stderr.as_mut().unwrap().read_to_end(&mut stderr)?;
                file.write_all(&stderr)?;
            }
        }
        drop(mutex_guard);
        self.current_processes = None;
        Ok(())
    }

    fn spawn(&mut self) -> thread::JoinHandle<Result<(), io::Error>> {
        let commands_iter_mutex = Arc::clone(self.current_commands_iter.as_ref().unwrap());
        let processes_mutex = Arc::clone(self.current_processes.as_ref().unwrap());
        thread::spawn(move || {
            while let Some(mut command) = {
                let mut iter = commands_iter_mutex.lock().unwrap();
                iter.next()
            } {
                let mut child = command.spawn()?;
                child.wait()?;
                processes_mutex.lock().unwrap().push(child);
            }
            Ok(())
        })
    }
}

pub struct Foundry {
    orders: Vec<Order>,
}

impl Foundry {
    pub fn new(cfg: Config) -> Result<Foundry, Error> {
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

        let mut orders = Vec::new();
        for order in &cfg.orders {
            let mut input_files = Vec::new();
            let read_dir = |dir| {
                if order.input_dir_deep.unwrap() {
                    read_dir_recurse(dir)
                } else {
                    read_dir_foreach(dir)
                }
                .or_else(|e| {
                    Err(Error {
                        kind: ErrorKind::ConfigIllegal,
                        inner: Some(Box::new(e)),
                        message: Some(String::from("read input dir failed")),
                    })
                })
            };
            if let Some(input_list) = &order.input_list_from_args {
                let input_list: Vec<PathBuf> = input_list.iter().map(PathBuf::from).collect();
                for entry in input_list {
                    if entry.is_dir() {
                        input_files.append(&mut read_dir(entry)?);
                    } else {
                        input_files.push(entry);
                    }
                }
            } else if let Some(input_dir) = &order.input_dir_path {
                let input_dir = PathBuf::from(input_dir);
                input_files.append(&mut read_dir(input_dir)?);
            }

            let mut tasks = Vec::new();
            let args_template = split_args(order.args_template.as_ref().unwrap())?;
            let args_switches = split_args(order.args_switches.as_ref().unwrap())?;
            for input_file_path in input_files {
                let mut target_dir_path = input_file_path.parent().unwrap().to_path_buf(); // Performance?
                if let Some(output_dir_path) = &order.output_dir_path {
                    target_dir_path = PathBuf::from(output_dir_path);
                }
                let mut file_name = input_file_path
                    .file_stem()
                    .ok_or(Err(()))
                    .or_else(|_: Result<(), ()>| {
                        Err(Error {
                            kind: ErrorKind::ConfigIllegal,
                            inner: None,
                            message: Some(format!(
                                "input file have not stem name, path = {}",
                                input_file_path.to_str().unwrap()
                            )),
                        })
                    })?
                    .to_str()
                    .unwrap()
                    .to_string();
                let mut relative_path = PathBuf::from(&file_name);
                if let Some(input_dir_path) = &order.input_dir_path {
                    relative_path = input_file_path
                        .strip_prefix(input_dir_path)
                        .or_else(|e| {
                            Err(Error {
                                kind: ErrorKind::ConfigIllegal,
                                inner: Some(Box::new(e)),
                                message: Some(format!(
                                    "strip path prefix failed, path = {}",
                                    input_file_path.to_str().unwrap()
                                )),
                            })
                        })?
                        .to_path_buf();
                }
                if let Some(prefix) = &order.output_file_name_prefix {
                    file_name.insert_str(0, &prefix);
                }
                if let Some(suffix) = &order.output_file_name_suffix {
                    file_name.push_str(&suffix);
                }
                relative_path.set_file_name(file_name);
                if let Some(extension) = &order.output_file_name_extension {
                    relative_path.set_extension(extension);
                } else if let Some(extension) = input_file_path.extension() {
                    relative_path.set_extension(extension);
                }
                // Print tips for overriding?
                let output_file_path = target_dir_path.join(relative_path);

                for index in 0..order.repeat_count.unwrap() {
                    let mut args = Vec::new();
                    for item in &args_template {
                        match item.as_str() {
                            "{args.switches}" => args.append(&mut args_switches.clone()),
                            "{input.file_path}" => {
                                args.push(input_file_path.to_str().unwrap().to_string())
                            }
                            "{input.file_extension}" => args.push(
                                input_file_path
                                    .extension()
                                    .ok_or(Err(()))
                                    .or_else(|_: Result<(), ()>| {
                                        Err(Error {
                                            kind: ErrorKind::ConfigIllegal,
                                            inner: None,
                                            message: Some(format!(
                                                "input file has no extension name, path = {}",
                                                input_file_path.to_str().unwrap()
                                            )),
                                        })
                                    })?
                                    .to_str()
                                    .unwrap()
                                    .to_string(),
                            ),
                            "{output.file_path}" => {
                                args.push(output_file_path.to_str().unwrap().to_string())
                            }
                            "{output.dir_path}" => args.push(
                                output_file_path
                                    .parent()
                                    .unwrap()
                                    .to_str()
                                    .unwrap()
                                    .to_string(),
                            ),
                            "{repeat.index}" => args.push(index.to_string()),
                            "{repeat.position}" => args.push((index + 1).to_string()),
                            _ => args.push(item.to_string()),
                        };
                    }
                    tasks.push(Task {
                        program: order.program.as_ref().unwrap().clone(),
                        args,
                    });
                }
            }

            orders.push(Order {
                threads_count: order.threads_count.unwrap(),
                print_progress_msg: order.show_progress.unwrap(),
                stdout: match order.stdout_type.as_ref().unwrap().as_str() {
                    "normal" => OrderStdio::Normal,
                    "ignore" => OrderStdio::Ignore,
                    "file" => OrderStdio::ToFile(
                        fs::OpenOptions::new()
                            .write(true)
                            .append(true)
                            .create(true)
                            .open(order.stdout_file_path.as_ref().ok_or(Err(())).or_else(
                                |_: Result<(), ()>| {
                                    Err(Error {
                                        kind: ErrorKind::ConfigIllegal,
                                        inner: None,
                                        message: Some(String::from(
                                            "stdout log file path not specified",
                                        )),
                                    })
                                },
                            )?)
                            .or_else(|e| {
                                Err(Error {
                                    kind: ErrorKind::CanNotWriteLogFile,
                                    inner: Some(Box::new(e)),
                                    message: None,
                                })
                            })?,
                    ),
                    _ => {
                        return Err(Error {
                            kind: ErrorKind::ConfigIllegal,
                            inner: None,
                            message: Some(String::from("unknown stdout type")),
                        });
                    }
                },
                stderr: match order.stderr_type.as_ref().unwrap().as_str() {
                    "normal" => OrderStdio::Normal,
                    "ignore" => OrderStdio::Ignore,
                    "file" => OrderStdio::ToFile(
                        fs::OpenOptions::new()
                            .write(true)
                            .append(true)
                            .create(true)
                            .open(order.stderr_file_path.as_ref().ok_or(Err(())).or_else(
                                |_: Result<(), ()>| {
                                    Err(Error {
                                        kind: ErrorKind::ConfigIllegal,
                                        inner: None,
                                        message: Some(String::from(
                                            "stderr log file path not specified",
                                        )),
                                    })
                                },
                            )?)
                            .or_else(|e| {
                                Err(Error {
                                    kind: ErrorKind::CanNotWriteLogFile,
                                    inner: Some(Box::new(e)),
                                    message: None,
                                })
                            })?,
                    ),
                    _ => {
                        return Err(Error {
                            kind: ErrorKind::ConfigIllegal,
                            inner: None,
                            message: Some(String::from("unknown stderr type")),
                        });
                    }
                },
                tasks,
                current_commands_iter: None,
                current_processes: None,
            });
        }
        Ok(Foundry { orders })
    }

    pub fn start(&mut self) -> Result<(), Error> {
        for order in &mut self.orders {
            order.execute().or_else(|e| {
                Err(Error {
                    kind: ErrorKind::ExecutePanic,
                    inner: Some(Box::new(e)),
                    message: Some(String::from("execute order failed")),
                })
            })?;
        }
        Ok(())
    }

    pub fn _stop(&mut self) -> Result<(), Error> {
        for order in &mut self.orders {
            order.stop().or_else(|e| {
                Err(Error {
                    kind: ErrorKind::ExecutePanic,
                    inner: Some(Box::new(e)),
                    message: Some(String::from("stop order failed")),
                })
            })?;
        }
        Ok(())
    }
}

pub fn run() -> Result<(), Error> {
    Foundry::new(Config::new()?)?.start()
    // Foundry::new(Config::_from_toml_test()?)?.start()
}
