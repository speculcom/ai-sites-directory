// 统计现有导航数据（data.js / data.full.js）的分类现状
import fs from 'node:fs';
import path from 'node:path';

const WWW = 'C:/Users/chenhua/Desktop/specul/www.specul';

function load(file) {
  const src = fs.readFileSync(path.join(WWW, file), 'utf8');
  // data.js 形如 `var cards=[...]`；用 Function 求值并返回 cards
  const fn = new Function(src + '\nreturn cards;');
  return fn();
}

for (const f of ['data.js', 'data.full.js']) {
  const cards = load(f);
  console.log(`=== ${f} : 共 ${cards.length} 条 ===`);
  const by = {};
  for (const x of cards) {
    const key = `${x.t || '(空)'}  [c=${x.c || '-'}]`;
    by[key] = (by[key] || 0) + 1;
  }
  Object.entries(by)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`   ${String(v).padStart(4)}  ${k}`));
  const noU = cards.filter((x) => !x.u).length;
  const noD = cards.filter((x) => !x.d).length;
  const noT = cards.filter((x) => !x.t).length;
  console.log(`   缺URL:${noU}  缺描述:${noD}  缺分类:${noT}`);
  const dupU = {};
  for (const x of cards) dupU[x.u] = (dupU[x.u] || 0) + 1;
  const dups = Object.entries(dupU).filter(([, n]) => n > 1);
  console.log(`   重复URL组数: ${dups.length}`);
  dups.slice(0, 5).forEach(([u, n]) => console.log(`      x${n}  ${u}`));
  console.log('');
}
