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
  profile: () => any; // agreement: use function instead of getter/setter
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
@typedef {(
  Omit<Extension, "actions"> & { actions: Omit<Action, "ui" | "execute">[] }
)[]} ListExtensionsResponse
@typedef {{
  kind: "number-sequence";
  begin: number;
  end: number;
}} EntriesNumberSequence May be useful later.
@typedef {{
  kind: "common-files";
  mode: "dir";
  inputDir: string;
  outputDir: string;
  outputSuffix: string;
  outputExtension: string;
} | {
  kind: "common-files";
  mode: "files";
  inplace: boolean;
  entries: {
    input: string,
    output?: string;
  }[];
}} EntriesCommonFiles The most common.
@typedef {{
  kind: "custom";
  entries: any[];
}} EntriesCustom Just `entries` itself, may useful for `yt-dlp` and other scenario that a file comes from nowhere.
@typedef {{
  begin: number;
  end?: number;
}} RunActionTime All with `seconds` unit. Float number.
@typedef {{
  finished: number;
  running: number;
  amount: number;
}} RunActionProgress The `running` property may be float.
@typedef {{
  title: string;
  time: RunActionTime;
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
  finished: number;
  amount: number;
}} InstallExtensionProgress Assets download progress in bytes.
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
@typedef {
  Electron.OpenDialogOptions
} ShowOpenDialogRequest
@typedef {
  Electron.OpenDialogReturnValue
} ShowOpenDialogResponse
@typedef {
  Electron.SaveDialogOptions
} ShowSaveDialogRequest
@typedef {
  Electron.SaveDialogReturnValue
} ShowSaveDialogResponse
@typedef {{
  path?: string;
}} ListDirRequest
@typedef {{
  name: string;
  kind: "file" | "dir";
}[]} ListDirResponse
@typedef {{
  kind: "run-action-progress";
  id: string;
  title: string;
  time: RunActionTime;
  progress: RunActionProgress;
  pending: boolean; // the "pending: true" contains "paused"
  error?: any; // the "error" contains "stopped"
} | {
  kind: "install-extension-progress";
  id: string;
  title: string;
  progress: InstallExtensionProgress;
  pending: boolean;
  error?: any;
}} GetStatusResponseEvent
@typedef {{
  assert: typeof assert;
  debounce: typeof debounce;
  sleep: typeof sleep;
  locale: keyof i18nRes;
}} ClevertUtils Will be passed to `globalThis.clevertUtils`.
@typedef {{
  windowWidth: number;
  windowHeight: number;
  windowMaximized: boolean;
  locale: keyof i18nRes;
  mirrorsEnabled: boolean;
  serverPort: number;
}} Config
*/

