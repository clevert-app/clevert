// @ts-check
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import child_process from "node:child_process";
import os from "node:os";
import http from "node:http";
import https from "node:https";
import util from "node:util";
import events from "node:events";
import zlib from "node:zlib";
import stream from "node:stream";
// import module from "node:module";

const StreamZip = (() => {
  // the std node:zlib.Unzip is misnamed IMO. it just deflate, not uncompress zip.

  // https://github.com/antelle/node-stream-zip/blob/7c5d50393418b261668b0dd4c8d9ccaa9ac913ce/node_stream_zip.js

  // @license node-stream-zip | (c) 2020 Antelle | https://github.com/antelle/node-stream-zip/blob/master/LICENSE
  // Portions copyright https://github.com/cthackers/adm-zip | https://raw.githubusercontent.com/cthackers/adm-zip/master/LICENSE

  // https://github.com/microsoft/TypeScript/issues/19573

  const consts = {
    /* The local file header */
    LOCHDR: 30, // LOC header size
    LOCSIG: 0x04034b50, // "PK\003\004"
    LOCVER: 4, // version needed to extract
    LOCFLG: 6, // general purpose bit flag
    LOCHOW: 8, // compression method
    LOCTIM: 10, // modification time (2 bytes time, 2 bytes date)
    LOCCRC: 14, // uncompressed file crc-32 value
    LOCSIZ: 18, // compressed size
    LOCLEN: 22, // uncompressed size
    LOCNAM: 26, // filename length
    LOCEXT: 28, // extra field length

    /* The Data descriptor */
    EXTSIG: 0x08074b50, // "PK\007\008"
    EXTHDR: 16, // EXT header size
    EXTCRC: 4, // uncompressed file crc-32 value
    EXTSIZ: 8, // compressed size
    EXTLEN: 12, // uncompressed size

    /* The central directory file header */
    CENHDR: 46, // CEN header size
    CENSIG: 0x02014b50, // "PK\001\002"
    CENVEM: 4, // version made by
    CENVER: 6, // version needed to extract
    CENFLG: 8, // encrypt, decrypt flags
    CENHOW: 10, // compression method
    CENTIM: 12, // modification time (2 bytes time, 2 bytes date)
    CENCRC: 16, // uncompressed file crc-32 value
    CENSIZ: 20, // compressed size
    CENLEN: 24, // uncompressed size
    CENNAM: 28, // filename length
    CENEXT: 30, // extra field length
    CENCOM: 32, // file comment length
    CENDSK: 34, // volume number start
    CENATT: 36, // internal file attributes
    CENATX: 38, // external file attributes (host system dependent)
    CENOFF: 42, // LOC header offset

    /* The entries in the end of central directory */
    ENDHDR: 22, // END header size
    ENDSIG: 0x06054b50, // "PK\005\006"
    ENDSIGFIRST: 0x50,
    ENDSUB: 8, // number of entries on this disk
    ENDTOT: 10, // total number of entries
    ENDSIZ: 12, // central directory size in bytes
    ENDOFF: 16, // offset of first CEN header
    ENDCOM: 20, // zip file comment length
    MAXFILECOMMENT: 0xffff,

    /* The entries in the end of ZIP64 central directory locator */
    ENDL64HDR: 20, // ZIP64 end of central directory locator header size
    ENDL64SIG: 0x07064b50, // ZIP64 end of central directory locator signature
    ENDL64SIGFIRST: 0x50,
    ENDL64OFS: 8, // ZIP64 end of central directory offset

    /* The entries in the end of ZIP64 central directory */
    END64HDR: 56, // ZIP64 end of central directory header size
    END64SIG: 0x06064b50, // ZIP64 end of central directory signature
    END64SIGFIRST: 0x50,
    END64SUB: 24, // number of entries on this disk
    END64TOT: 32, // total number of entries
    END64SIZ: 40,
    END64OFF: 48,

    /* Compression methods */
    STORED: 0, // no compression
    SHRUNK: 1, // shrunk
    REDUCED1: 2, // reduced with compression factor 1
    REDUCED2: 3, // reduced with compression factor 2
    REDUCED3: 4, // reduced with compression factor 3
    REDUCED4: 5, // reduced with compression factor 4
    IMPLODED: 6, // imploded
    // 7 reserved
    DEFLATED: 8, // deflated
    ENHANCED_DEFLATED: 9, // deflate64
    PKWARE: 10, // PKWare DCL imploded
    // 11 reserved
    BZIP2: 12, //  compressed using BZIP2
    // 13 reserved
    LZMA: 14, // LZMA
    // 15-17 reserved
    IBM_TERSE: 18, // compressed using IBM TERSE
    IBM_LZ77: 19, //IBM LZ77 z

    /* General purpose bit flag */
    FLG_ENC: 0, // encrypted file
    FLG_COMP1: 1, // compression option
    FLG_COMP2: 2, // compression option
    FLG_DESC: 4, // data descriptor
    FLG_ENH: 8, // enhanced deflation
    FLG_STR: 16, // strong encryption
    FLG_LNG: 1024, // language encoding
    FLG_MSK: 4096, // mask header values
    FLG_ENTRY_ENC: 1,

    /* 4.5 Extensible data fields */
    EF_ID: 0,
    EF_SIZE: 2,

    /* Header IDs */
    ID_ZIP64: 0x0001,
    ID_AVINFO: 0x0007,
    ID_PFS: 0x0008,
    ID_OS2: 0x0009,
    ID_NTFS: 0x000a,
    ID_OPENVMS: 0x000c,
    ID_UNIX: 0x000d,
    ID_FORK: 0x000e,
    ID_PATCH: 0x000f,
    ID_X509_PKCS7: 0x0014,
    ID_X509_CERTID_F: 0x0015,
    ID_X509_CERTID_C: 0x0016,
    ID_STRONGENC: 0x0017,
    ID_RECORD_MGT: 0x0018,
    ID_X509_PKCS7_RL: 0x0019,
    ID_IBM1: 0x0065,
    ID_IBM2: 0x0066,
    ID_POSZIP: 0x4690,

    EF_ZIP64_OR_32: 0xffffffff,
    EF_ZIP64_OR_16: 0xffff,
  };

  const StreamZip = function (config) {
    let fd,
      fileSize,
      chunkSize,
      op,
      /** @type {any} */ centralDirectory,
      closed;
    const ready = false,
      /** @type {any} */ that = this,
      /** @type {any} */ entries = config.storeEntries !== false ? {} : null,
      fileName = config.file,
      textDecoder = config.nameEncoding
        ? new TextDecoder(config.nameEncoding)
        : null;

    open();

    function open() {
      if (config.fd) {
        fd = config.fd;
        readFile();
      } else {
        fs.open(fileName, "r", (err, f) => {
          if (err) {
            return that.emit("error", err);
          }
          fd = f;
          readFile();
        });
      }
    }

    function readFile() {
      fs.fstat(fd, (err, stat) => {
        if (err) {
          return that.emit("error", err);
        }
        fileSize = stat.size;
        chunkSize = config.chunkSize || Math.round(fileSize / 1000);
        chunkSize = Math.max(
          Math.min(chunkSize, Math.min(128 * 1024, fileSize)),
          Math.min(1024, fileSize)
        );
        readCentralDirectory();
      });
    }

    function readUntilFoundCallback(err, bytesRead) {
      if (err || !bytesRead) {
        return that.emit("error", err || new Error("Archive read error"));
      }
      let pos = op.lastPos;
      let bufferPosition = pos - op.win.position;
      const buffer = op.win.buffer;
      const minPos = op.minPos;
      while (--pos >= minPos && --bufferPosition >= 0) {
        if (
          buffer.length - bufferPosition >= 4 &&
          buffer[bufferPosition] === op.firstByte
        ) {
          // quick check first signature byte
          if (buffer.readUInt32LE(bufferPosition) === op.sig) {
            op.lastBufferPosition = bufferPosition;
            op.lastBytesRead = bytesRead;
            op.complete();
            return;
          }
        }
      }
      if (pos === minPos) {
        return that.emit("error", new Error("Bad archive"));
      }
      op.lastPos = pos + 1;
      op.chunkSize *= 2;
      if (pos <= minPos) {
        return that.emit("error", new Error("Bad archive"));
      }
      const expandLength = Math.min(op.chunkSize, pos - minPos);
      op.win.expandLeft(expandLength, readUntilFoundCallback);
    }

    function readCentralDirectory() {
      const totalReadLength = Math.min(
        consts.ENDHDR + consts.MAXFILECOMMENT,
        fileSize
      );
      op = {
        win: new FileWindowBuffer(fd),
        totalReadLength,
        minPos: fileSize - totalReadLength,
        lastPos: fileSize,
        chunkSize: Math.min(1024, chunkSize),
        firstByte: consts.ENDSIGFIRST,
        sig: consts.ENDSIG,
        complete: readCentralDirectoryComplete,
      };
      op.win.read(
        fileSize - op.chunkSize,
        op.chunkSize,
        readUntilFoundCallback
      );
    }

    function readCentralDirectoryComplete() {
      const buffer = op.win.buffer;
      const pos = op.lastBufferPosition;
      try {
        centralDirectory = new CentralDirectoryHeader();
        centralDirectory.read(buffer.slice(pos, pos + consts.ENDHDR));
        centralDirectory.headerOffset = op.win.position + pos;
        if (centralDirectory.commentLength) {
          that.comment = buffer
            .slice(
              pos + consts.ENDHDR,
              pos + consts.ENDHDR + centralDirectory.commentLength
            )
            .toString();
        } else {
          that.comment = null;
        }
        that.entriesCount = centralDirectory.volumeEntries;
        that.centralDirectory = centralDirectory;
        if (
          (centralDirectory.volumeEntries === consts.EF_ZIP64_OR_16 &&
            centralDirectory.totalEntries === consts.EF_ZIP64_OR_16) ||
          centralDirectory.size === consts.EF_ZIP64_OR_32 ||
          centralDirectory.offset === consts.EF_ZIP64_OR_32
        ) {
          readZip64CentralDirectoryLocator();
        } else {
          op = {};
          readEntries();
        }
      } catch (err) {
        that.emit("error", err);
      }
    }

    function readZip64CentralDirectoryLocator() {
      const length = consts.ENDL64HDR;
      if (op.lastBufferPosition > length) {
        op.lastBufferPosition -= length;
        readZip64CentralDirectoryLocatorComplete();
      } else {
        op = {
          win: op.win,
          totalReadLength: length,
          minPos: op.win.position - length,
          lastPos: op.win.position,
          chunkSize: op.chunkSize,
          firstByte: consts.ENDL64SIGFIRST,
          sig: consts.ENDL64SIG,
          complete: readZip64CentralDirectoryLocatorComplete,
        };
        op.win.read(
          op.lastPos - op.chunkSize,
          op.chunkSize,
          readUntilFoundCallback
        );
      }
    }

    function readZip64CentralDirectoryLocatorComplete() {
      const buffer = op.win.buffer;
      const locHeader = new CentralDirectoryLoc64Header();
      locHeader.read(
        buffer.slice(
          op.lastBufferPosition,
          op.lastBufferPosition + consts.ENDL64HDR
        )
      );
      const readLength = fileSize - locHeader.headerOffset;
      op = {
        win: op.win,
        totalReadLength: readLength,
        minPos: locHeader.headerOffset,
        lastPos: op.lastPos,
        chunkSize: op.chunkSize,
        firstByte: consts.END64SIGFIRST,
        sig: consts.END64SIG,
        complete: readZip64CentralDirectoryComplete,
      };
      op.win.read(
        fileSize - op.chunkSize,
        op.chunkSize,
        readUntilFoundCallback
      );
    }

    function readZip64CentralDirectoryComplete() {
      const buffer = op.win.buffer;
      const zip64cd = new CentralDirectoryZip64Header();
      zip64cd.read(
        buffer.slice(
          op.lastBufferPosition,
          op.lastBufferPosition + consts.END64HDR
        )
      );
      that.centralDirectory.volumeEntries = zip64cd.volumeEntries;
      that.centralDirectory.totalEntries = zip64cd.totalEntries;
      that.centralDirectory.size = zip64cd.size;
      that.centralDirectory.offset = zip64cd.offset;
      that.entriesCount = zip64cd.volumeEntries;
      op = {};
      readEntries();
    }

    function readEntries() {
      op = {
        win: new FileWindowBuffer(fd),
        pos: centralDirectory.offset,
        chunkSize,
        entriesLeft: centralDirectory.volumeEntries,
      };
      op.win.read(
        op.pos,
        Math.min(chunkSize, fileSize - op.pos),
        readEntriesCallback
      );
    }

    function readEntriesCallback(err, bytesRead) {
      if (err || !bytesRead) {
        return that.emit("error", err || new Error("Entries read error"));
      }
      let bufferPos = op.pos - op.win.position;
      let entry = op.entry;
      const buffer = op.win.buffer;
      const bufferLength = buffer.length;
      try {
        while (op.entriesLeft > 0) {
          if (!entry) {
            entry = new ZipEntry();
            entry.readHeader(buffer, bufferPos);
            entry.headerOffset = op.win.position + bufferPos;
            op.entry = entry;
            op.pos += consts.CENHDR;
            bufferPos += consts.CENHDR;
          }
          const entryHeaderSize =
            entry.fnameLen + entry.extraLen + entry.comLen;
          const advanceBytes =
            entryHeaderSize + (op.entriesLeft > 1 ? consts.CENHDR : 0);
          if (bufferLength - bufferPos < advanceBytes) {
            op.win.moveRight(chunkSize, readEntriesCallback, bufferPos);
            op.move = true;
            return;
          }
          entry.read(buffer, bufferPos, textDecoder);
          if (!config.skipEntryNameValidation) {
            entry.validateName();
          }
          if (entries) {
            entries[entry.name] = entry;
          }
          that.emit("entry", entry);
          op.entry = entry = null;
          op.entriesLeft--;
          op.pos += entryHeaderSize;
          bufferPos += entryHeaderSize;
        }
        that.emit("ready");
      } catch (err) {
        that.emit("error", err);
      }
    }

    function checkEntriesExist() {
      if (!entries) {
        throw new Error("storeEntries disabled");
      }
    }

    Object.defineProperty(this, "ready", {
      get() {
        return ready;
      },
    });

    this.entry = function (name) {
      checkEntriesExist();
      return entries[name];
    };

    this.entries = function () {
      checkEntriesExist();
      return entries;
    };

    this.stream = function (entry, callback) {
      return this.openEntry(
        entry,
        (err, entry) => {
          if (err) {
            return callback(err);
          }
          const offset = dataOffset(entry);
          let /** @type {any} */ entryStream = new EntryDataReaderStream(
              fd,
              offset,
              entry.compressedSize
            );
          if (entry.method === consts.STORED) {
            // nothing to do
          } else if (entry.method === consts.DEFLATED) {
            entryStream = entryStream.pipe(zlib.createInflateRaw());
          } else {
            return callback(
              new Error("Unknown compression method: " + entry.method)
            );
          }
          if (canVerifyCrc(entry)) {
            entryStream = entryStream.pipe(
              new EntryVerifyStream(entryStream, entry.crc, entry.size)
            );
          }
          callback(null, entryStream);
        },
        false
      );
    };

    this.entryDataSync = function (entry) {
      let err = null;
      this.openEntry(
        entry,
        (e, en) => {
          err = e;
          entry = en;
        },
        true
      );
      if (err) {
        throw err;
      }
      let data = Buffer.alloc(entry.compressedSize);
      new FsRead(fd, data, 0, entry.compressedSize, dataOffset(entry), (e) => {
        err = e;
      }).read(true);
      if (err) {
        throw err;
      }
      if (entry.method === consts.STORED) {
        // nothing to do
      } else if (
        entry.method === consts.DEFLATED ||
        entry.method === consts.ENHANCED_DEFLATED
      ) {
        data = zlib.inflateRawSync(data);
      } else {
        throw new Error("Unknown compression method: " + entry.method);
      }
      if (data.length !== entry.size) {
        throw new Error("Invalid size");
      }
      if (canVerifyCrc(entry)) {
        const verify = new CrcVerify(entry.crc, entry.size);
        verify.data(data);
      }
      return data;
    };

    this.openEntry = function (entry, callback, sync) {
      if (typeof entry === "string") {
        checkEntriesExist();
        entry = entries[entry];
        if (!entry) {
          return callback(new Error("Entry not found"));
        }
      }
      if (!entry.isFile) {
        return callback(new Error("Entry is not file"));
      }
      if (!fd) {
        return callback(new Error("Archive closed"));
      }
      const buffer = Buffer.alloc(consts.LOCHDR);
      new FsRead(fd, buffer, 0, buffer.length, entry.offset, (err) => {
        if (err) {
          return callback(err);
        }
        let readEx;
        try {
          entry.readDataHeader(buffer);
          if (entry.encrypted) {
            readEx = new Error("Entry encrypted");
          }
        } catch (ex) {
          readEx = ex;
        }
        callback(readEx, entry);
      }).read(sync);
    };

    function dataOffset(entry) {
      return entry.offset + consts.LOCHDR + entry.fnameLen + entry.extraLen;
    }

    function canVerifyCrc(entry) {
      // if bit 3 (0x08) of the general-purpose flags field is set, then the CRC-32 and file sizes are not known when the header is written
      return (entry.flags & 0x8) !== 0x8;
    }

    function extract(entry, outPath, callback) {
      that.stream(entry, (err, stm) => {
        if (err) {
          callback(err);
        } else {
          let fsStm, errThrown;
          stm.on("error", (err) => {
            errThrown = err;
            if (fsStm) {
              stm.unpipe(fsStm);
              fsStm.close(() => {
                callback(err);
              });
            }
          });
          fs.open(outPath, "w", (err, fdFile) => {
            if (err) {
              return callback(err);
            }
            if (errThrown) {
              fs.close(fd, () => {
                callback(errThrown);
              });
              return;
            }
            fsStm = fs.createWriteStream(outPath, { fd: fdFile });
            fsStm.on("finish", () => {
              that.emit("extract", entry, outPath);
              if (!errThrown) {
                callback();
              }
            });
            stm.pipe(fsStm);
          });
        }
      });
    }

    function createDirectories(baseDir, dirs, callback) {
      if (!dirs.length) {
        return callback();
      }
      let dir = dirs.shift();
      dir = path.join(baseDir, path.join(...dir));
      fs.mkdir(dir, { recursive: true }, (err) => {
        if (err && err.code !== "EEXIST") {
          return callback(err);
        }
        createDirectories(baseDir, dirs, callback);
      });
    }

    function extractFiles(
      baseDir,
      baseRelPath,
      files,
      callback,
      extractedCount
    ) {
      if (!files.length) {
        return callback(null, extractedCount);
      }
      const file = files.shift();
      const targetPath = path.join(baseDir, file.name.replace(baseRelPath, ""));
      extract(file, targetPath, (err) => {
        if (err) {
          return callback(err, extractedCount);
        }
        extractFiles(baseDir, baseRelPath, files, callback, extractedCount + 1);
      });
    }

    this.extract = function (entry, outPath, callback) {
      let entryName = entry || "";
      if (typeof entry === "string") {
        entry = this.entry(entry);
        if (entry) {
          entryName = entry.name;
        } else {
          if (entryName.length && entryName[entryName.length - 1] !== "/") {
            entryName += "/";
          }
        }
      }
      if (!entry || entry.isDirectory) {
        const files = [],
          dirs = [],
          allDirs = {};
        for (const e in entries) {
          if (
            Object.prototype.hasOwnProperty.call(entries, e) &&
            e.lastIndexOf(entryName, 0) === 0
          ) {
            let relPath = e.replace(entryName, "");
            const childEntry = entries[e];
            if (childEntry.isFile) {
              files.push(childEntry);
              relPath = path.dirname(relPath);
            }
            if (relPath && !allDirs[relPath] && relPath !== ".") {
              allDirs[relPath] = true;
              let parts = relPath.split("/").filter((f) => {
                return f;
              });
              if (parts.length) {
                dirs.push(parts);
              }
              while (parts.length > 1) {
                parts = parts.slice(0, parts.length - 1);
                const partsPath = parts.join("/");
                if (allDirs[partsPath] || partsPath === ".") {
                  break;
                }
                allDirs[partsPath] = true;
                dirs.push(parts);
              }
            }
          }
        }
        dirs.sort((x, y) => {
          return x.length - y.length;
        });
        if (dirs.length) {
          createDirectories(outPath, dirs, (err) => {
            if (err) {
              callback(err);
            } else {
              extractFiles(outPath, entryName, files, callback, 0);
            }
          });
        } else {
          extractFiles(outPath, entryName, files, callback, 0);
        }
      } else {
        fs.stat(outPath, (err, stat) => {
          if (stat && stat.isDirectory()) {
            extract(
              entry,
              path.join(outPath, path.basename(entry.name)),
              callback
            );
          } else {
            extract(entry, outPath, callback);
          }
        });
      }
    };

    this.close = function (callback) {
      if (closed || !fd) {
        closed = true;
        if (callback) {
          callback();
        }
      } else {
        closed = true;
        fs.close(fd, (err) => {
          fd = null;
          if (callback) {
            callback(err);
          }
        });
      }
    };

    const originalEmit = events.EventEmitter.prototype.emit;
    this.emit = function (...args) {
      if (!closed) {
        return originalEmit.call(this, ...args);
      }
    };
  };

  // StreamZip.setFs = function (customFs) {
  //   fs = customFs;
  // };

  StreamZip.debugLog = (...args) => {
    if (/** @type {any} */ (StreamZip).debug) {
      // eslint-disable-next-line no-console
      console.log(...args);
    }
  };

  util.inherits(StreamZip, events.EventEmitter);

  const propZip = Symbol("zip");

  StreamZip.async = class StreamZipAsync extends events.EventEmitter {
    constructor(config) {
      super();

      const zip = /** @type {any} */ (new StreamZip(config));

      zip.on("entry", (entry) => this.emit("entry", entry));
      zip.on("extract", (entry, outPath) =>
        this.emit("extract", entry, outPath)
      );

      this[propZip] = new Promise((resolve, reject) => {
        zip.on("ready", () => {
          zip.removeListener("error", reject);
          resolve(zip);
        });
        zip.on("error", reject);
      });
    }

    get entriesCount() {
      return this[propZip].then((zip) => zip.entriesCount);
    }

    get comment() {
      return this[propZip].then((zip) => zip.comment);
    }

    async entry(name) {
      const zip = await this[propZip];
      return zip.entry(name);
    }

    async entries() {
      const zip = await this[propZip];
      return zip.entries();
    }

    async stream(entry) {
      const zip = await this[propZip];
      return new Promise((resolve, reject) => {
        zip.stream(entry, (err, stm) => {
          if (err) {
            reject(err);
          } else {
            resolve(stm);
          }
        });
      });
    }

    async entryData(entry) {
      const stm = await this.stream(entry);
      return new Promise((resolve, reject) => {
        const data = [];
        stm.on("data", (chunk) => data.push(chunk));
        stm.on("end", () => {
          resolve(Buffer.concat(data));
        });
        stm.on("error", (err) => {
          stm.removeAllListeners("end");
          reject(err);
        });
      });
    }

    async extract(entry, outPath) {
      const zip = await this[propZip];
      return new Promise((resolve, reject) => {
        zip.extract(entry, outPath, (err, res) => {
          if (err) {
            reject(err);
          } else {
            resolve(res);
          }
        });
      });
    }

    async close() {
      const zip = await this[propZip];
      return new Promise((resolve, reject) => {
        zip.close((err) => {
          if (err) {
            reject(err);
          } else {
            /** @type {any} */ (resolve)();
          }
        });
      });
    }
  };

  class CentralDirectoryHeader {
    read(data) {
      if (
        data.length !== consts.ENDHDR ||
        data.readUInt32LE(0) !== consts.ENDSIG
      ) {
        throw new Error("Invalid central directory");
      }
      // number of entries on this volume
      this.volumeEntries = data.readUInt16LE(consts.ENDSUB);
      // total number of entries
      this.totalEntries = data.readUInt16LE(consts.ENDTOT);
      // central directory size in bytes
      this.size = data.readUInt32LE(consts.ENDSIZ);
      // offset of first CEN header
      this.offset = data.readUInt32LE(consts.ENDOFF);
      // zip file comment length
      this.commentLength = data.readUInt16LE(consts.ENDCOM);
    }
  }

  class CentralDirectoryLoc64Header {
    read(data) {
      if (
        data.length !== consts.ENDL64HDR ||
        data.readUInt32LE(0) !== consts.ENDL64SIG
      ) {
        throw new Error("Invalid zip64 central directory locator");
      }
      // ZIP64 EOCD header offset
      this.headerOffset = readUInt64LE(data, consts.ENDSUB);
    }
  }

  class CentralDirectoryZip64Header {
    read(data) {
      if (
        data.length !== consts.END64HDR ||
        data.readUInt32LE(0) !== consts.END64SIG
      ) {
        throw new Error("Invalid central directory");
      }
      // number of entries on this volume
      this.volumeEntries = readUInt64LE(data, consts.END64SUB);
      // total number of entries
      this.totalEntries = readUInt64LE(data, consts.END64TOT);
      // central directory size in bytes
      this.size = readUInt64LE(data, consts.END64SIZ);
      // offset of first CEN header
      this.offset = readUInt64LE(data, consts.END64OFF);
    }
  }

  class ZipEntry {
    readHeader(data, offset) {
      // data should be 46 bytes and start with "PK 01 02"
      if (
        data.length < offset + consts.CENHDR ||
        data.readUInt32LE(offset) !== consts.CENSIG
      ) {
        throw new Error("Invalid entry header");
      }
      // version made by
      this.verMade = data.readUInt16LE(offset + consts.CENVEM);
      // version needed to extract
      this.version = data.readUInt16LE(offset + consts.CENVER);
      // encrypt, decrypt flags
      this.flags = data.readUInt16LE(offset + consts.CENFLG);
      // compression method
      this.method = data.readUInt16LE(offset + consts.CENHOW);
      // modification time (2 bytes time, 2 bytes date)
      const timebytes = data.readUInt16LE(offset + consts.CENTIM);
      const datebytes = data.readUInt16LE(offset + consts.CENTIM + 2);
      this.time = parseZipTime(timebytes, datebytes);

      // uncompressed file crc-32 value
      this.crc = data.readUInt32LE(offset + consts.CENCRC);
      // compressed size
      this.compressedSize = data.readUInt32LE(offset + consts.CENSIZ);
      // uncompressed size
      this.size = data.readUInt32LE(offset + consts.CENLEN);
      // filename length
      this.fnameLen = data.readUInt16LE(offset + consts.CENNAM);
      // extra field length
      this.extraLen = data.readUInt16LE(offset + consts.CENEXT);
      // file comment length
      this.comLen = data.readUInt16LE(offset + consts.CENCOM);
      // volume number start
      this.diskStart = data.readUInt16LE(offset + consts.CENDSK);
      // internal file attributes
      this.inattr = data.readUInt16LE(offset + consts.CENATT);
      // external file attributes
      this.attr = data.readUInt32LE(offset + consts.CENATX);
      // LOC header offset
      this.offset = data.readUInt32LE(offset + consts.CENOFF);
    }

    readDataHeader(data) {
      // 30 bytes and should start with "PK\003\004"
      if (data.readUInt32LE(0) !== consts.LOCSIG) {
        throw new Error("Invalid local header");
      }
      // version needed to extract
      this.version = data.readUInt16LE(consts.LOCVER);
      // general purpose bit flag
      this.flags = data.readUInt16LE(consts.LOCFLG);
      // compression method
      this.method = data.readUInt16LE(consts.LOCHOW);
      // modification time (2 bytes time ; 2 bytes date)
      const timebytes = data.readUInt16LE(consts.LOCTIM);
      const datebytes = data.readUInt16LE(consts.LOCTIM + 2);
      this.time = parseZipTime(timebytes, datebytes);

      // uncompressed file crc-32 value
      this.crc = data.readUInt32LE(consts.LOCCRC) || this.crc;
      // compressed size
      const compressedSize = data.readUInt32LE(consts.LOCSIZ);
      if (compressedSize && compressedSize !== consts.EF_ZIP64_OR_32) {
        this.compressedSize = compressedSize;
      }
      // uncompressed size
      const size = data.readUInt32LE(consts.LOCLEN);
      if (size && size !== consts.EF_ZIP64_OR_32) {
        this.size = size;
      }
      // filename length
      this.fnameLen = data.readUInt16LE(consts.LOCNAM);
      // extra field length
      this.extraLen = data.readUInt16LE(consts.LOCEXT);
    }

    read(data, offset, textDecoder) {
      const nameData = data.slice(offset, (offset += this.fnameLen));
      this.name = textDecoder
        ? textDecoder.decode(new Uint8Array(nameData))
        : nameData.toString("utf8");
      const lastChar = data[offset - 1];
      this.isDirectory = lastChar === 47 || lastChar === 92;

      if (this.extraLen) {
        this.readExtra(data, offset);
        offset += this.extraLen;
      }
      this.comment = this.comLen
        ? data.slice(offset, offset + this.comLen).toString()
        : null;
    }

    validateName() {
      if (/\\|^\w+:|^\/|(^|\/)\.\.(\/|$)/.test(this.name)) {
        throw new Error("Malicious entry: " + this.name);
      }
    }

    readExtra(data, offset) {
      let signature, size;
      const maxPos = offset + this.extraLen;
      while (offset < maxPos) {
        signature = data.readUInt16LE(offset);
        offset += 2;
        size = data.readUInt16LE(offset);
        offset += 2;
        if (consts.ID_ZIP64 === signature) {
          this.parseZip64Extra(data, offset, size);
        }
        offset += size;
      }
    }

    parseZip64Extra(data, offset, length) {
      if (length >= 8 && this.size === consts.EF_ZIP64_OR_32) {
        this.size = readUInt64LE(data, offset);
        offset += 8;
        length -= 8;
      }
      if (length >= 8 && this.compressedSize === consts.EF_ZIP64_OR_32) {
        this.compressedSize = readUInt64LE(data, offset);
        offset += 8;
        length -= 8;
      }
      if (length >= 8 && this.offset === consts.EF_ZIP64_OR_32) {
        this.offset = readUInt64LE(data, offset);
        offset += 8;
        length -= 8;
      }
      if (length >= 4 && this.diskStart === consts.EF_ZIP64_OR_16) {
        this.diskStart = data.readUInt32LE(offset);
        // offset += 4; length -= 4;
      }
    }

    get encrypted() {
      return (this.flags & consts.FLG_ENTRY_ENC) === consts.FLG_ENTRY_ENC;
    }

    get isFile() {
      return !this.isDirectory;
    }
  }

  class FsRead {
    constructor(fd, buffer, offset, length, position, callback) {
      this.fd = fd;
      this.buffer = buffer;
      this.offset = offset;
      this.length = length;
      this.position = position;
      this.callback = callback;
      this.bytesRead = 0;
      this.waiting = false;
    }

    read(sync) {
      /** @type {any} */ (StreamZip).debugLog(
        "read",
        this.position,
        this.bytesRead,
        this.length,
        this.offset
      );
      this.waiting = true;
      let err;
      if (sync) {
        let bytesRead = 0;
        try {
          bytesRead = fs.readSync(
            this.fd,
            this.buffer,
            this.offset + this.bytesRead,
            this.length - this.bytesRead,
            this.position + this.bytesRead
          );
        } catch (e) {
          err = e;
        }
        this.readCallback(sync, err, err ? bytesRead : null);
      } else {
        fs.read(
          this.fd,
          this.buffer,
          this.offset + this.bytesRead,
          this.length - this.bytesRead,
          this.position + this.bytesRead,
          this.readCallback.bind(this, sync)
        );
      }
    }

    readCallback(sync, err, bytesRead) {
      if (typeof bytesRead === "number") {
        this.bytesRead += bytesRead;
      }
      if (err || !bytesRead || this.bytesRead === this.length) {
        this.waiting = false;
        return this.callback(err, this.bytesRead);
      } else {
        this.read(sync);
      }
    }
  }

  class FileWindowBuffer {
    constructor(fd) {
      this.position = 0;
      this.buffer = Buffer.alloc(0);
      this.fd = fd;
      this.fsOp = null;
    }

    checkOp() {
      if (this.fsOp && /** @type {any} */ (this.fsOp).waiting) {
        throw new Error("Operation in progress");
      }
    }

    read(pos, length, callback) {
      this.checkOp();
      if (this.buffer.length < length) {
        this.buffer = Buffer.alloc(length);
      }
      this.position = pos;
      this.fsOp = new FsRead(
        this.fd,
        this.buffer,
        0,
        length,
        this.position,
        callback
      ).read();
    }

    expandLeft(length, callback) {
      this.checkOp();
      this.buffer = Buffer.concat([Buffer.alloc(length), this.buffer]);
      this.position -= length;
      if (this.position < 0) {
        this.position = 0;
      }
      this.fsOp = new FsRead(
        this.fd,
        this.buffer,
        0,
        length,
        this.position,
        callback
      ).read();
    }

    expandRight(length, callback) {
      this.checkOp();
      const offset = this.buffer.length;
      this.buffer = Buffer.concat([this.buffer, Buffer.alloc(length)]);
      this.fsOp = new FsRead(
        this.fd,
        this.buffer,
        offset,
        length,
        this.position + offset,
        callback
      ).read();
    }

    moveRight(length, callback, shift) {
      this.checkOp();
      if (shift) {
        this.buffer.copy(this.buffer, 0, shift);
      } else {
        shift = 0;
      }
      this.position += shift;
      this.fsOp = new FsRead(
        this.fd,
        this.buffer,
        this.buffer.length - shift,
        shift,
        this.position + this.buffer.length - shift,
        callback
      ).read();
    }
  }

  class EntryDataReaderStream extends stream.Readable {
    constructor(fd, offset, length) {
      super();
      this.fd = fd;
      this.offset = offset;
      this.length = length;
      this.pos = 0;
      this.readCallback = this.readCallback.bind(this);
    }

    _read(n) {
      const buffer = Buffer.alloc(Math.min(n, this.length - this.pos));
      if (buffer.length) {
        fs.read(
          this.fd,
          buffer,
          0,
          buffer.length,
          this.offset + this.pos,
          this.readCallback
        );
      } else {
        this.push(null);
      }
    }

    readCallback(err, bytesRead, buffer) {
      this.pos += bytesRead;
      if (err) {
        this.emit("error", err);
        this.push(null);
      } else if (!bytesRead) {
        this.push(null);
      } else {
        if (bytesRead !== buffer.length) {
          buffer = buffer.slice(0, bytesRead);
        }
        this.push(buffer);
      }
    }
  }

  class EntryVerifyStream extends stream.Transform {
    constructor(baseStm, crc, size) {
      super();
      this.verify = new CrcVerify(crc, size);
      baseStm.on("error", (e) => {
        this.emit("error", e);
      });
    }

    _transform(data, encoding, callback) {
      let err;
      try {
        this.verify.data(data);
      } catch (e) {
        err = e;
      }
      callback(err, data);
    }
  }

  class CrcVerify {
    constructor(crc, size) {
      this.crc = crc;
      this.size = size;
      this.state = {
        crc: ~0,
        size: 0,
      };
    }

    data(data) {
      const crcTable = CrcVerify.getCrcTable();
      let crc = this.state.crc;
      let off = 0;
      let len = data.length;
      while (--len >= 0) {
        crc = crcTable[(crc ^ data[off++]) & 0xff] ^ (crc >>> 8);
      }
      this.state.crc = crc;
      this.state.size += data.length;
      if (this.state.size >= this.size) {
        const buf = Buffer.alloc(4);
        buf.writeInt32LE(~this.state.crc & 0xffffffff, 0);
        crc = buf.readUInt32LE(0);
        if (crc !== this.crc) {
          throw new Error("Invalid CRC");
        }
        if (this.state.size !== this.size) {
          throw new Error("Invalid size");
        }
      }
    }

    static getCrcTable() {
      let crcTable = /** @type {any} */ (CrcVerify).crcTable;
      if (!crcTable) {
        /** @type {any} */ (CrcVerify).crcTable = crcTable = [];
        const b = Buffer.alloc(4);
        for (let n = 0; n < 256; n++) {
          let c = n;
          for (let k = 8; --k >= 0; ) {
            if ((c & 1) !== 0) {
              c = 0xedb88320 ^ (c >>> 1);
            } else {
              c = c >>> 1;
            }
          }
          if (c < 0) {
            b.writeInt32LE(c, 0);
            c = b.readUInt32LE(0);
          }
          crcTable[n] = c;
        }
      }
      return crcTable;
    }
  }

  const parseZipTime = function (timebytes, datebytes) {
    const timebits = toBits(timebytes, 16);
    const datebits = toBits(datebytes, 16);

    const mt = {
      h: parseInt(timebits.slice(0, 5).join(""), 2),
      m: parseInt(timebits.slice(5, 11).join(""), 2),
      s: parseInt(timebits.slice(11, 16).join(""), 2) * 2,
      Y: parseInt(datebits.slice(0, 7).join(""), 2) + 1980,
      M: parseInt(datebits.slice(7, 11).join(""), 2),
      D: parseInt(datebits.slice(11, 16).join(""), 2),
    };
    const dt_str =
      [mt.Y, mt.M, mt.D].join("-") +
      " " +
      [mt.h, mt.m, mt.s].join(":") +
      " GMT+0";
    return new Date(dt_str).getTime();
  };

  const toBits = function (dec, size) {
    let b = (dec >>> 0).toString(2);
    while (b.length < size) {
      b = "0" + b;
    }
    return b.split("");
  };

  const readUInt64LE = function (buffer, offset) {
    return (
      buffer.readUInt32LE(offset + 4) * 0x0000000100000000 +
      buffer.readUInt32LE(offset)
    );
  };

  // const unZip = async (file, dir) => {
  // const zip = new StreamZip.async({ file });
  // await zip.extract(null, dir);
  // await zip.close();
  // };

  return StreamZip;
})();

