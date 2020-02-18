use std::convert::TryInto;
use toml::value::Array;
use toml::value::Table;
use toml::Value;

pub trait Seek {
    fn seek(&self, key: &str) -> Result<&Value, String>;
    fn seek_table(&self, key: &str) -> Result<&Table, String>;
    fn seek_array(&self, key: &str) -> Result<&Array, String>;
    fn seek_str(&self, key: &str) -> Result<&str, String>;
    fn seek_i32(&self, key: &str) -> Result<i32, String>;
    fn seek_bool(&self, key: &str) -> Result<bool, String>;
}

impl Seek for Value {
    fn seek(&self, key: &str) -> Result<&Value, String> {
        self.get(key).ok_or(format!("entry '{}' not found", key))
    }

    fn seek_table(&self, key: &str) -> Result<&Table, String> {
        self.seek(key)?
            .as_table()
            .ok_or(format!("entry '{}' must be a table", key))
    }

    fn seek_array(&self, key: &str) -> Result<&Array, String> {
        self.seek(key)?
            .as_array()
            .ok_or(format!("entry '{}' must be an array", key))
    }

    fn seek_str(&self, key: &str) -> Result<&str, String> {
        self.seek(key)?
            .as_str()
            .ok_or(format!("entry '{}' must be a string", key))
    }

    fn seek_i32(&self, key: &str) -> Result<i32, String> {
        self.seek(key)?
            .as_integer()
            .ok_or(format!("entry '{}' must be a integer", key))?
            .try_into()
            .or_else(|_| Err(format!("entry '{}' must be a 32bit integer", key)))
    }

    fn seek_bool(&self, key: &str) -> Result<bool, String> {
        self.seek(key)?
            .as_bool()
            .ok_or(format!("entry '{}' must be a bool", key))
    }
}
