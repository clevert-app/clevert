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
const pageUrl = "data:text/html;charset=utf-8," + encodeURIComponent(page());

if (globalThis.document) {
  // is_electron_preload_script
  console.log(document);
} else {
  const { app, protocol, BrowserWindow } = await import("electron/main");

  
  
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
    win.loadURL(pageUrl);
    // win.webContents.executeJavaScript
    win.webContents.openDevTools();
  }

  app.whenReady().then(() => {
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
