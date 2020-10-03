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
        use ErrorKind::*;
        let mut content = match self.kind {
            ConfigTomlIllegal => "config is not a legal toml document",
            ConfigIllegal => "config is illegal",
            ConfigFileCanNotRead => "read config file failed",
            CanNotWriteLogFile => "write log file failed",
            ExecutePanic => "task process panic",
        }
        .to_string();
        if let Some(message) = &self.message {
            content += &format!(", message = {}", message);
        }
        if let Some(inner) = &self.inner {
            content += &format!(", error = {}", inner);
        }
        f.write_str(&content)
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
}

struct FoundryStatus {
    orders: IntoIter<Order>,
    orders_count: usize,
    current_order: Option<Arc<Order>>,
    wait_cvar: Arc<Condvar>,
    running: bool,
}

struct Foundry {
    status: Arc<Mutex<FoundryStatus>>,
}

impl Foundry {
    fn get_status(&self) -> MutexGuard<FoundryStatus> {
        self.status.lock().unwrap()
    }

    fn from_orders(orders: Vec<Order>) -> Self {
        Self {
            status: Arc::new(Mutex::new(FoundryStatus {
                orders_count: orders.len(),
                orders: orders.into_iter(),
                current_order: None,
                wait_cvar: Arc::new(Condvar::new()),
                running: false,
            })),
        }
    }

    fn new(cfg: &Config) -> Result<Self, Error> {
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
            if let Some(input_list) = &order.input_list {
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

            let mut commands = Vec::new();
            let args_template = split_args(order.args_template.as_ref().unwrap())?;
            let args_switches = split_args(order.args_switches.as_ref().unwrap())?;
            for input_file_path in input_files {
                let output_file_path = if let Some(output_file_path) = &order.output_file_path {
                    PathBuf::from(output_file_path)
                } else {
                    let target_dir_path = match &order.output_dir_path {
                        Some(path) => PathBuf::from(path),
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
                    let mut relative_path = match &order.input_dir_path {
                        Some(input_dir_path) => input_file_path
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
                    commands.push({
                        let mut command = Command::new(order.program.as_ref().unwrap());
                        command.args(args);
                        command
                    });
                }
            }

            if commands.is_empty() {
                return Err(Error {
                    kind: ErrorKind::ConfigIllegal,
                    inner: None,
                    message: Some(String::from("current order generated no task")),
                    // message: Some(format!("order[{}] generated no task", order_index)),
                });
            }

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

            orders.push(Order {
                threads_count: order.threads_count.unwrap().try_into().unwrap(),
                commands_count: commands.len(),
                stdout: std_pipe("stdout", &order.stdout_type, &order.stdout_file_path)?,
                stderr: std_pipe("stderr", &order.stderr_type, &order.stderr_file_path)?,
                status: Arc::new(Mutex::new(OrderStatus::from_commands(commands))),
            });
        }
        Ok(Self::from_orders(orders))
    }

    fn start(&self) {
        {
            let mut status = self.get_status();
            assert!(status.running == false);
            status.running = true;
        }
        let status_mutex = Arc::clone(&self.status);
        thread::spawn(move || {
            let get_status = || status_mutex.lock().unwrap();
            while let Some(order) = {
                let mut status = get_status();
                status.orders.next()
            } {
                let order = Arc::new(order);
                let mut status = get_status();
                status.current_order = Some(Arc::clone(&order));
                drop(status);
                order.start();
                order.wait();
            }
            let mut status = get_status();
            status.current_order = None;
            status.running = false;
            status.wait_cvar.notify_one();
        });
    }

    /// Return the progress of foundry as `((order_finished, order_total), (finished, total))`.
    fn progress(&self) -> ((usize, usize), (usize, usize)) {
        let status = self.get_status();
        let order_progress = if let Some(order) = &status.current_order {
            order.progress()
        } else {
            (0, 0)
        };
        let total = status.orders_count;
        let finished = total - status.orders.size_hint().0 - 1; // TODO: Bug Fix: Num Overflow???
        (order_progress, (finished, total))
    }

    fn wait(&self) {
        let status = self.get_status();
        let cvar = Arc::clone(&status.wait_cvar);
        let _ = cvar.wait_while(status, |s| s.running).unwrap();
    }

    fn terminate(&self) {
        let mut status = self.get_status();
        status.orders.nth(std::usize::MAX);
        let order = status.current_order.as_ref().unwrap();
        order.terminate();
    }
}

pub fn run() -> Result<(), Error> {
    // Foundry is one-off, Config is not one-off, change Config from gui and then new a Foundry.
    let cfg = Config::_from_toml_test()?;
    // let cfg = Config::new()?;
    let foundry = Arc::new(Foundry::new(&cfg)?);
    foundry.start();
    thread::spawn((|| {
        let foundry = Arc::clone(&foundry);
        move || loop {
            let mut user_input = String::new();
            io::stdin()
                .read_line(&mut user_input)
                .expect("Failed to read line");
            match user_input.trim() {
                "t" => {
                    cui::print_log::info("user terminate the foundry");
                    foundry.terminate();
                }
                _ => {
                    cui::print_log::info("unknown op");
                }
            }
        }
    })());
    thread::spawn((|| {
        let foundry = Arc::clone(&foundry);
        move || loop {
            let ((o_finished, o_total), (f_finished, f_total)) = foundry.progress();
            cui::print_log::info(format!(
                "current order: {} / {} | foundry: {} / {}",
                o_finished, o_total, f_finished, f_total
            ));
            thread::sleep(std::time::Duration::from_secs(1));
        }
    })());
    foundry.wait();
    Ok(())
}
