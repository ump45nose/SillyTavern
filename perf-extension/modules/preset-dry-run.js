/**
 * 预设 dry-run 后台化
 * 来源：cocktail modules/preset-panel-optimizer.js — https://github.com/Lianues/cocktail （作者 Limerence）
 *
 * PromptManager.render(true) 在 1.19.0（public/scripts/PromptManager.js render）里先 await tryGenerate()
 * 做 dry-run token 计数再画列表，开关条目要等计数结束才变化。这里先 render(false) 立即画 UI，dry-run
 * 防抖、单飞放到后台，完成后再 render(false) 刷新计数。只补 prototype.render；BaiBai 补的
 * makeDraggable / renderPromptManagerListItems / getPromptCollection 都是实例级，互不干涉。
 */
const DEBOUNCE_MS = 250;

let PromptManager = null, script = null, groups = null, utils = null;

export default {
    id: 'presetDryRun',
    title: '预设面板：先切换 UI，后台补齐 token 计数',
    async probe() {
        [{ PromptManager }, script, groups, utils] = await Promise.all([
            import('/scripts/PromptManager.js'),
            import('/script.js'),
            import('/scripts/group-chats.js'),
            import('/scripts/utils.js'),
        ]);
        if (typeof PromptManager?.prototype?.render !== 'function') return '找不到 PromptManager.prototype.render';
        if (typeof utils.waitUntilCondition !== 'function') return '找不到 utils.waitUntilCondition';
        return null;
    },
    install() {
        const proto = PromptManager.prototype, original = proto.render;
        const state = new WeakMap();
        let active = true;
        const schedule = pm => {
            const s = state.get(pm) ?? { timer: 0, running: false, again: false };
            state.set(pm, s);
            clearTimeout(s.timer);
            s.timer = setTimeout(async () => {
                if (s.running) return void (s.again = true);
                s.running = true;
                try {
                    // The native render waits the same way before its dry-run: never compete with a live generation.
                    await utils.waitUntilCondition(() => !script.is_send_press && !groups.is_group_generating, 1024 * 1024, 100);
                    await pm.tryGenerate();
                } catch (error) {
                    console.debug('[wb-perf] background dry-run failed', error);
                } finally {
                    s.running = false;
                    if (active) original.call(pm, false);
                    if (s.again) {
                        s.again = false;
                        schedule(pm);
                    }
                }
            }, DEBOUNCE_MS);
        };
        function render(afterTryGenerate = true) {
            if (!active || afterTryGenerate !== true) return original.call(this, afterTryGenerate);
            original.call(this, false);
            schedule(this);
        }
        proto.render = render;
        return () => {
            active = false;
            if (proto.render === render) proto.render = original;
        };
    },
};
