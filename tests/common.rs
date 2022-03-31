use clevert::*;
use std::fs;
use std::io;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;
use std::thread;

#[test]
fn common() -> Result<(), Box<dyn std::error::Error>> {
    let dir = PathBuf::from("./target/_test");
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
    assert_eq!(read_log_sum("pipe.txt")?, 24);
    Ok(())
}

const CFG_TOML: &str = r#"
current = 'test'
export = ['test']
cli_interactive = true

[presets.global]
threads_count = 4
ignore_panic = false

[presets.test_base]
repeat_count = 6
input_dir = './target/_test/input'
output_dir = './target/_test/output'
pipe = '<inherit>'

[presets.test]
parent = 'test_base'
program = './target/_test/sleeper'
args_template = '--example-switch {repeat_num}'
pipe = './target/_test/pipe.txt'
"#;

const SLEEPER_SRC: &str = r#"
fn main() {
    let r = std::env::args().last().unwrap().parse::<u64>().unwrap() % 2;
    std::thread::sleep(std::time::Duration::from_millis(r * 25 + 50));
    print!("{}", r);
    eprint!("{}", r);
}
"#;
