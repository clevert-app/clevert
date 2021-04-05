mod gui;
mod log;
use cmdfactory::*;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, SystemTime};

fn main() {
    cui_main();
}

fn cui_run() -> Result<(), Error> {
    // Order is one-off, Config is not one-off, change cfg on GUI and then new an Order.
    let cfg = Config::new()?;
    // let cfg = Config::_from_toml_test();

    let order = Arc::new(Order::new(&cfg)?);
    order.start();

    // Progress message
    if cfg.cui_msg_level.unwrap() >= 2 {
        let order = Arc::clone(&order);
        let interval = cfg.cui_msg_interval.unwrap() as u64;
        thread::spawn(move || loop {
            let (finished, total) = order.progress();
            log::info(format!("progress: {} / {}", finished, total));
            if finished == total {
                break;
            }
            thread::sleep(Duration::from_millis(interval));
        });
    }

    // Command operation
    if cfg.cui_operation.unwrap() {
        let order = Arc::clone(&order);
        thread::spawn(move || loop {
            let mut input = String::new();
            std::io::stdin().read_line(&mut input).unwrap();
            println!();
            match input.trim() {
                "t" => {
                    log::info("user terminate the cmdfactory");
                    order.terminate().unwrap();
                    break;
                }
                "c" => {
                    log::info("user cease the cmdfactory");
                    order.cease();
                    break;
                }
                "i" => {
                    log::info("user turn off the command op");
                    break;
                }
                _ => {
                    log::warn("unknown op");
                }
            };
        });
    };

    order.wait_result().map_err(|e| Error {
        kind: ErrorKind::ExecutePanic,
        inner: Box::new(e),
        ..Error::default()
    })?;

    Ok(())
}

fn cui_main() {
    let time_now = SystemTime::now();
    match cui_run() {
        Ok(_) => log::info("all tasks completed"),
        Err(e) => log::error(format!("error = {:?}", &e)),
    };
    log::info(format!(
        "took {:.2} seconds",
        time_now.elapsed().unwrap().as_secs_f64(),
    ));
}
