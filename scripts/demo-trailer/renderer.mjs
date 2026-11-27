// Browser Canvas 2D + WebCodecs H.264 trailer renderer for dislop.
import { W, H, FPS, TOTAL_FRAMES, TOKENS, STORYBOARD, shotAtTime } from "./storyboard.mjs";
import { muxMp4 } from "./mp4.mjs";

const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
const MONO = 'ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, monospace';

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (t) => 1 - (1 - clamp01(t)) ** 3;

function drawDeleLogo(ctx, x, y, size) {
  const s = size / 64;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);

  // Rounded carbon tile (#14171A) with subtle border so it stays clear on dark stage
  ctx.fillStyle = TOKENS.stageBg;
  ctx.strokeStyle = "#363E48";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(0, 0, 64, 64, 12);
  ctx.fill();
  ctx.stroke();

  // Manuscript line being struck
  ctx.strokeStyle = "rgba(244, 245, 243, 0.26)";
  ctx.lineWidth = 4.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(10, 38);
  ctx.lineTo(54, 38);
  ctx.stroke();

  // Proofreader dele loop (#F04438)
  ctx.strokeStyle = TOKENS.deleRed;
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(10, 38);
  ctx.lineTo(34, 38);
  ctx.bezierCurveTo(44.5, 38, 52, 30.8, 52, 21.5);
  ctx.bezierCurveTo(52, 14.5, 47.2, 10, 41.2, 10);
  ctx.bezierCurveTo(34.8, 10, 30.5, 15, 30.5, 22.2);
  ctx.bezierCurveTo(30.5, 33.8, 39.5, 45.5, 53, 51);
  ctx.stroke();

  ctx.restore();
}

function drawInlineDeleStroke(ctx, x0, x1, yMid, reveal) {
  const p = easeOut(reveal);
  if (p <= 0) return;
  const endX = x0 + (x1 - x0) * p;
  ctx.save();
  ctx.strokeStyle = TOKENS.deleRed;
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0, yMid);
  ctx.lineTo(endX, yMid);
  ctx.stroke();

  if (p > 0.72) {
    const loopT = (p - 0.72) / 0.28;
    const lx = endX + 6;
    ctx.globalAlpha = loopT;
    ctx.beginPath();
    ctx.arc(lx, yMid - 10, 9, Math.PI * 0.4, Math.PI * 2.15);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTag(ctx, x, y, text, style) {
  ctx.save();
  ctx.font = `600 18px ${MONO}`;
  const padX = 12;
  const w = ctx.measureText(text).width + padX * 2;
  const h = 32;

  if (style === "defect" || style === "dele") {
    ctx.fillStyle = TOKENS.defectWash;
    ctx.strokeStyle = "#FECDCA";
    ctx.fillRect(x, y, w, h);
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = TOKENS.defectInk;
  } else if (style === "warning") {
    ctx.fillStyle = TOKENS.warningWash;
    ctx.strokeStyle = "#B2DDFF";
    ctx.fillRect(x, y, w, h);
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = TOKENS.warningInk;
  } else {
    ctx.fillStyle = TOKENS.passWash;
    ctx.strokeStyle = TOKENS.passBorder;
    ctx.fillRect(x, y, w, h);
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = TOKENS.passInk;
  }

  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padX, y + h / 2 + 1);
  ctx.restore();
}

