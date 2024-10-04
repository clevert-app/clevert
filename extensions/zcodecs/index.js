// @ts-check

// This is an example extension, shows almost all you need to know to write an extension.

/** @import { Extension, ClevertUtils } from "../../index.js" */
import child_process from "node:child_process";
import path from "node:path";

const cu = /** @type {ClevertUtils} */ (globalThis.clevertUtils);

// simple trick that eval only in nodejs
const consts = globalThis.process && {
  exe: path.join(import.meta.dirname, "zcodecs"), // can't be implemented inside ClevertUtils because we need current module's import.meta
};

const i18nRes = (() => {
  const enus = {
    description: () => "Includes ect, webp, jpeg-xl and other modern codecs",
    cjpegliDescription: () => "Advanced JPEG encoder",
  };
  /** @type {Readonly<typeof enus>} */
  const zhcn = {
    description: () => "包含了 ect, webp, jpeg-xl 等现代编解码器",
    cjpegliDescription: () => "先进的 JPEG 编码器",
  };
  return {
    "en-US": /** @type {Readonly<typeof enus>} */ (enus),
    "zh-CN": zhcn,
  };
})();
const i18n = i18nRes[cu.locale];

// export the whole object because type check is inconvenient if we use many individual exports
export default /** @type {Extension} */ ({
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
        const css = String.raw;
        const $profile = document.createElement("div");
        $profile.classList.add("profile");
        $profile.appendChild(document.createElement("style")).textContent = css`
          #action .profile {
            display: block;
          }
        `;
        const $qualityLabel = $profile.appendChild(
          document.createElement("label")
        );
        $qualityLabel.textContent = "quality(0-100):";
        const $quality = $profile.appendChild(document.createElement("input"));
        $quality.type = "number";
        $quality.value = profile.quality;
        return {
          // 给 yt-dlp 用
          // entriesRoot,
          // entries: () => {
          //   return [
          //     {
          //       input: { url: "https://www.youtube.com/watch?v=jb6BnVKmsl8" },
          //       output: { fileName: "id_1234.mp4" },
          //     },
          //     {
          //       input: { url: "https://www.youtube.com/watch?v=jb6BnVKmsl8" },
          //       output: { fileName: "id_1234.mp4" },
          //     },
          //   ];
          // },
          profileRoot: $profile,
          // 用函数取出，少用什么 getter setter
          profile: () => {
            // 可能不能这样写，可能会带上 entries？
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
          "-q",
          String(profile.quality),
          "-p",
          String(profile.progressiveLevel),
        ]);
        const { promise, resolve, reject } = Promise.withResolvers();
        child.on("error", (err) => reject(err));
        child.on("exit", (code) => (code ? reject(code) : resolve(code)));
        return {
          progress: () => 0,
          stop: () => {
            child.kill("SIGTERM");
          },
          wait: promise,
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
      description: "cjpegli default profile description",
      id: "cjpegli",
      actionId: "cjpegli",
      extensionId: "zcodecs",
      extensionVersion: "0.1.0",
      quality: 68,
      progressiveLevel: 0,
      // 用户：我上次output dir 到这，这次还想要到这，存profile 里，所以 entries 选项放在profile 里而不是固定在 action里
      // 对 entries 的选项 给出建议?
      // 用户要求能筛选输入文件扩展名，原生文件选择器 inputExtensionFilter: []
      entries: {
        // outputExtension: "jpeg",
        outputExtensionOptions: ["jpeg", "jxl"],
      },
    },
  ],
});
