pub mod cui;
mod task_types;
mod toml_helper;
use cui::print_log;
use std::convert::TryInto;
use std::env;
use std::fs;
use std::fs::File;
use std::io;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::vec::IntoIter;
use std::{thread, time};
use toml::Value;
use toml_helper::Seek;

pub fn run() -> Result<(), String> {
    Foundry::new()?.start()
}

impl Foundry {
    fn from_config_file(config_file_path: PathBuf) -> Result<Foundry, String> {
        let config_str = fs::read_to_string(config_file_path)
            .or_else(|e| Err(format!("open config file failed, error = `{}`", e)))?;
        Foundry::from_config_str(config_str)
    }

    fn from_local_config_file() -> Result<Foundry, String> {
        let mut config_file_path = env::current_exe().unwrap();
        config_file_path.set_extension("toml");
        Foundry::from_config_file(config_file_path)
    }

    fn _from_test_config_str() -> Result<Foundry, String> {
        let test_config_str = r#"

            [presets.default]
            threads.count = 1
            threads.priority = 'normal' # TODO: priority, may windows only?
            console.msg.default = true # TODO
            console.msg.info = true # TODO
            console.msg.progress = true
            console.msg.error = true # TODO
            console.stdout.type = 'ignore' # ignore | normal | file
            console.stderr.type = 'ignore'
            console.stderr.file = './stderr.log' # TODO: log file

            [presets.cwebp]
            type = 'file-process.from-folder'
            program = 'cwebp.exe'
            args.template = '{switches} {input.file_path} -o {output.file_path}' # TODO: trope "{{" to real "{"
            args.switches = '-m 6'
            input.folder = ''
            output.folder = ''
            output.file_name.extension = 'webp'

            [presets.cwebp_lossless]
            preset = 'cwebp'
            args.switches = '-lossless -m 6 -noalpha -sharp_yuv -metadata none'

            [[tasks]]
            preset = 'cwebp_lossless'
            program = 'D:\Library\libwebp\libwebp_1.0.0\bin\1cwebp.exe'
            input.folder = 'D:\Temp\foundry_test\source'
            output.folder = 'D:\Temp\foundry_test\target'
            output.file_name.prefix = 'out_'
            output.file_name.suffix = '_out'

        "#.to_string();
        Foundry::from_config_str(test_config_str)
    }

    fn from_config_str(cfg_str: String) -> Result<Foundry, String> {
        let e_msg = |content| format!("load config failed: {}", content);
        let cfg: Value = cfg_str.parse().or_else(|e| {
            Err(e_msg(format!(
                "not a standard toml document, error = `{}`",
                e
            )))
        })?;
        Foundry::load_config_str(cfg).or_else(|e| Err(e_msg(e)))
    }

    fn load_config_str(cfg: Value) -> Result<Foundry, String> {
        let presets = cfg.seek("presets")?;
        let mut tasks = Vec::new();
        for task_cfg in cfg.seek_array("tasks")? {
            fn fill_vacancy(src: &mut Value, default: &Value) -> Option<()> {
                let src_table = src.as_table_mut()?;
                for (key, value) in default.as_table()? {
                    if let Some(child_src) = src_table.get_mut(key) {
                        fill_vacancy(child_src, value);
                    } else {
                        src_table.entry(key).or_insert(value.clone());
                    }
                }
                Some(())
            }

            fn inherit_fill(
                src: &mut Value,
                presets: &Value,
                preset_name: &str,
                stack_deep: i32,
            ) -> Result<(), String> {
                if stack_deep > 64 {
                    return Err("preset reference depth must small than 64".into());
                }
                let preset = presets.seek(preset_name)?;
                fill_vacancy(src, preset);
                if let Ok(parent_preset_name) = preset.seek_str("preset") {
                    inherit_fill(src, presets, parent_preset_name, stack_deep + 1)?;
                }
                Ok(())
            }

            let task_cfg = &mut task_cfg.clone();
            if let Ok(preset_name) = task_cfg.seek_str("preset") {
                let preset_name = preset_name.to_string();
                inherit_fill(task_cfg, presets, &preset_name, 0)?;
            }
            fill_vacancy(task_cfg, presets.seek("default")?);

            let commands = {
                use task_types::*;
                match task_cfg.seek_str("type")? {
                    "file-process.from-folder" => file_process::from_folder(task_cfg)?,
                    // "file-process.process-args" => file_process::from_process_args(task_cfg)?,
                    _ => return Err("unknown task type".into()),
                }
            };

            if commands.is_empty() {
                continue;
            }

            let console_cfg = task_cfg.seek("console")?;
            let msg_cfg = console_cfg.seek("msg")?;
            let stdout_cfg = console_cfg.seek("stdout")?;
            let stderr_cfg = console_cfg.seek("stderr")?;
            let threads_cfg = task_cfg.seek("threads")?;
            // let threads_priority = threads_cfg.seek_as_str("priority")?; // unable to cross platform?

            tasks.push(Order {
                threads_count: threads_cfg.seek_i32("count")?,
                print_progress_msg: msg_cfg.seek_bool("progress")?,
                commands,
                stdout: match stdout_cfg.seek_str("type")? {
                    "normal" => OrderStdio::Normal,
                    "ignore" => OrderStdio::Ignore,
                    "file" => return Err("log file io function is still developing".into()),
                    // let path_str = stdout_cfg.get("file")?.as_str()?;
                    // let mut file = File::open(path_str).unwrap();
                    // AutoCommanderTaskStdIo::File(file)
                    _ => return Err("unknown stdout type".into()),
                },
                stderr: match stderr_cfg.seek_str("type")? {
                    "normal" => OrderStdio::Normal,
                    "ignore" => OrderStdio::Ignore,
                    "file" => return Err("log file io function is still developing".into()),
                    _ => return Err("unknown stderr type".into()),
                },
            });
        }

        if tasks.is_empty() {
            return Err("tasks' count is less than 1".into());
        }

        Ok(Foundry { tasks })
    }
}

