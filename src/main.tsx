import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

// const html = ([s]: any) => s as string;
// const page = () => html``;

// const server = createServer((req, res) => {
//   console.log({ url: req.url });
//   if (req.url === "/") {
//     res.writeHead(200).end(page());
//     return;
//   }
// });

// server.listen(9393, "127.0.0.1");
// http://127.0.0.1:8080/extensions/jpegxl/main.tsx
// let c = {};
// 提供一些 trait

// Daemon
// Transform

// https://registry.npmmirror.com/binary.html?path=electron/v30.0.1/
// https://registry.npmmirror.com/-/binary/electron/v30.0.1/electron-v30.0.1-linux-x64.zip
// /home/kkocdko/misc/res/electron-v30.0.1-linux-x64/electron
// 基于 zustand 封装一个快速表单，然后出 json，无ui时直接用json
// webPreferences: {
//   nodeIntegration: true,
//   contextIsolation: false,
//   webSecurity: false,

// core -> extension -> action -> config
// (以后做)  profile = extension + action + config

// https://github.com/clevert-app/notes/issues/1

// 想要知道css怎么弄进来
// https://github.com/radix-ui/themes/blob/main/packages/radix-ui-themes/src/components/button.css
// https://www.radix-ui.com/themes/docs/overview/getting-started
