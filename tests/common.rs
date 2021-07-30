use cmdfactory::*;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

#[test]
pub fn common() -> Result<(), Box<dyn std::error::Error>> {
    let src_content = r#"
    fn main() {
        let arg = std::env::args().last().unwrap();
        let num: u64 = arg.parse().expect("need number argument");
        let remainder = num % 2; // 0 or 1
        println!("{}", &remainder);
        eprintln!("{}", &remainder);
        let millis = remainder * 25 + 50;
        let dur = std::time::Duration::from_millis(millis);
        std::thread::sleep(dur);
    }
    "#;

    let test_dir = PathBuf::from("./target/_test_temp");
    let _ = fs::remove_dir_all(&test_dir); // Ignore error when dir not exists
    fs::create_dir_all(test_dir.join("input"))?;

    for i in 0..4 {
        let file_path = test_dir.join("input").join(i.to_string());
        fs::write(file_path, "")?;
    }

    fs::write(test_dir.join("sleeper.rs"), src_content)?;
    let mut command = Command::new("rustc");
    command
        .arg("-o")
        .arg(test_dir.join("sleeper")) // Executable
        .arg(test_dir.join("sleeper.rs")); // Source
    let child = command.spawn()?;
    child.wait_with_output()?;

    let toml_str = r#"
    [presets.default]
    threads_count = 4
    repeat_count = 10
    skip_panic = false

    [presets.test_base]
    stdout_type = 'file'
    stdout_file = './target/_test_temp/stdout.log'
    stderr_type = 'file'
    stderr_file = './target/_test_temp/stderr.log'

    [presets.test]
    parent = 'test_base'
    program = './target/_test_temp/sleeper'
    args_template = '{args_switches} {repeat_position}'
    args_switches = '--example-switch'

    [order]
    parent = 'test'
    input_dir = './target/_test_temp/input'
    output_dir = './target/_test_temp/output'
    "#
    .to_string();
    let cfg = Config::from_toml(toml_str)?;
    let order = Arc::new(Order::new(&cfg)?);
    order.start();

    thread::sleep(Duration::from_millis(75));
    order.pause()?;
    thread::sleep(Duration::from_millis(200));
    order.resume()?;

    order.wait_result()?;

    let stdout = fs::read(test_dir.join("stdout.log"))?;
    let mut stdout_sum = 0;
    for part in String::from_utf8(stdout)?.split_whitespace() {
        stdout_sum += part.parse::<i32>()?;
    }
    assert_eq!(stdout_sum, 20);

    let stderr = fs::read(test_dir.join("stderr.log"))?;
    let mut stderr_sum = 0;
    for part in String::from_utf8(stderr)?.split_whitespace() {
        stderr_sum += part.parse::<i32>()?;
    }
    assert_eq!(stderr_sum, 20);

    Ok(())
}

/*
let toml_str = r#"
[presets.default]
threads_count = 2
repeat_count = 1
skip_panic = false

[presets.test_common]
stdout_type = 'file' # normal | ignore | file
stdout_file = './target/cmdfactory_test/stdout.log.txt'
stderr_type = 'file'
stderr_file = './target/cmdfactory_test/stderr.log.txt'
program = 'test_common_'
args_template = '{args_switches} {input_file} -o {output_file}'
args_switches = '-m 6'
input_recursive = true
output_recursive = true
output_overwrite = true
output_extension = 'webp'

[presets.timeout]
program = 'timeout'
args_template = '-t 3'

[presets.echo]
stdout_type = 'normal'
stderr_type = 'normal'
program = 'cmd'
args_template = '/c echo [ {input_file} ] [ {output_file} ]'
input_absolute = true
output_absolute = true

[order]
parent = 'cwebp'
input_dir = './target/cmdfactory_test/input_dir'
output_dir = './target/cmdfactory_test/output_dir'
output_prefix = 'out_'
output_suffix = '_out'
"#
.to_string();
*/
