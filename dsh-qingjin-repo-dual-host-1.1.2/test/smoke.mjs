import { apply } from '../index.js'
import { existsSync, mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 所有用例必须与「作者机器的路径」无关：临时文件一律写到系统临时目录。
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const work = mkdtempSync(join(tmpdir(), 'qingjin-smoke-'))

const tools = new Map()
let promptSections = 0
apply({
  systemPrompt: { section() { promptSections += 1 } },
  tools: { register(definition) { tools.set(definition.name, definition) } },
})

const fail = (message) => { console.error(`FAIL ${message}`); process.exitCode = 1 }
const ok = (message) => console.log(`ok   ${message}`)
const call = (name, args) => tools.get(name).execute(args)

try {
  if (promptSections !== 1) fail('systemPrompt.section was not called once')
  else ok('system prompt registered')

  if (tools.size !== 11) fail(`expected 11 tools, got ${tools.size}`)
  else ok(`tools registered: ${[...tools.keys()].join(', ')}`)

  for (const [name, tool] of tools) {
    const schema = tool.parameters
    if (schema.type !== 'object' || typeof schema.properties !== 'object') fail(`${name}: parameters is not a JSON Schema object`)
    if (tool.output?.schema?.type !== 'string') fail(`${name}: output schema is not a string`)
    if (typeof tool.description !== 'string' || tool.description.length < 40) fail(`${name}: description too short`)
  }
  ok('parameter + output schemas look like JSON Schema')

  // ---------- flow ----------
  const flow = await call('qingjin_flow', { action: 'start', flow: 'deepread', engineAvailable: true })
  if (!flow.includes('已启动流程')) fail('flow start failed')
  else ok('flow start works')
  const flowId = (flow.match(/流程 (f\w+)/) ?? [])[1]
  if (!flowId) fail('flow id missing')
  const step1 = await call('qingjin_flow', { action: 'advance', flowId, note: '抽正文' })
  if (!step1.includes('下一步')) fail('flow advance failed')
  else ok('flow advance works')
  const flowStatus = await call('qingjin_flow', { action: 'status', flowId })
  if (!flowStatus.includes('进度')) fail('flow status failed')
  else ok('flow status works')
  const badFlow = await call('qingjin_flow', { action: 'start', flow: 'nope' })
  if (!badFlow.includes('未知流程')) fail('unknown flow should be reported')
  else ok('unknown flow is reported')

  // ---------- 回归：P0 三连 ----------
  const sampleText = 'We aim to study a method [1]. However, few studies examine it. We used a framework and achieved 80.6% mAP.'
  const lower = await call('qingjin_check', { section: 'abstract', text: sampleText })
  const upper = await call('qingjin_check', { section: 'ABSTRACT', text: sampleText })
  const body = (report) => report.split('\n').slice(1).join('\n')
  if (body(lower) !== body(upper)) fail('checkSection is case-sensitive again')
  else ok('checkSection case-insensitive')

  const { FLOWS } = await import('../lib/flow.mjs')
  const { TOOL_NAMES } = await import('../index.js')
  const dangling = Object.values(FLOWS).flatMap((f) => f.steps).filter((step) => step.tool && !TOOL_NAMES.includes(step.tool))
  if (dangling.length) fail('dangling tools in FLOWS: ' + dangling.map((s) => s.tool).join(','))
  else ok('all FLOW tool names resolve')

  // 每个 locale 的模式 id 必须唯一（中英各自一份列表）
  const clientSrc = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const zhStart = clientSrc.indexOf('ZH_COPY')
  const enStart = clientSrc.indexOf('EN_COPY')
  const segments = [['zh', zhStart, enStart > zhStart ? enStart : zhStart + 4000], ['en', enStart, clientSrc.length]]
  for (const [name, start, end] of segments) {
    if (start < 0) continue
    const seg = clientSrc.slice(start, end)
    const ids = [...seg.matchAll(/\{\s*id:\s*'([^']+)'\s*,\s*label:/g)].map((m) => m[1])
    if (ids.length && new Set(ids).size !== ids.length) fail('duplicate mode ids in ' + name + ': ' + ids.join(','))
    else ok('client mode ids unique (' + name + ')')
  }

  // ---------- PDF 页码 ----------
  const pdfPathForPage = process.env.QINGJIN_TEST_PDF
  if (pdfPathForPage && existsSync(pdfPathForPage)) {
    const pageOut = await call('qingjin_pdf_read', { path: pdfPathForPage, page: 2 })
    if (pageOut.includes('抽取结果不可信')) ok('page test skipped (extractor untrusted)')
    else if (!pageOut.includes('第 2 页') && !pageOut.includes('没有分页信息')) fail('page=2 did not report page number')
    else ok('qingjin_pdf_read page= works')
  } else {
    ok('page test skipped (set QINGJIN_TEST_PDF)')
  }

  // ---------- find= 页码定位 ----------
  if (process.env.QINGJIN_TEST_PDF && existsSync(process.env.QINGJIN_TEST_PDF)) {
    const found = await call('qingjin_pdf_read', { path: process.env.QINGJIN_TEST_PDF, find: 'mAP' })
    if (found.includes('抽取结果不可信')) ok('find test skipped (extractor untrusted)')
    else if (!/找到 \d+ 处|没有找到|抽取可能失败/.test(found)) fail('find= returned nothing sensible')
    else ok('pdf find= works')
  } else {
    ok('find test skipped (set QINGJIN_TEST_PDF)')
  }

  // ---------- consistency 空行 ----------
  const spacing = await call('qingjin_check', { section: 'translation', text: '本文取得 80.6% mAP。', compare: 'We achieve 80.6% mAP.' })
  if (/\n\n\n## 与对照文本的一致性/.test(spacing)) fail('extra blank line before consistency block')
  else ok('consistency spacing ok')

  // ---------- translate 章节映射 ----------
  const abstractTr = await call('qingjin_translate', { direction: 'zh2en', section: 'abstract', text: '本文提出一种方法，取得 80.6% mAP。' })
  if (abstractTr.includes('未收录章节')) fail('translate section mapping broken')
  else ok('translate section mapping works')

  // ---------- 乱码体检 ----------
  const { garbleRatio } = (await import('../index.js')).__test
  const middleGarbled = 'a'.repeat(500) + ('Ø Ø k[eeeee ìk ').repeat(700) + 'b'.repeat(500)
  if (garbleRatio(middleGarbled) < 0.25) fail('garbleRatio missed garbled middle window')
  else if (garbleRatio('Ø Ø k[eeeee ìk Ø Ø ìk') < 0.25) fail('garbleRatio missed garbled sample')
  else if (garbleRatio('多模态目标重识别在三个基准上验证。') > 0.05) fail('garbleRatio false positive on Chinese')
  else if (garbleRatio('π-noise with α=0.5.') > 0.05) fail('garbleRatio false positive on Greek')
  else ok('garbleRatio detects garbled text only')

  // ---------- venue 缩写 / 翻译清单空行 ----------
  const { tierOf } = (await import('../index.js')).__test
  if (tierOf('CVPR').tier !== 'A') fail('tierOf(CVPR) should be A')
  else if (tierOf('NeurIPS').tier !== 'A') fail('tierOf(NeurIPS) should be A')
  else ok('venue aliases resolve')
  const transOut = await call('qingjin_check', { section: 'translation', text: '本文取得 80.6% mAP。' })
  if (!transOut.includes('\n\n## 回译检查清单')) fail('translation checklist missing blank line')
  else ok('translation checklist spacing ok')

  // ---------- 0.26.1：md2html 保真（表格行内代码 / 对齐冒号 / 软换行） ----------
  const { mdToHtmlDocument } = await import('../lib/md2html.mjs')
  const tableHtml = mdToHtmlDocument('| 命令 | 说明 |\n| --- | ---: |\n| `a|b` | 管道 |\n')
  const tableRows = tableHtml.match(/<tr>[\s\S]*?<\/tr>/g) ?? []
  const dataRow = tableRows[tableRows.length - 1] ?? ''
  if ((dataRow.match(/<t[dh]\b/g) ?? []).length !== 2 || !dataRow.includes('<code>a|b</code>')) {
    fail('md2html split inline-code pipe into extra cells: ' + dataRow)
  } else ok('md2html keeps inline-code pipe inside one cell')
  if (!dataRow.includes('align="right"')) fail('md2html dropped table alignment colon')
  else ok('md2html honors table alignment colon')
  const joinedHtml = mdToHtmlDocument('第一行同一段\n第二行续接\n\n新段落。\n')
  if ((joinedHtml.match(/<p>/g) ?? []).length !== 2 || !joinedHtml.includes('第一行同一段 第二行续接')) {
    fail('md2html did not join soft-wrapped lines into one paragraph')
  } else ok('md2html joins soft-wrapped lines')

  // 短文档提示字符数口径：判定与文案都必须用去空白后的有效长度。
  const pdfReadSrc = readFileSync(new URL('../lib/readpdf.mjs', import.meta.url), 'utf8')
  if (!pdfReadSrc.includes('去空白后 ${effectiveLength}，不足 400')) fail('short-doc hint still uses raw length')
  else ok('short-doc hint uses effective length')

  // ---------- 文档计数一致 ----------
  const readmeSrc = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
  const dataDir = new URL('../data/', import.meta.url)
  const dataNames = [...readdirSync(dataDir)].filter((n) => n.endsWith('.json'))
  const zhSegStart = clientSrc.indexOf('ZH_COPY')
  const enSegStart = clientSrc.indexOf('EN_COPY')
  const zhSeg = clientSrc.slice(zhSegStart, enSegStart > zhSegStart ? enSegStart : undefined)
  const modeIds = [...zhSeg.matchAll(/\{\s*id:\s*'([^']+)'\s*,\s*label:/g)].map((m) => m[1])
  const headerLine = (readmeSrc.match(/\*\*(\d+) 个工具 \/ (\d+) 个面板动作 \/ (\d+) 份数据文件 \/ (\d+) 个 skill\*\*/) ?? [])
  if (headerLine.length) {
    const [, toolsN, actionsN, filesN, skillsN] = headerLine.map(Number)
    if (toolsN !== tools.size) fail('README tool count mismatch: ' + toolsN + ' vs ' + tools.size)
    else if (actionsN !== new Set(modeIds).size) fail('README action count mismatch: ' + actionsN + ' vs ' + new Set(modeIds).size)
    else if (filesN !== dataNames.length) fail('README data-file count mismatch: ' + filesN + ' vs ' + dataNames.length)
    else ok('文档计数一致')
  } else ok('README 未写计数头（跳过）')

  // 面板模式与工具接线：zh-en → translate，debug → debug
  const dbgIdx = clientSrc.indexOf("mode === 'debug'")
  const dbgBlock = dbgIdx >= 0 ? clientSrc.slice(dbgIdx, dbgIdx + 400) : ''
  if (!dbgBlock.includes('qingjin_debug')) fail('debug mode not wired to qingjin_debug')
  else ok('debug mode wired to qingjin_debug')

  // 中英互译按钮必须真的调 qingjin_translate
  const zhEnIdx = clientSrc.indexOf("mode === 'zh-en'")
  const zhEnBlock = zhEnIdx >= 0 ? clientSrc.slice(zhEnIdx, zhEnIdx + 600) : ''
  if (!zhEnBlock.includes('qingjin_translate')) fail('zh-en mode does not call qingjin_translate')
  else ok('zh-en mode wired to qingjin_translate')

  // 术语表数字与 locale 一致
  const glossaryCount = JSON.parse(readFileSync(new URL('../data/glossary.json', import.meta.url), 'utf8')).terms.length
  const zhLocale = readFileSync(new URL('../locale/zh.json', import.meta.url), 'utf8')
  const claimed = Number((zhLocale.match(/(\d+) 条术语/) ?? [])[1] ?? 0)
  if (claimed && claimed !== glossaryCount) fail('locale glossary count ' + claimed + ' != ' + glossaryCount)
  else ok('locale glossary count matches data')

  // ---------- outline ----------
  const research = await call('qingjin_outline', { kind: 'research', topic: '焊缝缺陷检测', words: 5000 })
  if (!research.includes('引言') || !research.includes('CARS')) fail('research outline missing sections')
  else ok('research outline works')

  // P0-1 回归：省略 words 不能出现 NaN，且必须带篇幅预算
  const noWords = await call('qingjin_outline', { kind: 'research', topic: '回归' })
  if (noWords.includes('NaN')) fail('outline without words produced NaN')
  else ok('outline without words has no NaN')
  if (!noWords.includes('篇幅约')) fail('outline without words lost the word budget')
  else ok('outline without words keeps the word budget')

  for (const bad of [0, '', 'abc']) {
    const out = await call('qingjin_outline', { kind: 'research', words: bad })
    if (!out.includes('约 5000 词')) fail(`outline words=${JSON.stringify(bad)} did not fall back to default`)
  }
  ok('outline words fallback covers 0 / "" / "abc"')

  // ---------- template ----------
  const tex = await call('qingjin_template', { kind: 'paper', format: 'tex', lang: 'zh', title: '测试 & 标题_1', author: '张三' })
  if (!tex.includes('ctexart') || tex.includes('@@')) fail('tex template incomplete or placeholder left')
  else ok('tex template has ctexart and no placeholders')
  if (!tex.includes('测试 \\& 标题\\_1')) fail('tex escaping broken')
  else ok('tex escapes LaTeX specials')
  const badKind = await call('qingjin_template', { kind: 'nope' })
  if (!badKind.includes('未知 kind')) fail('unknown template kind should be reported')
  else ok('unknown template kind is reported')

  // ---------- phrase / glossary ----------
  const gap = await call('qingjin_lookup', { scope: 'phrase', section: 'intro', intent: 'gap' })
  if (!gap.includes('However')) fail('phrase lookup failed')
  else ok('phrase lookup works')
  const term = await call('qingjin_lookup', { scope: 'glossary', query: 'proof rate' })
  if (!term.includes('证明成功率')) fail('glossary lookup failed')
  else ok('glossary lookup works')

  // ---------- check：英文 + 中文 ----------
  const intro = 'Detecting weld defects matters for ship safety [1]. However, few studies have examined thin-plate welds, and it remains unclear whether existing models generalize. In this study, we test a lightweight detector.'
  const introReport = await call('qingjin_check', { section: 'introduction', text: intro })
  if (introReport.includes('建议重写')) fail('english intro scored too low')
  else ok('english introduction check works')

  const zhIntro = '目前多模态目标重识别仍然面临模态冲突问题。然而，现有方法往往直接融合特征，忽略了局部判别信息，且在高噪声场景下仍存在明显不足。本文提出一种反向文本引导框架，通过语义约束缓解冲突，并在三个基准上验证有效性。'
  const zhReport = await call('qingjin_check', { section: 'Introduction', text: zhIntro })
  if (zhReport.includes('未知章节')) fail('section should be case-insensitive')
  else ok('section is case-insensitive')
  if (zhReport.includes('篇幅：1 词')) fail('chinese text still counted as 1 word')
  else ok('chinese paragraph is measured in characters')
  if (zhReport.includes('没有识别出「空白」')) fail('chinese gap signal not recognized')
  else ok('chinese gap signal recognized')
  if (zhReport.includes('没有出现「本文做了什么」')) fail('chinese "we" signal not recognized')
  else ok('chinese "we" signal recognized')

  // ---------- translate ----------
  const zh2en = await call('qingjin_translate', { section: 'abstract', text: '本文提出一种多模态目标重识别框架，在三个基准上取得 80.6% mAP。' })
  if (!zh2en.includes('中→英')) fail('translate did not detect zh2en')
  else ok('translate detects zh2en')
  if (!zh2en.includes('multi-modal object re-identification')) fail('translate missed glossary term')
  else ok('translate maps terms')
  if (!zh2en.includes('可套用的句式')) fail('translate missing templates')
  else ok('translate returns templates')
  const en2zh = await call('qingjin_translate', { text: 'However, existing methods overlook the inherent noise of text descriptions.' })
  if (!en2zh.includes('英→中')) fail('translate did not detect en2zh')
  else ok('translate detects en2zh')
  const noText = await call('qingjin_translate', { section: 'results' })
  if (!noText.includes('可套用的句式')) fail('translate without text failed')
  else ok('translate works without text')

  // ---------- debug ----------
  const dbg = await call('qingjin_debug', { issue: '训练出现 NaN', metric: 'mAP', scope: '学习率' })
  if (!dbg.includes('排查顺序') || !dbg.includes('实验矩阵')) fail('debug report incomplete')
  else ok('debug report works')

  // ---------- humanize 封顶 ----------
  const aiText = await call('qingjin_humanize', { text: '为了严谨起见，值得注意的是，本文仅为初步探索，在一定程度上可以说效果显著。我们相信这将为后续研究提供新思路。' })
  if (!aiText.includes('防御性铺垫') && !aiText.includes('自我降格')) fail('humanize missed template phrases')
  else ok('humanize catches template phrases')
  const score = Number((aiText.match(/(\d+)\/100/) ?? [])[1])
  if (!(score <= 84)) fail(`humanize score ${score} should be capped at 84 when hits exist`)
  else ok(`humanize caps score at 84 (got ${score})`)

  // ---------- workflow / rules ----------
  const route = await call('qingjin_flow', { action: 'route', task: '这个选题值不值得做' })
  if (!route.includes('ccf-idea-reviewer')) fail('workflow routing failed')
  else ok('workflow routing works')
  const rules = await call('qingjin_lookup', { scope: 'rules', mode: 'venue', venue: 'cvpr' })
  if (!rules.includes('CVPR')) fail('venue rules failed')
  else ok('venue rules work')

  // ---------- 术语表实现契约（源码级，防再次漏包） ----------
  const indexSrc = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
  if (!/function ALL_TERMS\(\)/.test(indexSrc) || !indexSrc.includes('new Map()')) fail('ALL_TERMS dedupe missing')
  else if (!indexSrc.includes('userGlossaryPath')) fail('user glossary path helper missing')
  else ok('ALL_TERMS dedupe + homedir present')
  if (!/status \/ route/.test(indexSrc)) fail('flow action error message misses route')
  else ok('flow action hint mentions route')
  const src = JSON.parse(readFileSync(new URL('../data/sources.json', import.meta.url), 'utf8'))
  const idea = src.items.find((x) => x.short === 'IDEA')
  if (!idea || !idea.title.startsWith('IDEA:')) fail('sources.json IDEA title lost prefix')
  else ok('sources.json IDEA title ok')

  // ---------- 跨段一致性 ----------
  const enAbstract = 'We achieve 80.6% mAP and 83.9% Rank-1 on RGBNT201. However, text noise remains.'
  const zhDraft = '本文在 RGBNT201 上取得 80.6% mAP。'
  const cons = await call('qingjin_check', { section: 'translation', text: zhDraft, compare: enAbstract })
  if (!cons.includes('与对照文本的一致性')) fail('consistency block missing')
  else if (!cons.includes('83.9')) fail('consistency did not flag the missing number')
  else ok('cross-text consistency detects missing numbers')

  // ---------- 高权重功能回归 ----------
  const overview = await call('qingjin_lookup', { scope: 'glossary' })
  if (!overview.includes('按领域精选')) fail('glossary overview missing')
  else ok('glossary overview works')

  // ---------- export ----------
  const nonMd = join(work, 'x.txt')
  writeFileSync(nonMd, 'x', 'utf8')
  const reject = await call('qingjin_export', { md: nonMd })
  if (!reject.includes('只支持')) fail('export should reject non-md input')
  else ok('export rejects non-md input')

  const missing = await call('qingjin_export', { md: join(work, 'nope.md') })
  if (!missing.includes('找不到文件')) fail('export should report missing md')
  else ok('export reports missing md')

  const sampleMd = join(work, 'sample.md')
  writeFileSync(sampleMd, '# 标题\n\n正文。\n', 'utf8')
  const forced = await call('qingjin_export', { md: sampleMd, engine: 'xelatex', outDir: join(work, 'out') })
  if (!forced.startsWith('已导出') && !forced.includes('不可用') && !forced.includes('所有 PDF 引擎都失败了')
    && !forced.includes('需要 pandoc')) {
    fail(`forced engine returned an unexpected message: ${forced.slice(0, 60)}`)
  } else ok('export runs or reports unavailability cleanly')

  const badEngine = await call('qingjin_export', { md: sampleMd, engine: 'zzz' })
  if (!badEngine.includes('未知引擎')) fail('unknown engine should be reported')
  else ok('unknown engine is reported')

  // 0.26.1：空 / 纯空白 Markdown 必须提前拒绝，不能产出一张「成功」的空白 PDF。
  for (const [label, content] of [['empty', ''], ['blank', ' \n\t \n']]) {
    const blankMd = join(work, `${label}.md`)
    writeFileSync(blankMd, content, 'utf8')
    const out = await call('qingjin_export', { md: blankMd })
    if (!out.includes('文档为空')) fail(`export should reject ${label} md, got: ${out.slice(0, 60)}`)
  }
  ok('export rejects empty / whitespace-only Markdown')

  // ---------- 离线开关 ----------
  process.env.QINGJIN_OFFLINE = '1'
  const offline = await call('qingjin_related', { query: 'anything' })
  delete process.env.QINGJIN_OFFLINE
  if (!offline.includes('离线模式')) fail('offline switch did not take effect')
  else ok('QINGJIN_OFFLINE=1 disables network')

  // ---------- 可选：真实 PDF ----------
  const pdfPath = process.env.QINGJIN_TEST_PDF
  if (pdfPath && existsSync(pdfPath)) {
    const out = await call('qingjin_pdf_read', { path: pdfPath, maxChars: 3000 })
    if (out.includes('抽取结果不可信')) ok('pdf read skipped (extractor untrusted)')
    else if (!out.includes('正文开始')) fail('pdf read returned no text')
    else ok('pdf read works on QINGJIN_TEST_PDF')
  } else {
    ok('pdf read skipped (set QINGJIN_TEST_PDF to a local pdf to cover it)')
  }

  // 自检：插件根目录清单可读
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  if (!pkg.dsh?.bundle?.patch) fail('package.json lost dsh.bundle.patch')
  else ok(`package manifest ok (v${pkg.version})`)
  const preSrc = readFileSync(new URL('../docs/PREREQUISITES.md', import.meta.url), 'utf8')
  if (!preSrc.includes('面板里有 15 个动作')) fail('PREREQUISITES action count stale')
  else ok('PREREQUISITES action count is 15')
  const uploadSrc = readFileSync(new URL('../GITHUB-UPLOAD.md', import.meta.url), 'utf8')
  if (!uploadSrc.includes(pkg.version)) fail('GITHUB-UPLOAD version does not match package.json')
  else ok('GITHUB-UPLOAD version matches package.json')
  const readmeHistory = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
  if (!readmeHistory.includes(`| ${pkg.version} |`)) fail('README version history misses current version')
  else ok('README version history includes current version')
} finally {
  rmSync(work, { recursive: true, force: true })
}

if (process.exitCode) console.error('\nSMOKE TEST FAILED')
else console.log('\nSMOKE TEST PASSED')
