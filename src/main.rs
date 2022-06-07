mod action;
mod config;
mod utils;
mod interactive;
pub use action::Action;
pub use config::{Config, Profile};
pub use utils::{Error, ErrorKind};

use std::env;
use std::io;
use std::process::Command;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

fn run() -> Result<(), Error> {
    let profile = Profile::from_default_file()?;

    // if let Some(v) = profile.gui {
    //     gui::run(&v);
    //     return Ok(());
    // }

    if profile.default.is_none() {
        return Err(Error {
            kind: ErrorKind::Config,
            message: "need `default` field to generate config".to_string(),
            ..Default::default()
        });
    }

    let mut config = profile.get_current()?;

    let input_list = env::args().skip(1);
    if input_list.size_hint().0 != 0 {
        config.input_list = Some(input_list.collect());
    }

    // the Action is one-off, change Config and then new an Action
    let action = Action::new(&config)?;
    action.start();

    // command operations
    thread::spawn({
        let action = Arc::clone(&action);
        move || loop {
            let mut input = String::new();
            io::stdin().read_line(&mut input).unwrap();
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
        }
    });

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

    if profile.log_level.unwrap() > 1 {
        log!("took {:.2}s", begin_time.elapsed().as_secs_f64());
    }

    wait_result?;
    Ok(())
}

// const HELP_TEXT: &str = r#"Usage: clevert [input_items]"#;

fn main() {
    #[cfg(windows)]
    {
        // https://github.com/SergioBenitez/yansi/issues/25
        if !yansi::Paint::enable_windows_ascii() {
            yansi::Paint::disable()
        }
        // linux x11?
        if env::var("PROMPT").is_err() {
            // manually panic handling, because the `catch_unwind` is not always
            // stable and it's inapplicable when panic='abort'
            let mut cmd = Command::new(env::current_exe().unwrap());
            let _ = cmd.args(env::args().skip(1)).env("PROMPT", "$P$G").status();
            log!("press <enter> key to exit");
            io::stdin().read_line(&mut String::new()).unwrap();
            return;
        }
    }

    if let Err(e) = run() {
        log!(error:"error = {:?}",e);
    }
}

#[cfg(test)]
mod tests;
