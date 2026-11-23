(function () {
  "use strict";

  var html = document.documentElement;
  var lang = html.getAttribute("data-static-lang") === "en" ? "en" : "zh";
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
    btn.textContent = paused ? (lang === "en" ? "Play" : "播放") : (lang === "en" ? "Pause" : "定格");
  }

  document.querySelectorAll("[data-demo-toggle]").forEach(function (btn) {
    if (prefersReducedMotion) setStaticDemoPaused(btn, true);
    btn.addEventListener("click", function () {
      var paused = btn.getAttribute("aria-pressed") === "true";
      setStaticDemoPaused(btn, !paused);
    });
  });

  document.querySelectorAll("[data-demo-replay]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var slug = btn.getAttribute("data-demo-replay");
      var card = btn.closest("[data-demo-card]");
      if (!slug || !card) return;
      var prefix = card.getAttribute("data-demo-prefix") || "./";
      var cardLang = card.getAttribute("data-demo-lang") || lang;
      var ver = card.getAttribute("data-demo-ver") || "v2";
      var base = prefix + "assets/demos/" + slug + "-" + cardLang + "-" + ver;
      var bust = "?r=" + Date.now();
      var poster = card.querySelector('source[data-demo-poster="' + slug + '"]');
      var webp = card.querySelector('source[data-demo-webp="' + slug + '"]');
      var img = card.querySelector('img[data-demo-gif="' + slug + '"]');
      var toggle = card.querySelector('[data-demo-toggle="' + slug + '"]');
      if (poster) poster.media = "not all";
      if (webp) webp.srcset = base + ".webp" + bust;
      if (img) img.src = base + ".gif" + bust;
      if (toggle) {
        toggle.setAttribute("aria-pressed", "false");
        toggle.textContent = lang === "en" ? "Pause" : "定格";
      }
    });
  });

  // Tab sets: the dark-room demo stage and the /en/ hero proof share one small helper
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
    var initial = tabs.filter(function (t) {
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

  var heroRail = document.querySelector("[data-en-hero-tabs]");
  if (heroRail) {
    var heroPanels = Array.prototype.slice.call(document.querySelectorAll("[data-en-hero-panel]"));
    var heroTabs = wireTabs(heroRail, "data-en-hero-state", function (state) {
      heroPanels.forEach(function (panel) {
        panel.hidden = panel.getAttribute("data-en-hero-panel") !== state;
      });
    });
    if (heroTabs) {
      heroRail.hidden = false;
      document.documentElement.classList.add("has-en-hero-tabs");
    }
  }

  var lightbox = document.getElementById("demo-lightbox");
  var lightboxTitle = document.getElementById("demo-lightbox-title");
  var lightboxImg = document.getElementById("demo-lightbox-img");
  document.querySelectorAll("[data-demo-zoom]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var slug = btn.getAttribute("data-demo-zoom");
      var card = btn.closest("[data-demo-card]");
      if (!slug || !card || !lightbox || !lightboxImg) return;
      var prefix = card.getAttribute("data-demo-prefix") || "./";
      var cardLang = card.getAttribute("data-demo-lang") || lang;
      var ver = card.getAttribute("data-demo-ver") || "v2";
      var titleEl = card.querySelector(".demo-cap-title");
      var imgEl = card.querySelector("img");
      if (lightboxTitle) lightboxTitle.textContent = titleEl ? titleEl.textContent : slug;
      lightboxImg.src = prefix + "assets/demos/" + slug + "-" + cardLang + "-" + ver + ".webp";
      lightboxImg.alt = imgEl ? imgEl.alt : slug;
      if (typeof lightbox.showModal === "function") lightbox.showModal();
    });
  });
  var closeBtn = document.getElementById("demo-lightbox-close");
  if (closeBtn && lightbox) {
    closeBtn.addEventListener("click", function () {
      lightbox.close();
    });
    lightbox.addEventListener("click", function (e) {
      if (e.target === lightbox) lightbox.close();
    });
  }
})();
