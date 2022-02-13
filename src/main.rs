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

    if profile.current.is_none() && !profile.cli_interactive.unwrap() {
        return Err(Error {
            kind: ErrorKind::Config,
            // message: "".to_string(),
            ..Default::default()
        });
    }

    if profile.cli_interactive.unwrap() {
        let list = profile.keys();
        log!("presets list = {:?}", list);
        let choice = &mut String::new();
        std::io::stdin().read_line(choice).unwrap();
        if let Some(&name) = choice.parse::<usize>().ok().and_then(|i| list.get(i)) {
            profile.current = Some(name.clone());
        } else {
            return Err(Error {
                ..Default::default()
            });
        }
        log!("press <enter> key to start");
    }

    // TODO: Bring back arg input function
    // let is_switch = |i: &&String| i.starts_with('-');
    // // let switches: Vec<&String> = args.iter().take_while(is_switch).collect();
    // let inputs: Vec<&String> = args.iter().skip_while(is_switch).collect();

    // if !inputs.is_empty() {
    //     let list = inputs.iter().map(|s| String::from(*s)).collect();
    //     cfg.input_list = Some(list);
    // }

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
            log!(state:"progress = {finished} / {total}");
            if finished == total {
                break;
            }
            thread::sleep(Duration::from_millis(1000));
        });
    }

    action.wait()?;

    // print a '\n' for progress message
    if profile.cli_log_level.unwrap() >= 2 {
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
