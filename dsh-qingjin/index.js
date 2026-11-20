/**
 * 青衿科研 · Qingjin Research
 *
 * A dependency-free DSH bundle that helps undergraduates (especially first-years
 * at DLUT's Lingshui main campus) turn a vague idea into a paper-shaped plan:
 * section skeletons grounded in IMRaD / CARS / C-C-C, an English phrase library
 * indexed by section and intent, and a deterministic paragraph self-check.
 *
 * No network, no model calls, no writes: every tool reads bundled data and
 * returns text the student can act on.
 */

import { readFileSync, statSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { isAbsolute, resolve, dirname, basename, join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { extractPdfText } from './lib/pdf.mjs'

const data = (name) => JSON.parse(readFileSync(new URL(`./data/${name}`, import.meta.url), 'utf8'))

const STRUCTURE = data('structure.json')
const PHRASES = data('phrases.json')
const DUT = data('dut.json')
const TEMPLATES = data('templates.json')
const GLOSSARY = data('glossary.json')
const RULES = data('rules.json')
const VENUES = data('venues.json')
const WORKFLOWS = data('workflows.json')
const STYLE = data('style.json')

function toJsonSchema(parameters) {
  const properties = {}
  const required = []
  for (const [key, spec] of Object.entries(parameters ?? {})) {
    const { required: isRequired, ...rest } = spec
    properties[key] = { ...rest }
    if (isRequired) required.push(key)
  }
  const schema = { type: 'object', properties, additionalProperties: false }
  if (required.length > 0) schema.required = required
  return schema
}

function makeTool(definition) {
  return {
    name: definition.name,
    description: definition.description,
    parameters: toJsonSchema(definition.parameters),
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: String(value) }],
    },
    execute: definition.execute,
  }
}

// ---------------------------------------------------------------- outline

function formatSection(section, totalWords) {
  const lines = []
  const budget = section.budgetPct > 0 && totalWords > 0
    ? `｜篇幅约 ${Math.round((totalWords * section.budgetPct) / 100)} 词（占 ${section.budgetPct}%）`
    : ''
  const words = section.words ? `（${section.words[0]}–${section.words[1]} 词）` : ''
  lines.push(`### ${section.zh} ${section.en ? `· ${section.en}` : ''}${budget}${words}`)
  if (section.goal) lines.push(`目标：${section.goal}`)
  if (section.tense && section.tense !== 'n/a') lines.push(`时态：${section.tense}`)
  if (section.moves?.length) {
    lines.push('结构：')
    for (const move of section.moves) lines.push(`- ${move.zh}${move.detail ? `：${move.detail}` : ''}`)
  }
  if (section.checks?.length) {
    lines.push('写完自查：')
    for (const check of section.checks) lines.push(`- [ ] ${check}`)
  }
  return lines.join('\n')
}

function startersFor(sectionId) {
  const wanted = PHRASES.entries.filter((entry) => entry.section === sectionId).slice(0, 2)
  if (wanted.length === 0) return []
  const out = ['起手句（可直接改写）：']
  for (const entry of wanted) {
    out.push(`- ${entry.zh}：${entry.en[0]}`)
  }
  return out
}

function outlineResearch(topic, words) {
  const kind = STRUCTURE.kinds.research
  const total = words ?? Math.round((kind.totalWords[0] + kind.totalWords[1]) / 2)
  const parts = []
  parts.push(`# 研究论文骨架${topic ? `：${topic}` : ''}`)
  parts.push('')
  parts.push(`> ${kind.oneLine}`)
  parts.push(`> 全文目标字数：约 ${total} 词。先定骨架再写字——标题、摘要、图、大纲最值得花时间。`)
  parts.push('')
  for (const section of kind.sections) {
    parts.push(formatSection(section, total))
    const starters = startersFor(section.id)
    if (starters.length > 0) parts.push(starters.join('\n'))
    parts.push('')
  }
  parts.push('## 三个最容易失分的地方')
  parts.push('1. 标题没有单一主张 → 读者复述不出来，评审也抓不住贡献。')
  parts.push('2. 段落最后一句不是结论 → 论证链条断裂，读者要自己拼。')
  parts.push('3. 结果段落里塞解释 → 解释属于讨论，混写会让评审质疑严谨性。')
  return parts.join('\n')
}

function outlineProposal(topic) {
  const kind = STRUCTURE.kinds.proposal
  const parts = []
  parts.push(`# 大创申报书骨架${topic ? `：${topic}` : ''}`)
  parts.push('')
  parts.push(`> ${kind.oneLine}`)
  parts.push('')
  for (const section of kind.sections) {
    parts.push(`### ${section.zh}`)
    if (section.goal) parts.push(`目标：${section.goal}`)
    if (section.moves?.length) {
      parts.push('写什么：')
      for (const move of section.moves) parts.push(`- ${move.zh}${move.detail ? `：${move.detail}` : ''}`)
    }
    if (section.checks?.length) {
      parts.push('自查：')
      for (const check of section.checks) parts.push(`- [ ] ${check}`)
    }
    parts.push('')
  }
  parts.push('## 校内资源锚点（凌水主校区）')
  parts.push(`- 双一流学科：${DUT.facts.doubleFirstClass.join('、')}`)
  parts.push(`- 全国重点实验室：${DUT.facts.labs.join('、')}`)
  parts.push(`- ${DUT.advice}`)
  return parts.join('\n')
}

function outlineSingle(sectionId, topic) {
  const section = STRUCTURE.kinds.research.sections.find((item) => item.id === sectionId)
  if (!section) return `未知章节：${sectionId}。可选：${STRUCTURE.kinds.research.sections.map((s) => s.id).join(', ')}`
  const parts = [`# ${section.zh} 的写法${topic ? `：${topic}` : ''}`]
  parts.push(formatSection(section, 5000))
  const starters = startersFor(sectionId)
  if (starters.length > 0) parts.push(starters.join('\n'))
  return parts.join('\n')
}

// ---------------------------------------------------------------- templates

const LATEX_ESCAPES = {
  '\\': '\\textbackslash{}', '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#',
  '_': '\\_', '{': '\\{', '}': '\\}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}',
}

