/**
 * PDF 读取与可信度分级。
 *
 * 内置抽取器不解码字体编码：浏览器打印的 PDF（Identity-H）会把英文抽成错位字母，
 * 比例判据看不见它。因此这里做两维判定：
 *   1) 结构信号：Producer/Chromium/Skia、Encoding /Identity-H → 可疑
 *   2) 多窗口乱码率：头/中/尾各 4k 取最大值，避免被干净封面稀释
 * 输出三档：可用 / 可疑（给全文但警告）/ 不可用（只给标本与诊断）。
 */

import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { extractPdfTextSmart } from './pdf.mjs'

export const PDF_MAX_BYTES = 40 * 1024 * 1024

const windowRatio = (chunk) => {
  let odd = 0
  let letters = 0
  for (const ch of chunk) {
    const code = ch.codePointAt(0)
    const isLatin = (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)
    const isCjk = code >= 0x4e00 && code <= 0x9fff
    const isOdd = code >= 0xe000 || (code >= 0xc0 && code <= 0xff)
    if (isOdd) odd += 1
    else if (isLatin || isCjk) letters += 1
  }
  const denom = odd + letters
  return denom ? odd / denom : 0
}

/** 头/中/尾各 4k，取最大值：中文报告不会被干净封面稀释。 */
export function garbleRatio(text) {
  const s = String(text)
  if (!s.length) return 0
  const mid = s.length >> 1
  const windows = [s.slice(0, 4000), s.slice(mid, mid + 4000), s.slice(-4000)]
  return Math.max(...windows.map(windowRatio))
}

function readHead(path, bytes) {
  const fd = openSync(path, 'r')
  try {
    const buf = Buffer.alloc(bytes)
    const read = readSync(fd, buf, 0, bytes, 0)
    return buf.subarray(0, read).toString('latin1')
  } finally {
    closeSync(fd)
  }
}

/**
 * @param {{path:string, offset?:number, maxChars?:number, page?:number, find?:string}} args
 * @returns {string}
 */
