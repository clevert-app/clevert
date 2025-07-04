import net from "node:net";
import child_process from "node:child_process";
import fs from "node:fs";

const pipePrefix = "\\\\.\\pipe\\";

const listen = (filePath, pipePath) => {
  const server = net.createServer((socket) => {
    console.log({ filePath, pipePath });
    // from 90s to 120s, to stdout, then pipe to socket
    const child = child_process.spawn(
      "C:\\misc\\code\\clevert\\temp\\extensions\\ffmpeg_0.1.0\\ffmpeg.exe",
      `-hide_banner -ss 90 -i ${filePath} -ss 30 -to 60 -c:v rawvideo -c:a pcm_s16le -y -f matroska -`.split(
        " "
      ),
      { stdio: ["inherit", "pipe","inherit"] }
    );

    child.stdout.pipe(socket);

    // fs.createReadStream(filePath)
    //   .pipe(socket)
    //   .on("end", () => server.close());
  });
  server.listen(pipePath);
};

const filePath = "C:\\misc\\ffmpeg\\temp\\050115-071_hevc_360p.mp4";

listen(filePath, pipePrefix + "ffmpeg_001.mkv");
listen(filePath, pipePrefix + "ffmpeg_002.mkv");
// \\.\pipe\ffmpeg_001.mkv

/*
// i.txt
ffconcat version 1.0
file \\\\.\\pipe\\ffmpeg_001.mkv

*/

// ffmpeg.exe -safe 0 -i i.txt -c:v libx264 -preset:v veryfast  a.mp4
// ffmpeg.exe -safe 0 -i "concat:\\.\pipe\ffmpeg_001.mkv|\\.\pipe\ffmpeg_002.mkv" -c:v libx264 -preset:v veryfast  a.mp4
