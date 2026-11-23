import { inflateRawSync, inflateSync } from "node:zlib";

const MAX_ZIP_ENTRIES = 3000;
const MAX_UNCOMPRESSED_BYTES = 120 * 1024 * 1024; // 120 MB zip-bomb ceiling
const MAX_STREAM_UNCOMPRESSED_BYTES = 32 * 1024 * 1024; // 32 MB zlib stream ceiling
const MAX_PNG_PIXELS = 16_000_000;

/**
 * Pure Node.js standard-library ZIP reader for OOXML (`.docx`, `.pptx`).
 * Parses the End of Central Directory (EOCD) and Central Directory entries.
 */
export function readZipXmlEntries(buffer) {
  if (buffer.length < 22 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new Error("Invalid OOXML ZIP header");
  }

  // Locate EOCD signature 0x06054b50 within last 65 KB
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

  const entries = {};
  let totalUncompressed = 0;
  let ptr = cdOffset;

  for (let i = 0; i < totalEntries && ptr + 46 <= cdOffset + cdSize; i += 1) {
    if (buffer.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(ptr + 10);
    const compSize = buffer.readUInt32LE(ptr + 20);
    const uncompSize = buffer.readUInt32LE(ptr + 24);
    const nameLen = buffer.readUInt16LE(ptr + 28);
    const extraLen = buffer.readUInt16LE(ptr + 30);
    const commentLen = buffer.readUInt16LE(ptr + 32);
    const localHeaderOffset = buffer.readUInt32LE(ptr + 42);

    const name = buffer.subarray(ptr + 46, ptr + 46 + nameLen).toString("utf8");
    ptr += 46 + nameLen + extraLen + commentLen;

    if (!/\.(?:xml|rels)$/i.test(name)) continue;

    totalUncompressed += uncompSize;
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      throw new Error("OOXML uncompressed XML payload exceeds 120 MB safety ceiling");
    }

    if (localHeaderOffset + 30 > buffer.length || buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      continue;
    }
    const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compSize;
    if (dataEnd > buffer.length) continue;

    const rawSlice = buffer.subarray(dataStart, dataEnd);
    let outBuf;
    if (method === 0) {
      outBuf = rawSlice;
    } else if (method === 8) {
      outBuf = inflateRawSync(rawSlice, { maxOutputLength: MAX_UNCOMPRESSED_BYTES });
    } else {
      continue;
    }
    entries[name] = outBuf.toString("utf8");
  }

  return entries;
}

// ---------- Shared Color & Math Helpers (100% parity with Python) ----------

