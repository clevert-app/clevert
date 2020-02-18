pub mod print_log {
    pub fn info(content: impl std::fmt::Display) {
        println!("{}", msg("info", content));
    }

    pub fn warn(content: impl std::fmt::Display) {
        println!("{}", msg("warn", content));
    }

    pub fn error(content: impl std::fmt::Display) {
        eprintln!("{}", msg("error", content));
    }

    fn msg(log_type: &str, content: impl std::fmt::Display) -> String {
        format!("[ foundry | {} ]  {}", log_type, content)
    }
}
