use crate::toml_helper::Seek;
use crate::OrderItem;
use std::env;
use std::fs;
use std::path::PathBuf;
use toml::Value;

pub mod file_process {
    use super::*;

    fn generate_output_file_path(
        task_cfg: &Value,
        input_file_path: &PathBuf,
    ) -> Result<PathBuf, String> {
        let output_cfg = task_cfg.seek("output")?;
        let folder_path = if let Ok(folder) = output_cfg.seek_str("folder") {
            PathBuf::from(folder)
        } else {
            // Default output to source folder
            input_file_path.parent().unwrap().to_path_buf()
        };
        let file_name_cfg = output_cfg.seek("file_name")?;
        let mut file_name = input_file_path
            .file_stem()
            .ok_or("input file has no stem name")?
            .to_str()
            .unwrap()
            .to_string();
        if let Ok(prefix) = file_name_cfg.seek_str("prefix") {
            file_name.insert_str(0, prefix);
        }
        if let Ok(suffix) = file_name_cfg.seek_str("suffix") {
            file_name.push_str(suffix);
        }
        let mut file_path = folder_path;
        file_path.push(file_name);
        if let Ok(extension) = file_name_cfg.seek_str("extension") {
            file_path.set_extension(extension);
        } else if let Some(extension) = input_file_path.extension() {
            file_path.set_extension(extension);
        }
        // Print tips for overriding?
        Ok(file_path)
    }

    fn from_files_list(
        task_cfg: &Value,
        input_files: Vec<PathBuf>,
    ) -> Result<Vec<OrderItem>, String> {
        let program = task_cfg.seek_str("program")?;
        let args_cfg = task_cfg.seek("args")?;
        let args_template = args_cfg.seek_str("template")?;
        let args_switches = args_cfg.seek_str("switches")?;
        let mut commands = Vec::new();
        for input_file_path in input_files {
            let output_file_path = generate_output_file_path(task_cfg, &input_file_path)?;
            let mut args = Vec::new();
            for item in split_args(args_template) {
                match item.as_str() {
                    "{switches}" => args.append(&mut split_args(args_switches)),
                    "{input.file_path}" => args.push(input_file_path.to_str().unwrap().to_string()),
                    "{input.file_extension}" => args.push(
                        input_file_path
                            .extension()
                            .ok_or("input file has no extension")?
                            .to_str()
                            .unwrap()
                            .to_string(),
                    ),
                    "{output.file_path}" => {
                        args.push(output_file_path.to_str().unwrap().to_string())
                    }
                    "{output.folder_path}" => args.push(
                        output_file_path
                            .parent()
                            .unwrap()
                            .to_str()
                            .unwrap()
                            .to_string(),
                    ),
                    _ => args.push(item),
                };
            }
            commands.push(OrderItem {
                program: program.to_string(),
                args,
            });
        }
        Ok(commands)
    }

    pub fn from_folder(task_cfg: &Value) -> Result<Vec<OrderItem>, String> {
        let input_cfg = task_cfg.seek("input")?;
        let input_folder_path = PathBuf::from(input_cfg.seek_str("folder")?);
        let mut input_files = Vec::new();
        for entry in fs::read_dir(input_folder_path).or(Err("read folder failed"))? {
            let input_file_path = entry.or(Err("illegal entry in folder"))?.path();
            if input_file_path.is_file() {
                input_files.push(input_file_path);
            }
        }
        from_files_list(task_cfg, input_files)
    }

    pub fn _from_process_args(task_cfg: &Value) -> Result<Vec<OrderItem>, String> {
        let process_args: Vec<String> = env::args().collect();
        let files = &process_args[1..];
        let files: Vec<PathBuf> = files.iter().map(PathBuf::from).collect();
        let mut input_files = Vec::new();
        for file_path in files {
            if file_path.is_file() {
                input_files.push(file_path);
            }
        }
        from_files_list(task_cfg, input_files)
    }
}

fn split_args(args_src: &str) -> Vec<String> {
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
        panic!("args' quotation mask is not closed");
    }
    args
}
