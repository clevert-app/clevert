use cmdfactory::*;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::thread;
use std::time::Duration;

#[test]
pub fn common() -> Result<(), Box<dyn std::error::Error>> {
    let dir = PathBuf::from("./target/_test_temp");
    let _ = fs::remove_dir_all(&dir); // Ignore error when dir not exists
    fs::create_dir_all(dir.join("input"))?;
    for i in 0..4 {
        fs::write(dir.join("input").join(i.to_string()), "")?;
    }

    let sleeper_src = r#"
    fn main() {
        let r = std::env::args().last().unwrap().parse::<u64>().unwrap() % 2;
        std::thread::sleep(std::time::Duration::from_millis(r * 25 + 50));
        print!("{}", r);
        eprint!("{}", r);
    }
    "#;
    fs::write(dir.join("sleeper.rs"), sleeper_src)?;
    let mut sleeper_build = Command::new("rustc");
    sleeper_build
        .arg("-o")
        .arg(dir.join("sleeper"))
        .arg(dir.join("sleeper.rs"));
    sleeper_build.spawn()?.wait_with_output()?;

    let cfg_toml = r#"
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
    args_template = '{args_switches} {repeat_num}'
    args_switches = '--example-switch'

    [order]
    parent = 'test'
    input_dir = './target/_test_temp/input'
    output_dir = './target/_test_temp/output'
    "#
    .to_string();
    let cfg = Config::from_toml(cfg_toml)?;
    let order = Order::new(&cfg)?;
    order.start();
    // thread::sleep(Duration::from_millis(75));
    // order.pause()?;
    // thread::sleep(Duration::from_millis(200));
    // order.resume()?;
    order.wait_result()?;

    let read_log_sum = |name| -> Result<u8, Box<dyn std::error::Error>> {
        let content = fs::read(dir.join(name))?;
        Ok(content.iter().map(|ch| ch - '0' as u8).sum())
    };
    assert_eq!(read_log_sum("stdout.log")?, 20);
    assert_eq!(read_log_sum("stderr.log")?, 20);

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
