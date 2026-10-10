import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// 生成 nav 独立站静态文件（复用统一骨架 shell.mjs，保证品牌一致）

const BASE = HERE;
const SITE = path.join(BASE, 'site');
const SPECUL = path.resolve(HERE, '..', '..');
/* 品牌资产来源（铁律 R3）：优先本仓 brand/ 的 vendored 副本，回退主仓。
 * 原来无条件用 <主仓>/_sites/_template 与 <主仓>/www.specul，
 * 克隆 ai-sites-directory 的人没有这些目录，构建第一步就 ENOENT。 */
const VENDORED = path.join(BASE, 'brand');
const TEMPLATE = fs.existsSync(path.join(VENDORED, 'shell.mjs'))
  ? VENDORED
  : path.join(SPECUL, '_sites', '_template');
const WWWBRAND = fs.existsSync(path.join(VENDORED, 'brand.css'))
  ? VENDORED
  : path.join(SPECUL, 'www.specul');

const { shell, esc } = await import(
  'file:///' + path.join(TEMPLATE, 'shell.mjs').replace(/\\/g, '/')
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
/* 确认存活 = ok + blocked（反爬但活着）+ changed（已改址仍可达）—— 与 check-links 的终态口径一致 */
const CHECK_OK_N = (check.results || []).filter(r => r.v === 'ok' || r.v === 'blocked' || r.v === 'changed').length;
const CHECK_DEAD_N = (check.results || []).filter(r => r.v === 'dead').length;
const CHECK_UNVER_N = (check.results || []).filter(r => r.v === 'unverifiable' || r.v === 'unknown').length;
const TODAY = CHECK_AT;

// 核验结论：只有明确 404/410 判失效；unverifiable（探测受限）不是死链
const verdict = {};
for (const r of check.results) verdict[r.u] = r;
/* 双语行内节点。**模块级**（B4 才发现它原先只定义在 linkState 里，
 * 于是 body 模板里用它直接 ReferenceError）。 */
const biSpan = (zh, en) => `<span data-zh>${esc(zh)}</span><span data-en>${esc(en)}</span>`;

function linkState(it) {
  /* ⚠ 2026-10-08（A4.1.4）：`retired: true` = 人工核实确认停运（被收购/服务关闭）。
   * 来源是外部检索的独立证据，不是探针结论 —— 所以**记在数据里**，与 check-results 分开。
   * 渲染为 is-dead（不可点，见 card()），徽标用「已停运」而不是「链接失效」——
   * 前者是事实，后者只是断链现象。 */
  if (it.retired) return { cls: 'is-dead', note: biSpan('已停运', 'shut down') };
  const r = verdict[it.u];
  if (!r) return { cls: '', note: '' };
  /* ⚠ 2026-10-05：note 之前是纯中文，英文态会露出「待确认」三个字
   *（探针 i18n-render-audit 抓到1 处 .c-warn）。
   * ⚠ nav 构建器**没有 bi() 辅助函数** —— 它用内联 <span data-zh>/<span data-en>，
   *   这里必须照它的写法，不能照其他站的 bi()。
   * ⚠ 2026-10-08（A4.1 状态机）：dead 现在**只**表示 404/410。探测受限
   *   （unverifiable：DNS/超时/TLS/被墙，400+ 条）与 changed（已改址，链接触发跳转）
   *   一律不打徽标 —— 前者不是死链，全标「待确认」只是噪声；后者链接可用。
   *   下面第二条 dead 分支是旧快照的防御（非 404 的 dead 按待确认处理）。 */
  if (r.v === 'dead' && (r.s === 404 || r.s === 410)) return { cls: 'is-dead', note: biSpan('链接失效', 'link dead') };
  if (r.v === 'dead') return { cls: 'is-maybe', note: biSpan('待确认', 'unverified') };
  return { cls: '', note: '' };
}

// 展示 AI 相关分类；ext（链/币/游戏）不进站，仅在仓库 content/ 留档
const cats = data.categories.filter((c) => c.code !== 'ext');
const items = data.items.filter((i) => i.cat !== 'ext');

fs.mkdirSync(SITE, { recursive: true });

// ---- 卡片 ----
/* ⚠ 2026-10-08（A4.1.4）：**确认失效（404/410）的条目不再渲染成链接**。
 * 原来一律 `<a href>` + is-dead 徽标，卡片变灰但**仍可点击**，点开落到 DNS 错误页 ——
 * 「站内无 404 外链」的验收做不到。现在 is-dead 渲染为 <div>（无 href）：
 * 徽标「链接失效」照旧，卡片保留在目录里作为记录，但不可点。
 * is-maybe（DNS 待确认）**保持可点** —— 探测不了不等于死了，不能误伤。 */
/* B1（2026-10-09）：条目级锚点 id。
 * 用条目名做 id（nav 的 validate.mjs 保证**对外**条目名唯一），去掉空格与标点，
 * 保留字母 / 数字 / 汉字。撞名时加序号兜底（例如「A/B」与「AB」会被归一成同一个 base）——
 * 有兜底就不必让构建依赖「名字永远不撞」，但**同一份数据构建两次结果一致**（确定性）。 */
const ANCHOR_SEEN = new Map();
function anchorId(name) {
  let base = 'i-' + String(name).toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]+/gu, '');
  if (base === 'i-' || base === 'i-') base = 'i-item';
  const n = (ANCHOR_SEEN.get(base) || 0) + 1;
  ANCHOR_SEEN.set(base, n);
  return n === 1 ? base : base + '-' + n;
}

