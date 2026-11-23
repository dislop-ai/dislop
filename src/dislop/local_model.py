"""
Hardware-aware Local Model Manager & Loopback Self-Healing Runner (`dislop.local-model/1`).
Zero external dependencies:
  - Bundled Default: `pocket-slop-v1.json` (~15 KB gz, 0 network, <0.5 ms)
  - Optional Local SLMs (`fast` | `balanced` | `quality`): 0.6B / 1.7B / 4B GGUF tiers
    with hardware guardrails, SHA-256 confined import, loopback-only no-proxy HTTP/TLS
    enforcement, and unit-aware `verify_revision` fact-lock fallback.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import platform
import re
import secrets
import shutil
import subprocess
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path
from typing import Any

from .engine import audit_text, extract_protected_facts, get_scenario_strategy, verify_revision
from .pocket_model import load_pocket_model_bundle, score_pocket_span

_HERE = Path(__file__).resolve().parent
_MANIFEST_CANDIDATES = [
    _HERE.parent.parent / "models" / "manifest.json",
    _HERE / "models" / "manifest.json",
]

VALID_PROVIDERS = {"ollama", "gguf"}

LOCAL_MODEL_TIERS: dict[str, dict[str, Any]] = {
    "none": {
        "tier": "none",
        "kind": "bundled-only",
        "modelId": None,
        "approxDownloadMb": 0,
        "minRamGb": 0,
        "minFreeDiskGb": 0,
        "license": "Apache-2.0",
        "summary": {
            "en": "Built-in deterministic engine + bundled 15 KB Pocket ML ensemble (all 7 rule packs + 53 patterns + 5-axis telemetry included, 0 MB extra download).",
            "zh": "仅使用随包内置的确定性引擎与 15 KB 传统集成模型（含全部 7 套规则包、53 条模式与 5 轴统计，无需额外下载）。",
        },
        "installHint": None,
    },
    "fast": {
        "tier": "fast",
        "kind": "local-slm-gguf",
        "modelId": "qwen3:0.6b",
        "approxDownloadMb": 520,
        "minRamGb": 8,
        "minFreeDiskGb": 2.0,
        "license": "Apache-2.0",
        "summary": {
            "en": "Compact 0.6B bilingual model (~520 MB) for grey-zone filler triage on 8 GB CPU machines.",
            "zh": "轻量 0.6B 双语小模型（约 520 MB），适合 8 GB 内存笔记本做灰区空话辅助复核。",
        },
        "installHint": "dislop model install --tier fast",
    },
    "balanced": {
        "tier": "balanced",
        "kind": "local-slm-gguf",
        "modelId": "qwen3:1.7b",
        "approxDownloadMb": 1300,
        "minRamGb": 8,
        "minFreeDiskGb": 3.0,
        "license": "Apache-2.0",
        "summary": {
            "en": "Balanced 1.7B bilingual model (~1.3 GB) for local structural review on 8 GB Apple Silicon or 16 GB RAM.",
            "zh": "均衡 1.7B 双语小模型（约 1.3 GB），适合 8 GB Apple Silicon 或 16 GB 内存设备离线审校与锁数字改写。",
        },
        "installHint": "dislop model install --tier balanced",
    },
    "quality": {
        "tier": "quality",
        "kind": "local-slm-gguf",
        "modelId": "qwen3:4b",
        "approxDownloadMb": 2500,
        "minRamGb": 16,
        "minFreeDiskGb": 5.0,
        "license": "Apache-2.0",
        "summary": {
            "en": "High-precision 4B bilingual model (~2.5 GB) for local review & fact-locked paragraph cleanup on >= 16 GB Apple Silicon / GPU.",
            "zh": "高精度 4B 双语小模型（约 2.5 GB），适合 >= 16 GB Apple Silicon 或独显机器做本地深度审校与锁数字改写。",
        },
        "installHint": "dislop model install --tier quality",
    },
}


def load_models_manifest() -> dict[str, Any]:
    for p in _MANIFEST_CANDIDATES:
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8"))
    return {"schema": "dislop.models-manifest/1", "version": "1.0.0", "bundled": [], "optionalTiers": LOCAL_MODEL_TIERS}


def get_model_cache_dir(override_dir: str | Path | None = None) -> Path:
    if override_dir is not None:
        return Path(override_dir).resolve()
    env_dir = os.environ.get("DISLOP_MODEL_DIR")
    if env_dir:
        return Path(env_dir).resolve()
    if platform.system().lower() == "linux" and os.environ.get("XDG_CACHE_HOME"):
        return Path(os.environ["XDG_CACHE_HOME"]) / "dislop" / "models"
    return Path.home() / ".cache" / "dislop" / "models"


def _read_registry(cache_dir: Path) -> dict[str, Any]:
    reg_path = cache_dir / "registry.json"
    if not reg_path.exists():
        return {"version": 1, "models": []}
    try:
        parsed = json.loads(reg_path.read_text(encoding="utf-8"))
        return parsed if isinstance(parsed.get("models"), list) else {"version": 1, "models": []}
    except Exception:
        return {"version": 1, "models": []}


def _write_registry(cache_dir: Path, reg: dict[str, Any]) -> None:
    cache_dir.mkdir(parents=True, exist_ok=True)
    real_cache = cache_dir.resolve()
    reg_path = real_cache / "registry.json"
    if reg_path.is_symlink():
        raise ValueError("Refusing to write registry.json through a symbolic link.")
    tmp_path = real_cache / f".registry.{secrets.token_hex(6)}.tmp"
    fd = os.open(str(tmp_path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        os.write(fd, (json.dumps(reg, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    finally:
        os.close(fd)
    tmp_path.replace(reg_path)


def list_installed_models(cache_dir: str | Path | None = None) -> list[dict[str, Any]]:
    resolved = get_model_cache_dir(cache_dir)
    reg = _read_registry(resolved)
    out: list[dict[str, Any]] = []
    for entry in reg["models"]:
        exists = True if entry.get("provider") == "ollama" else bool(entry.get("path") and Path(entry["path"]).exists())
        out.append({**entry, "exists": exists})
    return out


def _detect_total_memory_gb() -> float:
    try:
        if hasattr(os, "sysconf") and "SC_PAGE_SIZE" in os.sysconf_names and "SC_PHYS_PAGES" in os.sysconf_names:
            total_bytes = int(os.sysconf("SC_PAGE_SIZE")) * int(os.sysconf("SC_PHYS_PAGES"))
            return round(total_bytes / (1024**3), 1)
    except Exception:
        pass
    return 8.0


def _clean_num(v: float | int | None) -> float | int | None:
    if v is None:
        return None
    return int(v) if isinstance(v, float) and v.is_integer() else v


def probe_hardware(overrides: dict[str, Any] | None = None) -> dict[str, Any]:
    if overrides is not None:
        return dict(overrides)
    sys_name = platform.system().lower()
    plat = "darwin" if sys_name == "darwin" else ("win32" if sys_name.startswith("win") else sys_name)
    mach = platform.machine().lower()
    arch = "arm64" if mach in {"arm64", "aarch64"} else ("x64" if mach in {"x86_64", "amd64"} else mach)
    cpu_count = os.cpu_count() or 1
    cpu_model = platform.processor() or mach or "unknown"
    total_gb = _clean_num(_detect_total_memory_gb())
    ci_val = os.environ.get("CI", "")
    is_ci = bool(ci_val and ci_val not in {"0", "false"})
    is_apple_silicon = plat == "darwin" and arch == "arm64"

    free_disk_gb: float | int | None = None
    try:
        du = shutil.disk_usage(Path.home())
        free_disk_gb = _clean_num(round(du.free / (1024**3), 1))
    except Exception:
        free_disk_gb = None

    usable_gb = _clean_num(round(float(total_gb) * (0.62 if is_apple_silicon else 0.38), 1))
    return {
        "platform": plat,
        "arch": arch,
        "cpuModel": cpu_model,
        "cpuCount": cpu_count,
        "totalMemoryGb": total_gb,
        "usableModelMemoryGb": usable_gb,
        "freeDiskGb": free_disk_gb,
        "isAppleSilicon": is_apple_silicon,
        "isCi": is_ci,
    }


def recommend_model_tier(hw: dict[str, Any]) -> dict[str, Any]:
    free_disk = hw.get("freeDiskGb")
    total_gb = float(hw.get("totalMemoryGb", 0))
    usable_gb = hw.get("usableModelMemoryGb", 0)
    if hw.get("isCi") or total_gb < 8 or (free_disk is not None and free_disk < 2.0):
        if hw.get("isCi"):
            reason = {
                "en": "CI environment detected; keep fast zero-download deterministic + bundled 15 KB Pocket ML checks.",
                "zh": "检测到 CI 流水线环境，直接使用内置规则引擎与 15 KB 传统集成模型最快最稳。",
            }
        elif free_disk is not None and free_disk < 2.0:
            reason = {
                "en": f"Low free disk space ({free_disk} GB); skipping multi-hundred-MB model weights (bundled 15 KB Pocket ML is already active).",
                "zh": f"剩余磁盘空间较少（{free_disk} GB），跳过百 MB 级模型下载（内置 15 KB 传统集成模型已就绪）。",
            }
        else:
            reason = {
                "en": f"System RAM ({total_gb} GB) is below 8 GB; built-in rules + 15 KB Pocket ML run in < 5ms with 0 extra memory.",
                "zh": f"当前内存（{total_gb} GB）低于 8 GB，内置规则包与 15 KB 传统集成模型已可完整离线工作。",
            }
        return {**LOCAL_MODEL_TIERS["none"], "reason": reason}

    if hw.get("isAppleSilicon") and total_gb >= 16 and (free_disk is None or free_disk >= 5.0):
        return {
            **LOCAL_MODEL_TIERS["quality"],
            "reason": {
                "en": f"Apple Silicon with {total_gb} GB unified memory (~{usable_gb} GB model budget) comfortably runs 4B Q4_K_M locally.",
                "zh": f"检测到 {total_gb} GB 统一内存的 Apple Silicon（可用模型预算约 {usable_gb} GB），可流畅选装 4B 本地小模型。",
            },
        }

    if (hw.get("isAppleSilicon") and total_gb >= 8) or total_gb >= 16:
        return {
            **LOCAL_MODEL_TIERS["balanced"],
            "reason": {
                "en": f"{total_gb} GB RAM fits the 1.7B Q4_K_M tier (~1.3 GB) without starving IDE/browser memory.",
                "zh": f"{total_gb} GB 内存适合选装 1.7B 均衡档（约 1.3 GB），兼顾响应速度与日常开发内存余量。",
            },
        }

    return {
        **LOCAL_MODEL_TIERS["fast"],
        "reason": {
            "en": f"{total_gb} GB CPU system matches the lightweight 0.6B tier (~520 MB).",
            "zh": f"{total_gb} GB 内存通用机型建议选装轻量 0.6B 档（约 520 MB），避免拖慢系统。",
        },
    }


class _LoopbackNoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(
        self, req: urllib.request.Request, fp: Any, code: int, msg: str, headers: Any, newurl: str
    ) -> urllib.request.Request | None:
        raise urllib.error.HTTPError(req.full_url, code, f"Loopback redirect blocked ({code})", headers, fp)


# Bypass HTTP_PROXY / HTTPS_PROXY and disallow HTTP redirects on loopback requests so drafts never leak externally
_NO_PROXY_OPENER = urllib.request.build_opener(
    urllib.request.ProxyHandler({}),
    _LoopbackNoRedirectHandler(),
)


def _open_url_safe(req: urllib.request.Request | str, *, timeout_sec: float, bypass_proxy: bool) -> Any:
    if bypass_proxy:
        return _NO_PROXY_OPENER.open(req, timeout=timeout_sec)
    return urllib.request.urlopen(req, timeout=timeout_sec)


def _probe_loopback_json(port: int, url_path: str, timeout_sec: float = 0.25) -> dict[str, Any] | None:
    url = f"http://127.0.0.1:{port}{url_path}"
    try:
        with _open_url_safe(url, timeout_sec=timeout_sec, bypass_proxy=True) as resp:
            if resp.status != 200:
                return None
            return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None


def discover_local_runners(timeout_sec: float = 0.25) -> list[dict[str, Any]]:
    runners: list[dict[str, Any]] = []
    ollama = _probe_loopback_json(11434, "/api/tags", timeout_sec)
    if isinstance(ollama, dict) and isinstance(ollama.get("models"), list):
        runners.append({
            "kind": "ollama",
            "endpoint": "http://127.0.0.1:11434",
            "models": [str(m.get("name")) for m in ollama["models"][:20] if isinstance(m, dict) and m.get("name")],
        })
    llama_srv = _probe_loopback_json(8080, "/v1/models", timeout_sec)
    if isinstance(llama_srv, dict) and isinstance(llama_srv.get("data"), list):
        runners.append({
            "kind": "openai-compatible-local",
            "endpoint": "http://127.0.0.1:8080",
            "models": [str(m.get("id")) for m in llama_srv["data"][:20] if isinstance(m, dict) and m.get("id")],
        })
    return runners


def build_model_status_report(
    *,
    packs_count: int = 7,
    rules_count: int = 42,
    probe_loopback: bool = True,
    hw_overrides: dict[str, Any] | None = None,
    cache_dir: str | Path | None = None,
) -> dict[str, Any]:
    hw = probe_hardware(hw_overrides)
    rec = recommend_model_tier(hw)
    runners = discover_local_runners() if probe_loopback else []
    bundle = load_pocket_model_bundle()
    manifest = load_models_manifest()
    resolved_cache = get_model_cache_dir(cache_dir)
    installed = list_installed_models(resolved_cache)

    bundled_kb = 15
    if manifest.get("bundled"):
        bundled_kb = manifest["bundled"][0].get("approxGzipKb", 15)

    return {
        "schema": "dislop.local-model/1",
        "builtinDeterministic": {
            "ready": True,
            "bundledPacks": packs_count,
            "bundledRules": rules_count,
            "networkCallsDuringCheck": 0,
        },
        "bundledModels": [
            {
                "id": "pocket-slop-v1",
                "schema": bundle["schema"],
                "version": bundle["version"],
                "ready": True,
                "approxGzipKb": bundled_kb,
                "runtimeDeps": "none",
                "heads": ["pocket-slop-ensemble", "pocket-pack-router"],
            }
        ],
        "modelCacheDir": str(resolved_cache),
        "installedModels": installed,
        "hardware": hw,
        "recommendation": rec,
        "localRunners": runners,
    }


def _has_ollama_cli() -> bool:
    return shutil.which("ollama") is not None


def install_optional_model(
    *,
    tier: str = "auto",
    provider: str = "ollama",
    force: bool = False,
    dry_run: bool = False,
    cache_dir: str | Path | None = None,
    hw_overrides: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if provider not in VALID_PROVIDERS:
        return {
            "ok": False,
            "error": f"Unknown provider '{provider}'. Supported providers: ollama, gguf.",
        }
    hw = probe_hardware(hw_overrides)
    rec = recommend_model_tier(hw)
    resolved_tier = rec["tier"] if tier == "auto" else tier
    spec = LOCAL_MODEL_TIERS.get(resolved_tier)
    if not spec:
        return {
            "ok": False,
            "error": f"Unknown model tier '{resolved_tier}'. Choose one of: none, fast, balanced, quality, auto.",
        }

    resolved_cache = get_model_cache_dir(cache_dir)

    if resolved_tier == "none":
        return {
            "ok": True,
            "action": "none",
            "tier": "none",
            "modelId": None,
            "bundledReady": True,
            "message": {
                "en": "Built-in deterministic rules and bundled 15 KB Pocket ML suite are already installed and ready.",
                "zh": "内置规则包与随包 15 KB 传统集成模型已就绪，无需额外下载大体积权重。",
            },
        }

    min_ram = float(spec.get("minRamGb") or 0)
    min_disk = float(spec.get("minFreeDiskGb") or 0)
    total_gb = float(hw.get("totalMemoryGb", 0))
    free_disk = hw.get("freeDiskGb")
    ram_too_low = total_gb < min_ram
    disk_too_low = free_disk is not None and float(free_disk) < min_disk

    if (ram_too_low or disk_too_low) and not force:
        if ram_too_low:
            reason_en = f"Tier '{resolved_tier}' (~{spec['approxDownloadMb']} MB) requires >= {int(min_ram)} GB RAM, but this machine has {hw['totalMemoryGb']} GB."
            reason_zh = f"档位「{resolved_tier}」（约 {spec['approxDownloadMb']} MB）建议至少 {int(min_ram)} GB 内存，当前设备为 {hw['totalMemoryGb']} GB。"
        else:
            reason_en = f"Tier '{resolved_tier}' requires >= {min_disk} GB free disk, but only {free_disk} GB is available."
            reason_zh = f"档位「{resolved_tier}」需要至少 {min_disk} GB 可用磁盘空间，当前仅剩 {free_disk} GB。"
        return {
            "ok": False,
            "blockedByHardware": True,
            "tier": resolved_tier,
            "recommendedTier": rec["tier"],
            "warning": {
                "en": f"{reason_en} Recommended tier: '{rec['tier']}'. Pass --force to override.",
                "zh": f"{reason_zh} 当前推荐档位：「{rec['tier']}」。如仍需安装请加 --force。",
            },
        }

    planned_cmd = (
        f"dislop model import <file.gguf> --tier {resolved_tier}"
        if provider == "gguf"
        else f"ollama pull {spec['modelId']}"
    )

    if dry_run:
        return {
            "ok": True,
            "dryRun": True,
            "tier": resolved_tier,
            "modelId": spec["modelId"],
            "provider": provider,
            "approxDownloadMb": spec["approxDownloadMb"],
            "modelCacheDir": str(resolved_cache),
            "command": planned_cmd,
            "hardwareCheck": "forced-override" if (ram_too_low or disk_too_low) else "passed",
        }

    if provider == "gguf":
        return {
            "ok": False,
            "missingWeights": True,
            "tier": resolved_tier,
            "modelId": spec["modelId"],
            "message": {
                "en": f"Pass a local GGUF file to import with SHA-256 verification: 'dislop model import <file.gguf> --tier {resolved_tier}'.",
                "zh": f"请指定本地 GGUF 权重文件执行离线校验导入：'dislop model import <file.gguf> --tier {resolved_tier}'。",
            },
        }

    if not _has_ollama_cli():
        return {
            "ok": False,
            "missingRunner": True,
            "tier": resolved_tier,
            "modelId": spec["modelId"],
            "message": {
                "en": f"Local runner 'ollama' was not found in PATH. Install Ollama (https://ollama.com) or import an offline GGUF weight file via 'dislop model import <file.gguf> --tier {resolved_tier}'.",
                "zh": f"未在 PATH 中检测到 ollama。可先安装 Ollama，或在内网离线环境通过 'dislop model import <file.gguf> --tier {resolved_tier}' 直接导入权重文件。",
            },
        }

    proc = subprocess.run(["ollama", "pull", spec["modelId"]], check=False)
    if proc.returncode != 0:
        return {
            "ok": False,
            "tier": resolved_tier,
            "modelId": spec["modelId"],
            "error": f"ollama pull {spec['modelId']} exited with code {proc.returncode}",
        }

    reg = _read_registry(resolved_cache)
    reg["models"] = [m for m in reg["models"] if not (m.get("tier") == resolved_tier and m.get("provider") == "ollama")]
    reg["models"].append({
        "id": spec["modelId"],
        "tier": resolved_tier,
        "provider": "ollama",
        "path": None,
        "sizeBytes": int(spec["approxDownloadMb"]) * 1024 * 1024,
        "sha256": None,
        "installedAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
    })
    _write_registry(resolved_cache, reg)
    return {
        "ok": True,
        "tier": resolved_tier,
        "modelId": spec["modelId"],
        "provider": "ollama",
        "modelCacheDir": str(resolved_cache),
    }


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def import_local_model_file(
    *,
    file_path: str | Path,
    tier: str = "custom",
    expected_sha256: str | None = None,
    copy_file: bool = True,
    cache_dir: str | Path | None = None,
) -> dict[str, Any]:
    src_abs = Path(file_path).resolve()
    if not src_abs.is_file():
        return {"ok": False, "error": f"Model file not found: {file_path}"}
    file_name = src_abs.name
    ext = src_abs.suffix.lower()
    if file_name.lower() == "registry.json" or ext not in {".gguf", ".onnx", ".bin"}:
        return {"ok": False, "error": f"Unsupported model file '{file_name}' (expected .gguf, .onnx, or .bin)."}

    actual_sha = _sha256_file(src_abs)
    if expected_sha256 and actual_sha.lower() != expected_sha256.strip().lower():
        return {
            "ok": False,
            "reason": "sha256-mismatch",
            "expectedSha256": expected_sha256.strip().lower(),
            "actualSha256": actual_sha,
            "error": f"SHA-256 mismatch for {file_name}",
        }

    resolved_cache = get_model_cache_dir(cache_dir)
    resolved_cache.mkdir(parents=True, exist_ok=True)
    real_cache = resolved_cache.resolve()
    dest_abs = (real_cache / file_name) if copy_file else src_abs

    if copy_file and src_abs != dest_abs:
        if dest_abs.is_symlink():
            return {"ok": False, "error": f"Refusing to overwrite symbolic link in model cache: {dest_abs}"}
        tmp_dest = real_cache / f".{file_name}.{secrets.token_hex(6)}.part"
        fd = os.open(str(tmp_dest), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with src_abs.open("rb") as src_f:
                while True:
                    chunk = src_f.read(65536)
                    if not chunk:
                        break
                    os.write(fd, chunk)
        except Exception:
            os.close(fd)
            if tmp_dest.exists():
                tmp_dest.unlink()
            raise
        else:
            os.close(fd)
        tmp_dest.replace(dest_abs)

    size_bytes = dest_abs.stat().st_size
    reg = _read_registry(real_cache)
    reg["models"] = [m for m in reg["models"] if m.get("id") != file_name and m.get("path") != str(dest_abs)]
    entry = {
        "id": file_name,
        "tier": tier,
        "provider": "onnx-file" if ext == ".onnx" else "gguf-file",
        "path": str(dest_abs),
        "sizeBytes": size_bytes,
        "sha256": actual_sha,
        "installedAt": dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    reg["models"].append(entry)
    _write_registry(real_cache, reg)
    return {
        "ok": True,
        "modelCacheDir": str(real_cache),
        "imported": entry,
    }


def remove_installed_model(*, target: str, cache_dir: str | Path | None = None) -> dict[str, Any]:
    resolved_cache = get_model_cache_dir(cache_dir)
    if not resolved_cache.exists():
        return {"ok": False, "error": f"No cached models found in {resolved_cache}"}
    real_cache = resolved_cache.resolve()
    reg = _read_registry(real_cache)
    key = str(target or "").strip()
    if not key:
        return {"ok": False, "error": "Specify a tier or model id to remove."}
    removed: list[dict[str, Any]] = []
    kept: list[dict[str, Any]] = []
    for m in reg["models"]:
        if m.get("tier") == key or m.get("id") == key:
            if m.get("provider") == "ollama" and m.get("id") and _has_ollama_cli():
                subprocess.run(["ollama", "rm", str(m["id"])], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
            p_str = m.get("path")
            if p_str:
                try:
                    raw_p = Path(p_str)
                    base_name = raw_p.name
                    if raw_p.parent.exists() and raw_p.parent.resolve() == real_cache and base_name != "registry.json":
                        safe_target = real_cache / base_name
                        if safe_target.is_symlink() or safe_target.is_file():
                            safe_target.unlink()
                except Exception:
                    pass
            removed.append(m)
        else:
            kept.append(m)
    _write_registry(real_cache, {"version": 1, "models": kept})
    return {"ok": len(removed) > 0, "removedCount": len(removed), "removed": removed}


def assert_safe_local_endpoint(endpoint_url: str, *, allow_lan: bool = False) -> tuple[urllib.parse.ParseResult, bool]:
    parsed = urllib.parse.urlparse(endpoint_url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError(f"Invalid local model endpoint URL: {endpoint_url}")
    host = parsed.hostname.lower().strip("[]")
    is_loopback = host in {"127.0.0.1", "localhost", "::1"}
    if not is_loopback and not allow_lan:
        raise ValueError(
            f"Refusing non-loopback endpoint '{host}' in --local mode (data must stay on 127.0.0.1). Pass --allow-lan only for trusted intranet servers."
        )
    return parsed, is_loopback


def _call_local_chat_completion(
    *,
    endpoint: str,
    kind: str,
    model: str,
    system_prompt: str,
    user_prompt: str,
    timeout_sec: float = 30.0,
    allow_lan: bool = False,
) -> str:
    _, is_loopback = assert_safe_local_endpoint(endpoint, allow_lan=allow_lan)
    base = endpoint.rstrip("/")
    if kind == "ollama":
        url = f"{base}/api/chat"
        payload = {
            "model": model,
            "stream": False,
            "think": False,
            "options": {"temperature": 0.2, "num_ctx": 4096},
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with _open_url_safe(req, timeout_sec=timeout_sec, bypass_proxy=is_loopback or not allow_lan) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        content = str((data.get("message") or {}).get("content") or "")
        return re.sub(r"<think>[\s\S]*?</think>", "", content, flags=re.I).strip()

    url = f"{base}/v1/chat/completions"
    payload = {
        "model": model or "local-model",
        "temperature": 0.2,
        "max_tokens": 1024,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with _open_url_safe(req, timeout_sec=timeout_sec, bypass_proxy=is_loopback or not allow_lan) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    choices = data.get("choices") or []
    content = str(((choices[0].get("message") or {}).get("content") if choices else "") or "")
    return re.sub(r"<think>[\s\S]*?</think>", "", content, flags=re.I).strip()


UNIT_EXTRACT_RE = re.compile(
    r"([0-9][0-9,]*(?:\.[0-9]+)?)\s*(%|ms|sec|seconds?|s|mins?|minutes?|hrs?|hours?|days?|kb|mb|gb|tb|qps|tps|rps|fps|px|毫秒|秒|分钟|小时|个月|天|年|倍|万|亿|美元|元|次|个|条|份|页|行|人|席)",
    re.I,
)


def _canonicalize_unit(u: str) -> str:
    low = str(u or "").lower()
    if low in {"s", "sec", "second", "seconds", "秒"}:
        return "s"
    if low in {"ms", "毫秒"}:
        return "ms"
    if low in {"min", "mins", "minute", "minutes", "分钟"}:
        return "min"
    if low in {"hr", "hrs", "hour", "hours", "小时"}:
        return "h"
    if low in {"day", "days", "天"}:
        return "d"
    return low


def _extract_number_unit_multiset(text: str) -> Counter[str]:
    counts: Counter[str] = Counter()
    for m in UNIT_EXTRACT_RE.finditer(str(text or "")):
        num = m.group(1).replace(",", "")
        unit = _canonicalize_unit(m.group(2))
        counts[f"{num}:{unit}"] += 1
    return counts


def verify_facts_with_units(before_text: str, after_text: str, *, modality: str = "markdown") -> dict[str, Any]:
    ledger = verify_revision(before_text, after_text, modality=modality, allow_added=False)
    before_units = _extract_number_unit_multiset(before_text)
    after_units = _extract_number_unit_multiset(after_text)
    unit_mismatches = [k for k, cnt in before_units.items() if after_units[k] < cnt]
    return {
        "ok": ledger["status"] == "preserved" and not unit_mismatches,
        "ledger": ledger,
        "unitMismatches": unit_mismatches,
    }


def _build_paragraph_deslop_prompt(
    paragraph: str,
    findings: list[dict[str, Any]],
    pocket_score: dict[str, Any],
    protected_facts: list[dict[str, Any]],
    repair_feedback: str | None = None,
    *,
    pack_id: str = "business-brief",
    register: str = "unspecified",
) -> tuple[str, str]:
    is_zh = bool(re.search(r"[\u4e00-\u9fff]", paragraph))
    strategy = get_scenario_strategy(pack_id=pack_id, register=register)
    locked_tokens = [f["raw"] for f in protected_facts]
    rule_notes = [
        f"- {f['ruleId']}: {((f.get('message') or {}).get('zh' if is_zh else 'en')) or f['ruleId']}"
        for f in findings
    ]
    ml_notes = [
        f"- {d['reason']['zh' if is_zh else 'en']}"
        for d in (pocket_score.get("topDrivers") or [])
    ]
    diag = "\n".join((rule_notes + ml_notes)[:5])

    if is_zh:
        sys_p = "\n".join(
            [
                f"你是贴合当前写作场景（{strategy['label']['zh']}）的审改编辑。",
                f"重点清除：{strategy['cut']['zh']}",
                f"必须保留：{strategy['protect']['zh']}",
                f"严禁改偏：{strategy['avoid']['zh']}",
                "只输出改写后的纯正文段落，不加解释、不加引号、不加开头寒暄，严禁编造原句没有的数字，严禁篡改单位，严禁写成『不是……而是……』或三段分号排比。",
            ]
        )
        usr_p = f"请按「{strategy['label']['zh']}」场景要求改净下面段落，保留全部事实含义：\n\n【原段】\n{paragraph}\n"
        if diag:
            usr_p += f"\n【检测到的问题】\n{diag}\n"
        if locked_tokens:
            usr_p += f"\n【必须原样保留的数字、单位、限定词、代码与链接】\n{' 、 '.join(locked_tokens)}\n"
        if repair_feedback:
            usr_p += f"\n【上一版改写未通过核验，请立即修正】\n{repair_feedback}\n"
        return sys_p, usr_p

    sys_p = "\n".join(
        [
            f"You are an editor tuned for {strategy['label']['en']} ({strategy['id']}).",
            f"Cut: {strategy['cut']['en']}",
            f"Protect: {strategy['protect']['en']}",
            f"Avoid: {strategy['avoid']['en']}",
            "Output ONLY the rewritten paragraph text—no preamble, no quotes, no invented numbers, no altered units, no semicolon tricolons, and no 'Not X, but Y' slogans.",
        ]
    )
    usr_p = f"Clean AI slop from this {strategy['label']['en']} paragraph while preserving every fact:\n\n[Original]\n{paragraph}\n"
    if diag:
        usr_p += f"\n[Detected issues]\n{diag}\n"
    if locked_tokens:
        usr_p += f"\n[Must preserve verbatim (numbers, units, qualifiers, inline code, URLs)]\n{' | '.join(locked_tokens)}\n"
    if repair_feedback:
        usr_p += f"\n[Previous rewrite failed verification — fix this]\n{repair_feedback}\n"
    return sys_p, usr_p


_PROTECTED_BLOCK_RE = re.compile(
    r"(<!--\s*dislop-quote-start\s*-->[\s\S]*?<!--\s*dislop-quote-end\s*-->|```[\s\S]*?```|~~~[\s\S]*?~~~)",
    re.I,
)


def _split_document_preserving_protected_blocks(raw: str) -> list[dict[str, Any]]:
    s = str(raw or "")
    tokens: list[dict[str, Any]] = []
    last_idx = 0
    for m in _PROTECTED_BLOCK_RE.finditer(s):
        if m.start() > last_idx:
            tokens.append({"protected": False, "text": s[last_idx : m.start()]})
        tokens.append({"protected": True, "text": m.group(0)})
        last_idx = m.end()
    if last_idx < len(s):
        tokens.append({"protected": False, "text": s[last_idx:]})

    segments: list[dict[str, Any]] = []
    for t in tokens:
        if t["protected"]:
            segments.append(t)
        else:
            for part in re.split(r"(\n\s*\n)", t["text"]):
                if not part:
                    continue
                segments.append({"protected": bool(re.match(r"^\n\s*\n$", part)), "text": part})
    return segments


def _resolve_preferred_model_id(discovered_models: list[str], cache_dir: str | Path | None = None) -> str:
    installed = [m for m in list_installed_models(cache_dir) if m.get("exists")]
    for inst in installed:
        iid = str(inst["id"])
        if iid in discovered_models:
            return iid
        stem = re.sub(r"\.(?:gguf|bin|onnx)$", "", iid, flags=re.I).lower()
        for dm in discovered_models:
            if stem and stem in dm.lower():
                return dm
    if discovered_models:
        return discovered_models[0]
    if installed:
        return str(installed[0]["id"])
    return "qwen3:1.7b"


def run_local_deslop(
    *,
    text: str,
    pack: dict[str, Any],
    modality: str = "markdown",
    register: str | None = None,
    endpoint: str | None = None,
    runner_kind: str | None = None,
    model: str | None = None,
    allow_lan: bool = False,
    timeout_sec: float = 30.0,
    cache_dir: str | Path | None = None,
) -> dict[str, Any]:
    resolved_endpoint = endpoint or os.environ.get("DISLOP_LOCAL_URL") or None
    resolved_kind = runner_kind or None
    resolved_model = model or os.environ.get("DISLOP_LOCAL_MODEL") or None

    if not resolved_endpoint:
        discovered = discover_local_runners(timeout_sec=0.4)
        if not discovered:
            return {
                "ok": False,
                "error": "No active local model daemon found on 127.0.0.1:11434 (Ollama) or 127.0.0.1:8080 (llama-server). Run 'dislop model status' or 'dislop model install'.",
            }
        resolved_endpoint = discovered[0]["endpoint"]
        resolved_kind = discovered[0]["kind"]
        if not resolved_model:
            resolved_model = _resolve_preferred_model_id(discovered[0].get("models") or [], cache_dir)
    else:
        if not resolved_kind:
            resolved_kind = "ollama" if ":11434" in resolved_endpoint else "openai-compatible-local"
        if not resolved_model:
            resolved_model = _resolve_preferred_model_id([], cache_dir)

    assert_safe_local_endpoint(resolved_endpoint, allow_lan=allow_lan)

    raw = str(text or "")
    segments = _split_document_preserving_protected_blocks(raw)
    out_segments: list[str] = []
    paragraph_audits: list[dict[str, Any]] = []
    rewritten_count = 0
    fallback_count = 0

    for item in segments:
        seg = item["text"]
        trimmed = seg.strip()
        if (
            item["protected"]
            or not trimmed
            or trimmed.startswith(("#", "|", "<!--"))
        ):
            out_segments.append(seg)
            continue

        before_audit = audit_text(seg, filename="draft.md", modality=modality, pack=pack, register=register)
        before_pocket = score_pocket_span(seg)
        needs_rewrite = bool(before_audit["findings"]) or (
            before_pocket["eligible"] and before_pocket["slopProbability"] >= 0.65
        )
        if not needs_rewrite:
            out_segments.append(seg)
            continue

        protected_facts = extract_protected_facts(seg, modality=modality)
        accepted: str | None = None
        fallback_reason: str | None = None
        repair_feedback: str | None = None

        for _ in range(2):
            sys_p, usr_p = _build_paragraph_deslop_prompt(
                seg,
                before_audit["findings"],
                before_pocket,
                protected_facts,
                repair_feedback,
                pack_id=str((pack or {}).get("id") or "business-brief"),
                register=str(register or "unspecified"),
            )
            candidate = _call_local_chat_completion(
                endpoint=resolved_endpoint,
                kind=resolved_kind,
                model=resolved_model,
                system_prompt=sys_p,
                user_prompt=usr_p,
                timeout_sec=timeout_sec,
                allow_lan=allow_lan,
            )
            if not candidate:
                fallback_reason = "empty-model-response"
                continue

            fact_check = verify_facts_with_units(seg, candidate, modality=modality)
            after_audit = audit_text(candidate, filename="draft.md", modality=modality, pack=pack, register=register)
            hard_after = [f for f in after_audit["findings"] if f["severity"] in {"error", "warning"}]
            hard_before = [f for f in before_audit["findings"] if f["severity"] in {"error", "warning"}]

            if fact_check["ok"] and len(hard_after) <= len(hard_before) and len(hard_after) == 0:
                accepted = candidate
                break

            reasons: list[str] = []
            if not fact_check["ok"]:
                ledger = fact_check["ledger"]
                missing_items = (
                    [f["raw"] for f in ledger.get("missing", [])]
                    + [f["before"] for f in ledger.get("qualifierDropped", [])]
                    + [f"+{f['raw']}" for f in ledger.get("addedNumbers", [])]
                    + [f"unit:{u}" for u in fact_check["unitMismatches"]]
                )
                reasons.append(f"Fact verification failed ({', '.join(missing_items)})")
            if hard_after:
                reasons.append(f"Residual slop rules triggered ({', '.join(f['ruleId'] for f in hard_after)})")
            fallback_reason = "; ".join(reasons)
            repair_feedback = fallback_reason

        if accepted is not None:
            out_segments.append(accepted)
            rewritten_count += 1
            paragraph_audits.append({
                "status": "rewritten",
                "beforeFindings": len(before_audit["findings"]),
                "beforePocketProb": before_pocket["slopProbability"],
                "afterPocketProb": score_pocket_span(accepted)["slopProbability"],
            })
        else:
            out_segments.append(seg)
            fallback_count += 1
            paragraph_audits.append({
                "status": "kept-original",
                "keptOriginal": True,
                "fallbackReason": fallback_reason or "verification-failed",
            })

    final_text = "".join(out_segments)
    final_check = verify_facts_with_units(raw, final_text, modality=modality)
    if not final_check["ok"]:
        final_text = raw
        fallback_count += rewritten_count
        rewritten_count = 0
        final_check = verify_facts_with_units(raw, final_text, modality=modality)

    return {
        "ok": True,
        "endpoint": resolved_endpoint,
        "runnerKind": resolved_kind,
        "model": resolved_model,
        "rewrittenParagraphs": rewritten_count,
        "keptOriginalParagraphs": fallback_count,
        "factLedgerOk": final_check["ok"],
        "paragraphs": paragraph_audits,
        "text": final_text,
    }
