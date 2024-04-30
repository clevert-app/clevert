import { spawn } from "node:child_process";
import { Order } from "./main";
import assert from "node:assert";

export const dependencies = [];
export const actions = {};

// actions["copy-to-mp4"] = {}

/** `time2secs("00:03:22.45") === 202.45` */
const time2secs = (/** @type {string} */ time) => {
  let v = 0;
  for (const part of time.split(":")) {
    v *= 60;
    v += Number(part);
  }
  return v;
};

actions["to-m4a"] = {
  version: "0.1.0",
  prepare: (/** @type {Order} */ { inputs, outputs, options }) => {
    // do something to check, prepare and more
    assert(outputs[0].endsWith(".m4a"), "output extension should be m4a");
    return async ({ onWarn, onProgress }) => {
      const c = spawn("/home/kkocdko/misc/apps/ffmpeg", [
        "-hide_banner",
        "-i",
        inputs[0],
        "-vn",
        outputs[0],
      ]);
      //   const onStderrData = 1;
      let duration = -1;
      let pre = "";
      c.stderr.on("data", (/** @type {Buffer} */ data) => {
        const chunk = data.toString();
        if (duration === -1) {
          pre += chunk;
          //   console.log({pre})
          const dur = pre.split(" Duration:")?.[1]?.split(",")?.[0];
          if (dur) {
            duration = time2secs(dur);
            pre = "";
          }
          return;
        }
        const current = chunk.split(" time=")?.[1]?.split(" ")?.[0];
        if (!current || current.startsWith("-")) return; // invalid `{ time: '-577014:32:22.77' }`
        console.log({ current: time2secs(current), duration });
      });
      c.on("error", (e) => {
        console.error(e);
      });
      await new Promise((r) =>
        c.on("exit", (code) => {
          if (code !== 0) {
            console.error({ outputs, code });
          }
          r();
        })
      );
    };
  },
};

// export const action_m4a = {};
// export const actions = { "m4a":(input, output, option) =>{}, };
// a = () => spawn();
// ffmpeg -hide_banner -vaapi_device /dev/dri/renderD128 -i i.mp4 -vf 'format=nv12,hwupload' -c:v h264_vaapi -profile:v high -qp 24 -compression_level 32 -c:a copy o.h264_vaapi.mp4
// export const profiles = {};
// export const profiles = [];
