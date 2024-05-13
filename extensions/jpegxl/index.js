// @ts-check
/** @import { Extension } from "../../index.js" */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
// excluded: import { spawn } from "node:child_process"; // 可以这种形式为前端禁用 // 这些砍 import 的魔法，在加载扩展的时候做

const exe = /** @type { { (): string, _v?: string } } */ () => {
  if (!exe._v) exe._v = join(dirname(fileURLToPath(import.meta.url)), "jpegxl");
  return exe._v;
};

// https://effectivetypescript.com/2023/09/27/closure-compiler/
// https://github.com/microsoft/TypeScript/issues/41825
// https://nodejs.org/api/module.html#customization-hooks

// 设计成导出一整个的形式，单个单个导出没法做 type check
export default /** @type {Extension} */ ({
  id: "jpegxl", // 保证唯一，让商店去保证
  version: "0.1.0", // 必须遵循 https://semver.org
  name: "jpegxl name", // 以后可以做 i18n
  description: "jpegxl description",
  dependencies: [], // 可以填写其他的 extension 的 id (这个功能需要扩展商店)
  assets: [
    {
      // 以后可能这里手动维护文档，因为 jsdoc typescript 要做这个得类型体操。我们以后用 kind 区分，然后其他属性直接 any，在 loadAsset 函数中去 match 不同得 AssetKind 然后做不同操作。
      platform: "linux-x64",
      kind: "zip", // 比如可以做 tar --strip-components 这样的
      path: "./",
      // url 就直接填 github，然后让核心去做镜像加速和多源下载
      url: "https://github.com/clevert-app/clevert/releases/download/make.jpegxl_b2fb216_8900231253/linux-x64.zip",
    },
  ],
  actions: [
    // Action 的设计，是有一个 ui(profile)=>controller, 有一个 execute(profile,entry)=>controller
    // ui 不应该返回所有 entry，至少在大多数情况不应该。因为文件夹里可能有大量文件。这里我们选择 ui 只出 profile，而 entries 由核心根据 `kind: "converter"` 出。发到后端得请求应该是 entriesGenOptions 或者别的名字。
    // 这里的设计还有一些不确定性，但是可以确定的是，profile 和 entries 必然分开，entries 是每次调用变动的，profile 是不变的
    {
      id: "cjpegli",
      name: "cjpegli name",
      description: "cjpegli description",
      kind: "converter", // 还可以是 group-converter，manual converter 之类的？
      ui: (profile) => {
        // 这个函数在前端跑，画界面
        const root = document.createElement("action_root_");
        const input = root.appendChild(document.createElement("input"));
        input.type = "number";
        input.value = profile.quality;
        input.placeholder = "quality(0-100)";
        return {
          root: root,
          profile: () => {
            profile.quality = Number(input.value);
            return profile;
          },
          preview: (input) => {
            // 这边可以做预览，就是在文件列表里选择的时候会被调用
          },
        };
      },
      execute: (profile, { input, output }) => {
        // 这个函数在后端跑，要求不 block 主线程，只能 async。如果要 block 请自行开 worker
        const child = spawn(exe(), [
          "cjpegli",
          input.main[0],
          output.main[0],
          "-q",
          String(profile.quality),
        ]);
        let progressValue = 0;
        child.stderr.on("data", (/** @type {Buffer} */ data) => {
          const chunk = data.toString();
          progressValue = 0.5;
        });
        return {
          progress: () => {
            return progressValue;
          },
          stop: () => {
            child.kill("SIGTERM");
          },
          wait: new Promise((resolve, reject) => {
            child.on("error", (err) => reject(err));
            child.on("exit", (code) => (code ? reject({ code }) : resolve(0)));
          }),
        };
      },
    },
  ],
  profiles: [
    // 一些预设的 profile，弱类型
    {
      name: "cjpegli default profile name",
      description: "cjpegli default profile description",
      action: "cjpegli",
      quality: 75,
      // 对 entriesOpts 给出建议
      entriesOpts: {
        outputExtension: "jpeg",
      },
    },
  ],
});
