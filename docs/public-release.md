# GitHub 公开发布与隐私规则

适用于本项目所有 GitHub 上传、源码分享、安装包和后续版本。目标仓库：`https://github.com/AngkinV/Harness--docket`。

## 公开边界

只发布插件运行与重新构建所需的源码、锁文件、构建脚本、预编译文件、插件元数据、使用说明、许可及已确认可分发的素材。逐文件白名单为 `release/public-files.json`；**新增文件默认不公开**，更新白名单前必须检查文件内容、来源和用途。

不公开开发工作区的 AGENT.md、开发需求/审查/清理记录、测试脚本与测试结果、截图、录像、日志、堆快照、浏览器目录、Harness profile/home、上传资源、会话、数据库、Cookie、令牌、密钥、环境文件、编辑器配置、node_modules、缓存，以及私人提交历史。即使文件已被 Git 跟踪或位于源码目录，也不能例外。提交作者和邮件同样公开，使用经过确认的公开身份或 GitHub noreply 邮箱。

公开版默认不包含私人 VRM/GLB、八个本地 FBX 和示例片头。保持空 `media/clips.json` 和 `motions/motions.json`，构建生成空片头数据与动作清单。基础人物和上传功能继续保留。透明角色仅分发清单中具有来源及 SHA-256 的文件，保留许可与非商用标注。不可把个人样本藏入 base64、预编译 lib、压缩包或 Git LFS 后声称已排除。

## 本地开发仓库到公开目录

开发仓库已经有私有测试记录历史，**禁止直接 git push、git push --mirror、整目录上传或导出 git bundle**。添加 .gitignore、git rm --cached、删除最新版本里的文件，都不能清除历史。也不要从开发历史 merge/cherry-pick 到公开分支。

在开发工作区执行：

```sh
node scripts/export-public.mjs <唯一run-id>
```

若另有开发正在修改源码，可明确选择已验收提交：`node scripts/export-public.mjs <唯一run-id> --source-ref <提交哈希>`。该选项只读取指定提交的源码、包清单、锁文件与 TypeScript 配置，不复制其 Git 历史；构建及发布工具使用当前规则。核对记录会标明来源提交。默认读取工作区，导出期间源文件变化即失败，不能混装两个版本。

生成 `artifacts/public-release/<run-id>/repository/` 和仅本地保存的核对记录。导出使用逐文件白名单，不复制原 `.git`，拒绝软链接、已存在的输出目录和未知文件；使用现有开发依赖重建公开 lib，不复制依赖。临时依赖链接在 finally 中移除；不会覆盖私人素材或重启日常实例。

首次发布必须在该公开目录建立新 Git 历史。先检查远端是否为空；若已有提交，读取并审查其内容，不用强推覆盖。远端已有私有记录时，先向维护者说明范围，制定历史处理或新仓库方案，不能承诺一次删除就能撤回泄露。

后续从已审查的公开仓库克隆，保留其公开历史，将本次导出清单内文件逐项同步；只删除上一次公开清单中、本次明确移除的文件。不得同步开发 `.git`，不得整目录清空未知文件。修改源码后同步重建 lib，版本变化同步 package.json 与锁文件。

正常删除曾公开的旧源码时，把已审阅的旧路径从 `files` 移至 `retiredFiles`；它只允许出现在旧提交里，不会被导出或进入当前安装包。历史内容仍接受敏感信息检查。禁止用此机制放行私人记录、用户素材或凭据。

## 发布检查

公开目录执行：

```sh
node release/check-public.mjs
node release/check-public.mjs --git
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run typecheck
git diff --exit-code -- lib
npm run check:public
```

首次提交前暂不执行 `--git`；提交后必须执行。检查覆盖公开文件白名单、敏感路径/凭据特征、二进制素材校验、包入口、禁止安装脚本、体积预算和 npm pack 实际文件。`--git` 检查可达的所有本地分支/标签的历史文件、提交信息及身份，不把当前树干净当作历史干净。自动检查是辅助，不能证明不存在任意形式的秘密；发布前仍需人工检查新增文件、文档、二进制内容与提交元数据。

只能从公开仓库向指定仓库普通 push 明确的分支，禁止 `--all`、`--mirror`、`--force`。不能从私有开发仓库直接 push。推送前的本地检查才是防泄露环节；GitHub Actions 在上传后运行，只能防后续回归，不能撤回已经上传的数据。联网/登录失败时保留已验证目录，如实标记“未上传”，不要求把令牌粘贴到聊天或文件中。

本地开发仓库的 `.githooks/pre-push` 一律拒绝直接推送；公开仓库的同名钩子检查目标地址、工作区与完整公开历史。每次新克隆公开仓库后执行 `git config core.hooksPath .githooks` 启用。不得为赶进度禁用或绕过钩子；钩子不覆盖 GitHub 网页上传，网页上传同样只能使用已审查的公开目录。

推送后用独立 Harness 实例通过 GitHub 地址安装，确认根目录 package.json、dsh.bundle.patch、客户端导出和版本，完成必要的页面验证。未完成远端安装时只能声称本地包验证通过。官方市场精选列表的收录与地址安装是两件事；本流程只提供地址安装。

## 安装契约与资源预算

仓库根目录就是 npm 插件包，必须包含预编译 lib、cordis.patch.yml、locale、LICENSE 和 NOTICE。不添加 prepare / preinstall / install / postinstall / prepack 等安装生命周期脚本；用户安装时无需编译。开发依赖仅用于维护者构建，运行库随 lib 分发。package.json 的 files 为第二层包白名单，不能用它替代 Git 仓库检查。

遵守 docs/resource-budget.md。公开目录内容不超过 50 MiB，安装包压缩不超过 40 MiB、解包不超过 50 MiB；单个媒体文件不超过 5 MiB。构建和检查串行，单文件读取，不并发复制整套依赖。每次测试独立 run-id，只清理自己生成且已结束、未占用的临时目录，保留最终交付和精简核对记录。

在开发工作区的 AGENT.md 记录导出清单、SHA-256、安装验证、资源前后值、清理结果及未完成事项；这些记录不得复制进公开仓库。只有发布说明及不含个人信息的使用文档可以公开。
