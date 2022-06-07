use crate::action::Action;
use crate::config::{self, Profile};

use std::io;

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
                profile.current = Some(preset_name.clone());
            }
            _ => {
                println!("not a legal index");
                continue;
            }
        };
    }
    println!("you choosed the preset {}", profile.current.unwrap());
    let config = profile.get_current()?;
    let action = Action::new(&config)?;
    action.start();

    Ok(())
}
