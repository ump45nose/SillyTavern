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

### F2 P-B 服务端缓存

**实现**（`server/workbench-sync/src/cache.ts`，入口 `index.ts`、`st.ts`）：

- 拦截方式：插件按同一文件 URL 导入 `src/endpoints/settings.js` 与 `characters.js`（Node 按真实路径解析，得到 server-startup 已挂载的同一模块实例），在它们导出的 Express router 栈头插入路由层。不改 ST 源文件；这两个 router 挂在 Basic Auth、登录、CSRF 中间件之后，中间件链不受影响。router 不像 1.19.0 的（找不到 `/get` / `/all` 路由）就不安装，并打日志说明。
- 缓存键为「用户 handle + 端点」。有效性用指纹判断，指纹由每个文件的名称、inode、大小和 mtime 组成：settings 取 settings.json 加上 settings/get 读取的 12 个目录；characters 取 characters 目录加上 chats 下一层。write-file-atomic 每次写入都换新 inode，同一毫秒内同样大小的重写也能识别。
- 立即失效：
  - settings router 上除 `/get`、`/get-snapshots` 外的请求，characters router 上除 `/all`、`/get`、`/chats`、`/export` 外的请求，都在请求开始和结束时各失效一次该用户的缓存。
  - 插件自身的 PUT `/file`、`/delete`、`/rename` 同样在写入前后失效。
  - 回源过程中如果发生了失效，这次回源结果不入缓存（用代际计数判断）。
  - 只缓存 200 的字符串响应。
- 命中时直接返回预压缩字节（br 质量 4 / gzip，与 compression 1.8.1 的协商偏好一致），并带 `Vary: Accept-Encoding`。已带 Content-Encoding 的响应，ST 的 compression 中间件会原样放行，所以每次刷新不再重复压缩约 5 MB。每种编码每个条目只压缩一次。
- 日志：`workbench-sync: cache hit|miss <端点> [用户] <原始大小> → <编码> <压缩后大小> in N ms · hits / misses`。`/api/plugins/workbench-sync/info` 新增 `cache: {on, hits, misses, bytes}`。
- 冷启动时缓存为空，直接回源；插件 `exit` 时移除插入的路由层。

**实测**（本地 validation 32212 带插件，baseline 32211 为官方无插件；用 probe 键把 settings.json 撑到 5.96 MB，测完已恢复）：

| 项目 | 结果 |
| --- | --- |
| settings/get 客户端总耗时（7 次中位数） | baseline 106.0 ms；validation 首次回源 116.2 ms，命中 36.0 ms |
| settings/get 服务端处理耗时（插件日志） | 回源 42–51 ms（不含压缩）；命中 2–3 ms，首次命中含一次压缩约 17 ms |
| characters/all（31 KB） | 回源 35.6 ms，命中 8.0 ms |
| 保存设置后立即 get | 拿到新值 |
| 新建 / 删除世界书后 get | `world_names` 立即反映 |
| 保存 / 删除 OpenAI 预设后 get | `openai_setting_names` 立即反映 |
| 两个会话交替保存与刷新（4 轮） | 每轮读到对方刚写的值，无脏读 |
| 新建 / 删除角色后 characters/all | 立即反映 |
| br 编码走真实 compression 中间件 | 回源与命中解码结果一致，没有二次压缩 |
| 重启实例后 | 首次回源、第二次命中，响应一致 |
| 单元测试 `tests/cache.test.mjs` | 8 项通过：指纹覆盖与排除、编码协商、命中与失效、写路由失效、回源竞态丢弃、500 不缓存、多用户隔离、安装拒绝与撤销 |
| `npm run check` / `npm test` / `npm run build` | 通过（125 项） |
| `verify:sync` | 10 PASS（插件写入路径加失效包装后 IDE 同步正常） |

**推断**：

- probe 填充内容重复度高，gzip 后只有 34 KB。真实 settings.json 的压缩率低得多，所以命中时省下的压缩开销应该比上面的测量更大；客户端总耗时的改善幅度要以真实数据为准。
- V1 格式角色卡缺少 `chat` 字段时，ST 每次 `/all` 都会用当前时间生成默认聊天名；缓存后这个值在缓存有效期内保持不变。这不影响已有聊天。
- 只要聊天文件有变化（每条消息），characters/all 的缓存就会失效，所以它主要在空闲后刷新时起作用；settings/get 是刷新的主要开销，不受聊天写入影响。

