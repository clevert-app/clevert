use convevo::*;
use std::process::Command;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, SystemTime};

fn cli_run() -> Result<(), Error> {
    let mut profile = Profile::from_default_file()?;
    let args: Vec<String> = std::env::args().skip(1).collect();
    if profile.cli_log_level.unwrap() >= 3 {
        log!("env::args = {:?}", &args);
    }

    if profile.cli_interactive.unwrap() {
        let mut keys = profile.keys();
        keys.sort();
        log!("presets list = {{");
        for (i, k) in keys.iter().enumerate() {
            log!(" {:>3} : {k}", i);
        }
        log!("}}");
        log!(state:"input preset index: ");
        let choice = &mut String::new();
        std::io::stdin().read_line(choice).unwrap();
        let choice = choice.trim().parse::<usize>().ok();
        if let Some(&name) = choice.and_then(|i| keys.get(i)) {
            let name = name.clone(); // fight with borrow checker...
            profile.set_current(&name)?;
        } else {
            return Err(Error {
                kind: ErrorKind::Config,
                message: "input preset index invalid".to_string(),
                ..Default::default()
            });
        }
    } else if let Some(name) = &profile.current {
        let name = name.clone();
        profile.set_current(&name)?;
    } else {
        return Err(Error {
            kind: ErrorKind::Config,
            message: "need nither `cli_interactive` or `current` to generate config".to_string(),
            ..Default::default()
        });
    }

    let is_switch = |i: &&String| i.starts_with('-');
    // let switches: Vec<&String> = args.iter().take_while(is_switch).collect();
    let inputs: Vec<&String> = args.iter().skip_while(is_switch).collect();
    if !inputs.is_empty() {
        let list = inputs.iter().map(|s| String::from(*s)).collect();
        profile.set_input_list(list);
    }

    // the Action is one-off, change Config and then new an Action
    let action = Action::new(&profile)?;
    action.start();

    // command operations
    if profile.cli_interactive.unwrap() {
        let action = Arc::clone(&action);
        thread::spawn(move || loop {
            let mut input = String::new();
            std::io::stdin().read_line(&mut input).unwrap();
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

    let wait_result = action.wait();

    // print a '\n' for progress message
    if profile.cli_log_level.unwrap() >= 2 {
        println!();
    }

    wait_result?;
    Ok(())
}

// const HELP_TEXT: &str = r#"Usage: convevo [switches] [input_items]"#;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // https://github.com/SergioBenitez/yansi/issues/25
    #[cfg(windows)]
    if !yansi::Paint::enable_windows_ascii() {
        yansi::Paint::disable()
    }

    // TODO: move into cli_run() ???
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
