/* ==========================================================================
   Specul / KeeL —— 统一品牌外壳脚本 (brand shell)
   --------------------------------------------------------------------------
   处理全站一致的语言切换与明暗主题。所有品牌页面共用同一份副本。
   依赖 DOM：
     #langBtn  语言按钮      #themeBtn  主题按钮
     #markName 品牌名（用 data-zh-name / data-en-name 提供中英文两种写法）
   存储键：specul-lang (zh|en) / specul-theme (dark|light)

   注：早期版本这里叫 #markSub（品牌副标题），当时 brand-name 固定中文、
   副标题放英文。后来中文态的副标题与品牌名撞成同一句话（截图里的「重影」），
   2026-10-01 起改为品牌名本身随语言切换，副标题已从模板移除。
   ========================================================================== */
(function () {
  var root = document.documentElement;
  var langBtn = document.getElementById('langBtn');
  var themeBtn = document.getElementById('themeBtn');
  var name = document.getElementById('markName');

  // 页面若完全没有任何 [data-en] 节点，说明该页只有中文内容；
  // 此时移除语言按钮，而不是留一个点了没反应的开关。
  if (langBtn && !document.querySelector('[data-en]')) {
    langBtn.remove();
    langBtn = null;
  }

  function applyLang(lang) {
    var en = lang === 'en';
    root.lang = en ? 'en' : 'zh-CN';
    // ⚠ data-lang 必须一起设（2026-10-03 修）。
    // brand.css 的语言显隐完全靠这个属性：
    //   html[data-lang="en"] [data-zh] { display: none !important; }
    //   html[data-lang="en"] [data-en] { display: revert !important; }
    // 而原来的实现只设了 root.lang —— 于是 data-lang 永远是 null，
    // **全站 6 个站的英文态都仍在显示中文内容**，切换看着「只换了品牌名」。
    // 为什么之前没被发现：单看品牌名确实变了，而正文没变容易被当成
    // 「页面本来就这样」。凡是 CSS 用属性选择器做显隐，JS 就必须同步写该属性。
    root.setAttribute('data-lang', en ? 'en' : 'zh');
    // 语言按钮文案**刻意用单字「中」**（2026-10-03 用户定案）。
    // 原实现英文态显示「EN」、中文态显示「中文」—— 两个汉字的宽度把
    // .nav-tools 撑开，破坏顶部导航的布局（窄屏更明显）。
    // 按钮语义是「切到另一种语言」，单字够用；宽度问题由 CSS 兜底
    // （#langBtn 固定 min-width + 居中，两种文案都不会位移）。
    if (langBtn) {
      langBtn.textContent = en ? '中' : 'EN';
      langBtn.setAttribute('aria-label', en ? '切换到中文' : 'Switch to English');
      langBtn.setAttribute('title', en ? '切换到中文' : 'Switch to English');
    }
    if (name) {
      var text = en ? name.dataset.enName : name.dataset.zhName;
      if (text) name.textContent = text;
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
