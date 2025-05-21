// @ts-check
/** @import { Extension, ClevertUtils } from "../../index.js" */
import child_process from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import http from "node:http";
import stream from "node:stream";
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
    containsAudio: () => "Contains audio",
    audioExtra: () => "Audio extra args",
    containsVideo: () => "Contains video",
    videoExtra: () => "Video extra args",
    noMetadata: () => "Strip metadata",
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
    containsAudio: () => "包含音频",
    audioExtra: () => "音频附加参数",
    containsVideo: () => "包含视频",
    videoExtra: () => "视频附加参数",
    noMetadata: () => "不保留元数据",
    none: () => "无",
    defaultHint: () => "保持默认",
  };
  return {
    "en-US": /** @type {Readonly<typeof enus>} */ (enus),
    "zh-CN": zhcn,
  };
})();
const i18n = i18nRes[cu.locale];

const executeWithProgress = (args) => {
  /** `time2secs("00:03:22.45") === 202.45` */
  const time2secs = (/** @type {string} */ t) =>
    t.split(":").reduce((prev, cur) => +prev * 60 + +cur, 0); // [ 34, +"034", +034 ]
  const { promise, resolve, reject } = Promise.withResolvers();
  const child = child_process.spawn(consts.exe, args);
  let finished = 0;
  let amount = 0;
  let pre = "";
  child.stderr.on("data", (/** @type {Buffer} */ data) => {
    const chunk = data.toString();
    if (amount === 0) {
      pre += chunk;
      const matched = pre.match(/(?<= Duration: ).+?(?=,)/);
      if (matched) {
        amount = time2secs(matched[0]);
        pre = "";
      }
    }
    if (!chunk.startsWith("frame=")) return;
    if (amount === 0) amount = 1; // the progress is already started, but still can not get duration
    const sliced = chunk.split(" time=")?.[1]?.split(" ")?.[0];
    if (!sliced || sliced === "N/A" || sliced.startsWith("-")) return; // deal with invalid timestamps like "-577014:32:22.77"
    finished = time2secs(sliced);
  });
  child.on("error", (error) => reject(error));
  child.on("exit", (v) => (v ? reject(new Error("" + v)) : resolve(0)));
  return {
    progress: () => {
      let ret = finished / (amount || 1);
      return ret;
    },
    stop: () => {
      console.log("stopping ffmpeg");
      child.kill();
    },
    promise,
  };
};

