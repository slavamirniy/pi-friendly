// Fit using terminal cell widths, including Cyrillic and wide glyphs.
export function centered(text,width,truncate,measure){
 const value=truncate(text,Math.max(0,width),'');
 const gap=Math.max(0,width-measure(value)),left=Math.floor(gap/2);
 return ' '.repeat(left)+value+' '.repeat(gap-left);
}
export function buttonRows(label,width,truncate,measure){
 const inner=Math.max(0,width-2);
 return ['╭'+'─'.repeat(inner)+'╮','│'+centered(label,inner,truncate,measure)+'│','╰'+'─'.repeat(inner)+'╯'];
}

export function navigationRows(width,p,truncate,measure){
 const w=Math.min(16,Math.floor((width-5)/2)),gap=width-4-2*w;
 const paint=(text,bg,fg)=>`\x1b[48;2;${bg}m\x1b[38;2;${fg}m${text}\x1b[0m`;
 const back=buttonRows('← Назад',w,truncate,measure),close=buttonRows('× Закрыть',w,truncate,measure);
 return {width:w,rows:back.map((row,i)=>paint('  ',p.canvas,p.text)+paint(row,p.selection,p.text)+paint(' '.repeat(gap),p.canvas,p.text)+paint(close[i],p.button,p.text)+paint('  ',p.canvas,p.text))};
}
