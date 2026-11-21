/**
 * 小型 agent 流程：把多步任务固化成可推进的状态机。
 *
 * 设计目标：
 * - 每次只暴露“下一步该做什么 + 该调哪个工具”，避免一次性把 11 个工具都调一遍；
 * - 步骤带 gate（前置条件），不满足就明确跳过并说明原因，而不是硬跑失败；
 * - 状态落盘，跨轮次可续；输出保持短小（几百 tokens），不把流程本身变成上下文负担。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { flowStatePath, qingjinDir } from './paths.mjs'

const STATE_ENV = process.env.QINGJIN_FLOW_STATE || ''
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const STORE_DIR = STATE_ENV && STATE_ENV !== 'off' ? dirname(STATE_ENV) : join(DSH_HOME, 'qingjin')
let memoryStore = {}
const STORE_FILE = STATE_ENV && STATE_ENV !== 'off' ? STATE_ENV : join(STORE_DIR, 'flows.json')
const PERSIST = STATE_ENV !== 'off'

export const FLOWS = {
  deepread: {
    title: '精读一篇论文并产出 md + pdf',
    steps: [
      { id: 'extract', title: '抽正文', tool: 'qingjin_pdf_read', hint: 'maxChars 先给 6000–8000；无文字层就直接报告，不做 OCR。' },
      { id: 'related', title: '查同方向对照', tool: 'qingjin_related', optional: true, hint: 'limit=4；新论文邻域稀疏时如实说明。' },
      { id: 'draft', title: '写十节精读文章', tool: null, hint: '1500–3000 中文字；数字与引句只取自抽取文本，推断标「推测」。' },
      { id: 'selfcheck', title: '自检摘要段', tool: 'qingjin_check', hint: 'section=abstract，确认篇幅与要素齐全。' },
      { id: 'export', title: '导出同名 PDF', tool: 'qingjin_export', optional: true, gate: 'engine', hint: '无引擎时只交 .md 并说明缺什么。' },
    ],
  },
  'write-section': {
    title: '写一节正文（引言/方法/结果等）',
    steps: [
      { id: 'skeleton', title: '取该节骨架', tool: 'qingjin_outline', hint: 'kind 用单节 id，拿到结构动作与自查清单。' },
      { id: 'phrase', title: '取对应句式', tool: 'qingjin_lookup', hint: 'scope=phrase，配 section + intent（gap/result/limitation…）。' },
      { id: 'draft', title: '学生自己写', tool: null, hint: '不给成稿，只给结构与句式选项。' },
      { id: 'check', title: '段落自检', tool: 'qingjin_check', hint: '按该节标准打分，只改被点出的问题。' },
      { id: 'humanize', title: '去 AI 味（可选）', tool: 'qingjin_humanize', optional: true, hint: '命中模板句时再改，别为改而改。' },
    ],
  },
  'submit-check': {
    title: '投稿前检查（格式 + 段落 + 导出）',
    steps: [
      { id: 'venue', title: '确认目标会议格式', tool: 'qingjin_lookup', hint: 'scope=rules, mode=venue，先定题注/参考文献/页数口径。' },
      { id: 'sections', title: '逐节自检', tool: 'qingjin_check', hint: 'abstract → introduction → results → conclusion 各跑一次。' },
      { id: 'humanize', title: '去 AI 味', tool: 'qingjin_humanize', hint: '只改被点出的句子。' },
      { id: 'export', title: '导出门面 PDF', tool: 'qingjin_export', optional: true, gate: 'engine', hint: '没有引擎就说明缺哪个。' },
    ],
  },
}

function readStore() {
  if (!PERSIST) return memoryStore
  try {
    if (!existsSync(STORE_FILE)) return {}
    const parsed = JSON.parse(readFileSync(STORE_FILE, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStore(store) {
  memoryStore = store
  if (!PERSIST) return
  try {
    if (!existsSync(STORE_DIR)) mkdirSync(STORE_DIR, { recursive: true })
    // 只保留最近 20 条，避免无限增长
    const entries = Object.entries(store).sort((a, b) => (b[1].updatedAt ?? 0) - (a[1].updatedAt ?? 0)).slice(0, 20)
    writeFileSync(STORE_FILE, JSON.stringify(Object.fromEntries(entries), null, 2), 'utf8')
  } catch {
    // 写不进去不影响主流程，只是不能跨轮续
  }
}

const stepLine = (index, step) => `${index + 1}. [${step.id}] ${step.title}${step.tool ? ` → ${step.tool}` : ' → 直接写'}${step.optional ? '（可选）' : ''}`

function planOf(flow) {
  return [
    `### ${flow.title}`,
    ...flow.steps.map((step, index) => stepLine(index, step)),
  ]
}

export function startFlow(flowId, gate = {}) {
  const flow = FLOWS[flowId]
  if (!flow) return `未知流程：${flowId}。可选：${Object.keys(FLOWS).join(', ')}`
  const id = `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const store = readStore()
  store[id] = { flow: flowId, step: 0, done: [], updatedAt: Date.now(), gate }
  writeStore(store)
  const first = flow.steps[0]
  return [
    `已启动流程 ${id}，共 ${flow.steps.length} 步。`,
    '',
    ...planOf(flow),
    '',
    `**下一步**：${first.title}`,
    first.tool ? `调用 \`${first.tool}\`。${first.hint ?? ''}` : first.hint ?? '',
    '',
    `完成后用 qingjin_flow(action="advance", flowId="${id}") 推进。`,
  ].join('\n')
}

export function advanceFlow(id, note = '', gate = {}) {
  const store = readStore()
  const state = store[id]
  if (!state) return id ? `找不到流程 ${id}；用 qingjin_flow(action="start", flow=…) 新建。` : 'advance 需要 flowId：先 start 拿到 id，再带 flowId 推进。'
  const flow = FLOWS[state.flow]
  if (!flow) return `流程 ${id} 的类型 ${state.flow} 已不存在。`

  const current = flow.steps[state.step]
  if (current) state.done.push({ id: current.id, note: note || undefined })
  state.step += 1
  state.updatedAt = Date.now()
  state.gate = { ...(state.gate ?? {}), ...gate }
  writeStore(store)

  if (state.step >= flow.steps.length) {
    return [
      `✓ 流程 ${id} 已完成（${flow.steps.length} 步）。`,
      `完成记录：${state.done.map((item) => item.id).join(' → ')}`,
      '如需留档，把产物路径与结论写进最终回复；不要重复跑已完成的步骤。',
    ].join('\n')
  }

  const next = flow.steps[state.step]
  if (next.gate === 'engine' && state.gate?.engine === false) {
    return skipFlowStep(id, '本机没有可用的 PDF 引擎，跳过导出，只交付 .md 并说明原因。')
  }
  return [
    `✓ 已完成 ${state.step}/${flow.steps.length}：${current?.id ?? '-'}`,
    '',
    `**下一步**：${next.title}${next.optional ? '（可选）' : ''}`,
    next.tool ? `调用 \`${next.tool}\`。${next.hint ?? ''}` : next.hint ?? '',
  ].join('\n')
}

export function skipFlowStep(id, reason) {
  const store = readStore()
  const state = store[id]
  if (!state) return `找不到流程 ${id}。`
  const flow = FLOWS[state.flow]
  const skipped = flow.steps[state.step]
  state.step += 1
  state.updatedAt = Date.now()
  writeStore(store)
  if (state.step >= flow.steps.length) return `✓ 流程 ${id} 完成（跳过 ${skipped?.id}：${reason}）。`
  const next = flow.steps[state.step]
  return [
    `- 跳过 ${skipped?.id}：${reason}`,
    `**下一步**：${next.title}${next.optional ? '（可选）' : ''}`,
    next.tool ? `调用 \`${next.tool}\`。${next.hint ?? ''}` : next.hint ?? '',
  ].join('\n')
}

export function flowStatus(id) {
  const store = readStore()
  if (id) {
    const state = store[id]
    if (!state) return `找不到流程 ${id}。`
    const flow = FLOWS[state.flow]
    return [
      `流程 ${id}（${flow.title}）`,
      `进度：${state.step}/${flow.steps.length}`,
      `已完成：${state.done.map((item) => item.id).join(' → ') || '（无）'}`,
      `当前：${flow.steps[state.step] ? flow.steps[state.step].title : '已结束'}`,
    ].join('\n')
  }
  const entries = Object.entries(store).sort((a, b) => (b[1].updatedAt ?? 0) - (a[1].updatedAt ?? 0))
  if (entries.length === 0) return '还没有任何流程；用 qingjin_flow(action="start", flow=deepread|write-section|submit-check) 开始。'
  return [
    '最近流程：',
    ...entries.slice(0, 5).map(([key, state]) => `- ${key}  ${FLOWS[state.flow]?.title ?? state.flow}  ${state.step}/${FLOWS[state.flow]?.steps.length ?? '?'}`),
  ].join('\n')
}