function escapeLatex(value) {
  return String(value).replace(/[\\&%$#_{}~^]/g, (character) => LATEX_ESCAPES[character])
}

/**
 * Fill a stored template. Placeholders are `@@key@@`, so LaTeX's own braces and
 * any `{...}` reference sentence pass through untouched.
 */
function fillTemplate(raw, variables, latex) {
  let out = raw
  for (const [key, value] of Object.entries(variables)) {
    if (value === undefined || value === null || value === '') continue
    out = out.split(`@@${key}@@`).join(latex ? escapeLatex(value) : String(value))
  }
  return out
}

function templateFor(kind, format, lang) {
  const group = TEMPLATES[format]?.[kind]
  if (!group) return undefined
  return group[lang] ?? group.zh ?? group.en
}

function buildTemplate(args) {
  const kind = ['paper', 'proposal'].includes(args.kind) ? args.kind : 'paper'
  const format = args.format === 'tex' ? 'tex' : 'md'
  const formatNote = args.format && !['tex', 'md'].includes(String(args.format)) ? `（未知格式 ${args.format}，已按 md 输出）\n` : ''
  const lang = args.lang === 'en' ? 'en' : 'zh'
  const raw = templateFor(kind, format, lang)
  if (!raw) return `没有 ${kind} 的 ${format} 模板。`

  const today = new Date().toISOString().slice(0, 10)
  const body = fillTemplate(raw, {
    title: args.title || (kind === 'paper' ? '（填入你的论文标题）' : '（填入项目名称）'),
    author: args.author || '（作者）',
    affiliation: args.affiliation || '大连理工大学',
    advisor: args.advisor || '（指导教师）',
    keywords: args.keywords || (lang === 'en' ? 'keyword one; keyword two' : '关键词一；关键词二；关键词三'),
    date: args.date || today,
    Author: '（作者）', Title: '（文献标题）', Journal: '（期刊）', Year: '（年份）',
  }, format === 'tex')

  const header = format === 'tex'
    ? (lang === 'zh'
      ? [
        '# LaTeX 模板已生成',
        '',
        '保存为 `main.tex` 后用 xelatex 编译（中文模板基于 ctexart，需要 ctex 宏包）：',
        '',
        '```powershell',
        'xelatex main.tex',
        '```',
        '',
        '编译后用 `latex_look` 工具看实际版面，再逐节填内容。',
        '',
        '```latex',
        body,
        '```',
      ].join('\n')
      : [
        '# LaTeX template generated',
        '',
        'Save as `main.tex` and compile with pdflatex (or xelatex):',
        '',
        '```powershell',
        'pdflatex main.tex',
        '```',
        '',
        'Check the real layout with the `latex_look` tool before filling in the sections.',
        '',
        '```latex',
        body,
        '```',
      ].join('\n'))
    : [
      `> ${kind === 'paper' ? '论文' : '大创申报书'}模板（${lang === 'en' ? 'English' : '中文'}）· 已生成`,
      '> 把下面内容保存成 `.md` 文件，按【写】标记逐节替换；引用块里的参考句式可以直接改写成你的内容。',
      '',
      body,
    ].join('\n')

  return formatNote + header
}


// ---------------------------------------------------------------- pdf

const PDF_MAX_BYTES = 40 * 1024 * 1024

function readPdf(args) {
  const rawPath = String(args.path ?? '').trim()
  if (!rawPath) return '请给出 PDF 的路径（绝对路径，或相对于当前工作目录的路径）。'
  const path = isAbsolute(rawPath) ? rawPath : resolve(rawPath)
  if (!existsSync(path)) return `找不到文件：${path}`
  const stat = statSync(path)
  if (!stat.isFile()) return `不是文件：${path}`
  if (stat.size > PDF_MAX_BYTES) return `文件过大（${(stat.size / 1024 / 1024).toFixed(1)} MB），上限 40 MB。`
  if (!/\.pdf$/i.test(path)) return `不是 .pdf 文件：${path}（本工具只读 PDF）`

  let result
  try {
    result = extractPdfText(path, { maxChars: 400000 })
  } catch (error) {
    return `解析 PDF 失败：${error instanceof Error ? error.message : String(error)}`
  }
  const text = result.text
  if (text.replace(/\s/g, '').length < 400) {
    return [
      `已读取 ${path}，但只抽出 ${text.length} 个字符——多半是扫描版（图片型）PDF，没有文字层。`,
      '这种情况下本工具帮不上：请改用可复制文本的版本（如 arXiv 的 HTML/ar5iv 页面），或先用 OCR 工具转成文本。',
    ].join('\n')
  }

  const offset = Number.isFinite(args.offset) ? Math.max(0, Math.trunc(args.offset)) : 0
  const maxChars = Number.isFinite(args.maxChars) ? Math.max(2000, Math.min(120000, Math.trunc(args.maxChars))) : 60000
  const slice = text.slice(offset, offset + maxChars)
  const more = offset + maxChars < text.length

  const header = [
    `PDF：${path}`,
    `页数约 ${result.pages}，解码 ${result.streams} 个内容流，共抽取 ${text.length} 字符；本次给出第 ${offset}–${offset + slice.length} 字符。`,
    more ? `后面还有内容，需要时再调用一次并传 offset=${offset + maxChars}。` : '已到全文末尾。',
    '抽取器不解码字体编码，个别连字（fi/fl）可能丢失或错位；引用原文前请核对 PDF。',
    '',
    '--- 正文开始 ---',
  ].join('\n')

  return `${header}\n${slice}`
}

// ---------------------------------------------------------------- related works

const OPENALEX = 'https://api.openalex.org/works'
const WORK_SELECT = 'id,doi,title,publication_year,cited_by_count,primary_location,open_access,best_oa_location,topics'

function normalizeVenue(text) {
  return String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Tier A / B / preprint / none for one venue display name. */
function tierOf(venueName) {
  const venue = normalizeVenue(venueName)
  if (venue === '') return { tier: 'none', label: '未标venue' }
  for (const pattern of VENUES.preprintPatterns) {
    if (venue.includes(pattern)) return { tier: 'preprint', label: '预印本/索引库' }
  }
  for (const level of ['A', 'B']) {
    for (const entry of VENUES.tiers[level]) {
      if (entry.match.some((needle) => venue.includes(needle))) {
        return { tier: level, label: entry.name }
      }
    }
  }
  return { tier: 'none', label: venueName }
}

function venueOf(work) {
  return work.primary_location?.source?.display_name ?? ''
}

function linksOf(work) {
  const links = []
  const pdf = work.best_oa_location?.pdf_url
  const oa = work.open_access?.oa_url ?? work.best_oa_location?.landing_page_url
  if (pdf && !pdf.includes('doi.org')) links.push(`[PDF](${pdf})`)
  else if (oa && !oa.includes('doi.org')) links.push(`[开放获取](${oa})`)
  if (work.doi) links.push(`[DOI](${work.doi})`)
  else if (work.id) links.push(`[OpenAlex](${work.id})`)
  return links.join(' · ')
}

async function openalex(path) {
  const key = process.env.OPENALEX_API_KEY
  const url = `${OPENALEX}${path}${path.includes('?') ? '&' : '?'}mailto=qingjin@dlut.edu.cn${key ? `&api_key=${encodeURIComponent(key)}` : ''}`
  const response = await fetch(url, { headers: { 'User-Agent': 'dsh-qingjin/0.7 (mailto:qingjin@dlut.edu.cn)' } })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`OpenAlex ${response.status}：${body.slice(0, 160)}`)
  }
  return response.json()
}

async function findSeed(query) {
  const value = query.trim()
  const doi = value.match(/10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/)
  if (doi) {
    const found = await openalex(`?filter=doi:${encodeURIComponent(doi[0])}&select=${WORK_SELECT}&per-page=1`)
    if (found.results?.length) return found.results[0]
  }
  const byTitle = await openalex(`?filter=title.search:${encodeURIComponent(value)}&select=${WORK_SELECT}&per-page=5&sort=relevance_score:desc`)
  const hit = (byTitle.results ?? []).find((work) => work.title)
  return hit ?? null
}

async function worksByIds(ids) {
  if (ids.length === 0) return []
  const compact = ids.map((id) => String(id).split('/').pop()).filter(Boolean).slice(0, 50).join('|')
  const page = await openalex(`?filter=openalex_id:${compact}&select=${WORK_SELECT}&per-page=50`)
  return page.results ?? []
}

function rankWorks(works) {
  const tierRank = { A: 0, B: 1, none: 2, preprint: 3 }
  return works
    .map((work) => ({ work, tier: tierOf(venueOf(work)) }))
    .sort((a, b) => {
      const byTier = tierRank[a.tier.tier] - tierRank[b.tier.tier]
      if (byTier !== 0) return byTier
      const byCited = (b.work.cited_by_count ?? 0) - (a.work.cited_by_count ?? 0)
      if (byCited !== 0) return byCited
      return (b.work.publication_year ?? 0) - (a.work.publication_year ?? 0)
    })
}

function rowOf({ work, tier }) {
  const venue = venueOf(work) || '（无 venue 记录）'
  const year = work.publication_year ?? '—'
  const cited = work.cited_by_count ?? 0
  const direction = work.topics?.[0]?.display_name ?? ''
  const tierTag = tier.tier === 'A' || tier.tier === 'B' ? ` · ${tier.tier} 档` : ''
  return `- **${work.title ?? '(无标题)'}**\n  ${tier.tier === 'preprint' ? '⚠ ' : ''}${venue} · ${year} · 引用 ${cited}${tierTag}${direction ? ` · ${direction}` : ''}\n  ${linksOf(work)}`
}

async function relatedReport(args) {
  const query = String(args.query ?? '').trim()
  if (!query) return '请给出种子：论文标题、DOI、arXiv 号，或一段方向关键词。'
  if (process.env.QINGJIN_OFFLINE === '1') {
    return '当前是本地离线模式（QINGJIN_OFFLINE=1），`qingjin_related` 不会联网。\n去掉这个环境变量、或设为 0，即可恢复联网检索。'
  }
  const limit = Number.isFinite(args.limit) ? Math.max(3, Math.min(20, Math.trunc(args.limit))) : 8
  const tierFilter = ['A', 'AB', 'all'].includes(args.tier) ? args.tier : 'AB'
  const oaOnly = args.oaOnly === true

  let seed = null
  let seedError = ''
  try {
    seed = await findSeed(query)
  } catch (error) {
    seedError = error instanceof Error ? error.message : String(error)
  }
  if (seedError) return `联网查询失败（可能是网络或配额问题）：${seedError}\n\n若没有 OpenAlex key，每天共享额度很小；设置环境变量 OPENALEX_API_KEY 后重试。`

  if (!seed) {
    // No paper matched: treat the query as a direction and list representative work.
    try {
      const page = await openalex(`?filter=fulltext.search:${encodeURIComponent(query)}&select=${WORK_SELECT}&per-page=25&sort=cited_by_count:desc`)
      const works = (page.results ?? []).filter((work) => work.title)
      return [
        `没有匹配到具体论文，按方向「${query}」给出高引用代表工作：`,
        '',
        ...rankWorks(works).slice(0, limit).map(rowOf),
        '',
        '> 想更准，请给标题或 DOI。',
      ].join('\n')
    } catch (error) {
      return `联网查询失败：${error instanceof Error ? error.message : String(error)}`
    }
  }

  const seedTier = tierOf(venueOf(seed))
  const parts = []
  parts.push(`## 种子`)
  parts.push(`**${seed.title}**`)
  parts.push(`${venueOf(seed) || '（无 venue）'} · ${seed.publication_year ?? '—'} · 引用 ${seed.cited_by_count ?? 0} · ${seedTier.tier === 'A' || seedTier.tier === 'B' ? `${seedTier.tier} 档` : '未收录等级'}`)
  if (seed.doi) parts.push(`DOI：${seed.doi}`)
  parts.push('')

  // Graph candidates: similar + citing + referenced.
  const graphIds = [
    ...(seed.related_works ?? []).slice(0, 15),
    ...(seed.referenced_works ?? []).slice(0, 25),
  ]
  let graph = []
  try { graph = await worksByIds(graphIds) } catch { /* keep going */ }
  try {
    const citing = await openalex(`?filter=cites:${String(seed.id).split('/').pop()}&select=${WORK_SELECT}&per-page=20&sort=cited_by_count:desc`)
    graph.push(...(citing.results ?? []))
  } catch { /* keep going */ }

  const seen = new Set([seed.id])
  const unique = []
  for (const work of graph) {
    if (!work?.id || seen.has(work.id)) continue
    seen.add(work.id)
    if (oaOnly && !work.open_access?.is_oa) continue
    unique.push(work)
  }

  let ranked = rankWorks(unique)
  if (tierFilter === 'A') ranked = ranked.filter((item) => item.tier.tier === 'A')
  else if (tierFilter === 'AB') ranked = ranked.filter((item) => item.tier.tier === 'A' || item.tier.tier === 'B')

  const top = ranked.slice(0, limit)
  const preprints = rankWorks(unique).filter((item) => item.tier.tier === 'preprint').slice(0, 3)

  parts.push(`## 同方向高质量论文（${tierFilter === 'all' ? '全部等级' : tierFilter === 'A' ? '仅 A 档' : 'A + B 档'}，按等级与引用排序）`)
  if (top.length === 0) parts.push('- 没有符合条件的结果；把 tier 改成 `all` 再试。')
  else parts.push(...top.map(rowOf))
  parts.push('')

  // Sub-directions: high-cited work inside each of the seed's own topics.
  const topics = (seed.topics ?? []).slice(0, 3)
  if (topics.length > 0) {
    parts.push('## 细分方向代表论文（按本文的主题标签取高引工作）')
    for (const topic of topics) {
      try {
        const page = await openalex(`?filter=primary_topic.id:${String(topic.id).split('/').pop()},cited_by_count:>15&select=${WORK_SELECT}&per-page=4&sort=cited_by_count:desc`)
        const works = (page.results ?? []).filter((work) => work.id !== seed.id && work.title)
        if (works.length === 0) continue
        parts.push(`\n**${topic.display_name}**`)
        for (const work of works.slice(0, 2)) parts.push(rowOf({ work, tier: tierOf(venueOf(work)) }))
      } catch { /* skip a topic that fails */ }
    }
    parts.push('')
  }

  if (preprints.length > 0 && tierFilter !== 'all') {
    parts.push('## 补充：预印本（同等相关，但未确定发表等级）')
    parts.push(...preprints.map(rowOf))
    parts.push('')
  }

  parts.push('> 注：等级来自插件内置的 CCF 简化对照表，未收录的 venue 标为「未收录」；下载链接仅指向开放获取版本，付费期刊需通过学校图书馆访问。')
  return parts.join('\n')
}

// ---------------------------------------------------------------- export

const PANDOC_CANDIDATES = [
  'pandoc',
  'C:/Program Files/Pandoc/pandoc.exe',
  'C:/Program Files (x86)/Pandoc/pandoc.exe',
  'D:/texlive/2026/bin/windows/pandoc.exe',
]

const XELATEX_CANDIDATES = [
  'xelatex',
  'D:/texlive/2026/bin/windows/xelatex.exe',
  'C:/texlive/2026/bin/windows/xelatex.exe',
  'C:/Program Files/MiKTeX/miktex/bin/x64/xelatex.exe',
]

const TYPST_CANDIDATES = [
  'typst',
  'C:/ProgramData/chocolatey/bin/typst.exe',
  'C:/Users/Public/typst/typst.exe',
]

const WINWORD_CANDIDATES = [
  'C:/Program Files/Microsoft Office/root/Office16/WINWORD.EXE',
  'C:/Program Files (x86)/Microsoft Office/root/Office16/WINWORD.EXE',
]

const BROWSER_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
]

