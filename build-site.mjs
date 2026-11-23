import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateConditions} from './conditions.mjs';
import {buildTaskSamples, renderTaskPacks, taskPacks} from './task-packs.mjs';

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

const { shell, esc, nativeOption } = await import(
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
/* T31（2026-10-22）：「本站有档案 →」标注 —— nav 条目若在 tools 站（tools.specul.com）
 * 有深度档案，卡片上给出站内互链。映射由主仓生成器 `_audit/gen-nav-dossier-map.mjs`
 * 算出并 vendored 到本仓 `dossiers.json`（R3 内容库自足：构建只读本仓）。
 * ⚠ 匹配口径「宁缺勿错」：精确名 + 人工核对过域名的别名表；不同产品不硬凑。
 * 缺文件 → 空映射可接受降级（标注消失、构建不炸），但必须 warn。 */
const DOSSIER = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(BASE, 'dossiers.json'), 'utf8'));
  } catch (e) {
    console.warn('  ! dossiers.json 读不到，「本站有档案」标注将全部缺失：' + e.message);
    return {};
  }
})();
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
/* 2026-11-03：确认存活再拆三档，与 www 首页同一口径（539 直接 200 / 62 反爬 / 7 改址）。 */
const CHECK_DIRECT_N = (check.results || []).filter(r => r.v === 'ok').length;
const CHECK_BLOCKED_N = (check.results || []).filter(r => r.v === 'blocked').length;
const CHECK_CHANGED_N = (check.results || []).filter(r => r.v === 'changed').length;
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

// 展示 AI 相关分类；ext（链/币/游戏等非 AI 主体）不进站，仅在仓库 content/ 留档
const cats = data.categories.filter((c) => c.code !== 'ext');
const items = data.items.filter((i) => i.cat !== 'ext');
validateConditions(items);

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
const RESOURCE_IDS = new Map();
function anchorId(name) {
  let base = 'i-' + String(name).toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]+/gu, '');
  if (base === 'i-' || base === 'i-') base = 'i-item';
  const n = (ANCHOR_SEEN.get(base) || 0) + 1;
  ANCHOR_SEEN.set(base, n);
  return n === 1 ? base : base + '-' + n;
}

function card(it) {
  const resourceId = anchorId(it.n);
  RESOURCE_IDS.set(it.n, resourceId);
  const st = linkState(it);
  const dead = st.cls === 'is-dead';
  const tag = dead ? 'div' : 'a';
  const linkAttrs = dead ? '' : ` href="${esc(it.u)}" target="_blank" rel="noopener"`;
  /* 2026-11-19：目录页回到「最快跳出去」。
   * 卡片只留站名和打不开提示；说明、图标、标签、档案入口、条件折叠全部撤掉
   * —— 625 条里任何一项都是让人多读一行、晚点一次外链的噪音。 */
  return `          <div class="card-wrap" data-cat="${it.cat}" data-tags="${esc(it.tag || '')}">
          <${tag} class="c-link${st.cls ? ' ' + st.cls : ''}" id="${resourceId}"${linkAttrs}>
            <span class="c-nm"><span data-zh>${esc(it.n)}</span><span data-en>${esc(VENDOR_EN[it.n] || it.n)}</span></span>
${st.note ? `            <span class="c-warn">${st.note}</span>` : ''}
          </${tag}>
          </div>`;
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
  // ⚠ **只算在站条目（cat !== 'ext'）** —— ext 是相邻领域（加密货币等非 AI 主体），
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
    return `      <section class="cat-group" id="cat-${c.code}" data-cat="${c.code}">
        <h2 class="cat-h"><span class="cat-dot" aria-hidden="true"></span><span data-zh>${esc(c.name)}</span><span data-en>${esc(cn.name || c.name)}</span></h2>
        <div class="grid">
${list.map(card).join('\n')}
        </div>
      </section>`;
  })
  .filter(Boolean)
  .join('\n');

const chips = ['<button class="chip is-on" data-cat="all">'
  + '<span data-zh>全部</span><span data-en>All</span>'
  + '</button>']
  .concat(
    cats
      .filter((c) => items.some((i) => i.cat === c.code))
      .map((c) => {
        var cn = CAT_EN[c.code] || {};
        return '<button class="chip" data-cat="' + esc(c.code) + '">'
          + '<span data-zh>' + esc(c.name) + '</span>'
          + '<span data-en>' + esc(cn.name || c.name) + '</span></button>';
      })
  )
  .join('\n        ');

