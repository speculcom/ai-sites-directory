/* ==========================================================================
   Specul / KeeL —— 统一品牌外壳脚本 (brand shell)
   --------------------------------------------------------------------------
   处理全站一致的语言切换与明暗主题。所有品牌页面共用同一份副本。
   依赖 DOM：
     #langBtn  语言按钮      #themeBtn  主题按钮
     #markName 品牌名（用 data-zh-name / data-en-name 提供中英文两种写法）
     #markSub  品牌副名（**2026-10-10 新增**：中文态显示英文副名，英文态清空）
   存储键：specul-lang (zh|en) / specul-theme (dark|light)

   注：早期版本这里叫 #markSub（品牌副标题），当时 brand-name 固定中文、
   副标题放英文。后来中文态的副标题与品牌名撞成同一句话（截图里的「重影」），
   2026-10-01 起改为品牌名本身随语言切换、副标题移除。
   2026-10-10 用户要求「所有分站都要像首页一样，上面中文下面英文」→ 副标题回来了，
   但**只在中文态显示**：英文态主名已是英文，副名若还留着就是同一句话显示两遍，
   正是当初「重影」的成因。所以这里统一处理，全站（含抽屉）行为一致 ✓
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

  // 从系统/浏览器偏好推断初始语言（2026-10-10 新增）。
  //
  // 只认**第一个**语言项，不做 zh-* / zh-Hans / zh_CN 之外的细分匹配 ——
  // 站上只有中英两种文案，把 zh-TW / zh-HK 也算成中文（简体）虽然不准确，
  // 但这是唯一没有第三份繁体译文时的合理选择；反过来把 zh-TW 判成英文更糟。
  //
  // 读不到就返回 'zh'（原行为），保证在没有 navigator 的环境里不炸。
  function detectLang() {
    try {
      var list = navigator.languages && navigator.languages.length
        ? navigator.languages
        : [navigator.language];
      var first = String(list[0] || '').toLowerCase();
      if (!first) return 'zh';
      // 以 zh 开头（zh / zh-CN / zh-Hans / zh-TW …）→ 中文，其余一律英文
      return /^zh\b/.test(first) ? 'zh' : 'en';
    } catch (e) {
      return 'zh';
    }
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
    // 品牌副名（2026-10-10 新增）：中文态显示英文副名，英文态清空并隐藏。
    // 为什么英文态要清空：英文态主名已经是「Speculative Speculation」，
    // 副名若是同一句话，左上角就会显示两遍 —— 那正是 2026-10-01 修掉的「重影」。
    // ⚠ 这段原先只存在于 `www.specul/index.html` 的**页内联脚本**里（只首页有）；
    //   现在搬进共享层，六站（含手机抽屉）行为一致 ✓
    var subs = document.querySelectorAll('#markSub, .nav-drawer .brand-sub');
    for (var i = 0; i < subs.length; i++) {
      var s = subs[i];
      var st = en ? (s.dataset.enSub || '') : (s.dataset.zhSub || '');
      s.textContent = st;
      s.style.display = st ? '' : 'none';
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
  // ⚠ 语言来源的优先级：**URL 参数 > localStorage > 浏览器语言**（2026-10-03 / 10-10 两次修）。
  //
  // 为什么必须有 URL 参数：localStorage 是**按 origin 隔离**的
  // （实测：在 127.0.0.1:4321 写入，换到 :4322 读回来是 null ——
  //   浏览器规范，不是沙箱限制）。而 6 个站是 6 个不同域名，
  //   于是「在 agent 站切到英文 → 点进 learn 站」会退回中文。
  //   localStorage 只能记住**本域名内**的偏好，跨站必须靠 URL 携带。
  //
  // 跨站链接由 appendLang() 自动加 ?lang=，所以这条优先级保证：
  //   在任何站切到英文 → 点别的站 → 还是英文；切到中文 → 点别的站 → 还是中文。
  //
  // 第三层（2026-10-10 新增）：此前这一层的兜底是**写死的中文**，于是英文系统的
  //   用户首次访问**一律落到中文**，要自己点一次 EN 才知道这站有英文。
  //   现在改成读 navigator.language ——「首次访问」按系统语言走，
  //   用户手动切过之后仍然以 localStorage 为准（不跟系统语言反复拉扯）。
  //   navigator.languages 是有序偏好列表，第一个命中即可；都读不到就留在中文。
  var qs = '';
  try { qs = location.search || ''; } catch (e) {}
  var qLang = (/(?:^|[?&])lang=(zh|en)(?:&|$)/.exec(qs) || [])[1];
  if (qLang) {
    lang = qLang;
    // 回写本域偏好，这样本页后续切回时不必再依赖 URL
    try { localStorage.setItem('specul-lang', lang); } catch (e) {}
  } else {
    try { lang = localStorage.getItem('specul-lang') || detectLang(); } catch (e) {}
    // 兜底：localStorage 读不出来（隐私模式等）时仍按系统语言走
    if (lang !== 'zh' && lang !== 'en') lang = detectLang();
  }
  // 同理：主题也跨站保持（顺手统一，避免两个开关行为不一致）
  var qTheme = (/(?:^|[?&])theme=(dark|light)(?:&|$)/.exec(qs) || [])[1];
  if (qTheme) {
    theme = qTheme;
    try { localStorage.setItem('specul-theme', theme); } catch (e) {}
  } else {
    try { theme = localStorage.getItem('specul-theme') || 'dark'; } catch (e) {}
  }

  applyLang(lang);
  applyTheme(theme);

  // 跨站链接自动带上当前语言与主题。
  //
  // 为什么必须**运行时统一处理**而不是在模板里写死 href：
  // agent 站有 429 处跨站链接（grep 实测），逐个手写 ?lang= 一定会漏；
  // 而漏掉的那些正是「点了语言变回中文」的症状来源。
  //
  // 判据：凡 host 属于 *.specul.com 就加。站内同域链接不加（保持 URL 干净）。
  // 加之前先剥掉已有的 lang/theme，避免切语言时叠加出 ?lang=en&lang=zh。
  function appendParams() {
    var qs = '';
    try { qs = location.search || ''; } catch (e) {}
    var qLang = (/(?:^|[?&])lang=(zh|en)(?:&|$)/.exec(qs) || [])[1];
    var qTheme = (/(?:^|[?&])theme=(dark|light)(?:&|$)/.exec(qs) || [])[1];
    var curLang = qLang || (root.getAttribute('data-lang') === 'en' ? 'en' : 'zh');
    var curTheme = qTheme || (root.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    var host = location.hostname;
    var endsWithSpecul = /(^|\.)specul\.com$/.test(host) || host === 'specul.com';
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#') continue;
      var u;
      try { u = new URL(href, location.href); } catch (e) { continue; }
      // 只处理跨站（specul.com 家族内、但 host 不同）的链接
      var targetIsSpecul = /(^|\.)specul\.com$/.test(u.hostname);
      if (!targetIsSpecul) continue;
      if (u.hostname === host) continue;
      if (!endsWithSpecul) {
        // 本地开发（127.0.0.1 / localhost）也照样加，便于用探针验证行为
      }
      u.searchParams.set('lang', curLang);
      u.searchParams.set('theme', curTheme);
      a.setAttribute('href', u.toString());
    }
  }
  appendParams();

  if (langBtn) {
    langBtn.addEventListener('click', function () {
      applyLang(root.lang === 'en' ? 'zh' : 'en');
      // 切换后必须重算跨站链接参数 ——
      // 否则链接上仍是切之前的 ?lang=，点了别的站语言又跳回去。
      appendParams();
    });
  }
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      applyTheme(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
      appendParams();
    });
  }
})();

/* ══════════════════════════════════════════════════════════════════════
   B6（2026-10-09）· 移动端导航抽屉（共享行为）
   ──────────────────────────────────────────────────────────────────────
   来源：首页 S2 的页面内联 IIFE。提升到 brand.js 后，**六站是同一份实现**：
   页面只要按 .nav-burger / .nav-scrim / .nav-drawer 的结构写标记即可，
   不需要各自的脚本。

   两个细节值得留着：
   · 打开时锁 body 滚动，否则在抽屉上滑动会带着页面一起滚
   · 无脚本时**不能**把导航藏进抽屉（<button> 点了没反应）—— 所以这里给
     <html> 加 .js-on，CSS 只在 .js-on 存在时才显示汉堡、否则在窄屏放出 .nav-links
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  var root = document.documentElement;
  var burger = document.querySelector('.nav-burger');
  var drawer = document.querySelector('.nav-drawer');
  var scrim = document.querySelector('.nav-scrim');
  var close = document.querySelector('.nav-dclose');
  var more = document.querySelector('.nav-tabbar [aria-controls]');
  if (!burger || !drawer) return;
  root.classList.add('js-on');

  function set(open) {
    drawer.classList.toggle('open', open);
    if (scrim) scrim.classList.toggle('open', open);
    drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (more) more.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
  }
  function toggle() { set(!drawer.classList.contains('open')); }
  burger.addEventListener('click', toggle);
  if (more) more.addEventListener('click', toggle);
  if (close) close.addEventListener('click', function () { set(false); });
  if (scrim) scrim.addEventListener('click', function () { set(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
  Array.prototype.forEach.call(drawer.querySelectorAll('a'), function (a) {
    a.addEventListener('click', function () { set(false); });
  });
})();
