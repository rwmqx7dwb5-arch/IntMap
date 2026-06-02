import tifffile, numpy as np, time
from PIL import Image
SRC=r"C:\Users\gyuuk\OneDrive\IntMap\koppen_geiger_0p00833333.tif"
OUT=r"C:\Users\gyuuk\OneDrive\IntMap\koppen_hires.png"
F=6  # block factor -> 7200x3600 (<=8192 GPU texture cap; full data via per-block mode)
# Beck et al. official Koppen-Geiger 30-class palette (index 1..30), 0=ocean/no-data->transparent
PAL = {
 1:(0,0,255),2:(0,120,255),3:(70,170,250),4:(255,0,0),5:(255,150,150),
 6:(245,165,0),7:(255,220,100),8:(255,255,0),9:(200,200,0),10:(150,150,0),
 11:(150,255,150),12:(100,200,100),13:(50,150,50),14:(200,255,80),15:(100,255,80),
 16:(50,200,0),17:(255,0,255),18:(200,0,200),19:(150,50,150),20:(150,100,150),
 21:(170,175,255),22:(90,120,220),23:(75,80,180),24:(50,0,135),25:(0,255,255),
 26:(55,200,255),27:(0,125,125),28:(0,70,95),29:(178,178,178),30:(102,102,102)
}
t0=time.time()
with tifffile.TiffFile(SRC) as t:
    arr=t.pages[0].asarray()  # (21600,43200) uint8
H,W=arr.shape
OH,OW=H//F, W//F
arr=arr[:OH*F,:OW*F]
out=np.zeros((OH,OW),dtype=np.uint8)
STRIPE=600
for y0 in range(0,OH,STRIPE):
    y1=min(OH,y0+STRIPE)
    blk=arr[y0*F:y1*F].reshape(y1-y0,F,OW,F)
    best_cnt=np.zeros((y1-y0,OW),dtype=np.int16)
    best_cls=np.zeros((y1-y0,OW),dtype=np.uint8)
    for c in range(1,31):
        cnt=(blk==c).sum(axis=(1,3)).astype(np.int16)
        m=cnt>best_cnt
        best_cls[m]=c; best_cnt[m]=cnt[m]
    out[y0:y1]=best_cls
    print("stripe",y0,"/",OH,"%.1fs"%(time.time()-t0),flush=True)
rgba=np.zeros((OH,OW,4),dtype=np.uint8)
for c,(r,g,b) in PAL.items():
    rgba[out==c]=(r,g,b,255)
Image.fromarray(rgba,'RGBA').save(OUT,optimize=True)
import os
print("DONE",OW,"x",OH,"->",OUT,"%.2f MB"%(os.path.getsize(OUT)/1e6),"%.1fs"%(time.time()-t0),flush=True)
