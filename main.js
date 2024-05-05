// @ts-check
import { fileURLToPath } from "node:url";
import { readFile, mkdir, writeFile, readdir, rename } from "node:fs/promises";
import { createServer } from "node:http";
import { join as joinPath } from "node:path";
import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import { spawn } from "node:child_process";
import assert from "node:assert";

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
} Platform
@typedef {
  "raw" | "zip" | "gzip" | "tar" | "tar-gzip"
} AssetKind
@typedef {
  {
    platform: Platform,
    kind: AssetKind,
    path: string,
    url: string,
  }
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
      side_bar_ {
        display: block;
        width: 220px;
        height: 100vh;
        /* padding: 8px; */
        /* padding-top: calc(48px + 1px + 8px); */
        border-right: 1px solid var(--border);
        position: absolute;
        top: 0;
        background: var(--bg);
        overflow: hidden;
      }
      extensions_list_,
      actions_list_ {
        display: block;
        width: 100%;
        padding: 8px;
        height: 100%;
        transition: 0.5s;
      }
      actions_list_ {
        position: relative;
        top: -100%;
        left: 100%;
      }
      extensions_list_[second_],
      actions_list_[second_] {
        transform: translateX(-100%);
      }
      side_bar_item_ {
        display: block;
        padding: 8px;
        line-height: 16px;
      }
      side_bar_item_:hover {
        background: var(--hover);
      }
      side_bar_item_:active {
        background: var(--active);
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
        transition: 0.5s;
      }
      extensions_market_[page_off_],
      current_action_[page_off_] {
        visibility: hidden;
        opacity: 0;
      }
    </style>
  </head>
  <body>
    <script type="module" src="/main.js"></script>
  </body>
`;

const inPage = async () => {
  // Extension Market
  const $extensionsMarket = /** @type {HTMLElement} */ (
    document.body.appendChild(document.createElement("extensions_market_"))
  );
  $extensionsMarket.appendChild(document.createElement("label")).textContent =
    "Install URL: ";
  const $extensionInstallUrl = /** @type {HTMLInputElement} */ (
    $extensionsMarket.appendChild(document.createElement("input"))
  );
  const $extensionInstallButton = /** @type {HTMLElement} */ (
    $extensionsMarket.appendChild(document.createElement("button"))
  );
  $extensionInstallButton.textContent = "Install";
  $extensionInstallButton.onclick = async () => {
    const request = /** @type {InstallExtensionRequest} */ ({
      url: $extensionInstallUrl.value,
    });
    await fetch("/install-extension", {
      method: "POST",
      body: JSON.stringify(request),
    });
  };

  // Current Action
  const $currentAction = /** @type {HTMLElement} */ (
    document.body.appendChild(document.createElement("current_action_"))
  );

  // Top Bar
  const $topBar = /** @type {HTMLElement} */ (
    document.body.appendChild(document.createElement("top_bar_"))
  );
  const $unfoldSideBarButton = /** @type {HTMLElement} */ (
    $topBar.appendChild(document.createElement("button"))
  );
  $unfoldSideBarButton.textContent = "Unfold";
  $unfoldSideBarButton.onclick = async () => {
    $sideBar.removeAttribute("fold_");
  };

  // Side Bar
  const $sideBar = /** @type {HTMLElement} */ (
    document.body.appendChild(document.createElement("side_bar_"))
  );
  const $extensionsList = /** @type {HTMLElement} */ (
    $sideBar.appendChild(document.createElement("extensions_list_"))
  );
  const $foldSideBarButton = /** @type {HTMLElement} */ (
    $extensionsList.appendChild(document.createElement("side_bar_item_"))
  );
  $foldSideBarButton.textContent = "Fold";
  $foldSideBarButton.onclick = async () => {
    $sideBar.setAttribute("fold_", "");
  };
  const $actionsList = /** @type {HTMLElement} */ (
    $sideBar.appendChild(document.createElement("actions_list_"))
  );
  const $backToExtensionsListButton = /** @type {HTMLElement} */ (
    $actionsList.appendChild(document.createElement("side_bar_item_"))
  );
  $backToExtensionsListButton.textContent = "Back";
  $backToExtensionsListButton.onclick = async () => {
    $extensionsList.removeAttribute("second_");
    $actionsList.removeAttribute("second_");
  };

  const refreshExtensionsList = async () => {
    const extensionsList = /** @type {ListExtensionsResponse} */ (
      await (await fetch("/list-extensions")).json()
    );
    $extensionsList.innerHTML = "";
    $extensionsList.appendChild($foldSideBarButton);
    for (const extension of extensionsList) {
      const $extension = document.createElement("side_bar_item_");
      $extension.textContent = extension.id;
      $extension.onclick = async () => {
        $actionsList.innerHTML = "";
        $actionsList.appendChild($backToExtensionsListButton);
        for (const action of extension.actions) {
          const $action = document.createElement("side_bar_item_");
          $action.textContent = action.id;
          $action.onclick = async () => {
            await refreshCurrentAction(extension.id, action.id);
            $extensionsMarket.setAttribute("page_off_", "");
            $currentAction.removeAttribute("page_off_");
          };
          $actionsList.appendChild($action);
        }
        $extensionsList.setAttribute("second_", "");
        $actionsList.setAttribute("second_", "");
      };
      $extensionsList.appendChild($extension);
    }
  };

  const refreshCurrentAction = async (
    /** @type {string} */ extensionId,
    /** @type {string} */ actionId
  ) => {
    const extension = /** @type {Extension} */ (
      await import("/extension/" + extensionId + "/main.js")
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

      const ui = action.ui({}); // todo: profile
      $currentAction.appendChild(ui.root);

      const $actionControls = document.createElement("action_controls_");
      $currentAction.appendChild($actionControls);
      return;
    }

    {
      alert("todo:" + action.kind);
      return;
    }
  };

  {
    // main
    await refreshExtensionsList();
    $extensionsMarket.removeAttribute("page_off_");
    $currentAction.setAttribute("page_off_", "");
  }
};

const inServer = async () => {
  // is in main
  const PATH_EXTENSIONS = "./temp/extensions";
  const PATH_CACHE = "./temp/cache";
  const CURRENT_PLATFORM = /** @type {Platform} */ (
    false
      ? undefined
      : process.platform === "linux" && process.arch === "x64"
      ? "linux-x64"
      : process.platform === "win32" && process.arch === "x64"
      ? "win-x64"
      : process.platform === "darwin" && process.arch === "x64"
      ? "mac-x64"
      : process.platform === "darwin" && process.arch === "arm64"
      ? "mac-arm64"
      : assert(false, "unsupported platform")
  );
  await mkdir(PATH_EXTENSIONS, { recursive: true });
  await mkdir(PATH_CACHE, { recursive: true });

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

  const download = async (url, path, accelerated) => {
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
      const buffer = await readFile(fileURLToPath(import.meta.url));
      res.setHeader("Content-Type", "text/javascript; charset=utf-8");
      res.writeHead(200);
      res.end(excludeImport(buffer.toString(), /^node:.+$/));
      return;
    }

    if (req.url === "/favicon.ico") {
      res.setHeader("Content-Type", "image/png");
      res.writeHead(200);
      res.end("");
      return;
    }

    if (req.url?.startsWith("/extension/")) {
      const [, extensionId, fileName] = req.url.split("/");
      assert(fileName === "main.js");
      const extensionFilePath =
        PATH_EXTENSIONS + "/" + extensionId + "/main.js";
      const buffer = await readFile(extensionFilePath);
      res.setHeader("Content-Type", "text/javascript; charset=utf-8");
      res.writeHead(200);
      res.end(excludeImport(buffer.toString(), /^node:.+$/));
      return;
    }

    if (req.url === "/list-extensions") {
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
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(JSON.stringify(ret));
      return;
    }

    if (req.url === "/install-extension") {
      const request = /** @type {InstallExtensionRequest} */ (
        await reqToJson(req)
      );
      const extensionMainJsTemp =
        PATH_CACHE + "/downloading-" + nextInt() + ".js";
      await download(request.url, extensionMainJsTemp);
      const extension = /** @type {Extension} */ (
        await import(extensionMainJsTemp)
      );
      const extensionDir = PATH_EXTENSIONS + "/" + extension.id;
      await mkdir(extensionDir);
      await rename(extensionMainJsTemp, extensionDir + "/main.js");
      for (const asset of extension.assets) {
        if (asset.platform !== CURRENT_PLATFORM) {
          continue;
        }
        const assetExtName = /** @type {string} */ (
          false
            ? undefined
            : asset.kind === "raw"
            ? "raw"
            : asset.kind === "zip"
            ? "zip"
            : asset.kind === "gzip"
            ? "gz"
            : asset.kind === "tar"
            ? "tar"
            : asset.kind === "tar-gzip"
            ? "tar.gz"
            : assert(false, "unsupported asset kind")
        );
        const assetTemp =
          PATH_CACHE + "/downloading-" + nextInt() + assetExtName;
        await download(asset.url, assetTemp);
        if (asset.kind === "raw") {
          await rename(assetTemp, extensionDir + "/" + asset.path);
        } else if (asset.kind === "zip") {
          const extractDir = extensionDir + "/" + asset.path;
          await spawn("unzip", [assetTemp, "-d", extractDir]);
        } else {
          assert(false, "unsupported yet");
        }
      }
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(JSON.stringify({}));
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
