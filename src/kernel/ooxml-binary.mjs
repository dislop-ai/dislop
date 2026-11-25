import { deflateRawSync, inflateRawSync, inflateSync } from "node:zlib";

const MAX_ZIP_ENTRIES = 3000;
const MAX_UNCOMPRESSED_BYTES = 120 * 1024 * 1024; // 120 MB zip-bomb guard

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32Buffer(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function assertSafeEntryName(name) {
  if (!name || name.includes("\0") || name.startsWith("/") || name.startsWith("\\")) {
    throw new Error(`Unsafe ZIP entry path: ${JSON.stringify(name)}`);
  }
  const parts = name.replace(/\\/g, "/").split("/");
  if (parts.some((p) => p === "..")) {
    throw new Error(`Path traversal detected in ZIP entry: ${JSON.stringify(name)}`);
  }
}

/**
 * Parse all entries in a PKZIP / OOXML archive buffer.
 * Returns ordered entry records including raw compressed bytes and decoded UTF-8 XML strings for `.xml`/`.rels`.
 */
export function readZipArchive(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new Error("Invalid OOXML ZIP header");
  }
  if (buffer[2] === 0x05 && buffer[3] === 0x06 && buffer.readUInt16LE(10) === 0) {
    return { entries: [], xmlEntries: {} };
  }

  const minOffset = Math.max(0, buffer.length - 65557);
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= minOffset; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error("Could not locate ZIP End-of-Central-Directory record");
  }

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  if (totalEntries > MAX_ZIP_ENTRIES) {
    throw new Error(`Archive exceeds maximum entry cap (${totalEntries} > ${MAX_ZIP_ENTRIES})`);
  }

  const cdSize = buffer.readUInt32LE(eocdOffset + 12);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (cdOffset + cdSize > buffer.length) {
    throw new Error("Truncated ZIP central directory");
  }

  const entries = [];
  const xmlEntries = {};
  let totalUncompressed = 0;
  let ptr = cdOffset;

  for (let i = 0; i < totalEntries && ptr + 46 <= cdOffset + cdSize; i += 1) {
    if (buffer.readUInt32LE(ptr) !== 0x02014b50) {
      throw new Error("Corrupted ZIP central directory entry signature");
    }
    const versionNeeded = buffer.readUInt16LE(ptr + 6);
    const flags = buffer.readUInt16LE(ptr + 8);
    const method = buffer.readUInt16LE(ptr + 10);
    const modTime = buffer.readUInt16LE(ptr + 12);
    const modDate = buffer.readUInt16LE(ptr + 14);
    const crc32 = buffer.readUInt32LE(ptr + 16);
    const compSize = buffer.readUInt32LE(ptr + 20);
    const uncompSize = buffer.readUInt32LE(ptr + 24);
    const nameLen = buffer.readUInt16LE(ptr + 28);
    const extraLen = buffer.readUInt16LE(ptr + 30);
    const commentLen = buffer.readUInt16LE(ptr + 32);
    const externalAttrs = buffer.readUInt32LE(ptr + 38);
    const localHeaderOffset = buffer.readUInt32LE(ptr + 42);

    const name = buffer.subarray(ptr + 46, ptr + 46 + nameLen).toString("utf8");
    assertSafeEntryName(name);
    ptr += 46 + nameLen + extraLen + commentLen;

    if ((flags & 0x01) !== 0) {
      throw new Error("Encrypted OOXML archives are not supported");
    }

    if (localHeaderOffset + 30 > buffer.length || buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error(`Invalid local file header for ZIP entry '${name}'`);
    }
    const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > buffer.length) {
      throw new Error(`Truncated compressed payload for ZIP entry '${name}'`);
    }

    const compressedSlice = buffer.subarray(dataStart, dataEnd);
    const isXml = /\.(?:xml|rels)$/i.test(name);
    let text = null;

    if (isXml) {
      totalUncompressed += uncompSize;
      if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
        throw new Error("OOXML uncompressed XML payload exceeds 120 MB safety ceiling");
      }
      let uncompBuf;
      if (method === 0) {
        uncompBuf = compressedSlice;
      } else if (method === 8) {
        uncompBuf = inflateRawSync(compressedSlice, { maxOutputLength: MAX_UNCOMPRESSED_BYTES });
      } else {
        throw new Error(`Unsupported ZIP compression method ${method} in '${name}'`);
      }
      text = uncompBuf.toString("utf8");
      if (/<!DOCTYPE\b/i.test(text) || /<!ENTITY\b/i.test(text)) {
        throw new Error(`Blocked XML DOCTYPE/ENTITY declaration in '${name}'`);
      }
      xmlEntries[name] = text;
    }

    entries.push({
      name,
      versionNeeded,
      flags: flags & ~0x08, // normalize away streaming data-descriptor bit on repack
      method,
      modTime,
      modDate,
      crc32,
      compSize,
      uncompSize,
      externalAttrs,
      compressedData: compressedSlice,
      text,
    });
  }

  return { entries, xmlEntries };
}