const ENGINE_LABELS = {
  xelatex: 'LaTeX（xelatex + ctexart）',
  typst: 'Typst（--pdf-engine=typst）',
  word: 'Word（docx 原生公式 → Word 导出）',
  edge: '浏览器（HTML + MathJax → Edge/Chrome 打印）',
}

const ENGINE_NOTES = {
  xelatex: '数学排版最稳，align 对齐、编号、交叉引用都正常。',
  typst: '数学接近 LaTeX；中文需 CJK 字体，个别符号支持弱于 LaTeX。',
  word: '公式为 Word 原生 OMML，分式/求和/矩阵观感接近 LaTeX；align 对齐点可能偏移，编号与 \\ref 弱。',
  edge: 'MathJax 渲染，行内行间都不错；分页依赖 CSS，离线时公式可能退化为源码。',
}

function firstWorking(candidates, args) {
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, args, { encoding: 'utf8', timeout: 20000 })
    if (!probe.error && probe.status === 0) return candidate
  }
  return null
}

function findPandoc() {
  return firstWorking(PANDOC_CANDIDATES, ['--version'])
}

function detectEngines() {
  const found = {}
  if (process.platform === 'win32' || process.platform === 'linux' || process.platform === 'darwin') {
    const xelatex = firstWorking(XELATEX_CANDIDATES, ['--version'])
    if (xelatex) found.xelatex = xelatex
    const typst = firstWorking(TYPST_CANDIDATES, ['--version'])
    if (typst) found.typst = typst
  }
  if (process.platform === 'win32') {
    const word = WINWORD_CANDIDATES.find((candidate) => existsSync(candidate))
    if (word) found.word = word
    const browser = BROWSER_CANDIDATES.find((candidate) => existsSync(candidate))
    if (browser) found.edge = browser
  }
  return found
}

function pandocError(result) {
  const detail = (result.stderr ?? '').split('\n').filter(Boolean).slice(-4).join(' / ')
  return detail || result.error?.message || `exit ${result.status}`
}

function runXelatex(pandoc, mdPath, pdfPath) {
  const result = spawnSync(pandoc, [
    mdPath, '-o', pdfPath,
    '--pdf-engine=xelatex',
    '-V', 'documentclass=ctexart',
    '-V', 'geometry:margin=2.2cm',
    '-V', 'fontsize=11pt',
  ], { encoding: 'utf8', timeout: 240000 })
  if (result.error) return { ok: false, why: result.error.message }
  if (result.status !== 0) return { ok: false, why: pandocError(result) }
  return existsSync(pdfPath) ? { ok: true } : { ok: false, why: '未生成 PDF' }
}

function runTypst(pandoc, mdPath, pdfPath) {
  const result = spawnSync(pandoc, [
    mdPath, '-o', pdfPath,
    '--pdf-engine=typst',
    '-V', 'fontsize=11pt',
  ], { encoding: 'utf8', timeout: 240000 })
  if (result.error) return { ok: false, why: result.error.message }
  if (result.status !== 0) return { ok: false, why: pandocError(result) }
  return existsSync(pdfPath) ? { ok: true } : { ok: false, why: '未生成 PDF' }
}

function runWord(pandoc, mdPath, pdfPath, workDir) {
  const docxPath = join(workDir, 'export.docx')
  const built = spawnSync(pandoc, [mdPath, '-o', docxPath], { encoding: 'utf8', timeout: 180000 })
  if (built.error) return { ok: false, why: built.error.message }
  if (built.status !== 0) return { ok: false, why: pandocError(built) }
  const scriptPath = join(workDir, 'word-export.ps1')
  writeFileSync(scriptPath, [
    'param([string]$docx,[string]$pdf)',
    "$ErrorActionPreference = 'Stop'",
    '$w = New-Object -ComObject Word.Application',
    '$w.Visible = $false',
    '$w.DisplayAlerts = 0',
    'try {',
    '  $d = $w.Documents.Open($docx, $false, $true)',
    '  $d.ExportAsFixedFormat($pdf, 17)',
    '  $d.Close($false)',
    '} finally {',
    '  try { $w.Quit() } catch {}',
    '}',
  ].join('\n'), 'utf8')
  const result = spawnSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, docxPath, pdfPath,
  ], { encoding: 'utf8', timeout: 240000 })
  if (result.error) return { ok: false, why: result.error.message }
  if (result.status !== 0) return { ok: false, why: (result.stderr ?? '').split('\n').filter(Boolean).slice(-3).join(' / ') || `exit ${result.status}` }
  return existsSync(pdfPath) ? { ok: true } : { ok: false, why: 'Word 未生成 PDF' }
}

function runEdge(pandoc, mdPath, pdfPath, workDir) {
  const htmlPath = join(workDir, 'export.html')
  const cssPath = join(workDir, 'print.css')
  writeFileSync(cssPath, [
    '@page { size: A4; margin: 2.2cm; }',
    'body { font-family: "Microsoft YaHei","SimSun",serif; font-size: 11pt; line-height: 1.7; color: #111; }',
    'h1 { font-size: 1.55em; margin: 0 0 .6em; }',
    'h2 { font-size: 1.22em; margin: 1.1em 0 .4em; }',
    'h3 { font-size: 1.06em; margin: .9em 0 .3em; }',
    'h1,h2,h3 { font-family: "Microsoft YaHei","SimHei",sans-serif; line-height: 1.4; }',
    'p { margin: .5em 0; }',
    'table { border-collapse: collapse; width: 100%; font-size: 10pt; margin: .6em 0; }',
    'th,td { border: 1px solid #999; padding: 4px 6px; vertical-align: top; }',
    'blockquote { margin: 8px 0; padding-left: 10px; border-left: 3px solid #bbb; color: #333; }',
    'pre,code { font-family: Consolas,"Courier New",monospace; font-size: 9.5pt; }',
    'img { max-width: 100%; }',
  ].join('\n'), 'utf8')
  const built = spawnSync(pandoc, [
    mdPath, '-o', htmlPath,
    '--standalone', '--embed-resources', '--mathjax',
    `--css=${cssPath}`,
    '--metadata', `pagetitle=${basename(mdPath).replace(/\.md$/i, '')}`,
    '--metadata', 'lang=zh-CN',
  ], { encoding: 'utf8', timeout: 180000 })
  if (built.error) return { ok: false, why: built.error.message }
  if (built.status !== 0) return { ok: false, why: pandocError(built) }
  const profile = join(workDir, 'browser-profile')
  const result = spawnSync(BROWSER_CANDIDATES.find((candidate) => existsSync(candidate)) ?? 'msedge', [
    '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
    `--user-data-dir=${profile}`,
    '--virtual-time-budget=12000',
    `--print-to-pdf=${pdfPath}`,
    `file:///${htmlPath.replace(/\\/g, '/')}`,
  ], { encoding: 'utf8', timeout: 180000 })
  if (result.error) return { ok: false, why: result.error.message }
  if (!existsSync(pdfPath)) {
    return { ok: false, why: (result.stderr ?? '').split('\n').filter(Boolean).slice(-3).join(' / ') || `exit ${result.status}` }
  }
  return { ok: true }
}

