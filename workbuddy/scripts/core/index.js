/**
 * 青衿科研 · Qingjin Research
 *
 * A dependency-free DSH bundle that helps undergraduates (especially first-years
 * at DLUT's Lingshui main campus) turn a vague idea into a paper-shaped plan:
 * section skeletons grounded in IMRaD / CARS / C-C-C, an English phrase library
 * indexed by section and intent, and a deterministic paragraph self-check.
 *
 * Bundled-data tools; qingjin_related goes online, qingjin_export writes PDFs,
 * qingjin_flow persists state.
 */

import { readFileSync, statSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, openSync, readSync, closeSync } from 'node:fs'
import { isAbsolute, resolve, dirname, basename, join } from 'node:path'
import { tmpdir, homedir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { extractPdfTextSmart } from './lib/pdf.mjs'
import { readPdfReport as readPdf, garbleRatio } from './lib/readpdf.mjs'
import { mdToLatexDocument } from './lib/md2tex.mjs'
import { mdToHtmlDocument } from './lib/md2html.mjs'
import { startFlow, advanceFlow, flowStatus } from './lib/flow.mjs'
import { userGlossaryPath } from './lib/paths.mjs'
import { translateReport } from './lib/translate.mjs'
import { debugReport } from './lib/debug.mjs'

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
const TRANSLATE = data('translate.json')
let USER_GLOSSARY = { terms: [] }
let USER_GLOSSARY_ERROR = ''
let USER_GLOSSARY_MTIME = 0
function loadUserGlossary() {
  try {
    const userPath = userGlossaryPath()
    const fallback = new URL('./data/user-glossary.json', import.meta.url)
    const useUser = existsSync(userPath)
    const file = useUser ? userPath : fallback
    const mtime = useUser ? statSync(userPath).mtimeMs : 0
    if (useUser && mtime === USER_GLOSSARY_MTIME) return   // 内容未变，沿用缓存
    const raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
    USER_GLOSSARY = JSON.parse(raw)
    USER_GLOSSARY_MTIME = mtime
    USER_GLOSSARY_ERROR = ''
  } catch (error) {
    USER_GLOSSARY_ERROR = error instanceof Error ? error.message : String(error)
  }
}
loadUserGlossary()

/** 内置在前、用户在后；英文同名以用户条目为准。缺 en 时用 zh 兜底，避免静默丢弃。 */
function ALL_TERMS() {
  loadUserGlossary()   // 每次访问按 mtime 惰性重载：改词库无需重启宿主
  const seen = new Map()
  for (const term of [...GLOSSARY.terms, ...(USER_GLOSSARY.terms ?? [])]) {
    if (!term || (!term.en && !term.zh)) continue
    // 缺 en 时用 zh 兜底，保证下游 term.en.toLowerCase() 不会崩；标注来源便于识别。
    const normalized = term.en ? term : { ...term, en: term.zh, _enFallback: true }
    seen.set(String(normalized.en).toLowerCase(), normalized)
  }
  return [...seen.values()]
}

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
  const fallback = Math.round((kind.totalWords[0] + kind.totalWords[1]) / 2)
  const lowClamped = Number.isFinite(words) && words > 0 && words < 300
  const highClamped = Number.isFinite(words) && words > 100000
  const total = Number.isFinite(words) && words > 0 ? Math.min(100000, Math.max(300, Math.round(words))) : fallback
  const parts = []
  parts.push(`# 研究论文骨架${topic ? `：${topic}` : ''}`)
  parts.push('')
  parts.push(`> ${kind.oneLine}`)
  parts.push(`> 全文目标字数：约 ${total} 词。先定骨架再写字——标题、摘要、图、大纲最值得花时间。`)
  if (lowClamped) parts.push('> 目标字数过小，已按 300 词下限处理；正式论文建议 4000 词以上。')
  if (highClamped) parts.push('> 目标字数过大，已按 100000 词上限处理。')
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
  const kindNote = args.kind && !['paper', 'proposal'].includes(String(args.kind)) ? `（未知 kind ${args.kind}，已按论文模板输出）\n` : ''
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
        '编译后可用 `qingjin_export` 把对应 md 导成 PDF 核对版面；若本机没有导出引擎，请看编译日志，不要声称版面已检查。',
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
        'Verify the layout by exporting a PDF with `qingjin_export` (or inspect the compiler log); never claim the layout was checked if no engine ran.',
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

  return kindNote + formatNote + header
}


// ---------------------------------------------------------------- pdf

const PDF_MAX_BYTES = 40 * 1024 * 1024

// ---------------------------------------------------------------- related works

const OPENALEX = 'https://api.openalex.org/works'
const WORK_SELECT = 'id,doi,title,publication_year,cited_by_count,primary_location,locations,open_access,best_oa_location,topics'

