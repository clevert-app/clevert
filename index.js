// @ts-check
/// <reference lib="esnext" />
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import child_process from "node:child_process";

/**
@typedef {
  "linux-x64" | "mac-arm64" | "win-x64"
} Platform We don't want new platforms currently. In the future, it should be ` "linux-x64" | "linux-arm64" | "mac-x64" | "mac-arm64" | "win-x64" | "win-arm64" `.
@typedef {{
  platforms: Platform[];
  url: string;
  kind: "bin" | "zip" | "tar" | "tar-gzip";
  path: string;
  stripPath?: boolean;
}} Asset For `kind:"bin"`, the `path` is file path, for others it's directory path.
@typedef {{
  root: HTMLElement;
  profile: () => any;
  entries?: () => any[];
}} ActionUiController The `entries()` will be used if action kind is `custom`.
@typedef {{
  progress: () => number;
  stop: () => void;
  promise: Promise<void>;
}} ActionExecuteController Named "controller" because it looks like `AbortController`.
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
  kind: "custom";
  entries: any[];
}} EntriesCustom Just `entries` itself, may useful for `yt-dlp` and other scenario that a file comes from nowhere.
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
  entries: EntriesCustom | EntriesCommonFiles | EntriesNumberSequence;
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
      --bg: #faf9fd;
      --bg2: #82a3ee1a;
      --bg3: #82a3ee2f;
      --bg4: #82a3ee44; /* dae2f9 = faf9fd*(1-(0x44/0xff)) + 7492e8*(0x44/0xff) , from https://material.angular.io/components/button-toggle/examples */
      --bg5: #82a3ee59;
      --bg6: #8597c666; /* cbd2e7 */
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
  :focus {
    outline: none; /* disable all outlines as many sites do, users who need key nav will use extensions themselves */
  }
  /* agreement: apply style to multi elements by css selector, not by util class */
  button,
  #home li {
    position: relative;
    padding: 8px 12px;
    font-size: 14px;
    line-height: 1;
    color: var(--fg);
    background: var(--bg4);
    border: none;
    border-radius: 6px;
    transition: background-color 0.2s;
  }
  #home li {
    background: var(--bg3);
  }
  #home > button.off:not(:hover, :active),
  header > button.off:not(:hover, :active) {
    background: #0000;
  }
  button:hover,
  #home li:hover {
    background: var(--bg5);
  }
  #home li:hover {
    background: var(--bg4);
  }
  button:active,
  #home li:active {
    background: var(--bg6);
    transition: background-color 0s;
  }
  #home li:active {
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
    transition: background-color 0.2s;
  }
  input[type="text"]:focus,
  input[type="number"]:focus,
  input:not([type]):focus {
    background: var(--bg5);
  }
  body {
    height: 100vh;
    margin: 0;
    font-family: system-ui;
    font-size: 14px;
    color: var(--fg);
    background: var(--bg);
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
  #home li {
    position: relative;
    padding: 10px 14px 12px;
    margin: 0;
    list-style: none;
  }
  /* todo: animation for removing extension */
  #home li > b {
    font-size: 17px;
    font-weight: normal;
    line-height: 1;
  }
  #home li > sub {
    margin-left: 8px;
    vertical-align: baseline;
  }
  #home li > p {
    margin: 8px 0 0;
    line-height: 1;
  }
  #home li > button {
    position: absolute;
    top: 6px;
    right: 6px;
    padding: 8px;
  }
  #home li > button:not(:hover, :active) {
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
    margin: 8px;
    font-size: 16px;
    text-align: center;
    content: "${i18n.tasksEmpty()}";
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
  header > button.to-action:empty {
    visibility: hidden;
  }
  /* todo: about hover, https://stackoverflow.com/a/30303898 */
  /* todo: use box-shadow instead of background on hover? */
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
      var /** @type {never} */ _ = e; // exhaustiveness
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
        const $choice = document.createElement("li");
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
          const $choice = document.createElement("li");
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
            $toAction.textContent = "〉" + profile.name;
            $toAction.click();
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
    } else if (action.kind === "custom") {
      getEntries = () => {
        assert(controller.entries);
        /** @type {EntriesCustom} */
        const entries = {
          kind: "custom",
          entries: controller.entries(),
        };
        return entries;
      };
    } else {
      assert(false, "todo");
    }
    const controller = action.ui(profile);
    assert(controller.root.localName === "form");
    assert(controller.root.classList.contains("root"));
    $action.appendChild(controller.root);
    new MutationObserver((mutations, observer) => {
      if (controller.root.parentNode !== null) return;
      observer.disconnect();
      controller.root.dispatchEvent(new CustomEvent("post-remove"));
    }).observe($action, { childList: true });
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
      $toAction.textContent = "";
      $toTasks.click();
    };
  };

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
    $toAction.classList.add("off");
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
    $toAction.classList.add("off");
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
    $toAction.classList.add("off");
    $tasks.classList.add("off");
    $home.classList.add("off");
    $action.classList.add("off");
    $market.classList.remove("off");
  };
  const $toAction = document.createElement("button");
  $top.appendChild($toAction);
  $toAction.classList.add("to-action");
  $toAction.classList.add("off");
  $toAction.textContent = "";
  $toAction.onclick = () => {
    if ($toAction.textContent === "") {
      return;
    }
    $toTasks.classList.add("off");
    $toHome.classList.add("off");
    $toMarket.classList.add("off");
    $toAction.classList.remove("off");
    $tasks.classList.add("off");
    $home.classList.add("off");
    $action.classList.remove("off");
    $market.classList.add("off");
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
  await fs.promises.mkdir(PATH_EXTENSIONS, { recursive: true });
  await fs.promises.mkdir(PATH_CACHE, { recursive: true });

  /**
   * Open a json file and returns mapping object. Like [valtio](https://github.com/pmndrs/valtio).
   * @param {fs.PathLike} path
   */
  const openJsonMmap = async (path) => {
    if (!fs.existsSync(path)) fs.writeFileSync(path, "{}"); // create if not exist
    const file = await fs.promises.open(path, "r+"); // we do not care about the `.close`
    let locked = false;
    const syncToFile = debounce(async () => {
      if (locked) return syncToFile(); // avoid race, see docs of `.write`
      locked = true;
      const data = JSON.stringify(ret, null, 2) + "\n";
      const { bytesWritten } = await file.write(data, 0); // do not use `.writeFile`
      await file.truncate(bytesWritten); // truncate after write, do not reverse
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
   * Thanks to [node-machine-id](https://github.com/automation-stack/node-machine-id/tree/f580f9f20668582e9087d92cea2511c972f2e6aa). MIT License.
   */
  const machineId = () => {
    if (process.platform === "linux") {
      return fs.readFileSync("/etc/machine-id", { encoding: "utf-8" }).trim(); // different platform have different format, but it's ok
    } else if (process.platform === "darwin") {
      const c = String.raw`ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID`;
      return child_process.execSync(c, { encoding: "utf-8" }).split('"')[3];
    } else if (process.platform === "win32") {
      const c = String.raw`reg query HKLM\SOFTWARE\Microsoft\Cryptography /v MachineGuid`;
      return child_process.execSync(c, { encoding: "utf-8" }).split(/\s/)[16];
    } else assert(false, "unsupported platform");
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
   * solvePath("~/a/", "b/../c/d", "//e") === process.env.HOME + "/a/c/d/e";
   * // windows
   * solvePath("C:\\a\\", "b\\../c/\\d", "\\\\e") === "C:\\a\\c\\d\\e"; // auto slash convert
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
   * Download smartly.
   *
   * This function assumes the file stream is closed before return even if errors occur.
   * @param {string | URL} url
   * @param {fs.PathLike} path
   * @param {AbortSignal} signal
   * @param {(amountSize: number) => void} onStart
   * @param {(chunkSize: number) => void} onChunk
   */
  const download = async (url, path, signal, onStart, onChunk) => {
    // todo: smart mirror switching
    const response = await fetch(url, { redirect: "follow", signal });
    if (!response.body) throw new Error("body is null, url = " + url);
    onStart(parseInt(response.headers.get("Content-Length") || "0"));
    const fileStream = fs.createWriteStream(path, { signal });
    try {
      for await (const chunk of response.body) {
        onChunk(chunk.byteLength);
        if (fileStream.errored) throw fileStream.errored;
        if (fileStream.write(chunk)) continue;
        await new Promise((resolve) => fileStream.once("drain", resolve));
      }
    } finally {
      await new Promise((resolve) => fileStream.close(resolve));
    }
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
    for (const v of await fs.promises.readdir(dir, {
      withFileTypes: true,
      recursive: true,
    })) {
      if (!v.isFile()) continue;
      await fs.promises.chmod(solvePath(v.parentPath, v.name), 0o777); // https://stackoverflow.com/a/20769157
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
      for (const v of await fs.promises.readdir(inputDir, {
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
      const buffer = await fs.promises.readFile(import.meta.filename);
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
      const tempPaths = /** @type {Set<string>} */ new Set();
      const promise = (async () => {
        const indexJsTemp = solvePath(PATH_CACHE, nextId() + ".js");
        tempPaths.add(indexJsTemp);
        await download(
          request.url,
          indexJsTemp,
          abortController.signal,
          (amountSize) => (amount += amountSize),
          (chunkSize) => (finished += chunkSize)
        );
        const extension = /** @type {Extension} */ (
          (await import(indexJsTemp)).default
        );
        const extensionDir = solvePath(
          PATH_EXTENSIONS,
          extension.id + "_" + extension.version
        );
        tempPaths.add(extensionDir);
        await fs.promises.rm(extensionDir, { recursive: true, force: true });
        await fs.promises.mkdir(extensionDir, { recursive: true });
        await fs.promises.rename(
          indexJsTemp,
          solvePath(extensionDir, "index.js")
        );
        for (const asset of extension.assets) {
          if (!asset.platforms.includes(CURRENT_PLATFORM)) {
            continue;
          }
          let suffix; // must have a valid extension name, so tar can detect it
          if (asset.kind === "bin") suffix = ".bin";
          else if (asset.kind === "zip") suffix = ".zip";
          else if (asset.kind === "tar") suffix = ".tar";
          else if (asset.kind === "tar-gzip") suffix = ".tar.gz";
          else var /** @type {never} */ _ = asset.kind; // exhaustiveness
          assert(suffix);
          const assetTemp = solvePath(PATH_CACHE, nextId() + suffix);
          tempPaths.add(assetTemp);
          await download(
            asset.url,
            assetTemp,
            abortController.signal,
            (amountSize) => (amount += amountSize),
            (chunkSize) => (finished += chunkSize)
          );
          if (asset.kind === "bin") {
            await fs.promises.rename(
              assetTemp,
              solvePath(extensionDir, asset.path)
            );
          } else if (
            asset.kind === "zip" ||
            asset.kind === "tar" ||
            asset.kind === "tar-gzip"
          ) {
            // needs either "bsdtar" (windows and mac) or "gnutar + unzip" (most of linux distros)
            const extractDir = solvePath(extensionDir, asset.path);
            await fs.promises.mkdir(extractDir, { recursive: true });
            const { promise, resolve, reject } = Promise.withResolvers();
            child_process.execFile(
              "tar",
              [
                "-xf",
                assetTemp,
                "-C",
                extractDir,
                ...(asset.stripPath ? ["--strip-components=1"] : []),
              ],
              { env: { XZ_OPT: "-T0" } },
              (error) => {
                if (!error) return resolve(error);
                if (asset.kind !== "zip") return reject(error);
                assert(!asset.stripPath, "todo"); // todo: simulate tar --strip-components while using unzip
                child_process.execFile(
                  "unzip",
                  [assetTemp, "-d", extractDir],
                  (error) => (error ? reject(error) : resolve(error))
                );
              }
            );
            await promise;
            await fs.promises.rm(assetTemp, { force: true });
          } else {
            var /** @type {never} */ _ = asset.kind; // exhaustiveness
          }

          await chmod777(extensionDir);
        }
      })();

      promise.catch(async () => {
        // todo: needs fix, if user close app during installing. however this seems fine because everytime after launch the cache dir is cleaned, and what about the extensionDir?
        abortController.abort();
        for (const v of tempPaths) {
          await fs.promises.rm(v, { force: true, recursive: true });
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
      await fs.promises.rm(extensionDir, { recursive: true, force: true });
      r.end();
      return;
    }

    if (r.req.url === "/list-extensions") {
      /** @type {ListExtensionsResponse} */
      const response = [];
      for (const entry of await fs.promises.readdir(PATH_EXTENSIONS)) {
        const extensionIndexJs = solvePath(PATH_EXTENSIONS, entry, "index.js");
        const extension = /** @type {Extension} */ (
          (await import(extensionIndexJs)).default
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
        const buffer = await fs.promises.readFile(path);
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
      const extensionIndexJs = solvePath(
        PATH_EXTENSIONS,
        request.extensionId + "_" + request.extensionVersion,
        "index.js"
      );
      const extension = /** @type {Extension} */ (
        (await import(extensionIndexJs)).default
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
      const fileStream = fs.createReadStream(path).on("error", (error) => {
        r.writeHead(400); // this endpoint is just used for testing, so visitor should ensure the url is valid
        r.end(JSON.stringify(error)); // listen and write errors into response instead of panic
      });
      fileStream.pipe(r);
      return;
    }

    r.writeHead(404);
    r.end();
  });

  server.on("listening", () => {
    serverPort.resolve(config.serverPort);
    console.log(server.address());
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
  options: () => ({ some: 1 }),
});
void process.exit();
type Boxify<T> = { [K in keyof T]: Box<T> };
ln extensions/zcodecs/index.js temp/extensions/zcodecs_0.1.0/index.js
/home/kkocdko/misc/code/clevert/temp/_test_res/i
https://github.com/XIU2/UserScript/blob/master/GithubEnhanced-High-Speed-Download.user.js#L40
https://github.com/clevert-app/clevert/releases/download/asset_zcodecs_12.0.0_10664137139/linux-x64.zip
*/
