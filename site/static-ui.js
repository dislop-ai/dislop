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

  document.querySelectorAll("[data-demo-toggle]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var slug = btn.getAttribute("data-demo-toggle");
      var card = btn.closest("[data-demo-card]");
      if (!slug || !card) return;
      var prefix = card.getAttribute("data-demo-prefix") || "./";
      var cardLang = card.getAttribute("data-demo-lang") || lang;
      var ver = card.getAttribute("data-demo-ver") || "v2";
      var paused = btn.getAttribute("aria-pressed") === "true";
      var nextPaused = !paused;
      var webp = card.querySelector('source[data-demo-webp="' + slug + '"]');
      var img = card.querySelector('img[data-demo-gif="' + slug + '"]');
      var base = prefix + "assets/demos/" + slug + "-" + cardLang + "-" + ver;
      if (webp) webp.srcset = nextPaused ? base + "-poster.png" : base + ".webp";
      if (img) img.src = nextPaused ? base + "-poster.png" : base + ".gif";
      btn.setAttribute("aria-pressed", String(nextPaused));
      btn.textContent = nextPaused ? (lang === "en" ? "Play" : "播放") : (lang === "en" ? "Pause" : "定格");
    });
  });

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