export function readPdfReport(args) {
  const rawPath = String(args.path ?? '').trim()
  if (!rawPath) return '请给出 PDF 的路径（绝对路径，或相对于当前工作目录的路径）。'
  const path = isAbsolute(rawPath) ? rawPath : resolve(rawPath)
  if (!existsSync(path)) return `找不到文件：${path}`
  const stat = statSync(path)
  if (!stat.isFile()) return `不是文件：${path}`
  if (stat.size > PDF_MAX_BYTES) return `文件过大（${(stat.size / 1024 / 1024).toFixed(1)} MB），上限 40 MB。`
  if (!/\.pdf$/i.test(path)) return `不是 .pdf 文件：${path}（本工具只读 PDF）`
  // 规范允许 %PDF- 出现在前 1024 字节内（前导空行 / BOM / 邮件封装）
  const head1024 = readHead(path, 1024)
  const hasMagic = head1024.indexOf('%PDF-') >= 0
  if (stat.size < 64) {
    return hasMagic
      ? `文件不完整（只有 ${stat.size} 字节，没有可解析的正文）：${path}`
      : `不是有效的 PDF（只有 ${stat.size} 字节，且没有 %PDF- 文件头）：${path}`
  }
  if (!hasMagic) {
    return `不是有效的 PDF（前 1024 字节内没有 %PDF- 文件头）：${path}。文件可能损坏，或只是扩展名为 .pdf。`
  }

  let result
  try {
    result = extractPdfTextSmart(path, { maxChars: 400000 })
  } catch (error) {
    return `解析 PDF 失败：${error instanceof Error ? error.message : String(error)}`
  }
  const text = result.text
  const ranges = result.pageRanges ?? []

  // 结构信号：浏览器打印的 PDF 即使抽出来是 ASCII 也不可信
  let suspectStructure = ''
  if (result.source !== 'pdftotext') {
    const rawHead = readHead(path, Math.min(stat.size, 65536))
    if (/\/Producer\s*\([^)]*(Skia\/PDF|Chromium)/i.test(rawHead)) suspectStructure = 'PDF 由浏览器打印（Skia/Chromium）'
    else if (/\/Creator\s*\([^)]*Chromium/i.test(rawHead)) suspectStructure = 'PDF 由浏览器打印（Chromium）'
    else if (/\/Encoding\s*\/Identity-H/.test(rawHead)) suspectStructure = 'PDF 使用 Identity-H 字体编码'
  }
  const ratio = result.source === 'pdftotext' ? 0 : garbleRatio(text)
  let tier = 'ok'
  if (result.source !== 'pdftotext') {
    if (ratio >= 0.25) tier = 'unusable'
    else if (suspectStructure || ratio >= 0.12) tier = 'suspect'
  }

  const warn = {
    unusable: `⚠ 抽取结果不可信${suspectStructure ? `（${suspectStructure}）` : ''}：异常字符占 ${Math.round(ratio * 100)}%，内置抽取器不解码字体编码。不要引用，建议装 pdftotext 或复制正文重读。`,
    suspect: `⚠ 抽取结果可疑${suspectStructure ? `（${suspectStructure}）` : ''}${ratio ? `：异常字符占 ${Math.round(ratio * 100)}%` : ''}。英文可能整体错位（如 Weld→Ð:HOG），引用前必须对照原 PDF；装 pdftotext 可根治。`,
  }

  // 判定阈值与提示文案统一用「去空白后的有效字符数」，避免出现「410 字符（不足 400）」。
  const effectiveLength = text.replace(/\s/g, '').length
  const shortText = effectiveLength < 400
  if (shortText) {
    const pages = result.pages ?? 0
    const ignored = [
      Number.isFinite(args.offset) ? 'offset' : '',
      Number.isFinite(args.page) ? 'page' : '',
      args.find ? 'find' : '',
    ].filter(Boolean)
    const ignoredNote = ignored.length ? `（短文档不支持 ${ignored.join(' / ')}，本次已忽略）` : ''
    if (pages > 0 && text.trim().length === 0) {
      return `已读取 ${path}，共 ${pages} 页，但没有文字层——这是扫描版（图片型）PDF。\n本工具不做 OCR：请改用可复制文本的版本，或先 OCR。${warn[tier] ? `\n\n${warn[tier]}` : ''}`
    }
    if (effectiveLength === 0) {
      return `已读取 ${path}，但没有抽到任何文字（有效字符 0）——文件可能损坏或为扫描版，不是「文档太短」。${warn[tier] ? `\n\n${warn[tier]}` : ''}`
    }
    return [
      `已读取 ${path}，但只抽出 ${text.length} 个字符（去空白后 ${effectiveLength}，不足 400）——可能是短文档，也可能是抽取失败。${ignoredNote}`,
      `样本：${text.slice(0, 200).replace(/\s+/g, ' ')}`,
      ...(tier !== 'ok' ? ['', warn[tier]] : []),
    ].join('\n')
  }

  if (tier === 'unusable') {
    return [
      `PDF：${path}`,
      warn.unusable,
      `抽取方式：${result.source === 'pdftotext' ? 'pdftotext' : '内置抽取器'}；共 ${text.length} 字符。`,
      '',
      '仅给出标本（不要直接引用）：',
      text.slice(0, 800).replace(/\s+/g, ' '),
      '',
      '替代路径：安装 poppler 后用 pdftotext 重试；或复制正文为 .md 再处理。',
    ].join('\n')
  }

  const pageParam = Number.isFinite(args.page) ? Math.max(1, Math.trunc(args.page)) : 0
  const pageHit = pageParam ? ranges.find((item) => item.page === pageParam) : null
  if (pageParam > 0 && ranges.length === 0) {
    return `这个 PDF 走的是内置抽取器，没有分页信息，无法按 page=${pageParam} 定位。请改用 offset/maxChars，或安装 pdftotext 后重试。`
  }
  const offset = pageHit ? pageHit.start : (Number.isFinite(args.offset) ? Math.max(0, Math.trunc(args.offset)) : 0)
  if (offset >= text.length) return `offset 超出文档长度（共 ${text.length} 字符）；请用更小的 offset 或 page=N。`
  const maxChars = pageHit ? (pageHit.end - pageHit.start) : (Number.isFinite(args.maxChars) ? Math.max(2000, Math.min(120000, Math.trunc(args.maxChars))) : 8000)

  const warnBlock = tier !== 'ok' ? [warn[tier], ''] : []

  if (args.find) {
    // 0.26.1：不可信 PDF 上的 find 只是对错位文本做字符串匹配，明确告知读者不是可靠检索。
    if (tier !== 'ok') warnBlock.push('抽取可能失败：文本不可信，本次未执行可靠检索，find 结果仅供定位参考。')
    const needle = String(args.find).toLowerCase()
    const hits = []
    let from = 0
    while (hits.length < 8) {
      const at = text.toLowerCase().indexOf(needle, from)
      if (at < 0) break
      const page = ranges.find((item) => at >= item.start && at < item.end)?.page
      const start = Math.max(0, at - 90)
      const end = Math.min(text.length, at + needle.length + 90)
      hits.push({ page, snippet: text.slice(start, end).replace(/\s+/g, ' ').trim() })
      from = at + needle.length
    }
    if (hits.length === 0) {
      if (tier !== 'ok') return [...warnBlock, `文本抽取可能失败，无法可靠检索「${args.find}」。`].join('\n')
      return `没有找到「${args.find}」；该文档共 ${text.length} 字符${ranges.length ? `、${ranges.length} 页` : ''}。`
    }
    return [
      ...warnBlock,
      `在 ${path} 中找到 ${hits.length} 处「${args.find}」：`,
      ...hits.map((hit, index) => `${index + 1}. ${hit.page ? `第 ${hit.page} 页｜` : ''}…${hit.snippet}…`),
      '',
      result.source === 'pdftotext' ? '> 页码来自 pdftotext 分页；引用前建议打开原 PDF 核对。' : '> 本机没有 pdftotext，页码是内置抽取器的近似估算；引用前请核对原 PDF。',
    ].join('\n')
  }

  const rawSlice = text.slice(offset, offset + maxChars)
  const slice = rawSlice.length > 12000
    ? `${rawSlice.slice(0, 10000)}\n\n…（中间省略 ${rawSlice.length - 12000} 字符；需要时用 offset 精确取）…\n\n${rawSlice.slice(-2000)}`
    : rawSlice
  const more = offset + maxChars < text.length
  const pageLine = (() => {
    const touched = ranges.filter((item) => item.end > offset && item.start < offset + maxChars)
    if (touched.length === 0) return ''
    const list = touched.map((item) => item.page)
    return list.length === 1 ? `本次内容对应第 ${list[0]} 页（引用时可标注页码）。` : `本次内容对应第 ${list[0]}–${list[list.length - 1]} 页（引用时可标注页码）。`
  })()

  const header = [
    `PDF：${path}`,
    ...warnBlock,
    `抽取方式：${result.source === 'pdftotext' ? 'pdftotext（字体编码可靠）' : '内置抽取器（不解码字体编码）'}。${result.pages > 0 ? `页数约 ${result.pages}，` : '页数未知（PDF 用对象流压缩），'}${result.streams ? `解码 ${result.streams} 个内容流，` : ''}共抽取 ${text.length} 字符；本次给出第 ${offset}–${offset + slice.length} 字符。`,
    pageLine,
    more ? `后面还有内容，需要时再调用一次并传 offset=${offset + maxChars}。` : (result.truncated ? `已到本次可返回的末尾——注意全文超过抽取上限（共 ${text.length} 字符），被截断了，不代表读完全文。` : '已到全文末尾。'),
    result.source === 'pdftotext' ? '引用原文短句前仍建议打开原 PDF 核对一次。' : '内置抽取器不解码字体编码，连字（fi/fl）与希腊字母可能错位；引用原文前请打开 PDF 核对。',
    '',
    '--- 正文开始 ---',
  ].filter((line, index, all) => !(line === '' && all[index - 1] === '')).join('\n')

  return `${header}\n${slice}`
}
