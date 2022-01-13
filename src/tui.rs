use convevo::*;
use std::rc::Rc;
use std::thread::sleep;

use cursive::align::HAlign;
use cursive::direction::Orientation::Horizontal;
use cursive::menu::MenuTree;
use cursive::theme::BorderStyle;
use cursive::theme::Palette;
use cursive::theme::Theme;
use cursive::traits::{Boxable, Nameable, Scrollable};
use cursive::views::Dialog;
use cursive::views::ResizedView;
use cursive::views::{Button, DummyView, EditView, LinearLayout, SelectView, TextView};
use cursive::Cursive;
use cursive::With;

pub fn tui_run(cfg: Config) -> Result<(), Error> {
    let mut siv = cursive::default();

    {
        use cursive::theme::{BaseColor::*, Color::*, PaletteColor::*};
        let mut theme = siv.current_theme().clone();
        theme.shadow = false;
        theme.borders = BorderStyle::Simple;
        theme.palette[Background] = Dark(Black);
        theme.palette[View] = Dark(Black);
        theme.palette[Primary] = Dark(White);
        theme.palette[Secondary] = Dark(White);
        theme.palette[TitlePrimary] = Dark(Yellow);
        theme.palette[TitleSecondary] = Dark(Yellow);
        siv.set_theme(theme);
    }

    siv.add_global_callback(cursive::event::Key::Esc, |s| {
        s.add_layer(
            Dialog::text("Exit?")
                .title("Alert")
                .button("Yes", |s| s.quit())
                .button("No", |s| {
                    s.pop_layer();
                }),
        )
    });
    siv.add_layer(first_layer());
    siv.run();

    Ok(())
}

fn first_layer() -> ResizedView<Dialog> {
    Dialog::around(
        LinearLayout::vertical().child(DummyView).child(
            SelectView::<String>::new()
                .on_submit(|s, v: &str| {})
                .with_all([
                    ("ffmpeg", "ffmpeg".into()),
                    ("ffmpeg_mp3", "ffmpeg_mp3".into()),
                    ("inkscape", "inkscape".into()),
                ])
                .with_name("preset_selector"),
        ),
    )
    .button("Next", |s| {
        s.pop_layer();
        s.add_layer(second_layer());
    })
    .title("Select a preset")
    .fixed_width(40)
}

fn second_layer() -> ResizedView<Dialog> {
    let path_input = |name: &str| {
        let name = name.to_string();
        LinearLayout::horizontal()
            .child(TextView::new(&name))
            .child(EditView::new().with_name(&name).full_width())
            .child(Button::new("Clear", move |s| {
                s.call_on_name(&name, |view: &mut EditView| view.set_content(""));
            }))
    };
    Dialog::around(
        LinearLayout::vertical()
            .child(DummyView)
            .child(path_input(" Input: "))
            .child(DummyView)
            .child(path_input("Output: ")),
    )
    .button("Back", |s| {
        s.pop_layer();
        s.add_layer(first_layer());
    })
    .button("Ok", |s| {
        s.pop_layer();
    })
    .title("Input and output path")
    .fixed_width(40)
}
