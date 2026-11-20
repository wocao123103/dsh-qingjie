import { apply } from '../index.js'

const tools = new Map()
let promptSections = 0
const ctx = {
  systemPrompt: { section() { promptSections += 1 } },
  tools: { register(definition) { tools.set(definition.name, definition) } },
}

apply(ctx)

const fail = (message) => {
  console.error(`FAIL ${message}`)
  process.exitCode = 1
}
const ok = (message) => console.log(`ok   ${message}`)

if (promptSections !== 1) fail('systemPrompt.section was not called once')
else ok('system prompt registered')

if (tools.size !== 11) fail(`expected 6 tools, got ${tools.size}`)
else ok(`tools registered: ${[...tools.keys()].join(', ')}`)

for (const [name, tool] of tools) {
  const schema = tool.parameters
  if (schema.type !== 'object' || typeof schema.properties !== 'object') fail(`${name}: parameters is not a JSON Schema object`)
  if (!Array.isArray(schema.required) && schema.required !== undefined) fail(`${name}: required must be an array`)
  if (typeof tool.description !== 'string' || tool.description.length < 40) fail(`${name}: description too short`)
  if (typeof tool.output?.render !== 'function') fail(`${name}: output.render missing`)
  if (tool.output?.schema?.type !== 'string') fail(`${name}: output schema is not a string`)
}
ok('parameter schemas look like JSON Schema')

const preamble = tools.get('qingjin_outline')
const research = await preamble.execute({ kind: 'research', topic: '基于视觉的船舶焊缝缺陷检测', words: 5000 })
if (!research.includes('引言') || !research.includes('CARS') || !research.includes('讨论')) fail('research outline missing sections')
else ok(`research outline: ${research.split('\n').length} lines`)

const proposal = await preamble.execute({ kind: 'proposal', topic: '海洋工程方向' })
if (!proposal.includes('立项背景') || !proposal.includes('技术路线')) fail('proposal outline missing parts')
else ok(`proposal outline: ${proposal.split('\n').length} lines`)

const seeds = await preamble.execute({ kind: 'proposal', topic: '海洋工程', cluster: '信息科学' })
if (!seeds.includes('全国重点实验室')) fail('cluster seed missing lab facts')
else ok('cluster seeding works')

const single = await preamble.execute({ kind: 'abstract' })
if (!single.includes('Background')) fail('single-section outline missing abstract moves')
else ok('single-section outline works')

const phrases = tools.get('qingjin_phrase')
const gap = await phrases.execute({ section: 'intro', intent: 'gap' })
if (!gap.includes('However') || !gap.includes('空白')) fail('gap phrase lookup failed')
else ok(`phrase lookup: ${gap.split('\n').length} lines`)

const fuzzy = await phrases.execute({ query: '局限' })
if (!fuzzy.includes('局限')) fail('free-text phrase lookup failed')
else ok('free-text phrase lookup works')

const empty = await phrases.execute({ section: 'intro', intent: 'nonexistent' })
if (!empty.includes('没有匹配')) fail('empty phrase result should explain itself')
else ok('empty phrase result explains itself')

const check = tools.get('qingjin_check')
const weakResults = await check.execute({
  section: 'results',
  text: 'We tested the model. It worked quite well. The results show that our method is better and better because the network is deeper. This proves that our design is clearly superior.',
})
if (!weakResults.includes('数字') || !weakResults.includes('/100')) fail('results check missed its diagnostics')
else ok(`results check scored: ${weakResults.split('\n')[0]}`)

const goodIntro = await check.execute({
  section: 'introduction',
  text: 'Detecting weld defects matters for ship safety [1]. Prior work has approached the problem in two ways: ultrasonic testing and vision-based inspection [2,3]. However, few studies have examined thin-plate welds under low illumination, and it remains unclear whether existing models generalize to this setting. In this study, we test whether a lightweight detector can reach comparable accuracy under such conditions.',
})
if (!goodIntro.includes('结构稳定') && !goodIntro.includes('需要一轮修改')) fail('intro check did not reach a verdict')
else ok(`intro check scored: ${goodIntro.split('\n')[0]}`)

const badSection = await check.execute({ section: 'nope', text: 'x' })
if (!badSection.includes('未知章节')) fail('unknown section should be reported')
else ok('unknown section reported')

const template = tools.get('qingjin_template')
const texOut = await template.execute({ kind: 'paper', format: 'tex', lang: 'zh', title: '测试 & 标题_1', author: '张三', keywords: '甲；乙' })
if (!texOut.includes('\\documentclass') || !texOut.includes('ctexart')) fail('tex template missing preamble')
else ok('tex template has ctexart preamble')
if (texOut.includes('@@')) fail('tex template kept an unfilled @@ placeholder')
else ok('tex template has no unfilled placeholders')
if (!texOut.includes('测试 \\& 标题\\_1')) fail('tex template did not escape LaTeX specials')
else ok('tex template escapes LaTeX specials')
if (!/\\author\{张三\\\\ \\small 大连理工大学\}/.test(texOut)) fail('tex author/affiliation braces are wrong')
else ok('tex author braces are correct')

