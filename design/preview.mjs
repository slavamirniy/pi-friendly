import {createExitDialog} from '../exit-dialog.mjs';
import {createSurface} from '../surface.mjs';
import {createProjectForm} from '../project-form.mjs';
import {createMenu} from '../menu.mjs';
import {palettes} from '../surface.mjs';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const root=process.argv[2];
if(!root)throw new Error('Pass installed pi package directory');
const {Input,truncateToWidth,visibleWidth}=await import(pathToFileURL(join(root,'node_modules/@earendil-works/pi-tui/dist/index.js')));
const rendering={truncate:truncateToWidth,measure:visibleWidth,matchesKey:(s,k)=>s===k};
const tui={terminal:{rows:36,columns:120,write(){}},requestRender(){}};
const data={scheme:'light',projectName:'Сайт пекарни',statuses:['Осталось 993 тыс.'],running:true,started:Date.now()-12000,steps:[{label:'Создаю файл · index.html',status:'done'},{label:'Обновляю файл · styles.css',status:'done'},{label:'Проверяю сборку',status:'running'}]};
const messages=[{role:'user',content:'Сделай сайт для моей пекарни'},{role:'assistant',content:'Собираю светлый сайт с меню, фотографиями и контактами.\nСейчас проверю, что страницы открываются без ошибок.'}];
messages.push({role:'assistant',content:[{type:'text',text:'Добавляю главную страницу и стили:'},{type:'toolCall',id:'page',name:'write',arguments:{path:'index.html',content:'<html>\n<body>Пекарня</body>\n</html>'}},{type:'toolCall',id:'css',name:'write',arguments:{path:'styles.css',content:'body {\n  color: #123;\n}'}}]},{role:'toolResult',toolCallId:'page',isError:false},{role:'toolResult',toolCallId:'css',isError:false});
const ctx={isIdle:()=>!data.running,model:{name:'Kimi K3'},sessionManager:{getBranch:()=>messages.map(message=>({type:'message',message}))}};
const surface=createSurface({tui,delegate:{getText:()=>'',render:w=>['─'.repeat(w),'','─'.repeat(w)]},rendering,ctx,actions:{},state:()=>data});
for(const mode of ['work','error','history','chats','form','exit','project-choice','voice-recording','voice-progress','voice-download']){
 if(mode==='error'){data.running=false;data.error={raw:'HTTP 429 too many requests'};}
 data.paneOpen=['history','chats','form'].includes(mode);
 let rows=surface.render(120);
 if(['history','chats','form'].includes(mode)){
  const projectItems=[{kind:'primary',label:'+ Новый проект',description:'Создать проект с отдельной папкой'},{label:'Сайт пекарни',description:'2 чата · открыть список чатов'},{label:'Магазин цветов',description:'1 чат · открыть список чатов'}];
  const chatItems=[{kind:'back',label:'← Все проекты',description:'Выбрать другой проект'},{kind:'primary',label:'+ Новый чат',description:'Начать разговор в этом проекте'},{label:'Главная страница',description:'09.10.2026 · сообщений: 8'},{label:'Меню и контакты',description:'09.10.2026 · сообщений: 5'}];
  const menu=mode==='form'?createProjectForm({...rendering,tui,done(){},palette:palettes.light,makeInput:()=>{const input=new Input();input.setValue('Сайт пекарни');return input;}}):createMenu({...rendering,tui,theme:{fg:(_c,s)=>s,bg:(_c,s)=>s,bold:s=>s},done(){},title:mode==='history'?'Проекты':'Сайт пекарни',subtitle:mode==='history'?'Шаг 1 из 2 · выберите проект':'Шаг 2 из 2 · выберите чат',searchable:true,panel:true,palette:palettes.light,items:mode==='history'?projectItems:chatItems});
  rows=menu.render(94).map((row,i)=>truncateToWidth(rows[i],26,'')+row);menu.dispose();
 }

 if(mode==='exit'){data.error=undefined;data.paneOpen=false;const popup=createExitDialog({...rendering,tui,done(){},palette:palettes.light,background:w=>surface.render(w)});rows=popup.render(120);popup.dispose();}
 if(mode==='project-choice'){
  data.error=undefined;data.paneOpen=true;rows=surface.render(120);
  const menu=createMenu({...rendering,tui,theme:{},done(){},palette:palettes.light,panel:true,bottom:true,title:'Сначала выберите проект',subtitle:'Каждый проект — отдельная папка. Ваш текст сохранён.',items:[{kind:'primary',label:'Новый проект',description:'Отдельная папка для новой задачи'},{label:'Выбрать проект',description:'Открыть существующий проект и его чаты'}]});
  rows=menu.render(94).map((row,i)=>truncateToWidth(rows[i],26,'')+row);menu.dispose();
 }
 if(mode.startsWith('voice-')){
  data.error=undefined;data.paneOpen=false;data.running=false;
  data.voice=mode==='voice-recording'?{phase:'recording',seconds:92,level:.8}:mode==='voice-progress'?{phase:'transcribing',percent:64}:{phase:'downloading',percent:42,label:'GigaAM · 225 МБ'};
  rows=surface.render(120);
 }
 writeFileSync(new URL(`preview-${mode}.json`,import.meta.url),JSON.stringify(rows));
}
