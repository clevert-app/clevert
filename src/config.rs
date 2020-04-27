use crate::Error;
use crate::ErrorKind;
use std::collections::HashMap;
use std::convert::TryInto;
use std::env;
use std::fs;
use toml;

pub struct Proposal {
    pub preset_name: Option<String>,
    pub show_progress: Option<bool>,
    pub show_info: Option<bool>,
    pub threads_count: Option<i32>,
    pub simulate_terminal: Option<bool>,
    pub repeat_count: Option<i32>,
    // pub stdin_type: Option<String>,
    pub stdout_type: Option<String>,
    pub stdout_file_path: Option<String>,
    pub stderr_type: Option<String>,
    pub stderr_file_path: Option<String>,
    pub program: Option<String>,
    pub args_template: Option<String>,
    pub args_switches: Option<String>,
    pub input_list: Option<Vec<String>>, // Priority: config file's "input.list" > process args > "input_dir_path" and others
    pub input_dir_path: Option<String>,
    pub input_dir_deep: Option<bool>,
    pub output_file_path: Option<String>, // Almost like "input_list"
    pub output_file_override: Option<bool>,
    pub output_dir_path: Option<String>,
    pub output_dir_keep_struct: Option<bool>,
    pub output_file_name_extension: Option<String>,
    pub output_file_name_prefix: Option<String>,
    pub output_file_name_suffix: Option<String>,
}

impl Proposal {
    fn complement(&mut self, default: &Proposal) {
        fn complement_option<T: Clone>(target: &mut Option<T>, source: &Option<T>) {
            if let Some(v) = source {
                target.get_or_insert(v.clone());
            }
        }

        // Use macro instead?
        complement_option(&mut self.preset_name, &default.preset_name); // Unnecessary?
        complement_option(&mut self.show_progress, &default.show_progress);
        complement_option(&mut self.show_info, &default.show_info);
        complement_option(&mut self.threads_count, &default.threads_count);
        complement_option(&mut self.simulate_terminal, &default.simulate_terminal);
        complement_option(&mut self.repeat_count, &default.repeat_count);
        complement_option(&mut self.stdout_type, &default.stdout_type);
        complement_option(&mut self.stdout_file_path, &default.stdout_file_path);
        complement_option(&mut self.stderr_type, &default.stderr_type);
        complement_option(&mut self.stderr_file_path, &default.stderr_file_path);
        complement_option(&mut self.program, &default.program);
        complement_option(&mut self.args_template, &default.args_template);
        complement_option(&mut self.args_switches, &default.args_switches);
        complement_option(&mut self.input_list, &default.input_list);
        complement_option(&mut self.input_dir_path, &default.input_dir_path);
        complement_option(&mut self.input_dir_deep, &default.input_dir_deep);
        complement_option(&mut self.output_file_path, &default.output_file_path);
        complement_option(
            &mut self.output_file_override,
            &default.output_file_override,
        );
        complement_option(&mut self.output_dir_path, &default.output_dir_path);
        complement_option(
            &mut self.output_dir_keep_struct,
            &default.output_dir_keep_struct,
        );
        complement_option(
            &mut self.output_file_name_extension,
            &default.output_file_name_extension,
        );
        complement_option(
            &mut self.output_file_name_prefix,
            &default.output_file_name_prefix,
        );
        complement_option(
            &mut self.output_file_name_suffix,
            &default.output_file_name_suffix,
        );
    }
}

pub struct Config {
    pub presets: HashMap<String, Proposal>,
    pub orders: Vec<Proposal>,
}

impl Config {
    pub fn new() -> Result<Config, Error> {
        let mut file_path = env::current_exe().unwrap();

        file_path.set_extension("toml");
        if let Ok(toml_str) = fs::read_to_string(&file_path) {
            return Config::from_toml(toml_str);
        }

        // file_path.set_extension("json");
        // if let Ok(json_str) = fs::read_to_string(&file_path) {
        //     return Config::from_json(json_str);
        // }

        Err(Error {
            kind: ErrorKind::ConfigFileCanNotRead,
            inner: None,
            message: None,
        })
    }

