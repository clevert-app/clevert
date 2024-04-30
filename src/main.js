import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

/** @typedef {{inputs:string[],outputs:string[],options:any}} Order */
/** @typedef {(options:{[k:string]:any})=>Order[]} Provider */

/** @type {Provider} */
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

const remaining = orders.map((order) => action.prepare(order));
const running = new Set();

const executors = [...Array(config.parallel)].map((_, i) =>
  (async () => {
    for (let job; (job = remaining.shift()); ) {
      const promise = job({
        onWarn() {},
        onProgress(current, total) {
          console.log(`${current}/${total}`);
        },
      });
      running.add(promise);
      await promise;
      running.delete(promise);
    }
  })()
);
await Promise.all(executors);

// if (process.argv[2] === "webui") {
//   const page = () => ``;
//   const server = createServer((req, res) => {
//     console.log({ url: req.url });
//     if (req.url === "/") {
//       res.writeHead(200).end(page());
//       return;
//     }
//   });
//   server.listen(9254);
// }

// https://nodejs.org/api/child_process.html#child_processspawncommand-args-options
// https://www.gnu.org/software/make/manual/make.html#Parallel

// https://jsdoc.app/tags-callback
// https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html
