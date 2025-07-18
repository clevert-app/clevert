// @ts-check
/** @import { ClevertUtils, Extension, Action, Profile } from "../../index.js" */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import child_process from "node:child_process";
const /** @type {ClevertUtils} */ cu = globalThis.clevertUtils;
const consts = globalThis.process && {
  exe: path.join(import.meta.dirname, "ffmpeg"),
};
const i18nRes = (() => {
  const enus = {
    description: () =>
      "FFmpeg multimedia suite for audio and video encoding/decoding/streaming/etc. Supports various modern and legacy format",
    general: () => "General",
    generalDescription: () => "General action for most of usage",
    toMp3: () => "To MP3",
    toMp3Description: () => "Convert audio/video to MP3 audio",
    dumpAudio: () => "Dump audio",
    dumpAudioDescription: () =>
      "Extract audio track from video file, without re-encoding",
    xiaowan: () => "Classic XiaoWan toolbox",
    xiaowanDescription: () => "H264 + AAC, same as classic XiaoWal toolbox",
    uarchive: () => "Ultra Compress and Slice for Archive",
    uarchiveDescription: () =>
      "With SVT-AV1 and OPUS, supports multi part slice",
    audio: () => "Audio",
    audioCustom: () => "Audio custom args",
    video: () => "Video",
    videoCustom: () => "Video custom args",
    codecOff: () => "off",
    codecCopy: () => "copy",
    codecCustom: () => "custom",
    bitrateControl: () => "Bitrate control",
    bitrate: () => "Bitrate",
    opusCompressionLevel: () => "Encode level (0-10:slow)",
    opusApplication: () => "Application",
    lameCompressionLevel: () => "Encode level (0-9:fast)",
    fastStart: () => "Optimize for playback fast start",
    noMeta: () => "Strip metadata",
    none: () => "None",
    defaultHint: () => "Keep default",
  };
  /** @type {Readonly<typeof enus>} */
  const zhcn = {
    description: () =>
      "FFmpeg 多媒体套件，用于音视频相关转换、编码解码、推流等，支持各种现代的和古老的格式",
    general: () => "通用转换",
    generalDescription: () => "适合大多数用途的通用转换动作",
    toMp3: () => "转换到 MP3",
    toMp3Description: () => "将音频或视频转换为 MP3 格式音频",
    dumpAudio: () => "提取音频",
    dumpAudioDescription: () => "从视频文件中提取音频轨道，无需重新编码",
    xiaowan: () => "小丸工具箱预设",
    xiaowanDescription: () => "H264 + AAC，参数与 小丸工具箱 相同",
    uarchive: () => "超高压缩切片存档",
    uarchiveDescription: () => "使用 SVT-AV1 和 OPUS，支持多切片",
    audio: () => "音频",
    audioCustom: () => "音频自定义参数",
    video: () => "视频",
    videoCustom: () => "视频自定义参数",
    codecOff: () => "不包含",
    codecCopy: () => "复制",
    codecCustom: () => "自定义",
    bitrateControl: () => "码率控制",
    bitrate: () => "比特率",
    opusCompressionLevel: () => "压缩等级 (0-10:慢)",
    opusApplication: () => "应用场景",
    lameCompressionLevel: () => "压缩等级 (0-9:快)",
    fastStart: () => "优化快速播放",
    noMeta: () => "不保留元数据",
    none: () => "无",
    defaultHint: () => "保持默认",
  };
  return {
    "en-US": /** @type {Readonly<typeof enus>} */ (enus),
    "zh-CN": zhcn,
  };
})();
const i18n = i18nRes[cu.locale];

const executeWithProgress = (args, totalInput = 0) => {
  /** `time2secs("00:03:22.45") === 202.45` */
  const time2secs = (/** @type {string} */ t) =>
    t.split(":").reduce((prev, cur) => +prev * 60 + +cur, 0); // [ 34, +"034", +034 ]
  const { promise, resolve, reject } = Promise.withResolvers();
  const child = child_process.spawn(consts.exe, args);
  let finished = 0;
  let total = totalInput;
  let pre = "";
  child.stderr.on("data", (/** @type {Buffer} */ data) => {
    const chunk = data.toString();
    if (total === 0) {
      pre += chunk;
      const matched = pre.match(/(?<= Duration: ).+?(?=,)/);
      if (matched) {
        total = time2secs(matched[0]);
        pre = "";
      }
    }
    if (!chunk.startsWith("frame=")) return;
    if (total === 0) total = 1; // the progress is already started, but still can not get duration
    const sliced = chunk.split(" time=")?.[1]?.split(" ")?.[0];
    if (!sliced || sliced === "N/A" || sliced.startsWith("-")) return; // deal with invalid timestamps like "-577014:32:22.77"
    finished = time2secs(sliced);
  });
  child.on("error", (error) => reject(error));
  child.on("exit", (v) => (v ? reject(new Error("" + v)) : resolve(0)));
  return {
    child,
    controller: {
      progress: () => finished / (total || 1),
      stop: () => {
        console.log("stopping ffmpeg");
        child.kill();
        // todo: use stdin command quit?
      },
      promise,
    },
  };
};