function exportPdf(args) {
  const rawPath = String(args.md ?? '').trim()
  if (!rawPath) return '请给出要导出的 Markdown 文件路径。'
  const mdPath = isAbsolute(rawPath) ? rawPath : resolve(rawPath)
  if (!existsSync(mdPath)) return `找不到文件：${mdPath}`
  if (!/\.md$/i.test(mdPath)) return `只支持 .md 文件：${mdPath}`

  const pandoc = findPandoc()
  if (!pandoc) {
    return [
      '没有找到 pandoc，无法直接导出 PDF。三种办法：',
      '1) 安装 pandoc（https://pandoc.org/installing.html）后重试；',
      '2) 用 LaTeX 编辑器打开同名 .tex 后编译；',
      '3) 仅交付 Markdown，并在交付说明里写明 PDF 未生成的原因。',
    ].join('\n')
  }

  const dir = args.outDir ? (isAbsolute(String(args.outDir)) ? String(args.outDir) : resolve(String(args.outDir))) : dirname(mdPath)
  const base = basename(mdPath).replace(/\.md$/i, '')
  const pdfPath = join(dir, `${base}.pdf`)

  const requested = String(args.engine ?? 'auto')
  const available = detectEngines()
  const order = ['xelatex', 'typst', 'word', 'edge']
  const usable = order.filter((id) => available[id])
  if (requested !== 'auto' && !order.includes(requested)) {
    return `未知引擎：${requested}。可选 auto / ${order.join(' / ')}。`
  }
  if (requested !== 'auto' && !available[requested]) {
    return `指定引擎 ${requested} 不可用。本机可用：${usable.join(', ') || '（无）'}。`
  }
  const chain = requested === 'auto' ? usable : [requested]
  if (chain.length === 0) {
    return [
      'pandoc 有了，但没有任何可用的 PDF 引擎：',
      '- LaTeX：装 TeX Live / MiKTeX（质量最好）',
      '- Typst：装一个 ~30 MB 单文件二进制，无需 TeX 发行版',
      '- Word：本机需 Office（pandoc 生成 docx，Word 导出 PDF）',
      '- 浏览器：本机需 Edge 或 Chrome（HTML + MathJax 打印）',
      '缺失时请勿声称已生成 PDF。',
    ].join('\n')
  }

  const failures = []
  const workDir = mkdtempSync(join(tmpdir(), 'qingjin-export-'))
  try {
    for (const id of chain) {
      let result
      if (id === 'xelatex') result = runXelatex(pandoc, mdPath, pdfPath)
      else if (id === 'typst') result = runTypst(pandoc, mdPath, pdfPath)
      else if (id === 'word') result = runWord(pandoc, mdPath, pdfPath, workDir)
      else result = runEdge(pandoc, mdPath, pdfPath, workDir)
      if (result.ok) {
        const bytes = existsSync(pdfPath) ? statSync(pdfPath).size : 0
        if (bytes < 1024) {
          failures.push(`${id}: 生成的 PDF 过小（${bytes} B）`)
          continue
        }
        const size = Math.round(bytes / 1024)
        const lines = [
          `已导出：${pdfPath}（${size} KB）`,
          `引擎：${ENGINE_LABELS[id]}`,
          `说明：${ENGINE_NOTES[id]}`,
          `源文件：${mdPath}`,
        ]
        if (failures.length > 0) lines.push(`降级原因：${failures.join('；')}`)
        return lines.join('\n')
      }
      failures.push(`${id}: ${result.why}`)
    }
    return [
      '所有 PDF 引擎都失败了：',
      ...failures.map((item) => `- ${item}`),
      '',
      `已跳过：${order.filter((id) => !usable.includes(id)).join(', ') || '（无）'}`,
      '请修复其中一个引擎，或只交付 Markdown 并说明原因。',
    ].join('\n')
  } finally {
    try { rmSync(workDir, { recursive: true, force: true }) } catch { /* 临时目录清理失败不影响结果 */ }
  }
}

// ---------------------------------------------------------------- humanize

function humanize(text, lang) {
  const raw = String(text ?? '').trim()
  if (raw.length === 0) return '没有文本可检查：把要诊断的段落贴进来（中英文都可以）。'
  const sentences = raw.split(/(?<=[。！？.!?])\s*|\n+/).filter((sentence) => sentence.trim().length > 0)
  const hits = []
  for (const rule of STYLE.remove) {
    const re = new RegExp(rule.re, 'g')
    const matches = [...raw.matchAll(re)]
    if (matches.length === 0) continue
    const where = matches.slice(0, 2).map((match) => {
      const index = match.index ?? 0
      const before = raw.slice(0, index)
      const line = before.split('\n').length
      return `第 ${line} 段「${match[0].slice(0, 24)}」`
    })
    hits.push({ rule, count: matches.length, where })
  }
  const punct = []
  for (const rule of STYLE.punctuation) {
    const count = (raw.match(new RegExp(rule.re, 'g')) ?? []).length
    if (count > rule.max) punct.push({ rule, count })
  }

  const score = Math.max(0, 100 - hits.reduce((sum, hit) => sum + Math.min(12, hit.count * 4), 0) - punct.reduce((sum, item) => sum + Math.min(9, item.count * 3), 0))
  const band = score >= 85 ? '读起来自然' : score >= 70 ? '有模板味，改一轮' : score >= 50 ? '防御性/空话偏多' : '建议重写这一段'

  const parts = [`# 表达蒸馏（${band}，${score}/100）`, '']
  parts.push(`> ${STYLE.principle}`)
  parts.push('')
  parts.push('## 建议改写')
  if (hits.length === 0 && punct.length === 0) {
    parts.push('- 没有命中典型模板句。继续检查句间关系：下一句是在解释、支撑还是展开上一句？')
  }
  for (const hit of hits) {
    parts.push(`- [${hit.count} 处] **${hit.rule.zh}**：${hit.where.join('；')}`)
    parts.push(`  · 为什么：${hit.rule.why}`)
    parts.push(`  · 怎么改：${hit.rule.fix}`)
  }
  for (const item of punct) {
    parts.push(`- [${item.count} 处] **${item.rule.id === 'em-dash' ? '破折号密集' : item.rule.id === 'semicolon' ? '分号密集' : '感叹号'}**：${item.rule.why}`)
  }
  parts.push('')
  parts.push('## 必须保留（不要顺手删掉）')
  for (const item of STYLE.keep) parts.push(`- ${item}`)
  parts.push('')
  parts.push('## 下一步')
  parts.push('- 先补句间关系，再动措辞：每句要么解释上一句，要么给证据，要么推进结论。')
  parts.push('- 改完用 `qingjin_check`（section=abstract/introduction/…）复检结构与数字。')
  return parts.join('\n')
}


const ROUTES = [
  { id: 'ccf-idea-reviewer', re: /选题|idea|创新|值不值得|值不值得做|方向.*靠谱|评分排序/i },
  { id: 'ccf-idea-optimizer', re: /模糊|收敛|发展.*想法|把.*方向.*变成|细化.*思路/i },
  { id: 'ccf-literature-searcher', re: /文献|相关工作|benchmark|基准|baseline|检索|综述/i },
  { id: 'ccf-literature-monitor', re: /追踪|最新|跟进|监控|新论文/i },
  { id: 'ccf-experiment-designer', re: /实验设计|消融|鲁棒性|主实验|表格结构|评测方案/i },
  { id: 'ccf-research-engineer', re: /代码|实现|复现|训练|报错|调参|部署/i },
  { id: 'ccf-integrity-auditor', re: /一致性|核对|数字对不上|图表.*正文|引用.*错/i },
  { id: 'ccf-paper-reviewer', re: /评审|审稿意见|能不能投|拒稿|review|评分/i },
  { id: 'ccf-paper-writer', re: /写作|改写|润色|压缩|起草|摘要|引言|方法节/i },
  { id: 'ccf-humanization', re: /AI味|机器味|像模板|太生硬|去.*腔|自然一点/i },
  { id: 'ccf-rebuttal-writer', re: /rebuttal|回复审稿|response|修订说明/i },
  { id: 'ccf-visual-composer', re: /画图|作图|架构图|流程图|可视化|图表美化/i },
  { id: 'ccf-submission-checker', re: /投稿|交稿|匿名|页数|PDF 检查|补充材料/i },
  { id: 'ccf-paper-to-exemplar', re: /学.*写法|仿写|范文|借鉴.*结构/i },
  { id: 'ccf-project-scaffolder', re: /新开|目录|模板|起点/i },
  { id: 'ccf-pipeline-orchestrator', re: /排期|计划|里程碑|下一步.*安排/i },
]

function workflowReport(args) {
  const task = String(args.task ?? '').trim()
  const mode = ['route', 'review', 'artifacts', 'venues', 'all'].includes(args.mode) ? args.mode : 'route'

  if (mode === 'venues' || mode === 'all') {
    const parts = ['## 各 venue 的硬性差异（写作前先对表）']
    for (const item of WORKFLOWS.venueNotes) parts.push(`- **${item.venue}**：${item.note}`)
    parts.push('', '> 具体页数与必需声明以**当年官方 CFP** 为准；本表只提醒差异点。')
    if (mode === 'venues') return parts.join('\n')
    parts.push('')
    if (mode === 'all') return parts.join('\n') + '\n' + reviewBlock() + '\n' + artifactBlock()
  }

  if (mode === 'review') return reviewBlock()
  if (mode === 'artifacts') return artifactBlock()

  if (!task) {
    const lines = ['## 18 个技能的分工（按研究阶段）']
    for (const skill of WORKFLOWS.skills) {
      lines.push(`- **${skill.id}**（${skill.stage}）：${skill.zh}${skill.not ? ` —— 不负责：${skill.not}` : ''}`)
    }
    lines.push('', `> 前置链：${WORKFLOWS.chain}。${WORKFLOWS.chainWhy}`)
    lines.push('> 说一句你的具体任务（例如“帮我看这个选题值不值得做”），我会给出该走哪几步。')
    return lines.join('\n')
  }

  const hits = ROUTES.filter((route) => route.re.test(task))
  const matched = hits.map((hit) => WORKFLOWS.skills.find((skill) => skill.id === hit.id)).filter(Boolean)
  const parts = [`## 任务：${task}`, '']
  parts.push(`**前置**：${WORKFLOWS.chain}`)
  parts.push('')
  if (matched.length === 0) {
    parts.push('没有明确命中某个技能，按通用路径走：先 `ccf-humanization` + `ccf-common`，再判断这是「选题 / 文献 / 实验 / 写作 / 评审」中的哪一类。')
  } else {
    parts.push('**建议顺序**：')
    matched.slice(0, 3).forEach((skill, index) => {
      parts.push(`${index + 1}. **${skill.id}**（${skill.stage}）——${skill.zh}`)
      parts.push(`   - 什么时候用：${skill.when}`)
      parts.push(`   - 产出：${skill.out}`)
      if (skill.not) parts.push(`   - 不负责：${skill.not}`)
    })
  }
  parts.push('')
  parts.push('**本插件里可以配合调用的工具**：')
  parts.push('- 结构/模板：`qingjin_outline`、`qingjin_template`')
  parts.push('- 找同方向论文：`qingjin_related`（联网，唯一会外发的工具）')
  parts.push('- 术语与英文表达：`qingjin_glossary`、`qingjin_phrase`')
  parts.push('- 段落与译文自检：`qingjin_check`')
  parts.push('- 精读与导出：`qingjin_pdf_read`、`qingjin_export`')
  parts.push('')
  parts.push('**产物放哪**：' + WORKFLOWS.artifacts.rule)
  return parts.join('\n')
}

