# 数据资产清单（v0.26.1）

这些 JSON 是插件的护城河——通用 AI 凭记忆给不出这么规整、可检索的结构化数据。适配 WorkBuddy 时**原样复用**，不需要重写。

| 文件 | 内容 | 规模 | 用途 |
|---|---|---|---|
| `glossary.json` | 术语表：en/zh/alt/domain/note | 75 条 | 标准译法 + 「哪里容易译错」提示；用户可在 `user-glossary.json` 追加自定义条目 |
| `phrases.json` | 英文句式：按 section×intent 索引 | 36 条 / 8 章节 / 8 意图 | 按写作意图找可套句式，每条带 caution |
| `translate.json` | 翻译原则、陷阱、范例、跨学科 | 15 术语 / 6 范例类 / 5 领域 | 中英互译辅导，支持 bio/chem/math/physics |
| `sources.json` | 8 篇实测样本清单 | 8 条，2 条有 DOI | 「8 篇顶会实测」的可追溯依据 |
| `venues.json` | 会议分级表 | A 档 36 / B 档 16 / 预印本模式 8 | 投稿参考与会议识别；未收录≠质量低 |
| `rules.json` | 骨架、排版、写作模式、会议规则 | skeleton 3 / venues 5 / sciLayout 3 | 骨架与排版查询 |
| `structure.json` | 论文/申报书结构 | research 7 节 / proposal 7 节 | outline 的结构依据 |
| `style.json` | 去 AI 味规则 | remove 10 / punctuation 3 / keep 5 | humanize 的诊断正则 |
| `templates.json` | 6 套模板 | md 2 / tex 2（zh/en） | template 的填充骨架 |
| `workflows.json` | 18 阶段研究流程 | skills 18 / review 6 | flow 的任务路由依据 |
| `dut.json` | 校内事实与选题种子 | facts 8 / topicSeeds 5 | 原插件的地域绑定数据，通用性弱；WorkBuddy 版保留但不主动推送 |

## 使用建议

- 查术语优先 `lookup scope=glossary query=...`，不要凭记忆翻译；note 字段记录的就是常见误译。
- 找句式用 `lookup scope=phrase section=... intent=...`，比让用户自己想英文表达更可靠。
- `user-glossary.json` 支持用户自定义词条；同名以用户条目为准（v0.22 已实现 Map 去重）。
- `dut.json` 含大连理工校内信息，跨用户复用价值低，除非用户明确问校内事项，不必主动引用。
