/**
 * 调试与实验设计助手：给排查清单 + 实验矩阵模板。
 * 不替用户改代码，只保证「一次只改一个变量」的纪律。
 */

const CHECKS = {
  repro: [
    '固定随机种子，并在日志里记录 seed 值',
    '锁定依赖版本（pip freeze / package-lock）',
    '确认数据划分与评测脚本和原文一致',
    '在最小子集上复现，排除“数据太大跑不动”的干扰',
    '把命令行与配置文件原样存档，别只记“跑过了”',
  ],
  oom: [
    '打印显存峰值与 batch size 的关系',
    '检查张量是否被意外保留（存进 list、挂到模块上）',
    '用梯度累积替代大批次',
    '确认混合精度（AMP）是否真的生效',
    '检查 dataloader 的 num_workers 与 pin_memory 组合',
  ],
  nan: [
    '检查学习率是否过大（先降 10 倍试）',
    '检查输入是否有 NaN/Inf（在 forward 前断言）',
    '加梯度裁剪（clip_grad_norm_）',
    '检查除零、log(0)、sqrt(负数)',
    '检查混合精度下的 loss scale 是否溢出',
  ],
  general: [
    '把报错原文与最小复现步骤写清楚',
    '判断是环境、数据还是代码问题（二分法）',
    '一次只改一个变量，记录改动前后的指标',
    '确认“没变差”不是随机波动（跑 3 个种子）',
  ],
}

const normalize = (value) => String(value ?? '').toLowerCase()

export function debugReport({ issue, metric, scope }) {
  const key = normalize(issue)
  const hit = Object.entries(CHECKS).find(([name]) => name !== 'general' && key.includes(name))
  const items = hit ? hit[1] : CHECKS.general
  const title = hit ? hit[0] : '通用'

  return [
    `# 调试排查 · ${issue || title}`,
    '',
    '## 排查顺序（每步记录结果，别跳步）',
    ...items.map((item, index) => `${index + 1}. [ ] ${item}`),
    '',
    '## 实验矩阵（先填表再跑，避免零散试）',
    '| 实验 | 变量 | 取值 | 控制项 | 主指标 | 结论 |',
    '|---|---|---|---|---|---|',
    `| baseline | — | — | 默认配置 | ${metric || '主指标'} |  |`,
    `| 对照 1 | ${scope || '待定变量'} | 取值 A | 其余不变 | ${metric || ''} |  |`,
    `| 对照 2 | ${scope || '待定变量'} | 取值 B | 其余不变 | ${metric || ''} |  |`,
    '',
    '## 记什么才算数',
    '- 每次只改一个变量；负结果也写进表格，它是消融部分的一手材料。',
    '- 至少 3 个随机种子，报告均值与波动。',
    '- 记录失败原因（OOM / NaN / 不收敛），不要只留成功的那次。',
    '',
    '> 本工具只给排查顺序与表格模板，不替你改代码。',
  ].join('\n')
}
