mod log;
mod tui;
use convevo::*;
use std::process::Command;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, SystemTime};

fn normal_run(cfg: Config) -> Result<(), Error> {
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
    if cfg.cli_operation.unwrap() {
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

fn _get_help_text() -> &'static str {
    r#"Usage: convevo [switches] [input_items]"#
}

fn main() {
    let time_now = SystemTime::now();

    let mut cfg = Config::from_default_file().unwrap();
    let args: Vec<String> = std::env::args().skip(1).collect();
    if cfg.cui_msg_level.unwrap() >= 3 {
        log::info(format!("std::env::args = {:?}", &args));
    }
    let is_switch = |i: &&String| i.starts_with('-');
    let args_switches: Vec<&String> = args.iter().take_while(is_switch).collect();
    let args_inputs: Vec<&String> = args.iter().skip_while(is_switch).collect();
    if !args_inputs.is_empty() {
        let list = args_inputs.iter().map(|s| String::from(*s)).collect();
        cfg.input_list = Some(list);
    }
    if cfg.tui.unwrap()
        && args_switches
            .iter()
            .find(|i| **i == "--tui-inner")
            .is_none()
    {
        // manually panic handling, because the `catch_unwind` is not always
        // stable and it's inapplicable when `panic=abort` on `Cargo.toml`
        // drop local variables here to save memory?
        let mut cmd = Command::new(std::env::current_exe().unwrap());
        let _ = cmd.arg("--tui-inner").args(args).spawn().unwrap().wait();
        log::info("press any key to exit");
        std::io::stdin().read_line(&mut String::new()).unwrap();
        return;
    }
    if cfg.tui.unwrap() {
        tui::tui_run(cfg)
    } else {
        normal_run(cfg)
    }
    .unwrap();

    log::info(format!(
        "took {:.2} seconds",
        time_now.elapsed().unwrap().as_secs_f64(),
    ));
}
