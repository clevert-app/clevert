use convevo::*;
use std::process::Command;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, SystemTime};

fn cli_run() -> Result<(), Error> {
    let mut cfg = Config::from_default_file()?;
    let args: Vec<String> = std::env::args().skip(1).collect();
    if cfg.cli_log_level.unwrap() >= 3 {
        log!("env::args = {:?}", &args);
    }

    let is_switch = |i: &&String| i.starts_with('-');
    // let switches: Vec<&String> = args.iter().take_while(is_switch).collect();
    let inputs: Vec<&String> = args.iter().skip_while(is_switch).collect();

    if !inputs.is_empty() {
        let list = inputs.iter().map(|s| String::from(*s)).collect();
        cfg.input_list = Some(list);
    }

    // `Order` is one-off, change config on UI and then create a new `Order`.
    let order = Arc::new(Order::new(&cfg)?);
    order.start();

    // command operation
    if cfg.cli_operation.unwrap() {
        let order = Arc::clone(&order);
        thread::spawn(move || loop {
            let mut input = String::new();
            std::io::stdin().read_line(&mut input).unwrap();
            match input.trim() {
                "s" => {
                    log!("operation <s> triggered, order stopped");
                    order.stop().unwrap();
                    break;
                }
                op => log!(warn:"unknown operation {op}"),
            };
        });
    };

    // progress message
    if cfg.cli_log_level.unwrap() >= 2 {
        let order = Arc::clone(&order);
        thread::spawn(move || loop {
            let (finished, total) = order.progress();
            log!(state:"progress = {finished} / {total}");
            if finished == total {
                break;
            }
            thread::sleep(Duration::from_millis(1000));
        });
    }

    order.wait()?;

    // print a '\n' for progress message
    if cfg.cli_log_level.unwrap() >= 2 {
        println!();
    }

    Ok(())
}

// const HELP_TEXT: &str = r#"Usage: convevo [switches] [input_items]"#;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // https://github.com/SergioBenitez/yansi/issues/25
    #[cfg(windows)]
    if !yansi::Paint::enable_windows_ascii() {
        yansi::Paint::disable()
    }

    let begin_time = SystemTime::now();

    let args: Vec<String> = std::env::args().skip(1).collect();
    #[cfg(windows)]
    if !args.contains(&"--no-wrap".into()) && !std::env::var("PROMPT").is_ok() {
        // manually panic handling, because the `catch_unwind` is not always
        // stable and it's inapplicable when `panic='abort'` on `Cargo.toml`
        let mut cmd = Command::new(std::env::current_exe()?);
        cmd.arg("--no-wrap").args(args).spawn()?.wait()?;
        log!("press <enter> key to exit");
        std::io::stdin().read_line(&mut String::new())?;
        return Ok(());
    }
    match cli_run() {
        Ok(()) => log!("completed"),
        Err(e) => log!(error:"error = {:?}",e),
    }

    log!("took {:.2}s", begin_time.elapsed()?.as_secs_f64());
    Ok(())
}
