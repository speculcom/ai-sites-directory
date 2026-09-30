// 目录链接核验。判定必须保守：只有 DNS 解析失败 / 明确 404-410 才判失效。
// 000(连接超时) 与 403/429(反爬) 一律标记 unknown/blocked，绝不误杀。
import fs from 'node:fs';

const LIMIT = Number(process.argv[2] || 60);   // 核验条数上限
const CONC = 10;                               // 并发
const TIMEOUT = 4000;                          // 超时（unknown 不判死链，短超时可接受）

const all = fs.readFileSync('C:/Users/chenhua/Desktop/specul/_data/nav/urls.txt', 'utf8')
  .split('\n').map((s) => s.trim()).filter(Boolean);
const urls = all.slice(0, LIMIT);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

async function check(u) {
  try {
    const r = await fetch(u, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT),
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
    });
    const s = r.status;
    if (s >= 200 && s < 400) return { u, s, v: 'ok' };
    if (s === 404 || s === 410) return { u, s, v: 'dead' };
    if (s === 403 || s === 429 || s === 401) return { u, s, v: 'blocked' };
    return { u, s, v: 'http' + s };
  } catch (e) {
    const code = e?.cause?.code || e?.code || e?.name || 'ERR';
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { u, s: 0, v: 'dead', err: code };
    if (code === 'ABORT_ERR' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED') return { u, s: 0, v: 'unknown', err: code };
    return { u, s: 0, v: 'unknown', err: String(code) };
  }
}

const results = [];
for (let i = 0; i < urls.length; i += CONC) {
  const batch = urls.slice(i, i + CONC).map(check);
  results.push(...(await Promise.all(batch)));
  process.stdout.write(`\r  已核验 ${Math.min(i + CONC, urls.length)}/${urls.length}`);
}
console.log('');

const tally = {};
for (const r of results) tally[r.v] = (tally[r.v] || 0) + 1;

console.log(`\n=== 抽样核验 ${results.length} 条（总 ${all.length} 条）===`);
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(4)}  ${k}`);
}

const dead = results.filter((r) => r.v === 'dead');
if (dead.length) {
  console.log('\n判定失效（需处理）：');
  dead.forEach((r) => console.log(`  - [${r.s}] ${r.u}`));
} else {
  console.log('\n本轮抽样未发现明确失效链接。');
}

console.log('\n说明：unknown = 沙箱网络不可达，不能判定为死链；blocked = 反爬拦截，站点多半存活。');

fs.writeFileSync(
  'C:/Users/chenhua/Desktop/specul/_data/nav/check-results.json',
  JSON.stringify({ sampled: results.length, total: all.length, tally, results }, null, 1),
  'utf8'
);
console.log('已写入 check-results.json');
