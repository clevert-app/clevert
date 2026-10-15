# AGENTS.md

This AGENTS.md is for only current dir, not for whole project.

你首先完整阅读 ./build.sh , 这是个编译出多合一 multi-call 工具的脚本。里面还包含了一些对代码的修补等。

我们现在正在进行 pgo 的工作，希望实现更好的优化。

如你所见，我刚才执行了一些编译，profile，然后我编辑 build.sh ，使用之前生成的 profile，再次编译，得到 pgo 之后的程序。

请不要在不必要的时候执行 ./build.sh prepare ，此命令会清除 build 文件夹。删除生成出的 profiling 文件。

我在得到 pgo 后的程序 $dist_dir/zcodecs 之后，使用它来测试，也就是 ./build.sh test , 结果发现效果并不显著。

由于 pgo 的 profiling 比较慢，编译也慢，所以，请你小心。 ./build.sh profile 可能会需要等待几分钟。

所以，现在你的任务是，帮我分析，尝试调整和优化。我希望能改善性能。另外，我还发现似乎 llvm 编译出的二进制比 gcc 的要慢一些？请你帮我多试错，不要害怕失败。谢谢你。


the build.sh is our build script, you should run `./build.sh build` to produce `/media/kkocdko/KK_TMP_1/zcodecs/dist/zcodecs` binary.

Then we can test the zipalign

```sh
cd /media/kkocdko/KK_TMP_1/zcodecs/dist
echo llvm_1 ; time ZIPALIGN_THREADS=1 ./zcodecs_llvm zipalign -f -z -P 4 4 y.apk y_llvm_1.apk
echo llvm_mt_1 ; time ZIPALIGN_THREADS=1 ./zcodecs zipalign -f -z -P 4 4 y.apk y_llvm_mt_1.apk
echo llvm_mt_4 ; time ZIPALIGN_THREADS=4 ./zcodecs zipalign -f -z -P 4 4 y.apk y_llvm_mt_4.apk
```

my result:

```

```



the old `zcodecs_llvm` is build without multi-thread patch.

I found that in single thread, old one without multi-thread patch is faster, why, can we improve the implement to fix this issue?

Should found the reason, do not simply take a if branch to run non-threaded logic.

You can edit `~/misc/code/clevert/temp/zcodecs/temp/build/zipalign/*.h *.cpp` files on the fly, not need to edit the patch and run `prepare`. Just `build` it.

