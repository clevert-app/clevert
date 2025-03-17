// @ts-check
/** @import { Extension, ClevertUtils } from "../../index.js" */
import child_process from "node:child_process";
import path from "node:path";
const cu = /** @type {ClevertUtils} */ (globalThis.clevertUtils);
const consts = globalThis.process && /* simple trick, eval only in nodejs */ {
  exe: path.join(import.meta.dirname, "zcodecs"), // can't be implemented inside ClevertUtils because we need current module's import.meta
};
const i18nRes = (() => {
  const enus = {
    description: () => "Includes ect, webp, jpeg-xl and other modern codecs",
    cjpegliDescription: () =>
      "Advanced JPEG encoder, better quality without loosing compatibility",
    cjpegliQuality: () => "Quality",
    cjpegliProgressiveLevel: () => "Progressive level",
    cjxlDescription: () =>
      "JPEG XL image encoder. JPEG XL delivers best-of-breed quality and size",
    cjxlQuality: () => "Quality",
    cjxlEffort: () => "Effort",
  };
  /** @type {Readonly<typeof enus>} */
  const zhcn = {
    description: () => "包含了 ect, webp, jpeg-xl 等现代编解码器",
    cjpegliDescription: () =>
      "先进的 JPEG 编码器，在保证兼容性的前提下提高更好的效果",
    cjpegliQuality: () => "质量",
    cjpegliProgressiveLevel: () => "渐进等级",
    cjxlDescription: () =>
      "JPEG XL 图片编码器。JPEG XL 提供质量与体积的最佳组合",
    cjxlQuality: () => "质量",
    cjxlEffort: () => "强度",
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
    // ui 不应该返回所有 entry，至少在大多数情况不应该。因为文件夹里可能有大量文件。这里我们选择 ui 只出 profile，而 entries 由核心根据 `kind: "converter"` 出。发到后端得请求应该是 entriesGenOptions 或者别的名字。
    // 这里的设计还有一些不确定性，但是可以确定的是，profile 和 entries 必然分开，entries 是每次调用变动的，profile 是不变的
    {
      id: "cjpegli",
      name: "cjpegli",
      description: i18n.cjpegliDescription(),
      kind: "common-files", // 这里允许使用 daemon，number sequence，plain 等不同种类。
      // 涉及到一个矛盾，就是如果把文件相关功能收归核心，那就减少了灵活性。如果用核心 export 给扩展 import，那扩展就可能对核心做 hack 才能实现功能，不可避免会 breaking
      // 倾向于收归核心。有个问题是 "扩展建议 out extension" 的设计
      // 比如 out-dir 可以给 yt-dlp, out-dir 的时候，要求返回的 ui controller 里有 entries 函数
      // 还有一个设想，比如 a.pdf b.pdf 提取图片到 out/a/XXX.png out/b/XXX.png 这要怎么处理？
      ui: (profile) => {
        // don't use <select multiple>, it's weird in mobile browser
        // todo: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/output
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

        const $qualityLabel = document.createElement("label");
        $root.appendChild($qualityLabel);
        $qualityLabel.textContent = i18n.cjpegliQuality() + " (0-100):";
        const $quality = document.createElement("input");
        $qualityLabel.appendChild($quality);
        $quality.type = "number";
        $quality.value = profile.quality;

        const $progressiveLevelLabel = document.createElement("label");
        $root.appendChild($progressiveLevelLabel);
        $progressiveLevelLabel.textContent = i18n.cjpegliProgressiveLevel();
        const $progressiveLevel = document.createElement("input");
        $progressiveLevelLabel.appendChild($progressiveLevel);
        $progressiveLevel.type = "number";
        $progressiveLevel.value = profile.progressiveLevel;

        return {
          root: $root,
          profile: () => {
            profile.quality = Number($quality.value);
            return profile;
          },
          preview: (input) => {
            // 这边可以做预览，就是在文件列表里选择的时候会被调用
          },
        };
      },
      execute: (profile, { input, output }) => {
        // todo: ability to call other actions?
        const child = child_process.spawn(consts.exe, [
          "cjpegli",
          input.main[0],
          output.main[0],
          "--quality",
          String(profile.quality),
          "--progressive_level",
          String(profile.progressiveLevel),
        ]);
        const { promise, resolve, reject } = Promise.withResolvers();
        child.on("error", (err) => reject(err));
        child.on("exit", (code) => (code ? reject(code) : resolve(code)));
        return {
          progress: () => 0, // for detail progress within single file, like ffmpeg, so others just returns 0
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
        `;
        $root.addEventListener("post-remove", (e) => console.log(e));

        const $qualityLabel = document.createElement("label");
        $root.appendChild($qualityLabel);
        $qualityLabel.textContent = i18n.cjxlQuality() + " (0-100):";
        const $quality = document.createElement("input");
        $qualityLabel.appendChild($quality);
        $quality.type = "number";
        $quality.value = profile.quality;

        const $effortLabel = document.createElement("label");
        $root.appendChild($effortLabel);
        $effortLabel.textContent = i18n.cjxlEffort() + " (1-10):";
        const $effort = document.createElement("input");
        $effortLabel.appendChild($effort);
        $effort.type = "number";
        $effort.value = profile.effort;

        return {
          root: $root,
          profile: () => {
            profile.quality = Number($quality.value);
            profile.effort = Number($effort.value);
            return profile;
          },
        };
      },
      execute: (profile, { input, output }) => {
        const child = child_process.spawn(consts.exe, [
          "cjxl",
          input,
          output,
          "--quality",
          String(profile.quality),
          "--effort",
          String(profile.effort),
        ]);
        const { promise, resolve, reject } = Promise.withResolvers();
        child.on("error", (err) => reject(err));
        child.on("exit", (code) => (code ? reject(code) : resolve(code)));
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
    // 一些预设的 profile，弱类型
    // 约定：对于相同的 action, 这个profile列表中 profile.id == action.id 的就是默认的
    {
      name: "cjpegli",
      description: i18n.cjpegliDescription(),
      id: "cjpegli",
      actionId: "cjpegli",
      extensionId: "zcodecs",
      extensionVersion: "0.1.0",
      quality: 90,
      progressiveLevel: 2,
      // todo: 用户：我上次output dir 到这，这次还想要到这，存profile 里，所以 entries 选项放在profile 里而不是固定在 action里
      // 对 entries 的选项 给出建议, 此处的 entries 只适用于 action kind: "common-files"
      entries: {
        // inputDir: "/home/kkocdko/misc/code/clevert/temp/_test_res/i",
        // outputDir: "/home/kkocdko/misc/code/clevert/temp/_test_res/o",
        inputExtensions: ["jxl", "jpeg", "jpg", "png", "apng"],
        outputExtensions: ["jpeg", "jpg"], // 第一个是默认的
        // outputExtension: "jpg", // 或者指定一个默认的
      },
    },
    {
      name: "cjxl",
      description: i18n.cjxlDescription(),
      id: "cjxl",
      actionId: "cjxl",
      extensionId: "zcodecs",
      extensionVersion: "0.1.0", // todo: 目前先手动写，与扩展自身保持一致，以后可省略
      quality: 90,
      effort: 7,
      entries: {
        inputDir: "/home/kkocdko/misc/code/clevert/temp/_test_res/i",
        outputDir: "/home/kkocdko/misc/code/clevert/temp/_test_res/o",
        inputExtensions: ["jxl", "jpeg", "jpg", "png", "apng"],
        outputExtensions: ["jxl"],
      },
    },
  ],
};

// ln extensions/zcodecs/index.js temp/index_zcodecs.js
// http://127.0.0.1:9393/static/index_zcodecs.js