// optimized, download from mirrors, keep-alive

// 在应用打开的时候就做一次 mirror 查找？

// 暂时先用内置 mirror 列表，以后可以考虑国内放一个或多个固定地址来存 mirror 的列表

/**
 * Assert the value is true, or throw an error.
 * @param {boolean} value
 * @param {string | Error | any} [message]
 */
const assert = (value, message) => {
  // like "node:assert", but cross platform
  if (!value) {
    throw new Error(message ?? "assertion failed");
  }
};

/**
 * Exclude the static `import` declaration matches `regexp`.
 *
 * Will be `// excluded: import xxx form ...`.
 * @param {string} sourceCode
 * @param {RegExp} regexp
 * @returns {string}
 */
const excludeImport = (sourceCode, regexp) => {
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import
  // we dont support the "string name import" in reference just match quotas, and ensure the "import" keyword in line beginning, and ensure imports in the head of file
  let ret = "";
  let position = 0;
  while (true) {
    if (sourceCode.startsWith("import", position)) {
      let start = position;
      let end = start;
      while (true) {
        if (sourceCode[start] === "'") {
          start++;
          end = sourceCode.indexOf("'", start);
          break;
        }
        if (sourceCode[start] === '"') {
          start++;
          end = sourceCode.indexOf('"', start);
          break;
        }
        start++;
      }
      const moduleName = sourceCode.slice(start, end);
      const rangeEnd = end + "'".length;
      if (regexp.test(moduleName)) {
        const mark = "// excluded: ";
        ret +=
          mark +
          sourceCode.slice(position, rangeEnd).replace(/\n/g, "\n" + mark);
        position = rangeEnd;
      } else {
        // do nothing
      }
    } else if (sourceCode.startsWith("//", position)) {
      // do nothing
    } else if (sourceCode.startsWith("/*", position)) {
      const rangeEnd = sourceCode.indexOf("*/", position) + "*/".length;
      ret += sourceCode.slice(position, rangeEnd);
      position = rangeEnd;
    } else if (
      sourceCode.startsWith("\n", position) ||
      sourceCode.startsWith("\t", position) ||
      sourceCode.startsWith(" ", position)
    ) {
      // must not be start with these for useful statements, like "\n  import xxx ..."
    } else {
      break;
    }
    const nextPosition = sourceCode.indexOf("\n", position) + 1;
    ret += sourceCode.slice(position, nextPosition);
    position = nextPosition;
  }
  ret += sourceCode.slice(position);
  return ret;
};

