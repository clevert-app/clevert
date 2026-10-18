Benchmark result and chat history:

---

> From `Me`

我编译了不同版本，然后运行了性能测试。

```
export KK_P1=1 KK_P2=1 KKFLAGS="" # -march=x86-64-v3

./build.sh prepare
./build.sh build
mv $dist_dir/zcodecs $dist_dir/zcodecs_p1p2p3_v1

./build.sh prepare
./build.sh build profile-generate
./build.sh profile
./build.sh build profile-use
mv $dist_dir/zcodecs $dist_dir/zcodecs_p1p2p3_v1_pgo

# zcodecs_p1_v1 zcodecs_p2_v1 zcodecs_p1p2_v1
echo ==== 6 ; ./build.sh measure png ; ./build.sh measure apk
```

这是某次性能测试结果。用时越短越好。

```
kkocdko@klp1:~/misc/code/clevert/extensions/zcodecs$ echo ==== 6 ; ./build.sh measure png ; ./build.sh measure apk
==== 6
==========
[ zcodecs_p1_v1 ]
Processed 1 file
Saved 336.71KB out of 675.09KB (49.8762%)
real 14.33
user 14.28
sys 0.01
==========
[ zcodecs_p1_v1_pgo ]
Processed 1 file
Saved 336.71KB out of 675.09KB (49.8762%)
real 19.93
user 19.87
sys 0.01
==========
[ zcodecs_p1_v3 ]
Processed 1 file
Saved 336.71KB out of 675.09KB (49.8762%)
real 14.23
user 14.18
sys 0.02
==========
[ zcodecs_p1_v3_pgo ]
Processed 1 file
Saved 336.71KB out of 675.09KB (49.8762%)
real 19.55
user 19.48
sys 0.02
==========
[ zcodecs_p1p2_v1 ]
Processed 1 file
Saved 336.71KB out of 675.09KB (49.8762%)
real 9.02
user 8.98
sys 0.02
==========
[ zcodecs_p1p2_v1_pgo ]
Processed 1 file
Saved 336.71KB out of 675.09KB (49.8762%)
real 8.00
user 7.97
sys 0.01
==========
[ zcodecs_p1p2_v3 ]
Processed 1 file
Saved 336.71KB out of 675.09KB (49.8762%)
real 9.02
user 8.97
sys 0.02
==========
[ zcodecs_p1p2_v3_pgo ]
Processed 1 file
Saved 336.71KB out of 675.09KB (49.8762%)
real 8.10
user 8.06
sys 0.01
==========
[ zcodecs_p2_v1 ]
Processed 1 file
Saved 336.71KB out of 675.09KB (49.8762%)
real 9.21
user 9.17
sys 0.01
==========
[ zcodecs_p2_v1_pgo ]
Processed 1 file
Saved 336.71KB out of 675.09KB (49.8762%)
real 8.30
user 8.26
sys 0.01
==========
[ zcodecs_p2_v3 ]
Processed 1 file
Saved 336.71KB out of 675.09KB (49.8762%)
real 9.20
user 9.16
sys 0.01
==========
[ zcodecs_p2_v3_pgo ]
Processed 1 file
Saved 336.71KB out of 675.09KB (49.8762%)
real 9.10
user 9.05
sys 0.02
==========
[ zcodecs_v1 ]
Processed 1 file
Saved 336.71KB out of 675.09KB (49.8762%)
real 9.23
user 9.19
sys 0.02
==========
[ zcodecs_v1_pgo ]
Processed 1 file
Saved 336.71KB out of 675.09KB (49.8762%)
real 9.18
user 9.14
sys 0.01
==========
[ zcodecs_v3 ]
Processed 1 file
Saved 336.71KB out of 675.09KB (49.8762%)
real 14.50
user 14.45
sys 0.01
==========
[ zcodecs_v3_pgo ]
Processed 1 file
Saved 336.71KB out of 675.09KB (49.8762%)
real 19.93
user 19.87
sys 0.02

--------------------------------------------------------------

114012	y.apk
e6f774e073ada7ae829df37bb81299279d6cfe95  -
==========
[ zcodecs_p1_v1 ]
real 56.87
user 125.54
sys 1.13
110724	y.apk
e6f774e073ada7ae829df37bb81299279d6cfe95  -
==========
[ zcodecs_p1_v1_pgo ]
real 65.67
user 145.08
sys 1.20
110724	y.apk
e6f774e073ada7ae829df37bb81299279d6cfe95  -
==========
[ zcodecs_p1_v3 ]
real 56.38
user 125.61
sys 1.17
110724	y.apk
e6f774e073ada7ae829df37bb81299279d6cfe95  -
==========
[ zcodecs_p1_v3_pgo ]
real 66.25
user 145.02
sys 1.19
110724	y.apk
e6f774e073ada7ae829df37bb81299279d6cfe95  -
==========
[ zcodecs_p1p2_v1 ]
real 52.26
user 118.23
sys 1.21
110724	y.apk
e6f774e073ada7ae829df37bb81299279d6cfe95  -
==========
[ zcodecs_p1p2_v1_pgo ]
real 50.31
user 113.03
sys 1.20
110724	y.apk
e6f774e073ada7ae829df37bb81299279d6cfe95  -
==========
[ zcodecs_p1p2_v3 ]
real 53.28
user 118.34
sys 1.14
110724	y.apk
e6f774e073ada7ae829df37bb81299279d6cfe95  -
==========
[ zcodecs_p1p2_v3_pgo ]
real 50.58
user 113.62
sys 1.08
110724	y.apk
e6f774e073ada7ae829df37bb81299279d6cfe95  -
==========
[ zcodecs_p2_v1 ]
real 77.37
user 174.53
sys 1.24
110724	y.apk
e6f774e073ada7ae829df37bb81299279d6cfe95  -
==========
[ zcodecs_p2_v1_pgo ]
real 73.14
user 166.21
sys 1.20
110724	y.apk
e6f774e073ada7ae829df37bb81299279d6cfe95  -
==========
[ zcodecs_p2_v3 ]
real 76.77
user 174.36
sys 1.23
110724	y.apk
e6f774e073ada7ae829df37bb81299279d6cfe95  -
==========
[ zcodecs_p2_v3_pgo ]
real 73.81
user 167.38
sys 1.20
110724	y.apk
e6f774e073ada7ae829df37bb81299279d6cfe95  -
==========
[ zcodecs_v1 ]
real 76.90
user 174.77
sys 1.23
110724	y.apk
e6f774e073ada7ae829df37bb81299279d6cfe95  -
==========
[ zcodecs_v1_pgo ]
real 74.77
user 169.63
sys 1.19
110724	y.apk
e6f774e073ada7ae829df37bb81299279d6cfe95  -
==========
[ zcodecs_v3 ]
real 80.97
user 182.15
sys 1.20
110724	y.apk
e6f774e073ada7ae829df37bb81299279d6cfe95  -
==========
[ zcodecs_v3_pgo ]
real 90.15
user 199.72
sys 1.18
110724	y.apk
e6f774e073ada7ae829df37bb81299279d6cfe95  -
kkocdko@klp1:~/misc/code/clevert/extensions/zcodecs$ 
kkocdko@klp1:~/misc/code/clevert/extensions/zcodecs$ 
kkocdko@klp1:~/misc/code/clevert/extensions/zcodecs$ 

```