function reviewBlock() {
  const review = WORKFLOWS.review
  const style = STYLE.review
  const parts = ['## 结构化评审的骨架']
  parts.push(`- 七个维度：${review.dimensions.join(' / ')}`)
  parts.push(`- 评审模式：${style.modes.join(' / ')}（concept-only 问题仍归选题判断）`)
  parts.push(`- 报告节数：scientific/full ${style.reportSections.scientific} 节；writing ${style.reportSections.writing} 节；明确要求简版才用 ${style.reportSections.brief} 块`)
  parts.push(`- 发现分类必须分开：${style.findingTaxonomy.join(' / ')}`)
  parts.push(`- 反证纪律：${style.countercheck}`)
  parts.push(`- 明确禁止：${style.forbid.join('；')}`)
  parts.push(`- ${style.separate}`)
  parts.push(`- 复审要同时回答两个问题：①${review.twoQuestions[0]} ②${review.twoQuestions[1]}`)
  parts.push(`- 纪律：${review.discipline}`)
  parts.push('')
  parts.push('建议顺序：先给贡献与结论是否站得住 → 再逐维度给证据 → 最后给修改优先级；不要在评审里替作者改正文。')
  return parts.join('\n')
}

function artifactBlock() {
  const art = WORKFLOWS.artifacts
  const parts = ['## 产物目录约定']
  parts.push(`- 根目录：\`${art.root}\``)
  parts.push(`- 例子：${art.examples.join('、')}`)
  parts.push(`- 规则：${art.rule}`)
  return parts.join('\n')
}

// ---------------------------------------------------------------- rules

function formatRules(args) {
  const lang = args.lang === 'en' ? 'en' : 'zh'
  const scope = ['skeleton', 'typography', 'latex', 'venue', 'patterns', 'sci'].includes(args.scope) ? args.scope : 'all'
  const venue = args.venue ? String(args.venue).toLowerCase() : ''
  const parts = []
  const push = (title, rules) => {
    parts.push(`### ${title}`)
    for (const rule of rules) parts.push(`- ${rule}`)
    parts.push('')
  }

  if (scope === 'all' || scope === 'skeleton') {
    parts.push(`## ${RULES.skeleton.title}`)
    parts.push(`> ${RULES.skeleton.oneLine}`)
    parts.push('')
    for (const rule of RULES.skeleton.rules) parts.push(`- ${rule}`)
    parts.push('')
  }
  if (scope === 'all' || scope === 'typography') {
    push(RULES.typography[lang].title, RULES.typography[lang].rules)
  }
  if (scope === 'all' || scope === 'venue') {
    const keys = venue && RULES.venues[venue] ? [venue] : Object.keys(RULES.venues).filter((key) => key !== 'note')
    for (const key of keys) {
      const entry = RULES.venues[key]
      parts.push(`### ${entry.name}${entry.template ? ` · ${entry.template}` : ''}`)
      parts.push(`- 版式：${entry.columns} 栏；${entry.bodyFont}`)
      parts.push(`- 题注：${entry.captions}`)
      parts.push(`- 参考文献：${entry.references}`)
      parts.push(`- 摘要：${entry.abstractWords}`)
      parts.push(`- 章节：${entry.headings}`)
      parts.push(`- 页数：${entry.observedPages}`)
      if (entry.notes) parts.push(`- 注意：${entry.notes}`)
      parts.push('')
    }
    parts.push(`> ${RULES.venues.note}`)
    parts.push('')
  }
  if (scope === 'all' || scope === 'patterns') {
    parts.push(`### ${RULES.writingPatterns.title}`)
    for (const rule of RULES.writingPatterns.rules) parts.push(`- ${rule}`)
    parts.push('')
  }
  if (scope === 'all' || scope === 'sci') {
    parts.push(`### ${RULES.sciLayout.title}`)
    for (const item of RULES.sciLayout.rules) {
      parts.push(`- ${item.text}${item.source ? `（${item.source}）` : ''}`)
    }
    parts.push('')
    parts.push(`> ${RULES.sciLayout.note}`)
    parts.push('')
  }
  if (scope === 'all' || scope === 'latex') {
    push(RULES.latex.title, RULES.latex.rules)
  }
  parts.push(`> ${RULES.caveat}`)
  return parts.join('\n').trim()
}

// ---------------------------------------------------------------- glossary

function lookupGlossary(args) {
  const query = String(args.query ?? '').trim().toLowerCase()
  const limit = Number.isFinite(args.limit) ? Math.max(1, Math.min(20, Math.trunc(args.limit))) : 6
  if (!query) {
    return `请输入要查的术语（中英文均可），例如 concolic execution 或 混合执行。当前收录 ${GLOSSARY.terms.length} 条。`
  }
  const hits = []
  for (const term of GLOSSARY.terms) {
    const fields = [term.en, term.zh, ...(term.alt ?? []), term.domain, term.note ?? ''].join(' ').toLowerCase()
    if (!fields.includes(query)) continue
    let score = 0
    if (term.en.toLowerCase() === query || term.zh === query) score += 10
    else if (term.en.toLowerCase().startsWith(query) || term.zh.startsWith(query)) score += 5
    else if (term.en.toLowerCase().includes(query) || term.zh.includes(query)) score += 3
    else score += 1
    hits.push({ term, score })
  }
  hits.sort((a, b) => b.score - a.score)
  if (hits.length === 0) {
    return `没有收录「${args.query}」。可以先用 qingjin_phrase 查句式，或把该术语补进 data/glossary.json。`
  }
  const out = []
  for (const { term } of hits.slice(0, limit)) {
    out.push(`### ${term.en} → ${term.zh}`)
    if (term.alt?.length) out.push(`其它译法：${term.alt.join(' / ')}`)
    out.push(`领域：${term.domain}`)
    if (term.note) out.push(`注意：${term.note}`)
    out.push('')
  }
  return out.join('\n').trim()
}

// ---------------------------------------------------------------- translation check

const TRANSLATION_RULES = {
  cnNumber: /([一二三四五六七八九十两])(个|倍|次|项|种|成|分之)/,
  longEnglishRun: /[A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*){5,}/,
  asciiPunct: /[,;:?!]/,
  cjkPunct: /[，；：？！]/,
  constraintWord: /(至多|不超过|至少|小于|大于|不小于|不大于)/,
}

function checkTranslation(text) {
  const raw = String(text ?? '').trim()
  if (raw.length === 0) return '没有正文可检查：把要校核的中文译文贴进 text。'
  const issues = []
  const notes = []
  let score = 100
  const penalize = (points, level, message) => {
    score -= points
    issues.push(`- [${level}] ${message}`)
  }

  const sentences = raw.split(/(?<=[。！？；])/).filter((sentence) => sentence.trim().length > 0)
  const chars = raw.replace(/\s/g, '').length
  if (chars < 60) penalize(6, '低', `篇幅偏短（${chars} 字）：确认是否漏译了原文的某一句。`)

  const cnNumber = raw.match(TRANSLATION_RULES.cnNumber)
  if (cnNumber) penalize(10, '高', `出现中文数字「${cnNumber[0]}」：数量、比例、倍数应保留阿拉伯数字（原文 3 times → 3 倍）。`)

  const longEnglish = raw.match(TRANSLATION_RULES.longEnglishRun)
  if (longEnglish) penalize(12, '高', `有连续 6 个以上英文单词未译：${longEnglish[0].slice(0, 60)}…（专有名词可保留，整句不行）`)

  const missingEnglish = []
  for (const term of GLOSSARY.terms) {
    if (!raw.includes(term.zh)) continue
    if (raw.toLowerCase().includes(term.en.toLowerCase())) continue
    missingEnglish.push(`${term.zh}（${term.en}）`)
  }
  if (missingEnglish.length > 0) {
    notes.push(`- [提示] 这些术语只有中文、没有英文：${missingEnglish.slice(0, 5).join('、')}${missingEnglish.length > 5 ? ' 等' : ''}。首次出现建议写成「中文（English）」。`)
  }

  const longSentences = sentences.filter((sentence) => sentence.replace(/\s/g, '').length > 60)
  if (longSentences.length > 0) penalize(6, '中', `${longSentences.length} 个句子超过 60 字：长定语是中文译文最难读的地方，拆成两句。`)

  const deCount = (raw.match(/的/g) ?? []).length
  if (deCount >= 5) penalize(4, '低', `「的」出现 ${deCount} 次：连续定语让句子变重，改成动宾或拆句。`)

  const passiveCount = (raw.match(/被/g) ?? []).length
  if (passiveCount >= 3) notes.push(`- [提示] 「被」字句 ${passiveCount} 处：英文被动在中文里常改主动更自然。`)

  if (TRANSLATION_RULES.constraintWord.test(raw)) {
    notes.push('- [提示] 译文含「至多/不超过/至少/小于…」：逐一回对原文的 at most / at least / less than，方向错一个就是错的。')
  }

  if (TRANSLATION_RULES.asciiPunct.test(raw) && TRANSLATION_RULES.cjkPunct.test(raw)) {
    notes.push('- [提示] 中文句子里混用了半角标点（, ; : ?）：统一为全角，除非它在代码、数字或英文缩写内部。')
  }

  const tightPair = raw.match(/[\u4e00-\u9fa5][A-Za-z0-9]|[A-Za-z0-9][\u4e00-\u9fa5]/)
  if (tightPair) notes.push(`- [提示] 中英文之间缺空格（如「${tightPair[0]}」）：排版规范要求加一个半角空格。`)

  if (/[≤≥≠±×]/.test(raw)) notes.push('- [提示] 保留了数学符号（≤ ≥ ± ×）：很好，不要改成「小于等于」这类文字。')

  score = Math.max(0, Math.min(100, score))
  const band = score >= 85 ? '可用' : score >= 70 ? '需要一轮修订' : score >= 50 ? '问题较多' : '建议重译'
  const parts = [`# 译文校核（${band}，${score}/100）`, '', `篇幅：${chars} 字 / ${sentences.length} 句`, '']
  parts.push('## 需要修改')
  parts.push(...(issues.length > 0 ? issues : ['- 没有发现硬性问题。继续做一次回译检查（中文 → 英文，再对回原文）。']))
  parts.push('')
  if (notes.length > 0) {
    parts.push('## 提示')
    parts.push(...notes)
    parts.push('')
  }
  parts.push('## 回译检查清单')
  parts.push('- [ ] 数字、比例、倍数与原文字面一致')
  parts.push('- [ ] 比较方向（at most / at least / less than）没有译反')
  parts.push('- [ ] 术语全篇同一译法，首次出现附英文')
  parts.push('- [ ] 专有名词（模型名、数据集名、指标名）保持原文')
  parts.push('- [ ] 回译成英文后，关键句能与原句对上')
  return parts.join('\n')
}

