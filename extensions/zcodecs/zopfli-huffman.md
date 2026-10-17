# Zopfli Huffman optimization

Measured on 2026-10-18 with `pgo_res_bak/004.apk`, Ryzen 5 5600U
(boost disabled), Clang 23.1.2, `-O3 -flto=thin -march=x86-64-v3`.
Every compression run used one thread and level 6:

```sh
ZIPALIGN_THREADS=1 ZIPALIGN_ZOPFLI_LEVEL=6 \
  "$dist_dir/zcodecs" zipalign -z -f -P 4 4 \
  "$temp_dir/build/pgo_res_bak/004.apk" "$temp_dir/zopfli-bench/output.apk"
```

## Change

Sampling with `gprofng` attributed 33.6% of baseline CPU time, including
sorting, to `ZopfliLengthLimitedCodeLengths`. The LLVM PGO profile recorded
981,560 calls to that function for this APK.

`zopfli-huffman.patch` first constructs an ordinary optimal Huffman tree
using two sorted queues. This takes linear time after the existing sort.
If its depths satisfy the requested maximum, those lengths are returned.
Otherwise the existing bounded package-merge algorithm runs unchanged.
About 88% of nontrivial trees in the training profile take the new path.

The existing frequency/symbol sorting order is preserved. Equal-weight
choices consume an internal node before a leaf, matching package-merge's
tie handling. No iteration counts, search limits, compression levels,
floating-point costs, or threading behavior change.

`build.sh prepare` applies the new patch. The old `zopfli.patch` remains
unused. The current temporary build sources also contain the new change.
Regenerating a prepared source archive requires running `prepare` with
the original `fetch.tar.zst` available.

## Measurements

Initial comparisons used three interleaved runs per variant. The final
binary was then rebuilt through `./build.sh build` and timed three more
times. No compilation or other benchmark ran concurrently with timing.
Wall-clock medians:

| Build | Seconds | Output bytes |
| --- | ---: | ---: |
| Original, no PGO | 22.077 | 10,755,389 |
| Huffman optimization, full build, no PGO | 16.958 | 10,755,389 |
| Huffman optimization, APK-trained PGO | 20.276 | 10,755,389 |

The algorithm change reduces elapsed time by 23.2% in this comparison
(1.30× throughput). The faster non-PGO build is installed at `$dist_dir/zcodecs`.
All outputs are byte-for-byte identical, with SHA-256
`ff91e10c951caf8baeb5ea1b3c37f88f35160063957e7bcd7bb84ffa5f09e9b0`.
Separate sampling runs show Huffman generation, including sorting, falling
from 7.587 to 2.383 CPU seconds.

PGO was tested using `./build.sh build profile-generate`, one instrumented
run of the command above with `LLVM_PROFILE_FILE` pointing into
`$temp_dir/build/pgo`, then `./build.sh build profile-use`.
`llvm-profdata show` and profile-annotated LLVM IR were used to inspect
execution counts; CPU time came from sampling, not those counts.
PGO was slower on this workload. Sampled inclusive CPU time in
`LZ77OptimalRun` rises from 11.441 seconds without PGO to 14.661 with PGO,
while Huffman generation remains faster than baseline. This PGO result
is specific to this compiler, training workload, and machine.

## Validation and artifacts

- 427,692 random, exhaustive, and edge-case frequency tables produce
  exactly the original code lengths under AddressSanitizer and
  UndefinedBehaviorSanitizer. Cases include empty/single-symbol tables,
  equal weights, and Fibonacci distributions requiring bounded lengths.
- A mixed ZIP corpus produces identical bytes at every level from 3 to 9.
- All 101 APK payloads match the source, CRC checks pass, and
  `zipalign -c -P 4 4` succeeds.
- The patch applies cleanly to the original source in `prepare.tar.zst`.

Binaries, profiles, build logs, `measurements.json`, `measurements-final.json`,
and the standalone validation/measurement scripts are retained in
`$temp_dir/zopfli-bench`.
Compiler temporary files were directed to `$temp_dir` with `TMPDIR`.