/** @type {Action} */
const generalAction = {
  id: "general",
  name: i18n.general(),
  description: i18n.generalDescription(),
  kind: "common-files",
  ui: (profile) => {
    const $root = document.createElement("form");
    $root.classList.add("root");
    const css = String.raw;
    $root.appendChild(document.createElement("style")).textContent = css`
      .action .root {
        margin-right: -12px;
      }
      .action .root > *,
      .action .root section > div > * {
        margin: 0 12px 6px 0;
      }
      .action .root fieldset {
        display: inline-grid;
        grid: auto / repeat(3, auto);
        gap: 0 10px;
      }
      .action .root .contains-switch {
        display: block;
        margin-bottom: 2px;
      }
      .action .root section {
        display: grid;
        grid-template-rows: 1fr;
        overflow: hidden;
        opacity: 1;
        transition: 0.3s;
        margin-bottom: 10px;
      }
      .action .root section.off {
        grid-template-rows: 0fr;
        opacity: 0;
        margin-bottom: 0;
      }
      .action .root section > div {
        min-height: 0;
      }
      /* https://css-tricks.com/css-grid-can-do-auto-height-transitions/ */
    `;
    $root.addEventListener("post-remove", (e) => console.log(e));

    const $audio = document.createElement("fieldset");
    $root.appendChild($audio);
    const $audioLegend = document.createElement("legend");
    $audio.appendChild($audioLegend);
    $audioLegend.textContent = i18n.audio();
    const g$audioRadio = (value, label = "") => {
      const $radioLabel = document.createElement("label");
      $audio.appendChild($radioLabel);
      $radioLabel.textContent = label || value;
      const $radio = document.createElement("input");
      $radioLabel.appendChild($radio);
      $radio.type = "radio";
      $radio.name = "audio";
      $radio.value = value;
      return $radio;
    };
    g$audioRadio("off", i18n.codecOff()).checked = profile.audioCodec === "off";
    g$audioRadio("copy", i18n.codecCopy()).checked =
      profile.audioCodec === "copy";
    $audio.onchange = () => {
      $aCustomSection.classList.toggle("off", !$aCustomRadio.checked);
      $aacSection.classList.toggle("off", !$aacRadio.checked);
      $libopusSection.classList.toggle("off", !$libopusRadio.checked);
      $libmp3lameSection.classList.toggle("off", !$libmp3lameRadio.checked);
    };

    const $aCustomRadio = g$audioRadio("aCustom", i18n.codecCustom());
    $aCustomRadio.checked = profile.audioCodec === "aCustom";
    const $aCustomSection = document.createElement("section");
    $root.appendChild($aCustomSection);
    $aCustomSection.classList.toggle("off", !$aCustomRadio.checked);
    const $aCustomDiv = document.createElement("div");
    $aCustomSection.appendChild($aCustomDiv);
    const $aCustomArgsLabel = document.createElement("label");
    $aCustomDiv.appendChild($aCustomArgsLabel);
    $aCustomArgsLabel.textContent = i18n.audioCustom();
    const $aCustomArgs = document.createElement("input");
    $aCustomArgsLabel.appendChild($aCustomArgs);
    $aCustomArgs.value = profile.codecs.aCustom.args;
    $aCustomArgs.placeholder = i18n.none();

    const $aacRadio = g$audioRadio("aac");
    $aacRadio.checked = profile.audioCodec === "aac";
    const $aacSection = document.createElement("section");
    $root.appendChild($aacSection);
    $aacSection.classList.toggle("off", !$aacRadio.checked);
    const $aacDiv = document.createElement("div");
    $aacSection.appendChild($aacDiv);
    const $aacBitrateLabel = document.createElement("label");
    $aacDiv.appendChild($aacBitrateLabel);
    $aacBitrateLabel.textContent = i18n.bitrate();
    const $aacBitrate = document.createElement("input");
    $aacBitrateLabel.appendChild($aacBitrate);
    $aacBitrate.value = profile.codecs.aac.bitrate;
    $aacBitrate.placeholder = i18n.defaultHint();

    const $libopusRadio = g$audioRadio("libopus");
    $libopusRadio.checked = profile.audioCodec === "libopus";
    const $libopusSection = document.createElement("section");
    $root.appendChild($libopusSection);
    $libopusSection.classList.toggle("off", !$libopusRadio.checked);
    const $libopusDiv = document.createElement("div");
    $libopusSection.appendChild($libopusDiv);
    const $libopusVbr = document.createElement("fieldset");
    $libopusDiv.appendChild($libopusVbr);
    const $libopusVbrLegend = document.createElement("legend");
    $libopusVbr.appendChild($libopusVbrLegend);
    $libopusVbrLegend.textContent = i18n.bitrateControl();
    const g$libopusVbrRadio = (value, label) => {
      const $radioLabel = document.createElement("label");
      $libopusVbr.appendChild($radioLabel);
      $radioLabel.textContent = label || value;
      const $radio = document.createElement("input");
      $radioLabel.appendChild($radio);
      $radio.type = "radio";
      $radio.name = "libopus-vbr";
      $radio.value = value;
      return $radio;
    };
    g$libopusVbrRadio("off", "CBR").checked =
      profile.codecs.libopus.vbr === "off";
    g$libopusVbrRadio("on", "VBR").checked =
      profile.codecs.libopus.vbr === "on";
    g$libopusVbrRadio("constrained", "CVBR").checked =
      profile.codecs.libopus.vbr === "constrained";
    const $libopusBitrateLabel = document.createElement("label");
    $libopusDiv.appendChild($libopusBitrateLabel);
    $libopusBitrateLabel.textContent = i18n.bitrate();
    const $libopusBitrate = document.createElement("input");
    $libopusBitrateLabel.appendChild($libopusBitrate);
    $libopusBitrate.value = profile.codecs.libopus.bitrate;
    $libopusBitrate.placeholder = i18n.defaultHint();
    const $libopusCompLevelLabel = document.createElement("label");
    $libopusDiv.appendChild($libopusCompLevelLabel);
    $libopusCompLevelLabel.textContent = i18n.opusCompressionLevel();
    const $libopusCompLevel = document.createElement("input");
    $libopusCompLevelLabel.appendChild($libopusCompLevel);
    $libopusCompLevel.value = profile.codecs.libopus.compressionLevel;
    $libopusCompLevel.placeholder = i18n.defaultHint();
    const $libopusApplication = document.createElement("fieldset"); // void | audio | lowdelay
    $libopusDiv.appendChild($libopusApplication);
    const $libopusApplicationLegend = document.createElement("legend");
    $libopusApplication.appendChild($libopusApplicationLegend);
    $libopusApplicationLegend.textContent = i18n.opusApplication();
    const g$libopusApplicationRadio = (value, label) => {
      const $radioLabel = document.createElement("label");
      $libopusApplication.appendChild($radioLabel);
      $radioLabel.textContent = label || value;
      const $radio = document.createElement("input");
      $radioLabel.appendChild($radio);
      $radio.type = "radio";
      $radio.name = "libopus-application";
      $radio.value = value;
      return $radio;
    };
    g$libopusApplicationRadio("voip", "VoIP").checked =
      profile.codecs.libopus.application === "voip";
    g$libopusApplicationRadio("audio", "Audio").checked =
      profile.codecs.libopus.application === "audio";
    g$libopusApplicationRadio("lowdelay", "Low delay").checked =
      profile.codecs.libopus.application === "lowdelay";

    const $libmp3lameRadio = g$audioRadio("libmp3lame");
    $libmp3lameRadio.checked = profile.audioCodec === "libmp3lame";
    const $libmp3lameSection = document.createElement("section");
    $root.appendChild($libmp3lameSection);
    $libmp3lameSection.classList.toggle("off", !$libmp3lameRadio.checked);
    const $libmp3lameDiv = document.createElement("div");
    $libmp3lameSection.appendChild($libmp3lameDiv);
    const $libmp3lameBitrateLabel = document.createElement("label");
    $libmp3lameDiv.appendChild($libmp3lameBitrateLabel);
    $libmp3lameBitrateLabel.textContent = i18n.bitrate();
    const $libmp3lameBitrate = document.createElement("input");
    $libmp3lameBitrateLabel.appendChild($libmp3lameBitrate);
    $libmp3lameBitrate.value = profile.codecs.libmp3lame.bitrate;
    $libmp3lameBitrate.placeholder = i18n.defaultHint();
    const $libmp3lameCompLevelLabel = document.createElement("label");
    $libmp3lameDiv.appendChild($libmp3lameCompLevelLabel);
    $libmp3lameCompLevelLabel.textContent = i18n.lameCompressionLevel();
    const $libmp3lameCompLevel = document.createElement("input");
    $libmp3lameCompLevelLabel.appendChild($libmp3lameCompLevel);
    $libmp3lameCompLevel.value = profile.codecs.libmp3lame.compressionLevel;
    $libmp3lameCompLevel.placeholder = i18n.defaultHint();

    const $video = document.createElement("fieldset");
    $root.appendChild($video);
    const $videoLegend = document.createElement("legend");
    $video.appendChild($videoLegend);
    $videoLegend.textContent = i18n.video();
    const g$videoRadio = (value, label) => {
      const $radioLabel = document.createElement("label");
      $video.appendChild($radioLabel);
      $radioLabel.textContent = label || value;
      const $radio = document.createElement("input");
      $radioLabel.appendChild($radio);
      $radio.type = "radio";
      $radio.name = "video";
      $radio.value = value;
      return $radio;
    };
    g$videoRadio("off", i18n.codecOff()).checked = profile.videoCodec === "off";
    g$videoRadio("copy", i18n.codecCopy()).checked =
      profile.videoCodec === "copy";
    $video.onchange = () => {
      $vCustomSection.classList.toggle("off", !$vCustomRadio.checked);
    };

    const $vCustomRadio = g$videoRadio("vCustom", i18n.codecCustom());
    $vCustomRadio.checked = profile.videoCodec === "vCustom";
    const $vCustomSection = document.createElement("section");
    $root.appendChild($vCustomSection);
    $vCustomSection.classList.toggle("off", !$vCustomRadio.checked);
    const $vCustomDiv = document.createElement("div");
    $vCustomSection.appendChild($vCustomDiv);
    const $vCustomArgsLabel = document.createElement("label");
    $vCustomDiv.appendChild($vCustomArgsLabel);
    $vCustomArgsLabel.textContent = i18n.videoCustom();
    const $vCustomArgs = document.createElement("input");
    $vCustomArgsLabel.appendChild($vCustomArgs);
    $vCustomArgs.value = profile.codecs.vCustom.args;
    $vCustomArgs.placeholder = i18n.none();

    const $fastStartLabel = document.createElement("label");
    $root.appendChild($fastStartLabel);
    $fastStartLabel.textContent = i18n.fastStart();
    const $fastStart = document.createElement("input");
    $fastStartLabel.appendChild($fastStart);
    $fastStart.type = "checkbox";
    $fastStart.checked = profile.fastStart;

    const $noMetaLabel = document.createElement("label");
    $root.appendChild($noMetaLabel);
    $noMetaLabel.textContent = i18n.noMeta();
    const $noMeta = document.createElement("input");
    $noMetaLabel.appendChild($noMeta);
    $noMeta.type = "checkbox";
    $noMeta.checked = profile.noMeta;

    return {
      root: $root,
      profile: () => {
        const checked = (el) =>
          el.querySelector("input[type=radio]:checked").value;
        profile.codecs.aCustom = {
          args: $aCustomArgs.value,
        };
        profile.codecs.vCustom = {
          args: $vCustomArgs.value,
        };
        profile.codecs.aac = {
          bitrate: $aacBitrate.value,
        };
        profile.codecs.libopus = {
          vbr: checked($libopusVbr),
          bitrate: $libopusBitrate.value,
          compressionLevel: $libopusCompLevel.value,
          application: checked($libopusApplication),
        };
        profile.codecs.libmp3lame = {
          bitrate: $libmp3lameBitrate.value,
          compressionLevel: $libmp3lameCompLevel.value,
        };
        profile.audioCodec = checked($audio);
        profile.videoCodec = checked($video);
        profile.fastStart = $fastStart.checked;
        profile.noMeta = $noMeta.checked;
        return profile;
      },
    };
  },
  execute: (profile, { input, output }) => {
    // ffmpeg -hide_banner -i i.mp4 -vn -c:a copy -movflags faststart -map_metadata -1 -y o.mp4
    const args = ["-hide_banner", "-i", input];
    if (profile.audioCodec === "off") {
      args.push("-an");
    } else if (profile.audioCodec === "copy") {
      args.push("-c:a", "copy");
    } else if (profile.audioCodec === "aCustom") {
      args.push(...profile.codecs.aCustom.args.split(" ")); // todo: keep quotes
    } else if (profile.audioCodec === "aac") {
      args.push("-c:a", "aac");
      if (profile.codecs.aac.bitrate)
        args.push("-b:a", profile.codecs.aac.bitrate);
      if (profile.codecs.aac.profile)
        args.push("-profile:a", profile.codecs.aac.profile);
    } else if (profile.audioCodec === "libopus") {
      args.push("-c:a", "libopus");
      args.push("-vbr", profile.codecs.libopus.vbr);
      if (profile.codecs.libopus.bitrate)
        args.push("-b:a", profile.codecs.libopus.bitrate);
      const compLevel = profile.codecs.libopus.compressionLevel;
      args.push("-compression_level", compLevel);
      if (profile.codecs.libopus.application)
        args.push("-application", profile.codecs.libopus.application);
    } else if (profile.audioCodec === "libmp3lame") {
      args.push("-c:a", "libmp3lame");
      if (profile.codecs.libmp3lame.bitrate)
        args.push("-b:a", profile.codecs.libmp3lame.bitrate);
      const compLevel = profile.codecs.libmp3lame.compressionLevel;
      args.push("-compression_level", compLevel);
    } else {
      cu.assert(false, `Unknown audio codec: ${profile.audioCodec}`);
    }
    if (profile.videoCodec === "off") {
      args.push("-vn");
    } else if (profile.videoCodec === "copy") {
      args.push("-c:v", "copy");
    } else if (profile.videoCodec === "vCustom") {
      args.push(...profile.codecs.vCustom.args.split(" "));
    } else if (profile.videoCodec === "libx264") {
      args.push("-c:v", "libx264");
      if (profile.codecs.libx264.crf)
        args.push("-crf", profile.codecs.libx264.crf);
      if (profile.codecs.libx264.preset)
        args.push("-preset:v", profile.codecs.libx264.preset);
    } else {
      cu.assert(false, `Unknown video codec: ${profile.videoCodec}`);
    }
    if (profile.fastStart) args.push("-movflags", "faststart"); // this option is only for MP4, M4A, M4V, MOV
    if (profile.noMeta) args.push("-map_metadata", "-1");
    args.push(output);
    return executeWithProgress(args).controller;
  },
};

