# 青衿科研 · Qingjin Research

把一句模糊的研究想法，变成论文形状的工作台。

一个 **DeepSeek Harness（DSH）本地插件**：11 个工具 + 右侧栏工作台，管论文骨架、成稿模板、英文句式、术语、段落与译文诊断、PDF 精读、同方向论文检索、投稿格式，以及「去 AI 味」。

- **本地插件**：`private: true`，不走 npm；profile 里是 `link:` 依赖
- **零依赖零构建**：纯 ESM + JSON 数据，安装不触发 build 脚本
- **默认离线**：只有 `qingjin_related` 会联网，`QINGJIN_OFFLINE=1` 可彻底关掉
- **11 个工具 / 15 个面板动作 / 12 份数据文件 / 2 个 skill**

---

> **双宿主合体包**：`dist/dsh-qingjin-dual-host-1.1.2.tgz` = DSH 插件 0.26.1 + WorkBuddy Skill 1.1.2，两个宿主共享同一套核心逻辑。

## 安装

**A. 下载后再装（推荐，不需要 git）**

1. GitHub 仓库页 → **Code → Download ZIP** → 解压到任意目录；
2. DSH → **插件页 → 添加插件** → 输入解压后目录的**绝对路径**；
3. 重启 DSH（client 部分刷新页面即可）。

**B. 直接给仓库地址**（需要本机有 git 且能访问 github.com）

```
# 内容已扁平化到仓库根时
github:wocao123103/dsh-qingjie

# 若内容还在仓库的 dsh-qingjin/ 子目录里（当前状态）
github:wocao123103/dsh-qingjie#path:/dsh-qingjin
```

完整上传与自检清单见 [GITHUB-UPLOAD.md](GITHUB-UPLOAD.md)；平台/工具链前置条件见 [docs/PREREQUISITES.md](docs/PREREQUISITES.md)。

> 开发时也可以在插件页填你自己的解压目录绝对路径——这是 `link:` 安装，改文件即改插件。

---

## 工具一览（11 个）

| 工具 | 作用 | 典型调用 |
|---|---|---|
| `qingjin_outline` | 章节骨架：目标、时态、篇幅预算、结构动作（IMRaD / CARS / C-C-C）、自查清单 | `kind=research` / `proposal` / 单节 |
| `qingjin_template` | 可填写成稿模板：`md` 或**可编译的 LaTeX**（中文 ctexart / 英文 article） | `kind=paper, format=tex` |
| `qingjin_lookup` | 统一查询入口：`scope=phrase` 英文句式 / `scope=glossary` 术语与误译 / `scope=rules` 骨架·排版·会议格式 | `scope=glossary, query=proof rate` |
| `qingjin_pdf_read` | 读本地 PDF 抽正文，返回页数/字数/截断信息；无文字层的扫描版会明说 | `path=…pdf` |
| `qingjin_related` | **唯一联网**：从一篇论文扩散到同方向论文，标 venue 等级（A/B 档）与开放获取链接 | `query=标题/DOI/关键词` |
| `qingjin_flow` | 多步任务状态机 + 任务路由：`start/advance/status` 推进流程，`route` 把任务分到 18 个研究阶段 | `action=route, task=…` |
| `qingjin_debug` | 调试清单 + 实验矩阵模板（OOM / NaN / 复现） | `issue=NaN, metric=mAP` |
| `qingjin_humanize` | 诊断模板句与防御性表达（10 类）+ 必须保留清单 | `text=段落` |
| `qingjin_export` | 多引擎降级链把 `.md` 导成同名 `.pdf`：xelatex → typst → Word → WPS → Edge；没有 pandoc 时先用内置 Markdown→LaTeX + xelatex 直连，只有浏览器时用内置 Markdown→HTML + Edge 打印（公式降级为源码），并写明用了哪个 | `md=…md`、`engine=auto` |
| `qingjin_translate` | **中英互译教练**：zh2en / en2zh，给句式（取自 8 篇顶会论文）、术语、中式英语误例与检查清单 | `direction=zh2en, section=abstract, text=…` |
| `qingjin_check` | 段落诊断（篇幅/时态/要素缺失/过强断言）；`section=translation` 转为译文校核 | `section=results, text=…` |

## 右侧栏工作台（15 个动作）

输入框右侧「论文」按钮打开；面板顶部是大肥鱼吉祥物，蓝色主题，吸顶头部。

```
论文骨架 · 大创申报书 · 论文模板 · LaTeX 模板 · 英文句式 · 术语对照
段落自检 · 译文校核 · 骨架与排版 · 任务分工 · 去 AI 味 · 同方向顶刊 · PDF 精读
```

用法：选动作 → 填内容 → 复制提示词 → 粘到输入框发送。

## 精读：md + pdf

精读一篇论文后自动产出两个文件，**放在原文所在目录**：

```
原文/
├─ XXX.pdf              ← 你导入的原文
├─ 精读-XXX.md          ← 精读文章（1500–3000 字，十节结构）
└─ 精读-XXX.pdf         ← 同一份内容的 PDF（ctexart，A4，2.2 cm）
```

