import tifffile, numpy as np
f=r"C:\Users\gyuuk\OneDrive\IntMap\koppen_geiger_0p00833333.tif"
with tifffile.TiffFile(f) as t:
    p=t.pages[0]
    print("shape",p.shape,"dtype",p.dtype)
    print("compression",p.compression)
    print("photometric",p.photometric)
    tags={k:v.value for k,v in p.tags.items()}
    for key in ["ImageWidth","ImageLength","ModelPixelScaleTag","ModelTiepointTag",
                "BitsPerSample","SamplesPerPixel","ColorMap","GDAL_NODATA",
                "GeoKeyDirectoryTag"]:
        if key in tags:
            v=tags[key]
            if key=="ColorMap":
                cm=np.array(v).reshape(3,-1).T
                print("ColorMap rows",cm.shape[0])
                for i in range(min(35,cm.shape[0])):
                    r,g,b=cm[i]
                    print("  idx",i,"->",r>>8,g>>8,b>>8)
            else:
                print(key,v)
    arr=p.asarray()
    print("full array shape",arr.shape,"dtype",arr.dtype,"min",int(arr.min()),"max",int(arr.max()))
    u,c=np.unique(arr,return_counts=True)
    print("unique values:",list(zip(u.tolist(),c.tolist())))
