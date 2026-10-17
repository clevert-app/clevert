# AGENTS.md

This `AGENTS.md` applies only to the current dir. Do not read AGENTS.md from other dirs.

## Extension UI

TODO

## Build multi-call program

Shell script `./build.sh` patches code then build the multi-call tool.

### Usage and Overview

- The script defines `dist_dir` and `temp_dir` at the beginning. `$dist_dir` stores packaged source code and built programs; `$temp_dir` stores temporary files and intermediate build files.
- Run `./build.sh fetch` to download source code and package it into `$dist_dir/fetch.tar.zst`, ensures below steps do not need internet anymore. This and the `prepare` command support only Linux.
- The `./build.sh prepare` extracts the tar from the previous step, applies patches, generates the multi-call entry point, then packages into `$dist_dir/prepare.tar.zst`. We can copy it to various platforms for `build` command.
- Run `./build.sh build` on the target platform. It extracts `$dist_dir/prepare.tar.zst` into `$temp_dir/build` and compiles it. Running `build` multiple times will not extract or overwrite files again.
- The previous step shows usage with PGO disabled. To use PGO, run `./build.sh build profile-generate` to build the instrumented program; then `./build.sh profile` to run workloads and collect profile data; finally `./build.sh build profile-use`.

### Debugging and Testing Tips

- During debugging, such as fixing build errors, you can edit files directly in `$temp_dir/build` and run `build`. Once fixed, update the `prepare` command to ensure reproducible.
- For Windows, start a persistent ssh session with `ssh klc2 -t "C:\msys64\msys2_shell.cmd -clang64 -defterm -here -no-start"`, then run `mkdir -p /tmp/zcodecs`, `cd /tmp/zcodecs`, and interact with the tty.
- Run `scp build.sh $dist_dir/prepare.tar.zst klc2:C:/msys64/tmp/zcodecs/` to copy files to Windows.

### Old prompts

Below are old prompts, do not read

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
