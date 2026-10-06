import React from 'react';
import {createRoot,Root} from 'react-dom/client';
import {HostAdapter,nativeNodes} from './host/adapter';
import App,{beforeClose} from './App';
import {createTrace} from '../extension/trace.js';
import './style.css';
const context=window.SillyTavern?.getContext?.();
const metrics:Record<string,number>={extensionLoadedMs:performance.now()};
let root:Root|undefined,container:HTMLElement|undefined,toolbar:HTMLElement|undefined,host:HostAdapter|undefined,trace:ReturnType<typeof createTrace>|undefined;
let mounted=false,mounting=false,disposed=false;
const launcher=document.createElement('button');launcher.id='wb-launcher';launcher.textContent='Noval 工作台';
const media=matchMedia('(min-width: 1024px)');
async function mount(){
 if(mounted||mounting||disposed)return;
 if(!media.matches){launcher.title='横屏工作台需要至少 1024px 宽度';return;}
 if(window.storyWorkspace){launcher.textContent='请先停用 Story Workspace';return;}
 if(!nativeNodes.chat||!nativeNodes.input)return;
 mounting=true;
 try{
  host=new HostAdapter();await host.init();if(disposed){host.destroy();return;}
  trace=createTrace(context);
  container=document.createElement('div');container.id='wb-root';container.className='wb-ui';document.body.append(container);
  toolbar=document.createElement('div');toolbar.className='wb-composer-tools wb-ui';document.querySelector('#send_form')!.append(toolbar);
  root=createRoot(container);root.render(<App host={host} trace={trace} toolbar={toolbar} onExit={()=>{context.accountStorage.setItem('wb-native','true');unmount();}}/>);
  document.body.classList.add('wb-active');launcher.hidden=true;mounted=true;metrics.mountedMs=performance.now();
 }catch(error){console.error('[Workbench] mount failed',error);unmount();launcher.textContent='工作台载入失败 · 重试';}finally{mounting=false;}
}
function unmount(){root?.unmount();root=undefined;host?.destroy();host=undefined;trace?.destroy();trace=undefined;container?.remove();toolbar?.remove();container=undefined;toolbar=undefined;document.body.classList.remove('wb-active','wb-left-open','wb-right-open','wb-input-full','wb-native-panel');mounted=false;launcher.hidden=false;}
launcher.addEventListener('click',()=>{context.accountStorage.removeItem('wb-native');void mount();});
function start(){document.body.append(launcher);if(context.accountStorage.getItem('wb-native')!=='true')void mount();}
function ready(){metrics.appReadyMs=performance.now();start();}
context.eventSource.on(context.eventTypes.APP_READY,ready);
context.eventSource.on(context.eventTypes.APP_INITIALIZED,initialized);
function initialized(){metrics.appInitializedMs=performance.now();}
const resize=()=>{if(!media.matches&&mounted&&beforeClose())unmount();};media.addEventListener('change',resize);
window.workbench={mount,unmount,metrics,nativeNodes,get mounted(){return mounted;},get host(){return host;},get records(){return trace?.records??[];},clear:()=>trace?.clear(),capabilities:()=>({context:true,nativeChat:!!nativeNodes.chat?.isConnected,nativeInput:!!nativeNodes.input?.isConnected,helper:typeof (window as any).TavernHelper?.getChatMessages==='function'})};
// Keep the verified diagnostics interface available for regression tooling.
window.workbenchProbe=window.workbench;
window.addEventListener('pagehide',()=>{disposed=true;unmount();launcher.remove();media.removeEventListener('change',resize);context.eventSource.removeListener(context.eventTypes.APP_READY,ready);context.eventSource.removeListener(context.eventTypes.APP_INITIALIZED,initialized);},{once:true});
