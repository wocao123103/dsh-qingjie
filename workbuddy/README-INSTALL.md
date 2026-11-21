# 青衿科研 · WorkBuddy Skill 安装说明

这是双宿主合体包中的 WorkBuddy 适配层。它与同包的 DSH 插件共享同一套核心逻辑（11 个工具 + 全部数据资产）。

## 版本

| 组件 | 版本 |
|---|---|
| DSH 插件内核（`package/` 根） | 1.1.2 |
| WorkBuddy Skill（`package/workbuddy/`） | 1.1.2 |
| Skill 内嵌 core | 1.1.2（index.js 与 lib/ 与 DSH 内核逐文件一致；package.json 因宿主差异不同） |

## 安装

1. 从合体包中取出 `package/workbuddy/` 目录。
2. 复制到 WorkBuddy 技能目录：

   ```
   ~/.workbuddy/skills/qingjin-research/
   ```

3. 重启/刷新会话，让宿主发现新技能。

## 校验

```bash
node ~/.workbuddy/skills/qingjin-research/scripts/qingjin.mjs list
```

应列出 11 个 `qingjin_*` 工具。

## 打包契约（重要）

合体包的 `package.json` 中 `files[]` **已包含 `workbuddy`**。这一点经过实测：

```bash
cd package && npm pack --dry-run --json
# 输出中必须能看到 workbuddy/ 下的文件
```

如果 `files[]` 里没有 `workbuddy`，`npm pack` / `npm publish` 会静默丢弃整个适配层——只有手工 `tar` 打包才会碰巧带上。发版前务必跑一次 `npm pack --dry-run` 确认。

## 使用

技能通过自然语言触发（写论文、查术语、读 PDF、调试排查等），或在脚本层直接调用：

```bash
node scripts/qingjin.mjs lookup scope=glossary query="frame of reference"
node scripts/qingjin.mjs check section=abstract text="This study aims..."
node scripts/qingjin.mjs call qingjin_pdf_read '{"path":"/abs/paper.pdf","page":2}'
```

值含空格必须加引号；复杂参数用 `call` + JSON。

## 用户词库

自定义词条放在 `$DSH_HOME/qingjin/user-glossary.json`（默认 `~/.dsh/qingjin/user-glossary.json`），包内 `data/user-glossary.json` 只是只读 fallback。改完即生效，无需重启（按 mtime 惰性重载）。

## 已知限制

- WorkBuddy 无 DSH 右侧面板，改为自然语言路由；
- pdftotext / pandoc 等外部依赖仍需本机安装；
- DSH 宿主侧的 `dsh plugin add` 真装未在本机验证（无 DSH 宿主环境）。

## 本次合体校验（2026-11-21）

- DSH 插件 smoke：60 项，正常 PATH 与剥掉 PATH（无 pandoc / xelatex / pdftotext）各跑一遍，均 PASSED。
- WorkBuddy CLI：`list` 列出 11 个工具；`outline kind=research topic=…`、`check section=abstract text=…` 实际调用正常。
- 核心一致性：`index.js` 与 `lib/readpdf.mjs` 在包根与 `workbuddy/scripts/core/` 中 SHA256 相同；用户词表支持 mtime 惰性重载（改文件后无需重启即可生效）。

