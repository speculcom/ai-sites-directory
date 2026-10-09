# ai-sites-directory

硅基导航的**源仓**（唯一真相源）。

> ⚠ **本仓不再直接发布站点。**
> 站点产物在 **[`speculcom/nav`](https://github.com/speculcom/nav)** → <https://nav.specul.com>
> 2026-10-04 起拆分（原为本仓既存数据又发 Pages）。

## 目录结构

| 路径 | 内容 |
|---|---|
| `content/` | **内容源**：每个站点一个 md，含分类、描述、标签 |
| `nav-data.json` | **主数据**：711 条条目 / 12 个分类（其中 `ext` 延伸领域不在站上呈现，故线上为 527 条 / 11 类） |
| `categories.en.json` / `tags.en.json` / `vendors.en.json` / `descriptions.en.json` | 英文映射（分类名 / 标签 / 厂商 / 描述） |
| `check-results.json` | 链接核验快照（每条带状态与核验日期 `lv`，另有 `history` 记每轮 start/done）。**构建器与 `gen-content.mjs` 直接消费它**渲染核验状态 |
| `urls.txt` | 历史快照（2026-09-30 生成）。⚠ 已不是核验输入 —— `check-links.mjs` 直接读 `nav-data.json`，永远与数据一致 |
| `site/` | 站点产物（由 `build-site.mjs` 生成） |

## 内容改完要跑的三步

```bash
node check-links.mjs        # 1 核验（读 nav-data.json，按域名去重；写 check-results.json）
node gen-content.mjs        # 2 刷新 content/*.md 与 content-summary.json
node build-site.mjs         # 3 建站 → 输出到 site/
```

⚠ **`check-results.json` 是产物链的一环**，不是可选报告：跑 `check-links.mjs`
就等于直接改页面产物（每条链接旁显示的核验日期与状态）。

## 核验口径（A4.1 状态机 · 不可放宽）

| 状态 | 判据 | 含义 |
|---|---|---|
| `ok` | 2xx/3xx 且未换注册域 | 可达 |
| `changed` | 2xx/3xx 但重定向到**另一个注册域**（带 `to`） | 已改址，链接触发跳转仍可用 |
| `blocked` | 401 / 403 / 429 | 反爬、限流、需登录 —— 站点活着 |
| `dead` | **404 / 410** | 唯一可以判死的口径 |
| `unverifiable` | DNS 失败 / 超时 / TLS / 5xx / 被墙 | **合法终态，不判死**；开代理后可 `--only=unverifiable` 复测 |
| `unknown` | — | 过渡态：尚未核验。只降不升（`content-freshness.mjs` 有守卫行，基线 626） |

- 宁可漏判不可误杀；`unverifiable` 不是欠债，是诚实结论（DNS 失败 ≠ 死。
  实测 robetta.bakerlab.org 本机 ENOTFOUND、云端 WebFetch 能打开）。
- ⚠ 2026-10-08 修复：Windows 下 curl `-o /dev/null` 会 exit 23（写失败）——
  响应其实拿到了却被当成「探测失败」，626 个 unknown 里 470 个是这条假阴性。
  现用 `-o NUL`，且非零退出时从输出里抢救 http_code。
- 每轮把 start/done 两条记录写进 `history`；核验节奏：

```bash
node check-links.mjs                     # 增量：只补 unknown 与没测过的
node check-links.mjs --limit=100         # 分批（礼貌限速默认每请求 150ms）
node check-links.mjs --only=unverifiable # 开代理后复测「探测受限」的
node check-links.mjs --fresh             # 全量重测
```

## 失效与停运（2026-10-08 起）

两条不同的通道，不要混：

| 情形 | 记在哪 | 渲染 |
|---|---|---|
| 探针确认 404/410 | `check-results.json`（自动） | 变灰 +「链接失效」，**不可点**（div） |
| 探测失败（unverifiable：DNS/超时/TLS/被墙） | `check-results.json`（自动） | **不打徽标**，链接照旧可点（探测不了 ≠ 死了；400+ 条全标徽标只是噪声，页脚统一披露条数） |
| **人工核实停运/被收购关服** | `nav-data.json` 的 **`retired: true`** | 变灰 +「已停运」，**不可点**（div） |

`retired` 是**人工结论**（依据外部检索的独立证据，如「被 X 收购并关服」），
与探针结论分开记 —— 探针的 DNS 失败只说明「探测不到」，不能证明停运。
换址找接手方时：**不能换到收购方域名**（除非该公司就是收购方本体，如 CreateAI）。

## 推产物

```bash
bash _audit/push-site.sh _data/nav/site speculcom/nav "内容更新"
```

产物目录 `site/` 含 9 个文件：`index.html` + `brand.*` + `site.css`
+ `CNAME` + `.nojekyll` + `robots.txt` + `sitemap.xml` + `README.md`。

⚠ **`.nojekyll` 必须有** —— 缺了 Pages 构建会失败（但线上仍能访问旧产物，
症状极具误导性）。

## 标签词表（2026-10-08 A5.1 收敛）

<!-- bilingual-tags: onsite=100% alldata=100% -->
✅ **标签已收敛**（2026-10-08 A5.1）：860 个自由标签（616 个只出现 1 次）→ **92 个目标词表**
（`tags.en.json` 即词表，七组：属性 / 能力 / 行业 / 基建 / 机器人 / Web3 / 内容）。
每条目 1–3 个标签，平均 1.48 个；无单次标签、无零标签条目；中英覆盖 100%。
映射脚本与备份见 `_tmp/a5-map.mjs`（可重放：先备份恢复再 `--apply`）。

> 上面 HTML 注释里的 `bilingual-tags:` 是给探针读的机器可读声明。
> **改覆盖率时必须同时改这一行**，否则 `_audit/content-freshness.mjs` 会判漂移。
> （探针不再从散文里猜数字 —— 猜散文会把「原写的 83%」这种引用当成声明。）

## 法律立场

只索引、只引述、不托管、不解读许可、不给法律意见。
描述文字为本站原创（CC BY 4.0，署名即可自由使用），被收录网站的信息归各自权利人。

## 实测规模（A8）

<!-- STATS:BEGIN 由 _audit/gen-repo-docs.mjs 生成，勿手改 -->
| 项 | 实测值 |
|---|---|
| 条目 | 711 条（对外 527 · ext 184） |
| 分类 | 12 类（对外 11 类） |
| 标签词表 | 92 个（封闭枚举） |
| 下架标记 | 3 条（Play.ht · CSM AI · Ready Player Me） |
<!-- STATS:END -->
