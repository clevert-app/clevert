#!/bin/sh
set -e
trap exit INT
type git tar zstd cmake ninja nasm > /dev/null # apt-get install ccache ninja-build nasm
dist_dir=/media/kkocdko/KK_TMP_1/zcodecs/dist
temp_dir=/media/kkocdko/KK_TMP_1/zcodecs/temp
mkdir -p $dist_dir $temp_dir
export TMPDIR="$temp_dir"

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
  curl -L https://github.com/pnggroup/libpng/archive/cd952f49f95bb27154ae77dbb103032d95f6e580.tar.gz | tar -zx --strip-components 1 -C ect/src/libpng # ect use 1.6.58 but we use 1.6.59
  curl -L https://github.com/mozilla/mozjpeg/archive/6bdd1ad6c08eddddd2c4c70aa1161e5d3c4a6618.tar.gz | tar -zx --strip-components 1 -C ect/src/mozjpeg # ect mod version
  # > giflib
  curl -L https://deb.debian.org/debian/pool/main/g/giflib/giflib_5.2.2.orig.tar.gz | tar -zx
  mv giflib-* giflib
  # > webp
  curl -L https://github.com/webmproject/libwebp/archive/a1d89ff209ca01e7a87aca64317201890bac2749.tar.gz | tar -zx
  mv libwebp-* webp
  # > jpegli
  curl -L https://github.com/google/jpegli/archive/031a0077f5799a6041004267fc12b956c1f52a20.tar.gz | tar -zx
  mv jpegli-* jpegli
  # > jxl
  curl -L https://github.com/libjxl/libjxl/archive/8ec4d2e8e3a4012481ec48a44873d14abc2b17f8.tar.gz | tar -zx
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
    #include <zlib.h>
    #include <vector>
    #include <cstdlib>
    #define ALOGV(...) ((void)0)
    #define ALOGD(...) ((void)0)
    #define ALOGW(...) fprintf(stderr, __VA_ARGS__)
    #define ALOGE(...) fprintf(stderr, __VA_ARGS__)
    #define _Static_assert static_assert
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
        if (zstream.total_out != uncompressed_length || remaining_bytes != 0 || zerr != Z_STREAM_END) {
          ALOGW("Zip: inflate failed");
          return 1;
        }
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
      int cmd_ect_main(int argc, char *argv[]);
      int cmd_webpinfo_main(int argc, char *argv[]);
      int cmd_cwebp_main(int argc, char *argv[]);
      int cmd_dwebp_main(int argc, char *argv[]);
      int cmd_gif2webp_main(int argc, char *argv[]);
      int cmd_img2webp_main(int argc, char *argv[]);
      int cmd_webpmux_main(int argc, char *argv[]);
      int cmd_jxlinfo_main(int argc, char *argv[]);
      int cmd_cjxl_main(int argc, char *argv[]);
      int cmd_djxl_main(int argc, char *argv[]);
      int cmd_cjpegli_main(int argc, char *argv[]);
      int cmd_djpegli_main(int argc, char *argv[]);
      int cmd_zipalign_main(int argc, char* argv[]);
    }
    int main(int argc, char *argv[]) {
      for (int i = 0; argc != 0 && i != 2; i++) {
        const char *argv0 = strrchr(argv[0], PATH_SEPARATOR);
        if (argv0 == NULL) argv0 = argv[0]; else argv0++;
        if (strcmp(argv0, "ect") == 0) return cmd_ect_main(argc, argv);
        if (strcmp(argv0, "webpinfo") == 0) return cmd_webpinfo_main(argc, argv);
        if (strcmp(argv0, "cwebp") == 0) return cmd_cwebp_main(argc, argv);
        if (strcmp(argv0, "dwebp") == 0) return cmd_dwebp_main(argc, argv);
        if (strcmp(argv0, "gif2webp") == 0) return cmd_gif2webp_main(argc, argv);
        if (strcmp(argv0, "img2webp") == 0) return cmd_img2webp_main(argc, argv);
        if (strcmp(argv0, "webpmux") == 0) return cmd_webpmux_main(argc, argv);
        if (strcmp(argv0, "jxlinfo") == 0) return cmd_jxlinfo_main(argc, argv);
        if (strcmp(argv0, "cjxl") == 0) return cmd_cjxl_main(argc, argv);
        if (strcmp(argv0, "djxl") == 0) return cmd_djxl_main(argc, argv);
        if (strcmp(argv0, "cjpegli") == 0) return cmd_cjpegli_main(argc, argv);
        if (strcmp(argv0, "djpegli") == 0) return cmd_djpegli_main(argc, argv);
        if (strcmp(argv0, "zipalign") == 0) return cmd_zipalign_main(argc, argv);
        argv++;
        argc--;
      }
      puts("applets: ect webpinfo cwebp dwebp gif2webp img2webp webpmux jxlinfo cjxl djxl cjpegli djpegli zipalign");
      return 0;
    }
  ' > multicall.cc
  exit
