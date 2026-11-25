/**
 * Public Pack SDK for `dislop` (`import { definePack, definePackScripts, maskInlineCode } from 'dislop/sdk'`).
 *
 * @typedef {'md' | 'mdx' | 'txt' | 'html' | 'css' | 'jsx' | 'tsx' | 'svg' | 'docx' | 'pptx' | 'pdf' | 'png' | 'jpg' | 'jpeg' | 'webp' | 'gif' | string} DocumentFormat
 * @typedef {'prose' | 'markup' | 'stylesheet' | 'vector' | 'document' | 'presentation' | 'image' | string} DocumentModality
 * @typedef {'error' | 'warning'} DefectSeverity
 * @typedef {'strong' | 'moderate' | 'hint'} SuggestionPriority
 * @typedef {'safe' | 'review' | 'manual'} FixSafety
 * @typedef {'replace' | 'delete' | 'prompt'} ActionType
 */

export const SUPPORTED_FORMATS = Object.freeze([
  "md",
  "mdx",
  "txt",
  "html",
  "css",
  "jsx",
  "tsx",
  "svg",
  "docx",
  "pptx",
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
]);

export const VALID_DEFECT_SEVERITIES = Object.freeze(["error", "warning"]);
export const VALID_SUGGESTION_PRIORITIES = Object.freeze(["strong", "moderate", "hint"]);
export const VALID_FIX_SAFETIES = Object.freeze(["safe", "review", "manual"]);
export const VALID_ACTION_TYPES = Object.freeze(["replace", "delete", "prompt"]);

const PACK_NAME_RE = /^[a-z0-9][a-z0-9./_-]{0,95}$/i;

/**
 * Replace inline code spans (`...`) with equal-length spaces so regex checks on prose segments
 * never false-positive on documented syntax while keeping 1:1 character offsets.
 * @param {string} text
 * @returns {string}
 */
export function maskInlineCode(text) {
  return String(text || "").replace(/`+[^`]+`+/g, (m) => " ".repeat(m.length));
}

/**
 * Define deterministic script hooks (`scripts/index.mjs`) inside a separated Pack directory.
 * Loaded lazily by the kernel ONLY when deterministic `check()` or post-LLM `verifyFix()` is needed.
 *
 * @param {{
 *   appliesTo?: (doc: Object) => boolean,
 *   check?: (doc: Object, ctx: Object) => Promise<void> | void,
 *   verifyFix?: (issue: Object, candidateText: string, doc: Object) => ({ ok: boolean, reason?: string })
 * }} hooks
 */
export function definePackScripts(hooks) {
  if (!hooks || typeof hooks !== "object" || Array.isArray(hooks)) {
    throw new TypeError("definePackScripts: expected an object with script hooks");
  }
  for (const fnKey of ["appliesTo", "check", "verifyFix"]) {
    if (hooks[fnKey] !== undefined && typeof hooks[fnKey] !== "function") {
      throw new TypeError(`definePackScripts: '${fnKey}' must be a function when provided`);
    }
  }
  return Object.freeze({
    __dislopPackScripts: true,
    appliesTo: hooks.appliesTo || null,
    check: hooks.check || null,
    verifyFix: hooks.verifyFix || null,
  });
}

/**
 * Define and validate a programmatic `dislop` Pack plugin (single-file SDK packs).
 */
export function definePack(definition) {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    throw new TypeError("definePack: expected a Pack configuration object");
  }
  const name = typeof definition.name === "string" ? definition.name.trim() : "";
  if (!name || !PACK_NAME_RE.test(name)) {
    throw new TypeError(`definePack: invalid or missing pack 'name' (${JSON.stringify(definition.name)})`);
  }
  const version =
    typeof definition.version === "string" && definition.version.trim()
      ? definition.version.trim()
      : "0.1.0";
  const description = typeof definition.description === "string" ? definition.description.trim() : "";

  let languages = null;
  if (definition.languages !== undefined) {
    if (!Array.isArray(definition.languages) || definition.languages.some((l) => typeof l !== "string")) {
      throw new TypeError(`definePack(${name}): 'languages' must be an array of strings`);
    }
    languages = Object.freeze(definition.languages.map((l) => l.trim().toLowerCase()).filter(Boolean));
  }

  let formats = null;
  if (definition.formats !== undefined) {
    if (!Array.isArray(definition.formats) || definition.formats.some((f) => typeof f !== "string")) {
      throw new TypeError(`definePack(${name}): 'formats' must be an array of format strings`);
    }
    formats = Object.freeze(
      definition.formats.map((f) => f.trim().toLowerCase().replace(/^\./, "")).filter(Boolean),
    );
  }

  let modalities = null;
  if (definition.modalities !== undefined) {
    if (!Array.isArray(definition.modalities) || definition.modalities.some((m) => typeof m !== "string")) {
      throw new TypeError(`definePack(${name}): 'modalities' must be an array of modality strings`);
    }
    modalities = Object.freeze(definition.modalities.map((m) => m.trim().toLowerCase()).filter(Boolean));
  }

  for (const fnKey of ["appliesTo", "check", "resolvePrompt", "verifyFix"]) {
    if (definition[fnKey] !== undefined && typeof definition[fnKey] !== "function") {
      throw new TypeError(`definePack(${name}): '${fnKey}' must be a function when provided`);
    }
  }

  return Object.freeze({
    __dislopPack: true,
    name,
    version,
    description,
    languages,
    formats,
    modalities,
    appliesTo: definition.appliesTo || null,
    check: definition.check || null,
    resolvePrompt: definition.resolvePrompt || null,
    verifyFix: definition.verifyFix || null,
  });
}
