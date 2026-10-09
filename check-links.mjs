import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 目录链接核验（v5 计划 A4.1 · 2026-10-08 重写判定口径）
 *
 * ## 状态机（A4.1.1）—— 五个合法终态 + 一个过渡态
 *   ok           2xx/3xx 且未换注册域 —— 可达
 *   changed      2xx/3xx 但重定向到了**另一个注册域**（记录 to=最终 URL）
 *   blocked      401/403/429 —— 反爬/限流/需登录（站点活着）
 *   dead         404/410 —— **唯一可以判死的口径**
 *   unverifiable 其余一切「探测不到」：DNS 失败 / 连接超时 / TLS 错误 / 5xx /
 *                curl 非零退出……**合法终态，不判死**（如被墙、沙箱 DNS 限制）
 *   unknown      过渡态：尚未在现口径下核验。跑完一批应**单调下降**（每轮记进 history）
 *
 * ## 历史教训（防回退，都交过学费）
 *  1. DNS 失败 ≠ 死。实测 robetta.bakerlab.org 本机 ENOTFOUND，云端 WebFetch 能打开。
 *     旧口径把 DNS 失败判 dead —— 2026-10-08 迁移成 unverifiable（降级重测）。
 *  2. ⚠ Windows 下 curl `-o /dev/null` 会 exit 23（client returned ERROR on write）
 *     —— 响应其实拿到了（-w 仍输出 200），却被当成「探测失败」。
 *     2026-10-08 实测：626 个 unknown 里 470 个是这条自身 bug 造的假阴性。
 *     修复：win32 用 `-o NUL`；且非零退出时从 e.stdout 抢救 http_code。
 *  3. node fetch 不读 http_proxy，curl 读；代理端口是动态的（60965→60739→…），
 *     只认环境变量，绝不写死端口。无代理时 curl 仍复核一次（TLS 栈不同，可能测出 fetch 测不出的）。
 *  4. 判定必须保守：宁可漏判不可误杀 —— 误杀会毁掉用户的真实链接。
 *  5. 反爬会**伪装 404**：Tesla 对 node fetch 回 404、对 curl 回 403（同一 URL）。
 *     404 现在双路复核一次，curl 给出活体证据（2xx/3xx/401/403/429）就不判死。
 *  6. 数据源是 nav-data.json 而不是 urls.txt（后者是快照会脱节）；
 *     60 条上限改成默认全量 + 域名去重；每 50 条落盘（死机不丢进度）。
 *
 * ## 用法
 *   node check-links.mjs                       # 增量续跑：只补 unknown 与从未测过的
 *   node check-links.mjs --limit=50            # 分批：本轮最多测 50 个域名
 *   node check-links.mjs --only=unknown        # 显式只跑 unknown（等价默认行为）
 *   node check-links.mjs --only=unverifiable   # 开代理后把「探测受限」的复测一遍
 *   node check-links.mjs --fresh               # 全量重测（忽略既有终态）
 *   node check-links.mjs --delay=0             # 关掉礼貌限速（默认每请求 150ms）
 *   node check-links.mjs --no-dedup            # 关掉域名去重
 * 产出直接写回 check-results.json；history 供 content-freshness 守「unknown 只降不升」。
 */

const ROOT = path.resolve(HERE, '..', '..');
const NAV = path.join(ROOT, '_data', 'nav', 'nav-data.json');
const OUT = path.join(ROOT, '_data', 'nav', 'check-results.json');

/* 参数解析 */
const argv = process.argv.slice(2);
const optNum = (name, dflt) => {
  const a = argv.find((x) => x.startsWith('--' + name + '='));
  return a ? Number(a.split('=')[1]) : dflt;
};
const LIMIT = optNum('limit', Infinity);
const DEDUP = !argv.includes('--no-dedup');
const FRESH = argv.includes('--fresh');
const DELAY = optNum('delay', 150);
const onlyArg = argv.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean) : null;

