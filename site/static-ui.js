(function () {
  "use strict";

  var html = document.documentElement;
  var lang = html.getAttribute("data-static-lang") === "zh" ? "zh" : "en";
  var themeToggle = document.getElementById("theme-toggle");

  function getSavedTheme() {
    try {
      return window.localStorage.getItem("dislop-theme");
    } catch (_) {
      return null;
    }
  }

  function saveTheme(theme) {
    try {
      window.localStorage.setItem("dislop-theme", theme);
    } catch (_) {
      // Ignore storage failures
    }
  }

  function applyTheme(theme) {
    html.setAttribute("data-theme", theme);
    if (themeToggle) {
      if (lang === "en") {
        themeToggle.textContent = theme === "dark" ? "Light" : "Dark";
      } else {
        themeToggle.textContent = theme === "dark" ? "浅色" : "深色";
      }
    }
  }

  var initialTheme = getSavedTheme();
  if (!initialTheme && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    initialTheme = "dark";
  }
  applyTheme(initialTheme === "dark" ? "dark" : "light");

  if (themeToggle) {
    themeToggle.addEventListener("click", function () {
      var next = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
      saveTheme(next);
      applyTheme(next);
    });
  }

  document.querySelectorAll("[data-lang-switch]").forEach(function (el) {
    var baseHref = el.getAttribute("href") || "";
    function buildStatefulHref() {
      if (!baseHref) return baseHref;
      try {
        var target = el.getAttribute("data-lang-switch");
        var u = new URL(baseHref, window.location.href);
        var curParams = new URLSearchParams(window.location.search || "");
        if (curParams.has("lang") && (target === "en" || target === "zh")) {
          curParams.set("lang", target);
        }
        var qs = curParams.toString();
        u.search = qs ? "?" + qs : "";
        if (window.location.hash) {
          u.hash = window.location.hash;
        }
        return u.pathname + u.search + u.hash;
      } catch (_) {
        return baseHref;
      }
    }
    function syncHref() {
      var nextHref = buildStatefulHref();
      if (nextHref) el.setAttribute("href", nextHref);
    }
    function persistTarget() {
      syncHref();
      var target = el.getAttribute("data-lang-switch");
      if (target === "en" || target === "zh") {
        try {
          window.localStorage.setItem("dislop-lang", target);
        } catch (_) {
          // Ignore storage failures
        }
      }
    }
    syncHref();
    window.addEventListener("hashchange", syncHref);
    el.addEventListener("click", persistTarget);
    el.addEventListener("auxclick", persistTarget);
  });

  function hasSignedInHint() {
    try {
      if (/(?:^|;\s*)dslp_hint=1(?:;|$)/.test(document.cookie || "")) return true;
      var saved = window.localStorage.getItem("dislop_cloud_account_v1");
      if (saved && JSON.parse(saved).token) return true;
    } catch (_) {
      // Ignore cookie or storage access errors
    }
    return false;
  }

  if (hasSignedInHint()) {
    document.querySelectorAll("[data-static-acct]").forEach(function (el) {
      el.classList.add("is-signed-in");
      el.textContent = lang === "en" ? "Account" : "账号";
    });
  }

  function copyWithFeedback(btn, text) {
    if (!text || !navigator.clipboard) return;
    var orig = btn.textContent;
    navigator.clipboard.writeText(text).then(function () {
      btn.textContent = lang === "en" ? "Copied" : "已复制";
      window.setTimeout(function () {
        btn.textContent = orig;
      }, 1600);
    });
  }

  document.querySelectorAll("[data-copy-target]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var targetId = btn.getAttribute("data-copy-target");
      var target = targetId ? document.getElementById(targetId) : null;
      if (target) copyWithFeedback(btn, target.textContent || "");
    });
  });

  document.querySelectorAll("[data-copy-text]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      copyWithFeedback(btn, btn.getAttribute("data-copy-text") || "");
    });
  });

  var prefersReducedMotion = Boolean(
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  function setStaticDemoPaused(btn, paused) {
    var slug = btn.getAttribute("data-demo-toggle");
    var card = btn.closest("[data-demo-card]");
    if (!slug || !card) return;
    var prefix = card.getAttribute("data-demo-prefix") || "./";
    var cardLang = card.getAttribute("data-demo-lang") || lang;
    var ver = card.getAttribute("data-demo-ver") || "v2";
    var poster = card.querySelector('source[data-demo-poster="' + slug + '"]');
    var webp = card.querySelector('source[data-demo-webp="' + slug + '"]');
    var img = card.querySelector('img[data-demo-gif="' + slug + '"]');
    var base = prefix + "assets/demos/" + slug + "-" + cardLang + "-" + ver;
    if (poster) poster.media = paused ? "(prefers-reduced-motion: reduce)" : "not all";
    if (webp) webp.srcset = paused ? base + "-poster.png" : base + ".webp";
    if (img) img.src = paused ? base + "-poster.png" : base + ".gif";
    btn.setAttribute("aria-pressed", String(paused));
    btn.setAttribute(
      "aria-label",
      paused
        ? lang === "en"
          ? "Resume animation"
          : "继续播放"
        : lang === "en"
          ? "Pause animation"
          : "暂停画面"
    );
  }

  document.querySelectorAll("[data-demo-toggle]").forEach(function (btn) {
    if (prefersReducedMotion) setStaticDemoPaused(btn, true);
    btn.addEventListener("click", function () {
      var paused = btn.getAttribute("aria-pressed") === "true";
      setStaticDemoPaused(btn, !paused);
    });
  });

  function wireTabs(rail, attr, onSelect) {
    var tabs = Array.prototype.slice.call(rail.querySelectorAll("[" + attr + "]"));
    if (!tabs.length) return null;
    function select(value, moveFocus) {
      tabs.forEach(function (tab) {
        var active = tab.getAttribute(attr) === value;
        tab.setAttribute("aria-selected", String(active));
        tab.setAttribute("tabindex", active ? "0" : "-1");
        tab.classList.toggle("is-active", active);
        if (active && moveFocus) tab.focus();
      });
      onSelect(value);
    }
    tabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        select(tab.getAttribute(attr), false);
      });
    });
    rail.addEventListener("keydown", function (e) {
      var idx = tabs.indexOf(document.activeElement);
      if (idx < 0) return;
      var next = -1;
      if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
      else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tabs.length - 1;
      if (next < 0) return;
      e.preventDefault();
      select(tabs[next].getAttribute(attr), true);
    });
    var initial =
      tabs.filter(function (t) {
        return t.getAttribute("aria-selected") === "true";
      })[0] || tabs[0];
    select(initial.getAttribute(attr), false);
    return tabs;
  }

  var demoStage = document.querySelector("[data-demo-stage]");
  var demoRail = demoStage ? demoStage.querySelector('[role="tablist"]') : null;
  var demoGrid = demoStage ? demoStage.querySelector(".demos-grid") : null;
  if (demoStage && demoRail && demoGrid) {
    Array.prototype.forEach.call(demoRail.querySelectorAll("[data-demo-select]"), function (tab) {
      var card = demoGrid.querySelector('[data-demo-card="' + tab.getAttribute("data-demo-select") + '"]');
      if (card) {
        card.setAttribute("role", "tabpanel");
        card.setAttribute("aria-labelledby", tab.id);
      }
    });
    var demoTabs = wireTabs(demoRail, "data-demo-select", function (slug) {
      Array.prototype.forEach.call(demoGrid.querySelectorAll("[data-demo-card]"), function (card) {
        card.classList.toggle("is-active-demo", card.getAttribute("data-demo-card") === slug);
      });
    });
    if (demoTabs) {
      demoRail.hidden = false;
      demoStage.classList.add("is-stage-ready");
      demoGrid.classList.add("is-stage-ready");
    }
  }
})();
