// Minimal zero-dependency ISO BMFF (MP4) muxer and box reader for single-track H.264 video.
// Layout: ftyp -> moov -> mdat (faststart so players can stream without seeking to EOF).

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function u16(v) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, v, false);
  return b;
}

function u32(v) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, v >>> 0, false);
  return b;
}

function i32(v) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setInt32(0, v | 0, false);
  return b;
}

function u64(v) {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(v), false);
  return b;
}

function concatBytes(parts) {
  let total = 0;
  for (const p of parts) total += p.byteLength;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
}

function fourcc(str) {
  if (typeof str !== "string" || str.length !== 4) {
    throw new Error(`Invalid fourcc: ${str}`);
  }
  return textEncoder.encode(str);
}

function box(type, ...parts) {
  const payload = concatBytes(parts);
  return concatBytes([u32(8 + payload.byteLength), fourcc(type), payload]);
}

function fullBox(type, version, flags, ...parts) {
  const vf = new Uint8Array([
    version & 0xff,
    (flags >>> 16) & 0xff,
    (flags >>> 8) & 0xff,
    flags & 0xff,
  ]);
  return box(type, vf, ...parts);
}

function fixed1616(value) {
  return u32(Math.round(value * 65536));
}

function identityMatrix() {
  return concatBytes([
    u32(0x00010000), u32(0), u32(0),
    u32(0), u32(0x00010000), u32(0),
    u32(0), u32(0), u32(0x40000000),
  ]);
}

function buildFtyp() {
  return box(
    "ftyp",
    fourcc("isom"),
    u32(512),
    fourcc("isom"),
    fourcc("iso2"),
    fourcc("avc1"),
    fourcc("mp41"),
  );
}

function buildStts(samples) {
  const runs = [];
  for (const s of samples) {
    const dur = s.duration >>> 0;
    if (runs.length && runs[runs.length - 1].duration === dur) {
      runs[runs.length - 1].count += 1;
    } else {
      runs.push({ count: 1, duration: dur });
    }
  }
  const parts = [u32(runs.length)];
  for (const r of runs) {
    parts.push(u32(r.count), u32(r.duration));
  }
  return fullBox("stts", 0, 0, ...parts);
}

function buildStss(samples) {
  const keys = [];
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].key) keys.push(i + 1);
  }
  if (!keys.length) return null;
  const parts = [u32(keys.length)];
  for (const k of keys) parts.push(u32(k));
  return fullBox("stss", 0, 0, ...parts);
}

function buildStsz(samples) {
  const parts = [u32(0), u32(samples.length)];
  for (const s of samples) parts.push(u32(s.data.byteLength));
  return fullBox("stsz", 0, 0, ...parts);
}

function buildStsc(sampleCount) {
  return fullBox("stsc", 0, 0, u32(1), u32(1), u32(sampleCount), u32(1));
}

function buildStcoOrCo64(chunkOffset) {
  if (chunkOffset > 0xffffffff) {
    return fullBox("co64", 0, 0, u32(1), u64(chunkOffset));
  }
  return fullBox("stco", 0, 0, u32(1), u32(chunkOffset));
}

function buildAvc1(width, height, avcC) {
  const compressorName = new Uint8Array(32);
  const avcCBox = box("avcC", avcC);
  const entry = concatBytes([
    new Uint8Array(6), // reserved
    u16(1), // data_reference_index
    u16(0), u16(0), u32(0), u32(0), u32(0), // pre_defined + reserved
    u16(width),
    u16(height),
    fixed1616(72), // horizresolution
    fixed1616(72), // vertresolution
    u32(0), // reserved
    u16(1), // frame_count
    compressorName,
    u16(0x0018), // depth = 24
    i32(-1).slice(2), // pre_defined = -1 (int16)
    avcCBox,
  ]);
  return box("avc1", entry);
}

