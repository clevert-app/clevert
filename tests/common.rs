use convevo::*;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;
use std::thread;

#[test]
pub fn common() -> Result<(), Box<dyn std::error::Error>> {
    let dir = PathBuf::from("./target/_test_temp");
    let _ = fs::remove_dir_all(&dir); // Ignore error when dir not exists
    fs::create_dir_all(dir.join("input"))?;
    for i in 0i32..4 {
        fs::write(dir.join("input").join(i.to_string()), "")?;
    }

    fs::write(dir.join("sleeper.rs"), SLEEPER_SRC)?;
    Command::new("rustc")
        .arg("-o")
        .arg(dir.join("sleeper"))
        .arg(dir.join("sleeper.rs"))
        .spawn()?
        .wait_with_output()?;

    let mut profile = Profile::from_toml(CFG_TOML)?;
    profile.set_current(&profile.current.as_ref().unwrap().clone())?;
    let action = Action::new(&profile)?;
    action.start();

    thread::spawn({
        let action = Arc::clone(&action);
        move || action.wait().unwrap()
    });

    action.wait()?;

    let read_log_sum = |name| -> std::io::Result<u8> {
        let content = fs::read(dir.join(name))?;
        Ok(content.iter().map(|ch| ch - '0' as u8).sum())
    };
    assert_eq!(read_log_sum("stdout.log")?, 20);
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
stdout_type = 'file'
stdout_file = './target/_test_temp/stdout.log'
stderr_type = 'file'
stderr_file = './target/_test_temp/stderr.log'

[presets.test]
parent = 'test_base'
program = './target/_test_temp/sleeper'
args_template = '--example-switch {repeat_num}'
"#;

const SLEEPER_SRC: &str = r#"
fn main() {
    let r = std::env::args().last().unwrap().parse::<u64>().unwrap() % 2;
    std::thread::sleep(std::time::Duration::from_millis(r * 25 + 50));
    print!("{}", r);
    eprint!("{}", r);
}
"#;
