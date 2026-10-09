# 硅基导航（ai-sites-directory）内容规范

> 本文是**数据文件的必填矩阵**。机器执行方是 [`validate.mjs`](./validate.mjs)
>（本仓没有 `scripts/` 目录，脚本都在仓根 —— 校验器随本仓约定也放根）。
>
> 实测规模：**条目 711（对外 527 · `ext` 184）· 分类 12 · 标签词表 92**。
> ⚠ 「对外 527 条 / 11 类」是**站点口径**（`ext` 分类不上站）；`nav-data.json` 本身是 711 条 / 12 类。

## 一、文件位置

| 文件 | 作用 |
|---|---|
| `nav-data.json` | **唯一真相源**：`{categories[], items[]}` |
| `tags.en.json` | **标签词表**（92 个）+ 英文；封闭枚举，新标签必须先进这里 |
| `categories.en.json` | 12 个分类的英文 `{name, desc}` |
| `descriptions.en.json` | 条目英文描述，**键 = 条目名 `n`** |
| `vendors.en.json` | 厂商名英文映射 |
| `check-results.json` | 外链可达性结果（由 `check-links.mjs` 生成，构建器消费它打 badge）|
| `content/*.md` | 12 个**分类页**的说明文案（一条目一文件？不是 —— 只有分类页）|
| `site/` · `content-summary.json` · `nav-data.json` 的产物 | 构建生成，不要手改 |

## 二、必填字段

### 2.1 `categories[]`

| 字段 | 规则 |
|---|---|
| `code` | 小写字母开头（`^[a-z][a-z0-9]*$`），**唯一**；必在 `categories.en.json` 里有 `{name, desc}` |
| `name` | 中文分类名 |
| `desc` | 一句话说明 |

现有 12 个 code：`llm` `coding` `gen` `app` `model` `dev` `infra` `robot` `learn` `community` `tools` `ext`。

### 2.2 `items[]`（8 个必填）

| 字段 | 规则 |
|---|---|
| `n` | 条目名。**必须唯一**（见 §五 的重名规则）|
| `d` | 中文一句话描述 |
| `u` | 网址，**必须是 http(s)** |
| `tag` | 标签串，**中点 `·` 分隔，1–3 个**，每个都必须在 `tags.en.json` 词表里 |
| `ic` | 一个 emoji 图标 |
| `cat` | 必须 ∈ `categories[].code` |
| `old_t` | 迁移前的旧「类型」名（历史字段，保留以便回溯，当前 711/711 都有）|
| `old_c` | 迁移前的旧「分类」名（同上）|

## 三、可选字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `retired` | 布尔 | 已下架/停服。**必须是布尔值**，不能写字符串。实测 3 条（Play.ht · CSM AI · Ready Player Me）。页面按此渲染成不可点状态 |

## 四、双语要求（R2）

| 内容 | 要求 |
|---|---|
| **对外条目**（`cat !== 'ext'`）| `descriptions.en.json` **必须**有对应键且非空 —— 缺 = 校验失败 |
| `ext` 条目（不上站）| 没有英文描述（实测 183/184 如此，**全量如此非个例**）—— 只汇总成一条警告，不逐条报 |
| 分类 | `categories.en.json` 必须有 `{name, desc}` |
| 标签 | `tags.en.json` 的英文不得为空 |

`descriptions.en.json` 里 `_` 开头的键是元数据（`_comment` / `_scope` / `_quality` / `_progress`），
其余键应**恰好等于对外条目集合**（实测清理掉 22 个陈旧键后为 527）。

## 五、重名规则（重要，且不是「一律禁止」）

`descriptions.en.json` **按条目名做键**，所以重名的后果不同：

| 情况 | 判定 | 原因 |
|---|---|---|
| 两个**对外**条目同名 | ❌ **错误**，必须改名 | 英文描述必然串位，一定出错 |
| 一个对外 + 一个 `ext` 同名 | ⚠ 警告（潜伏陷阱，建议改名）| 目前只有一条上站，无害；但那个 `ext` 条目哪天转正就会串位 |

实测样本：Google 的 **Gemini**（`llm`，对外）与 **Gemini 交易所**（`ext`，不上站）同名 ——
`descriptions.en.json["Gemini"]` 放的是前者的英文，属上述第二种情况。

## 六、判定「已核验」的规则

| 项 | 口径 |
|---|---|
| 外链可达 | **不在这里判** —— `check-links.mjs` 联网逐个查，结果写 `check-results.json`，构建器据此打 badge |
| 条目是否有出处 | 靠 `u` 指回**官方站点**；本仓不收没有官网的条目 |
| 描述准确性 | `d` 必须能从那家官网自证（不写营销话术、不写我们没核过的功能）|

## 七、禁止

- ❌ 手改 `site/` · `content-summary.json`（产物）
- ❌ 自创标签（必须先加进 `tags.en.json` —— 词表在 A5.1 从 860 收敛到 92，别让它重新发散）
- ❌ `tag` 用逗号分隔（**分隔符是中点 `·`**）
- ❌ 一条条目写 4 个以上标签（上限 3）
- ❌ `url` 用 `http://` 以外的协议或写相对路径
- ❌ 在 `content/*.md` 里手写「共 N 条」这类计数（数字由构建器算）
