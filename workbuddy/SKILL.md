---
name: qingjin-research
display_name: 青衿科研
display_name_en: Qingjin Research
description_zh: 论文科研工作台：章节骨架、成稿模板、英文句式与术语、段落与译文诊断、PDF 精读、调试排查清单。当用户写论文、改论文、查术语、诊断段落、读 PDF 论文、做实验调试时使用。
description_en: A paper-writing workbench: section skeletons, fill-in templates, English phrases, bilingual terminology, paragraph/translation diagnostics, PDF deep-reading and experiment debugging. Use when writing or reviewing an academic paper, checking terminology, diagnosing a paragraph, reading a paper PDF, or designing experiments.
version: 1.1.2
agent_created: true
author: 肖祥云
description: |
  论文科研工作台，由 DSH 插件「青衿科研」适配而来。提供 11 项能力：论文骨架、成稿模板、术语与句式查询、中英互译辅导、段落自检、跨段一致性核对、去 AI 味诊断、PDF 精读（含页码定位）、同方向论文检索、多流程引导、调试排查与实验矩阵。
  触发词：写论文、论文骨架、论文模板、英文句式、术语对照、中英互译、段落自检、译文校核、去 AI 味、PDF 精读、读论文、调试排查、实验设计、实验矩阵、投稿格式、选题、开题、大创申报书。
---

# 青衿科研 · WorkBuddy 版

由 DSH 插件 `@wocao123103/dsh-qingjin` v0.26.1 适配而来。**核心逻辑零改动**：所有能力通过 `scripts/qingjin.mjs` 调用原插件的全部 11 个工具。

## 核心原则

1. **给脚手架，不代写**：产出结构、句式、判据与诊断，成文由作者完成。这是设计目标，不是能力限制。
2. **先诊断，再动手**：改段落前先跑 `check`，只改被点出的问题。
3. **引用要可回溯**：PDF 精读的数字与句子必须来自抽取文本；推断标「推测」，引句标页码。

## 如何调用

所有能力走同一个 CLI：

```bash
# 列出工具
node <skill>/scripts/qingjin.mjs list

# 简写调用（值含空格加引号）
node <skill>/scripts/qingjin.mjs lookup scope=glossary query="frame of reference"
node <skill>/scripts/qingjin.mjs check section=abstract text="..."

# 复杂参数用 JSON
node <skill>/scripts/qingjin.mjs call qingjin_pdf_read '{"path":"/abs/paper.pdf","page":2}'
```

用本 Skill 所在目录的绝对路径替换 `<skill>`。命令输出即工具原文，直接呈现给用户，不要二次加工成"看起来更漂亮"的版本。

## 能力路由

根据用户意图选工具；参数细节见 `references/tools.md`。

| 用户想做什么 | 工具 | 关键参数 |
|---|---|---|
| 要论文/章节骨架 | `outline` | `kind=research\|proposal\|title\|章节id`, `topic`, `words` |
| 要能填的成稿模板 / LaTeX | `template` | `kind=paper\|proposal`, `format=md\|tex` |
| 查术语标准译法与易错点 | `lookup` | `scope=glossary`, `query`；无 query 时按领域浏览 |
| 按意图找英文句式 | `lookup` | `scope=phrase`, `section`, `intent` |
| 查骨架/排版/会议格式 | `lookup` | `scope=rules`, `mode=skeleton\|typography\|venue\|...` |
| 中英互译辅导 | `translate` | `direction=zh2en\|en2zh`, `section`, `text` |
| 诊断一段文字 | `check` | `section`, `text`, 可选 `compare` |
| 核对原文与译文一致性 | `check` | `section=translation`, `text`, `compare=原文` |
| 去 AI 味诊断 | `humanize` | `text` |
| 读 PDF 论文 | `pdf_read` | `path`, 可选 `page=N` / `find=关键词` / `offset` |
| 找同方向论文 | `related` | `query`；需联网，`QINGJIN_OFFLINE=1` 可关 |
| 多步任务引导 | `flow` | `action=start\|route\|advance\|status` |
| 调试排查 / 实验矩阵 | `debug` | `issue`, `metric`, `scope` |
| md 导 PDF | `export` | `md`, `engine=auto` |

## 工作流约定

- **多步任务**（选题评审、精读、投稿检查）先用 `flow action=route` 或 `flow action=start` 取步骤清单，再按步推进，不要跳步。
- **段落诊断**：用户写一段 → 跑 `check` → 只改被点出的问题 → 再跑 `check` 确认。改完不重跑就等于没验证。
- **翻译**：先 `translate` 给句式、术语和误例，再让用户自己写，最后 `check section=translation` 核数字、术语、比较方向。
- **精读**：先 `pdf_read` 抽正文，再写精读文章。只引用抽取文本里出现的数字和句子。

## 数据资产

内置 75 条术语（含易错译提示）、36 条按章节×意图索引的英文句式、8 篇样本来源清单、A/B 档会议分级表。详见 `references/data-assets.md`。

## WorkBuddy 原生能力的分工

- **联网检索**：`related` 走 OpenAlex；若需更全面的检索，优先用 WorkBuddy 自带的联网搜索，本 Skill 的 `related` 作为会议分级与 OA 链接补充。
- **PDF 读取**：`pdf_read` 用于页码定位与抽取；需要视觉核对（图表、公式版面）时，用 WorkBuddy 的 PDF 阅读能力。
- **文件读写**：模板/骨架写入文件由 WorkBuddy 自身完成，本 Skill 只产出内容。
- **状态文件**：`flow` 的状态写在 `$DSH_HOME/qingjin/flows.json`（默认 `~/.dsh`）；设 `QINGJIN_FLOW_STATE=off` 可关闭落盘。

## 边界

- 不代写整篇论文；不伪造数据、引文或 DOI。
- 不做 OCR；扫描版 PDF 会明确说明无文字层。
- `humanize` 只诊断模板句与防御性表达，不帮用户隐瞒 AI 生成事实；学术诚信由作者负责。
- 会议分级来自内置简化表，未收录不代表质量低。
