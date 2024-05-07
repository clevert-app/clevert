// @ts-check
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { join as joinPath, isAbsolute } from "node:path";
import { homedir } from "node:os";
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
 * Get next auto increased int number. Used for id generate or others.
 * @returns {number}
 */
const nextInt = (() => {
  let v = 0;
  return () => ++v;
})();

/**
 * Solve path, like path.resolve + support of home dir prefix.
 * @param {boolean} absolute
 * @param {...string} parts
 * @returns {string}
 */
const solvePath = (absolute, ...parts) => {
  if (parts[0].startsWith("~")) {
    parts[0] = parts[0].slice(1);
    parts.unshift(homedir());
  }
  // we do not use path.resolve directy because we want to control absolute or not
  if (!isAbsolute(parts[0]) && absolute) {
    parts.unshift(process.cwd());
  }
  return joinPath(...parts); // path.join will convert '\\' to '/' also, like path.resolve
};

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
    root: HTMLElement,
    profile: () => any,
    preview: (input: any) => void,
  }
} ActionUiController
@typedef {
  {
    progress: () => number,
    stop: () => void,
    wait: Promise<any>,
  }
} ActionExecuteController
@typedef {
  {
    id: string,
    name: string,
    description: string,
    kind: ActionKind,
    ui: (profile: any) => ActionUiController,
    execute: (profile: any, entry: any) => ActionExecuteController,
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
    input: {
      main: string[],
    },
    output: {
      main: string[],
    },
  }
} ConverterEntry
@typedef {
  {
    path: string,
    recursive: boolean,
  }
} ReadDirRequest
@typedef {
  {
    path: string,
    type: "file" | "dir",
  }[]
} ReadDirResponse
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
@typedef {
  {
    extensionId: string,
    actionId: string,
    profile: any,
    entries: any[],
  }
} StartActionRequest
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
      input_output_config_,
      action_root_,
      action_controls_ {
        display: block;
      }
      input_output_config_ {
        display: grid;
        gap: 8px;
        margin-bottom: 8px;
        border: 1px solid var(--border);
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
    await refreshExtensionsList();
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
      (await import("/extension/" + extensionId + "/main.js")).default
    );
    const action = extension.actions.find((action) => action.id === actionId);
    if (action === undefined) {
      alert("action === undefined");
      return;
    }
    $currentAction.innerHTML = "";
    $currentAction.setAttribute("kind_", action.kind);

    if (action.kind === "converter") {
      const $inputOutoutConfig = document.createElement("input_output_config_");
      const $inputDir = document.createElement("input");
      $inputDir.placeholder = "Input Dir";
      $inputDir.value = "/home/kkocdko/misc/code/clevert/temp/converter-test/i"; // does not support "~/adbf" ?
      const $outputDir = document.createElement("input");
      $outputDir.placeholder = "Output Dir";
      $outputDir.value =
        "/home/kkocdko/misc/code/clevert/temp/converter-test/o";
      const $outputExtension = document.createElement("input");
      $outputExtension.placeholder = "Output Extension";
      $outputExtension.value = "jpeg";
      $inputOutoutConfig.appendChild($inputDir);
      $inputOutoutConfig.appendChild($outputDir);
      $inputOutoutConfig.appendChild($outputExtension);
      $currentAction.appendChild($inputOutoutConfig);

      const ui = action.ui({}); // todo: profile
      $currentAction.appendChild(ui.root);

      const $actionControls = document.createElement("action_controls_");
      const $startButton = document.createElement("button");
      $startButton.textContent = "Start";
      $startButton.onclick = async () => {
        // read input dir
        const entries = /** @type {ConverterEntry[]} */ ([]);
        const readDirRequest = /** @type {ReadDirRequest} */ ({
          path: $inputDir.value,
          recursive: true,
        });
        const readDirResponse = /** @type {ReadDirResponse} */ (
          await (
            await fetch("/read-dir", {
              method: "POST",
              body: JSON.stringify(readDirRequest),
            })
          ).json()
        );
        // strip path prefix by $inputDir.value to produce relative path, then produce output path by relative path
        for (const entry of readDirResponse) {
          entries.push({
            input: {
              main: [entry.path],
            },
            output: {
              main: [
                $outputDir.value + entry.path.slice($inputDir.value.length),
              ],
            },
          });
        }
        const startActionRequest = /** @type {StartActionRequest} */ ({
          extensionId: extension.id,
          actionId: action.id,
          profile: ui.profile(),
          entries: entries,
        });
        await fetch("/start-action", {
          method: "POST",
          body: JSON.stringify(startActionRequest),
        });
      };
      $actionControls.appendChild($startButton);
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

  const PARALLEL = 2;
  const running = /** @type {Set<ActionExecuteController>} */ (new Set());

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
      const ret = excludeImport(buffer.toString(), /^node:.+$/);
      res.setHeader("Content-Type", "text/javascript; charset=utf-8");
      res.writeHead(200);
      res.end(ret);
      return;
    }

    if (req.url === "/favicon.ico") {
      res.setHeader("Content-Type", "image/png");
      res.writeHead(200);
      res.end("");
      return;
    }

    if (req.url === "/read-dir") {
      const request = /** @type {ReadDirRequest} */ (await reqToJson(req));
      const ret = /** @type {ReadDirResponse} */ ([]);
      for (const v of await readdir(request.path, {
        withFileTypes: true,
        recursive: request.recursive,
      })) {
        ret.push({
          path: v.name,
          type: v.isDirectory() ? "dir" : "file",
        });
      }
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(JSON.stringify(ret));
      return;
    }

    if (req.url === "/start-action") {
      const request = /** @type {StartActionRequest} */ (await reqToJson(req));
      const extensionMainJs = /** @type {string} */ (
        solvePath(true, PATH_EXTENSIONS, request.extensionId, "/main.js")
      );
      const extension = /** @type {Extension} */ (
        (await import(extensionMainJs)).default
      );
      const action = extension.actions.find(
        (action) => action.id === request.actionId
      );
      if (action === undefined) {
        assert(false, "action not found");
        return;
      }
      const executors = [...Array(PARALLEL)].map((_, i) =>
        (async () => {
          for (let entry; (entry = request.entries.shift()); ) {
            console.log(entry.input.main);
            const controller = action.execute(request.profile, entry);
            running.add(controller);
            await controller.wait;
            running.delete(controller);
          }
        })()
      );
      await Promise.all(executors);
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end("");
      return;
    }

    if (req.url?.startsWith("/extension/")) {
      console.log(req.url.split("/"));
      const [, , extensionId, fileName] = req.url.split("/");
      assert(fileName === "main.js");
      const extensionMainJs = /** @type {string} */ (
        solvePath(true, PATH_EXTENSIONS, extensionId, "/main.js")
      );
      const buffer = await readFile(extensionMainJs);
      const ret = excludeImport(buffer.toString(), /^node:.+$/);
      res.setHeader("Content-Type", "text/javascript; charset=utf-8");
      res.writeHead(200);
      res.end(ret);
      return;
    }

    if (req.url === "/list-extensions") {
      const ret = /** @type {ListExtensionsResponse} */ ([]);
      for (const entry of await readdir(PATH_EXTENSIONS)) {
        const extensionMainJs = /** @type {string} */ (
          solvePath(true, PATH_EXTENSIONS, entry, "/main.js")
        );
        const extension = /** @type {Extension} */ (
          (await import(extensionMainJs)).default
        );
        assert(extension.id === entry);
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
      const extensionTempMainJs = /** @type {string} */ (
        solvePath(true, PATH_CACHE, "downloading-" + nextInt() + ".js")
      );
      await download(request.url, extensionTempMainJs);
      const extension = /** @type {Extension} */ (
        (await import(extensionTempMainJs)).default
      );
      const extensionDir = /** @type {string} */ (
        solvePath(true, PATH_EXTENSIONS, extension.id)
      );
      await mkdir(extensionDir);
      await rename(extensionTempMainJs, extensionDir + "/main.js");
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
          PATH_CACHE + "/downloading-" + nextInt() + "." + assetExtName;
        await download(asset.url, assetTemp);
        if (asset.kind === "raw") {
          await rename(assetTemp, extensionDir + "/" + asset.path);
        } else if (asset.kind === "zip") {
          const extractDir = extensionDir + "/" + asset.path;
          await spawn("unzip", [assetTemp, "-d", extractDir]);
        } else {
          assert(false, "unsupported yet");
        }
        await rm(assetTemp, { recursive: true });
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
  // @ts-ignore
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

/*
const dirProvider = (options) => {
  const inputs = fs
    .readdirSync(options.inputDir, { recursive: options.inputRecursive })
    .map((item) => path.join(options.inputDir, item))
    .filter((item) => !options.inputOnlyFile || fs.statSync(item).isFile());
  const outputs = inputs.map((input) => {
    const relative = path.relative(options.inputDir, input);
    const parsed = path.parse(path.join(options.outputDir, relative));
    delete parsed.base;
    parsed.name = options.outputPrefix + parsed.name + options.outputSuffix;
    if (options.outputExtName) parsed.ext = "." + options.outputExtName;
    const item = path.format(parsed);
    const dir = path.dirname(item);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return item;
  });
  return [...Array(inputs.length)].map((_, i) => ({
    inputs: [inputs[i]],
    outputs: [outputs[i]],
    options: options.options(inputs[i], outputs[i]),
  }));
};

const action = (await import("./extension-ffmpeg.js")).actions["to-m4a"];
const orders = dirProvider({
  inputDir: "./dist/i",
  inputRecursive: true,
  inputOnlyFile: true,
  outputDir: "./dist/o",
  outputExtName: "m4a",
  outputPrefix: "",
  outputSuffix: "_out",
  outputFlat: false,
  absolute: false,
  options: () => ({
    some: 1,
  }),
});

*/

// ./.vscode/extensions.json
// {
//   "recommendations": ["esbenp.prettier-vscode", "runem.lit-plugin"]
//   // es6-string-html
// }

// ./.vscode/settings.json
// {
//   "editor.tokenColorCustomizations": {
//     "textMateRules": [
//       {
//         "scope": "invalid",
//         "settings": { "foreground": "#56ddc2" }
//       }
//     ]
//   }
// }

// http://127.0.0.1:8080/extensions/jpegxl/main.js
// let c = {};

// https://apple.stackexchange.com/q/420494/ # macos arm64 vm
// https://github.com/orgs/community/discussions/69211#discussioncomment-7941899 # macos arm64 ci free
// https://registry.npmmirror.com/binary.html?path=electron/v30.0.1/
// https://registry.npmmirror.com/-/binary/electron/v30.0.1/electron-v30.0.1-linux-x64.zip
// /home/kkocdko/misc/res/electron-v30.0.1-linux-x64/electron

// core -> extension -> action -> profile
// (以后做)  profile = extension + action + profile

// mkdir -p node_modules/electron ; dl_prefix="https://registry.npmmirror.com/electron/30.0.2/files" ; curl -o node_modules/electron/electron.d.ts -L $dl_prefix/electron.d.ts -o node_modules/electron/package.json -L $dl_prefix/package.json
