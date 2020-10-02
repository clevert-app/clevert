use std::convert::TryInto;
use toml::Value;

pub trait Seek {
    fn seek(&self, query: &str) -> Option<&Value>;
    fn seek_i32(&self, query: &str) -> Option<i32>;
    fn seek_bool(&self, query: &str) -> Option<bool>;
    fn seek_str(&self, query: &str) -> Option<String>;
    fn seek_vec_str(&self, query: &str) -> Option<Vec<String>>;
}

impl Seek for Value {
    fn seek(&self, query: &str) -> Option<&Value> {
        let mut target = self;
        for index in query.split('.') {
            target = target.get(index)?;
        }
        Some(target)
    }

    fn seek_i32(&self, query: &str) -> Option<i32> {
        self.seek(query)?.as_integer()?.try_into().ok()
    }

    fn seek_bool(&self, query: &str) -> Option<bool> {
        self.seek(query)?.as_bool()
    }

    fn seek_str(&self, query: &str) -> Option<String> {
        self.seek(query)?.as_str()?.try_into().ok()
    }

    fn seek_vec_str(&self, query: &str) -> Option<Vec<String>> {
        let mut vec = Vec::new();
        for item in self.seek(query)?.as_array()? {
            vec.push(item.as_str()?.to_string())
        }
        Some(vec)
    }
}
