// 生成按分类组织的 Markdown 内容文件，并合并链接核验结果
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'C:/Users/chenhua/Desktop/specul/_data/nav';
const OUT = path.join(BASE, 'content');

const data = JSON.parse(fs.readFileSync(path.join(BASE, 'nav-data.json'), 'utf8'));
const check = JSON.parse(fs.readFileSync(path.join(BASE, 'check-results.json'), 'utf8'));

// url -> 核验结论
const verdict = {};
for (const r of check.results) verdict[r.u] = r;

const TODAY = '2026-09-30';

// 保守判定：只有明确 404/410 才算失效；DNS 失败标待确认（可能是沙箱 DNS 限制）
function statusOf(u) {
  const r = verdict[u];
  if (!r) return { label: '未核验', flag: '' };
  if (r.v === 'ok') return { label: `ok（${TODAY}）`, flag: '' };
  if (r.v === 'dead' && (r.s === 404 || r.s === 410)) return { label: `失效 ${r.s}（${TODAY}）`, flag: 'dead' };
  if (r.v === 'dead') return { label: '待确认（DNS 解析失败）', flag: 'maybe' };
  if (r.v === 'blocked') return { label: '存活（反爬拦截）', flag: '' };
  return { label: '未验证（网络不可达）', flag: '' };
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

  fs.writeFileSync(path.join(OUT, `${cat.code}.md`), lines.join('\n'), 'utf8');
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