const i18nRes = (() => {
  const enus = {
    nativeName: () => "English", // https://github.com/chromium/chromium/raw/refs/tags/133.0.6920.1/third_party/google-closure-library/closure/goog/locale/nativenameconstants.js
    title: () => "Clevert - Universal file converter platform",
    dropHint: () => "Drop here",
    toTasks: () => "Tasks",
    toHome: () => "Home",
    toMarket: () => "Market",
    toSettings: () => "Settings",
    tasksEmpty: () => "No tasks",
    tasksPause: () => "Pause",
    tasksResume: () => "Resume",
    tasksStop: () => "Stop",
    homeEmpty: () => "No items",
    homeShowRecent: () => "Recent",
    homeShowByName: () => "By Name",
    homeShowExtensions: () => "Extensions",
    homeShowProfiles: () => "Profiles",
    homeMenuShare: () => "Share",
    homeMenuDelete: () => "Delete",
    homeMenuInfo: () => "Info",
    homeMoreOperations: () => "More operations",
    entriesModeDir: () => "Directory mode",
    entriesModeFiles: () => "Files mode",
    entriesInputDir: () => "Input directory",
    entriesOutputDir: () => "Output directory",
    entriesOutputSuffix: () => "Output suffix",
    entriesOutputExtension: () => "Output extension",
    settingsMirrorsTitle: () => "Mirrors",
    settingsMirrorsDescription: () => "May speed up downloads in some region.",
    settingsMirrorsSwitch: () => "Control whether mirrors are enabled or not.", // agreement: the wording and syntax here mimics vscode's editor.guides.bracketPairs
    settingsLanguagesTitle: () => "Languages",
    settingsLanguagesDescription: () => "Language in Clevert and extensions.",
    settingsAboutTitle: () => "About",
    settingsAboutDescription: () => "Universal file converter platform.",
    settingsAboutSource: () => "Source Code (GitHub)",
    settingsAboutSponsorsAlipay: () => "Sponsor via Alipay",
    settingsAboutSponsorsGitHub: () => "Sponsor via GitHub Sponsors",
  };
  /** @type {Readonly<typeof enus>} */
  const zhcn = {
    nativeName: () => "中文（简体）",
    title: () => "Clevert - 通用的文件转换平台",
    dropHint: () => "拖放到这里",
    toTasks: () => "任务",
    toHome: () => "主页",
    toMarket: () => "商店",
    toSettings: () => "设置",
    tasksEmpty: () => "没有任务",
    tasksPause: () => "暂停",
    tasksResume: () => "恢复",
    tasksStop: () => "停止",
    homeEmpty: () => "没有项目",
    homeShowRecent: () => "最近",
    homeShowByName: () => "按名称",
    homeShowExtensions: () => "扩展",
    homeShowProfiles: () => "配置",
    homeMenuShare: () => "分享",
    homeMenuDelete: () => "删除",
    homeMenuInfo: () => "详细信息",
    homeMoreOperations: () => "更多操作",
    entriesModeDir: () => "文件夹模式",
    entriesModeFiles: () => "文件模式",
    entriesInputDir: () => "输入文件夹",
    entriesOutputDir: () => "输出文件夹",
    entriesOutputSuffix: () => "输出文件名后缀",
    entriesOutputExtension: () => "输出扩展名",
    settingsMirrorsTitle: () => "镜像",
    settingsMirrorsDescription: () => "可能在某些地区提升下载速度。",
    settingsMirrorsSwitch: () => "控制是否启用镜像。",
    settingsLanguagesTitle: () => "语言",
    settingsLanguagesDescription: () => "在 Clevert 和扩展中使用的语言。",
    settingsAboutTitle: () => "关于",
    settingsAboutDescription: () => "通用的文件转换平台。",
    settingsAboutSource: () => "源代码 (GitHub)",
    settingsAboutSponsorsAlipay: () => "使用 支付宝 赞助",
    settingsAboutSponsorsGitHub: () => "使用 GitHub Sponsors 赞助",
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
  /* agreement: sort css properties by https://kkocdko.site/toy/sortcss (stylelint-config-recess-order) */
  /* initial theme, contains all vars */
  @media (min-width: 1px) {
    body {
      --bg: #faf9fd;
      --bg2: #f1f0f4;
      --bg3: #d0e3ff;
      --bg4: #c6d8fa; /* https://material.angular.io/components/button-toggle/examples */
      --bg5: #bdd2f6;
      --bg6: #a6c3ee;
      --bg7: #9dabc6;
      --fg: #000;
    }
  }
  /* initial theme for dark mode */
  @media (prefers-color-scheme: dark) {
    body {
      --bg: #000;
      --bg2: #222222;
      --bg3: #333333;
      --bg4: #444444;
      --bg5: #555555;
      --bg6: #666666;
      --bg7: #aaaaaa;
      --fg: #fff;
    }
  }
  /* todo: custom themes like "html.theme-abc { body { } }" */
  @media print and (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      transition-duration: 0s !important;
      animation-duration: 0s !important;
      animation-iteration-count: 1 !important;
    }
  }
  * {
    position: relative;
  }
  :focus {
    outline: none; /* disable all outlines as many sites do, users who need key nav will use extensions themselves */
  }
  /* agreement: most extensions should use these modified global styles, but can still use shadow dom to create new scope */
  a {
    color: #a8c7fa;
  }
  input[type="text"],
  input[type="number"],
  input:not([type]) {
    width: calc(200px - 8px - 10px);
    padding: 5px 8px 5px 10px;
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
  input[type="checkbox"],
  input[type="radio"] {
    position: relative;
    width: 20px;
    height: 20px;
    margin: 2px 8px 2px 2px;
    vertical-align: bottom;
    appearance: none;
    background: var(--bg4);
    border-radius: 4px;
    transition: background-color 0.2s;
  }
  input[type="radio"] {
    border-radius: 50%;
  }
  /* agreement: use clip-path for icons instead of svg, and try https://bennettfeely.com/clippy/ */
  input[type="checkbox"]::before,
  input[type="radio"]::before {
    position: absolute;
    display: block;
    width: 20px;
    height: 20px;
    clip-path: polygon(24% 49%, 18% 56%, 43% 78%, 82% 31%, 75% 26%, 42% 65%);
    content: "";
    background-image: linear-gradient(90deg, var(--fg) 50%, #0000 50%);
    background-position-x: 100%;
    background-size: 200%;
    transition: background-position-x 0.2s;
  }
  input[type="checkbox"]:checked::before,
  input[type="radio"]:checked::before {
    background-position-x: 0%;
  }
  label {
    display: inline-block;
    line-height: 24px;
    transition: opacity 0.2s;
  }
  label.drop-hint::after {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    content: "${i18n.dropHint()}";
    background: var(--bg4);
    border: 2px dashed;
    border-radius: 6px;
  }
  legend {
    padding: 0 0 2px;
    line-height: 24px;
  }
  /* agreement: apply style to multi elements by css selector, not by util class */
  button,
  body > .tasks figure,
  body > .home figure {
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
  body > .tasks figure ~ button:not(:hover, :active),
  body > .home figure ~ button:not(:hover, :active),
  body > .home menu button:not(:hover, :active),
  body > .home > button.off:not(:hover, :active),
  body > .top > button.off:not(:hover, :active),
  body > .action > button.off:not(:hover, :active) {
    background: #0000;
  }
  button:hover,
  input[type="checkbox"]:hover,
  input[type="radio"]:hover {
    background: var(--bg5);
  }
  button:active,
  input[type="checkbox"]:active,
  input[type="radio"]:active {
    background: var(--bg6);
  }
  button:active,
  body > .home li figure:active {
    transition: background-color 0s;
  }
  @keyframes menu-in {
    0% {
      opacity: 0;
    }
  }
  @keyframes menu-out {
    100% {
      opacity: 0;
    }
  }
  menu {
    min-width: 96px;
    padding: 4px;
    margin: 0;
    background: var(--bg2);
    border-radius: 6px;
    animation: 0.2s menu-in;
  }
  menu.off {
    animation: 0.2s forwards menu-out;
  }
  menu > li > button {
    width: 100%;
    text-align: left;
  }
  body {
    height: 100vh;
    margin: 0;
    font-size: 14px;
    color: var(--fg);
    background: var(--bg);
    -webkit-tap-highlight-color: transparent; /* agreement: the shadcn has not ":active" in buttons, they "-webkit-tap-highlight-color" insteaad of , but we don't agree with that */
  }
  body > div {
    position: fixed;
    top: 42px;
    right: 0;
    bottom: 0;
    left: 0;
    padding: 6px 12px 12px;
    transition: visibility 0.2s, opacity 0.2s;
  }
  /* agreement: default to be visable, and hide with ".off" class */
  body > div.off {
    visibility: hidden;
    opacity: 0;
  }
  /* agreement: always use strict prefix to scope the style, like "body > .foo", do not leak it to extension action */
  body > .tasks {
    overflow: auto;
  }
  body > .tasks:empty::before {
    display: block;
    margin: 12px;
    font-size: 16px;
    text-align: center;
    content: "${i18n.tasksEmpty()}";
    opacity: 0.8;
  }
  body > .tasks section {
    position: relative;
    margin-bottom: 6px;
  }
  body > .tasks figure,
  body > .home figure {
    padding: 10px 14px;
    margin: 0;
    background: var(--bg3);
  }
  body > .tasks figure:hover,
  body > .home figure:hover {
    background: var(--bg4);
  }
  body > .tasks figure:active,
  body > .home figure:active {
    background: var(--bg5);
  }
  /* todo: animation for removing */
  body > .tasks figure h5,
  body > .home figure h5 {
    display: inline-block;
    max-width: calc(100% - 120px);
    padding: 0 8px 6px 0;
    margin: 0;
    overflow: hidden;
    font-size: 17px;
    font-weight: normal;
    text-indent: -0em;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: text-top;
    transition: text-indent 0.2s;
  }
  body > .tasks figure sub,
  body > .home figure sub {
    font-size: 13px;
    vertical-align: inherit;
    opacity: 0.8;
  }
  body > .tasks figure ~ button,
  body > .home figure ~ button {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 28px;
    height: 28px;
    padding: 0;
    overflow: hidden;
    font-size: 18px;
  }
  body > .tasks figure ~ button:nth-child(3),
  body > .home figure ~ button:nth-child(3) {
    right: calc(6px + 28px + 4px);
  }
  body > .tasks button::before {
    display: block;
    height: 300%;
    clip-path: path("M9,9h3v10h-3,M16,9h3v10h-3 M9,36v12l11-6 M9,65h10v10H9");
    content: "";
    background: var(--fg);
    opacity: 0.8;
    transition: translate 0.2s;
    translate: 0 0%;
  }
  body > .tasks button.pause::before {
    translate: 0 0%;
  }
  body > .tasks button.resume::before {
    translate: 0 -33.33%;
  }
  body > .tasks button.stop::before {
    translate: 0 -66.66%;
  }
  body > .tasks button.off {
    visibility: hidden;
    opacity: 0;
  }
  body > .tasks progress {
    --progress: 0%;
    display: block;
    width: 100%;
    height: 0;
    margin: 8px 0 4px;
    appearance: none;
  }
  body > .tasks progress::before {
    display: block;
    width: 100%;
    height: 3px;
    content: "";
    background-image: linear-gradient(90deg, var(--bg7) 50%, var(--bg5) 50%);
    background-position-x: calc(100% - var(--progress));
    background-size: 200%;
    border-radius: 4px;
    transition: background-position-x 0.2s;
  }
  body > .home > button,
  body > .action > button {
    padding: 6px 12px;
    margin: 0 4px 12px 0;
  }
  body > .home .separator {
    display: inline-block;
    width: 8px;
  }
  body > .home ul {
    display: grid; /* todo: grid-template-columns: 1fr 1fr */
    gap: 6px;
    max-height: calc(100% - 38px);
    padding: 0;
    margin: 0;
    overflow: auto;
    border-radius: 6px;
  }
  body > .home ul:empty::before {
    display: block;
    margin: 8px;
    font-size: 16px;
    text-align: center;
    content: "${i18n.homeEmpty()}";
    opacity: 0.8;
  }
  body > .home ul::after {
    height: 10em;
    content: "";
  }
  body > .home ul li {
    position: relative;
    list-style: none;
  }
  body > .home figure p {
    margin: 0;
    line-height: 19px;
  }
  body > .home figure ~ button::before,
  body > .action > .entries label > button::before {
    clip-path: path(
      "m1.6,5.4 a1.6,1.6,0,1,0,.01,0 m5.4,0 a1.6,1.6,0,1,0,.01,0 m5.4,0 a1.6,1.6,0,1,0,.01,0"
    );
    display: block;
    width: 14px;
    height: 14px;
    margin: 0 auto;
    content: "";
    background: var(--fg);
    opacity: 0.9;
  }
  body > .home menu {
    position: absolute;
    top: 6px;
    right: 6px;
    z-index: 1;
  }
  body > .market > input {
    margin-right: 4px;
  }
  body > .action > .entries.common-files > * {
    margin: 0 12px 6px 0;
  }
  body > .action > .entries.common-files > button {
    margin: 0 4px 4px 0;
  }
  body > .action > .entries.common-files ul {
    width: fit-content;
    max-width: 100%;
    max-height: calc(50vh - 200px);
    padding: 0;
    margin: 0;
    overflow: auto;
    white-space: nowrap;
  }
  body > .action > .entries.common-files li {
    list-style: none;
  }
  body > .action > .entries.common-files li > * {
    margin-right: 12px;
  }
  body > .action > .entries.common-files li input {
    width: calc(50vw - 120px);
    max-width: 320px;
  }

  body > .action > .root {
    margin-top: 12px;
    margin-bottom: 12px;
  }
  body > .action label > input:not([type="radio"]) {
    display: block;
    margin-top: 4px;
  }
  body > .action label > input:not(:last-child) {
    width: calc(200px - 8px - 10px - 30px);
    padding-right: calc(8px + 30px);
    margin-bottom: -30px;
  }
  body > .action label > button:last-child {
    float: right;
    width: 30px;
    padding-right: 0;
    padding-left: 0;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
  }
  body > .action fieldset,
  body > .settings fieldset {
    display: inline-grid;
    gap: 4px;
    padding: 0;
    margin: 0;
    border: none;
    /* height: 20px; */
    /* max-width: 30em; */
    /* overflow: scroll; */
    /* border-radius: 6px; */
    /* background: var(--bg3); */
  }
  body > .settings form {
    padding: 4px 6px 12px;
  }
  body > .settings h5 {
    margin: 0;
    font-size: 16px;
    font-weight: 500;
  }
  body > .settings p {
    margin: 8px 0;
  }
  body > .settings .about button {
    padding: 6px 12px; /* small button, like "body > .home > button" */
    margin: 0 4px 4px 0;
  }
  body > .settings .about button > a {
    position: absolute;
    inset: 0;
  }
  body > .top {
    position: fixed;
    top: 0;
    right: 0;
    left: 0;
    padding: 8px 12px;
  }
  body > .top > button:not(:last-child) {
    margin-right: 4px;
  }
  body > .top > button.to-action:empty {
    visibility: hidden;
  }
  body > .top > button.to-action + button {
    float: right;
  }
  body > .top > button.to-settings::before {
    display: block;
    width: 14px;
    height: 14px;
    margin: 0 -2px;
    clip-path: path("M0,1h14v2H0v3h14v2H0v3h14v2H0");
    content: "";
    background: var(--fg);
    opacity: 0.9;
  }
  /* todo: about hover, https://stackoverflow.com/a/30303898 */
  /* todo: use box-shadow instead of background on hover? */
  /* todo: rtl right-to-left https://github.com/happylindz/blog/issues/16 */
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
  $tasks.classList.add("tasks"); // agreement: never set dom id, use class instead
  $tasks.classList.add("off");
  new EventSource("/get-status").onmessage = async (message) => {
    const e = /** @type {GetStatusResponseEvent} */ (JSON.parse(message.data)); // agreement: the only sse endpoint, only one
    /** @type {HTMLElement | null} */
    let $task = $tasks.querySelector(`section[data-id="${e.id}"]`);
    if (!$task) {
      $task = document.createElement("section");
      $tasks.insertBefore($task, $tasks.firstChild);
      $task.dataset.id = e.id;
      const $figure = document.createElement("figure");
      $task.appendChild($figure);
      const $title = document.createElement("h5");
      $figure.appendChild($title);
      const $tips = document.createElement("sub");
      $figure.appendChild($tips);
      const $progress = document.createElement("progress");
      $figure.appendChild($progress);
      $progress.value = 0;
      $progress.style.setProperty("--progress", "30%");
      if (e.kind === "run-action-progress") {
        const $stop = document.createElement("button");
        $task.appendChild($stop);
        $stop.classList.add("stop");
        $stop.title = i18n.tasksStop();
        $stop.onclick = async () => {
          assert(false, "todo");
          // disable all buttons
        };
        const $pause = document.createElement("button");
        $task.appendChild($pause);
        $pause.classList.add("pause");
        $pause.title = i18n.tasksPause();
        $pause.onclick = async () => {
          return alert("todo");
          if ($pause.classList.contains("pending")) return;
          $pause.classList.add("pending");
          setTimeout(() => $pause.classList.remove("pending"), 1000);
          $pause.classList.toggle("pause");
          $pause.classList.toggle("resume");
          if ($pause.classList.contains("pause"))
            $pause.title = i18n.tasksPause();
          if ($pause.classList.contains("resume"))
            $pause.title = i18n.tasksResume();
          assert(false, "todo");
          // todo: how can i know it is paused after page reload? add fields into controller?
        };
        // todo: the "show in folder" button?
        // todo: 一开始是进度条，后来是完成时间与耗时
        // todo: 对于文件转换类任务，提供删除条目和打开文件夹的按钮
      } else if (e.kind === "install-extension-progress") {
        const $stop = document.createElement("button");
        $task.appendChild($stop);
        $stop.classList.add("stop");
        $stop.title = i18n.tasksStop();
        $stop.onclick = async () => {
          assert(false, "todo");
        };
      } else {
        assert(false, "unreachable");
      }
    }
    const [$figure, $stop, $pause] = /** @type {Iterable<HTMLElement>} */ (
      $task.children
    );
    const [$title, $tips, $progress] = /** @type {Iterable<HTMLElement>} */ (
      $figure.children
    );
    if (e.kind === "run-action-progress") {
      // const [$pause, $stop, $pin] = $operations.children;
      $title.textContent = e.title;
      $title.title = e.title;
      const percent = (e.progress.finished / e.progress.amount) * 100;
      $progress.style.setProperty("--progress", percent + "%");
      if (e.pending) {
        const speed = e.progress.finished / (Date.now() / 1000 - e.time.begin);
        const remainTime = (e.progress.amount - e.progress.finished) / speed;
        $tips.textContent =
          `${Math.round(Number.isFinite(remainTime) ? remainTime : 0)}s - ` +
          `${e.progress.finished}/${e.progress.amount}`;
      } else if (e.error) {
        $tips.textContent = "Error: " + JSON.stringify(e.error);
        $stop?.classList?.add("off");
        $pause?.classList?.add("off");
      } else {
        assert(e.time.end);
        const took = e.time.end - e.time.begin;
        $tips.textContent = `Finished - took ${took.toFixed(2)}s`;
        $stop?.classList?.add("off");
        $pause?.classList?.add("off");
      }
    } else if (e.kind === "install-extension-progress") {
      // const [$stop, $pin] = $operations.children;
      $title.textContent = e.title;
      $title.title = e.title;
      const percent = (e.progress.finished / e.progress.amount) * 100;
      $progress.style.setProperty("--progress", percent + "%");
      $tips.textContent =
        (e.progress.finished / 1024 / 1024).toFixed(1) +
        "/" +
        (e.progress.amount / 1024 / 1024).toFixed(1) +
        " M"; // this is MiB
      if (e.pending) {
      } else if (e.error) {
        $tips.textContent = "Error: " + JSON.stringify(e.error);
        $stop?.classList?.add("off");
        $pause?.classList?.add("off");
      } else {
        $tips.textContent = "Finished";
        r$home();
        $stop?.classList?.add("off");
        $pause?.classList?.add("off");
      }
    } else {
      var /** @type {never} */ _ = e; // exhaustiveness
    }
  };

  // $home
  const $home = document.createElement("div"); // 选择 extension，action，profile 等. 其实用户眼中应该全都是 profile，所有的目标都是 profile
  document.body.appendChild($home);
  $home.classList.add("home");
  $home.classList.add("off");
  /** @type {ListExtensionsResponse} */
  let extensionsList = [];
  // $showRecent
  const $showRecent = document.createElement("button");
  $home.appendChild($showRecent);
  $showRecent.textContent = i18n.homeShowRecent();
  $showRecent.onclick = () => {
    $showRecent.classList.remove("off");
    $showByName.classList.add("off");
    r$choices();
  };
  // $showByName
  const $showByName = document.createElement("button");
  $home.appendChild($showByName);
  $showByName.classList.add("off");
  $showByName.textContent = i18n.homeShowByName();
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
  $showExtensions.textContent = i18n.homeShowExtensions();
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
  $showProfiles.textContent = i18n.homeShowProfiles();
  $showProfiles.onclick = () => {
    $showExtensions.classList.add("off");
    $showProfiles.classList.remove("off");
    r$choices();
  };
  // $choices
  const $choices = document.createElement("ul");
  $home.appendChild($choices);
  $choices.classList.add("choices"); // todo: 2 columns?
  const r$choices = () => {
    $choices.replaceChildren();
    if (!$showExtensions.classList.contains("off")) {
      for (const extension of extensionsList) {
        const $choice = document.createElement("li");
        $choices.appendChild($choice);
        const $figure = document.createElement("figure");
        $choice.appendChild($figure);
        $figure.onclick = () => {
          $showProfiles.dataset.extensionId = extension.id;
          $showProfiles.dataset.extensionVersion = extension.version;
          $showProfiles.click();
        };
        const $name = document.createElement("h5");
        $figure.appendChild($name);
        $name.textContent = extension.name;
        $name.title = extension.id;
        const $version = document.createElement("sub");
        $figure.appendChild($version);
        $version.textContent = extension.version;
        $version.title = "Extension version";
        const $description = document.createElement("p");
        $figure.appendChild($description);
        $description.textContent = extension.description;
        const $more = document.createElement("button");
        $choice.appendChild($more);
        $more.title = i18n.homeMoreOperations();
        $more.onclick = async (e) => {
          e.stopPropagation();
          const $menu = document.createElement("menu");
          $choice.appendChild($menu);
          const removeMenu = () => {
            removeEventListener("click", removeMenu); // agreement: prefer to use `.onevent`, avoid `.addEventListener` when possible, here's why, remove listener needs more code
            $menu.onanimationend = $menu.onanimationcancel = $menu.remove; // agreement: depends on css animation, so, for future sans-animation feature, use `animation-duration:0s;animation-iteration-count:1`
            $menu.classList.add("off");
          };
          addEventListener("click", removeMenu);
          const $share = document.createElement("button");
          $menu.appendChild(document.createElement("li")).appendChild($share);
          $share.textContent = i18n.homeMenuShare();
          $share.onclick = async () => {
            assert(false, "todo");
          };
          const $delete = document.createElement("button");
          $menu.appendChild(document.createElement("li")).appendChild($delete);
          $delete.textContent = i18n.homeMenuDelete();
          $delete.onclick = async () => {
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
          const $info = document.createElement("button");
          $menu.appendChild(document.createElement("li")).appendChild($info);
          $info.textContent = i18n.homeMenuInfo();
          $info.onclick = async () => {
            assert(false, "todo");
          };
        };
      }
    } else if (!$showProfiles.classList.contains("off")) {
      const profiles = /** @type {Profile[]} */ ([]);
      for (const extension of extensionsList) {
        if ($showProfiles.dataset.extensionId) {
          if (
            extension.id !== $showProfiles.dataset.extensionId ||
            extension.version !== $showProfiles.dataset.extensionVersion
          ) {
            continue;
          }
        }
        profiles.push(...extension.profiles);
      }
      for (const profile of profiles) {
        const $choice = document.createElement("li");
        $choices.appendChild($choice);
        const $figure = document.createElement("figure");
        $choice.appendChild($figure);
        $figure.onclick = async () => {
          r$action(profile.extensionId, profile.extensionVersion, profile.id);
          $toAction.textContent = "〉" + profile.name;
          $toAction.click();
        };
        const $name = document.createElement("h5");
        $figure.appendChild($name);
        $name.textContent = profile.name;
        $name.title = profile.id;
        const $version = document.createElement("sub");
        $figure.appendChild($version);
        $version.textContent = profile.extensionVersion;
        $version.title = "Extension version";
        const $description = document.createElement("p");
        $figure.appendChild($description);
        $description.textContent = profile.description;
        const $more = document.createElement("button");
        $choice.appendChild($more);
        $more.title = i18n.homeMoreOperations();
        $more.onclick = async (e) => {
          e.stopPropagation();
          const $menu = document.createElement("menu");
          $choice.appendChild($menu);
          const removeMenu = () => {
            removeEventListener("click", removeMenu);
            $menu.onanimationend = $menu.onanimationcancel = $menu.remove;
            $menu.classList.add("off");
          };
          addEventListener("click", removeMenu);
          const $share = document.createElement("button");
          $menu.appendChild(document.createElement("li")).appendChild($share);
          $share.textContent = i18n.homeMenuShare();
          $share.onclick = async () => {
            assert(false, "todo");
          };
          const $delete = document.createElement("button");
          $menu.appendChild(document.createElement("li")).appendChild($delete);
          $delete.textContent = i18n.homeMenuDelete();
          $delete.onclick = async () => {
            assert(false, "todo: delete user defined profile");
          };
          const $info = document.createElement("button");
          $menu.appendChild(document.createElement("li")).appendChild($info);
          $info.textContent = i18n.homeMenuInfo();
          $info.onclick = async () => {
            assert(false, "todo");
          };
        };
      }
    } else {
      assert(false, "unexpected state");
    }
  };
  const r$home = async () => {
    /** @type {ListExtensionsResponse} */
    const response = await fetch("/list-extensions").then((r) => r.json());
    extensionsList = response;
    r$choices();
  };
  r$home();

  // $market
  const $market = document.createElement("div");
  document.body.appendChild($market);
  $market.classList.add("market");
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
        title: "Install extension from " + $url.value,
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
  $action.classList.add("action");
  $action.classList.add("off");
  /**
   * @param {string} extensionId
   * @param {string} extensionVersion
   * @param {string} profileId
   */
  const r$action = async (extensionId, extensionVersion, profileId) => {
    const extensionDir =
      "/static/extensions/" + extensionId + "_" + extensionVersion;
    const extension = /** @type {Extension} */ (
      (await import(extensionDir + "/index.js")).default
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
    // todo: input-file-inplace
    if (action.kind === "common-files") {
      /** @type {EntriesCommonFiles["mode"]} */
      let mode = profile?.entries?.mode || "dir";

      const $modeDir = document.createElement("button");
      $action.appendChild($modeDir);
      $modeDir.textContent = i18n.entriesModeDir();
      $modeDir.onclick = () => {
        mode = "dir";
        $modeDir.classList.remove("off");
        $modeFiles.classList.add("off");
        r$entries$dir();
      };
      if (mode !== "dir") $modeDir.classList.add("off");
      const $modeFiles = document.createElement("button");
      $action.appendChild($modeFiles);
      $modeFiles.textContent = i18n.entriesModeFiles();
      $modeFiles.onclick = () => {
        mode = "files";
        $modeDir.classList.add("off");
        $modeFiles.classList.remove("off");
        r$entries$files();
      };
      if (mode !== "files") $modeFiles.classList.add("off");

      // todo: dir and file selector without electron

      const $entries = document.createElement("form");
      $action.appendChild($entries);
      $entries.classList.add("entries");
      $entries.classList.add("common-files");
      $entries.onsubmit = (e) => e.preventDefault();
      const r$entries$dir = () => {
        $entries.replaceChildren();

        const $inputDirLabel = document.createElement("label");
        $entries.appendChild($inputDirLabel);
        $inputDirLabel.textContent = i18n.entriesInputDir();
        $inputDirLabel.ondragover = $inputDirLabel.ondragenter = (e) => {
          e.preventDefault();
          $inputDirLabel.classList.add("drop-hint");
        };
        $inputDirLabel.ondragleave = () => {
          $inputDirLabel.classList.remove("drop-hint");
        };
        $inputDirLabel.ondrop = (e) => {
          e.preventDefault();
          $inputDirLabel.classList.remove("drop-hint");
          const file = e?.dataTransfer?.items?.[0]?.getAsFile();
          $inputDir.value = globalThis.electron.webUtils.getPathForFile(file);
        };
        const $inputDir = document.createElement("input");
        $inputDirLabel.appendChild($inputDir);
        $inputDir.value = profile.entries.inputDir ?? "";
        const $inputDirButton = document.createElement("button");
        $inputDirLabel.appendChild($inputDirButton);
        $inputDirButton.onclick = async () => {
          /** @type {ShowOpenDialogRequest} */
          const request = { properties: ["openDirectory"] };
          if ($inputDir.value) request.defaultPath = $inputDir.value;
          /** @type {ShowOpenDialogResponse} */
          const response = await fetch("/show-open-dialog", {
            method: "POST",
            body: JSON.stringify(request),
          }).then((r) => r.json());
          if (response.filePaths.length)
            $inputDir.value = response.filePaths[0];
        };

        const $outputDirLabel = document.createElement("label");
        $entries.appendChild($outputDirLabel);
        $outputDirLabel.textContent = i18n.entriesOutputDir();
        $outputDirLabel.ondragover = $outputDirLabel.ondragenter = (e) => {
          e.preventDefault();
          $outputDirLabel.classList.add("drop-hint");
        };
        $outputDirLabel.ondragleave = () => {
          $outputDirLabel.classList.remove("drop-hint");
        };
        $outputDirLabel.ondrop = (e) => {
          e.preventDefault();
          $outputDirLabel.classList.remove("drop-hint");
          const file = e?.dataTransfer?.items?.[0]?.getAsFile();
          $outputDir.value = globalThis.electron.webUtils.getPathForFile(file);
        };
        const $outputDir = document.createElement("input");
        $outputDirLabel.appendChild($outputDir);
        $outputDir.value = profile.entries.outputDir ?? "";
        const $outputDirButton = document.createElement("button");
        $outputDirLabel.appendChild($outputDirButton);
        $outputDirButton.onclick = async () => {
          /** @type {ShowOpenDialogRequest} */
          const request = { properties: ["openDirectory"] };
          if ($outputDir.value) request.defaultPath = $outputDir.value;
          /** @type {ShowOpenDialogResponse} */
          const response = await fetch("/show-open-dialog", {
            method: "POST",
            body: JSON.stringify(request),
          }).then((r) => r.json());
          if (response.filePaths.length)
            $outputDir.value = response.filePaths[0];
        };

        const $outputSuffixLabel = document.createElement("label");
        $entries.appendChild($outputSuffixLabel);
        $outputSuffixLabel.textContent = i18n.entriesOutputSuffix();
        const $outputSuffix = document.createElement("input");
        $outputSuffixLabel.appendChild($outputSuffix);
        $outputSuffix.value = profile.entries.outputSuffix ?? "";

        const $outputExtension = document.createElement("fieldset");
        $entries.appendChild($outputExtension);
        const $outputExtensionLegend = document.createElement("legend");
        $outputExtension.appendChild($outputExtensionLegend);
        $outputExtensionLegend.textContent = i18n.entriesOutputExtension();
        for (const outputExtension of profile.entries.outputExtensions) {
          const $radioLabel = document.createElement("label");
          $outputExtension.appendChild($radioLabel);
          $radioLabel.textContent = outputExtension;
          const $radio = document.createElement("input");
          $radioLabel.insertBefore($radio, $radioLabel.firstChild);
          $radio.type = "radio";
          $radio.name = "output-extension";
          $radio.value = outputExtension;
          $radio.checked = profile.entries.outputExtension
            ? profile.entries.outputExtension === outputExtension // is set in profile
            : $outputExtensionLegend.nextSibling === $radioLabel; // is the first
        }

        getEntries = () => {
          /** @type {EntriesCommonFiles} */
          const entries = {
            kind: "common-files",
            mode: "dir",
            inputDir: $inputDir.value,
            outputDir: $outputDir.value,
            outputSuffix: $outputSuffix.value,
            outputExtension: /** @type {HTMLInputElement} */ (
              $outputExtension.querySelector(":checked")
            ).value,
          };
          return entries;
        };
      };
      const r$entries$files = () => {
        $entries.replaceChildren();

        const $add = document.createElement("button");
        $entries.appendChild($add);
        $add.textContent = "Add";
        $add.onclick = () => {
          const $entry = document.createElement("li");
          $list.appendChild($entry);
          const $inputLabel = document.createElement("label");
          $entry.appendChild($inputLabel);
          $inputLabel.ondragover = $inputLabel.ondragenter = (e) => {
            e.preventDefault();
            $inputLabel.classList.add("drop-hint");
          };
          $inputLabel.ondragleave = () => {
            $inputLabel.classList.remove("drop-hint");
          };
          $inputLabel.ondrop = (e) => {
            e.preventDefault();
            $inputLabel.classList.remove("drop-hint");
            const file = e?.dataTransfer?.items?.[0]?.getAsFile();
            $input.value = globalThis.electron.webUtils.getPathForFile(file);
          };
          // todo: https://www.electronjs.org/docs/latest/tutorial/native-file-drag-drop/
          const $input = document.createElement("input");
          $inputLabel.appendChild($input);
          $input.placeholder = "Input file";
          const $inputButton = document.createElement("button");
          $inputLabel.appendChild($inputButton);
          $inputButton.onclick = async () => {
            /** @type {ShowOpenDialogRequest} */
            const request = { properties: ["openFile"] };
            if ($input.value) request.defaultPath = $input.value;
            /** @type {ShowOpenDialogResponse} */
            const response = await fetch("/show-open-dialog", {
              method: "POST",
              body: JSON.stringify(request),
            }).then((r) => r.json());
            if (response.filePaths.length) $input.value = response.filePaths[0];
          };
          const $outputLabel = document.createElement("label");
          $entry.appendChild($outputLabel);
          $outputLabel.ondragover = $outputLabel.ondragenter = (e) => {
            e.preventDefault();
            $outputLabel.classList.add("drop-hint");
          };
          $outputLabel.ondragleave = () => {
            $outputLabel.classList.remove("drop-hint");
          };
          $outputLabel.ondrop = (e) => {
            e.preventDefault();
            $outputLabel.classList.remove("drop-hint");
            const file = e?.dataTransfer?.items?.[0]?.getAsFile();
            $output.value = globalThis.electron.webUtils.getPathForFile(file);
          };
          const $output = document.createElement("input");
          $outputLabel.appendChild($output);
          $output.placeholder = "Output file";
          const $outputButton = document.createElement("button");
          $outputLabel.appendChild($outputButton);
          $outputButton.onclick = async () => {
            /** @type {ShowSaveDialogRequest} */
            const request = { properties: [] };
            if ($output.value) request.defaultPath = $output.value;
            if (profile.entries?.outputExtensions) {
              const toFilter = (v) => ({ name: v, extensions: [v] });
              request.filters = profile.entries.outputExtensions.map(toFilter);
            }
            /** @type {ShowSaveDialogResponse} */
            const response = await fetch("/show-save-dialog", {
              method: "POST",
              body: JSON.stringify(request),
            }).then((r) => r.json());
            if (response.filePath) $output.value = response.filePath;
          };
          const $removeButton = document.createElement("button");
          $entry.appendChild($removeButton);
          $removeButton.textContent = "✕";
          $removeButton.onclick = () => {
            $entry.remove();
          };
        };
        const $clear = document.createElement("button");
        $entries.appendChild($clear);
        $clear.textContent = "Clear";
        $clear.onclick = () => {
          $list.replaceChildren();
          $add.click();
        };
        const $list = document.createElement("ul");
        $entries.appendChild($list);
        $add.click();

        getEntries = () => {
          /** @type {EntriesCommonFiles} */
          const entries = {
            kind: "common-files",
            mode: "files",
            inplace: false,
            entries: [],
          };
          return entries;
        };
      };
      if (mode === "dir") r$entries$dir();
      if (mode === "files") r$entries$files();
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
    assert(controller.root.localName === "form"); // scoped the "name" attribute
    assert(controller.root.classList.contains("root"));
    $action.appendChild(controller.root);
    new MutationObserver((mutations, observer) => {
      if (controller.root.parentNode) return;
      observer.disconnect();
      controller.root.dispatchEvent(new CustomEvent("post-remove"));
    }).observe($action, { childList: true, subtree: false });
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
      $toAction.textContent = "";
      $action.replaceChildren();
    };
  };

  // $settings
  const $settings = document.createElement("div");
  document.body.appendChild($settings);
  $settings.classList.add("settings");
  $settings.classList.add("off");
  const r$settings = async () => {
    $settings.replaceChildren();
    /** @type {Config} */
    const config = await fetch("/get-config").then((r) => r.json());
    const saveConfig = () =>
      fetch("/set-config", { method: "POST", body: JSON.stringify(config) });
    {
      const $form = document.createElement("form");
      $settings.appendChild($form);
      $form.classList.add("mirrors");
      const $title = document.createElement("h5");
      $form.appendChild($title);
      $title.textContent = i18n.settingsMirrorsTitle();
      const $description = document.createElement("p");
      $form.appendChild($description);
      $description.textContent = i18n.settingsMirrorsDescription();
      const $switchLabel = document.createElement("label");
      $form.appendChild($switchLabel);
      $switchLabel.textContent = i18n.settingsMirrorsSwitch();
      const $switch = document.createElement("input");
      $switchLabel.insertBefore($switch, $switchLabel.firstChild);
      $switch.type = "checkbox";
      $switch.checked = config.mirrorsEnabled;
      $switch.onchange = () => {
        config.mirrorsEnabled = $switch.checked;
        saveConfig();
      };
    }
    {
      const $form = document.createElement("form");
      $settings.appendChild($form);
      $form.classList.add("languages");
      const $title = document.createElement("h5");
      $form.appendChild($title);
      $title.textContent = i18n.settingsLanguagesTitle();
      const $description = document.createElement("p");
      $form.appendChild($description);
      $description.textContent = i18n.settingsLanguagesDescription();
      const $locales = document.createElement("fieldset");
      $form.appendChild($locales);
      for (const [locale, i18n] of Object.entries(i18nRes)) {
        const $radioLabel = document.createElement("label");
        $locales.appendChild($radioLabel);
        $radioLabel.textContent = i18n.nativeName();
        const $radio = document.createElement("input");
        $radioLabel.insertBefore($radio, $radioLabel.firstChild);
        $radio.type = "radio";
        $radio.name = "locale";
        $radio.value = locale;
        $radio.onchange = async () => {
          assert($radio.checked); // seems that uncheck does not emit events
          config.locale = /** @type {any} */ (locale);
          saveConfig();
          await sleep(100);
          alert("please restart to apply the language change");
        };
        if (locale === cu.locale) {
          $radio.checked = true;
        }
      }
    }
    {
      const $form = document.createElement("form");
      $settings.appendChild($form);
      $form.classList.add("about");
      const $title = document.createElement("h5");
      $form.appendChild($title);
      $title.textContent = i18n.settingsAboutTitle();
      const $description = document.createElement("p");
      $form.appendChild($description);
      $description.textContent = i18n.settingsAboutDescription();
      const $source = document.createElement("button");
      $form.appendChild($source);
      $source.textContent = i18n.settingsAboutSource();
      $source.appendChild(document.createElement("a")).href =
        "https://github.com/clevert-app/clevert";
      const $sponsorsAlipay = document.createElement("button");
      $form.appendChild($sponsorsAlipay);
      $sponsorsAlipay.textContent = i18n.settingsAboutSponsorsAlipay();
      $sponsorsAlipay.appendChild(document.createElement("a")).href =
        "https://qr.alipay.com/tsx105782qrtnv7ftvljo00";
      const $sponsorsGitHub = document.createElement("button");
      $form.appendChild($sponsorsGitHub);
      $sponsorsGitHub.textContent = i18n.settingsAboutSponsorsGitHub();
      $sponsorsGitHub.appendChild(document.createElement("a")).href =
        "https://github.com/sponsors/clevert-app";
    }
  };
  r$settings();

  // $top
  const $top = document.createElement("header"); // 如果要移动端，就**不可能**侧栏了。而顶栏在桌面端也可以忍受
  $top.classList.add("top");
  document.body.appendChild($top);
  const $toTasks = document.createElement("button");
  $top.appendChild($toTasks);
  $toTasks.classList.add("to-tasks");
  $toTasks.classList.add("off");
  $toTasks.textContent = i18n.toTasks();
  $toTasks.onclick = () => {
    $toTasks.classList.remove("off");
    $toHome.classList.add("off");
    $toMarket.classList.add("off");
    $toAction.classList.add("off");
    $toSettings.classList.add("off");
    $tasks.classList.remove("off");
    $home.classList.add("off");
    $market.classList.add("off");
    $action.classList.add("off");
    $settings.classList.add("off");
  };
  const $toHome = document.createElement("button");
  $top.appendChild($toHome);
  $toHome.classList.add("to-home");
  $toHome.classList.add("off");
  $toHome.textContent = i18n.toHome();
  $toHome.onclick = () => {
    $toTasks.classList.add("off");
    $toHome.classList.remove("off");
    $toMarket.classList.add("off");
    $toAction.classList.add("off");
    $toSettings.classList.add("off");
    $tasks.classList.add("off");
    $home.classList.remove("off");
    $market.classList.add("off");
    $action.classList.add("off");
    $settings.classList.add("off");
  };
  const $toMarket = document.createElement("button");
  $top.appendChild($toMarket);
  $toMarket.classList.add("to-market");
  $toMarket.classList.add("off");
  $toMarket.textContent = i18n.toMarket();
  $toMarket.onclick = () => {
    $toTasks.classList.add("off");
    $toHome.classList.add("off");
    $toMarket.classList.remove("off");
    $toAction.classList.add("off");
    $toSettings.classList.add("off");
    $tasks.classList.add("off");
    $home.classList.add("off");
    $market.classList.remove("off");
    $action.classList.add("off");
    $settings.classList.add("off");
  };
  const $toAction = document.createElement("button");
  $top.appendChild($toAction);
  $toAction.classList.add("to-action");
  $toAction.classList.add("off");
  $toAction.textContent = "";
  $toAction.onclick = () => {
    assert($toAction.textContent !== "");
    $toTasks.classList.add("off");
    $toHome.classList.add("off");
    $toMarket.classList.add("off");
    $toAction.classList.remove("off");
    $toSettings.classList.add("off");
    $tasks.classList.add("off");
    $home.classList.add("off");
    $market.classList.add("off");
    $action.classList.remove("off");
    $settings.classList.add("off");
  };
  const $toSettings = document.createElement("button");
  $top.appendChild($toSettings);
  $toSettings.classList.add("to-settings");
  $toSettings.classList.add("off");
  $toSettings.title = i18n.toSettings();
  $toSettings.onclick = () => {
    $toTasks.classList.add("off");
    $toHome.classList.add("off");
    $toMarket.classList.add("off");
    $toAction.classList.add("off");
    $toSettings.classList.remove("off");
    $tasks.classList.add("off");
    $home.classList.add("off");
    $market.classList.add("off");
    $action.classList.add("off");
    $settings.classList.remove("off");
  };

  // main
  {
    $toHome.click();
  }
};

const serverMain = async () => {
  const electronImport = import("electron"); // as early as possible // to hack type acquisition: cd ~/.cache/typescript/0.0 ; mkdir _electron ; echo '{"name":"@types/electron"}' > _electron/package.json ; curl -o _electron/index.d.ts -L unpkg.com/electron/electron.d.ts ; npm i -D ./_electron
  electronImport.catch(() => {});

  /**
   * Solve path, like `path.resolve`, with support of home dir prefix `~/`. More usage: `solvePath()` returns home dir, `solvePath(".")` returns current dir.
   * ```js
   * // unix
   * solvePath("~/a/", "b/../c/d", "//e") === process.env.HOME + "/a/c/d/e";
   * // windows
   * solvePath("C:\\a\\", "b\\../c/\\d", "\\\\e") === "C:\\a\\c\\d\\e"; // auto slash convert
   * ```
   * @param {...string} parts
   */
  const solvePath = (...parts) => {
    if (parts.length === 0) {
      return process.env.USERPROFILE ?? process.env.HOME ?? process.cwd();
    }
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

  const PATH_DATA = solvePath("temp");
  for (const entry of ["cache", "extensions", "profiles"])
    await fs.promises.mkdir(solvePath(PATH_DATA, entry), { recursive: true });

  /** Copy from [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/MIME_types#important_mime_types_for_web_developers). */
  const MIME = Object.freeze({
    html: "text/html; charset=utf-8",
    css: "text/css; charset=utf-8",
    js: "text/javascript; charset=utf-8",
    json: "application/json; charset=utf-8",
    svg: "image/svg+xml; charset=utf-8",
  });

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
    }, 30); // 30ms is enough for most machines, and the JSON.stringify is sync which can delay the await sleep in electron's app.on("window-all-closed", ...)
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

  // agreement: keep these configs as flat as possible, so we can easily merge and upgrade it
  /** @type {Config} */
  const defaultConfig = Object.seal({
    windowWidth: 800,
    windowHeight: 600,
    windowMaximized: false,
    locale: /** @type {keyof i18nRes} */ (
      Intl.DateTimeFormat().resolvedOptions().locale // todo: set to nearest lang?
    ),
    mirrorsEnabled: false,
    serverPort: 9393,
  });
  /** @type {Config} */
  const config = await openJsonMmap(solvePath(PATH_DATA, "config.json")); // developers write js extensions, common users will not modify config file manually, so the non-comments json is enough
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
    await sleep(100); // wait for config file sync (30ms), however ctrl+c still cause force exit
  };

  const electronRun = electronImport.then(async (electron) => {
    const { app, BrowserWindow, nativeTheme, screen } = electron; // agreement: keep electron optional, as a simple webview, users can choose node + browser
    // app.commandLine.appendSwitch("no-sandbox"); // cause devtools error /dev/shm ... on linux
    app.commandLine.appendSwitch("disable-gpu-sandbox");
    const createWindow = async () => {
      const win = new BrowserWindow({
        title: i18n.title(),
        autoHideMenuBar: true,
        backgroundColor: nativeTheme.shouldUseDarkColors ? "#000" : "#fff",
        webPreferences: { sandbox: false, spellcheck: false, preload },
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
      await preloadPromise;
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
        // process.exit(); // on windows we need this?
      }
    });
    const preload = solvePath(PATH_DATA, "preload.mjs"); // because of https://www.electronjs.org/docs/latest/tutorial/esm , see also #14012 #28981
    const preloadData = `import{contextBridge,webUtils}from"electron";contextBridge.exposeInMainWorld("electron",{webUtils})`;
    const preloadPromise = fs.promises.writeFile(preload, preloadData);
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

  const gfwDetector = fetch("https://www.google.com/generate_204"); // detect google instead of github because github interfered with by gfw has erratic behaviour, e.g. it works now but fails on future requests
  gfwDetector.catch(() => console.log("gfw detected"));

  const mirrors = Object.seal({
    sources: {
      "https://github.com": {
        bench: {
          suffix:
            "/electron/electron/releases/download/v33.2.1/electron-v33.2.1-win32-x64-toolchain-profile.zip",
          size: 75306,
        },
        list: [
          "https://gh.xiu2.us.kg/https://github.com",
          "https://slink.ltd/https://github.com",
          "https://gh-proxy.com/https://github.com",
          "https://cors.isteed.cc/github.com",
          "https://sciproxy.com/github.com",
          "https://ghproxy.cc/https://github.com",
          "https://cf.ghproxy.cc/https://github.com",
          "https://www.ghproxy.cc/https://github.com",
          "https://ghproxy.cn/https://github.com",
          "https://www.ghproxy.cn/https://github.com",
          "https://github.site",
          "https://github.store",
          "https://github.tmby.shop/https://github.com",
          "https://github.moeyy.xyz/https://github.com",
          "https://hub.whtrys.space",
          "https://dgithub.xyz",
          "https://gh-proxy.ygxz.in/https://github.com",
          "https://download.ixnic.net",
          "https://ghproxy.net/https://github.com",
          "https://ghp.ci/https://github.com",
          "https://kkgithub.com",
          // from https://github.com/XIU2/UserScript/blob/master/GithubEnhanced-High-Speed-Download.user.js
        ],
      },
    },
    map: new Map([["https://from.example.com", "https://to.example.com"]]),
    refresh: async () => {
      for (const [origin, source] of Object.entries(mirrors.sources)) {
        const controller = new AbortController();
        const promises = source.list.map(async (prefix) => {
          const response = await fetch(prefix + source.bench.suffix, {
            redirect: "follow",
            signal: controller.signal,
          });
          const size = (await response.arrayBuffer()).byteLength;
          assert(size === source.bench.size);
          controller.abort();
          mirrors.map.set(origin, prefix); // console.log({ origin, prefix });
        });
        await Promise.any(promises).catch(() => {});
      }
    },
  });

  /**
   * Download smartly. This function assumes the file stream is closed before return, even if errors occur.
   * @param {string} url
   * @param {fs.PathLike} path
   * @param {AbortSignal} signal
   * @param {(amountSize: number) => void} onStart
   * @param {(chunkSize: number) => void} onChunk
   */
  const download = async (url, path, signal, onStart, onChunk) => {
    const origin = new URL(url).origin;
    const mirror = mirrors.map.get(origin);
    if (mirror) {
      url = mirror + url.slice(origin.length);
    }
    const response = await fetch(url, { redirect: "follow", signal });
    assert(response.ok && response.body);
    onStart(parseInt(response.headers.get("Content-Length") || "0"));
    const fileStream = fs.createWriteStream(path, { signal });
    try {
      for await (const chunk of response.body) {
        onChunk(chunk.byteLength);
        assert(fileStream.writable);
        await new Promise((resolve) => fileStream.write(chunk, resolve)); // not need to listen drain event, see https://github.com/clevert-app/clevert/issues/12
      }
    } finally {
      await new Promise((resolve) => fileStream.close(resolve));
    }
  };

  /**
   * Exclude the static `import` declaration matches `pattern`. Will be `// excluded: import xxx form ...`.
   * @param {string} src
   * @param {RegExp} pattern
   */
  const excludeImports = (src, pattern) => {
    let ret = "";
    let i = 0;
    while (true) {
      if (src.startsWith("import", i)) {
        let start = i + "import".length;
        while (!(src[start] === "'" || src[start] === '"')) {
          start++;
        }
        let end = src.indexOf(src[start], start + 1); // for better performance, avoid the unnecessary regexp
        start++;
        const moduleName = src.slice(start, end);
        const rangeEnd = end + "'".length;
        if (pattern.test(moduleName)) {
          const mark = "// excluded: ";
          ret += mark + src.slice(i, rangeEnd).replaceAll("\n", "\n" + mark);
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
   * @param {string} script
   * @returns {Promise<string>}
   */
  const powershellEval = (script) => {
    assert(process.platform === "win32");
    const { promise, resolve, reject } = Promise.withResolvers();
    child_process.execFile(
      "powershell.exe",
      ["-Command", script],
      (e, stdout, stderr) => (e ? reject(e) : resolve(stdout))
    );
    return promise;
  };

  /**
   * @param {RunActionRequest["entries"]} opts
   * @returns {Promise<any[]>}
   */
  const solveEntries = async (opts) => {
    if (opts.kind === "common-files" && opts.mode === "dir") {
      const entries = [];
      const inputDir = solvePath(opts.inputDir);
      const outputDir = solvePath(opts.outputDir);
      for (const { parentPath, name } of await fs.promises.readdir(inputDir, {
        withFileTypes: true,
        recursive: true,
      })) {
        const input = solvePath(parentPath, name);
        let output = path.relative(inputDir, input);
        if (opts.outputExtension) {
          const extname = path.extname(input); // includes the dot char
          if (extname) {
            output = output.slice(0, output.length - extname.length);
          }
          output += "." + opts.outputExtension;
        }
        output = solvePath(outputDir, output);
        entries.push({ input, output });
      }
      return entries;
    } else if (opts.kind === "common-files" && opts.mode === "files") {
      // question: what about the usage of `.inplace` ?
      return opts.entries;
    } else if (opts.kind === "custom") {
      return opts.entries;
    } else {
      assert(false, "todo");
    }
  };

  /**
   * The handler for `http.createServer`.
   * @param {Parameters<http.RequestListener>[1]} r Response & Request in `.req` field.
   **/
  const requestHandler = async (r) => {
    const readJson = () => {
      const { resolve, reject, promise } = Promise.withResolvers();
      let body = "";
      r.req.on("data", (chunk) => (body += chunk)); // in my testing, register the listener after a delay will not miss events
      r.req.on("end", resolve).on("error", reject);
      return promise.then(() => JSON.parse(body)); // export the json parse error to outer, instead of throw inside "end" event listener
    };

    r.setHeader("Cache-Control", "no-store");

    if (r.req.url === "/") {
      r.setHeader("Content-Type", MIME.html); // agreement: don't use chained call like r.setHeader(xxx).end("whatever")
      r.end(pageHtml(i18n, config.locale)); // agreement: use vanilla html+css+js, esm, @ts-check, jsdoc, get rid of ts transpile, node 22 added built-in ts but not at browser in the foreseeable future
      return;
    }

    if (r.req.url === "/index.js") {
      const buffer = await fs.promises.readFile(import.meta.filename);
      const response = excludeImports(buffer.toString(), /^node:/);
      r.setHeader("Content-Type", MIME.js);
      r.end(response);
      return;
    }

    if (r.req.url === "/favicon.ico") {
      r.end();
      return;
    }

    if (r.req.url === "/install-extension") {
      /** @type {InstallExtensionRequest} */
      const request = await readJson();
      let finished = 0;
      let amount = 0;
      const abortController = new AbortController();
      const tempPaths = /** @type {Set<string>} */ new Set();
      const promise = (async () => {
        const indexJsTemp = solvePath(PATH_DATA, "cache", nextId() + ".js");
        tempPaths.add(indexJsTemp);
        await download(
          request.url,
          indexJsTemp,
          abortController.signal,
          (amountSize) => (amount += amountSize),
          (chunkSize) => (finished += chunkSize)
        );
        const extension = /** @type {Extension} */ (
          (await import("file://" + indexJsTemp)).default
        );
        const extensionDir = solvePath(
          PATH_DATA,
          "extensions",
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
          const assetTemp = solvePath(PATH_DATA, "cache", nextId() + suffix);
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
                // console.error(error) // --force-local // https://stackoverflow.com/a/37996249 // on windows msys2 this cause error
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
        // in vscode, cancel is not supported, and it has auto cleaning, we follow this strategy
        // todo: needs fix, if user close app during installing. however this seems fine because everytime after launch the cache dir is cleaned, and what about the extensionDir?
        abortController.abort();
        for (const v of tempPaths) {
          await fs.promises.rm(v, { force: true, recursive: true });
        }
      });

      installExtensionControllers.set(nextId(), {
        title: request.title,
        progress: () => ({ finished, amount }),
        promise,
      });

      r.end();
      return;
    }

    if (r.req.url === "/remove-extension") {
      /** @type {RemoveExtensionRequest} */
      const request = await readJson();
      const extensionDir = solvePath(
        PATH_DATA,
        "extensions",
        request.id + "_" + request.version
      );
      await fs.promises.rm(extensionDir, { recursive: true, force: true });
      r.end();
      return;
    }

    if (r.req.url === "/list-extensions") {
      /** @type {ListExtensionsResponse} */
      const response = [];
      for (const { parentPath, name } of await fs.promises.readdir(
        solvePath(PATH_DATA, "extensions"),
        { withFileTypes: true }
      )) {
        const extensionIndexJs = solvePath(parentPath, name, "index.js");
        const extension = /** @type {Extension} */ (
          (await import("file://" + extensionIndexJs)).default
        );
        assert(name === extension.id + "_" + extension.version);
        response.push(extension); // function type fields like extension.action.ui is omitted in JSON.stringify, standard guaranteed
      }
      r.setHeader("Content-Type", MIME.json);
      r.end(JSON.stringify(response));
      return;
    }

    // todo: implement /list-profiles /save-profile /remove-profile /profile/xxx
    // design proposal: there are many profiles, save profile into ./profiles/the-profile-uuid.json , and build a profile index json, recent profiles name and

    if (r.req.url === "/run-action") {
      /** @type {RunActionRequest} */
      const request = await readJson();
      const extensionIndexJs = solvePath(
        PATH_DATA,
        "extensions",
        request.extensionId + "_" + request.extensionVersion,
        "index.js"
      );
      const extension = /** @type {Extension} */ (
        (await import("file://" + extensionIndexJs)).default
      );
      const action = extension.actions.find(
        (action) => action.id === request.actionId
      );
      assert(action !== undefined, "action not found");
      const entries = await solveEntries(request.entries);
      const amount = entries.length;
      let finished = 0;
      const runningControllers = /** @type {Set<ActionExecuteController>} */ (
        new Set()
      );
      let promise = Promise.all(
        [...Array(request.parallel)].map((_, i) =>
          (async () => {
            for (let entry; (entry = entries.shift()); ) {
              // console.log({ entry, req });
              const controller = action.execute(request.profile, entry);
              runningControllers.add(controller);
              await controller.promise;
              runningControllers.delete(controller);
              finished += 1;
            }
          })()
        )
      );
      promise = promise.finally(() => {
        controller.time.end = Date.now() / 1000;
      });
      promise.catch(() => {}); // avoid UnhandledPromiseRejection
      /** @type {RunActionController} */
      const controller = {
        title: request.title,
        time: { begin: Date.now() / 1000 },
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
          }
          runningControllers.clear();
        },
        promise,
      };
      runActionControllers.set(nextId(), controller);
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
      r.writeHead(200); // agreement: only use exhibit writeHead() when necessary, like here we needs the browser to know the connection is healthy immediately
      /** @param {GetStatusResponseEvent} e */
      const send = (e) => r.write(`data: ${JSON.stringify(e)}\n\n`);
      const preventedIds = /** @type {Set<string>} */ (new Set());
      const watchingIds = /** @type {Set<string>} */ (new Set());
      while (r.writable) {
        for (const [id, controller] of runActionControllers) {
          if (preventedIds.has(id)) {
            continue; // just skip if it's in `preventedIds`, like exited `controller`s
          }
          send({
            kind: "run-action-progress",
            id,
            title: controller.title,
            time: controller.time,
            progress: controller.progress(),
            pending: true,
          });
          if (!watchingIds.has(id)) {
            watchingIds.add(id);
            controller.promise
              .then(() =>
                send({
                  kind: "run-action-progress",
                  id,
                  title: controller.title,
                  time: controller.time,
                  progress: controller.progress(),
                  pending: false,
                })
              )
              .catch((error) =>
                send({
                  kind: "run-action-progress",
                  id,
                  title: controller.title,
                  time: controller.time,
                  progress: controller.progress(),
                  pending: false,
                  error,
                })
              )
              .finally(() => preventedIds.add(id)); // now the `controller` is exited, so we add it to `preventedIds` to skip following query, but keep in mind that every `/get-status` request will receive at lease two events from every controller, once for `pending` = true, once for false
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
            pending: true,
          });
          if (!watchingIds.has(id)) {
            watchingIds.add(id);
            controller.promise
              .then(() =>
                send({
                  kind: "install-extension-progress",
                  id,
                  title: controller.title,
                  progress: controller.progress(),
                  pending: false,
                })
              )
              .catch((error) =>
                send({
                  kind: "install-extension-progress",
                  id,
                  title: controller.title,
                  progress: controller.progress(),
                  pending: false,
                  error,
                })
              )
              .finally(() => preventedIds.add(id));
          }
        }

        await sleep(1000); // loop interval, not SSE sending interval
      }
      r.end();
      return;
    }

    if (r.req.url === "/refresh-mirrors") {
      await mirrors.refresh();
      r.end();
      return;
    }

    if (r.req.url === "/show-open-dialog") {
      /** @type {ShowOpenDialogRequest} */
      const request = await readJson();
      try {
        const electron = await electronImport;
        /** @type {ShowOpenDialogResponse} */
        const response = await electron.dialog.showOpenDialog(request);
        r.end(JSON.stringify(response));
        return; // early return to reduce indent
      } catch (_) {} /* not electron, catch and ignore, fallback to simulate the electron api */
      if (process.platform === "win32") {
        /** @type {ShowOpenDialogResponse} */
        const response = { canceled: false, filePaths: [] };
        assert(
          !request.properties?.includes("multiSelections"),
          "the multiSelections is not implemented"
        );
        // https://stackoverflow.com/a/216769 // https://stackoverflow.com/a/66187224/
        if (request.properties?.includes("openDirectory")) {
          const s = `Add-Type -TypeDefinition @"\nusing System;using System.Runtime.InteropServices;public enum FOS:uint{FOS_PICKFOLDERS=0x20,FOS_FORCEFILESYSTEM=0x40,FOS_ALLOWMULTISELECT=0x200,FOS_PATHMUSTEXIST=0x800,FOS_FILEMUSTEXIST=0x1000,FOS_CREATEPROMPT=0x2000,FOS_SHAREAWARE=0x4000}public enum SIGDN:uint{SIGDN_FILESYSPATH=0x80058000}[ComImport][Guid("42f85136-db7e-439c-85f1-e4075d135fc8")][InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IFileDialog{[PreserveSig]int Show(IntPtr parent);void SetFileTypes(uint cFileTypes,IntPtr rgFilterSpec);void SetFileTypeIndex(uint iFileType);void GetFileTypeIndex(out uint piFileType);void Advise(IntPtr pfde);void Unadvise(uint dwCookie);void SetOptions(FOS fos);void GetOptions(out FOS pfos);void SetDefaultFolder(IntPtr psi);void SetFolder(IntPtr psi);void GetFolder(out IntPtr ppsi);void GetCurrentSelection(out IntPtr ppsi);void SetFileName([MarshalAs(UnmanagedType.LPWStr)]string pszName);void GetFileName(out IntPtr pszName);void SetTitle([MarshalAs(UnmanagedType.LPWStr)]string pszTitle);void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)]string pszText);void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)]string pszLabel);void GetResult(out IShellItem ppsi);}[ComImport][Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]class FileOpenDialogClass{}[ComImport][Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe")][InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]interface IShellItem{void BindToHandler(IntPtr pbc,ref Guid bhid,ref Guid riid,out IntPtr ppv);void GetParent(out IShellItem ppsi);void GetDisplayName(SIGDN sigdnName,out IntPtr ppszName);}public class DirPicker{public static string Open(){var d=(IFileDialog)new FileOpenDialogClass();d.SetOptions(FOS.FOS_PICKFOLDERS|FOS.FOS_FORCEFILESYSTEM);if(d.Show(IntPtr.Zero)!=0)return null;IShellItem item;d.GetResult(out item);if(item==null)return null;IntPtr pszName;item.GetDisplayName(SIGDN.SIGDN_FILESYSPATH,out pszName);return Marshal.PtrToStringUni(pszName);}}\n"@ -ReferencedAssemblies System.Runtime.InteropServices;$p=[DirPicker]::Open();if($p){ $v = [Text.Encoding]::UTF8.GetBytes($p); [Console]::OpenStandardOutput().Write($v, 0, $v.Length); }`;
          const out = await powershellEval(s); // sometimes the opened dialog will not get focus, in my machine with windows + vscode terminal + cmd.exe will trigger this bug, but with msys2 bash it works fine
          if (out) response.filePaths.push(out);
        } else {
          let s = `Add-Type -AssemblyName System.Windows.Forms; $b = New-Object System.Windows.Forms.OpenFileDialog; `;
          if (request.title) s += `$b.Description = '${request.title}'; `;
          if (request.defaultPath) {
            const parsed = path.parse(request.defaultPath);
            s += `$b.InitialDirectory = '${parsed.dir}'; $b.FileName = '${parsed.base}'; `;
          }
          const remarks = (request.filters || []).map((filter) => {
            const patterns = filter.extensions.map((v) => `*.${v}`);
            return `${filter.name}|${patterns.join(";")}`;
          });
          s += `$b.Filter = '${remarks.join("|")}'; `;
          s += `if ($b.ShowDialog() -eq 1) { $v = [Text.Encoding]::UTF8.GetBytes($b.FileName); [Console]::OpenStandardOutput().Write($v, 0, $v.Length); } `;
          const out = await powershellEval(s);
          if (out) response.filePaths.push(out);
        }
        if (response.filePaths.length === 0) response.canceled = true;
        r.end(JSON.stringify(response));
        return;
      } else {
        assert(false, "todo, more platforms");
      }
    }

    if (r.req.url === "/show-save-dialog") {
      /** @type {ShowSaveDialogRequest} */
      const request = await readJson();
      try {
        const electron = await electronImport;
        /** @type {ShowSaveDialogResponse} */
        const response = await electron.dialog.showSaveDialog(request);
        r.end(JSON.stringify(response));
        return; // early return to reduce indent
      } catch (_) {} /* not electron, catch and ignore, fallback to simulate the electron api */
      if (process.platform === "win32") {
        /** @type {ShowSaveDialogResponse} */
        const response = { canceled: false, filePath: "" };
        let s = `Add-Type -AssemblyName System.Windows.Forms; $b = New-Object System.Windows.Forms.SaveFileDialog; `;
        if (request.title) s += `$b.Description = '${request.title}'; `;
        if (request.defaultPath) {
          const parsed = path.parse(request.defaultPath);
          s += `$b.InitialDirectory = '${parsed.dir}'; $b.FileName = '${parsed.base}'; `;
        }
        const remarks = (request.filters || []).map((filter) => {
          const patterns = filter.extensions.map((v) => `*.${v}`);
          return `${filter.name}|${patterns.join(";")}`;
        });
        s += `$b.Filter = '${remarks.join("|")}'; `;
        s += `if ($b.ShowDialog() -eq 1) { $v = [Text.Encoding]::UTF8.GetBytes($b.FileName); [Console]::OpenStandardOutput().Write($v, 0, $v.Length); } `;
        const out = await powershellEval(s);
        if (out) response.filePath = out;
        else response.canceled = true;
        r.end(JSON.stringify(response));
        return;
      }
    }

    if (r.req.url === "/list-dir") {
      /** @type {ListDirRequest} */
      const request = await readJson();
      request.path = request.path ? solvePath(request.path) : solvePath();
      /** @type {ListDirResponse} */
      const response = (
        await fs.promises.readdir(request.path, { withFileTypes: true })
      ).map((e) => ({ name: e.name, kind: e.isDirectory() ? "dir" : "file" }));
      r.end(JSON.stringify(response));
      return;
    }

    if (r.req.url === "/get-config") {
      r.end(JSON.stringify(config));
      return;
    }

    if (r.req.url === "/set-config") {
      /** @type {Config} */
      const request = await readJson();
      for (const k in request) config[k] = request[k];
      r.end();
      return;
    }

    if (r.req.url === "/quit") {
      r.end();
      await beforeQuit();
      process.exit();
      return;
    }

    if (r.req.url?.startsWith("/static/")) {
      const relative = r.req.url.slice("/static/".length);
      const filePath = solvePath(PATH_DATA, relative);
      if (
        relative.startsWith("extensions/") &&
        relative.split("/")?.[2] === "index.js" // match request path like `/static/extensions/id_1.2.3/index.json`
      ) {
        const buffer = await fs.promises.readFile(filePath);
        const response = excludeImports(buffer.toString(), /^node:/);
        r.setHeader("Content-Type", MIME.js);
        r.end(response);
        return;
      }
      const fileStream = fs.createReadStream(filePath);
      await new Promise((resolve, reject) => {
        fileStream.on("ready", () => resolve(fileStream));
        fileStream.on("error", (e) => reject(new Error(e.toString())));
      });
      r.setHeader("Content-Type", MIME[path.extname(filePath).slice(1)]);
      fileStream.pipe(r);
      return;
    }

    r.writeHead(404);
    r.end();
  };

  const server = http.createServer(async (_, r) => {
    try {
      await requestHandler(r);
    } catch (error) {
      console.warn({ recover: "requestHandler", date: new Date() });
      console.warn(error);
      try {
        r.writeHead(500); // if it's already called inside requestHandler(), the "can't set headers after they are sent" will be thrown
      } catch (_) {} // just ignore errors here
      try {
        r.end();
      } catch (_) {} // just ignore errors here
    }
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
https://github.com/XIU2/UserScript/blob/master/GithubEnhanced-High-Speed-Download.user.js#L40
https://github.com/clevert-app/clevert/releases/download/asset_zcodecs_12.0.0_10664137139/linux-x64.zip
*/
