// @ts-check
/// <reference lib="esnext" />
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import events from "node:events";
import zlib from "node:zlib";
import stream from "node:stream";

// import module from "node:module";

/** Copy from [node-stream-zip](https://github.com/antelle/node-stream-zip/blob/7c5d50393418b261668b0dd4c8d9ccaa9ac913ce/node_stream_zip.js) . MIT License. */
// prettier-ignore
const StreamZip = (() => {
  if (!globalThis.process) return /** @type {never} */ (null); // https://github.com/microsoft/TypeScript/issues/19573
  const consts = {
    /* The local file header */
    LOCHDR: 30, /* LOC header size */  LOCSIG: 0x04034b50, /* "PK\003\004" */  LOCVER: 4, /* version needed to extract */  LOCFLG: 6, /* general purpose bit flag */
    LOCHOW: 8, /* compression method */  LOCTIM: 10, /* modification time(2 bytes time,2 bytes date) */  LOCCRC: 14, /* uncompressed file crc-32 value */  LOCSIZ: 18, /* compressed size */
    LOCLEN: 22, /* uncompressed size */  LOCNAM: 26, /* filename length */  LOCEXT: 28, /* extra field length */
    /* The Data descriptor */
    EXTSIG: 0x08074b50, /* "PK\007\008" */  EXTHDR: 16, /* EXT header size */  EXTCRC: 4, /* uncompressed file crc-32 value */  EXTSIZ: 8, /* compressed size */  EXTLEN: 12, /* uncompressed size */
    /* The central directory file header */
    CENHDR: 46, /* CEN header size */  CENSIG: 0x02014b50, /* "PK\001\002" */  CENVEM: 4, /* version made by */  CENVER: 6, /* version needed to extract */  CENFLG: 8, /* encrypt, decrypt flags */
    CENHOW: 10, /* compression method */  CENTIM: 12, /* modification time (2 bytes time, 2 bytes date) */  CENCRC: 16, /* uncompressed file crc-32 value */  CENSIZ: 20, /* compressed size */
    CENLEN: 24, /* uncompressed size */  CENNAM: 28, /* filename length */  CENEXT: 30, /* extra field length */  CENCOM: 32, /* file comment length */  CENDSK: 34, /* volume number start */
    CENATT: 36, /* internal file attributes */  CENATX: 38, /* external file attributes (host system dependent) */  CENOFF: 42, /* LOC header offset */
    /* The entries in the end of central directory */
    ENDHDR: 22, /* END header size */  ENDSIG: 0x06054b50, /* "PK\005\006" */  ENDSIGFIRST: 0x50,  ENDSUB: 8, /* number of entries on this disk */
    ENDTOT: 10, /* total number of entries */  ENDSIZ: 12, /* central directory size in bytes */  ENDOFF: 16, /* offset of first CEN header */  ENDCOM: 20, /* zip file comment length */
    MAXFILECOMMENT: 0xffff,
    /* The entries in the end of ZIP64 central directory locator */
    ENDL64HDR: 20, // ZIP64 end of central directory locator header size
    ENDL64SIG: 0x07064b50, // ZIP64 end of central directory locator signature
    ENDL64SIGFIRST: 0x50,
    ENDL64OFS: 8, // ZIP64 end of central directory offset
    /* The entries in the end of ZIP64 central directory */
    END64HDR: 56, /* ZIP64 end of central directory header size  */  END64SIG: 0x06064b50, /* ZIP64 end of central directory signature */
    END64SIGFIRST: 0x50,  END64SUB: 24, /* number of entries on this disk */  END64TOT: 32, /* total number of entries */  END64SIZ: 40,  END64OFF: 48,
    /* Compression methods */
    STORED: 0, /* no compression */  SHRUNK: 1, /* shrunk */  REDUCED1: 2, /* reduced with compression factor 1 */
    REDUCED2: 3, /* reduced with compression factor 2 */  REDUCED3: 4, /* reduced with compression factor 3 */  REDUCED4: 5, /* reduced with compression factor 4 */  IMPLODED: 6, /* imploded */
    // 7 reserved
    DEFLATED: 8, /* deflated */  ENHANCED_DEFLATED: 9, /* deflate64 */  PKWARE: 10, /* PKWare DCL imploded */
    // 11 reserved
    BZIP2: 12, //  compressed using BZIP2
    // 13 reserved
    LZMA: 14, // LZMA
    // 15-17 reserved
    IBM_TERSE: 18, // compressed using IBM TERSE
    IBM_LZ77: 19, //IBM LZ77 z
    /* General purpose bit flag */
    FLG_ENC: 0, /* encrypted file */  FLG_COMP1: 1, /* compression option */  FLG_COMP2: 2, /* compression option */  FLG_DESC: 4, /* data descriptor */  FLG_ENH: 8, /* enhanced deflation */
    FLG_STR: 16, /* strong encryption */  FLG_LNG: 1024, /* language encoding */  FLG_MSK: 4096, /* mask header values */  FLG_ENTRY_ENC: 1,
    /* 4.5 Extensible data fields */
    EF_ID: 0, EF_SIZE: 2,
    /* Header IDs */
    ID_ZIP64: 0x0001, ID_AVINFO: 0x0007, ID_PFS: 0x0008, ID_OS2: 0x0009, ID_NTFS: 0x000a, ID_OPENVMS: 0x000c, ID_UNIX: 0x000d, ID_FORK: 0x000e, ID_PATCH: 0x000f, ID_X509_PKCS7: 0x0014,
    ID_X509_CERTID_F: 0x0015, ID_X509_CERTID_C: 0x0016, ID_STRONGENC: 0x0017, ID_RECORD_MGT: 0x0018, ID_X509_PKCS7_RL: 0x0019, ID_IBM1: 0x0065, ID_IBM2: 0x0066, ID_POSZIP: 0x4690,
    EF_ZIP64_OR_32: 0xffffffff,
    EF_ZIP64_OR_16: 0xffff,
  };
  const StreamZip = function (config) {
    let fd, fileSize, chunkSize, op, centralDirectory, closed;
    const ready = false, /** @type {any} */ that = this, /** @type {any} */ entries = config.storeEntries !== false ? {} : null, fileName = config.file, textDecoder = config.nameEncoding ? new TextDecoder(config.nameEncoding) : null;
    open();
    function open() {
      if (config.fd) {
        fd = config.fd;
        readFile();
      } else {
        fs.open(fileName, "r", (err, f) => {
          if (err) return that.emit("error", err);
          fd = f;
          readFile();
        });
      }
    }
    function readFile() {
      fs.fstat(fd, (err, stat) => {
        if (err) return that.emit("error", err);
        fileSize = stat.size;
        chunkSize = config.chunkSize || Math.round(fileSize / 1000);
        chunkSize = Math.max(Math.min(chunkSize, Math.min(128 * 1024, fileSize)), Math.min(1024, fileSize));
        readCentralDirectory();
      });
    }
    function readUntilFoundCallback(err, bytesRead) {
      if (err || !bytesRead) return that.emit("error", err || new Error("Archive read error"));
      let pos = op.lastPos, bufferPosition = pos - op.win.position;
      const buffer = op.win.buffer, minPos = op.minPos;
      while (--pos >= minPos && --bufferPosition >= 0) {
        if (buffer.length - bufferPosition >= 4 && buffer[bufferPosition] === op.firstByte) {
          // quick check first signature byte
          if (buffer.readUInt32LE(bufferPosition) === op.sig) {
            op.lastBufferPosition = bufferPosition;
            op.lastBytesRead = bytesRead;
            op.complete();
            return;
          }
        }
      }
      if (pos === minPos) return that.emit("error", new Error("Bad archive"));
      op.lastPos = pos + 1;
      op.chunkSize *= 2;
      if (pos <= minPos) return that.emit("error", new Error("Bad archive"));
      const expandLength = Math.min(op.chunkSize, pos - minPos);
      op.win.expandLeft(expandLength, readUntilFoundCallback);
    }
    function readCentralDirectory() {
      const totalReadLength = Math.min(consts.ENDHDR + consts.MAXFILECOMMENT, fileSize);
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
      op.win.read(fileSize - op.chunkSize, op.chunkSize, readUntilFoundCallback);
    }
    function readCentralDirectoryComplete() {
      const buffer = op.win.buffer, pos = op.lastBufferPosition;
      try {
        centralDirectory =  /** @type {any} */(new CentralDirectoryHeader());
        centralDirectory.read(buffer.slice(pos, pos + consts.ENDHDR));
        centralDirectory.headerOffset = op.win.position + pos;
        if (centralDirectory.commentLength) {
          that.comment = buffer.slice(pos + consts.ENDHDR, pos + consts.ENDHDR + centralDirectory.commentLength).toString();
        } else {
          that.comment = null;
        }
        that.entriesCount = centralDirectory.volumeEntries;
        that.centralDirectory = centralDirectory;
        if ((centralDirectory.volumeEntries === consts.EF_ZIP64_OR_16 && centralDirectory.totalEntries === consts.EF_ZIP64_OR_16) || centralDirectory.size === consts.EF_ZIP64_OR_32 || centralDirectory.offset === consts.EF_ZIP64_OR_32) {
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
        op.win.read(op.lastPos - op.chunkSize, op.chunkSize, readUntilFoundCallback);
      }
    }
    function readZip64CentralDirectoryLocatorComplete() {
      const buffer = op.win.buffer, locHeader = new CentralDirectoryLoc64Header();
      locHeader.read(buffer.slice(op.lastBufferPosition, op.lastBufferPosition + consts.ENDL64HDR));
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
      op.win.read(fileSize - op.chunkSize, op.chunkSize, readUntilFoundCallback);
    }
    function readZip64CentralDirectoryComplete() {
      const buffer = op.win.buffer;
      const zip64cd = new CentralDirectoryZip64Header();
      zip64cd.read(buffer.slice(op.lastBufferPosition, op.lastBufferPosition + consts.END64HDR));
      that.centralDirectory.volumeEntries = zip64cd.volumeEntries;
      that.centralDirectory.totalEntries = zip64cd.totalEntries;
      that.centralDirectory.size = zip64cd.size;
      that.centralDirectory.offset = zip64cd.offset;
      that.entriesCount = zip64cd.volumeEntries;
      op = {};
      readEntries();
    }
    function readEntries() {
      op = { win: new FileWindowBuffer(fd), pos: centralDirectory.offset, chunkSize, entriesLeft: centralDirectory.volumeEntries };
      op.win.read(op.pos, Math.min(chunkSize, fileSize - op.pos), readEntriesCallback);
    }
    function readEntriesCallback(err, bytesRead) {
      if (err || !bytesRead) return that.emit("error", err || new Error("Entries read error"));
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
          const entryHeaderSize = entry.fnameLen + entry.extraLen + entry.comLen;
          const advanceBytes = entryHeaderSize + (op.entriesLeft > 1 ? consts.CENHDR : 0);
          if (bufferLength - bufferPos < advanceBytes) {
            op.win.moveRight(chunkSize, readEntriesCallback, bufferPos);
            op.move = true;
            return;
          }
          entry.read(buffer, bufferPos, textDecoder);
          if (!config.skipEntryNameValidation) entry.validateName();
          if (entries) entries[entry.name] = entry;
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
    function checkEntriesExist() { if (!entries) throw new Error("storeEntries disabled"); }
    Object.defineProperty(this, "ready", { get() { return ready; } });
    this.entry = function (name) { checkEntriesExist(); return entries[name]; };
    this.entries = function () { checkEntriesExist(); return entries; };
    this.stream = function (entry, callback) {
      return this.openEntry(
        entry,
        (err, entry) => {
          if (err) return callback(err);
          const offset = dataOffset(entry);
          let /** @type {any} */ entryStream = new EntryDataReaderStream(fd, offset, entry.compressedSize);
          if (entry.method === consts.STORED) {
            // nothing to do
          } else if (entry.method === consts.DEFLATED) {
            entryStream = entryStream.pipe(zlib.createInflateRaw());
          } else {
            return callback(new Error("Unknown compression method: " + entry.method));
          }
          if (canVerifyCrc(entry)) entryStream = entryStream.pipe(new EntryVerifyStream(entryStream, entry.crc, entry.size));
          callback(null, entryStream);
        },
        false
      );
    };
    this.entryDataSync = function (entry) {
      let err = null;
      this.openEntry( entry, (e, en) => { err = e; entry = en; }, true);
      if (err) throw err;
      let data = Buffer.alloc(entry.compressedSize);
      new FsRead(fd, data, 0, entry.compressedSize, dataOffset(entry), (e) => { err = e; }).read(true);
      if (err) throw err;
      if (entry.method === consts.STORED) {
        // nothing to do
      } else if (entry.method === consts.DEFLATED || entry.method === consts.ENHANCED_DEFLATED) {
        data = zlib.inflateRawSync(data);
      } else {
        throw new Error("Unknown compression method: " + entry.method);
      }
      if (data.length !== entry.size) throw new Error("Invalid size");
      if (canVerifyCrc(entry)) { const verify = new CrcVerify(entry.crc, entry.size); verify.data(data); }
      return data;
    };
    this.openEntry = function (entry, callback, sync) {
      if (typeof entry === "string") { checkEntriesExist(); entry = entries[entry]; if (!entry) return callback(new Error("Entry not found")); }
      if (!entry.isFile) return callback(new Error("Entry is not file"));
      if (!fd) return callback(new Error("Archive closed"));
      const buffer = Buffer.alloc(consts.LOCHDR);
      new FsRead(fd, buffer, 0, buffer.length, entry.offset, (err) => {
        if (err) return callback(err);
        let readEx;
        try {
          entry.readDataHeader(buffer);
          if (entry.encrypted) readEx = new Error("Entry encrypted");
        } catch (ex) { readEx = ex; }
        callback(readEx, entry);
      }).read(sync);
    };
    function dataOffset(entry) { return entry.offset + consts.LOCHDR + entry.fnameLen + entry.extraLen; }
    function canVerifyCrc(entry) { return (entry.flags & 0x8) !== 0x8; } // if bit 3 (0x08) of the general-purpose flags field is set, then the CRC-32 and file sizes are not known when the header is written
    function extract(entry, outPath, callback) {
      that.stream(entry, (err, stm) => {
        if (err) {
          callback(err);
        } else {
          let fsStm, errThrown;
          stm.on("error", (err) => {
            errThrown = err;
            if (fsStm) { stm.unpipe(fsStm); fsStm.close(() => { callback(err); }); }
          });
          fs.open(outPath, "w", (err, fdFile) => {
            if (err) return callback(err);
            if (errThrown) {
              fs.close(fd, () => { callback(errThrown); });
              return;
            }
            fsStm = fs.createWriteStream(outPath, { fd: fdFile });
            fsStm.on("finish", () => {
              that.emit("extract", entry, outPath);
              if (!errThrown) callback();
            });
            stm.pipe(fsStm);
          });
        }
      });
    }
    function createDirectories(baseDir, dirs, callback) {
      if (!dirs.length) return callback();
      let dir = dirs.shift();
      dir = path.join(baseDir, path.join(...dir));
      fs.mkdir(dir, { recursive: true }, (err) => {
        if (err && err.code !== "EEXIST") return callback(err);
        createDirectories(baseDir, dirs, callback);
      });
    }
    function extractFiles(baseDir, baseRelPath, files, callback, extractedCount) {
      if (!files.length) return callback(null, extractedCount);
      const file = files.shift();
      const targetPath = path.join(baseDir, file.name.replace(baseRelPath, ""));
      extract(file, targetPath, (err) => {
        if (err) return callback(err, extractedCount);
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
          if (entryName.length && entryName[entryName.length - 1] !== "/") entryName += "/";
        }
      }
      if (!entry || entry.isDirectory) {
        const files = [], dirs = [], allDirs = {};
        for (const e in entries) {
          if (Object.prototype.hasOwnProperty.call(entries, e) && e.lastIndexOf(entryName, 0) === 0) {
            let relPath = e.replace(entryName, "");
            const childEntry = entries[e];
            if (childEntry.isFile) {
              files.push(childEntry);
              relPath = path.dirname(relPath);
            }
            if (relPath && !allDirs[relPath] && relPath !== ".") {
              allDirs[relPath] = true;
              let parts = relPath.split("/").filter((f) => f);
              if (parts.length) dirs.push(parts);
              while (parts.length > 1) {
                parts = parts.slice(0, parts.length - 1);
                const partsPath = parts.join("/");
                if (allDirs[partsPath] || partsPath === ".") break;
                allDirs[partsPath] = true;
                dirs.push(parts);
              }
            }
          }
        }
        dirs.sort((x, y) => x.length - y.length);
        if (dirs.length) {
          createDirectories(outPath, dirs, (err) => {
            if (err) callback(err);
            else extractFiles(outPath, entryName, files, callback, 0);
          });
        } else {
          extractFiles(outPath, entryName, files, callback, 0);
        }
      } else {
        fs.stat(outPath, (err, stat) => {
          if (stat && stat.isDirectory()) {
            extract(entry, path.join(outPath, path.basename(entry.name)), callback);
          } else {
            extract(entry, outPath, callback);
          }
        });
      }
    };
    this.close = function (callback) {
      if (closed || !fd) {
        closed = true;
        if (callback) callback();
      } else {
        closed = true;
        fs.close(fd, (err) => { fd = null; if (callback) callback(err); });
      }
    };
    const originalEmit = events.EventEmitter.prototype.emit;
    this.emit = function (...args) { if (!closed) return originalEmit.call(this, ...args); };
  };
  StreamZip.debugLog = (...args) => { if (/** @type {any} */ (StreamZip).debug) console.log(...args); };
  const inherits = function (ctor, superCtor) {
    ctor.super_ = superCtor;
    ctor.prototype = Object.create(superCtor.prototype, { constructor: { value: ctor, enumerable: false, writable: true, configurable: true } });
  };
  inherits(StreamZip, events.EventEmitter);
  const propZip = Symbol("zip");
  StreamZip.async = class StreamZipAsync extends events.EventEmitter {
    constructor(config) {
      super();
      const zip = /** @type {any} */ (new StreamZip(config));
      zip.on("entry", (entry) => this.emit("entry", entry));
      zip.on("extract", (entry, outPath) => this.emit("extract", entry, outPath));
      this[propZip] = new Promise((resolve, reject) => {
        zip.on("ready", () => {
          zip.removeListener("error", reject);
          resolve(zip);
        });
        zip.on("error", reject);
      });
    }
    get entriesCount() { return this[propZip].then((zip) => zip.entriesCount); }
    get comment() { return this[propZip].then((zip) => zip.comment); }
    async entry(name) { const zip = await this[propZip]; return zip.entry(name); }
    async entries() { const zip = await this[propZip]; return zip.entries(); }
    async stream(entry) {
      const zip = await this[propZip];
      return new Promise((resolve, reject) => {
        zip.stream(entry, (err, stm) => {
          if (err) reject(err);
          else resolve(stm);
        });
      });
    }
    async entryData(entry) {
      const stm = await this.stream(entry);
      return new Promise((resolve, reject) => {
        const data = [];
        stm.on("data", (chunk) => data.push(chunk));
        stm.on("end", () => { resolve(Buffer.concat(data)); });
        stm.on("error", (err) => { stm.removeAllListeners("end"); reject(err); });
      });
    }
    async extract(entry, outPath) {
      const zip = await this[propZip];
      return new Promise((resolve, reject) => {
        zip.extract(entry, outPath, (err, res) => {
          if (err) reject(err);
          else resolve(res);
        });
      });
    }
    async close() {
      const zip = await this[propZip];
      return new Promise((resolve, reject) => {
        zip.close((err) => {
          if (err) reject(err);
          else /** @type {any} */ (resolve)();
        });
      });
    }
  };
  class CentralDirectoryHeader {
    read(data) {
      if (data.length !== consts.ENDHDR || data.readUInt32LE(0) !== consts.ENDSIG) throw new Error("Invalid central directory");
      this.volumeEntries = data.readUInt16LE(consts.ENDSUB); // number of entries on this volume
      this.totalEntries = data.readUInt16LE(consts.ENDTOT); // total number of entries
      this.size = data.readUInt32LE(consts.ENDSIZ); // central directory size in bytes
      this.offset = data.readUInt32LE(consts.ENDOFF); // offset of first CEN header
      this.commentLength = data.readUInt16LE(consts.ENDCOM); // zip file comment length
    }
  }
  class CentralDirectoryLoc64Header {
    read(data) {
      if (data.length !== consts.ENDL64HDR || data.readUInt32LE(0) !== consts.ENDL64SIG) throw new Error("Invalid zip64 central directory locator");
      this.headerOffset = readUInt64LE(data, consts.ENDSUB); // ZIP64 EOCD header offset
    }
  }
  class CentralDirectoryZip64Header {
    read(data) {
      if (data.length !== consts.END64HDR || data.readUInt32LE(0) !== consts.END64SIG) throw new Error("Invalid central directory");
      this.volumeEntries = readUInt64LE(data, consts.END64SUB); // number of entries on this volume
      this.totalEntries = readUInt64LE(data, consts.END64TOT); // total number of entries
      this.size = readUInt64LE(data, consts.END64SIZ); // central directory size in bytes
      this.offset = readUInt64LE(data, consts.END64OFF); // offset of first CEN header
    }
  }
  class ZipEntry {
    readHeader(data, offset) {
      if (data.length < offset + consts.CENHDR || data.readUInt32LE(offset) !== consts.CENSIG) throw new Error("Invalid entry header"); // data should be 46 bytes and start with "PK 01 02"
      this.verMade = data.readUInt16LE(offset + consts.CENVEM); // version made by
      this.version = data.readUInt16LE(offset + consts.CENVER); // version needed to extract
      this.flags = data.readUInt16LE(offset + consts.CENFLG); // encrypt, decrypt flags
      this.method = data.readUInt16LE(offset + consts.CENHOW); // compression method
      const timebytes = data.readUInt16LE(offset + consts.CENTIM);
      const datebytes = data.readUInt16LE(offset + consts.CENTIM + 2);
      this.time = parseZipTime(timebytes, datebytes); // modification time (2 bytes time, 2 bytes date)
      this.crc = data.readUInt32LE(offset + consts.CENCRC); // uncompressed file crc-32 value
      this.compressedSize = data.readUInt32LE(offset + consts.CENSIZ); // compressed size
      this.size = data.readUInt32LE(offset + consts.CENLEN); // uncompressed size
      this.fnameLen = data.readUInt16LE(offset + consts.CENNAM); // filename length
      this.extraLen = data.readUInt16LE(offset + consts.CENEXT); // extra field length
      this.comLen = data.readUInt16LE(offset + consts.CENCOM); // file comment length
      this.diskStart = data.readUInt16LE(offset + consts.CENDSK); // volume number start
      this.inattr = data.readUInt16LE(offset + consts.CENATT); // internal file attributes
      this.attr = data.readUInt32LE(offset + consts.CENATX); // external file attributes
      this.offset = data.readUInt32LE(offset + consts.CENOFF); // LOC header offset
    }
    readDataHeader(data) {
      if (data.readUInt32LE(0) !== consts.LOCSIG) throw new Error("Invalid local header"); // 30 bytes and should start with "PK\003\004"
      this.version = data.readUInt16LE(consts.LOCVER); // version needed to extract
      this.flags = data.readUInt16LE(consts.LOCFLG); // general purpose bit flag
      this.method = data.readUInt16LE(consts.LOCHOW); // compression method
      const timebytes = data.readUInt16LE(consts.LOCTIM);
      const datebytes = data.readUInt16LE(consts.LOCTIM + 2);
      this.time = parseZipTime(timebytes, datebytes); // modification time (2 bytes time ; 2 bytes date)
      this.crc = data.readUInt32LE(consts.LOCCRC) || this.crc; // uncompressed file crc-32 value
      const compressedSize = data.readUInt32LE(consts.LOCSIZ); // compressed size
      if (compressedSize && compressedSize !== consts.EF_ZIP64_OR_32) this.compressedSize = compressedSize;
      const size = data.readUInt32LE(consts.LOCLEN); // uncompressed size
      if (size && size !== consts.EF_ZIP64_OR_32) this.size = size;
      this.fnameLen = data.readUInt16LE(consts.LOCNAM); // filename length
      this.extraLen = data.readUInt16LE(consts.LOCEXT); // extra field length
    }
    read(data, offset, textDecoder) {
      const nameData = data.slice(offset, (offset += this.fnameLen));
      this.name = textDecoder ? textDecoder.decode(new Uint8Array(nameData)) : nameData.toString("utf8");
      const lastChar = data[offset - 1];
      this.isDirectory = lastChar === 47 || lastChar === 92;
      if (this.extraLen) { this.readExtra(data, offset); offset += this.extraLen; }
      this.comment = this.comLen ? data.slice(offset, offset + this.comLen).toString() : null;
    }
    validateName() { if (/\\|^\w+:|^\/|(^|\/)\.\.(\/|$)/.test(this.name)) throw new Error("Malicious entry: " + this.name); }
    readExtra(data, offset) {
      let signature, size;
      const maxPos = offset + this.extraLen;
      while (offset < maxPos) {
        signature = data.readUInt16LE(offset);
        offset += 2;
        size = data.readUInt16LE(offset);
        offset += 2;
        if (consts.ID_ZIP64 === signature) this.parseZip64Extra(data, offset, size);
        offset += size;
      }
    }
    parseZip64Extra(data, offset, length) {
      if (length >= 8 && this.size === consts.EF_ZIP64_OR_32) {
        this.size = readUInt64LE(data, offset);
        offset += 8; length -= 8;
      }
      if (length >= 8 && this.compressedSize === consts.EF_ZIP64_OR_32) {
        this.compressedSize = readUInt64LE(data, offset);
        offset += 8; length -= 8;
      }
      if (length >= 8 && this.offset === consts.EF_ZIP64_OR_32) {
        this.offset = readUInt64LE(data, offset);
        offset += 8; length -= 8;
      }
      if (length >= 4 && this.diskStart === consts.EF_ZIP64_OR_16) this.diskStart = data.readUInt32LE(offset); // offset += 4; length -= 4;
    }
    get encrypted() { return (this.flags & consts.FLG_ENTRY_ENC) === consts.FLG_ENTRY_ENC; }
    get isFile() { return !this.isDirectory; }
  }
  class FsRead {
    constructor(fd, buffer, offset, length, position, callback) {
      this.fd = fd; this.buffer = buffer; this.offset = offset; this.length = length;
      this.position = position; this.callback = callback; this.bytesRead = 0; this.waiting = false;
    }
    read(sync) {
      /** @type {any} */ (StreamZip).debugLog("read", this.position, this.bytesRead, this.length, this.offset);
      this.waiting = true;
      let err;
      if (sync) {
        let bytesRead = 0;
        try { bytesRead = fs.readSync(this.fd, this.buffer, this.offset + this.bytesRead, this.length - this.bytesRead, this.position + this.bytesRead); }
        catch (e) { err = e; }
        this.readCallback(sync, err, err ? bytesRead : null);
      } else {
        fs.read(this.fd, this.buffer, this.offset + this.bytesRead, this.length - this.bytesRead, this.position + this.bytesRead, this.readCallback.bind(this, sync));
      }
    }
    readCallback(sync, err, bytesRead) {
      if (typeof bytesRead === "number") this.bytesRead += bytesRead;
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
      this.position = 0; this.buffer = Buffer.alloc(0); this.fd = fd; this.fsOp = null;
    }
    checkOp() { if (this.fsOp && /** @type {any} */ (this.fsOp).waiting) throw new Error("Operation in progress"); }
    read(pos, length, callback) {
      this.checkOp();
      if (this.buffer.length < length) this.buffer = Buffer.alloc(length);
      this.position = pos;
      this.fsOp = new FsRead(this.fd, this.buffer, 0, length, this.position, callback).read();
    }
    expandLeft(length, callback) {
      this.checkOp();
      this.buffer = Buffer.concat([Buffer.alloc(length), this.buffer]);
      this.position -= length;
      if (this.position < 0) this.position = 0;
      this.fsOp = new FsRead(this.fd, this.buffer, 0, length, this.position, callback).read();
    }
    expandRight(length, callback) {
      this.checkOp();
      const offset = this.buffer.length;
      this.buffer = Buffer.concat([this.buffer, Buffer.alloc(length)]);
      this.fsOp = new FsRead(this.fd, this.buffer, offset, length, this.position + offset, callback).read();
    }
    moveRight(length, callback, shift) {
      this.checkOp();
      if (shift) this.buffer.copy(this.buffer, 0, shift);
      else shift = 0;
      this.position += shift;
      this.fsOp = new FsRead(this.fd, this.buffer, this.buffer.length - shift, shift, this.position + this.buffer.length - shift, callback).read();
    }
  }
  class EntryDataReaderStream extends stream.Readable {
    constructor(fd, offset, length) {
      super();
      this.fd = fd; this.offset = offset; this.length = length; this.pos = 0;
      this.readCallback = this.readCallback.bind(this);
    }
    _read(n) {
      const buffer = Buffer.alloc(Math.min(n, this.length - this.pos));
      if (buffer.length) { fs.read(this.fd, buffer, 0, buffer.length, this.offset + this.pos, this.readCallback); }
      else { this.push(null); }
    }
    readCallback(err, bytesRead, buffer) {
      this.pos += bytesRead;
      if (err) { this.emit("error", err); this.push(null); }
      else if (!bytesRead) { this.push(null); }
      else {
        if (bytesRead !== buffer.length) buffer = buffer.slice(0, bytesRead);
        this.push(buffer);
      }
    }
  }
  class EntryVerifyStream extends stream.Transform {
    constructor(baseStm, crc, size) {
      super();
      this.verify = new CrcVerify(crc, size);
      baseStm.on("error", (e) => { this.emit("error", e); });
    }
    _transform(data, encoding, callback) {
      let err;
      try { this.verify.data(data); } catch (e) { err = e; }
      callback(err, data);
    }
  }
  class CrcVerify {
    constructor(crc, size) {
      this.crc = crc; this.size = size;
      this.state = { crc: ~0, size: 0 };
    }
    data(data) {
      const crcTable = CrcVerify.getCrcTable();
      let crc = this.state.crc, off = 0, len = data.length;
      while (--len >= 0) crc = crcTable[(crc ^ data[off++]) & 0xff] ^ (crc >>> 8);
      this.state.crc = crc;
      this.state.size += data.length;
      if (this.state.size >= this.size) {
        const buf = Buffer.alloc(4);
        buf.writeInt32LE(~this.state.crc & 0xffffffff, 0);
        crc = buf.readUInt32LE(0);
        if (crc !== this.crc) throw new Error("Invalid CRC");
        if (this.state.size !== this.size) throw new Error("Invalid size");
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
            if ((c & 1) !== 0) c = 0xedb88320 ^ (c >>> 1);
            else c = c >>> 1;
          }
          if (c < 0) { b.writeInt32LE(c, 0); c = b.readUInt32LE(0); }
          crcTable[n] = c;
        }
      }
      return crcTable;
    }
  }
  const parseZipTime = function (timebytes, datebytes) {
    const timebits = toBits(timebytes, 16), datebits = toBits(datebytes, 16);
    const mt = { h: parseInt(timebits.slice(0, 5).join(""), 2), m: parseInt(timebits.slice(5, 11).join(""), 2), s: parseInt(timebits.slice(11, 16).join(""), 2) * 2, Y: parseInt(datebits.slice(0, 7).join(""), 2) + 1980, M: parseInt(datebits.slice(7, 11).join(""), 2), D: parseInt(datebits.slice(11, 16).join(""), 2) };
    const dt_str = [mt.Y, mt.M, mt.D].join("-") + " " + [mt.h, mt.m, mt.s].join(":") + " GMT+0";
    return new Date(dt_str).getTime();
  };
  const toBits = function (dec, size) {
    let b = (dec >>> 0).toString(2);
    while (b.length < size) b = "0" + b;
    return b.split("");
  };
  const readUInt64LE = (buffer, offset) => buffer.readUInt32LE(offset + 4) * 0x0000000100000000 + buffer.readUInt32LE(offset);
  return StreamZip;
})();

