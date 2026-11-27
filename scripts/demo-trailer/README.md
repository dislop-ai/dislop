# dislop 20s Demo Trailer Generator

Zero-dependency browser renderer for silent 20-second `1920x1080` MP4 clips using Canvas 2D and WebCodecs H.264.

## Run locally

Start a local static server from the repository root:

```bash
python3 -m http.server 8765
```

Open `http://127.0.0.1:8765/scripts/demo-trailer/index.html` in a WebCodecs-capable browser (Chrome or Edge). Scrub frames to inspect Frame 0 through the end card, then select **Render 1080p MP4** and **Download MP4**.

## Edit shots

Update [storyboard.mjs](./storyboard.mjs) to change the sample draft, highlighted spans, protected numbers, or timing. Keep the explicit `EXAMPLE` badge on constructed snippets and keep Frame 0 crisp with no progress bar at the bottom.
