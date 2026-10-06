// 生成 nav 独立站静态文件（复用统一骨架 shell.mjs，保证品牌一致）
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'C:/Users/chenhua/Desktop/specul/_data/nav';
const SITE = path.join(BASE, 'site');
const SPECUL = 'C:/Users/chenhua/Desktop/specul';

const { shell, esc } = await import(
  'file:///' + path.join(SPECUL, '_sites/_template/shell.mjs').replace(/\\/g, '/')
);

const data = JSON.parse(fs.readFileSync(path.join(BASE, 'nav-data.json'), 'utf8'));
// 分类英文表（2026-10-04）。缺失或键不匹配时静默回退到中文，
// 所以下面有 build 时的一致性校验。
// 产品名英文映射（2026-10-04）。这批是中国产品，英文页面保留中文名并并列官方英文名，
// 而不是把中文名意译掉（"通义千问" ≠ "Tongyi Thousand Questions"）。
// 缺键时回退到中文名 —— 那是可接受降级，不报错。
// 标签英文映射（2026-10-04）。只覆盖 Top 120 高频标签 ——
// 861 个不重复标签里617 个只出现 1 次，长尾不做（缺键回退中文，可接受）。
// 技术术语沿用业界通用说法（RAG/GPT/DeFi 原样），厂商名不译。
// 卡片描述英文（2026-10-04）。分批人工翻译，每批约 50 条。
// 键 = 条目的 n（产品名）。未译的键回退中文描述 —— 那是可接受降级，
// 但会「中英混排」显得不齐，所以下面按覆盖率给进度提示。
const DESC_EN = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(BASE, 'descriptions.en.json'), 'utf8'));
  } catch (e) {
    console.warn('  ! descriptions.en.json 读不到：' + e.message);
    return {};
  }
})();
const TAG_EN = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(BASE, 'tags.en.json'), 'utf8'));
  } catch (e) {
    console.warn('  ! tags.en.json 读不到，标签保持中文：' + e.message);
    return {};
  }
})();
const VENDOR_EN = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(BASE, 'vendors.en.json'), 'utf8'));
  } catch (e) {
    console.warn('  ! vendors.en.json 读不到，产品名保持中文：' + e.message);
    return {};
  }
})();
const CAT_EN = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(BASE, 'categories.en.json'), 'utf8'));
  } catch (e) {
    console.warn('  ! categories.en.json 读不到，分类名会用中文：' + e.message);
    return {};
  }
})();
const check = JSON.parse(fs.readFileSync(path.join(BASE, 'check-results.json'), 'utf8'));
/* ⚠ 2026-10-05：TODAY 之前硬编码 '2026-09-30' —— 页面写「链接核验于 2026-09-30」，
 *   但 check-results.json 可能已是更新的核验。**页面声称的核验日期与实际数据不符
 *   = 假出处**（v3 铁律：核验快照必须可回溯）。改为读核验产物的真实时间戳。
 *   口径：unknown（探测失败）不算「核过」，文案里分开写探测数与确认存活数。*/
const CHECK_AT = String(check.at || '').slice(0, 10) || '未知';
const CHECK_N = Number(check.checked || 0);
const CHECK_OK_N = (check.results || []).filter(r => r.v === 'ok' || r.v === 'blocked').length;
const TODAY = CHECK_AT;

// 核验结论：只有明确 404/410 判失效；DNS 失败标待确认（沙箱限制，不能当死链）
const verdict = {};
for (const r of check.results) verdict[r.u] = r;
function linkState(u) {
  const r = verdict[u];
  if (!r) return { cls: '', note: '' };
  /* ⚠ 2026-10-05：note 之前是纯中文，英文态会露出「待确认」三个字
   *（探针 i18n-render-audit 抓到1 处 .c-warn）。
   * ⚠ nav 构建器**没有 bi() 辅助函数** —— 它用内联 <span data-zh>/<span data-en>，
   *   这里必须照它的写法，不能照其他站的 bi()。*/
  const biSpan = (zh, en) => `<span data-zh>${esc(zh)}</span><span data-en>${esc(en)}</span>`;
  if (r.v === 'dead' && (r.s === 404 || r.s === 410)) return { cls: 'is-dead', note: biSpan('链接失效', 'link dead') };
  if (r.v === 'dead') return { cls: 'is-maybe', note: biSpan('待确认', 'unverified') };
  return { cls: '', note: '' };
}