/**
 * Get next auto increased int number. Used for id generate or others.
 * @returns {number}
 */
const nextInt = (() => {
  let v = 0;
  return () => ++v;
})();

/**
 * Solve path, like path.resolve + support of home dir prefix.
 * @param {boolean} absolute
 * @param {...string} parts
 * @returns {string}
 */
const solvePath = (absolute, ...parts) => {
  if (parts[0].startsWith("~")) {
    parts[0] = parts[0].slice(1);
    parts.unshift(os.homedir());
  }
  // we do not use path.resolve directy because we want to control absolute or not
  if (!path.isAbsolute(parts[0]) && absolute) {
    parts.unshift(process.cwd());
  }
  return path.join(...parts); // path.join will convert '\\' to '/' also, like path.resolve
};

/**
@typedef {
  "linux-x64" | "mac-arm64" | "win-x64"
} Platform 短期内不谋求增加新平台. 长远来看，应该是 ` "linux-x64" | "linux-arm64" | "mac-x64" | "mac-arm64" | "win-x64" | "win-arm64" `
@typedef {
  {
    platforms: Platform[],
    kind: "raw" | "zip" | "gzip" | "tar" | "tar-gzip",
    url: string,
    path: string,
  }
} Asset
@typedef {
  {
    entriesRoot?: HTMLElement,
    entries?: () => any,
    profileRoot: HTMLElement,
    profile: () => any,
    preview: (input: any) => void,
  }
} ActionUiController 之所以叫 controller 是因为类似 https://developer.mozilla.org/en-US/docs/Web/API/AbortController
@typedef {
  {
    progress: () => number,
    cancel: () => void,
    wait: Promise<void>,
  }
} ActionExecuteController
@typedef {
  {
    finished: number,
    running: number,
    amount: number,
  }
} RunnerProgress The `running` property may be float.
@typedef {
  {
    progress: () => RunnerProgress,
    stop: () => void,
    wait: Promise<any>,
  }
} Runner
@typedef {
  {
    id: string,
    name: string,
    description: string,
    kind: StartActionRequest["entries"]["kind"],
    ui: (profile: any) => ActionUiController,
    execute: (profile: any, entry: any) => ActionExecuteController,
  }
} Action
@typedef {
  {
    id: string,
    version: string,
    name: string,
    description: string,
    dependencies: string[],
    assets: Asset[],
    actions: Action[],
    profiles: any[],
  }
} Extension
@typedef {
  {
    input: {
      main: string[],
    },
    output: {
      main: string[],
    },
  }
} ConverterEntry
@typedef {
  {
    path: string,
    type: "file" | "dir",
  }[]
} ReadDirResponse
@typedef {
  {
    id: string,
    name: string,
    description: string,
    actions: {
      id: string,
      name: string,
      description: string,
    }[],
    profiles: {
      id: string,
      name: string,
      description: string,
      actionId: string,
      extensionId: string,
    }[],
  }[]
} ListExtensionsResponse
@typedef {
  {
    progress: () => {
      download: {
        finished: number,
        amount: number,
      },
    },
    cancel: () => void,
    wait: Promise<void>,
  }
} InstallExtensionController
@typedef {
  {
    url: string,
  }
} InstallExtensionRequest
@typedef {
  {
    id: string,
    version: string,
  }
} UninstallExtensionRequest
@typedef {
  {
    kind: "number-sequence",
    begin: number,
    end: number,
  }
} EntriesNumberSequence 以后可能有用
@typedef {
  {
    kind: "common-files",
    entries?: {
      inputFile: string,
      outputFile: string,
    }[],
    inputDir: string,
    outputDir: string,
    outputExtension: string,
  }
} EntriesCommonFiles 最常用的，包含扫描文件夹等功能
@typedef {
  {
    kind: "plain",
    entries: any[],
  }
} EntriesPlain 直接就是 entries 本身，也许可以适配 yt-dlp 这种凭空出个文件的场景
@typedef {
  {
    extensionId: string,
    extensionVersion: string,
    actionId: string,
    profile: any,
    entries: EntriesPlain | EntriesCommonFiles | EntriesNumberSequence,
  }
} StartActionRequest
@typedef {
  {
    runnerId: number,
  }
} StartActionResponse
@typedef {
  {
    runnerId: number,
  }
} GetRunnerInfoRequest
@typedef {
  {
    progress: RunnerProgress,
  }
} GetRunnerInfoResponse
*/

