// @ts-check
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

/**
 * Exclude the static `import` declaration matches `regexp`. Will be `// excluded: import xxx form ...`
 * @param {string} sourceCode
 * @param {RegExp} regexp
 * @returns {string}
 */
const excludeImport = (sourceCode, regexp) => {
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import
  // we dont support the "string name import" in reference just match quotas, and ensure the "import" keyword in line beginning, and ensure imports in the head of file
  let ret = "";
  let position = 0;
  while (true) {
    if (sourceCode.startsWith("import", position)) {
      let start = position;
      let end = start;
      while (true) {
        if (sourceCode[start] === "'") {
          start++;
          end = sourceCode.indexOf("'", start);
          break;
        }
        if (sourceCode[start] === '"') {
          start++;
          end = sourceCode.indexOf('"', start);
          break;
        }
        start++;
      }
      const moduleName = sourceCode.slice(start, end);
      const rangeEnd = end + "'".length;
      if (regexp.test(moduleName)) {
        const mark = "// excluded: ";
        ret +=
          mark +
          sourceCode.slice(position, rangeEnd).replace(/\n/g, "\n" + mark);
        position = rangeEnd;
      } else {
        // do nothing
      }
    } else if (sourceCode.startsWith("//", position)) {
      // do nothing
    } else if (sourceCode.startsWith("/*", position)) {
      const rangeEnd = sourceCode.indexOf("*/", position) + "*/".length;
      ret += sourceCode.slice(position, rangeEnd);
      position = rangeEnd;
    } else if (
      sourceCode.startsWith("\n", position) ||
      sourceCode.startsWith("\t", position) ||
      sourceCode.startsWith(" ", position)
    ) {
      // must not be start with these for useful statements, like "\n  import xxx ..."
    } else {
      break;
    }
    const nextPosition = sourceCode.indexOf("\n", position) + 1;
    ret += sourceCode.slice(position, nextPosition);
    position = nextPosition;
  }
  ret += sourceCode.slice(position);
  return ret;
};

const html = (/** @type {any} */ [s]) => s;

const page = () => html`
  <!DOCTYPE html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <meta name="color-scheme" content="light dark" />
    <title>clevert</title>
    <style>
      body {
        /* color: #fff; */
      }
    </style>
  </head>
  <body>
    <top_bar_></top_bar_>
    <side_bar_>
      <extensions_list_></extensions_list_>
      <actions_list_></actions_list_>
    </side_bar_>
    <extensions_market_></extensions_market_>
    <current_action_ kind_="converter">
      <input_list_></input_list_>
      <action_root_>
        <input type="number" />
      </action_root_>
      <action_controls_>
        <action_progress_>90%</action_progress_>
        <button>Start</button>
        <button>Stop</button>
      </action_controls_>
    </current_action_>
    <script type="module" src="/main.js"></script>
  </body>
`;

const inPage = () => {
  const $ = (s) => document.querySelector(s);
  const /** @type {HTMLElement} */ $topBar = $("top_bar_");
  const /** @type {HTMLElement} */ $sideBar = $("side_bar_");
};

const inServer = () => {
  // is in main
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
      res.end(excludeImport(buffer.toString(), /^node:.+$/));
      return;
    }
    if (req.url === "/favicon.ico") {
      res.setHeader("Content-Type", "image/png");
      res.writeHead(200);
      res.end("");
      return;
    }
    res.writeHead(404).end("not found");
  });

  server.listen(9393, "127.0.0.1");
};

const inElectron = async () => {
  const { app, protocol, BrowserWindow } = await import("electron");

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
      console.log(req.url);
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
};

if (globalThis.document) {
  inPage();
} else {
  inServer();
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
