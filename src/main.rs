use convevo::*;
use std::env;
use std::io;
use std::process::Command;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, SystemTime};

fn cli_run() -> Result<(), Error> {
    let mut profile = Profile::from_default_file()?;

    if profile.cli_interactive.unwrap() {
        let keys = profile.keys();
        log!("presets = {{");
        for (i, k) in keys.iter().enumerate() {
            log!(" {:>3} : {k}", i);
        }
        log!("}}");
        log!(state:"input preset index: ");
        let choice = &mut String::new();
        io::stdin().read_line(choice).unwrap();
        let choice = choice.trim().parse::<usize>().ok();
        if let Some(&name) = choice.and_then(|i| keys.get(i)) {
            let name = name.clone(); // fight with borrow checker...
            profile.current = Some(name);
        } else {
            return Err(Error {
                kind: ErrorKind::Config,
                message: "input preset index invalid".to_string(),
                ..Default::default()
            });
        }
    } else if profile.current.is_none() {
        return Err(Error {
            kind: ErrorKind::Config,
            message: "need nither `cli_interactive` or `current` to generate config".to_string(),
            ..Default::default()
        });
    }

    let mut config = profile.get_current()?;

    let args: Vec<String> = env::args().skip(1).collect();
    // log!("env::args = {:?}", &args);
    let is_switch = |i: &&String| i.starts_with('-');
    // let switches: Vec<&String> = args.iter().take_while(is_switch).collect();
    let inputs: Vec<&String> = args.iter().skip_while(is_switch).collect();
    if !inputs.is_empty() {
        let list = inputs.iter().map(|s| String::from(*s)).collect();
        config.input_list = Some(list);
    }

    // the Action is one-off, change Config and then new an Action
    let action = Action::new(&config)?;
    action.start();

    // command operations
    if profile.cli_interactive.unwrap() {
        let action = Arc::clone(&action);
        thread::spawn(move || loop {
            let mut input = String::new();
            io::stdin().read_line(&mut input).unwrap();
            match input.trim() {
                "s" => {
                    log!("operation <s> triggered, action stopped");
                    action.stop().unwrap();
                    break;
                }
                op => log!(warn:"unknown operation {op}"),
            };
        });
    }

    // progress message
    if profile.cli_log_level.unwrap() >= 2 {
        let action = Arc::clone(&action);
        thread::spawn(move || loop {
            let (finished, total) = action.progress();
            log!(state:"progress = {finished} / {total}\t");
            if finished == total {
                break;
            }
            thread::sleep(Duration::from_millis(1000));
        });
    }

    let begin_time = SystemTime::now();

    let wait_result = action.wait();

    // print a '\n' for progress message
    if profile.cli_log_level.unwrap() >= 2 {
        println!();
    }

    if profile.cli_log_level.unwrap() >= 2 {
        log!("took {:.2}s", begin_time.elapsed().unwrap().as_secs_f64());
    }

    wait_result?;
    Ok(())
}

// const HELP_TEXT: &str = r#"Usage: convevo [switches] [input_items]"#;

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
    match cli_run() {
        Ok(()) => log!("completed"),
        Err(e) => log!(error:"error = {:?}",e),
    }
}