function rgbToHslNormalized(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function round4(v) {
  return Math.round(v * 10000) / 10000;
}

function computePixelMetrics(width, height, getRgba) {
  const stepX = Math.max(1, Math.floor(width / 160));
  const stepY = Math.max(1, Math.floor(height / 160));
  const startX = width >= 3 ? 1 : 0;
  const endX = width >= 3 ? width - 1 : width;
  const startY = height >= 3 ? 1 : 0;
  const endY = height >= 3 ? height - 1 : height;

  let opaquePixels = 0;
  let neonPurpleCount = 0;
  let neonCyanCount = 0;
  let darkBgCount = 0;
  let highSatCount = 0;
  let smoothHighSatCount = 0;
  let neutralCount = 0;
  const quantized = new Set();

  for (let y = startY; y < endY; y += stepY) {
    for (let x = startX; x < endX; x += stepX) {
      const [r, g, b, a] = getRgba(x, y);
      if (a < 32) continue;
      opaquePixels += 1;
      quantized.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
      const [h, s, l] = rgbToHslNormalized(r, g, b);
      if (l <= 0.14) darkBgCount += 1;
      if (s <= 0.12) neutralCount += 1;
      if (s >= 0.40 && l >= 0.15 && l <= 0.85 && h >= 235 && h <= 335) {
        neonPurpleCount += 1;
      }
      if (s >= 0.45 && l >= 0.25 && l <= 0.80 && h >= 175 && h <= 210) {
        neonCyanCount += 1;
      }
      if (s >= 0.78 && l >= 0.20 && l <= 0.85) {
        highSatCount += 1;
        const left = getRgba(Math.max(0, x - 1), y);
        const right = getRgba(Math.min(width - 1, x + 1), y);
        const up = getRgba(x, Math.max(0, y - 1));
        const down = getRgba(x, Math.min(height - 1, y + 1));
        const diffSum =
          Math.abs(r - left[0]) + Math.abs(g - left[1]) + Math.abs(b - left[2]) +
          Math.abs(r - right[0]) + Math.abs(g - right[1]) + Math.abs(b - right[2]) +
          Math.abs(r - up[0]) + Math.abs(g - up[1]) + Math.abs(b - up[2]) +
          Math.abs(r - down[0]) + Math.abs(g - down[1]) + Math.abs(b - down[2]);
        if (diffSum / 4 < 18) {
          smoothHighSatCount += 1;
        }
      }
    }
  }

  if (opaquePixels === 0) return null;
  return {
    sampledPixels: opaquePixels,
    neonPurpleRatio: round4(neonPurpleCount / opaquePixels),
    neonCyanRatio: round4(neonCyanCount / opaquePixels),
    darkBgRatio: round4(darkBgCount / opaquePixels),
    highSatRatio: round4(highSatCount / opaquePixels),
    smoothHighSatRatio: highSatCount > 0 ? round4(smoothHighSatCount / highSatCount) : 0,
    neutralRatio: round4(neutralCount / opaquePixels),
    quantizedColors: quantized.size,
  };
}

function decodePngScanlinesAndMetrics(idatChunks, width, height, bitDepth, colorType, interlace, palette) {
  if (interlace !== 0 || bitDepth !== 8 || width <= 0 || height <= 0 || width * height > MAX_PNG_PIXELS) {
    return null;
  }
  const bppMap = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const bpp = bppMap[colorType];
  if (!bpp) return null;
  if (colorType === 3 && (!palette || palette.length === 0)) return null;

  const compressed = Buffer.concat(idatChunks);
  if (compressed.length === 0) return null;

  let raw;
  try {
    raw = inflateSync(compressed, { maxOutputLength: MAX_STREAM_UNCOMPRESSED_BYTES });
  } catch {
    return null;
  }

  const stride = width * bpp;
  const expected = height * (1 + stride);
  if (raw.length < expected) return null;

  // Unfilter all scanlines into flat buffer to allow exact 4-neighbor lookups on sampled grid
  const pixels = new Uint8Array(height * stride);
  for (let y = 0; y < height; y += 1) {
    const rowIn = y * (1 + stride);
    const filterType = raw[rowIn];
    const rowOut = y * stride;
    const prevOut = (y - 1) * stride;
    for (let x = 0; x < stride; x += 1) {
      const filt = raw[rowIn + 1 + x];
      const a = x >= bpp ? pixels[rowOut + x - bpp] : 0;
      const b = y > 0 ? pixels[prevOut + x] : 0;
      const c = y > 0 && x >= bpp ? pixels[prevOut + x - bpp] : 0;
      let val = filt;
      if (filterType === 1) val = (filt + a) & 0xff;
      else if (filterType === 2) val = (filt + b) & 0xff;
      else if (filterType === 3) val = (filt + ((a + b) >> 1)) & 0xff;
      else if (filterType === 4) val = (filt + paethPredictor(a, b, c)) & 0xff;
      pixels[rowOut + x] = val;
    }
  }

  function getRgba(x, y) {
    const off = y * stride + x * bpp;
    if (colorType === 2) return [pixels[off], pixels[off + 1], pixels[off + 2], 255];
    if (colorType === 6) return [pixels[off], pixels[off + 1], pixels[off + 2], pixels[off + 3]];
    if (colorType === 0) {
      const g = pixels[off];
      return [g, g, g, 255];
    }
    if (colorType === 4) {
      const g = pixels[off];
      return [g, g, g, pixels[off + 1]];
    }
    const idx = pixels[off];
    const pal = palette[idx] || [0, 0, 0];
    return [pal[0], pal[1], pal[2], 255];
  }

  return computePixelMetrics(width, height, getRgba);
}

function decodeGifLzw(lzwBytes, minCodeSize, expectedLen) {
  if (minCodeSize < 1 || minCodeSize > 8 || expectedLen <= 0) return null;
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  const prefixes = new Int32Array(4096);
  const suffixes = new Uint8Array(4096);
  const firstChars = new Uint8Array(4096);
  const stack = new Uint8Array(4096);
  const out = new Uint8Array(expectedLen);

  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  let prevCode = -1;
  let outPos = 0;

  let bitBuf = 0;
  let bitCount = 0;
  let bytePos = 0;

  function readCode() {
    while (bitCount < codeSize && bytePos < lzwBytes.length) {
      bitBuf |= lzwBytes[bytePos] << bitCount;
      bitCount += 8;
      bytePos += 1;
    }
    if (bitCount < codeSize) return -1;
    const code = bitBuf & ((1 << codeSize) - 1);
    bitBuf >>= codeSize;
    bitCount -= codeSize;
    return code;
  }

  function resetTable() {
    for (let i = 0; i < clearCode; i += 1) {
      prefixes[i] = -1;
      suffixes[i] = i;
      firstChars[i] = i;
    }
    codeSize = minCodeSize + 1;
    nextCode = eoiCode + 1;
    prevCode = -1;
  }

  resetTable();

  while (outPos < expectedLen) {
    const code = readCode();
    if (code < 0 || code === eoiCode) break;
    if (code === clearCode) {
      resetTable();
      continue;
    }

    let inCode = code;
    let stackLen = 0;
    if (code === nextCode) {
      if (prevCode < 0) break;
      stack[stackLen++] = firstChars[prevCode];
      inCode = prevCode;
    } else if (code > nextCode) {
      break;
    }

    let walk = inCode;
    while (walk >= clearCode && stackLen < 4096) {
      stack[stackLen++] = suffixes[walk];
      walk = prefixes[walk];
    }
    if (walk < 0 || stackLen >= 4096) break;
    const baseChar = firstChars[walk];
    stack[stackLen++] = baseChar;

    for (let i = stackLen - 1; i >= 0 && outPos < expectedLen; i -= 1) {
      out[outPos++] = stack[i];
    }

    if (prevCode >= 0 && nextCode < 4096) {
      prefixes[nextCode] = prevCode;
      suffixes[nextCode] = baseChar;
      firstChars[nextCode] = firstChars[prevCode];
      nextCode += 1;
      if (nextCode === (1 << codeSize) && codeSize < 12) {
        codeSize += 1;
      }
    }
    prevCode = code;
  }

  return out;
}

/**
 * Pure Node.js standard-library binary parser for PNG, JPEG, and WebP images.
 * Extracts container dimensions, embedded workflow/provenance metadata, and PNG pixel heuristics.
 */
export function parseImageBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    throw new Error("Invalid or truncated image buffer");
  }

  const metadataTexts = [];
  let hasC2pa = false;

  // 1. PNG
  if (
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) {
    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    let interlace = 0;
    let hasIhdr = false;
    let palette = null;
    const idatChunks = [];
    let idatBytes = 0;

    while (offset + 12 <= buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.subarray(offset + 4, offset + 8).toString("latin1");
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      if (dataEnd + 4 > buffer.length) break;
      const data = buffer.subarray(dataStart, dataEnd);
      offset = dataEnd + 4;

      if (type === "IHDR" && data.length >= 13) {
        hasIhdr = true;
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        bitDepth = data[8];
        colorType = data[9];
        interlace = data[12];
      } else if (type === "PLTE") {
        palette = [];
        for (let i = 0; i + 2 < data.length; i += 3) {
          palette.push([data[i], data[i + 1], data[i + 2]]);
        }
      } else if (type === "tEXt") {
        const nul = data.indexOf(0);
        if (nul >= 0) {
          const key = data.subarray(0, nul).toString("latin1");
          const value = data.subarray(nul + 1).toString("latin1");
          metadataTexts.push({ key, value });
        }
      } else if (type === "zTXt") {
        const nul = data.indexOf(0);
        if (nul >= 0 && nul + 2 <= data.length) {
          const key = data.subarray(0, nul).toString("latin1");
          const method = data[nul + 1];
          if (method === 0) {
            try {
              const value = inflateSync(data.subarray(nul + 2), { maxOutputLength: 4 * 1024 * 1024 }).toString("utf8");
              metadataTexts.push({ key, value });
            } catch {}
          }
        }
      } else if (type === "iTXt") {
        const nul1 = data.indexOf(0);
        if (nul1 >= 0 && nul1 + 3 <= data.length) {
          const key = data.subarray(0, nul1).toString("latin1");
          const compFlag = data[nul1 + 1];
          const compMethod = data[nul1 + 2];
          const nul2 = data.indexOf(0, nul1 + 3);
          const nul3 = nul2 >= 0 ? data.indexOf(0, nul2 + 1) : -1;
          if (nul3 >= 0) {
            const payload = data.subarray(nul3 + 1);
            try {
              const value =
                compFlag === 1 && compMethod === 0
                  ? inflateSync(payload, { maxOutputLength: 4 * 1024 * 1024 }).toString("utf8")
                  : payload.toString("utf8");
              metadataTexts.push({ key, value });
            } catch {}
          }
        }
      } else if (type === "eXIf") {
        metadataTexts.push({ key: "exif", value: data.toString("latin1").replace(/\x00+/g, " ") });
      } else if (type === "caBX") {
        hasC2pa = true;
        metadataTexts.push({ key: "c2pa", value: data.toString("latin1").replace(/\x00+/g, " ") });
      } else if (type === "IDAT") {
        idatBytes += data.length;
        if (idatBytes <= 24 * 1024 * 1024) {
          idatChunks.push(data);
        }
      } else if (type === "IEND") {
        break;
      }
    }

    if (!hasIhdr || width <= 0 || height <= 0) {
      throw new Error("Invalid PNG missing valid IHDR chunk");
    }

    for (const m of metadataTexts) {
      if (/(?:c2pa|trainedAlgorithmicMedia|jumbf)/i.test(`${m.key} ${m.value}`)) {
        hasC2pa = true;
      }
    }

    const pixelMetrics = decodePngScanlinesAndMetrics(
      idatChunks,
      width,
      height,
      bitDepth,
      colorType,
      interlace,
      palette
    );

    return { format: "png", width, height, metadataTexts, hasC2pa, pixelMetrics };
  }

  // 2. JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let pos = 2;
    let width = 0;
    let height = 0;
    while (pos < buffer.length) {
      while (pos < buffer.length && buffer[pos] === 0xff) pos += 1;
      if (pos >= buffer.length) break;
      const marker = buffer[pos];
      pos += 1;
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      if (pos + 2 > buffer.length) break;
      const segLen = buffer.readUInt16BE(pos);
      if (segLen < 2 || pos + segLen > buffer.length) break;
      const payload = buffer.subarray(pos + 2, pos + segLen);
      pos += segLen;

      if ((marker === 0xc0 || marker === 0xc1 || marker === 0xc2) && payload.length >= 5) {
        height = payload.readUInt16BE(1);
        width = payload.readUInt16BE(3);
      } else if (marker === 0xe1) {
        const s = payload.toString("latin1");
        if (s.startsWith("http://ns.adobe.com/xap/1.0/\x00")) {
          metadataTexts.push({ key: "xmp", value: payload.subarray(29).toString("utf8") });
        } else if (s.startsWith("Exif\x00\x00")) {
          metadataTexts.push({ key: "exif", value: s.slice(6).replace(/\x00+/g, " ") });
        }
      } else if (marker === 0xeb) {
        const s = payload.toString("latin1").replace(/\x00+/g, " ");
        if (/c2pa|jumb/i.test(s)) {
          hasC2pa = true;
          metadataTexts.push({ key: "c2pa", value: s });
        }
      } else if (marker === 0xfe) {
        metadataTexts.push({ key: "comment", value: payload.toString("utf8") });
      }
    }

    for (const m of metadataTexts) {
      if (/(?:c2pa|trainedAlgorithmicMedia|jumbf)/i.test(`${m.key} ${m.value}`)) {
        hasC2pa = true;
      }
    }
    return { format: "jpeg", width, height, metadataTexts, hasC2pa, pixelMetrics: null };
  }

  // 3. WebP (RIFF....WEBP)
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    let pos = 12;
    let width = 0;
    let height = 0;
    while (pos + 8 <= buffer.length) {
      const fourcc = buffer.subarray(pos, pos + 4).toString("ascii");
      const size = buffer.readUInt32LE(pos + 4);
      const dataStart = pos + 8;
      if (dataStart + size > buffer.length) break;
      const data = buffer.subarray(dataStart, dataStart + size);
      pos = dataStart + size + (size % 2);

      if (fourcc === "VP8 " && data.length >= 10 && data[3] === 0x9d && data[4] === 0x01 && data[5] === 0x2a) {
        width = data.readUInt16LE(6) & 0x3fff;
        height = data.readUInt16LE(8) & 0x3fff;
      } else if (fourcc === "VP8L" && data.length >= 5 && data[0] === 0x2f) {
        const bits = data.readUInt32LE(1);
        width = (bits & 0x3fff) + 1;
        height = ((bits >> 14) & 0x3fff) + 1;
      } else if (fourcc === "VP8X" && data.length >= 10) {
        width = (data[4] | (data[5] << 8) | (data[6] << 16)) + 1;
        height = (data[7] | (data[8] << 8) | (data[9] << 16)) + 1;
      } else if (fourcc === "EXIF") {
        metadataTexts.push({ key: "exif", value: data.toString("latin1").replace(/\x00+/g, " ") });
      } else if (fourcc === "XMP ") {
        metadataTexts.push({ key: "xmp", value: data.toString("utf8") });
      }
    }

    if (width <= 0 || height <= 0) {
      throw new Error("Invalid WebP missing dimension chunk");
    }
    for (const m of metadataTexts) {
      if (/(?:c2pa|trainedAlgorithmicMedia|jumbf)/i.test(`${m.key} ${m.value}`)) {
        hasC2pa = true;
      }
    }
    return { format: "webp", width, height, metadataTexts, hasC2pa, pixelMetrics: null };
  }

  // 4. GIF (GIF87a / GIF89a)
  const gifSig = buffer.subarray(0, 6).toString("ascii");
  if ((gifSig === "GIF87a" || gifSig === "GIF89a") && buffer.length >= 13) {
    const width = buffer.readUInt16LE(6);
    const height = buffer.readUInt16LE(8);
    if (width <= 0 || height <= 0) {
      throw new Error("Invalid GIF missing valid screen dimensions");
    }
    const packed = buffer[10];
    const hasGct = (packed & 0x80) !== 0;
    const gctSize = hasGct ? 1 << ((packed & 0x07) + 1) : 0;
    let pos = 13;
    let gct = null;
    if (hasGct) {
      if (pos + gctSize * 3 > buffer.length) {
        throw new Error("Truncated GIF global color table");
      }
      gct = [];
      for (let i = 0; i < gctSize; i += 1) {
        gct.push([buffer[pos + i * 3], buffer[pos + i * 3 + 1], buffer[pos + i * 3 + 2]]);
      }
      pos += gctSize * 3;
    }

    let transparentIdx = -1;
    let frame0Decoded = false;
    let pixelMetrics = null;

    while (pos < buffer.length) {
      const blockId = buffer[pos++];
      if (blockId === 0x3b) break; // Trailer
      if (blockId === 0x21) {
        if (pos >= buffer.length) break;
        const label = buffer[pos++];
        const chunks = [];
        while (pos < buffer.length) {
          const sz = buffer[pos++];
          if (sz === 0) break;
          const end = Math.min(buffer.length, pos + sz);
          chunks.push(buffer.subarray(pos, end));
          pos = end;
        }
        const payload = chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0);
        if (label === 0xf9 && payload.length >= 4 && !frame0Decoded) {
          transparentIdx = (payload[0] & 0x01) !== 0 ? payload[3] : -1;
        } else if (label === 0xfe && payload.length > 0) {
          metadataTexts.push({ key: "comment", value: payload.toString("utf8") });
        } else if (label === 0xff && payload.length >= 11) {
          const appId = payload.subarray(0, 11).toString("latin1");
          if (appId !== "NETSCAPE2.0" && appId !== "ANIMEXTS1.0") {
            const text = payload.subarray(11).toString("utf8").replace(/\x00+/g, " ").trim();
            if (text) {
              const key = /xmp/i.test(appId) ? "xmp" : /c2pa|jumb/i.test(appId + text) ? "c2pa" : "app";
              metadataTexts.push({ key, value: text });
            }
          }
        }
      } else if (blockId === 0x2c) {
        if (pos + 9 > buffer.length) break;
        const left = buffer.readUInt16LE(pos);
        const top = buffer.readUInt16LE(pos + 2);
        const imgW = buffer.readUInt16LE(pos + 4);
        const imgH = buffer.readUInt16LE(pos + 6);
        const imgPacked = buffer[pos + 8];
        pos += 9;
        const hasLct = (imgPacked & 0x80) !== 0;
        const interlaced = (imgPacked & 0x40) !== 0;
        const lctSize = hasLct ? 1 << ((imgPacked & 0x07) + 1) : 0;
        let palette = gct;
        if (hasLct) {
          if (pos + lctSize * 3 > buffer.length) break;
          palette = [];
          for (let i = 0; i < lctSize; i += 1) {
            palette.push([buffer[pos + i * 3], buffer[pos + i * 3 + 1], buffer[pos + i * 3 + 2]]);
          }
          pos += lctSize * 3;
        }
        if (pos >= buffer.length) break;
        const minCodeSize = buffer[pos++];
        const dataChunks = [];
        while (pos < buffer.length) {
          const sz = buffer[pos++];
          if (sz === 0) break;
          const end = Math.min(buffer.length, pos + sz);
          if (!frame0Decoded) dataChunks.push(buffer.subarray(pos, end));
          pos = end;
        }

        if (!frame0Decoded) {
          frame0Decoded = true;
          if (palette && imgW > 0 && imgH > 0 && width * height <= MAX_PNG_PIXELS) {
            const lzwBytes = Buffer.concat(dataChunks);
            const indices = decodeGifLzw(lzwBytes, minCodeSize, imgW * imgH);
            if (indices) {
              const rowMap = new Int32Array(imgH);
              if (interlaced) {
                let srcRow = 0;
                for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]]) {
                  for (let y = start; y < imgH; y += step) {
                    rowMap[y] = srcRow++;
                  }
                }
              } else {
                for (let y = 0; y < imgH; y += 1) rowMap[y] = y;
              }
              const rgba = new Uint8Array(width * height * 4);
              const bgRgb = gct && gct[0] ? gct[0] : [0, 0, 0];
              if (transparentIdx === -1) {
                for (let i = 0; i < width * height; i += 1) {
                  rgba[i * 4] = bgRgb[0];
                  rgba[i * 4 + 1] = bgRgb[1];
                  rgba[i * 4 + 2] = bgRgb[2];
                  rgba[i * 4 + 3] = 255;
                }
              }
              for (let iy = 0; iy < imgH; iy += 1) {
                const cy = top + iy;
                if (cy < 0 || cy >= height) continue;
                const srcOff = rowMap[iy] * imgW;
                for (let ix = 0; ix < imgW; ix += 1) {
                  const cx = left + ix;
                  if (cx < 0 || cx >= width) continue;
                  const cIdx = indices[srcOff + ix];
                  if (cIdx === transparentIdx) continue;
                  const rgb = palette[cIdx] || [0, 0, 0];
                  const dst = (cy * width + cx) * 4;
                  rgba[dst] = rgb[0];
                  rgba[dst + 1] = rgb[1];
                  rgba[dst + 2] = rgb[2];
                  rgba[dst + 3] = 255;
                }
              }
              pixelMetrics = computePixelMetrics(width, height, (x, y) => {
                const off = (y * width + x) * 4;
                return [rgba[off], rgba[off + 1], rgba[off + 2], rgba[off + 3]];
              });
            }
          }
        }
      } else {
        break;
      }
    }

    for (const m of metadataTexts) {
      if (/(?:c2pa|trainedAlgorithmicMedia|jumbf)/i.test(`${m.key} ${m.value}`)) {
        hasC2pa = true;
      }
    }
    return { format: "gif", width, height, metadataTexts, hasC2pa, pixelMetrics };
  }

  throw new Error("Unsupported or corrupted image header (expected PNG, JPEG, WebP, or GIF)");
}