const texCode = (out) => (out.match(/```latex\n([\s\S]*?)\n```/) ?? [, ''])[1]

const enTex = await template.execute({ kind: 'paper', format: 'tex', lang: 'en', title: 'Weld detection' })
const enBody = texCode(enTex)
if (!enBody.includes('\\documentclass') || enBody.includes('ctexart') || !enBody.includes('\\begin{document}')) fail('english tex template wrong class')
else ok('english tex uses article class')

const proposalMd = await template.execute({ kind: 'proposal', format: 'md', lang: 'zh', title: '设备共享助手' })
for (const needed of ['立项背景与意义', '研究方案', '进度安排', '经费预算', '设备共享助手']) {
  if (!proposalMd.includes(needed)) fail(`proposal template missing: ${needed}`)
}
ok('proposal markdown template has all parts')

const paperMd = await template.execute({ kind: 'paper', format: 'md', lang: 'zh', title: 'X' })
if (paperMd.includes('投稿前自查') === false || !paperMd.includes('摘要')) fail('paper markdown template incomplete')
else ok('paper markdown template has checklist')

const glossary = tools.get('qingjin_glossary')
const term = await glossary.execute({ query: 'proof rate' })
if (!term.includes('证明成功率')) fail('glossary lookup by English failed')
else ok('glossary lookup by English works')

const termZh = await glossary.execute({ query: '混合执行' })
if (!termZh.includes('concolic execution') || !termZh.includes('不要译成')) fail('glossary lookup by Chinese or note missing')
else ok('glossary lookup by Chinese works, note included')

const termMiss = await glossary.execute({ query: 'zzzz-not-a-term' })
if (!termMiss.includes('没有收录')) fail('glossary miss should explain itself')
else ok('glossary miss explains itself')

const translation = await check.execute({
  section: 'translation',
  text: '该方法在三倍的样本上取得更好结果，However the model still fails on unseen data and the authors do not report confidence intervals in the paper at all. 作者认为效果明显，但没有给出置信区间, 也没有给出 p 值。',
})
if (!translation.includes('中文数字')) fail('translation check missed Chinese numeral')
else ok('translation check catches Chinese numerals')
if (!translation.includes('英文')) fail('translation check missed untranslated English run')
else ok('translation check catches untranslated English')
if (!translation.includes('p 值（p-value）')) fail('translation check did not surface terminology note')
else ok('translation check surfaces terminology')

const cleanTranslation = await check.execute({
  section: 'translation',
  text: '灰盒模糊测试（greybox fuzzing）是检测软件漏洞最常用的方法之一。本文提出的 HyllFuzz 相比 CoFuzz、Intriguer 与 QSYM，分别多覆盖 31.43%、44.56% 与 59.48% 的代码分支，且耗时快 3–19 倍。',
})
if (cleanTranslation.includes('建议重译')) fail('clean translation scored too low')
else ok(`clean translation scored: ${cleanTranslation.split('\n')[0]}`)

const rules = tools.get('qingjin_rules')
const allRules = await rules.execute({ scope: 'all', lang: 'zh' })
for (const needed of ['骨架生成规则', '中文论文排版', 'LaTeX', '黑体三号', 'GB/T 7714']) {
  if (!allRules.includes(needed)) fail(`rules missing: ${needed}`)
}
ok('rules cover skeleton, typography and LaTeX defaults')

const skeletonOnly = await rules.execute({ scope: 'skeleton' })
if (skeletonOnly.includes('宋体') || !skeletonOnly.includes('CARS')) fail('scope=skeleton is not filtered correctly')
else ok('rules scope filtering works')

const enTypo = await rules.execute({ scope: 'typography', lang: 'en' })
if (!enTypo.includes('Times New Roman') || enTypo.includes('宋体')) fail('english typography set wrong')
else ok('english typography set works')

const fsMod = await import('node:fs')
const pdfPath = 'C:/Users/84301/Desktop/书院育人活动/qingjin-pdf-test/hyllfuzz.pdf'
if (fsMod.existsSync(pdfPath)) {
  const pdf = tools.get('qingjin_pdf_read')
  const pdfOut = await pdf.execute({ path: pdfPath, maxChars: 3000 })
  if (!/fuzzing/i.test(pdfOut) || !pdfOut.includes('正文开始')) fail('pdf read returned no paper text')
  else ok('pdf read extracted text from a real arXiv PDF')
  const missing = await pdf.execute({ path: 'C:/nope/missing.pdf' })
  if (!missing.includes('找不到文件')) fail('pdf read should report a missing file')
  else ok('pdf read reports missing files')
} else {
  ok('pdf read skipped (no test PDF present)')
}