/** @type {Extension} */
export default {
  id: "ffmpeg",
  version: "0.1.0",
  name: "FFmpeg",
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
    {
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
          .action .root > * {
            margin: 0 12px 6px 0;
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
          }
          .action .root section > div {
            min-height: 0;
          }
          /* https://css-tricks.com/css-grid-can-do-auto-height-transitions/ */
        `;
        $root.addEventListener("post-remove", (e) => console.log(e));

        const $audioLabel = document.createElement("label");
        $root.appendChild($audioLabel);
        $audioLabel.classList.add("contains-switch");
        $audioLabel.textContent = i18n.containsAudio();
        const $audio = document.createElement("input");
        $audioLabel.insertBefore($audio, $audioLabel.firstChild);
        $audio.type = "checkbox";
        $audio.checked = profile.audio;
        $audio.onchange = () =>
          $audioSectionContainer.classList.toggle("off", !$audio.checked);
        const $audioSectionContainer = document.createElement("section");
        $root.appendChild($audioSectionContainer);
        $audioSectionContainer.classList.toggle("off", !$audio.checked);
        const $audioSection = document.createElement("div");
        $audioSectionContainer.appendChild($audioSection);

        const $audioExtraLabel = document.createElement("label");
        $audioSection.appendChild($audioExtraLabel);
        $audioExtraLabel.textContent = i18n.audioExtra();
        const $audioExtra = document.createElement("input");
        $audioExtraLabel.appendChild($audioExtra);
        $audioExtra.value = profile.audioExtra || "";
        $audioExtra.placeholder = i18n.none();

        const $videoLabel = document.createElement("label");
        $root.appendChild($videoLabel);
        $videoLabel.classList.add("contains-switch");
        $videoLabel.textContent = i18n.containsVideo();
        const $video = document.createElement("input");
        $videoLabel.insertBefore($video, $videoLabel.firstChild);
        $video.type = "checkbox";
        $video.checked = profile.video;
        $video.onchange = () =>
          $videoSectionContainer.classList.toggle("off", !$video.checked);
        const $videoSectionContainer = document.createElement("section");
        $root.appendChild($videoSectionContainer);
        $videoSectionContainer.classList.toggle("off", !$video.checked);
        const $videoSection = document.createElement("div");
        $videoSectionContainer.appendChild($videoSection);

        const $videoExtraLabel = document.createElement("label");
        $videoSection.appendChild($videoExtraLabel);
        $videoExtraLabel.textContent = i18n.videoExtra();
        const $videoExtra = document.createElement("input");
        $videoExtraLabel.appendChild($videoExtra);
        $videoExtra.value = profile.videoExtra || "";
        $videoExtra.placeholder = i18n.none();

        const $noMetadataLabel = document.createElement("label");
        $root.appendChild($noMetadataLabel);
        $noMetadataLabel.textContent = i18n.noMetadata();
        const $noMetadata = document.createElement("input");
        $noMetadataLabel.insertBefore($noMetadata, $noMetadataLabel.firstChild);
        $noMetadata.type = "checkbox";
        $noMetadata.checked = profile.noMetadata;

        return {
          root: $root,
          profile: () => {
            profile.audio = $audio.checked;
            profile.audioExtra = profile.audio ? $audioExtra.value.trim() : "";
            profile.video = $video.checked;
            profile.videoExtra = profile.video ? $videoExtra.value.trim() : "";
            profile.noMetadata = $noMetadata.checked;
            return profile;
          },
        };
      },
      execute: (profile, { input, output }) => {
        // ffmpeg -hide_banner -i i.mp4 -vn -c:a copy -movflags faststart -map_metadata -1 -y o.mp4
        const args = ["-hide_banner", "-i", input];
        if (profile.audio) {
          if (profile.audioExtra) {
            args.push(...profile.audioExtra.split(" ")); // todo: keep quotes
          }
        } else {
          args.push("-an");
        }
        if (profile.video) {
          if (profile.videoExtra) {
            args.push(...profile.videoExtra.split(" ")); // todo: keep quotes
          }
        } else {
          args.push("-vn");
        }
        // args.push("-movflags", "faststart");
        if (profile.noMetadata) args.push("-map_metadata", "-1");
        args.push(output);
        return executeWithProgress(args);
      },
    },
    {
      id: "dump_audio",
      name: i18n.dumpAudio(),
      description: i18n.dumpAudioDescription(),
      kind: "common-files",
      ui: (profile) => {
        const $root = document.createElement("form");
        $root.classList.add("root");
        const css = String.raw;
        $root.appendChild(document.createElement("style")).textContent = css`
          .action .root {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
          }
        `;
        $root.addEventListener("post-remove", (e) => console.log(e));

        const $stripMetadataLabel = document.createElement("label");
        $root.appendChild($stripMetadataLabel);
        $stripMetadataLabel.textContent = i18n.noMetadata();
        const $stripMetadata = document.createElement("input");
        $stripMetadataLabel.insertBefore(
          $stripMetadata,
          $stripMetadataLabel.firstChild
        );
        $stripMetadata.type = "checkbox";
        $stripMetadata.checked = profile.stripMetadata ?? true;

        return {
          root: $root,
          profile: () => {
            profile.stripMetadata = $stripMetadata.checked;
            return profile;
          },
        };
      },
      execute: (profile, { input, output }) => {
        // ffmpeg -hide_banner -i i.mp4 -vn -c:a copy -movflags faststart -map_metadata -1 -y o.mp4
        const args = ["-hide_banner", "-i", input, "-vn", "-c:a", "copy"];
        args.push("-movflags", "faststart");
        if (profile.stripMetadata) args.push("-map_metadata", "-1");
        args.push("-y", output);
        const { promise, resolve, reject } = Promise.withResolvers();
        const child = child_process.spawn(consts.exe, args);
        child.on("error", (error) => reject(error));
        child.on("exit", (v) => (v ? reject(new Error("" + v)) : resolve(0)));
        return {
          progress: () => 0, // this action is fast enough so we don't need to parse the output and show individual progress
          stop: () => child.kill(),
          promise,
        };
      },
    },
    {
      id: "slice_download",
      name: "slice_download",
      description: "slice_download",
      kind: "custom",
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
            return {};
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
    {
      id: "general",
      name: i18n.general(),
      description: i18n.generalDescription(),
      actionId: "general",
      extensionId: "ffmpeg",
      extensionVersion: "0.1.0",
      // below are fields for action
      audio: true,
      // audioExtra: "-c:a copy",
      video: true,
      // videoExtra: "-c:v copy",
      // below are fields for entries
      entries: {
        // inputDir: "/home/kkocdko/misc/code/clevert/temp/_test_res/video_i",
        // outputDir: "/home/kkocdko/misc/code/clevert/temp/_test_res/video_o",
        outputExtensions: ["mp4", "mkv", "webm"],
        ifExists: "force",
      },
    },
    {
      id: "to_mp3",
      name: i18n.toMp3(),
      description: i18n.toMp3Description(),
      actionId: "general",
      extensionId: "ffmpeg",
      extensionVersion: "0.1.0",
      // below are fields for action
      audio: true,
      audioExtra: "-c:a libmp3lame -b:a 128k",
      video: false,
      // videoExtra: "",
      // below are fields for entries
      entries: {
        inputDir: "/home/kkocdko/misc/code/clevert/temp/_test_res/audio_i",
        outputDir: "/home/kkocdko/misc/code/clevert/temp/_test_res/audio_o",
        outputExtensions: ["mp3"],
      },
    },
    // {
    //   // x264 --crf 24 --preset 8 -r 6 -b 6 -I infinite -i 1 --scenecut 60 -f 1:1 --qcomp 0.5 --psy-rd 0.3:0 --aq-mode 2 --aq-strength 0.8 --vf resize:768,432,,,,lanczos -o "%~dpn1_v.mp4" "%~1"
    //   // https://ffmpeg.org/ffmpeg-all.html
    //   id: "xiaowan",
    //   name: i18n.xiaowan(),
    //   description: i18n.xiaowanDescription(),
    //   actionId: "general",
    //   extensionId: "ffmpeg",
    //   extensionVersion: "0.1.0",
    //   // below are fields for action
    //   audio: true,
    //   audioExtra: [],
    //   video: true,
    //   videoExtra: [],
    //   // below are fields for entries
    //   entries: {
    //     inputDir: "/home/kkocdko/misc/code/clevert/temp/_test_res/video_i",
    //     outputDir: "/home/kkocdko/misc/code/clevert/temp/_test_res/video_o",
    //     outputExtensions: ["mp4", "mkv", "webm"],
    //   },
    // },
    {
      id: "dump_audio",
      name: i18n.dumpAudio(),
      description: i18n.dumpAudioDescription(),
      actionId: "dumpaudio",
      extensionId: "ffmpeg",
      extensionVersion: "0.1.0",
      // below are fields for action
      audio: true,
      audioExtra: "-c:a copy",
      video: false,
      // videoExtra: "",
      stripMetadata: true,
      // below are fields for entries
      entries: {
        // inputExtensions: [],
        outputExtensions: ["m4a", "mp4"],
      },
    },
    {
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
    // {
    //   id: "amr_to_mp3",
    //   name: "amr_to_mp3",
    //   description: "将通话录音的 amr 格式音频转换为 mp3 音频",
    //   actionId: "amr_to_mp3",
    //   extensionId: "ffmpeg",
    //   extensionVersion: "0.1.0",
    // },
  ],
};

// https://github.com/BtbN/FFmpeg-Builds/releases
// https://blog.csdn.net/kunyus/article/details/109111759
