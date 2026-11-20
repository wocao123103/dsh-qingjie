# 上传到 GitHub 并让别人「下载后再用」

本插件是**零依赖、零构建**的本地 bundle：仓库就是包本身，没有 `prepare`/`postinstall`，所以别人安装时不会触发任何构建脚本确认。

---

## 一、上传前先确认三件事

1. **上传的是 `dsh-qingjin/` 目录里的内容**，不是整个工作区。仓库根目录应该直接看到 `package.json`：
   ```
   package.json  cordis.patch.yml  index.js  client.js  lib/  data/  locale/  docs/  icon.svg  README.md  LICENSE
   ```
2. `package.json` 里必须有 `dsh.bundle.patch` 指向 `./cordis.patch.yml`（已有）——这是 DSH「能被识别」的唯一硬要求。
3. 仓库必须是 **Public**，否则 `github:` 安装会因为无权限失败。

`private: true` 不影响从 git 安装（它只阻止误发 npm）。

---

## 二、两条安装路径（都在 DSH 插件页里）

### 路径 A：下载后再装（推荐，不依赖 git）

1. 在 GitHub 仓库页点 **Code → Download ZIP**；
2. 解压到本地任意目录，例如 `D:\plugins\dsh-qingjin`；
3. DSH → **插件页 → 添加插件** → 输入**该目录的绝对路径**；
4. 重启 DSH 生效。

优点：不需要 `git`，也不需要安装时能访问 GitHub。

### 路径 B：直接输入仓库地址

在「添加插件」里输入：

```
# 内容在仓库根时
github:wocao123103/dsh-qingjie

# 内容还在 dsh-qingjin/ 子目录时
github:wocao123103/dsh-qingjie#path:/dsh-qingjin
```

前提：本机装了 **Git**，且安装时能访问 `github.com` / `codeload.github.com`。这台机器目前两个条件都不满足（无 git、GitHub 超时），所以路径 A 更适合。

---

## 三、上传方式（本机没有 git，用网页传）

本机 `where git` 无结果，所以走 GitHub 网页：

1. 浏览器打开 https://github.com/new
   - Repository name：`dsh-qingjin`
   - Visibility：**Public**
   - 不要勾 "Add a README"（本地已有）
2. 创建后点 **uploading an existing file**；
3. 把 `dsh-qingjin/` 里的**全部内容**拖进去（保持目录结构，`lib/`、`data/`、`locale/`、`docs/` 都要）；
4. Commit message 写 `feat: v0.9.2 首次发布`；
5. 打一个 Release（可选但推荐）：**Releases → Draft a new release** → tag `v0.9.2` → 把 `dist/wocao123103-dsh-qingjin-0.9.2.tgz` 作为附件上传。

> 如果你之后装了 Git for Windows，可以直接 `git init` + `git remote add` + push，省去逐个拖拽。

---

## 四、上传后自检清单

- [ ] 仓库根目录能直接看到 `package.json` 与 `cordis.patch.yml`
- [ ] `package.json` 的 `version` 与 Release tag 一致（0.12.1）
- [ ] `files` 列表里的目录都真的在仓库里：`index.js`、`client.js`、`data`、`lib`、`locale`、`docs`、`icon.svg`
- [ ] `.gitignore` 已排除 `node_modules/`、`*.tgz`、测试目录
- [ ] 仓库是 Public
- [ ] 仓库页的 README 能正常渲染（含安装两条路径）

---

## 五、别人装完会看到什么

- 插件页出现 **青衿科研**，输入框右侧出现「论文」按钮；
- 右侧栏「青衿科研」工作台，11 个动作；
- 9 个工具：骨架 / 模板 / 句式 / PDF 精读 / 同方向顶刊 / 导出 PDF / 规则 / 术语 / 自检；
- 除「同方向顶刊」外全部离线；`QINGJIN_OFFLINE=1` 可彻底断网。

---

## 六、更新流程（以后）

1. 改工作区里的文件；
2. 改 `package.json` 的 `version`（如 0.9.3）；
3. 网页上传改动文件（或 git push）；
4. 打新 Release，附件换成新的 tgz。

用本地目录安装的人不需要重新装——改的是同一个目录；用 `github:` 安装的人需要重新添加或等 DSH 的更新入口。
