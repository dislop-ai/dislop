(function () {
  "use strict";

  function resolvePreferredLang(opts) {
    var search = (opts && opts.search) || "";
    var stored = opts && opts.stored;
    var languages = opts && opts.languages;
    var language = (opts && opts.language) || "";
    var intlLocale = (opts && opts.intlLocale) || "";

    try {
      var param = new URLSearchParams(search).get("lang");
      if (param) {
        var normParam = String(param).trim().toLowerCase();
        if (/^zh\b/.test(normParam)) return "zh";
        if (/^en\b/.test(normParam)) return "en";
      }
    } catch (_) {
      // Ignore malformed query string
    }

    if (stored === "zh" || stored === "en") return stored;

    var prefList =
      Array.isArray(languages) && languages.length > 0
        ? languages
        : language
          ? [language]
          : [];

    for (var i = 0; i < prefList.length; i += 1) {
      var tag = String(prefList[i] || "").trim().toLowerCase();
      if (!tag) continue;
      if (/^zh\b/.test(tag)) return "zh";
      if (/^en\b/.test(tag)) return "en";
    }

    if (prefList.length > 0) return "en";

    if (intlLocale) {
      return /^zh\b/i.test(String(intlLocale).trim()) ? "zh" : "en";
    }

    return "en";
  }

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    var storedLang = null;
    try {
      storedLang = window.localStorage.getItem("dislop-lang");
    } catch (_) {
      storedLang = null;
    }

    var intlLoc = "";
    try {
      intlLoc = Intl.DateTimeFormat().resolvedOptions().locale || "";
    } catch (_) {
      intlLoc = "";
    }

    var nav = window.navigator || {};
    var detected = resolvePreferredLang({
      search: window.location ? window.location.search : "",
      stored: storedLang,
      languages: nav.languages,
      language: nav.language || nav.userLanguage || "",
      intlLocale: intlLoc,
    });

    window.__DISLOP_RESOLVE_LANG__ = resolvePreferredLang;
    window.__DISLOP_INIT_LANG__ = detected;

    var root = document.documentElement;
    if (root) {
      root.lang = detected === "zh" ? "zh-CN" : "en";
      var staticLang = root.getAttribute("data-static-lang") || "zh";
      if (detected !== staticLang) {
        root.setAttribute("data-lang-hydrating", "1");
        window.setTimeout(function () {
          root.removeAttribute("data-lang-hydrating");
        }, 350);
      }
    }
  }
})();
