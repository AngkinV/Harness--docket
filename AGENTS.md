# 公开仓库工作约定

本仓库是可由 DeepSeek Harness 直接安装的公开插件。修改或发布前必读 [发布与隐私规则](docs/public-release.md) 和 [资源预算](docs/resource-budget.md)。

- 仅允许 `release/public-files.json` 中逐项列出的文件；新增公开文件须明确审阅，不能用整目录通配符放宽规则。
- 不提交本地环境、运行记录、截图、用户素材、凭据或私有 Git 历史。检查整个公开提交历史及最终 npm 包，不能只检查当前工作区。
- 根目录保持有效的 package.json、cordis.patch.yml、locale 和预编译 lib。修改源码后重建并同步提交 lib；安装不可依赖生命周期脚本。
- 执行 `npm run check:public`；发布前执行 `node release/check-public.mjs --git` 和构建一致性检查。
- 测试使用独立目录，结束后关闭自建进程并清理自己的缓存。性能变化需同环境前后比较及至少十轮回收验证；未测量的平台不得标为通过。测试证据只保留本地。