const html = (/** @type {any} */ [s]) => s;

const page = () => html`
  <!DOCTYPE html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <meta name="color-scheme" content="light dark" />
    <title>clevert</title>
    <!-- 虽然缩进比较多，但是 css 没啥问题 -->
    <style>
      * {
        box-sizing: border-box;
      }
      html {
        --bg: #fff;
        --border: #888;
        --hover: #eee;
        --active: #aaa7;
      }
      @media (prefers-color-scheme: dark) {
        html {
          --bg: #000;
          --border: #888;
          --hover: #222;
          --active: #444;
        }
      }
      body {
        min-height: 100vh;
        margin: 0;
        font-family: system-ui;
        background: var(--bg);
      }
      top_bar_ {
        position: fixed;
        display: flex;
        gap: 8px;
        width: 100%;
        height: calc(48px + 1px);
        padding: 8px;
        left: 0;
        top: 0;
        line-height: 32px;
        background: var(--bg);
        border-bottom: 1px solid var(--border);
      }
      side_bar_ {
        display: block;
        width: 220px;
        height: 100vh;
        /* padding: 8px; */
        /* padding-top: calc(48px + 1px + 8px); */
        border-right: 1px solid var(--border);
        position: absolute;
        top: 0;
        background: var(--bg);
        overflow: hidden;
      }
      main_list_,
      actions_list_ {
        display: block;
        width: 100%;
        padding: 8px;
        height: 100%;
        transition: 0.5s;
      }
      actions_list_ {
        position: relative;
        top: -100%;
        left: 100%;
      }
      main_list_[second_],
      actions_list_[second_] {
        transform: translateX(-100%);
      }
      side_bar_item_ {
        display: block;
        padding: 8px;
        line-height: 16px;
      }
      side_bar_item_:hover {
        background: var(--hover);
      }
      side_bar_item_:active {
        background: var(--active);
      }
      extensions_market_,
      current_action_ {
        position: fixed;
        top: 0;
        right: 0;
        left: 220px;
        height: 100vh;
        padding: 8px;
        padding-top: calc(48px + 1px + 8px);
        overflow: auto;
        transition: 0.5s;
      }
      extensions_market_[page_off_],
      current_action_[page_off_] {
        visibility: hidden;
        opacity: 0;
      }
      input_output_config_,
      action_root_,
      action_controls_ {
        display: block;
      }
      entries_common_files_,
      entries_common_files_ > div {
        display: grid;
        gap: 8px;
        /* border: 1px solid var(--border); */
      }
      entries_common_files_ {
        margin-bottom: 8px;
      }
    </style>
  </head>
  <body>
    <script type="module" src="/index.js"></script>
  </body>
`;

