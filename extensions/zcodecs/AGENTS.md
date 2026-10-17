# AGENTS.md

此 AGENTS.md 只适用于当前目录。也不要尝试去读取其他目录的 AGENTS.md。

Shell 脚本 `./build.sh` 的用途是编译出多合一 multi-call 工具。里面还包含了一些对代码的修补等。

用法和概述：

- 脚本开头定义 `dist_dir` 和 `temp_dir` 变量。约定 `$dist_dir` 存放打包好的源码，编译后的程序；`$temp_dir` 存放临时文件，编译过程中间产物。
- 使用 `./build.sh fetch` 下载源码，打包到 `$dist_dir/fetch.tar.zst`。确保后续步骤不再需要联网下载源码。此命令和下面的 `prepare` 命令只适配 linux。
- 运行 `./build.sh prepare` 会解压上个步骤的 tar 包，应用补丁，生成 multi-call 入口等，打包到 `$dist_dir/prepare.tar.zst`。可以将它复制到各个平台上供后续 `build` 命令使用。
- 在对应平台运行 `./build.sh build`，会解压 `$dist_dir/prepare.tar.zst` 到 `$temp_dir/build` 然后编译。多次运行 `build` 不会重复解压和覆盖。
- 前一个步骤没有启用 PGO 优化。若要使用 PGO，应当 `./build.sh build profile-generate` 编译出包含插桩的程序；然后 `./build.sh profile` 运行各种工作负载，收集性能数据；最后 `./build.sh build profile-use`。

调试与测试提示：

- WIP
- 可以在 `$temp_dir/build`
- 对于 Windows，应当使用 `ssh klc2 -t "C:\msys64\msys2_shell.cmd -clang64 -defterm -here -no-start"` 环境。持续与会话交互。

scp hi.txt klc2:C:/Users/klc2u1/hi.txt

```sh
cd /media/kkocdko/KK_TMP_1/zcodecs/dist
echo llvm_1 ; time ZIPALIGN_THREADS=1 ./zcodecs_llvm zipalign -f -z -P 4 4 y.apk y_llvm_1.apk
echo llvm_mt_1 ; time ZIPALIGN_THREADS=1 ./zcodecs zipalign -f -z -P 4 4 y.apk y_llvm_mt_1.apk
echo llvm_mt_4 ; time ZIPALIGN_THREADS=4 ./zcodecs zipalign -f -z -P 4 4 y.apk y_llvm_mt_4.apk
```

the old `zcodecs_llvm` is build without multi-thread patch.

I found that in single thread, old one without multi-thread patch is faster, why, can we improve the implement to fix this issue?

Should found the reason, do not simply take a if branch to run non-threaded logic.

You can edit `~/misc/code/clevert/temp/zcodecs/temp/build/zipalign/*.h *.cpp` files on the fly, not need to edit the patch and run `prepare`. Just `build` it.