// 展示 AI 相关分类；ext（链/币/游戏）不进站，仅在仓库 content/ 留档
const cats = data.categories.filter((c) => c.code !== 'ext');
const items = data.items.filter((i) => i.cat !== 'ext');

fs.mkdirSync(SITE, { recursive: true });

// ---- 卡片 ----
function card(it) {
  const st = linkState(it.u);
  const tags = (it.tag || '').split('·').filter(Boolean);
  const searchBlob = `${it.n} ${it.d} ${it.tag}`.toLowerCase();
  return `          <a class="card${st.cls ? ' ' + st.cls : ''}" href="${esc(it.u)}" target="_blank" rel="noopener" data-cat="${it.cat}" data-blob="${esc(searchBlob)}">
            <span class="c-ic" aria-hidden="true">${esc(it.ic || '◈')}</span>
            <span class="c-nm"><span data-zh>${esc(it.n)}</span>${VENDOR_EN[it.n] ? `<span data-en>${esc(VENDOR_EN[it.n])}</span>` : ''}</span>
            <span class="c-ds"><span data-zh>${esc(it.d)}</span><span data-en>${esc(DESC_EN[it.n] || it.d)}</span></span>
${tags.length ? `            <span class="c-tg">${tags.map((t) => {
          const en = TAG_EN[t];
          const hasCJK = /[\u4e00-\u9fff]/.test(t);
          // 无映射且原值纯英文 → 直接输出（英文态显示它本身，正确）
          if (!en) return `<i>${esc(t)}</i>`;
          // 有映射且不含中文 → 只输出一次（GPT→GPT，否则会出现「GPTGPT」）
          if (en === t && !hasCJK) return `<i>${esc(t)}</i>`;
          // 其余情况（含 identity 映射的中文标签如「A/B测试」）→ 必须双语包裹。
          // 否则英文态因为没有 data-en 可切换，会继续显示中文（实测渲染态 1 处残留）。
          return `<i><span data-zh>${esc(t)}</span><span data-en>${esc(en)}</span></i>`;
        }).join('')}</span>\n` : ''}${st.note ? `            <span class="c-warn">${st.note}</span>\n` : ''}          </a>`;
}

// ---- 「零中文」检查：英文态是否还有中文产品名 ----
// 用户要求：英文页面尽可能不要出现中文。有中文名但无英文映射的条目
// 在英文态会直接露出中文 —— 必须 warn，不能静默通过。
{
  const CJK = /[\u4e00-\u9fff]/;
  const listed = data.items.filter(x => x.cat !== 'ext');
  const leaked = listed.filter(x => CJK.test(x.n) && !VENDOR_EN[x.n]);
  if (leaked.length) {
    console.warn('  ! 英文态会显示中文的条目（' + leaked.length + ' 条，缺 vendors.en.json 映射）:');
    leaked.slice(0, 10).forEach(x => console.warn('      ' + x.n));
    if (leaked.length > 10) console.warn('      …… 另有 ' + (leaked.length - 10) + ' 条');
  } else {
    console.log('  · 零中文检查：' + listed.length + ' 条产品名在英文态均可显示英文 ✓');
  }
}

// ---- 描述英文覆盖率（进度指标）----
{
  const listed = data.items.filter(x => x.cat !== 'ext');
  const hit = listed.filter(x => DESC_EN[x.n]).length;
  const rate = listed.length ? Math.round(hit / listed.length * 100) : 0;
  console.log('  · 描述英文覆盖：' + rate + '%（' + hit + ' / ' + listed.length + ' 条在站条目）');
}

