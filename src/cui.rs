pub mod log {
    use std::fmt::Display;

    pub fn info(content: impl Display) {
        println!("{}", msg("info", content));
    }

    pub fn warn(content: impl Display) {
        println!("{}", msg("warn", content));
    }

    pub fn error(content: impl Display) {
        eprintln!("{}", msg("error", content));
    }

    fn msg(log_type: &str, content: impl Display) -> String {
        format!("[ cmdfactory : {} ] {}", log_type, content)
    }
}
