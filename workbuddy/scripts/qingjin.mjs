#!/usr/bin/env node
/**
 * 青衿科研 · WorkBuddy CLI 适配层
 *
 * 把 DSH 插件的 11 个工具（原本通过 ctx.tools.register 注册给宿主）适配成命令行，
 * 让 WorkBuddy 这类「Skill + 脚本」范式的宿主也能调用同一套核心逻辑。
 *
 * 核心逻辑零改动：直接 import core/index.js，用假的 ctx 捕获工具后转发参数。
 *
 * 用法：
 *   node qingjin.mjs list
 *   node qingjin.mjs call <tool> '<json-args>'
 *   node qingjin.mjs <tool> k=v [k=v ...]        # 简写
 *   node qingjin.mjs help
 *
 * 示例：
 *   node qingjin.mjs lookup scope=glossary query="frame of reference"
 *   node qingjin.mjs check section=abstract text="This study aims..."
 *   node qingjin.mjs call qingjin_pdf_read '{"path":"/abs/paper.pdf","page":2}'
 */

import { apply, TOOL_NAMES } from './core/index.js'

// 捕获 DSH 工具：伪造 apply() 需要的 ctx 形态
const captured = new Map()
let systemPromptText = ''
apply({
  systemPrompt: { section(p) { systemPromptText += (p?.text ?? '') + '\n' } },
  tools: { register(t) { captured.set(t.name, t) } },
})

// 短名 → 全名（去掉 qingjin_ 前缀）
const shortNames = new Map(TOOL_NAMES.map((n) => [n.replace(/^qingjin_/, ''), n]))

const HELP = `青衿科研 · WorkBuddy CLI

用法:
  node qingjin.mjs list                          列出所有工具
  node qingjin.mjs call <tool> '<json>'           用 JSON 参数调用
  node qingjin.mjs <short-name> k=v [k=v ...]     简写调用（值含空格请加引号）

可用工具 (${TOOL_NAMES.length}):
${TOOL_NAMES.map((n) => '  ' + n.replace(/^qingjin_/, '').padEnd(14) + describe(n)).join('\n')}

环境变量:
  DSH_HOME              状态文件目录（默认 ~/.dsh）
  QINGJIN_OFFLINE=1     关闭联网检索
  QINGJIN_FLOW_STATE    流程状态文件；设为 off 则不留状态

说明:
  输出即工具原文，未做二次加工；复杂参数建议用 call + JSON。
  改用户词库（$DSH_HOME/qingjin/user-glossary.json）后需重启宿主才生效。
`

function describe(name) {
  const t = captured.get(name)
  return t ? String(t.description ?? '').split('.')[0].slice(0, 52) : ''
}

function parseKv(pairs) {
  const args = {}
  for (const pair of pairs) {
    const eq = pair.indexOf('=')
    if (eq < 0) throw new Error(`参数需写成 k=v 形式: ${pair}（值含空格请加引号，如 query="frame of reference"）`)
    const key = pair.slice(0, eq)
    if (!key) throw new Error(`参数名不能为空: ${pair}`)
    const raw = pair.slice(eq + 1)
    // 尝试解析成 JSON（数字/布尔/数组/对象），失败则当字符串
    try { args[key] = JSON.parse(raw) } catch { args[key] = raw }
  }
  return args
}

async function main() {
  const argv = process.argv.slice(2)
  const cmd = argv[0]

  if (!cmd || cmd === 'help' || cmd === '-h' || cmd === '--help') {
    process.stdout.write(HELP)
    return
  }
  if (cmd === 'list') {
    process.stdout.write(TOOL_NAMES.join('\n') + '\n')
    return
  }
  if (cmd === 'system-prompt') {
    process.stdout.write(systemPromptText)
    return
  }

  let toolName, args
  if (cmd === 'call') {
    toolName = argv[1]
    if (!toolName) throw new Error('call 需要工具名')
    if (!TOOL_NAMES.includes(toolName)) toolName = shortNames.get(toolName) ?? toolName
    args = argv[2] ? JSON.parse(argv[2]) : {}
  } else {
    toolName = shortNames.get(cmd) ?? (TOOL_NAMES.includes(cmd) ? cmd : null)
    if (!toolName) throw new Error(`未知工具: ${cmd}（用 list 查看可用工具）`)
    args = parseKv(argv.slice(1))
  }

  const tool = captured.get(toolName)
  if (!tool) throw new Error(`工具未注册: ${toolName}`)

  const result = await tool.execute(args)
  process.stdout.write(String(result ?? '') + '\n')
}

main().catch((err) => {
  process.stderr.write(`[qingjin] ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