十节结构：一句话结论 / 研究问题与动机 / 方法拆解（每条配原文英文短引+中译）/ 实验与数据 / 主要结果（表格）/ 贡献 / 局限 / 与同方向工作的位置 / 可复用写作句式 / 术语表。

数字与引句只从抽取文本里来，推断标「推测」；原文没有 Limitations 章节时如实说明，不代写。

## 检索与格式

- **同方向顶刊**：`qingjin_related` 走 OpenAlex，候选来自 `related_works` + 双向引用 + 主题高引；**预印本单独分组打 ⚠**，不冒充顶会。免 key 有共享额度，设 `OPENALEX_API_KEY` 可提高。
- **四家会议格式**：CVPR/ICCV（题注句点、编号 [1]）、ECCV（Fig. 1: 冒号）、AAAI（作者-年份）、ICML（PMLR 作者-年份）——从 8 篇真实论文实测。
- **平台可接入性**（2026-11 实测）：OpenAlex / Crossref / CORE / DOAJ / PubMed / arXiv / dblp 可直接接；Semantic Scholar 需 key；Europe PMC 本机超时；Google Scholar 无 API 且抓取违反 ToS；CNKI / 万方 / PubScholar 无公开 API，只做「题录导入」配合开放 API 补全。
- **Elicit**：有 REST v2（Bearer，需 Pro）与官方 MCP `https://elicit.com/api/mcp`——在 DSH 里把它加进 MCP 设置最省事，不必写插件。

## 蒸馏：任务路由 / 去 AI 味 / 评审纪律

