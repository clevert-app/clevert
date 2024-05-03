// @ts-check
// import { app, protocol, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

// 会排除源码中导入路径满足 regexp 的静态 import 语句，然后返回排除后的源码。被排除的将成为 `// excluded: import xxx form ...`
const excludeImport = (sourceCode, regexp) => {
  // 先跳过所有注释
  // 然后找 import
  // 直到找不到？
};

if (globalThis.document) {
  // is in renderer
  console.log(document);
} else {
  // is in main

  const html = (/** @type {any} */ [s]) => s;
  const page = () => html`
    <!DOCTYPE html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width" />
      <meta name="color-scheme" content="light dark" />
      <script type="module" src="/main.js"></script>
      <title>clevert</title>
    </head>
    <body></body>
  `;

  const server = createServer(async (req, res) => {
    console.log({ url: req.url });
    if (req.url === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.writeHead(200);
      res.end(page());
      return;
    }
    if (req.url === "/main.js") {
      res.setHeader("Content-Type", "text/javascript; charset=utf-8");
      res.writeHead(200);
      const buffer = await readFile(fileURLToPath(import.meta.url));
      res.end(buffer.toString());
      return;
    }
    res.writeHead(404).end("not found");
  });

  server.listen(9393, "127.0.0.1");

  // const createWindow = () => {
  //   const win = new BrowserWindow({
  //     width: 1280,
  //     height: 720,
  //     title: "clevert",
  //     webPreferences: {
  //       // nodeIntegration: true,
  //       contextIsolation: false,
  //       webSecurity: false,
  //       sandbox: false,
  //       // preload: fileURLToPath(import.meta.url),
  //     },
  //     autoHideMenuBar: true,
  //   });
  //   win.loadURL("resource:///main.html");
  //   win.webContents.openDevTools();
  // };

  // app.whenReady().then(() => {
  //   protocol.handle("resource", async (req) => {
  //     console.log(req.url)
  //     if (req.url === "resource:///main.html") {
  //       const type = "text/html; charset=utf-8";
  //       return new Response(new Blob([page()], { type }));
  //     }
  //     if (req.url === "resource:///main.js") {
  //       const buffer = await readFile(fileURLToPath(import.meta.url));
  //       const type = "text/javascript; charset=utf-8";
  //       return new Response(new Blob([buffer], { type }));
  //     }
  //     return new Response(new Blob(["not found"], { type: "text/plain" }));
  //   });
  //   createWindow();
  //   // mac
  //   app.on("activate", () => {
  //     if (BrowserWindow.getAllWindows().length === 0) {
  //       createWindow();
  //     }
  //   });
  // });
  // app.on("window-all-closed", () => {
  //   if (process.platform !== "darwin") {
  //     app.quit();
  //   }
  // });
}

// http://127.0.0.1:8080/extensions/jpegxl/main.tsx
// let c = {};
// 提供一些 trait

// https://registry.npmmirror.com/binary.html?path=electron/v30.0.1/
// https://registry.npmmirror.com/-/binary/electron/v30.0.1/electron-v30.0.1-linux-x64.zip
// /home/kkocdko/misc/res/electron-v30.0.1-linux-x64/electron

// core -> extension -> action -> profile
// (以后做)  profile = extension + action + profile

// mkdir -p node_modules/electron ; dl_prefix="https://registry.npmmirror.com/electron/30.0.2/files" ; curl -o node_modules/electron/electron.d.ts -L $dl_prefix/electron.d.ts -o node_modules/electron/package.json -L $dl_prefix/package.json