**未验证**：

- 生产 Docker 环境中按真实路径导入是否得到同一模块实例：本地已验证（命中计数增长、日志确认已安装），生产部署后请查看容器日志里的 `response cache on`，并在刷新后检查 `/info` 的 `hits` 是否增长。
- BaiBai 的 baibaoku 404 回退：本地没有安装 BaiBai。本插件不注册也不拦截该路径，按推断互不影响。
- 浏览器真实页面多标签：只用两个 HTTP 会话模拟。`verify:workbench` 在第 3 项（「角色描述」定位器同时匹配复选框和 Markdown 编辑器）失败，去掉插件后同样复现，是 Markdown 编辑器上线后验证脚本未更新的旧问题，与本工作包无关，需要另行修复脚本。
### F1 P-A 前端 perf 扩展（2026-10-26，分支 worktree-agent-a266e078f2139266b）

产出：`perf-extension/`（6 个模块，设置在 `extension_settings.wbPerf`，扩展面板「Workbench 性能优化」一个总开关 + 每模块开关），`scripts/deploy.mjs` 同步到生产 `extensions/wb-perf/` 并探活，`scripts/local-runtime.mjs` 给验证/视觉实例链接 `wb-perf`，`npm run verify:perf`。

实测（本机 1.19.0 验证实例，offset 100；`npm run check && npm test && npm run build` 通过，`verify:perf` 13 项全部通过、无页面错误）：
- 6 个模块在 1.19.0 全部安装成功（版本门禁 + 符号探测），面板列出 6 项。
- 启动预取：avatars/characters/backgrounds 三个列表加载时并行发出、各只请求一次，原生调用拿到的角色数与服务端一致。
- 提前解遮罩：工作台会挂载时不提前（APP_INITIALIZED 时遮罩仍在）；禁用工作台后在 SETTINGS_LOADED 即解除。注意 1.19.0 的启动遮罩是 `loader.show({slug:'app-init'})`，cocktail 用的 `ctx.hideLoader()` 对它无效，这里直接 hide 该句柄；工作台加载判断用 `window.workbench || window.workbenchStartup`（SETTINGS_LOADED 时工作台 bundle 可能仍在 import）。
- gzip：经局域网地址访问时 >64 KB 的 settings 保存以 `Content-Encoding: gzip` 发出、服务端完整写入并可读回，小请求不压缩；压缩请求失败时自动以未压缩重发并成功（worldinfo/edit 实测）。回环地址不压缩。
- 预设：`render(true)` 立即重绘列表，连续 3 次切换只做 1 次后台 dry-run，完成后再刷新计数；关闭后恢复原生（先 dry-run 再画）。
- 抽屉：inline-drawer 开合用一个 WAAPI 动画、无 jQuery 高度逐帧；关闭后恢复 jQuery slideToggle。
- 正则：面板打开时单个与批量开关都不重载聊天，收起面板后重载一次；关闭模块后切换立即重载（原生）。
- 世界书拖拽：拖动中条目不动，只有影子与指示线、无 jQuery UI 占位；松手一次重排并经原生 stop 回调保存 displayIndex（服务端读回顺序一致）；关闭后 jQuery UI sortable 接管。
- 总开关关闭：document/window 上来自 wb-perf 脚本的监听器 5 → 0（CDP 检查），`PromptManager.prototype.render`、`$.fn.slideToggle`、`fetch` 均恢复原生，面板外无 `wb-perf` 元素/类。

推断（读代码得出，未在真实环境复现）：
- 生产（192.168.31.201）上 BaiBai 的 gzip 因私网地址跳过，本扩展会压缩 LAN 请求；两者同时生效时 BaiBai 先压缩的请求带 `Content-Encoding`，本扩展跳过，不会二次压缩。
- 与 BaiBai 共存：本扩展只补 `PromptManager.prototype.render`，不碰实例级 `makeDraggable` / `renderPromptManagerListItems` / `getPromptCollection`，不拦截 `#show_more_messages`。

