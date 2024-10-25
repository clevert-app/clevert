// @ts-check
/** @import { Extension } from "../../index.js" */
import child_process from "node:child_process";
import path from "node:path";

const consts = globalThis.process && {
  exe: path.join(import.meta.dirname, "python"),
};

export default /** @type {Extension} */ ({
  id: "python",
  version: "3.12.7",
  name: "python",
  description: "yt-dlp description",
  dependencies: ["python"],
  assets: [
    {
      platforms: ["win-x64"],
      kind: "zip",
      path: "./yt-dlp",
      url: "https://registry.npmmirror.com/-/binary/python/3.12.7/python-3.12.7-embed-amd64.zip",
    },
  ],
  actions: [],
  profiles: [],
});