fi

if [ "$1" = build ]; then
  # ===== build, should after prepare, without modify source code
  cd $temp_dir/build
  export CC="gcc" CXX="g++" CFLAGS="-O3 -fomit-frame-pointer -march=x86-64-v3"
  export CXXFLAGS="$CFLAGS"
  ninja_targets(){ cat build/build.ninja | grep $1 | sed -e 's|\$||g' -e 's/|/ /g' | cut -d " " -f 4- | tr " " "\n" | grep -E "\.[^\\/]+$" ; } # # get targets built by $1, fix msys2 paths like "D$:/a.o", remove target head and '|' char, exclude targets without extension name
  # > ect
  cd ect
  rm -rf build
  cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DECT_MULTITHREADING=OFF # ect use it's custom zlib, so link to system zlib is impossible
  ect_targets="$(ninja_targets CXX_EXECUTABLE_LINKER__ect_Release)"
  ninja -C build $ect_targets
  cp -r libpng/* build/optipng/libpng # prepare for below other programs
  cp -r mozjpeg/* build/mozjpeg-prefix/src/mozjpeg-build
  deps_args="-DZLIB_LIBRARY=$(realpath build/zlib/libzlib.a) -DZLIB_INCLUDE_DIR=$(realpath zlib) -DPNG_LIBRARY=$(realpath build/optipng/libpng/libpng.a) -DPNG_PNG_INCLUDE_DIR=$(realpath build/optipng/libpng) -DJPEG_LIBRARY=$(realpath build/mozjpeg-prefix/src/mozjpeg-build/libjpeg.a) -DJPEG_INCLUDE_DIR=$(realpath build/mozjpeg-prefix/src/mozjpeg-build)"
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
  CXXFLAGS="$CXXFLAGS -DHWY_COMPILE_ONLY_STATIC=ON -DHWY_BASELINE_TARGETS=$(uname -m | awk '/(arm|aarch)/{print "HWY_NEON"}/(x86|amd)/{print "HWY_AVX2"}')" \
  cmake -B build -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF $deps_args \
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
  $CXX $CXXFLAGS -std=c++17 -I../ect -I../ect/zlib -I./include -c ZipAlignMain.cpp ZipAlign.cpp ZipEntry.cpp ZipFile.cpp
  cd ..
  # >>> multicall
  $CXX $CXXFLAGS multicall.cc -Wl,--start-group \
    $(cd ect/build ; realpath $ect_targets) \
    $(cd webp/build ; realpath $webp_targets) \
    $(cd jxl/build ; realpath $jxl_targets) \
    $(cd zipalign ; realpath *.o) \
    -Wl,--end-group -pthread -lm -o $dist_dir/zcodecs
  strip $dist_dir/zcodecs
  exit
fi

if [ "$1" = profile ]; then
  # === do profile for later pgo, keep below and skip for now
  mkdir -p $temp_dir/build
  curl -o sample/vscode-screenshot.png -L "https://github.com/user-attachments/assets/56af271c-949d-454c-a3ea-16188c063414"
  [ $(sha1sum sample/vscode-screenshot.png | cut -d " " -f 1) != 5d387883de3438a6f47e618ba68753036bc6c515 ] && echo mismatch
  exit
fi

exit 1

# https://blog.llvm.org/2019/09/closing-gap-cross-language-lto-between.html
