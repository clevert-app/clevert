import type { Extension, AssetKind, ActionKind } from "clevert"; // 一定是 import type 而不是 import ，这样会被擦除,不会造成运行时的问题

export default {
  id: "jpegxl",
  dependencies: [], // 可以填写其他的extension的id
  assets: {
    "linux-x64": [
      [
        {
          kind: "zip" as AssetKind, // 比如可以做 tar --strip-components 这样的
          path: "./",
          url: "https://github.com/clevert-app/clevert/releases/download/make.jpegxl_b2fb216_8900231253/linux-x64.zip",
        },
      ],
    ],
  },
  actions: [
    {
      id: "cjpegli",
      name: "The CJPEGLI tool",
      kind: "converter" as ActionKind, // 还可以是 group-converter，manual converter 之类的？
      ui: async () => {
        // 这个函数在前端跑，画界面
        const { Flex, Text, Button } = await import("@radix-ui/themes");
        /// 如何处理表单？
        const profile = {}; // 用 proxy 来做？
        return (
          <Flex direction="column" gap="2">
            <Text>Hello from Radix Themes :)</Text>
            <Button>Let's go</Button>
          </Flex>
        );
      },
      execute: async ({ onProgress }, profile, input, output) => {
        // 这个函数在后端跑，要求不block主线程，只能async。如果要block请自行开worker
        // 以后提供一个 const { someAction } = await import("clevert:extension/ffmpeg") 这样的可以调用依赖的 extension的东西
        const { spawn } = await import("node:child_process"); // 实测初次 dyn import 在 AMD Zen3 2GHz 频率下不超过 9 毫秒，完全可以接受
        const child = spawn("~/misc/apps/jpegxl", [
          "cjpegli",
          input.main[0],
          output.main[0],
          "-q",
          String(profile.quality),
        ]);
        child.stderr.on("data", (data: Buffer) => {
          const chunk = data.toString();
          onProgress(0.5);
        });
        await new Promise((resolve, reject) => {
          child.on("error", (err) => reject(err));
          child.on("exit", (code) => (code ? reject({ code }) : resolve()));
        });
      },
    },
  ],
} as Extension;

// 怎么处理 UI 和 action 后端的区别问题

// 如果 ui 需要高权限的后端操作，那么就和对应的 action 去做交互即可，可以考虑action里加个backend