function card(it) {
  const st = linkState(it);
  const tags = (it.tag || '').split('·').filter(Boolean);
  const searchBlob = `${it.n} ${it.d} ${it.tag}`.toLowerCase();
  const dead = st.cls === 'is-dead';
  const tag = dead ? 'div' : 'a';
  const linkAttrs = dead ? '' : ` href="${esc(it.u)}" target="_blank" rel="noopener"`;
  /* B2（2026-10-09）：`data-tags` 供标签筛选用 —— 存**拆分后的标签**（空格分隔），
   * 不是原始串。分类筛选看 data-cat，标签筛选看它，两者独立、可叠加。 */
  return `          <${tag} class="card${st.cls ? ' ' + st.cls : ''}" id="${anchorId(it.n)}"${linkAttrs} data-cat="${it.cat}" data-tags="${esc(tags.join(' '))}" data-blob="${esc(searchBlob)}">
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
        }).join('')}</span>\n` : ''}${st.note ? `            <span class="c-warn">${st.note}</span>\n` : ''}          </${tag}>`;
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

/* B2（2026-10-09）：标签筛选下拉。
 * 选项 = **在站条目实际用到的标签**（不是整个词表 —— 词表里 unused 的标签放进来就是死选项）。
 * 按出现次数降序（常用的在前），标签数相同时按词表顺序，保证**产物确定**。
 * ⚠ `<option>` 里不能放 HTML（浏览器只按纯文本渲染），所以标签英文用「中文 / English」纯文本。 */
const tagCount = {};
for (const i of items) for (const t of String(i.tag || '').split('·').map((x) => x.trim()).filter(Boolean)) tagCount[t] = (tagCount[t] || 0) + 1;
const tagList = Object.keys(tagCount).sort((a, b) => (tagCount[b] - tagCount[a]) || a.localeCompare(b, 'zh'));
const tagSelect = `<label class="sr-only" for="tag"><span data-zh>按标签筛选</span><span data-en>Filter by tag</span></label>
          <select id="tag" class="tagsel"><option value="">全部标签 / All tags</option>${
  tagList.map((t) => `<option value="${esc(t)}">${esc(t)}${TAG_EN[t] ? ' / ' + esc(TAG_EN[t]) : ''}（${tagCount[t]}）</option>`).join('')
}</select>`;

/* B4（2026-10-09）：按「我想做什么」组织入口。
 * 做法上**不新造一套筛选**，而是链进已有的 `?cat=` 深链（B1/B2 建的）——
 *   这样入口与筛选是同一个真相源，不会出现「入口说 30 条、点进去 27 条」。
 * 数字**从数据算**（items 里该分类的条数），不手写。
 * 只列「意图明确」的分类：把 12 类硬套成 12 个意图反而是噪声。 */
const INTENT = [
  { cat: 'coding', zh: '我想写代码', en: 'I want to write code' },
  { cat: 'gen', zh: '我想做图 / 视频 / 音频', en: 'I want to make images, video or audio' },
  { cat: 'model', zh: '我想挑模型或找权重', en: 'I want to pick a model or find weights' },
  { cat: 'app', zh: '我想找个能直接用的 AI 产品', en: 'I want a ready-to-use AI product' },
  { cat: 'learn', zh: '我想学点东西', en: 'I want to learn something' },
  { cat: 'infra', zh: '我需要算力或硬件', en: 'I need compute or hardware' },
  { cat: 'robot', zh: '我看机器人与具身智能', en: 'I follow robotics and embodied AI' },
  { cat: 'community', zh: '我想跟进行业动态', en: 'I want to keep up with the industry' },
];

const body = `    <section class="section hero">
      <div class="container">
        <p class="eyebrow">SPECUL · DIRECTORY</p>        <h1 class="h1"><span class="grad-title"><span data-zh>硅基导航</span><span data-en>Silicon Directory</span></span></h1>
        <p class="lede">系统化收录 <strong>${items.length}</strong> 个 AI 相关网站，按 ${cats.length} 类组织。每条附一句话说明与链接核验状态。</p>
        <p class="t-sm dim"><span data-zh>数据来源：公开的站点官方信息，逐条人工整理；链接最近核验于 ${CHECK_AT}（快照覆盖 ${CHECK_N} 个域名：${CHECK_OK_N} 个确认存活，${CHECK_DEAD_N} 个已失效，${CHECK_UNVER_N} 个网络受限未能探测——不代表失效）。本页为索引与引述，不替代各站点官方文档。</span><span data-en>Sourcing: public official site information, compiled by hand; links last checked on ${CHECK_AT} (snapshot covers ${CHECK_N} domains: ${CHECK_OK_N} confirmed live, ${CHECK_DEAD_N} dead, ${CHECK_UNVER_N} unreachable from the probe environment — not necessarily dead). This page is an index and does not replace each site's own documentation.</span></p>
      </div>
    </section>

    <section class="section" id="dir">
      <div class="container">
        <div class="controls">
          <label class="sr-only" for="q"><span data-zh>搜索</span><span data-en>Search</span></label>
          <input id="q" type="search" placeholder="搜索站名、说明或标签…" autocomplete="off" />
          ${tagSelect}
          <div class="chips">
        ${chips}
          </div>
        </div>
        <p id="empty" class="empty" hidden>没有匹配的条目。</p>

        <div class="intent">
          <p class="intent-h">${biSpan('或者，直接告诉我你想做什么', 'Or just tell me what you want to do')}</p>
          <div class="intent-grid">
