import { register } from "node:module";
import { pathToFileURL } from "node:url";

const resolverCode = `
  console.log(1);
  export async function initialize(...args) {
    console.log({ args });
    // Receives data from "register".
  }

  export async function load(url, context, nextLoad) {
    if (url.startsWith("a:")) {
      return ({
        format: "module",
        shortCircuit: true,
        source: 'export const hello="world";',
      })
    }
    // Let Node.js handle all other URLs.
    return nextLoad(url);
  }
`;
// const blob = new Blob([resolverCode], { type: "text/javascript" });
// const url = URL.createObjectURL(blob);
// register(url);
// register(pathToFileURL("./b.mjs"));
// const aa = await import("a:main");
register("data:text/javascript," + encodeURIComponent(resolverCode));
await import("./c.mjs");

// https://nodejs.org/api/module.html#customization-hooks
