# 2026-10-25 整体方案：世界书分组/归档、性能、条目详情与吸收项

集成分支 `claude/worldbook-grouping-archive-8725c6`（基于 workbench b13cb93）。合并了两份输入：本轮需求（分组归档、性能、条目详情、路线图）与 [性能插件吸收规格](2026-10-25-perf-absorb-spec.md)。复杂工作包在独立 worktree 分支并行开发，简单项在集成分支直接改，最后统一合并验证、部署。

## 工作包总表

| # | 工作包 | 复杂度 | 执行 | 主要改动面 |
| --- | --- | --- | --- | --- |
| W0 | 部署脚本、路线图、性能规格入库 | 低 | 集成分支（已完成 d16858477） | scripts/deploy.mjs、docs |
| D1 | settings.json 遗留键清理 | 低 | 集成分支，生产数据操作 | 生产 settings.json |
| P-A | 前端 perf 扩展（规格工作包 A，6 模块） | 中-高 | fork F1 | 新目录 `perf-extension/`、deploy.mjs |
| P-B | workbench-sync 服务端缓存（规格工作包 B） | 中-高 | fork F2 | `server/workbench-sync/` |
| W1+W2 | 工作台内部性能 + 世界书条目详情布局 | 中 | fork F4 | `World.tsx`、虚拟化组件、`host/core`、`adapter` |
| W3 | **世界书分组 + 归档；连接归档**（本次主体） | 中-高 | fork F3 | `host/core` 偏好、`ResourcePicker`、`Resources`、`ResourceManager`、`World` 书列、`Header`、`MobileShell` |
| W5 | 占位符变量 | 中 | fork F5 | 新 host 模块、输入框、斜杠命令包装、变量管理面板 |
| W4 | 上下文裁剪 | 低-中 | 集成分支 | manifest `generate_interceptor`、楼层列表裁剪线 |
| W6 | 说话人着色 | 低 | 集成分支 | 新样式表模块、角色/persona 颜色设置 |

路线图 P1 两项（前置 AI 世界书路由、回复格式实时修复）另行立项；骰子控件取消；「世界书快捷切换」并入 W3 组级启停；备选池「渲染性能手法」由 P-A / P-B / W1 承接。

## 关键决定（已确认）

1. 归档只隐藏：工作台设置里的元数据标记，文件不动；归档项不出现在边栏、顶栏下拉、「下一个」与快捷键中，独立编辑页可恢复。
2. 在用的不能归档：世界书全局启用或绑定在角色卡 / 当前聊天 / 人设上时，归档按钮禁用并说明原因；当前连接不能归档。归档不改任何启用或绑定状态。
3. 世界书分组单层、一本书只属一个组，与现有连接分组（`prefs.groups`）同一形态；组头提供整组启停。
4. settings.json 遗留键：备份 → 清理 → 重启，不做前后计时。
5. 占位符保持原语法与指示数语义完全兼容（「👑超级菜单」22 条快速回复依赖它），变量按角色卡分组，改存工作台设置。
6. P-A 遵守规格硬性要求：独立扩展目录、`extension_settings.wbPerf` 单命名空间、版本与符号守卫、不改写用户持久化设置、不碰 BaiBai 的补丁领地与 `#show_more_messages`。

## 现状证据

- 生产 settings.json 已由你清理过 vectors_enhanced 并归一化（8.35 → 5.13 MB）。仍有已卸载/停用扩展的遗留键（LittleWhiteBox、st_bme、story_workspace、ai_worldbook_router、Amily2 等），D1 处理。
- 生产世界书 64 本 / 6028 条 / 34 MB，最大一本 3189 条 9.2 MB；角色 10、聊天 1。工作台全项目无列表虚拟化，条目表全量渲染并对整本书计 token；条目详情以内联行展开，把下方条目推出屏幕（截图问题）。
- `SETTINGS_UPDATED` 让 session / characters / resources / prefs 全部失效，所有 `withoutChat` 面板随每次设置保存重渲染。
- 连接已有单层分组（`prefs.groups[profileId]`，`ResourcePicker` 的 `grouped` 模式）；世界书无分组，两者都无归档。

## 对性能规格的修正与补充

核对 1.19.0 源码（`upstream/SillyTavern`）后：

- **P-B 的 `/api/settings/get` 失效条件不够。** 该端点（`src/endpoints/settings.js` 约 220–280 行）除 settings.json 外，还返回 NovelAI / OpenAI / TextGen / KoboldAI 四个预设目录、世界书名单、themes、movingUI、quickreplies、instruct、context、sysprompt、reasoning 的内容，而且按 `request.user` 区分（生产有 `default-user`、`yuwk-1` 两个用户）。缓存键必须含用户；有效性按 settings.json 与上述目录（含其中文件）的 mtime/size 指纹判断，并在这些资源的写端点（预设、世界书、主题、快速回复等保存/删除）以及 workbench-sync 自身写文件时立即失效。
- **P-B 的 `/api/characters/all`** 返回中含聊天统计（聊天大小、最后聊天时间），聊天保存同样要让它失效，或把聊天目录纳入指纹。
- **P-A 模块 6（gzip）** 可行：`src/server-main.js:110` 使用 `bodyParser.json({ limit: '500mb' })`，默认 `inflate: true`。保留失败回退未压缩重试。
- **P-A 模块 5（提前解遮罩）** 需验证不与工作台挂载时序冲突：遮罩提前解除后到 `APP_READY` 之间工作台尚未挂载，必须确认不会露出原生界面闪烁或可点击的半初始化状态；冲突则该模块默认关闭。
- `deploy.mjs` 增加 `perf-extension/` 的 rsync 目标（生产目录 `extensions/wb-perf/`），由 F1 完成。上线后按规格卸载 cocktail。

