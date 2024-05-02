import path from "node:path";
import { fileURLToPath } from "node:url";

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
    <script src="abc.js"></script>
  </body>
`;

if (globalThis.document) {
  // is_electron_preload_script
  console.log(document);
} else {
  const { app, protocol, BrowserWindow } = await import("electron/main");
  const { fileURLToPath } = await import("node:path");
  const { readFile } = await import("node:fs/promises");

  // URL.createObjectURL
  function createWindow() {
    const win = new BrowserWindow({
      width: 1280,
      height: 720,
      title: "clevert",
      webPreferences: {
        // nodeIntegration: true,
        contextIsolation: false,
        webSecurity: false,
        // preload: fileURLToPath(import.meta.url),
      },
      autoHideMenuBar: true,
    });
    win.loadURL("resource:///main.html");
    win.webContents.openDevTools();
  }

  app.whenReady().then(() => {
    protocol.handle("resource", async (req) => {
      if (req.url === "resource:///main.html") {
        const type = "text/html; charset=utf-8";
        return new Response(new Blob([page()], { type }));
      }
      if (req.url === "resource:///main.js") {
        const type = "text/javascript; charset=utf-8";
        const buffer = await readFile(fileURLToPath(import.meta.url));
        return new Response(new Blob([buffer], { type }));
      }
    });

    createWindow();
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
