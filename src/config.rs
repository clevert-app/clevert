use crate::Error;
use crate::ErrorKind;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::fs;

fn merge<T: Serialize + DeserializeOwned>(current: &mut T, parent: &T) {
    // github.com/Z4RX/serde_merge
    let mut map = serde_json::to_value(&current).unwrap();
    for (k, v) in serde_json::to_value(parent).unwrap().as_object().unwrap() {
        if map[k].is_null() {
            map[k] = v.clone();
        }
    }
    *current = serde_json::from_value(map).unwrap();
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Config {
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
}

impl std::default::Default for Config {
    fn default() -> Self {
        Self {
            parent: None,
            threads_count: {
                #[cfg(unix)]
                let count = fs::read_to_string("/proc/cpuinfo")
                    .unwrap()
                    .matches("\nprocessor")
                    .count() as _;
                #[cfg(windows)]
                let count = std::env::var("number_of_processors")
                    .unwrap()
                    .parse::<i32>()
                    .unwrap();
                Some(count)
            },
            ignore_panic: Some(false),
            repeat_count: Some(1),
            stdout_type: Some("ignore".to_string()), // normal | ignore | file
            stdout_file: None,
            stderr_type: Some("ignore".to_string()),
            stderr_file: None,
            program: None,
            current_dir: None, // only apply on commands, has no effect to self
            args_template: Some(String::new()),
            input_list: None,
            input_dir: None,
            input_absolute: Some(false),
            input_recursive: Some(false),
            output_dir: None,
            output_absolute: Some(false),
            output_recursive: Some(false),
            output_overwrite: Some("allow".to_string()), // allow | forbid | force
            output_extension: None,
            output_prefix: None,
            output_suffix: None,
            output_suffix_serial: Some(false),
        }
    }
}

#[derive(Serialize, Deserialize)]
pub struct Profile {
    presets: HashMap<String, Config>,
    pub current: Option<String>,
    pub cli_log_level: Option<i32>,
    pub cli_interactive: Option<bool>,
}

impl std::default::Default for Profile {
    fn default() -> Self {
        Self {
            presets: HashMap::new(),
            current: None,
            cli_log_level: Some(2),
            cli_interactive: Some(true),
        }
    }
}

impl Profile {
    fn fit(mut self) -> Self {
        merge(&mut self, &Default::default());
        self
    }

    pub fn from_toml(toml_str: &str) -> Result<Self, Error> {
        Ok(Self::fit(toml::from_str(toml_str).map_err(|e| Error {
            kind: ErrorKind::Config,
            inner: Box::new(e),
            message: "error while config file deserialize".to_string(),
        })?))
    }

    pub fn from_default_file() -> Result<Self, Error> {
        let path = env::current_exe().unwrap();
        if let Ok(text) = fs::read_to_string(&path.with_extension("toml")) {
            return Self::from_toml(&text);
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

    pub fn keys(&self) -> Vec<&String> {
        self.presets.keys().collect()
    }

    pub fn get(&self, name: &str) -> Result<Config, Error> {
        let mut current = self.presets.get(name).unwrap().clone();

        // inherit parent's parent
        let mut depth = 0;
        while let Some(parent_name) = current.parent.take() {
            depth += 1;
            if depth > 64 {
                return Err(Error {
                    kind: ErrorKind::Config,
                    message: "preset inherit depth > 64".to_string(),
                    ..Default::default()
                });
            }
            if let Some(parent) = self.presets.get(&parent_name) {
                merge(&mut current, parent);
                current.parent = parent.parent.clone();
            } else {
                return Err(Error {
                    kind: ErrorKind::Config,
                    message: format!("parent preset `{parent_name}` not found"),
                    ..Default::default()
                });
            }
        }

        // inherit `global` and `default`
        if let Some(parent) = self.presets.get("global") {
            merge(&mut current, parent);
        }
        merge(&mut current, &Default::default());

        Ok(current)
    }

    pub fn get_current(&self) -> Result<Config, Error> {
        // TODO: add error handle here
        self.get(self.current.as_ref().unwrap())
    }
}