/** @type {Profile} */
const generalProfile = {
  id: "general",
  name: i18n.general(),
  description: i18n.generalDescription(),
  actionId: "general",
  extensionId: "ffmpeg",
  extensionVersion: "0.1.0",
  // below are fields for action
  codecs: {
    aCustom: { args: "" },
    vCustom: { args: "" },
    aac: {
      bitrate: "128k",
      profile: "aac_low", // aac_low | mpeg2_aac_low | aac_ltp
    },
    libopus: {
      vbr: "on", // off (hard-cbr) | on (vbr) | constrained (cvbr)
      bitrate: "", // 128k
      // quality: "6",
      compressionLevel: "10",
      application: "audio", // voip | audio | lowdelay
    },
    libmp3lame: {
      // vbr: false, // https://trac.ffmpeg.org/wiki/Encode/MP3
      bitrate: "128k",
      // quality: "6",
      compressionLevel: "0",
    },
    libx264: {
      // https://trac.ffmpeg.org/wiki/Encode/H.264
      crf: "24",
      preset: "veryslow",
    },
    libsvtav1: {
      crf: "44",
      preset: "1",
      gop: "300",
    },
  },
  audioCodec: "off",
  videoCodec: "off",
  fastStart: true,
  noMeta: false,
  // below are fields for entries
  entries: {
    outputExtensions: ["mp4", "mkv", "webm"],
    ifExists: "force",
  },
};