// ---- 标签英文覆盖率（不是键一致，标签是开放式的）----
// 缺键 → 回退中文，可接受。要看的是命中率，低于 50% 才提示。
{
  const counts = {};
  data.items.forEach(x => {
    // 拆分口径必须与渲染一致（renderCard 只按 · 拆）——
    // 检查器多拆了 / 、 ， → 报出 1 个假缺口（A/B测试 被拆成 A 与 B测试）。
    String(x.tag || '').split('·').map(s => s.trim()).filter(Boolean)
      .forEach(tg => { counts[tg] = (counts[tg] || 0) + 1; });
  });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const hit = Object.entries(counts).filter(([k]) => TAG_EN[k]).reduce((a, [, v]) => a + v, 0);
  const rate = total ? Math.round(hit / total * 100) : 0;
  // 零中文检查：中文标签在英文态会露出中文，必须 warn。
  // ⚠ **只算在站条目（cat !== 'ext'）** —— ext 是延伸领域（加密货币等），
  //   页面上一条都不显示。原先用全量 counts 导致 160 个 ext 标签误报。
  const inCounts = {};
  data.items.filter(x => x.cat !== 'ext').forEach(x => {
    String(x.tag || '').split(/[·、,，\/]/).map(s => s.trim()).filter(Boolean)
      .forEach(tg => { inCounts[tg] = (inCounts[tg] || 0) + 1; });
  });
  const cnMiss = Object.keys(inCounts).filter(k => /[\u4e00-\u9fff]/.test(k) && !TAG_EN[k]);
  if (cnMiss.length) {
    console.warn('  ! 标签英文态会显示中文：' + cnMiss.length + ' 个未映射（在站条目内）');
    console.warn('      ' + cnMiss.slice(0, 8).join(', ') + (cnMiss.length > 8 ? ' ……' : ''));
  } else {
    console.log('  · 标签零中文：' + Object.keys(inCounts).length + ' 种在站标签均可显示英文 ✓');
  }
  console.log('  · 标签英文覆盖：' + rate + '%（' + hit + ' / ' + total + ' 次出现）');
  if (rate < 30) console.warn('  ! 标签英文覆盖率偏低（' + rate + '%），检查 tags.en.json');
}

// ---- 分类中英文键一致性校验（2026-10-04）----
// 少一个键 → 该分类英文态回退到中文，且不报错。宁可在构建时报出来。
{
  const zhKeys = data.categories.map(c => (typeof c === 'string' ? c : c.code)).sort();
  const enKeys = Object.keys(CAT_EN).filter(k => !k.startsWith('_')).sort();
  const missing = zhKeys.filter(k => !enKeys.includes(k));
  const extra = enKeys.filter(k => !zhKeys.includes(k));
  if (missing.length) console.warn('  ! categories.en.json 缺键：' + missing.join(', '));
  if (extra.length)   console.warn('  ! categories.en.json 多余键：' + extra.join(', '));
}

// ---- 分类分组 ----
const groups = cats
  .map((c) => {
    const list = items.filter((i) => i.cat === c.code);
    if (!list.length) return '';
    // 双语节点：nav 是静态站点，语言切换只切<html lang>/data-lang（brand.js），
    // **DOM 不重渲染** → 必须在 HTML 里同时给出中英，由 CSS 按 [data-lang] 选显。
    // 构建期判断语言是错的（那样只能生成一种，构建后无法切换）。
    var cn = CAT_EN[c.code] || {};
    return `      <section class="cat-group" data-cat="${c.code}">
        <h2 class="cat-h"><span class="cat-dot" aria-hidden="true"></span><span data-zh>${esc(c.name)}</span><span data-en>${esc(cn.name || c.name)}</span><em>${list.length}</em></h2>
        <p class="cat-sub"><span data-zh>${esc(c.desc)}</span><span data-en>${esc(cn.desc || c.desc)}</span></p>
        <div class="grid">
${list.map(card).join('\n')}
        </div>
      </section>`;
  })
  .filter(Boolean)
  .join('\n');

const chips = ['<button class="chip is-on" data-cat="all">'
  + '<span data-zh>全部</span><span data-en>All</span>'
  + '<em>' + items.length + '</em></button>']
  .concat(
    cats
      .filter((c) => items.some((i) => i.cat === c.code))
      .map((c) => {
        const n = items.filter((i) => i.cat === c.code).length;
        var cn = CAT_EN[c.code] || {};
        return '<button class="chip" data-cat="' + esc(c.code) + '">'
          + '<span data-zh>' + esc(c.name) + '</span>'
          + '<span data-en>' + esc(cn.name || c.name) + '</span>'
          + '<em>' + n + '</em></button>';
      })
  )
  .join('\n        ');

