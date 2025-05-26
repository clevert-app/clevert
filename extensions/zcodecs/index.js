// @ts-check
/** @import { Extension, ClevertUtils } from "../../index.js" */
import child_process from "node:child_process";
import path from "node:path";
const /** @type {ClevertUtils} */ cu = globalThis.clevertUtils; // needs an explicit type annotation
const consts = globalThis.process && /* simple trick, eval only in nodejs */ {
  exe: path.join(import.meta.dirname, "zcodecs"), // can't be implemented inside ClevertUtils because we need current module's import.meta
};
const i18nRes = (() => {
  const enus = {
    description: () => "Includes ect, webp, jpeg-xl and other modern codecs",
    ectDescription: () =>
      "Effective lossless file optimizer for PNG, Zip, Gzip and more",
    cwebpDescription: () =>
      "WebP image encoder. WebP is a popular efficient picture format in Web world",
    cwebpQuality: () => "Quality (0-100)",
    cwebpAlphaQuality: () => "Alpha quality (0-100)",
    cwebpPreset: () => "Preset kind",
    cwebpLosslessLevel: () => "Lossless level (0-9:slow)",
    cwebpMethod: () => "Method (0-6:slow)",
    cwebpTargetSize: () => "Target size (bytes)",
    cwebpTargetPsnr: () => "Target PSNR (dB)",
    cwebpLossless: () => "Encode image losslessly",
    cwebpFilterStrength: () => "Filter strength (0-100)",
    cwebpSharpness: () => "Sharpness (0-7)",
    cwebpSharpYuv: () => "Sharp YUV conversion",
    cwebpNoAlpha: () => "Without alpha channel",
    cwebpLowMemory: () => "Low memory mode",
    dwebpDescription: () => "WebP decoder",
    dwebpNoFancy: () => "No fancy upscaler",
    dwebpFlip: () => "Vertically flip",
    dwebpAlpha: () => "Only save alpha channel",
    gif2webpDescription: () => "Convert GIF animated image to WebP",
    gif2webpQuality: () => "Quality (0-100)",
    gif2webpMethod: () => "Method (0-6:slow)",
    gif2webpKeyframesMin: () => "Min keyframe gap",
    gif2webpKeyframesMax: () => "Max keyframe gap",
    gif2webpFilterStrength: () => "Filter strength (0-100)",
    gif2webpMetadata: () => "Metadata to copy",
    gif2webpMetadataHint: () => "all, none, icc, xmp",
    gif2webpLossy: () => "Lossy compression",
    gif2webpMixed: () => "Mixed lossy/lossless per frame",
    gif2webpMinSize: () => "Minimize output size",
    gif2webpLoopCompat: () => "Loop compatibility mode",
    gif2webpMt: () => "Use multi-threading",
    cjpegliDescription: () =>
      "Advanced JPEG image encoder, better quality without loosing compatibility",
    cjpegliQuality: () => "Quality (0-100)",
    cjpegliProgressiveLevel: () => "Progressive level (0-2)",
    cjpegliChromaSubsampling: () => "Chroma subsampling",
    cjpegliStdQuant: () => "Use Annex K Std quantization tables",
    cjpegliXyb: () => "Convert to XYB colorspace",
    cjpegliNoadaptive: () => "Disable adaptive quantization",
    djpegliDescription: () => "Advanced JPEG image decoder",
    djpegliBitdepth: () => "Bitdepth for output (8|16)",
    cjxlDescription: () =>
      "JPEG XL image encoder. JPEG XL delivers best-of-breed quality and size",
    cjxlQualityMethod: () => "Quality control method",
    cjxlQualityMethodDistance: () => "Visual distance",
    cjxlQualityMethodQuality: () => "Quality value",
    cjxlDistance: () => "Distance (0.0-25.0)",
    cjxlQuality: () => "Quality (0-100)",
    cjxlEffort: () => "Encoder effort (1-10)",
    cjxlBrotliEffort: () => "Brotli effort (0-11)",
    cjxlLosslessJpeg: () => "Lossless transcode from JPEG (if possible)",
    djxlDescription: () => "JPEG XL image decoder",
    djxlBitsPerSample: () => "Output Bit depth (0|-1)",
    djxlDisplayNits: () => "Display nits",
    djxlColorSpace: () => "Color space",
    djxlDownsampling: () => "Downsampling (1|2|4|8)",
    djxlPixelsToJpeg: () => "Pixels to JPEG",
    djxlJpegQuality: () => "JPEG quality (0-100)",
    djxlAlphaBlend: () => "Alpha blend",
    djxlBackground: () => "Background (#NNNNNN)",
    djxlAllowPartialFiles: () => "Allow partial files",
    defaultHint: () => "Keep default",
  };
  /** @type {Readonly<typeof enus>} */
  const zhcn = {
    description: () => "包含了 ect, webp, jpeg-xl 等现代编解码器",
    ectDescription: () => "高效的文件无损优化器，支持 PNG, Zip, Gzip 等格式",
    cwebpDescription: () =>
      "WebP 图像编码器。WebP 是一种在网络上被大量使用的高效图片格式",
    cwebpQuality: () => "质量 (0-100)",
    cwebpAlphaQuality: () => "透明质量 (0-100)",
    cwebpPreset: () => "预设类型",
    cwebpLosslessLevel: () => "无损级别 (0-9:慢)",
    cwebpMethod: () => "压缩方法 (0-6:慢)",
    cwebpTargetSize: () => "目标大小 (字节)",
    cwebpTargetPsnr: () => "目标 PSNR (分贝)",
    cwebpLossless: () => "无损编码",
    cwebpFilterStrength: () => "滤波强度 (0-100)",
    cwebpSharpness: () => "锐化 (0-7)",
    cwebpSharpYuv: () => "更锐利的 YUV 转换",
    cwebpNoAlpha: () => "不包含透明通道",
    cwebpLowMemory: () => "低内存模式",
    dwebpDescription: () => "WebP 图像解码器",
    dwebpNoFancy: () => "禁用高精度上采样",
    dwebpFlip: () => "垂直翻转",
    dwebpAlpha: () => "仅保存透明通道",
    gif2webpDescription: () => "将 GIF 动画图像转换为 WebP",
    gif2webpQuality: () => "质量 (0-100)",
    gif2webpMethod: () => "压缩方法 (0-6:慢)",
    gif2webpKeyframesMin: () => "关键帧最小间隔",
    gif2webpKeyframesMax: () => "关键帧最大间隔",
    gif2webpFilterStrength: () => "滤波强度 (0-100)",
    gif2webpMetadata: () => "需复制的元数据",
    gif2webpMetadataHint: () => "all, none, icc, xmp",
    gif2webpLossy: () => "有损压缩",
    gif2webpMixed: () => "混合有损/无损",
    gif2webpMinSize: () => "最小化输出大小",
    gif2webpLoopCompat: () => "循环兼容模式",
    gif2webpMt: () => "使用多线程",
    cjpegliDescription: () =>
      "先进的 JPEG 图像编码器，在保证兼容性的前提下提高更好的效果",
    cjpegliQuality: () => "质量 (0-100)",
    cjpegliProgressiveLevel: () => "渐进等级 (0-2)",
    cjpegliChromaSubsampling: () => "色度二次采样",
    cjpegliStdQuant: () => "使用 Annex K 标准量化表",
    cjpegliXyb: () => "转换到 XYB 色彩空间",
    cjpegliNoadaptive: () => "禁用自适应量化",
    djpegliDescription: () => "先进的 JPEG 图像解码器",
    djpegliBitdepth: () => "输出位深度 (8 | 16)",
    cjxlDescription: () =>
      "JPEG XL 图像编码器。JPEG XL 提供质量与体积的最佳组合",
    cjxlQualityMethod: () => "质量控制方法",
    cjxlQualityMethodDistance: () => "视觉距离",
    cjxlQualityMethodQuality: () => "质量值",
    cjxlDistance: () => "距离 (0.0-25.0)",
    cjxlQuality: () => "质量 (0-100)",
    cjxlEffort: () => "编码强度 (1-10)",
    cjxlBrotliEffort: () => "Brotli 编码强度 (0-11)",
    cjxlLosslessJpeg: () => "从 JPEG 无损转码 (当输入是 JPEG 时)",
    djxlDescription: () => "JPEG XL 图片解码器",
    djxlBitsPerSample: () => "输出位深度 (0|-1)",
    djxlDisplayNits: () => "显示亮度 (nits)",
    djxlColorSpace: () => "色彩空间",
    djxlDownsampling: () => "下采样 (1|2|4|8)",
    djxlPixelsToJpeg: () => "按像素转换 JPEG",
    djxlJpegQuality: () => "JPEG 质量 (0-100)",
    djxlAlphaBlend: () => "透明混合",
    djxlBackground: () => "背景色 (#NNNNNN)",
    djxlAllowPartialFiles: () => "允许不完整文件",
    defaultHint: () => "保持默认",
  };
  return {
    "en-US": /** @type {Readonly<typeof enus>} */ (enus),
    "zh-CN": zhcn,
  };
})();
const i18n = i18nRes[cu.locale];

