// 把现有 713 条目录数据重新归类为系统化分类，并导出 JSON + 统计
import fs from 'node:fs';

const SRC = 'C:/Users/chenhua/Desktop/specul/www.specul/data.full.js';
const OUT = 'C:/Users/chenhua/Desktop/specul/_data/nav/nav-data.json';
const URLS = 'C:/Users/chenhua/Desktop/specul/_data/nav/urls.txt';

const cards = new Function(fs.readFileSync(SRC, 'utf8') + '\nreturn cards;')();

// 新分类体系
const CATS = [
  { code: 'llm',    name: '大模型与对话',    desc: '通用大模型、AI 搜索与提示词生态' },
  { code: 'coding', name: 'AI 编程与 Agent', desc: '编码助手、终端 Agent 与自动化智能体' },
  { code: 'gen',    name: '多模态生成',      desc: '图像、视频、音频、3D 与数字人生成' },
  { code: 'app',    name: 'AI 办公与垂直应用', desc: '写作办公、医疗、法律、金融、教育、营销等' },
  { code: 'model',  name: '模型与权重',      desc: '模型平台、开源模型与权重托管' },
  { code: 'dev',    name: '开发框架与工具',  desc: 'AI 开发框架、MLOps、向量库、评测与安全' },
  { code: 'infra',  name: '算力与芯片',      desc: '算力云、芯片、量子计算与半导体' },
  { code: 'robot',  name: '机器人与具身智能', desc: '人形、工业、服务、自动驾驶与无人机' },
  { code: 'learn',  name: '学习资源',        desc: '论文、课程、数据集、书籍与练习平台' },
  { code: 'community', name: '社区与资讯',   desc: 'AI 资讯、社区、播客与实验室' },
  { code: 'tools',  name: '开发者工具',      desc: '通用开发、后端、效率与低代码工具' },
  { code: 'ext',    name: '延伸领域',        desc: '链上与加密等相邻领域（非 AI 主体）' },
];

// 旧 t → 新分类码（ai 组细分）
const T_MAP = {
  '大语言模型': 'llm', 'AI搜索': 'llm', 'AI提示词市场': 'llm',
  'AI编程': 'coding', 'AI Agent': 'coding',
  'AI绘画': 'gen', 'AI视频': 'gen', 'AI音频': 'gen', '3D生成': 'gen', '数字人': 'gen', 'AI设计': 'gen',
  'AI写作办公': 'app', 'AI 医疗': 'app', 'AI 金融': 'app', 'AI 教育': 'app',
  'AI 营销': 'app', 'AI 法律': 'app', 'AI for Science': 'app',
  '模型平台': 'model', '开源模型': 'model',
  'AI开发框架': 'dev', 'MLOps': 'dev', '数据标注': 'dev', '向量数据库': 'dev',
  '开源 AI 项目': 'dev', 'AI 安全': 'dev', 'AI 评测': 'dev',
  'AI资讯': 'community', 'AI社区': 'community', '播客': 'community',
  'AI实验室': 'community', '资讯社区': 'community',
  '论文研究': 'learn', '在线课程': 'learn', '练习平台': 'learn',
  'AI书籍': 'learn', '开源数据集': 'learn', '编程语言': 'learn',
};

// 顶层 c → 默认分类
const C_MAP = {
  silicon: 'infra',
  robot: 'robot',
  tools: 'tools',
  blockchain: 'ext',
  crypto: 'ext',
  game: 'ext',
};

const unmapped = new Set();
const items = [];

for (const x of cards) {
  let code = T_MAP[x.t];
  if (!code) code = C_MAP[x.c];
  if (!code) {
    // learn / ai 组剩余归入合理默认
    code = x.c === 'learn' ? 'learn' : x.c === 'ai' ? 'app' : 'tools';
    unmapped.add(`${x.c}/${x.t}`);
  }
  items.push({
    n: x.n,
    d: x.d,
    u: x.u,
    tag: x.tag || '',
    ic: x.ic || '',
    cat: code,
    old_t: x.t,
    old_c: x.c,
  });
}

// 统计
const stat = {};
for (const it of items) stat[it.cat] = (stat[it.cat] || 0) + 1;

console.log('=== 重新归类结果（共 ' + items.length + ' 条）===');
for (const c of CATS) {
  const n = stat[c.code] || 0;
  const bar = '#'.repeat(Math.round(n / 4));
  console.log(`  ${String(n).padStart(4)}  ${c.name.padEnd(12, '　')} ${bar}`);
}
if (unmapped.size) {
  console.log('\n未命中映射、走默认归属的小类：');
  [...unmapped].sort().forEach((k) => console.log('  - ' + k));
}

fs.writeFileSync(OUT, JSON.stringify({ categories: CATS, items }, null, 1), 'utf8');
fs.writeFileSync(URLS, [...new Set(items.map((i) => i.u))].join('\n'), 'utf8');
console.log(`\n已写入 ${OUT}`);
console.log(`已导出 ${new Set(items.map((i) => i.u)).size} 个唯一 URL -> ${URLS}`);
