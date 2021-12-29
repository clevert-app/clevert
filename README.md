> # ***WARNING: This project is still developing***

# convevo

[![CI](https://img.shields.io/github/workflow/status/convevo/convevo/CI?color=2a4)](https://github.com/convevo/convevo/actions)
[![Download](https://img.shields.io/github/downloads/convevo/convevo/total?color=2a4)](https://github.com/convevo/convevo/releases#:~:text=Assets)
[![License](https://img.shields.io/github/license/convevo/convevo?color=2a4)](LICENSE)

Flexible cli assistant for file conversion, etc.

## Intro

Today's file convertors always focus on a few file types, they build in some library like FFmpeg and provide a GUI for users.

But in my opinion, it's not enough and we couldn't stop at this. So *convevo* was born:

* To be a universal solution. You should not care about different software's different behavior.

* Parallelized. Let's take advantage of all of your CPU cores.

* Flexible and extensible. Load file type supports from `profile pack`, you could even make your own `profile pack` to support more files.

## Note

```
https://wiki.inkscape.org/wiki/Using_the_Command_Line
https://inkscape.org/doc/inkscape-man.html
```

## Todo List

0. Help document and Intro.
1. TUI? Drag and drop supports.
2. StdIn.
3. Debug options, output command info. But [seem troublesome](https://github.com/rust-lang/rust/issues/44434).
4. Profile packs.
5. Test on MacOS.

## Alternative

- [Format Factory](https://pcfreetime.com/formatfactory/)

- [XnConvert](https://xnview.com/en/xnconvert/)