function drawSheetShot(ctx, shot, localSec) {
  // Top header row inside charcoal stage
  drawDeleLogo(ctx, 120, 68, 52);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 28px ${SANS}`;
  ctx.textBaseline = "middle";
  ctx.fillText("dislop", 188, 95);

  // Explicit EXAMPLE badge
  ctx.fillStyle = "#21262D";
  ctx.strokeStyle = "#3B434E";
  ctx.lineWidth = 1;
  ctx.fillRect(290, 77, 112, 34);
  ctx.strokeRect(290, 77, 112, 34);
  ctx.fillStyle = "#D0D7DE";
  ctx.font = `600 16px ${MONO}`;
  ctx.fillText(STORYBOARD.badge, 310, 95);

  // Shot headline
  ctx.fillStyle = "#F4F5F3";
  ctx.font = `600 32px ${SANS}`;
  ctx.fillText(shot.headline, 120, 166);

  // Crisp 0px-radius white sheet (#FFFFFF)
  const sx = 120;
  const sy = 216;
  const sw = 1680;
  const sh = 660;
  ctx.fillStyle = TOKENS.sheetBg;
  ctx.fillRect(sx, sy, sw, sh);
  ctx.strokeStyle = TOKENS.sheetBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(sx, sy, sw, sh);

  // Sheet top chrome bar (0px radius)
  ctx.fillStyle = TOKENS.paperBar;
  ctx.fillRect(sx, sy, sw, 56);
  ctx.strokeStyle = TOKENS.sheetBorder;
  ctx.beginPath();
  ctx.moveTo(sx, sy + 56);
  ctx.lineTo(sx + sw, sy + 56);
  ctx.stroke();

  ctx.fillStyle = TOKENS.inkMuted;
  ctx.font = `600 20px ${MONO}`;
  ctx.fillText(STORYBOARD.fileLabel, sx + 32, sy + 29);

  if (shot.command) {
    const cmdPrefix = "$ ";
    ctx.font = `500 20px ${MONO}`;
    const cmdText = cmdPrefix + shot.command;
    const cw = ctx.measureText(cmdText).width + 28;
    ctx.fillStyle = "#14171A";
    ctx.fillRect(sx + sw - cw - 24, sy + 10, cw, 36);
    ctx.fillStyle = "#F4F5F3";
    ctx.fillText(cmdText, sx + sw - cw - 10, sy + 29);
  }

  // Prose lines
  const startY = sy + 128;
  const rowGap = 112;
  const markReveal = shot.id === "check" ? clamp01((localSec - 0.35) / 0.9) : 1;

  shot.lines.forEach((line, idx) => {
    const ly = startY + idx * rowGap;
    const lx = sx + 48;

    ctx.font = `400 31px ${SANS}`;
    const fullW = ctx.measureText(line.text).width;

    // Wash behind flagged spans
    if (line.mark === "dele" && markReveal > 0) {
      ctx.fillStyle = TOKENS.defectWash;
      ctx.fillRect(lx - 8, ly - 24, fullW + 16, 48);
    } else if (line.mark === "defect" && line.span && markReveal > 0) {
      const idxSpan = line.text.indexOf(line.span);
      const prefixW = ctx.measureText(line.text.slice(0, idxSpan)).width;
      const spanW = ctx.measureText(line.span).width;
      ctx.fillStyle = TOKENS.defectWash;
      ctx.fillRect(lx + prefixW - 4, ly - 22, spanW + 8, 44);
      ctx.strokeStyle = TOKENS.defectInk;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(lx + prefixW, ly + 22);
      ctx.lineTo(lx + prefixW + spanW * easeOut(markReveal), ly + 22);
      ctx.stroke();
    } else if (line.mark === "warning" && line.span && markReveal > 0) {
      const idxSpan = line.text.indexOf(line.span);
      const prefixW = ctx.measureText(line.text.slice(0, idxSpan)).width;
      const spanW = ctx.measureText(line.span).width;
      ctx.fillStyle = TOKENS.warningWash;
      ctx.fillRect(lx + prefixW - 4, ly - 22, spanW + 8, 44);
      ctx.save();
      ctx.strokeStyle = TOKENS.warningLine;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(lx + prefixW, ly + 22);
      ctx.lineTo(lx + prefixW + spanW * easeOut(markReveal), ly + 22);
      ctx.stroke();
      ctx.restore();
    } else if (line.mark === "verified") {
      ctx.fillStyle = TOKENS.passWash;
      ctx.fillRect(lx - 8, ly - 22, fullW + 16, 44);
    }

    ctx.fillStyle = line.mark === "dele" && markReveal > 0.5 ? TOKENS.inkMuted : TOKENS.ink;
    ctx.fillText(line.text, lx, ly);

    if (line.mark === "dele") {
      drawInlineDeleStroke(ctx, lx - 4, lx + fullW + 4, ly, markReveal);
    }

    if (line.tag && markReveal > 0.25) {
      const tagX = sx + sw - 260;
      drawTag(ctx, tagX, ly - 16, line.tag, line.mark);
    }
  });

  // Protected-spans strip in verify shot
  if (shot.id === "verify" && Array.isArray(shot.verifiedTokens)) {
    const stripY = sy + sh - 130;
    ctx.fillStyle = TOKENS.inkMuted;
    ctx.font = `600 18px ${MONO}`;
    ctx.fillText("PROTECTED SPANS:", sx + 48, stripY + 18);
    let tx = sx + 252;
    for (const tok of shot.verifiedTokens) {
      const label = `${tok} ok`;
      ctx.font = `600 18px ${MONO}`;
      const tw = ctx.measureText(label).width + 24;
      ctx.fillStyle = TOKENS.passWash;
      ctx.strokeStyle = TOKENS.passBorder;
      ctx.fillRect(tx, stripY, tw, 36);
      ctx.strokeRect(tx, stripY, tw, 36);
      ctx.fillStyle = TOKENS.passInk;
      ctx.fillText(label, tx + 12, stripY + 19);
      tx += tw + 14;
    }
  }

  // Bottom status bar inside stage (no progress bar!)
  ctx.fillStyle = "#1B2026";
  ctx.strokeStyle = TOKENS.stageEdge;
  ctx.fillRect(120, 912, sw, 64);
  ctx.strokeRect(120, 912, sw, 64);
  ctx.fillStyle = shot.id === "verify" ? "#6CE9A6" : "#E4E7EC";
  ctx.font = `500 22px ${MONO}`;
  ctx.fillText(shot.statusBar, 152, 945);
}

function drawEndShot(ctx, shot) {
  drawDeleLogo(ctx, W / 2 - 44, 276, 88);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `700 56px ${SANS}`;
  ctx.fillText(shot.slogan, W / 2, 438);

  // Command box
  ctx.font = `600 30px ${MONO}`;
  const cw = ctx.measureText(shot.command).width + 72;
  ctx.fillStyle = "#1D2228";
  ctx.strokeStyle = "#363E48";
  ctx.lineWidth = 1.5;
  ctx.fillRect(W / 2 - cw / 2, 520, cw, 74);
  ctx.strokeRect(W / 2 - cw / 2, 520, cw, 74);
  ctx.fillStyle = "#F4F5F3";
  ctx.fillText(shot.command, W / 2, 558);

  ctx.fillStyle = "#98A2B3";
  ctx.font = `500 24px ${MONO}`;
  ctx.fillText(shot.url, W / 2, 668);
  ctx.textAlign = "left";
}

/**
 * Draws a single 1920x1080 frame onto the provided CanvasRenderingContext2D.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} frameIndex
 */
export function drawFrame(ctx, frameIndex) {
  const { shot, localSec } = shotAtTime(frameIndex / FPS);

  ctx.save();
  ctx.fillStyle = TOKENS.stageBg;
  ctx.fillRect(0, 0, W, H);

  // Subtle 1px structural framing grid (no gradients, no neon)
  ctx.strokeStyle = "#1F242B";
  ctx.lineWidth = 1;
  ctx.strokeRect(48, 36, W - 96, H - 72);

  if (shot.id === "end") {
    drawEndShot(ctx, shot);
  } else {
    drawSheetShot(ctx, shot, localSec);
  }
  ctx.restore();
}

async function pickVideoConfig() {
  if (typeof VideoEncoder === "undefined") {
    throw new Error("WebCodecs VideoEncoder is not supported in this browser");
  }
  const codecs = ["avc1.640028", "avc1.4D0028", "avc1.42E028"];
  for (const codec of codecs) {
    const cfg = {
      codec,
      width: W,
      height: H,
      bitrate: 6_000_000,
      framerate: FPS,
      avc: { format: "avc" },
    };
    const res = await VideoEncoder.isConfigSupported(cfg);
    if (res.supported) return cfg;
  }
  throw new Error("No supported H.264 WebCodecs profile found");
}

/**
 * Renders all 600 frames into an in-memory 1080p MP4 Blob via WebCodecs + muxMp4.
 * @param {{onProgress?: (frame: number, total: number) => void}} [opts]
 * @returns {Promise<Blob>}
 */
export async function renderTrailerMp4(opts = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const config = await pickVideoConfig();
  const timescale = 30000;
  const frameTicks = Math.round(timescale / FPS); // 1000 ticks per frame @ 30fps
  const frameDurationUs = Math.round(1_000_000 / FPS);

  let avcC = null;
  const samples = [];
  let encoderError = null;

  const encoder = new VideoEncoder({
    output(chunk, meta) {
      if (!avcC && meta?.decoderConfig?.description) {
        const desc = meta.decoderConfig.description;
        avcC = desc instanceof Uint8Array ? new Uint8Array(desc) : new Uint8Array(desc);
      }
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      samples.push({
        data,
        duration: frameTicks,
        key: chunk.type === "key",
      });
    },
    error(err) {
      encoderError = err;
    },
  });

  encoder.configure(config);

  for (let i = 0; i < TOTAL_FRAMES; i++) {
    if (encoderError) throw encoderError;
    drawFrame(ctx, i);
    const frame = new VideoFrame(canvas, {
      timestamp: i * frameDurationUs,
      duration: frameDurationUs,
    });
    encoder.encode(frame, { keyFrame: i % FPS === 0 });
    frame.close();
    if (opts.onProgress && (i % 10 === 0 || i === TOTAL_FRAMES - 1)) {
      opts.onProgress(i + 1, TOTAL_FRAMES);
    }
    if (encoder.encodeQueueSize > 8) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  await encoder.flush();
  encoder.close();
  if (encoderError) throw encoderError;

  const bytes = muxMp4({ width: W, height: H, timescale, avcC, samples });
  return new Blob([bytes], { type: "video/mp4" });
}
