# 上游升级基线

本仓库与 SillyTavern 上游没有共同历史：源码只放在忽略的 `upstream/SillyTavern/`，不合并上游 Git 历史。[upstream-release 工作流](../.github/workflows/upstream-release.yml) 每天检查最新 release；发现比 lock 新的版本时，按标题去重后开 issue，不改代码或部署。

## 升级步骤

1. **更新 lock。** 在上游 release 页面确认 tag 和对应 commit，更新 `baseline.lock.json` 的 `upstream.release`、`upstream.commit`、`upstream.releaseUrl` 和 `checkedOn`。取得对应官方镜像的 digest，拉取该 digest 后用 `docker image inspect <digest-reference>` 核对 `Id` 和 `org.opencontainers.image.revision`：revision 必须等于上述 commit；把完整 digest 引用和 `Id` 分别填入 `image.reference`、`image.id`。确认架构与生产一致。同步更新本仓库 `compose.yaml` 中两个镜像引用，否则 Docker 验证仍会使用旧镜像。助手版本未变时保留 `helper` 锁定信息。
2. **重新准备上游。** 停止隔离实例；将已有 `upstream/SillyTavern` 检出更新至新 tag（或另备份后重新克隆），确保 `git -C upstream/SillyTavern rev-parse HEAD` 等于 lock 的 commit。`npm run prepare:baseline` 使用 `scripts/prepare.py` 检查 commit、已拉取镜像的 revision 和助手快照，并准备 Docker 隔离数据；按需设置 `WB_HELPER_SOURCE`。`npm run start` 启动 compose。无 Docker 时可用 `npm run local:prepare` 和 `npm run local:start`：`scripts/local-runtime.mjs` 校验 commit、安装上游依赖并准备隔离实例；已有上游 `node_modules` 不会自动重装，升级后应按新版本重新安装依赖。它不校验镜像 revision；助手资产缺失时相关检查会跳过。两个准备脚本不会覆盖已有配置或数据；需要新版本默认设置时，先妥善备份再重建隔离数据。
3. **验证。** 执行 `npm run build`、`npm run check`、`npm test`；启动隔离实例后串行运行 `npm run verify`、`npm run verify:workbench`、`npm run verify:compat`、`npm run verify:perf`、`npm run verify:sync`，以及受上游变更影响的其他 `verify:*`（见 `package.json` 和 README）。确认助手相关检查没有被跳过，检查失败先修复再继续。
4. **检查钩子。** 对照 [性能吸收规格的模块清单和钩子点表](plans/2026-10-25-perf-absorb-spec.md#模块清单)，逐项在新源码核对符号、调用时机、端点和 gzip 回退；旧行号仅作定位参考。检查版本守卫、与 BaiBai 共存及服务端缓存失效，并结合 `verify:perf`、`verify:sync` 验证行为。
5. **部署。** 确认验证通过后执行 `npm run deploy`（`scripts/deploy.mjs` 构建、check、同步扩展及插件；服务端插件变化时会重启容器）。生产编排在 `nas:/vol2/1000/Docker/stacks/ai/compose.yaml`：先备份，再将 `sillytavern` 服务的 `image` 改为 lock 的新 `image.reference`。计划维护窗口应用 compose 中的新镜像并验证服务、扩展及 `/api/plugins/workbench-sync/info`；仅修改 compose 不会更新正在运行的容器。

## 本地检查通知逻辑

需要 `gh` 已登录且有仓库 issue 读取权限。`node scripts/upstream-release.mjs --dry-run` 读取真实最新 release 和打开的 issue，只打印决策；用 `node scripts/upstream-release.mjs --dry-run --latest-tag 99.0.0` 模拟新版本。去掉 `--dry-run` 会实际创建 issue，测试版本覆盖只允许与 `--dry-run` 一起使用。
