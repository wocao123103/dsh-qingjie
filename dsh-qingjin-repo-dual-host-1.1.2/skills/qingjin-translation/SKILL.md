---
name: qingjin-translation
description: 中英学术互译（zh2en / en2zh）的可执行流程：先定信息单位与主语，再选句式，最后逐项校核；用于把中文初稿改写成可发表英文，或把英文论文译成不「翻译腔」的中文。配合 qingjin_translate 与 qingjin_check(section=translation)。
---

# 中英学术互译 · Qingjin Translation

适用：中文稿 → 英文（投稿/大创/毕业论文英文摘要），或英文论文 → 中文（精读、组会、文献综述）。

不适用：文学翻译、口语化文案、需要母语润色级改写的整篇论文（那要人来做）。

## 一、方向判定（30 秒）

- 文本里汉字占比 > 25% → **zh2en**；否则 **en2zh**。
- 一段里中英混杂（如中文夹术语）→ 仍按 zh2en，但术语先查 `qingjin_lookup(scope=glossary)`。
- 不确定时直接问用户，不要猜。

## 二、zh2en 四步

1. **切命题**：中文一句常含 2–3 个命题。先在草稿里用 `/` 切开，一句英文只放一个主命题。
2. **补主语**：每句补 `we / this paper / the method`。没有主语 = 不知道谁做的。
3. **选句式**：按章节调用 `qingjin_translate(direction=zh2en, section=...)`，从返回的模板里挑一条，再替换 `{X}`。
4. **压虚词**：删「具有较好的」「在一定程度上」「进行了」；换成动词 + 数字。

自查（必须全过）：
- [ ] 没有 `With the development of`、`In this paper, we mainly study`
- [ ] 没有 `has a good performance`（必须给指标）
- [ ] 时态：本文工作现在时；实验与结果过去时
- [ ] 数字全部保留，单位不译（mAP / Rank-1 / GFLOPs）
- [ ] 同一术语全文一个译名

## 三、en2zh 四步

1. **拆长句**：按「背景—动作—结果」切；保留 `However / Therefore / Specifically` 的中文对等词（然而/因此/具体来说）。
2. **术语先定**：查 `qingjin_lookup(scope=glossary)`；首次出现给英文原词，如「混合执行（concolic execution）」。
3. **被动转主动**：`is utilized` → 「我们采用」；避免「被使用」「被应用」。
4. **去翻译腔**：删「值得注意的是」「综上所述，我们可以得出结论」这类直译句。

自查：
- [ ] 没有连续三个「的」的定语长链
- [ ] 数字、mAP、Rank-1 原样
- [ ] 术语首次出现带英文
- [ ] 每段首句是结论，不是铺垫

## 四、双向一致性（终稿必做）

- 数字：原文每个数字在译文里都能找到，且含义未变（+8.3% mAP 不是 +8.3 分）。
- 缩写：首次出现给全称（ReID = re-identification）。
- 术语：中英各只用一个对应（不要 alignment / 对齐 / 校准 混用）。
- 逻辑词：however 对应「然而」，不能译成「此外」。

## 五、工具入口

| 场景 | 调用 |
|---|---|
| 要句式与判据 | `qingjin_translate(direction, section, text)` |
| 查术语标准译法 | `qingjin_lookup(scope=glossary, query=…)` |
| 查某节英文句式 | `qingjin_lookup(scope=phrase, section=intro, intent=gap)` |
| 校核中文译文 | `qingjin_check(section=translation, text=…)` |
| 整篇流程 | `qingjin_flow(action=start, flow=write-section)` |

## 六、边界

- 本 skill 给结构、句式、判据，**不产出整篇译文**；成文由作者完成。
- 句式模板的结构取自 8 篇 CVPR/ECCV/AAAI/ICML 论文，标注了出处类型，不代表逐字复制。
- 术语表覆盖 75 条；未收录的术语会提示补 `data/glossary.json`，不要自己发明译名。