/**
 * Build a PKZIP archive buffer from a `{ [entryName]: Buffer | string }` map (used by tests & repack).
 */
export function buildZipArchive(entryMap) {
  const names = Object.keys(entryMap);
  const records = names.map((name) => {
    assertSafeEntryName(name);
    const raw = Buffer.isBuffer(entryMap[name]) ? entryMap[name] : Buffer.from(String(entryMap[name]), "utf8");
    const compressed = raw.length > 0 ? deflateRawSync(raw) : Buffer.alloc(0);
    const method = raw.length > 0 ? 8 : 0;
    return {
      name,
      versionNeeded: 20,
      flags: 0,
      method,
      modTime: 0,
      modDate: 0x21,
      crc32: crc32Buffer(raw),
      compSize: compressed.length,
      uncompSize: raw.length,
      externalAttrs: 0,
      compressedData: compressed,
    };
  });
  return serializeZipRecords(records);
}

/**
 * Repack an existing ZIP archive, replacing only modified UTF-8 XML entries while preserving
 * all unmodified binary entries byte-for-byte.
 */
export function repackZipArchive(originalBuffer, updatedXmlMap) {
  const { entries } = readZipArchive(originalBuffer);
  const records = entries.map((entry) => {
    if (!Object.prototype.hasOwnProperty.call(updatedXmlMap, entry.name)) {
      return entry;
    }
    const raw = Buffer.from(String(updatedXmlMap[entry.name]), "utf8");
    const compressed = raw.length > 0 ? deflateRawSync(raw) : Buffer.alloc(0);
    return {
      ...entry,
      versionNeeded: 20,
      flags: entry.flags & ~0x08,
      method: raw.length > 0 ? 8 : 0,
      crc32: crc32Buffer(raw),
      compSize: compressed.length,
      uncompSize: raw.length,
      compressedData: compressed,
    };
  });
  return serializeZipRecords(records);
}

function serializeZipRecords(records) {
  const localChunks = [];
  const cdChunks = [];
  let offset = 0;

  for (const rec of records) {
    const nameBuf = Buffer.from(rec.name, "utf8");
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(rec.versionNeeded || 20, 4);
    localHeader.writeUInt16LE(rec.flags || 0, 6);
    localHeader.writeUInt16LE(rec.method, 8);
    localHeader.writeUInt16LE(rec.modTime || 0, 10);
    localHeader.writeUInt16LE(rec.modDate || 0x21, 12);
    localHeader.writeUInt32LE(rec.crc32 >>> 0, 14);
    localHeader.writeUInt32LE(rec.compSize >>> 0, 18);
    localHeader.writeUInt32LE(rec.uncompSize >>> 0, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const localOffset = offset;
    localChunks.push(localHeader, nameBuf, rec.compressedData);
    offset += localHeader.length + nameBuf.length + rec.compressedData.length;

    const cdHeader = Buffer.alloc(46);
    cdHeader.writeUInt32LE(0x02014b50, 0);
    cdHeader.writeUInt16LE(20, 4);
    cdHeader.writeUInt16LE(rec.versionNeeded || 20, 6);
    cdHeader.writeUInt16LE(rec.flags || 0, 8);
    cdHeader.writeUInt16LE(rec.method, 10);
    cdHeader.writeUInt16LE(rec.modTime || 0, 12);
    cdHeader.writeUInt16LE(rec.modDate || 0x21, 14);
    cdHeader.writeUInt32LE(rec.crc32 >>> 0, 16);
    cdHeader.writeUInt32LE(rec.compSize >>> 0, 20);
    cdHeader.writeUInt32LE(rec.uncompSize >>> 0, 24);
    cdHeader.writeUInt16LE(nameBuf.length, 28);
    cdHeader.writeUInt16LE(0, 30);
    cdHeader.writeUInt16LE(0, 32);
    cdHeader.writeUInt16LE(0, 34);
    cdHeader.writeUInt16LE(0, 36);
    cdHeader.writeUInt32LE(rec.externalAttrs || 0, 38);
    cdHeader.writeUInt32LE(localOffset >>> 0, 42);

    cdChunks.push(cdHeader, nameBuf);
  }

  const cdBuf = Buffer.concat(cdChunks);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(records.length, 8);
  eocd.writeUInt16LE(records.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset >>> 0, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localChunks, cdBuf, eocd]);
}