function normalizeVenue(text) {
  return String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Tier A / B / preprint / none for one venue display name. */
function tierOf(venueName) {
  const venue = normalizeVenue(venueName)
  if (venue === '') return { tier: 'none', label: '未标venue' }
  if (venue.includes('lecture notes in computer science')) return { tier: 'none', label: 'LNCS（会议论文集系列，需看具体会议）' }
  for (const pattern of VENUES.preprintPatterns) {
    if (venue.includes(pattern)) return { tier: 'preprint', label: '预印本/索引库' }
  }
  for (const level of ['A', 'B']) {
    for (const entry of VENUES.tiers[level]) {
      const aliases = [String(entry.name ?? '').toLowerCase(), entry.name === 'NeurIPS' ? 'nips' : '']
      if (entry.match.some((needle) => venue.includes(needle)) || aliases.some((alias) => alias && venue.includes(alias))) {
        return { tier: level, label: entry.name }
      }
    }
  }
  return { tier: 'none', label: venueName }
}

function venueOf(work) {
  const primary = work.primary_location?.source?.display_name ?? ''
  // LNCS 这类系列名认不出具体会议：先遍历所有 location，命中 A/B 档就用它。
  const names = [primary, ...(work.locations ?? []).map((item) => item?.source?.display_name ?? '')].filter(Boolean)
  for (const name of names) {
    const tier = tierOf(name).tier
    if (tier === 'A' || tier === 'B') return name
  }
  return primary || names[0] || ''
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
  const mailto = process.env.OPENALEX_MAILTO || ''
  const VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
  const url = `${OPENALEX}${path}${path.includes('?') ? '&' : '?'}${mailto ? `mailto=${encodeURIComponent(mailto)}&` : ''}${key ? `api_key=${encodeURIComponent(key)}` : ''}`
  const response = await fetch(url, {
    headers: { 'User-Agent': `dsh-qingjin/${VERSION}` },
    signal: AbortSignal.timeout(15000),
  })
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
  // arXiv 号（2412.15931 / arXiv:2412.15931v2）→ OpenAlex 用 10.48550/arXiv.<id> 建索引
  const arxiv = value.match(/(?:arxiv\s*:\s*)?(\d{4}\.\d{4,5})(?:v\d+)?/i)
  if (!doi && arxiv) {
    const id = arxiv[1]
    const found = await openalex(`?filter=doi:${encodeURIComponent(`10.48550/arxiv.${id}`)}&select=${WORK_SELECT}&per-page=1`)
    if (found.results?.length) return found.results[0]
    return null
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
    // 传入的是标识符却匹配不上：直接说明，不要把标识符当关键词去检索一堆无关论文。
    const looksLikeId = /^\s*(?:\d{4}\.\d{4,5}(?:v\d+)?|arxiv\s*:|10\.\d{4,9}\/)/i.test(query)
    if (looksLikeId) {
      return [
        `没有在 OpenAlex 找到「${query}」对应的论文。`,
        '- 可能尚未收录，或该标识符有误；',
        '- 请改用论文标题，或换成 DOI（10.xxxx/...）。',
        '不会把标识符当关键词去猜测性检索。',
      ].join('\n')
    }
    try {
      const page = await openalex(`?filter=fulltext.search:${encodeURIComponent(query)}&select=${WORK_SELECT}&per-page=25&sort=cited_by_count:desc`)
      const works = (page.results ?? []).filter((work) => work.title)
      if (works.length === 0) return `没有找到与「${query}」相关的论文；请换关键词，或给论文标题/DOI。`
      return [
        `⚠ 没有匹配到种子论文：「${query}」不是已知的标题/DOI/arXiv 号。`,
        '下面是按关键词召回的**高引代表工作**，不是这篇论文的引用网络，相关度有限：',
        '',
        ...rankWorks(works).slice(0, limit).map(rowOf),
        '',
        '> 想要准确的同方向对照，请给准确标题或 DOI。',
      ].join('\n')
    } catch (error) {
      return `联网查询失败：${error instanceof Error ? error.message : String(error)}`
    }
  }

  const seedTier = tierOf(venueOf(seed))
  const parts = []
  parts.push(`## 种子`)
  parts.push(`**${seed.title}**`)
  parts.push(`${venueOf(seed) || '（无 venue）'} · ${seed.publication_year ?? '—'} · 引用 ${seed.cited_by_count ?? 0} · ${seedTier.tier === 'A' || seedTier.tier === 'B' ? `${seedTier.tier} 档` : seedTier.tier === 'preprint' ? '⚠ 预印本（未同行评审）' : `未收录等级（${seedTier.label}）`}`)
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

  let relaxed = false
  if (ranked.length === 0 && tierFilter !== 'all') {
    ranked = rankWorks(unique)
    relaxed = true
  }
  const top = ranked.slice(0, limit)
  const preprints = rankWorks(unique).filter((item) => item.tier.tier === 'preprint').slice(0, 3)

  parts.push(`## 同方向高质量论文（${relaxed ? '全部等级（A/B 档无结果，已自动放宽）' : tierFilter === 'all' ? '全部等级' : tierFilter === 'A' ? '仅 A 档' : 'A + B 档'}，按等级与引用排序）`)
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

const PF = process.env.ProgramFiles || 'C:/Program Files'
const PF86 = process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)'
const LOCAL = process.env.LOCALAPPDATA || ''
const APPDATA = process.env.APPDATA || ''

const PANDOC_CANDIDATES = [
  'pandoc',
  `${PF}/Pandoc/pandoc.exe`,
  `${PF86}/Pandoc/pandoc.exe`,
]

const XELATEX_CANDIDATES = [
  'xelatex',
  `${LOCAL}/Programs/MiKTeX/miktex/bin/x64/xelatex.exe`,
  `${PF}/MiKTeX/miktex/bin/x64/xelatex.exe`,
  `${PF}/texlive/2026/bin/windows/xelatex.exe`,
]

const TYPST_CANDIDATES = [
  'typst',
  `${APPDATA}/local/bin/typst.exe`,
]

const WINWORD_CANDIDATES = [
  `${PF}/Microsoft Office/root/Office16/WINWORD.EXE`,
  `${PF86}/Microsoft Office/root/Office16/WINWORD.EXE`,
]

const WPS_ROOT_CANDIDATES = [
  `${PF}/WPS Office`,
  `${PF86}/WPS Office`,
  `${LOCAL}/Kingsoft/WPS Office`,
].filter(Boolean)

const BROWSER_CANDIDATES = [
  `${PF86}/Microsoft/Edge/Application/msedge.exe`,
  `${PF}/Microsoft/Edge/Application/msedge.exe`,
  `${PF}/Google/Chrome/Application/chrome.exe`,
  `${PF86}/Google/Chrome/Application/chrome.exe`,
]

/** WPS 安装目录带版本号，按数值倒序取最新的一个可执行文件。 */
function findWpsWriter() {
  for (const root of WPS_ROOT_CANDIDATES) {
    if (!root || !existsSync(root)) continue
    let versions = []
    try { versions = readdirSync(root).filter((name) => /^\d/.test(name)) } catch { continue }
    versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    for (const version of versions) {
      for (const candidate of ['office6/wps.exe', 'office6/wpsoffice.exe']) {
        const exe = join(root, version, candidate)
        if (existsSync(exe)) return exe
      }
    }
  }
  return null
}

const ENGINE_LABELS = {
  xelatex: 'LaTeX（xelatex + ctexart）',
  typst: 'Typst（--pdf-engine=typst）',
  word: 'Word（docx 原生公式 → Word 导出）',
  wps: 'WPS（docx → WPS 文字导出）',
  edge: '浏览器（HTML + MathJax → Edge/Chrome 打印）',
}

const ENGINE_NOTES = {
  xelatex: '数学排版最稳，align 对齐、编号、交叉引用都正常。',
  typst: '数学接近 LaTeX；中文需 CJK 字体，个别符号支持弱于 LaTeX。',
  word: '公式为 Word 原生 OMML，分式/求和/矩阵观感接近 LaTeX；align 对齐点可能偏移，编号与 \\ref 弱。',
  wps: 'WPS 文字排版，中文样式好；公式转换质量取决于 WPS 版本，复杂公式可能降级为图片。',
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
    const wps = findWpsWriter()
    if (wps) found.wps = wps
    const browser = BROWSER_CANDIDATES.find((candidate) => existsSync(candidate))
    if (browser) found.edge = browser
  }
  return found
}

