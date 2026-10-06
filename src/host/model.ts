import type {Data} from './types';
export const clone = <T,>(value:T):T => structuredClone(value);
export function activation(entry:Data) { return entry.constant ? 'constant' : entry.vectorized ? 'vector' : 'keyword'; }
export function setActivation(entry:Data, mode:string) { return {...entry,constant:mode==='constant',vectorized:mode==='vector'}; }
/** Patch only fields changed against the editor's base. Never overwrite an external edit silently. */
export function mergeEdits(base:Data, draft:Data, latest:Data):Data {
    const result = clone(latest);
    for (const key of new Set([...Object.keys(base), ...Object.keys(draft)])) {
        if (JSON.stringify(base[key]) === JSON.stringify(draft[key])) continue;
        if (JSON.stringify(latest[key]) !== JSON.stringify(base[key]) && JSON.stringify(latest[key]) !== JSON.stringify(draft[key]))
            throw new Error(`“${key}”已在其他页面修改。草稿已保留，请重新载入后合并。`);
        if (key in draft) result[key] = clone(draft[key]); else delete result[key];
    }
    return result;
}
export function validateBook(data:Data) {
    if (!data || Array.isArray(data) || typeof data.entries !== 'object' || !data.entries || Array.isArray(data.entries)) throw new Error('世界书需要 entries 对象。');
    for (const [id,e] of Object.entries(data.entries) as [string,Data][]) {
        if (!e || typeof e !== 'object' || String(e.uid) !== id || typeof e.content !== 'string' || !Array.isArray(e.key)) throw new Error(`条目 ${id} 的 uid、content 或 key 无效。`);
    }
}
export function mergeBook(base:Data,draft:Data,latest:Data) {
    validateBook(draft);
    const result=mergeEdits({...base,entries:undefined},{...draft,entries:undefined},{...latest,entries:undefined});
    result.entries=clone(latest.entries);
    for(const id of new Set([...Object.keys(base.entries),...Object.keys(draft.entries)])) {
        if(JSON.stringify(base.entries[id])===JSON.stringify(draft.entries[id])) continue;
        if(!base.entries[id]) { if(latest.entries[id]) throw new Error('条目编号冲突，请重新载入。'); result.entries[id]=clone(draft.entries[id]); }
        else if(!draft.entries[id]) { if(JSON.stringify(base.entries[id])!==JSON.stringify(latest.entries[id])) throw new Error('待删除条目已变更。'); delete result.entries[id]; }
        else { if(!latest.entries[id]) throw new Error('条目已被其他页面删除。'); result.entries[id]=mergeEdits(base.entries[id],draft.entries[id],latest.entries[id]); }
    }
    return result;
}
