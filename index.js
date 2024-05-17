// @ts-check
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { request as requestHttp } from "node:http";
import { request as requestHttps } from "node:https";
import { join, isAbsolute } from "node:path";
import { homedir } from "node:os";
import module from "node:module";
import { spawn } from "node:child_process";

/**
 * Assert the value is true, or throw an error.
 * @param {boolean} value
 * @param {string | Error | any} [message]
 */
const assert = (value, message) => {
  // like "node:assert", but cross platform
  if (!value) {
    throw new Error(message ?? "assertion failed");
  }
};

/**
 * Exclude the static `import` declaration matches `regexp`.
 *
 * Will be `// excluded: import xxx form ...`.
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
  return join(...parts); // path.join will convert '\\' to '/' also, like path.resolve
};

/**
@typedef {
  "win-x64" | "linux-x64" | "mac-x64" | "mac-arm64"
} Platform "win-arm64" "linux-arm64"
@typedef {
  {
    platform: Platform,
    kind: "raw" | "zip" | "gzip" | "tar" | "tar-gzip",
    url: string,
    path: string,
  }
} Asset
@typedef {
  {
    entriesRoot?: HTMLElement,
    entries?: () => any,
    profileRoot: HTMLElement,
    profile: () => any,
    preview: (input: any) => void,
  }
} ActionUiController 之所以叫 controller 是因为类似 https://developer.mozilla.org/en-US/docs/Web/API/AbortController
@typedef {
  {
    progress: () => number,
    stop: () => void,
    wait: Promise<any>,
  }
} ActionExecuteController
@typedef {
  {
    finished: number,
    running: number,
    amount: number,
  }
} RunnerProgress The `running` property may be float.
@typedef {
  {
    progress: () => RunnerProgress,
    stop: () => void,
    wait: Promise<any>,
  }
} Runner
@typedef {
  {
    id: string,
    name: string,
    description: string,
    kind: StartActionRequest["entries"]["kind"],
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
    }[],
    profiles: {
      id: string,
      name: string,
      description: string,
      actionId: string,
      extensionId: string,
    }[],
  }[]
} ListExtensionsResponse
@typedef {
  {
    url: string,
  }
} InstallExtensionRequest
@typedef {
  {
    kind: "number-sequence",
    begin: number,
    end: number,
  }
} EntriesNumberSequence 以后可能有用
@typedef {
  {
    kind: "common-files",
    entries?: {
      inputFile: string,
      outputFile: string,
    }[],
    inputDir: string,
    outputDir: string,
    outputExtension: string,
  }
} EntriesCommonFiles 最常用的，包含扫描文件夹等功能
@typedef {
  {
    kind: "plain",
    entries: any[],
  }
} EntriesPlain 直接就是 entries 本身，也许可以适配 yt-dlp 这种凭空出个文件的场景
@typedef {
  {
    extensionId: string,
    extensionVersion: string,
    actionId: string,
    profile: any,
    entries: EntriesPlain | EntriesCommonFiles | EntriesNumberSequence,
  }
} StartActionRequest
@typedef {
  {
    runnerId: number,
  }
} StartActionResponse
@typedef {
  {
    runnerId: number,
  }
} GetRunnerProgressRequest
@typedef {
  RunnerProgress
} GetRunnerProgressResponse
*/

const html = (/** @type {any} */ [s]) => s;

const page = () => html`
  <!DOCTYPE html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <meta name="color-scheme" content="light dark" />
    <title>clevert</title>
    <!-- 虽然缩进比较多，但是 css 没啥问题 -->
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
      main_list_,
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
      main_list_[second_],
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
      entries_common_files_,
      entries_common_files_ > div {
        display: grid;
        gap: 8px;
        /* border: 1px solid var(--border); */
      }
      entries_common_files_ {
        margin-bottom: 8px;
      }
    </style>
  </head>
  <body>
    <script type="module" src="/index.js"></script>
  </body>
`;

