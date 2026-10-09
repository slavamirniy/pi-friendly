import {createSurface} from '../surface.mjs';
import {createMenu} from '../menu.mjs';
import {palettes} from '../surface.mjs';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
const root=process.argv[2];
if(!root)throw new Error('Pass installed pi package directory');
const {truncateToWidth,visibleWidth}=await import(pathToFileURL(join(root,'node_modules/@earendil-works/pi-tui/dist/index.js')));
const rendering={truncate:truncateToWidth,measure:visibleWidth,matchesKey:(s,k)=>s===k};
const tui={terminal:{rows:36,columns:120,write(){}},requestRender(){}};
const data={scheme:'light',statuses:['Осталось 993 тыс.'],running:true,started:Date.now()-12000,steps:[{label:'Создаю файл · index.html',status:'done'},{label:'Обновляю файл · styles.css',status:'done'},{label:'Проверяю сборку',status:'running'}]};
const messages=[{role:'user',content:'Сделай сайт для моей пекарни'},{role:'assistant',content:'Собираю светлый сайт с меню, фотографиями и контактами.\nСейчас проверю, что страницы открываются без ошибок.'}];
messages.push({role:'assistant',content:[{type:'text',text:'Добавляю главную страницу и стили:'},{type:'toolCall',id:'page',name:'write',arguments:{path:'index.html',content:'<html>\n<body>Пекарня</body>\n</html>'}},{type:'toolCall',id:'css',name:'write',arguments:{path:'styles.css',content:'body {\n  color: #123;\n}'}}]},{role:'toolResult',toolCallId:'page',isError:false},{role:'toolResult',toolCallId:'css',isError:false});
const ctx={isIdle:()=>!data.running,model:{name:'Kimi K3'},sessionManager:{getBranch:()=>messages.map(message=>({type:'message',message}))}};
const surface=createSurface({tui,delegate:{getText:()=>'',render:w=>['─'.repeat(w),'','─'.repeat(w)]},rendering,ctx,actions:{},state:()=>data});
for(const mode of ['work','error','history']){
 if(mode==='error'){data.running=false;data.error={raw:'HTTP 429 too many requests'};}
 let rows=surface.render(120);
 if(mode==='history'){
  const menu=createMenu({...rendering,tui,theme:{fg:(_c,s)=>s,bg:(_c,s)=>s,bold:s=>s},done(){},title:'История разговоров',subtitle:'Все чаты · поиск по названию и проекту',searchable:true,panel:true,palette:palettes.light,items:[{label:'Сайт пекарни',description:'Bakery · 09.10.2026 · 8 сообщений'},{label:'Магазин цветов',description:'Flowers · 08.10.2026 · 12 сообщений'},{label:'План поездки',description:'Личное · 07.10.2026 · 5 сообщений'}]});
  rows=menu.render(94).map((row,i)=>truncateToWidth(rows[i],26,'')+row);menu.dispose();
 }
 writeFileSync(new URL(`preview-${mode}.json`,import.meta.url),JSON.stringify(rows));
}
