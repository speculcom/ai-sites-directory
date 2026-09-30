/* ==========================================================================
   Specul / KeeL —— 统一品牌外壳脚本 (brand shell)
   --------------------------------------------------------------------------
   处理全站一致的语言切换与明暗主题。所有品牌页面共用同一份副本。
   依赖 DOM：
     #langBtn  语言按钮      #themeBtn  主题按钮
     #markSub  品牌副标题（用 data-zh-sub / data-en-sub 提供两种文案）
   存储键：specul-lang (zh|en) / specul-theme (dark|light)
   ========================================================================== */
(function () {
  var root = document.documentElement;
  var langBtn = document.getElementById('langBtn');
  var themeBtn = document.getElementById('themeBtn');
  var sub = document.getElementById('markSub');

  // 页面若完全没有任何 [data-en] 节点，说明该页只有中文内容；
  // 此时移除语言按钮，而不是留一个点了没反应的开关。
  if (langBtn && !document.querySelector('[data-en]')) {
    langBtn.remove();
    langBtn = null;
  }

  function applyLang(lang) {
    var en = lang === 'en';
    root.lang = en ? 'en' : 'zh-CN';
    if (langBtn) langBtn.textContent = en ? '中文' : 'EN';
    if (sub) {
      var text = en ? sub.dataset.enSub : sub.dataset.zhSub;
      if (text) sub.textContent = text;
    }
    try { localStorage.setItem('specul-lang', en ? 'en' : 'zh'); } catch (e) {}
  }

  function applyTheme(theme) {
    var light = theme === 'light';
    if (light) root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
    if (themeBtn) themeBtn.textContent = light ? '☀' : '☾';
    try { localStorage.setItem('specul-theme', light ? 'light' : 'dark'); } catch (e) {}
  }

  // 当前页导航高亮：跨域链接也能用（比较 pathname）。
  // 末尾统一成 "" 或 "/xxx"，"index.html" 视为目录首页。
  (function markCurrent() {
    function norm(p) {
      p = (p || '/').replace(/index\.html$/, '').replace(/\/+$/, '');
      return p || '/';
    }
    var here = norm(location.pathname);
    var links = document.querySelectorAll('.nav-links > a, .foot-links > a');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var path;
      try { path = new URL(a.getAttribute('href'), location.href).pathname; } catch (e) { continue; }
      if (new URL(a.getAttribute('href'), location.href).host !== location.host) continue;
      if (norm(path) === here) a.setAttribute('aria-current', 'page');
    }
  })();

  var lang = 'zh';
  var theme = 'dark';
  try { lang = localStorage.getItem('specul-lang') || 'zh'; } catch (e) {}
  try { theme = localStorage.getItem('specul-theme') || 'dark'; } catch (e) {}

  applyLang(lang);
  applyTheme(theme);

  if (langBtn) {
    langBtn.addEventListener('click', function () {
      applyLang(root.lang === 'en' ? 'zh' : 'en');
    });
  }
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      applyTheme(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
    });
  }
})();
