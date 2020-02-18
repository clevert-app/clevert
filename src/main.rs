use foundry;
use foundry::cui::print_log;
use std::time::SystemTime;

fn main() {
    let now = SystemTime::now();
    match foundry::run() {
        Ok(_) => {}
        Err(e) => {
            print_log::error(e);
        }
    };
    print_log::info(format!(
        "all tasks completed, took {:.2} seconds",
        now.elapsed().unwrap().as_secs_f64()
    ));
}

/* ===== TODO LIST =====
kill the monitor thread?
Provide files list using process args
Print help info in console
Timer (timeout and interval)
Repl CUI?
*/
