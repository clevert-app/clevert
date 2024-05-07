// @ts-check
// import { Extension, AssetKind, ActionKind } from "clevert";
import { spawn } from "node:child_process";
// banned: import { spawn } from "node:child_process"; // 可以这种形式为前端禁用 // 这些砍 import 的魔法，在加载扩展的时候做

// 设计成导出一整个的形式，单个单个导出没法做 type check
export default {
  id: "jpegxl",
  version: "0.1.0", // semver
  name: "jpegxl name",
  description: "jpegxl description",
  dependencies: [], // 可以填写其他的 extension 的 id (这个功能需要扩展商店)
  assets: [
    {
      platform: "linux-x64",
      kind: "zip", // 比如可以做 tar --strip-components 这样的
      path: "./",
      // url 就直接填 github，然后让核心去做镜像加速和多源下载
      url: "https://github.com/clevert-app/clevert/releases/download/make.jpegxl_b2fb216_8900231253/linux-x64.zip",
    },
  ],
  actions: [
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
        const child = spawn("/home/kkocdko/misc/code/clevert/temp/extensions/jpegxl/jpegxl", [
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
    // 一些预设的 profile
    {
      name: "cjpegli default profile name",
      description: "cjpegli default profile description",
      action: "cjpegli",
      quality: 75,
    },
  ],
};