// ---------- Zero-Dependency PDF Parser ----------

function decodeUtf16BeHex(hexRaw) {
  const clean = hexRaw.replace(/[^0-9a-fA-F]/g, "");
  if (!clean) return "";
  const padded = clean.length % 2 === 1 ? `${clean}0` : clean;
  const start = /^feff/i.test(padded) && padded.length >= 4 ? 4 : 0;
  let out = "";
  for (let i = start; i + 3 < padded.length; i += 4) {
    const code = parseInt(padded.slice(i, i + 4), 16);
    if (code === 0) continue;
    if (code >= 0xd800 && code <= 0xdbff) {
      if (i + 7 < padded.length) {
        const low = parseInt(padded.slice(i + 4, i + 8), 16);
        if (low >= 0xdc00 && low <= 0xdfff) {
          const cp = 0x10000 + (((code - 0xd800) << 10) | (low - 0xdc00));
          out += String.fromCodePoint(cp);
          i += 4;
          continue;
        }
      }
      continue; // Drop unpaired high surrogate
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      continue; // Drop unpaired low surrogate
    }
    out += String.fromCharCode(code);
  }
  return out;
}

function decodePdfLiteralString(raw) {
  let out = "";
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    i += 1;
    if (i >= raw.length) break;
    const esc = raw[i];
    if (esc === "n") out += "\n";
    else if (esc === "r") out += "\r";
    else if (esc === "t") out += "\t";
    else if (esc === "b") out += "\b";
    else if (esc === "f") out += "\f";
    else if (esc === "(" || esc === ")" || esc === "\\") out += esc;
    else if (esc === "\r" && raw[i + 1] === "\n") i += 1;
    else if (esc === "\n" || esc === "\r") continue;
    else if (esc >= "0" && esc <= "7") {
      const oct = raw.slice(i, i + 3).match(/^[0-7]{1,3}/)[0];
      out += String.fromCharCode(parseInt(oct, 8));
      i += oct.length - 1;
    } else {
      out += esc;
    }
  }
  return out;
}

