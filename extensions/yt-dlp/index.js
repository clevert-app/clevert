// @ts-check
/** @import { Extension, ClevertUtils } from "../../index.js" */
import child_process from "node:child_process";
import path from "node:path";
const /** @type {ClevertUtils} */ cu = globalThis.clevertUtils;
const consts = globalThis.process && {
  exe: path.join(import.meta.dirname, "yt-dlp"),
};
const i18nRes = (() => {
  const enus = {
    description: () =>
      "Download audio/video from thousands of sites like YouTube, Instagram, TikTok, Bilibili, etc.",
    url: () => "URL",
    audioQuality: () => "Audio quality",
    videoQuality: () => "Video quality",
    youtube: () => "YouTube video download",
    youtubeDescription: () => "Download any quality audio/video from YouTube",
    bilibili: () => "Bilibili video download",
    bilibiliDescription: () => "Download any quality audio/video from Bilibili",
    useCookies: () => "Use cookies",
    embedCover: () => "Embed cover",
  };
  /** @type {Readonly<typeof enus>} */
  const zhcn = {
    description: () =>
      "从各大网站下载音频/视频，支持包括 YouTube、Instagram、哔哩哔哩 等上千个网站",
    url: () => "链接",
    videoQuality: () => "视频质量",
    audioQuality: () => "音频质量",
    youtube: () => "YouTube 视频下载",
    youtubeDescription: () => "从 YouTube 下载任意质量的 音频/视频",
    bilibili: () => "哔哩哔哩 视频下载",
    bilibiliDescription: () => "从哔哩哔哩 下载任意质量的 音频/视频",
    useCookies: () => "使用 cookies",
    embedCover: () => "嵌入封面",
  };
  return {
    "en-US": /** @type {Readonly<typeof enus>} */ (enus),
    "zh-CN": zhcn,
  };
})();
const i18n = i18nRes[cu.locale];