const inPage = async () => {
  // Extension Market
  const $extensionsMarket = document.body.appendChild(
    document.createElement("extensions_market_")
  );
  $extensionsMarket.appendChild(document.createElement("label")).textContent =
    "Install URL: ";
  const $extensionInstallUrl = $extensionsMarket.appendChild(
    document.createElement("input")
  );
  const $extensionInstallButton = $extensionsMarket.appendChild(
    document.createElement("button")
  );
  $extensionInstallButton.textContent = "Install";
  $extensionInstallButton.onclick = async () => {
    const request = /** @type {InstallExtensionRequest} */ ({
      url: $extensionInstallUrl.value,
    });
    await fetch("/install-extension", {
      method: "POST",
      body: JSON.stringify(request),
    });
    await refreshMainList();
  };

  // Current Action
  const $currentAction = document.body.appendChild(
    document.createElement("current_action_")
  );

  // Top Bar
  const $topBar = document.body.appendChild(document.createElement("top_bar_"));
  const $unfoldSideBarButton = $topBar.appendChild(
    document.createElement("button")
  );
  $unfoldSideBarButton.textContent = "Unfold";
  $unfoldSideBarButton.onclick = async () => {
    $sideBar.removeAttribute("fold_");
  };

  // Side Bar
  const $sideBar = document.body.appendChild(
    document.createElement("side_bar_")
  );
  const $mainList = $sideBar.appendChild(document.createElement("main_list_"));
  const $foldSideBarButton = $mainList.appendChild(
    document.createElement("side_bar_item_")
  );
  $foldSideBarButton.textContent = "Fold";
  $foldSideBarButton.onclick = async () => {
    $sideBar.setAttribute("fold_", "");
  };
  const $toExtensionMarketButton = $mainList.appendChild(
    document.createElement("side_bar_item_")
  );
  $toExtensionMarketButton.textContent = "Extension Market";
  $toExtensionMarketButton.onclick = async () => {
    $extensionsMarket.removeAttribute("page_off_");
    $currentAction.setAttribute("page_off_", "");
  };
  const $actionsList = $sideBar.appendChild(
    document.createElement("actions_list_")
  );
  const $backToMainListButton = $actionsList.appendChild(
    document.createElement("side_bar_item_")
  );
  $backToMainListButton.textContent = "Back";
  $backToMainListButton.onclick = async () => {
    $mainList.removeAttribute("second_");
    $actionsList.removeAttribute("second_");
  };

  const refreshMainList = async () => {
    const extensions = /** @type {ListExtensionsResponse} */ (
      await (await fetch("/list-extensions")).json()
    );
    $mainList.innerHTML = "";
    $mainList.appendChild($foldSideBarButton);
    $mainList.appendChild(document.createElement("hr"));
    $mainList.appendChild($toExtensionMarketButton);
    $mainList.appendChild(document.createElement("hr"));
    for (const extension of extensions) {
      const $extension = $mainList.appendChild(
        document.createElement("side_bar_item_")
      );
      $extension.textContent = extension.id;
      $extension.onclick = async () => {
        $actionsList.innerHTML = "";
        $actionsList.appendChild($backToMainListButton);
        $actionsList.appendChild(document.createElement("hr"));
        for (const action of extension.actions) {
          const $action = $actionsList.appendChild(
            document.createElement("side_bar_item_")
          );
          $action.textContent = action.id;
          $action.onclick = async () => {
            await refreshCurrentAction(extension.id, action.id);
            $extensionsMarket.setAttribute("page_off_", "");
            $currentAction.removeAttribute("page_off_");
          };
        }
        $mainList.setAttribute("second_", "");
        $actionsList.setAttribute("second_", "");
      };
    }
  };

  /**
   * @param {string} extensionId
   * @param {string} actionId
   */
  const refreshCurrentAction = async (extensionId, actionId) => {
    const extension = /** @type {Extension} */ (
      (await import("/extension/" + extensionId + "/index.js")).default
    );
    const action = extension.actions.find((action) => action.id === actionId);
    if (action === undefined) {
      alert("action === undefined");
      return;
    }
    const profile = extension.profiles.find(
      (profile) => profile.actionId === action.id
    );
    if (profile === undefined) {
      alert("profile === undefined");
      return;
    }
    $currentAction.innerHTML = "";
    $currentAction.setAttribute("kind_", action.kind);

    if (action.kind === "common-files") {
      // 允许使用 dir, 单个文件列表等。这里提供一个切换？
      // 适配一种场景，就是 yt-dlp 这样凭空出个文件
      const $entriesCommonFiles = $currentAction.appendChild(
        document.createElement("entries_common_files_")
      );
      const $select = $entriesCommonFiles.appendChild(
        document.createElement("select")
      );
      const $optDir = $select.appendChild(document.createElement("option"));
      $optDir.textContent = "Dir mode";
      $optDir.value = "dir";
      const $optFiles = $select.appendChild(document.createElement("option"));
      $optFiles.textContent = "Files mode";
      $optFiles.value = "files";
      // ---
      const $optDirPanel = $entriesCommonFiles.appendChild(
        document.createElement("div")
      );
      const $inputDir = $optDirPanel.appendChild(
        document.createElement("input")
      );
      $inputDir.placeholder = "Input Dir";
      $inputDir.value = "/home/kkocdko/misc/code/clevert/temp/converter-test/i"; // does not support "~/adbf" ?
      const $outputDir = $optDirPanel.appendChild(
        document.createElement("input")
      );
      $outputDir.placeholder = "Output Dir";
      $outputDir.value =
        "/home/kkocdko/misc/code/clevert/temp/converter-test/o";
      let $outputExtension;
      if (profile?.entries?.outputExtensionOptions) {
        const options = profile.entries.outputExtensionOptions;
        $outputExtension = $optDirPanel.appendChild(
          document.createElement("select")
        );
        for (const option of options) {
          const $option = $outputExtension.appendChild(
            document.createElement("option")
          );
          $option.textContent = option;
          if (profile?.entries?.outputExtension) {
            if (profile?.entries?.outputExtension === option) {
              $option.selected = true;
            }
          } else {
            if (options[0] === option) {
              $option.selected = true;
            }
          }
        }
      } else {
        $outputExtension = $optDirPanel.appendChild(
          document.createElement("input")
        );
        $outputExtension.placeholder = "Output Extension";
        if (profile?.entries?.outputExtension) {
          $outputExtension.value = profile?.entries?.outputExtension;
        }
      }

      // ---
      // const $optFilesPanel = $entriesCommonFiles.appendChild(
      //   document.createElement("div")
      // );
      // $select.onchange = () => {
      //   if ($select.value === "dir") {
      //   } else if ($select.value === "files") {
      //   } else {
      //   }
      // };

      const ui = action.ui(profile);
      if (ui.entriesRoot) {
        $currentAction.appendChild(ui.entriesRoot);
      }
      $currentAction.appendChild(ui.profileRoot);

      const $actionControls = $currentAction.appendChild(
        document.createElement("action_controls_")
      );
      const $runnerProgress = $actionControls.appendChild(
        document.createElement("pre")
      );
      const refreshRunnerProgress = async (/** @type {number} */ runnerId) => {
        const request = /** @type {GetRunnerInfoRequest} */ ({ runnerId });
        const response = /** @type {GetRunnerInfoResponse} */ (
          await (
            await fetch("/get-runner-progress", {
              method: "POST",
              body: JSON.stringify(request),
            })
          ).json()
        );
        $runnerProgress.textContent = JSON.stringify(response);
      };
      const $startButton = $actionControls.appendChild(
        document.createElement("button")
      );
      $startButton.textContent = "Start";
      $startButton.onclick = async () => {
        const startActionRequest = /** @type {StartActionRequest} */ ({
          extensionId: extension.id,
          actionId: action.id,
          profile: ui.profile(),
          entries: {
            kind: "common-files",
            inputDir: $inputDir.value,
            outputDir: $outputDir.value,
            outputExtension: $outputExtension.value,
          },
        });
        const startActionResponse = /** @type {StartActionResponse} */ (
          await (
            await fetch("/start-action", {
              method: "POST",
              body: JSON.stringify(startActionRequest),
            })
          ).json()
        );
        setInterval(async () => {
          refreshRunnerProgress(startActionResponse.runnerId);
        }, 1000);
      };
      return;
    }

    {
      alert("todo:" + action.kind);
      return;
    }
  };

  {
    // main
    await refreshMainList();
    $extensionsMarket.removeAttribute("page_off_");
    $currentAction.setAttribute("page_off_", "");
  }
};