const cvpr = await rules.execute({ scope: 'venue', venue: 'cvpr' })
if (!cvpr.includes('CVPR / ICCV') || !cvpr.includes('编号制')) fail('venue rules for cvpr missing')
else ok('venue rules for cvpr work')

const allVenues = await rules.execute({ scope: 'venue' })
for (const needed of ['ECCV', 'AAAI', 'ICML']) { if (!allVenues.includes(needed)) fail('venue rules missing ' + needed) }
ok('venue rules cover all four templates')

const patterns = await rules.execute({ scope: 'patterns' })
if (!patterns.includes('方法名缩写') || !patterns.includes('Limitations')) fail('writing patterns missing')
else ok('writing patterns present')

const sci = await rules.execute({ scope: 'sci' })
if (!sci.includes('300 dpi') || !sci.includes('色觉')) fail('sci layout rules missing')
else ok('sci layout rules present')

const exporter = tools.get('qingjin_export')
const missingMd = await exporter.execute({ md: 'C:/nope/missing.md' })
if (!missingMd.includes('找不到文件')) fail('export should report a missing md')
else ok('export reports missing md')

const notMd = await exporter.execute({ md: 'C:/Users/84301/Desktop/书院育人活动/dsh-qingjin/package.json' })
if (!notMd.includes('只支持')) fail('export should reject non-md input')
else ok('export rejects non-md input')

process.env.QINGJIN_OFFLINE = '1'
const relatedTool = tools.get('qingjin_related')
const offline = await relatedTool.execute({ query: 'anything' })
delete process.env.QINGJIN_OFFLINE
if (!offline.includes('离线模式')) fail('offline switch did not take effect')
else ok('QINGJIN_OFFLINE=1 disables network access')

const workflow = tools.get('qingjin_workflow')
const route = await workflow.execute({ task: '这个选题值不值得做，顺便设计消融实验' })
if (!route.includes('ccf-idea-reviewer') || !route.includes('ccf-experiment-designer')) fail('workflow routing missed a stage')
else ok('workflow routing works')

const reviewB = await workflow.execute({ mode: 'review' })
if (!reviewB.includes('七个维度') || !reviewB.includes('14 节')) fail('review rubric missing')
else ok('review rubric present')

const venueB = await workflow.execute({ mode: 'venues' })
if (!venueB.includes('CVPR') || !venueB.includes('LLM Usage Statement')) fail('venue notes missing')
else ok('venue notes present')

const skillList = await workflow.execute({})
if (!skillList.includes('ccf-common') || !skillList.includes('18 个技能')) fail('skill list missing')
else ok('skill list present')

const humanizer = tools.get('qingjin_humanize')
const aiText = await humanizer.execute({ text: '为了严谨起见，本文仅为初步探索。首先，我们提出了模块；其次，我们做了实验。我们相信这将为后续研究提供新思路——这是重要的——显著优于基线。' })
if (!aiText.includes('防御性铺垫') || !aiText.includes('空承诺')) fail('humanize missed defensive or promise patterns')
else ok('humanize catches defensive framing and empty promises')
if (!aiText.includes('必须保留')) fail('humanize did not list what to keep')
else ok('humanize lists what must be kept')

const cleanText = await humanizer.execute({ text: '我们在三个数据集上测量了该模块的贡献。去掉它之后 mAP 从 80.2 降到 77.2，说明局部聚合是主要增益来源。' })
if (!cleanText.includes('读起来自然') && !cleanText.includes('有模板味')) fail('humanize scoring failed on clean text')
else ok('humanize scores clean text')

const reviewModes = await workflow.execute({ mode: 'review' })
if (!reviewModes.includes('发现分类') || !reviewModes.includes('反证纪律')) fail('review block missing distilled discipline')
else ok('review block carries the distilled review discipline')

const badEngine = await exporter.execute({ md: 'C:/nope/x.md', engine: 'zzz' })
if (!badEngine.includes('找不到文件') && !badEngine.includes('未知引擎')) fail('bad engine not reported')
else ok('export validates engine argument')

const realMd = 'C:/Users/84301/Desktop/书院育人活动/qingjin-pdf-test/math-nolatex/math.md'
if (fsMod.existsSync(realMd)) {
  const forced = await exporter.execute({ md: realMd, engine: 'xelatex', outDir: 'C:/Users/84301/Desktop/书院育人活动/qingjin-pdf-test/smoke' })
  if (!forced.startsWith('已导出') && !forced.includes('不可用')) fail('forced engine export failed unexpectedly')
  else ok('forced engine path works or reports unavailability')
}

if (process.exitCode) console.error('\nSMOKE TEST FAILED')
else console.log('\nSMOKE TEST PASSED')

