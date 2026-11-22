// Lazy-loaded Account Hub for dislop.com (HttpOnly session cookie auth,
// multi-key management, MCP OAuth 2.1 connected apps, voice cards, usage metadata, and account deletion).
export function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function copyStr(btn, text, isZh) {
  try {
    await navigator.clipboard.writeText(text);
    const prev = btn.textContent;
    btn.textContent = isZh ? "已复制" : "Copied";
    setTimeout(() => {
      btn.textContent = prev;
    }, 1600);
  } catch {
    // clipboard fallback ignored
  }
}

export async function renderAccountHub({
  rootEl,
  account,
  lang = "zh",
  publicUrl = window.location.origin,
  onAccountUpdated,
  onSignedOut,
  onUseVoice,
}) {
  if (!rootEl || !account) return;
  const isZh = lang === "zh";
  const mcpUrl = `${publicUrl.replace(/\/+$/, "")}/mcp`;

  rootEl.hidden = false;
  rootEl.innerHTML = `<div class="cloud-output-box">${isZh ? "正在加载账号面板…" : "Loading account details..."}</div>`;

  const [keysRes, appsRes, voicesRes, usageRes] = await Promise.all([
    fetch("/api/v1/account/keys", { credentials: "same-origin" }).then((r) => r.json()).catch(() => ({ keys: [] })),
    fetch("/api/v1/account/apps", { credentials: "same-origin" }).then((r) => r.json()).catch(() => ({ apps: [] })),
    fetch("/api/v1/account/voices", { credentials: "same-origin" }).then((r) => r.json()).catch(() => ({ voices: [] })),
    fetch("/api/v1/account/usage?limit=10", { credentials: "same-origin" }).then((r) => r.json()).catch(() => ({ items: [] })),
  ]);

  const keys = Array.isArray(keysRes.keys) ? keysRes.keys : [];
  const apps = Array.isArray(appsRes.apps) ? appsRes.apps : [];
  const voices = Array.isArray(voicesRes.voices) ? voicesRes.voices : [];
  const usageItems = Array.isArray(usageRes.items) ? usageRes.items : [];

  const monthlyQuota = Number(account.monthlyQuota || 30);
  const monthlyRemaining = Number(account.monthlyRemaining ?? account.totalRemaining ?? 0);
  const bonusCredits = Number(account.bonusCredits || 0);
  const totalRemaining = Number(account.totalRemaining ?? monthlyRemaining + bonusCredits);
  const pct = monthlyQuota > 0 ? Math.max(0, Math.min(100, Math.round((monthlyRemaining / monthlyQuota) * 100))) : 0;

  let activeTab = "keys";
  let activeConnectTarget = "oauth";
  let createdKeyBanner = "";
  let actionErrorMsg = "";

  function formatPlanLabel(plan) {
    const p = String(plan || "free").toLowerCase();
    if (p === "pro") return "Pro";
    if (p === "team") return "Team";
    return isZh ? "免费版" : "Free";
  }

  const connectSnippets = {
    oauth: {
      label: isZh ? "OAuth 2.1 免密钥直连" : "OAuth 2.1 Direct",
      hint: isZh
        ? "在支持 MCP OAuth 的桌面端或网页 Agent 中填入服务地址，按弹窗完成登录授权即可："
        : "Paste this URL into any OAuth-enabled MCP client and approve once in your browser:",
      code: mcpUrl,
    },
    claude: {
      label: "Claude Code",
      hint: isZh ? "需在下方新建一枚 API 密钥后替换：" : "Create an API key below and replace YOUR_KEY:",
      code: `claude mcp add --transport http dislop ${mcpUrl} --header "Authorization: Bearer dslp_YOUR_KEY"`,
    },
    cursor: {
      label: "Cursor / Windsurf",
      hint: isZh ? "写入 mcp.json（或使用下方新建密钥时生成的完整 JSON）：" : "Add to mcp.json (or copy the ready JSON right after creating a key):",
      code: JSON.stringify(
        { mcpServers: { "dislop-cloud": { url: mcpUrl, headers: { Authorization: "Bearer dslp_YOUR_KEY" } } } },
        null,
        2
      ),
    },
    codex: {
      label: "Codex",
      hint: isZh ? "添加到 ~/.codex/config.toml：" : "Add to ~/.codex/config.toml:",
      code: `[mcp_servers.dislop]\nurl = "${mcpUrl}"\nhttp_headers = { Authorization = "Bearer dslp_YOUR_KEY" }`,
    },
  };

  function draw() {
    const curConn = connectSnippets[activeConnectTarget] || connectSnippets.oauth;
    rootEl.innerHTML = `
      <div class="hub-card">
        <div class="hub-head">
          <div>
            <div class="hub-email-row">
              <strong>${esc(account.email)}</strong>
              <span class="hub-plan-badge">${esc(formatPlanLabel(account.plan))}</span>
              ${account.googleLinked ? `<span class="hub-meta-tag">Google</span>` : ""}
            </div>
            <div class="hub-quota-line">
              <span>${
                isZh
                  ? `本月剩余 ${esc(monthlyRemaining)} / ${esc(monthlyQuota)} 额度${bonusCredits > 0 ? ` · 永久扩展包 ${esc(bonusCredits)}` : ""}`
                  : `${esc(monthlyRemaining)} / ${esc(monthlyQuota)} monthly credits left${bonusCredits > 0 ? ` · ${esc(bonusCredits)} bonus` : ""}`
              }</span>
            </div>
            <div class="hub-progress-track" aria-hidden="true"><div class="hub-progress-fill" style="width:${pct}%"></div></div>
          </div>
          <div class="quick-actions">
            <button type="button" id="hub-refresh-btn" class="ctrl-btn ctrl-btn-sm">${isZh ? "刷新" : "Refresh"}</button>
            <button type="button" id="hub-logout-btn" class="ctrl-btn ctrl-btn-sm">${isZh ? "退出登录" : "Sign out"}</button>
          </div>
        </div>

        <div class="hub-tabs" role="tablist">
          <button type="button" class="ctrl-btn ctrl-btn-sm ${activeTab === "keys" ? "is-active" : ""}" data-hub-tab="keys">${isZh ? `密钥与接入 (${keys.length})` : `Keys & MCP (${keys.length})`}</button>
          <button type="button" class="ctrl-btn ctrl-btn-sm ${activeTab === "apps" ? "is-active" : ""}" data-hub-tab="apps">${isZh ? `已授权客户端 (${apps.length})` : `Connected Apps (${apps.length})`}</button>
          <button type="button" class="ctrl-btn ctrl-btn-sm ${activeTab === "voices" ? "is-active" : ""}" data-hub-tab="voices">${isZh ? `个人文风 (${voices.length})` : `Voice Cards (${voices.length})`}</button>
          <button type="button" class="ctrl-btn ctrl-btn-sm ${activeTab === "usage" ? "is-active" : ""}" data-hub-tab="usage">${isZh ? "近期记录与安全" : "Usage & Security"}</button>
        </div>

        <div class="hub-panel" id="hub-tab-body">
          ${actionErrorMsg ? `<p id="hub-action-err" class="ai-error-msg" style="margin:0 0 8px;">${esc(actionErrorMsg)}</p>` : ""}
          ${renderTabBody(curConn)}
        </div>
      </div>
    `;
    bindEvents(curConn);
  }

  function renderTabBody(curConn) {
    if (activeTab === "keys") {
      const keysHtml = keys.length
        ? `<ul class="hub-list">${keys
            .map(
              (k) => `<li class="hub-list-item">
                <div>
                  <strong>${esc(k.name)}</strong>
                  <code>${esc(k.prefix)}…</code>
                  <span class="hub-item-sub">${
                    isZh
                      ? `本月已用 ${esc(k.monthlyUsed || 0)}${k.monthlyLimit ? ` / 上限 ${esc(k.monthlyLimit)}` : ""}${k.lastUsedDay ? ` · 最近 ${esc(k.lastUsedDay)}` : ""}`
                      : `Used ${esc(k.monthlyUsed || 0)} this month${k.monthlyLimit ? ` / cap ${esc(k.monthlyLimit)}` : ""}${k.lastUsedDay ? ` · last ${esc(k.lastUsedDay)}` : ""}`
                  }</span>
                </div>
                <button type="button" class="ctrl-btn ctrl-btn-sm hub-revoke-key" data-key-id="${esc(k.id)}">${isZh ? "吊销" : "Revoke"}</button>
              </li>`
            )
            .join("")}</ul>`
        : `<p class="hub-empty">${isZh ? "还没有手动创建的 API 密钥。需要给终端 Agent 配置请求头时可随时新建。" : "No API keys yet. Create one below for headless CLI/editor headers."}</p>`;

      return `
        <div class="hub-connect-box">
          <div class="hub-connect-head">
            <span class="hub-sub-label">${isZh ? "接入 Agent / MCP 客户端" : "Connect to Agents & Editors"}</span>
            <div class="quick-actions">
              ${Object.entries(connectSnippets)
                .map(
                  ([k, s]) =>
                    `<button type="button" class="ctrl-btn ctrl-btn-sm ${activeConnectTarget === k ? "is-active" : ""}" data-conn-target="${esc(k)}">${esc(s.label)}</button>`
                )
                .join("")}
            </div>
          </div>
          <p class="hub-hint">${esc(curConn.hint)}</p>
          <div class="cmd-box"><code id="hub-conn-code">${esc(curConn.code)}</code><button type="button" id="hub-copy-conn" class="ctrl-btn ctrl-btn-sm">${isZh ? "复制" : "Copy"}</button></div>
        </div>

        <form id="hub-new-key-form" class="cloud-inline-form" style="margin-top:12px;">
          <input type="text" id="hub-key-name" class="cloud-input" maxlength="40" placeholder="${isZh ? "密钥名称，例如 Cursor 主力本" : "Key label, e.g. Cursor laptop"}">
          <input type="number" id="hub-key-cap" class="cloud-input" min="0" max="10000" style="max-width:130px;" placeholder="${isZh ? "月上限(选填)" : "Mo cap (opt)"}">
          <button type="submit" id="hub-key-submit" class="btn-primary" style="min-height:36px;padding:6px 14px;font-size:0.82rem;">${isZh ? "新建密钥" : "New API Key"}</button>
        </form>
        ${createdKeyBanner}
        ${keysHtml}
      `;
    }

    if (activeTab === "apps") {
      if (!apps.length) {
        return `<p class="hub-empty">${isZh ? "暂无通过 OAuth 2.1 授权的客户端。" : "No OAuth 2.1 clients connected yet."}</p>`;
      }
      return `<ul class="hub-list">${apps
        .map(
          (a) => `<li class="hub-list-item">
            <div>
              <strong>${esc(a.clientName || "MCP Client")}</strong>
              <span class="hub-item-sub">${isZh ? `作用域: ${esc(a.scope || "dislop")} · 授权时间: ${esc(String(a.createdAt || "").slice(0, 10))}` : `Scope: ${esc(a.scope || "dislop")} · Granted: ${esc(String(a.createdAt || "").slice(0, 10))}`}</span>
            </div>
            <button type="button" class="ctrl-btn ctrl-btn-sm hub-revoke-app" data-grant-id="${esc(a.id || a.grantId)}">${isZh ? "解除授权" : "Disconnect"}</button>
          </li>`
        )
        .join("")}</ul>`;
    }

    if (activeTab === "voices") {
      if (!voices.length) {
        return `<p class="hub-empty">${isZh ? "尚未保存云端个人文风。可在上方工作台「提取个人文风」后同步到这里。" : "No saved voice cards yet. Extract one in the workbench drawer above to sync across tools."}</p>`;
      }
      return `<ul class="hub-list">${voices
        .map(
          (v) => `<li class="hub-list-item">
            <div>
              <strong>${esc(v.name)}</strong>
              <span class="hub-item-sub">${esc(v.tone || "")}</span>
            </div>
            <div class="quick-actions">
              <button type="button" class="ctrl-btn ctrl-btn-sm hub-use-voice" data-voice-id="${esc(v.id)}">${isZh ? "加载到工作台" : "Load"}</button>
              <button type="button" class="ctrl-btn ctrl-btn-sm hub-del-voice" data-voice-id="${esc(v.id)}">${isZh ? "删除" : "Delete"}</button>
            </div>
          </li>`
        )
        .join("")}</ul>`;
    }

    const usageHtml = usageItems.length
      ? `<ul class="hub-list">${usageItems
          .map(
            (u) => `<li class="hub-list-item">
              <div>
                <strong>${esc(u.tool)}</strong>
                <span class="hub-item-sub">${esc(String(u.ts || u.at || "").replace("T", " ").slice(0, 16))} · ${esc(u.source || "direct")}</span>
              </div>
              <span>-${esc(u.credits)} ${isZh ? "额度" : "cr"}</span>
            </li>`
          )
          .join("")}</ul>`
      : `<p class="hub-empty">${isZh ? "暂无云端调用记录（服务端只记工具名与扣减额度，不保存任何草稿原文）。" : "No cloud calls recorded yet (only tool name and credit count are logged; zero drafts stored)."}</p>`;

    return `
      <p class="hub-hint">${isZh ? `当前总剩余：${esc(totalRemaining)} 额度。服务端零草稿留存，不保存任何提交内容。` : `Total available: ${esc(totalRemaining)} credits. Zero drafts are stored on dislop servers.`}</p>
      ${usageHtml}
      <div class="hub-danger-zone">
        <div class="quick-actions">
          <button type="button" id="hub-logout-all-btn" class="ctrl-btn ctrl-btn-sm">${isZh ? "下线全部已登录设备" : "Sign out all sessions"}</button>
          <button type="button" id="hub-show-delete-btn" class="ctrl-btn ctrl-btn-sm">${isZh ? "注销并清空账号" : "Delete account"}</button>
        </div>
        <div id="hub-delete-confirm" hidden style="margin-top:10px;">
          <p class="hub-hint">${isZh ? `输入你的邮箱（${esc(account.email)}）确认永久注销并吊销全部密钥（需在最近 10 分钟内完成过登录）：` : `Type ${esc(account.email)} to permanently delete your account and revoke all tokens (requires sign-in within 10 min):`}</p>
          <div class="cloud-inline-form">
            <input type="email" id="hub-delete-email" class="cloud-input" placeholder="${esc(account.email)}">
            <button type="button" id="hub-confirm-delete-btn" class="ctrl-btn ctrl-btn-sm">${isZh ? "确认注销" : "Confirm Delete"}</button>
          </div>
          <div id="hub-delete-err" class="ai-error-msg" style="margin-top:6px;"></div>
        </div>
      </div>
    `;
  }

  function bindEvents(curConn) {
    rootEl.querySelectorAll("[data-hub-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeTab = btn.getAttribute("data-hub-tab") || "keys";
        draw();
      });
    });
    rootEl.querySelectorAll("[data-conn-target]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeConnectTarget = btn.getAttribute("data-conn-target") || "oauth";
        draw();
      });
    });
    rootEl.querySelector("#hub-copy-conn")?.addEventListener("click", async (ev) => {
      await copyStr(ev.currentTarget, curConn.code, isZh);
    });
    rootEl.querySelector("#hub-copy-created-key")?.addEventListener("click", async (ev) => {
      const code = rootEl.querySelector("#hub-created-key-raw")?.textContent || "";
      await copyStr(ev.currentTarget, code, isZh);
    });
    rootEl.querySelector("#hub-refresh-btn")?.addEventListener("click", async () => {
      const me = await fetch("/api/v1/auth/session", { credentials: "same-origin" }).then((r) => r.json()).catch(() => null);
      if (me?.authenticated && me.account) {
        onAccountUpdated?.(me.account);
      } else {
        onSignedOut?.();
      }
    });
    rootEl.querySelector("#hub-logout-btn")?.addEventListener("click", async () => {
      actionErrorMsg = "";
      try {
        const r = await fetch("/api/v1/auth/logout", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (r.ok) {
          onSignedOut?.();
          return;
        }
        const me = await fetch("/api/v1/auth/session", { credentials: "same-origin" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
        if (me?.authenticated === false) {
          onSignedOut?.();
          return;
        }
        actionErrorMsg = isZh ? `退出登录失败（HTTP ${r.status}），请重试。` : `Sign out failed (HTTP ${r.status}). Please retry.`;
      } catch (err) {
        actionErrorMsg = err?.message || (isZh ? "网络错误，退出登录未完成，请重试。" : "Network error while signing out. Please retry.");
      }
      draw();
    });
    rootEl.querySelector("#hub-new-key-form")?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const name = String(rootEl.querySelector("#hub-key-name")?.value || "").trim() || "MCP Key";
      const monthlyLimit = Number(rootEl.querySelector("#hub-key-cap")?.value || 0) || 0;
      const submit = rootEl.querySelector("#hub-key-submit");
      if (submit) submit.disabled = true;
      try {
        const resp = await fetch("/api/v1/account/keys", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, monthlyLimit }),
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          createdKeyBanner = `<p class="ai-error-msg" style="margin-top:8px;">${esc(data.message || `HTTP ${resp.status}`)}</p>`;
          draw();
          return;
        }
        if (data.key) keys.unshift(data.key);
        const cfgStr = JSON.stringify(data.mcpConfig, null, 2);
        createdKeyBanner = `<div class="cloud-output-box" style="margin-top:8px;">
          <div><strong>${isZh ? "密钥仅显示这一次，请立即复制保存：" : "Key shown once: copy and save now:"}</strong></div>
          <div class="cmd-box" style="margin-top:6px;"><code id="hub-created-key-raw">${esc(data.apiKey)}</code><button type="button" id="hub-copy-created-key" class="ctrl-btn ctrl-btn-sm">${isZh ? "复制密钥" : "Copy Key"}</button></div>
          <pre class="cloud-output-pre" style="margin-top:6px;">${esc(cfgStr)}</pre>
        </div>`;
        draw();
      } finally {
        if (submit) submit.disabled = false;
      }
    });

    rootEl.querySelectorAll(".hub-revoke-key").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-key-id");
        if (!id) return;
        actionErrorMsg = "";
        btn.disabled = true;
        try {
          const r = await fetch(`/api/v1/account/keys/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin" });
          const data = await r.json().catch(() => ({}));
          if (r.ok) {
            const idx = keys.findIndex((k) => k.id === id);
            if (idx >= 0) keys.splice(idx, 1);
            draw();
            return;
          }
          actionErrorMsg = data.message || (isZh ? `吊销密钥失败（HTTP ${r.status}）` : `Failed to revoke key (HTTP ${r.status})`);
        } catch (err) {
          actionErrorMsg = err?.message || (isZh ? "网络错误，吊销密钥失败。" : "Network error while revoking key.");
        }
        draw();
      });
    });

    rootEl.querySelectorAll(".hub-revoke-app").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-grant-id");
        if (!id) return;
        actionErrorMsg = "";
        btn.disabled = true;
        try {
          const r = await fetch(`/api/v1/account/apps/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin" });
          const data = await r.json().catch(() => ({}));
          if (r.ok) {
            const idx = apps.findIndex((a) => (a.id || a.grantId) === id);
            if (idx >= 0) apps.splice(idx, 1);
            draw();
            return;
          }
          actionErrorMsg = data.message || (isZh ? `解除授权失败（HTTP ${r.status}）` : `Failed to disconnect app (HTTP ${r.status})`);
        } catch (err) {
          actionErrorMsg = err?.message || (isZh ? "网络错误，解除授权失败。" : "Network error while disconnecting app.");
        }
        draw();
      });
    });

    rootEl.querySelectorAll(".hub-use-voice").forEach((btn) => {
      btn.addEventListener("click", () => {
        const vid = btn.getAttribute("data-voice-id");
        const found = voices.find((v) => v.id === vid);
        if (found) onUseVoice?.(found);
      });
    });

    rootEl.querySelectorAll(".hub-del-voice").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const vid = btn.getAttribute("data-voice-id");
        if (!vid) return;
        actionErrorMsg = "";
        btn.disabled = true;
        try {
          const r = await fetch(`/api/v1/account/voices/${encodeURIComponent(vid)}`, { method: "DELETE", credentials: "same-origin" });
          const data = await r.json().catch(() => ({}));
          if (r.ok) {
            const idx = voices.findIndex((v) => v.id === vid);
            if (idx >= 0) voices.splice(idx, 1);
            draw();
            return;
          }
          actionErrorMsg = data.message || (isZh ? `删除文风卡失败（HTTP ${r.status}）` : `Failed to delete voice card (HTTP ${r.status})`);
        } catch (err) {
          actionErrorMsg = err?.message || (isZh ? "网络错误，删除文风卡失败。" : "Network error while deleting voice card.");
        }
        draw();
      });
    });

    rootEl.querySelector("#hub-logout-all-btn")?.addEventListener("click", async () => {
      actionErrorMsg = "";
      try {
        const r = await fetch("/api/v1/auth/logout-all", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (r.ok) {
          onSignedOut?.();
          return;
        }
        const me = await fetch("/api/v1/auth/session", { credentials: "same-origin" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
        if (me?.authenticated === false) {
          onSignedOut?.();
          return;
        }
        actionErrorMsg = isZh ? `全端下线失败（HTTP ${r.status}），请重试。` : `Sign out all failed (HTTP ${r.status}). Please retry.`;
      } catch (err) {
        actionErrorMsg = err?.message || (isZh ? "网络错误，全端下线未完成。" : "Network error while signing out all sessions.");
      }
      draw();
    });

    rootEl.querySelector("#hub-show-delete-btn")?.addEventListener("click", () => {
      const box = rootEl.querySelector("#hub-delete-confirm");
      if (box) box.hidden = !box.hidden;
    });

    rootEl.querySelector("#hub-confirm-delete-btn")?.addEventListener("click", async () => {
      const confirmEmail = String(rootEl.querySelector("#hub-delete-email")?.value || "").trim();
      const errEl = rootEl.querySelector("#hub-delete-err");
      const resp = await fetch("/api/v1/account", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (errEl) errEl.textContent = data.message || `HTTP ${resp.status}`;
        return;
      }
      onSignedOut?.();
    });
  }

  draw();
}
