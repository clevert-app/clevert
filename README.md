# clevert

[简体中文](#translation-zh-cn)

The universal file converter platform.

<details>
<summary>笔记</summary>

- http://127.0.0.1:9439/extensions/jpegxl/index.js

```sh
sed -i 's/deb.debian.org/mirrors.ustc.edu.cn/g' /etc/apt/sources.list.d/debian.sources
apt update ; apt install -y g++ make pkg-config cmake ninja-build curl

export ALL_PROXY="socks://192.168.1.128:1090"
echo "nameserver 223.5.5.5" > /etc/resolv.conf
sed -i 's@//.*archive.ubuntu.com@//mirrors.ustc.edu.cn@g' /etc/apt/sources.list
sed -i 's/security.ubuntu.com/mirrors.ustc.edu.cn/g' /etc/apt/sources.list
apt update
apt install -y curl/jammy
printf "deb [trusted=yes] http://apt.llvm.org/jammy/ llvm-toolchain-jammy-18 main\ndeb-src [trusted=yes] http://apt.llvm.org/jammy/ llvm-toolchain-jammy-18 main\n" >> /etc/apt/sources.list
apt update
apt install -y cmake g++ make
apt install -y clang-18/llvm-toolchain-jammy-18
```

## 编译优化

- https://gcc.gnu.org/onlinedocs/gcc/Instrumentation-Options.html#Instrumentation-Options
- https://gist.github.com/daniel-j-h/c4b109bff0b717fc9b24
- https://github.com/zamazan4ik/awesome-pgo/#pgo-support-in-programming-languages-and-compilers
- https://rigtorp.se/notes/pgo/
- https://github.com/llvm/llvm-project/blob/main/bolt/README.md (但是 BOLT 似乎只对超大型程序效果显著)

```sh
clear ; ~/misc/apps/hyperfine -w 1 -r 5 './ect -3 ect_test_set/*'
```

## 开发进度

- [x] 弄明白 electron nodeIntegration (不再使用)
- [x] 扩展 api 初步
- [x] 探索单 js 文件 集成的可实现性
- [x] converter 扩展 api
- [x] action 执行和调度器 初步
- [x] jpegxl multi-call binary 提供
- [x] webp multi-call binary 提供
- [x] webp 三端
- [x] jpegxl 三端
- [x] mp4box 三端
- [x] 加入 uname -a
- [x] rsync 四端
- [x] 修复 jpegxl macos 有问题，没静态链接。
- [x] 可能 (不可能，不支持嵌套虚拟化，已使用 warpbuild 替代) 可以在 mac 上跑虚拟机 linux/win arm64 ？ https://docs.orbstack.dev/machines/ https://docs.orbstack.dev/quick-start
- [x] jpegxl: 链接自己的 jpegli 而不是传统 libjpeg-turbo (暂时不考虑了)，linux 下使用系统的 zlib 动态链接
- [x] 不要尝试给 ect 增加不写入旧文件的逻辑。很麻烦很麻烦的。在扩展里面用复制文件的方法来替代。
- [x] ect 开启 PGO 优化
- [x] 下载包再解压的模式，不做流式解压了
- [x] 先不要纠结编译 assets 了
- [x] 实现一个代码量最少的，用于 bootstrap 的 node unzip
- [x] 完善扩展安装逻辑
- [x] zcodecs 合并 ect, webp, jpegxl
- [x] 完善 action 执行逻辑
- [x] 执行进度和扩展安装进度展示
- [x] electron 和流程重构，自动尝试新端口
- [x] config store
- [x] electron window state restore
- [x] 一个扩展的多个版本共存
- [x] 约定扩展目录是 id_1.2.3
- [x] config 最好是保存到本地，而不是浏览器。让浏览器成为一个无状态的东西会比较好。
- [x] 考虑前端如何传状态到后端？答：需要的时候实现 get-profile，add-profile 等操作即可。
- [x] i18n 如何设计？~~参考 typescript(typescript 的方案实现复杂)~~ ，参考 https://github.com/ivanhofer/typesafe-i18n/tree/main/packages/detectors
- [x] 与扩展互操作。导出到扩展，提供工具函数 (比如提供固定 locale=en-US) ~~(浏览器使用 import map，node 使用 module import hook)~~ 直接使用 globalThis 插进去
- [ ] CSS 与交互初步，成为一个能用的东西 抄 https://mui.com/material-ui/react-button/
- [ ] Rename `wait -> promise`
- [ ] 需要权衡实现难度和界面易用性，先画图
- [ ] 官方扩展 zcodecs
- [ ] 暂时先用内置 mirror 列表，以后可以考虑国内放一个或多个固定地址来存 mirror 的列表
- [ ] 多来源镜像下载 不多源并行了，找个快点的镜像就可以了，自动选择镜像什么的 cat ../a.tar.gz | ../7z -si -tgzip -so x | ../7z -si -ttar x
- [ ] 多弄一个扩展，展示用，一共至少要两个吧
- [ ] 关于扩展建议 out extension 的设计
- [ ] 用户保存的 profile，最近使用的 profile，extension-profile 三种进入入口
- [ ] ect 的 zip 和 gzip 优化需要先解压再压缩。ect 似乎不支持 unicode 文件名？这些都是可以考虑的，让扩展去做的补救措施。
- [ ] 支持 7z，zstd，xz 等，用扩展形式
- [ ] 更多扩展
- [ ] 扩展商店初步
- [ ] 改进 PGO 抽奖技术
- [ ] 为各个 linux 发行版打包 (debian, fedora, arch)
- [ ] 上线
- [ ] 能否命令行使用？给一些用户不使用 gui 的可能？以后再做
- [ ] 支持 gtk webkit？tauri？

## 扩展与营销灵感

- https://github.com/pemistahl/grex?tab=readme-ov-file#8-webassembly-support
- https://www.icebeer.top/用%E3%80%8C枯萎%E3%80%8D的技术做水平的思考/
- https://v2ex.com/t/1077985#r_15344339 (注意评论)
- https://v2ex.com/t/1042387
- https://v2ex.com/t/1073426
- https://v2ex.com/t/1065469
- https://v2ex.com/t/1059035
- https://v2ex.com/t/984548
- https://v2ex.com/t/1041478
- https://v2ex.com/t/1052395
- https://github.com/rsyncOSX/RsyncOSX
- https://v2ex.com/t/1044205
- https://github.com/rubickCenter/rubick
- https://github.com/nginx/nginx/archive/refs/tags/release-1.27.0.tar.gz
- https://github.com/ghtz08/kuguo-kgm-decoder
- https://github.com/jifengg/ffmpeg-script
- https://github.com/RimoChan/unvcode
- https://github.com/josStorer/RWKV-Runner
- https://github.com/qpdf/qpdf
- https://github.com/ArtifexSoftware/mupdf
- https://github.com/VikParuchuri/marker
- https://github.com/caj2pdf/caj2pdf
- https://github.com/HandBrake/HandBrake
- https://github.com/ArtifexSoftware/mupdf
- https://v2ex.com/t/1067501#reply5
- https://github.com/hzwer/Practical-RIFE/

- https://github.com/zincsearch/zincsearch
- https://github.com/meilisearch/meilisearch
- https://github.com/agourlay/zip-password-finder
- https://github.com/myfreeer/chrome-pak-customizer
- https://github.com/tjko/jpegoptim
- https://github.com/T8RIN/ImageToolbox
- https://github.com/caorushizi/mediago

## 仓库结构

关于仓库结构，我打算 monorepo，只用 clevert-app/clevert 这一个 repo，包括官方扩展，本体，文档，官网等。

## 技术选型

- 对 node / electron 都支持，node 支持开个 http 服务器到浏览器打开。
  - 以无 electron 环境的 node 为基准来开发，之后移植到 electron 会比较方便。node 大致是 electron 的子集。
- 核心/前端/扩展 均使用原生 html css js，采用 es module。类型检查使用 `// @ts-check` 和 jsdoc。
  - 使用 原生 js + jsdoc/tsdoc + `@ts-check` 而不是直接 typescript 的原因，是 typescript 需要转译，在需要支持扩展的情况下，得内置一个 tsc 或者其他编译器，整个流程非常麻烦。我希望使用 `// @ts-check` 和 jsdoc 来实现类似的规范开发的效果。如果扩展作者自己愿意用 ts，那就让他们自己转译。
- core -> extension -> action -> profile

## 扩展中的二进制

扩展中的二进制尽量偷别人的，减少重新编译。我们以后可以考虑做个备份以免删库。

对于项目提供的二进制不理想的情况（比如一大堆 shared lib，需要依赖发行版，或者 jpegxl 这样的可以用 multi call 减小体积的），就重新编译，并提供我们支持的几个平台。

对于扩展中二进制的编译：

我们自己编译的，统一用 zip -9

- linux 要求环境必须为主流的环境，保证 glibc，libgcc，libstdc++，libz 可用。其他依赖应当静态链接。标准是 docker debian:12。
- win 大多数时候使用 msys2 mingw，某些时候可能会需要 msys2 cygwin 比如 rsync，也尽量不要依赖 vc runtime。
- win arm64 可以用 linux arm64 跑 wine。windows 可能需要支持 win arm64，以后可以当成宣传的卖点？
- mac 目前只支持 arm64。

```sh
# https://stackoverflow.com/a/73388939
nm --dynamic --undefined-only --with-symbol-versions ./jpegxl | grep GLIBC | sed -e 's#.\+@##' | sort --unique
```

## 其他

这个项目的扩展应该不需要太复杂的功能，主要就是一堆表单而已，原生 web 技术应该够用

输出可能是不同类型的两个文件，比如视频文件 拆分成视频轨道和音频轨道

任务 要支持串联 action

action 要对应一个配置 json，可以用 json 配置。所有表单映射到这个 json

是否绝对路径输入由扩展决定

inputs
input:{
main:[]
a:[]
b:[]
}

https://indiehackertools.net/

https://medium.com/@felixrieseberg/javascript-on-the-desktop-fast-and-slow-2b744dfb8b55

https://registry.npmmirror.com/binary.html?path=electron/

<!-- <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style="background:#009688;stroke:#fff;stroke-width:10px"><path style="filter: drop-shadow(-2px 6px 1px #077);" d="M110 10 70 30l40 80-40-80-20 10 40 80-40-80-20 10 40 80-40-80-30-60 30 60"/></svg> -->

<!--
# old clevert presets

current = 'ffmpeg_comp_low'

[presets.global]
threads_count = 1
input_list = ['input']
output_dir = 'output'
# output_force = true
# output_suffix = '_out'
pipe = '<inherit>'

[presets.any2fdkaac]
program = '/home/kkocdko/misc/apps/any2fdkaac'
args_template = '{input_file} {output_file}'
output_extension = 'm4a'

[presets.cwebp]
program = 'D:\Libraries\libwebp\libwebp_1.0.0\bin\cwebp.exe'
args_template = '-m 6 -metadata none {input_file} -o {output_file} -q 50'
output_extension = 'webp'

[presets.cwebp_lossless]
parent = 'cwebp'
args_template = '-lossless -m 6 -sharp_yuv -metadata none {input_file} -o {output_file}'

[presets.cwebp_lossless_noalpha]
parent = 'cwebp'
args_template = '-lossless -m 6 -sharp_yuv -metadata none -noalpha {input_file} -o {output_file}'

[presets.ffmpeg]
program = '/home/kkocdko/misc/apps/ffmpeg'

[presets.ffmpeg_comp_low]
parent = 'ffmpeg'
output_extension = 'mp4'
args_template = '-i {input_file} -c:v libx264 -crf 32 -preset veryslow -r 30 -ac 1 -b:a 64k {output_file}'
# -ac 1
# -threads 4

[presets.ffmpeg_comp_mid]
parent = 'ffmpeg'
output_extension = 'mp4'
args_template = '-i {input_file} -c:v libx264 -crf 24 -preset veryslow -b:a 128k {output_file}'

[presets.ffmpeg_xw]
parent = 'ffmpeg'
output_extension = 'mp4'
args_template = '-i {input_file} -c:v libx264 -crf 24 -preset 8 -b:a 160k {output_file}'

[presets.ffmpeg_xw2]
parent = 'ffmpeg'
output_extension = 'mp4'
args_template = '-i {input_file} -c:v libx264 -crf 32 -preset 8 -filter:a "volume=4.0" -b:a 64k {output_file}'
# -filter:a "volume=0.5"

[presets.ffmpeg_m4a]
parent = 'ffmpeg'
args_template = '-y -i {input_file} -vn -c:a libfdk_aac -b:a 192k -ac 1 {output_file}'
output_extension = 'm4a'
# -ac 1

[presets.ffmpeg_mp3]
parent = 'ffmpeg'
args_template = '-i {input_file} -c:a libmp3lame -b:a 192k -q:a 0 {output_file}'
output_extension = 'mp3'

[presets.ffmpeg_copy]
parent = 'ffmpeg'
args_template = '-i {input_file} -c copy {output_file}'

[presets.ffmpeg_copy_audio]
parent = 'ffmpeg'
args_template = '-i {input_file} -vn -c:a copy {output_file}'
output_extension = 'm4a'

[presets.ffmpeg_slice]
parent = 'ffmpeg'
args_template = '-i {input_file} -ss 00:47:46.00 -to 00:57:16.00 -c copy {output_file}'

# [presets.ffmpeg_concat]
# ffmpeg -f concat -i list.txt -c copy output.mkv
# list.txt:
# file 'p1.mkv'
# file 'p2.mkv'

[presets.guetzli]
program = 'D:\Libraries\guetzli\guetzli.exe'
args_template = '--quality 90 {input_file} {output_file}'
output_extension = 'jpeg'

[presets.pngquant]
program = '/home/kkocdko/misc/apps/pngquant'
output_extension = 'png'

[presets.pngquant_docs]
parent = 'pngquant'
args_template = '--speed 1 --quality 0-5 --posterize 4 --nofs -f 8 -o {output_file} {input_file}'

[presets.pngquant_pics]
parent = 'pngquant'
args_template = '--speed 1 --quality 20-100 --nofs -o {output_file} {input_file}'

[presets.inkscape]
program = 'Z:\Inkscape_1.1.1\bin\inkscape.exe'

[presets.inkscape_svg2png]
parent = 'inkscape'
args_template = '--export-type png --export-width 2560 --export-background #ffffff -o {output_file} {input_file}'
output_extension = 'png'

[presets.inkscape_pdf2svg]
parent = 'inkscape'
args_template = '--export-type svg --pdf-poppler --pdf-page {repeat_num} -o {output_file} {input_file}'
output_extension = 'svg'
output_serial = true
# repeat_count = 50

[presets.waifu2x] # github.com/nihui/waifu2x-ncnn-vulkan
program = '.\Waifu2x_20210521\waifu2x-ncnn-vulkan.exe'
args_template = '-i {input_file} -o {output_file} -n 3 -s 1'
output_extension = 'png'
threads_count = 1

-->
</details>

## Translation

<details>
<summary id="translation-zh-cn">简体中文</summary>

> clevert - 通用的文件转换平台

</details>