/* 2026-11-19：标签下拉与「按意图」入口撤掉。
 * 目录页先给搜索 + 分类两组够用的筛选，剩下的屏幕留给 625 个站本身。 */

const body = `    <header class="dir-head">
      <div class="container dir-head-row">
        <h1 class="dir-h1"><span class="grad-title"><span data-zh>AI 导航</span><span data-en>AI Directory</span></span></h1>
        <div class="dir-tools">
          <label class="dir-search" for="q">
            <span class="sr-only"><span data-zh>搜索</span><span data-en>Search</span></span>
            <input id="q" type="search" placeholder="搜站名" data-ui-placeholder-zh="搜站名" data-ui-placeholder-en="Search a site" autocomplete="off" />
          </label>
          <button type="button" id="directory-reset" class="reset-btn">${biSpan('清空', 'Clear')}</button>
        </div>
      </div>
    </header>
    <p class="dir-count container"><a href="fit.html"><b><span data-zh>不确定点哪个？先看 100 个常用入口的适用场景 →</span><span data-en>Not sure what to open? See the fit notes for 100 common entries →</span></b></a><span aria-hidden="true"> · </span><a href="2026.html"><span data-zh>2026 新入口：先看官方页，再看榜单 →</span><span data-en>2026 additions: official pages first, leaderboards second →</span></a></p>

    <section class="section dir-body" id="dir">
      <div class="container">
        <nav class="dir-cats" aria-label="按类目筛选" data-ui-aria-label-zh="按类目筛选" data-ui-aria-label-en="Filter by category">${chips}</nav>
        <p id="empty" class="empty" hidden>${biSpan("没有匹配的条目。", "No matching entries.")}</p>
        <p id="filtered-count" class="dir-count" role="status" aria-live="polite"></p>
${groups}
      </div>
    </section>`;

const html = shell({
  current: 'nav',
  title: `AI 导航 · 站外 AI 网站目录 | 投机取巧`,
  desc: `AI 导航：按用途整理的站外 AI 网站目录，点名字直接去官网；打不开的会标出来。收录 600+ 条站外工具与官网入口，按用途分组并标注可用状态。`,
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
    name: 'AI 导航 · 站外 AI 网站目录',
    url: 'https://nav.specul.com/',
    description: `按用途整理的站外 AI 网站目录。`,
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
  headExtra: '',
});

// 注入交互脚本（放在 shell 末尾的 </body> 前）
const directoryVersion = crypto.createHash('sha256').update(fs.readFileSync(path.join(BASE, 'directory.js'))).digest('hex').slice(0, 12);
fs.copyFileSync(path.join(BASE, 'directory.js'), path.join(SITE, 'directory.js'));
const script = '<script defer src="directory.js?v=' + directoryVersion + '"></script>';

const navSpace = (s) => s.replaceAll('<span data-zh>AI 导航</span>', '<span data-zh>AI&nbsp;导航</span>');
const final = navSpace(html).replace('</body>', script + '</body>');
const taskSampleCount = buildTaskSamples(BASE, SITE);
console.log(`  · 任务包样例 ${taskSampleCount} 个文件（虚构输入与设计参考）`);
fs.writeFileSync(path.join(SITE, 'index.html'), final, 'utf8');

/* 任务包独立页（2026-11-09）：首页定位改回「收藏夹」——搜索 + 分类 + 592 张卡，
 * 任务包（6 个、含样例与工作表）移到 tasks.html，从 hero 一行链接进入。
 * 内容一字未删，只是不再占首页首屏。 */
const tasksBody = `    <section class="section hero">
      <div class="container">
        <p class="eyebrow">SPECUL · AI DIRECTORY</p>
        <h1 class="h1"><span class="grad-title"><span data-zh>任务包</span><span data-en>Task packs</span></span></h1>
        <p class="lede">${biSpan('先写清要完成什么，再按用途挑站点。每个包给出输入、步骤、验收与失败后去查的条目；样例是虚构输入，不是产品运行记录。', 'Define the outcome first, then pick sites by role. Each pack gives inputs, steps, acceptance checks and where to look when it fails; samples are fictional inputs, not product runs.')}</p>
        <p class="t-sm"><a href="./">${biSpan('← 回到站点目录', '← Back to the directory')}</a></p>
      </div>
    </section>
    <section class="section">
      <div class="container">
${renderTaskPacks(RESOURCE_IDS, 'index.html')}
      </div>
    </section>`;
