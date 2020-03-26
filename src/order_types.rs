use crate::toml_helper::Seek;
use crate::Task;
use std::env;
use std::fs;
use std::io;
use std::path::PathBuf;
use toml::Value;

pub mod file_processing {
    use super::*;

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

    fn from_files_list(order_cfg: &Value, input_files: Vec<PathBuf>) -> Result<Vec<Task>, String> {
        let input_cfg = order_cfg.seek("input")?;
        let output_cfg = order_cfg.seek("output")?;
        let output_file_name_cfg = output_cfg.seek("file_name")?;
        let generate_output_path = |input_file_path: &PathBuf| -> Result<PathBuf, String> {
            // Default output to source dir
            let mut target_dir_path = input_file_path.parent().unwrap().to_path_buf(); // performance?
            if let Ok(output_dir_cfg) = output_cfg.seek("dir") {
                if let Ok(output_dir_path) = output_dir_cfg.seek_str("path") {
                    target_dir_path = PathBuf::from(output_dir_path);
                }
            }
            let mut file_name = input_file_path
                .file_stem()
                .ok_or("input file has no stem name")?
                .to_str()
                .unwrap()
                .to_string();
            let mut relative_path = PathBuf::from(&file_name);
            if let Ok(input_dir_cfg) = input_cfg.seek("dir") {
                if let Ok(input_dir_path) = input_dir_cfg.seek_str("path") {
                    relative_path = input_file_path
                        .strip_prefix(input_dir_path)
                        .or_else(|e| Err(format!("{}", e)))?
                        .to_path_buf();
                }
            }
            if let Ok(prefix) = output_file_name_cfg.seek_str("prefix") {
                file_name.insert_str(0, prefix);
            }
            if let Ok(suffix) = output_file_name_cfg.seek_str("suffix") {
                file_name.push_str(suffix);
            }
            relative_path.set_file_name(file_name);
            if let Ok(extension) = output_file_name_cfg.seek_str("extension") {
                relative_path.set_extension(extension);
            } else if let Some(extension) = input_file_path.extension() {
                relative_path.set_extension(extension);
            }
            // Print tips for overriding?
            Ok(target_dir_path.join(relative_path))
        };

        let program = order_cfg.seek_str("program")?;
        let args_cfg = order_cfg.seek("args")?;
        let args_template = split_args(args_cfg.seek_str("template")?)?;
        let args_switches = split_args(args_cfg.seek_str("switches")?)?;
        let mut tasks = Vec::new();
        for file_path in input_files {
            let output_file_path = generate_output_path(&file_path)?;
            let mut args = Vec::new();
            for item in &args_template {
                match item.as_str() {
                    "{switches}" => args.append(&mut args_switches.clone()),
                    "{input.file_path}" => args.push(file_path.to_str().unwrap().to_string()),
                    "{input.file_extension}" => args.push(
                        file_path
                            .extension()
                            .ok_or("input file has no extension")?
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
                    _ => args.push(item.to_string()),
                };
            }
            tasks.push(Task {
                program: program.to_string(),
                args,
            });
        }
        Ok(tasks)
    }

    pub fn from_dir(order_cfg: &Value) -> Result<Vec<Task>, String> {
        let input_dir_cfg = order_cfg.seek("input")?.seek("dir")?;
        let input_dir = PathBuf::from(input_dir_cfg.seek_str("path")?);
        let input_files = if input_dir_cfg.seek_bool("deep")? {
            read_dir_recurse(input_dir)
        } else {
            read_dir_foreach(input_dir)
        }
        .or_else(|e| Err(format!("{}", e)))?;
        from_files_list(order_cfg, input_files)
    }

    pub fn from_args(order_cfg: &Value) -> Result<Vec<Task>, String> {
        let input_dir_deep = order_cfg.seek("input")?.seek("dir")?.seek_bool("deep")?;
        let process_args: Vec<String> = env::args().collect();
        let input_list = &process_args[1..];
        let input_list: Vec<PathBuf> = input_list.iter().map(PathBuf::from).collect();
        let mut input_files = Vec::new();
        for entry in input_list {
            if entry.is_dir() {
                if input_dir_deep {
                    read_dir_recurse(entry)
                } else {
                    read_dir_foreach(entry)
                }
                .or_else(|e| Err(format!("{}", e)))?;
            } else {
                input_files.push(entry);
            }
        }
        from_files_list(order_cfg, input_files)
    }
}

pub mod repeating {
    use super::*;

    pub fn from_count(order_cfg: &Value) -> Result<Vec<Task>, String> {
        let count = order_cfg.seek_i32("count")?;
        let program = order_cfg.seek_str("program")?;
        let args_cfg = order_cfg.seek("args")?;
        let args_template = split_args(args_cfg.seek_str("template")?)?;
        let args_switches = split_args(args_cfg.seek_str("switches")?)?;
        let mut tasks = Vec::new();
        for index in 0..count {
            let mut args = Vec::new();
            for item in &args_template {
                match item.as_str() {
                    "{switches}" => args.append(&mut args_switches.clone()),
                    "{index}" => args.push(index.to_string()),
                    "{position}" => args.push((index + 1).to_string()),
                    _ => args.push(item.to_string()),
                };
            }
            tasks.push(Task {
                program: program.to_string(),
                args,
            });
        }
        Ok(tasks)
    }
}

fn split_args(args_src: &str) -> Result<Vec<String>, String> {
    let mut args = Vec::new();
    let mut is_in_quotation_mask = true;
    for entry in args_src.split('"') {
        is_in_quotation_mask = !is_in_quotation_mask;
        if is_in_quotation_mask {
            args.push(entry.to_string());
        } else {
            let entry_split = entry.split_whitespace().map(|s| s.to_string());
            let mut entry_split: Vec<String> = entry_split.collect();
            args.append(&mut entry_split);
        }
    }
    if is_in_quotation_mask {
        Err("args' quotation mask is not closed".to_string())
    } else {
        Ok(args)
    }
}
