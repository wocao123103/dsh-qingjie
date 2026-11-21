# 安装与使用的前置条件

> 所有「本机实测」列的值来自这台机器（DSH Desktop，2026-11-20）；换机器请按同名列自查。

## A. 运行平台（必需）

| 条件 | 要求 | 本机实测 | 不满足会怎样 |
|---|---|---|---|
| DSH 版本 | ≥ 0.2.2-rc.1：需要 bundle patch 与 `dsh.client` 客户端半 | **0.2.2-rc.3** ✅ | 插件装不上，或只有工具没有面板 |
| Node 运行时 | ≥ 18（用到全局 `fetch`、`node:zlib`、`node:child_process`） | **v24.21.0**（DSH 自带） ✅ | Host 端加载即报错 |
| profile | `desktop`（Desktop App）或 `web`（`dsh web`）；插件装在 profile 里，对该 profile 全部会话生效 | `desktop` ✅ | 没有 profile 无法记录 link 依赖 |
| 右侧栏组件 | `@deepseek-ai/dsh-client-ui-sidebar-right`（`dsh-web-app` 自带） | ✅ | 面板注册不上，工具仍可用 |
| 安装权限 | `plugin_manager` 需要 **danger-full-access** 或当次批准 | 本会话 full-access ✅ | 安装请求被拒 |
| 关闭再启动 | 新增 Host 工具必须**重启 DSH** 才进工具列表 | — | 面板有、工具列表里没有 |

## B. 安装方式的前置

| 方式 | 需要什么 | 本机 | 说明 |
|---|---|---|---|
| **本地目录**（推荐） | 解压目录的**绝对路径**；目录可读；`~/.dsh/profiles/<profile>` 可写 | ✅ | 零依赖零构建，不会触发 pnpm build 脚本确认 |
| **GitHub 直装** `github:…` | 本机有 `git`，且能访问 `github.com` / `codeload.github.com` | ❌ 无 git、❌ 超时 | 两条都不满足，请用「下载 ZIP → 本地目录」 |
| **npm** | — | — | 不需要：`private: true`，不走 npm |

## C. 功能级前置（按需，不影响安装）

| 功能 | 依赖 | 本机 | 缺失时的表现 |
|---|---|---|---|
| 段落/骨架/句式/术语/规则/路由/去 AI 味/PDF 抽取 | **无** | ✅ | — |
| 高质量 PDF 抽取（自定义字体编码） | `pdftotext`（Poppler；TeX Live 自带） | ✅ TeX Live 2026 | 内置抽取器仍可用，但标题可能错位 |
| **导出 PDF**（`qingjin_export`） | `pandoc` ≥ 3 + **任一引擎**：xelatex / typst / Word / WPS / Edge；没有 pandoc 时用内置 md→LaTeX + xelatex 直连；只有浏览器时用内置 md→HTML + Edge 打印 | pandoc **3.8**；可用引擎 **xelatex、Word、Edge**（无 typst） | 按链条自动降级并在结果里写明用了哪个；全失败时列出每个引擎的失败原因与安装建议 |
| ｜引擎链细节 | **xelatex**：TeX Live + ctex；**typst**：单个二进制；**Word**：Office + COM（docx→PDF，公式为 OMML）；**Edge/Chrome**：HTML+MathJax 无头打印 | 实测三种都能出 PDF（见下） | 不会静默降级到更差的结果而不说明 |
| **同方向检索**（`qingjin_related`） | 能访问 `api.openalex.org`；可选 `OPENALEX_API_KEY` 提额度 | ✅（免 key 共享每日额度） | 返回联网失败说明；`QINGJIN_OFFLINE=1` 可主动彻底关闭 |
| 面板 UI | DSH Web GUI（桌面 App 或 `dsh web`）+ 浏览器 | ✅ | 工具照常可用，只是没有右侧面板 |

## D. 作者机器实测环境（**不是每台机器都如此**）

> 下表是作者机器的实测值。换一台机器请以你自己的检测结果为准——尤其是 `pandoc`：**没有 pandoc 时，四条导出引擎全部不可用**，`qingjin_export` 会直接报错并给出安装建议。

```powershell
# Windows 一条命令装 pandoc（装完重开终端）
winget install --id JohnMacFarlane.Pandoc -e
```


```
DSH          0.2.2-rc.3（Desktop，profile=desktop）
Node         v24.21.0（DSH 自带）
pandoc       3.8
XeTeX        TeX Live 2026（ctex 可用，中文编译已实测）
pdftotext    存在（TeX Live 自带）
git          不存在 → GitHub 直装不可用
中文字体     msyh.ttc / msyhbd.ttc / msyhl.ttc（微软雅黑）
安装形态     profile 里是 link:C:/…/dsh-qingjin
```

## D2. 导出引擎实测（同一篇精读文章）

| 引擎 | 结果 | 页数 | 质量与差异 |
|---|---|---|---|
| xelatex + ctexart | ✅ 151 KB | 5 | 数学最稳，`align` 对齐、编号、交叉引用正常 |
| Word（docx → PDF） | ✅ 406 KB | 6 | 公式为 OMML，分式/求和/矩阵接近 LaTeX；`align` 对齐点略偏，标题用 Word 默认样式 |
| Edge（HTML + MathJax） | ✅ 394 KB | 5 | 行内行间公式都正确渲染；分页靠 CSS，字体是系统 MathJax 字体 |
| typst | ⛔ 未安装 | — | 工具会明确报「指定引擎 typst 不可用，本机可用：xelatex, word, edge」 |

## E. 装完后的验证清单

1. 插件页出现 **青衿科研**（图标 + 中英文描述）；
2. 输入框右侧出现 **「论文」** 按钮；
3. 点开右侧栏，有 **青衿科研** 标签页，面板里有 15 个动作；
4. 重启 DSH 后，工具列表里能看到 `qingjin_*` 共 11 个；
5. 说一句「帮我列一篇论文骨架」→ 模型应调用 `qingjin_outline`；
6. 给一个 PDF 路径说「精读」→ 应产出同目录的 `.md` 与 `.pdf`。

任何一步不满足，按 A–C 表逐项对照；工具级报错都会明确说缺什么，不会静默失败。

## F. 隐私与联网边界

- 9 项功能纯本地；**只有** `qingjin_related` 会把查询词/标题发到 OpenAlex；
- `QINGJIN_OFFLINE=1` → 该工具直接返回「离线模式」，其余 10 个照常；
- 本插件不读取浏览器凭据、不写全局配置，改动只在当前 profile。