情况是这样的。

* 我们正在改进的是 zopfli 算法，这是一个改进的 deflate 兼容算法，可以应用在 png 或者 zip 等需要 deflate 的地方。apk 是典型的普通 zip。
* v1 和 v3 代表 x86_64_v1 （只有基础的向量化） 和  x86_64_v3（保证平台支持 avx2）。我们使用 llvm 编译，所以，自动向量化比较激进。
* p1 是一个补丁，包含算法改进。可能对某些情况有效。
* p2 补丁是我发现自动向量化对于某个循环有负优化，所以，此补丁在那个循环前加了 pragma 来禁用那个特定循环的向量化。

所以，我现在做了如上的详细 benchmark，其中 p1p2 表示同时启用两个补丁。

我观察到，有时候，似乎自动向量化会造成奇怪的影响，补丁之间会互相影响，也会触发编译器的行为改变。所以，你帮我分析测试结果，告诉我什么样的组合最好。

我刚才又补测了一次

```
kkocdko@klp1:~/misc/code/clevert/extensions/zcodecs$ echo ==== 6 ; ./build.sh measure png ; ./build.sh measure apk
==== 6
==========
[ zcodecs_p1p2_v1_pgo ]
Processed 1 file
Saved 336.71KB out of 675.09KB (49.8762%)
real 8.03
user 7.98
sys 0.02
==========
[ zcodecs_p1p2_v3_pgo ]
Processed 1 file
Saved 336.71KB out of 675.09KB (49.8762%)
real 8.14
user 8.10
sys 0.01
34172	y.apk
f10837aea89812835c2547d8fbb16f71b285b402  -
==========
[ zcodecs_p1p2_v1_pgo ]
real 45.27
user 86.51
sys 0.34
32704	y.apk
f10837aea89812835c2547d8fbb16f71b285b402  -
==========
[ zcodecs_p1p2_v3_pgo ]
real 45.82
user 87.20
sys 0.34
32704	y.apk
f10837aea89812835c2547d8fbb16f71b285b402  -
kkocdko@klp1:~/misc/code/clevert/extensions/zcodecs$ 
```