function decodePdfUnicodeLiteral(raw) {
  const bytesStr = decodePdfLiteralString(raw);
  if (bytesStr.length >= 4 && bytesStr.charCodeAt(0) === 0xfe && bytesStr.charCodeAt(1) === 0xff) {
    let hex = "";
    for (let i = 2; i < bytesStr.length; i += 1) {
      hex += (bytesStr.charCodeAt(i) & 0xff).toString(16).padStart(2, "0");
    }
    return decodeUtf16BeHex(hex);
  }
  return bytesStr;
}

function decodePdfHexString(hexRaw) {
  const clean = hexRaw.replace(/[^0-9a-fA-F]/g, "");
  if (!clean) return "";
  const padded = clean.length % 2 === 1 ? `${clean}0` : clean;
  if (/^feff/i.test(padded) && padded.length >= 8) {
    return decodeUtf16BeHex(padded);
  }
  let out = "";
  for (let i = 0; i + 1 < padded.length; i += 2) {
    const code = parseInt(padded.slice(i, i + 2), 16);
    if (code >= 0x20 && code <= 0x7e) out += String.fromCharCode(code);
    else if (code === 0x0a || code === 0x0d || code === 0x09) out += " ";
  }
  return out;
}

const AGL_GLYPH_MAP = {
  space: " ", exclam: "!", quotedbl: '"', numbersign: "#", dollar: "$", percent: "%",
  ampersand: "&", quotesingle: "'", parenleft: "(", parenright: ")", asterisk: "*", plus: "+",
  comma: ",", hyphen: "-", period: ".", slash: "/", zero: "0", one: "1", two: "2",
  three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  colon: ":", semicolon: ";", less: "<", equal: "=", greater: ">", question: "?", at: "@",
  bracketleft: "[", backslash: "\\", bracketright: "]", underscore: "_", braceleft: "{",
  bar: "|", braceright: "}", asciitilde: "~", endash: "–", emdash: "—", bullet: "•",
};

function parseToUnicodeCMap(cmapText) {
  const map = new Map();
  const ranges = [];
  const codespaces = [];
  const lenSet = new Set();
  if (!cmapText) return { map, ranges, codespaces, byteLens: [] };

  for (const sec of cmapText.matchAll(/begincodespacerange\b([\s\S]*?)endcodespacerange/g)) {
    for (const pm of sec[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      const sHex = pm[1].toLowerCase();
      const eHex = pm[2].toLowerCase();
      if (sHex.length === eHex.length && sHex.length >= 2 && sHex.length % 2 === 0) {
        const byteLen = sHex.length / 2;
        codespaces.push({ byteLen, start: parseInt(sHex, 16), end: parseInt(eHex, 16) });
        lenSet.add(byteLen);
      }
    }
  }

  for (const sec of cmapText.matchAll(/beginbfchar\b([\s\S]*?)endbfchar/g)) {
    for (const pm of sec[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/g)) {
      const src = pm[1].toLowerCase();
      const dst = decodeUtf16BeHex(pm[2]);
      if (src.length >= 2 && src.length % 2 === 0 && dst) {
        map.set(src, dst);
        lenSet.add(src.length / 2);
      }
    }
  }

  for (const sec of cmapText.matchAll(/beginbfrange\b([\s\S]*?)endbfrange/g)) {
    const body = sec[1];
    const rangeRe = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(?:\[([\s\S]*?)\]|<([0-9a-fA-F]+)>)/g;
    let rm;
    while ((rm = rangeRe.exec(body)) !== null) {
      const startHex = rm[1].toLowerCase();
      const endHex = rm[2].toLowerCase();
      if (startHex.length !== endHex.length || startHex.length % 2 !== 0) continue;
      const startCode = parseInt(startHex, 16);
      const endCode = parseInt(endHex, 16);
      if (!(endCode >= startCode)) continue;
      const hexWidth = startHex.length;
      const byteLen = hexWidth / 2;
      lenSet.add(byteLen);

      if (rm[3] !== undefined) {
        const items = [...rm[3].matchAll(/<([0-9a-fA-F]+)>/g)].map((m) => decodeUtf16BeHex(m[1]));
        ranges.push({ startCode, endCode, byteLen, items, prefixHex: null, baseLastUnit: 0 });
      } else if (rm[4] !== undefined) {
        const dstBaseHex = rm[4];
        if (dstBaseHex.length < 4) continue;
        const prefixHex = dstBaseHex.slice(0, -4);
        const baseLastUnit = parseInt(dstBaseHex.slice(-4), 16);
        ranges.push({ startCode, endCode, byteLen, items: null, prefixHex, baseLastUnit });
      }
    }
  }

  return { map, ranges, codespaces, byteLens: Array.from(lenSet).sort((a, b) => b - a) };
}

function glyphNameToChar(rawName) {
  if (!rawName) return "";
  const name = rawName.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  if (Object.hasOwn(AGL_GLYPH_MAP, name)) return AGL_GLYPH_MAP[name];
  if (name.length === 1 && /[A-Za-z0-9]/.test(name)) return name;
  const uni = name.match(/^uni((?:[0-9a-fA-F]{4})+)$/);
  if (uni) {
    return decodeUtf16BeHex(uni[1]);
  }
  const uhex = name.match(/^u([0-9a-fA-F]{4,6})$/);
  if (uhex) {
    const cp = parseInt(uhex[1], 16);
    return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
  }
  return "";
}

function parseEncodingDifferences(fontDictRaw, objects) {
  let encDict = "";
  const refM = fontDictRaw.match(/\/Encoding\s+(\d+)\s+\d+\s+R/);
  if (refM && objects.has(Number(refM[1]))) {
    encDict = objects.get(Number(refM[1])).dictRaw || "";
  } else {
    const inlineM = fontDictRaw.match(/\/Encoding\s*<<([\s\S]*?)>>/);
    if (inlineM) encDict = inlineM[1];
  }
  if (!encDict) return null;
  const diffM = encDict.match(/\/Differences\s*\[([\s\S]*?)\]/);
  if (!diffM) return null;
  const map = new Map();
  let curCode = 0;
  for (const tok of diffM[1].matchAll(/(\d+)|\/([^\s\x00/[\]()<>]+)/g)) {
    if (tok[1] !== undefined) {
      curCode = Number(tok[1]);
    } else if (tok[2] !== undefined) {
      const ch = glyphNameToChar(tok[2]);
      if (ch) map.set(curCode, ch);
      curCode += 1;
    }
  }
  return map.size > 0 ? map : null;
}

function lookupRangeCMap(ranges, code, byteLen) {
  for (const r of ranges) {
    if (r.byteLen !== byteLen) continue;
    if (code < r.startCode || code > r.endCode) continue;
    const offset = code - r.startCode;
    if (r.items) {
      return offset < r.items.length ? r.items[offset] : "";
    }
    const unitHex = ((r.baseLastUnit + offset) & 0xffff).toString(16).padStart(4, "0");
    return decodeUtf16BeHex(r.prefixHex + unitHex);
  }
  return "";
}

function decodeHexViaToUnicode(hexLower, toUnicode) {
  let out = "";
  let pos = 0;
  const codespaces = toUnicode.codespaces || [];
  const byteLens = toUnicode.byteLens || [];
  const stepMin = (byteLens[byteLens.length - 1] || 1) * 2;
  while (pos < hexLower.length) {
    let consumed = 0;
    if (codespaces.length > 0) {
      let csMatched = false;
      for (const cs of codespaces) {
        const hLen = cs.byteLen * 2;
        if (pos + hLen <= hexLower.length) {
          const key = hexLower.slice(pos, pos + hLen);
          const codeVal = parseInt(key, 16);
          if (codeVal >= cs.start && codeVal <= cs.end) {
            if (toUnicode.map.has(key)) {
              out += toUnicode.map.get(key);
            } else if (toUnicode.ranges && toUnicode.ranges.length > 0) {
              out += lookupRangeCMap(toUnicode.ranges, codeVal, cs.byteLen);
            }
            pos += hLen;
            consumed = hLen;
            csMatched = true;
            break;
          }
        }
      }
      if (csMatched) continue;
    }

    let matched = false;
    for (const bLen of byteLens) {
      const hLen = bLen * 2;
      if (pos + hLen <= hexLower.length) {
        const key = hexLower.slice(pos, pos + hLen);
        if (toUnicode.map.has(key)) {
          out += toUnicode.map.get(key);
          pos += hLen;
          matched = true;
          break;
        }
        if (toUnicode.ranges && toUnicode.ranges.length > 0) {
          const rVal = lookupRangeCMap(toUnicode.ranges, parseInt(key, 16), bLen);
          if (rVal) {
            out += rVal;
            pos += hLen;
            matched = true;
            break;
          }
        }
      }
    }
    if (!matched && !consumed) pos += stepMin;
  }
  return out;
}

function decodePdfHexWithFont(hexRaw, fontEntry) {
  const clean = hexRaw.replace(/[^0-9a-fA-F]/g, "");
  if (!clean) return "";
  const padded = (clean.length % 2 === 1 ? `${clean}0` : clean).toLowerCase();
  if (/^feff/.test(padded) && padded.length >= 8) {
    return decodeUtf16BeHex(padded);
  }
  if (fontEntry?.toUnicode && (fontEntry.toUnicode.map.size > 0 || (fontEntry.toUnicode.ranges?.length || 0) > 0)) {
    return decodeHexViaToUnicode(padded, fontEntry.toUnicode);
  }
  if (fontEntry?.differences && fontEntry.differences.size > 0) {
    let out = "";
    for (let i = 0; i + 1 < padded.length; i += 2) {
      const code = parseInt(padded.slice(i, i + 2), 16);
      if (fontEntry.differences.has(code)) out += fontEntry.differences.get(code);
      else if (!fontEntry.isCustomGlyph && code >= 0x20 && code <= 0x7e) out += String.fromCharCode(code);
    }
    return out;
  }
  if (fontEntry?.isCustomGlyph) return "";
  return decodePdfHexString(hexRaw);
}

function decodePdfLiteralWithFont(raw, fontEntry) {
  const bytesStr = decodePdfLiteralString(raw);
  if (bytesStr.length >= 4 && bytesStr.charCodeAt(0) === 0xfe && bytesStr.charCodeAt(1) === 0xff) {
    return decodePdfUnicodeLiteral(raw);
  }
  if (fontEntry?.toUnicode && (fontEntry.toUnicode.map.size > 0 || (fontEntry.toUnicode.ranges?.length || 0) > 0)) {
    let hex = "";
    for (let i = 0; i < bytesStr.length; i += 1) {
      hex += (bytesStr.charCodeAt(i) & 0xff).toString(16).padStart(2, "0");
    }
    return decodeHexViaToUnicode(hex, fontEntry.toUnicode);
  }
  if (fontEntry?.differences && fontEntry.differences.size > 0) {
    let out = "";
    for (let i = 0; i < bytesStr.length; i += 1) {
      const code = bytesStr.charCodeAt(i) & 0xff;
      if (fontEntry.differences.has(code)) out += fontEntry.differences.get(code);
      else if (!fontEntry.isCustomGlyph && code >= 0x20 && code <= 0x7e) out += String.fromCharCode(code);
    }
    return out;
  }
  if (fontEntry?.isCustomGlyph) return "";
  return bytesStr;
}

function readPdfLiteralAt(src, openIdx) {
  let depth = 1;
  let i = openIdx + 1;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === "\\") {
      i += 2;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    i += 1;
  }
  return { raw: src.slice(openIdx + 1, Math.max(openIdx + 1, i - 1)), endIdx: i };
}

