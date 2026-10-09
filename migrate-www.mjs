import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// www 站迁移：旧 nav.html 全部改指 nav.specul.com，并删除旧导航页

const WWW = path.resolve(HERE, '..', '..', 'www.specul');
const NAVURL = 'https://nav.specul.com/';

// 新站 11 类（含条目数，取自 build-site 实际输出）
const CHIPS = [
  ['#llm', '💬', '大模型对话', 'LLM', 44],
  ['#coding', '⌨️', 'AI 编程', 'Coding', 30],
  ['#gen', '🎨', '多模态生成', 'Multimodal', 56],
  ['#app', '📋', '办公与垂直', 'Apps', 49],
  ['#model', '🧩', '模型权重', 'Models', 26],
  ['#dev', '🛠️', '框架与工具', 'Dev', 42],
  ['#infra', '💠', '算力芯片', 'Compute', 55],
  ['#robot', '🦾', '机器人', 'Robotics', 87],
  ['#learn', '📚', '学习资源', 'Learning', 43],
  ['#community', '📣', '社区资讯', 'Community', 25],
  ['#tools', '🧰', '开发工具', 'Dev tools', 72],
];

const chipsHtml = CHIPS.map(
  ([h, ic, zh, en, n]) =>
    `          <a class="cat-chip" href="${NAVURL}${h}"><span class="ic">${ic}</span><span data-zh>${zh}</span><span data-en>${en}</span><span class="cnt">${n}</span></a>`
).join('\n');

// ---------- index.html ----------
const ip = path.join(WWW, 'index.html');
let idx = fs.readFileSync(ip, 'utf8');
const before = (idx.match(/nav\.html/g) || []).length;

idx = idx.replace(/href="\.\/nav\.html[^"]*"/g, `href="${NAVURL}"`);
idx = idx.replace(
  /<div class="cat-rail">[\s\S]*?<\/div>/,
  `<div class="cat-rail">\n${chipsHtml}\n        </div>`
);
idx = idx.replace('九大品类，直达分类', '十一个品类，直达分类');
idx = idx.replace('Nine categories, one click in', 'Eleven categories, one click in');
idx = idx.replace(
  /487 条精选：AI、机器人、大模型、链上、算力与开发工具。/,
  '529 条精选：模型、编程、多模态、算力、机器人与开发工具，按 11 类组织。'
);
idx = idx.replace(
  /487 curated entries across AI, robotics, models, on-chain, compute and dev tools\./,
  '529 curated entries across models, coding, multimodal, compute, robotics and dev tools, in 11 categories.'
);
fs.writeFileSync(ip, idx, 'utf8');
console.log(`index.html  : nav.html 引用 ${before} -> ${(idx.match(/nav\.html/g) || []).length}；chips 已换为新站 11 类`);

// ---------- legal.html ----------
const lp = path.join(WWW, 'legal.html');
let lg = fs.readFileSync(lp, 'utf8');
const lb = (lg.match(/nav\.html/g) || []).length;
lg = lg.replace(/href="\.\/nav\.html[^"]*"/g, `href="${NAVURL}"`);
fs.writeFileSync(lp, lg, 'utf8');
console.log(`legal.html  : nav.html 引用 ${lb} -> ${(lg.match(/nav\.html/g) || []).length}`);

// ---------- app.js ----------
const ap = path.join(WWW, 'app.js');
let js = fs.readFileSync(ap, 'utf8');
const jb = (js.match(/nav\.html/g) || []).length;
if (jb) {
  js = js.replace(/nav\.html/g, 'nav.specul.com/');
  fs.writeFileSync(ap, js, 'utf8');
}
console.log(`app.js      : nav.html 引用 ${jb} -> ${(js.match(/nav\.html/g) || []).length}`);

// ---------- 备份并移除旧 nav.html ----------
const np = path.join(WWW, 'nav.html');
if (fs.existsSync(np)) {
  const bak = path.join(os.tmpdir(), 'nav.html.bak');
  fs.copyFileSync(np, bak);
  fs.unlinkSync(np);
  console.log(`nav.html    : 已备份到 ${bak} 并从本地删除`);
}
