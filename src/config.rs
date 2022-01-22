use crate::Error;
use crate::ErrorKind;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::fs;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Config {
    // Common
    pub parent: Option<String>,
    pub threads_count: Option<i32>,
    pub ignore_panic: Option<bool>,
    pub repeat_count: Option<i32>,
    pub stdout_type: Option<String>,
    pub stdout_file: Option<String>,
    pub stderr_type: Option<String>,
    pub stderr_file: Option<String>,
    pub program: Option<String>,
    pub current_dir: Option<String>,
    pub args_template: Option<String>,
    pub args_switches: Option<String>,
    pub input_list: Option<Vec<String>>,
    pub input_dir: Option<String>,
    pub input_absolute: Option<bool>,
    pub input_recursive: Option<bool>,
    pub output_dir: Option<String>,
    pub output_absolute: Option<bool>,
    pub output_recursive: Option<bool>,
    pub output_overwrite: Option<String>,
    pub output_extension: Option<String>,
    pub output_prefix: Option<String>,
    pub output_suffix: Option<String>,
    pub output_suffix_serial: Option<bool>,
    // Command line configs
    pub cli_operation: Option<bool>,
    pub cui_msg_level: Option<i32>,
    pub cui_msg_interval: Option<i32>,
    // Terminal UI configs
    pub tui: Option<bool>,
}

impl std::default::Default for Config {
    fn default() -> Self {
        Self {
            parent: None,
            threads_count: Some(0), // 0 means count of processors
            ignore_panic: Some(false),
            repeat_count: Some(1),
            stdout_type: Some("ignore".to_string()), // normal | ignore | file
            stdout_file: None,
            stderr_type: Some("ignore".to_string()),
            stderr_file: None,
            program: None,
            current_dir: None,
            args_template: Some(String::new()),
            args_switches: Some(String::new()),
            input_list: None,
            input_dir: None,
            input_absolute: Some(false),
            input_recursive: Some(false),
            output_dir: None,
            output_absolute: Some(false),
            output_recursive: Some(true), // Auto create output dir also
            output_overwrite: Some("allow".to_string()), // allow | forbid | force
            output_extension: None,
            output_prefix: None,
            output_suffix: None,
            output_suffix_serial: Some(false),
            cli_operation: Some(true),
            cui_msg_level: Some(2),
            cui_msg_interval: Some(1000),
            tui: Some(false),
        }
    }
}

#[derive(Deserialize, Debug)]
pub struct Profile {
    presets: HashMap<String, Config>,
    order: Config,
}

impl Profile {
    fn merge(&mut self, preset_name: &str) -> Result<(), Error> {
        if self.presets.get(preset_name).is_none() {
            return Err(Error {
                kind: ErrorKind::Config,
                message: format!("preset `{}` for merging not found", preset_name),
                ..Default::default()
            });
        }
        let parent = self.presets.get(preset_name).unwrap();
        self.order = serde_merge::omerge(&self.order, parent).unwrap();
        Ok(())
    }

    fn fit(mut cfg: Self) -> Result<Self, Error> {
        // backup
        cfg.presets.insert("order".into(), cfg.order.clone());
        // default and global
        cfg.presets.insert("default".into(), Default::default());
        cfg.merge("default")?;
        if let Some(preset) = cfg.presets.get("global") {
            if preset.parent.is_some() {
                return Err(Error {
                    kind: ErrorKind::Config,
                    message: "presets.global.parent is not null".to_string(),
                    ..Default::default()
                });
            }
            cfg.merge("global")?
        }
        // inherit parent's parent
        let mut parents = Vec::new();
        while let Some(name) = cfg.order.parent.take() {
            if let Some(parent) = cfg.presets.get_mut(&name) {
                cfg.order.parent = parent.parent.take();
            }
            parents.push(name);
        }
        for name in parents.iter().rev() {
            cfg.merge(name)?;
        }
        // order itself
        cfg.merge("order")?;

        // 0 means count of processors
        if cfg.order.threads_count.unwrap() == 0 {
            #[cfg(unix)]
            let count = fs::read_to_string("/proc/cpuinfo")
                .unwrap()
                .split('\n')
                .filter(|line| line.starts_with("processor"))
                .count() as _;
            #[cfg(windows)]
            let count = std::env::var("number_of_processors")
                .unwrap()
                .parse::<i32>()
                .unwrap();
            cfg.order.threads_count.replace(count);
        };

        Ok(cfg)
    }

    pub fn from_toml(toml_str: String) -> Result<Self, Error> {
        Self::fit(toml::from_str(&toml_str).map_err(|e| Error {
            kind: ErrorKind::Config,
            inner: Box::new(e),
            message: "error while TOML Deserialize".to_string(),
        })?)
    }

    pub fn from_default_file() -> Result<Self, Error> {
        let path = env::current_exe().unwrap();
        if let Ok(text) = fs::read_to_string(&path.with_extension("toml")) {
            return Self::from_toml(text);
        }
        // if let Ok(text) = fs::read_to_string(&path.with_extension("json")) {
        //     return Self::from_json(text);
        // }
        Err(Error {
            kind: ErrorKind::Config,
            message: "the config file was not found".to_string(),
            ..Default::default()
        })
    }
}

impl Config {
    pub fn from_toml(toml_str: String) -> Result<Self, Error> {
        Ok(Profile::from_toml(toml_str)?.order)
    }

    pub fn from_default_file() -> Result<Self, Error> {
        Ok(Profile::from_default_file()?.order)
    }
}
