#[macro_export]
macro_rules! log {
    (warn:$($arg:tt)*) => {
        println!("{} {}", yansi::Paint::yellow("[convevo]"), format!($($arg)*));
    };
    (error:$($arg:tt)*) => {
        println!("{} {}", yansi::Paint::red("[convevo]"), format!($($arg)*));
    };
    (state:$($arg:tt)*) => {
        print!("\r{} {}\t", yansi::Paint::cyan("[convevo]"), format!($($arg)*));
        use std::io::Write;
        std::io::stdout().flush().unwrap();
    };
    ($($arg:tt)*) => {
        println!("{} {}", yansi::Paint::cyan("[convevo]"), format!($($arg)*));
    };
}