function buildMoov({ width, height, timescale, totalDuration, avcC, samples, chunkOffset }) {
  const movieTimescale = 1000;
  const movieDuration = Math.round((totalDuration * movieTimescale) / timescale);

  const mvhd = fullBox(
    "mvhd",
    0,
    0,
    u32(0), // creation_time
    u32(0), // modification_time
    u32(movieTimescale),
    u32(movieDuration),
    fixed1616(1), // rate
    u16(0x0100), // volume
    new Uint8Array(10), // reserved
    identityMatrix(),
    new Uint8Array(24), // pre_defined
    u32(2), // next_track_ID
  );

  const tkhd = fullBox(
    "tkhd",
    0,
    3, // track_enabled | track_in_movie
    u32(0), // creation_time
    u32(0), // modification_time
    u32(1), // track_ID
    u32(0), // reserved
    u32(movieDuration),
    new Uint8Array(8), // reserved
    u16(0), // layer
    u16(0), // alternate_group
    u16(0), // volume (0 for video)
    u16(0), // reserved
    identityMatrix(),
    fixed1616(width),
    fixed1616(height),
  );

  const mdhd = fullBox(
    "mdhd",
    0,
    0,
    u32(0),
    u32(0),
    u32(timescale),
    u32(totalDuration),
    u16(0x55c4), // 'und'
    u16(0),
  );

  const hdlr = fullBox(
    "hdlr",
    0,
    0,
    u32(0),
    fourcc("vide"),
    new Uint8Array(12),
    textEncoder.encode("VideoHandler\0"),
  );

  const vmhd = fullBox("vmhd", 0, 1, u16(0), u16(0), u16(0), u16(0));
  const urlBox = fullBox("url ", 0, 1);
  const dref = fullBox("dref", 0, 0, u32(1), urlBox);
  const dinf = box("dinf", dref);

  const stsd = fullBox("stsd", 0, 0, u32(1), buildAvc1(width, height, avcC));
  const stts = buildStts(samples);
  const stss = buildStss(samples);
  const stsc = buildStsc(samples.length);
  const stsz = buildStsz(samples);
  const stco = buildStcoOrCo64(chunkOffset);

  const stblParts = [stsd, stts];
  if (stss) stblParts.push(stss);
  stblParts.push(stsc, stsz, stco);
  const stbl = box("stbl", ...stblParts);

  const minf = box("minf", vmhd, dinf, stbl);
  const mdia = box("mdia", mdhd, hdlr, minf);
  const trak = box("trak", tkhd, mdia);

  return box("moov", mvhd, trak);
}

/**
 * Muxes H.264 AVC length-prefixed samples into a faststart ISO BMFF MP4 buffer.
 * @param {object} opts
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {number} [opts.timescale=30000]
 * @param {Uint8Array} opts.avcC AVCDecoderConfigurationRecord bytes
 * @param {Array<{data: Uint8Array, duration: number, key?: boolean}>} opts.samples
 * @returns {Uint8Array}
 */
export function muxMp4({ width, height, timescale = 30000, avcC, samples }) {
  if (!Number.isInteger(width) || width <= 0) throw new Error("Invalid video width");
  if (!Number.isInteger(height) || height <= 0) throw new Error("Invalid video height");
  if (!(avcC instanceof Uint8Array) || avcC.byteLength === 0) throw new Error("Missing avcC configuration");
  if (!Array.isArray(samples) || samples.length === 0) throw new Error("At least one sample is required");

  let totalDuration = 0;
  let mdatPayloadSize = 0;
  for (const s of samples) {
    totalDuration += s.duration >>> 0;
    mdatPayloadSize += s.data.byteLength;
  }

  const ftyp = buildFtyp();
  // Measure moov with placeholder offset, then recompute exact mdat payload start offset.
  const dummyMoov = buildMoov({
    width,
    height,
    timescale,
    totalDuration,
    avcC,
    samples,
    chunkOffset: 0,
  });
  const mdatHeaderSize = mdatPayloadSize + 8 > 0xffffffff ? 16 : 8;
  const preliminaryOffset = ftyp.byteLength + dummyMoov.byteLength + mdatHeaderSize;
  const moov = buildMoov({
    width,
    height,
    timescale,
    totalDuration,
    avcC,
    samples,
    chunkOffset: preliminaryOffset,
  });

  // If co64 expanded moov by 4 bytes, rebuild once with final offset.
  const finalOffset = ftyp.byteLength + moov.byteLength + mdatHeaderSize;
  const finalMoov = finalOffset === preliminaryOffset
    ? moov
    : buildMoov({ width, height, timescale, totalDuration, avcC, samples, chunkOffset: finalOffset });

  const mdatHeader = mdatHeaderSize === 16
    ? concatBytes([u32(1), fourcc("mdat"), u64(mdatPayloadSize + 16)])
    : concatBytes([u32(mdatPayloadSize + 8), fourcc("mdat")]);

  const chunks = [ftyp, finalMoov, mdatHeader];
  for (const s of samples) chunks.push(s.data);
  return concatBytes(chunks);
}

