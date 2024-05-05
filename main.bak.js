// @ts-check
import { fileURLToPath } from "node:url";
import { readFile, mkdir, writeFile, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import { join as joinPath } from "node:path";
import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import { spawn } from "node:child_process";

/**
 * Exclude the static `import` declaration matches `regexp`. Will be `// excluded: import xxx form ...`.
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

/**
 * Get next int number.
 * @returns {number}
 */
const nextInt = (() => {
  let v = 0;
  return () => ++v;
})();

/**
@typedef {
  "win-x64" | "linux-x64" | "mac-x64" | "mac-arm64"
} AssetPlatform
@typedef {
  "zip" | "gzip" | "tar"
} AssetKind
@typedef {
  {
    platform: AssetPlatform,
    kind: AssetKind,
    path: string,
    url: string,
  }[]
} Asset
@typedef {
  "converter" | "daemon"
} ActionKind
@typedef {
  {
    id: string,
    name: string,
    description: string,
    kind: ActionKind,
    ui: any,
    execute: any,
  }
} Action
@typedef {
  {
    id: string,
    version: string,
    name: string,
    description: string,
    dependencies: string[],
    assets: Asset[],
    actions: Action[],
    profiles: any[],
  }
} Extension
@typedef {
  {
    id: string,
    name: string,
    description: string,
    actions: {
      id: string,
      name: string,
      description: string,
    }[]
  }[]
} ListExtensionsResponse
@typedef {
  {
    url: string,
  }
} InstallExtensionRequest
*/

const html = (/** @type {any} */ [s]) => s;

const page = () => html`
  <!DOCTYPE html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <meta name="color-scheme" content="light dark" />
    <title>clevert</title>
    <style>
      * {
        box-sizing: border-box;
      }
      html {
        --bg: #fff;
        --border: #888;
        --hover: #eee;
        --active: #aaa7;
      }
      @media (prefers-color-scheme: dark) {
        html {
          --bg: #000;
          --border: #888;
          --hover: #222;
          --active: #444;
        }
      }
      body {
        min-height: 100vh;
        margin: 0;
        font-family: system-ui;
        background: var(--bg);
      }
      top_bar_ {
        position: fixed;
        display: flex;
        gap: 8px;
        width: 100%;
        height: calc(48px + 1px);
        padding: 8px;
        left: 0;
        top: 0;
        line-height: 32px;
        background: var(--bg);
        border-bottom: 1px solid var(--border);
      }
      top_bar_ b {
        flex-grow: 1;
      }
      top_bar_ input {
        width: 30vw;
      }
      top_bar_ button,
      top_bar_ input {
        padding: 0 8px;
      }
      side_bar_ {
        display: block;
        width: 220px;
        height: 100vh;
        padding: 8px;
        padding-top: calc(48px + 1px + 8px);
        border-right: 1px solid var(--border);
      }
      side_bar_ hr {
        border: none;
        border-bottom: 1px solid var(--border);
      }
      side_bar_ a {
        display: block;
        padding: 8px;
        line-height: 20px;
        text-decoration: none;
      }
      extensions_market_,
      current_action_ {
        position: fixed;
        top: 0;
        right: 0;
        left: 220px;
        height: 100vh;
        padding: 8px;
        padding-top: calc(48px + 1px + 8px);
        overflow: auto;
      }
      extensions_market_[page_state_="off"],
      current_action_[page_state_="off"] {
        visibility: hidden;
      }
    </style>
  </head>
  <body>
    <extensions_market_>
      <label>url</label>
      <input placeholder="http://example.com/some-extension/main.js" />
      <button on_click_="install-extension">install</button>
    </extensions_market_>
    <current_action_ kind_="converter" page_state_="off">
      <input_list_>
        <input_item_>/foo/bar</input_item_>
        <input_item_>/some/what</input_item_>
      </input_list_>
      <action_root_>
        <label>
          Quality:
          <input type="number" value="75" />
        </label>
        <br />
        <br />
      </action_root_>
      <action_controls_>
        <action_progress_>90%</action_progress_>
        <br />
        <br />
        <button>Start</button>
        <br />
        <br />
        <button>Stop</button>
      </action_controls_>
    </current_action_>
    <top_bar_>
      <button>[>]</button>
      <span>clevert</span>
    </top_bar_>
    <side_bar_>
      <extensions_list_>
        <side_bar_item_></side_bar_item_>
      </extensions_list_>
      <actions_list_>
        <side_bar_item_></side_bar_item_>
      </actions_list_>
    </side_bar_>
    <script type="module" src="/main.js"></script>
  </body>
`;

const inPage = async () => {
  const $topBar = /** @type {HTMLElement} */ (
    document.querySelector("top_bar_")
  );
  const $sideBar = /** @type {HTMLElement} */ (
    document.querySelector("side_bar_")
  );
  const $extensionsList = /** @type {HTMLElement} */ (
    document.querySelector("extensions_list_")
  );
  const $actionsList = /** @type {HTMLElement} */ (
    document.querySelector("actions_list_")
  );
  const $extensionsMarket = /** @type {HTMLElement} */ (
    document.querySelector("extensions_market_")
  );
  const $currentAction = /** @type {HTMLElement} */ (
    document.querySelector("current_action_")
  );

  const $extensionsMarketInput = /** @type {HTMLInputElement} */ (
    document.querySelector("extensions_market_ > input")
  );
  const $installExtensionButton = /** @type {HTMLElement} */ (
    document.querySelector("button[on_click_='install-extension']")
  );
  $installExtensionButton.onclick = async () => {
    const url = $extensionsMarketInput.value;
    // http://127.0.0.1:8080/extensions/jpegxl/main.js
    if (url === "") {
      return;
    }
    const installExtensionRequest = /** @type {InstallExtensionRequest} */ ({
      url,
    });
    await fetch("/install-extension", {
      method: "POST",
      body: JSON.stringify(installExtensionRequest),
    });
    // todo: 等待安装
  };

  const renderAction = async (
    /** @type {string} */ extensionId,
    /** @type {string} */ actionId,
    /** @type {any} */ profile
  ) => {
    const /** @type {Extension} */ extension = await import(
        "/extension/" + extensionId
      );
    const action = extension.actions.find((action) => action.id === actionId);
    if (action === undefined) {
      alert("action === undefined");
      return;
    }
    $currentAction.innerHTML = "";
    $currentAction.setAttribute("kind_", action.kind);
    if (action.kind === "converter") {
      const $inputList = document.createElement("input_list_");
      $currentAction.appendChild($inputList);

      const ui = action.ui(profile);
      $currentAction.appendChild(ui.root);

      const $actionControls = document.createElement("action_controls_");
      $currentAction.appendChild($actionControls);
      return;
    }
    if (action.kind === "daemon") {
      alert("todo");
      return;
    }
  };

  const refreshExtensionsList = async () => {
    const extensionsList = /** @type {ListExtensionsResponse} */ (
      await (await fetch("/list-extensions")).json()
    );
    $extensionsList.innerHTML = "";
    for (const extension of extensionsList) {
      const $extension = document.createElement("side_bar_item_");
      $extension.textContent = extension.id;
      $extension.onclick = () => {
        $actionsList.innerHTML = "";

        const $backButton = document.createElement("side_bar_item_");
        $backButton.textContent = "[<] back";
        $backButton.onclick = () => {
          $sideBar.classList.remove("actions");
        };
        $actionsList.appendChild($backButton);

        for (const action of extension.actions) {
          const $action = document.createElement("side_bar_item_");
          $action.textContent = action.id;
          $action.onclick = () => {
            // do switch to action
          };
          $actionsList.appendChild($action);
        }

        $sideBar.classList.add("actions");
      };
      $extensionsList.appendChild($extension);
    }
  };
};

const inServer = async () => {
  // is in main
  const PATH_EXTENSIONS = "./temp/extensions";

  await mkdir(PATH_EXTENSIONS, { recursive: true });

  const reqToJson = async (req) => {
    return new Promise((resolve) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        resolve(JSON.parse(body));
      });
    });
  };

  const download = async (url, path,accelerated) => {
    // TODO: 自动多源头下载
    const res = await fetch(url);
    const ab = await res.arrayBuffer();
    await writeFile(path, Buffer.from(ab));
  };

  const server = createServer(async (req, res) => {
    // console.log({ url: req.url });
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
    if (req.url === "/list-extensions") {
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      const ret = /** @type {ListExtensionsResponse} */ ([]);
      for (const entry of await readdir(PATH_EXTENSIONS)) {
        const extension = /** @type {Extension} */ (
          await import(PATH_EXTENSIONS + "/" + entry + "/main.js")
        );
        ret.push({
          id: extension.id,
          name: extension.name,
          description: extension.description,
          actions: extension.actions.map((action) => ({
            id: action.id,
            name: action.name,
            description: action.description,
          })),
        });
      }
      res.end(JSON.stringify(ret));
      return;
    }
    if (req.url === "/install-extension") {
      const r = /** @type {InstallExtensionRequest} */ (await reqToJson(req));
      r.url;
      console.log(r);
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end("");
      return;
    }

    // ("/extension/jpegxl.js");
    // ("/load/");
    // ("/start/");
    // ("/progress/");
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
