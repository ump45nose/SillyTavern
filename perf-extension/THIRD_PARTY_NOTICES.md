# 第三方声明

Workbench · Perf 的六个模块改编自下面两个 SillyTavern 扩展，每个模块文件头部也注明了来源。

## cocktail（鸡尾酒）

- 仓库：<https://github.com/Lianues/cocktail>
- 作者：Limerence（原项目 `manifest.json` 的 `author`；仓库属于 GitHub 账号 Lianues）

| 本扩展文件 | 改编自原项目文件 |
| --- | --- |
| `modules/startup.js` | `modules/startup-optimizer.js` |
| `modules/preset-dry-run.js` | `modules/preset-panel-optimizer.js` |
| `modules/regex-refresh.js` | `modules/regex-refresh-optimizer.js` |
| `modules/drawer-animation.js` | `modules/ui-animation-optimizer.js` |
| `modules/worldinfo-drag.js` | `modules/worldinfo-drag-optimizer.js` |

## ST-BaiBai-Tools（柏宝箱）

- 仓库：<https://github.com/baibai-git/ST-BaiBai-Tools>
- 作者：柏柏（原项目 `manifest.json` 的 `author`；仓库属于 GitHub 账号 baibai-git）

| 本扩展文件 | 改编自原项目文件 |
| --- | --- |
| `modules/save-gzip.js`（压缩条件的判断拆在 `lib/gzip.js`） | `src/features/gzipHook.js` 的 `installSaveRequestGzipFetchHook` |

## 许可状态

两个原项目都没有附许可证，也没有写版权行：仓库里没有 LICENSE、COPYING 一类文件，提交历史里也没有出现过，GitHub 未识别出许可证；`manifest.json`（以及 ST-BaiBai-Tools 的 `package.json`）没有许可证字段，原项目自己的源码里也没有版权或许可声明（2026-11-06 核查；cocktail 为提交 `fc5292443`、版本 0.1.17，ST-BaiBai-Tools 为提交 `1e87dfaad`、版本 1.1.5）。因此这里没有可附的许可证全文；上述模块中来自原项目的部分，著作权归各自的原作者。
