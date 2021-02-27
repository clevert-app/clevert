use crate::toml_seek::Seek;
use crate::Error;
use crate::ErrorKind;
use std::collections::HashMap;
use std::env;
use std::fs;
use toml;
use toml::Value;

pub struct Config {
    // Common
    pub parent: Option<String>,
    pub threads_count: Option<i32>,
    pub skip_panic: Option<bool>,
    pub via_terminal: Option<bool>,
    pub repeat_count: Option<i32>,
    pub stdout_type: Option<String>,
    pub stdout_file: Option<String>,
    pub stderr_type: Option<String>,
    pub stderr_file: Option<String>,
    pub program: Option<String>,
    pub args_template: Option<String>,
    pub args_switches: Option<String>,
    pub input_list: Option<Vec<String>>,
    pub input_dir: Option<String>,
    pub input_recursive: Option<bool>,
    pub output_dir: Option<String>,
    pub output_recursive: Option<bool>,
    pub output_overwrite: Option<bool>,
    pub output_extension: Option<String>,
    pub output_prefix: Option<String>,
    pub output_suffix: Option<String>,
    // Console UI
    pub cui_operation: Option<bool>,
    pub cui_msg_level: Option<i32>,
    pub cui_msg_interval: Option<i32>,
}

impl Config {
    fn complement(&mut self, default: &Self) {
        fn complement_option<T: Clone>(target: &mut Option<T>, source: &Option<T>) {
            if let Some(v) = source {
                target.get_or_insert(v.clone());
            }
        }

        // TODO: Use macro instead?
        complement_option(&mut self.parent, &default.parent);
        complement_option(&mut self.threads_count, &default.threads_count);
        complement_option(&mut self.skip_panic, &default.skip_panic);
        complement_option(&mut self.via_terminal, &default.via_terminal);
        complement_option(&mut self.repeat_count, &default.repeat_count);
        complement_option(&mut self.stdout_type, &default.stdout_type);
        complement_option(&mut self.stdout_file, &default.stdout_file);
        complement_option(&mut self.stderr_type, &default.stderr_type);
        complement_option(&mut self.stderr_file, &default.stderr_file);
        complement_option(&mut self.program, &default.program);
        complement_option(&mut self.args_template, &default.args_template);
        complement_option(&mut self.args_switches, &default.args_switches);
        complement_option(&mut self.input_list, &default.input_list);
        complement_option(&mut self.input_dir, &default.input_dir);
        complement_option(&mut self.input_recursive, &default.input_recursive);
        complement_option(&mut self.output_dir, &default.output_dir);
        complement_option(&mut self.output_recursive, &default.output_recursive);
        complement_option(&mut self.output_overwrite, &default.output_overwrite);
        complement_option(&mut self.output_extension, &default.output_extension);
        complement_option(&mut self.output_prefix, &default.output_prefix);
        complement_option(&mut self.output_suffix, &default.output_suffix);
        complement_option(&mut self.cui_operation, &default.cui_operation);
        complement_option(&mut self.cui_msg_level, &default.cui_msg_level);
        complement_option(&mut self.cui_msg_interval, &default.cui_msg_interval);
    }

    fn from_toml_value(v: &Value) -> Self {
        Self {
            parent: v.seek_str("parent"),
            threads_count: v.seek_i32("threads_count"),
            skip_panic: v.seek_bool("skip_panic"),
            via_terminal: v.seek_bool("via_terminal"),
            repeat_count: v.seek_i32("repeat_count"),
            stdout_type: v.seek_str("stdout_type"),
            stdout_file: v.seek_str("stdout_file"),
            stderr_type: v.seek_str("stderr_type"),
            stderr_file: v.seek_str("stderr_file"),
            program: v.seek_str("program"),
            args_template: v.seek_str("args_template"),
            args_switches: v.seek_str("args_switches"),
            input_list: v.seek_vec_str("input_list"),
            input_dir: v.seek_str("input_dir"),
            input_recursive: v.seek_bool("input_recursive"),
            output_dir: v.seek_str("output_dir"),
            output_recursive: v.seek_bool("output_recursive"),
            output_overwrite: v.seek_bool("output_overwrite"),
            output_extension: v.seek_str("output_extension"),
            output_prefix: v.seek_str("output_prefix"),
            output_suffix: v.seek_str("output_suffix"),
            cui_operation: v.seek_bool("cui_operation"),
            cui_msg_level: v.seek_i32("cui_msg_level"),
            cui_msg_interval: v.seek_i32("cui_msg_interval"),
        }
    }

