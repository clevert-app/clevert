pub mod config;
pub mod cui;
use config::Config;
use cui::print_log;
use shared_child::SharedChild;
use std::collections::HashMap;
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
use std::slice::Iter;
use std::sync::mpsc;
use std::sync::Arc;
use std::sync::Mutex;
use std::thread;
use std::time::Duration;
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
        let mut content = match self.kind {
            ConfigTomlIllegal => "config is not a legal toml document",
            ConfigIllegal => "config is illegal",
            ConfigFileCanNotRead => "read config file failed",
            CanNotWriteLogFile => "write log file failed",
            ExecutePanic => "task process panic",
        }
        .to_string();
        if let Some(ref message) = self.message {
            content += &format!(", message = {}", message);
        }
        if let Some(ref inner) = self.inner {
            content += &format!(", error = {}", inner);
        }
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

enum TaskStdio {
    Normal,
    Ignore,
    File(File),
}

struct Task2 {
    program: String,
    args: Vec<String>,
    stdout: TaskStdio,
    stderr: TaskStdio,
}

impl Task2 {
    fn spawn(&self) -> io::Result<SharedChild> {
        let mut command = Command::new(&self.program);
        command.args(&self.args);
        SharedChild::spawn(&mut command)
    }
}

struct Order2<'a> {
    threads_count: u32,
    tasks: Vec<Task>,
    iter: Arc<Mutex<Iter<'a, Task>>>,
    threads: Arc<Mutex<Vec<thread::JoinHandle<Result<(), io::Error>>>>>,
    childs: Arc<Mutex<Vec<Option<SharedChild>>>>,
}

impl Order2<'_> {
    pub fn new(threads_count: u32, tasks: Vec<Task>) -> Self {
        Self {
            threads_count,
            tasks,
            iter: Arc::new(Mutex::new(tasks.iter())),
            threads: Arc::new(Mutex::new(Vec::new())),
            childs: Arc::new(Mutex::new(Vec::new())),
        }
    }
    fn start(&mut self) {
        // self.
        // let a =self.tasks.iter();
        // std::vec::Drain
        // let mut commands = self.commands.lock().unwrap();
        // commands.clear();
        // commands.append(&mut self.prepare());
        // let mut threads = self.threads.lock().unwrap();
        // threads.clear();
        // for i in 0..self.threads_count {
        //     // let thread = self.spawn(i.try_into().unwrap());
        //     // threads.push(thread);
        // }
    }

    // fn spawn(&mut self, index: usize) -> thread::JoinHandle<Result<(), io::Error>> {
    //     let commands_mutex = Arc::clone(&self.commands);
    //     let threads_mutex = Arc::clone(&self.threads);
    //     let childs_mutex = Arc::clone(&self.childs);
    //     thread::spawn(move || {
    //         while let Some(mut command) = {
    //             let mut commands = commands_mutex.lock().unwrap();
    //             commands.pop() // reverse?
    //         } {
    //             let child = Some(SharedChild::spawn(&mut command)?);

    //             let mut childs = childs_mutex.lock().unwrap();
    //             childs[index] = child;
    //             drop(childs);

    //             // child.as_ref().as_ref().unwrap().wait()?;
    //             // Some().
    //             // child
    //             // let mut status = status_mutex.lock().unwrap();
    //             // let s = status.childs[index].take();
    //             // drop(status);
    //         }
    //         Ok(())
    //     })
    // }
}
enum OrderStdio {
    Normal,
    Ignore,
    ToFile(File),
}

struct OrderStatus {
    commands: IntoIter<Command>,
    threads: Vec<thread::JoinHandle<Result<(), io::Error>>>,
}

struct Order {
    threads_count: i32,
    print_progress_msg: bool,
    stdout: OrderStdio,
    stderr: OrderStdio,
    tasks: Vec<Task>,
    status: Option<Arc<Mutex<OrderStatus>>>,
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

    fn calc_progress(status_mutex: &Arc<Mutex<OrderStatus>>, amount: usize) -> (i32, i32, f64) {
        let status = status_mutex.lock().unwrap();

        let remain = status.commands.len();
        let remain: i32 = remain.try_into().unwrap();
        let remain_f64: f64 = remain.into();

        let amount: i32 = amount.try_into().unwrap();
        let amount_f64: f64 = amount.into();

        let completed = amount - remain;
        let completed_f64: f64 = completed.into();

        let proportion = completed_f64 / amount_f64;
        (completed, amount, proportion)
    }

    /// Returns execute progress.
    ///
    /// # Examples
    ///
    /// ```
    /// let (completed, amount, proportion) = self.progress();
    /// println!(
    ///     "completed = {}, amount = {}, proportion = {}",
    ///     completed, amount, proportion
    /// );
    /// ```
    fn _progress(&self) -> (i32, i32, f64) {
        let mutex = Arc::clone(self.status.as_ref().unwrap());
        let amount = self.tasks.len();
        Order::calc_progress(&mutex, amount)
    }

