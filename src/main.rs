mod log;
mod tui;
use convevo::*;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, SystemTime};

fn cui_run() -> Result<(), Error> {
    let cfg = {
        let mut config = Config::from_default_file()?;
        if config.cui_msg_level.unwrap() >= 3 {
            eprintln!("std::env::args = {:?}", std::env::args());
        }
        let args_input: Vec<String> = std::env::args().skip(1).collect();
        if !args_input.is_empty() {
            config.input_list = Some(args_input);
        }
        config
    };
    // `Order` is one-off, change config on UI and then create a new `Order`.
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
                    log::info("<t> terminate triggered");
                    order.terminate().unwrap();
                    break;
                }
                "c" => {
                    log::info("<c> cease triggered");
                    order.cease();
                    break;
                }
                "p" => {
                    log::info("<p> pause triggered");
                    order.pause().unwrap();
                }
                "r" => {
                    log::info("<r> resume triggered");
                    order.resume().unwrap();
                }
                "i" => {
                    log::info("<i> user turn off the command operation");
                    break;
                }
                op => {
                    log::warn(format!("<{}> unknown operation", op));
                }
            };
        });
    };

    order.wait_result()?;

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

fn main() {
    // tui::_tui_run();
    cui_main();
}
