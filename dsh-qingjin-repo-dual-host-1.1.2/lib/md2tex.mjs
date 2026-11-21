/**
 * 无 pandoc 时的兜底：把 Markdown 转成可编译的 ctexart 文档。
 *
 * 覆盖本插件实际产出的 Markdown 形态：标题、段落、无序/有序列表、引用、
 * 三线表、代码块、粗体/斜体/行内代码/链接/图片占位、行内与行间公式、
 * 希腊字母。复杂扩展（脚注、引用式链接、数学宏包）不在范围内，
 * 需要时仍应安装 pandoc。
 */

const LATEX_ESCAPES = {
  '\\': '\\textbackslash{}', '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#',
  '_': '\\_', '{': '\\{', '}': '\\}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}',
}

const GREEK = {
  'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta', 'ε': '\\epsilon',
  'θ': '\\theta', 'λ': '\\lambda', 'μ': '\\mu', 'ν': '\\nu', 'π': '\\pi',
  'ρ': '\\rho', 'σ': '\\sigma', 'τ': '\\tau', 'φ': '\\phi', 'ω': '\\omega',
  'Δ': '\\Delta', 'Σ': '\\Sigma',
}

const escapeLatex = (value) => String(value).replace(/[\\&%$#_{}~^]/g, (char) => LATEX_ESCAPES[char])

/** 行内 Markdown → LaTeX；`$...$` 里的内容原样保留。 */
export function texInline(text) {
  const parts = String(text).split(/(\$\$?[^$]*\$\$?)/g)
  return parts.map((part) => {
    if (/^\$/.test(part)) return part
    let out = escapeLatex(part)
    out = out.replace(/`([^`]+)`/g, '\\texttt{$1}')
    out = out.replace(/\*\*([^*]+)\*\*/g, '\\textbf{$1}')
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1\\emph{$2}')
    out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, '【图：$1】')
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    return out
  }).join('')
}

/**
 * @param {string} md - Markdown 源文。
 * @param {string} title - 文档标题。
 * @returns {string} 完整的 ctexart 源码。
 */
export function mdToLatexDocument(md, title) {
  const lines = String(md).replace(/\r/g, '').split('\n')
  const body = []
  let list = null
  let table = null
  let quote = null

  const flushList = () => {
    if (!list) return
    body.push(`\\begin{${list.type}}`)
    for (const item of list.items) body.push(`  \\item ${texInline(item)}`)
    body.push(`\\end{${list.type}}`, '')
    list = null
  }
  const flushTable = () => {
    if (!table || table.length === 0) { table = null; return }
    const cols = Math.max(...table.map((row) => row.length))
    const spec = 'l' + 'X'.repeat(Math.max(0, cols - 1))
    body.push('\\begin{table}[htbp]\\centering\\small')
    body.push(`\\begin{tabularx}{\\linewidth}{${spec}}`, '\\toprule')
    table.forEach((row, index) => {
      const cells = [...row]
      while (cells.length < cols) cells.push('')
      body.push(`${cells.map((cell) => texInline(cell)).join(' & ')} \\\\`)
      if (index === 0) body.push('\\midrule')
    })
    body.push('\\bottomrule', '\\end{tabularx}', '\\end{table}', '')
    table = null
  }
  const flushQuote = () => {
    if (!quote) return
    body.push('\\begin{quote}', ...quote.map((line) => texInline(line)), '\\end{quote}', '')
    quote = null
  }
  const flushAll = () => { flushList(); flushTable(); flushQuote() }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      flushAll()
      const code = []
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith('```')) { code.push(lines[i]); i += 1 }
      body.push('\\begin{verbatim}', ...code, '\\end{verbatim}', '')
      continue
    }

    if (trimmed === '') { flushAll(); continue }

    if (trimmed === '---' || trimmed === '***') {
      flushAll()
      body.push('\\par\\noindent\\rule{\\linewidth}{0.4pt}\\par', '')
      continue
    }

    if (/^#{1,6}\s/.test(trimmed)) {
      flushAll()
      const level = trimmed.match(/^#+/)[0].length
      const text = trimmed.replace(/^#+\s*/, '')
      const command = level === 1 ? 'section' : level === 2 ? 'subsection' : 'subsubsection'
      body.push(`\\${command}*{${texInline(text)}}`, '')
      continue
    }

    if (/^\|.*\|$/.test(trimmed)) {
      flushList(); flushQuote()
      const cells = trimmed.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim())
      if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue
      table = table ?? []
      table.push(cells)
      continue
    }

    if (/^[-*+]\s/.test(trimmed)) {
      flushTable(); flushQuote()
      if (!list || list.type !== 'itemize') { flushList(); list = { type: 'itemize', items: [] } }
      list.items.push(trimmed.replace(/^[-*+]\s+/, ''))
      continue
    }

    if (/^\d+[.)]\s/.test(trimmed)) {
      flushTable(); flushQuote()
      if (!list || list.type !== 'enumerate') { flushList(); list = { type: 'enumerate', items: [] } }
      list.items.push(trimmed.replace(/^\d+[.)]\s+/, ''))
      continue
    }

    if (trimmed.startsWith('>')) {
      flushList(); flushTable()
      quote = quote ?? []
      quote.push(trimmed.replace(/^>\s?/, ''))
      continue
    }

    flushAll()
    body.push(texInline(trimmed), '')
  }
  flushAll()

  const greekLines = Object.entries(GREEK).map(([char, command]) => `\\newunicodechar{${char}}{\\ensuremath{${command}}}`)

  // 正文若已以 H1 开头，就不再额外生成标题页，避免标题重复出现两次。
  const firstContent = lines.find((line) => line.trim() !== '') ?? ''
  const hasH1 = /^#\s/.test(firstContent.trim())

  return [
    '\\documentclass[11pt,a4paper]{ctexart}',
    '\\usepackage[margin=2.2cm]{geometry}',
    '\\usepackage{amsmath,amssymb}',
    '\\usepackage{booktabs,tabularx,array}',
    '\\usepackage{graphicx}',
    '\\usepackage[hidelinks]{hyperref}',
    '\\usepackage{newunicodechar}',
    ...greekLines,
    ...(hasH1 ? [] : [`\\title{${escapeLatex(title)}}`, '\\date{}']),
    '\\begin{document}',
    ...(hasH1 ? [] : ['\\maketitle']),
    ...body,
    '\\end{document}',
    '',
  ].join('\n')
}
