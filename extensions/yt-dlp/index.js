// @ts-check
/** @import { Extension } from "../../index.js" */
import child_process from "node:child_process";
import path from "node:path";

const consts = globalThis.process && {
  exe: path.join(import.meta.dirname, "yt-dlp"),
};

export default /** @type {Extension} */ ({
  id: "yt-dlp",
  version: "0.1.0",
  name: "yt-dlp",
  description: "yt-dlp description",
  dependencies: [],
  assets: [
    {
      platforms: ["linux-x64"], // 匹配平台，非当前平台不下载
      kind: "raw",
      path: "./yt-dlp",
      url: "https://github.com/yt-dlp/yt-dlp/releases/download/2024.08.06/yt-dlp",
    },
  ],
  actions: [
    {
      id: "yt-dlp",
      name: "yt-dlp name",
      description: "yt-dlp description",
      kind: "common-files", // 这里允许使用 daemon，number sequence，plain 等不同种类。
      ui: (profile) => {
        // 这个函数在前端跑，画界面
        // 不能用 select  multiple， 在移动端显示效果不一样
        // <select  multiple>
        // <option value="dog">Dog</option>
        // <option value="cat">Cat</option>
        // <option value="parrot">Parrot</option>
        // </select>
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
        // 这个函数在后端跑，要求不 block 主线程，只能 async。如果要 block 请自行开 worker
        // 后续提供调用其他 action 的功能？
        const child = child_process.spawn(consts.exe, [
          "cjpegli",
          input.main[0],
          output.main[0],
          "-q",
          String(profile.quality),
        ]);
        // console.log([
        //   "cjpegli",
        //   input.main[0],
        //   output.main[0],
        //   "-q",
        //   String(profile.quality),
        // ]);
        let progressValue = 0;
        child.stderr.on("data", (/** @type {Buffer} */ data) => {
          const chunk = data.toString();
          progressValue = 0.01; // 比较明显能看出来，不要是整数
        });
        // child.stdout.on("data", (/** @type {Buffer} */ data) => {
        //   const chunk = data.toString();
        //   console.log({ stdout: chunk });
        // });
        // child.stderr.on("data", (/** @type {Buffer} */ data) => {
        //   const chunk = data.toString();
        //   console.log({ stderr: chunk });
        // });
        return {
          progress: () => {
            return progressValue;
          },
          stop: () => {
            child.kill("SIGTERM");
          },
          wait: new Promise((resolve, reject) => {
            child.on("error", (err) => reject(err));
            child.on("exit", (code) => (code ? reject({ code }) : resolve()));
            // child.on("exit", (code) => {
            //   setTimeout(() => {
            //     code ? reject({ code }) : resolve(undefined);
            //   }, Math.random() * 2000);
            // });
          }),
        };
      },
    },
  ],
  profiles: [
    {
      name: "yt-dlp",
      description: "yt-dlp default profile description",
      id: "yt-dlp",
      actionId: "yt-dlp",
      extensionId: "yt-dlp",
      extensionVersion: "0.1.0",
      quality: 75,
      entries: {
        // outputExtension: "jpeg",
        outputExtensionOptions: ["jpeg", "jxl"],
      },
    },
  ],
});