const inServer = async () => {
  // is in main
  const PATH_EXTENSIONS = "./temp/extensions";
  const PATH_CACHE = "./temp/cache";
  const CURRENT_PLATFORM = /** @type {Platform} */ (
    false
      ? undefined
      : process.platform === "linux" && process.arch === "x64"
      ? "linux-x64"
      : process.platform === "win32" && process.arch === "x64"
      ? "win-x64"
      : process.platform === "darwin" && process.arch === "x64"
      ? "mac-x64"
      : process.platform === "darwin" && process.arch === "arm64"
      ? "mac-arm64"
      : assert(false, "unsupported platform")
  );
  await fsp.mkdir(PATH_EXTENSIONS, { recursive: true });
  await fsp.mkdir(PATH_CACHE, { recursive: true });

  const PARALLEL = 2;
  const runners = /** @type {Map<number, Runner>} */ (new Map());

  const reqToJson = async (req) => {
    return new Promise((resolve) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        resolve(JSON.parse(body));
      });
    });
  };

  const download = async (url, path, accelerated) => {
    // TODO: 自动多源头下载
    const res = await fetch(url);
    const ab = await res.arrayBuffer();
    await fsp.writeFile(path, Buffer.from(ab));
  };

  /**
   * Determine a Promise is pending or not. https://stackoverflow.com/a/35820220
   * @param {Promise<any>} p
   * @returns {Promise<boolean>}
   */
  const isPending = async (p) => {
    const t = {};
    return (await Promise.race([p, t])) === t;
  };

  /**
   * Like `chmod -R 777 ./dir` but only apply on files, not dir.
   * @param {string} dir
   */
  const chmod777 = async (dir) => {
    for (const v of await fsp.readdir(dir, {
      withFileTypes: true,
      recursive: true,
    })) {
      if (!v.isFile()) continue;
      const a = /** @type {any} */ (v);
      const parentPath = /** @type {string} */ (a.parentPath ?? a.path); // https://nodejs.org/api/fs.html#class-fsdirent
      const p = solvePath(false, parentPath, v.name);
      await fsp.chmod(p, 0o777); // https://stackoverflow.com/a/20769157
    }
  };

  /**
   * @param {InstallExtensionRequest} req
   * @returns {InstallExtensionController}
   */
  const installExtension = (req) => {
    const abortController = new AbortController();
    let finished = 0;
    let amount = 0;
    let tempStreams = /** @type {Set<fs.WriteStream>} */ (new Set());
    let tempPaths = /** @type {Set<string>} */ (new Set());
    let allowCancel = true;
    const wait = (async () => {
      const indexJsResponse = await fetch(req.url, {
        redirect: "follow",
        signal: abortController.signal,
      });
      if (!indexJsResponse.body) {
        throw new Error("response.body is null, url = " + req.url);
      }
      amount += parseInt(indexJsResponse.headers.get("Content-Length") || "0");
      // for await (const chunk of response.body) downloaded += chunk.length;
      const indexJsTempPath = solvePath(true, PATH_CACHE, nextInt() + ".js");
      tempPaths.add(indexJsTempPath);
      const indexJsTempStream = fs.createWriteStream(indexJsTempPath);
      for await (const chunk of indexJsResponse.body) {
        finished += chunk.length;
        indexJsTempStream.write(chunk); // TODO: see docs about backpressure
      }
      await new Promise((resolve) => indexJsTempStream.end(resolve)); // https://github.com/nodejs/node/issues/2006
      const extension = /** @type {Extension} */ (
        (await import(indexJsTempPath)).default
      );
      const extensionDir = solvePath(
        true,
        PATH_EXTENSIONS,
        extension.id + "_" + extension.version
      );
      tempPaths.add(extensionDir);
      await fsp.mkdir(extensionDir, { recursive: true });
      await fsp.rename(
        indexJsTempPath,
        solvePath(true, extensionDir, "index.js")
      );
      // const tasks = []; // TODO: parallel
      for (const asset of extension.assets) {
        if (!asset.platforms.includes(CURRENT_PLATFORM)) {
          continue;
        }
        const tempExtName = false
          ? /** @type {never} */ (undefined)
          : asset.kind === "raw"
          ? "raw"
          : asset.kind === "zip"
          ? "zip"
          : /** @type {never} */ (assert(false, "unsupported asset kind"));
        const tempPath = solvePath(
          true,
          PATH_CACHE,
          nextInt() + "." + tempExtName
        );
        tempPaths.add(tempPath);
        const response = await fetch(asset.url, {
          redirect: "follow",
          signal: abortController.signal,
        });
        const tempStream = fs.createWriteStream(tempPath);
        if (!response.body) {
          throw new Error("response.body is null, url = " + asset.url);
        }
        amount += parseInt(response.headers.get("Content-Length") || "0");
        for await (const chunk of response.body) {
          finished += chunk.length;
          tempStream.write(chunk);
        }
        await new Promise((resolve) => tempStream.end(resolve));
        if (asset.kind === "zip") {
          const zip = new StreamZip.async({ file: tempPath });
          await zip.extract(null, solvePath(true, extensionDir, asset.path));
          await zip.close();
          await fsp.rm(tempPath);
        } else {
          assert(false, "unsupported asset kind");
        }
        await chmod777(extensionDir);
      }
      allowCancel = false;
    })();
    const cancel = () => {
      if (!allowCancel) {
        return;
      }
      allowCancel = false;
      abortController.abort();
      (async () => {
        // then delete the temporary files here
        // 先关 stream 再删文件
        for (const v of tempStreams) {
          await new Promise((resolve) => v.end(resolve)); // 用 await 等一下，慢一些但是稳妥
        }
        for (const v of tempPaths) {
          await fsp.rm(v, { force: true, recursive: true }); // 用 await 等一下，慢一些但是稳妥
        }
      })();
    };
    wait.catch(() => cancel());
    return {
      progress: () => ({ download: { finished, amount } }),
      cancel: cancel,
      wait: wait,
    };
  };

  const ctrler = installExtension({
    url: "http://127.0.0.1:8080/extensions/jpegxl/index.js",
  });

  setInterval(async () => {
    console.log({ p: ctrler.progress() });
  }, 1000);

  await ctrler.wait;
  throw new Error("end");

  const genEntries = async (
    /** @type {StartActionRequest["entries"]} */ opts
  ) => {
    if (opts.kind === "common-files") {
      if (opts.entries) {
        assert(false, "todo");
      }
      const entries = [];
      const inputDir = solvePath(false, opts.inputDir);
      for (const v of await fsp.readdir(inputDir, {
        withFileTypes: true,
        recursive: true,
      })) {
        const a = /** @type {any} */ (v);
        const parentPath = /** @type {string} */ (a.parentPath ?? a.path); // https://nodejs.org/api/fs.html#class-fsdirent
        const input = solvePath(false, parentPath, v.name);
        const relative = input
          .slice(inputDir.length)
          .replace(/(?<=\.)[^\\/\.]+$/, opts.outputExtension);
        const output = solvePath(false, opts.outputDir, relative);
        entries.push({
          input: { main: [input] },
          output: { main: [output] },
        });
      }
      return /** @type {any} */ (entries);
    }
    assert(false, "todo");
  };

  const server = http.createServer(async (req, res) => {
    // console.log({ url: req.url });

    if (req.url === "/") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.writeHead(200);
      res.end(page());
      return;
    }

    if (req.url === "/index.js") {
      const buffer = await fsp.readFile(import.meta.filename);
      const ret = excludeImport(buffer.toString(), /^node:.+$/);
      res.setHeader("Content-Type", "text/javascript; charset=utf-8");
      res.writeHead(200);
      res.end(ret);
      return;
    }

    if (req.url === "/favicon.ico") {
      res.setHeader("Content-Type", "image/png");
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.url === "/start-action") {
      const request = /** @type {StartActionRequest} */ (await reqToJson(req));
      const extensionIndexJs = /** @type {string} */ (
        solvePath(true, PATH_EXTENSIONS, request.extensionId, "/index.js")
      );
      const extension = /** @type {Extension} */ (
        (await import(extensionIndexJs)).default
      );
      const action = extension.actions.find(
        (action) => action.id === request.actionId
      );
      if (action === undefined) {
        assert(false, "action not found");
        return;
      }
      const entries = await genEntries(request.entries);
      const runnerId = nextInt();
      const amount = entries.length;
      let finished = 0;
      const runningControllers = /** @type {Set<ActionExecuteController>} */ (
        new Set()
      );
      const promises = [...Array(PARALLEL)].map((_, i) =>
        (async () => {
          for (let entry; (entry = entries.shift()); ) {
            const controller = action.execute(request.profile, entry);
            runningControllers.add(controller);
            await controller.wait;
            runningControllers.delete(controller);
            finished += 1;
          }
        })()
      );
      runners.set(runnerId, {
        progress: () => {
          let running = 0;
          for (const controller of runningControllers) {
            running += controller.progress();
          }
          return { finished, running, amount };
        },
        stop: () => {
          for (const controller of runningControllers) {
            controller.cancel();
            runningControllers.delete(controller);
          }
        },
        wait: Promise.all(promises),
      });
      const ret = /** @type {StartActionResponse} */ ({ runnerId });
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(JSON.stringify(ret));
      return;
    }

    if (req.url === "/stop-runner") {
      assert(false, "todo");
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(JSON.stringify({}));
      return;
    }

    if (req.url === "/get-runner-progress") {
      const request = /** @type {GetRunnerInfoRequest} */ (
        await reqToJson(req)
      );
      const runner = runners.get(request.runnerId);
      if (runner === undefined) {
        res.writeHead(404);
        res.end(JSON.stringify({}));
        return;
      }
      const ret = /** @type {GetRunnerInfoResponse} */ ({
        progress: runner.progress(),
      });
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(JSON.stringify(ret));
      return;
    }

    if (req.url?.startsWith("/extension/")) {
      console.log(req.url.split("/"));
      const [, , extensionId, fileName] = req.url.split("/");
      assert(fileName === "index.js");
      const extensionMainJs = /** @type {string} */ (
        solvePath(true, PATH_EXTENSIONS, extensionId, "/index.js")
      );
      const buffer = await fsp.readFile(extensionMainJs);
      const ret = excludeImport(buffer.toString(), /^node:.+$/);
      res.setHeader("Content-Type", "text/javascript; charset=utf-8");
      res.writeHead(200);
      res.end(ret);
      return;
    }

    if (req.url === "/list-extensions") {
      const ret = /** @type {ListExtensionsResponse} */ ([]);
      for (const entry of await fsp.readdir(PATH_EXTENSIONS)) {
        const extensionIndexJs = /** @type {string} */ (
          solvePath(true, PATH_EXTENSIONS, entry, "/index.js")
        );
        const extension = /** @type {Extension} */ (
          (await import(extensionIndexJs)).default
        );
        assert(extension.id === entry);
        ret.push({
          id: extension.id,
          name: extension.name,
          description: extension.description,
          actions: extension.actions.map((action) => ({
            id: action.id,
            name: action.name,
            description: action.description,
          })),
          profiles: extension.profiles,
        });
      }
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(JSON.stringify(ret));
      return;
    }

    if (req.url === "/install-extension") {
      const request = /** @type {InstallExtensionRequest} */ (
        await reqToJson(req)
      );
      const extensionTempIndexJs = /** @type {string} */ (
        solvePath(true, PATH_CACHE, "downloading-" + nextInt() + ".js")
      );
      await download(request.url, extensionTempIndexJs);
      const extension = /** @type {Extension} */ (
        (await import(extensionTempIndexJs)).default
      );
      const extensionDir = /** @type {string} */ (
        solvePath(true, PATH_EXTENSIONS, extension.id)
      );
      await fsp.mkdir(extensionDir);
      await fsp.rename(extensionTempIndexJs, extensionDir + "/index.js");
      for (const asset of extension.assets) {
        if (!asset.platforms.includes(CURRENT_PLATFORM)) {
          continue;
        }
        const assetExtName = /** @type {string} */ (
          false
            ? undefined
            : asset.kind === "raw"
            ? "raw"
            : asset.kind === "zip"
            ? "zip"
            : asset.kind === "gzip"
            ? "gz"
            : asset.kind === "tar"
            ? "tar"
            : asset.kind === "tar-gzip"
            ? "tar.gz"
            : assert(false, "unsupported asset kind")
        );
        const assetTemp =
          PATH_CACHE + "/downloading-" + nextInt() + "." + assetExtName;
        await download(asset.url, assetTemp);
        if (asset.kind === "raw") {
          await fsp.rename(assetTemp, extensionDir + "/" + asset.path);
        } else if (asset.kind === "zip") {
          const extractDir = extensionDir + "/" + asset.path;
          await child_process.spawn("unzip", [assetTemp, "-d", extractDir]);
        } else {
          assert(false, "unsupported yet");
        }
        await fsp.rm(assetTemp, { recursive: true });
      }
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(JSON.stringify({}));
      return;
    }

    res.writeHead(404).end("not found");
  });

  server.listen(9393, "127.0.0.1");
};