---

> From `Gemini 4 Argon`

根据你提供的性能测试数据，我们对 16 种不同配置在 PNG（单线程为主）和 APK（多线程）两个场景下的表现进行了整理和交叉对比。

先直接给出结论：**最佳组合是 `p1p2_v1_pgo`**（即：同时启用 p1 和 p2 补丁 + 使用 x86_64_v1 架构 + 开启 PGO）。

下面是详细的数据汇总与现象分析，这能解释你观察到的“补丁相互影响”和“编译器奇怪行为”。

### 一、 性能数据总览（按 APK 耗时从短到长排序）

*注：所有组合的输出结果（压缩率、文件哈希）完全一致，因此纯看耗时即可。*

| 排名 | 组合配置 | PNG 耗时 (real) | APK 耗时 (real) | APK CPU耗时 (user) | 综合表现评价 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **`p1p2_v1_pgo`** | **8.00s** (补测 8.03s) | **50.31s** (补测 45.27s) | **113.03s** | **全场最佳 (通杀)** |
| **2** | **`p1p2_v3_pgo`** | 8.10s (补测 8.14s) | 50.58s (补测 45.82s) | 113.62s | 极佳，但略逊于 v1 |
| **3** | `p1p2_v1` | 9.02s | 52.26s | 118.23s | 很好 |
| **4** | `p1p2_v3` | 9.02s | 53.28s | 118.34s | 很好 |
| 5 | `p1_v3` | 14.23s | 56.38s | 125.61s | PNG 退化严重 |
| 6 | `p1_v1` | 14.33s | 56.87s | 125.54s | PNG 退化严重 |
| 7 | `p1_v1_pgo` | 19.93s | 65.67s | 145.08s | 触发严重负优化 |
| 8 | `p1_v3_pgo` | 19.55s | 66.25s | 145.02s | 触发严重负优化 |
| 9 | `p2_v1_pgo` | 8.30s | 73.14s | 166.21s | 缺 p1，APK 较慢 |
| 10 | `p2_v3_pgo` | 9.10s | 73.81s | 167.38s | 缺 p1，APK 较慢 |
| 11 | `v1_pgo` (基线+PGO)| 9.18s | 74.77s | 169.63s | 原始基线 |
| 12 | `p2_v3` | 9.20s | 76.77s | 174.36s | |
| 13 | `v1` (纯基线) | 9.23s | 76.90s | 174.77s | 原始基线 |
| 14 | `p2_v1` | 9.21s | 77.37s | 174.53s | |
| 15 | `v3` | 14.50s | 80.97s | 182.15s | AVX2 负优化 |
| 16 | `v3_pgo` | 19.93s | 90.15s | 199.72s | 全场最差 |

---

### 二、 核心现象与原因分析

你的直觉非常敏锐，**p1、p2、v3（AVX2）和 PGO 之间发生了强烈的化学反应**。我们可以从数据中剥离出以下几个关键事实：