const body = `    <section class="section hero">
      <div class="container">
        <p class="eyebrow">SPECUL · DIRECTORY</p>
        <h1 class="h1"><span data-zh>硅基导航</span><span data-en>Silicon Directory</span></h1>
        <p class="lede">系统化收录 <strong>${items.length}</strong> 个 AI 相关网站，按 ${cats.length} 类组织。每条附一句话说明与链接核验状态。</p>
        <p class="t-sm dim"><span data-zh>数据来源：公开的站点官方信息，逐条人工整理；链接最近核验于 ${CHECK_AT}（本次探测 ${CHECK_N} 个域名，${CHECK_OK_N} 个确认存活）。本页为索引与引述，不替代各站点官方文档。</span><span data-en>Sourcing: public official site information, compiled by hand; links last checked on ${CHECK_AT} (${CHECK_N} domains probed, ${CHECK_OK_N} confirmed live). This page is an index and does not replace each site's own documentation.</span></p>
      </div>
    </section>

    <section class="section" id="dir">
      <div class="container">
        <div class="controls">
          <label class="sr-only" for="q"><span data-zh>搜索</span><span data-en>Search</span></label>
          <input id="q" type="search" placeholder="搜索站名、说明或标签…" autocomplete="off" />
          <div class="chips">
        ${chips}
          </div>
        </div>
        <p id="empty" class="empty" hidden>没有匹配的条目。</p>

${groups}
      </div>
    </section>`;

const html = shell({
  current: 'nav',
  title: '硅基导航 · AI 网站目录 | 投机取巧',
  desc: `系统化收录 ${items.length} 个 AI 相关网站，按 ${cats.length} 类组织，每条附一句话说明与链接核验状态。`,
  canonical: 'https://nav.specul.com/',
  accent: '#22d3c5',
  body,
  repo: 'https://github.com/speculcom/ai-sites-directory',
  repoLabel: 'GitHub',
  headExtra: '',
});

// 注入交互脚本（放在 shell 末尾的 </body> 前）
const script = `
  <script>
    (function () {
      var q = document.getElementById('q');
      var empty = document.getElementById('empty');
      var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));
      var cards = Array.prototype.slice.call(document.querySelectorAll('.card'));
      var groups = Array.prototype.slice.call(document.querySelectorAll('.cat-group'));
      var activeCat = 'all';

      function apply() {
        var term = (q.value || '').trim().toLowerCase();
        var shown = 0;
        cards.forEach(function (c) {
          var okCat = activeCat === 'all' || c.getAttribute('data-cat') === activeCat;
          var okQ = !term || c.getAttribute('data-blob').indexOf(term) !== -1;
          var on = okCat && okQ;
          c.hidden = !on;
          if (on) shown++;
        });
        groups.forEach(function (g) {
          var has = Array.prototype.slice.call(g.querySelectorAll('.card')).some(function (c) { return !c.hidden; });
          g.hidden = !has;
        });
        empty.hidden = shown !== 0;
      }

      function setCat(cat) {
        activeCat = cat || 'all';
        chips.forEach(function (x) {
          x.classList.toggle('is-on', x.getAttribute('data-cat') === activeCat);
        });
      }

      q.addEventListener('input', apply);
      chips.forEach(function (b) {
        b.addEventListener('click', function () {
          setCat(b.getAttribute('data-cat'));
          apply();
        });
      });

      // 支持深链：nav.specul.com/#coding 直接筛到该分类
      function fromHash() { setCat((location.hash || '').replace('#', '')); }
      window.addEventListener('hashchange', function () { fromHash(); apply(); });
      fromHash();
      apply();
    })();
  </script>
`;

const final = html.replace('</body>', script + '</body>');
fs.writeFileSync(path.join(SITE, 'index.html'), final, 'utf8');