function pandocError(result) {
  const detail = (result.stderr ?? '').split('\n').filter(Boolean).slice(-4).join(' / ')
  return detail || result.error?.message || `exit ${result.status}`
}

function runXelatex(pandoc, mdPath, pdfPath, workDir) {
  // ctexart 默认拉丁字体缺希腊字母：π 会直接消失。用 newunicodechar 映射到数学符号。
  const headerPath = join(workDir, 'greek.tex')
  writeFileSync(headerPath, [
    '\\usepackage{newunicodechar}',
    '\\newunicodechar{α}{\\ensuremath{\\alpha}}',
    '\\newunicodechar{β}{\\ensuremath{\\beta}}',
    '\\newunicodechar{γ}{\\ensuremath{\\gamma}}',
    '\\newunicodechar{δ}{\\ensuremath{\\delta}}',
    '\\newunicodechar{ε}{\\ensuremath{\\epsilon}}',
    '\\newunicodechar{θ}{\\ensuremath{\\theta}}',
    '\\newunicodechar{λ}{\\ensuremath{\\lambda}}',
    '\\newunicodechar{μ}{\\ensuremath{\\mu}}',
    '\\newunicodechar{ν}{\\ensuremath{\\nu}}',
    '\\newunicodechar{π}{\\ensuremath{\\pi}}',
    '\\newunicodechar{ρ}{\\ensuremath{\\rho}}',
    '\\newunicodechar{σ}{\\ensuremath{\\sigma}}',
    '\\newunicodechar{τ}{\\ensuremath{\\tau}}',
    '\\newunicodechar{φ}{\\ensuremath{\\phi}}',
    '\\newunicodechar{ω}{\\ensuremath{\\omega}}',
    '\\newunicodechar{Δ}{\\ensuremath{\\Delta}}',
    '\\newunicodechar{Σ}{\\ensuremath{\\Sigma}}',
  ].join('\n'), 'utf8')
  const result = spawnSync(pandoc, [
    mdPath, '-o', pdfPath,
    '--pdf-engine=xelatex',
    '--include-in-header', headerPath,
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

/** WPS 的 COM 接口是 Kwps.Application，不是 Word.Application；导出方法名也可能不同，所以两级兜底。 */
function runWps(pandoc, mdPath, pdfPath, workDir) {
  const docxPath = join(workDir, 'export-wps.docx')
  const built = spawnSync(pandoc, [mdPath, '-o', docxPath], { encoding: 'utf8', timeout: 180000 })
  if (built.error) return { ok: false, why: built.error.message }
  if (built.status !== 0) return { ok: false, why: pandocError(built) }

  const scriptPath = join(workDir, 'wps-export.ps1')
  writeFileSync(scriptPath, [
    'param([string]$docx,[string]$pdf)',
    "$ErrorActionPreference = 'Stop'",
    '$app = New-Object -ComObject Kwps.Application',
    'try { $app.Visible = $false } catch {}',
    'try { $app.DisplayAlerts = 0 } catch {}',
    'try {',
    '  $doc = $app.Documents.Open($docx, $false, $true)',
    '  $done = $false',
    '  try { $doc.ExportAsFixedFormat($pdf, 17); $done = $true } catch {}',
    '  if (-not $done) { $doc.SaveAs([ref]$pdf, [ref]17); $done = $true }',
    '  $doc.Close($false)',
    '} finally {',
    '  try { $app.Quit() } catch {}',
    '}',
  ].join('\n'), 'utf8')

  const result = spawnSync('powershell.exe', [
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, docxPath, pdfPath,
  ], { encoding: 'utf8', timeout: 240000 })
  if (result.error) return { ok: false, why: result.error.message }
  if (result.status !== 0) return { ok: false, why: (result.stderr ?? '').split('\n').filter(Boolean).slice(-3).join(' / ') || `exit ${result.status}` }
  return existsSync(pdfPath) ? { ok: true } : { ok: false, why: 'WPS 未生成 PDF' }
}

/** 没有 pandoc / xelatex、只有浏览器：自己拼 HTML 再让 Edge 打印。公式降级为源码。 */
function runEdgeDirect(mdPath, pdfPath, workDir, browser) {
  const htmlPath = join(workDir, 'export-direct.html')
  const title = basename(mdPath).replace(/\.md$/i, '')
  writeFileSync(htmlPath, mdToHtmlDocument(readFileSync(mdPath, 'utf8'), title), 'utf8')
  const result = spawnSync(browser, [
    '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
    `--user-data-dir=${join(workDir, 'profile-direct')}`,
    '--virtual-time-budget=8000',
    `--print-to-pdf=${pdfPath}`,
    `file:///${encodeURI(htmlPath.replace(/\\/g, '/'))}`,
  ], { encoding: 'utf8', timeout: 180000 })
  if (result.error) return { ok: false, why: result.error.message }
  if (!existsSync(pdfPath)) {
    const detail = (result.stderr ?? '').split('\n').filter(Boolean).slice(-3).join(' / ')
    return { ok: false, why: detail || `浏览器退出码 ${result.status}` }
  }
  return { ok: true }
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
    `file:///${encodeURI(htmlPath.replace(/\\/g, '/'))}`,
  ], { encoding: 'utf8', timeout: 180000 })
  if (result.error) return { ok: false, why: result.error.message }
  if (!existsSync(pdfPath)) {
    return { ok: false, why: (result.stderr ?? '').split('\n').filter(Boolean).slice(-3).join(' / ') || `exit ${result.status}` }
  }
  return { ok: true }
}

function exportWithoutPandoc(mdPath, pdfPath, workDir, xelatex) {
  const title = basename(mdPath).replace(/\.md$/i, '')
  const texPath = join(workDir, 'fallback.tex')
  writeFileSync(texPath, mdToLatexDocument(readFileSync(mdPath, 'utf8'), title), 'utf8')
  for (let pass = 0; pass < 2; pass += 1) {
    const run = spawnSync(xelatex, ['-interaction=nonstopmode', '-halt-on-error', `-output-directory=${workDir}`, texPath], { encoding: 'utf8', timeout: 180000 })
    if (run.status !== 0) {
      const detail = (run.stdout ?? '').split('\n').filter((line) => line.trim().startsWith('!')).slice(0, 3).join(' / ')
        || (run.stderr ?? '').split('\n').slice(-3).join(' / ')
        || `exit ${run.status}`
      return { ok: false, why: `xelatex 直连编译失败：${detail}` }
    }
  }
  const produced = join(workDir, 'fallback.pdf')
  if (!existsSync(produced)) return { ok: false, why: 'xelatex 未生成 PDF' }
  writeFileSync(pdfPath, readFileSync(produced))
  return { ok: true }
}

function exportPdf(args) {
  const rawPath = String(args.md ?? '').trim()
  if (!rawPath) return '请给出要导出的 Markdown 文件路径。'
  const mdPath = isAbsolute(rawPath) ? rawPath : resolve(rawPath)
  if (!existsSync(mdPath)) return `找不到文件：${mdPath}`
  if (!statSync(mdPath).isFile()) return `不是文件：${mdPath}`
  if (!/\.md$/i.test(mdPath)) return `只支持 .md 文件：${mdPath}`
  // 0.26.1：空文档提前拒绝，不再产出一张「看起来成功」的空白 PDF。
  let mdText
  try { mdText = readFileSync(mdPath, 'utf8') } catch (error) {
    return `读取 Markdown 失败：${error instanceof Error ? error.message : String(error)}`
  }
  if (!mdText.trim()) return `文档为空：${mdPath}（没有正文，不导出空白 PDF）。写点内容再试。`

  const dir = args.outDir ? (isAbsolute(String(args.outDir)) ? String(args.outDir) : resolve(String(args.outDir))) : dirname(mdPath)
  if (!existsSync(dir)) {
    try { mkdirSync(dir, { recursive: true }) } catch (error) {
      return `无法创建输出目录 ${dir}：${error instanceof Error ? error.message : String(error)}`
    }
  }
  const base = basename(mdPath).replace(/\.md$/i, '')
  const pdfPath = join(dir, `${base}.pdf`)

  const requested = String(args.engine ?? 'auto').trim().toLowerCase()
  const ORDER = ['xelatex', 'typst', 'word', 'wps', 'edge']
  if (requested !== 'auto' && !ORDER.includes(requested)) {
    return `未知引擎：${requested}。可选 auto / ${ORDER.join(' / ')}。`
  }

  const pandoc = findPandoc()
  const xelatexProbe = firstWorking(XELATEX_CANDIDATES, ['--version'])
  if (!pandoc && !xelatexProbe) {
    const browser = BROWSER_CANDIDATES.find((candidate) => existsSync(candidate))
    if (!browser) {
      if (requested !== 'auto') return `指定引擎 ${requested} 需要 pandoc / xelatex，但本机都没有，也没有 Edge/Chrome。`
      return [
        '没有找到 pandoc、xelatex，也没有 Edge/Chrome。',
        '装一个即可：winget install --id JohnMacFarlane.Pandoc -e',
        '在此之前只能交付 Markdown，并在说明里写明 PDF 未生成的原因。',
      ].join('\n')
    }
    if (requested !== 'auto' && requested !== 'edge') {
      return `指定引擎 ${requested} 需要 pandoc / xelatex；本机只有浏览器，可用 engine=edge 或 auto 走内置 HTML 直连。`
    }
    const workDir = mkdtempSync(join(tmpdir(), 'qingjin-export-'))
    try {
      const direct = runEdgeDirect(mdPath, pdfPath, workDir, browser)
      if (direct.ok) {
        const size = Math.round(statSync(pdfPath).size / 1024)
        return [
          `已导出：${pdfPath}（${size} KB）`,
          '引擎：Edge 直连（本机没有 pandoc / xelatex，已用内置 Markdown→HTML 打印）',
          '注意：公式在本路径下退化为源码（$...$ 原样显示）；要公式排版请装 pandoc 或 xelatex。',
          `源文件：${mdPath}`,
        ].join('\n')
      }
      return `浏览器直连导出失败：${direct.why}`
    } finally {
      try { rmSync(workDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  }


  // 没有 pandoc 但有 xelatex：用内置 Markdown→LaTeX 转换器直连编译。
  if (!pandoc && xelatexProbe) {
    if (requested !== 'auto' && requested !== 'xelatex') return `指定引擎 ${requested} 需要 pandoc；本机只有 xelatex（用 engine=xelatex 或 auto 走内置转换）。`
    const workDir = mkdtempSync(join(tmpdir(), 'qingjin-export-'))
    try {
      const fallback = exportWithoutPandoc(mdPath, pdfPath, workDir, xelatexProbe)
      if (fallback.ok) {
        const size = Math.round(statSync(pdfPath).size / 1024)
        return [
          `已导出：${pdfPath}（${size} KB）`,
          '引擎：xelatex 直连（本机没有 pandoc，已用内置 Markdown→LaTeX 转换）',
          '覆盖范围：标题/列表/引用/三线表/代码块/粗斜体/链接/希腊字母；脚注等扩展需装 pandoc。',
          `源文件：${mdPath}`,
        ].join('\n')
      }
      return fallback.why
    } finally {
      try { rmSync(workDir, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  }

  const available = detectEngines()
  const order = ORDER
  const usable = order.filter((id) => available[id])
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
      if (id === 'xelatex') result = runXelatex(pandoc, mdPath, pdfPath, workDir)
      else if (id === 'typst') result = runTypst(pandoc, mdPath, pdfPath)
      else if (id === 'word') result = runWord(pandoc, mdPath, pdfPath, workDir)
      else if (id === 'wps') result = runWps(pandoc, mdPath, pdfPath, workDir)
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

  // 命中任何模板句就封顶 84，避免「已列出防御性铺垫」却仍报「读起来自然」。
  const rawScore = 100 - hits.reduce((sum, hit) => sum + Math.min(12, 6 + hit.count * 4), 0) - punct.reduce((sum, item) => sum + Math.min(9, item.count * 3), 0)
  const score = Math.max(0, Math.min(hits.length > 0 ? 84 : 100, rawScore))
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
  { id: 'ccf-paper-to-exemplar', re: /学.*写法|仿写|范文|借鉴.*结构|精读|读论文|读懂|阅读.*论文/i },
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
  parts.push('- 术语与英文表达：`qingjin_lookup`（scope=glossary / phrase）')
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
  const badVenue = args.venue && !['cvpr', 'eccv', 'aaai', 'icml', ''].includes(String(args.venue).toLowerCase())
  const badMode = args.scope && !['all', 'skeleton', 'typography', 'venue', 'patterns', 'sci', 'latex', ''].includes(String(args.scope).toLowerCase())
  const warn = badVenue || badMode
    ? `> ⚠ 未收录${badVenue ? ` venue=${args.venue}` : ''}${badMode ? ` mode=${args.scope}` : ''}，以下按默认口径输出。\n\n`
    : ''
  const lang = args.lang === 'en' ? 'en' : 'zh'
  const scope = ['skeleton', 'typography', 'latex', 'venue', 'patterns', 'sci'].includes(args.scope) ? args.scope : 'all'
  const venue = args.venue ? String(args.venue).toLowerCase() : ''
  const parts = []
  if (warn) parts.push(warn.trim())
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

function glossaryOverview() {
  const groups = new Map()
  for (const term of ALL_TERMS()) {
    const domain = term.domain || '通用'
    if (!groups.has(domain)) groups.set(domain, [])
    groups.get(domain).push(term)
  }
  const lines = [`# 术语表（共 ${ALL_TERMS().length} 条，按领域精选）`]
  if (USER_GLOSSARY_ERROR) lines.push('', `> ⚠ 用户词表解析失败（${USER_GLOSSARY_ERROR.slice(0, 80)}）；已忽略。检查 JSON 是否合法。`)
  for (const [domain, list] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 6)) {
    lines.push('', `## ${domain}（${list.length} 条）`)
    for (const term of list.slice(0, 3)) lines.push(`- ${term.en} → ${term.zh}${term.note ? `（${term.note}）` : ''}`)
  }
  lines.push('', `> 给 query 可精确查一条；自定义词条放 ${userGlossaryPath()}（改完即生效，无需重启）。`)
  return lines.join('\n')
}

function lookupGlossary(args) {
  const query = String(args.query ?? '').trim().toLowerCase()
  const limit = Number.isFinite(args.limit) ? Math.max(1, Math.min(20, Math.trunc(args.limit))) : 6
  if (!query) {
    return glossaryOverview()
  }
  const hits = []
  for (const term of ALL_TERMS()) {
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
    return `没有收录「${args.query}」。可以先用 qingjin_lookup(scope=phrase) 查句式，或把该术语补进 data/glossary.json。`
  }
  const out = []
  for (const { term } of hits.slice(0, limit)) {
    out.push(`### ${term.en}${term._enFallback ? '（缺 en，按中文索引）' : ''} → ${term.zh}`)
    if (term.alt?.length) out.push(`其它译法：${term.alt.join(' / ')}`)
    out.push(`领域：${term.domain || '自定义'}`)
    if (term.note) out.push(`注意：${term.note}`)
    out.push('')
  }
  return out.join('\n').trim()
}

// ---------------------------------------------------------------- translation check

const TRANSLATION_RULES = {
  cnNumber: /([二三四五六七八九十两])(个|倍|次|项|种|成|分之)|一(倍|成|分之)/,
  longEnglishRun: /[A-Za-z][A-Za-z-]*(?:\s+[A-Za-z][A-Za-z-]*){5,}/,
  asciiPunct: /[,;:?!]/,
  cjkPunct: /[，；：？！]/,
  constraintWord: /(至多|不超过|至少|小于|大于|不小于|不大于)/,
}

/** 跨段一致性：数字、术语、篇幅三项。用于「英文原文 vs 中文译文」或「摘要 vs 结论」。 */
function consistencyReport(text, compare) {
  const nums = (s) => new Set((String(s).match(/\d+(?:\.\d+)?/g) ?? []).map((n) => n.replace(/\.0+$/, '')))
  const a = nums(text)
  const b = nums(compare)
  const onlyA = [...a].filter((n) => !b.has(n))
  const onlyB = [...b].filter((n) => !a.has(n))

  const lower = String(text).toLowerCase()
  const compareLower = String(compare).toLowerCase()
  const termIssues = []
  for (const term of ALL_TERMS()) {
    const inA = lower.includes(String(term.zh).toLowerCase()) || lower.includes(String(term.en).toLowerCase())
    const inB = compareLower.includes(String(term.zh).toLowerCase()) || compareLower.includes(String(term.en).toLowerCase())
    if (inA !== inB) termIssues.push(`${term.zh} / ${term.en}（${inA ? '本段有、对照无' : '对照有、本段无'}）`)
  }

  const lines = ['', '## 与对照文本的一致性']
  lines.push(onlyA.length === 0 && onlyB.length === 0
    ? '- 数字：两边一致。'
    : `- 数字：本段独有 ${onlyA.slice(0, 6).join('、') || '（无）'}；对照独有 ${onlyB.slice(0, 6).join('、') || '（无）'}。`)
  lines.push(termIssues.length === 0
    ? '- 术语：未发现单边出现的词条。'
    : `- 术语：${termIssues.slice(0, 5).join('；')}${termIssues.length > 5 ? ` 等 ${termIssues.length} 条` : ''}。`)
  const ratio = String(text).replace(/\s/g, '').length / Math.max(1, String(compare).replace(/\s/g, '').length)
  lines.push(`- 篇幅比：${ratio.toFixed(2)}（中文/对照；中英互译经验值 0.5–0.8，偏离说明有漏译或扩写）。`)
  return lines.join('\n').replace(/^\n+/, '')
}

function checkTranslation(text, compare) {
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
  for (const term of ALL_TERMS()) {
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
  if (compare) parts.push(consistencyReport(raw, String(compare)))

  if (parts[parts.length - 1] !== '') parts.push('')
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

function searchPhrases({ section: sectionIn, intent, query, limit }) {
  const section = sectionIn ? String(sectionIn).trim().toLowerCase().replace(/^introduction$/, 'intro') : ''
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

function checkSection(section, text, compare) {
  const key = String(section ?? '').trim().toLowerCase().replace(/^intro$/, 'introduction')
  if (key === 'translation') return checkTranslation(text, compare)
  const rules = SECTION_RULES[key]
  if (!rules) return `未知章节：${section}。可选：${Object.keys(SECTION_RULES).join(', ')}, translation`
  const raw = String(text ?? '').trim()
  if (raw.length === 0) return '没有正文可检查：请把要自查的段落贴进 text。'

  // 中文段落不能用空格分词：按 CJK 字符数折算，并改用字符阈值。
  const cjkChars = (raw.match(/[\u4e00-\u9fff]/g) ?? []).length
  const isCjk = cjkChars > 0 && cjkChars >= raw.replace(/\s/g, '').length * 0.3
  const latinWords = (raw.match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) ?? []).length
  const words = isCjk ? latinWords + Math.round(cjkChars / 1.7) : raw.split(/\s+/).filter(Boolean).length
  const sentenceList = sentencesOf(raw)
  const issues = []
  const notes = []
  let score = 100
  const penalize = (points, level, message) => {
    score -= points
    issues.push(`- [${level}] ${message}`)
  }

  // length
  if (isCjk) {
    const minChars = rules.minWords * 1.6
    const maxChars = rules.maxWords * 1.6
    const length = raw.replace(/\s/g, '').length
    if (length < minChars) penalize(10, '中', `篇幅偏短（${length} 字，中文建议 ≥ ${Math.round(minChars)} 字）：检查是否漏掉了某个结构要素。`)
    if (length > maxChars) penalize(6, '低', `篇幅偏长（${length} 字，中文建议 ≤ ${Math.round(maxChars)} 字）：把次要细节移到补充材料，或拆成两节。`)
  } else {
    if (words < rules.minWords) penalize(10, '中', `篇幅偏短（${words} 词，建议 ≥ ${rules.minWords}）：检查是否漏掉了某个结构要素。`)
    if (words > rules.maxWords) penalize(6, '低', `篇幅偏长（${words} 词，建议 ≤ ${rules.maxWords}）：把次要细节移到补充材料，或拆成两节。`)
  }

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
  if (key === 'abstract') {
    const elements = [
      ['目标句', /\b(aims?|we (?:ask|test|investigate|examine|address|propose|present|introduce|develop|design)|here we|this (?:study|paper))\b/i],
      ['方法句', /\b(used|using|we (?:perform|apply|measure|model|propose|present|introduce|design)|were (?:collected|measured|compared)|framework|module|adapter)\b/i],
      ['结果句（含数字）', /\d/],
      ['结论句', /\b(suggest|indicat|conclude|show that|provide a basis)\b/i],
    ]
    for (const [label, re] of elements) {
      if (!re.test(raw)) penalize(10, '高', `摘要缺少${label}：结构化摘要需要背景-目标-方法-结果-结论齐全。`)
    }
    if (RE.citation.test(raw)) penalize(8, '高', '摘要里出现引用标记：摘要应独立可读，不放参考文献。')
  }

  if (key === 'introduction') {
    if (!RE.citation.test(raw)) penalize(10, '高', '引言没有引用标记：中心性宣称与文献评述都需要出处。')
    if (!/\b(however|but|yet|remains?|few|little|unclear|gap|lack)\b/i.test(raw) && !/(然而|但是|不过|目前仍|仍存在|仍面临|尚未|不足|缺乏|空白|有待)/.test(raw)) {
      penalize(12, '高', '没有识别出「空白」信号（however / remains / few / gap）：CARS Move 2 缺失，读者不知道为什么要读下去。')
    }
    if (!/\b(we|this (?:study|paper)|here)\b/i.test(raw) && !/(本文|本研究|我们|这项工作|该研究)/.test(raw)) {
      penalize(10, '高', '没有出现「本文做了什么」（we / this study）：CARS Move 3 缺失。')
    }
  }

  if (key === 'results') {
    if (!RE.digits.test(raw)) penalize(12, '高', '结果段没有数字：没有量化的陈述无法支撑结论。')
    if (RE.interpretation.test(raw)) penalize(8, '中', '结果里出现解释性连接词（because / suggests / therefore）：解释应放到讨论。')
  }

  if (key === 'discussion') {
    if (!RE.limitation.test(raw)) penalize(10, '中', '讨论没有交代局限：主动写 validity threats 会提高可信度。')
    if (!RE.hedge.test(raw) && count(RE.overclaim, raw) > 0) {
      penalize(12, '高', '出现了过强断言（proves / clearly / always）却没有任何限定：加上 may / suggests / within {condition}。')
    }
  }

  if (key === 'conclusion') {
    if (RE.newData.test(raw)) penalize(8, '中', '结论里出现新数据/新实验：结论只总结已呈现的结果。')
  }

  // universal style checks
  if (count(RE.overclaim, raw) > 0) penalize(6, '中', '存在过强断言词：改为可被证据支持的表述。')
  if (count(RE.vague, raw) >= 3) penalize(5, '低', `口头/模糊词偏多（${count(RE.vague, raw)} 处：very / many / good / a lot of）：换成可量化表述。`)
  if (RE.vague.test(raw)) notes.push('- [提示] 发现口语化或模糊形容词，逐处判断能否换成数字。')

  const longSentences = sentenceList.filter((s) => s.split(/\s+/).length > 45)
  if (longSentences.length > 0) penalize(4, '低', `${longSentences.length} 个句子超过 45 词：拆句，读者工作记忆有限。`)

  const passive = count(/\b(?:was|were|is|are|been|be)\s+\w+(?:ed|en)\b/i, raw)
  if (passive > sentenceList.length && key !== 'methods') {
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
  parts.push(`# 自检报告 · ${key}（${band}，${score}/100）`)
  parts.push('')
  parts.push(`篇幅：${isCjk ? `${raw.replace(/\s/g, '').length} 字` : `${words} 词`} / ${sentenceList.length} 句`)
  parts.push('')
  if (compare) parts.push(consistencyReport(raw, String(compare)))
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

  const fixes = PHRASES.entries.filter((entry) => entry.section === key).slice(0, 2)
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
  'For a multi-step research task ("这个选题值不值得做", "怎么设计消融", "帮我评审", "精读这篇论文并出 pdf"), call `qingjin_flow` first: action=start returns the fixed step list, action=route maps a bare task (选题/评审/投稿) to a research stage for that kind of task and names only the next tool to call. Advance with action=advance after each step; do not run tools that are not on the current step, and do not re-run completed steps.',
  'for two-way translation (中文稿→英文 or English→中文), call `qingjin_translate` with direction and section, then `qingjin_check(section=translation)` on the result; it gives patterns and pitfalls, not a finished translation.',
  'Sentence templates are scaffolding only: rewrite them with your own data before submission, then run `qingjin_humanize` as the final pass.',
  'call `qingjin_outline` for the section skeleton, `qingjin_lookup(scope=phrase)` for English templates, `qingjin_lookup(scope=glossary)` for the canonical Chinese term and the mistake people make, and `qingjin_check` to diagnose a paragraph (section=translation reviews a Chinese translation).',
  'When the user wants something to fill in rather than an outline — a draft template or a LaTeX manuscript — call `qingjin_template` with format=md or format=tex.',
  'When the user asks for a deep read (中文精读/精读文章) of a downloaded paper, call `qingjin_pdf_read` first, then write a complete article — not an outline.',
  'Save the article as `精读-<短标题>.md` in the SAME folder as the source PDF, then try `qingjin_export` so a `.pdf` with the same name lands beside it. If no export engine is available (no pandoc / no engine), keep the .md, tell the user exactly which dependency is missing and how to install it — never claim a PDF exists.',
  'If the user gave a path such as C:\\…\\原文\\XXX.pdf, derive the folder from it; never scatter outputs into the workspace when a source folder exists.',
  'Use a Markdown bullet list for the metadata block (title/authors/venue), not a blockquote, so the PDF keeps one item per line.',
  'The article must be 1500–3000 Chinese characters and contain, in order: 一句话结论 / 研究问题与动机 / 方法拆解（3–5 个关键设计，每条配一句原文英文短引并给中译）/ 实验与数据 / 主要结果（用表格列数字与对照）/ 贡献 / 局限 / 与同方向工作的位置（可调用 `qingjin_related` 补充 2–3 篇对照）/ 可复用的写作句式（3–5 条）/ 术语表（中英对照）。',
  'Only quote numbers and sentences that appear in the extracted text; mark any inference as 推测. If the PDF has no text layer, say so instead of guessing.',
  'When the user wants to know which other papers in the field matter — how well received the venues are, where to download them — call `qingjin_related` with the paper title, DOI or direction: it reports venue tiers and open-access links, and separates preprints from peer-reviewed venues.',
  'State that tiers come from the plugin\'s built-in CCF-style table, so an unlisted venue means "not in the table", not "low quality".',
  'For a .tex deliverable: generate it, write it to a file in the workspace, and compile it and verify with `qingjin_export` (or report the compiler log) before calling the layout done.',
  'Generate the skeleton before drafting prose, and run the check on every paragraph the user writes.',
  'Never write the whole paper for the user: produce structure, templates, phrasing options, and diagnostics so the student does the writing.',
  'Answer in the language the user used; keep the English templates in English.',
].join(' ')

export const TOOL_NAMES = [
  'qingjin_outline', 'qingjin_template', 'qingjin_lookup', 'qingjin_translate',
  'qingjin_pdf_read', 'qingjin_related', 'qingjin_humanize',
  'qingjin_flow', 'qingjin_export', 'qingjin_check', 'qingjin_debug',
]

export const inject = ['tools', 'systemPrompt']

/** Exposed for the smoke test only; not part of the plugin's model-facing surface. */
export const __test = { tierOf, normalizeVenue, garbleRatio }

export function apply(ctx) {
  ctx.systemPrompt?.section({ name: 'bundled:qingjin', order: 1100, text: SYSTEM_PROMPT })

  ctx.tools.register(makeTool({
    name: 'qingjin_outline',
    description:
      'Get a section-by-section skeleton for a paper or a 大创 proposal: purpose, tense, word budget, structural moves (IMRaD / CARS / C-C-C), self-check list, and starter sentences. ' +
      'Use it before drafting any prose. Kinds: research (full IMRaD), proposal (大创申报书), or one section id (abstract, introduction, methods, results, discussion, conclusion).',
    parameters: {
      kind: { type: 'string', required: true, description: 'research | proposal | title | a section id' },
      topic: { type: 'string', description: 'working title' },
      words: { type: 'number', description: 'target words (default 5000)' },
      cluster: { type: 'string', description: 'proposal cluster' },
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
      'Fill-in template (not an outline): paper draft or 大创 proposal, as Markdown or compilable LaTeX (ctexart for Chinese). Sections carry instructions, placeholder sentences and a checklist. After generating .tex, verify by exporting with `qingjin_export`.',
    parameters: {
      kind: { type: 'string', required: true, description: 'paper | proposal' },
      format: { type: 'string', description: 'md (default) | tex' },
      lang: { type: 'string', description: 'zh (default) | en' },
      title: { type: 'string', description: 'Paper title or project name.' },
      author: { type: 'string', description: 'Author name.' },
      affiliation: { type: 'string', description: 'Institution' },
      advisor: { type: 'string', description: 'Supervisor, proposal only.' },
      keywords: { type: 'string', description: 'Keywords' },
      date: { type: 'string', description: 'Date' },
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
    name: 'qingjin_lookup',
    description:
      'Bundled reference lookup. scope=glossary: canonical term + common mistranslation; scope=phrase: English sentence templates by section/intent; scope=rules: skeleton, typography, CVPR/ECCV/AAAI/ICML formats.',
    parameters: {
      scope: { type: 'string', required: true, description: 'glossary | phrase | rules' },
      query: { type: 'string', description: 'glossary: term; phrase: free-text match' },
      section: { type: 'string', description: 'phrase: abstract | intro | methods | results | discussion | conclusion' },
      intent: { type: 'string', description: 'phrase: gap | result | limitation | …' },
      venue: { type: 'string', description: 'rules: cvpr | eccv | aaai | icml' },
      mode: { type: 'string', description: 'rules: all | skeleton | typography | venue | patterns | sci | latex' },
      lang: { type: 'string', description: 'rules: zh | en' },
      limit: { type: 'number', description: 'entries (default 3)' },
    },
    execute(args) {
      const scope = String(args.scope ?? '').trim()
      if (scope === 'glossary') {
        return lookupGlossary({ query: args.query ? String(args.query) : '', limit: Number(args.limit) })
      }
      if (scope === 'phrase') {
        return searchPhrases({
          section: args.section ? String(args.section) : undefined,
          intent: args.intent ? String(args.intent) : undefined,
          query: args.query ? String(args.query) : undefined,
          limit: Number(args.limit),
        })
      }
      if (scope === 'rules') {
        return formatRules({
          scope: args.mode ? String(args.mode) : 'all',
          venue: args.venue ? String(args.venue) : '',
          lang: args.lang ? String(args.lang) : 'zh',
        })
      }
      return 'scope 只能是 glossary / phrase / rules。'
    },
  }))

  ctx.tools.register(makeTool({
    name: 'qingjin_translate',
    description:
      'Two-way translation coach (zh2en/en2zh). Returns the decisions to make first, sentence patterns distilled from 8 CVPR/ECCV/AAAI/ICML papers, terms to keep consistent, Chinese-English pitfalls, and a checklist. Not a finished translation; follow with qingjin_check(section=translation).',
    parameters: {
      direction: { type: 'string', description: 'zh2en | en2zh (auto-detected from the text when omitted)' },
      domain: { type: 'string', description: 'bio | chem | math | physics — use that field\'s sentence patterns instead of the CV defaults' },
      section: { type: 'string', description: 'abstract | intro | methods | results | discussion | conclusion' },
      text: { type: 'string', description: 'The paragraph to work on. Omit to get the generic patterns for that section.' },
    },
    execute(args) {
      return translateReport({
        data: TRANSLATE,
        terms: TRANSLATE.terms,
        direction: args.direction ? String(args.direction).trim() : '',
        section: args.section ? String(args.section) : '',
        domain: args.domain ? String(args.domain).trim() : '',
        text: args.text,
      })
    },
  }))

  ctx.tools.register(makeTool({
    name: 'qingjin_pdf_read',
    description:
      'Read a local PDF and return extracted text with page/char limits. Scanned PDFs without a text layer are reported and no OCR is attempted. Paginate with offset/maxChars; long slices are trimmed to head+tail. Never invent numbers absent from the text.',
    parameters: {
      path: { type: 'string', required: true, description: 'Absolute path, or a path relative to the current working directory.' },
      offset: { type: 'number', description: 'Character offset to start from (default 0).' },
      maxChars: { type: 'number', description: 'Characters to return this call, 2000-120000 (default 8000; >12000 is trimmed to head 10k + tail 2k).' },
      page: { type: 'number', description: 'Read one page (1-based) when the extractor knows page boundaries; overrides offset.' },
      find: { type: 'string', description: 'Search a term and return up to 8 matches with page numbers and context, instead of the text slice.' },
    },
    execute(args) {
      return readPdf({ path: args.path, offset: Number(args.offset), maxChars: Number(args.maxChars), page: Number(args.page), find: args.find })
    },
  }))

  ctx.tools.register(makeTool({
    name: 'qingjin_related',
    description:
      'Online (OpenAlex) field map from one seed: title, DOI, arXiv id, or keywords. Marks venue tiers (A/B) from the built-in CCF-style table, labels preprints, returns OA links. Network only for the query; OPENALEX_API_KEY raises quota.',
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
      'Diagnose "AI-flavoured" prose: defensive preambles (为了严谨起见/It is worth noting), empty promises, process narration, 首先/其次/最后 enumeration, vague 显著优于 claims. Names the pattern, why it hurts, and the rewrite direction, plus what must stay (negative results, uncertainty, citations). Rewritten from CCFA-Skills (MIT).',
    parameters: {
      text: { type: 'string', required: true, description: 'The paragraph (Chinese or English) to diagnose.' },
    },
    execute(args) {
      return humanize(args.text)
    },
  }))


  ctx.tools.register(makeTool({
    name: 'qingjin_flow',
    description:
      'Multi-step workflow: start(flow) returns the steps and the ONE next tool; advance marks a step done; status shows progress; route maps a task to 18 research stages (mode=review/venues). State persists across turns. Prefer it for pipelines, not one-off lookups.',
    parameters: {
      action: { type: 'string', required: true, description: 'start | advance | status | route' },
      flow: { type: 'string', description: 'deepread | write-section | submit-check' },
      flowId: { type: 'string', description: 'id returned by start' },
      note: { type: 'string', description: 'step result or artifact path' },
      engineAvailable: { type: 'boolean', description: 'PDF engine available? false skips export' },
      task: { type: 'string', description: 'task text (action=route)' },
      mode: { type: 'string', description: 'route | review | artifacts | venues | all' },
    },
    execute(args) {
      const action = String(args.action ?? '').trim()
      if (action === 'start') return startFlow(String(args.flow ?? '').trim(), args.engineAvailable === undefined ? {} : { engine: args.engineAvailable })
      if (action === 'advance') return advanceFlow(String(args.flowId ?? '').trim(), String(args.note ?? ''), args.engineAvailable === undefined ? {} : { engine: args.engineAvailable })
      if (action === 'status') return flowStatus(args.flowId ? String(args.flowId).trim() : undefined)
      if (action === 'route') return workflowReport({ task: args.task, mode: args.mode ? String(args.mode) : 'route' })
      return 'action 只能是 start / advance / status / route。'
    },
  }))

  ctx.tools.register(makeTool({
    name: 'qingjin_export',
    description:
      'Export Markdown to a PDF beside the .md. Engine chain: xelatex → typst → Word → WPS → Edge/Chrome; without pandoc it uses a built-in Markdown→LaTeX converter. Reports which engine ran; when none works it lists failures instead of pretending.',
    parameters: {
      md: { type: 'string', required: true, description: 'Path to the finished .md file.' },
      outDir: { type: 'string', description: 'Output folder; defaults to the folder of the .md file.' },
      engine: { type: 'string', description: 'auto (default) | xelatex | typst | word | wps | edge — force one engine instead of the fallback chain.' },
    },
    execute(args) {
      return exportPdf({ md: args.md, outDir: args.outDir, engine: args.engine })
    },
  }))



  ctx.tools.register(makeTool({
    name: 'qingjin_debug',
    description:
      'Structured debugging and experiment-design helper: a prioritized checklist for repro / OOM / NaN problems plus an experiment-matrix template that enforces one-variable-at-a-time and keeps negative results as ablation material. Does not modify code.',
    parameters: {
      issue: { type: 'string', description: '报错摘要或问题类型，如 OOM / NaN / 无法复现' },
      metric: { type: 'string', description: '主评价指标，如 mAP / Rank-1 / 准确率' },
      scope: { type: 'string', description: '本次要试的变量，如 batch size / backbone' },
    },
    execute(args) {
      return debugReport({ issue: args.issue, metric: args.metric, scope: args.scope })
    },
  }))

  ctx.tools.register(makeTool({
    name: 'qingjin_check',
    description:
      'Diagnose one paragraph for its section: length, tense, missing structural elements (CARS / abstract elements / numbers / limitations), overclaiming, vague words, long sentences, undefined abbreviations, C-C-C first/last sentence. section=translation reviews a Chinese translation (numbers, untranslated runs, terms, 的/被 density, CJK-Latin spacing). Returns a scored report with fixes.',
    parameters: {
      section: { type: 'string', required: true, description: 'abstract | introduction | methods | results | discussion | conclusion | translation' },
      text: { type: 'string', required: true, description: 'The paragraph (or section draft) to check.' },
      compare: { type: 'string', description: 'Optional second text (source or counterpart) to cross-check numbers, terms and length ratio.' },
    },
    execute(args) {
      return checkSection(String(args.section), String(args.text ?? ''), args.compare ? String(args.compare) : '')
    },
  }))
}