#### 1. 为什么存在一个“14秒 / 19秒”的诅咒？（p2 补丁的关键作用）
观察 PNG 的测试结果，时间被明显分成了三档：**~8-9秒**、**~14.3秒**、**~19.9秒**。
* **原始状态 (`v1`)**：PNG 耗时 9.23s。在这个状态下，那个问题循环**并没有**被 LLVM 激进地向量化。
* **开启 AVX2 (`v3`) 或打上 `p1` 补丁 (`p1_v1`)**：耗时立刻暴增到 **14.2s ~ 14.5s**！
  * **原因**：`v3` 放宽了向量化条件；而 `p1` 改变了上下文代码结构，意外改变了 LLVM 的代价模型（Cost Model），导致原本在 `v1` 下不触发向量化的那个循环，被编译器强行向量化了。
* **再叠加 PGO (`v3_pgo`, `p1_v1_pgo`, `p1_v3_pgo`)**：耗时进一步恶化到 **19.5s ~ 19.9s**！
  * **原因**：PGO 发现这个循环是热点（Hot Spot），于是指导 LLVM 用更激进的策略去展开（Unroll）和向量化它，导致负优化被放大了。
* **p2 的救赎**：只要加上 `p2`（禁用该循环向量化），无论是 `p1p2` 还是单独的 `p2`，PNG 耗时瞬间全部回到 **8~9秒** 的正常水平，且 PGO 终于能发挥正向作用（从 9.0s 降到 8.0s）。

**结论 1：`p1` 必须配合 `p2` 使用。** 单独使用 `p1` 会误触 LLVM 的自动向量化地雷，掩盖了 `p1` 原本的算法优势。

#### 2. p1 补丁的真实威力
在排除了向量化干扰（即都加上 `p2`）之后，我们对比 `p2` 和 `p1p2`：
* **PNG 场景**：`p2_v1_pgo` (8.30s) vs `p1p2_v1_pgo` (8.00s)，有小幅提升（约 3.6%）。
* **APK 场景**：`p2_v1_pgo` (73.14s) vs `p1p2_v1_pgo` (50.31s)，**耗时直接减少了 31%（User CPU 时间从 166s 降到 113s）！**

**结论 2：`p1` 的算法改进非常成功**，尤其对 APK（包含大量不同类型文件的复杂 zip）有巨大的加速效果。

#### 3. 为什么 `v1` 比 `v3` (AVX2) 更快？
在你的第一次测试和第二次补测中，都稳定复现了一个现象：在最佳组合下，**`p1p2_v1_pgo` 始终比 `p1p2_v3_pgo` 快一点点（约 1% - 1.5%）**。
* **原因分析**：Zopfli（以及 Deflate/LZ77 类算法）的核心操作是哈希链查找、动态规划和位操作。这类算法属于典型的**控制流密集（Control-flow heavy，分支多）**和**内存随机访问**型任务，每次迭代的次数往往很短且不固定。
* 当启用 `x86_64_v3` 时，LLVM 会尝试在代码的其他地方使用 AVX2（256位寄存器）。对于循环次数较短的逻辑，向量化的准备开销（ Prologue/Epilogue）、水平归约开销、以及未命中分支预测的惩罚，往往大于 SIMD 带来的收益。此外，部分 CPU 在密集执行 AVX2 指令时可能会有微小的频率偏移或前端解码压力。
* `x86_64_v1` 只使用基础的 SSE2，指令更紧凑，对于标量和分支密集的压缩算法反而更友好，同时还保证了在老旧 CPU 上的最大兼容性。

---

### 三、 最终建议

1. **代码层面**：坚定地同时合并 **`p1` 和 `p2` 补丁**。`p2` 的 `#pragma clang loop vectorize(disable)` 是点睛之笔，它不仅修复了 `v3` 的退化，还解除了 `p1` 引发的编译器副作用，释放了 PGO 的潜力。
2. **编译选项**：
   * 架构选择 **`x86_64_v1`**。它不仅性能是全场第一，而且二进制兼容性最好，无需为 `v3` 维护额外的构建版本。
   * 启用 **PGO**。在有 `p2` 护航的前提下，PGO 在 PNG 上带来了约 11% 的提升（9.02s -> 8.00s），在 APK 上带来了约 4% 的提升（52.26s -> 50.31s）。
3. **后续探索方向（可选）**：既然 `v3` 比 `v1` 略慢一点点，说明除了 `p2` 针对的那个大循环外，代码中可能还有一两个小循环被 AVX2 负优化了。不过目前 `v1` 和 `v3` 差距只有 1% 左右，直接使用 `p1p2_v1_pgo` 已经是性价比极高的完美状态了。
