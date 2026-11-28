import fs from "node:fs";

const pkg = JSON.parse(
  fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
);

export const DISLOP_VERSION = String(pkg.version || "1.1.2");
