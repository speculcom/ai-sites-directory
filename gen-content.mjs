import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// 生成按分类组织的 Markdown 内容文件，并合并链接核验结果

const BASE = HERE;
const OUT = path.join(BASE, 'content');

/* --check：只比对不写盘，有漂移就 exit 1（供门禁）。见下方写入处的说明。 */
const CHECK = process.argv.includes('--check');
const drift = [];

const data = JSON.parse(fs.readFileSync(path.join(BASE, 'nav-data.json'), 'utf8'));
const check = JSON.parse(fs.readFileSync(path.join(BASE, 'check-results.json'), 'utf8'));

// url -> 核验结论
const verdict = {};
for (const r of check.results) verdict[r.u] = r;

/* ⚠ 2026-10-08：原来硬编码 2026-09-30 —— 核验快照早已更新，写死的日期=假出处。
 * 与 build-site.mjs 同一口径：读 check-results.json 的真实时间戳。 */
const TODAY = String(check.at || '').slice(0, 10) || '未知';

/* 保守判定（2026-10-08 对齐 A4.1 状态机）：只有明确 404/410 才算失效；
 * unverifiable（DNS/超时/TLS/被墙）与 blocked（反爬）都不是死链。 */
function statusOf(u) {
  const r = verdict[u];
  if (!r) return { label: '未核验', flag: '' };
  if (r.v === 'ok') return { label: `ok（${TODAY}）`, flag: '' };
  if (r.v === 'changed') return { label: `可达（已改址 → ${r.to || '?'}）（${TODAY}）`, flag: '' };
  if (r.v === 'dead' && (r.s === 404 || r.s === 410)) return { label: `失效 ${r.s}（${TODAY}）`, flag: 'dead' };
  if (r.v === 'dead') return { label: '待确认（旧口径遗留，待复测）', flag: 'maybe' };
  if (r.v === 'blocked') return { label: '存活（反爬拦截）', flag: '' };
  if (r.v === 'unverifiable') return { label: `未验证（探测受限：${r.err || '网络'}，非死链）`, flag: 'maybe' };
  return { label: '未核验（待复测）', flag: '' };
}

fs.mkdirSync(OUT, { recursive: true });

const summary = [];
const needWork = [];

for (const cat of data.categories) {
  const items = data.items.filter((i) => i.cat === cat.code);
  if (!items.length) continue;

  const lines = [];
  lines.push(`# ${cat.name}`);
  lines.push('');
  lines.push(`> ${cat.desc} · 共 ${items.length} 条`);
  lines.push('');

  let dead = 0, maybe = 0;
  for (const it of items) {
    const st = statusOf(it.u);
    if (st.flag === 'dead') dead++;
    if (st.flag === 'maybe') maybe++;

    lines.push(`## ${it.n}`);
    lines.push('');
    lines.push(`- 链接：<${it.u}>`);
    lines.push(`- 说明：${it.d}`);
    if (it.tag) lines.push(`- 标签：${it.tag}`);
    lines.push(`- 核验：${st.label}`);
    lines.push('');

    // 内容待丰富：说明过短 或 无标签
    if ((it.d || '').length < 18 || !it.tag) {
      needWork.push({ n: it.n, cat: cat.name, len: (it.d || '').length, tag: it.tag ? '有' : '无' });
    }
  }

  /* A1.4 守卫（2026-10-09 补）：--check 模式只比对不写入。
   * 为什么需要：这套 md 是**生成物**，但此前没有任何东西守着它 ——
   * 改了 nav-data.json 却忘了重跑生成器，内容文件就会静默过期，
   * 而「过期的手写数字」正是 A1.4 当初要消灭的东西。 */
  const outFile = path.join(OUT, `${cat.code}.md`);
  const body = lines.join('\n');
  if (CHECK) {
    const cur = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : null;
    if (cur !== body) drift.push(`${cat.code}.md`);
  } else {
    fs.writeFileSync(outFile, body, 'utf8');
  }
  summary.push({ code: cat.code, name: cat.name, n: items.length, dead, maybe });
}

console.log('=== 已生成 Markdown 内容文件 ===');
let tot = 0;
for (const s of summary) {
  tot += s.n;
  const note = [];
  if (s.dead) note.push(`失效${s.dead}`);
  if (s.maybe) note.push(`待确认${s.maybe}`);
  console.log(`  ${String(s.n).padStart(4)}  ${s.name.padEnd(12, '　')} ${note.join(' / ')}`);
}
console.log(`  合计 ${tot} 条`);

console.log(`\n=== 内容待丰富（说明<18字 或 无标签）：${needWork.length} 条 ===`);
needWork.slice(0, 12).forEach((w) => console.log(`  - [${w.cat}] ${w.n}（说明${w.len}字/${w.tag}标签）`));
if (needWork.length > 12) console.log(`  ...另有 ${needWork.length - 12} 条`);

fs.writeFileSync(path.join(BASE, 'content-summary.json'), JSON.stringify({ summary, needWork }, null, 1), 'utf8');
console.log('\n已写入 content-summary.json');

if (CHECK) {
  console.log(`\n=== --check：content/*.md 是否与数据一致 ===`);
  if (!drift.length) {
    console.log(`  ✓ ${summary.length} 个分类的 md 与 nav-data.json + check-results.json 逐字节一致`);
    process.exit(0);
  }
  console.log(`  ✗ ${drift.length} 个文件过期（改了数据没重跑生成器）：${drift.join(' ')}`);
  console.log('    修法：node _data/nav/gen-content.mjs');
  process.exit(1);
}