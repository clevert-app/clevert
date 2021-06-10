use crate::toml_seek::Seek;
use crate::Error;
use crate::ErrorKind;
use std::collections::HashMap;
use std::env;
use std::fs;

pub struct Config {
    // Common
    pub parent: Option<String>,
    pub threads_count: Option<i32>,
    pub skip_panic: Option<bool>,
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
    pub input_absolute: Option<bool>,
    pub input_recursive: Option<bool>,
    pub output_dir: Option<String>,
    pub output_absolute: Option<bool>,
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
        // TODO: Use macro instead?
        fn c<T: Clone>(target: &mut Option<T>, source: &Option<T>) {
            if let Some(v) = source {
                target.get_or_insert(v.clone());
            }
        }
        let t = self;
        let s = default;
        c(&mut t.parent, &s.parent);
        c(&mut t.threads_count, &s.threads_count);
        c(&mut t.skip_panic, &s.skip_panic);
        c(&mut t.repeat_count, &s.repeat_count);
        c(&mut t.stdout_type, &s.stdout_type);
        c(&mut t.stdout_file, &s.stdout_file);
        c(&mut t.stderr_type, &s.stderr_type);
        c(&mut t.stderr_file, &s.stderr_file);
        c(&mut t.program, &s.program);
        c(&mut t.args_template, &s.args_template);
        c(&mut t.args_switches, &s.args_switches);
        c(&mut t.input_list, &s.input_list);
        c(&mut t.input_dir, &s.input_dir);
        c(&mut t.input_absolute, &s.input_absolute);
        c(&mut t.input_recursive, &s.input_recursive);
        c(&mut t.output_dir, &s.output_dir);
        c(&mut t.output_absolute, &s.output_absolute);
        c(&mut t.output_recursive, &s.output_recursive);
        c(&mut t.output_overwrite, &s.output_overwrite);
        c(&mut t.output_extension, &s.output_extension);
        c(&mut t.output_prefix, &s.output_prefix);
        c(&mut t.output_suffix, &s.output_suffix);
        c(&mut t.cui_operation, &s.cui_operation);
        c(&mut t.cui_msg_level, &s.cui_msg_level);
        c(&mut t.cui_msg_interval, &s.cui_msg_interval);
    }

    fn from_toml_value(v: &toml::Value) -> Self {
        Self {
            parent: v.seek_str("parent"),
            threads_count: v.seek_i32("threads_count"),
            skip_panic: v.seek_bool("skip_panic"),
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
            input_absolute: v.seek_bool("input_absolute"),
            input_recursive: v.seek_bool("input_recursive"),
            output_dir: v.seek_str("output_dir"),
            output_absolute: v.seek_bool("output_absolute"),
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

    fn from_toml(toml_str: String) -> Result<Self, Error> {
        let cfg: toml::Value = toml_str.parse().unwrap();
        let mut order = Self::from_toml_value(cfg.get("order").unwrap());
        let mut presets = HashMap::new();
        for (k, v) in cfg.get("presets").unwrap().as_table().unwrap() {
            let preset = Self::from_toml_value(v);
            presets.insert(k.clone(), preset);
        }
        Self::fit(&mut order, presets)?;
        Ok(order)
    }

    pub fn _from_toml_test() -> Result<Self, Error> {
        let toml_str = r#"
        [presets.default]
        cui_operation = true
        cui_msg_level = 3 # TODO # 3:verbose | 2:normal | 1:concise | 0:none
        cui_msg_interval = 1000
        threads_count = 2
        repeat_count = 1
        skip_panic = false

        [presets.cwebp]
        stdout_type = 'file' # normal | ignore | file
        stdout_file = './target/cmdfactory_test/stdout.log.txt'
        stderr_type = 'file'
        stderr_file = './target/cmdfactory_test/stderr.log.txt'
        program = 'D:/Libraries/libwebp/libwebp_1.0.0/bin/cwebp.exe'
        args_template = '{args_switches} {input_file} -o {output_file}'
        args_switches = '-m 6'
        input_recursive = true
        output_recursive = true
        output_overwrite = true
        output_extension = 'webp'

        [presets.timeout]
        program = 'timeout'
        args_template = '-t 3'

        [presets.echo]
        stdout_type = 'normal'
        stderr_type = 'normal'
        program = 'cmd'
        args_template = '/c echo [ {input_file} ] [ {output_file} ]'
        input_absolute = true
        output_absolute = true

        [order]
        parent = 'cwebp'
        input_dir = './target/cmdfactory_test/input_dir'
        output_dir = './target/cmdfactory_test/output_dir'
        output_prefix = 'out_'
        output_suffix = '_out'        
        "#
        .to_string();
        Self::from_toml(toml_str)
    }

    fn fit(order: &mut Self, presets: HashMap<String, Self>) -> Result<(), Error> {
        fn inherit_fill(
            order: &mut Config,
            presets: &HashMap<String, Config>,
            deep: i32,
        ) -> Result<(), Error> {
            if deep > 64 {
                return Err(Error {
                    kind: ErrorKind::ConfigIllegal,
                    message: "preset deep > 64, loop reference?".to_string(),
                    ..Error::default()
                });
            }
            if let Some(k) = &order.parent {
                if let Some(parent) = presets.get(k) {
                    order.complement(parent);
                    order.parent = parent.parent.clone();
                    inherit_fill(order, presets, deep + 1)?;
                }
            }
            Ok(())
        }
        inherit_fill(order, &presets, 0)?;
        order.parent = Some("default".to_string());
        inherit_fill(order, &presets, 0)?;
        order.complement(&Self {
            parent: None,
            threads_count: Some(1),
            skip_panic: Some(false),
            repeat_count: Some(1),
            stdout_type: Some("ignore".to_string()),
            stdout_file: None,
            stderr_type: Some("ignore".to_string()),
            stderr_file: None,
            program: None,
            args_template: Some(String::new()),
            args_switches: Some(String::new()),
            input_list: None,
            input_dir: None,
            input_absolute: Some(false),
            input_recursive: Some(false),
            output_dir: None,
            output_absolute: Some(false),
            output_recursive: Some(true), // Auto create output dir also
            output_overwrite: Some(false),
            output_extension: None,
            output_prefix: None,
            output_suffix: None,
            cui_operation: Some(true),
            cui_msg_level: Some(2),
            cui_msg_interval: Some(1000),
        });
        let input_list: Vec<String> = env::args().skip(1).collect();
        if !input_list.is_empty() {
            order.input_list = Some(input_list);
        }
        Ok(())
    }

    pub fn new() -> Result<Self, Error> {
        let mut file_path = env::current_exe().unwrap();

        file_path.set_extension("toml");
        if let Ok(toml_str) = fs::read_to_string(&file_path) {
            return Ok(Self::from_toml(toml_str)?);
        }

        // file_path.set_extension("json");
        // if let Ok(json_str) = fs::read_to_string(&file_path) {
        //     return Self::from_json(json_str);
        // }

        Err(Error {
            kind: ErrorKind::ConfigFileCanNotRead,
            message: "the config file was not found".to_string(),
            ..Error::default()
        })
    }
}
