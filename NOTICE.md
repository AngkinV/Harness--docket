# 来源与许可

代码派生自 [NativeDog1/dsh-boot-animation](https://github.com/NativeDog1/dsh-boot-animation)，基线提交 `ce22befdc436ab59832dd8ef33da80e973db8d94`。原 BSD-3-Clause 版权及免责声明完整保留在 LICENSE。本项目不代表上游作者或 DeepSeek 官方背书。

主要扩展包括独立插件名称、会话片头与本地片库、上传与回收站、3D 人物、外部模型与动作适配、表情互动、菜单、目光和可选对话。代码不包含开发者的用户数据、模型、FBX 样本或示例片头。LICENSE 中关于历史 `assets/boot.mp4` 的附注属于原始许可文本；公开包不分发该历史媒体。

渲染器依赖 Three.js / three-vrm，其许可随预编译文件保存在 `lib/third-party-licenses.txt`。

## 透明动画角色

「蓝毛小女仆」的 11 个透明 WebM 来自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)，固定提交 `0521efa5bd7fce70b59eb819ed9a4900f1507ac1`，作者 PC2005-cloud。素材仅限非商用；介绍、展示及分发须附原作者 GitHub 地址。此素材条款独立于代码许可。

HEVC Alpha MOV 为对应 WebM 的格式变体，沿用相同素材条款。来源、尺寸及 SHA-256 见 `assets/pets/blue-maid/manifest.json`，上游 LICENSE 同目录保存。可使用 `scripts/transcode-pet-hevc.mjs` 与 Apple AVAssetWriter / FFmpeg 重新生成变体；转码不属于安装流程。