/** @type {Extension} */
export default {
  id: "ffmpeg",
  version: "0.1.0",
  name: "ffmpeg",
  description: i18n.description(),
  dependencies: [],
  assets: [
    {
      platforms: ["linux-x64"],
      kind: "zip",
      path: "./",
      url: "https://github.com/clevert-app/clevert/releases/download/asset_ffmpeg_20240929_11085784184/linux-x64.zip",
    },
    {
      platforms: ["mac-arm64"],
      kind: "zip",
      path: "./",
      url: "https://github.com/clevert-app/clevert/releases/download/asset_ffmpeg_20240929_11085784184/mac-arm64.zip",
    },
    {
      platforms: ["win-x64"],
      kind: "zip",
      path: "./",
      url: "https://github.com/clevert-app/clevert/releases/download/asset_ffmpeg_20240929_11085784184/win-x64.zip",
    },
  ],
  actions: [
    generalAction,
    {
      id: "uarchive",
      name: i18n.uarchive(),
      description: i18n.uarchiveDescription(),
      kind: "common-files",
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
          .action textarea {
            width: calc(100vw - 56px);
            resize: vertical;
            height: 5em;
          }
        `;
        $root.addEventListener("post-remove", (e) => console.log(e));

        const $partsLabel = document.createElement("label");
        $root.appendChild($partsLabel);
        $partsLabel.textContent = "Parts";
        const $parts = document.createElement("input");
        $partsLabel.appendChild($parts);
        $parts.value = profile.parts ?? "";

        const $seekPadLabel = document.createElement("label");
        $root.appendChild($seekPadLabel);
        $seekPadLabel.textContent = "Seek Pad";
        const $seekPad = document.createElement("input");
        $seekPadLabel.appendChild($seekPad);
        $seekPad.type = "number";
        $seekPad.value = profile.seekPad ?? "";

        const $extraParamsLabel = document.createElement("label");
        $root.appendChild($extraParamsLabel);
        $extraParamsLabel.textContent = "Extra Params";
        const $extraParams = document.createElement("textarea");
        $extraParamsLabel.appendChild($extraParams);
        $extraParams.value = profile.extraParams ?? "";

        return {
          root: $root,
          profile: () => {
            profile.parts = $parts.value;
            profile.seekPad = $seekPad.value;
            profile.extraParams = $extraParams.value;
            return profile;
          },
        };
      },
      execute: (profile, { input, output }) => {
        const /** @type {string[][]} */ partsArgs = [];
        const seekPad = Number(profile.seekPad);
        let totalLength = 0;
        for (const part of profile.parts.trim().split(/,\s?/)) {
          const [begin, end] = part.split("-").map((v) => Number(v));
          totalLength += end - begin;
          const cur = ["-hide_banner"];
          // the -ss before -i do fast inaccurate keyframe-seek, so we seek to near the begin then use slow accurate decoded-seek
          if (begin > seekPad) {
            cur.push("-ss", String(begin - seekPad), "-i", input);
            cur.push("-ss", String(seekPad));
            cur.push("-to", String(end - begin + seekPad));
          } else {
            cur.push("-ss", String(0), "-i", input);
            cur.push("-ss", String(begin));
            cur.push("-to", String(end));
          }
          cur.push("-c:v", "rawvideo", "-c:a", "pcm_s16le");
          cur.push("-f", "matroska", "-y", "-");
          partsArgs.push(cur);
        }
        let cleanup = () => console.warn("empty cleanup function");
        const server = http.createServer((_, res) => {
          const v = partsArgs.shift();
          if (!v) return console.warn("no more parts");
          const child = child_process.spawn(consts.exe, v);
          cleanup = () => {
            if (child.exitCode === null) child.kill();
            server.close(() => {});
          };
          child.stdout.pipe(res);
        });
        server.listen(0, "127.0.0.1", () => {
          const port = /** @type {any} */ (server.address())?.port;
          child.stdin.end(
            "ffconcat version 1.0\n" +
              `file 'http://127.0.0.1:${port}'\n`.repeat(partsArgs.length)
          );
        });
        const args = ["-hide_banner"];
        args.push("-safe", "0", "-protocol_whitelist", "file,http,tcp,fd");
        args.push("-f", "concat", "-i", "-");
        args.push(...profile.extraParams.split(" "));
        args.push(output);
        const { child, controller } = executeWithProgress(args, totalLength);
        controller.promise.finally(() => cleanup());
        return {
          progress: controller.progress,
          stop() {
            controller.stop();
            cleanup();
          },
          promise: controller.promise,
        };
        // todo: Svt[warn]: Failed to set thread priority: Invalid argument
      },
    },
    {
      // todo: work in progress
      id: "slice_download",
      name: "slice_download",
      description: "slice_download",
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
        `;
        $root.addEventListener("post-remove", (e) => console.log(e));

        const $urlLabel = document.createElement("label");
        $root.appendChild($urlLabel);
        $urlLabel.textContent = "URL";
        const $url = document.createElement("input");
        $urlLabel.appendChild($url);
        $url.value = profile.url ?? "";

        const $rangesLabel = document.createElement("label");
        $root.appendChild($rangesLabel);
        $rangesLabel.textContent = "Ranges";
        const $ranges = document.createElement("input");
        $rangesLabel.appendChild($ranges);
        $ranges.value = profile.ranges ?? ""; // format: "12-34.5, 67-89.1"

        return {
          root: $root,
          profile: () => {
            return profile;
          },
          entries: () => {
            return [{ url: $url.value, ranges: $ranges.value }];
          },
        };
      },
      execute: (profile, entry) => {
        // todo: run a http server, ffmpeg use the 127.0.0.1 url, and cache the real url and requests and bodys
        let [contentType, contentLength] = ["", ""];
        const cached = /** @type {Map<string, Uint8Array[]>} */ (new Map());
        const address = Promise.withResolvers();
        const server = http.createServer(async (req, res) => {
          if (!contentType || !contentLength) {
            const response = await fetch(entry.url, {
              method: "HEAD",
              redirect: "follow",
              headers: { connection: "close" },
            });
            contentType = response.headers.get("content-type") || "";
            contentLength = response.headers.get("content-length") || "";
            console.log({ contentLength });
          }
          if (!req.headers.range)
            return res.writeHead(400).end("only range requests allowed");
          let got = cached.get(req.headers.range);
          if (contentType && contentLength && got) {
            console.info(`cache: hit ${req.headers.range}`);
            res.writeHead(206, {
              "accept-ranges": "bytes",
              "content-type": contentType,
              "content-length": String(
                got.reduce((sum, v) => sum + v.byteLength, 0)
              ),
              "content-range":
                req.headers.range.replace("=", " ") + "/" + contentLength,
            });
            for (const chunk of got) {
              if (!res.writable) break;
              await new Promise((resolve) => res.write(chunk, resolve));
            }
            await cu.sleep(500);
            return res.end();
          } else {
            console.info(`cache: miss ${req.headers.range}`);
            let response = null;
            for (let i = 0; !(response?.body && response?.ok) && i != 5; i++) {
              response = await fetch(entry.url, {
                method: "GET",
                redirect: "follow",
                headers: { range: req.headers.range, connection: "close" },
              });
              await cu.sleep(500);
            }
            cu.assert(response?.body && response?.ok);
            res.writeHead(206, {
              "accept-ranges": "bytes",
              "content-type": response.headers.get("content-type") || "",
              "content-length": response.headers.get("content-length") || "",
              "content-range": response.headers.get("content-range") || "",
            });
            // if not "0-" and not suffix, do not cache
            const begin = Number(req.headers.range.match(/\d+/)?.[0]);
            const suffixMaxLen = 1024 * 1024 * 8;
            const needsCache =
              begin === 0 || begin + suffixMaxLen > +contentLength;
            const chunks = [];
            for await (const chunk of response.body) {
              if (needsCache) chunks.push(chunk);
              if (!res.writable) break;
              const error = new Promise((resolve) => res.write(chunk, resolve));
              if (await error) break;
            }
            if (needsCache) {
              cached.set(req.headers.range, chunks);
              console.info(`cache: stored ${req.headers.range}`);
            } else {
              console.info(`cache: skipped ${req.headers.range}`);
            }
            res.end();
            return;
          }
        });
        server.listen();
        server.on("listening", () => {
          const a = /** @type {any} */ (server.address());
          if (!a?.port) address.reject("address has no port");
          address.resolve(`http://127.0.0.1:${a.port}`);
        });
        const marginBeforeStart = 20; // seconds
        const promise = (async () => {
          for (const range of entry.ranges.trim().split(/,\s?/g)) {
            /** @type {number[]} */
            const [start, end] = range.split("-").map((v) => +v);
            const args = ["-hide_banner"];
            args.push("-ss", String(start - marginBeforeStart));
            args.push("-i", await address.promise);
            args.push("-ss", String(marginBeforeStart));
            args.push("-to", String(end - start + marginBeforeStart));
            args.push("-c:v", "libx264", "-crf", "28", "-preset", "veryfast");
            args.push("-f", "matroska");
            args.push("-y", `/tmp/ffmpeg-${range}.mkv`);
            const child = child_process.spawn(consts.exe, args);
            const { promise, resolve, reject } = Promise.withResolvers();
            child.stdout.on("data", (data) => {
              console.info(`>>> stdout: ${data.toString()}`);
            });
            child.stderr.on("data", (data) => {
              console.info(`>>> stderr: ${data.toString()}`);
            });
            child.on("error", (err) => reject(err));
            child.on("exit", (code) => (code ? reject(code) : resolve(code)));
            await promise;
          }
        })();
        promise.finally(() => server.close());
        return {
          progress: () => 0, // for detail progress within single file, like ffmpeg, so others just returns 0
          stop: () => {},
          promise,
        };
      },
    },
  ],
  // a profile should be a pure json that can be store by non-developers
  profiles: [
    generalProfile,
    {
      id: "to_mp3",
      name: i18n.toMp3(),
      description: i18n.toMp3Description(),
      actionId: "general",
      extensionId: "ffmpeg",
      extensionVersion: "0.1.0",
      // below are fields for action
      codecs: generalProfile.codecs,
      audioCodec: "libmp3lame",
      videoCodec: "off",
      fastStart: true,
      noMeta: false,
      // below are fields for entries
      entries: {
        outputExtensions: ["mp3"],
      },
    },
    {
      id: "dump_audio",
      name: i18n.dumpAudio(),
      description: i18n.dumpAudioDescription(),
      actionId: "general",
      extensionId: "ffmpeg",
      extensionVersion: "0.1.0",
      // below are fields for action
      codecs: generalProfile.codecs,
      audioCodec: "copy",
      videoCodec: "off",
      fastStart: true,
      noMeta: false,
      // below are fields for entries
      entries: {
        inputExtensions: ["mp4", "mkv", "webm", "avi", "flv"],
        outputExtensions: ["m4a", "mp4"],
      },
    },
    {
      id: "xiaowan", // https://maruko.appinn.me/
      name: i18n.xiaowan(),
      description: i18n.xiaowanDescription(),
      actionId: "general",
      extensionId: "ffmpeg",
      extensionVersion: "0.1.0",
      // below are fields for action
      codecs: {
        ...generalProfile.codecs,
        vCustom: {
          // x264 --crf 24 --preset 8 -r 6 -b 6 -I infinite -i 1 --scenecut 60 -f 1:1 --qcomp 0.5 --psy-rd 0.3:0 --aq-mode 2 --aq-strength 0.8 --vf resize:768,432,,,,lanczos -o "%~dpn1_v.mp4" "%~1"
          args: "-c:v libx264 -x264-params crf=24:preset=8:ref=6:bframes=6:keyint=infinite:min-keyint=1:scenecut=60:deblock=1,1:qcomp=0.5:psy-rd=0.3,0:aq-mode=2:aq-strength=0.8",
        },
      },
      audioCodec: "aac",
      videoCodec: "vCustom",
      fastStart: true,
      noMeta: true,
      // below are fields for entries
      entries: {
        inputDir: "/home/kkocdko/misc/code/clevert/temp/_test_res/video_i",
        outputDir: "/home/kkocdko/misc/code/clevert/temp/_test_res/video_o",
        outputExtensions: ["mp4", "mkv", "webm"],
      },
    },
    {
      id: "uarchive",
      name: i18n.uarchive(),
      description: i18n.uarchiveDescription(),
      actionId: "uarchive",
      extensionId: "ffmpeg",
      extensionVersion: "0.1.0",
      // below are fields for action
      parts: "40-55,162-172,203-217",
      seekPad: "30", // most videos have keyframe gap less than 30s
      extraParams:
        "-c:v libsvtav1 -preset 0 -crf 49 -svtav1-params tune=0 -g 300 -ac 1 -c:a libopus -vbr on -compression_level 10 -map_metadata -1 -movflags faststart",
      // below are fields for entries
      entries: {
        mode: "files",
        inputExtensions: ["mp4"],
        outputExtensions: ["mp4"],
      },
    },
    /*
    {
      // todo: work in progress
      id: "slice_download", // 约定：对于相同的 action, 这个profile列表中 profile.id == action.id 的就是默认的
      name: "slice_download",
      description: "从支持 HTTP Range 请求的服务器下载视频的一部分",
      actionId: "slice_download",
      extensionId: "ffmpeg",
      extensionVersion: "0.1.0",
      url: "https://dl-z01a-0046.mypikpak.com/download/?fid=3mA6W",
      ranges: "1148-1152, 1240-1255.3",
      // todo: 用户：我上次output dir 到这，这次还想要到这，存profile 里，所以 entries 选项放在profile 里而不是固定在 action里
      // 对 entries 的选项 给出建议, 此处的 entries 只适用于 action kind: "common-files"
      entries: {
        // inputDir: "/home/kkocdko/misc/code/clevert/temp/_test_res/i",
        // outputDir: "/home/kkocdko/misc/code/clevert/temp/_test_res/o",
        // inputExtensions: ["jxl", "jpeg", "jpg", "png", "apng"],
        // outputExtensions: ["jpeg", "jpg"], // 第一个是默认的
        // outputExtension: "jpg", // 或者指定一个默认的
      },
    },
    */
  ],
};

// https://blog.csdn.net/kunyus/article/details/109111759
// https://zhuanlan.zhihu.com/p/1919229481572340130