    fn start(&mut self) -> Result<(), io::Error> {
        self.status = Some(Arc::new(Mutex::new(OrderStatus {
            commands: self.prepare().into_iter(),
            threads: Vec::new(),
        })));
        let status_mutex = Arc::clone(self.status.as_ref().unwrap());
        let mut status = status_mutex.lock().unwrap();
        for _ in 0..self.threads_count {
            let handle = self.spawn();
            status.threads.push(handle);
        }
        drop(status);
        if self.print_progress_msg {
            let mutex = Arc::clone(self.status.as_ref().unwrap());
            let amount = self.tasks.len();
            thread::spawn(move || loop {
                let (completed, amount, proportion) = Order::calc_progress(&mutex, amount);
                print_log::info(format!(
                    "current order progress: {} / {} tasks ({:.0}%)",
                    completed,
                    amount,
                    proportion * 100.0
                ));
                if proportion == 1.0 {
                    break;
                }
                thread::sleep(Duration::from_secs(1));
            });
        }
        Ok(())
    }

    fn wait(&mut self) -> Result<(), io::Error> {
        let status_mutex = Arc::clone(self.status.as_ref().unwrap());
        let mut status = status_mutex.lock().unwrap();
        let mut threads = Vec::new();
        threads.append(&mut status.threads);
        drop(status);
        for handle in threads {
            handle.join().unwrap()?;
        }
        self.terminate()?;
        Ok(())
    }

    fn rest(&mut self) -> Result<(), io::Error> {
        Ok(())
    }

    fn recess(&mut self) -> Result<(), io::Error> {
        Ok(())
    }

    fn pause(&mut self) -> Result<(), io::Error> {
        Ok(())
    }

    fn stop(&mut self, kill_processes: bool) -> Result<(), io::Error> {
        // let status_mutex = Arc::clone(self.status.as_ref().unwrap());
        // let mut status = status_mutex.lock().unwrap();
        // if kill_processes {
        //     for child in &mut status.processes {
        //         let _ = child.kill();
        //         match child.try_wait()? {
        //             Some(_) => {} // already exited
        //             None => {
        //                 child.kill()?;
        //             }
        //         }
        //     }
        // }
        // if let OrderStdio::ToFile(ref mut file) = self.stdout {
        //     for child in &mut status.processes {
        //         let mut stdout = Vec::new();
        //         child.stdout.as_mut().unwrap().read_to_end(&mut stdout)?;
        //         file.write_all(&stdout)?;
        //     }
        // }
        // if let OrderStdio::ToFile(ref mut file) = self.stderr {
        //     for child in &mut status.processes {
        //         let mut stderr = Vec::new();
        //         child.stderr.as_mut().unwrap().read_to_end(&mut stderr)?;
        //         file.write_all(&stderr)?;
        //     }
        // }
        // self.status = None;
        Ok(())
    }

    fn cease(&mut self) -> Result<(), io::Error> {
        self.stop(false)
    }

    fn terminate(&mut self) -> Result<(), io::Error> {
        self.stop(true)
    }

