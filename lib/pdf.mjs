/**
 * A small, dependency-free PDF text extractor.
 *
 * It is deliberately conservative: it inflates every FlateDecode stream, keeps
 * the ones that look like page content (BT / Tj / TJ operators), and turns the
 * string operands into text. It does not resolve font encodings, so a subset
 * Type1 font with a custom /Differences table can yield odd glyphs — good enough
 * for "read this paper and summarise it", not for faithful quotation.
 */

import { inflateSync } from 'node:zlib'
import { readFileSync } from 'node:fs'

const TEXT_OPERATORS = /(?:\bTj\b|\bTJ\b|\bTd\b|\bTD\b|\bT\*\b|\bET\b)/

/** Decode a PDF literal string body (without the enclosing parentheses). */
function unescapeLiteral(body) {
  let out = ''
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]
    if (ch !== '\\') { out += ch; continue }
    const next = body[i + 1]
    if (next === undefined) break
    if (next === 'n') { out += '\n'; i += 1 }
    else if (next === 'r') { out += '\r'; i += 1 }
    else if (next === 't') { out += '\t'; i += 1 }
    else if (next === 'b' || next === 'f') { i += 1 }
    else if (next === '(' || next === ')' || next === '\\') { out += next; i += 1 }
    else if (/[0-7]/.test(next)) {
      let octal = ''
      let j = i + 1
      while (j < body.length && octal.length < 3 && /[0-7]/.test(body[j])) { octal += body[j]; j += 1 }
      out += String.fromCharCode(parseInt(octal, 8))
      i = j - 1
    } else { out += next; i += 1 }
  }
  return out
}

/** Decode a PDF hex string body. */
function unescapeHex(body) {
  const clean = body.replace(/\s+/g, '')
  let out = ''
  for (let i = 0; i + 1 < clean.length; i += 2) {
    out += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16))
  }
  return out
}

/**
 * Turn one decoded content stream into readable lines.
 *
 * Words in a LaTeX PDF are positioned, not separated by space characters, so the
 * parser tracks TJ kerning offsets and Td displacements: a large negative TJ
 * number or a positive horizontal Td is a word gap, a vertical Td is a new line.
 * @param {string} content - latin1 view of the decoded stream.
 * @returns {string[]}
 */
function contentToLines(content) {
  const lines = []
  let current = ''

  const flush = () => {
    const text = current.replace(/\s+/g, ' ').trim()
    if (text.length > 0) lines.push(text)
    current = ''
  }
  const space = () => {
    if (current.length > 0 && !current.endsWith(' ')) current += ' '
  }

  let i = 0
  const numbers = []
  while (i < content.length) {
    const ch = content[i]

    if (ch === '(') {
      let depth = 1
      let body = ''
      let j = i + 1
      for (; j < content.length; j += 1) {
        const c = content[j]
        if (c === '\\') { body += c + (content[j + 1] ?? ''); j += 1; continue }
        if (c === '(') { depth += 1; body += c; continue }
        if (c === ')') { depth -= 1; if (depth === 0) break; body += c; continue }
        body += c
      }
      current += unescapeLiteral(body)
      i = j + 1
      continue
    }

    if (ch === '<' && content[i + 1] !== '<') {
      const end = content.indexOf('>', i + 1)
      if (end > i) { current += unescapeHex(content.slice(i + 1, end)); i = end + 1; continue }
    }

    if (ch === '[') {
      // TJ array: strings and kerning numbers.
      let j = i + 1
      let pendingSpace = false
      while (j < content.length && content[j] !== ']') {
        const c = content[j]
        if (c === '(') {
          let depth = 1
          let body = ''
          let k = j + 1
          for (; k < content.length; k += 1) {
            const cc = content[k]
            if (cc === '\\') { body += cc + (content[k + 1] ?? ''); k += 1; continue }
            if (cc === '(') { depth += 1; body += cc; continue }
            if (cc === ')') { depth -= 1; if (depth === 0) break; body += cc; continue }
            body += cc
          }
          if (pendingSpace) space()
          pendingSpace = false
          current += unescapeLiteral(body)
          j = k + 1
          continue
        }
        if (c === '<' && content[j + 1] !== '<') {
          const end = content.indexOf('>', j + 1)
          if (end > j) {
            if (pendingSpace) space()
            pendingSpace = false
            current += unescapeHex(content.slice(j + 1, end))
            j = end + 1
            continue
          }
        }
        if (/[-+.\d]/.test(c)) {
          let k = j
          let token = ''
          while (k < content.length && /[-+.\d]/.test(content[k])) { token += content[k]; k += 1 }
          if (Number(token) <= -80) pendingSpace = true
          j = k
          continue
        }
        j += 1
      }
      if (pendingSpace) space()
      i = j + 1
      continue
    }

    if (/[-+.\d]/.test(ch)) {
      let j = i
      let token = ''
      while (j < content.length && /[-+.\d]/.test(content[j])) { token += content[j]; j += 1 }
      const value = Number(token)
      if (Number.isFinite(value)) numbers.push(value)
      if (numbers.length > 8) numbers.shift()
      i = j
      continue
    }

    if (/[A-Za-z*'"]/.test(ch)) {
      let j = i
      let op = ''
      while (j < content.length && /[A-Za-z*'"]/.test(content[j])) { op += content[j]; j += 1 }
      if (op === 'Td' || op === 'TD') {
        const tx = numbers[numbers.length - 2] ?? 0
        const ty = numbers[numbers.length - 1] ?? 0
        if (Math.abs(ty) > 0.5) flush()
        else if (tx > 1) space()
      } else if (op === 'T*' || op === 'ET') {
        flush()
      } else if (op === "'" || op === '"') {
        flush()
      }
      numbers.length = 0
      i = j
      continue
    }

    i += 1
  }

  flush()
  return lines
}

/**
 * Extract readable text from a PDF file.
 * @param {string} path - absolute path to the PDF.
 * @param {{ maxChars?: number, maxStreams?: number }} [options]
 * @returns {{ text: string, pages: number, streams: number, truncated: boolean }}
 */
export function extractPdfText(path, options = {}) {
  const maxChars = options.maxChars ?? 160000
  const maxStreams = options.maxStreams ?? 4000
  const buffer = readFileSync(path)
  const latin = buffer.toString('latin1')

  const lines = []
  let streams = 0
  let seen = 0
  let cursor = 0
  let truncated = false

  while (lines.join('\n').length < maxChars) {
    const at = latin.indexOf('stream', cursor)
    if (at < 0) break
    if (latin.startsWith('endstream', at)) { cursor = at + 9; continue }
    let start = at + 6
    if (latin[start] === '\r') start += 1
    if (latin[start] === '\n') start += 1
    const end = latin.indexOf('endstream', start)
    if (end < 0) break
    cursor = end + 9
    seen += 1
    if (seen > maxStreams) break

    let decoded
    try { decoded = inflateSync(buffer.subarray(start, end)) } catch { continue }
    if (decoded.length === 0) continue
    const content = decoded.toString('latin1')
    if (!/(BT|Tj|TJ)/.test(content)) continue
    streams += 1
    for (const line of contentToLines(content)) lines.push(line)
    if (lines.join('\n').length > maxChars) { truncated = true; break }
  }

  let text = lines.join('\n')
  // Drop control characters and the binary noise a mis-decoded font leaves behind.
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  text = text.replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  if (text.length > maxChars) { text = text.slice(0, maxChars); truncated = true }

  const pages = (latin.match(/\/Type\s*\/Page[^s]/g) ?? []).length
  return { text, pages, streams, truncated }
}
