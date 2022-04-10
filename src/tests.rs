use crate::{Action, Profile};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;
use std::thread;

#[test]
pub fn common() -> Result<(), Box<dyn std::error::Error>> {
    let dir = PathBuf::from("./target/_test");
    let _ = fs::remove_dir_all(&dir); // ignore error when dir not exists
    fs::create_dir_all(dir.join("input"))?;
    for i in 0..4 {
        fs::write(dir.join("input").join(i.to_string()), "")?;
    }
    fs::write(dir.join("sleeper.rs"), SLEEPER_SRC)?;
    Command::new("rustc")
        .current_dir(&dir) // do not pollute project dir
        .args(["-o", "sleeper", "sleeper.rs"])
        .status()?;
    let profile = Profile::from_toml(CFG_TOML)?;
    let action = Action::new(&profile.get_current()?)?;
    action.start();
    thread::spawn({
        let action = Arc::clone(&action);
        move || action.wait()
    });
    action.wait()?;
    drop(action); // drop file handlers also
    let piped = fs::read_to_string(dir.join("pipe.txt"))?;
    assert_eq!(piped.matches('1').count(), 24);
    Ok(())
}

const CFG_TOML: &str = r#"
current = 'test'
export = ['test']

[presets.global]
threads_count = 4
ignore_panic = false

[presets.test_base]
repeat_count = 6
input_list = ['./target/_test/input']
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
    std::thread::sleep(std::time::Duration::from_millis(r * 29 + 53));
    print!("{}", r);
    eprint!("{}", r);
}
"#;
