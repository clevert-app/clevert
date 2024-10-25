// @ts-check
/// <reference lib="esnext" />
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import events from "node:events";
import zlib from "node:zlib";
import stream from "node:stream";

/**
@typedef {
  "linux-x64" | "mac-arm64" | "win-x64"
} Platform We don't want new platforms currently. In the future, it should be ` "linux-x64" | "linux-arm64" | "mac-x64" | "mac-arm64" | "win-x64" | "win-arm64" `.
@typedef {{
  platforms: Platform[];
  kind: "raw" | "zip" | "gzip" | "xz" | "tar" | "tar-gzip" | "tar-xz";
  url: string;
  path: string;
}} Asset For "raw", "gzip" and "xz", the `.path` is the file path; for others, the `.path` is the directory path.
@typedef {{
  entriesRoot?: HTMLElement;
  entries?: () => any;
  profileRoot: HTMLElement;
  profile: () => any;
  preview: (input: any) => void;
}} ActionUiController Named "controller" because it looks like [AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController) .
@typedef {{
  progress: () => number;
  stop: () => void;
  promise: Promise<void>;
}} ActionExecuteController
@typedef {{
  id: string;
  name: string;
  description: string;
  kind: RunActionRequest["entries"]["kind"];
  ui: (profile: any) => ActionUiController;
  execute: (profile: any, entry: any) => ActionExecuteController;
}} Action
@typedef {{
  id: string;
  name: string;
  description: string;
  actionId: string;
  extensionId: string;
  extensionVersion: string;
  [key: string]: any;
}} Profile
@typedef {{
  id: string;
  version: string;
  name: string;
  description: string;
  dependencies: string[];
  assets: Asset[];
  actions: Action[];
  profiles: Profile[];
}} Extension
@typedef {{
  id: string;
  name: string;
  version: string;
  description: string;
  actions: {
    id: string;
    name: string;
    description: string;
  }[];
  profiles: {
    id: string;
    name: string;
    description: string;
    actionId: string;
    extensionId: string;
    extensionVersion: string;
  }[];
}[]} ListExtensionsResponse
@typedef {{
  kind: "number-sequence";
  begin: number;
  end: number;
}} EntriesNumberSequence May be useful later.
@typedef {{
  kind: "common-files";
  entries?: {
    inputFile: string,
    outputFile: string;
  }[];
  inputDir: string;
  outputDir: string;
  outputExtension: string;
}} EntriesCommonFiles The most common.
@typedef {{
  kind: "plain";
  entries: any[];
}} EntriesPlain Just `entries` itself, may useful for `yt-dlp` and other scenario that a file comes from nowhere.
@typedef {{
  begin: number;
  expectedEnd: number;
}} RunActionTiming All with `seconds` unit.
@typedef {{
  finished: number;
  running: number;
  amount: number;
}} RunActionProgress The `running` property may be float.
@typedef {{
  title: string;
  timing: () => RunActionTiming;
  progress: () => RunActionProgress;
  stop: () => void;
  promise: Promise<any>;
}} RunActionController
@typedef {{
  title: string;
  extensionId: string;
  extensionVersion: string;
  actionId: string;
  profile: any;
  entries: EntriesPlain | EntriesCommonFiles | EntriesNumberSequence;
  parallel: number;
}} RunActionRequest
@typedef {{
  download: {
    finished: number;
    amount: number;
  };
}} InstallExtensionProgress
@typedef {{
  title: string;
  progress: () => InstallExtensionProgress;
  promise: Promise<any>;
}} InstallExtensionController
@typedef {{
  title: string;
  url: string;
}} InstallExtensionRequest
@typedef {{
  id: string;
  version: string;
}} RemoveExtensionRequest
@typedef {{
  kind: "run-action-progress";
  id: string;
  title: string;
  timing: RunActionTiming;
  progress: RunActionProgress;
} | {
  kind: "run-action-success";
  id: string;
} | {
  kind: "run-action-error";
  id: string;
  error: any;
} | {
  kind: "install-extension-progress";
  id: string;
  title: string;
  progress: InstallExtensionProgress;
} | {
  kind: "install-extension-success";
  id: string;
} | {
  kind: "install-extension-error";
  id: string;
  error: any;
}} GetStatusResponseEvent
@typedef {{
  assert: typeof assert;
  debounce: typeof debounce;
  sleep: typeof sleep;
  locale: keyof i18nRes;
}} ClevertUtils Will be passed to `globalThis.clevertUtils`.
*/

const i18nRes = (() => {
  const enus = {
    title: () => "Clevert - Universal file converter platform",
    tasksEmpty: () => "No tasks",
    toTasks: () => "Tasks",
    toHome: () => "Home",
    toMarket: () => "Market",
    showRecent: () => "Recent",
    showByName: () => "By Name",
    showExtensions: () => "Extensions",
    showProfiles: () => "Profiles",
  };
  /** @type {Readonly<typeof enus>} */
  const zhcn = {
    title: () => "Clevert - 通用的文件转换平台",
    tasksEmpty: () => "没有任务",
    toTasks: () => "任务",
    toHome: () => "主页",
    toMarket: () => "商店",
    showRecent: () => "最近",
    showByName: () => "按名称",
    showExtensions: () => "扩展",
    showProfiles: () => "配置",
  };
  // todo: use llm to do translate
  return {
    "en-US": /** @type {Readonly<typeof enus>} */ (enus),
    "zh-CN": zhcn,
  }; // thanks to vscode, typesafe-i18n and more // http://www.lingoes.net/en/translator/langcode.htm
})();

/**
 * Assert the value is true, or throw an error. Like "node:assert", but cross platform.
 * @type {{ (value: false, info?): never; (value, info?): asserts value; }}
 */
const assert = (value, info = "assertion failed") => {
  if (value) return /** @type {never} */ (true); // what the fuck
  throw new Error(info);
};

/**
 * Returns a debounced variant of the input function.
 * @template {Function} T
 * @param {T} f
 * @param {number} ms
 * @returns {T}
 */
const debounce = (f, ms) => {
  let timer;
  return /** @type {any} */ (
    (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        f(...args);
      }, ms);
    }
  );
};

