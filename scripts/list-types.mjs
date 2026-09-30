// 列出 data.full.js 全部小类（t）与顶层组（c），供设计映射规则
import fs from 'node:fs';

const src = fs.readFileSync('C:/Users/chenhua/Desktop/specul/www.specul/data.full.js', 'utf8');
const cards = new Function(src + '\nreturn cards;')();

const byC = {};
for (const x of cards) {
  const c = x.c || '-';
  byC[c] = byC[c] || {};
  byC[c][x.t || '(空)'] = (byC[c][x.t || '(空)'] || 0) + 1;
}

console.log(`总计 ${cards.length} 条\n`);
let total = 0;
for (const [c, ts] of Object.entries(byC)) {
  const sub = Object.values(ts).reduce((a, b) => a + b, 0);
  total += sub;
  console.log(`## c=${c}  小计 ${sub} 条`);
  Object.entries(ts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([t, n]) => console.log(`    ${String(n).padStart(3)}  ${t}`));
  console.log('');
}
console.log('校验小计:', total);