const CONTAINER_BOXES = new Set(["moov", "trak", "mdia", "minf", "dinf", "stbl"]);

/**
 * Parses top-level and nested ISO BMFF boxes for inspection and testing.
 * @param {Uint8Array} bytes
 * @returns {Array<object>}
 */
export function parseBoxes(bytes, start = 0, end = bytes.byteLength) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = [];
  let pos = start;

  while (pos + 8 <= end) {
    let size = view.getUint32(pos, false);
    const type = textDecoder.decode(bytes.subarray(pos + 4, pos + 8));
    let headerSize = 8;
    if (size === 1) {
      size = Number(view.getBigUint64(pos + 8, false));
      headerSize = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    if (size < headerSize || pos + size > end) {
      throw new Error(`Malformed box '${type}' at ${pos}`);
    }

    const payloadStart = pos + headerSize;
    const payloadEnd = pos + size;
    const node = { type, start: pos, size, headerSize, payloadStart };

    if (CONTAINER_BOXES.has(type)) {
      node.children = parseBoxes(bytes, payloadStart, payloadEnd);
    } else if (type === "mvhd") {
      node.timescale = view.getUint32(payloadStart + 12, false);
      node.duration = view.getUint32(payloadStart + 16, false);
    } else if (type === "mdhd") {
      node.timescale = view.getUint32(payloadStart + 12, false);
      node.duration = view.getUint32(payloadStart + 16, false);
    } else if (type === "stsd") {
      const entryStart = payloadStart + 8;
      const entryType = textDecoder.decode(bytes.subarray(entryStart + 4, entryStart + 8));
      node.entryType = entryType;
      if (entryType === "avc1") {
        node.width = view.getUint16(entryStart + 32, false);
        node.height = view.getUint16(entryStart + 34, false);
      }
    } else if (type === "stts") {
      const count = view.getUint32(payloadStart + 4, false);
      node.entries = [];
      for (let i = 0; i < count; i++) {
        node.entries.push({
          count: view.getUint32(payloadStart + 8 + i * 8, false),
          duration: view.getUint32(payloadStart + 12 + i * 8, false),
        });
      }
    } else if (type === "stss") {
      const count = view.getUint32(payloadStart + 4, false);
      node.keyframes = [];
      for (let i = 0; i < count; i++) {
        node.keyframes.push(view.getUint32(payloadStart + 8 + i * 4, false));
      }
    } else if (type === "stsc") {
      const count = view.getUint32(payloadStart + 4, false);
      node.entries = [];
      for (let i = 0; i < count; i++) {
        node.entries.push({
          firstChunk: view.getUint32(payloadStart + 8 + i * 12, false),
          samplesPerChunk: view.getUint32(payloadStart + 12 + i * 12, false),
          descriptionIndex: view.getUint32(payloadStart + 16 + i * 12, false),
        });
      }
    } else if (type === "stsz") {
      node.sampleSize = view.getUint32(payloadStart + 4, false);
      node.sampleCount = view.getUint32(payloadStart + 8, false);
      node.sizes = [];
      if (node.sampleSize === 0) {
        for (let i = 0; i < node.sampleCount; i++) {
          node.sizes.push(view.getUint32(payloadStart + 12 + i * 4, false));
        }
      }
    } else if (type === "stco") {
      const count = view.getUint32(payloadStart + 4, false);
      node.offsets = [];
      for (let i = 0; i < count; i++) {
        node.offsets.push(view.getUint32(payloadStart + 8 + i * 4, false));
      }
    }

    out.push(node);
    pos += size;
  }

  return out;
}

export function findBox(boxes, type) {
  for (const b of boxes) {
    if (b.type === type) return b;
    if (b.children) {
      const hit = findBox(b.children, type);
      if (hit) return hit;
    }
  }
  return null;
}