function topicIdeas(cluster) {
  const wanted = cluster
    ? DUT.topicSeeds.filter((seed) => seed.cluster.includes(cluster))
    : DUT.topicSeeds
  const seedList = wanted.length > 0 ? wanted : DUT.topicSeeds
  const parts = ['# 凌水主校区 · 选题起点', '']
  parts.push(`> ${DUT.advice}`)
  parts.push('')
  for (const seed of seedList) {
    parts.push(`## ${seed.cluster}`)
    parts.push(`- 校内条件：${seed.hook}`)
    for (const idea of seed.starterIdeas) parts.push(`- 可做的小题目：${idea}`)
    parts.push('')
  }
  parts.push('## 立刻能做的三步')
  parts.push('1. 从上面挑一个能在一个学期内拿到数据或设备的方向。')
  parts.push('2. 用 `qingjin_outline`（kind=proposal）生成申报书骨架，先把技术路线写成三块。')
  parts.push('3. 用 `qingjin_check` 逐节自查时态、数字、局限与口语词。')
  return parts.join('\n')
}

// ---------------------------------------------------------------- phrases

function searchPhrases({ section, intent, query, limit }) {
  const max = Number.isFinite(limit) ? Math.max(1, Math.min(10, Math.trunc(limit))) : 3
  const needle = (query ?? '').trim().toLowerCase()
  const scored = []
  for (const entry of PHRASES.entries) {
    if (section && entry.section !== section) continue
    if (intent && entry.intent !== intent) continue
    let score = 0
    if (!section && !intent) score += 1
    if (needle) {
      const haystack = [entry.zh, entry.caution ?? '', ...entry.en].join(' ').toLowerCase()
      if (!haystack.includes(needle)) continue
      score += 5
    }
    scored.push({ entry, score })
  }
  scored.sort((a, b) => b.score - a.score)
  const picked = scored.slice(0, max).map((item) => item.entry)
  if (picked.length === 0) {
    const sections = Object.keys(PHRASES.sections).join(', ')
    return `没有匹配的句式。可用 section：${sections}；${section ? `该节可用 intent：${(PHRASES.intents[section] ?? []).join(', ')}` : ''}`
  }
  const out = []
  for (const entry of picked) {
    out.push(`### ${PHRASES.sections[entry.section] ?? entry.section} · ${entry.intent} — ${entry.zh}`)
    for (const sentence of entry.en) out.push(`- ${sentence}`)
    if (entry.caution) out.push(`注意：${entry.caution}`)
    out.push('')
  }
  return out.join('\n').trim()
}

// ---------------------------------------------------------------- check

const RE = {
  past: /\b(were|was|found|observed|showed|measured|recorded|obtained|increased|decreased|used|tested|collected|compared|trained|evaluated|performed)\b/i,
  present: /\b(is|are|shows?|indicates?|suggests?|demonstrates?|remains?|appears?|provides?|offers?)\b/i,
  hedge: /\b(may|might|could|likely|possibly|apparently|appears? to|seems? to|we suggest|it is unclear|remains? (?:unclear|open|unknown))\b/i,
  overclaim: /\b(proves?|proven|obviously|clearly|undoubtedly|definitely|certainly|always|never|perfect|first ever|fill(?:s|ed)? (?:the|a) gap)\b/i,
  vague: /\b(a lot of|lots of|many|very|really|quite|good|bad|big|small|things?|stuff|nice|better and better)\b/i,
  interpretation: /\b(because|due to|suggests? that|indicates? that|implies?|therefore|thus|hence)\b/i,
  citation: /\[\d+(?:[-,]\d+)*\]|\([A-Z][A-Za-z-]+(?:\s+et\s+al\.)?,?\s*\d{4}\)|（[^）]*\d{4}[^）]*）/,
  limitation: /\b(limit(?:ed|ation)?s?|caveat|remains? (?:unclear|open)|future work|cannot be (?:excluded|ruled out)|generali[sz]ation)\b/i,
  digits: /\d/,
  newData: /\b(new|additional) (?:data|experiment|measurement)s?\b/i,
}

const SECTION_RULES = {
  abstract: { expects: 'mixed', minWords: 120, maxWords: 320 },
  introduction: { expects: 'present', minWords: 300, maxWords: 1500 },
  methods: { expects: 'past', minWords: 250, maxWords: 3000 },
  results: { expects: 'past', minWords: 120, maxWords: 4000 },
  discussion: { expects: 'present', minWords: 200, maxWords: 3000 },
  conclusion: { expects: 'present', minWords: 50, maxWords: 500 },
}

function sentencesOf(text) {
  return text.replace(/\s+/g, ' ').split(/(?<=[.!?。！？])\s+/).filter(Boolean)
}

function count(re, text) {
  const matches = text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))
  return matches ? matches.length : 0
}