const tasksHtml = shell({
  current: 'nav',
  title: '任务包 · AI 导航 | 投机取巧',
  desc: `按任务准备一组站外 AI 网站：${taskPacks.packs.length} 个任务包，各自给出输入清单、执行步骤、验收标准与失败后该去查的条目；样例均为虚构输入，不含真实账号或数据。`,
  canonical: 'https://nav.specul.com/tasks.html',
  accent: null,
  body: tasksBody,
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: '任务包 · AI 导航',
    url: 'https://nav.specul.com/tasks.html',
    description: `${taskPacks.packs.length} 个按任务组织的资源准备流程。`,
    inLanguage: 'zh-Hans',
    isPartOf: { '@type': 'WebSite', name: 'Specul · 投机取巧', url: 'https://specul.com/' },
  },
  repo: 'https://github.com/speculcom/ai-sites-directory',
  headExtra: '',
});
fs.writeFileSync(path.join(SITE, 'tasks.html'), navSpace(tasksHtml), 'utf8');

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
  <url><loc>https://nav.specul.com/tasks.html</loc><lastmod>${TODAY}</lastmod></url>
</urlset>
`,
  'utf8'
);

/* llms.txt / llms.en.txt：2026-11-09 之前数据仓根有、产物里没有，
 * 线上 https://nav.specul.com/llms.txt 一直 404。文件由 gen-repo-docs 生成，这里只同步。 */
for (const name of ['llms.txt', 'llms.en.txt']) {
  const src = path.join(BASE, name);
  if (!fs.existsSync(src)) { console.warn(`⚠ 缺少 ${name}，跳过同步（先跑 gen-repo-docs --write）`); continue; }
  fs.copyFileSync(src, path.join(SITE, name));
}

/* 2026.html / 404.html 顶部同一个导航；Cloudflare 的 HTML 优化会吞掉普通空格，
 * 用不换行空格把「AI 导航」这两个词之间的间距固定住。 */
for (const name of ['2026.html', '404.html']) {
  const p = path.join(SITE, name);
  if (fs.existsSync(p)) fs.writeFileSync(p, navSpace(fs.readFileSync(p, 'utf8')), 'utf8');
}

/* README.md：此前是 2026-10 手写后遗留的静态文件，线上一直挂着「硅基导航 · 529 个条目」——
 * 站名与数字都过期了。改为随构建生成，数字与页面同源。 */
fs.writeFileSync(
  path.join(SITE, 'README.md'),
  `# AI 导航 · 站外 AI 网站目录

> https://nav.specul.com/

系统化收录站外 AI 网站。**本站收录 ${items.length} 个条目，按 ${cats.length} 类组织**，每条附一句话说明与链接核验状态。
相邻领域另有 ${data.items.length - items.length} 条只入库、不上站（链上、游戏、通用工具等背景参考，不是 AI 工具目录的一部分）。

## 内容地图

- \`nav-data.json\` — 唯一真相源：条目 + 分类
- \`content/*.md\` — 分类页文案
- \`descriptions.en.json\` — 条目英文描述（键 = 条目名）
- \`check-results.json\` — 外链可达性结果（\`check-links.mjs\` 生成）

## 边界

- 不收没有官网的条目；不写营销话术（描述必须能从官网自证）
- 不排名、不打分；过期链接渲染为不可点状态
- 这是**站外 AI 网站目录**，不是本站自产内容
`,
  'utf8'
);

console.log('=== nav 站已生成 ===');
console.log(`  条目 ${items.length} 条 · 分类 ${cats.length} 类（已排除相邻领域 ${data.items.length - items.length} 条）`);
console.log(`  index.html ${(fs.statSync(path.join(SITE, 'index.html')).size / 1024).toFixed(0)} KB`);
console.log(`  输出目录 ${SITE}`);
