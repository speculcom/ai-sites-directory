# ai-sites-directory

硅基导航的**源仓**（唯一真相源）。

> ⚠ **本仓不再直接发布站点。**
> 站点产物在 **[`speculcom/nav`](https://github.com/speculcom/nav)** → <https://nav.specul.com>
> 2026-10-04 起拆分（原为本仓既存数据又发 Pages）。

## 目录结构

| 路径 | 内容 |
|---|---|
| `content/` | **内容源**：每个站点一个 md，含分类、描述、标签 |
| `data/` | `nav-data.json`（527 条主数据）+ `categories/tags/vendors/descriptions` 的英文映射 |
| `scripts/` | 四步流水线（归类 → 核验 → 生成 md → 建站） |
| `check-results.json` | 链接检测结果（`urls.txt` 的713 条抽样 60） |
| `urls.txt` | 待检测的 URL 清单（712 行，`check-links.mjs` 的输入） |

## 内容改完要跑的四步

```bash
node scripts/<归类>.mjs      # 1 归类
node check-links.mjs        # 2 核验（读 urls.txt，写 check-results.json）
node gen-content.mjs        # 3 生成 content/*.md
node build-site.mjs         # 4 建站 → 输出到 site/
```

⚠ **四步顺序不能乱**，第3 步读第 1 步的分类结果，第 4 步读第 3 步的 md。

## 推产物

```bash
bash _audit/push-site.sh _data/nav/site speculcom/nav "内容更新"
```

产物目录 `site/` 含 9 个文件：`index.html` + `brand.*` + `site.css`
+ `CNAME` + `.nojekyll` + `robots.txt` + `sitemap.xml` + `README.md`。

⚠ **`.nojekyll` 必须有** —— 缺了 Pages 构建会失败（但线上仍能访问旧产物，
症状极具误导性）。

## 已知问题

⚠ **标签英文覆盖83%**（1176/1425 次出现）—— 249 处标签在英文态显示中文。
待处理。

## 法律立场

只索引、只引述、不托管、不解读许可、不给法律意见。
描述文字为本站原创（CC-BY-SA 4.0），被收录网站的信息归各自权利人。