    pub fn _from_toml_test() -> Result<Config, Error> {
        Config::from_toml(String::from(
            r#"
            [presets.default]
            message.progress = true
            message.info = true
            threads.count = 4
            process.simulate_terminal = false # TODO
            repeat.illimitably = false
            repeat.count = 1
            stdio.stdout.type = 'file' # ignore | normal | file
            stdio.stdout.file.path = './target/test-stdout.log'
            stdio.stderr.type = 'file'
            stdio.stderr.file.path = './target/test-stderr.log'

            [presets.cwebp]
            program = 'cwebp.exe'
            args.template = '{args.switches} {input.file_path} -o {output.file_path}' # TODO: trope "{{" to real "{"
            args.switches = '-m 6'
            output.file_name.extension = 'webp'

            [presets.cwebp_lossless]
            preset = 'cwebp'
            args.switches = '-lossless -m 6 -noalpha -sharp_yuv -metadata none'

            [presets.clock]
            repeat.count = 10
            program = 'cmd'
            args.template = '/c echo {args.switches} ; {repeat.index} ; {repeat.position} && timeout /t 1 > nul'
            args.switches = 'time: %time%'
            threads.count = 1
            message.progress = false
            stdio.stdout.type = 'normal'
            stdio.stderr.type = 'normal'

            [[orders]]
            preset = 'cwebp_lossless'
            program = 'D:\Library\libwebp\libwebp_1.0.0\bin\cwebp.exe'
            input.dir.path = 'D:\Temp\foundry_test\source'
            output.dir.path = 'D:\Temp\foundry_test\target'
            output.file_name.prefix = 'out_'
            output.file_name.suffix = '_out'
            "#,
        ))
    }

    fn from_toml(toml_str: String) -> Result<Config, Error> {
        use toml::Value;
        let toml_value: Value = toml_str.parse().or_else(|e| {
            Err(Error {
                kind: ErrorKind::ConfigTomlIllegal,
                inner: Some(Box::new(e)),
                message: None,
            })
        })?;
        let mut cfg = Config {
            presets: HashMap::new(),
            orders: Vec::new(),
        };

        fn toml_value_to_proposal(toml_value: &Value) -> Proposal {
            Proposal {
                preset_name: (|| toml_value.get("preset")?.as_str()?.try_into().ok())(),
                show_progress: (|| toml_value.get("message")?.get("progress")?.as_bool())(),
                show_info: (|| toml_value.get("message")?.get("info")?.as_bool())(),
                threads_count: (|| {
                    toml_value
                        .get("threads")?
                        .get("count")?
                        .as_integer()?
                        .try_into()
                        .ok()
                })(),
                simulate_terminal: (|| {
                    toml_value
                        .get("process")?
                        .get("simulate_terminal")?
                        .as_bool()
                })(),
                repeat_count: (|| {
                    toml_value
                        .get("repeat")?
                        .get("count")?
                        .as_integer()?
                        .try_into()
                        .ok()
                })(),
                stdout_type: (|| {
                    toml_value
                        .get("stdio")?
                        .get("stdout")?
                        .get("type")?
                        .as_str()?
                        .try_into()
                        .ok()
                })(),
                stdout_file_path: (|| {
                    toml_value
                        .get("stdio")?
                        .get("stdout")?
                        .get("file")?
                        .get("path")?
                        .as_str()?
                        .try_into()
                        .ok()
                })(),
                stderr_type: (|| {
                    toml_value
                        .get("stdio")?
                        .get("stderr")?
                        .get("type")?
                        .as_str()?
                        .try_into()
                        .ok()
                })(),
                stderr_file_path: (|| {
                    toml_value
                        .get("stdio")?
                        .get("stderr")?
                        .get("file")?
                        .get("path")?
                        .as_str()?
                        .try_into()
                        .ok()
                })(),
                program: (|| toml_value.get("program")?.as_str()?.try_into().ok())(),
                args_template: (|| {
                    toml_value
                        .get("args")?
                        .get("template")?
                        .as_str()?
                        .try_into()
                        .ok()
                })(),
                args_switches: (|| {
                    toml_value
                        .get("args")?
                        .get("switches")?
                        .as_str()?
                        .try_into()
                        .ok()
                })(),
                input_list: (|| {
                    let mut list = Vec::new();
                    for v in toml_value.get("input")?.get("list")?.as_array()? {
                        list.push(v.as_str()?.to_owned())
                    }
                    Some(list)
                })(),
                input_dir_path: (|| {
                    toml_value
                        .get("input")?
                        .get("dir")?
                        .get("path")?
                        .as_str()?
                        .try_into()
                        .ok()
                })(),
                input_dir_deep: (|| toml_value.get("input")?.get("dir")?.get("deep")?.as_bool())(),
                output_file_path: (|| {
                    toml_value
                        .get("output")?
                        .get("file")?
                        .get("path")?
                        .as_str()?
                        .try_into()
                        .ok()
                })(),
                output_file_override: (|| {
                    toml_value
                        .get("output")?
                        .get("file")?
                        .get("path")?
                        .as_bool()
                })(),
                output_dir_path: (|| {
                    toml_value
                        .get("output")?
                        .get("dir")?
                        .get("path")?
                        .as_str()?
                        .try_into()
                        .ok()
                })(),
                output_dir_keep_struct: (|| {
                    toml_value
                        .get("output")?
                        .get("dir")?
                        .get("keep_struct")?
                        .as_bool()
                })(),
                output_file_name_extension: (|| {
                    toml_value
                        .get("output")?
                        .get("file_name")?
                        .get("extension")?
                        .as_str()?
                        .try_into()
                        .ok()
                })(),
                output_file_name_prefix: (|| {
                    toml_value
                        .get("output")?
                        .get("file_name")?
                        .get("prefix")?
                        .as_str()?
                        .try_into()
                        .ok()
                })(),
                output_file_name_suffix: (|| {
                    toml_value
                        .get("output")?
                        .get("file_name")?
                        .get("suffix")?
                        .as_str()?
                        .try_into()
                        .ok()
                })(),
            }
        }

        for (name, toml_value) in toml_value.get("presets").unwrap().as_table().unwrap() {
            let preset = toml_value_to_proposal(toml_value);
            cfg.presets.insert(name.clone(), preset);
        }
        for toml_value in toml_value.get("orders").unwrap().as_array().unwrap() {
            let order = toml_value_to_proposal(toml_value);
            cfg.orders.push(order);
        }
        Config::fix(&mut cfg)?;
        Ok(cfg)
    }