function checkSection(section, text) {
  if (section === 'translation') return checkTranslation(text)
  const rules = SECTION_RULES[section]
  if (!rules) return `未知章节：${section}。可选：${Object.keys(SECTION_RULES).join(', ')}, translation`
  const raw = String(text ?? '').trim()
  if (raw.length === 0) return '没有正文可检查：请把要自查的段落贴进 text。'

  const words = raw.split(/\s+/).filter(Boolean)
  const sentenceList = sentencesOf(raw)
  const issues = []
  const notes = []
  let score = 100
  const penalize = (points, level, message) => {
    score -= points
    issues.push(`- [${level}] ${message}`)
  }

  // length
  if (words.length < rules.minWords) penalize(10, '中', `篇幅偏短（${words.length} 词，建议 ≥ ${rules.minWords}）：检查是否漏掉了某个结构要素。`)
  if (words.length > rules.maxWords) penalize(6, '低', `篇幅偏长（${words.length} 词，建议 ≤ ${rules.maxWords}）：把次要细节移到补充材料，或拆成两节。`)

  // tense
  const past = count(RE.past, raw)
  const present = count(RE.present, raw)
  if (rules.expects === 'past' && present > past * 2 && present > 2) {
    penalize(12, '高', `时态偏向现在时（过去时 ${past} / 现在时 ${present}）：方法、结果通常用过去时描述已经发生的事。`)
  }
  if (rules.expects === 'present' && past > present * 2 && past > 2) {
    penalize(8, '中', `时态偏向过去时（过去时 ${past} / 现在时 ${present}）：引言、讨论通常用现在时描述现状与推论。`)
  }
  if (past > 0 && present > 0 && Math.abs(past - present) <= 1) {
    notes.push(`- [提示] 过去时与现在时几乎各半，确认是有意切换（如「我们观察到（过去），这提示（现在）」）还是混用。`)
  }

  // section-specific content checks
  if (section === 'abstract') {
    const elements = [
      ['目标句', /\b(aims?|we (?:ask|test|investigate|examine|address)|here we|this study)\b/i],
      ['方法句', /\b(used|using|we (?:perform|apply|measure|model)|were (?:collected|measured|compared))\b/i],
      ['结果句（含数字）', /\d/],
      ['结论句', /\b(suggest|indicat|conclude|show that|provide a basis)\b/i],
    ]
    for (const [label, re] of elements) {
      if (!re.test(raw)) penalize(10, '高', `摘要缺少${label}：结构化摘要需要背景-目标-方法-结果-结论齐全。`)
    }
    if (RE.citation.test(raw)) penalize(8, '高', '摘要里出现引用标记：摘要应独立可读，不放参考文献。')
  }

  if (section === 'introduction') {
    if (!RE.citation.test(raw)) penalize(10, '高', '引言没有引用标记：中心性宣称与文献评述都需要出处。')
    if (!/\b(however|but|yet|remains?|few|little|unclear|gap|lack)\b/i.test(raw)) {
      penalize(12, '高', '没有识别出「空白」信号（however / remains / few / gap）：CARS Move 2 缺失，读者不知道为什么要读下去。')
    }
    if (!/\b(we|this (?:study|paper)|here)\b/i.test(raw)) {
      penalize(10, '高', '没有出现「本文做了什么」（we / this study）：CARS Move 3 缺失。')
    }
  }

  if (section === 'results') {
    if (!RE.digits.test(raw)) penalize(12, '高', '结果段没有数字：没有量化的陈述无法支撑结论。')
    if (RE.interpretation.test(raw)) penalize(8, '中', '结果里出现解释性连接词（because / suggests / therefore）：解释应放到讨论。')
  }

  if (section === 'discussion') {
    if (!RE.limitation.test(raw)) penalize(10, '中', '讨论没有交代局限：主动写 validity threats 会提高可信度。')
    if (!RE.hedge.test(raw) && count(RE.overclaim, raw) > 0) {
      penalize(12, '高', '出现了过强断言（proves / clearly / always）却没有任何限定：加上 may / suggests / within {condition}。')
    }
  }

  if (section === 'conclusion') {
    if (RE.newData.test(raw)) penalize(8, '中', '结论里出现新数据/新实验：结论只总结已呈现的结果。')
  }

  // universal style checks
  if (count(RE.overclaim, raw) > 0) penalize(6, '中', '存在过强断言词：改为可被证据支持的表述。')
  if (count(RE.vague, raw) >= 3) penalize(5, '低', `口头/模糊词偏多（${count(RE.vague, raw)} 处：very / many / good / a lot of）：换成可量化表述。`)
  if (RE.vague.test(raw)) notes.push('- [提示] 发现口语化或模糊形容词，逐处判断能否换成数字。')

  const longSentences = sentenceList.filter((s) => s.split(/\s+/).length > 45)
  if (longSentences.length > 0) penalize(4, '低', `${longSentences.length} 个句子超过 45 词：拆句，读者工作记忆有限。`)

  const passive = count(/\b(?:was|were|is|are|been|be)\s+\w+(?:ed|en)\b/i, raw)
  if (passive > sentenceList.length && section !== 'methods') {
    notes.push(`- [提示] 被动结构 ${passive} 处，句数 ${sentenceList.length}：方法节可接受，其他节适当改主动。`)
  }

  const abbrs = raw.match(/\b[A-Z]{3,}\b/g) ?? []
  const undefinedAbbr = [...new Set(abbrs)].filter((token) => !new RegExp(`${token}\\s*[（(]`).test(raw))
  if (undefinedAbbr.length > 0) notes.push(`- [提示] 可能未定义的缩写：${undefinedAbbr.join(', ')}（首次出现应给出全称）。`)

  // paragraph C-C-C
  if (sentenceList.length >= 3) {
    const first = sentenceList[0]
    const last = sentenceList[sentenceList.length - 1]
    notes.push(`- [提示] 首句（应给上下文）：${first.slice(0, 90)}${first.length > 90 ? '…' : ''}`)
    notes.push(`- [提示] 末句（应是结论）：${last.slice(0, 90)}${last.length > 90 ? '…' : ''}——如果它读起来像细节或数据罗列，就把结论句补到段末。`)
  }

  score = Math.max(0, Math.min(100, score))
  const band = score >= 85 ? '结构稳定' : score >= 70 ? '需要一轮修改' : score >= 50 ? '问题较多' : '建议重写该段'

  const parts = []
  parts.push(`# 自检报告 · ${section}（${band}，${score}/100）`)
  parts.push('')
  parts.push(`篇幅：${words.length} 词 / ${sentenceList.length} 句`)
  parts.push('')
  if (issues.length > 0) {
    parts.push('## 需要修改')
    parts.push(...issues)
    parts.push('')
  } else {
    parts.push('## 需要修改')
    parts.push('- 没有发现硬性问题。继续用句式库打磨表达，并请同学做一次盲读。')
    parts.push('')
  }
  if (notes.length > 0) {
    parts.push('## 提示')
    parts.push(...notes)
    parts.push('')
  }
  const fixes = PHRASES.entries.filter((entry) => entry.section === section).slice(0, 2)
  if (fixes.length > 0) {
    parts.push('## 可以直接借用的句式')
    for (const entry of fixes) parts.push(`- ${entry.zh}：${entry.en[0]}`)
  }
  return parts.join('\n')
}

// ---------------------------------------------------------------- plugin

const SYSTEM_PROMPT = [
  'You have a bundled research-writing assistant for undergraduates (青衿科研 / Qingjin Research).',
  'When the user is shaping a paper, a thesis section, a 大创 proposal, or an English→Chinese translation — asking how to structure it, how to phrase it in English, whether a paragraph is acceptable, or which Chinese term is standard —',
  'For a multi-step research task ("这个选题值不值得做", "怎么设计消融", "帮我评审"), call `qingjin_workflow` first: it routes to the right stage and names the next tool; then use the specific tools.',
  'call `qingjin_outline` for the section skeleton, `qingjin_phrase` for English templates, `qingjin_glossary` for the canonical Chinese term and the mistake people make, and `qingjin_check` to diagnose a paragraph (section=translation reviews a Chinese translation).',
  'When the user wants something to fill in rather than an outline — a draft template or a LaTeX manuscript — call `qingjin_template` with format=md or format=tex.',
  'When the user asks for a deep read (中文精读/精读文章) of a downloaded paper, call `qingjin_pdf_read` first, then write a complete article — not an outline.',
  'Save the article as `精读-<短标题>.md` in the SAME folder as the source PDF, then call `qingjin_export` so a `.pdf` with the same name lands beside it. Deliver both paths.',
  'If the user gave a path such as C:\\…\\原文\\XXX.pdf, derive the folder from it; never scatter outputs into the workspace when a source folder exists.',
  'Use a Markdown bullet list for the metadata block (title/authors/venue), not a blockquote, so the PDF keeps one item per line.',
  'The article must be 1500–3000 Chinese characters and contain, in order: 一句话结论 / 研究问题与动机 / 方法拆解（3–5 个关键设计，每条配一句原文英文短引并给中译）/ 实验与数据 / 主要结果（用表格列数字与对照）/ 贡献 / 局限 / 与同方向工作的位置（可调用 `qingjin_related` 补充 2–3 篇对照）/ 可复用的写作句式（3–5 条）/ 术语表（中英对照）。',
  'Only quote numbers and sentences that appear in the extracted text; mark any inference as 推测. If the PDF has no text layer, say so instead of guessing.',
  'When the user wants to know which other papers in the field matter — how well received the venues are, where to download them — call `qingjin_related` with the paper title, DOI or direction: it reports venue tiers and open-access links, and separates preprints from peer-reviewed venues.',
  'State that tiers come from the plugin\'s built-in CCF-style table, so an unlisted venue means "not in the table", not "low quality".',
  'For a .tex deliverable: generate it, write it to a file in the workspace, and compile/verify it with the latex_look tool before calling the layout done.',
  'Generate the skeleton before drafting prose, and run the check on every paragraph the user writes.',
  'Never write the whole paper for the user: produce structure, templates, phrasing options, and diagnostics so the student does the writing.',
  'Answer in the language the user used; keep the English templates in English.',
].join(' ')

export const inject = ['tools', 'systemPrompt']

/** Exposed for the smoke test only; not part of the plugin's model-facing surface. */
export const __test = { tierOf, normalizeVenue }

