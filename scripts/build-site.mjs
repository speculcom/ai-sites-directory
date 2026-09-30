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
const check = JSON.parse(fs.readFileSync(path.join(BASE, 'check-results.json'), 'utf8'));
const TODAY = '2026-09-30';

// 核验结论：只有明确 404/410 判失效；DNS 失败标待确认（沙箱限制，不能当死链）
const verdict = {};
for (const r of check.results) verdict[r.u] = r;
function linkState(u) {
  const r = verdict[u];
  if (!r) return { cls: '', note: '' };
  if (r.v === 'dead' && (r.s === 404 || r.s === 410)) return { cls: 'is-dead', note: '链接失效' };
  if (r.v === 'dead') return { cls: 'is-maybe', note: '待确认' };
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
            <span class="c-nm">${esc(it.n)}</span>
            <span class="c-ds">${esc(it.d)}</span>
${tags.length ? `            <span class="c-tg">${tags.map((t) => `<i>${esc(t)}</i>`).join('')}</span>\n` : ''}${st.note ? `            <span class="c-warn">${st.note}</span>\n` : ''}          </a>`;
}

// ---- 分类分组 ----
const groups = cats
  .map((c) => {
    const list = items.filter((i) => i.cat === c.code);
    if (!list.length) return '';
    return `      <section class="cat-group" data-cat="${c.code}">
        <h2 class="cat-h"><span class="cat-dot" aria-hidden="true"></span>${esc(c.name)}<em>${list.length}</em></h2>
        <p class="cat-sub">${esc(c.desc)}</p>
        <div class="grid">
${list.map(card).join('\n')}
        </div>
      </section>`;
  })
  .filter(Boolean)
  .join('\n');

const chips = ['<button class="chip is-on" data-cat="all">全部<em>' + items.length + '</em></button>']
  .concat(
    cats
      .filter((c) => items.some((i) => i.cat === c.code))
      .map((c) => {
        const n = items.filter((i) => i.cat === c.code).length;
        return `<button class="chip" data-cat="${c.code}">${esc(c.name)}<em>${n}</em></button>`;
      })
  )
  .join('\n        ');

const body = `    <section class="section hero">
      <div class="container">
        <p class="eyebrow">SPECUL · DIRECTORY</p>
        <h1 class="h1">硅基导航</h1>
        <p class="lede">系统化收录 <strong>${items.length}</strong> 个 AI 相关网站，按 ${cats.length} 类组织。每条附一句话说明与链接核验状态。</p>
        <p class="t-sm dim">数据来源：公开的站点官方信息，逐条人工整理；链接核验于 ${TODAY}。本页为索引与引述，不替代各站点官方文档。</p>
      </div>
    </section>

    <section class="section" id="dir">
      <div class="container">
        <div class="controls">
          <label class="sr-only" for="q">搜索</label>
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

      q.addEventListener('input', apply);
      chips.forEach(function (b) {
        b.addEventListener('click', function () {
          chips.forEach(function (x) { x.classList.remove('is-on'); });
          b.classList.add('is-on');
          activeCat = b.getAttribute('data-cat');
          apply();
        });
      });
      apply();
    })();
  </script>
`;

const final = html.replace('</body>', script + '</body>');
fs.writeFileSync(path.join(SITE, 'index.html'), final, 'utf8');

// ---- site.css：沿用 ide 站已调好的基础，再追加目录站特有样式 ----
let css = fs.readFileSync(path.join(SPECUL, '_sites/ide/site.css'), 'utf8');
css += `

/* ===== 硅基导航 · 目录站特有 ===== */
.hero { padding-top: 3rem; }
.eyebrow { font-size: 12px; letter-spacing: .18em; color: var(--ink-mid); margin: 0 0 .5rem; }
.h1 { font-size: clamp(2rem, 5vw, 3.4rem); line-height: 1.1; margin: 0 0 .75rem; }
.lede { font-size: 1rem; color: var(--ink-mid); max-width: 62ch; margin: 0 0 .5rem; }
.dim { opacity: .8; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

.controls { margin: 1.5rem 0 2rem; }
#q {
  width: 100%; max-width: 460px; padding: .7rem .9rem; font: inherit;
  border: 1px solid var(--border, rgba(127,127,127,.35)); border-radius: 10px;
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

.cat-group { margin: 2.5rem 0; }
.cat-h { display: flex; align-items: center; gap: .6rem; font-size: 1.25rem; margin: 0 0 .25rem; }
.cat-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent, #22d3c5); }
.cat-h em { font-style: normal; font-size: 12px; opacity: .55; }
.cat-sub { margin: 0 0 1rem; font-size: 13px; color: var(--ink-mid); }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: .85rem; }
.card {
  display: flex; flex-direction: column; gap: .35rem;
  padding: .9rem 1rem; border-radius: 12px; text-decoration: none; color: inherit;
  border: 1px solid var(--border, rgba(127,127,127,.28));
  background: var(--bg-panel, rgba(127,127,127,.06));
  transition: transform .18s ease, border-color .18s ease;
}
.card:hover { transform: translateY(-2px); border-color: var(--cyan, #22d3c5); }
.c-ic { font-size: 1.1rem; line-height: 1; }
.c-nm { font-weight: 500; font-size: 15px; }
.c-ds { font-size: 13px; color: var(--ink-mid); line-height: 1.5; }
.c-tg { display: flex; flex-wrap: wrap; gap: .3rem; margin-top: auto; padding-top: .4rem; }
.c-tg i {
  font-style: normal; font-size: 11px; padding: .1rem .45rem; border-radius: 999px;
  background: rgba(127,127,127,.16); color: var(--ink-mid);
}
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
for (const f of ['brand.css', 'brand.js']) {
  fs.copyFileSync(path.join(SPECUL, '_sites/ide', f), path.join(SITE, f));
}
fs.writeFileSync(path.join(SITE, 'CNAME'), 'nav.specul.com\n', 'utf8');
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