/** @type {Extension} */
export default {
  id: "yt-dlp",
  version: "0.1.0",
  name: "yt-dlp",
  description: i18n.description(),
  dependencies: [], // python?
  assets: [
    {
      platforms: ["linux-x64"],
      kind: "bin",
      path: "./yt-dlp",
      url: "https://github.com/yt-dlp/yt-dlp/releases/download/2025.06.09/yt-dlp",
    },
    {
      platforms: ["mac-arm64"],
      kind: "bin",
      path: "./yt-dlp",
      url: "https://github.com/yt-dlp/yt-dlp/releases/download/2025.06.09/yt-dlp_macos",
    },
    {
      platforms: ["win-x64"],
      kind: "bin",
      path: "./yt-dlp.exe",
      url: "https://github.com/yt-dlp/yt-dlp/releases/download/2025.06.09/yt-dlp_x86.exe",
    },
  ],
  actions: [
    {
      id: "youtube",
      name: i18n.youtube(),
      description: i18n.youtubeDescription(),
      kind: "output-dir",
      ui: (profile) => {
        const $root = document.createElement("form");
        $root.classList.add("root");
        const css = String.raw;
        $root.appendChild(document.createElement("style")).textContent = css`
          .action .root {
            display: flex;
            flex-wrap: wrap;
            gap: 6px 12px;
          }
          .action .root fieldset {
            display: inline-grid;
            grid: auto / repeat(3, auto);
            gap: 0 6px;
          }
          .action .root hr {
            border: none;
            width: 100%;
            height: 0;
            margin: 0;
          }
          .action .root section {
            display: grid;
            grid-template-rows: 1fr;
            overflow: hidden;
            opacity: 1;
            transition: 0.3s;
          }
          .action .root section.off {
            grid-template-rows: 0fr;
            opacity: 0;
            margin-bottom: 0;
          }
          .action .root section > div {
            min-height: 0;
          }
          .action textarea {
            width: calc(100vw - 56px);
            resize: vertical;
            height: 5em;
          }
        `;

        const $urlLabel = document.createElement("label");
        $root.appendChild($urlLabel);
        $urlLabel.textContent = i18n.url();
        const $url = document.createElement("input");
        $urlLabel.appendChild($url);
        $url.placeholder = "youtu.be/theIDtheID"; // like: youtu.be/qQPpXOOvzPw

        $root.appendChild(document.createElement("hr"));

        const $audioQuality = document.createElement("fieldset");
        $root.appendChild($audioQuality);
        const $audioQualityLegend = document.createElement("legend");
        $audioQuality.appendChild($audioQualityLegend);
        $audioQualityLegend.textContent = i18n.audioQuality();
        for (const { label, value } of [
          { label: "192k", value: "139" },
          { label: "128k", value: "140" },
        ]) {
          const $label = document.createElement("label");
          $audioQuality.appendChild($label);
          $label.textContent = label;
          const $radio = document.createElement("input");
          $label.insertBefore($radio, $label.firstChild);
          $radio.type = "radio";
          $radio.name = "audio-quality";
          $radio.value = value;
          if (profile.audioQuality === value) $radio.checked = true;
          $radio.onchange = () => {
            if ($radio.checked) profile.audioQuality = value;
          };
        }

        const $videoQuality = document.createElement("fieldset");
        $root.appendChild($videoQuality);
        const $videoQualityLegend = document.createElement("legend");
        $videoQuality.appendChild($videoQualityLegend);
        $videoQualityLegend.textContent = i18n.videoQuality();
        for (const { label, value } of [
          { label: "1080p", value: "137" },
          { label: "720p", value: "136" },
          { label: "360p", value: "134" },
        ]) {
          const $label = document.createElement("label");
          $videoQuality.appendChild($label);
          $label.textContent = label;
          const $radio = document.createElement("input");
          $label.insertBefore($radio, $label.firstChild);
          $radio.type = "radio";
          $radio.name = "video-quality";
          $radio.value = value;
          if (profile.videoQuality === value) $radio.checked = true;
          $radio.onchange = () => {
            if ($radio.checked) profile.videoQuality = value;
          };
        }

        $root.appendChild(document.createElement("hr"));

        const $useCookiesLabel = document.createElement("label");
        $root.appendChild($useCookiesLabel);
        $useCookiesLabel.textContent = i18n.useCookies();
        const $useCookies = document.createElement("input");
        $useCookiesLabel.appendChild($useCookies);
        $useCookies.type = "checkbox";
        $useCookies.checked = !!profile.cookies;
        $useCookies.onchange = () =>
          $cookiesSection.classList.toggle("off", !$useCookies.checked);
        const $cookiesSection = document.createElement("section");
        $root.appendChild($cookiesSection);
        $cookiesSection.classList.toggle("off", !profile.cookies);
        const $cookiesDiv = document.createElement("div");
        $cookiesSection.appendChild($cookiesDiv);
        const $cookies = document.createElement("textarea");
        $cookiesDiv.appendChild($cookies);
        $cookies.placeholder =
          "# Netscape HTTP Cookie File\n.youtube.com TRUE / TRUE ...";

        return {
          root: $root,
          profile: () => {
            if ($useCookies.checked && !$cookies.value) {
              alert("cookies can not be empty when enabled");
              throw new Error("profile illegal");
            }
            profile.cookies = $useCookies.checked ? $cookies.value : "";
            return profile;
          },
          entries: () => {
            return [{ url: $url.value }];
          },
        };
      },
      execute: (profile, entry) => {
        // https://github.com/yt-dlp/yt-dlp/wiki/FAQ
        // https://gist.github.com/chamlis/38d1dbcf012336b43ab928ec1772b8fe
        const args = [];
        args.push("--ffmpeg-location", "/home/kkocdko/misc/apps/ffmpeg"); // --ffmpeg-location PATH    Location of the ffmpeg binary; either the path to the binary or its containing directory
        args.push("-f", profile.audioVariant + "+" + profile.videoVariant);
        args.push(entry.url);
        const cwd = entry.outputDir;
        const { promise, resolve, reject } = Promise.withResolvers();
        const child = child_process.spawn(consts.exe, args, { cwd });
        child.on("error", (error) => reject(error));
        child.on("exit", (v) => (v ? reject(new Error("" + v)) : resolve(0)));
        return {
          progress: () => 0,
          stop: () => child.kill(),
          promise,
        };
      },
    },
  ],
  profiles: [
    {
      id: "youtube",
      name: i18n.youtube(),
      description: i18n.youtubeDescription(),
      actionId: "youtube",
      extensionId: "yt-dlp",
      extensionVersion: "0.1.0",
      // below are fields for action
      audioQuality: "140",
      videoQuality: "137",
      // cookies: "",
      // below are fields for entries
      entries: {},
    },
  ],
};

// http://127.0.0.1:9393/static/extensions/yt-dlp/index.js
