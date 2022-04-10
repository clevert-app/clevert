use crate::{Error, ErrorKind};
use serde::Deserialize;
use std::collections::HashMap;
use std::env;
use std::fs;

#[derive(Deserialize, Clone)]
pub struct Config {
    pub parent: Option<String>,
    pub threads_count: Option<usize>,
    pub ignore_panic: Option<bool>,
    pub repeat_count: Option<usize>,
    pub pipe: Option<String>,
    pub program: Option<String>,
    pub args_template: Option<String>,
    pub current_dir: Option<String>,
    pub input_list: Option<Vec<String>>,
    pub input_absolute: Option<bool>,
    pub output_dir: Option<String>,
    pub output_absolute: Option<bool>,
    pub output_extension: Option<String>,
    pub output_recursive: Option<bool>,
    pub output_force: Option<bool>,
    pub output_prefix: Option<String>,
    pub output_suffix: Option<String>,
    pub output_serial: Option<bool>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            parent: None,
            threads_count: Some(num_cpus::get()),
            ignore_panic: Some(false),
            repeat_count: Some(1),
            pipe: None, // None | <inherit> | path
            program: None,
            args_template: Some(String::new()),
            current_dir: None, // only apply on commands, has no effect to self
            input_list: Some(Vec::new()),
            input_absolute: Some(false),
            output_dir: None,
            output_absolute: Some(false),
            output_extension: None,
            output_recursive: Some(false),
            output_force: Some(false),
            output_prefix: None,
            output_suffix: None,
            output_serial: Some(false),
        }
    }
}

impl Config {
    pub fn merge(&mut self, parent: &Self) {
        macro_rules! m {
            ( $( $key:ident ),* ) => {
                $(
                    if self.$key.is_none() && parent.$key.is_some() {
                        self.$key = parent.$key.clone();
                    }
                )*
            };
        }
        // javascript: console.log(`{{ struct fields }}`.replace(/pub\s|:.+?>/g,''))
        m!(
            parent,
            threads_count,
            ignore_panic,
            repeat_count,
            pipe,
            program,
            args_template,
            current_dir,
            input_list,
            input_absolute,
            output_dir,
            output_absolute,
            output_extension,
            output_recursive,
            output_force,
            output_prefix,
            output_suffix,
            output_serial
        );
    }
}

#[derive(Deserialize)]
pub struct Profile {
    presets: HashMap<String, Config>,
    pub current: Option<String>,
    pub export: Option<Vec<String>>,
    pub log_level: Option<i32>,
    pub gui: Option<String>,
}

impl Profile {
    fn fit(mut self) -> Self {
        self.export = self.export.or(Some(Vec::new()));
        self.log_level = self.log_level.or(Some(2));
        self
    }

    fn get(&self, name: &str) -> Result<Config, Error> {
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
                current.merge(parent);
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
            current.merge(parent);
        }
        current.merge(&Default::default());

        Ok(current)
    }

    pub fn get_current(&self) -> Result<Config, Error> {
        self.get(self.current.as_ref().unwrap())
    }

    pub fn keys(&self) -> Vec<&String> {
        let list = self.export.as_ref().unwrap();
        self.presets.keys().filter(|k| list.contains(k)).collect()
    }

    pub fn from_toml(toml_str: &str) -> Result<Self, Error> {
        Ok(Self::fit(toml::from_str(toml_str).map_err(|e| Error {
            kind: ErrorKind::Config,
            message: "error while config file deserialize".to_string(),
            inner: Box::new(e),
        })?))
    }

    pub fn from_default_file() -> Result<Self, Error> {
        let path = env::current_exe().unwrap();
        if let Ok(text) = fs::read_to_string(&path.with_extension("toml")) {
            return Self::from_toml(&text);
        }
        Err(Error {
            kind: ErrorKind::Config,
            message: "config file not found".to_string(),
            ..Default::default()
        })
    }
}