未验证：
- 与 ST-BaiBai-Tools 实际共存（本机未安装 BaiBai）。
- 生产部署与探活（按要求未部署）；部署后需在生产卸载 cocktail，避免同类补丁叠加。
- 版本门禁上限 1.20.0（不含）以外的酒馆版本。
### F5 W5 占位符变量（分支 `worktree-agent-abccf3bbb3b7e5fe5`）

实现：`src/host/placeholders.ts`（纯函数展开）、`src/host/placeholder-runtime.ts`（输入框 / `/inject` / `/buttons` 接入与存储）、`src/ui/PlaceholderPrompt.tsx`（输入弹窗）、`src/modules/PlaceholderSettings.tsx`（用户设置 → 占位符变量）。变量存 `extensionSettings.workbench.placeholders[作用域]`，作用域为角色头像文件名 / `group:<id>` / `default`。

与原脚本（生产 settings 中 tavern_helper 脚本 #3）对照后的行为说明：

- 超级菜单不走 `/inject` 为主，而是 `/setinput {{input}}<…{@变量…}>` 写进输入框再 `/run` 菜单，展开发生在原生 `/buttons` 弹窗仍打开时。工作台弹窗用 `showModal`，叠在原生弹窗之上可正常操作，关闭后原生弹窗继续可用。
- 原脚本的 Tab 是打开变量管理器；这里 Tab 改为立即展开（管理器在用户设置里）。Enter / 发送按钮遇到未展开的完整占位符时先展开、不发送，避免把原始 `{@…}` 发出去。
- `{@toast:…}` / `{@confirm:…}` 在原脚本里被 `{@名:默认}` 先吞掉、只输出文字；这里按保留名的本意弹提示。超级菜单未使用这两个命令。
- 原脚本按 `characterId`（数组下标，下标 0 会落到 default）分组，这里改按角色头像文件名，不受角色列表顺序影响；旧 localStorage 数据不迁移。
- 快速回复工具栏样式需要：它作用于 `/buttons` 弹窗（不是输入框底栏），超级菜单 35 条里每个菜单都用 `--------` 分隔导航按钮。实现为包装 `/buttons` 命令、处理刚打开的弹窗，不用全局 MutationObserver；样式在 `native-bridge.css`。

实测：

- `npm run check`、`npm test`（130 项，新增 13 项占位符单测）、`npm run build` 通过。
- 差分对照（只在本地 artifacts 运行，不入库）：抽出原脚本 `replaceTextAsync` 加桩，与新实现在超级菜单全部 189 段含占位符文本 × 2 种变量状态 × 弹窗开 / 关 × 3 种回答（空 / 填写 / 取消）共 2268 例比较文本、变量与弹窗开关，0 差异。
- `npm run verify:placeholders`（新增，端口偏移 500 本地实例）7 项通过，合成菜单与真实「👑超级菜单」导出（`WB_QR_SET=…`）各跑一遍：`/buttons` 工具栏；控制菜单 `⚙️@角色指定` 在原生弹窗上方弹出 7 个输入、设定名字后输入框为 `<>`；`🤝男女主汇合` 展开为已存名字；`👨切换主角-男主` 的 `/inject` 注入内容已展开；Enter / Tab 立即展开且不发送；重载后变量仍在并可展开；设置面板查看 / 编辑 / 删除。
- `verify:compat` 10 项通过（本地实例补装酒馆助手、`.env` 的模拟模型端口改为偏移后端口后）。
- `verify:workbench`：在「角色描述」处因 `getByLabel('角色描述')` 同时匹配世界书条目模板的隐藏复选框与角色编辑器 Markdown 字段而失败；用改动前基线 cad6ec8c0 单独构建复跑，同一位置同样失败，属既有问题，与本工作包无关，未修。

推断 / 未验证：

- 「换浏览器后变量仍在」以「重载后从酒馆设置读回」验证，未用第二个浏览器实测；存储位置是随设置同步的 `extension_settings`，推断成立。
- 手机布局、中文输入法组合输入（compositionstart/end 期间不展开）未做自动化验证，只有代码路径。
- 切到「原生」布局时工作台卸载，占位符随之停用（原脚本不依赖布局）；未处理。
- `/buttons` 的说明文字中的 `{@男主:男主}` 与原脚本一样原样显示，未展开。
