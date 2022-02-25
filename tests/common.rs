use convevo::*;
use std::fs;
use std::io;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;
use std::thread;

#[test]
fn common() -> Result<(), Box<dyn std::error::Error>> {
    let dir = PathBuf::from("./target/_test_temp");
    fs::remove_dir_all(&dir).ok(); // Ignore error when dir not exists
    fs::create_dir_all(dir.join("input"))?;
    for i in 0..4 {
        fs::write(dir.join("input").join(i.to_string()), "")?;
    }
    fs::write(dir.join("sleeper.rs"), SLEEPER_SRC)?;
    Command::new("rustc")
        .arg("-o")
        .arg(dir.join("sleeper"))
        .arg(dir.join("sleeper.rs"))
        .status()?;

    let profile = Profile::from_toml(CFG_TOML)?;
    let action = Action::new(&profile.get_current()?)?;
    action.start();
    thread::spawn({
        let action = Arc::clone(&action);
        move || action.wait()
    });
    action.wait()?;
    let read_log_sum = |name| -> io::Result<u8> {
        let content = fs::read(dir.join(name))?;
        Ok(content.iter().map(|ch| ch - '0' as u8).sum())
    };
    assert_eq!(read_log_sum("stderr.log")?, 20);
    Ok(())
}

const CFG_TOML: &str = r#"
current = 'test'
cli_interactive = false

[presets.global]
threads_count = 4
repeat_count = 10
ignore_panic = false
input_dir = './target/_test_temp/input'
output_dir = './target/_test_temp/output'

[presets.test_base]
stdout_type = 'ignore'
stderr_type = 'ignore'
stderr_file = './target/_test_temp/stderr.log'

[presets.test]
parent = 'test_base'
stderr_type = 'file'
program = './target/_test_temp/sleeper'
args_template = '--example-switch {repeat_num}'
"#;

const SLEEPER_SRC: &str = r#"
fn main() {
    let r = std::env::args().last().unwrap().parse::<u64>().unwrap() % 2;
    std::thread::sleep(std::time::Duration::from_millis(r * 25 + 50));
    eprint!("{}", r);
}
"#;