    fn spawn(&mut self) -> thread::JoinHandle<Result<(), io::Error>> {
        let status_mutex = Arc::clone(self.status.as_ref().unwrap());
        thread::spawn(move || {
            while let Some(mut command) = {
                let mut status = status_mutex.lock().unwrap();
                status.commands.next()
            } {
                let child = Arc::new(SharedChild::spawn(&mut command)?);
                let monitor = thread::spawn({
                    let child = Arc::clone(&child);
                    move || {
                        thread::sleep(std::time::Duration::from_secs(2));
                        child.kill()
                    }
                });
                child.as_ref().wait()?;
                monitor.join().unwrap()?;
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
            let mut input_files = Vec::new();
            if let Some(ref input_list) = order.input_list {
                let input_list: Vec<PathBuf> = input_list.iter().map(PathBuf::from).collect();
                for entry in input_list {
                    if entry.is_dir() {
                        input_files.append(&mut read_dir(entry)?);
                    } else {
                        input_files.push(entry);
                    }
                }
            } else if let Some(ref input_dir) = order.input_dir_path {
                let input_dir = PathBuf::from(input_dir);
                input_files.append(&mut read_dir(input_dir)?);
            }
            let mut tasks = Vec::new();
            let args_template = split_args(order.args_template.as_ref().unwrap())?;
            let args_switches = split_args(order.args_switches.as_ref().unwrap())?;
            for input_file_path in input_files {
                let output_file_path = if let Some(ref output_file_path) = order.output_file_path {
                    PathBuf::from(output_file_path)
                } else {
                    let target_dir_path = match order.output_dir_path {
                        Some(ref path) => PathBuf::from(path),
                        None => input_file_path.parent().unwrap().to_path_buf(),
                    };
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
                    let mut relative_path = match order.input_dir_path {
                        Some(ref input_dir_path) => input_file_path
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
                            .to_path_buf(),
                        None => PathBuf::from(&file_name),
                    };
                    if let Some(ref prefix) = order.output_file_name_prefix {
                        file_name.insert_str(0, &prefix);
                    }
                    if let Some(ref suffix) = order.output_file_name_suffix {
                        file_name.push_str(&suffix);
                    }
                    relative_path.set_file_name(file_name);
                    if let Some(ref extension) = order.output_file_name_extension {
                        relative_path.set_extension(extension);
                    } else if let Some(extension) = input_file_path.extension() {
                        relative_path.set_extension(extension);
                    }
                    let output_file_path = target_dir_path.join(relative_path);
                    if !order.output_file_overwrite.unwrap()
                        && fs::metadata(&output_file_path).is_ok()
                    {
                        // Unable to detect overwriting during executing!
                        return Err(Error {
                            kind: ErrorKind::ConfigIllegal,
                            inner: None,
                            message: Some(format!(
                                "output target is already exists, path = {}",
                                output_file_path.to_str().unwrap()
                            )),
                        });
                    }
                    output_file_path
                };

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

            if tasks.is_empty() {
                return Err(Error {
                    kind: ErrorKind::ConfigIllegal,
                    inner: None,
                    message: Some(String::from("current order generated no task")),
                    // message: Some(format!("order[{}] generated no task", order_index)),
                });
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
                status: None,
            });
        }
        Ok(Foundry { orders })
    }

    pub fn start(&mut self) -> Result<(), Error> {
        for order in &mut self.orders {
            order.start().or_else(|e| {
                Err(Error {
                    kind: ErrorKind::ExecutePanic,
                    inner: Some(Box::new(e)),
                    message: Some(String::from("execute order failed")),
                })
            })?;
        }
        Ok(())
    }

    /// Returns execute progress.
    ///
    /// # Examples
    ///
    /// ```
    /// let (completed, amount, proportion) = self.progress();
    /// println!(
    ///     "completed = {}, amount = {}, proportion = {}",
    ///     completed, amount, proportion
    /// );
    /// ```
    // pub fn progress(&self) -> Result<(i32, i32, f64), Error> {
    //     let mut completed = 0;
    //     let mut amount = 0;
    //     let mut proportion = 0.0;
    //     for order in &self.orders {
    //         let (cur_completed, cur_amount, cur_proportion) = order.progress();
    //         completed += cur_completed;
    //         amount += cur_amount;
    //         proportion += cur_proportion;
    //     }
    //     Ok((completed, amount, proportion))
    // }

    pub fn wait(&mut self) -> Result<(), Error> {
        for order in &mut self.orders {
            order.wait().or_else(|e| {
                Err(Error {
                    kind: ErrorKind::ExecutePanic,
                    inner: Some(Box::new(e)),
                    message: Some(String::from("wait order failed")),
                })
            })?;
        }
        Ok(())
    }

    pub fn recess(&mut self) -> Result<(), Error> {
        for order in &mut self.orders {
            order.recess().or_else(|e| {
                Err(Error {
                    kind: ErrorKind::ExecutePanic,
                    inner: Some(Box::new(e)),
                    message: Some(String::from("recess order failed")),
                })
            })?;
        }
        Ok(())
    }

    pub fn pause(&mut self) -> Result<(), Error> {
        for order in &mut self.orders {
            order.pause().or_else(|e| {
                Err(Error {
                    kind: ErrorKind::ExecutePanic,
                    inner: Some(Box::new(e)),
                    message: Some(String::from("pause order failed")),
                })
            })?;
        }
        Ok(())
    }

    pub fn cease(&mut self) -> Result<(), Error> {
        for order in &mut self.orders {
            order.cease().or_else(|e| {
                Err(Error {
                    kind: ErrorKind::ExecutePanic,
                    inner: Some(Box::new(e)),
                    message: Some(String::from("cease order failed")),
                })
            })?;
        }
        Ok(())
    }

    pub fn terminate(&mut self) -> Result<(), Error> {
        for order in &mut self.orders {
            order.terminate().or_else(|e| {
                Err(Error {
                    kind: ErrorKind::ExecutePanic,
                    inner: Some(Box::new(e)),
                    message: Some(String::from("terminate order failed")),
                })
            })?;
        }
        Ok(())
    }
}

pub fn run() -> Result<(), Error> {
    // let mut foundry = Foundry::new(Config::new()?)?;
    let mut foundry = Foundry::new(Config::_from_toml_test()?)?;
    foundry.start()?;
    foundry.wait()?;
    // let foundry = Arc::new(Mutex::new(foundry));
    // thread::spawn((|| {
    //     let foundry = Arc::clone(&foundry);
    //     move || {
    //         foundry.lock().unwrap().start().unwrap();
    //     }
    // })());
    // thread::sleep(Duration::from_secs(2));
    // thread::spawn((|| {
    //     let foundry = Arc::clone(&foundry);
    //     move || {
    //         foundry.lock().unwrap().terminate().unwrap();
    //     }
    // })());
    Ok(())
}
