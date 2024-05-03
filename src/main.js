import { app, protocol, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

if (globalThis.document) {
  // is in renderer
  console.log(document);
} else {
  // is in main

  const html = ([s]) => s;
  const page = () => html`
    <!DOCTYPE html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width" />
      <meta name="color-scheme" content="light dark" />
      <title>clevert</title>
    </head>
    <body>
      <div id="root"></div>
      <script type="module" src="/main.js"></script>
    </body>
  `;

  const createWindow = () => {
    const win = new BrowserWindow({
      width: 1280,
      height: 720,
      title: "clevert",
      webPreferences: {
        // nodeIntegration: true,
        contextIsolation: false,
        webSecurity: false,
        sandbox: false,
        // preload: fileURLToPath(import.meta.url),
      },
      autoHideMenuBar: true,
    });
    win.loadURL("resource:///main.html");
    win.webContents.openDevTools();
  };

  app.whenReady().then(() => {
    protocol.handle("resource", async (req) => {
      if (req.url === "resource:///main.html") {
        const type = "text/html; charset=utf-8";
        return new Response(new Blob([page()], { type }));
      }
      if (req.url === "resource:///main.js") {
        const buffer = await readFile(fileURLToPath(import.meta.url));
        const type = "text/javascript; charset=utf-8";
        return new Response(new Blob([buffer], { type }));
      }
      return new Response(new Blob(["not found"], { type: "text/plain" }));
    });
    createWindow();
    // mac
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}

// import fs from "node:fs";
// import path from "node:path";
// import { createServer } from "node:http";
// import { fileURLToPath } from "node:url";
// import { spawn } from "node:child_process";

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
// node_modules/.bin/sucrase -d src src --transforms typescript,jsx  --jsx-runtime automatic  --disable-es-transforms

// mkdir -p node_modules/electron ; dl_prefix="https://registry.npmmirror.com/electron/30.0.2/files" ; curl -o node_modules/electron/electron.d.ts -L $dl_prefix/electron.d.ts -o node_modules/electron/package.json -L $dl_prefix/package.json
