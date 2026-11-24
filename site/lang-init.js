(function () {
  "use strict";

  function parseExplicitLangParam(search) {
    try {
      var param = new URLSearchParams(search || "").get("lang");
      if (param) {
        var norm = String(param).trim().toLowerCase();
        if (/^zh\b/.test(norm)) return "zh";
        if (/^en\b/.test(norm)) return "en";
      }
    } catch (_) {
      // Ignore malformed query string
    }
    return "";
  }

  function resolvePreferredLang(opts) {
    var search = (opts && opts.search) || "";
    var stored = opts && opts.stored;
    var languages = opts && opts.languages;
    var language = (opts && opts.language) || "";
    var intlLocale = (opts && opts.intlLocale) || "";

    var explicit = parseExplicitLangParam(search);
    if (explicit) return explicit;

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

  function findPeerHref(targetLang) {
    if (typeof document === "undefined" || typeof document.querySelector !== "function") return "";
    var hreflang = targetLang === "zh" ? "zh-Hans" : "en";
    var link = document.querySelector('link[rel="alternate"][hreflang="' + hreflang + '"]');
    if (!link || !link.getAttribute) return "";
    var rawHref = String(link.getAttribute("href") || "").trim();
    if (!rawHref) return "";
    try {
      var parsed = new URL(rawHref, window.location ? window.location.href : "https://dislop.com/");
      return parsed.pathname || "/";
    } catch (_) {
      return "";
    }
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
    var loc = window.location || {};
    var searchStr = loc.search || "";
    var hashStr = loc.hash || "";
    var explicitLang = parseExplicitLangParam(searchStr);

    var detected = resolvePreferredLang({
      search: searchStr,
      stored: storedLang,
      languages: nav.languages,
      language: nav.language || nav.userLanguage || "",
      intlLocale: intlLoc,
    });

    window.__DISLOP_RESOLVE_LANG__ = resolvePreferredLang;
    window.__DISLOP_INIT_LANG__ = detected;

    var root = document.documentElement;
    var staticLang = (root && root.getAttribute && root.getAttribute("data-static-lang")) === "zh" ? "zh" : "en";

    if (explicitLang) {
      try {
        window.localStorage.setItem("dislop-lang", explicitLang);
      } catch (_) {
        // Ignore storage errors
      }
    }

    var cameFromSameOriginZh = false;
    if (!explicitLang && staticLang === "en" && document.referrer && loc.origin) {
      try {
        var refUrl = new URL(document.referrer);
        if (refUrl.origin === loc.origin && (refUrl.pathname === "/zh" || refUrl.pathname.indexOf("/zh/") === 0)) {
          cameFromSameOriginZh = true;
          try {
            window.localStorage.setItem("dislop-lang", "en");
          } catch (_) {
            // Ignore storage errors
          }
          window.__DISLOP_INIT_LANG__ = "en";
          detected = "en";
        }
      } catch (_) {
        cameFromSameOriginZh = false;
      }
    }

    var ua = String(nav.userAgent || "");
    var isBot =
      /bot|crawl|spider|slurp|facebookexternalhit|twitterbot|slackbot|discordbot|whatsapp|telegrambot|linkedinbot|embedly|quora|pinterest|headless|lighthouse/i.test(
        ua
      );
    var hasSensitiveAuth =
      /(?:^|[#&])(?:magic|auth-error)=/i.test(hashStr) || /(?:^|[?&])auth=/i.test(searchStr);

    var shouldRedirect = false;
    var redirectTargetLang = "";
    if (explicitLang && explicitLang !== staticLang) {
      shouldRedirect = true;
      redirectTargetLang = explicitLang;
    } else if (
      staticLang === "en" &&
      !explicitLang &&
      !cameFromSameOriginZh &&
      !isBot &&
      !hasSensitiveAuth &&
      detected === "zh"
    ) {
      shouldRedirect = true;
      redirectTargetLang = "zh";
    }

    if (shouldRedirect && typeof loc.replace === "function") {
      var peerPath = findPeerHref(redirectTargetLang);
      if (peerPath && peerPath !== loc.pathname) {
        var nextParams = "";
        try {
          var cleanQs = new URLSearchParams(searchStr);
          cleanQs.delete("lang");
          var qsText = cleanQs.toString();
          if (qsText) nextParams = "?" + qsText;
        } catch (_) {
          nextParams = "";
        }
        loc.replace(peerPath + nextParams + hashStr);
        return;
      }
    }

    if (explicitLang === staticLang && typeof window.history !== "undefined" && typeof window.history.replaceState === "function") {
      try {
        var stripQs = new URLSearchParams(searchStr);
        stripQs.delete("lang");
        var restQs = stripQs.toString();
        window.history.replaceState({}, "", (loc.pathname || "/") + (restQs ? "?" + restQs : "") + hashStr);
      } catch (_) {
        // Ignore history errors
      }
    }

    if (root) {
      root.lang = staticLang === "zh" ? "zh-CN" : "en";
    }
  }
})();
