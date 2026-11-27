import test from "node:test";
import assert from "node:assert/strict";
import { muxMp4, parseBoxes, findBox } from "../scripts/demo-trailer/mp4.mjs";
import { FPS, H, STORYBOARD, TOTAL_FRAMES, TOTAL_SECONDS, W, shotAtTime } from "../scripts/demo-trailer/storyboard.mjs";

test("muxMp4 writes valid faststart ISO BMFF boxes and preserves sample metadata", () => {
  const avcC = Uint8Array.of(
    0x01, 0x64, 0x00, 0x28, 0xff, 0xe1,
    0x00, 0x04, 0x67, 0x64, 0x00, 0x28,
    0x01, 0x00, 0x04, 0x68, 0xee, 0x3c, 0x80,
  );
  const samples = [];
  for (let i = 0; i < 60; i++) {
    const len = 32 + (i % 19);
    const data = new Uint8Array(len);
    data[0] = (len - 4) >>> 24;
    data[3] = (len - 4) & 0xff;
    data[4] = i % 30 === 0 ? 0x65 : 0x41;
    samples.push({ data, duration: 1000, key: i % 30 === 0 });
  }

  const bytes = muxMp4({ width: 1920, height: 1080, timescale: 30000, avcC, samples });
  const top = parseBoxes(bytes);
  assert.deepEqual(
    top.map((b) => b.type),
    ["ftyp", "moov", "mdat"],
  );

  const mdhd = findBox(top, "mdhd");
  assert.equal(mdhd.timescale, 30000);
  assert.equal(mdhd.duration, 60000);

  const stsd = findBox(top, "stsd");
  assert.equal(stsd.entryType, "avc1");
  assert.equal(stsd.width, 1920);
  assert.equal(stsd.height, 1080);

  const stss = findBox(top, "stss");
  assert.deepEqual(stss.keyframes, [1, 31]);

  const stsz = findBox(top, "stsz");
  assert.equal(stsz.sampleCount, 60);
  assert.deepEqual(
    stsz.sizes,
    samples.map((s) => s.data.byteLength),
  );

  const stco = findBox(top, "stco");
  const mdat = findBox(top, "mdat");
  assert.deepEqual(stco.offsets, [mdat.payloadStart]);
});

test("demo trailer storyboard covers 20s @ 1080p30 and respects voice bans", () => {
  assert.equal(W, 1920);
  assert.equal(H, 1080);
  assert.equal(FPS, 30);
  assert.equal(TOTAL_SECONDS, 20);
  assert.equal(TOTAL_FRAMES, 600);
  assert.equal(STORYBOARD.badge, "EXAMPLE");

  const shots = STORYBOARD.shots;
  assert.equal(shots[0].startSec, 0);
  assert.equal(shots[shots.length - 1].endSec, TOTAL_SECONDS);
  for (let i = 1; i < shots.length; i++) {
    assert.equal(shots[i].startSec, shots[i - 1].endSec);
  }
  assert.equal(shotAtTime(0).shot.id, "draft");
  assert.equal(shotAtTime(19.9).shot.id, "end");

  const serialized = JSON.stringify(STORYBOARD);
  assert.equal(serialized.includes("!"), false);
  assert.equal(serialized.includes("?"), false);
});
