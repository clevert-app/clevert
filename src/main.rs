use foundry::cui::print_log;
use std::time::SystemTime;

fn main() {
    let time_now = SystemTime::now();
    match foundry::run() {
        Ok(_) => {
            print_log::info("all tasks completed");
        }
        Err(e) => {
            print_log::error(&e);
            print_log::error(format!("error detail = {:?}", &e))
        }
    }
    print_log::info(format!(
        "ended, took {:.2} seconds",
        time_now.elapsed().unwrap().as_secs_f64(),
    ));
}
