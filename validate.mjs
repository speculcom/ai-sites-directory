#!/usr/bin/env node
/**
 * validate.mjs —— ai-sites-directory（硅基导航站内容仓）的 schema 与标签词表校验器
 *
 * ## 位置说明
 * 本仓**没有 `scripts/` 目录**（构建脚本 `build-site.mjs` / `build-nav-data.mjs` / `check-links.mjs`
 * 都在仓根），所以本文件也放在仓根，跟随本仓既有约定。
 * 其他内容仓的校验器在 `scripts/validate.mjs`（agent / glossary / models / game）。
 *
 * ## 与 `check-links.mjs` 的分工
 *   `check-links.mjs` 管**外链可达性**（要联网，产出 `check-results.json`，构建器消费它打 badge）。
 *   本文件管**数据结构与词表**：字段齐不齐、分类/标签是否在封闭枚举里、中英覆盖够不够。
 *
 * ## 本仓自足（R3）：只读本仓文件。
 *
 * 用法：node validate.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = HERE;
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const errors = [];
const warnings = [];

const nav = JSON.parse(read('nav-data.json'));
const tagsEn = JSON.parse(read('tags.en.json'));
const catsEn = JSON.parse(read('categories.en.json'));
const descsEn = JSON.parse(read('descriptions.en.json'));

const TAG_VOCAB = Object.keys(tagsEn);
const CAT_CODES = nav.categories.map((c) => c.code);
const PUBLIC = nav.items.filter((e) => e.cat !== 'ext');   // `ext` 不上站（对外 527 条的口径）

/* ── 1. categories ── */
if (!Array.isArray(nav.categories) || !nav.categories.length) errors.push('nav-data.json 缺 categories');
for (const c of nav.categories || []) {
  for (const k of ['code', 'name', 'desc']) if (!c[k]) errors.push(`categories/${c.code || '?'} · 缺 ${k}`);
  if (c.code && !/^[a-z][a-z0-9]*$/.test(c.code)) errors.push(`categories/${c.code} · code 应为小写字母开头`);
  const en = catsEn[c.code];
  if (!en || !en.name || !en.desc) errors.push(`categories.en.json 缺「${c.code}」的英文 name/desc`);
}
if (new Set(CAT_CODES).size !== CAT_CODES.length) errors.push('categories 里 code 有重复');

