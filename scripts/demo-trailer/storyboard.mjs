// Editable 20-second (600-frame, 1920x1080 @ 30fps) storyboard for the dislop demo trailer.
// Visual tokens follow docs/brand-and-voice-guide.md and docs/brand/voice.json.

export const W = 1920;
export const H = 1080;
export const FPS = 30;
export const TOTAL_SECONDS = 20;
export const TOTAL_FRAMES = FPS * TOTAL_SECONDS;

export const TOKENS = {
  stageBg: "#14171A",
  stageEdge: "#252B33",
  sheetBg: "#FFFFFF",
  sheetBorder: "#D9DEE3",
  ink: "#14171A",
  inkMuted: "#55606E",
  paperBar: "#F6F7F5",
  deleRed: "#F04438",
  defectInk: "#B42318",
  defectWash: "#FEF3F2",
  warningInk: "#175CD3",
  warningLine: "#2E90FA",
  warningWash: "#EFF4FF",
  passInk: "#067647",
  passWash: "#ECFDF3",
  passBorder: "#ABEFC6",
};

export const STORYBOARD = {
  badge: "EXAMPLE",
  fileLabel: "draft.md",
  shots: [
    {
      id: "draft",
      startSec: 0.0,
      endSec: 4.5,
      headline: "AI drafts leave hidden bugs and stock phrasing",
      command: "",
      lines: [
        {
          text: "Certainly, here is a polished release note for v2.4.",
          kind: "wrapper",
          tag: null,
        },
        {
          text: "Deploy latency fell from 42 ms to 14 ms across 312 KB bundles with 99.94% uptime.",
          kind: "facts",
          tag: null,
        },
        {
          text: "Read the steps in [TODO: add upgrade link] before updating.",
          kind: "todo",
          tag: null,
        },
        {
          text: "It is not just faster; it is a seamless leap in team velocity.",
          kind: "cliche",
          tag: null,
        },
      ],
      statusBar: "Unchecked markdown draft",
    },
    {
      id: "check",
      startSec: 4.5,
      endSec: 10.5,
      headline: "Deterministic checks catch hard bugs, style warnings stay non-blocking",
      command: "npx --yes dislop check draft.md --no-llm",
      lines: [
        {
          text: "Certainly, here is a polished release note for v2.4.",
          kind: "wrapper",
          mark: "dele",
          tag: "hard bug · exit 1",
        },
        {
          text: "Deploy latency fell from 42 ms to 14 ms across 312 KB bundles with 99.94% uptime.",
          kind: "facts",
          mark: null,
          tag: null,
        },
        {
          text: "Read the steps in [TODO: add upgrade link] before updating.",
          kind: "todo",
          mark: "defect",
          span: "[TODO: add upgrade link]",
          tag: "hard bug · exit 1",
        },
        {
          text: "It is not just faster; it is a seamless leap in team velocity.",
          kind: "cliche",
          mark: "warning",
          span: "It is not just faster; it is a seamless leap in team velocity.",
          tag: "warning · exit 0",
        },
      ],
      statusBar: "2 hard bugs (exit 1) · 1 warning (exit 0) · 0 network uploads",
    },
    {
      id: "verify",
      startSec: 10.5,
      endSec: 16.0,
      headline: "After edits, dislop verify confirms numbers and links stayed intact",
      command: "npx --yes dislop verify --git HEAD draft.md",
      lines: [
        {
          text: "Release v2.4 cuts deploy latency and trims client bundle weight.",
          kind: "clean",
          mark: null,
          tag: null,
        },
        {
          text: "Deploy latency fell from 42 ms to 14 ms across 312 KB bundles with 99.94% uptime.",
          kind: "facts",
          mark: "verified",
          tag: "numbers intact",
        },
        {
          text: "Read the steps in docs/upgrade.md before updating.",
          kind: "clean",
          mark: "verified",
          tag: "link intact",
        },
      ],
      verifiedTokens: ["42 ms", "14 ms", "312 KB", "99.94%", "docs/upgrade.md"],
      statusBar: "passed · 0 hard bugs · 0 warnings · 5 protected spans intact",
    },
    {
      id: "end",
      startSec: 16.0,
      endSec: 20.0,
      slogan: "Cutting AI slop is real productivity.",
      command: "npx --yes dislop check .",
      url: "dislop.com · Apache-2.0",
    },
  ],
};

export function shotAtTime(tSec) {
  const clamped = Math.max(0, Math.min(TOTAL_SECONDS - 1e-6, tSec));
  for (const shot of STORYBOARD.shots) {
    if (clamped >= shot.startSec && clamped < shot.endSec) {
      const duration = shot.endSec - shot.startSec;
      return {
        shot,
        localSec: clamped - shot.startSec,
        progress: (clamped - shot.startSec) / duration,
      };
    }
  }
  const last = STORYBOARD.shots[STORYBOARD.shots.length - 1];
  return { shot: last, localSec: 0, progress: 1 };
}
