> # ***WARNING: This project is still developing***

# convevo

[![CI](https://img.shields.io/github/workflow/status/convevo/convevo/CI?color=2a4)](https://github.com/convevo/convevo/actions)
[![Download](https://img.shields.io/github/downloads/convevo/convevo/total?color=2a4)](https://github.com/convevo/convevo/releases#:~:text=Assets)
[![License](https://img.shields.io/github/license/convevo/convevo?color=2a4)](LICENSE)

Extensible file converter.

## Intro

Today's file convertors always focus on a few file types, they build in some library like FFmpeg and provide a GUI for users.

But in my opinion, it's not enough and we couldn't stop at this. So *convevo* was born:

* To be a universal solution. You should not care about different software's different behavior.

* Parallelized. Let's take advantage of all of your CPU cores.

* Flexible and extensible. Load file type supports from `profile pack`, you could even make your own `profile pack` to support more files.

## Examples

```toml
[order]
parent = 'ffmpeg_mp3'

[presets.global]
input_dir = '.\input'
output_dir = '.\output'
threads_count = 0 # set to process count

[presets.ffmpeg]
program = 'Z:\ffmpeg-n4.4-17-win64-gpl-shared\bin\ffmpeg.exe'
args_template = '-y -i {input_file} {args_switches} {output_file}'

[presets.ffmpeg_mp3]
parent = 'ffmpeg'
args_switches = '-c:a libmp3lame -b:a 192k -q:a 0'
# args_switches = '-af volume=-10dB' # Change audio volume
output_extension = 'mp3'

[presets.ffmpeg_extract_audio]
parent = 'ffmpeg'
args_switches = '-vn -sn -c:a copy -y -map 0:a:0'
output_extension = 'm4a'

[presets.ffmpeg_slice]
parent = 'ffmpeg'
args_switches = '-ss 00:01:23.00 -to 00:02:34.00 ' # -ss <Start> | -to <End>

[presets.inkscape_pdf]
program = 'Z:\inkscape-1.1-x64\bin\inkscape.exe'
args_template = '--pdf-page {repeat_num} {args_switches} -o {output_file} {input_file}'
output_suffix_serial = true
# repeat_count = 50 # page count

[presets.inkscape_pdf2png]
parent = 'inkscape_pdf'
args_switches = '--export-type png --export-width 2560  --export-background #ffffff --pdf-poppler'
output_extension = 'png'
```

## Todo List

0. Help document and Intro.
1. TUI.
2. Test on MacOS.
3. Profile packs.
4. Debug options, output command info. But [seem troublesome](https://github.com/rust-lang/rust/issues/44434).
5. StdIn.
6. Change some config fields to no-optional?

## Note

```
https://wiki.inkscape.org/wiki/Using_the_Command_Line
https://inkscape.org/doc/inkscape-man.html
https://github.com/amadvance/advancecomp
```

## Alternative

- [Format Factory](https://pcfreetime.com/formatfactory/)

- [XnConvert](https://xnview.com/en/xnconvert/)