/**
 * Extract lightweight metadata from PNG/JPEG/WebP/GIF images without external dependencies.
 */
export function inspectImageBuffer(buffer, format) {
  const metaTexts = [];
  let width = 0;
  let height = 0;

  if (format === "png" && buffer.length >= 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    width = buffer.readUInt32BE(16);
    height = buffer.readUInt32BE(20);
    let pos = 8;
    while (pos + 12 <= buffer.length) {
      const len = buffer.readUInt32BE(pos);
      const type = buffer.subarray(pos + 4, pos + 8).toString("latin1");
      const dataStart = pos + 8;
      const dataEnd = dataStart + len;
      if (dataEnd + 4 > buffer.length) break;
      if (type === "tEXt" || type === "iTXt") {
        metaTexts.push(buffer.subarray(dataStart, dataEnd).toString("utf8"));
      } else if (type === "zTXt") {
        const nul = buffer.indexOf(0, dataStart);
        if (nul !== -1 && nul + 2 < dataEnd) {
          try {
            const inf = inflateSync(buffer.subarray(nul + 2, dataEnd), { maxOutputLength: 1024 * 1024 });
            metaTexts.push(inf.toString("utf8"));
          } catch {
            // ignore malformed zTXt
          }
        }
      } else if (type === "caBX") {
        metaTexts.push("c2pa");
      }
      pos = dataEnd + 4;
      if (type === "IEND") break;
    }
  } else if (format === "gif" && buffer.length >= 10 && buffer.subarray(0, 3).toString("ascii") === "GIF") {
    width = buffer.readUInt16LE(6);
    height = buffer.readUInt16LE(8);
  } else {
    const asciiScan = buffer.subarray(0, Math.min(buffer.length, 262144)).toString("latin1");
    metaTexts.push(asciiScan);
  }

  const joined = metaTexts.join("\n");
  const aiWorkflowResidue =
    /\bSteps:\s*\d+,\s*Sampler:/i.test(joined) ||
    /"class_type"\s*:\s*"KSampler"/i.test(joined) ||
    /\bComfyUI\b/i.test(joined);
  const c2paPresent = /\bc2pa\b|urn:c2pa/i.test(joined);

  return {
    width,
    height,
    aiWorkflowResidue,
    c2paPresent,
  };
}

/**
 * Extract lightweight page count & readable text spans from PDF buffers.
 */
export function inspectPdfBuffer(buffer) {
  const raw = buffer.toString("latin1");
  if (!raw.startsWith("%PDF-")) {
    throw new Error("Invalid PDF header");
  }
  const encrypted = /\/Encrypt\b/.test(raw);
  const pageMatches = raw.match(/\/Type\s*\/Page\b/g);
  const pageCount = pageMatches ? pageMatches.length : 1;

  const extractedLines = [];
  if (!encrypted) {
    const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let m;
    while ((m = streamRe.exec(raw)) !== null && extractedLines.length < 400) {
      const slice = Buffer.from(m[1], "latin1");
      let content = m[1];
      try {
        content = inflateSync(slice, { maxOutputLength: 4 * 1024 * 1024 }).toString("latin1");
      } catch {
        // non-Flate stream; inspect raw text operators if ASCII
      }
      const tjRe = /\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*Tj/g;
      let tm;
      while ((tm = tjRe.exec(content)) !== null) {
        const cleaned = tm[1]
          .replace(/\\([()\\])/g, "$1")
          .replace(/\\n/g, " ")
          .trim();
        if (cleaned.length >= 2) extractedLines.push(cleaned);
      }
    }
  }

  return {
    encrypted,
    pageCount,
    extractedText: extractedLines.join("\n"),
  };
}
