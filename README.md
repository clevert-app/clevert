> # **_WARNING: This project is still developing_**

# convevo

[![CI](https://img.shields.io/github/workflow/status/convevo/convevo/CI?color=2a4)](https://github.com/convevo/convevo/actions)
[![Download](https://img.shields.io/github/downloads/convevo/convevo/total?color=2a4)](https://github.com/convevo/convevo/releases#:~:text=Assets)
[![License](https://img.shields.io/github/license/convevo/convevo?color=2a4)](LICENSE)

Extensible file converter.

## Intro

Today's file convertors always focus on a few file types, they build in some library like FFmpeg and provide a GUI for users.

But in my opinion, it's not enough and we couldn't stop at this. So _convevo_ was born:

- To be a universal solution. You should not care about different software's different behavior.

- Parallelized. Let's take advantage of all of your CPU cores.

- Flexible and extensible. Load file type supports from `profile pack`, you could even make your own `profile pack` to support more files.

## Examples

```toml
current = 'ffmpeg_mp3'

[presets.global]
input_dir = 'input'
output_dir = 'output'

[presets.ffmpeg]
program = 'D:\Libraries\ffmpeg\5.0-gpl-shared\bin\ffmpeg.exe'

[presets.ffmpeg_mp3]
parent = 'ffmpeg'
args_template = '-y -i {input_file} -c:a libmp3lame -b:a 192k -q:a 0 {output_file}'
output_extension = 'mp3'

[presets.ffmpeg_slice]
parent = 'ffmpeg'
args_template = '-y -i {input_file} -ss 00:00:00 -to 00:00:00.01 -c copy {output_file}'

[presets.pngquant]
program = 'D:\Libraries\pngquant\2.17.0\pngquant.exe'
args_template = '--speed 1 --quality 0-50 --nofs -f -o {output_file} {input_file}'
output_extension = 'png'

[presets.waifu2x] # github.com/nihui/waifu2x-ncnn-vulkan
program = 'waifu2x-ncnn-vulkan'
args_template = '-i {input_file} -o {output_file} -n 0 -s 2'
output_extension = 'png'
threads_count = 1 # must be 1
```

## Todo List

1. Interactive cli.

2. Better argument generator.

3. Help document and Intro.

4. Profile packs.

5. StdIn.

## Note

```
https://wiki.inkscape.org/wiki/Using_the_Command_Line
https://inkscape.org/doc/inkscape-man.html
https://github.com/amadvance/advancecomp
```

## Alternative

- [Format Factory](https://pcfreetime.com/formatfactory/)

- [XnConvert](https://xnview.com/en/xnconvert/)
