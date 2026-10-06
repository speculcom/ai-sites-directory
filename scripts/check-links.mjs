// 目录链接核验。判定必须保守：只有 DNS 解析失败 / 明确 404-410 才判失效。
// 000(连接超时) 与 403/429(反爬) 一律标记 unknown/blocked，绝不误杀。
//
// 2026-10-05 改造（三个实测问题）：
//  1. ⚠ **原来读 urls.txt（9-30 的快照）** —— 数据改了它不知道，会去检查
//     已不存在的旧URL。改为**直接读 nav-data.json**，永远与数据一致。
//     （实测 urls.txt 713 条 vs nav-data 711 条，差 8 处）
//  2. ⚠ **60 条上限 = 711 条里只覆盖 8%**。改为默认全量（--limit 可限制），
//     并用域名去重（同域名多条只测一次 → 692/711）。
//  3. ⚠ **node 的 fetch 不读 http_proxy 环境变量**，代理开着也测不出结果。
//     现在先试 fetch，失败且存在 proxy 时**再走 curl** 复核 —— curl 读代理。
//     ⚠ 实测 curl 走代理对部分域名 exit=35（TLS 错误），
//        所以 curl 结果也只能当 unknown，不能判死。
//
// 判定口径（不变，这是原脚本写得对的地方）：
//   dead    = 404 / 410 / DNS 解析失败（ENOTFOUND / EAI_AGAIN）
//   blocked = 403 / 429 / 401（反爬、限流、需登录 —— 站点多半还活着）
//   unknown = 000 超时 / TLS 错误 / 其他（**探测不了，不能判死**）
//   ok      = 2xx / 3xx
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = 'C:/Users/chenhua/Desktop/specul/';
const NAV = ROOT + '_data/nav/nav-data.json';
const OUT = ROOT + '_data/nav/check-results.json';

/* 参数：--limit=N 限制条数（默认全量） · --no-dedup 关掉域名去重 */
const argv = process.argv.slice(2);
const limitArg = argv.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
const DEDUP = !argv.includes('--no-dedup');

/* ⚠ 数据源是 nav-data.json，不是 urls.txt —— 后者是快照，会与数据脱节。 */
const nav = JSON.parse(fs.readFileSync(NAV, 'utf8'));
let urls = nav.items.map(x => x.u);

if (DEDUP) {
  const seenHost = new Set();
  urls = urls.filter(u => {
    try {
      const h = new URL(u).host;
      if (seenHost.has(h)) return false;
      seenHost.add(h);
      return true;
    } catch (e) { return true; }
  });
}
urls = urls.slice(0, LIMIT === Infinity ? undefined : LIMIT);

/* ⚠ 2026-10-05 增量续跑：全量 692 条在最坏情况下要 20+ 分钟，一次跑不完
 * （超时被停 = 进度全丢）。现在启动时读旧 check-results.json，
 * 已有**定论**（ok / dead / blocked）的域名直接跳过，只补测 unknown 与没测过的。
 * 多次运行可以把全量逐步跑完，每次运行都是可交付的完整快照。
 * --fresh 关掉续跑（全量重测）。 */
const FRESH = argv.includes('--fresh');
let prior = null;
try { prior = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { /* 首次运行 */ }
if (prior && !FRESH && Array.isArray(prior.results)) {
  const settled = new Set(prior.results.filter(r => r.v === 'ok' || r.v === 'dead' || r.v === 'blocked').map(r => r.u));
  const before = urls.length;
  urls = urls.filter(u => !settled.has(u));
  console.log(`续跑：已有定论 ${settled.size} 个域名跳过，本轮补测 ${urls.length} 个（共 ${before}）`);
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const CONC = 30;   // ⚠ 实测 12 并发要 50 分钟；30 并发约 20 分钟
const TIMEOUT = 5000;
const HAS_PROXY = !!(process.env.http_proxy || process.env.HTTP_PROXY);

/* node fetch 判定 —— 口径与原脚本一致 */
async function checkFetch(u) {
  try {
    const r = await fetch(u, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT),
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
    });
    const s = r.status;
    if (s >= 200 && s < 400) return { v: 'ok', s };
    if (s === 404 || s === 410) return { v: 'dead', s };
    if (s === 403 || s === 429 || s === 401) return { v: 'blocked', s };
    return { v: 'http' + s, s };
  } catch (e) {
    const code = e?.cause?.code || e?.code || e?.name || 'ERR';
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { v: 'dead', s: 0, err: code };
    return { v: 'unknown', s: 0, err: String(code) };
  }
}

/* curl 复核 —— **curl 读 proxy 变量，node fetch 不读**。
 * ⚠ 但 curl 的结果同样保守：任何非 404/410 都只当 unknown。
 * ⚠ 实测走代理对部分域名 exit=35（TLS 错误），所以这一路只能用于「不判死」。 */