const inElectron = async () => {
  // @ts-ignore
  const { app, protocol, BrowserWindow } = await import("electron");

  const createWindow = () => {
    const win = new BrowserWindow({
      width: 1280,
      height: 720,
      title: "clevert",
      webPreferences: {
        // nodeIntegration: true,
        contextIsolation: false,
        webSecurity: false,
        sandbox: false,
        // preload: fileURLToPath(import.meta.url),
      },
      autoHideMenuBar: true,
    });
    win.loadURL("resource:///main.html");
    win.webContents.openDevTools();
  };

  app.whenReady().then(() => {
    protocol.handle("resource", async (req) => {
      console.log(req.url);
      if (req.url === "resource:///main.html") {
        const type = "text/html; charset=utf-8";
        return new Response(new Blob([page()], { type }));
      }
      if (req.url === "resource:///index.js") {
        const buffer = await fsp.readFile(import.meta.filename);
        const type = "text/javascript; charset=utf-8";
        return new Response(new Blob([buffer], { type }));
      }
      return new Response(new Blob(["not found"], { type: "text/plain" }));
    });
    createWindow();
    // mac
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
};

// inElectron()

if (globalThis.document) {
  inPage();
} else {
  inServer();
}

/*
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

*/

// ./.vscode/extensions.json
// {
//   "recommendations": ["esbenp.prettier-vscode", "runem.lit-plugin"]
//   // es6-string-html
// }

// ./.vscode/settings.json
// {
//   "editor.tokenColorCustomizations": {
//     "textMateRules": [
//       {
//         "scope": "invalid",
//         "settings": { "foreground": "#56ddc2" }
//       }
//     ]
//   }
// }

/*
//> a.mjs
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

//> c.mjs
import { hello } from "a:main";
console.log({ hello });
console.log(import.meta.url);
*/
// http://127.0.0.1:8080/extensions/jpegxl/index.js
// let c = {};

// https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html
// https://apple.stackexchange.com/q/420494/ # macos arm64 vm
// https://github.com/orgs/community/discussions/69211#discussioncomment-7941899 # macos arm64 ci free
// https://registry.npmmirror.com/binary.html?path=electron/v30.0.1/
// https://registry.npmmirror.com/-/binary/electron/v30.0.1/electron-v30.0.1-linux-x64.zip
// /home/kkocdko/misc/res/electron-v30.0.1-linux-x64/electron

// core -> extension -> action -> profile
// (以后做)  profile = extension + action + profile

// mkdir -p node_modules/electron ; dl_prefix="https://registry.npmmirror.com/electron/30.0.2/files" ; curl -o node_modules/electron/electron.d.ts -L $dl_prefix/electron.d.ts -o node_modules/electron/package.json -L $dl_prefix/package.json
