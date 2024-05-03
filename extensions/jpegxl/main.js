import { Extension, AssetKind, ActionKind } from "clevert"; // 这些砍 import 的魔法，在加载扩展的时候做
import { spawn } from "node:child_process";

export default {
  id: "jpegxl",
  name: "jpegxl name",
  description: "jpegxl description",
  dependencies: [], // 可以填写其他的 extension 的 id
  assets: [
    {
      platform: "linux-x64",
      kind: "zip", // 比如可以做 tar --strip-components 这样的
      path: "./",
      url: "https://github.com/clevert-app/clevert/releases/download/make.jpegxl_b2fb216_8900231253/linux-x64.zip",
    },
  ],
  actions: [
    {
      id: "cjpegli",
      name: "cjpegli name",
      description: "cjpegli description",
      kind: "converter", // 还可以是 group-converter，manual converter 之类的？
      ui: (props) => {
        // 这个函数在前端跑，画界面。selectedInput 以后可以用作预览什么的
        // return (
        //   <TextField.Root
        //     value={props.profile.quality}
        //     onChange={(event) => {
        //       setProfile((nextProfile) => {
        //         return { ...nextProfile, quality: event.target.value };
        //       });
        //     }}
        //     placeholder="Search the docs…"
        //   ></TextField.Root>
        // );
      },
      execute: ({ onProgress }, profile, input, output) => {
        // 这个函数在后端跑，要求不 block 主线程，只能 async。如果要 block 请自行开 worker
        const child = spawn("~/misc/apps/jpegxl", [
          "cjpegli",
          input.main[0],
          output.main[0],
          "-q",
          String(profile.quality),
        ]);
        child.stderr.on("data", (/** @type {Buffer} */ data) => {
          const chunk = data.toString();
          onProgress(0.5);
        });
        return new Promise((resolve, reject) => {
          child.on("error", (err) => reject(err));
          child.on("exit", (code) => (code ? reject({ code }) : resolve(0)));
        });
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
