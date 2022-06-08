use crate::action::Action;
use crate::config::Profile;
use std::io;
use terminal_size::terminal_size;

/*
CLEVERT 
*/
pub fn run(mut profile: Profile) -> Result<(), String> {
    for k in profile.exports.as_ref().unwrap() {
        println!("{k}");
    }
    loop {
        println!("please enter the preset index: ");
        let mut i = String::new();
        io::stdin().read_line(&mut i).unwrap();
        match i
            .parse::<usize>()
            .ok()
            .and_then(|i| profile.exports.as_ref().unwrap().get(i))
        {
            Some(preset_name) => {
                println!("you choosed the preset {preset_name}");
                profile.current = Some(preset_name.clone());
                break;
            }
            _ => {
                println!("not a legal index");
                continue;
            }
        };
    }
    let config = profile.get_current()?;
    let action = Action::new(&config)?;
    action.start();

    Ok(())
}