// ---- site.css：沿用图谱站已调好的基础，再追加目录站特有样式 ----
// 2026-10-03改：原先读 `_sites/ide/site.css`（旧 IDE 站产物，随 v4 废弃一起删了）。
// 真相源一直是 `_sites/_template/site.css` —— 各站那几份都是构建时从它复制的副本。
let css = fs.readFileSync(path.join(SPECUL, '_sites/_template/site.css'), 'utf8');
css += `

/* ===== 硅基导航 · 目录站特有 ===== */
/* 2026-10-03：原 padding-top: 3rem(48px) + 后续 .cat-group 的 --section-pad(40px)
   叠加 → 实测首屏空白带 176px（y=296~472）。改用全站同一档。 */
.hero { padding: var(--section-pad) 0 var(--sp-3); }
.eyebrow { font-size: 12px; letter-spacing: .18em; color: var(--ink-mid); margin: 0 0 .5rem; }
/* 2026-10-03：原 clamp(2rem,5vw,3.4rem) → 3.4rem = 54.4px（非整数）。
   接入全站 --display-sub 档，与其它站同一尺度。 */
.h1 { font-size: var(--display-sub); line-height: 1.1; margin: 0 0 .75rem; }
.lede { font-size: 15px; color: var(--ink-mid); max-width: var(--measure); margin: 0 0 .5rem; }
.dim { opacity: .8; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

/* 筛选区 —— 2026-10-03：原margin: 1.5rem 0 2rem（56px）+
   section的 padding-top 40px = 96px，实测首屏空白带 152px。
   筛选区属于「工具条」而非内容区块，不该吃内容区块的留白档。 */
.controls { margin: var(--sp-3) 0 var(--sp-4); }
#q {
  width: 100%; max-width: 460px; padding: .7rem .9rem; font: inherit;
  border: 1px solid var(--border, rgba(127,127,127,.35)); border-radius:var(--r-sm);
  background: var(--bg-raise, rgba(127,127,127,.08)); color: inherit;
}
#q:focus-visible { outline: 2px solid var(--cyan, #22d3c5); outline-offset: 2px; }

.chips { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .9rem; }
.chip {
  display: inline-flex; align-items: center; gap: .4rem;
  padding: .35rem .75rem; font: inherit; font-size: 13px; cursor: pointer;
  border: 1px solid var(--border, rgba(127,127,127,.35)); border-radius: 999px;
  background: transparent; color: var(--ink-mid);
}
.chip em { font-style: normal; opacity: .6; font-size: 11px; }
.chip:hover { border-color: var(--cyan, #22d3c5); color: inherit; }
.chip.is-on { background: var(--cyan, #22d3c5); border-color: var(--cyan, #22d3c5); color: #04121a; }
.chip.is-on em { opacity: .75; }

/* 分类分组 —— 2026-10-03：按分类上色 + 留白收进统一档。
   原先 11 个分类的圆点全是同一个 var(--accent)，分类之间毫无区分，
   只能靠「2.5rem 的上下留白 + 一个小圆点」分组 —— 这正是留白多的来源。
   现在：圆点取分类色 + 区块左侧色条 + 徽章，三重标识，margin 收到 --section-pad。 */
/* 站点强调色 · nav 导航 — 绿（索引、检索）
   2026-10-03：原先只加在产物 site.css 上，重建就被覆盖 → 必须写进生成器。
   暗色绿配深色前景 9.9:1；亮色绿配白字 5.4:1。 */
/* 作用域限定为「有分类分组的页面」。
   查证结论：nav 的 site.css = 模板 site.css（readFileSync 读入）+ 本文件的追加段，
   而分类色板与 .cat-group 都只存在于本追加段里，模板与agent 真相源都没有 ——
   所以当前**不存在**绿色泄漏到 agent 的风险。
   仍然加限定：防将来有人把这段搬进模板时静默污染另一个站。
   代价为零（本文件只用于 nav 站，:has(.cat-group) 必然命中）。 */
:root:has(.cat-group):not([data-theme="light"]) {
  --brand: #5ddc9a; --brand-on: #04210f;
  --brand-soft: rgba(93, 220, 154, .14); --brand-line: rgba(93, 220, 154, .34);
}
:root:has(.cat-group)[data-theme="light"] {
  --brand: #0f7a52; --brand-on: #ffffff;
  --brand-soft: rgba(15, 122, 82, .10); --brand-line: rgba(15, 122, 82, .30);
}

.cat-group { margin: var(--section-pad) 0; }
/* 第一个分组紧跟 hero，属于同一组内容，不该再吃一份 40px 上边距 —— */
.chips + .cat-group { margin-top: var(--sp-3); }
.cat-h { display: flex; align-items: center; gap: .6rem; font-size: var(--fs-xl); margin: 0 0 var(--sp-2); }
.cat-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--cat-c, var(--accent)); flex-shrink: 0; }
.cat-h em { font-style: normal; font-size: var(--fs-micro); opacity: .6; font-variant-numeric: tabular-nums; }
/* 分组说明紧贴卡片组 —— 现代派判据：标题与它所辖内容之间不留空带。
   原 margin-bottom: var(--sp-3) 叠加 grid 行gap 后，
   .cat-sub 与首行卡片之间实测隔 152px（y=288~440），分组感被空白冲淡。 */
.cat-sub { margin: var(--sp-1) 0 var(--sp-2); font-size: var(--fs-sm); color: var(--ink-mid); }
/* 分类色板：11 个分类用 6 组色，按「两组错位」分配 ——
   直接 i%6 会让第 1 与第 7 个分类撞色且**相邻出现**，读起来像渐变。
   这里 A=[0..5]、B=[3,4,5,0,1,2]（旋转 3 位），保证任两个相邻分类都不同色。 */
[data-cat="llm"]       { --cat-c: var(--c-layer); --cat-soft: var(--c-layer-soft); }
[data-cat="coding"]    { --cat-c: var(--c-form);  --cat-soft: var(--c-form-soft); }
[data-cat="gen"]       { --cat-c: var(--c-use);   --cat-soft: var(--c-use-soft); }
[data-cat="app"]       { --cat-c: var(--c-quant); --cat-soft: var(--c-quant-soft); }
[data-cat="model"]     { --cat-c: var(--c-class); --cat-soft: var(--c-class-soft); }
[data-cat="dev"]       { --cat-c: var(--c-state); --cat-soft: var(--c-state-soft); }
[data-cat="infra"]     { --cat-c: var(--c-quant); --cat-soft: var(--c-quant-soft); }
[data-cat="robot"]     { --cat-c: var(--c-class); --cat-soft: var(--c-class-soft); }
[data-cat="learn"]     { --cat-c: var(--c-state); --cat-soft: var(--c-state-soft); }
[data-cat="community"] { --cat-c: var(--c-layer); --cat-soft: var(--c-layer-soft); }
[data-cat="tools"]     { --cat-c: var(--c-form);  --cat-soft: var(--c-form-soft); }

/* 筛选 chip 与分组同色 —— 点「coding」时页面上 coding 分组的圆点和色条也是同一色，
   筛选与内容形成视觉对应，不用读文字就知道筛的是哪一类。
   无障碍：chip 文字始终存在，颜色只是辅助。 */
.chip[data-cat]:not([data-cat="all"]) { color: var(--cat-c, var(--ink-mid)); }
.chip[data-cat]:not([data-cat="all"])::before {
  content: ""; width: 6px; height: 6px; border-radius: 50%;
  background: currentColor; flex-shrink: 0;
}
.chip[data-cat]:not([data-cat="all"]).is-on {
  background: var(--cat-soft, var(--brand-soft));
  border-color: var(--cat-c, var(--brand-line));
}

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: .85rem; }
.card {
  display: flex; flex-direction: column; gap: .35rem;
  padding: .9rem 1rem; border-radius:var(--r); text-decoration: none; color: inherit;
  border: 1px solid var(--border, rgba(127,127,127,.28));
  background: var(--bg-panel, rgba(127,127,127,.06));
  transition: transform .18s ease, border-color .18s ease;
}
.card:hover { transform: translateY(-2px); border-color: var(--cyan, #22d3c5); }
.c-ic { font-size: 18px; line-height: 1; }
.c-nm { font-weight: 500; font-size: 15px; }
/* 产品名（2026-10-04 改）
   原方案是「中文名 + 官方英文名并列」，但**并列会让英文页面上出现汉字** ——
   用户明确要求英文页面尽可能不出现中文，所以改为互斥：
     中文态 → 中文名；英文态 → 只显示官方英文名。
   显隐由 brand.css 的 [data-lang] 规则统一管，这里不要自己写 display。 */
.c-ds { font-size: 13px; color: var(--ink-mid); line-height: 1.5; }
.c-tg { display: flex; flex-wrap: wrap; gap: .3rem; margin-top: auto; padding-top: .4rem; }
.c-tg i {
  font-style: normal; font-size: 11px; padding: .1rem .45rem; border-radius: 999px;
  background: rgba(127,127,127,.16); color: var(--ink-mid);
  display: inline-flex; align-items: baseline; gap: .3em;
}
/* 标签的双语：与全站一致用 data-zh / data-en 属性，
   显隐由 brand.css 的 [data-lang] 规则统一管（不要自己写 display）。
   ⚠ 之前这里用 <b> 存英文 → brand.css 管不到 → 英文态下中文没隐藏，
   实测出现「多模态Multimodal」「GPTGPT」。 */
.c-tg i span { white-space: nowrap; }
/* 中文态下两者并列（顺带让用户看到英文术语），用间隔符隔开 */
.c-tg i span[data-zh]::after {
  content: " ";
}
html[data-lang="zh"] .c-tg i span[data-en] { margin-left: .35em; }
.c-warn { font-size: 11px; color: var(--red, #e24b4a); }
.card.is-dead { opacity: .55; }
.card.is-maybe { opacity: .8; }
.empty { padding: 2rem 0; color: var(--ink-mid); }

@media (max-width: 560px) {
  .grid { grid-template-columns: 1fr; }
}
`;
fs.writeFileSync(path.join(SITE, 'site.css'), css, 'utf8');