struct Foundry {
    tasks: Vec<Order>,
}

impl Foundry {
    fn new() -> Result<Foundry, String> {
        Foundry::from_local_config_file()
        // AutoCommander::_from_test_config_str()
    }

    fn start(&self) -> Result<(), String> {
        for task in &self.tasks {
            task.execute()?;
        }
        Ok(())
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
    commands: Vec<OrderItem>,
    stdout: OrderStdio,
    stderr: OrderStdio,
}

impl Order {
    fn execute(&self) -> Result<(), String> {
        let commands = self.prepare();
        let iter = commands.into_iter();
        let iter_mutex = Arc::new(Mutex::new(iter));
        if self.print_progress_msg {
            let commands_count: i32 = self.commands.len().try_into().unwrap();
            let commands_count: f64 = commands_count.into();
            let iter_mutex = Arc::clone(&iter_mutex);
            thread::spawn(move || loop {
                let remaining = {
                    let iter = iter_mutex.lock().unwrap();
                    iter.size_hint().0
                };
                if remaining == 0 {
                    break;
                }
                let remaining: i32 = remaining.try_into().unwrap();
                let remaining: f64 = remaining.into();
                let completed_count = commands_count - remaining;
                print_log::info(format!(
                    "progress: {} / {} ({:.0}%)",
                    completed_count,
                    commands_count,
                    completed_count / commands_count * 100.0
                ));
                thread::sleep(time::Duration::from_secs(1));
            });
        }
        let mut handles = Vec::new();
        for _ in 0..self.threads_count {
            let iter_mutex = Arc::clone(&iter_mutex);
            let handle = Order::spawn(iter_mutex);
            handles.push(handle);
        }
        for handle in handles {
            handle
                .join()
                .unwrap()
                .or_else(|e| Err(format!("a thread panic, error = `{}`", e)))?;
        }
        Ok(())
    }

    fn prepare(&self) -> Vec<Command> {
        let mut commands = Vec::new();
        for auto_command in &self.commands {
            let mut command = auto_command.generate();
            {
                use OrderStdio::*;
                match &self.stdout {
                    Normal => {}
                    Ignore => {
                        command.stdout(Stdio::null());
                    }
                    ToFile(_file) => {
                        // let file = File::open("foo.txt").unwrap();
                        // command.stdout(file);
                    }
                };
                match &self.stderr {
                    Normal => {}
                    Ignore => {
                        command.stderr(Stdio::null());
                    }
                    ToFile(_file) => {
                        // command.stdout(stdio);
                    }
                };
            }
            commands.push(command);
        }
        commands
    }

    fn spawn(
        iter_mutex: Arc<Mutex<IntoIter<Command>>>,
    ) -> thread::JoinHandle<Result<(), io::Error>> {
        thread::spawn(move || -> Result<(), io::Error> {
            while let Some(mut command) = {
                let mut iter = iter_mutex.lock().unwrap();
                iter.next()
            } {
                command.spawn()?.wait()?;
            }
            Ok(())
        })
    }
}

pub struct OrderItem {
    program: String,
    args: Vec<String>,
}

impl OrderItem {
    fn generate(&self) -> Command {
        let mut command = Command::new(&self.program);
        command.args(&self.args);
        command
    }
}
