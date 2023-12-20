import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import url from "node:url";

const modulePath = url.fileURLToPath(import.meta.url);

const page = () => ``;
const server = http.createServer((req, res) => {
  console.log({ url: req.url });
  if (req.url === "/") {
    res.writeHead(200).end(page());
    return;
  }
  // if (url === "/stream") {
  //   // http.get("http://127.0.0.1:9255", (got) => void got.pipe(res));
  //   res.writeHead(200);
  //   const h = (buf) => void res.write(buf);
  //   udpSocket.on("message", h);
  //   res.on("close", () => {
  //     udpSocket.removeListener("message", h);
  //     console.log("res closed");
  //   });
  // } else {
  //   res.writeHead(200).end(page);
  // }
});
server.listen(9254);
