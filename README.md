> # **_WARNING: This project is still developing_**

```sh
node --experimental-detect-module clevert.js
```

# clevert

[![CI](https://img.shields.io/github/workflow/status/kkocdko/clevert/CI?color=2a4)](https://github.com/kkocdko/clevert/actions)
[![Download](https://img.shields.io/github/downloads/kkocdko/clevert/total?color=2a4)](https://github.com/kkocdko/clevert/releases)
[![License](https://img.shields.io/github/license/kkocdko/clevert?color=2a4)](LICENSE)

The CLEver conVERTer.

## Intro

Today's file convertors always focus on a few formats. They wrap some libraries like FFmpeg into a GUI.

It's not enough and we couldn't stop at this. So _clevert_ was born:

- To be a universal solution. You don't have to care about different software's different behavior.

- Parallelized. Let's take advantage of all CPU cores.

- Flexible and extensible. Load file type supports from `profile pack`, even make your own `profile pack` to support more files.

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

## Note

```
https://wiki.inkscape.org/wiki/Using_the_Command_Line
https://inkscape.org/doc/inkscape-man.html
https://github.com/amadvance/advancecomp
https://getbem.com/naming/
https://blogs.igalia.com/compilers/2023/06/12/quickjs-an-overview-and-guide-to-adding-a-new-feature/
https://github.com/quickjs-ng/quickjs
https://github.com/openwebf/quickjs
https://github.com/alfg/ffmpeg-commander
https://github.com/MattMcManis/Axiom
```

## Alternative

- [Format Factory](http://www.pcfreetime.com/formatfactory/)

- [XnConvert](https://www.xnview.com/en/xnconvert/)

<!-- <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" style="background:#009688;stroke:#fff"><path d="M11 1 7 3l4 8-4-8-2 1 4 8-4-8-2 1 4 8-4-8-3-6 3 6"/></svg> -->

## The Future

We're reconsidering the future of this project.

### Extension

- Extension system by QuickJS or JerryScript. The part that interacts with JS needs to be isolated.

- Official extensions includes ImageMagick and FFmpeg.

- Shell script in extension must be tested on busybox ash, then using busybox-w32 on windows.

- Keep the extension simple and editable, for new contributors.

### Interface

Should be two UI implement:

- Web based ui, for all users from beginners to SAAS deploy.

- Electron or [miniblink](https://github.com/weolar/miniblink49/releases) for windows.

- Simple interactive console interface. For lite users.

### Working Mode

There are two mode, static mode and dynamic mode.

- Static mode generate all commands and arguments ahead-of-time, to reach the highest performance.

- Dynamic mode run your custom logic before each command.
