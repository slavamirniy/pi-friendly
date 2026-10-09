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
