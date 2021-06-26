use cmdfactory::*;
use std::env;
use std::fs;
use std::process::Command;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, SystemTime};

#[test]
pub fn common() -> Result<(), Box<dyn std::error::Error>> {
    let src_content = r#"
        fn main() {
            let arg = std::env::args().last().unwrap();
            let num: u64 = arg.parse().expect("need number argument");
            let remainder = num % 2; // 0 or 1
            println!("{}", &remainder);
            eprintln!("{}", &remainder);
            let millis = remainder * 50 + 100;
            let dur = std::time::Duration::from_millis(millis);
            std::thread::sleep(dur);
        }
    "#;

    let mut dir = env::current_dir()?;
    dir.extend(["target", "_test_temp"]);
    fs::remove_dir_all(&dir)?;

    dir.push("input");
    fs::create_dir_all(&dir)?;

    for index in 0..3 {
        let mut p = dir.clone();
        p.push(index.to_string() + "");
        fs::write(p, "")?;
    }

    let src_path = dir.with_file_name("sleeper.rs");
    fs::write(&src_path, src_content)?;

    let exe_path = dir.with_file_name("sleeper");

    let mut command = Command::new("rustc");
    command.arg("-o");
    command.arg(&exe_path);
    command.arg(&src_path);
    let child = command.spawn()?;
    child.wait_with_output()?;

    let toml_str = r#"
    [presets.default]
    threads_count = 2
    repeat_count = 10
    skip_panic = false

    [presets.test]
    stdout_type = 'file'
    stdout_file = './target/_test_temp/stdout.log'
    stderr_type = 'file'
    stderr_file = './target/_test_temp/stderr.log'
    program = './target/_test_temp/sleeper'
    args_template = '{repeat_position}'
    args_switches = '-m 6'
    input_recursive = true
    output_recursive = true
    output_overwrite = true

    [order]
    parent = 'test'
    input_dir = './target/_test_temp/input'
    output_dir = './target/_test_temp/output'
    "#
    .to_string();
    let cfg = Config::from_toml(toml_str)?;
    let order = Arc::new(Order::new(&cfg)?);
    order.start();
    let time_now = SystemTime::now();
    let result = order.wait_result();
    println!("order took {:} ms", time_now.elapsed().unwrap().as_millis(),);
    result?;
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
.to_string();*/