// ---- 品牌资源与其他文件 ----
// 2026-10-03 改：原先从 `_sites/ide/` 拷 brand.* —— 那目录是旧 IDE 站的构建产物，
// 随 v4 废弃一起删了，**而这份脚本没跟着改**，于是整个 nav 建站流程直接ENOENT 崩掉。
// 品牌外壳的真相源是 `www.specul/brand.css` + `brand.js`（改完须跑 `sync-brand.mjs`）。
// ⚠ 教训：grep 单一路径模式会漏 —— 我第一次只 grep 到 site.css 那行就以为改完了，
//   实际同文件第 234 行还有一个 copyFileSync 指向同一目录，跑到那一步才炸。
for (const f of ['brand.css', 'brand.js']) {
  fs.copyFileSync(path.join(SPECUL, 'www.specul', f), path.join(SITE, f));
}
fs.writeFileSync(path.join(SITE, 'CNAME'), 'nav.specul.com\n', 'utf8');
// .nojekyll：GitHub Pages 默认会跑 Jekyll，把`_` 开头的目录当构建输入丢掉，
// 且构建失败时报错信息极少（线上仍能访问**旧产物**，极易误判成「构建中」）。
// 全站其余5 个站都有这个文件，只有 nav 站漏了—— 2026-10-03 全站审计查出。
// ⚠ 写进构建器而不是手动补文件：手补的下次重建就没了
// （models 站的 brand.js 就踩过这个坑，构建产物会覆盖手动同步的结果）。
fs.writeFileSync(path.join(SITE, '.nojekyll'), '', 'utf8');
fs.writeFileSync(
  path.join(SITE, 'robots.txt'),
  'User-agent: *\nAllow: /\n\nSitemap: https://nav.specul.com/sitemap.xml\n',
  'utf8'
);
fs.writeFileSync(
  path.join(SITE, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://nav.specul.com/</loc><lastmod>${TODAY}</lastmod></url>
</urlset>
`,
  'utf8'
);

console.log('=== nav 站已生成 ===');
console.log(`  条目 ${items.length} 条 · 分类 ${cats.length} 类（已排除延伸领域 ${data.items.length - items.length} 条）`);
console.log(`  index.html ${(fs.statSync(path.join(SITE, 'index.html')).size / 1024).toFixed(0)} KB`);
console.log(`  输出目录 ${SITE}`);
