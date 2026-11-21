/**
 * 极简 Markdown → HTML，用于「本机只有浏览器」时的 PDF 导出兜底。
 * 只覆盖模板会产出的子集：标题 / 段落 / 列表 / 引用 / 三线表 / 代码块 / 粗斜体 / 链接。
 * 公式保持源码（纯浏览器路径没有 MathJax 排版能力，导出前会在文案里说明）。
 */

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

function inline(text) {
  let out = escapeHtml(text)
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, '<em>【图：$1】</em>')
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  return out
}

export function mdToHtmlDocument(md, title = '') {
  const lines = String(md).replace(/\r/g, '').split('\n')
  const body = []
  let list = null
  let table = null
  let quote = null
  let para = []

  const flushList = () => {
    if (!list) return
    body.push(`<${list.type}>`, ...list.items.map((item) => `<li>${inline(item)}</li>`), `</${list.type}>`)
    list = null
  }
  const flushTable = () => {
    if (!table || !table.length) { table = null; return }
    // 对齐行只记录每列的 align；单元格里的行内代码此时已还原成原文。
    const align = table.align ?? []
    const rows = table.map((row, index) => {
      const cells = row.map((cell, col) => {
        const attr = align[col] ? ` align="${align[col]}"` : ''
        return index === 0 ? `<th${attr}>${inline(cell)}</th>` : `<td${attr}>${inline(cell)}</td>`
      }).join('')
      return `<tr>${cells}</tr>`
    })
    body.push('<table>', ...rows, '</table>')
    table = null
  }
  const flushQuote = () => {
    if (!quote) return
    body.push('<blockquote>', ...quote.map((line) => `<p>${inline(line)}</p>`), '</blockquote>')
    quote = null
  }
  // Markdown 软换行：同一段内按 80 列折行的连续文本行合并成一个 <p>，用一个空格连接。
  const flushPara = () => {
    if (!para.length) return
    body.push(`<p>${inline(para.join(' '))}</p>`)
    para = []
  }
  const flushAll = () => { flushPara(); flushList(); flushTable(); flushQuote() }

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim()

    if (trimmed.startsWith('```')) {
      flushAll()
      const code = []
      i += 1
      while (i < lines.length && !lines[i].trim().startsWith('```')) { code.push(escapeHtml(lines[i])); i += 1 }
      body.push('<pre><code>', ...code, '</code></pre>')
      continue
    }
    if (trimmed === '') { flushAll(); continue }
    if (trimmed === '---' || trimmed === '***') { flushAll(); body.push('<hr>'); continue }

    if (/^#{1,6}\s/.test(trimmed)) {
      flushAll()
      const level = Math.min(6, trimmed.match(/^#+/)[0].length)
      body.push(`<h${level}>${inline(trimmed.replace(/^#+\s*/, ''))}</h${level}>`)
      continue
    }
    if (/^\|.*\|$/.test(trimmed)) {
      flushPara(); flushList(); flushQuote()
      // 行内代码里的 | 不是单元格分隔符：先换成正文不会出现的占位符，切完再还原。
      const stash = []
      const masked = trimmed.replace(/`[^`]+`/g, (code) => {
        stash.push(code)
        return `\u0000C${stash.length - 1}\u0000`
      })
      const cells = masked.replace(/^\||\|$/g, '').split('|')
        .map((cell) => cell.trim().replace(/\u0000C(\d+)\u0000/g, (_, n) => stash[Number(n)]))
      // 对齐行只记录列对齐方式，不输出成正文行；多行表格在此期间继续累积。
      if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) {
        table = table ?? []
        table.align = cells.map((cell) => (
          cell.startsWith(':') && cell.endsWith(':') ? 'center'
            : cell.endsWith(':') ? 'right'
              : cell.startsWith(':') ? 'left' : ''
        ))
        continue
      }
      table = table ?? []
      table.push(cells)
      continue
    }
    if (/^[-*+]\s/.test(trimmed)) {
      flushPara(); flushTable(); flushQuote()
      if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', items: [] } }
      list.items.push(trimmed.replace(/^[-*+]\s+/, ''))
      continue
    }
    if (/^\d+[.)]\s/.test(trimmed)) {
      flushPara(); flushTable(); flushQuote()
      if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', items: [] } }
      list.items.push(trimmed.replace(/^\d+[.)]\s+/, ''))
      continue
    }
    if (trimmed.startsWith('>')) {
      flushPara(); flushList(); flushTable()
      quote = quote ?? []
      quote.push(trimmed.replace(/^>\s?/, ''))
      continue
    }
    // 普通正文行：先累积，遇空行 / 标题 / 列表 / 表格 / 引用 / 代码块时再合并输出。
    para.push(trimmed)
  }
  flushAll()

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
@page { size: A4; margin: 2.2cm; }
body { font: 11pt/1.7 "Microsoft YaHei", "SimSun", serif; color: #111; }
h1,h2,h3,h4 { font-family: "Microsoft YaHei", "SimHei", sans-serif; line-height: 1.4; }
h1 { font-size: 1.55em; } h2 { font-size: 1.22em; } h3 { font-size: 1.06em; }
table { border-collapse: collapse; width: 100%; font-size: 10pt; margin: .6em 0; }
th,td { border: 1px solid #999; padding: 4px 6px; vertical-align: top; }
blockquote { margin: 8px 0; padding-left: 10px; border-left: 3px solid #bbb; color: #333; }
pre,code { font-family: Consolas, "Courier New", monospace; font-size: 9.5pt; white-space: pre-wrap; }
pre { background: #f6f6f6; padding: 8px; }
img { max-width: 100%; }
</style></head>
<body>
${body.join('\n')}
</body></html>
`
}