function checkCurl(u) {
  try {
    const out = execFileSync('curl',
      ['-s', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '8', '-L', '-A', UA, u],
      { encoding: 'utf8', timeout: 12000, stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    if (out === '404' || out === '410') return { v: 'dead', s: Number(out) };
    if (/^[23]\d\d$/.test(out)) return { v: 'ok', s: Number(out) };
    return { v: 'unknown', s: Number(out) || 0, err: 'curl ' + (out || '000') };
  } catch (e) {
    return { v: 'unknown', s: 0, err: 'curl ' + String(e.status || e.message || '').slice(0, 30) };
  }
}

async function check(u) {
  const f = await checkFetch(u);
  if (f.v !== 'unknown' || !HAS_PROXY) return { u, ...f, via: 'fetch' };
  // ⚠ fetch 说未知 + 代理在 → 用 curl 复核一次（curl 能读 proxy）
  const c = checkCurl(u);
  return { u, ...c, via: 'curl', fetchErr: f.err };
}

/* 并发池 */
const results = [];
let done = 0;
const queue = [...urls];
async function worker() {
  while (queue.length) {
    const u = queue.shift();
    results.push(await check(u));
    done++;
    if (done % 50 === 0) process.stdout.write(`\r已核验 ${done}/${urls.length}   `);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
console.log('\r' + ' '.repeat(40) + '\r');

/* 汇总 —— ⚠ 续跑模式下把「本轮新测」与「旧快照里仍有定论的」合并，
 * 产出始终是完整快照（构建器消费的就是这个文件，不能只存本轮）。
 * 旧结果里 URL 已从 nav-data 消失的（改过链接）自动丢弃。 */
const allHosts = new Set(urls.map(u => { try { return new URL(u).host; } catch (e) { return u; } }));
const carried = [];
if (prior && !FRESH && Array.isArray(prior.results)) {
  const testedNow = new Set(results.map(r => r.u));
  const navHosts = new Set(nav.items.map(x => { try { return new URL(x.u).host; } catch (e) { return x.u; } }));
  for (const r of prior.results) {
    if (r.v !== 'ok' && r.v !== 'dead' && r.v !== 'blocked') continue; // 旧的 unknown 重测过
    if (testedNow.has(r.u)) continue;                                    // 本轮已重测
    let h; try { h = new URL(r.u).host; } catch (e) { h = r.u; }
    if (!navHosts.has(h)) continue;                                      // URL 已改/条目已删 → 丢弃
    carried.push(r);                                                     // 定论仍在 → 保留
  }
}
const all = [...carried, ...results];
const tally = {};
for (const r of all) tally[r.v] = (tally[r.v] || 0) + 1;

console.log(`\n=== nav 站外链核验（本轮 ${results.length} 条 · 快照共 ${all.length} 条${DEDUP ? ' · 按域名去重' : ''}）===`);
console.log(`数据源 nav-data.json（${nav.items.length} 条条目）· 代理 ${HAS_PROXY ? '已启用' : '未启用'}\n`);
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  const tag = {
    ok: '← 可达', dead: '← **真死链，需处理**',
    blocked: '← 反爬/限流/需登录（站点多半还活着）',
    unknown: '← 探测不了，**不判死**',
  }[k] || '';
  console.log(`  ${String(v).padStart(4)}  ${k.padEnd(10)}${tag}`);
}

const dead = all.filter(r => r.v === 'dead');
if (dead.length) {
  console.log(`\n判定失效（需处理 ${dead.length} 条）：`);
  dead.forEach(r => {
    const item = nav.items.find(x => x.u === r.u);
    console.log(`  [${r.s || 'DNS'}] ${r.u}`);
    if (item) console.log(`     「${item.n}」${item.d ? '— ' + item.d.slice(0, 42) : ''}`);
  });
} else {
  console.log('\n✓ 未发现明确失效链接。');
}

console.log('\n口径说明：dead 只认 404/410/DNS 失败。');
console.log('        blocked（反爬）与 unknown（探测不到）**都不是死链** —— 宁可漏判不可误杀。');
if (HAS_PROXY) {
  console.log('        代理已启用：fetch 失败的项目用 curl 复核过（curl 能读 proxy 变量）。');
}

fs.writeFileSync(OUT, JSON.stringify({
  at: new Date().toISOString(),
  source: 'nav-data.json',
  items: nav.items.length,
  checked: all.length,      // 快照总覆盖（含续跑保留的旧定论）
  probedNow: results.length, // 本轮实际新测
  dedup: DEDUP,
  proxy: HAS_PROXY,
  tally,
  results: all,
}, null, 1), 'utf8');
console.log(`\n已写入 ${OUT}`);