    // fn from_json() -> Config {}

    fn fix(cfg: &mut Config) -> Result<(), Error> {
        fn inherit_fill(
            order: &mut Proposal,
            current_preset_name: &str,
            presets: &HashMap<String, Proposal>,
            stack_deep: i32,
        ) {
            if stack_deep > 64 {
                return;
            }
            if let Some(preset) = presets.get(current_preset_name) {
                order.complement(preset);
                if let Some(next_preset_name) = &preset.preset_name {
                    inherit_fill(order, next_preset_name, presets, stack_deep + 1);
                }
            }
        }

        let mut args = env::args();
        args.next();
        let mut input_list = Vec::new();
        let mut output_file_path = String::new();
        let mut is_output_item = false;
        for arg in args {
            if is_output_item {
                if output_file_path.is_empty() {
                    output_file_path = arg;
                } else {
                    return Err(Error {
                        kind: ErrorKind::ConfigIllegal,
                        inner: None,
                        message: Some(String::from("too many output path in process arguments")),
                    });
                }
            } else if arg.starts_with('-') {
                if arg == "-o" || arg == "--output" {
                    is_output_item = true;
                } else {
                    return Err(Error {
                        kind: ErrorKind::ConfigIllegal,
                        inner: None,
                        message: Some(format!("unknown switch `{}` in process arguments", arg)),
                    });
                }
            } else {
                input_list.push(arg);
            }
        }

        for order in &mut cfg.orders {
            if let Some(preset_name) = &order.preset_name {
                let first_preset_name = preset_name.clone();
                inherit_fill(order, &first_preset_name, &cfg.presets, 1);
            }
            // You can use [default] -> [other preset you want]
            inherit_fill(order, "default", &cfg.presets, 1);
            // But can not [build_in] -> [other preset]
            order.complement(&Proposal {
                preset_name: Some(String::from("build_in")),
                show_progress: Some(true),
                show_info: Some(true),
                threads_count: Some(1),
                simulate_terminal: Some(false),
                repeat_count: Some(1),
                stdout_type: Some(String::from("ignore")),
                stdout_file_path: None,
                stderr_type: Some(String::from("ignore")),
                stderr_file_path: None,
                program: None,
                args_template: Some(String::from("")),
                args_switches: Some(String::from("")),
                input_list: if input_list.is_empty() {
                    None
                } else {
                    Some(input_list.to_owned())
                },
                input_dir_path: None,
                input_dir_deep: Some(false),
                output_file_path: if output_file_path.is_empty() {
                    None
                } else {
                    Some(output_file_path.to_owned())
                },
                output_file_override: Some(true),
                output_dir_path: None,
                output_dir_keep_struct: Some(false),
                output_file_name_extension: None,
                output_file_name_prefix: None,
                output_file_name_suffix: None,
            });
        }

        Ok(())
    }
}
