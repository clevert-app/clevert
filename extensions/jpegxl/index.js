// @ts-check
/** @import { Extension } from "../../index.js" */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
// excluded: import { spawn } from "node:child_process"; // 可以这种形式为前端禁用 // 这些砍 import 的魔法，在加载扩展的时候做

const exe = globalThis?.process?.versions?.node
  ? join(dirname(fileURLToPath(import.meta.url)), "jpegxl")
  : "<invalid>";

// https://effectivetypescript.com/2023/09/27/closure-compiler/
// https://github.com/microsoft/TypeScript/issues/41825
// https://nodejs.org/api/module.html#customization-hooks

// 设计成导出一整个的形式，单个单个导出没法做 type check
export default /** @type {Extension} */ ({
  id: "jpegxl", // 保证唯一，让商店去保证
  version: "0.1.0", // 必须遵循 https://semver.org
  name: "jpegxl name", // 以后可以做 i18n
  description: "jpegxl description",
  dependencies: [], // 可以填写其他的 extension 的 id (这个功能需要扩展商店)（注意考虑 semver？）
  assets: [
    {
      platform: "linux-x64",
      // 如果是zip，那就直接用我们的unzip，如果不是，那就麻烦了，就要搞一个 archives 扩展，集成7zip， https://github.com/libarchive/libarchive 等等，用来解压
      kind: "zip", // 比如可以做 tar --strip-components 这样的
      path: "./", // 从扩展文件夹路径开始算
      // url 就直接填 github，然后让核心去做镜像加速
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
      kind: "common-files", // 这里允许使用 daemon，number sequence，plain 等不同种类。
      // 涉及到一个矛盾，就是如果把文件相关功能收归核心，那就减少了灵活性。如果用核心 export 给扩展 import，那扩展就可能对核心做 hack 才能实现功能，不可避免会 breaking
      // 倾向于收归核心。有个问题是 "扩展建议 out extension" 的设计
      // 比如 out-dir 可以给 yt-dlp, out-dir 的时候，要求返回的 ui controller 里有 entries 函数
      // 还有一个设想，比如 a.pdf b.pdf 提取图片到 out/a/XXX.png out/b/XXX.png 这要怎么处理？
      ui: (profile) => {
        // 这个函数在前端跑，画界面
        // 不能用 select  multiple， 在移动端显示效果不一样
        // <select  multiple>
        // <option value="dog">Dog</option>
        // <option value="cat">Cat</option>
        // <option value="parrot">Parrot</option>
        // </select>
        const css = (/** @type {any} */ [s]) => s;
        const $profile = document.createElement("action_profile_");
        $profile.appendChild(document.createElement("style")).textContent = css`
          action_profile_ {
            visibility: visible;
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
        // 这个函数在后端跑，要求不 block 主线程，只能 async。如果要 block 请自行开 worker
        // 后续提供调用其他 action 的功能？
        const child = spawn(exe, [
          "cjpegli",
          input.main[0],
          output.main[0],
          "-q",
          String(profile.quality),
        ]);
        let progressValue = 0;
        child.stderr.on("data", (/** @type {Buffer} */ data) => {
          const chunk = data.toString();
          progressValue = 0.01; // 比较明显能看出来，不要是整数
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
            // child.on("exit", (code) => (code ? reject({ code }) : resolve(0)));
            child.on("exit", (code) => {
              setTimeout(() => {
                code ? reject({ code }) : resolve(0);
              }, Math.random() * 2000);
            });
          }),
        };
      },
    },
  ],
  // 设计上，profile 应该是非开发者也能保存的一个纯 JSON。action 是扩展开发者编写的
  profiles: [
    // 一些预设的 profile，弱类型
    // 约定：对于相同的 action, 这个profile列表中最考前的，就是 default的。
    {
      name: "cjpegli default",
      description: "cjpegli default profile description",
      id: "cjpegli-default",
      actionId: "cjpegli",
      extensionId: "jpegxl",
      quality: 75,
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