function parseMediaBoxRect(dictText) {
  const m = dictText.match(/\/MediaBox\s*\[\s*(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s*\]/);
  if (!m) return null;
  const w = Math.abs(Number(m[3]) - Number(m[1]));
  const h = Math.abs(Number(m[4]) - Number(m[2]));
  if (!(w > 0 && h > 0)) return null;
  return [w, h];
}

function extractPdfObjects(buffer) {
  const latin = buffer.toString("latin1");
  const objects = new Map();
  const objRe = /(\d+)\s+(\d+)\s+obj\b/g;
  let m;

  while ((m = objRe.exec(latin)) !== null) {
    const objNum = Number(m[1]);
    const bodyStart = m.index + m[0].length;
    const endObjIdx = latin.indexOf("endobj", bodyStart);
    if (endObjIdx === -1) break;

    const streamTagIdx = latin.slice(bodyStart, endObjIdx).indexOf("stream");
    let dictPart = "";
    let streamBytes = null;
    let nextPos = endObjIdx + 6;

    if (streamTagIdx !== -1) {
      const absStreamTagIdx = bodyStart + streamTagIdx;
      dictPart = latin.slice(bodyStart, absStreamTagIdx);
      let sStart = absStreamTagIdx + 6;
      if (latin[sStart] === "\r" && latin[sStart + 1] === "\n") sStart += 2;
      else if (latin[sStart] === "\n" || latin[sStart] === "\r") sStart += 1;

      const lenMatch = dictPart.match(/\/Length\s+(\d+)\b(?!\s+\d+\s+R)/);
      let sEnd = -1;
      if (lenMatch) {
        const candEnd = sStart + Number(lenMatch[1]);
        if (candEnd <= buffer.length) {
          sEnd = candEnd;
          const afterStream = latin.indexOf("endstream", sEnd);
          const realEndObj = afterStream !== -1 ? latin.indexOf("endobj", afterStream) : -1;
          if (realEndObj !== -1) nextPos = realEndObj + 6;
        }
      }
      if (sEnd === -1) {
        const endStreamIdx = latin.indexOf("endstream", sStart);
        if (endStreamIdx !== -1) {
          sEnd = endStreamIdx;
          if (sEnd > sStart && latin[sEnd - 1] === "\n") sEnd -= 1;
          if (sEnd > sStart && latin[sEnd - 1] === "\r") sEnd -= 1;
          const realEndObj = latin.indexOf("endobj", endStreamIdx);
          if (realEndObj !== -1) nextPos = realEndObj + 6;
        }
      }
      if (sEnd >= sStart) {
        streamBytes = buffer.subarray(sStart, sEnd);
      }
    } else {
      dictPart = latin.slice(bodyStart, endObjIdx);
    }

    objects.set(objNum, { objNum, dictRaw: dictPart, streamBytes });
    objRe.lastIndex = nextPos;
  }

  // Extract PDF 1.5+ /Type /ObjStm compressed object streams
  let hasCompressedStreams = false;
  for (const obj of Array.from(objects.values())) {
    if (obj.streamBytes && /\/FlateDecode\b/.test(obj.dictRaw)) {
      hasCompressedStreams = true;
    }
    if (!obj.streamBytes || !/\/Type\s*\/ObjStm\b/.test(obj.dictRaw)) continue;
    const nMatch = obj.dictRaw.match(/\/N\s+(\d+)/);
    const firstMatch = obj.dictRaw.match(/\/First\s+(\d+)/);
    if (!nMatch || !firstMatch) continue;
    const count = Number(nMatch[1]);
    const first = Number(firstMatch[1]);
    const streamText = decodeObjectStream(obj);
    if (!streamText || first <= 0 || first > streamText.length || count <= 0) continue;
    const headerNums = streamText.slice(0, first).match(/\d+/g) || [];
    const pairs = [];
    for (let k = 0; k + 1 < headerNums.length && pairs.length < count; k += 2) {
      pairs.push({ objNum: Number(headerNums[k]), absStart: first + Number(headerNums[k + 1]) });
    }
    const sortedStarts = [...pairs].sort((a, b) => a.absStart - b.absStart);
    for (let k = 0; k < sortedStarts.length; k += 1) {
      const cur = sortedStarts[k];
      if (cur.absStart < first || cur.absStart >= streamText.length) continue;
      const nextStart = k + 1 < sortedStarts.length ? sortedStarts[k + 1].absStart : streamText.length;
      const body = streamText.slice(cur.absStart, Math.max(cur.absStart, Math.min(streamText.length, nextStart))).trim();
      if (!objects.has(cur.objNum) && body) {
        objects.set(cur.objNum, { objNum: cur.objNum, dictRaw: body, streamBytes: null, fromObjStm: true });
      }
    }
  }

  return { latin, objects, hasCompressedStreams };
}

function decodeObjectStream(obj) {
  if (!obj || !obj.streamBytes) return "";
  let bytes = obj.streamBytes;
  if (/\/FlateDecode\b/.test(obj.dictRaw)) {
    try {
      bytes = inflateSync(bytes, { maxOutputLength: MAX_STREAM_UNCOMPRESSED_BYTES });
    } catch {
      return "";
    }
  }
  return bytes.toString("latin1");
}

function collectRgbStopsFromDict(dictText, outColors) {
  for (const m of dictText.matchAll(/\/C[01]\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/g)) {
    const r = Math.min(255, Math.max(0, Math.round(Number(m[1]) * 255)));
    const g = Math.min(255, Math.max(0, Math.round(Number(m[2]) * 255)));
    const b = Math.min(255, Math.max(0, Math.round(Number(m[3]) * 255)));
    outColors.push([r, g, b]);
  }
}

function readPdfDictAt(src, openIdx) {
  let depth = 1;
  let j = openIdx + 2;
  while (j < src.length && depth > 0) {
    if (src[j] === "(") {
      j = readPdfLiteralAt(src, j).endIdx;
      continue;
    }
    if (src[j] === "<" && src[j + 1] === "<") {
      depth += 1;
      j += 2;
      continue;
    }
    if (src[j] === "<") {
      const close = src.indexOf(">", j + 1);
      j = close !== -1 ? close + 1 : j + 1;
      continue;
    }
    if (src[j] === ">" && src[j + 1] === ">") {
      depth -= 1;
      j += 2;
      continue;
    }
    j += 1;
  }
  return { raw: src.slice(openIdx, j), endIdx: j };
}

function extractActualTextFromPropDict(dictRaw) {
  const mIdx = dictRaw.search(/\/ActualText(?=\s|[<(])/);
  if (mIdx === -1) return null;
  let j = mIdx + "/ActualText".length;
  while (j < dictRaw.length && /\s/.test(dictRaw[j])) j += 1;
  if (dictRaw[j] === "<" && dictRaw[j + 1] !== "<") {
    const close = dictRaw.indexOf(">", j + 1);
    if (close !== -1) {
      const hex = dictRaw.slice(j + 1, close).replace(/\s+/g, "");
      if (/^feff/i.test(hex)) return decodeUtf16BeHex(hex);
      return decodePdfHexString(hex);
    }
  } else if (dictRaw[j] === "(") {
    return decodePdfUnicodeLiteral(readPdfLiteralAt(dictRaw, j).raw);
  }
  return null;
}

function isPdfWs(ch) {
  return ch === " " || ch === "\n" || ch === "\r" || ch === "\t" || ch === "\f" || ch === "\x00";
}

function isPdfDelimiter(ch) {
  return !ch || isPdfWs(ch) || ch === "/" || ch === "[" || ch === "]" || ch === "(" || ch === ")" || ch === "<" || ch === ">" || ch === "{" || ch === "}" || ch === "%";
}

function skipPdfWs(str, pos) {
  let p = pos;
  while (p < str.length && isPdfWs(str[p])) p += 1;
  return p;
}

function readPdfOpAt(str, pos) {
  const start = skipPdfWs(str, pos);
  let end = start;
  while (end < str.length && !isPdfDelimiter(str[end])) end += 1;
  return { op: str.slice(start, end), endIdx: end };
}

function stripInlineImagesLinear(streamText) {
  let imageCount = 0;
  const out = [];
  let pos = 0;
  const len = streamText.length;
  while (pos < len) {
    const biIdx = streamText.indexOf("BI", pos);
    if (biIdx === -1) {
      out.push(streamText.slice(pos));
      break;
    }
    const prevOk = biIdx === 0 || isPdfDelimiter(streamText[biIdx - 1]);
    const nextOk = biIdx + 2 < len && isPdfWs(streamText[biIdx + 2]);
    if (!prevOk || !nextOk) {
      out.push(streamText.slice(pos, biIdx + 2));
      pos = biIdx + 2;
      continue;
    }
    const idIdx = streamText.indexOf("ID", biIdx + 3);
    if (idIdx === -1 || !(isPdfWs(streamText[idIdx - 1]) && idIdx + 2 < len && isPdfWs(streamText[idIdx + 2]))) {
      out.push(streamText.slice(pos, biIdx + 2));
      pos = biIdx + 2;
      continue;
    }
    let searchFrom = idIdx + 3;
    let eiIdx = -1;
    while (searchFrom < len) {
      const cand = streamText.indexOf("EI", searchFrom);
      if (cand === -1) break;
      const beforeCh = streamText[cand - 1];
      const afterCh = cand + 2 < len ? streamText[cand + 2] : "";
      if (isPdfWs(beforeCh) && (!afterCh || isPdfDelimiter(afterCh))) {
        eiIdx = cand;
        break;
      }
      searchFrom = cand + 2;
    }
    if (eiIdx === -1) {
      out.push(streamText.slice(pos, biIdx + 2));
      pos = biIdx + 2;
      continue;
    }
    out.push(streamText.slice(pos, biIdx));
    out.push(" ");
    imageCount += 1;
    pos = eiIdx + 2;
  }
  return { cleaned: out.join(""), imageCount };
}

function parseContentStream(streamText, imageXObjNames, fontMap = new Map()) {
  const fontSizes = [];
  const rgbColors = [];
  let textOpCount = 0;
  const textParts = [];

  // Count inline images (`BI ... ID ... EI`) linearly in O(N) without backtracking
  const { cleaned, imageCount: inlineImages } = stripInlineImagesLinear(streamText);
  let imageCount = inlineImages;

  for (const m of cleaned.matchAll(/(?:^|[\s\]>])(0(?:\.\d+)?|1(?:\.0+)?|\.\d+)\s+(0(?:\.\d+)?|1(?:\.0+)?|\.\d+)\s+(0(?:\.\d+)?|1(?:\.0+)?|\.\d+)\s+(?:rg|RG)\b/g)) {
    rgbColors.push([
      Math.round(Number(m[1]) * 255),
      Math.round(Number(m[2]) * 255),
      Math.round(Number(m[3]) * 255),
    ]);
  }

  for (const m of cleaned.matchAll(/\/([A-Za-z0-9_+.-]+)\s+Do\b/g)) {
    if (imageXObjNames.has(m[1])) {
      imageCount += 1;
    }
  }

  // Scan text operators, active fonts, effective scaled sizes, /ActualText marked-content spans, and coordinate-aware line breaks
  let i = 0;
  let currentLine = "";
  let activeFont = null;
  let rawFontSize = 0;
  let lastName = null;
  let curY = null;
  let tm = [1, 0, 0, 1, 0, 0];
  let noArrayClose = false;
  const numStack = [];
  const mcStack = [];
  let actualTextDepth = 0;

  const flushLine = () => {
    const t = currentLine.trim();
    if (t) textParts.push(t);
    currentLine = "";
  };

  const recordEffectiveFontSize = () => {
    if (!(rawFontSize > 0)) return;
    const scaleY = Math.hypot(tm[2], tm[3]);
    const eff = Math.abs(rawFontSize) * (scaleY > 0 ? scaleY : 1);
    const rounded = Math.round(eff * 100) / 100;
    if (rounded >= 0.05 && rounded <= 300) {
      fontSizes.push(rounded);
    }
  };

  const emitChunk = (str) => {
    if (!str) return;
    if (str.trim()) textOpCount += 1;
    currentLine += str;
  };

  while (i < cleaned.length) {
    const ch = cleaned[i];
    if (isPdfWs(ch)) {
      i += 1;
      continue;
    }
    if (ch === "%") {
      const nl = cleaned.indexOf("\n", i);
      i = nl === -1 ? cleaned.length : nl + 1;
      continue;
    }
    if (ch === "(") {
      const { raw, endIdx } = readPdfLiteralAt(cleaned, i);
      const { op, endIdx: afterOp } = readPdfOpAt(cleaned, endIdx);
      if (op === "Tj" || op === "'" || op === '"') {
        recordEffectiveFontSize();
        if (actualTextDepth === 0) {
          if (op === "'" || op === '"') flushLine();
          emitChunk(decodePdfLiteralWithFont(raw, activeFont));
        }
        i = afterOp;
        numStack.length = 0;
        continue;
      }
      i = endIdx;
      continue;
    }
    if (ch === "<" && cleaned[i + 1] === "<") {
      const { raw: dictRaw, endIdx } = readPdfDictAt(cleaned, i);
      const { op, endIdx: afterOp } = readPdfOpAt(cleaned, endIdx);
      if (op === "BDC") {
        const actual = extractActualTextFromPropDict(dictRaw);
        if (actual !== null) {
          if (mcStack.length > 0) {
            mcStack[mcStack.length - 1].hasChildActual = true;
          }
          mcStack.push({ actualText: actual, hasChildActual: false });
          actualTextDepth += 1;
        } else {
          mcStack.push({ actualText: null, hasChildActual: false });
        }
        i = afterOp;
        numStack.length = 0;
        continue;
      }
      i = endIdx;
      continue;
    }
    if (ch === "<" && cleaned[i + 1] !== "<") {
      const closeIdx = cleaned.indexOf(">", i + 1);
      if (closeIdx !== -1) {
        const { op, endIdx: afterOp } = readPdfOpAt(cleaned, closeIdx + 1);
        if (op === "Tj" || op === "'" || op === '"') {
          recordEffectiveFontSize();
          if (actualTextDepth === 0) {
            if (op === "'" || op === '"') flushLine();
            emitChunk(decodePdfHexWithFont(cleaned.slice(i + 1, closeIdx), activeFont));
          }
          i = afterOp;
          numStack.length = 0;
          continue;
        }
        i = closeIdx + 1;
        continue;
      }
    }
    if (ch === "[") {
      if (noArrayClose) {
        i += 1;
        continue;
      }
      let j = i + 1;
      let seg = "";
      let valid = false;
      let pendingSpace = false;
      let sawNum = false;
      let curNumStr = "";
      const flushKernNum = () => {
        if (curNumStr) {
          const kv = Number(curNumStr);
          if (Number.isFinite(kv) && kv <= -200 && seg.length > 0 && !/\s$/.test(seg)) {
            pendingSpace = true;
          }
          curNumStr = "";
        }
        sawNum = false;
      };
      while (j < cleaned.length) {
        const cj = cleaned[j];
        if (cj === "(") {
          flushKernNum();
          const lit = readPdfLiteralAt(cleaned, j);
          if (actualTextDepth === 0) {
            const dec = decodePdfLiteralWithFont(lit.raw, activeFont);
            if (dec) {
              if (pendingSpace && !/^\s/.test(dec)) seg += " ";
              pendingSpace = false;
              seg += dec;
            }
          }
          j = lit.endIdx;
          continue;
        }
        if (cj === "<" && cleaned[j + 1] !== "<") {
          flushKernNum();
          const c2 = cleaned.indexOf(">", j + 1);
          if (c2 !== -1) {
            if (actualTextDepth === 0) {
              const dec = decodePdfHexWithFont(cleaned.slice(j + 1, c2), activeFont);
              if (dec) {
                if (pendingSpace && !/^\s/.test(dec)) seg += " ";
                pendingSpace = false;
                seg += dec;
              }
            }
            j = c2 + 1;
            continue;
          }
        }
        if (cj === "]") {
          flushKernNum();
          const { op, endIdx: afterOp } = readPdfOpAt(cleaned, j + 1);
          if (op === "TJ") {
            valid = true;
            j = afterOp;
          } else {
            j += 1;
          }
          break;
        }
        if (cj === "[" || j - i > 262144) {
          break;
        }
        if ((cj >= "0" && cj <= "9") || cj === "-" || cj === "+" || cj === ".") {
          curNumStr += cj;
          sawNum = true;
        } else if (sawNum) {
          flushKernNum();
        }
        j += 1;
      }
      if (j >= cleaned.length && !valid) noArrayClose = true;
      if (valid) {
        recordEffectiveFontSize();
        if (actualTextDepth === 0) {
          emitChunk(seg);
        }
        i = j;
        numStack.length = 0;
        continue;
      }
    }
    if (ch === "/") {
      let j = i + 1;
      while (j < cleaned.length && !isPdfDelimiter(cleaned[j])) j += 1;
      lastName = cleaned.slice(i + 1, j);
      i = j;
      continue;
    }
    // Read word/number token
    let endTok = i;
    while (endTok < cleaned.length && !isPdfDelimiter(cleaned[endTok])) endTok += 1;
    const tok = cleaned.slice(i, endTok);
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(tok)) {
      numStack.push(Number(tok));
      if (numStack.length > 8) numStack.shift();
    } else {
      if (tok === "Tf") {
        activeFont = (lastName && fontMap.get(lastName)) || null;
        if (numStack.length >= 1) {
          rawFontSize = Math.abs(numStack[numStack.length - 1]);
        }
      } else if (tok === "BT") {
        curY = null;
        tm = [1, 0, 0, 1, 0, 0];
      } else if (tok === "ET") {
        flushLine();
        curY = null;
      } else if (tok === "T*") {
        flushLine();
      } else if (tok === "Td" || tok === "TD") {
        const tx = numStack.length >= 2 ? numStack[numStack.length - 2] : 0;
        const ty = numStack.length >= 2 ? numStack[numStack.length - 1] : 0;
        tm[4] += tx;
        tm[5] += ty;
        if (Math.abs(ty) > 2.0) flushLine();
        curY = (curY ?? 0) + ty;
      } else if (tok === "Tm") {
        if (numStack.length >= 6) {
          const vals = numStack.slice(-6);
          const f = vals[5];
          if (curY !== null && Math.abs(f - curY) > 2.0) flushLine();
          curY = f;
          tm = vals;
        }
      } else if (tok === "BMC" || tok === "BDC") {
        mcStack.push({ actualText: null, hasChildActual: false });
      } else if (tok === "EMC") {
        const frame = mcStack.pop();
        if (frame && frame.actualText !== null) {
          actualTextDepth = Math.max(0, actualTextDepth - 1);
          if (!frame.hasChildActual && actualTextDepth === 0) {
            emitChunk(frame.actualText);
          }
        }
      }
      numStack.length = 0;
    }
    i = endTok === i ? i + 1 : endTok;
  }
  flushLine();

  if (fontSizes.length === 0 && rawFontSize > 0) {
    recordEffectiveFontSize();
  }

  return {
    text: textParts.join("\n"),
    fontSizes,
    rgbColors,
    imageCount,
    textOpCount,
  };
}

