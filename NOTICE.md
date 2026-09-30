# 来源与许可

代码派生自 [NativeDog1/dsh-boot-animation](https://github.com/NativeDog1/dsh-boot-animation)，基线提交 `ce22befdc436ab59832dd8ef33da80e973db8d94`。原 BSD-3-Clause 版权及免责声明完整保留在 LICENSE。本项目不代表上游作者或 DeepSeek 官方背书。

主要扩展包括独立插件名称、会话片头与本地片库、上传与回收站、3D 人物、外部模型与动作适配、表情互动、菜单、目光和可选对话。代码不包含开发者的用户数据、私人模型或 FBX 样本；指定内嵌片头见下文。LICENSE 中关于历史 `assets/boot.mp4` 的附注属于原始许可文本；公开包不分发该历史媒体。

渲染器依赖 Three.js / three-vrm，其许可随预编译文件保存在 `lib/third-party-licenses.txt`。

## 透明动画角色

「蓝毛小女仆」的 11 个透明 WebM 来自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)，固定提交 `0521efa5bd7fce70b59eb819ed9a4900f1507ac1`，作者 PC2005-cloud。素材仅限非商用；介绍、展示及分发须附原作者 GitHub 地址。此素材条款独立于代码许可。

HEVC Alpha MOV 为对应 WebM 的格式变体，沿用相同素材条款。来源、尺寸及 SHA-256 见 `assets/pets/blue-maid/manifest.json`，上游 LICENSE 同目录保存。可使用 `scripts/transcode-pet-hevc.mjs` 与 Apple AVAssetWriter / FFmpeg 重新生成变体；转码不属于安装流程。

## Packaged companion model

RobotExpressive by Tomás Laulhé (Quaternius), with modifications by Don McCurdy; CC0 1.0. The skin-weight-normalized derivative, source and checksums are described in `assets/models/NOTICE.md` and `assets/models/manifest.json`.

## 内嵌会话片头（0.9.2）

「DeepSeek 品牌片头」「DeepSeek 赛博朋克片头」「DeepSeek 数字角色苏醒」来自 [NativeDog1/dsh-boot-animation](https://github.com/NativeDog1/dsh-boot-animation)，固定提交 `ce22befdc436ab59832dd8ef33da80e973db8d94`，与对应默认片源字节一致。上游中文 README 声明默认片源按 BSD-3-Clause 分发；其许可段沿用历史媒体路径。保留 dsh-boot-animation contributors 的版权、完整许可和免责声明。

「光影·动色」由维护者提供并明确指定随 0.9.2 分发，输入文件名标识为「【哲风壁纸】光影-动漫美女-彩色.mp4」。此标识仅为来源线索，原始作者及独立分发许可未核实；维护者的发布指令不等于原作者授予许可。本项目不将该视频纳入 BSD-3-Clause 代码许可，不声称原创或授予下游使用权。视频保持 3840×2160、60fps，分发副本仅做无损 MP4 索引重排。精确文件和 SHA-256 见 release/public-files.json（公开源码仓库）。
