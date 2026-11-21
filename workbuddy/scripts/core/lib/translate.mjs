/**
 * 中英互译报告：不替用户整段翻译，而是给出「先定什么、套哪句、术语怎么选、别怎么写」。
 *
 * 依据来自 data/translate.json：句法结构从 8 篇 CVPR/ECCV/AAAI/ICML 论文归纳，
 * 误例是真实的中式表达与英文直译。
 */

const SECTION_TO_EXEMPLAR = {
  abstract: ['purpose', 'result'],
  intro: ['background', 'gap', 'purpose'],
  introduction: ['background', 'gap', 'purpose'],
  methods: ['method'],
  results: ['result'],
  discussion: ['result', 'conclusion'],
  conclusion: ['conclusion'],
}

const SECTION_LABEL = {
  abstract: '摘要', intro: '引言', introduction: '引言', methods: '方法', results: '结果',
  discussion: '讨论', conclusion: '结论', '': '未指定章节',
}

function detectDirection(text) {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length
  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  if (cjk === 0 && latin === 0) return null
  return cjk / (cjk + latin) > 0.25 ? 'zh2en' : 'en2zh'
}

function stats(text) {
  const sentences = text.split(/(?<=[.!?。！？])\s*/).filter((s) => s.trim().length > 0)
  const numbers = text.match(/\d+(?:\.\d+)?%?/g) ?? []
  const abbreviations = [...new Set(text.match(/\b[A-Z]{2,}\b/g) ?? [])]
  return { sentences: sentences.length, numbers, abbreviations }
}

function matchTerms(list, text, direction) {
  const lower = text.toLowerCase()
  return list.filter((term) => direction === 'zh2en'
    ? text.includes(term.zh)
    : lower.includes(term.en.toLowerCase()))
}

export function translateReport({ data, terms, direction, section, text, domain }) {
  const raw = String(text ?? '').trim()
  const invalidDirection = Boolean(direction) && !['zh2en', 'en2zh'].includes(direction)
  const dir = ['zh2en', 'en2zh'].includes(direction)
    ? direction
    : (raw ? detectDirection(raw) : 'zh2en')
  if (!dir) return '没有可分析的内容：请给出要翻译的段落，或指定 direction=zh2en / en2zh。'

  const domainKey = String(domain ?? '').trim().toLowerCase()
  const sectionKey = String(section ?? '').trim().toLowerCase()
  // 未指定章节时不要只给背景句：从每个章节各取一条，覆盖更全。
  const domainExemplars = domainKey && data.crossDomain?.[domainKey] ? data.crossDomain[domainKey] : null
  const mappedKeys = SECTION_TO_EXEMPLAR[sectionKey]
  const unknownSection = Boolean(sectionKey) && !domainExemplars && !mappedKeys
  const exemplars = domainExemplars
    ? domainExemplars
    : mappedKeys
      ? mappedKeys.flatMap((key) => data.exemplars[key] ?? [])
      : Object.values(data.exemplars).map((list) => list[0])

  const lines = []
  const label = SECTION_LABEL[sectionKey] ?? sectionKey ?? '未指定章节'
  if (invalidDirection) lines.push(`> ⚠ direction 只能是 zh2en / en2zh，已按文本语言自动判断为 ${dir}。`, '')

  if (raw) {
    const s = stats(raw)
    lines.push(`## ${dir === 'zh2en' ? '中→英' : '英→中'} · ${label}${domainKey ? ` · 领域 ${domainKey}` : ''}`)
    if (unknownSection) lines.push(`> ⚠ 未收录章节 ${sectionKey}，以下用通用句式。`)
    lines.push(`识别：${dir === 'zh2en' ? `中文 ${s.sentences} 句` : `英文 ${s.sentences} 句`}；数字 ${s.numbers.length} 处；缩写 ${s.abbreviations.length ? s.abbreviations.join('/') : '无'}。`)
    const hits = matchTerms(terms, raw, dir)
    if (hits.length > 0) {
      lines.push('命中术语：' + hits.map((term) => (dir === 'zh2en' ? `${term.zh} → ${term.en}` : `${term.en} → ${term.zh}`)).join('；'))
    }
    if (dir === 'zh2en' && s.numbers.length > 0) {
      lines.push(`- 数字（${s.numbers.slice(0, 5).join(' ')}）必须落到英文句子里，不能删。`)
    }
    lines.push('')
  } else {
    lines.push(`## ${dir === 'zh2en' ? '中→英' : '英→中'} · ${label}`)
    lines.push('（没给正文，下面是该章节的通用句式与检查清单。）', '')
  }

  lines.push(`### 先定这三件事（${dir === 'zh2en' ? '中译英' : '英译中'}）`)
  const principles = data.principles[dir].slice(0, 3)
  principles.forEach((item, index) => lines.push(`${index + 1}. ${item}`))
  lines.push('')

  lines.push(`### 可套用的句式（${domainExemplars ? `取自 ${domainKey} 论文语料` : '结构取自 8 篇 CVPR/ECCV/AAAI/ICML'}）`)
  for (const item of exemplars.slice(0, 4)) {
    const note = item.note ?? item.src ?? ''
    if (dir === 'zh2en') lines.push(`- ${item.en}\n  ← ${item.zh}${note ? `（${note}）` : ''}`)
    else lines.push(`- ${item.zh}\n  ← ${item.en}${note ? `（${note}）` : ''}`)
  }
  lines.push('')

  lines.push('### 别这样写（实测误例）')
  for (const item of data.pitfalls[dir].slice(0, 3)) {
    lines.push(`- 原文：${item.bad}\n  · 为什么不行：${item.why}\n  · 改成：${item.fix}`)
  }
  lines.push('')

  lines.push('### 术语对照（同一术语全文只用一个译名）')
  for (const term of terms.slice(0, 6)) {
    lines.push(`- ${term.zh} → ${term.en}${term.note ? `（${term.note}）` : ''}`)
  }
  lines.push('')

  lines.push('### 交付前检查')
  if (dir === 'zh2en') {
    lines.push('- [ ] 每句都有明确主语（we / this paper / the method）')
    lines.push('- [ ] 数字与指标原样保留，没有写成 "good performance"')
    lines.push('- [ ] 时态：本文工作现在时，实验结果过去时')
    lines.push('- [ ] 没有 "with the development of" 这类公式化开头')
  } else {
    lines.push('- [ ] 长句已拆，逻辑连接词保留（然而 / 因此 / 具体来说）')
    lines.push('- [ ] 首次出现的术语给了英文原词')
    lines.push('- [ ] 被动句已转主动，没有「被使用」')
    lines.push('- [ ] 数字、mAP、Rank-1 保持原样')
  }
  lines.push('')
  lines.push('> 本工具只给句式与判据，不替你整段成文；改写后可用 qingjin_check(section=translation) 校核。')
  return lines.join('\n')
}
