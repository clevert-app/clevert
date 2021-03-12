use cmdfactory::cui::log;
use std::time::SystemTime;

fn main() {
    let time_now = SystemTime::now();
    match cmdfactory::run() {
        Ok(_) => log::info("all tasks completed"),
        Err(e) => log::error(format!("error = {:?}", &e)),
    };
    log::info(format!(
        "ended, took {:.2} seconds",
        time_now.elapsed().unwrap().as_secs_f64(),
    ));
}
