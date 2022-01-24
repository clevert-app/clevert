#[macro_export]
macro_rules! log {
    (warn:$($arg:tt)*) => {
        println!("{} {}", yansi::Paint::yellow("[convevo]").bold(), format!($($arg)*));
    };
    (error:$($arg:tt)*) => {
        println!("{} {}", yansi::Paint::red("[convevo]").bold(), format!($($arg)*));
    };
    (state:$($arg:tt)*) => {
        print!("\r{} {}\t", yansi::Paint::cyan("[convevo]").bold(), format!($($arg)*));
        use std::io::Write;
        std::io::stdout().flush().unwrap();
    };
    ($($arg:tt)*) => {
        println!("{} {}", yansi::Paint::cyan("[convevo]").bold(), format!($($arg)*));
    };
}
