"""Render deterministic ANSI preview fixtures, not screenshots of a running terminal."""
import json,re,sys
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
root=Path(__file__).parent
for mode in ['work','error','history']:
 rows=json.loads((root/f'preview-{mode}.json').read_text(encoding='utf-8'));cw,ch=12,24
 im=Image.new('RGB',(120*cw,len(rows)*ch),'white');d=ImageDraw.Draw(im)
 fonts=[ImageFont.truetype('C:/Windows/Fonts/consola.ttf',20),ImageFont.truetype('C:/Windows/Fonts/consolab.ttf',20)]
 for y,row in enumerate(rows):
  fg=(31,41,51);bg=(255,255,255);bold=0;x=0
  for part in re.split(r'(\x1b\[[0-9;]*m)',row):
   if part.startswith('\x1b'):
    a=[int(v) for v in part[2:-1].split(';') if v];i=0
    while i<len(a):
     v=a[i]
     if v in (38,48) and i+4<len(a) and a[i+1]==2:
      if v==38:fg=tuple(a[i+2:i+5])
      else:bg=tuple(a[i+2:i+5])
      i+=5;continue
     if v==0:fg=(31,41,51);bg=(255,255,255);bold=0
     if v==39:fg=(31,41,51)
     if v==49:bg=(255,255,255)
     if v==1:bold=1
     if v==22:bold=0
     i+=1
   else:
    for char in part:
     d.rectangle((x*cw,y*ch,(x+1)*cw-1,(y+1)*ch-1),fill=bg)
     font=ImageFont.truetype('C:/Windows/Fonts/seguisym.ttf',20) if char in '✓◌' else fonts[bold]
     d.text((x*cw,y*ch),char,font=font,fill=fg);x+=1
 im.save(root/f'preview-{mode}.png')
