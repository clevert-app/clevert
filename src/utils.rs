use std::fmt;

#[derive(Debug)]
pub enum ErrorKind {
    Config,
    Other,
    ExecutePanic,
}

#[derive(Debug)]
pub struct Error {
    pub kind: ErrorKind,
    pub inner: Box<dyn fmt::Debug + Send + Sync>,
    pub message: String,
}

impl Default for Error {
    fn default() -> Self {
        Self {
            kind: ErrorKind::Other,
            inner: Box::new(Option::<()>::None),
            message: String::new(),
        }
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str(&format!("{:?}", self))
    }
}

impl std::error::Error for Error {}

#[macro_export]
macro_rules! log {
    (warn:$($arg:tt)*) => {
        println!("{} {}", yansi::Paint::yellow("[clevert]").bold(), format!($($arg)*));
    };
    (error:$($arg:tt)*) => {
        println!("{} {}", yansi::Paint::red("[clevert]").bold(), format!($($arg)*));
    };
    (stay:$($arg:tt)*) => {
        print!("\r{} {}", yansi::Paint::cyan("[clevert]").bold(), format!($($arg)*));
        use std::io::Write;
        std::io::stdout().flush().unwrap();
    };
    ($($arg:tt)*) => {
        println!("{} {}", yansi::Paint::cyan("[clevert]").bold(), format!($($arg)*));
    };
}
