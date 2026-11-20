# 青衿科研 · Qingjin Research

把一句模糊的研究想法，变成论文形状的工作台。

一个 **DeepSeek Harness（DSH）本地插件**：11 个工具 + 右侧栏工作台，管论文骨架、成稿模板、英文句式、术语、段落与译文诊断、PDF 精读、同方向论文检索、投稿格式，以及「去 AI 味」。

- **本地插件**：`private: true`，不走 npm；profile 里是 `link:` 依赖
- **零依赖零构建**：纯 ESM + JSON 数据，安装不触发 build 脚本
- **默认离线**：只有 `qingjin_related` 会联网，`QINGJIN_OFFLINE=1` 可彻底关掉
- **11 个工具 / 13 个面板动作 / 9 份数据文件 / 1 个 skill**

---

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

> 开发时也可以直接在插件页填 `C:\Users\84301\Desktop\书院育人活动\dsh-qingjin`——这是 `link:` 安装，改文件即改插件。

---

## 工具一览（11 个）

| 工具 | 作用 | 典型调用 |
|---|---|---|
| `qingjin_outline` | 章节骨架：目标、时态、篇幅预算、结构动作（IMRaD / CARS / C-C-C）、自查清单 | `kind=research` / `proposal` / 单节 |
| `qingjin_template` | 可填写成稿模板：`md` 或**可编译的 LaTeX**（中文 ctexart / 英文 article） | `kind=paper, format=tex` |
| `qingjin_phrase` | 按「章节 × 写作意图」检索英文句式，附中文用途与误用提醒 | `section=intro, intent=gap` |
| `qingjin_pdf_read` | 读本地 PDF 抽正文，返回页数/字数/截断信息；无文字层的扫描版会明说 | `path=…pdf` |
| `qingjin_related` | **唯一联网**：从一篇论文扩散到同方向论文，标 venue 等级（A/B 档）与开放获取链接 | `query=标题/DOI/关键词` |
| `qingjin_workflow` | 把任务路由到 18 个研究阶段之一，并给出下一步与评审骨架 | `task="选题值不值得做"`、`mode=review` |
| `qingjin_humanize` | 诊断模板句与防御性表达（10 类）+ 必须保留清单 | `text=段落` |
| `qingjin_export` | 多引擎降级链把 `.md` 导成同名 `.pdf`：xelatex → typst → Word → Edge，并写明用了哪个 | `md=…md`、`engine=auto` |
| `qingjin_rules` | 骨架规则 / 中英排版 / 四家会议格式 / SCI 排版 / 写作惯例 | `scope=venue, venue=cvpr` |
| `qingjin_glossary` | 59 条术语的标准译法、其它译法与**常见误译** | `query=proof rate` |
| `qingjin_check` | 段落诊断（篇幅/时态/要素缺失/过强断言）；`section=translation` 转为译文校核 | `section=results, text=…` |

## 右侧栏工作台（13 个动作）

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

- `qingjin_workflow`：18 个研究阶段的分工与路由，`mode=review` 给七维评审 + 14/9/5 节骨架 + 四类发现 + 反证纪律；
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

## 边界与隐私

- **不代写整篇论文**：只给结构、模板、表述选项与诊断，成文由作者完成。
- **不含文献检索平台抓取**：CNKI / 万方 / PubScholar 不做抓取，只走开放 API 与题录导入。
- **扫描版 PDF 不 OCR**：无文字层会直接说明。
- **联网范围**：只有 `qingjin_related` 外发查询词；`QINGJIN_OFFLINE=1` 可完全关闭。
- **PDF 依赖**：导出需要 pandoc + 任一引擎（xelatex / typst / Word / Edge）。引擎按链条自动降级并说明原因；全失败时逐条列出失败信息与安装建议，不会假装成功。

## 版本记录

| 版本 | 内容 |
|---|---|
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