## 工作包要点

### W1 + W2（F4）

先在本地验证实例导入生产世界书副本测基线，再改：

- 一个共用的定高窗口化组件，用于条目表、边栏条目、角色列表、楼层列表；不引第三方库。
- token 计数只算可见与已编辑条目，整本合计按需或后台分批。
- `SETTINGS_UPDATED` 失效收窄到确有变化的分片（比较连接、预设、世界书选择等指纹）；工作台偏好写入合并防抖。
- W2：深度编辑改主从布局。条目表常驻，选中条目在右侧固定详情栏编辑（独立滚动），详情打开时收起次要列；窄窗口/手机用覆盖层；上下键切换条目。
- 验收：3189 条世界书打开、滚动、按键前后计时写入本文；选中任一条目时其余条目可见可点。

### W3 分组与归档（F3）

- 数据：`extensionSettings.workbench` 新增世界书分组映射与两类资源的归档集合，世界书以名称为键，加载时清理不存在的键，工作台内删除/改名同步更新。
- 边栏：世界书按组折叠，未分组置底，组头整组启停；归档项隐藏，底部「已归档 N」可展开。
- 顶栏下拉：同样分组、排除归档，搜索跨组；「下一个」与快捷键跳过归档。连接沿用现有分组，只加归档。
- 独立编辑页：分组新建 / 改名 / 删除 / 批量移入，批量归档 / 恢复（复用现有多选与批量栏），「全部 / 已归档」切换；在用项归档按钮禁用并写明原因。
- 手机 `MobileShell` 同步。
- 验收：归档项不出现在边栏、下拉和「下一个」，可在独立编辑页恢复；在用项无法归档；刷新与重启后保持。

### W5 占位符变量（F5）

- 兼容原脚本全部语法：`{@变量}`、`{@变量:默认}`、`{@变量:默认:提示}`、`{@变量:默认:提示:指示数}`、`{@变量=值}`、`{@变量!}` 及 `{@list}` / `{@clear}` / `{@reset}` / `{@input:toggle}`。展开写成纯函数并单测覆盖；原脚本源码在生产 settings.json `extension_settings.tavern_helper.script.scripts[3]`（只读参考）。
- 展开入口：原生 `#send_textarea` 防抖就地展开 + Tab 立即展开；包装 `/inject`。处理输入法组合输入、生成中、快速回复自动发送的时序。
- 变量按角色卡分组存工作台设置（跨设备同步），旧 localStorage 不迁移；变量管理面板（查看 / 编辑 / 删除当前角色变量）。
- 快速回复「`--------` 分隔前按钮变吸顶工具栏」样式：先核对工作台底栏是否需要，需要再做。
- 验收：「👑超级菜单」原样可用，控制菜单设定的名字在其他条目和 `/inject` 中正确展开，换浏览器后变量仍在。

### W4 上下文裁剪 / W6 说话人着色（集成分支）

- W4：manifest 注册 `generate_interceptor`，按设置截断发送的消息条数（不含示例与注入）；楼层列表标出裁剪线；不改写 ST 持久化设置。上线后停用 Extension-MessageLimit。
- W6：按消息作者给 `<q>` 对白上色，颜色来源为角色 / persona 手动颜色或头像主色（canvas 自取），按主题做对比度修正；只生成样式表，不改消息 DOM；覆盖 Noval 阅读区与 RP 舞台；迁移生产两个 persona 的颜色。上线后停用 Dialogue-Colorizer。

## 并行开发约定

- 每个 fork 在独立 git worktree 与分支上工作，只改本工作包范围内的文件；完成后提交在自己的分支，不合并、不推送、不部署。
- 运行环境（每个 worktree 各自准备）：
  - 从主检出 `/Users/yuwk/WorkSpace/Code/Github/SillyTavern` 复制 `.env`，追加各自的 `WB_PORT_OFFSET`：F1=100、F2=200、F3=300、F4=400、F5=500，集成分支=600。
  - `cp -cR <主检出>/node_modules .`；`mkdir -p upstream && cp -cR <主检出>/upstream/SillyTavern upstream/`（APFS 克隆，各自独立，因为 `npm run build` 会把服务端插件链接建在 `upstream/SillyTavern/plugins/` 下）。
  - `npm run local:prepare && npm run build && npm run local:start`；用完 `npm run local:stop`。
