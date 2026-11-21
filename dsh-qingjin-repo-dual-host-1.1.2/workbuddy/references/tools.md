# 工具参数手册（从 v0.26.1 源码自动提取）

`*` 表示必填。所有工具通过 `node scripts/qingjin.mjs call <tool> '<json>'` 或简写调用。

## outline — 章节骨架
- `kind *` — `research`(完整 IMRaD) | `proposal`(大创申报书) | `title` | 单节 id(`abstract`/`introduction`/`methods`/`results`/`discussion`/`conclusion`)
- `topic` — 工作标题
- `words` — 目标字数（默认 5000）
- `cluster` — 大创项目方向

## template — 可填写模板
- `kind *` — `paper` | `proposal`
- `format` — `md`（默认）| `tex`
- `lang` — `zh`（默认）| `en`
- `title` / `author` / `affiliation` / `keywords` / `date` — 文头信息
- `advisor` — 仅 proposal

## lookup — 统一查询入口
- `scope *` — `glossary` | `phrase` | `rules`
- `query` — glossary 查术语；phrase 自由文本匹配
- `section` — phrase 专用：`abstract`/`intro`/`methods`/`results`/`discussion`/`conclusion`
- `intent` — phrase 专用：`gap`/`result`/`limitation`/…
- `venue` — rules 专用：`cvpr`/`eccv`/`aaai`/`icml`
- `mode` — rules 专用：`all`/`skeleton`/`typography`/`venue`/`patterns`/`sci`/`latex`
- `lang` — rules 专用：`zh` | `en`
- `limit` — 返回条数（默认 3）

> glossary 不带 `query` 时按领域浏览（75 条分组展示）。

## translate — 中英互译辅导
- `direction` — `zh2en` | `en2zh`（省略时自动判断）
- `domain` — `bio` | `chem` | `math` | `physics`（用该领域句式，默认 CV）
- `section` — `abstract`/`intro`/`methods`/`results`/`discussion`/`conclusion`
- `text` — 要处理的段落；省略则返回该章节通用句式

> 输出句式、术语与误例，不输出整段译文——这是设计目标。

## pdf_read — PDF 精读
- `path *` — 绝对路径或相对当前工作目录
- `offset` — 起始字符偏移（默认 0）
- `maxChars` — 本次返回字符数，2000–120000（默认 8000）
- `page` — 读单页（1-based，抽取器知道页边界时可用，覆盖 offset）
- `find` — 按关键词定位，返回最多 8 处匹配 + 页码 + 上下文

> 抽取方式：优先 pdftotext（有 pageRanges），回退内置抽取器（无分页，page/find 不可用会明确说明）。
> 输出三档可信度：可用 / 可疑（给全文但警告）/ 不可用（只给标本与诊断）。

## related — 同方向论文（唯一联网）
- `query *` — 论文标题、DOI、arXiv id 或方向关键词
- `limit` — 候选数 3–20（默认 8）
- `tier` — `AB`（默认）| `A` | `all`
- `oaOnly` — 只保留有开放获取版本的候选

> `QINGJIN_OFFLINE=1` 可完全关闭联网。

## humanize — 去 AI 味诊断
- `text *` — 要诊断的段落（中英文均可）

## flow — 多步任务状态机
- `action *` — `start` | `route` | `advance` | `status`
- `flow` — start 用：`deepread` | `write-section` | `submit-check`
- `flowId` — advance/status 用，start 返回的 id
- `note` — 步骤结果或产物路径
- `engineAvailable` — 是否有 PDF 引擎（false 跳过 export 步）
- `task` — route 用，任务描述
- `mode` — route 用：`route` | `review` | `artifacts` | `venues` | `all`

## export — Markdown 导 PDF
- `md *` — 已完成的 .md 文件路径
- `outDir` — 输出目录（默认与 md 同目录）
- `engine` — `auto`（默认）| `xelatex` | `typst` | `word` | `wps` | `edge`

> 降级链：xelatex → typst → Word → WPS → Edge（内置 md→html）。全失败时逐条列失败原因。

## debug — 调试排查与实验矩阵
- `issue` — 报错摘要或问题类型（OOM / NaN / 无法复现）
- `metric` — 主评价指标（mAP / Rank-1 / 准确率）
- `scope` — 本次要试的变量（batch size / backbone）

## check — 段落诊断
- `section *` — `abstract`/`introduction`/`methods`/`results`/`discussion`/`conclusion`/`translation`
- `text *` — 要诊断的段落
- `compare` — 可选的对照文本（原文或对应章节），跨段核对数字、术语、篇幅比

> 同一段文本 `section=abstract` 与 `section=ABSTRACT` 结果一致（大小写不敏感，v0.18 已修）。
