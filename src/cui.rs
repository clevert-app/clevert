pub mod log {
    use std::fmt::Display;

    fn message(kind: &str, content: impl Display) -> String {
        format!("[ cmdfactory : {} ] {}", kind, content)
    }

    pub fn info(msg: impl Display) {
        println!("{}", message("info", msg));
    }

    pub fn warn(msg: impl Display) {
        println!("{}", message("warn", msg));
    }

    pub fn error(msg: impl Display) {
        eprintln!("{}", message("error", msg));
    }
}