- 生产只读：可 `ssh nas` 读取数据做参考，不写生产、不重启容器。
- 每个 fork 完成时：`npm run check && npm test && npm run build` 通过，跑受影响的 verify，并在本文对应小节下追加实测结果与未验证项（只改自己那一节，减少合并冲突）。

## 合并与上线

1. 集成分支先完成 W4、W6、D1。
2. fork 完成后逐个合并进集成分支：P-B、P-A 与其他包无文件交集，先合；F4 与 F3 都动 `World.tsx` 和 `host/core`，先合 F4 再合 F3；F5 最后。
3. 全部合并后跑 `npm run check`、`npm test`、`npm run build` 与 `verify:workbench`、`verify:interactions`、`verify:resources`、`verify:pwa`、`verify:rp`。
4. `npm run deploy` 上生产并探活；随后在生产卸载 cocktail，停用 Extension-MessageLimit 与 Dialogue-Colorizer。
5. 集成分支合入 `workbench` 前确认主检出的改动归属：主检出当前有未提交的 README / package.json / roadmap / deploy.mjs，与本分支 W0 内容相同或更旧，合并前需要你处理它们。

## 进度

- [x] 总体计划、关键决定确认
- [x] W0 入库（d16858477）
- [ ] D1 settings.json 遗留键清理
- [ ] W4 上下文裁剪
- [ ] W6 说话人着色
- [ ] F1 P-A 前端 perf 扩展
- [ ] F2 P-B 服务端缓存
- [ ] F3 W3 分组与归档
- [ ] F4 W1 + W2 工作台性能与条目详情
- [ ] F5 W5 占位符变量
- [ ] 合并、全量验证、部署

## 实测记录

（各工作包完成后在此追加。）

### F3 W3 分组与归档

实现要点：
- 数据：`prefs.worldGroups`（书名 → 组名）、`prefs.archived.{world,connection}`；连接沿用 `prefs.groups`。`Item` 增加 `group` / `archived`，由 `buildResources` 写入。纯函数在 `src/host/organize.ts`（分组排序、列表顺序、补丁、清理），宿主方法在 `src/host/domains/organize.ts`（`resourceUsage`、`archiveResources`、`setResourceGroup`、`renameResourceGroup`、`savePreference`、`pruneOrganization`）。
- 归档与分组是显式操作，立即 `persistSettings` 并等待确认（失败回滚），不走防抖保存：运行时验证发现防抖保存在归档后立刻刷新会丢失。
- 在用判定：全局启用、任一角色卡主世界书或附加世界书、当前聊天绑定、任一人设绑定；当前连接。宿主层同样拒绝，不只是按钮禁用。
- 启动时与工作台内批量删除后清理不存在的键；启动时世界书列表为空则不清理世界书键（防止未加载时误删）。酒馆原生改名世界书后分组随旧名被清理（工作台无改名入口）。
- 界面：资源栏分组可折叠 + 组头整组启停 + 底部「已归档 N」折叠可恢复；顶栏下拉与手机 RP 选择框分组、排除归档、世界书组头整组启停，≥9 项时出现搜索；手机面板标题选择器（无资源栏）分组 + 组头启停；独立编辑页「未归档 / 已归档」切换、分组标题（选整组 / 重命名 / 解散）、批量「分组」「归档 / 恢复」，在用项禁用归档并列出原因；「下一个」与快捷键按分组顺序跳过归档项。

实测（本地 offset 300 实例，Chrome headless）：
- `npm run check`、`npm test`（124 项，含新增 `tests/organize.test.mjs` 7 项）、`npm run build`、`format:check` 通过。
- 新增 `npm run verify:grouping`（`scripts/verify-grouping.mjs`）10/10 PASS：编辑页分组移入 / 重命名 / 解散；在用（全局、角色卡）不能归档并说明原因、宿主同样拒绝；归档进入已归档；资源栏分组、隐藏归档、整组启停不波及归档书；资源栏恢复；顶栏下拉分组与整组启停；当前连接不能归档、归档连接离开下拉、Alt+Shift+N 跳过归档连接；刷新后分组与归档保持；手机面板选择器与 RP 选择框；删除世界书后键被清理。截图：`artifacts/grouping-{rail,chooser,manager,manager-archived,phone-picker,phone-chooser}.png`。
- `verify:pwa` 18/18 PASS。
- `verify:workbench`、`verify:resources`、`verify:interactions` 在本环境中途失败，失败点与本改动无关，且在基线提交 cad6ec8c0 的构建上以相同位置失败（已实测对照）：`getByLabel('角色描述')` 命中隐藏的原生 checkbox、`getByLabel('流式传输')` 命中 5 个元素、作者注释角色选项 `User` 不存在。三者在失败点之后的步骤未执行。

推断 / 未验证：
- 上述三个 verify 失败点之后的步骤（含它们对资源列表的其他覆盖）未执行；需在修好这些脚本或在主检出环境中复跑。
- 连接的分组标题操作（重命名自动按模型分组、解散恢复按模型分组）只有代码路径与单测，运行时验证只覆盖了世界书。
- 未在生产数据（64 本）上看过分组后的列表观感。