从 [CCFA-Skills](https://github.com/mikubaka88/CCFA-Skills)（MIT，© Chaoyue Li）蒸馏，文字改写、非原文复制：

- `qingjin_flow` 的 `route` 动作：18 个研究阶段的分工与路由，`mode=review` 给七维评审 + 14/9/5 节骨架 + 四类发现 + 反证纪律；
- `qingjin_humanize`：10 类模板句与 3 种标点指纹，每条给「为什么 + 怎么改」，并固定列「必须保留」；
- **附带一份真正的 skill**：[skills/ccfa-research/SKILL.md](skills/ccfa-research/SKILL.md)（165 行），复制到 `~/.dsh/skills/` 或项目 `.dsh/skills/` 即可被 DSH 识别。

**没有搬进来的**：18 个 SKILL.md 原文、43 种图法的 Python 绘图库、日月配置台、官方 LaTeX 模板（依赖 Python/Matplotlib，且需跟官方年份升级）。

## 设计依据

- **C-C-C 与十条法则**：Mensh & Kording (2017), *Ten simple rules for structuring papers*, PLOS Comput Biol — https://doi.org/10.1371/journal.pcbi.1005619
- **IMRaD 分节目的与时态、CARS 三步、结构化摘要、讨论子节**：https://imrad.se/
- **大创申报书结构**：教育部《国家级大学生创新创业训练计划管理办法》(2019) 与高校公开模板
- **校内选题锚点**：大连理工大学《学校简介》与网络与信息化中心公开信息
- **会议格式**：8 篇真实论文（CVPR / ECCV / AAAI / ICML）的实测版面
- **英文句式**：自建模板集合；Manchester Academic Phrasebank 抓取不到正文且涉及版权，未复制

## 实测样本（可追溯）

8 篇样本的标题/会议/DOI 见 `data/sources.json`；其中 IDEA（CVPR 2025，10.1109/cvpr52734.2025.02765）与 INSPI（LNCS 版 10.1007/978-3-032-36984-0_31）已核对，其余标注“DOI 未核对”，不做猜测。

## 自定义术语表

同目录 `data/user-glossary.json`（或 `$DSH_HOME/qingjin/user-glossary.json`）可追加自己的术语，字段与 `glossary.json` 一致；同名（英文相同）以用户条目为准。改完重启 DSH 生效。

## 核心价值：让你学会写，而不是替你写

插件刻意不产出整篇成稿：它给骨架、句式、判据与诊断，成文由作者完成。这不是能力限制，而是设计目标——套模板能交一次作业，理解结构才能写下一篇。

## 边界与隐私

- **不代写整篇论文**（核心价值，不是免责）：给结构、模板、表述选项与诊断，成文由作者完成。
- **不含文献检索平台抓取**：CNKI / 万方 / PubScholar 不做抓取，只走开放 API 与题录导入。
- **扫描版 PDF 不 OCR**：无文字层会直接说明。
- **状态文件**：`qingjin_flow` 会把流程进度写到 `$DSH_HOME/qingjin/flows.json`（Windows 默认在 DSH 数据目录下）；设 `QINGJIN_FLOW_STATE=off` 关闭落盘，或设成某个路径改位置。
- **OPENALEX_API_KEY 说明**：OpenAlex 只接受查询串里的 `api_key`，所以 key 会出现在请求 URL 中；共享日志环境请勿设置，或改用独立 key。
- **联网范围**：只有 `qingjin_related` 外发查询词；`QINGJIN_OFFLINE=1` 可完全关闭。
- **PDF 依赖**：优先 pandoc + 任一引擎（xelatex / typst / Word / WPS / Edge）；没有 pandoc 时用内置 md→LaTeX + xelatex，只有浏览器时用内置 md→HTML + Edge 打印（公式降级为源码）。引擎按链条自动降级并说明原因；全失败时逐条列出失败信息与安装建议，不会假装成功。

## 版本记录

| 版本 | 内容 |
|---|---|
| 1.1.2 | **最终版**：双宿主合体发布（DSH 插件 + WorkBuddy Skill 共用 1.1.2）；含 PDF 三档可信度、Edge 直连导出、跨学科互译 |
| 0.26.1 | 收口 0.26 五项 P3：md2html 表格与段落、空文档拒绝、文档口径、短文本字符数 |
| 0.26.0 | 收口 0.25 P3：翻译清单空行、短文本参数提示、短文本结构信号、venue 缩写、只有浏览器时的 Edge 直连导出 |
| 0.25.0 | PDF 可信度分级（结构信号 + 多窗口 + 三档返回）；translate 章节映射；统一路径与 UA |
| 0.24.0 | 按 0.23.0 汇总修复：smoke 白名单、export 文件校验、PDF 乱码体检、EN Debug 文案、P3 长尾 |
| 0.23.0 | 按问题汇总修 P0 崩溃（translate 方向、flow id 撞车）与 P1（export 校验顺序、重复一致性块、BOM、PDF 误诊、大小写） |
| 0.22.0 | 补上四版未进包的用户术语表去重（homedir + new Map）；flow 错误提示补 route；sources.json 标题修正 |
| 0.21.0 | `check` 新增 `compare`：跨段核对数字、术语、篇幅比（ReID 摘要实测能抓到漏掉的 83.9） |
| 0.20.0 | 按权重优化高价值功能：`pdf_read` 支持 `find=` 按词定位并给页码；术语表无 query 时按领域浏览 |
| 0.19.1 | `qingjin_workflow` 并入 `qingjin_flow(action=route)`；描述与参数精简，固定开销 5,025→4,437 |
| 0.19.0 | 引文页码定位（page=N + 页码提示）；新增 data/sources.json；面板加「调试排查」入口 |
| 0.18.2 | 修复中英互译按钮接错工具、用户术语表未生效、pdftotext 丢页码；文档计数与术语数对齐 |
| 0.18.1 | 价值修正：模板定位为脚手架、不代写正向表述、flow 状态可关闭、related 提示配额 |
| 0.18.0 | 按补丁报告修复 P0（大小写、悬空工具名、UI id 冲突）+ pdftotext 抽取链 + 路径可移植 + `qingjin_debug` |
| 0.17.1 | 新增教材领域（textbook）：从 4 本英文教材提取定义/推导/近似/习题句式，术语表扩到 75 条 |
| 0.17.0 | 中英互译支持跨学科（bio/chem/math/physics），语料来自 4 篇 GitHub 论文；新增跨学科语法学习笔记 |
| 0.16.0 | 新增中英互译方向（`qingjin_translate` + skill）；合并三个查询工具为 `qingjin_lookup`；精简描述，固定开销 5,348→4,657 |
| 0.15.0 | 新增 `qingjin_flow`：把多步任务固定成 5 步状态机，按需只调当前步的工具 |
| 0.14.0 | 补 WPS 引擎（Kwps COM）、无 pandoc 兜底（内置 md→LaTeX）、arXiv 标预印本、LNCS 说明 |
| 0.13.1 | 全功能过一遍（INSPI/ECCV）：补 ECCV 等级、LNCS 标注、A/B 无结果自动放宽、路由补精读、摘要 propose 识别、PDF 时 π 等希腊字母丢失 |
| 0.13.0 | 按第三方检测报告修复：outline NaN、中文分词、arXiv 种子、降级提示、humanize 封顶、smoke 可移植 |
| 0.12.1 | 仓库地址对齐为 dsh-qingjie，安装命令补 #path: 变通写法 |
| 0.12.0 | 导出支持四引擎降级链（xelatex / typst / Word / Edge），逐个实测 |
| 0.11.4 | 新增前置条件清单（平台/工具链/验证步骤） |
| 0.11.3 | 自检修正：过期版本号与工具计数、未知模板格式提示 |
| 0.11.2 | skill 升到 v2：加实验矩阵、rebuttal 批次、反模式清单 |
| 0.11.1 | 附带 `ccfa-research` skill |
| 0.11.0 | 蒸馏出 `qingjin_humanize` 与评审纪律 |
| 0.10.0 | `qingjin_workflow` 任务路由（18 阶段） |
| 0.9.x | 精读产出 md+pdf；右侧栏蓝色大肥鱼主题 |
| 0.8.x | 四家会议格式、SCI 排版要点 |
| 0.7.x | `qingjin_related` 联网检索 |
| 0.6.x | 零依赖 PDF 抽取 |
| 0.5.x | 规则查询 |
| 0.4.x | 术语表与译文校核 |
| 0.3.x | LaTeX 模板 |
| 0.1–0.2 | 骨架、句式、段落自检、右侧栏工作台 |

## 许可

MIT。CCFA-Skills 相关内容遵循其 MIT 许可并保留署名。
