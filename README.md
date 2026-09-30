# Harness- docket

DeepSeek Harness 的页面人物伙伴与会话片头插件。支持可拖动人物、页面行走、VRM/GLB 模型、FBX 动作、表情贴纸、视频片库和主会话状态反馈。

## 安装

在 Harness 的插件市场 / 插件管理中选择「添加插件」，粘贴：

```text
https://github.com/AngkinV/Harness--docket
```

安装完成后按宿主提示重新加载。也可使用命令行：

```sh
dsh plugin --profile web add https://github.com/AngkinV/Harness--docket --ignore-scripts
```

仓库根目录包含插件清单与预编译 `lib/`，安装无需本地编译、安装开发依赖或执行安装脚本。要求 Node.js 20+、DeepSeek Harness 0.1.7-rc.2+。仓库地址安装不代表已经收录到官方精选列表。

从旧 `dsh-boot-animation` 升级时，在新插件安装成功后停用旧插件，避免重复挂载。

## 使用

- 默认显示基础人物「星芽」。拖动移动人物；单击互动，右键或人物旁的 `···` 打开菜单，Esc 收起。
- 「片头自动播放」控制自动片头；「片库」上传、选择、预览视频，并设置当前会话重播。单个视频上限 250 MB，推荐 H.264 MP4。删除的视频在本地保留 30 天，可从回收站恢复。
- 「角色」上传自己的 VRM/GLB 模型、FBX 动作和贴纸，先预览再应用。模型、动作各不超过 50 MB；优先支持 Mixamo 人形动作。未知骨架会提示错误。
- 可选透明动画角色「蓝毛小女仆」使用按需加载的 WebM / HEVC Alpha MOV，透明解码失败时保留原角色。
- 直接在 Harness 主输入框提问或继续任务，人物跟随当前会话状态。角色管理的「播放提示与声音」可设置可选朗读，默认关闭。

公开版本不附带开发者的模型、FBX 样本或示例片头；初次安装片库和外部动作库为空。基础人物、自带行走与互动可直接使用，其他资源由使用者自行上传。用户数据保存在自己的 Harness 数据目录中。

## 开发

开发推荐 Node.js 24。公开源码和构建脚本均在仓库根目录：

```sh
npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund
npm run build
npm run typecheck
npm run check:public
npm pack --ignore-scripts
```

维护者克隆后执行 `git config core.hooksPath .githooks`，启用本地推送前检查。

提交源码变化时同步提交重新构建的 `lib/`。不要添加 `prepare`、`install`、`postinstall` 或 `prepack` 等自动构建脚本；否则地址安装会要求执行代码或依赖用户的构建环境。

发布必须遵守 [发布与隐私规则](docs/public-release.md) 和 [资源预算](docs/resource-budget.md)。现有源码并不表示所有设备的性能都已验收；平台与功能的实际限制以使用时反馈为准。

## 许可

代码沿用 [BSD-3-Clause](LICENSE)，来源说明见 [NOTICE.md](NOTICE.md)。透明动画来自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)，素材仅限非商用，展示及分发必须保留原作者地址；该限制独立于代码许可。原始许可、来源和每个媒体文件的 SHA-256 随包保留。