const inPage = async () => {
  // Extension Market
  const $extensionsMarket = document.body.appendChild(
    document.createElement("extensions_market_")
  );
  $extensionsMarket.appendChild(document.createElement("label")).textContent =
    "Install URL: ";
  const $extensionInstallUrl = $extensionsMarket.appendChild(
    document.createElement("input")
  );
  const $extensionInstallButton = $extensionsMarket.appendChild(
    document.createElement("button")
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
    await refreshMainList();
  };

  // Current Action
  const $currentAction = document.body.appendChild(
    document.createElement("current_action_")
  );

  // Top Bar
  const $topBar = document.body.appendChild(document.createElement("top_bar_"));
  const $unfoldSideBarButton = $topBar.appendChild(
    document.createElement("button")
  );
  $unfoldSideBarButton.textContent = "Unfold";
  $unfoldSideBarButton.onclick = async () => {
    $sideBar.removeAttribute("fold_");
  };

  // Side Bar
  const $sideBar = document.body.appendChild(
    document.createElement("side_bar_")
  );
  const $mainList = $sideBar.appendChild(document.createElement("main_list_"));
  const $foldSideBarButton = $mainList.appendChild(
    document.createElement("side_bar_item_")
  );
  $foldSideBarButton.textContent = "Fold";
  $foldSideBarButton.onclick = async () => {
    $sideBar.setAttribute("fold_", "");
  };
  const $toExtensionMarketButton = $mainList.appendChild(
    document.createElement("side_bar_item_")
  );
  $toExtensionMarketButton.textContent = "Extension Market";
  $toExtensionMarketButton.onclick = async () => {
    $extensionsMarket.removeAttribute("page_off_");
    $currentAction.setAttribute("page_off_", "");
  };
  const $actionsList = $sideBar.appendChild(
    document.createElement("actions_list_")
  );
  const $backToMainListButton = $actionsList.appendChild(
    document.createElement("side_bar_item_")
  );
  $backToMainListButton.textContent = "Back";
  $backToMainListButton.onclick = async () => {
    $mainList.removeAttribute("second_");
    $actionsList.removeAttribute("second_");
  };

  const refreshMainList = async () => {
    const extensions = /** @type {ListExtensionsResponse} */ (
      await (await fetch("/list-extensions")).json()
    );
    $mainList.innerHTML = "";
    $mainList.appendChild($foldSideBarButton);
    $mainList.appendChild(document.createElement("hr"));
    $mainList.appendChild($toExtensionMarketButton);
    $mainList.appendChild(document.createElement("hr"));
    for (const extension of extensions) {
      const $extension = $mainList.appendChild(
        document.createElement("side_bar_item_")
      );
      $extension.textContent = extension.id;
      $extension.onclick = async () => {
        $actionsList.innerHTML = "";
        $actionsList.appendChild($backToMainListButton);
        $actionsList.appendChild(document.createElement("hr"));
        for (const action of extension.actions) {
          const $action = $actionsList.appendChild(
            document.createElement("side_bar_item_")
          );
          $action.textContent = action.id;
          $action.onclick = async () => {
            await refreshCurrentAction(extension.id, action.id);
            $extensionsMarket.setAttribute("page_off_", "");
            $currentAction.removeAttribute("page_off_");
          };
        }
        $mainList.setAttribute("second_", "");
        $actionsList.setAttribute("second_", "");
      };
    }
  };

  /**
   * @param {string} extensionId
   * @param {string} actionId
   */
  const refreshCurrentAction = async (extensionId, actionId) => {
    const extension = /** @type {Extension} */ (
      (await import("/extension/" + extensionId + "/index.js")).default
    );
    const action = extension.actions.find((action) => action.id === actionId);
    if (action === undefined) {
      alert("action === undefined");
      return;
    }
    const profile = extension.profiles.find(
      (profile) => profile.actionId === action.id
    );
    if (profile === undefined) {
      alert("profile === undefined");
      return;
    }
    $currentAction.innerHTML = "";
    $currentAction.setAttribute("kind_", action.kind);

    if (action.kind === "common-files") {
      // 允许使用 dir, 单个文件列表等。这里提供一个切换？
      // 适配一种场景，就是 yt-dlp 这样凭空出个文件
      const $entriesCommonFiles = $currentAction.appendChild(
        document.createElement("entries_common_files_")
      );
      const $select = $entriesCommonFiles.appendChild(
        document.createElement("select")
      );
      const $optDir = $select.appendChild(document.createElement("option"));
      $optDir.textContent = "Dir mode";
      $optDir.value = "dir";
      const $optFiles = $select.appendChild(document.createElement("option"));
      $optFiles.textContent = "Files mode";
      $optFiles.value = "files";
      // ---
      const $optDirPanel = $entriesCommonFiles.appendChild(
        document.createElement("div")
      );
      const $inputDir = $optDirPanel.appendChild(
        document.createElement("input")
      );
      $inputDir.placeholder = "Input Dir";
      $inputDir.value = "/home/kkocdko/misc/code/clevert/temp/converter-test/i"; // does not support "~/adbf" ?
      const $outputDir = $optDirPanel.appendChild(
        document.createElement("input")
      );
      $outputDir.placeholder = "Output Dir";
      $outputDir.value =
        "/home/kkocdko/misc/code/clevert/temp/converter-test/o";
      let $outputExtension;
      if (profile?.entries?.outputExtensionOptions) {
        const options = profile.entries.outputExtensionOptions;
        $outputExtension = $optDirPanel.appendChild(
          document.createElement("select")
        );
        for (const option of options) {
          const $option = $outputExtension.appendChild(
            document.createElement("option")
          );
          $option.textContent = option;
          if (profile?.entries?.outputExtension) {
            if (profile?.entries?.outputExtension === option) {
              $option.selected = true;
            }
          } else {
            if (options[0] === option) {
              $option.selected = true;
            }
          }
        }
      } else {
        $outputExtension = $optDirPanel.appendChild(
          document.createElement("input")
        );
        $outputExtension.placeholder = "Output Extension";
        if (profile?.entries?.outputExtension) {
          $outputExtension.value = profile?.entries?.outputExtension;
        }
      }

      // ---
      // const $optFilesPanel = $entriesCommonFiles.appendChild(
      //   document.createElement("div")
      // );
      // $select.onchange = () => {
      //   if ($select.value === "dir") {
      //   } else if ($select.value === "files") {
      //   } else {
      //   }
      // };

      const ui = action.ui(profile);
      if (ui.entriesRoot) {
        $currentAction.appendChild(ui.entriesRoot);
      }
      $currentAction.appendChild(ui.profileRoot);

      const $actionControls = $currentAction.appendChild(
        document.createElement("action_controls_")
      );
      const $runnerProgress = $actionControls.appendChild(
        document.createElement("pre")
      );
      const refreshRunnerProgress = async (/** @type {number} */ runnerId) => {
        const request = /** @type {GetRunnerProgressRequest} */ ({ runnerId });
        const response = /** @type {GetRunnerProgressResponse} */ (
          await (
            await fetch("/get-runner-progress", {
              method: "POST",
              body: JSON.stringify(request),
            })
          ).json()
        );
        $runnerProgress.textContent = JSON.stringify(response);
      };
      const $startButton = $actionControls.appendChild(
        document.createElement("button")
      );
      $startButton.textContent = "Start";
      $startButton.onclick = async () => {
        const startActionRequest = /** @type {StartActionRequest} */ ({
          extensionId: extension.id,
          actionId: action.id,
          profile: ui.profile(),
          entries: {
            kind: "common-files",
            inputDir: $inputDir.value,
            outputDir: $outputDir.value,
            outputExtension: $outputExtension.value,
          },
        });
        const startActionResponse = /** @type {StartActionResponse} */ (
          await (
            await fetch("/start-action", {
              method: "POST",
              body: JSON.stringify(startActionRequest),
            })
          ).json()
        );
        setInterval(async () => {
          refreshRunnerProgress(startActionResponse.runnerId);
        }, 1000);
      };
      return;
    }

    {
      alert("todo:" + action.kind);
      return;
    }
  };

  {
    // main
    await refreshMainList();
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
  const runners = /** @type {Map<number, Runner>} */ (new Map());

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

  const genEntries = async (
    /** @type {StartActionRequest["entries"]} */ opts
  ) => {
    if (opts.kind === "common-files") {
      if (opts.entries) {
        assert(false, "todo");
      }
      const entries = [];
      const inputDir = solvePath(false, opts.inputDir);
      for (const v of await readdir(inputDir, {
        withFileTypes: true,
        recursive: true,
      })) {
        const a = /** @type {any} */ (v);
        const parentPath = /** @type {string} */ (a.parentPath ?? a.path); // https://nodejs.org/api/fs.html#class-fsdirent
        const input = solvePath(false, parentPath, v.name);
        const relative = input
          .slice(inputDir.length)
          .replace(/(?<=\.)[^\\/\.]+$/, opts.outputExtension);
        const output = solvePath(false, opts.outputDir, relative);
        entries.push({
          input: { main: [input] },
          output: { main: [output] },
        });
      }
      return /** @type {any} */ (entries);
    }
    assert(false, "todo");
  };

  const server = createServer(async (req, res) => {
    // console.log({ url: req.url });

    if (req.url === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.writeHead(200);
      res.end(page());
      return;
    }

    if (req.url === "/index.js") {
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
      res.end();
      return;
    }

    if (req.url === "/start-action") {
      const request = /** @type {StartActionRequest} */ (await reqToJson(req));
      const extensionIndexJs = /** @type {string} */ (
        solvePath(true, PATH_EXTENSIONS, request.extensionId, "/index.js")
      );
      const extension = /** @type {Extension} */ (
        (await import(extensionIndexJs)).default
      );
      const action = extension.actions.find(
        (action) => action.id === request.actionId
      );
      if (action === undefined) {
        assert(false, "action not found");
        return;
      }
      const entries = await genEntries(request.entries);
      const runnerId = nextInt();
      const amount = entries.length;
      let finished = 0;
      const runningControllers = /** @type {Set<ActionExecuteController>} */ (
        new Set()
      );
      const promises = [...Array(PARALLEL)].map((_, i) =>
        (async () => {
          for (let entry; (entry = entries.shift()); ) {
            const controller = action.execute(request.profile, entry);
            runningControllers.add(controller);
            await controller.wait;
            runningControllers.delete(controller);
            finished += 1;
          }
        })()
      );
      runners.set(runnerId, {
        progress: () => {
          let running = 0;
          for (const controller of runningControllers) {
            running += controller.progress();
          }
          return { finished, running, amount };
        },
        stop: () => {
          for (const controller of runningControllers) {
            controller.stop();
            runningControllers.delete(controller);
          }
        },
        wait: Promise.all(promises),
      });
      const ret = /** @type {StartActionResponse} */ ({ runnerId });
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(JSON.stringify(ret));
      return;
    }

    if (req.url === "/stop-runner") {
      assert(false, "todo");
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(JSON.stringify({}));
      return;
    }

    if (req.url === "/get-runner-progress") {
      const request = /** @type {GetRunnerProgressRequest} */ (
        await reqToJson(req)
      );
      const runner = runners.get(request.runnerId);
      if (runner === undefined) {
        res.writeHead(404);
        res.end(JSON.stringify({}));
        return;
      }
      const ret = /** @type {GetRunnerProgressResponse} */ (runner.progress());
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(JSON.stringify(ret));
      return;
    }

    if (req.url?.startsWith("/extension/")) {
      console.log(req.url.split("/"));
      const [, , extensionId, fileName] = req.url.split("/");
      assert(fileName === "index.js");
      const extensionMainJs = /** @type {string} */ (
        solvePath(true, PATH_EXTENSIONS, extensionId, "/index.js")
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
        const extensionIndexJs = /** @type {string} */ (
          solvePath(true, PATH_EXTENSIONS, entry, "/index.js")
        );
        const extension = /** @type {Extension} */ (
          (await import(extensionIndexJs)).default
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
          profiles: extension.profiles,
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
      const extensionTempIndexJs = /** @type {string} */ (
        solvePath(true, PATH_CACHE, "downloading-" + nextInt() + ".js")
      );
      await download(request.url, extensionTempIndexJs);
      const extension = /** @type {Extension} */ (
        (await import(extensionTempIndexJs)).default
      );
      const extensionDir = /** @type {string} */ (
        solvePath(true, PATH_EXTENSIONS, extension.id)
      );
      await mkdir(extensionDir);
      await rename(extensionTempIndexJs, extensionDir + "/index.js");
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
      if (req.url === "resource:///index.js") {
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

// http://127.0.0.1:8080/extensions/jpegxl/index.js
// let c = {};

// https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html
// https://apple.stackexchange.com/q/420494/ # macos arm64 vm
// https://github.com/orgs/community/discussions/69211#discussioncomment-7941899 # macos arm64 ci free
// https://registry.npmmirror.com/binary.html?path=electron/v30.0.1/
// https://registry.npmmirror.com/-/binary/electron/v30.0.1/electron-v30.0.1-linux-x64.zip
// /home/kkocdko/misc/res/electron-v30.0.1-linux-x64/electron

// core -> extension -> action -> profile
// (以后做)  profile = extension + action + profile

// mkdir -p node_modules/electron ; dl_prefix="https://registry.npmmirror.com/electron/30.0.2/files" ; curl -o node_modules/electron/electron.d.ts -L $dl_prefix/electron.d.ts -o node_modules/electron/package.json -L $dl_prefix/package.json