    fn from_toml_str(toml_str: String) -> Self {
        let cfg: Value = toml_str.parse().unwrap();
        let mut order = Self::from_toml_value(cfg.get("order").unwrap());
        let mut presets = HashMap::new();
        for (k, v) in cfg.get("presets").unwrap().as_table().unwrap() {
            let preset = Self::from_toml_value(v);
            presets.insert(k.clone(), preset);
        }
        Self::fix(&mut order, presets);
        order
    }

    pub fn _from_toml_test() -> Self {
        let toml_str = r#"
        [presets.default]
        cui_operation = true
        cui_msg_level = 3 # TODO # 3:verbose | 2:normal | 1:concise | 0:none
        cui_msg_interval = 1000
        skip_panic = false
        via_terminal = false # TODO ?

        [presets.cwebp]
        parent = 'default'
        threads_count = 3
        repeat_count = 1
        args_template = '{args_switches} {input_file} -o {output_file}'
        input_recursive = true
        output_recursive = true
        output_overwrite = false
        output_extension = 'webp'

        [order]
        parent = 'cwebp'
        stdout_type = 'file' # ignore | normal | file
        stdout_file = './target/cmdfactory_test/stdout.log.txt'
        stderr_type = 'file'
        stderr_file = './target/cmdfactory_test/stderr.log.txt'
        program = 'D:/Libraries/libwebp/libwebp_1.0.0/bin/cwebp.exe'
        args_switches = '-m 6'
        input_dir = './target/cmdfactory_test/input_dir'
        output_dir = './target/cmdfactory_test/output_dir'
        output_prefix = 'out_'
        output_suffix = '_out'        
        "#
        .to_string();
        Self::from_toml_str(toml_str)
    }

    fn fix(order: &mut Self, presets: HashMap<String, Self>) {
        fn inherit_fill(order: &mut Config, presets: &HashMap<String, Config>, deep: i32) {
            if deep > 64 {
                return;
            }
            if let Some(k) = &order.parent {
                if let Some(parent) = presets.get(k) {
                    order.complement(parent);
                    order.parent = parent.parent.clone();
                    inherit_fill(order, presets, deep + 1);
                }
            }
        }
        inherit_fill(order, &presets, 0);
        order.complement(&Self {
            parent: None,
            threads_count: Some(1),
            skip_panic: Some(false),
            via_terminal: Some(false),
            repeat_count: Some(1),
            stdout_type: Some("ignore".to_string()),
            stdout_file: None,
            stderr_type: Some("ignore".to_string()),
            stderr_file: None,
            program: None,
            args_template: None,
            args_switches: None,
            input_list: None,
            input_dir: None,
            input_recursive: Some(false),
            output_dir: None,
            output_recursive: Some(true),
            output_overwrite: Some(false),
            output_extension: None,
            output_prefix: None,
            output_suffix: None,
            cui_operation: Some(true),
            cui_msg_level: Some(2),
            cui_msg_interval: Some(1000),
        });
        let mut input_list = Vec::new();
        for arg in env::args().skip(1) {
            input_list.push(arg);
        }
        if !input_list.is_empty() {
            order.input_list = Some(input_list);
        }
        // let mut output_file_path = String::new();
        // let mut is_output_item = false;
        // if is_output_item {
        //     if output_file_path.is_empty() {
        //         output_file_path = arg;
        //     } else {
        //         return Err(Error {
        //             kind: ErrorKind::ConfigIllegal,
        //             inner: None,
        //             message: Some(String::from("too many output path in process arguments")),
        //         });
        //     }
        // } else if arg.starts_with('-') {
        //     if arg == "-o" || arg == "--output" {
        //         is_output_item = true;
        //     } else {
        //         return Err(Error {
        //             kind: ErrorKind::ConfigIllegal,
        //             inner: None,
        //             message: Some(format!("unknown switch `{}` in process arguments", arg)),
        //         });
        //     }
        // } else {
        //     input_list.push(arg);
        // }
    }

    pub fn new() -> Result<Self, Error> {
        let mut file_path = env::current_exe().unwrap();

        file_path.set_extension("toml");
        if let Ok(toml_str) = fs::read_to_string(&file_path) {
            return Ok(Config::from_toml_str(toml_str));
        }

        // file_path.set_extension("json");
        // if let Ok(json_str) = fs::read_to_string(&file_path) {
        //     return Config::from_json(json_str);
        // }

        Err(Error {
            kind: ErrorKind::ConfigFileCanNotRead,
            inner: None,
            message: Some("the config file was not found".to_string()),
        })
    }
}