/**
 * Sleep. `await sleep(123)`.
 * @param {number} ms
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const [html, css] = [String.raw, String.raw]; // https://github.com/0x00000001A/es6-string-html
const pageCss = (/** @type {i18nRes["en-US"]} */ i18n) => css`
  /* initial theme, contains all vars */
  @media (min-width: 1px) {
    body {
      --bg: #fff;
      --bg3: #00000033;
      --bg4: #00000044;
      --bg5: #00000055;
      --bg6: #00000066;
      --fg: #000;
    }
  }
  /* initial theme for dark mode */
  @media (prefers-color-scheme: dark) {
    body {
      --bg: #000;
      --bg2: #ffffff22;
      --bg3: #ffffff33;
      --bg4: #ffffff44;
      --bg5: #ffffff55;
      --bg6: #ffffff66;
      --fg: #fff;
    }
  }
  /* todo: custom themes like "html.theme-abc { body { } }" */
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
  /* agreement: apply style to multi elements by css selector, not by util class */
  button,
  #home figure {
    position: relative;
    padding: 8px 12px;
    font-size: 14px;
    line-height: 1;
    background: var(--bg4);
    border: none;
    border-radius: 6px;
    transition: background-color 0.2s;
  }
  #home figure {
    background: var(--bg3);
  }
  #home > button.off:not(:hover):not(:active),
  header > button.off:not(:hover):not(:active) {
    background: #0000;
  }
  button:hover,
  #home figure:hover {
    background: var(--bg5);
  }
  #home figure:hover {
    background: var(--bg4);
  }
  button:active,
  #home figure:active {
    background: var(--bg6);
    transition: background-color 0s;
  }
  #home figure:active {
    background: var(--bg5);
  }
  input[type="text"],
  input[type="number"],
  input:not([type]) {
    padding: 5px 8px 5px 14px;
    font-size: 14px;
    line-height: 20px;
    background: var(--bg3);
    border: none;
    border-radius: 6px;
    outline: none;
    transition: background-color 0.2s;
  }
  input[type="text"]:focus,
  input[type="number"]:focus,
  input:not([type]):focus {
    background: var(--bg4);
  }
  body {
    height: 100vh;
    margin: 0;
    font-family: system-ui;
    font-size: 14px;
    background: var(--bg);
    color: var(--fg);
  }
  body > div {
    position: fixed;
    top: 42px;
    right: 0;
    bottom: 0;
    left: 0;
    padding: 6px 12px 12px;
  }
  /* agreement: default to be visable, and hide with ".off" class */
  body > div.off {
    visibility: hidden;
  }
  #home > button {
    padding: 6px 12px;
    margin-right: 4px;
  }
  #home > .separator {
    display: inline-block;
    width: 8px;
  }
  #home > ul {
    display: grid;
    gap: 6px;
    padding: 0;
    margin: 12px 0 0;
  }
  #home figure {
    position: relative;
    padding: 10px 14px 12px;
    margin: 0;
  }
  /* todo: animation for removing extension */
  #home figure > b {
    font-size: 17px;
    font-weight: normal;
    line-height: 1;
  }
  #home figure > sub {
    margin-left: 8px;
    vertical-align: baseline;
  }
  #home figure > p {
    margin: 8px 0 0;
    line-height: 1;
  }
  #home figure > button {
    position: absolute;
    top: 6px;
    right: 6px;
    padding: 8px;
  }
  #home figure > button:not(:hover):not(:active) {
    background: none;
  }
  #action .entries {
    display: flex;
    gap: 6px;
  }
  #tasks {
    overflow: auto;
  }
  #tasks:empty::after {
    display: block;
    text-align: center;
    content: "${i18n.tasksEmpty()}";
    font-size: 16px;
    margin: 8px;
  }
  #market > input {
    margin-right: 4px;
  }
  header {
    position: fixed;
    top: 0;
    right: 0;
    left: 0;
  }
  header > button {
    margin: 8px 0 8px 4px;
  }
  header > button:first-child {
    margin-left: 12px;
  }
  /* todo: about hover, https://stackoverflow.com/a/30303898 */
`;
const pageHtml = (/** @type {i18nRes["en-US"]} */ i18n, lang) => html`
  <!DOCTYPE html>
  <html lang="${lang}">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width" />
      <meta name="color-scheme" content="light dark" />
      <link rel="icon" href="data:" />
      <title>${i18n.title()}</title>
      <!-- module script defer by default -->
      <script type="module" src="/index.js"></script>
      <style>
        ${pageCss(i18n)}
      </style>
    </head>
    <body></body>
  </html>
`;
const pageMain = async () => {
  /** @type {ClevertUtils} */
  const cu = {
    assert,
    debounce,
    sleep,
    locale: /** @type {keyof i18nRes} */ (document.documentElement.lang),
  };
  globalThis.clevertUtils = cu;

  const i18n = i18nRes[cu.locale];

  // $tasks
  const $tasks = document.createElement("div");
  document.body.appendChild($tasks);
  $tasks.id = "tasks";
  $tasks.classList.add("off");
  new EventSource("/get-status").onmessage = async (message) => {
    const e = /** @type {GetStatusResponseEvent} */ (JSON.parse(message.data)); // agreement: the only sse endpoint, only one
    /** @type {HTMLElement | null} */
    let $task = $tasks.querySelector(`section[data-id="${e.id}"]`);
    if (!$task) {
      $task = document.createElement("section");
      $tasks.insertBefore($task, $tasks.firstChild);
      $task.dataset.id = e.id;
      const $title = document.createElement("h6");
      $task.appendChild($title);
      const $tips = document.createElement("span");
      $task.appendChild($tips);
      const $operations = document.createElement("div");
      $task.appendChild($operations);
      if (e.kind === "run-action-progress") {
        // TODO: more operations like pause, stop, pin
      } else if (e.kind === "install-extension-progress") {
        // TODO: more operations like pause, stop
      } else {
        assert(false, "unexpected kind: " + e.kind);
      }
    }
    const [$title, $tips, $operations] = $task.children;
    if (e.kind === "run-action-progress") {
      // const [$pause, $stop, $pin] = $operations.children;
      $title.textContent = e.title;
      $tips.textContent =
        `${e.timing.expectedEnd - Math.trunc(Date.now() / 1000)}s - ` +
        `${e.progress.finished}/${e.progress.amount}`;
    } else if (e.kind === "run-action-success") {
      $tips.textContent = "Success";
    } else if (e.kind === "run-action-error") {
      $tips.textContent = "Error: " + JSON.stringify(e.error);
    } else if (e.kind === "install-extension-progress") {
      // const [$stop, $pin] = $operations.children;
      $title.textContent = e.title;
      $tips.textContent = `${e.progress.download.finished}/${e.progress.download.amount} Bytes`;
    } else if (e.kind === "install-extension-success") {
      $tips.textContent = "Success";
      r$home();
    } else if (e.kind === "install-extension-error") {
      $tips.textContent = "Error: " + JSON.stringify(e.error);
    } else {
      const /** @type {never} */ _ = e; // exhaustiveness
    }
  };

  // $home
  const $home = document.createElement("div"); // 选择 extension，action，profile 等. 其实用户眼中应该全都是 profile，所有的目标都是 profile
  document.body.appendChild($home);
  $home.id = "home";
  $home.classList.add("off");
  /** @type {ListExtensionsResponse} */
  let extensionsList = [];
  // $showRecent
  const $showRecent = document.createElement("button");
  $home.appendChild($showRecent);
  $showRecent.textContent = i18n.showRecent();
  $showRecent.onclick = () => {
    $showRecent.classList.remove("off");
    $showByName.classList.add("off");
    r$choices();
  };
  // $showByName
  const $showByName = document.createElement("button");
  $home.appendChild($showByName);
  $showByName.classList.add("off");
  $showByName.textContent = i18n.showByName();
  $showByName.onclick = () => {
    $showRecent.classList.add("off");
    $showByName.classList.remove("off");
    r$choices();
  };
  // separator
  $home.appendChild(document.createElement("span")).classList.add("separator");
  // $showExtensions
  const $showExtensions = document.createElement("button");
  $home.appendChild($showExtensions);
  $showExtensions.textContent = i18n.showExtensions();
  $showExtensions.onclick = () => {
    $showExtensions.classList.remove("off");
    $showProfiles.classList.add("off");
    delete $showProfiles.dataset.extensionId;
    delete $showProfiles.dataset.extensionVersion;
    r$choices();
  };
  // $showProfiles
  const $showProfiles = document.createElement("button");
  $home.appendChild($showProfiles);
  $showProfiles.classList.add("off");
  $showProfiles.textContent = i18n.showProfiles();
  $showProfiles.onclick = () => {
    $showExtensions.classList.add("off");
    $showProfiles.classList.remove("off");
    r$choices();
  };
  // $choices
  const $choices = document.createElement("ul");
  $home.appendChild($choices);
  const r$choices = () => {
    $choices.replaceChildren();
    if (!$showExtensions.classList.contains("off")) {
      for (const extension of extensionsList) {
        const $choice = document.createElement("figure");
        $choices.appendChild($choice);
        $choice.onclick = () => {
          $showProfiles.dataset.extensionId = extension.id;
          $showProfiles.dataset.extensionVersion = extension.version;
          $showProfiles.click();
        };
        const $name = document.createElement("b");
        $choice.appendChild($name);
        $name.textContent = extension.name;
        $name.title = extension.id;
        const $version = document.createElement("sub");
        $choice.appendChild($version);
        $version.textContent = extension.version;
        $version.title = "Extension version";
        const $description = document.createElement("p");
        $choice.appendChild($description);
        $description.textContent = extension.description;
        const $remove = document.createElement("button");
        $choice.appendChild($remove);
        $remove.textContent = "×";
        $remove.title = "Remove";
        $remove.onclick = async (e) => {
          e.stopPropagation();
          /** @type {RemoveExtensionRequest} */
          const request = {
            id: extension.id,
            version: extension.version,
          };
          await fetch("/remove-extension", {
            method: "POST",
            body: JSON.stringify(request),
          });
          r$home();
        };
      }
    } else if (!$showProfiles.classList.contains("off")) {
      for (const extension of extensionsList) {
        if ($showProfiles.dataset.extensionId) {
          if (
            extension.id !== $showProfiles.dataset.extensionId ||
            extension.version !== $showProfiles.dataset.extensionVersion
          ) {
            continue;
          }
        }
        for (const profile of extension.profiles) {
          const $choice = document.createElement("figure");
          $choices.appendChild($choice);
          const $name = document.createElement("b");
          $choice.appendChild($name);
          $name.textContent = profile.name;
          $name.title = profile.id;
          const $version = document.createElement("sub");
          $choice.appendChild($version);
          $version.textContent = profile.extensionVersion;
          $version.title = "Extension version";
          const $description = document.createElement("p");
          $choice.appendChild($description);
          $description.textContent = profile.description;
          const $remove = document.createElement("button");
          $choice.appendChild($remove);
          $remove.textContent = "×";
          $remove.title = "Remove";
          $remove.onclick = async (e) => {
            e.stopPropagation();
            assert(false, "todo");
          };
          $choice.onclick = async () => {
            r$action(profile.extensionId, profile.extensionVersion, profile.id);
            $home.classList.add("off");
            $action.classList.remove("off");
          };
        }
      }
    } else {
      assert(false, "unexpected state");
    }
  };
  const r$home = async () => {
    const response = await fetch("/list-extensions")
      .then((r) => r.json())
      .then((a) => /** @type {ListExtensionsResponse} */ (a));
    extensionsList = response;
    r$choices();
  };
  r$home();

  // $action
  const $action = document.createElement("div"); // 在选择好 action 之后，装入这个元素中
  document.body.appendChild($action);
  $action.id = "action";
  $action.classList.add("off");
  /**
   * @param {string} extensionId
   * @param {string} extensionVersion
   * @param {string} profileId
   */
  const r$action = async (extensionId, extensionVersion, profileId) => {
    const extensionIndexJsUrl =
      "/extensions/" + extensionId + "_" + extensionVersion + "/index.js";
    const extension = /** @type {Extension} */ (
      (await import(extensionIndexJsUrl)).default
    );
    const profile = extension.profiles.find(
      (profile) => profile.id === profileId
    );
    assert(profile !== undefined);
    const action = extension.actions.find(
      (action) => action.id === profile.actionId
    );
    assert(action !== undefined);
    $action.replaceChildren();
    let getEntries;
    if (action.kind === "common-files") {
      const $entries = document.createElement("div");
      $action.appendChild($entries);
      $entries.classList.add("entries");
      const $inputDir = document.createElement("input");
      $entries.appendChild($inputDir);
      $inputDir.placeholder = "Input Dir";
      const $outputDir = document.createElement("input");
      $entries.appendChild($outputDir);
      $outputDir.placeholder = "Output Dir";
      const $outputExtension = document.createElement("input");
      $entries.appendChild($outputExtension);
      $outputExtension.placeholder = "Output Extension";
      getEntries = () => {
        /** @type {EntriesCommonFiles} */
        const entries = {
          kind: "common-files",
          inputDir: $inputDir.value,
          outputDir: $outputDir.value,
          outputExtension: $outputExtension.value,
        };
        return entries;
      };
    } else if (action.kind === "plain") {
      // todo
      const $entries = document.createElement("div");
      $action.appendChild($entries);
      getEntries = () => {
        /** @type {EntriesPlain} */
        const entries = {
          kind: "plain",
          entries: [],
        };
        return entries;
      };
    } else {
      assert(false, "todo");
    }
    // todo: custom entries for yt-dlp
    const controller = action.ui(profile);
    assert(controller.profileRoot.localName === "form");
    assert(controller.profileRoot.classList.contains("profile"));
    $action.appendChild(controller.profileRoot);
    const $operations = document.createElement("div");
    $operations.classList.add("operations");
    $action.appendChild($operations);
    const $runAction = document.createElement("button");
    $operations.appendChild($runAction);
    $runAction.textContent = "Run";
    $runAction.onclick = async () => {
      /** @type {RunActionRequest} */
      const request = {
        title: `${action.id} - ${extensionId}`,
        extensionId,
        extensionVersion,
        actionId: action.id,
        profile: controller.profile(),
        entries: getEntries(),
        parallel: 2,
      };
      await fetch("/run-action", {
        method: "POST",
        body: JSON.stringify(request),
      });
      $toTasks.click();
    };
  };

  // $market
  const $market = document.createElement("div");
  document.body.appendChild($market);
  $market.id = "market";
  $market.classList.add("off");
  const r$market = async () => {
    // todo: add real market
    const $url = document.createElement("input");
    $market.appendChild($url);
    $url.placeholder = "URL";
    const $install = document.createElement("button");
    $market.appendChild($install);
    $install.textContent = "Install";
    $install.onclick = async () => {
      assert($url.value.trim() !== "");
      /** @type {InstallExtensionRequest} */
      const request = {
        title:
          "Install extension from " +
          ($url.value.length > 12 + 19 + 1
            ? $url.value.slice(0, 12) + "…" + $url.value.slice(-19)
            : $url.value),
        url: $url.value,
      };
      await fetch("/install-extension", {
        method: "POST",
        body: JSON.stringify(request),
      });
      $toTasks.click();
    };
  };
  r$market();

  // $top
  const $top = document.createElement("header"); // 如果要移动端，就**不可能**侧栏了。而顶栏在桌面端也可以忍受
  document.body.appendChild($top);
  $top.id = "top";
  const $toTasks = document.createElement("button");
  $top.appendChild($toTasks);
  $toTasks.classList.add("off");
  $toTasks.textContent = i18n.toTasks();
  $toTasks.onclick = () => {
    $toTasks.classList.remove("off");
    $toHome.classList.add("off");
    $toMarket.classList.add("off");
    $tasks.classList.remove("off");
    $home.classList.add("off");
    $action.classList.add("off");
    $market.classList.add("off");
  };
  const $toHome = document.createElement("button");
  $top.appendChild($toHome);
  $toHome.classList.add("off");
  $toHome.textContent = i18n.toHome();
  $toHome.onclick = () => {
    $toTasks.classList.add("off");
    $toHome.classList.remove("off");
    $toMarket.classList.add("off");
    $tasks.classList.add("off");
    $home.classList.remove("off");
    $action.classList.add("off");
    $market.classList.add("off");
  };
  const $toMarket = document.createElement("button");
  $top.appendChild($toMarket);
  $toMarket.classList.add("off");
  $toMarket.textContent = i18n.toMarket();
  $toMarket.onclick = () => {
    $toTasks.classList.add("off");
    $toHome.classList.add("off");
    $toMarket.classList.remove("off");
    $tasks.classList.add("off");
    $home.classList.add("off");
    $action.classList.add("off");
    $market.classList.remove("off");
  };

  // main
  {
    $toHome.click();
  }
};
const serverMain = async () => {
  const electronImport = import("electron"); // as early as possible // to hack type acquisition: cd ~/.cache/typescript/0.0 ; mkdir _electron ; echo '{"name":"@types/electron"}' > _electron/package.json ; curl -o _electron/index.d.ts -L unpkg.com/electron/electron.d.ts ; npm i -D ./_electron
  electronImport.catch(() => {});

  const PATH_EXTENSIONS = "./temp/extensions";
  const PATH_CACHE = "./temp/cache";
  const PATH_CONFIG = "./temp/config.json";
  await fsp.mkdir(PATH_EXTENSIONS, { recursive: true });
  await fsp.mkdir(PATH_CACHE, { recursive: true });

  /**
   * Open a json file and returns mapping object. Like [valtio](https://github.com/pmndrs/valtio).
   * @param {fs.PathLike} path
   */
  const openJsonMmap = async (path) => {
    await fsp.access(path).catch(() => fsp.writeFile(path, "{}")); // create if not exist
    const file = await fsp.open(path, "r+"); // we do not care about the `.close`
    let locked = false;
    const syncToFile = debounce(async () => {
      if (locked) return syncToFile(); // avoid race, see docs of `.write`
      locked = true;
      const data = JSON.stringify(ret, null, 2) + "\n";
      const { bytesWritten } = await file.write(data, 0); // do not use `.writeFile`
      await file.truncate(bytesWritten); // write then truncate, do not reverse
      locked = false;
    }, 50); // 50ms is enough for most machines, and the JSON.stringify is sync which can delay the await sleep in electron's app.on("window-all-closed", ...)
    const ret = new Proxy(JSON.parse((await file.readFile()).toString()), {
      set(obj, k, v) {
        obj[k] = Object.isExtensible(v) ? new Proxy(v, this) : v;
        touchProps(obj[k]); // supports recursive
        syncToFile();
        return true;
      },
      deleteProperty(obj, k) {
        delete obj[k];
        syncToFile();
        return true;
      },
    });
    const touchProps = (obj) => {
      for (const k in obj) if (Object.isExtensible(obj[k])) obj[k] = obj[k]; // trigger `.set`
    };
    touchProps(ret);
    return ret;
  };

  const defaultConfig = Object.seal({
    windowWidth: 800,
    windowHeight: 600,
    windowMaximized: false,
    locale: /** @type {keyof i18nRes} */ (
      Intl.DateTimeFormat().resolvedOptions().locale
    ),
    serverPort: 9393,
  });
  /** @type {typeof defaultConfig} */
  const config = await openJsonMmap(PATH_CONFIG); // developers write js extensions, common users will not modify config file manually, so the non-comments json is enough
  for (const k in defaultConfig) {
    // be relax, Object.hasOwn({ a: undefined }, "a") === true
    if (!Object.hasOwn(config, k)) {
      config[k] = defaultConfig[k];
    }
  }

  /** @type {ClevertUtils} */
  const cu = {
    assert,
    debounce,
    sleep,
    locale: config.locale,
  };
  globalThis.clevertUtils = cu;

  const i18n = i18nRes[config.locale];

  const serverPort = Promise.withResolvers();

  const beforeQuit = async () => {
    await sleep(100); // wait for config file sync (50ms), however ctrl+c still cause force exit
  };

  const electronRun = electronImport.then(async (electron) => {
    const { app, BrowserWindow, nativeTheme, screen } = electron; // agreement: keep electron optional, as a simple webview, users can choose node + browser
    app.commandLine.appendSwitch("no-sandbox"); // cause devtools error /dev/shm ... on linux
    app.commandLine.appendSwitch("disable-gpu-sandbox");
    const createWindow = async () => {
      const win = new BrowserWindow({
        title: i18n.title(),
        autoHideMenuBar: true,
        backgroundColor: nativeTheme.shouldUseDarkColors ? "#000" : "#fff",
        webPreferences: {
          sandbox: false,
          spellcheck: false,
        },
        width: config.windowWidth, // only (width,height), no (x,y), see https://kkocdko.site/post/202409161747
        height: config.windowHeight,
      });
      if (config.windowMaximized) {
        win.maximize();
      }
      win.on("close", () => {
        const workAreaSize = screen.getPrimaryDisplay().workAreaSize;
        const bounds = win.getBounds();
        config.windowWidth = Math.min(bounds.width, workAreaSize.width - 64);
        config.windowHeight = Math.min(bounds.height, workAreaSize.height - 64);
        config.windowMaximized = win.isMaximized();
      });
      win.loadURL("http://127.0.0.1:" + (await serverPort.promise));
    };
    app.whenReady().then(async () => {
      await sleep(0); // workaround to reduce flicker in linux, see https://github.com/electron/electron/issues/42523#issuecomment-2354912311
      createWindow();
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createWindow();
        }
      });
    });
    app.on("window-all-closed", async () => {
      if (process.platform !== "darwin") {
        await beforeQuit();
        app.quit(); // https://github.com/electron/electron/blob/v32.1.0/docs/tutorial/quick-start.md#recap
      }
    });
  });
  if (!process?.versions?.electron || process?.env?.ELECTRON_RUN_AS_NODE) {
    electronRun.catch(() => {}); // ignore errors if not in electron
  }

  /** @type {Platform} */
  const CURRENT_PLATFORM = false
    ? assert(false)
    : process.platform === "linux" && process.arch === "x64"
    ? "linux-x64"
    : process.platform === "win32" && process.arch === "x64"
    ? "win-x64"
    : process.platform === "darwin" && process.arch === "arm64"
    ? "mac-arm64"
    : assert(false, "unsupported platform");

  // these controllers will not be delete forever
  /** @type {Map<string, RunActionController>} */
  const runActionControllers = new Map();
  /** @type {Map<string, InstallExtensionController>} */
  const installExtensionControllers = new Map();

  /**
   * Read request body then parse json.
   * @param {http.IncomingMessage} req
   */
  const readReq = (req) => {
    const { resolve, reject, promise } = Promise.withResolvers();
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(JSON.parse(body)));
    req.on("error", (error) => reject(error));
    return promise;
  };

  /**
   * From [node-stream-zip](https://github.com/antelle/node-stream-zip/tree/7c5d50393418b261668b0dd4c8d9ccaa9ac913ce). MIT License. Gen this embed script by commands: `cat a.js | sed -E 's|.+?require\(.+?\);||g' | esbuild --minify-whitespace --line-limit=320 --legal-comments=eof` .
   *
   * Because of [this](https://github.com/microsoft/TypeScript/issues/19573) , we need some `/ * @ type {any} * /`.
   **/
  // prettier-ignore
  const Zip = (() => {
    const consts={LOCHDR:30,LOCSIG:67324752,LOCVER:4,LOCFLG:6,LOCHOW:8,LOCTIM:10,LOCCRC:14,LOCSIZ:18,LOCLEN:22,LOCNAM:26,LOCEXT:28,EXTSIG:134695760,EXTHDR:16,EXTCRC:4,EXTSIZ:8,EXTLEN:12,CENHDR:46,CENSIG:33639248,CENVEM:4,CENVER:6,CENFLG:8,CENHOW:10,CENTIM:12,CENCRC:16,CENSIZ:20,CENLEN:24,CENNAM:28,CENEXT:30,CENCOM:32,CENDSK:34,
    CENATT:36,CENATX:38,CENOFF:42,ENDHDR:22,ENDSIG:101010256,ENDSIGFIRST:80,ENDSUB:8,ENDTOT:10,ENDSIZ:12,ENDOFF:16,ENDCOM:20,MAXFILECOMMENT:65535,ENDL64HDR:20,ENDL64SIG:117853008,ENDL64SIGFIRST:80,ENDL64OFS:8,END64HDR:56,END64SIG:101075792,END64SIGFIRST:80,END64SUB:24,END64TOT:32,END64SIZ:40,END64OFF:48,STORED:0,SHRUNK:1,REDUCED1:2,
    REDUCED2:3,REDUCED3:4,REDUCED4:5,IMPLODED:6,DEFLATED:8,ENHANCED_DEFLATED:9,PKWARE:10,BZIP2:12,LZMA:14,IBM_TERSE:18,IBM_LZ77:19,FLG_ENC:0,FLG_COMP1:1,FLG_COMP2:2,FLG_DESC:4,FLG_ENH:8,FLG_STR:16,FLG_LNG:1024,FLG_MSK:4096,FLG_ENTRY_ENC:1,EF_ID:0,EF_SIZE:2,ID_ZIP64:1,ID_AVINFO:7,ID_PFS:8,ID_OS2:9,ID_NTFS:10,ID_OPENVMS:12,ID_UNIX:13,
    ID_FORK:14,ID_PATCH:15,ID_X509_PKCS7:20,ID_X509_CERTID_F:21,ID_X509_CERTID_C:22,ID_STRONGENC:23,ID_RECORD_MGT:24,ID_X509_PKCS7_RL:25,ID_IBM1:101,ID_IBM2:102,ID_POSZIP:18064,EF_ZIP64_OR_32:4294967295,EF_ZIP64_OR_16:65535};const/** @type {any} */StreamZip=function(config){let fd,fileSize,chunkSize,op,/** @type {any} */centralDirectory,closed;const ready=false,/** @type {any} */
    that=this,/** @type {any} */entries=config.storeEntries!==false?{}:null,fileName=config.file,textDecoder=config.nameEncoding?new TextDecoder(config.nameEncoding):null;open();function open(){if(config.fd){fd=config.fd;readFile()}else{fs.open(fileName,"r",(err,f)=>{if(err)return that.emit("error",err);fd=f;readFile()})}}function readFile(){
    fs.fstat(fd,(err,stat)=>{if(err)return that.emit("error",err);fileSize=stat.size;chunkSize=config.chunkSize||Math.round(fileSize/1e3);chunkSize=Math.max(Math.min(chunkSize,Math.min(128*1024,fileSize)),Math.min(1024,fileSize));readCentralDirectory()})}function readUntilFoundCallback(err,bytesRead){if(err||!bytesRead)return that.
    emit("error",err||new Error("Archive read error"));let pos=op.lastPos,bufferPosition=pos-op.win.position;const buffer=op.win.buffer,minPos=op.minPos;while(--pos>=minPos&&--bufferPosition>=0){if(buffer.length-bufferPosition>=4&&buffer[bufferPosition]===op.firstByte){if(buffer.readUInt32LE(bufferPosition)===op.sig){op.lastBufferPosition=
    bufferPosition;op.lastBytesRead=bytesRead;op.complete();return}}}if(pos===minPos)return that.emit("error",new Error("Bad archive"));op.lastPos=pos+1;op.chunkSize*=2;if(pos<=minPos)return that.emit("error",new Error("Bad archive"));const expandLength=Math.min(op.chunkSize,pos-minPos);op.win.expandLeft(expandLength,readUntilFoundCallback)}
    function readCentralDirectory(){const totalReadLength=Math.min(consts.ENDHDR+consts.MAXFILECOMMENT,fileSize);op={win:new FileWindowBuffer(fd),totalReadLength,minPos:fileSize-totalReadLength,lastPos:fileSize,chunkSize:Math.min(1024,chunkSize),firstByte:consts.ENDSIGFIRST,sig:consts.ENDSIG,complete:readCentralDirectoryComplete};
    op.win.read(fileSize-op.chunkSize,op.chunkSize,readUntilFoundCallback)}function readCentralDirectoryComplete(){const buffer=op.win.buffer,pos=op.lastBufferPosition;try{centralDirectory=new CentralDirectoryHeader;centralDirectory.read(buffer.slice(pos,pos+consts.ENDHDR));centralDirectory.headerOffset=op.win.position+pos;
    if(centralDirectory.commentLength){that.comment=buffer.slice(pos+consts.ENDHDR,pos+consts.ENDHDR+centralDirectory.commentLength).toString()}else{that.comment=null}that.entriesCount=centralDirectory.volumeEntries;that.centralDirectory=centralDirectory;if(centralDirectory.volumeEntries===consts.EF_ZIP64_OR_16&&centralDirectory.
    totalEntries===consts.EF_ZIP64_OR_16||centralDirectory.size===consts.EF_ZIP64_OR_32||centralDirectory.offset===consts.EF_ZIP64_OR_32){readZip64CentralDirectoryLocator()}else{op={};readEntries()}}catch(err){that.emit("error",err)}}function readZip64CentralDirectoryLocator(){const length=consts.ENDL64HDR;if(op.lastBufferPosition>
    length){op.lastBufferPosition-=length;readZip64CentralDirectoryLocatorComplete()}else{op={win:op.win,totalReadLength:length,minPos:op.win.position-length,lastPos:op.win.position,chunkSize:op.chunkSize,firstByte:consts.ENDL64SIGFIRST,sig:consts.ENDL64SIG,complete:readZip64CentralDirectoryLocatorComplete};op.win.read(op.
    lastPos-op.chunkSize,op.chunkSize,readUntilFoundCallback)}}function readZip64CentralDirectoryLocatorComplete(){const buffer=op.win.buffer,locHeader=new CentralDirectoryLoc64Header;locHeader.read(buffer.slice(op.lastBufferPosition,op.lastBufferPosition+consts.ENDL64HDR));const readLength=fileSize-locHeader.headerOffset;
    op={win:op.win,totalReadLength:readLength,minPos:locHeader.headerOffset,lastPos:op.lastPos,chunkSize:op.chunkSize,firstByte:consts.END64SIGFIRST,sig:consts.END64SIG,complete:readZip64CentralDirectoryComplete};op.win.read(fileSize-op.chunkSize,op.chunkSize,readUntilFoundCallback)}function readZip64CentralDirectoryComplete(){
    const buffer=op.win.buffer;const zip64cd=new CentralDirectoryZip64Header;zip64cd.read(buffer.slice(op.lastBufferPosition,op.lastBufferPosition+consts.END64HDR));that.centralDirectory.volumeEntries=zip64cd.volumeEntries;that.centralDirectory.totalEntries=zip64cd.totalEntries;that.centralDirectory.size=zip64cd.size;that.
    centralDirectory.offset=zip64cd.offset;that.entriesCount=zip64cd.volumeEntries;op={};readEntries()}function readEntries(){op={win:new FileWindowBuffer(fd),pos:centralDirectory.offset,chunkSize,entriesLeft:centralDirectory.volumeEntries};op.win.read(op.pos,Math.min(chunkSize,fileSize-op.pos),readEntriesCallback)}function readEntriesCallback(err,bytesRead){
    if(err||!bytesRead)return that.emit("error",err||new Error("Entrie    s read error"));let bufferPos=op.pos-op.win.position;let entry=op.entry;const buffer=op.win.buffer;const bufferLength=buffer.length;try{while(op.entriesLeft>0){if(!entry){entry=new ZipEntry;entry.readHeader(buffer,bufferPos);entry.headerOffset=op.win.
    position+bufferPos;op.entry=entry;op.pos+=consts.CENHDR;bufferPos+=consts.CENHDR}const entryHeaderSize=entry.fnameLen+entry.extraLen+entry.comLen;const advanceBytes=entryHeaderSize+(op.entriesLeft>1?consts.CENHDR:0);if(bufferLength-bufferPos<advanceBytes){op.win.moveRight(chunkSize,readEntriesCallback,bufferPos);op.move=
    true;return}entry.read(buffer,bufferPos,textDecoder);if(!config.skipEntryNameValidation)entry.validateName();if(entries)entries[entry.name]=entry;that.emit("ent    ry",entry);op.entry=entry=null;op.entriesLeft--;op.pos+=entryHeaderSize;bufferPos+=entryHeaderSize}that.emit("ready")}catch(err2){that.emit("error",err2)}}function checkEntriesExist(){
    if(!entries)throw new Error("storeEntries disabled")}Object.defineProperty(this,"ready",{get(){return ready}});this.entry=function(name){checkEntriesExist();return entries[name]};this.entries=function(){checkEntriesExist();return entries};this.stream=function(entry,callback){return this.openEntry(entry,(err,entry2)=>{if(err)
    return callback(err);const offset=dataOffset(entry2);let/** @type {any} */entryStream=new EntryDataReaderStream(fd,offset,entry2.compressedSize);if(entry2.method===consts.STORED){}else if(entry2.method===consts.DEFLATED){entryStream=entryStream.pipe(zlib.createInflateRaw())}else{return callback(new Error("Unknown compression method: "+
    entry2.method))}if(canVerifyCrc(entry2))entryStream=entryStream.pipe(new EntryVerifyStream(entryStream,entry2.crc,entry2.size));callback(null,entryStream)},false)};this.entryDataSync=function(entry){let err=null;this.openEntry(entry,(e,en)=>{err=e;entry=en},true);if(err)throw err;let data=Buffer.alloc(entry.compressedSize);
    new FsRead(fd,data,0,entry.compressedSize,dataOffset(entry),e=>{err=e}).read(true);if(err)throw err;if(entry.method===consts.STORED){}else if(entry.method===consts.DEFLATED||entry.method===consts.ENHANCED_DEFLATED){data=zlib.inflateRawSync(data)}else{throw new Error("Unknown compression method: "+entry.method)}if(data.
    length!==entry.size)throw new Error("Invalid size");if(canVerifyCrc(entry)){const verify=new CrcVerify(entry.crc,entry.size);verify.data(data)}return data};this.openEntry=function(entry,callback,sync){if(typeof entry==="string"){checkEntriesExist();entry=entries[entry];if(!entry)return callback(new Error("Entry not fou\
    nd"))}if(!entry.isFile)return callback(new Error("Entry is not file"));if(!fd)return callback(new Error("Archive closed"));const buffer=Buffer.alloc(consts.LOCHDR);new FsRead(fd,buffer,0,buffer.length,entry.offset,err=>{if(err)return callback(err);let readEx;try{entry.readDataHeader(buffer);if(entry.encrypted)readEx=new Error(
    "Entry encrypted")}catch(ex){readEx=ex}callback(readEx,entry)}).read(sync)};function dataOffset(entry){return entry.offset+consts.LOCHDR+entry.fnameLen+entry.extraLen}function canVerifyCrc(entry){return(entry.flags&8)!==8}function extract(entry,outPath,callback){that.stream(entry,(err,stm)=>{if(err){callback(err)}else{
    let fsStm,errThrown;stm.on("error",err2=>{errThrown=err2;if(fsStm){stm.unpipe(fsStm);fsStm.close(()=>{callback(err2)})}});fs.open(outPath,"w",(err2,fdFile)=>{if(err2)return callback(err2);if(errThrown){fs.close(fd,()=>{callback(errThrown)});return}fsStm=fs.createWriteStream(outPath,{fd:fdFile});fsStm.on("finish",()=>{that.
    emit("extract",entry,outPath);if(!errThrown)callback()});stm.pipe(fsStm)})}})}function createDirectories(baseDir,dirs,callback){if(!dirs.length)return callback();let dir=dirs.shift();dir=path.join(baseDir,path.join(...dir));fs.mkdir(dir,{recursive:true},err=>{if(err&&err.code!=="EEXIST")return callback(err);createDirectories(
    baseDir,dirs,callback)})}function extractFiles(baseDir,baseRelPath,files,callback,extractedCount){if(!files.length)return callback(null,extractedCount);const file=files.shift();const targetPath=path.join(baseDir,file.name.replace(baseRelPath,""));extract(file,targetPath,err=>{if(err)return callback(err,extractedCount);
    extractFiles(baseDir,baseRelPath,files,callback,extractedCount+1)})}this.extract=function(entry,outPath,callback){let entryName=entry||"";if(typeof entry==="string"){entry=this.entry(entry);if(entry){entryName=entry.name}else{if(entryName.length&&entryName[entryName.length-1]!=="/")entryName+="/"}}if(!entry||entry.isDirectory){
    const files=[],dirs=[],allDirs={};for(const e in entries){if(Object.prototype.hasOwnProperty.call(entries,e)&&e.lastIndexOf(entryName,0)===0){let relPath=e.replace(entryName,"");const childEntry=entries[e];if(childEntry.isFile){files.push(childEntry);relPath=path.dirname(relPath)}if(relPath&&!allDirs[relPath]&&relPath!==
    "."){allDirs[relPath]=true;let parts=relPath.split("/").filter(f=>f);if(parts.length)dirs.push(parts);while(parts.length>1){parts=parts.slice(0,parts.length-1);const partsPath=parts.join("/");if(allDirs[partsPath]||partsPath===".")break;allDirs[partsPath]=true;dirs.push(parts)}}}}dirs.sort((x,y)=>x.length-y.length);if(dirs.
    length){createDirectories(outPath,dirs,err=>{if(err)callback(err);else extractFiles(outPath,entryName,files,callback,0)})}else{extractFiles(outPath,entryName,files,callback,0)}}else{fs.stat(outPath,(err,stat)=>{if(stat&&stat.isDirectory()){extract(entry,path.join(outPath,path.basename(entry.name)),callback)}else{extract(
    entry,outPath,callback)}})}};this.close=function(callback){if(closed||!fd){closed=true;if(callback)callback()}else{closed=true;fs.close(fd,err=>{fd=null;if(callback)callback(err)})}};const originalEmit=events.EventEmitter.prototype.emit;this.emit=function(...args){if(!closed)return originalEmit.call(this,...args)}};StreamZip.
    debugLog=(...args)=>{if(StreamZip.debug)console.log(...args)};const inherits=function(ctor,superCtor){ctor.super_=superCtor;ctor.prototype=Object.create(superCtor.prototype,{constructor:{value:ctor,enumerable:false,writable:true,configurable:true}})};inherits(StreamZip,events.EventEmitter);const propZip=Symbol("zip");StreamZip.
    async=class StreamZipAsync extends events.EventEmitter{constructor(config){super();const zip=new StreamZip(config);zip.on("entry",entry=>this.emit("entry",entry));zip.on("extract",(entry,outPath)=>this.emit("extract",entry,outPath));this[propZip]=new Promise((resolve,reject)=>{zip.on("ready",()=>{zip.removeListener("er\
    ror",reject);resolve(zip)});zip.on("error",reject)})}get entriesCount(){return this[propZip].then(zip=>zip.entriesCount)}get comment(){return this[propZip].then(zip=>zip.comment)}async entry(name){const zip=await this[propZip];return zip.entry(name)}async entries(){const zip=await this[propZip];return zip.entries()}async stream(entry){
    const zip=await this[propZip];return new Promise((resolve,reject)=>{zip.stream(entry,(err,stm)=>{if(err)reject(err);else resolve(stm)})})}async entryData(entry){const stm=await this.stream(entry);return new Promise((resolve,reject)=>{const data=[];stm.on("data",chunk=>data.push(chunk));stm.on("end",()=>{resolve(Buffer.
    concat(data))});stm.on("error",err=>{stm.removeAllListeners("end");reject(err)})})}async extract(entry,outPath){const zip=await this[propZip];return new Promise((resolve,reject)=>{zip.extract(entry,outPath,(err,res)=>{if(err)reject(err);else resolve(res)})})}async close(){const zip=await this[propZip];return new Promise(
    (resolve,reject)=>{zip.close(err=>{if(err)reject(err);else/** @type {any} */(resolve)()})})}};class CentralDirectoryHeader{read(data){if(data.length!==consts.ENDHDR||data.readUInt32LE(0)!==consts.ENDSIG)throw new Error("Invalid central directory");this.volumeEntries=data.readUInt16LE(consts.ENDSUB);this.totalEntries=data.readUInt16LE(consts.
    ENDTOT);this.size=data.readUInt32LE(consts.ENDSIZ);this.offset=data.readUInt32LE(consts.ENDOFF);this.commentLength=data.readUInt16LE(consts.ENDCOM)}}class CentralDirectoryLoc64Header{read(data){if(data.length!==consts.ENDL64HDR||data.readUInt32LE(0)!==consts.ENDL64SIG)throw new Error("Invalid zip64 central directory lo\
    cator");this.headerOffset=readUInt64LE(data,consts.ENDSUB)}}class CentralDirectoryZip64Header{read(data){if(data.length!==consts.END64HDR||data.readUInt32LE(0)!==consts.END64SIG)throw new Error("Invalid central directory");this.volumeEntries=readUInt64LE(data,consts.END64SUB);this.totalEntries=readUInt64LE(data,consts.
    END64TOT);this.size=readUInt64LE(data,consts.END64SIZ);this.offset=readUInt64LE(data,consts.END64OFF)}}class ZipEntry{readHeader(data,offset){if(data.length<offset+consts.CENHDR||data.readUInt32LE(offset)!==consts.CENSIG)throw new Error("Invalid entry header");this.verMade=data.readUInt16LE(offset+consts.CENVEM);this.version=
    data.readUInt16LE(offset+consts.CENVER);this.flags=data.readUInt16LE(offset+consts.CENFLG);this.method=data.readUInt16LE(offset+consts.CENHOW);const timebytes=data.readUInt16LE(offset+consts.CENTIM);const datebytes=data.readUInt16LE(offset+consts.CENTIM+2);this.time=parseZipTime(timebytes,datebytes);this.crc=data.readUInt32LE(
    offset+consts.CENCRC);this.compressedSize=data.readUInt32LE(offset+consts.CENSIZ);this.size=data.readUInt32LE(offset+consts.CENLEN);this.fnameLen=data.readUInt16LE(offset+consts.CENNAM);this.extraLen=data.readUInt16LE(offset+consts.CENEXT);this.comLen=data.readUInt16LE(offset+consts.CENCOM);this.diskStart=data.readUInt16LE(
    offset+consts.CENDSK);this.inattr=data.readUInt16LE(offset+consts.CENATT);this.attr=data.readUInt32LE(offset+consts.CENATX);this.offset=data.readUInt32LE(offset+consts.CENOFF)}readDataHeader(data){if(data.readUInt32LE(0)!==consts.LOCSIG)throw new Error("Invalid local header");this.version=data.readUInt16LE(consts.LOCVER);
    this.flags=data.readUInt16LE(consts.LOCFLG);this.method=data.readUInt16LE(consts.LOCHOW);const timebytes=data.readUInt16LE(consts.LOCTIM);const datebytes=data.readUInt16LE(consts.LOCTIM+2);this.time=parseZipTime(timebytes,datebytes);this.crc=data.readUInt32LE(consts.LOCCRC)||this.crc;const compressedSize=data.readUInt32LE(
    consts.LOCSIZ);if(compressedSize&&compressedSize!==consts.EF_ZIP64_OR_32)this.compressedSize=compressedSize;const size=data.readUInt32LE(consts.LOCLEN);if(size&&size!==consts.EF_ZIP64_OR_32)this.size=size;this.fnameLen=data.readUInt16LE(consts.LOCNAM);this.extraLen=data.readUInt16LE(consts.LOCEXT)}read(data,offset,textDecoder){
    const nameData=data.slice(offset,offset+=this.fnameLen);this.name=textDecoder?textDecoder.decode(new Uint8Array(nameData)):nameData.toString("utf8");const lastChar=data[offset-1];this.isDirectory=lastChar===47||lastChar===92;if(this.extraLen){this.readExtra(data,offset);offset+=this.extraLen}this.comment=this.comLen?data.
    slice(offset,offset+this.comLen).toString():null}validateName(){if(/\\|^\w+:|^\/|(^|\/)\.\.(\/|$)/.test(this.name))throw new Error("Malicious entry: "+this.name)}readExtra(data,offset){let signature,size;const maxPos=offset+this.extraLen;while(offset<maxPos){signature=data.readUInt16LE(offset);offset+=2;size=data.readUInt16LE(
    offset);offset+=2;if(consts.ID_ZIP64===signature)this.parseZip64Extra(data,offset,size);offset+=size}}parseZip64Extra(data,offset,length){if(length>=8&&this.size===consts.EF_ZIP64_OR_32){this.size=readUInt64LE(data,offset);offset+=8;length-=8}if(length>=8&&this.compressedSize===consts.EF_ZIP64_OR_32){this.compressedSize=
    readUInt64LE(data,offset);offset+=8;length-=8}if(length>=8&&this.offset===consts.EF_ZIP64_OR_32){this.offset=readUInt64LE(data,offset);offset+=8;length-=8}if(length>=4&&this.diskStart===consts.EF_ZIP64_OR_16)this.diskStart=data.readUInt32LE(offset)}get encrypted(){return(this.flags&consts.FLG_ENTRY_ENC)===consts.FLG_ENTRY_ENC}get isFile(){
    return!this.isDirectory}}class FsRead{constructor(fd,buffer,offset,length,position,callback){this.fd=fd;this.buffer=buffer;this.offset=offset;this.length=length;this.position=position;this.callback=callback;this.bytesRead=0;this.waiting=false}read(sync){StreamZip.debugLog("read",this.position,this.bytesRead,this.length,
    this.offset);this.waiting=true;let err;if(sync){let bytesRead=0;try{bytesRead=fs.readSync(this.fd,this.buffer,this.offset+this.bytesRead,this.length-this.bytesRead,this.position+this.bytesRead)}catch(e){err=e}this.readCallback(sync,err,err?bytesRead:null)}else{fs.read(this.fd,this.buffer,this.offset+this.bytesRead,this.
    length-this.bytesRead,this.position+this.bytesRead,this.readCallback.bind(this,sync))}}readCallback(sync,err,bytesRead){if(typeof bytesRead==="number")this.bytesRead+=bytesRead;if(err||!bytesRead||this.bytesRead===this.length){this.waiting=false;return this.callback(err,this.bytesRead)}else{this.read(sync)}}}class FileWindowBuffer{constructor(fd){
    this.position=0;this.buffer=Buffer.alloc(0);this.fd=fd;this.fsOp=null}checkOp(){if(this.fsOp&&/** @type {any} */(this.fsOp).waiting)throw new Error("Operation in progress")}read(pos,length,callback){this.checkOp();if(this.buffer.length<length)this.buffer=Buffer.alloc(length);this.position=pos;this.fsOp=new FsRead(this.fd,this.buffer,0,length,
    this.position,callback).read()}expandLeft(length,callback){this.checkOp();this.buffer=Buffer.concat([Buffer.alloc(length),this.buffer]);this.position-=length;if(this.position<0)this.position=0;this.fsOp=new FsRead(this.fd,this.buffer,0,length,this.position,callback).read()}expandRight(length,callback){this.checkOp();const offset=this.
    buffer.length;this.buffer=Buffer.concat([this.buffer,Buffer.alloc(length)]);this.fsOp=new FsRead(this.fd,this.buffer,offset,length,this.position+offset,callback).read()}moveRight(length,callback,shift){this.checkOp();if(shift)this.buffer.copy(this.buffer,0,shift);else shift=0;this.position+=shift;this.fsOp=new FsRead(this.
    fd,this.buffer,this.buffer.length-shift,shift,this.position+this.buffer.length-shift,callback).read()}}class EntryDataReaderStream extends stream.Readable{constructor(fd,offset,length){super();this.fd=fd;this.offset=offset;this.length=length;this.pos=0;this.readCallback=this.readCallback.bind(this)}_read(n){const buffer=Buffer.
    alloc(Math.min(n,this.length-this.pos));if(buffer.length){fs.read(this.fd,buffer,0,buffer.length,this.offset+this.pos,this.readCallback)}else{this.push(null)}}readCallback(err,bytesRead,buffer){this.pos+=bytesRead;if(err){this.emit("error",err);this.push(null)}else if(!bytesRead){this.push(null)}else{if(bytesRead!==buffer.
    length)buffer=buffer.slice(0,bytesRead);this.push(buffer)}}}class EntryVerifyStream extends stream.Transform{constructor(baseStm,crc,size){super();this.verify=new CrcVerify(crc,size);baseStm.on("error",e=>{this.emit("error",e)})}_transform(data,encoding,callback){let err;try{this.verify.data(data)}catch(e){err=e}callback(
    err,data)}}class CrcVerify{constructor(crc,size){this.crc=crc;this.size=size;this.state={crc:~0,size:0}}data(data){const crcTable=CrcVerify.getCrcTable();let crc=this.state.crc,off=0,len=data.length;while(--len>=0)crc=crcTable[(crc^data[off++])&255]^crc>>>8;this.state.crc=crc;this.state.size+=data.length;if(this.state.
    size>=this.size){const buf=Buffer.alloc(4);buf.writeInt32LE(~this.state.crc&4294967295,0);crc=buf.readUInt32LE(0);if(crc!==this.crc)throw new Error("Invalid CRC");if(this.state.size!==this.size)throw new Error("Invalid size")}}static getCrcTable(){let crcTable=/** @type {any} */(CrcVerify).crcTable;if(!crcTable){/** @type {any} */(CrcVerify).crcTable=crcTable=
    [];const b=Buffer.alloc(4);for(let n=0;n<256;n++){let c=n;for(let k=8;--k>=0;){if((c&1)!==0)c=3988292384^c>>>1;else c=c>>>1}if(c<0){b.writeInt32LE(c,0);c=b.readUInt32LE(0)}crcTable[n]=c}}return crcTable}}const parseZipTime=function(timebytes,datebytes){const timebits=toBits(timebytes,16),datebits=toBits(datebytes,16);const mt={
    h:parseInt(timebits.slice(0,5).join(""),2),m:parseInt(timebits.slice(5,11).join(""),2),s:parseInt(timebits.slice(11,16).join(""),2)*2,Y:parseInt(datebits.slice(0,7).join(""),2)+1980,M:parseInt(datebits.slice(7,11).join(""),2),D:parseInt(datebits.slice(11,16).join(""),2)};const dt_str=[mt.Y,mt.M,mt.D].join("-")+" "+[mt.
    h,mt.m,mt.s].join(":")+" GMT+0";return new Date(dt_str).getTime()};const toBits=function(dec,size){let b=(dec>>>0).toString(2);while(b.length<size)b="0"+b;return b.split("")};const readUInt64LE=(buffer,offset)=>buffer.readUInt32LE(offset+4)*4294967296+buffer.readUInt32LE(offset);return StreamZip.async;
  })();

  /**
   * From [node-machine-id](https://github.com/automation-stack/node-machine-id/tree/f580f9f20668582e9087d92cea2511c972f2e6aa). MIT License.
   *
   * We plan to add vip/subscription verification in the future while keeping this project open source. So the verification is just "gentleman’s agreements" for normal users. Developers can still skip it, like the `shapez.io` game.
   */
  // prettier-ignore
  const machineId = () => {
    function isWindowsProcessMixedOrNativeArchitecture() {
      // detect if the node binary is the same arch as the Windows OS. // or if this is 32 bit node on 64 bit windows.
      if (process.platform !== "win32") return "";
      if (process.arch === "ia32" && process.env.hasOwnProperty("PROCESSOR_ARCHITEW6432")) return "mixed";
      return "native";
    }
    function expose(result) {
      switch (process.platform) {
        case "darwin":  return result.split("IOPlatformUUID")[1].split("\n")[0].replace(/\=|\s+|\"/gi, "").toLowerCase();
        case "win32":   return result.toString().split("REG_SZ")[1].replace(/\r+|\n+|\s+/gi, "").toLowerCase();
        case "linux":   return result.toString().replace(/\r+|\n+|\s+/gi, "").toLowerCase();
        default: throw new Error(`Unsupported platform: ${process.platform}`);
      }
    }
    let win32RegBinPath = { native: "%windir%\\System32", mixed: "%windir%\\sysnative\\cmd.exe /c %windir%\\System32" };
    let guid = {
      darwin: "ioreg -rd1 -c IOPlatformExpertDevice",
      win32: `${ win32RegBinPath[isWindowsProcessMixedOrNativeArchitecture()] }\\REG.exe ` + "QUERY HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography " + "/v MachineGuid",
      linux: "( cat /var/lib/dbus/machine-id /etc/machine-id 2> /dev/null || hostname ) | head -n 1 || :",
    };
    return /** @type {Promise<string>} */(new Promise((resolve,reject)=>import("child_process").then(m=>
      m.exec(guid[process.platform], {}, (err,stdout, stderr) => err ? reject(err) : resolve(expose(stdout.toString()))))
    ));
  };

  /**
   * Exclude the static `import` declaration matches `regexp`. Will be `// excluded: import xxx form ...`.
   * @param {string} src
   * @param {RegExp} regexp
   */
  const excludeImports = (src, regexp) => {
    let ret = "";
    let i = 0;
    while (true) {
      if (src.startsWith("import", i)) {
        let start = i;
        let end = start;
        loop1: while (true) {
          for (const quote of ["'", '"']) {
            if (src[start] === quote) {
              start++;
              end = src.indexOf(quote, start);
              break loop1;
            }
          }
          start++;
        }
        const moduleName = src.slice(start, end);
        const rangeEnd = end + "'".length;
        if (regexp.test(moduleName)) {
          const mark = "// excluded: ";
          ret += mark + src.slice(i, rangeEnd).replace(/\n/g, "\n" + mark);
          i = rangeEnd;
        } // else { do nothing }
      } else if (src.startsWith("//", i)) {
        // do nothing
      } else if (src.startsWith("/*", i)) {
        const rangeEnd = src.indexOf("*/", i) + "*/".length;
        ret += src.slice(i, rangeEnd);
        i = rangeEnd;
        continue;
      } else if (src[i] === "\n" || src[i] === "\t" || src[i] === " ") {
        ret += src[i];
        i++;
        continue;
      } else {
        break; // exit the imports
      }
      const nextI = src.indexOf("\n", i) + 1;
      ret += src.slice(i, nextI);
      i = nextI;
    }
    ret += src.slice(i);
    return ret;
  };

  /**
   * Solve path, like path.resolve, with support of home dir prefix `~/`.
   * ```js
   * // unix
   * assert(solvePath("~/a/", "b/../c/d", "//e") === process.env.HOME + "/a/c/d/e");
   * // windows
   * assert(solvePath("C:\\a\\", "b\\../c/\\d", "\\\\e") === "C:\\a\\c\\d\\e"); // auto slash convert
   * ```
   * @param {...string} parts
   */
  const solvePath = (...parts) => {
    if (parts[0].startsWith("~")) {
      parts[0] = process.env.HOME + parts[0].slice(1);
      // todo: windows process.env.USERPROFILE
    }
    // we do not use path.resolve directy because we want to control absolute or not
    if (!path.isAbsolute(parts[0])) {
      parts.unshift(process.cwd());
    }
    return path.join(...parts);
  };

  /**
   * Writing to stream, returns promise, auto care about the backpressure. Use [this](https://nodejs.org/api/stream.html#streamreadabletowebstreamreadable-options) when stable.
   * @param {stream.Writable} stream
   * @param {any} chunk
   */
  const streamWrite = (stream, chunk) => {
    const { resolve, reject, promise } = Promise.withResolvers();
    let resolveCount = 0;
    const resolveOnce = () => {
      resolveCount++;
      if (resolveCount === 2) /** @type {any} */ (resolve)();
    };
    const lowPressure = stream.write(chunk, (error) =>
      error ? reject(error) : resolveOnce()
    );
    if (lowPressure) {
      resolveOnce();
    } else {
      stream.once("drain", resolveOnce);
    }
    return promise;
  };

  /**
   * Get next unique id. Format = `1716887172_000123` = unix stamp + underscore + sequence number inside this second.
   * @returns {string}
   */
  const nextId = (() => {
    let lastT = Math.trunc(Date.now() / 1000);
    let lastV = 0;
    return () => {
      let curT = Math.trunc(Date.now() / 1000);
      let curV = 0;
      if (curT === lastT) {
        curV = ++lastV;
      } else {
        lastV = 0;
      }
      lastT = curT;
      return curT + "_" + (curV + "").padStart(6, "0");
    };
  })();

  /**
   * Like `chmod -R 777 ./dir` but only apply on files, not dir.
   * @param {string} dir
   */
  const chmod777 = async (dir) => {
    for (const v of await fsp.readdir(dir, {
      withFileTypes: true,
      recursive: true,
    })) {
      if (!v.isFile()) continue;
      await fsp.chmod(solvePath(v.parentPath, v.name), 0o777); // https://stackoverflow.com/a/20769157
      // todo: what about windows?
    }
  };

  /**
   * @param {RunActionRequest["entries"]} opts
   * @returns {Promise<any>}
   */
  const genEntries = async (opts) => {
    if (opts.kind === "common-files") {
      if (opts.entries) {
        assert(false, "todo");
      }
      const entries = [];
      const inputDir = solvePath(opts.inputDir);
      const outputDir = solvePath(opts.outputDir);
      for (const v of await fsp.readdir(inputDir, {
        withFileTypes: true,
        recursive: true,
      })) {
        const input = solvePath(v.parentPath, v.name);
        let output = path.relative(inputDir, input);
        if (opts.outputExtension) {
          const extname = path.extname(input); // includes the dot char
          if (extname) {
            output = output.slice(0, output.length - extname.length);
          }
          output += "." + opts.outputExtension;
        }
        output = solvePath(outputDir, output);
        entries.push({
          input: { main: [input] },
          output: { main: [output] },
        });
      }
      return entries;
    }
    assert(false, "todo");
  };

  const server = http.createServer(async (_, r) => {
    r.setHeader("Cache-Control", "no-store");

    if (r.req.url === "/") {
      r.setHeader("Content-Type", "text/html; charset=utf-8");
      r.writeHead(200); // agreement: don't use chained call like r.writeHead(200).end("whatever")
      r.end(pageHtml(i18n, config.locale)); // agreement: use vanilla html+css+js, esm, @ts-check, jsdoc, get rid of ts transpile, node 22 added built-in ts but not at browser in the foreseeable future
      return;
    }

    if (r.req.url === "/index.js") {
      const buffer = await fsp.readFile(import.meta.filename);
      const response = excludeImports(buffer.toString(), /^node:/);
      r.setHeader("Content-Type", "text/javascript; charset=utf-8");
      r.writeHead(200);
      r.end(response);
      return;
    }

    if (r.req.url === "/favicon.ico") {
      r.setHeader("Content-Type", "image/png");
      r.writeHead(200);
      r.end();
      return;
    }

    if (r.req.url === "/install-extension") {
      const request = /** @type {InstallExtensionRequest} */ (
        await readReq(r.req)
      );
      let finished = 0;
      let amount = 0;
      const abortController = new AbortController();
      let tempStreams = /** @type {Set<fs.WriteStream>} */ (new Set());
      let tempPaths = /** @type {Set<string>} */ (new Set());

      const promise = (async () => {
        const indexJsResponse = await fetch(request.url, {
          redirect: "follow",
          signal: abortController.signal,
        });
        if (!indexJsResponse.body) {
          throw new Error("response.body is null, url = " + request.url);
        }
        amount += parseInt(
          indexJsResponse.headers.get("Content-Length") || "0"
        );
        // for await (const chunk of response.body) downloaded += chunk.length;
        const indexJsTempPath = solvePath(PATH_CACHE, nextId() + ".js");
        tempPaths.add(indexJsTempPath);
        const indexJsTempStream = fs.createWriteStream(indexJsTempPath);
        tempStreams.add(indexJsTempStream);
        for await (const chunk of indexJsResponse.body) {
          finished += chunk.length;
          await streamWrite(indexJsTempStream, chunk);
        }
        await new Promise((resolve) => indexJsTempStream.end(resolve)); // use .end() instead of .close() https://github.com/nodejs/node/issues/2006
        const extension = /** @type {Extension} */ (
          (await import(indexJsTempPath)).default
        );
        const extensionDir = solvePath(
          PATH_EXTENSIONS,
          extension.id + "_" + extension.version
        );
        tempPaths.add(extensionDir);
        await fsp.rm(extensionDir, { recursive: true, force: true });
        await fsp.mkdir(extensionDir, { recursive: true });
        await fsp.rename(indexJsTempPath, solvePath(extensionDir, "index.js"));
        // const tasks = []; // TODO: parallel
        for (const asset of extension.assets) {
          if (!asset.platforms.includes(CURRENT_PLATFORM)) {
            continue;
          }
          const assetResponse = await fetch(asset.url, {
            redirect: "follow",
            signal: abortController.signal,
          });
          if (!assetResponse.body) {
            throw new Error("response.body is null, url = " + asset.url);
          }
          amount += parseInt(
            assetResponse.headers.get("Content-Length") || "0"
          );
          const assetExtName = false
            ? assert(false)
            : asset.kind === "raw"
            ? "raw"
            : asset.kind === "zip"
            ? "zip"
            : assert(false, "unsupported asset kind");
          const assetTempPath = solvePath(
            PATH_CACHE,
            nextId() + "." + assetExtName
          );
          tempPaths.add(assetTempPath);
          const assetTempStream = fs.createWriteStream(assetTempPath);
          tempStreams.add(assetTempStream);
          for await (const chunk of assetResponse.body) {
            finished += chunk.length;
            await streamWrite(assetTempStream, chunk);
          }
          await new Promise((resolve) => assetTempStream.end(resolve));
          if (asset.kind === "zip") {
            const zip = new Zip({ file: assetTempPath });
            await zip.extract(null, solvePath(extensionDir, asset.path));
            await zip.close();
            await fsp.rm(assetTempPath);
          } else if (asset.kind === "raw") {
            await fsp.rename(
              assetTempPath,
              solvePath(extensionDir, asset.path)
            );
          } else {
            assert(false, "unsupported asset kind");
          }
          await chmod777(extensionDir);
        }
      })();

      promise.catch(async () => {
        abortController.abort();
        // then delete the temporary files here
        // 先关 stream 再删文件
        for (const v of tempStreams) {
          await new Promise((resolve) => v.end(resolve)); // 用 await 等一下，慢一些但是稳妥
        }
        for (const v of tempPaths) {
          await fsp.rm(v, { force: true, recursive: true }); // 用 await 等一下，慢一些但是稳妥
        }
      });

      // 不支持cancel，但是保证别的不出错？比如出错了自动删除。因为vscode也不支持cancel
      // https://stackoverflow.com/a/49771109
      // https://developer.mozilla.org/zh-CN/docs/Web/API/Server-sent_events/Using_server-sent_events

      installExtensionControllers.set(nextId(), {
        title: request.title,
        progress: () => ({ download: { finished, amount } }),
        promise,
      });

      r.end();
      return;
    }

    if (r.req.url === "/remove-extension") {
      const request = /** @type {RemoveExtensionRequest} */ (
        await readReq(r.req)
      );
      const extensionDir = solvePath(
        PATH_EXTENSIONS,
        request.id + "_" + request.version
      );
      await fsp.rm(extensionDir, { recursive: true, force: true });
      r.end();
      return;
    }

    if (r.req.url === "/list-extensions") {
      /** @type {ListExtensionsResponse} */
      const response = [];
      for (const entry of await fsp.readdir(PATH_EXTENSIONS)) {
        const extensionIndexJsPath = solvePath(
          PATH_EXTENSIONS,
          entry,
          "index.js"
        );
        const extension = /** @type {Extension} */ (
          (await import(extensionIndexJsPath)).default
        );
        assert(entry === extension.id + "_" + extension.version);
        response.push({
          id: extension.id,
          version: extension.version,
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
      r.setHeader("Content-Type", "application/json; charset=utf-8");
      r.writeHead(200);
      r.end(JSON.stringify(response));
      return;
    }

    if (r.req.url?.startsWith("/extensions/")) {
      const relative = r.req.url.slice("/extensions/".length);
      const path = solvePath(PATH_EXTENSIONS, relative);
      if (r.req.url.endsWith("/index.js")) {
        const buffer = await fsp.readFile(path);
        const response = excludeImports(buffer.toString(), /^node:/);
        r.setHeader("Content-Type", "text/javascript; charset=utf-8");
        r.writeHead(200);
        r.end(response);
      } else {
        assert(false, "todo"); // todo: mime guess and more?
      }
      return;
    }

    if (r.req.url === "/run-action") {
      const request = /** @type {RunActionRequest} */ (await readReq(r.req));
      const extensionIndexJsPath = solvePath(
        PATH_EXTENSIONS,
        request.extensionId + "_" + request.extensionVersion,
        "index.js"
      );
      const extension = /** @type {Extension} */ (
        (await import(extensionIndexJsPath)).default
      );
      const action = extension.actions.find(
        (action) => action.id === request.actionId
      );
      assert(action !== undefined, "action not found");
      const entries = await genEntries(request.entries);
      const amount = entries.length;
      let finished = 0;
      const runningControllers = /** @type {Set<ActionExecuteController>} */ (
        new Set()
      );
      const promise = Promise.all(
        [...Array(request.parallel)].map((_, i) =>
          (async () => {
            for (let entry; (entry = entries.shift()); ) {
              // console.log({ entry, req });
              const controller = action.execute(request.profile, entry);
              runningControllers.add(controller);
              await sleep(100);
              await controller.promise;
              runningControllers.delete(controller);
              finished += 1;
            }
          })()
        )
      );
      promise.catch(() => {}); // avoid UnhandledPromiseRejection
      const beginTime = Math.trunc(Date.now() / 1000);
      runActionControllers.set(nextId(), {
        title: request.title,
        timing: () => {
          return {
            begin: beginTime,
            expectedEnd: beginTime + 1000,
          };
        },
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
        promise,
      });
      r.end();
      return;
    }

    if (r.req.url === "/stop-action") {
      assert(false, "todo");
      r.end();
      return;
    }

    if (r.req.url === "/get-status") {
      r.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      r.writeHead(200);
      /** @param {GetStatusResponseEvent} e */
      const send = (e) => r.write(`data: ${JSON.stringify(e)}\n\n`);
      const preventedIds = /** @type {Set<string>} */ (new Set());
      const waitingIds = /** @type {Set<string>} */ (new Set());
      while (!r.closed) {
        for (const [id, controller] of runActionControllers) {
          if (preventedIds.has(id)) {
            continue; // just skip if it's in `preventedIds`, like exited `controller`s
          }
          send({
            kind: "run-action-progress",
            id,
            title: controller.title,
            timing: controller.timing(),
            progress: controller.progress(),
          });
          if (!waitingIds.has(id)) {
            waitingIds.add(id);
            let promise = controller.promise; // if not in `waitingIds`, create new promises to `wait` this `controller`
            promise = promise.then(() => {
              send({ kind: "run-action-success", id });
            });
            promise = promise.catch((error) => {
              send({ kind: "run-action-error", id, error });
            });
            promise = promise.finally(() => {
              preventedIds.add(id); // now the `controller` is exited, so we add it to `preventedIds` to skip following query, but this will not interrupt the `wait.then`, `wait.catch` above, so every `/get-status` request will receive at lease once `run-action-success` or `run-action-error`
            });
          }
        }
        for (const [id, controller] of installExtensionControllers) {
          if (preventedIds.has(id)) {
            continue;
          }
          send({
            kind: "install-extension-progress",
            id,
            title: controller.title,
            progress: controller.progress(),
          });
          if (!waitingIds.has(id)) {
            waitingIds.add(id);
            let promise = controller.promise;
            promise = promise.then(() => {
              send({ kind: "install-extension-success", id });
            });
            promise = promise.catch((error) => {
              send({ kind: "install-extension-error", id, error });
            });
            promise = promise.finally(() => {
              preventedIds.add(id);
            });
          }
        }
        await sleep(1000); // loop interval, not SSE sending interval
      }
      r.end();
      return;
    }

    if (r.req.url === "/quit") {
      r.writeHead(200);
      r.end();
      await beforeQuit();
      process.exit();
      return;
    }

    if (r.req.url?.startsWith("/static/")) {
      const relative = r.req.url.slice("/static/".length);
      const path = solvePath(relative);
      const fsStream = fs.createReadStream(path).on("error", (error) => {
        r.writeHead(400); // this endpoint is just used for testing, so visitor should ensure the url is valid
        r.end(JSON.stringify(error)); // listen and write errors into response instead of panic
      });
      fsStream.pipe(r);
      return;
    }

    r.writeHead(404);
    r.end();
  });

  server.on("listening", () => {
    serverPort.resolve(config.serverPort);
    console.log(server.address());
    // todo: save into config store
  });
  server.on("error", (error) => {
    config.serverPort++;
    console.log(
      "retrying next port ",
      config.serverPort,
      " , server error = " + JSON.stringify(error)
    );
    setTimeout(() => {
      server.close();
      server.listen(config.serverPort, "127.0.0.1");
    });
  });
  server.listen(config.serverPort, "127.0.0.1");
};
if (globalThis.document) {
  pageMain();
} else {
  serverMain(); // wrap it in function, avoid top-level await, see https://github.com/electron/electron/issues/40719
}

// /** @type {0} */ (process.exit());
// type Boxify<T> = { [K in keyof T]: Box<T> };

/*
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

// https://github.com/XIU2/UserScript/blob/master/GithubEnhanced-High-Speed-Download.user.js#L40
// https://github.com/clevert-app/clevert/releases/download/asset_zcodecs_12.0.0_10664137139/linux-x64.zip

// http://127.0.0.1:9439/extensions/zcodecs/index.js
// /home/kkocdko/misc/code/clevert/temp/_test_res/i