const STATES = new Set(['ok', 'dead', 'blocked', 'changed', 'unverifiable']);
if (ONLY) {
  for (const s of ONLY) {
    if (!STATES.has(s) && s !== 'unknown') {
      console.error(`未知状态 ${s} —— 可选：ok/dead/blocked/changed/unverifiable/unknown`);
      process.exit(1);
    }
  }
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const CONC = 16;   // ⚠ 30 并发疑似压垮过机器（2026-10-06 死机一次）；16 并发全量约 9 分钟
const TIMEOUT = 5000;
const NULLDEV = process.platform === 'win32' ? 'NUL' : '/dev/null';
const HAS_PROXY = !!(process.env.http_proxy || process.env.HTTP_PROXY);
const LV = new Date().toISOString().slice(0, 10);  // 每条结论的核验日期

/* 注册域（eTLD+1）近似 —— 只为判「重定向是否换了注册域」。
 * 不引第三方 PSL；常见多段后缀手列，未知的按最后两段。 */
const MULTI_SUFFIX = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn', 'com.hk', 'com.tw', 'com.au', 'net.au', 'org.au', 'co.jp', 'ne.jp', 'or.jp', 'co.kr', 'com.br', 'com.mx', 'co.in', 'com.sg', 'com.my', 'co.nz', 'co.za', 'com.tr', 'com.ar', 'com.ru', 'com.ua', 'co.il']);
function registrable(u) {
  try {
    const h = new URL(u).hostname.toLowerCase().replace(/^www\./, '');
    const p = h.split('.');
    if (p.length <= 2) return h;
    const last2 = p.slice(-2).join('.');
    return MULTI_SUFFIX.has(last2) ? p.slice(-3).join('.') : last2;
  } catch (e) { return ''; }
}

/* 统一的 HTTP 结论分类（fetch 与 curl 两路共用 —— 口径不许分叉） */
function classifyHttp(u, s, finalUrl) {
  if (s >= 200 && s < 400) {
    const moved = finalUrl && registrable(u) && registrable(finalUrl) && registrable(u) !== registrable(finalUrl);
    return moved ? { v: 'changed', s, to: finalUrl } : { v: 'ok', s };
  }
  if (s === 404 || s === 410) return { v: 'dead', s };
  if (s === 401 || s === 403 || s === 429) return { v: 'blocked', s };
  return { v: 'unverifiable', s, err: 'http' + s };
}

/* node fetch —— 快，但不读代理变量 */
async function checkFetch(u) {
  try {
    const r = await fetch(u, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT),
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
    });
    return classifyHttp(u, r.status, r.url);
  } catch (e) {
    const name = e?.name || 'ERR';
    const code = e?.cause?.code || e?.code;
    /* AbortSignal.timeout → DOMException TimeoutError（数字 code 23）；DNS 失败在 cause.code */
    if (name === 'TimeoutError' || code === 23) return { v: 'unverifiable', s: 0, err: 'timeout' };
    return { v: 'unverifiable', s: 0, err: String(code || name) };
  }
}

/* curl 复核 —— **curl 读 proxy 变量，node fetch 不读**。
 * ⚠ 2026-10-08：win32 必须 `-o NUL`。`-o /dev/null` 会 exit 23（写失败），
 *   曾经把 470 个可达站点错判成「探测失败」。非零退出时还要从 stdout 抢救 http_code。 */
