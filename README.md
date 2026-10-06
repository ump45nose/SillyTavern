# SillyTavern Workbench · 官方基线与技术验证

第 1 阶段已建立固定的官方 release、隔离部署、最小前端探针和可重跑验证。探针只验证接入能力；正式 Novel / RP 页面将在后续模块设计后实现。

## 当前入口

| 实例 | 地址 | 内容 |
| --- | --- | --- |
| 官方基线 | http://192.168.31.201:32011 | 官方 1.19.0，独立测试数据，无第三方扩展 |
| 技术验证 | http://192.168.31.201:32012 | 同一官方镜像，酒馆助手 4.8.18 与最小工作台探针 |

两个入口使用相同的测试账号。用户名与随机密码保存在项目 `.env` 中，权限为 `0600`，不纳入 Git。原有酒馆仍在端口 `32001`，本阶段未更新其镜像、扩展或用户数据。

验证实例的右下角“技术验证”面板可以返回原生界面，再从“工作台验证”按钮重新挂载。浏览器控制台可查看 `window.workbenchProbe.capabilities()`、`window.workbenchProbe.metrics` 与 `window.workbenchProbe.records`。这里是开发探针入口，不是正式 Trace 页面。

## 固定版本与结构

- 官方 release：`1.19.0`，提交 `7e8663cd9c184a550b37238218bdd32c6efc68e9`。
- 官方发布镜像以 digest 固定，详情见 `baseline.lock.json`。部署复用本机已有的同版本官方镜像，不跟随浮动 `latest`。
- 官方源码位于 `upstream/SillyTavern/`，按 tag 拉取，保持独立 Git 目录及干净的官方文件；不纳入本项目源码仓库。
- `extension/`：最小挂载、卸载、能力检测与内存请求记录。
- `scripts/`、`tests/`、`fixtures/`：准备、浏览器验证、性能采样及本地测试模型。
- `runtime/`：两个实例的配置、测试数据与酒馆助手部署资产快照；`artifacts/`：报告和截图。两者均被 Git 忽略。

酒馆助手复用了现有部署的 `dist`、`lib`、`i18n`、manifest 和许可证。现有目录并非已确认干净的上游 checkout，因此以实际部署资产哈希固定，不将它描述为某个干净的上游提交。

## 运行与验证

首次准备：

```bash
cd /home/yuwk/code/sillytavern-workbench
npm ci
npm run prepare:baseline
npm run start
```

准备脚本检查官方提交与镜像 revision；已存在的测试数据和凭据不会被初始化覆盖。缺少官方源码时自动拉取固定 tag。镜像需先存在于本机，可按 `baseline.lock.json` 中的 reference 拉取。

其他机器可以通过 `WB_HELPER_SOURCE` 指定同一部署版本的酒馆助手目录。已有快照的哈希必须与 lock 一致，变更需要显式更新版本记录。浏览器默认使用本机现有 Chromium；可用 `WB_CHROMIUM` 指定可执行文件。

```bash
npm run check
npm test
npm run verify
npm run benchmark
```

`verify` 会清理两个隔离实例内名为 `WorkbenchFixture` 的合成聊天，并重建验证流程；不得在这些测试实例内存放需要保留的真实聊天。`benchmark` 在验证实例内临时切换扩展启用组合，结束时恢复原设置，同时重启官方基线实例三次。

停止并保留数据：

```bash
npm run stop
```

测试模型复用同一个镜像中的 Node，单独运行确定性测试接口，不需要数据库、Redis、模型密钥或外部模型。原生酒馆服务真正将请求发送到它，因而可以独立验证浏览器请求与服务端出站消息。测试模型的请求检查端口 `32013` 仅绑定 localhost。

## 验证结果与边界

完整结论、采样方法、兼容发现和后续接入边界见 [第 1 阶段报告](docs/stage-1-report.md)。结果文件：

- `artifacts/verification.json`：10 项浏览器验证全部通过。
- `artifacts/benchmark.json`：三组各 5 次冷缓存及 5 次热缓存采样、三次服务端重启。
- `artifacts/source-integrity.json`：7 个关键官方文件与发布镜像一致，上游 tracked 文件保持干净。
- `artifacts/request-trace.json` 与 `provider-request.json`：仅合成数据的请求及命中证据。
- `artifacts/desktop-probe.png`、`native-fallback.png`、`mobile-native.png`：验证截图。

HTTP 局域网地址可用于网页技术验证，尚未完成 HTTPS 安装形态、真实手机 PWA 或 iOS 软键盘验证。性能数据来自小型合成数据集，不代表现有生产负载。

## 后续维护

官方 release、镜像 digest、插件资产版本分别记录。新 release 先在这两个实例运行相同验证，再决定升级；生产端口与数据卷不参与准备或测试脚本。当前没有核心补丁、服务端插件、Early Bridge 或 Service Worker。

发现现有生产环境还安装了 `story-workspace`，其部署说明记录了 Novel / RP 外壳和原生节点复用。该扩展未被本阶段覆盖或加载到隔离实例；后续界面阶段应先定位并审阅它的源项目，确定复用方式，避免同时挂载两个工作台。
