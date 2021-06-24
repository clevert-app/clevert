use cmdfactory::*;
use std::borrow::Borrow;
use std::env;
use std::fs;
use std::process::Command;
use std::sync::Arc;
use std::thread;
use std::time::{Duration, SystemTime};

#[test]
pub fn main_test() -> Result<(), Error> {
    // let exe_path = env::current_exe().unwrap();
    // let target_dir = exe_path.parent().unwrap();
    // let test_dir = target_dir.join("cmdfactory_test_temp");
    // fs::create_dir_all(&test_dir).unwrap();

    // let mut cfg = Config::default();
    // cfg.program = Some("rustc".to_string());
    // cfg.args_template = Some("--version {args_switches}".to_string());
    // cfg.args_switches = Some("-v".to_string());

    //写文件 用系统命令显示 写入log 检测是否与写入的内容一致？

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

    (|| -> std::io::Result<()> {
        let mut dir_path = env::current_exe()?.parent().unwrap().to_path_buf();
        dir_path.push("_test_temp");
        std::fs::create_dir_all(&dir_path)?;

        dir_path.push("_any_item");

        let src_path = dir_path.with_file_name("test_common_sleeper.rs");
        fs::write(&src_path, src_content)?;

        let exe_path = dir_path.with_file_name("test_common_sleeper");

        let mut command = Command::new("rustc");
        command.arg("-o");
        command.arg(&exe_path);
        command.arg(&src_path);
        let child = command.spawn()?;
        let output = child.wait_with_output()?;
        println!("{:?},{:?}", output, src_path);
        Ok(())
    })()
    .unwrap();

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
    let cfg = Config::from_toml(toml_str)?;
    let order = Arc::new(Order::new(&cfg)?);
    order.start();
    Ok(())
}