function checkCurl(u) {
  const args = ['-s', '-o', NULLDEV, '-w', '%{http_code} %{url_effective}', '--max-time', '8', '-L', '-A', UA, u];
  let out = '';
  try {
    out = execFileSync('curl', args, { encoding: 'utf8', timeout: 12000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (e) {
    out = String(e.stdout || '').trim();  // exit≠0 但 -w 可能已输出
    if (!/^\d{3} /.test(out)) {
      return { v: 'unverifiable', s: 0, err: 'curl-' + String(e.status ?? e.message ?? '').slice(0, 30) };
    }
  }
  const m = out.match(/^(\d{3})\s+(.*)$/s);
  if (!m) return { v: 'unverifiable', s: 0, err: 'curl-parse' };
  const s = Number(m[1]);
  if (!s) return { v: 'unverifiable', s: 0, err: 'curl-000' };
  return classifyHttp(u, s, m[2].trim());
}

async function check(u) {
  const f = await checkFetch(u);
  /* ⚠ 2026-10-08：fetch 说 404/410 时用 curl 复核一次 —— 反爬会伪装 404。
   * 实例：Tesla 对 fetch 回 404、对 curl 回 403（同一 URL 两条路结论冲突 =
   * 看到的 404 不可信）。curl 给出明确活体证据（2xx/3xx 或 401/403/429）就
   * 推翻死判（宁可漏判不可误杀）；curl 也 404/410 或探测失败则维持原判，
   * 复核结论记进 curlNote 供日后追溯。 */
  if (f.v === 'dead') {
    const c = checkCurl(u);
    if (c.v === 'ok' || c.v === 'changed' || c.v === 'blocked') return { u, ...c, via: 'curl', fetchErr: 'fetch-' + f.s };
    return { u, ...f, via: 'fetch', curlNote: c.v === 'dead' ? 'curl-' + c.s + '（双路一致）' : 'curl-' + (c.err || '?') };
  }
  if (f.v !== 'unverifiable') return { u, ...f, via: 'fetch' };
  /* DNS 失败 curl 也一样失败，跳过复核省 8 秒 */
  if (/ENOTFOUND|EAI_AGAIN/.test(String(f.err))) return { u, ...f, via: 'fetch' };
  const c = checkCurl(u);
  if (c.v !== 'unverifiable' || c.s) return { u, ...c, via: 'curl', fetchErr: f.err };
  return { u, v: 'unverifiable', s: 0, err: f.err, curlErr: c.err, via: 'fetch+curl' };
}

/* ⚠ 数据源是 nav-data.json，不是 urls.txt —— 后者是快照，会与数据脱节。 */
const nav = JSON.parse(fs.readFileSync(NAV, 'utf8'));
let urls = nav.items.map((x) => x.u);
if (DEDUP) {
  const seenHost = new Set();
  urls = urls.filter((u) => {
    try {
      const h = new URL(u).host;
      if (seenHost.has(h)) return false;
      seenHost.add(h);
      return true;
    } catch (e) { return true; }
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tallyOf = (list) => {
  const t = {};
  for (const r of list) t[r.v] = (t[r.v] || 0) + 1;
  return t;
};

/* 启动时读旧快照 */
let prior = null;
try { prior = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* 首次运行 */ }

/* ⚠ 2026-10-08 口径迁移（一次性，幂等）：旧口径把「DNS 失败」判成 dead。
 * 新口径只认 404/410 判死 —— 旧的 dead(DNS) 与非标准旧值（http5xx）一律降为
 * unknown **重测一次**，拿到新口径下的真实证据。626 即迁移前的 unknown 基线。 */
let migrated = 0;
if (prior && Array.isArray(prior.results)) {
  for (const r of prior.results) {
    if (r.v === 'dead' && !(r.s === 404 || r.s === 410)) { r.v = 'unknown'; r.migrated = '旧口径DNS死→按新状态机重测'; migrated++; }
    else if (r.v && !STATES.has(r.v) && r.v !== 'unknown') { r.v = 'unknown'; r.migrated = '旧状态' + (r.err || '') + '→重测'; migrated++; }
  }
}
if (migrated) console.log(`口径迁移：${migrated} 条旧结论按新状态机降级为 unknown（本轮重测）`);

const priorByUrl = new Map();
if (prior && Array.isArray(prior.results)) for (const r of prior.results) priorByUrl.set(r.u, r);

/* 选批：--fresh 全量；--only=… 显式指定状态；默认只补 unknown 与从未测过的 */
let selected;
if (FRESH) selected = urls;
else {
  selected = urls.filter((u) => {
    const r = priorByUrl.get(u);
    if (!r) return true;                       // 从未测过 —— 必须测
    if (ONLY) return ONLY.includes(r.v);       // 显式 --only
    return r.v === 'unknown';                  // 默认：只补过渡态
  });
}
const matched = selected.length;
selected = selected.slice(0, LIMIT === Infinity ? undefined : LIMIT);
console.log(`候选 ${urls.length} 个域名${DEDUP ? '（按域名去重）' : '（去重关闭）'} · 本轮待测 ${selected.length} 个${matched > selected.length ? `（--limit 截断，余 ${matched - selected.length} 个下批）` : ''}`);

/* ⚠ 原实现只在全部跑完才写盘 —— 死机/被杀时进度全丢（实测丢过 250/632）。
 * 每 50 条落盘；并且启动就落一次（把 history 的 start 条目先记下来）。 */
const HISTORY = (prior && Array.isArray(prior.history)) ? prior.history.slice(-99) : [];
const START_TALLY = tallyOf(prior && Array.isArray(prior.results) ? prior.results : []);

function carriedFromPrev() {
  if (!prior || FRESH || !Array.isArray(prior.results)) return [];
  const testedNow = new Set(results.map((r) => r.u));
  /* ⚠ 2026-10-08：判定「URL 还在不在数据里」必须**精确匹配**，不能用 host ——
   * 同域内换址（tesla.com/optimus → tesla.com/AI）时 host 相同，旧条目会被错误保留，
   * 快照里同时躺着陈旧死链与新链接，页脚「已失效」计数就会虚报。 */
  const navUrls = new Set(nav.items.map((x) => x.u));
  const out = [];
  for (const r of prior.results) {
    /* 终态与 unknown 都保留（本轮没测到的不能丢）；URL 已从 nav-data 消失的（改过链接）丢弃 */
    if (r.v !== 'unknown' && !STATES.has(r.v)) continue;
    if (testedNow.has(r.u)) continue;
    if (!navUrls.has(r.u)) continue;
    if (!r.lv) r.lv = String(prior.at || '').slice(0, 10);
    out.push(r);
  }
  return out;
}

function saveSnapshot() {
  const all = [...carriedFromPrev(), ...results];
  const tally = tallyOf(all);
  fs.writeFileSync(OUT, JSON.stringify({
    at: new Date().toISOString(),
    source: 'nav-data.json',
    items: nav.items.length,
    checked: all.length,       // 快照总覆盖（含续跑保留的旧结论）
    probedNow: results.length, // 本轮实际新测
    dedup: DEDUP,
    proxy: HAS_PROXY,
    only: ONLY,
    tally,
    history: HISTORY,
    results: all,
  }, null, 1), 'utf8');
  return all;
}

/* 并发池 */
const results = [];
let done = 0;
const queue = [...selected];

HISTORY.push({ at: new Date().toISOString(), kind: 'start', items: nav.items.length, probedNow: 0, tally: START_TALLY });
saveSnapshot();  // 先把 start 状态钉住

async function worker() {
  while (queue.length) {
    const u = queue.shift();
    if (DELAY > 0) await sleep(DELAY);   // 礼貌限速：每请求间隔
    results.push({ lv: LV, ...(await check(u)) });
    done++;
    if (done % 50 === 0) {
      process.stdout.write(`\r已核验 ${done}/${selected.length}   `);
      try { saveSnapshot(); } catch (e) { /* 落盘失败不中断核验 */ }
    }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
console.log('\r' + ' '.repeat(40) + '\r');

HISTORY.push({ at: new Date().toISOString(), kind: 'done', items: nav.items.length, probedNow: results.length, tally: tallyOf([...carriedFromPrev(), ...results]) });
const all = saveSnapshot();
const tally = tallyOf(all);

console.log(`\n=== nav 站外链核验（本轮实测 ${results.length} 条 · 快照共 ${all.length} 条${DEDUP ? ' · 按域名去重' : ''}）===`);
console.log(`数据源 nav-data.json（${nav.items.length} 条条目）· 代理 ${HAS_PROXY ? '已启用' : '未启用'} · 每请求间隔 ${DELAY}ms\n`);
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  const tag = {
    ok: '← 可达',
    changed: '← 可达（已改址，重定向到别的注册域）',
    blocked: '← 反爬/限流/需登录（站点多半还活着）',
    dead: '← **真死链（404/410），需处理**',
    unverifiable: '← 探测受限（DNS/超时/TLS/被墙），**不判死**',
    unknown: '← 过渡态：待核验（应单调下降）',
  }[k] || '';
  console.log(`  ${String(v).padStart(4)}  ${k.padEnd(12)}${tag}`);
}

const dead = all.filter((r) => r.v === 'dead');
if (dead.length) {
  console.log(`\n判定失效（需处理 ${dead.length} 条）：`);
  dead.forEach((r) => {
    const item = nav.items.find((x) => x.u === r.u);
    console.log(`  [${r.s || '?'}] ${r.u}${r.lv ? '  (核验 ' + r.lv + ')' : ''}`);
    if (item) console.log(`     「${item.n}」${item.d ? '— ' + item.d.slice(0, 42) : ''}`);
  });
} else {
  console.log('\n✓ 未发现明确失效链接。');
}

const changed = all.filter((r) => r.v === 'changed');
if (changed.length) {
  console.log(`\n已改址（${changed.length} 条 · 链接仍可点，会自动跳到新地址）：`);
  changed.slice(0, 12).forEach((r) => console.log(`  ${new URL(r.u).host} → ${(r.to || '').slice(0, 60)}`));
  if (changed.length > 12) console.log(`  …… 另有 ${changed.length - 12} 条`);
}

const unk = tally.unknown || 0;
const startUnk = START_TALLY.unknown || 0;
if (unk > startUnk) {
  console.warn(`\n⚠ unknown 数比本轮起点上升（${startUnk} → ${unk}）—— 新增站点属正常，探针故障请排查。`);
} else if (unk > 0) {
  console.log(`\n仍剩 ${unk} 条 unknown（本轮起点 ${startUnk}）。再跑一次本脚本继续，或加 --limit 分批。`);
}

console.log('\n口径说明：dead 只认 404/410；同注册域的重定向算 ok，跨注册域算 changed（带 to）。');
console.log('        unverifiable（DNS 失败/超时/TLS/被墙）与 blocked（反爬）**都不是死链** —— 宁可漏判不可误杀。');
if ((tally.unverifiable || 0) > 0) console.log('        开代理后可将「探测受限」的复测一遍：node check-links.mjs --only=unverifiable');
if (HAS_PROXY) console.log('        代理已启用：fetch 测不通的项目用 curl 复核过（curl 能读 proxy 变量）。');

console.log(`\n已写入 ${OUT}（每 50 条落过一次盘，中途被杀不丢进度）`);