export function apply(ctx) {
  ctx.systemPrompt?.section({ name: 'bundled:qingjin', order: 1100, text: SYSTEM_PROMPT })

  ctx.tools.register(makeTool({
    name: 'qingjin_outline',
    description:
      'Get a section-by-section skeleton for a paper or a 大创 proposal: purpose, tense, word budget, structural moves (IMRaD / CARS / C-C-C), self-check list, and starter sentences. ' +
      'Use it before drafting any prose. Kinds: research (full IMRaD), proposal (大创申报书), or one section id (abstract, introduction, methods, results, discussion, conclusion).',
    parameters: {
      kind: { type: 'string', required: true, description: 'research | proposal | abstract | introduction | methods | results | discussion | conclusion' },
      topic: { type: 'string', description: 'Working title or research question, shown in the outline header.' },
      words: { type: 'number', description: 'Target total word count for a research paper (defaults to 5000).' },
      cluster: { type: 'string', description: 'For kind=proposal: a DLUT cluster to suggest topics for (海洋工程 / 装备制造 / 化学化工 / 信息科学 / 管理 / 数理).' },
    },
    execute(args) {
      const kind = String(args.kind ?? 'research').trim().toLowerCase()
      const topic = args.topic ? String(args.topic).trim() : ''
      if (kind === 'proposal') {
        const body = outlineProposal(topic)
        const seeds = args.cluster ? `\n\n${topicIdeas(String(args.cluster))}` : ''
        return body + seeds
      }
      if (kind === 'research') return outlineResearch(topic, Number(args.words))
      return outlineSingle(kind, topic)
    },
  }))

  ctx.tools.register(makeTool({
    name: 'qingjin_template',
    description:
      'Produce a fill-in template (not just an outline): a paper draft or a 大创 proposal, as Markdown or as compilable LaTeX source. ' +
      'Every section carries a writing instruction, a ready-to-rewrite placeholder sentence and, for papers, a pre-submission checklist. ' +
      'Use format=tex when the user wants a .tex file; the Chinese template uses ctexart and compiles with xelatex. ' +
      'After generating LaTeX, write it to a file and verify the layout with the latex_look tool instead of claiming it looks right.',
    parameters: {
      kind: { type: 'string', required: true, description: 'paper | proposal' },
      format: { type: 'string', description: 'md (default) | tex' },
      lang: { type: 'string', description: 'zh (default) | en' },
      title: { type: 'string', description: 'Paper title or project name.' },
      author: { type: 'string', description: 'Author name.' },
      affiliation: { type: 'string', description: 'Institution (defaults to 大连理工大学).' },
      advisor: { type: 'string', description: 'Supervisor, proposal only.' },
      keywords: { type: 'string', description: 'Keywords, separated by ； or ;.' },
      date: { type: 'string', description: 'Date string; defaults to today.' },
    },
    execute(args) {
      return buildTemplate({
        kind: String(args.kind ?? 'paper'),
        format: args.format ? String(args.format) : 'md',
        lang: args.lang ? String(args.lang) : 'zh',
        title: args.title ? String(args.title) : '',
        author: args.author ? String(args.author) : '',
        affiliation: args.affiliation ? String(args.affiliation) : '',
        advisor: args.advisor ? String(args.advisor) : '',
        keywords: args.keywords ? String(args.keywords) : '',
        date: args.date ? String(args.date) : '',
      })
    },
  }))

  ctx.tools.register(makeTool({
    name: 'qingjin_phrase',
    description:
      'Look up English academic sentence templates by section and rhetorical intent (abstract/intro/methods/results/discussion/conclusion/transition/response), with Chinese usage notes and a misuse warning. ' +
      'Templates contain {placeholders} to replace. Use it to turn "I know what to say" into "I know how to say it".',
    parameters: {
      section: { type: 'string', description: 'abstract | intro | methods | results | discussion | conclusion | transition | response' },
      intent: { type: 'string', description: 'e.g. background, gap, purpose, result, limitation, interpretation, disagree' },
      query: { type: 'string', description: 'Optional free-text match over the Chinese note and English templates.' },
      limit: { type: 'number', description: 'Number of entries to return, 1-10 (default 3).' },
    },
    execute(args) {
      return searchPhrases({
        section: args.section ? String(args.section) : undefined,
        intent: args.intent ? String(args.intent) : undefined,
        query: args.query ? String(args.query) : undefined,
        limit: Number(args.limit),
      })
    },
  }))

  ctx.tools.register(makeTool({
    name: 'qingjin_pdf_read',
    description:
      'Read a local PDF (typically an arXiv or journal paper) and return its extracted plain text, page count and limits. ' +
      'Use it when the user wants a Chinese walkthrough of a paper they downloaded: read first, then write the analysis yourself — never invent numbers that are not in the extracted text. ' +
      'Scanned PDFs with no text layer are reported as such; this tool does not OCR. ' +
      'Paginate with offset/maxChars when the paper is long; the output names the next offset.',
    parameters: {
      path: { type: 'string', required: true, description: 'Absolute path, or a path relative to the current working directory.' },
      offset: { type: 'number', description: 'Character offset to start from (default 0).' },
      maxChars: { type: 'number', description: 'Characters to return this call, 2000-120000 (default 60000).' },
    },
    execute(args) {
      return readPdf({ path: args.path, offset: Number(args.offset), maxChars: Number(args.maxChars) })
    },
  }))

  ctx.tools.register(makeTool({
    name: 'qingjin_related',
    description:
      'Go online (OpenAlex) from one seed paper to the rest of its field: identify the venue of each candidate, mark built-in CCF-style tiers (A/B), and return open-access download links. ' +
      'Seed can be a title, a DOI, an arXiv number, or a direction keyword. Candidates come from related_works, citations in both directions, and the seed topic tags, so sub-directions are covered. ' +
      'Requires network; the only data sent is the query. Preprints (arXiv, Preprints.org, DOAJ) are labelled instead of being called top venues. ' +
      'Set OPENALEX_API_KEY in the environment for a dedicated quota.',
    parameters: {
      query: { type: 'string', required: true, description: 'Paper title, DOI (10.xxxx/...), arXiv id, or direction keywords.' },
      limit: { type: 'number', description: 'How many ranked candidates to print, 3-20 (default 8).' },
      tier: { type: 'string', description: 'AB (default) | A | all — which built-in tiers to keep.' },
      oaOnly: { type: 'boolean', description: 'Only keep candidates with an open-access copy.' },
    },
    execute(args) {
      return relatedReport({
        query: args.query,
        limit: Number(args.limit),
        tier: args.tier ? String(args.tier) : 'AB',
        oaOnly: args.oaOnly === true,
      })
    },
  }))

  ctx.tools.register(makeTool({
    name: 'qingjin_humanize',
    description:
      'Diagnose "AI-flavoured" academic prose: defensive preambles (「为了严谨起见」/It is worth noting), empty promises, repeated caveats, process narration, self-deprecation, mechanical 首先/其次/最后 enumeration, vague "显著优于" claims, internal version narration, and em-dash/semicolon density. ' +
      'It names the pattern, says why it hurts, and gives a rewrite direction — while listing what must be kept (negative results, calibrated uncertainty, citations, disclosures). ' +
      'Distilled from the CCFA-Skills humanization discipline (MIT), rewritten here. Use it before polishing wording: fix sentence relations first, surface style second.',
    parameters: {
      text: { type: 'string', required: true, description: 'The paragraph (Chinese or English) to diagnose.' },
    },
    execute(args) {
      return humanize(args.text)
    },
  }))

  ctx.tools.register(makeTool({
    name: 'qingjin_workflow',
    description:
      'Route a research-writing task to the right workflow step: it names which stage (选题 / 文献 / 实验 / 实现 / 核验 / 评审 / 写作 / 表达 / 回复 / 绘图 / 投稿) the request belongs to, what that step produces, and which of this plugin\'s tools to call next. ' +
      'The routing skeleton follows the MIT-licensed CCFA-Skills family (18 skills, humanization → common → specific); the text here is rewritten, not copied. ' +
      'mode=review returns the seven review dimensions and report skeleton; mode=artifacts the output-folder contract; mode=venues the hard requirements that differ between CVPR / ICLR / AAAI.',
    parameters: {
      task: { type: 'string', description: 'The user\'s task in their own words, e.g. 帮我看这个选题值不值得做. Omit to list all skills.' },
      mode: { type: 'string', description: 'route (default) | review | artifacts | venues | all' },
    },
    execute(args) {
      return workflowReport({ task: args.task, mode: args.mode ? String(args.mode) : 'route' })
    },
  }))

  ctx.tools.register(makeTool({
    name: 'qingjin_export',
    description:
      'Export a finished Markdown article to PDF, writing it beside the .md in the same folder. ' +
      'It tries a chain of engines and reports which one it used: xelatex + ctexart (best math), typst, Word (docx native OMML equations → Word export), then Edge/Chrome (HTML + MathJax print). ' +
      'Use it right after writing a 精读 article so the user gets both .md and .pdf in the source paper\'s folder. ' +
      'When no engine works it lists every failure and the install options instead of pretending the PDF exists.',
    parameters: {
      md: { type: 'string', required: true, description: 'Path to the finished .md file.' },
      outDir: { type: 'string', description: 'Output folder; defaults to the folder of the .md file.' },
      engine: { type: 'string', description: 'auto (default) | xelatex | typst | word | edge — force one engine instead of the fallback chain.' },
    },
    execute(args) {
      return exportPdf({ md: args.md, outDir: args.outDir, engine: args.engine })
    },
  }))

  ctx.tools.register(makeTool({
    name: 'qingjin_rules',
    description:
      'State the plugin\'s own generation rules: how a paper skeleton is produced (one contribution, abstract elements, CARS moves, tense, word budgets) and the basic typography for Chinese and English manuscripts (page, body font, heading sizes, figure/table captions, references) plus what the LaTeX templates set by default. ' +
      'Use it when the user asks how the skeleton is decided or what font/format rules to follow; the output is a checklist they can apply in Word or in the .tex.',
    parameters: {
      scope: { type: 'string', description: 'all (default) | skeleton | typography | venue | patterns | sci | latex' },
      venue: { type: 'string', description: 'For scope=venue: cvpr | eccv | aaai | icml (omit for all four).' },
      lang: { type: 'string', description: 'zh (default) | en — which typography set to show' },
    },
    execute(args) {
      return formatRules({
        scope: args.scope ? String(args.scope) : 'all',
        venue: args.venue ? String(args.venue) : '',
        lang: args.lang ? String(args.lang) : 'zh',
      })
    },
  }))

  ctx.tools.register(makeTool({
    name: 'qingjin_glossary',
    description:
      'Look up a Chinese/English academic term in the bundled glossary: canonical translation, accepted alternatives, field, and the mistake people actually make (e.g. concolic execution → 混合执行, proof rate → 证明成功率). ' +
      'Use it when reading or translating a paper and unsure which Chinese term is standard, or when a translation must keep one term consistent.',
    parameters: {
      query: { type: 'string', required: true, description: 'Term in English or Chinese, or a domain keyword such as 统计.' },
      limit: { type: 'number', description: 'Maximum entries, 1-20 (default 6).' },
    },
    execute(args) {
      return lookupGlossary({ query: args.query, limit: Number(args.limit) })
    },
  }))

  ctx.tools.register(makeTool({
    name: 'qingjin_check',
    description:
      'Diagnose one paragraph against the section it belongs to: length, tense consistency, missing structural elements (CARS moves, abstract elements, numbers in results, limitations in discussion), overclaiming, vague words, long sentences, undefined abbreviations, and the C-C-C first/last sentence. ' +
      'With section=translation it reviews a Chinese translation instead: numbers kept in Arabic numerals, untranslated English runs, terminology without its English at first use, long clauses, 的/被 density, punctuation mixing, CJK-Latin spacing, and constraint words that must not be reversed. ' +
      'Returns a scored report with concrete fixes and reusable patterns.',
    parameters: {
      section: { type: 'string', required: true, description: 'abstract | introduction | methods | results | discussion | conclusion | translation' },
      text: { type: 'string', required: true, description: 'The paragraph (or section draft) to check.' },
    },
    execute(args) {
      return checkSection(String(args.section), String(args.text ?? ''))
    },
  }))
}