/**
 * Assert the value is true, or throw an error. Like "node:assert", but cross platform.
 * @param {any} value
 * @param {any} [info]
 * @returns {asserts value}
 */
const assert = (value, info) => {
  if (!value) {
    throw new Error(info ?? "assertion failed");
  }
};

/**
 * Returns a debounced version of the input function.
 * @param {any} f
 * @param {number} delay
 * @return {any}
 */
const debounce = (f, delay) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      f(...args);
    }, delay);
  };
};

/**
 * Exclude the static `import` declaration matches `regexp`.
 *
 * Will be `// excluded: import xxx form ...`.
 * @param {string} sourceCode
 * @param {RegExp} regexp
 * @returns {string}
 */
const excludeImports = (sourceCode, regexp) => {
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
 * Solve path, like path.resolve with support of home dir prefix.
 *
 * ```js
 * if (process.platform === "win32") {
 *   assert(solvePath("C:\\a\\b", "c/d", "\\e") === "C:\\a\\b\\c\\d\\e");
 *   assert(solvePath("C:\\a\\\\b", "c\\d", "..\\e") === "C:\\a\\b\\c\\e");
 * } else {
 *   assert(solvePath("a/b", "../c", "/d") === import.meta.dirname + "/a/c/d");
 *   assert(solvePath("~/a//b", "c/d", "../e") === process.env.HOME + "/a/b/c/e");
 * }
 * ```
 * @param {...string} parts
 * @returns {string}
 */
const solvePath = (...parts) => {
  if (parts[0].startsWith("~")) {
    parts[0] = parts[0].slice(1);
    parts.unshift(/** @type {string} */ (process.env.HOME));
    // process.env.USERPROFILE
  }
  // we do not use path.resolve directy because we want to control absolute or not
  if (!path.isAbsolute(parts[0])) {
    parts.unshift(process.cwd());
  }
  return path.join(...parts); // path.join will convert '\\' to '/' also, like path.resolve
};

/**
 * Writing to stream, returns promise, auto care about the backpressure. Use [this](https://nodejs.org/api/stream.html#streamreadabletowebstreamreadable-options) when stable.
 *
 * @param {stream.Writable} stream
 * @param {any} chunk
 * @returns {Promise<void>}
 */
const streamWrite = (stream, chunk) => {
  return new Promise((resolve, reject) => {
    let resolveCount = 0;
    const resolveOnce = () => {
      resolveCount++;
      if (resolveCount === 2) {
        resolve();
      }
    };
    const lowPressure = stream.write(chunk, (error) =>
      error ? reject(error) : resolveOnce()
    );
    if (lowPressure) {
      resolveOnce();
    } else {
      stream.once("drain", resolveOnce);
    }
  });
};

// /** @type {1} */ (process.exit());

// TODO: 逗号换成分号

/**
@typedef {
  "linux-x64" | "mac-arm64" | "win-x64"
} Platform 短期内不谋求增加新平台. 长远来看，应该是 ` "linux-x64" | "linux-arm64" | "mac-x64" | "mac-arm64" | "win-x64" | "win-arm64" `
@typedef {{
  platforms: Platform[],
  kind: "raw" | "zip" | "gzip" | "tar" | "tar-gzip",
  url: string,
  path: string,
}} Asset
@typedef {{
  entriesRoot?: HTMLElement,
  entries?: () => any,
  profileRoot: HTMLElement,
  profile: () => any,
  preview: (input: any) => void,
}} ActionUiController 之所以叫 controller 是因为类似 https://developer.mozilla.org/en-US/docs/Web/API/AbortController
@typedef {{
  progress: () => number,
  stop: () => void,
  wait: Promise<void>,
}} ActionExecuteController
@typedef {{
  begin: number,
  expectedEnd: number,
}} RunActionTiming all with `seconds` unit
@typedef {{
  finished: number,
  running: number,
  amount: number,
}} RunActionProgress The `running` property may be float.
@typedef {{
  title: string,
  timing: () => RunActionTiming,
  progress: () => RunActionProgress,
  stop: () => void,
  wait: Promise<any>,
}} RunActionController
@typedef {{
  id: string,
  name: string,
  description: string,
  kind: RunActionRequest["entries"]["kind"],
  ui: (profile: any) => ActionUiController,
  execute: (profile: any, entry: any) => ActionExecuteController,
}} Action
@typedef {{
  id: string,
  name: string,
  description: string,
  actionId: string,
  extensionId: string,
  extensionVersion: string,
  [key: string]: any,
}} Profile
@typedef {{
  id: string,
  version: string,
  name: string,
  description: string,
  dependencies: string[],
  assets: Asset[],
  actions: Action[],
  profiles: Profile[],
}} Extension
@typedef {{
  id: string,
  name: string,
  version: string,
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
    extensionVersion: string,
  }[],
}[]} ListExtensionsResponse
@typedef {{
  title: string,
  url: string,
}} InstallExtensionRequest
@typedef {{
  download: {
    finished: number,
    amount: number,
  },
}} InstallExtensionProgress
@typedef {{
  kind: "run-action-progress",
  id: string,
  title: string, // 甚至可以在 client 指定自定义标题？
  timing: RunActionTiming,
  progress: RunActionProgress,
} | {
  kind: "run-action-success",
  id: string,
} | {
  kind: "run-action-error",
  id: string,
  error: any,
} | {
  kind: "install-extension-progress",
  id: string,
  title: string,
  progress: InstallExtensionProgress,
} | {
  kind: "install-extension-success",
  id: string,
} | {
  kind: "install-extension-error",
  id: string,
  error: any,
}} GetStatusResponseEvent
@typedef {{
  title: string,
  progress: () => InstallExtensionProgress,
  wait: Promise<any>,
}} InstallExtensionController
@typedef {{
  id: string,
  version: string,
}} RemoveExtensionRequest
@typedef {{
  kind: "number-sequence",
  begin: number,
  end: number,
}} EntriesNumberSequence 以后可能有用
@typedef {{
  kind: "common-files",
  entries?: {
    inputFile: string,
    outputFile: string,
  }[],
  inputDir: string,
  outputDir: string,
  outputExtension: string,
}} EntriesCommonFiles 最常用的，包含扫描文件夹等功能
@typedef {{
  kind: "plain",
  entries: any[],
}} EntriesPlain 直接就是 entries 本身，也许可以适配 yt-dlp 这种凭空出个文件的场景
@typedef {{
  title: string,
  extensionId: string,
  extensionVersion: string,
  actionId: string,
  profile: any,
  entries: EntriesPlain | EntriesCommonFiles | EntriesNumberSequence,
  parallel: number,
}} RunActionRequest
*/

const css = String.raw;
const html = String.raw;

const pageCss = css`
  /* 约定，需要显示和隐藏的东西，默认显示，有 off 才隐藏 */
  /* 这里是临时的做法，省得写 xxx.off */
  .off {
    visibility: hidden;
  }
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
  body {
    height: 100vh;
    margin: 0;
    font-family: system-ui;
  }
  body > div {
    position: fixed;
    top: 36px;
    left: 0;
    right: 0;
    bottom: 0;
  }
  header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 36px;
    display: flex;
    padding: 4px;
    gap: 4px;
    background: #7777;
  }
  header > button {
    background: #7777;
    border: none;
  }
  header > button:hover {
    background: #7779;
  }
  header > button:active {
    background: #777f;
  }
`;

const pageHtml = html`
  <!DOCTYPE html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width" />
    <meta name="color-scheme" content="light dark" />
    <link rel="icon" href="data:" />
    <title>clevert</title>
    <!-- module script defer by default -->
    <script type="module" src="/index.js"></script>
    <style>
      ${pageCss}
    </style>
  </head>
  <body></body>
`;

// 立刻返回 id

const pageMain = async () => {
  // $tasks
  const $tasks = document.createElement("div");
  document.body.appendChild($tasks);
  $tasks.id = "tasks";
  $tasks.classList.add("off");
  new EventSource("/get-status").onmessage = async (message) => {
    const e = /** @type {GetStatusResponseEvent} */ (JSON.parse(message.data));
    /** @type {HTMLElement | null} */
    let $task = $tasks.querySelector(`section[data-id="${e.id}"]`);
    if (!$task) {
      $task = document.createElement("section");
      $tasks.insertBefore($task, $tasks.firstChild);
      $task.dataset.id = e.id;
      const $title = document.createElement("h6");
      $task.appendChild($title);
      const $tips = document.createElement("span");
      $task.appendChild($tips);
      const $operations = document.createElement("div");
      $task.appendChild($operations);
      if (e.kind === "run-action-progress") {
        // TODO: more operations like pause, stop, pin
      } else if (e.kind === "install-extension-progress") {
        // TODO: more operations like pause, stop
      } else {
        assert(false, "unexpected kind: " + e.kind);
      }
    }
    const [$title, $tips, $operations] = $task.children;
    if (e.kind === "run-action-progress") {
      // const [$pause, $stop, $pin] = $operations.children;
      $title.textContent = e.title;
      $tips.textContent =
        `${e.timing.expectedEnd - Math.trunc(Date.now() / 1000)}s - ` +
        `${e.progress.finished}/${e.progress.amount}`;
    } else if (e.kind === "run-action-success") {
      $tips.textContent = "Success";
    } else if (e.kind === "run-action-error") {
      $tips.textContent = "Error: " + e.error;
    } else if (e.kind === "install-extension-progress") {
      // const [$stop, $pin] = $operations.children;
      $title.textContent = e.title;
      $tips.textContent = `${e.progress.download.finished}/${e.progress.download.amount} Bytes`;
    } else if (e.kind === "install-extension-success") {
      $tips.textContent = "Success";
      r$profiles();
    } else if (e.kind === "install-extension-error") {
      $tips.textContent = "Error: " + e.error;
    } else {
      const /** @type {never} */ _ = e; // exhaustiveness
    }
  };

  // $profiles
  const $profiles = document.createElement("div"); // 选择 extension，action，profile 等. 其实用户眼中应该全都是 profile，所有的目标都是 profile
  document.body.appendChild($profiles);
  $profiles.id = "profiles";
  $profiles.classList.add("off");
  /** @type {ListExtensionsResponse} */
  let extensionsList = [];
  // $query
  const $query = document.createElement("div");
  $profiles.appendChild($query);
  $query.classList.add("query");
  const $queryInput = document.createElement("input");
  $query.appendChild($queryInput);
  $queryInput.oninput = debounce(() => r$choices(), 700);
  const $queryReset = document.createElement("button");
  $query.appendChild($queryReset);
  $queryReset.textContent = "×";
  $queryReset.title = "Reset";
  $queryReset.onclick = () => {
    $queryInput.value = "";
    for (const el of $queryBar.children) {
      el.classList.remove("checked");
    }
    r$choices();
  };
  const $queryBar = document.createElement("div"); // to contains some conditions like "extension:zcodecs" "file:png"
  $query.appendChild($queryBar);
  // $queryConditionExtensions
  const $queryConditionExtensions = document.createElement("button"); // only show extensions, do not show profiles
  $queryBar.appendChild($queryConditionExtensions);
  $queryConditionExtensions.textContent = "all-extensions";
  $queryConditionExtensions.title = "Show all extensions";
  $queryConditionExtensions.onclick = () => {
    $queryInput.value = "";
    if (!$queryConditionExtensions.classList.contains("checked")) {
      // because this condition is exclusive
      for (const el of $queryBar.children) {
        el.classList.remove("checked");
      }
    }
    $queryConditionExtensions.classList.toggle("checked");
    r$choices();
  };
  // $choices
  const $choices = document.createElement("ul");
  $profiles.appendChild($choices);
  const r$choices = () => {
    $choices.replaceChildren();
    if ($queryConditionExtensions.classList.contains("checked")) {
      for (const extension of extensionsList) {
        const $choice = document.createElement("figure");
        $choices.appendChild($choice);
        const $name = document.createElement("b");
        $choice.appendChild($name);
        $name.textContent = extension.name;
        $name.title = extension.id;
        const $version = document.createElement("sub");
        $choice.appendChild($version);
        $version.textContent = extension.version;
        $version.title = "Extension version";
        const $description = document.createElement("span");
        $choice.appendChild($description);
        $description.textContent = extension.description;
        const $remove = document.createElement("button");
        $choice.appendChild($remove);
        $remove.textContent = "×";
        $remove.title = "Remove";
        $remove.onclick = async () => {
          /** @type {RemoveExtensionRequest} */
          const request = {
            id: extension.id,
            version: extension.version,
          };
          await fetch("/remove-extension", {
            method: "POST",
            body: JSON.stringify(request),
          });
          r$profiles();
        };
      }
    } else {
      for (const extension of extensionsList) {
        for (const profile of extension.profiles) {
          const $choice = document.createElement("figure");
          $choices.appendChild($choice);
          const $name = document.createElement("b");
          $choice.appendChild($name);
          $name.textContent = profile.name;
          $name.title = profile.id;
          const $version = document.createElement("sub");
          $choice.appendChild($version);
          $version.textContent = profile.extensionVersion;
          $version.title = "Extension version";
          const $description = document.createElement("span");
          $choice.appendChild($description);
          $description.textContent = profile.description;
          const $remove = document.createElement("button");
          $choice.appendChild($remove);
          $remove.textContent = "×";
          $remove.title = "Remove";
          $choice.onclick = async () => {
            r$action(profile.extensionId, profile.extensionVersion, profile.id);
            $profiles.classList.add("off");
            $action.classList.remove("off");
          };
        }
      }
    }
  };
  const r$profiles = async () => {
    const response = await fetch("/list-extensions")
      .then((r) => r.json())
      .then((a) => /** @type {ListExtensionsResponse} */ (a));
    extensionsList = response;
    r$choices();
  };
  r$profiles(); // 每次安装 extension 结束后调用一次这个

  // $action
  const $action = document.createElement("div"); // 在选择好 action 之后，装入这个元素中
  document.body.appendChild($action);
  $action.id = "action";
  $action.classList.add("off");
  /**
   * @param {string} extensionId
   * @param {string} extensionVersion
   * @param {string} profileId
   */
  const r$action = async (extensionId, extensionVersion, profileId) => {
    const extensionIndexJsUrl =
      "/extensions/" + extensionId + "_" + extensionVersion + "/index.js";
    const extension = /** @type {Extension} */ (
      (await import(extensionIndexJsUrl)).default
    );
    const profile = extension.profiles.find(
      (profile) => profile.id === profileId
    );
    assert(profile !== undefined);
    const action = extension.actions.find(
      (action) => action.id === profile.actionId
    );
    assert(action !== undefined);
    $action.replaceChildren();
    let getEntries;
    if (action.kind === "common-files") {
      const $entries = document.createElement("div");
      $action.appendChild($entries);
      $entries.classList.add("entries");
      const $inputDir = document.createElement("input");
      $entries.appendChild($inputDir);
      $inputDir.placeholder = "Input Dir";
      const $outputDir = document.createElement("input");
      $entries.appendChild($outputDir);
      $outputDir.placeholder = "Output Dir";
      const $outputExtension = document.createElement("input");
      $entries.appendChild($outputExtension);
      $outputExtension.placeholder = "Output Extension";
      getEntries = () => {
        /** @type {EntriesCommonFiles} */
        const entries = {
          kind: "common-files",
          inputDir: $inputDir.value,
          outputDir: $outputDir.value,
          outputExtension: $outputExtension.value,
        };
        return entries;
      };
    } else if (action.kind === "plain") {
      // todo
      const $entries = document.createElement("div");
      $action.appendChild($entries);
      getEntries = () => {
        /** @type {EntriesPlain} */
        const entries = {
          kind: "plain",
          entries: [],
        };
        return entries;
      };
    } else {
      assert(false, "todo");
    }
    // todo: custom entries for yt-dlp
    const controller = action.ui(profile);
    assert(controller.profileRoot.localName === "div");
    assert(controller.profileRoot.classList.contains("profile"));
    $action.appendChild(controller.profileRoot);
    const $operations = document.createElement("div");
    $operations.classList.add("operations");
    $action.appendChild($operations);
    const $runAction = document.createElement("button");
    $operations.appendChild($runAction);
    $runAction.textContent = "Run";
    $runAction.onclick = async () => {
      /** @type {RunActionRequest} */
      const request = {
        title: `${action.id} - ${extensionId}`,
        extensionId,
        extensionVersion,
        actionId: action.id,
        profile: controller.profile(),
        entries: getEntries(),
        parallel: 2,
      };
      await fetch("/run-action", {
        method: "POST",
        body: JSON.stringify(request),
      });
    };
  };

  // $market
  const $market = document.createElement("div");
  document.body.appendChild($market);
  $market.id = "market";
  $market.classList.add("off");
  const r$market = async () => {
    // todo: add real market
    const $url = document.createElement("input");
    $market.appendChild($url);
    $url.placeholder = "url";
    const $install = document.createElement("button");
    $market.appendChild($install);
    $install.textContent = "install";
    $install.onclick = async () => {
      assert($url.value.trim() !== "");
      /** @type {InstallExtensionRequest} */
      const request = {
        title: "Install extension from " + $url.value,
        url: $url.value,
      };
      await fetch("/install-extension", {
        method: "POST",
        body: JSON.stringify(request),
      });
    };
  };
  r$market();

  // $top
  const $top = document.createElement("header"); // 如果要移动端，就**不可能**侧栏了。而顶栏在桌面端也可以忍受
  document.body.appendChild($top);
  $top.id = "top";
  const $toTasks = document.createElement("button");
  $top.appendChild($toTasks);
  $toTasks.textContent = "Tasks";
  $toTasks.onclick = () => {
    $tasks.classList.remove("off");
    $profiles.classList.add("off");
    $action.classList.add("off");
    $market.classList.add("off");
  };
  const $toProfiles = document.createElement("button");
  $top.appendChild($toProfiles);
  $toProfiles.textContent = "Profiles";
  $toProfiles.onclick = () => {
    $tasks.classList.add("off");
    $profiles.classList.remove("off");
    $action.classList.add("off");
    $market.classList.add("off");
  };
  const $toMarket = document.createElement("button");
  $top.appendChild($toMarket);
  $toMarket.textContent = "Market";
  $toMarket.onclick = () => {
    $tasks.classList.add("off");
    $profiles.classList.add("off");
    $action.classList.add("off");
    $market.classList.remove("off");
  };

  // main
  {
    $market.classList.remove("off");
  }
};

const serverMain = async () => {
  // 后端保存，前端无状态

  // is in main
  const PATH_EXTENSIONS = "./temp/extensions";
  const PATH_CACHE = "./temp/cache";
  await fsp.mkdir(PATH_EXTENSIONS, { recursive: true });
  await fsp.mkdir(PATH_CACHE, { recursive: true });

  /** @type {Platform} */
  const CURRENT_PLATFORM = false
    ? /** @type {never} */ (assert(false))
    : process.platform === "linux" && process.arch === "x64"
    ? "linux-x64"
    : process.platform === "win32" && process.arch === "x64"
    ? "win-x64"
    : process.platform === "darwin" && process.arch === "arm64"
    ? "mac-arm64"
    : /** @type {never} */ (assert(false, "unsupported platform"));

  /** @type {Map<string, RunActionController>} */
  const runActionControllers = new Map(); // 永远不删除
  /** @type {Map<string, InstallExtensionController>} */
  const installExtensionControllers = new Map();

  const readReq = async (req) => {
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
   * Get next unique id. Format = `1716887172_000123` = unix stamp + underscore + sequence number inside this second.
   * @returns {string}
   */
  const nextId = (() => {
    let lastT = Math.trunc(Date.now() / 1000);
    let lastV = 0;
    return () => {
      let curT = Math.trunc(Date.now() / 1000);
      let curV = 0;
      if (curT === lastT) {
        curV = ++lastV;
      } else {
        lastV = 0;
      }
      lastT = curT;
      return curT + "_" + (curV + "").padStart(6, "0");
    };
  })();

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
      const parentPath = /** @type {string} */ (v.parentPath ?? v.path); // https://nodejs.org/api/fs.html#class-fsdirent
      await fsp.chmod(solvePath(parentPath, v.name), 0o777); // https://stackoverflow.com/a/20769157
    }
  };

  /**
   * @param {RunActionRequest["entries"]} opts
   * @returns {Promise<any>}
   */
  const genEntries = async (opts) => {
    if (opts.kind === "common-files") {
      if (opts.entries) {
        assert(false, "todo");
      }
      const entries = [];
      const inputDir = solvePath(opts.inputDir);
      const outputDir = solvePath(opts.outputDir);
      for (const v of await fsp.readdir(inputDir, {
        withFileTypes: true,
        recursive: true,
      })) {
        const parentPath = v.parentPath ?? v.path; // https://nodejs.org/api/fs.html#class-fsdirent
        const input = solvePath(parentPath, v.name);
        let output = path.relative(inputDir, input);
        if (opts.outputExtension) {
          const extname = path.extname(input); // includes the dot char
          if (extname) {
            output = output.slice(0, output.length - extname.length);
          }
          output += "." + opts.outputExtension;
        }
        output = solvePath(outputDir, output);
        entries.push({
          input: { main: [input] },
          output: { main: [output] },
        });
      }
      return entries;
    }
    assert(false, "todo");
  };

  const server = http.createServer(async (_, r) => {
    r.setHeader("Cache-Control", "no-store");

    if (r.req.url === "/") {
      r.setHeader("Content-Type", "text/html; charset=utf-8");
      r.writeHead(200);
      r.end(pageHtml);
      return;
    }

    if (r.req.url === "/index.js") {
      const buffer = await fsp.readFile(import.meta.filename);
      const response = excludeImports(buffer.toString(), /^node:.+$/);
      r.setHeader("Content-Type", "text/javascript; charset=utf-8");
      r.writeHead(200);
      r.end(response);
      return;
    }

    if (r.req.url === "/favicon.ico") {
      r.setHeader("Content-Type", "image/png");
      r.writeHead(200);
      r.end();
      return;
    }

    if (r.req.url === "/install-extension") {
      const request = /** @type {InstallExtensionRequest} */ (
        await readReq(r.req)
      );
      const abortController = new AbortController();
      let finished = 0;
      let amount = 0;
      let tempStreams = /** @type {Set<fs.WriteStream>} */ (new Set());
      let tempPaths = /** @type {Set<string>} */ (new Set());

      const wait = (async () => {
        const indexJsResponse = await fetch(request.url, {
          redirect: "follow",
          signal: abortController.signal,
        });
        if (!indexJsResponse.body) {
          throw new Error("response.body is null, url = " + request.url);
        }
        amount += parseInt(
          indexJsResponse.headers.get("Content-Length") || "0"
        );
        // for await (const chunk of response.body) downloaded += chunk.length;
        const indexJsTempPath = solvePath(PATH_CACHE, nextId() + ".js");
        tempPaths.add(indexJsTempPath);
        const indexJsTempStream = fs.createWriteStream(indexJsTempPath);
        for await (const chunk of indexJsResponse.body) {
          finished += chunk.length;
          await streamWrite(indexJsTempStream, chunk);
        }
        await new Promise((resolve) => indexJsTempStream.end(resolve)); // use .end() instead of .close() https://github.com/nodejs/node/issues/2006
        const extension = /** @type {Extension} */ (
          (await import(indexJsTempPath)).default
        );
        const extensionDir = solvePath(
          PATH_EXTENSIONS,
          extension.id + "_" + extension.version
        );
        tempPaths.add(extensionDir);
        await fsp.rm(extensionDir, { recursive: true, force: true });
        await fsp.mkdir(extensionDir, { recursive: true });
        await fsp.rename(indexJsTempPath, solvePath(extensionDir, "index.js"));
        // const tasks = []; // TODO: parallel
        for (const asset of extension.assets) {
          if (!asset.platforms.includes(CURRENT_PLATFORM)) {
            continue;
          }
          const tempExtName = false
            ? assert(false)
            : asset.kind === "raw"
            ? "raw"
            : asset.kind === "zip"
            ? "zip"
            : assert(false, "unsupported asset kind");
          const tempPath = solvePath(PATH_CACHE, nextId() + "." + tempExtName);
          tempPaths.add(tempPath);
          const assetResponse = await fetch(asset.url, {
            redirect: "follow",
            signal: abortController.signal,
          });
          const tempStream = fs.createWriteStream(tempPath);
          if (!assetResponse.body) {
            throw new Error("response.body is null, url = " + asset.url);
          }
          amount += parseInt(
            assetResponse.headers.get("Content-Length") || "0"
          );
          for await (const chunk of assetResponse.body) {
            finished += chunk.length;
            await streamWrite(tempStream, chunk);
          }
          await new Promise((resolve) => tempStream.end(resolve));
          if (asset.kind === "zip") {
            const zip = new StreamZip.async({ file: tempPath });
            await zip.extract(null, solvePath(extensionDir, asset.path));
            await zip.close();
            await fsp.rm(tempPath);
          } else {
            assert(false, "unsupported asset kind");
          }
          await chmod777(extensionDir);
        }
      })();

      wait.catch(async () => {
        abortController.abort();
        // then delete the temporary files here
        // 先关 stream 再删文件
        for (const v of tempStreams) {
          await new Promise((resolve) => v.end(resolve)); // 用 await 等一下，慢一些但是稳妥
        }
        for (const v of tempPaths) {
          await fsp.rm(v, { force: true, recursive: true }); // 用 await 等一下，慢一些但是稳妥
        }
      });

      // 不支持cancel，但是保证别的不出错？比如出错了自动删除。因为vscode也不支持cancel
      // https://stackoverflow.com/a/49771109
      // https://developer.mozilla.org/zh-CN/docs/Web/API/Server-sent_events/Using_server-sent_events

      installExtensionControllers.set(nextId(), {
        title: request.title,
        progress: () => ({ download: { finished, amount } }),
        wait: wait,
      });

      r.end();
      return;
    }

    if (r.req.url === "/remove-extension") {
      const request = /** @type {RemoveExtensionRequest} */ (
        await readReq(r.req)
      );
      const extensionDir = solvePath(
        PATH_EXTENSIONS,
        request.id + "_" + request.version
      );
      await fsp.rm(extensionDir, { recursive: true, force: true });
      r.end();
      return;
    }

    if (r.req.url === "/list-extensions") {
      /** @type {ListExtensionsResponse} */
      const response = [];
      for (const entry of await fsp.readdir(PATH_EXTENSIONS)) {
        const extensionIndexJsPath = solvePath(
          PATH_EXTENSIONS,
          entry,
          "index.js"
        );
        const extension = /** @type {Extension} */ (
          (await import(extensionIndexJsPath)).default
        );
        assert(entry === extension.id + "_" + extension.version);
        response.push({
          id: extension.id,
          version: extension.version,
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
      r.setHeader("Content-Type", "application/json; charset=utf-8");
      r.writeHead(200);
      r.end(JSON.stringify(response));
      return;
    }

    if (r.req.url?.startsWith("/extensions/")) {
      const relative = r.req.url.split("/extensions/")[1];
      if (relative.endsWith("/index.js")) {
        const extensionIndexJsPath = solvePath(PATH_EXTENSIONS, relative);
        const buffer = await fsp.readFile(extensionIndexJsPath);
        const response = excludeImports(buffer.toString(), /^node:.+$/);
        r.setHeader("Content-Type", "text/javascript; charset=utf-8");
        r.writeHead(200);
        r.end(response);
      } else {
        assert(false, "todo"); // add mime guess and more
      }
      return;
    }

    if (r.req.url === "/run-action") {
      const request = /** @type {RunActionRequest} */ (await readReq(r.req));
      const extensionIndexJsPath = solvePath(
        PATH_EXTENSIONS,
        request.extensionId + "_" + request.extensionVersion,
        "index.js"
      );
      const extension = /** @type {Extension} */ (
        (await import(extensionIndexJsPath)).default
      );
      const action = extension.actions.find(
        (action) => action.id === request.actionId
      );
      assert(action !== undefined, "action not found");
      const entries = await genEntries(request.entries);
      const amount = entries.length;
      let finished = 0;
      const runningControllers = /** @type {Set<ActionExecuteController>} */ (
        new Set()
      );
      const wait = Promise.all(
        [...Array(request.parallel)].map((_, i) =>
          (async () => {
            for (let entry; (entry = entries.shift()); ) {
              // console.log({ entry, req });
              const controller = action.execute(request.profile, entry);
              runningControllers.add(controller);
              await new Promise((r) => setTimeout(r, 100));
              await controller.wait;
              runningControllers.delete(controller);
              finished += 1;
            }
          })()
        )
      );
      /**
       * See https://stackoverflow.com/q/40500490/
       *
       * ```js
       * // create a promise that will reject after 200ms
       * const p0 = new Promise((r, j) => setTimeout(() => j(1), 200));
       * // now `p0` have a `catch`, if do not do so, nodejs UnhandledPromiseRejection,
       * p0.catch((e) => console.log("> p0.catch: ", e));
       * // the `p0.then` acturally create a new Promise
       * const p1 = p0.then((e) => console.log("> p1 = p0.then: ", e));
       * // so if you don't do this to catch `p1`, nodejs UnhandledPromiseRejection,
       * const p2 = p1.catch((e) => console.log("> p2 = p1.catch = p0.then.catch: ", e));
       * // the `p2` is `p1.catch`, so `p2.then` and `p2.finally` will both be executed
       * p2.then((e) => console.log("> p2.then: ", e));
       * p2.finally((e) => console.log("> p2.finally: ", e));
       * // avoid nodejs exit
       * await new Promise((r) => setTimeout(r, 999999));
       * ```
       */
      const _catched = wait.catch(() => {});
      const beginTime = Math.trunc(Date.now() / 1000);
      runActionControllers.set(nextId(), {
        title: request.title,
        timing: () => {
          return {
            begin: beginTime,
            expectedEnd: beginTime + 1000,
          };
        },
        progress: () => {
          let running = 0;
          for (const controller of runningControllers) {
            running += controller.progress();
          }
          return { finished, running, amount };
        },
        stop: () => {
          for (const controller of runningControllers) {
            controller.stop();
            runningControllers.delete(controller);
          }
        },
        wait,
      });
      r.end();
      return;
    }

    if (r.req.url === "/stop-action") {
      assert(false, "todo");
      r.end();
      return;
    }

    if (r.req.url === "/get-status") {
      r.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      r.writeHead(200);
      /** @param {GetStatusResponseEvent} e */
      const send = (e) => r.write(`data: ${JSON.stringify(e)}\n\n`);
      const preventedIds = /** @type {Set<string>} */ (new Set());
      const waitingIds = /** @type {Set<string>} */ (new Set());
      while (!r.closed) {
        for (const [id, controller] of runActionControllers) {
          if (preventedIds.has(id)) {
            continue; // just skip if it's in `preventedIds`, like exited `controller`s
          }
          send({
            kind: "run-action-progress",
            id,
            title: controller.title,
            timing: controller.timing(),
            progress: controller.progress(),
          });
          if (!waitingIds.has(id)) {
            waitingIds.add(id);
            let wait = controller.wait; // if not in `waitingIds`, create new promises to `wait` this `controller`
            wait = wait.then(() => {
              send({ kind: "run-action-success", id });
            });
            wait = wait.catch((error) => {
              send({ kind: "run-action-error", id, error });
            });
            wait = wait.finally(() => {
              preventedIds.add(id); // now the `controller` is exited, so we add it to `preventedIds` to skip following query, but this will not interrupt the `wait.then`, `wait.catch` above, so every `/get-status` request will receive at lease once `run-action-success` or `run-action-error`
            });
          }
        }
        for (const [id, controller] of installExtensionControllers) {
          if (preventedIds.has(id)) {
            continue;
          }
          send({
            kind: "install-extension-progress",
            id,
            title: controller.title,
            progress: controller.progress(),
          });
          if (!waitingIds.has(id)) {
            waitingIds.add(id);
            let wait = controller.wait;
            wait = wait.then(() => {
              send({ kind: "install-extension-success", id });
            });
            wait = wait.catch((error) => {
              send({ kind: "install-extension-error", id, error });
            });
            wait = wait.finally(() => {
              preventedIds.add(id);
            });
          }
        }
        const LOOP_INTERVAL = 1000; // loop interval, not SSE sending interval
        await new Promise((resolve) => setTimeout(resolve, LOOP_INTERVAL));
      }
      r.end();
      return;
    }

    r.writeHead(404);
    r.end();
  });

  server.on("listening", () => console.log(server.address()));
  server.listen(9393, "127.0.0.1");
};

const electronMain = async () => {
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
        return new Response(new Blob([pageHtml], { type }));
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
  pageMain();
} else {
  serverMain();
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

*

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

// type Boxify<T> = { [K in keyof T]: Box<T> };
// let c = {};

// https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html
// https://apple.stackexchange.com/q/420494/ # macos arm64 vm
// https://github.com/orgs/community/discussions/69211#discussioncomment-7941899 # macos arm64 ci free
// https://registry.npmmirror.com/binary.html?path=electron/
// https://registry.npmmirror.com/-/binary/electron/v30.0.1/electron-v30.0.1-linux-x64.zip
// /home/kkocdko/misc/res/electron-v30.0.1-linux-x64/electron

// core -> extension -> action -> profile

// mkdir -p node_modules/electron ; dl_prefix="https://registry.npmmirror.com/electron/30.0.2/files" ; curl -o node_modules/electron/electron.d.ts -L $dl_prefix/electron.d.ts -o node_modules/electron/package.json -L $dl_prefix/package.json
// http://127.0.0.1:9439/extensions/zcodecs/index.js
// /home/kkocdko/misc/code/clevert/temp/_test_res/i

// 暂时先用内置 mirror 列表，以后可以考虑国内放一个或多个固定地址来存 mirror 的列表
