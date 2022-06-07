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
