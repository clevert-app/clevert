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
    pub stop_panic: Option<bool>,
    pub simulate_terminal: Option<bool>,
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
    pub output_keep_subdir: Option<bool>,
    pub output_overwrite: Option<bool>,
    pub output_extension: Option<String>,
    pub output_prefix: Option<String>,
    pub output_suffix: Option<String>,
    // WebUI
    pub webui_enabled: Option<bool>,
    pub webui_ip: Option<String>,
    pub webui_port: Option<i32>,
    // Console UI
    pub cui_terminal_op: Option<bool>,
    pub cui_message_info: Option<bool>,
    pub cui_message_progress: Option<bool>,
    pub cui_message_progress_interval: Option<i32>,
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
        complement_option(&mut self.stop_panic, &default.stop_panic);
        complement_option(&mut self.simulate_terminal, &default.simulate_terminal);
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
        complement_option(&mut self.output_keep_subdir, &default.output_keep_subdir);
        complement_option(&mut self.output_overwrite, &default.output_overwrite);
        complement_option(&mut self.output_extension, &default.output_extension);
        complement_option(&mut self.output_prefix, &default.output_prefix);
        complement_option(&mut self.output_suffix, &default.output_suffix);
        complement_option(&mut self.webui_enabled, &default.webui_enabled);
        complement_option(&mut self.webui_ip, &default.webui_ip);
        complement_option(&mut self.webui_port, &default.webui_port);
        complement_option(&mut self.cui_terminal_op, &default.cui_terminal_op);
        complement_option(&mut self.cui_message_info, &default.cui_message_info);
        complement_option(
            &mut self.cui_message_progress,
            &default.cui_message_progress,
        );
        complement_option(
            &mut self.cui_message_progress_interval,
            &default.cui_message_progress_interval,
        );
    }

    fn from_toml_value(v: &Value) -> Self {
        Self {
            parent: v.seek_str("parent"),
            threads_count: v.seek_i32("threads_count"),
            stop_panic: v.seek_bool("stop_panic"),
            simulate_terminal: v.seek_bool("simulate_terminal"),
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
            output_keep_subdir: v.seek_bool("output_keep_subdir"),
            output_overwrite: v.seek_bool("output_overwrite"),
            output_extension: v.seek_str("output_extension"),
            output_prefix: v.seek_str("output_prefix"),
            output_suffix: v.seek_str("output_suffix"),
            webui_enabled: v.seek_bool("webui.enabled"),
            webui_ip: v.seek_str("webui.ip"),
            webui_port: v.seek_i32("webui.port"),
            cui_terminal_op: v.seek_bool("cui.terminal_op"),
            cui_message_info: v.seek_bool("cui.message_info"),
            cui_message_progress: v.seek_bool("cui.message_progress"),
            cui_message_progress_interval: v.seek_i32("cui.message_progress_interval"),
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
        webui.enabled = false
        webui.ip = '127.0.0.1'
        webui.port = 9090
        cui.terminal_op = true
        cui.message_info = true
        cui.message_progress = true
        cui.message_progress_interval = 1000
        stop_panic = false
        simulate_terminal = false

        [presets.cwebp]
        parent = 'default'
        threads_count = 2
        repeat_count = 1
        args_template = '{args_switches} {input_file} -o {output_file}'
        input_recursive = true
        output_keep_subdir = false
        output_overwrite = false
        output_extension = 'webp'

        [order]
        parent = 'cwebp'
        stdout_type = 'file' # ignore | normal | file
        stdout_file = './target/foundry_test/stdout.log.txt'
        stderr_type = 'file'
        stderr_file = './target/foundry_test/stderr.log.txt'
        program = 'D:/Library/libwebp/libwebp_1.0.0/bin/cwebp.exe'
        args_switches = '-m 6'
        input_dir = './target/foundry_test/input_dir'
        output_dir = './target/foundry_test/output_dir'
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
            stop_panic: Some(false),
            simulate_terminal: Some(false),
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
            output_keep_subdir: Some(true),
            output_overwrite: Some(false),
            output_extension: None,
            output_prefix: None,
            output_suffix: None,
            webui_enabled: Some(false),
            webui_ip: None,
            webui_port: None,
            cui_terminal_op: Some(true),
            cui_message_info: Some(true),
            cui_message_progress: Some(true),
            cui_message_progress_interval: Some(1000),
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
            message: None,
        })
    }
}