/* ── 2. items ── */
const seenName = new Map();
const usedTags = new Set();
const extNoEn = [];
for (const e of nav.items) {
  const id = e.n || '(无名)';
  for (const k of ['n', 'd', 'u', 'tag', 'ic', 'cat']) {
    if (!e[k]) errors.push(`条目「${id}」· 缺字段 ${k}`);
  }
  /* 重名规则（为什么不能一律算错）：
   *   `descriptions.en.json` 是**按条目名做键**的，所以两个**对外**条目同名 → 英文必然串位（错误）。
   *   一个对外 + 一个 `ext`（不上站）→ 目前无害，但**是潜伏陷阱**（那个 ext 条目哪天转正就串位）→ 警告。
   *   实测样本：Google 的 Gemini（llm）与 Gemini 交易所（ext）同名，英文键里放的是前者。 */
  if (seenName.has(e.n)) {
    const prev = seenName.get(e.n);
    const bothPublic = prev.cat !== 'ext' && e.cat !== 'ext';
    const msg = `条目名重复「${e.n}」（${prev.u} 与 ${e.u}）—— descriptions.en.json 按名字做键，会让两条共用同一段英文`;
    if (bothPublic) errors.push(msg + '：两条都对外，必须改名');
    else warnings.push(msg + '：目前只有一条对外，属潜伏陷阱，建议改名');
  } else seenName.set(e.n, e);
  if (e.u && !/^https?:\/\//.test(e.u)) errors.push(`条目「${id}」· url 不是 http(s): ${e.u}`);
  if (e.cat && !CAT_CODES.includes(e.cat)) errors.push(`条目「${id}」· cat「${e.cat}」不在 categories 里`);
  if (e.retired !== undefined && typeof e.retired !== 'boolean') errors.push(`条目「${id}」· retired 必须是布尔值`);

  /* 标签：**中点 `·` 分隔的封闭词表**，每条 1-3 个。
   * ⚠ 词表是 `tags.en.json`（92 个），不是自由文本 —— 新标签必须先进词表（A5.1 收敛过 860→92）。 */
  const toks = String(e.tag || '').split(/[·・]/).map((s) => s.trim()).filter(Boolean);
  if (!toks.length) errors.push(`条目「${id}」· tag 为空`);
  if (toks.length > 3) errors.push(`条目「${id}」· 标签 ${toks.length} 个（上限 3）: ${e.tag}`);
  for (const t of toks) {
    usedTags.add(t);
    if (!TAG_VOCAB.includes(t)) errors.push(`条目「${id}」· 标签「${t}」不在 tags.en.json 词表里`);
    else if (!tagsEn[t]) errors.push(`tags.en.json 的「${t}」英文为空`);
  }

  // 中英覆盖：**对外条目**必须有英文描述（`ext` 不上站，缺失只汇总成一条警告）
  const hasEn = Object.prototype.hasOwnProperty.call(descsEn, e.n) && String(descsEn[e.n]).trim();
  if (!hasEn) {
    if (e.cat === 'ext') extNoEn.push(e.n);
    else errors.push(`descriptions.en.json 缺对外条目「${id}」的英文描述（违反 R2）`);
  }
}
/* 184 条 ext 缺英文是**一个事实**，不是 184 个问题 —— 逐条打印会把真问题淹掉（探针噪声）。 */
if (extNoEn.length) warnings.push(`${extNoEn.length} 个 ext 条目（不上站）没有英文描述 —— 全量如此，非个例`);

/* ── 3. 词表本身 ── */
const unusedTags = TAG_VOCAB.filter((t) => !usedTags.has(t));
if (unusedTags.length) warnings.push(`tags.en.json 有 ${unusedTags.length} 个标签没被任何条目使用: ${unusedTags.slice(0, 10).join(' ')}`);
const staleDesc = Object.keys(descsEn).filter((k) => !k.startsWith('_') && !seenName.has(k));
if (staleDesc.length) warnings.push(`descriptions.en.json 有 ${staleDesc.length} 个条目已不存在（陈旧翻译）: ${staleDesc.slice(0, 8).join(' ')}`);

/* ── 输出 ── */
const catCount = PUBLIC.reduce((a, e) => (a[e.cat] = (a[e.cat] || 0) + 1, a), {});
console.log(`\n条目 ${nav.items.length}（对外 ${PUBLIC.length} · ext ${nav.items.length - PUBLIC.length}）· 分类 ${CAT_CODES.length} · 标签词表 ${TAG_VOCAB.length}（实际用到 ${usedTags.size}）`);
console.log('对外分类分布: ' + Object.entries(catCount).map(([k, v]) => `${k} ${v}`).join(' · '));
console.log(`已下架标记 retired: ${nav.items.filter((e) => e.retired).length} 条`);
if (errors.length) { console.log(`\n错误 ${errors.length} 项：`); errors.slice(0, 40).forEach((e) => console.log('  ✗ ' + e)); if (errors.length > 40) console.log(`  … 另有 ${errors.length - 40} 项`); }
if (warnings.length) { console.log(`\n警告 ${warnings.length} 项：`); warnings.slice(0, 20).forEach((w) => console.log('  ! ' + w)); if (warnings.length > 20) console.log(`  … 另有 ${warnings.length - 20} 项`); }
console.log(`\n错误: ${errors.length}  警告: ${warnings.length}`);
console.log(errors.length ? '结果: ❌ 未通过\n' : '结果: ✅ 通过\n');
process.exit(errors.length ? 1 : 0);
