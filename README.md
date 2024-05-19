# clevert

[简体中文](#translation-zh-cn)

<details>
<summary>笔记</summary>

## 开发进度

- [x] 弄明白 electron nodeIntegration (不再使用)
- [x] 扩展 api 初步
- [x] 探索单 js 文件 集成的可实现性
- [x] converter 扩展 api
- [x] action 执行和调度器 初步
- [x] webp multi-call binary 提供
- [ ] 官方扩展 jpegxl
- [ ] 扩展商店初步

## 仓库结构

关于仓库结构，我打算 monorepo，只用 clevert-app/clevert 这一个 repo，包括官方扩展，本体，文档，官网等。

## 技术选型

- 对 node / electron 都支持，node 支持开个 http 服务器到浏览器打开。
  - 以无 electron 环境的 node 为基准来开发，之后移植到 electron 会比较方便。node 大致是 electron 的子集。
- 核心/前端/扩展 均使用原生 html css js，采用 es module。类型检查使用 `// @ts-check` 和 jsdoc。
  - 使用 原生 js + `@ts-check` 而不是直接 typescript 的原因，是 typescript 需要转译，在需要支持扩展的情况下，得内置一个 tsc 或者其他编译器，整个流程非常麻烦。我希望使用 `// @ts-check` 和 jsdoc 来实现类似的规范开发的效果。如果扩展作者自己愿意用 ts，那就让他们自己转译。

## 扩展中的二进制

扩展中的二进制尽量偷别人的，减少重新编译。我们以后可以考虑做个备份以免删库。

对于项目提供的二进制不理想的情况（比如一大堆 shared lib，需要依赖发行版，或者 jpegxl 这样的可以用 multi call 减小体积的），就重新编译，并提供我们支持的几个平台。

对于扩展中二进制的编译：

- linux 要求环境必须为主流的环境，保证 glibc，libgcc，libstdc++，libz 可用。其他依赖应当静态链接。
- win 大多数时候使用 msys2 mingw，某些时候可能会需要 msys2 cygwin 比如 rsync，也尽量不要依赖 vc runtime。
- mac 还没想好。

可能可以提供 macos arm64 环境: [flyci](https://flyci.net/) 和 [scaleway](https://console.scaleway.com/)

利用 macos arm64 环境，虚拟化来跑 linux arm64 和 win arm64 的编译，尽量避免交叉编译，减少折腾。

windows 可能需要支持 win arm64，以后可以当成宣传的卖点？高通那款芯片什么时候出啊。

## 其他

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

<!-- <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style="background:#009688;stroke:#fff;stroke-width:10px"><path style="filter: drop-shadow(-2px 6px 1px #077);" d="M110 10 70 30l40 80-40-80-20 10 40 80-40-80-20 10 40 80-40-80-30-60 30 60"/></svg> -->

</details>

## Translation

<details>
<summary id="translation-zh-cn">简体中文</summary>

> clevert - 可扩展文件转换器？

</details>
