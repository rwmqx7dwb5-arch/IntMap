from PIL import Image
Image.MAX_IMAGE_PIXELS=None
p=r"C:\Users\gyuuk\OneDrive\IntMap\koppen_hires.png"
im=Image.open(p); W,H=im.size  # 7200x3600, lat 90..-90
# crop to Mercator-valid latitude band  ~ +/-85.05 deg
top=round((90-85.05)/180*H)     # 99
bot=round((90+85.05)/180*H)     # 3501
im2=im.crop((0,top,W,bot))
im2.save(p,optimize=True)
print("cropped rows",top,bot,"->",im2.size,"top_lat",90-top/H*180,"bot_lat",90-bot/H*180)