${INTENT.map((it) => {
  const n = items.filter((i) => i.cat === it.cat).length;
  return `            <a class="intent-card" href="?cat=${esc(it.cat)}"><b>${biSpan(it.zh, it.en)}</b><span class="intent-n">${n} ${biSpan('条', 'entries')}</span></a>`;
}).join('\n')}
          </div>
        </div>

${groups}
      </div>
    </section>`;

const html = shell({
  current: 'nav',
  title: '硅基导航 · AI 网站目录 | 投机取巧',
  desc: `系统化收录 ${items.length} 个 AI 相关网站，按 ${cats.length} 类组织：每条附一句话说明、标签、可达性核验状态与官网链接，并按「我想做什么」给出入口。`,
  canonical: 'https://nav.specul.com/',
  /* ⚠ 2026-10-10 不再传 accent（原 '#22d3c5'青色）。
   * 用户定案「不需要分站专属色，整体与首页一致」；brand.css 的 --accent 是
   * var(--brand)，深浅两主题都过 AA ✓ 不传即自动跟随。 */
  accent: null,
  body,
  /* B5（2026-10-09）：结构性数据。CollectionPage + ItemList 的前 20 条 ——
   * 不列全部 527 条（那会让页面体积翻倍），列前 20 条足以表达「这是一份有序目录」。
   * 顺序与页面一致（按分类、再按原顺序），不另排一套。 */
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: '硅基导航 · AI 网站目录',
    url: 'https://nav.specul.com/',
    description: `系统化收录 ${items.length} 个 AI 相关网站，按 ${cats.length} 类组织。`,
    inLanguage: 'zh-Hans',
    isPartOf: { '@type': 'WebSite', name: 'Specul · 投机取巧', url: 'https://specul.com/' },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: items.length,
      itemListElement: items.slice(0, 20).map((it, i) => ({
        '@type': 'ListItem', position: i + 1, name: it.n, url: it.u,
      })),
    },
  },
  repo: 'https://github.com/speculcom/ai-sites-directory',
  repoLabel: 'GitHub',
  headExtra: '',
});

// 注入交互脚本（放在 shell 末尾的 </body> 前）
const script = `
  <script>
    (function () {
      var q = document.getElementById('q');
      var tagSel = document.getElementById('tag');
      var empty = document.getElementById('empty');
      var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));
      var cards = Array.prototype.slice.call(document.querySelectorAll('.card'));
      var groups = Array.prototype.slice.call(document.querySelectorAll('.cat-group'));
      var activeCat = 'all';
      var activeTag = '';

      function apply() {
        var term = (q.value || '').trim().toLowerCase();
        var shown = 0;
        cards.forEach(function (c) {
          var okCat = activeCat === 'all' || c.getAttribute('data-cat') === activeCat;
          /* B2：标签筛选是「该条含这个标签」（多标签条目会被多个标签命中）——
           * 与分类筛选**相互独立、可叠加**。 */
          var okTag = !activeTag || (c.getAttribute('data-tags') || '').split(' ').indexOf(activeTag) !== -1;
          var okQ = !term || c.getAttribute('data-blob').indexOf(term) !== -1;
          var on = okCat && okTag && okQ;
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

      // B1（2026-10-09）：深链支持，两种形式
      //   ?cat=<code>  查询参数（可分享、可被爬虫当规范 URL；选中分类时同步进地址栏）
      //   #<code>      旧形式，保留兼容
      //   #<条目锚点>   指向某一条（点击它不该把整页筛空）
      // ⚠ 歧义必须处理：井号以前被无条件当成分类名（setCat(任意字符串)），
      //   加了条目锚点后，「#chatgpt」会被当成「分类 chatgpt」→ 没有任何卡片匹配 → **整页空白**。
      //   所以只有「确实是已知分类码」时才当分类。
      //   （本注释不能写反引号 —— 整段脚本是模板字符串，反引号会提前把它截断。踩过三次。）
      var CATS = {};
      chips.forEach(function (x) { CATS[x.getAttribute('data-cat')] = 1; });

      function setUrl(cat, replace) {
        try {
          var u = new URL(location.href);
          if (!cat || cat === 'all') u.searchParams.delete('cat');
          else u.searchParams.set('cat', cat);
          /* B2：标签也进地址栏（可与分类叠加，所以是两个独立参数） */
          if (!activeTag) u.searchParams.delete('tag');
          else u.searchParams.set('tag', activeTag);
          u.hash = '';
          history[replace ? 'replaceState' : 'pushState'](null, '', u.toString());
        } catch (e) { /* 老浏览器 / file:// 下静默降级：功能照用，只是地址栏不同步 */ }
      }

      function scrollToAnchor() {
        var id = (location.hash || '').replace('#', '');
        if (!id || CATS[id]) return false;
        var el = document.getElementById(id);
        if (!el) return false;
        setCat('all');           // 先取消分类筛选，否则该条所在的分类组可能是隐藏的
        apply();
        el.scrollIntoView({ block: 'center' });
        return true;
      }

      function deepLink() {
        /* ⚠ 用 URLSearchParams 解析 location.search —— 不能用 new URL(location.search)：
         *   「?cat=coding」不是绝对 URL，构造会抛 Invalid URL（实测），
         *   而我第一版把它包在 try/catch 里 → 异常被吞 → 静默回退到「全部」，
         *   地址栏看着有参数、页面却没筛（探针抓到「点击有效、重开无效」）。
         *   教训：catch 里不要吞掉「本来不该发生」的异常。 */
        var cat = '';
        var tg = '';
        try {
          var sp = new URLSearchParams(location.search);
          cat = sp.get('cat') || '';
          tg = sp.get('tag') || '';
        } catch (e) { cat = ''; tg = ''; }
        var hash = (location.hash || '').replace('#', '');
        if (cat && CATS[cat]) setCat(cat);
        else if (hash && CATS[hash]) setCat(hash);
        else setCat('all');
        /* B2：标签还原。选单遇到选项里没有的值会**静默忽略** → 那就成了「指名筛选却被无视」。
         * 未知值补成一个选项：筛出来 0 条，如实显示（与 models 的处理一致）。 */
        activeTag = tg;
        if (tagSel && tg) {
          var foundTag = Array.prototype.some.call(tagSel.options, function (o) { return o.value === tg; });
          if (!foundTag) {
            var extra = document.createElement('option');
            extra.value = tg; extra.textContent = tg;
            tagSel.appendChild(extra);
          }
          tagSel.value = tg;
        }
      }

      q.addEventListener('input', apply);
      chips.forEach(function (b) {
        b.addEventListener('click', function () {
          var c = b.getAttribute('data-cat');
          setCat(c);
          apply();
          setUrl(c, true);       // 选中分类 → 地址栏同步（可复制还原状态）
        });
      });
      /* B2：标签下拉变化 → 重筛 + 同步地址栏（标签与分类可叠加） */
      if (tagSel) {
        tagSel.addEventListener('change', function () {
          activeTag = tagSel.value;
          apply();
          setUrl(activeCat, true);
        });
      }

      window.addEventListener('hashchange', function () {
        if (!scrollToAnchor()) { deepLink(); apply(); }
      });
      /* 首屏：先试条目锚点（会顺带取消分类筛选），否则按 ?cat= / #cat 定分类 */
      if (!scrollToAnchor()) deepLink();
      apply();
    })();
  </script>
`;

const final = html.replace('</body>', script + '</body>');
fs.writeFileSync(path.join(SITE, 'index.html'), final, 'utf8');

// ---- site.css：沿用图谱站已调好的基础，再追加目录站特有样式 ----
// 2026-10-03改：原先读 `_sites/ide/site.css`（旧 IDE 站产物，随 v4 废弃一起删了）。
// 真相源一直是 `_sites/_template/site.css` —— 各站那几份都是构建时从它复制的副本。
/* ⚠ 2026-10-10：站级样式的**真相源改为真实文件** `css/nav.css`。
 * 原先是本文件里的一个模板字符串（改样式要动 .mjs、CSS 门禁扫不到它）。
 * 抽取后已验证：**剥掉注释与空白后，产物与抽取前逐字符相同** ✓
 * （差异仅为我新增的文件头与一个换行 —— 不含任何一条 CSS 声明的改动）。
 * 共享基底仍读 `_template/site.css`，本文件只放 nav 站特有部分。
 * ⚠ R3（内容库自足）：源文件放在**仓内**，随仓 clone，clone-build 门禁才过得去。 */
let css = fs.readFileSync(path.join(TEMPLATE, 'site.css'), 'utf8')
  + fs.readFileSync(path.join(BASE, 'css', 'nav.css'), 'utf8');
fs.writeFileSync(path.join(SITE, 'site.css'), css, 'utf8');

// ---- 品牌资源与其他文件 ----
// 2026-10-03 改：原先从 `_sites/ide/` 拷 brand.* —— 那目录是旧 IDE 站的构建产物，
// 随 v4 废弃一起删了，**而这份脚本没跟着改**，于是整个 nav 建站流程直接ENOENT 崩掉。
// 品牌外壳的真相源是 `www.specul/brand.css` + `brand.js`（改完须跑 `sync-brand.mjs`）。
// ⚠ 教训：grep 单一路径模式会漏 —— 我第一次只 grep 到 site.css 那行就以为改完了，
//   实际同文件第 234 行还有一个 copyFileSync 指向同一目录，跑到那一步才炸。
for (const f of ['brand.css', 'brand.js']) {
  fs.copyFileSync(path.join(WWWBRAND, f), path.join(SITE, f));
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