// export the whole object because type check is inconvenient if we use many individual exports
/** @type {Extension} */
export default {
  id: "zcodecs", // must be unique in whole extension market, can contains '-' but must not contains '_'
  version: "0.1.0", // must obey https://semver.org
  name: "zcodecs",
  description: i18n.description(),
  dependencies: [], // can be "some-what_1.2"
  assets: [
    {
      platforms: ["linux-x64"],
      kind: "zip",
      path: "./", // start from the extension dir
      url: "https://github.com/clevert-app/clevert/releases/download/asset_zcodecs_12.0.0_10664137139/linux-x64.zip", // just place github.com address here and the core will do auto-mirroring
    },
    {
      platforms: ["mac-arm64"],
      kind: "zip",
      path: "./",
      url: "https://github.com/clevert-app/clevert/releases/download/asset_zcodecs_12.0.0_10664137139/mac-arm64.zip",
    },
    {
      platforms: ["win-x64"],
      kind: "zip",
      path: "./",
      url: "https://github.com/clevert-app/clevert/releases/download/asset_zcodecs_12.0.0_10664137139/win-x64.zip",
    },
  ],
  // there's some overlap between action and profile, you can write an all-in-one action and custom based on the profile, but this is bad practice? we may supports this as an generic extension. Moreover, one extension may have different action "kind", like as both a converter and a daemon, which requires more than one action, so splitting different actions by different usage is suggested
  actions: [
    // Action 的设计，是有一个 ui(profile)=>controller, 有一个 execute(profile,entry)=>controller
    // entries 是倾向于每次调用变动的，profile 是倾向于不变的
    {
      id: "cwebp",
      name: "cwebp",
      description: i18n.cwebpDescription(),
      kind: "common-files",
      ui: (profile) => {
        const $root = document.createElement("form");
        $root.classList.add("root");
        const css = String.raw;
        $root.appendChild(document.createElement("style")).textContent = css`
          .action .root {
            display: flex;
            flex-wrap: wrap;
            gap: 6px 12px;
          }
          .action .root hr {
            border: none;
            width: 100%;
            height: 0;
            margin: 0;
          }
        `;
        $root.addEventListener("post-remove", (e) => console.log(e));

        // Option: -q <float>  quality factor (0:small..100:big), default=75
        const $qualityLabel = document.createElement("label");
        $root.appendChild($qualityLabel);
        $qualityLabel.textContent = i18n.cwebpQuality();
        const $quality = document.createElement("input");
        $qualityLabel.appendChild($quality);
        $quality.type = "number";
        $quality.value = profile.quality || "";
        $quality.placeholder = i18n.defaultHint();

        // Option: -alpha_q <int>  transparency-compression quality (0..100), default=100
        const $alphaQualityLabel = document.createElement("label");
        $root.appendChild($alphaQualityLabel);
        $alphaQualityLabel.textContent = i18n.cwebpAlphaQuality();
        const $alphaQuality = document.createElement("input");
        $alphaQualityLabel.appendChild($alphaQuality);
        $alphaQuality.type = "number";
        $alphaQuality.value = profile.alphaQuality || "";
        $alphaQuality.placeholder = i18n.defaultHint();

        // Option: -preset <string>  preset setting
        // const $presetFieldset = document.createElement("fieldset");
        // $root.appendChild($presetFieldset);
        // const $presetLegend = document.createElement("legend");
        // $presetFieldset.appendChild($presetLegend);
        // $presetLegend.textContent = i18n.cwebpPreset();
        // ["default", "photo", "picture", "drawing", "icon", "text"].forEach(
        //   (preset) => {
        //     const $presetLabel = document.createElement("label");
        //     $presetFieldset.appendChild($presetLabel);
        //     $presetLabel.textContent = preset;
        //     const $presetRadio = document.createElement("input");
        //     $presetLabel.appendChild($presetRadio);
        //     $presetRadio.type = "radio";
        //     $presetRadio.name = "cwebp-preset";
        //     $presetRadio.value = preset;
        //     $presetRadio.checked = profile.preset === preset;
        //   }
        // );

        // Option: -z <int>  activates lossless preset with given level (0:fast, ..., 9:slowest)
        const $losslessLevelLabel = document.createElement("label");
        $root.appendChild($losslessLevelLabel);
        $losslessLevelLabel.textContent = i18n.cwebpLosslessLevel();
        const $losslessLevel = document.createElement("input");
        $losslessLevelLabel.appendChild($losslessLevel);
        $losslessLevel.type = "number";
        $losslessLevel.value = profile.losslessLevel || "";
        $losslessLevel.placeholder = i18n.defaultHint();

        // Option: -m <int>  compression method (0=fast, 6=slowest), default=4
        const $methodLabel = document.createElement("label");
        $root.appendChild($methodLabel);
        $methodLabel.textContent = i18n.cwebpMethod();
        const $method = document.createElement("input");
        $methodLabel.appendChild($method);
        $method.type = "number";
        $method.value = profile.method || "";
        $method.placeholder = i18n.defaultHint();

        // Option: -size <int>  target size (in bytes)
        const $targetSizeLabel = document.createElement("label");
        $root.appendChild($targetSizeLabel);
        $targetSizeLabel.textContent = i18n.cwebpTargetSize();
        const $targetSize = document.createElement("input");
        $targetSizeLabel.appendChild($targetSize);
        $targetSize.type = "number";
        $targetSize.value = profile.targetSize || "";
        $targetSize.placeholder = i18n.defaultHint();

        // Option: -psnr <float>  target PSNR (in dB. typically: 42)
        const $targetPsnrLabel = document.createElement("label");
        $root.appendChild($targetPsnrLabel);
        $targetPsnrLabel.textContent = i18n.cwebpTargetPsnr();
        const $targetPsnr = document.createElement("input");
        $targetPsnrLabel.appendChild($targetPsnr);
        $targetPsnr.type = "number";
        $targetPsnr.step = "0.1";
        $targetPsnr.value = profile.targetPsnr || "";
        $targetPsnr.placeholder = i18n.defaultHint();

        // Option: -f <int>  filter strength (0=off..100), default=60
        const $filterStrengthLabel = document.createElement("label");
        $root.appendChild($filterStrengthLabel);
        $filterStrengthLabel.textContent = i18n.cwebpFilterStrength();
        const $filterStrength = document.createElement("input");
        $filterStrengthLabel.appendChild($filterStrength);
        $filterStrength.type = "number";
        $filterStrength.value = profile.filterStrength || "";
        $filterStrength.placeholder = i18n.defaultHint();

        // Option: -sharpness <int>  filter sharpness (0=most..7=least sharp), default=0
        const $sharpnessLabel = document.createElement("label");
        $root.appendChild($sharpnessLabel);
        $sharpnessLabel.textContent = i18n.cwebpSharpness();
        const $sharpness = document.createElement("input");
        $sharpnessLabel.appendChild($sharpness);
        $sharpness.type = "number";
        $sharpness.value = profile.sharpness || "";
        $sharpness.placeholder = i18n.defaultHint();

        $root.appendChild(document.createElement("hr"));

        // Option: -lossless  encode image losslessly, default=off
        const $losslessLabel = document.createElement("label");
        $root.appendChild($losslessLabel);
        $losslessLabel.textContent = i18n.cwebpLossless();
        const $lossless = document.createElement("input");
        $losslessLabel.appendChild($lossless);
        $lossless.type = "checkbox";
        $lossless.checked = profile.lossless;

        // Option: -sharp_yuv  use sharper (and slower) RGB->YUV conversion
        const $sharpYuvLabel = document.createElement("label");
        $root.appendChild($sharpYuvLabel);
        $sharpYuvLabel.textContent = i18n.cwebpSharpYuv();
        const $sharpYuv = document.createElement("input");
        $sharpYuvLabel.appendChild($sharpYuv);
        $sharpYuv.type = "checkbox";
        $sharpYuv.checked = profile.sharpYuv;

        // Option: -noalpha  discard any transparency information
        const $noAlphaLabel = document.createElement("label");
        $root.appendChild($noAlphaLabel);
        $noAlphaLabel.textContent = i18n.cwebpNoAlpha();
        const $noAlpha = document.createElement("input");
        $noAlphaLabel.appendChild($noAlpha);
        $noAlpha.type = "checkbox";
        $noAlpha.checked = profile.noAlpha;

        // Option: -low_memory  reduce memory usage (slower encoding)
        const $lowMemoryLabel = document.createElement("label");
        $root.appendChild($lowMemoryLabel);
        $lowMemoryLabel.textContent = i18n.cwebpLowMemory();
        const $lowMemory = document.createElement("input");
        $lowMemoryLabel.appendChild($lowMemory);
        $lowMemory.type = "checkbox";
        $lowMemory.checked = profile.lowMemory;

        return {
          root: $root,
          profile: () => {
            profile.quality = $quality.value || undefined;
            profile.alphaQuality = $alphaQuality.value || undefined;
            // profile.preset = $presetFieldset.querySelector("input:checked")?.value;
            profile.losslessLevel = $losslessLevel.value || undefined;
            profile.method = $method.value || undefined;
            profile.targetSize = $targetSize.value || undefined;
            profile.targetPsnr = $targetPsnr.value || undefined;
            profile.lossless = $lossless.checked;
            profile.filterStrength = $filterStrength.value || undefined;
            profile.sharpness = $sharpness.value || undefined;
            profile.sharpYuv = $sharpYuv.checked;
            profile.noAlpha = $noAlpha.checked;
            profile.lowMemory = $lowMemory.checked;
            return profile;
          },
        };
      },
      execute: (profile, { input, output }) => {
        const args = ["cwebp", input, "-o", output];
        if (profile.quality) args.push("-q", profile.quality);
        if (profile.alphaQuality) args.push("-alpha_q", profile.alphaQuality);
        if (profile.losslessLevel) args.push("-z", profile.losslessLevel);
        if (profile.method) args.push("-m", profile.method);
        if (profile.targetSize) args.push("-size", profile.targetSize);
        if (profile.targetPsnr) args.push("-psnr", profile.targetPsnr);
        if (profile.lossless) args.push("-lossless");
        if (profile.filterStrength) args.push("-f", profile.filterStrength);
        if (profile.sharpness) args.push("-sharpness", profile.sharpness);
        if (profile.sharpYuv) args.push("-sharp_yuv");
        if (profile.noAlpha) args.push("-noalpha");
        if (profile.lowMemory) args.push("-low_memory");
        const { promise, resolve, reject } = Promise.withResolvers();
        const child = child_process.spawn(consts.exe, args);
        child.on("error", (error) => reject(error));
        child.on("exit", (v) => (v ? reject(new Error("" + v)) : resolve(0)));
        return {
          progress: () => 0,
          stop: () => child.kill(),
          promise,
        };
      },
    },
    {
      id: "dwebp",
      name: "dwebp",
      description: i18n.dwebpDescription(),
      kind: "common-files",
      ui: (profile) => {
        const $root = document.createElement("form");
        $root.classList.add("root");
        const css = String.raw;
        $root.appendChild(document.createElement("style")).textContent = css`
          .action .root {
            display: flex;
            flex-wrap: wrap;
            gap: 6px 12px;
          }
          .action .root hr {
            border: none;
            width: 100%;
            height: 0;
            margin: 0;
          }
        `;
        $root.addEventListener("post-remove", (e) => console.log(e));

        // Option: -nofancy
        const $nofancyLabel = document.createElement("label");
        $root.appendChild($nofancyLabel);
        $nofancyLabel.textContent = i18n.dwebpNoFancy();
        const $nofancy = document.createElement("input");
        $nofancyLabel.appendChild($nofancy);
        $nofancy.type = "checkbox";
        $nofancy.checked = profile.nofancy;

        // Option: -flip
        const $flipLabel = document.createElement("label");
        $root.appendChild($flipLabel);
        $flipLabel.textContent = i18n.dwebpFlip();
        const $flip = document.createElement("input");
        $flipLabel.appendChild($flip);
        $flip.type = "checkbox";
        $flip.checked = profile.flip;

        // Option: -alpha
        const $alphaLabel = document.createElement("label");
        $root.appendChild($alphaLabel);
        $alphaLabel.textContent = i18n.dwebpAlpha();
        const $alpha = document.createElement("input");
        $alphaLabel.appendChild($alpha);
        $alpha.type = "checkbox";
        $alpha.checked = profile.alpha;

        return {
          root: $root,
          profile: () => {
            profile.nofancy = $nofancy.checked;
            profile.flip = $flip.checked;
            profile.alpha = $alpha.checked;
            return profile;
          },
        };
      },
      execute: (profile, { input, output }) => {
        const args = ["dwebp", input, "-o", output];
        if (profile.outputFormat) args.push("-" + profile.outputFormat);
        if (profile.nofancy) args.push("-nofancy");
        if (profile.nofilter) args.push("-nofilter");
        if (profile.nodither) args.push("-nodither");
        if (profile.dither) args.push("-dither", profile.dither);
        if (profile.alphaDither) args.push("-alpha_dither");
        if (profile.mt) args.push("-mt");
        if (profile.crop) args.push("-crop", ...profile.crop.split(" "));
        if (profile.resize) args.push("-resize", ...profile.resize.split(" "));
        if (profile.flip) args.push("-flip");
        if (profile.alpha) args.push("-alpha");
        if (profile.incremental) args.push("-incremental");
        const { promise, resolve, reject } = Promise.withResolvers();
        const child = child_process.spawn(consts.exe, args);
        child.on("error", (error) => reject(error));
        child.on("exit", (v) => (v ? reject(new Error("" + v)) : resolve(0)));
        return {
          progress: () => 0,
          stop: () => child.kill(),
          promise,
        };
      },
    },
    {
      id: "gif2webp",
      name: "gif2webp",
      description: i18n.gif2webpDescription(),
      kind: "common-files",
      ui: (profile) => {
        const $root = document.createElement("form");
        $root.classList.add("root");
        const css = String.raw;
        $root.appendChild(document.createElement("style")).textContent = css`
          .action .root {
            display: flex;
            flex-wrap: wrap;
            gap: 6px 12px;
          }
          .action .root hr {
            border: none;
            width: 100%;
            height: 0;
            margin: 0;
          }
        `;
        $root.addEventListener("post-remove", (e) => console.log(e));

        // Option: -q <float> quality factor (0:small..100:big)
        const $qualityLabel = document.createElement("label");
        $root.appendChild($qualityLabel);
        $qualityLabel.textContent = i18n.gif2webpQuality();
        const $quality = document.createElement("input");
        $qualityLabel.appendChild($quality);
        $quality.type = "number";
        $quality.value = profile.quality || "";
        $quality.placeholder = i18n.defaultHint();

        // Option: -m <int> compression method (0=fast, 6=slowest)
        const $methodLabel = document.createElement("label");
        $root.appendChild($methodLabel);
        $methodLabel.textContent = i18n.gif2webpMethod(); // e.g., "Method (0-6:slow)"
        const $method = document.createElement("input");
        $methodLabel.appendChild($method);
        $method.type = "number";
        $method.value = profile.method || "";
        $method.placeholder = i18n.defaultHint();

        // Option: -kmin <int> min distance between key frames
        const $keyframesMinLabel = document.createElement("label");
        $root.appendChild($keyframesMinLabel);
        $keyframesMinLabel.textContent = i18n.gif2webpKeyframesMin(); // e.g., "Min keyframe dist"
        const $keyframesMin = document.createElement("input");
        $keyframesMinLabel.appendChild($keyframesMin);
        $keyframesMin.type = "number";
        $keyframesMin.value = profile.keyframesMin || "";
        $keyframesMin.placeholder = i18n.defaultHint();

        // Option: -kmax <int> max distance between key frames
        const $keyframesMaxLabel = document.createElement("label");
        $root.appendChild($keyframesMaxLabel);
        $keyframesMaxLabel.textContent = i18n.gif2webpKeyframesMax(); // e.g., "Max keyframe dist"
        const $keyframesMax = document.createElement("input");
        $keyframesMaxLabel.appendChild($keyframesMax);
        $keyframesMax.type = "number";
        $keyframesMax.value = profile.keyframesMax || "";
        $keyframesMax.placeholder = i18n.defaultHint();

        // Option: -f <int> filter strength (0=off..100)
        const $filterStrengthLabel = document.createElement("label");
        $root.appendChild($filterStrengthLabel);
        $filterStrengthLabel.textContent = i18n.gif2webpFilterStrength(); // e.g., "Filter strength (0-100)"
        const $filterStrength = document.createElement("input");
        $filterStrengthLabel.appendChild($filterStrength);
        $filterStrength.type = "number";
        $filterStrength.value = profile.filterStrength || "";
        $filterStrength.placeholder = i18n.defaultHint();

        // Option: -metadata <string> comma separated list of metadata
        const $metadataLabel = document.createElement("label");
        $root.appendChild($metadataLabel);
        $metadataLabel.textContent = i18n.gif2webpMetadata(); // e.g., "Metadata to copy"
        const $metadata = document.createElement("input");
        $metadataLabel.appendChild($metadata);
        $metadata.type = "text";
        $metadata.value = profile.metadata || "";
        $metadata.placeholder = "all, none, icc, xmp"; // Or i18n.gif2webpMetadataHint()

        $root.appendChild(document.createElement("hr"));

        // Option: -lossy
        const $lossyLabel = document.createElement("label");
        $root.appendChild($lossyLabel);
        $lossyLabel.textContent = i18n.gif2webpLossy(); // e.g., "Lossy compression"
        const $lossy = document.createElement("input");
        $lossyLabel.appendChild($lossy);
        $lossy.type = "checkbox";
        $lossy.checked = profile.lossy;

        // Option: -mixed
        const $mixedLabel = document.createElement("label");
        $root.appendChild($mixedLabel);
        $mixedLabel.textContent = i18n.gif2webpMixed(); // e.g., "Mixed mode (lossy/lossless per frame)"
        const $mixed = document.createElement("input");
        $mixedLabel.appendChild($mixed);
        $mixed.type = "checkbox";
        $mixed.checked = profile.mixed;

        // Option: -min_size
        const $minSizeLabel = document.createElement("label");
        $root.appendChild($minSizeLabel);
        $minSizeLabel.textContent = i18n.gif2webpMinSize(); // e.g., "Minimize output size"
        const $minSize = document.createElement("input");
        $minSizeLabel.appendChild($minSize);
        $minSize.type = "checkbox";
        $minSize.checked = profile.minSize;

        // Option: -loop_compatibility
        const $loopCompatLabel = document.createElement("label");
        $root.appendChild($loopCompatLabel);
        $loopCompatLabel.textContent = i18n.gif2webpLoopCompat(); // e.g., "Loop compatibility mode"
        const $loopCompat = document.createElement("input");
        $loopCompatLabel.appendChild($loopCompat);
        $loopCompat.type = "checkbox";
        $loopCompat.checked = profile.loopCompat;

        // Option: -mt
        const $mtLabel = document.createElement("label");
        $root.appendChild($mtLabel);
        $mtLabel.textContent = i18n.gif2webpMt(); // e.g., "Use multi-threading"
        const $mt = document.createElement("input");
        $mtLabel.appendChild($mt);
        $mt.type = "checkbox";
        $mt.checked = profile.mt;

        return {
          root: $root,
          profile: () => {
            profile.quality = $quality.value || undefined;
            profile.method = $method.value || undefined;
            profile.keyframesMin = $keyframesMin.value || undefined;
            profile.keyframesMax = $keyframesMax.value || undefined;
            // profile.f = $f.value || undefined;
            profile.metadata = $metadata.value || undefined;
            profile.lossy = $lossy.checked;
            profile.mixed = $mixed.checked;
            profile.minSize = $minSize.checked;
            profile.loopCompat = $loopCompat.checked;
            profile.mt = $mt.checked;
            return profile;
          },
        };
      },
      execute: (profile, { input, output }) => {
        const args = ["gif2webp", input, "-o", output];
        if (profile.quality) args.push("-q", profile.quality);
        if (profile.method) args.push("-m", profile.method);
        if (profile.keyframesMin) args.push("-kmin", profile.keyframesMin);
        if (profile.keyframesMax) args.push("-kmax", profile.keyframesMax);
        if (profile.filterStrength) args.push("-f", profile.filterStrength);
        if (profile.metadata) args.push("-metadata", profile.metadata);
        if (profile.lossy) args.push("-lossy");
        if (profile.mixed) args.push("-mixed");
        if (profile.minSize) args.push("-min_size");
        if (profile.loopCompat) args.push("-loop_compatibility");
        if (profile.mt) args.push("-mt");
        const { promise, resolve, reject } = Promise.withResolvers();
        const child = child_process.spawn(consts.exe, args);
        child.on("error", (error) => reject(error));
        child.on("exit", (v) => (v ? reject(new Error("" + v)) : resolve(0)));
        return {
          progress: () => 0,
          stop: () => child.kill(),
          promise,
        };
      },
    },
    {
      id: "cjpegli",
      name: "cjpegli",
      description: i18n.cjpegliDescription(),
      kind: "common-files",
      // question: what about extract image from a.pdf, b.pdf to out/a/XXX.png out/b/XXX.png ?
      ui: (profile) => {
        // don't use <select multiple>, it's weird in mobile browser. what about <datalist> ?
        const $root = document.createElement("form");
        $root.classList.add("root");
        const css = String.raw;
        $root.appendChild(document.createElement("style")).textContent = css`
          .action .root {
            display: flex;
            flex-wrap: wrap;
            gap: 6px 12px;
          }
          .action .root hr {
            border: none;
            width: 100%;
            height: 0;
            margin: 0;
          }
        `;
        $root.addEventListener("post-remove", (e) => console.log(e));

        // Option: -q QUALITY, --quality=QUALITY
        const $qualityLabel = document.createElement("label");
        $root.appendChild($qualityLabel);
        $qualityLabel.textContent = i18n.cjpegliQuality();
        const $quality = document.createElement("input");
        $qualityLabel.appendChild($quality);
        $quality.type = "number";
        $quality.value = profile.quality || "";
        $quality.placeholder = i18n.defaultHint();

        // Option: -p N, --progressive_level=N // Progressive level setting. Range: 0 .. 2. // Default: 2. Higher number is more scans, 0 means sequential
        const $progressiveLevelLabel = document.createElement("label");
        $root.appendChild($progressiveLevelLabel);
        $progressiveLevelLabel.textContent = i18n.cjpegliProgressiveLevel();
        const $progressiveLevel = document.createElement("input");
        $progressiveLevelLabel.appendChild($progressiveLevel);
        $progressiveLevel.type = "number";
        $progressiveLevel.value = profile.progressiveLevel || "";
        $progressiveLevel.placeholder = i18n.defaultHint();

        // Option: --chroma_subsampling=444|440|422|420 // Chroma subsampling setting
        const $chromaSubsamplingLabel = document.createElement("label");
        $root.appendChild($chromaSubsamplingLabel);
        $chromaSubsamplingLabel.textContent = i18n.cjpegliChromaSubsampling();
        const $chromaSubsampling = document.createElement("input");
        $chromaSubsamplingLabel.appendChild($chromaSubsampling);
        $chromaSubsampling.value = profile.chromaSubsampling || "";
        $chromaSubsampling.placeholder = i18n.defaultHint();

        $root.appendChild(document.createElement("hr"));

        // Option: --std_quant // Use quantization tables based on Annex K of the JPEG standard
        const $stdQuantLabel = document.createElement("label");
        $root.appendChild($stdQuantLabel);
        $stdQuantLabel.textContent = i18n.cjpegliStdQuant();
        const $stdQuant = document.createElement("input");
        $stdQuantLabel.appendChild($stdQuant);
        $stdQuant.type = "checkbox";
        $stdQuant.checked = profile.stdQuant;

        // Option: --xyb // Convert to XYB colorspace
        const $xybLabel = document.createElement("label");
        $root.appendChild($xybLabel);
        $xybLabel.textContent = i18n.cjpegliXyb();
        const $xyb = document.createElement("input");
        $xybLabel.appendChild($xyb);
        $xyb.type = "checkbox";
        $xyb.checked = profile.xyb;

        // Option: --noadaptive_quantization // Disable adaptive quantization
        const $noadaptiveLabel = document.createElement("label");
        $root.appendChild($noadaptiveLabel);
        $noadaptiveLabel.textContent = i18n.cjpegliNoadaptive();
        const $noadaptive = document.createElement("input");
        $noadaptiveLabel.appendChild($noadaptive);
        $noadaptive.type = "checkbox";
        $noadaptive.checked = profile.noadaptive;

        return {
          root: $root,
          profile: () => {
            profile.quality = $quality.value;
            profile.progressiveLevel = $progressiveLevel.value;
            profile.chromaSubsampling = $chromaSubsampling.value;
            profile.stdQuant = $stdQuant.checked;
            profile.xyb = $xyb.checked;
            profile.noadaptive = $noadaptive.checked;
            return profile;
          },
          preview: (input) => {
            // todo: preview here, when select in file list, this will be called
            // todo: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/output
          },
        };
      },
      execute: (profile, { input, output }) => {
        // todo: ability to call other actions?
        const args = ["cjpegli", input, output];
        if (profile.quality) args.push("--quality=" + profile.quality);
        if (profile.progressiveLevel)
          args.push("--progressive_level=" + profile.progressiveLevel);
        if (profile.chromaSubsampling)
          args.push("--chroma_subsampling=" + profile.chromaSubsampling);
        if (profile.stdQuant) args.push("--std_quant");
        if (profile.xyb) args.push("--xyb");
        if (profile.noadaptive) args.push("--noadaptive_quantization");
        const { promise, resolve, reject } = Promise.withResolvers();
        const child = child_process.spawn(consts.exe, args);
        child.on("error", (error) => reject(error));
        child.on("exit", (v) => (v ? reject(new Error("" + v)) : resolve(0)));
        return {
          progress: () => 0,
          stop: () => child.kill(),
          promise,
        };
      },
    },
    {
      id: "djpegli",
      name: "djpegli",
      description: i18n.djpegliDescription(),
      kind: "common-files",
      ui: (profile) => {
        const $root = document.createElement("form");
        $root.classList.add("root");
        const css = String.raw;
        $root.appendChild(document.createElement("style")).textContent = css`
          .action .root {
            display: flex;
            flex-wrap: wrap;
            gap: 6px 12px;
          }
        `;
        $root.addEventListener("post-remove", (e) => console.log(e));

        // Option: --bitdepth=8|16 // Sets the output bitdepth for integer based formats, can be 8 (default) or 16. Has no impact on PFM output
        const $bitdepthLabel = document.createElement("label");
        $root.appendChild($bitdepthLabel);
        $bitdepthLabel.textContent = i18n.djpegliBitdepth();
        const $bitdepth = document.createElement("input");
        $bitdepthLabel.appendChild($bitdepth);
        $bitdepth.type = "number";
        $bitdepth.value = profile.bitdepth || "";
        $bitdepth.placeholder = i18n.defaultHint();

        return {
          root: $root,
          profile: () => {
            profile.bitdepth = $bitdepth.value;
            return profile;
          },
        };
      },
      execute: (profile, { input, output }) => {
        const args = ["djpegli", input, output];
        if (profile.bitdepth) args.push("--bitdepth=" + profile.bitdepth);
        const { promise, resolve, reject } = Promise.withResolvers();
        const child = child_process.spawn(consts.exe, args);
        child.on("error", (error) => reject(error));
        child.on("exit", (v) => (v ? reject(new Error("" + v)) : resolve(0)));
        return {
          progress: () => 0,
          stop: () => child.kill(),
          promise,
        };
      },
    },
    {
      id: "cjxl",
      name: "cjxl",
      description: i18n.cjxlDescription(),
      kind: "common-files",
      ui: (profile) => {
        const $root = document.createElement("form");
        $root.classList.add("root");
        const css = String.raw;
        $root.appendChild(document.createElement("style")).textContent = css`
          .action .root {
            display: flex;
            flex-wrap: wrap;
            gap: 6px 12px;
          }
          .action .root label.off {
            display: none;
          }
          .action .root hr {
            border: none;
            width: 100%;
            height: 0;
            margin: 0;
          }
        `;
        $root.addEventListener("post-remove", (e) => console.log(e));

        const $qualityMethod = document.createElement("fieldset");
        $root.appendChild($qualityMethod);
        const $qualityMethodLegend = document.createElement("legend");
        $qualityMethod.appendChild($qualityMethodLegend);
        $qualityMethodLegend.textContent = i18n.cjxlQualityMethod();
        const $distanceRadioLabel = document.createElement("label");
        $qualityMethod.appendChild($distanceRadioLabel);
        $distanceRadioLabel.textContent = i18n.cjxlQualityMethodDistance();
        const $distanceRadio = document.createElement("input");
        $distanceRadioLabel.appendChild($distanceRadio);
        $distanceRadio.type = "radio";
        $distanceRadio.name = "cjxl-quality-method";
        if (profile.distance) $distanceRadio.checked = true;
        const $qualityRadioLabel = document.createElement("label");
        $qualityMethod.appendChild($qualityRadioLabel);
        $qualityRadioLabel.textContent = i18n.cjxlQualityMethodQuality();
        const $qualityRadio = document.createElement("input");
        $qualityRadioLabel.appendChild($qualityRadio);
        $qualityRadio.type = "radio";
        $qualityRadio.name = "cjxl-quality-method";
        if (profile.quality || !profile.distance) $qualityRadio.checked = true; // question: as default?
        const r$qualityMethod = () => {
          if ($distanceRadio.checked) {
            $distanceLabel.classList.remove("off");
            $qualityLabel.classList.add("off");
          } else if ($qualityRadio.checked) {
            $distanceLabel.classList.add("off");
            $qualityLabel.classList.remove("off");
          } else cu.assert(false);
        };
        $distanceRadio.onchange = $qualityRadio.onchange = r$qualityMethod;

        $root.appendChild(document.createElement("hr"));

        const $distanceLabel = document.createElement("label");
        $root.appendChild($distanceLabel);
        $distanceLabel.textContent = i18n.cjxlDistance();
        const $distance = document.createElement("input");
        $distanceLabel.appendChild($distance);
        $distance.type = "number";
        $distance.step = "0.1";
        $distance.value = profile.distance || "";
        $distance.placeholder = i18n.defaultHint();

        const $qualityLabel = document.createElement("label");
        $root.appendChild($qualityLabel);
        $qualityLabel.textContent = i18n.cjxlQuality();
        const $quality = document.createElement("input");
        $qualityLabel.appendChild($quality);
        $quality.type = "number";
        $quality.value = profile.quality || "";
        $quality.placeholder = i18n.defaultHint();

        r$qualityMethod();

        const $effortLabel = document.createElement("label");
        $root.appendChild($effortLabel);
        $effortLabel.textContent = i18n.cjxlEffort();
        const $effort = document.createElement("input");
        $effortLabel.appendChild($effort);
        $effort.type = "number";
        $effort.value = profile.effort || "";
        $effort.placeholder = i18n.defaultHint();

        const $brotliEffortLabel = document.createElement("label");
        $root.appendChild($brotliEffortLabel);
        $brotliEffortLabel.textContent = i18n.cjxlBrotliEffort();
        const $brotliEffort = document.createElement("input");
        $brotliEffortLabel.appendChild($brotliEffort);
        $brotliEffort.type = "number";
        $brotliEffort.value = profile.brotliEffort || "";
        $brotliEffort.placeholder = i18n.defaultHint();

        $root.appendChild(document.createElement("hr"));

        const $losslessJpegLabel = document.createElement("label");
        $root.appendChild($losslessJpegLabel);
        $losslessJpegLabel.textContent = i18n.cjxlLosslessJpeg();
        const $losslessJpeg = document.createElement("input");
        $losslessJpegLabel.appendChild($losslessJpeg);
        $losslessJpeg.type = "checkbox";
        $losslessJpeg.checked = profile.losslessJpeg === "1";

        return {
          root: $root,
          profile: () => {
            profile.distance = $distance.value || undefined;
            profile.quality = $quality.value || undefined;
            if (!$distanceRadio.checked) delete profile.distance;
            if (!$qualityRadio.checked) delete profile.quality;
            profile.effort = $effort.value || undefined; // set empty string to undefined
            profile.brotliEffort = $brotliEffort.value || undefined;
            profile.losslessJpeg = $losslessJpeg.checked ? "1" : "0";
            return profile;
          },
        };
      },
      execute: (profile, { input, output }) => {
        const args = ["cjxl", input, output];
        cu.assert(!(profile.distance && profile.quality));
        if (profile.distance) args.push("--distance=" + profile.distance);
        if (profile.quality) args.push("--quality=" + profile.quality);
        if (profile.effort) args.push("--effort=" + profile.effort);
        if (profile.brotliEffort)
          args.push("--brotli_effort=" + profile.brotliEffort);
        if (profile.losslessJpeg)
          args.push("--lossless_jpeg=" + profile.losslessJpeg);
        const { promise, resolve, reject } = Promise.withResolvers();
        const child = child_process.spawn(consts.exe, args);
        child.on("error", (error) => reject(error));
        child.on("exit", (v) => (v ? reject(new Error("" + v)) : resolve(0)));
        return {
          progress: () => 0,
          stop: () => child.kill(),
          promise,
        };
      },
    },
    {
      id: "djxl",
      name: "djxl",
      description: i18n.djxlDescription(),
      kind: "common-files",
      ui: (profile) => {
        const $root = document.createElement("form");
        $root.classList.add("root");
        const css = String.raw;
        $root.appendChild(document.createElement("style")).textContent = css`
          .action .root {
            display: flex;
            flex-wrap: wrap;
            gap: 6px 12px;
          }
          .action .root > section > .off {
            opacity: 0.6;
            pointer-events: none;
          }
          .action .root > section > :last-child {
            text-indent: 4px;
            display: block;
            margin-top: 2px;
          }
        `;
        $root.addEventListener("post-remove", (e) => console.log(e));

        // Option: --bits_per_sample=N
        const $bitsPerSampleLabel = document.createElement("label");
        $root.appendChild($bitsPerSampleLabel);
        $bitsPerSampleLabel.textContent = i18n.djxlBitsPerSample();
        const $bitsPerSample = document.createElement("input");
        $bitsPerSampleLabel.appendChild($bitsPerSample);
        $bitsPerSample.type = "number";
        $bitsPerSample.value = profile.bitsPerSample || "";
        $bitsPerSample.placeholder = i18n.defaultHint();

        // Option: --display_nits=N
        const $displayNitsLabel = document.createElement("label");
        $root.appendChild($displayNitsLabel);
        $displayNitsLabel.textContent = i18n.djxlDisplayNits();
        const $displayNits = document.createElement("input");
        $displayNitsLabel.appendChild($displayNits);
        $displayNits.type = "number";
        $displayNits.value = profile.displayNits || "";
        $displayNits.placeholder = i18n.defaultHint();

        // Option: --color_space=COLORSPACE_DESC
        const $colorSpaceLabel = document.createElement("label");
        $root.appendChild($colorSpaceLabel);
        $colorSpaceLabel.textContent = i18n.djxlColorSpace();
        const $colorSpace = document.createElement("input");
        $colorSpaceLabel.appendChild($colorSpace);
        $colorSpace.value = profile.colorSpace || "";
        $colorSpace.placeholder = i18n.defaultHint();

        // Option: --downsampling=1|2|4|8
        const $downsamplingLabel = document.createElement("label");
        $root.appendChild($downsamplingLabel);
        $downsamplingLabel.textContent = i18n.djxlDownsampling();
        const $downsampling = document.createElement("input");
        $downsamplingLabel.appendChild($downsampling);
        $downsampling.value = profile.downsampling || "";
        $downsampling.placeholder = i18n.defaultHint();

        const $pixelsToJpegSection = document.createElement("section");
        $root.appendChild($pixelsToJpegSection);
        // Option: --pixels_to_jpeg
        const $pixelsToJpegLabel = document.createElement("label");
        $pixelsToJpegSection.appendChild($pixelsToJpegLabel);
        $pixelsToJpegLabel.textContent = i18n.djxlPixelsToJpeg();
        const $pixelsToJpeg = document.createElement("input");
        $pixelsToJpegLabel.appendChild($pixelsToJpeg);
        $pixelsToJpeg.type = "checkbox";
        $pixelsToJpeg.checked = profile.pixelsToJpeg;
        $pixelsToJpeg.onchange = () =>
          $jpegQualityLabel.classList.toggle("off", !$pixelsToJpeg.checked);
        // Option: --jpeg_quality=N
        const $jpegQualityLabel = document.createElement("label");
        $pixelsToJpegSection.appendChild($jpegQualityLabel);
        $jpegQualityLabel.textContent = i18n.djxlJpegQuality();
        const $jpegQuality = document.createElement("input");
        $jpegQualityLabel.appendChild($jpegQuality);
        $jpegQuality.type = "number";
        $jpegQuality.value = profile.jpegQuality || "";
        $jpegQuality.placeholder = i18n.defaultHint();
        $jpegQualityLabel.classList.toggle("off", !$pixelsToJpeg.checked);

        const $alphaBlendSection = document.createElement("section");
        $root.appendChild($alphaBlendSection);
        // Option: --alpha_blend
        const $alphaBlendLabel = document.createElement("label");
        $alphaBlendSection.appendChild($alphaBlendLabel);
        $alphaBlendLabel.textContent = i18n.djxlAlphaBlend();
        const $alphaBlend = document.createElement("input");
        $alphaBlendLabel.appendChild($alphaBlend);
        $alphaBlend.type = "checkbox";
        $alphaBlend.checked = profile.alphaBlend;
        $alphaBlend.onchange = () =>
          $backgroundLabel.classList.toggle("off", !$alphaBlend.checked);
        // Option: --background=#NNNNNN
        const $backgroundLabel = document.createElement("label");
        $alphaBlendSection.appendChild($backgroundLabel);
        $backgroundLabel.textContent = i18n.djxlBackground();
        const $background = document.createElement("input");
        $backgroundLabel.appendChild($background);
        $background.value = profile.background || "";
        $background.placeholder = i18n.defaultHint();
        $backgroundLabel.classList.toggle("off", !$alphaBlend.checked);

        // Option: --allow_partial_files
        const $allowPartialFilesLabel = document.createElement("label");
        $root.appendChild($allowPartialFilesLabel);
        $allowPartialFilesLabel.textContent = i18n.djxlAllowPartialFiles();
        const $allowPartialFiles = document.createElement("input");
        $allowPartialFilesLabel.appendChild($allowPartialFiles);
        $allowPartialFiles.type = "checkbox";
        $allowPartialFiles.checked = profile.allowPartialFiles;

        return {
          root: $root,
          profile: () => {
            profile.bitsPerSample = $bitsPerSample.value || undefined;
            profile.displayNits = $displayNits.value || undefined;
            profile.colorSpace = $colorSpace.value || undefined;
            profile.downsampling = $downsampling.value || undefined;
            profile.pixelsToJpeg = $pixelsToJpeg.checked;
            profile.jpegQuality = $jpegQuality.value || undefined;
            profile.alphaBlend = $alphaBlend.checked;
            profile.background = $background.value || undefined;
            profile.allowPartialFiles = $allowPartialFiles.checked;
            return profile;
          },
        };
      },
      execute: (profile, { input, output }) => {
        const args = ["djxl", input, output];
        if (profile.bitsPerSample)
          args.push("--bits_per_sample=" + profile.bitsPerSample);
        if (profile.displayNits)
          args.push("--display_nits=" + profile.displayNits);
        if (profile.colorSpace)
          args.push("--color_space=" + profile.colorSpace);
        if (profile.downsampling)
          args.push("--downsampling=" + profile.downsampling);
        if (profile.allowPartialFiles) args.push("--allow_partial_files");
        if (profile.pixelsToJpeg) args.push("--pixels_to_jpeg");
        if (profile.jpegQuality)
          args.push("--jpeg_quality=" + profile.jpegQuality);
        if (profile.alphaBlend) args.push("--alpha_blend");
        if (profile.background) args.push("--background=" + profile.background);
        const { promise, resolve, reject } = Promise.withResolvers();
        const child = child_process.spawn(consts.exe, args);
        child.on("error", (error) => reject(error));
        child.on("exit", (v) => (v ? reject(new Error("" + v)) : resolve(0)));
        return {
          progress: () => 0,
          stop: () => child.kill(),
          promise,
        };
      },
    },
  ],
  // a profile should be a pure json that can be store by non-developers
  profiles: [
    // some preset profile, weak typing
    {
      id: "cwebp",
      name: "cwebp",
      description: i18n.cwebpDescription(),
      actionId: "cwebp",
      extensionId: "zcodecs",
      extensionVersion: "0.1.0",
      // below are fields for action
      quality: "75",
      alphaQuality: "100",
      // losslessLevel: "9",
      method: "4",
      // targetSize: "",
      // targetPsnr: "",
      lossless: false,
      // filterStrength: "60",
      // sharpness: "0",
      sharpYuv: false,
      noAlpha: false,
      lowMemory: false,
      // below are fields for entries
      entries: {
        inputExtensions: ["png", "jpeg", "jpg", "webp", "pnm"],
        outputExtensions: ["webp"],
      },
    },
    {
      id: "dwebp",
      name: "dwebp",
      description: i18n.dwebpDescription(),
      actionId: "dwebp",
      extensionId: "zcodecs",
      extensionVersion: "0.1.0",
      // below are fields for action
      nofancy: false,
      flip: false,
      alpha: false,
      // below are fields for entries
      entries: {
        inputExtensions: ["webp"],
        outputExtensions: ["png", "jpeg", "ppm", "bmp", "tiff", "yuv"],
      },
    },
    {
      id: "gif2webp",
      name: "gif2webp",
      description: i18n.gif2webpDescription(),
      actionId: "gif2webp",
      extensionId: "zcodecs",
      extensionVersion: "0.1.0",
      // below are fields for action
      quality: "75",
      method: "4",
      // keyframesMin: undefined,
      // keyframesMax: undefined,
      // filterStrength: "60",
      // metadata: "xmp",
      lossy: false,
      mixed: false,
      minSize: false,
      loopCompat: false,
      mt: false,
      // below are fields for entries
      entries: {
        inputExtensions: ["gif"],
        outputExtensions: ["webp"],
      },
    },
    {
      id: "cjpegli", // agreement: profile.id == action.id means default profile for that action
      name: "cjpegli",
      description: i18n.cjpegliDescription(),
      actionId: "cjpegli",
      extensionId: "zcodecs",
      extensionVersion: "0.1.0", // todo: 目前先手动写，与扩展自身保持一致，以后可省略?
      // below are fields for action // should be all string, or boolean if can not be string
      quality: "90",
      progressiveLevel: "2",
      // chromaSubsampling: "444",
      stdQuant: false,
      xyb: false,
      noadaptive: false,
      // below are fields for entries
      // todo: 用户：我上次 output dir 到这，这次还想要到这，存profile 里，所以 entries 选项放在profile 里而不是固定在 action里
      // 对 entries 的选项 给出建议, 此处的 entries 目前只适用于 action kind: "common-files"
      entries: {
        inputExtensions: ["jxl", "jpeg", "jpg", "png", "apng"],
        outputExtensions: ["jpeg", "jpg"], // 第一个是默认的
        // outputExtension: "jpg", // 或者指定一个默认的
      },
    },
    {
      id: "djpegli",
      name: "djpegli",
      description: i18n.djpegliDescription(),
      actionId: "djpegli",
      extensionId: "zcodecs",
      extensionVersion: "0.1.0",
      // below are fields for action
      bitdepth: "8",
      // below are fields for entries
      entries: {
        inputExtensions: ["jpeg", "jpg"],
        outputExtensions: ["png", "apng", "jpeg", "ppm", "pfm", "pgx"],
      },
    },
    {
      id: "cjxl",
      name: "cjxl",
      description: i18n.cjxlDescription(),
      actionId: "cjxl",
      extensionId: "zcodecs",
      extensionVersion: "0.1.0",
      // below are fields for action // should be all string, or boolean if can not be string
      // todo: progressive: true,
      // distance: "0.5",
      // quality: "68", // keep this undefined as auto
      effort: "7",
      brotliEffort: "9",
      losslessJpeg: "1",
      // below are fields for entries
      entries: {
        inputExtensions: ["jxl", "jpeg", "jpg", "png", "apng", "gif"],
        outputExtensions: ["jxl"],
      },
    },
    {
      id: "djxl",
      name: "djxl",
      description: i18n.djxlDescription(),
      actionId: "djxl",
      extensionId: "zcodecs",
      extensionVersion: "0.1.0",
      // below are fields for action
      // bitsPerSample: "0",
      // displayNits: "1000",
      // colorSpace: "RGB_D65_SRG_Per_SRG",
      // downsampling: "1",
      pixelsToJpeg: false,
      jpegQuality: "95",
      alphaBlend: false,
      background: "#FFFFFF",
      allowPartialFiles: false,
      // below are fields for entries
      entries: {
        inputExtensions: ["jxl"],
        outputExtensions: ["png", "apng", "jpeg", "ppm", "pfm", "pgx"],
      },
    },
  ],
};