function resolvePageFontMap(resText, objects, fontCache) {
  const fontMap = new Map();
  const fontRefs = [];
  const inlineM = resText.match(/\/Font\s*<<([\s\S]*?)>>/);
  if (inlineM) {
    for (const fm of inlineM[1].matchAll(/\/([A-Za-z0-9_+.-]+)\s+(\d+)\s+\d+\s+R/g)) {
      fontRefs.push([fm[1], Number(fm[2])]);
    }
  }
  for (const refM of resText.matchAll(/\/Font\s+(\d+)\s+\d+\s+R/g)) {
    const fDictObj = objects.get(Number(refM[1]));
    if (fDictObj) {
      for (const fm of fDictObj.dictRaw.matchAll(/\/([A-Za-z0-9_+.-]+)\s+(\d+)\s+\d+\s+R/g)) {
        fontRefs.push([fm[1], Number(fm[2])]);
      }
    }
  }

  for (const [alias, fObjNum] of fontRefs) {
    if (fontCache.has(fObjNum)) {
      fontMap.set(alias, fontCache.get(fObjNum));
      continue;
    }
    const fObj = objects.get(fObjNum);
    if (!fObj) continue;
    let fullDict = fObj.dictRaw || "";
    const descM = fullDict.match(/\/DescendantFonts\s*\[\s*(\d+)\s+\d+\s+R/);
    if (descM && objects.has(Number(descM[1]))) {
      fullDict += "\n" + (objects.get(Number(descM[1])).dictRaw || "");
    }
    let toUnicode = null;
    const tuM = fullDict.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
    if (tuM && objects.has(Number(tuM[1]))) {
      const cmapStr = decodeObjectStream(objects.get(Number(tuM[1])));
      const parsed = parseToUnicodeCMap(cmapStr);
      if (parsed.map.size > 0 || parsed.ranges.length > 0) toUnicode = parsed;
    }
    const differences = parseEncodingDifferences(fullDict, objects);
    const hasStdBaseEnc = /\/BaseEncoding\s*\/(?:WinAnsiEncoding|MacRomanEncoding|StandardEncoding)\b/.test(fullDict);
    const isCustomGlyph =
      (/\/Subtype\s*\/(?:Type3|Type0)\b|\/Identity-[HV]\b/.test(fullDict) || Boolean(toUnicode)) &&
      !hasStdBaseEnc;
    const entry = { toUnicode, differences, isCustomGlyph };
    fontCache.set(fObjNum, entry);
    fontMap.set(alias, entry);
  }
  return fontMap;
}

/**
 * Pure Node.js standard-library PDF parser for visual/layout anti-slop inspection.
 * Supports FlateDecode streams, PDF 1.5+ /ObjStm, /ActualText, /ToUnicode CMap, Type3 /Differences, MediaBox inheritance, font sizes, RGB fills/shadings, and image XObjects.
 */
export function parsePdfBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) {
    throw new Error("Invalid or truncated PDF buffer");
  }
  const head = buffer.subarray(0, Math.min(1024, buffer.length)).toString("latin1");
  if (!head.includes("%PDF-")) {
    throw new Error("Invalid PDF header (missing %PDF-)");
  }

  const { latin, objects, hasCompressedStreams } = extractPdfObjects(buffer);

  // Detect encrypted PDFs honestly: check trailer & non-stream dicts for /Encrypt
  const trailerMatch = latin.match(/trailer\s*<<[\s\S]*?>>/);
  if (trailerMatch && /\/Encrypt\b/.test(trailerMatch[0])) {
    return { encrypted: true, pageCount: 0, metadata: {}, pages: [] };
  }
  for (const obj of objects.values()) {
    if (!obj.streamBytes && /\/Encrypt\b/.test(obj.dictRaw)) {
      return { encrypted: true, pageCount: 0, metadata: {}, pages: [] };
    }
  }

  // Extract Producer/Creator metadata from /Info or XMP
  let producer = "";
  let creator = "";
  let hasFonts = false;
  for (const obj of objects.values()) {
    if (/\/Type\s*\/Font\b|\/Subtype\s*\/(?:Type0|Type1|Type3|TrueType|CIDFontType[02])\b/.test(obj.dictRaw)) {
      hasFonts = true;
    }
    if (!obj.streamBytes && (/\/Producer\b/.test(obj.dictRaw) || /\/Creator\b/.test(obj.dictRaw))) {
      const pm = obj.dictRaw.match(/\/Producer\s*\(([^)]*)\)/);
      if (pm) producer = decodePdfLiteralString(pm[1]);
      const cm = obj.dictRaw.match(/\/Creator\s*\(([^)]*)\)/);
      if (cm) creator = decodePdfLiteralString(cm[1]);
    }
  }

  // Collect global image XObject numbers and shading RGB stops
  const imageObjNums = new Set();
  const shadingObjColors = new Map();
  for (const obj of objects.values()) {
    if (/\/Subtype\s*\/Image\b/.test(obj.dictRaw)) {
      imageObjNums.add(obj.objNum);
    }
    const cols = [];
    collectRgbStopsFromDict(obj.dictRaw, cols);
    if (cols.length > 0) shadingObjColors.set(obj.objNum, cols);
  }

  function extractOwnResourcesText(dictRaw) {
    let out = dictRaw || "";
    const resRef = out.match(/\/Resources\s+(\d+)\s+\d+\s+R/);
    if (resRef && objects.has(Number(resRef[1]))) {
      out += "\n" + objects.get(Number(resRef[1])).dictRaw;
    }
    return out;
  }

  // Order pages via /Catalog -> /Pages -> /Kids tree (iterative + inherited MediaBox & Resources)
  const orderedPageObjs = [];
  const inheritedMediaBox = new Map();
  const inheritedResources = new Map();
  const visitedTree = new Set();

  function walkPagesTreeIterative(rootNum) {
    const work = [{ objNum: rootNum, parentBox: null, parentRes: "" }];
    while (work.length > 0) {
      const { objNum, parentBox, parentRes } = work.pop();
      if (visitedTree.has(objNum)) continue;
      visitedTree.add(objNum);
      const obj = objects.get(objNum);
      if (!obj) continue;
      const ownBox = parseMediaBoxRect(obj.dictRaw) || parentBox;
      const hasOwnRes = /\/Resources(?:\s|\n|<<)/.test(obj.dictRaw);
      const combinedRes = hasOwnRes ? `${parentRes}\n${extractOwnResourcesText(obj.dictRaw)}` : parentRes;
      if (/\/Type\s*\/Pages\b/.test(obj.dictRaw)) {
        const kidsMatch = obj.dictRaw.match(/\/Kids\s*\[([^\]]*)\]/);
        if (kidsMatch) {
          const kids = [...kidsMatch[1].matchAll(/(\d+)\s+\d+\s+R/g)].map((rm) => Number(rm[1]));
          for (let k = kids.length - 1; k >= 0; k -= 1) {
            work.push({ objNum: kids[k], parentBox: ownBox, parentRes: combinedRes });
          }
        }
        continue;
      }
      if (/\/Type\s*\/Page(?![a-zA-Z])/.test(obj.dictRaw)) {
        inheritedMediaBox.set(objNum, ownBox || [612, 792]);
        inheritedResources.set(objNum, combinedRes || extractOwnResourcesText(obj.dictRaw));
        orderedPageObjs.push(obj);
      }
    }
  }

  const catalogObj = Array.from(objects.values()).find((o) => /\/Type\s*\/Catalog\b/.test(o.dictRaw));
  if (catalogObj) {
    const pagesRef = catalogObj.dictRaw.match(/\/Pages\s+(\d+)\s+\d+\s+R/);
    if (pagesRef) walkPagesTreeIterative(Number(pagesRef[1]));
  }
  if (orderedPageObjs.length === 0) {
    for (const obj of Array.from(objects.values()).sort((a, b) => a.objNum - b.objNum)) {
      if (/\/Type\s*\/Page(?![a-zA-Z])/.test(obj.dictRaw)) {
        inheritedMediaBox.set(obj.objNum, parseMediaBoxRect(obj.dictRaw) || [612, 792]);
        inheritedResources.set(obj.objNum, extractOwnResourcesText(obj.dictRaw));
        orderedPageObjs.push(obj);
      }
    }
  }

  const fontCache = new Map();
  const pages = orderedPageObjs.map((pageObj, idx) => {
    const [width, height] = inheritedMediaBox.get(pageObj.objNum) || [612, 792];
    const isLandscape = width > height;
    const resText = inheritedResources.get(pageObj.objNum) || extractOwnResourcesText(pageObj.dictRaw);

    const fontMap = resolvePageFontMap(resText, objects, fontCache);
    if (fontMap.size > 0) hasFonts = true;

    const imageXObjNames = new Set();
    for (const xm of resText.matchAll(/\/([A-Za-z0-9_+.-]+)\s+(\d+)\s+\d+\s+R/g)) {
      if (imageObjNums.has(Number(xm[2]))) {
        imageXObjNames.add(xm[1]);
      }
    }

    const resourceColors = [];
    collectRgbStopsFromDict(resText, resourceColors);
    for (const rm of resText.matchAll(/(\d+)\s+\d+\s+R/g)) {
      const refNum = Number(rm[1]);
      const cols = shadingObjColors.get(refNum);
      if (cols) resourceColors.push(...cols);
      const refObj = objects.get(refNum);
      if (refObj) {
        for (const subRef of refObj.dictRaw.matchAll(/(\d+)\s+\d+\s+R/g)) {
          const subCols = shadingObjColors.get(Number(subRef[1]));
          if (subCols) resourceColors.push(...subCols);
        }
      }
    }

    // Resolve /Contents stream(s)
    const contentRefs = [];
    const arrMatch = pageObj.dictRaw.match(/\/Contents\s*\[([^\]]*)\]/);
    if (arrMatch) {
      for (const rm of arrMatch[1].matchAll(/(\d+)\s+\d+\s+R/g)) contentRefs.push(Number(rm[1]));
    } else {
      const singleMatch = pageObj.dictRaw.match(/\/Contents\s+(\d+)\s+\d+\s+R/);
      if (singleMatch) contentRefs.push(Number(singleMatch[1]));
    }

    const joinedStream = contentRefs.map((id) => decodeObjectStream(objects.get(id))).join("\n");
    const parsed = parseContentStream(joinedStream, imageXObjNames, fontMap);

    return {
      pageNum: idx + 1,
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100,
      isLandscape,
      text: parsed.text,
      hasFonts: fontMap.size > 0,
      fontSizes: parsed.fontSizes,
      rgbColors: [...parsed.rgbColors, ...resourceColors],
      imageCount: parsed.imageCount,
      textOpCount: parsed.textOpCount,
    };
  });

  return {
    encrypted: false,
    pageCount: pages.length,
    hasFonts,
    hasCompressedStreams,
    metadata: { producer, creator },
    pages,
  };
}
