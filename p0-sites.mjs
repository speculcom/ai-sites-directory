import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// P0：1) 三站全部页面的导航链接改指 nav.specul.com  2) 各站首页加「层」标注

const SITES = path.resolve(HERE, '..', '..', '_sites');

const LAYER = {
  ide: `<p class="t-sm"><span data-zh><strong>本站属于「产品层 · IDE 形态」。</strong>面向使用者直接使用，与 <a href="https://cli.specul.com/">CLI 站</a>属同一层、可直接比较；与 <a href="https://mcp.specul.com/">MCP 站</a>（组件层）不属同一层，本站不做跨层总分比较。</span><span data-en><strong>This site is in the product layer · IDE form.</strong> It is used directly by people and is directly comparable with the <a href="https://cli.specul.com/">CLI atlas</a> (same layer). It is <em>not</em> the same layer as the <a href="https://mcp.specul.com/">MCP atlas</a> (component layer), so we do not rank across layers.</span></p>`,
  cli: `<p class="t-sm"><span data-zh><strong>本站属于「产品层 · CLI 形态」。</strong>面向使用者直接使用，与 <a href="https://ide.specul.com/">IDE 站</a>属同一层、可直接比较；与 <a href="https://mcp.specul.com/">MCP 站</a>（组件层）不属同一层，本站不做跨层总分比较。若你要在本地跑模型，可看 <a href="https://nav.specul.com/">硅基导航</a>。</span><span data-en><strong>This site is in the product layer · CLI form.</strong> Directly comparable with the <a href="https://ide.specul.com/">IDE atlas</a> (same layer), and <em>not</em> the same layer as the <a href="https://mcp.specul.com/">MCP atlas</a> (component layer). For running models locally, see the <a href="https://nav.specul.com/">directory</a>.</span></p>`,
  mcp: `<p class="t-sm"><span data-zh><strong>本站属于「组件层」。</strong>MCP 服务器是<strong>给 Agent 调用的能力组件</strong>，不是给人直接使用的产品，因此不与 <a href="https://ide.specul.com/">IDE</a> / <a href="https://cli.specul.com/">CLI</a>（产品层）做总分比较。本站用 11 个维度（权限范围、传输方式、输出可用性等），与产品层的 8 个维度本就回答不同问题。</span><span data-en><strong>This site is in the component layer.</strong> MCP servers are capability components <em>called by agents</em>, not products people use directly — so we do not produce an overall score against the product layer (IDE / CLI atlases). This site uses 11 axes (permission scope, transport, output availability), which answer different questions from the product layer's 8 axes.</span></p>`,
};

const report = [];

for (const track of ['ide', 'cli', 'mcp']) {
  const dir = path.join(SITES, track);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html'));
  let navFixed = 0, layerAdded = 0;

  for (const f of files) {
    const p = path.join(dir, f);
    let s = fs.readFileSync(p, 'utf8');
    const before = (s.match(/specul\.com\/nav\.html/g) || []).length;
    if (before) {
      s = s.split('specul.com/nav.html').join('nav.specul.com');
      navFixed += before;
    }
    if (f === 'index.html' && !s.includes('本站属于')) {
      const anchor = '<h2>本站目前是「核验快照」，还没有实测数据</h2>';
      if (s.includes(anchor)) {
        s = s.replace(anchor, anchor + '\n            ' + LAYER[track]);
        layerAdded++;
      }
    }
    fs.writeFileSync(p, s, 'utf8');
  }
  report.push({ track, files: files.length, navFixed, layerAdded });
}

console.log('=== 本地修改完成 ===');
for (const r of report) {
  console.log(`  ${r.track}: ${r.files} 页 · 修导航链接 ${r.navFixed} 处 · 加层标注 ${r.layerAdded} 处`);
}

// 复核
console.log('\n=== 复核 ===');
for (const track of ['ide', 'cli', 'mcp']) {
  const dir = path.join(SITES, track);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html'));
  let old = 0, layer = 0;
  for (const f of files) {
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    old += (s.match(/specul\.com\/nav\.html/g) || []).length;
    layer += (s.match(/本站属于/g) || []).length;
  }
  console.log(`  ${track}: 残留旧链接 ${old} · 层标注 ${layer}`);
}
