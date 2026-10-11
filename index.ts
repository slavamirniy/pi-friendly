import {createHostBridge} from './web-host.mjs';
import {startWebServer} from './web-server.mjs';
import {createRpc} from './web-rpc.mjs';
import {spawn} from 'node:child_process';
import {readClipboardText} from './clipboard.mjs';
import { createVoiceService } from './voice.mjs';
import { copyToClipboard, CustomEditor, SessionManager, getAgentDir, getPackageDir, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Input, Markdown, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { createProjectStore } from "./projects.mjs";
import { join } from "node:path";
import { installFriendly } from "./friendly.mjs";
export default function friendly(pi: ExtensionAPI) {
  const preferencePath = join(getAgentDir(), "friendly-ui.json");
  const projects=createProjectStore({root:join(homedir(),"Documents","AI DIY Projects"),registry:join(getAgentDir(),"friendly-projects.jsonl"),SessionManager});
  let web: any, opening: Promise<any> | undefined;
  const hostObservers=new Set<(event:any)=>void>();
  for(const type of ['agent_start','agent_end','message_start','message_update','message_end','tool_execution_start','tool_execution_end'] as const)pi.on(type,(event:any)=>{for(const emit of hostObservers)emit(event);});
  const openWeb=async(ctx: any, voice: any, getHostStatuses: any=()=>[])=>{
    if(process.env.PI_FRIENDLY_WEB_CHILD==='1')return;
    if(!web||web.closed){
      opening??=startWebServer({projects,listSessions:()=>SessionManager.listAll(),readSession:(path: string)=>SessionManager.open(path).buildSessionContext().messages,
        makeHostRpc:({onEvent}:any)=>createHostBridge({pi,ctx,observers:hostObservers,onEvent}),
        getHostStatuses,models:()=>ctx.modelRegistry.getAvailable(),hostSession:()=>ctx.sessionManager.getSessionFile(),voice,
        makeRpc:(options: any)=>createRpc({...options,cli:join(getPackageDir(),'dist','bundle','cli.js'),model:ctx.model})});
      try{web=await opening;}finally{opening=undefined;}
    }
    const url=web.url;
    await new Promise<void>((resolve,reject)=>{
      const child=process.platform==='win32'?spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,stdio:'ignore'}):spawn(process.platform==='darwin'?'open':'xdg-open',[url],{stdio:'ignore'});
      child.once('error',reject);child.once('spawn',()=>{child.unref();resolve();});
    });
    ctx.ui.notify('Веб-интерфейс открыт в браузере. Оставьте pi запущенным.','info');
  };
  pi.on('session_shutdown',async()=>{await web?.close();web=undefined;});
  installFriendly(pi, { openWeb, copyToClipboard, readClipboardText, matchesKey, truncate: truncateToWidth, measure: visibleWidth,
    makeInput: () => new Input(),
    createVoice: callbacks => createVoiceService({root:join(getAgentDir(),'friendly-voice'),...callbacks}),
    makeEditor: (tui, theme, keys) => new CustomEditor(tui, theme, keys),
    listSessions: () => SessionManager.listAll(),
    projects,
    loadPrefs: () => { try { return JSON.parse(readFileSync(preferencePath, "utf8")); } catch { return {}; } },
    savePrefs: prefs => writeFileSync(preferencePath, JSON.stringify(prefs), "utf8"),
    markdown: (text, width, palette) => {
      const color = value => s => `\x1b[38;2;${value}m${s}\x1b[39m`;
      const accent = color(palette.accent), muted = color(palette.muted);
      return new Markdown(text, 0, 0, {
        heading: accent, link: accent, linkUrl: muted, code: accent, codeBlock: s => s,
        codeBlockBorder: muted, quote: muted, quoteBorder: muted, hr: muted, listBullet: accent,
        bold: s => `\x1b[1m${s}\x1b[22m`, italic: s => `\x1b[3m${s}\x1b[23m`,
        strikethrough: s => s, underline: s => s,
      }).render(width);
    },
  });
}
