use clevert::*;
use std::env;
use std::io;
use std::process::Command;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

fn cli_run() -> Result<(), Error> {
    let profile = Profile::from_default_file()?;
    if profile.current.is_none() {
        return Err(Error {
            kind: ErrorKind::Config,
            message: "need `current` to generate config".to_string(),
            ..Default::default()
        });
    }

    let mut config = profile.get_current()?;

    let args = env::args().skip(1);
    if args.size_hint().0 != 0 {
        config.input_list = Some(args.collect());
    }

    // the Action is one-off, change Config and then new an Action
    let action = Action::new(&config)?;
    action.start();

    // command operations
    if profile.interactive.unwrap() {
        let action = Arc::clone(&action);
        thread::spawn(move || loop {
            let input = &mut String::new();
            io::stdin().read_line(input).unwrap();
            match input.trim() {
                "s" => {
                    log!("operation <s> triggered, action stopped");
                    action.stop().unwrap();
                    break;
                }
                op => {
                    log!(warn:"unknown operation {op}");
                }
            };
        });
    }

    // progress message
    if profile.log_level.unwrap() >= 2 {
        let action = Arc::clone(&action);
        thread::spawn(move || loop {
            let (finished, total) = action.progress();
            log!(stay:"progress = {finished} / {total}\t");
            if finished == total {
                break;
            }
            thread::sleep(Duration::from_millis(1000));
        });
    }

    let begin_time = Instant::now();

    let wait_result = action.wait();

    // print a '\n' for progress message
    if profile.log_level.unwrap() >= 2 {
        println!();
    }

    if profile.log_level.unwrap() >= 2 {
        log!("took {:.2}s", begin_time.elapsed().as_secs_f64());
    }

    wait_result?;
    Ok(())
}

// const HELP_TEXT: &str = r#"Usage: clevert [switches] [input_items]"#;

fn main() {
    // https://github.com/SergioBenitez/yansi/issues/25
    #[cfg(windows)]
    if !yansi::Paint::enable_windows_ascii() {
        yansi::Paint::disable()
    }

    let args: Vec<String> = env::args().skip(1).collect();
    #[cfg(windows)] // linux x11?
    if !args.contains(&"--no-wrap".into()) && env::var("PROMPT").is_err() {
        // manually panic handling, because the `catch_unwind` is not always
        // stable and it's inapplicable when `panic='abort'` on `Cargo.toml`
        let mut cmd = Command::new(env::current_exe().unwrap());
        let _ = cmd.arg("--no-wrap").args(args).status();
        log!("press <enter> key to exit");
        io::stdin().read_line(&mut String::new()).unwrap();
        return;
    }
    if let Err(e) = cli_run() {
        log!(error:"error = {:?}",e);
    }
}
