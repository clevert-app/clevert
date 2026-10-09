#!/bin/bash
set -e
trap exit INT
type git tar zstd cmake ninja nasm > /dev/null # apt-get install ccache ninja-build nasm
dist_dir=/media/kkocdko/KK_TMP_1/zcodecs/dist
temp_dir=/media/kkocdko/KK_TMP_1/zcodecs/temp
# dist_dir=$(pwd)
# temp_dir=$(pwd)
mkdir -p $dist_dir $temp_dir

export PATH="/usr/lib/ccache:$PATH" CMAKE_C_COMPILER_LAUNCHER=ccache CMAKE_CXX_COMPILER_LAUNCHER=ccache # ln -sf /media/kkocdko/KK_TMP_1/home/.cache/ccache ~/.cache/ccache

# goal: combine many modern codecs, into a single multi-call binary
# - use intel iccx? skip for now.
# ect is faster than google zopfli and https://github.com/MrKrzYch00/zopfli

if [ "$1" = fetch ]; then
  # === fetch the source code, pack without modify, make later steps offline
  mkdir -p $temp_dir/fetch
  cd $temp_dir/fetch
  # > ect
  curl -L https://github.com/fhanau/Efficient-Compression-Tool/archive/e711c5ea9d725d02db546ce926a66b91b68ecb3a.tar.gz | tar -zx
  mv Efficient-Compression-Tool-* ect
  curl -L https://github.com/pnggroup/libpng/archive/refs/tags/v1.6.59.tar.gz | tar -zx --strip-components 1 -C ect/src/libpng # ect use 1.6.58 but we use 1.6.59
  curl -L https://github.com/fhanau/mozjpeg/archive/6bdd1ad6c08eddddd2c4c70aa1161e5d3c4a6618.tar.gz | tar -zx --strip-components 1 -C ect/src/mozjpeg # ect mod version
  # > giflib
  curl -L https://deb.debian.org/debian/pool/main/g/giflib/giflib_5.2.2.orig.tar.gz | tar -zx
  mv giflib-* giflib
  # > webp
  curl -L https://github.com/webmproject/libwebp/archive/097153b2a4b33f5e4ffa9f4603f63902bbd79169.tar.gz | tar -zx
  mv libwebp-* webp
  # > jpegli
  curl -L https://github.com/google/jpegli/archive/031a0077f5799a6041004267fc12b956c1f52a20.tar.gz | tar -zx
  mv jpegli-* jpegli
  # > jxl
  curl -L https://github.com/libjxl/libjxl/archive/ef67fde2ec16d52e644c5a0969230b9a85e3eb31.tar.gz | tar -zx
  mv libjxl-* jxl
  cd jxl
  cat deps.sh | sed -E '/download_github +(testdata|third_party\/(zlib|libpng|libjpeg-turbo))/d' | bash
  rm -rf downloads third_party/skcms/profiles/*
  cd ..
  # > zipalign
  git clone --depth=1 --filter=blob:none --sparse --no-checkout https://android.googlesource.com/platform/build zipalign
  cd zipalign
  git checkout 045a3d6a3e359633a14853a5a5e1e4f2a11cbdae
  git sparse-checkout set tools/zipalign
  rm -rf .git
  cd ..
  # < now, pack all to tar
  tar --zstd -cf $dist_dir/fetch.tar.zst -C .. fetch
  rm -rf ../fetch/*
  exit
fi

if [ "$1" = prepare ]; then
  # === prepare for build, modify the source code, add multicall entries
  rm -rf $temp_dir/build
  mkdir -p $temp_dir/build
  cd $temp_dir/build
  tar -xf $dist_dir/fetch.tar.zst --strip-components 1
  # > ect
  mv ect/src/* ect/
  echo "" > ect/pngusr.h # the ect disabled some libpng features to reduce size, but other programs require full-featured libpng
  echo "#define DCT_ISLOW_SUPPORTED" >> ect/mozjpeg/jmorecfg.h # jxl needs this
  sed -i 's/int main(/extern "C" int cmd_ect_main(/' ect/main.cpp
  # > webp
  for applet in webpinfo cwebp dwebp gif2webp img2webp webpmux; do
    sed -i "s/int main(/int cmd_${applet}_main(/" webp/examples/$applet.c
  done
  # > jxl + jpegli
  tar -c -C jpegli . | tar -x --skip-old-files -C jxl
  sed -i -E \
    -e 's@lib/(base|cms|extras)/(types|cms|color_encoding|codestream_header)\.h@jxl/\2.h@g' \
    -e 's|lib/base/include_jpeglib.h|lib/extras/include_jpeglib.h|g' \
    -e 's|lib/base/|lib/jxl/base/|g' \
    -e 's@lib/(cms|extras)/(color_encoding_internal|simd_util)\.h@lib/jxl/\2.h@g' \
    -e 's|lib/extras/xyb_transform.h|lib/jxl/enc_xyb.h|g' \
    -e 's/Jpegli/Jxl/g; s/JPEGLI_/JXL_/g; s/JXL_(ERROR|WARN|TRACE|CHECK)\b/JPEGLI_\1/g' \
    jxl/lib/jpegli/* jxl/lib/extras/dec/jpegli.* jxl/lib/extras/enc/jpegli.* jxl/tools/cjpegli.cc jxl/tools/djpegli.cc
  sed -i 's/} JxlDataType;/& int jpegli_bytes_per_sample(JxlDataType data_type);/' jxl/lib/include/jxl/types.h
  ln -sf ../include/jxl/types.h jxl/lib/jpegli/types.h
  sed -i 's|#include "lib/extras/include_jpeglib.h"|& \n #include "lib/jxl/base/common.h" \n namespace jpegli { using namespace jxl; }|' jxl/lib/jpegli/common.h
  sed -i \
    -e 's/namespace jpegli {/namespace jxl {/' \
    -e 's/jpegli::/jxl::/g' \
    -e 's/namespace jpegli_tools {/& using namespace jpegxl::tools;/' \
    jxl/lib/extras/dec/jpegli.* jxl/lib/extras/enc/jpegli.* jxl/tools/cjpegli.cc jxl/tools/djpegli.cc
  echo '
    include(jpegli_lists.cmake)
    add_library(jpegli-static STATIC ${JPEGLI_INTERNAL_JPEGLI_SOURCES})
    target_compile_options(jpegli-static PRIVATE ${JPEGXL_INTERNAL_FLAGS})
    target_link_libraries(jpegli-static PUBLIC jxl_base hwy Threads::Threads)
    target_include_directories(jpegli-static PUBLIC ${JPEG_INCLUDE_DIRS})
    target_sources(jxl_extras-internal PRIVATE extras/dec/jpegli.cc extras/enc/jpegli.cc)
    target_link_libraries(jxl_extras-internal PRIVATE jpegli-static)
  ' >> jxl/lib/CMakeLists.txt
  echo '
    foreach(BINARY cjpegli djpegli)
      add_executable(${BINARY} ${BINARY}.cc)
      target_link_libraries(${BINARY} jpegli-static jxl_extras-internal jxl_threads jxl_tool)
    endforeach()
  ' >> jxl/tools/CMakeLists.txt
  for applet in jxlinfo cjxl djxl cjpegli djpegli; do
    file=jxl/tools/$applet.cc
    [ -e $file ] || file=jxl/tools/${applet}_main.cc
    sed -i "s/int main(/extern \"C\" int cmd_${applet}_main(/" $file
  done
  # > zipalign
  cd zipalign
  mv tools/zipalign/* .
  echo '
    #ifndef ZIPALIGN_COMPAT_H_
    #define ZIPALIGN_COMPAT_H_
    #include <errno.h>
    #include <stdint.h>
    #include <stdio.h>
    #include <unistd.h>
    #include <zlib.h>
    #include <vector>
    #include <cstdlib>
    #include <algorithm>
    #include <future>
    #include <thread>
    #include <deque>
    #include <memory>
    #if defined(__APPLE__) || !defined(off64_t)
    typedef off_t off64_t;
    #endif
    #define ALOGV(...) ((void)0)
    #define ALOGD(...) ((void)0)
    #define ALOGW(...) fprintf(stderr, __VA_ARGS__)
    #define ALOGE(...) fprintf(stderr, __VA_ARGS__)
    #define _Static_assert static_assert
    #define assert_or_exit(v) if (!(v)) { ALOGW("Zip: assert failed"); exit(1); }
    namespace android {
      typedef int32_t status_t; // from libutils/binder/include/utils/Errors.h
      const status_t OK = 0;
      const status_t UNKNOWN_ERROR = (-2147483647-1); // INT32_MIN value
      const status_t NO_MEMORY = -ENOMEM;
      const status_t INVALID_OPERATION = -ENOSYS;
      const status_t NAME_NOT_FOUND = -ENOENT;
      const status_t PERMISSION_DENIED = -EPERM;
      const status_t ALREADY_EXISTS = -EEXIST;
      template <typename T> using Vector = std::vector<T>;
      inline int ZipInflateFile(FILE* input_file, size_t compressed_length, void* out_buf, size_t uncompressed_length) {
        const size_t kBufSize = 32768; // https://android.googlesource.com/platform/system/core/+/refs/tags/android-11.0.0_r48/libziparchive/zip_archive.cc
        std::vector<uint8_t> read_buf(kBufSize);
        z_stream zstream = {};
        zstream.next_out = static_cast<unsigned char*>(out_buf);
        zstream.avail_out = uncompressed_length;
        int zerr = inflateInit2(&zstream, -MAX_WBITS);
        uint32_t remaining_bytes = compressed_length;
        while (zerr == Z_OK) {
          if (zstream.avail_in == 0 && remaining_bytes != 0) {
            const size_t read_size = (remaining_bytes > kBufSize) ? kBufSize : remaining_bytes;
            if (fread(&read_buf[0], 1, read_size, input_file) != read_size) {
              ALOGW("Zip: inflate read failed, not enough data was read");
              break;
            }
            remaining_bytes -= read_size;
            zstream.next_in = &read_buf[0];
            zstream.avail_in = read_size;
          }
          zerr = inflate(&zstream, Z_NO_FLUSH);
        }
        inflateEnd(&zstream);
        assert_or_exit(zstream.total_out == uncompressed_length && remaining_bytes == 0 && zerr == Z_STREAM_END);
        return 0;
      }
    }
    namespace zip_archive {
      struct Reader {};
      struct Writer { virtual bool Append(uint8_t* buf, size_t buf_size) = 0; };
    }
    inline int getZopfliLevel() {
      static const int level = []() {
        const char* s = getenv("ZIPALIGN_ZOPFLI_LEVEL");
        int v = s ? strtol(s, NULL, 10) : -1;
        return (3 <= v && v <= 9) ? v : 5;
      }();
      return level;
    }
    #endif
  ' > compat.h # zlialign needs android libutils, here is our compat implementation
  echo '
    using CompressionBuffer = std::unique_ptr<unsigned char, decltype(&free)>;
    struct CompressedEntry { CompressionBuffer data{nullptr, free}; size_t size = 0; };
    struct CompressionSlot { CompressedEntry result; std::thread worker; ~CompressionSlot() { if (worker.joinable()) worker.join(); } };
    static int nextEntry = 0;
    static const int threads = []() {
      const char* s = getenv("ZIPALIGN_THREADS");
      int v = s ? strtol(s, NULL, 10) : 1;
      return v <= 0 ? std::max((int)std::thread::hardware_concurrency(), 1) : v;
    }();
    static std::unique_ptr<CompressionSlot[]> slots(new CompressionSlot[threads]);
    static size_t head = 0, count = 0;
    if (count == 0) {
      nextEntry = 0;
      while (nextEntry < pSourceZip->getNumEntries() && pSourceZip->getEntryByIndex(nextEntry) != pSourceEntry)
        nextEntry++;
    }
    while (nextEntry < pSourceZip->getNumEntries() && count < threads) {
      const ZipEntry* entry = pSourceZip->getEntryByIndex(nextEntry++);
      if (!entry->isCompressed())
        continue;
      CompressionBuffer input(static_cast<unsigned char*>(pSourceZip->uncompress(entry)), free);
      assert_or_exit(input);
      size_t size = entry->getUncompressedLen();
      CompressionSlot& slot = slots[(head + count) % threads];
      slot.worker = std::thread([&slot, input = std::move(input), size]() {
        CompressedEntry result;
        if (size == 0) {
          unsigned char* data = static_cast<unsigned char*>(malloc(2)); // ect has bug on empty entry
          assert_or_exit(data);
          data[0] = 0x03, data[1] = 0x00;
          result.data.reset(data);
          result.size = 2;
        } else {
          ZopfliOptions options;
          ZopfliInitOptions(&options, getZopfliLevel(), 0, 0);
          unsigned char bitPointer = 0;
          unsigned char* output = nullptr;
          ZopfliDeflate(&options, true, input.get(), size, &bitPointer, &output, &result.size);
          result.data.reset(output);
        }
        slot.result = std::move(result);
      });
      count++;
    }
    assert_or_exit(count != 0);
    slots[head].worker.join();
    CompressedEntry compressed = std::move(slots[head].result);
    head = (head + 1) % threads;
    count--;
    assert_or_exit(compressed.data);
    assert_or_exit(fwrite(compressed.data.get(), 1, compressed.size, mZipFp) == compressed.size);
    pEntry->setDataInfo(uncompressedLen, compressed.size, pSourceEntry->getCRC32(), ZipEntry::kCompressDeflated);
  ' > mt.h
  sed -i -E 's|#include <(utils\|ziparchive)/|#include "compat.h" //|' *.h *.cpp
  sed -i \
    -e 's/mEntries.add(/mEntries.push_back(/g' \
    -e 's/mEntries.removeAt(i)/mEntries.erase(mEntries.begin()+i)/g' \
    -e 's/ZopfliInitOptions(&options)/ZopfliInitOptions(\&options,getZopfliLevel(),0,0)/' \
    -e 's/ZopfliDeflate(&options, 2,/ZopfliDeflate(\&options,/' \
    -e 's/malloc(unlen)/malloc(unlen?unlen:1)/' \
    -e '/const FileReader reader(mZipFp);/d' \
    -e '/BufferWriter writer(buf, unlen);/d' \
    -e 's/zip_archive::Inflate(reader, clen, unlen, &writer, nullptr)/ZipInflateFile(mZipFp, clen, buf, unlen)/' \
    ZipFile.cpp # replace official zopfli to ect, with ZIPALIGN_ZOPFLI_LEVEL(3-9) env var support
  sed -i '690,706c #include "mt.h"' ZipFile.cpp # with ZIPALIGN_THREADS support
  sed -i 's/int main(/extern "C" int cmd_zipalign_main(/' ZipAlignMain.cpp
  cd ..
  # > multicall
  echo '
    #include <stddef.h>
    #include <string.h>
    #include <stdio.h>
    #if defined(WIN32) || defined(_WIN32)
    #define PATH_SEPARATOR char(0x5c)
    #else
    #define PATH_SEPARATOR char(0x2f)
    #endif
    extern "C" {
      int cmd_ect_main(int argc, const char *argv[]);
      int cmd_webpinfo_main(int argc, char *argv[]);
      int cmd_cwebp_main(int argc, char *argv[]);
      int cmd_dwebp_main(int argc, char *argv[]);
      int cmd_gif2webp_main(int argc, char *argv[]);
      int cmd_img2webp_main(int argc, char *argv[]);
      int cmd_webpmux_main(int argc, char *argv[]);
      int cmd_jxlinfo_main(int argc, char *argv[]);
      int cmd_cjxl_main(int argc, char *argv[]);
      int cmd_djxl_main(int argc, const char *argv[]);
      int cmd_cjpegli_main(int argc, const char *argv[]);
      int cmd_djpegli_main(int argc, const char *argv[]);
      int cmd_zipalign_main(int argc, char* const argv[]);
    }
    int main(int argc, char *argv[]) {
      for (int i = 0; argc != 0 && i != 2; i++) {
        char *argv0 = strrchr(argv[0], PATH_SEPARATOR);
        if (argv0 == NULL) argv0 = argv[0]; else argv0++;
        if (strcmp(argv0, "ect") == 0) return cmd_ect_main(argc, const_cast<const char**>(argv));
        if (strcmp(argv0, "webpinfo") == 0) return cmd_webpinfo_main(argc, argv);
        if (strcmp(argv0, "cwebp") == 0) return cmd_cwebp_main(argc, argv);
        if (strcmp(argv0, "dwebp") == 0) return cmd_dwebp_main(argc, argv);
        if (strcmp(argv0, "gif2webp") == 0) return cmd_gif2webp_main(argc, argv);
        if (strcmp(argv0, "img2webp") == 0) return cmd_img2webp_main(argc, argv);
        if (strcmp(argv0, "webpmux") == 0) return cmd_webpmux_main(argc, argv);
        if (strcmp(argv0, "jxlinfo") == 0) return cmd_jxlinfo_main(argc, argv);
        if (strcmp(argv0, "cjxl") == 0) return cmd_cjxl_main(argc, argv);
        if (strcmp(argv0, "djxl") == 0) return cmd_djxl_main(argc, const_cast<const char**>(argv));
        if (strcmp(argv0, "cjpegli") == 0) return cmd_cjpegli_main(argc, const_cast<const char**>(argv));
        if (strcmp(argv0, "djpegli") == 0) return cmd_djpegli_main(argc, const_cast<const char**>(argv));
        if (strcmp(argv0, "zipalign") == 0) return cmd_zipalign_main(argc, argv);
        argv++;
        argc--;
      }
      puts("applets: ect webpinfo cwebp dwebp gif2webp img2webp webpmux jxlinfo cjxl djxl cjpegli djpegli zipalign");
      return 0;
    }
  ' > multicall.cc
  # < now, pack all to tar
  tar --zstd -cf $dist_dir/prepare.tar.zst -C .. build
  exit
fi

if [ "$1" = build ]; then
  # ===== build, should after prepare, without modify source code # ./build.sh build profile-generate/profile-use
  cd $temp_dir/build
  export CFLAGS="-O3 -flto=auto" # -flto=auto
  if [ "$(uname) $(uname -m)" = "Linux x86_64" ]; then
    # curl -O -L https://apt.llvm.org/llvm.sh # install on debian 13
    # chmod +x llvm.sh
    # ./llvm.sh 23 -m https://mirrors.nju.edu.cn/llvm-apt
    # apt-get purge --autoremove lldb-23 clangd-23 # or, only install clang-23 lld-23
    # export LDFLAGS="-fuse-ld=lld-23" CC="clang-23" CXX="clang++-23" CFLAGS="$CFLAGS -march=x86-64-v3 -fprofile-use=$(pwd)/pgo-0.profdata" # -fprofile-use=$(pwd)/pgo-0.profdata
    export LDFLAGS="" CC="gcc" CXX="g++" CFLAGS="$CFLAGS -march=x86-64-v3 -fprofile-update=atomic -fprofile-dir=$(pwd)/pgo -fprofile-generate" # -fprofile-update=atomic -fprofile-dir=$(pwd)/pgo # -fprofile-generate -fprofile-use
  elif [ "$(uname | cut -d "-" -f 1) $(uname -m)" = "MINGW64_NT x86_64" ]; then
    # C:\msys64\msys2_shell.cmd -mingw64 -defterm -here -no-start
    export LDFLAGS="-fuse-ld=lld" CC="clang-23" CXX="clang++-23" CFLAGS="$CFLAGS -march=x86-64-v3" # -fprofile-generate -fprofile-use=$(pwd)/pgo-0.profdata
  elif [ "$(uname) $(uname -m)" = "Darwin arm64" ]; then
    # brew install llvm@23 lld@23 cmake ninja nasm
    # proxychains ssh mac@mac-mini-m1.lan
    export PATH="$(brew --prefix llvm@23)/bin:$(brew --prefix lld@23)/bin:$PATH"
    export LDFLAGS="-fuse-ld=lld" CC="clang" CXX="clang++" CFLAGS="$CFLAGS -mcpu=apple-m1 -mmacosx-version-min=14.0" MACOSX_DEPLOYMENT_TARGET=14.0
  else
    uname -a
    exit 1
  fi
  export CXXFLAGS="$CFLAGS"
  ninja_targets(){ cat build/build.ninja | grep $1 | sed -e 's|\$||g' -e 's/|/ /g' | cut -d " " -f 4- | tr " " "\n" | grep -E "\.[^\\/]+$" ; } # # get targets built by $1, fix msys2 paths like "D$:/a.o", remove target head and '|' char, exclude targets without extension name
  # > ect
  cd ect
  rm -rf build
  cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF # ect use it's custom zlib, so link to system zlib is impossible
  ect_targets="$(ninja_targets CXX_EXECUTABLE_LINKER__ect_Release)"
  ninja -C build $ect_targets
  cp -r libpng/* build/optipng/libpng # prepare for below other programs
  cp -r mozjpeg/* build/mozjpeg-prefix/src/mozjpeg-build
  deps_args="-DZLIB_LIBRARY=$(realpath build/zlib/libzlib.a) -DZLIB_INCLUDE_DIR=$(realpath zlib) "
  deps_args="$deps_args -DPNG_LIBRARY=$(realpath build/optipng/libpng/libpng.a) -DPNG_PNG_INCLUDE_DIR=$(realpath build/optipng/libpng)"
  deps_args="$deps_args -DJPEG_LIBRARY=$(realpath build/mozjpeg-prefix/src/mozjpeg-build/libjpeg.a) -DJPEG_INCLUDE_DIR=$(realpath build/mozjpeg-prefix/src/mozjpeg-build)"
  cd ..
  # > giflib
  cd giflib
  make clean
  make -j1 CC="$CC" CFLAGS="-std=gnu99 -fPIC -Wall $CFLAGS" libgif.a
  deps_args="$deps_args -DGIF_LIBRARY=$(realpath libgif.a) -DGIF_INCLUDE_DIR=$(pwd)"
  cd ..
  # > webp
  cd webp
  rm -rf build
  cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF $deps_args \
    -DWEBP_USE_THREAD=OFF -DWEBP_UNICODE=OFF
  webp_targets="$(
    for applet in webpinfo cwebp dwebp gif2webp img2webp webpmux; do
      ninja_targets C_EXECUTABLE_LINKER__${applet}_Release
    done
  )"
  ninja -C build $webp_targets
  cd ..
  # > jxl + jpegli
  cd jxl
  rm -rf build
  cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF $deps_args \
    -DCMAKE_CXX_FLAGS="$CXXFLAGS -DHWY_COMPILE_ONLY_STATIC=ON -DHWY_BASELINE_TARGETS=HWY_$(uname -m | awk '/(arm|aarch)/{print "NEON"}/(x86|amd)/{print "AVX2"}')" \
    -DBUILD_TESTING=OFF -DJPEGXL_ENABLE_BENCHMARK=OFF -DJPEGXL_ENABLE_DOXYGEN=OFF -DJPEGXL_ENABLE_MANPAGES=OFF \
    -DJPEGXL_ENABLE_JNI=OFF -DJPEGXL_ENABLE_SJPEG=OFF -DJPEGXL_ENABLE_OPENEXR=OFF -DJPEGXL_ENABLE_TCMALLOC=OFF
  jxl_targets="$(
    for applet in jxlinfo cjxl djxl cjpegli djpegli; do
      ninja_targets CXX_EXECUTABLE_LINKER__${applet}_Release
    done | tr ' ' '\n' | awk '!a[$0]++' | grep -v _nocodec # keep order dedup, then exclude nocodecs stub implements
  )"
  ninja -C build $jxl_targets
  cd ..
  # > zipalign
  cd zipalign
  $CXX $CXXFLAGS -std=c++17 -I../ect -I../ect/zlib -I./include -c *.cpp
  cd ..
  # > multicall
  $CXX $CXXFLAGS $LDFLAGS \
    -Wl,--start-group \
    $(cd ect/build ; realpath $ect_targets) \
    $(cd webp/build ; realpath $webp_targets) \
    $(cd jxl/build ; realpath $jxl_targets) \
    $(cd zipalign ; realpath *.o) \
    -Wl,--end-group \
    multicall.cc \
    -o $dist_dir/zcodecs
  strip $dist_dir/zcodecs
  exit
fi

if [ "$1" = profile ]; then
  # === do profile for later pgo, keep below and skip for now
  mkdir -p $temp_dir/build
  cd $temp_dir/build
  # should includes pictures, office docx, apk, elf
  # should split the test-suite and trail-suit

  if [ ! -e $dist_dir/pgo_res_bak ]; then
    mkdir -p $dist_dir/pgo_res_bak
    curl -o $dist_dir/pgo_res_bak/001.png -L https://user-images.githubusercontent.com/634063/202742985-bb3b3b94-8aca-404a-8d8a-fd6a6f030672.png # github desktop screenshot with alpha
    curl -o $dist_dir/pgo_res_bak/002.png -L https://github.com/libjxl/testdata/raw/73695d303670c90e4d506ea89d9901b081385089/jxl/flower/flower.png # jxl flower big size test file
    curl -o $dist_dir/pgo_res_bak/003.png -L https://github.com/libjxl/testdata/raw/73695d303670c90e4d506ea89d9901b081385089/jxl/hdr_room.png # jxl hdr room test file
    curl -o $dist_dir/pgo_res_bak/004.apk -L https://github.com/moonlight-stream/moonlight-android/releases/download/v12.2/app-nonRoot-release.apk # moonlight apk
    tar -cf $dist_dir/pgo_res_bak/005.tar ect/libpng $dist_dir/pgo_res_bak/001.png # source code tar
    gzip -1 -k $dist_dir/pgo_res_bak/005.tar
  fi

  # truncate --size=1234KiB 5.tar
  # cat pgo_res_bak/*.tar pgo_res_bak/2.png > pgo_res_bak/1.bin

  rm -rf *.profraw *.profdata pgo
  pgo_i=11
  profile(){ pgo_i=$(( $pgo_i + 1 )) ; time $dist_dir/zcodecs $* ;} # https://gcc.gnu.org/bugzilla/show_bug.cgi?id=47618#c5 # for gcc
  profile(){ pgo_i=$(( $pgo_i + 1 )) ; time LLVM_PROFILE_FILE="pgo-$pgo_i.profraw" $dist_dir/zcodecs $* ;} # for llvm
  for i in 1 2; do # small files twice is enough
    rm -rf pgo_res
    cp -r $dist_dir/pgo_res_bak pgo_res
    profile cwebp -lossless pgo_res/003.png -o pgo_res/003.webp # to webp lossless
    profile cwebp -lossless -sharp_yuv -m 6 pgo_res/001.png -o pgo_res/001.webp
    profile cwebp -crop 100 200 1920 1080 pgo_res/002.png -o pgo_res/002.1.webp # to webp lossy
    profile cwebp -crop 700 640 1280 720 pgo_res/002.png -o pgo_res/002.2.webp
    profile dwebp -resize 1280 720 pgo_res/002.1.webp -o pgo_res/002.3.png # webp decode and resize
    profile img2webp -lossy -sharp_yuv -m 6 pgo_res/002.3.png pgo_res/002.2.webp pgo_res/002.3.png -o pgo_res/002.323.webp # to webp animated
    profile webpinfo pgo_res/002.323.webp
    profile cjxl --num_threads=4 -q 100 -e 8 pgo_res/001.png pgo_res/001.jxl # mathematically lossless
    profile cjxl --num_threads=4 -q 68 pgo_res/002.png pgo_res/002.jxl
    profile cjxl --num_threads=4 -q 85 -e 8 pgo_res/003.png pgo_res/003.jxl
    profile djxl --num_threads=4 --pixels_to_jpeg pgo_res/002.jxl pgo_res/002.jpeg # to normal jpeg
    profile jxlinfo pgo_res/002.jxl
    profile cjpegli -q 75 pgo_res/001.png pgo_res/001.jpegli.jpeg
    profile cjpegli -q 60 pgo_res/002.png pgo_res/002.jpegli.jpeg
    profile cjpegli -q 85 pgo_res/003.png pgo_res/003.jpegli.jpeg
    profile djpegli pgo_res/002.jpegli.jpeg pgo_res/002.jpegli.png
    profile ect -6 -gzip pgo_res/005.tar.gz # gzip decompress + compress
    profile ect -5 -zip pgo_res/005.tar
    profile ect -5 pgo_res/001.png pgo_res/003.png # high level recompress
    profile ect -9 pgo_res/002.3.png # very high level recompress
    ZIPALIGN_THREADS=4 ZIPALIGN_ZOPFLI_LEVEL=6 profile zipalign -z -f -P 4 4 pgo_res/004.apk pgo_res/004.zipalign.apk
  done
  # llvm-profdata-23 merge -output=pgo-0.profdata *.profraw
  rm -rf *.profraw
  exit

  cd $dist_dir
  i_apk=~/misc/res/pkgs/android/tasker/tasker.6.2.22.forever.v6.apk
  echo llvm_1 ; time ./zcodecs_llvm zipalign -f -z -P 4 4 $i_apk y_llvm.apk
  echo gcc_1 ; time ./zcodecs_gcc zipalign -f -z -P 4 4 $i_apk y_gcc.apk
  echo llvm_mt_4 ; time ZIPALIGN_THREADS=4 ZIPALIGN_ZOPFLI_LEVEL=6 ./zcodecs_llvm_mt zipalign -f -z -P 4 4 $i_apk y_llvm_mt_4.apk
  echo gcc_mt_4 ; time ZIPALIGN_THREADS=4 ZIPALIGN_ZOPFLI_LEVEL=6 ./zcodecs_gcc_mt zipalign -f -z -P 4 4 $i_apk y_gcc_mt_4.apk
  echo llvm_pgo_mt_4 ; time ZIPALIGN_THREADS=4 ZIPALIGN_ZOPFLI_LEVEL=6 ./zcodecs_llvm_pgo_mt zipalign -f -z -P 4 4 $i_apk y_llvm_pgo_mt_4.apk
  echo gcc_pgo_mt_4 ; time ZIPALIGN_THREADS=4 ZIPALIGN_ZOPFLI_LEVEL=6 ./zcodecs_gcc_pgo_mt zipalign -f -z -P 4 4 $i_apk y_gcc_pgo_mt_4.apk

  exit
fi

exit 1

# https://blog.llvm.org/2019/09/closing-gap-cross-language-lto-between.html
