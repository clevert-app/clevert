pub mod print_log {
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
        format!("[ foundry : {} ] {}", log_type, content)
    }
}
