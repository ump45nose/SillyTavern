import type {Data,HostSnapshot,Item,Preferences,Resource} from './types';
import {clone,mergeBook,mergeEdits} from './model';
const load = (path:string):Promise<any> => import(/* @vite-ignore */ path);
const ctx = () => window.SillyTavern.getContext();
export const nativeNodes={chat:document.getElementById('chat'),input:document.getElementById('send_textarea')};
const defaults:Preferences={left:true,bindings:{},groups:{}};
let generating=false;
export class HostAdapter {
    private listeners=new Set<()=>void>(); private cleanup:(()=>void)[]=[];
    private version=0; private cache:HostSnapshot|null=null; private world:any; private personas:any;
    private busy=false; private bindingRun=false; private suspendedDialogs:HTMLDialogElement[]=[];
    async init() {
        [this.world,this.personas]=await Promise.all([load('/scripts/world-info.js'),load('/scripts/personas.js')]);
        const c=ctx();
        const events=['CHAT_CHANGED','MESSAGE_RECEIVED','MESSAGE_SENT','MESSAGE_UPDATED','MESSAGE_DELETED','CHARACTER_EDITED','CHARACTER_DELETED','CHARACTER_SELECTED','SETTINGS_UPDATED','OAI_PRESET_CHANGED_AFTER','PRESET_CHANGED','WORLDINFO_UPDATED','WORLDINFO_SETTINGS_UPDATED','PERSONA_CHANGED','PERSONA_UPDATED','CONNECTION_PROFILE_LOADED','CONNECTION_PROFILE_CREATED','CONNECTION_PROFILE_UPDATED','CONNECTION_PROFILE_DELETED','ONLINE_STATUS_CHANGED'];
        for(const name of events) this.listen(name,()=>this.refresh());
        this.listen('GENERATION_STARTED',(_type:any,_options:any,dry:boolean)=>{if(!dry){generating=true;this.refresh();}});
        for(const name of ['GENERATION_ENDED','GENERATION_STOPPED'])this.listen(name,()=>{generating=false;this.refresh();});
        
        const handler=(e:Event)=>{if(!(e.target as Element)?.closest?.('#wb-root'))this.refresh();};
        document.addEventListener('change',handler); this.cleanup.push(()=>document.removeEventListener('change',handler));
        // Same settings object as the host; this contains no connection credentials.
        c.extensionSettings.workbench ??= clone(defaults);
        this.refresh();
    }
    private listen(name:string,fn:(...args:any[])=>void){const c=ctx(),event=c.eventTypes[name];if(event){c.eventSource.on(event,fn);this.cleanup.push(()=>c.eventSource.removeListener(event,fn));}}
    subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn);};};
    revision=()=>this.version;
    refresh=()=>{this.cache=null;this.version++;this.listeners.forEach(fn=>fn());};
    report(error:unknown){window.dispatchEvent(new CustomEvent('wb-error',{detail:error instanceof Error?error.message:String(error)}));}
    prefs():Preferences{return {...clone(defaults),...ctx().extensionSettings.workbench};}
    preference(patch:Partial<Preferences>){Object.assign(ctx().extensionSettings.workbench,patch);ctx().saveSettingsDebounced();this.refresh();}
    async persistSettings(){
        const c=ctx(),event=c.eventTypes.SETTINGS_UPDATED;let saved=false;
        const done=()=>{saved=true;};c.eventSource.on(event,done);
        try{const script=await load('/script.js');await script.saveSettings();if(!saved)throw new Error('酒馆设置未确认保存，草稿已保留，请重试。');}
        finally{c.eventSource.removeListener(event,done);}
    }
    quickReplies(){const api=(window as any).quickReplyApi;if(!api)return [];return [...api.settings.config.setList,...(api.settings.chatConfig?.setList??[])].flatMap((item:any)=>item.set.qrList.filter((qr:any)=>!qr.isHidden).map((qr:any)=>({id:qr.id,set:item.set.name,label:qr.label,execute:()=>qr.onExecute()})));}
    async request(path:string,body:Data) {
        const response=await fetch(path,{method:'POST',headers:ctx().getRequestHeaders(),body:JSON.stringify(body)});
        if(!response.ok)throw new Error(`保存或读取失败（HTTP ${response.status}），草稿已保留。`);
        return response;
    }
    snapshot():HostSnapshot {
        if(this.cache)return this.cache;
        const c=ctx(),manager=c.getPresetManager(),profiles=c.extensionSettings.connectionManager?.profiles??[];
        const characters:Item[]=c.characters.map((x:Data,i:number)=>({id:x.avatar,name:x.name,detail:(x.data?.tags??[]).join(' · '),image:c.getThumbnailUrl('avatar',x.avatar),active:i===Number(c.characterId),data:x}));
        const personas=c.powerUserSettings.personas??{};
        const resources:Record<Resource,Item[]>={
            connection:profiles.map((p:Data)=>({id:p.id,name:p.name,detail:this.prefs().groups[p.id]||p.model||p.api||'其他模型',data:p})).sort((a:Item,b:Item)=>(a.detail??'').localeCompare(b.detail??'')||a.name.localeCompare(b.name)),
            preset:(manager?.getAllPresets()??[]).map((name:string)=>({id:name,name,detail:c.mainApi})),
            world:c.getWorldInfoNames().map((name:string)=>({id:name,name,active:this.world?.selected_world_info.includes(name)})),
            persona:Object.entries(personas).map(([id,name])=>({id,name:String(name),image:c.getThumbnailUrl('persona',id),detail:c.powerUserSettings.persona_descriptions?.[id]?.title??''})),
        };
        return this.cache={character:characters.find(x=>x.active)??null,characters,resources,current:{connection:c.extensionSettings.connectionManager?.selectedProfile??'',preset:manager?.getSelectedPresetName()??'',world:this.world?.selected_world_info[0]??'',persona:this.personas?.user_avatar??''},online:c.onlineStatus!=='no_connection',busy:this.busy||generating||Boolean(c.streamingProcessor),messages:c.chat.map((m:Data,i:number)=>({id:i,name:m.name,text:m.mes,is_user:m.is_user}))};
    }
    model(){const c=ctx();return c.mainApi==='openai'?c.getChatCompletionModel():c.textCompletionSettings?.model??c.mainApi;}
    bindingKey(kind:'connection'|'model'){return kind==='connection'?`connection:${this.snapshot().current.connection}`:`model:${ctx().mainApi}:${this.model()}`;}
    async applyBinding(){if(this.bindingRun)return;const p=this.prefs(),name=p.bindings[this.bindingKey('connection')]||p.bindings[this.bindingKey('model')];if(!name)return;this.bindingRun=true;try{await this.select('preset',name);}finally{this.bindingRun=false;}}
    async select(kind:Resource,id:string){
        if(this.snapshot().busy)throw new Error('请等待当前生成或切换完成。');
        this.busy=true;this.refresh();
        try{
            if(kind==='connection'){
                const select=document.querySelector<HTMLSelectElement>('#connection_profiles');
                if(!select||![...select.options].some(x=>x.value===id))throw new Error('连接不存在，请刷新列表。');
                await new Promise<void>((resolve,reject)=>{
                    const c=ctx(),event=c.eventTypes.CONNECTION_PROFILE_LOADED;
                    const done=()=>{clearTimeout(timer);c.eventSource.removeListener(event,done);resolve();};
                    const timer=setTimeout(()=>{c.eventSource.removeListener(event,done);reject(new Error('连接切换超时，请检查原生连接状态。'));},15000);
                    c.eventSource.on(event,done);select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));
                });
            }else if(kind==='preset'){
                const m=ctx().getPresetManager();const value=m?.findPreset(id);if(value===undefined||value===null)throw new Error('当前 API 没有此预设。');await m.selectPreset(value);
            }else if(kind==='persona'){await this.personas.setUserAvatar(id);}
            // Worldbooks are multi-select: navigation never disables another book.
        }finally{this.busy=false;this.refresh();}
        if(kind==='connection')await this.applyBinding();
    }
    async toggleBook(name:string,on:boolean){const select=window.jQuery('#world_info');const values=new Set<string>(this.world.selected_world_info);on?values.add(name):values.delete(name);select.val([...values]).trigger('change');this.refresh();}
    async readBook(name:string){const response=await this.request('/api/worldinfo/get',{name});return response.json();}
    async saveBook(name:string,base:Data,draft:Data){
        const latest=await this.readBook(name),data=mergeBook(base,draft,latest);
        await this.request('/api/worldinfo/edit',{name,data});
        this.world.worldInfoCache.set(name,clone(data));
        await ctx().eventSource.emit(ctx().eventTypes.WORLDINFO_UPDATED,name,clone(data));
        ctx().reloadWorldInfoEditor(name);this.refresh();return clone(data);
    }
    async createEntry(name:string,data:Data){return this.world.createWorldInfoEntry(name,data);}
    async selectCharacter(id:string){if(this.snapshot().busy)throw new Error('生成完成后再切换角色。');const index=ctx().characters.findIndex((x:Data)=>x.avatar===id);if(index<0)throw new Error('角色已不存在。');await ctx().selectCharacterById(index);this.refresh();}
    async characterData(id:string){const i=ctx().characters.findIndex((x:Data)=>x.avatar===id);if(i<0)throw new Error('角色已不存在。');const response=await this.request('/api/characters/get',{avatar_url:id});return response.json();}
    async saveCharacter(id:string,base:Data,draft:Data){
        const latest=await this.characterData(id),merged=mergeEdits(base,draft,latest.data??{});
        const patch:Data={};for(const k of Object.keys(draft))if(JSON.stringify(base[k])!==JSON.stringify(draft[k]))patch[k]=merged[k];
        if(Object.keys(patch).length){await this.request('/api/characters/merge-attributes',{avatar:id,data:patch});await ctx().getCharacters();await ctx().eventSource.emit(ctx().eventTypes.CHARACTER_EDITED);}
        this.refresh();return this.characterData(id);
    }
    async favorite(item:Item){const c=await this.characterData(item.id),base=clone(c.data??{}),draft=clone(base);draft.extensions={...draft.extensions,fav:!draft.extensions?.fav};return this.saveCharacter(item.id,base,draft);}
    async exportCharacter(id:string){const response=await this.request('/api/characters/export',{avatar_url:id,format:'png'});this.download(await response.blob(),id);}
    async deleteCharacters(ids:string[]){if(!ids.length)return;if(ids.includes(this.snapshot().character?.id??''))throw new Error('请先切换到未被选中的角色，再删除当前角色。');for(const id of ids){await this.request('/api/characters/delete',{avatar_url:id,delete_chats:false});}await ctx().getCharacters();this.refresh();}
    async tagCharacters(ids:string[],tag:string){if(!ids.length||!tag.trim())return;for(const id of ids){const c=await this.characterData(id),base=clone(c.data??{});await this.saveCharacter(id,base,{...base,tags:[...new Set([...(base.tags??[]),tag.trim()])]});}}
    presetData(name:string){const m=ctx().getPresetManager();const {presets,preset_names}=m.getPresetList();const i=Array.isArray(preset_names)?preset_names.indexOf(name):preset_names[name];if(i===undefined||i<0)throw new Error('预设不存在');return clone(presets[i]);}
    async savePreset(name:string,base:Data,draft:Data){const merged=mergeEdits(base,draft,this.presetData(name));await ctx().getPresetManager().savePreset(name,merged);this.refresh();return merged;}
    async saveProfile(id:string,base:Data,patch:Data){const cm=ctx().extensionSettings.connectionManager;const profile=cm.profiles.find((x:Data)=>x.id===id);if(!profile)throw new Error('连接已删除。');Object.assign(profile,mergeEdits(base,{...base,...patch},profile));await this.persistSettings();const option=[...document.querySelectorAll<HTMLOptionElement>('#connection_profiles option')].find(x=>x.value===id);if(option)option.textContent=profile.name;await ctx().eventSource.emit(ctx().eventTypes.CONNECTION_PROFILE_UPDATED,profile);this.refresh();}
    personaData(id:string){const p=ctx().powerUserSettings;return clone({name:p.personas[id],...(p.persona_descriptions[id]??{})});}
    async savePersona(id:string,base:Data,draft:Data){const merged=mergeEdits(base,draft,this.personaData(id)),p=ctx().powerUserSettings;p.personas[id]=merged.name;const {name,...description}=merged;p.persona_descriptions[id]=description;
        if(id===this.personas.user_avatar){p.persona_description=description.description??'';window.jQuery('#persona_description').val(p.persona_description);}
        await this.persistSettings();await this.personas.getUserAvatars();await ctx().eventSource.emit(ctx().eventTypes.PERSONA_UPDATED,id);this.refresh();return merged;}
    async recentChats(){const c=this.snapshot().character;if(!c)return [];const r=await this.request('/api/characters/chats',{avatar_url:c.id});return Object.values(await r.json()) as Data[];}
    async openChat(name:string){await ctx().openCharacterChat(name.replace(/\.jsonl$/,''));this.refresh();}
    async jump(id:number){const selector=`#chat .mes[mesid="${id}"]`;let node=document.querySelector(selector);for(let i=0;!node&&i<50;i++){const button=document.querySelector<HTMLElement>('#show_more_messages');if(!button)break;button.click();await new Promise(r=>setTimeout(r,20));node=document.querySelector(selector);}node?.scrollIntoView({block:'center',behavior:'smooth'});}
    click(selector:string){const element=document.querySelector<HTMLElement>(selector);if(!element)throw new Error('当前酒馆未提供此入口。');element.click();}
    native(kind:string){this.suspendedDialogs=[...document.querySelectorAll<HTMLDialogElement>('.wb-dialog[open]')];this.suspendedDialogs.forEach(d=>d.close());document.body.classList.add('wb-native-panel');const selectors:Record<string,string>={connection:'#rm_api_block .drawer-toggle',preset:'#left-nav-panel .drawer-toggle',world:'#WI-SP-button .drawer-toggle',persona:'#persona-management-button .drawer-toggle',character:'#rightNavDrawerIcon',settings:'#user-settings-button .drawer-icon',quickreply:'#extensions-settings-button .drawer-icon'};
        // Drawer container names differ from the contents; selectors are isolated here.
        const fallback:Record<string,string>={connection:'#API-status-top',preset:'#leftNavDrawerIcon',world:'#WIDrawerIcon',persona:'#persona-management-button .drawer-icon'};
        let el=document.querySelector<HTMLElement>(selectors[kind]??selectors.settings)??document.querySelector<HTMLElement>(fallback[kind]);
        if(!el)throw new Error('原生面板不可用，请返回原界面。');if(!el.classList.contains('openIcon'))el.click();}
    closeNative(){document.querySelectorAll<HTMLElement>('#top-settings-holder .drawer-icon.openIcon').forEach(x=>x.click());document.body.classList.remove('wb-native-panel');this.suspendedDialogs.filter(d=>d.isConnected).forEach(d=>d.showModal());this.suspendedDialogs=[];}
    download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    destroy(){this.cleanup.forEach(fn=>fn());this.cleanup=[];this.listeners.clear();this.closeNative();}
}
