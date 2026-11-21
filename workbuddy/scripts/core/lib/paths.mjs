import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** DSH 数据目录：DSH_HOME 优先（与 flow 状态保持一致）。 */
export function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

export function qingjinDir() {
  return join(dshHome(), 'qingjin')
}

export function userGlossaryPath() {
  return join(qingjinDir(), 'user-glossary.json')
}

export function flowStatePath() {
  const override = process.env.QINGJIN_FLOW_STATE || ''
  if (override === 'off') return { persist: false, path: '' }
  if (override) return { persist: true, path: override }
  return { persist: true, path: join(qingjinDir(), 'flows.json') }
}

export function fileExists(path) {
  return path ? existsSync(path) : false
}
