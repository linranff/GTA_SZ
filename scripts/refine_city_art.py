from pathlib import Path
# Original procedural textures; no AI concept pixels are substituted for geometry.
p=Path('scripts/make_city_materials.py');s=p.read_text().replace('c=(int(44+r*24),int(75+r*23),int(94+r*26))','c=(int(99+r*30),int(124+r*28),int(140+r*27))').replace('(105,134,139)','(163,178,179)').replace('(32,48,58)','(61,77,83)').replace('(102,122,123)','(143,160,162)');p.write_text(s)
s+='''\nfor kind in ['grass','paving']:\n im=Image.new('RGB',(512,512));pix=im.load();rng=random.Random(331)\n for y in range(512):\n  for x in range(512):\n   n=rng.uniform(-9,9)\n   if kind=='grass':\n    k=math.sin(x*.062)*math.sin(y*.078)*7+n;pix[x,y]=(int(62+k),int(84+k),int(55+k))\n   else:\n    joint=(x%32<2 or y%32<2);k=n*.4-(20 if joint else 0);pix[x,y]=(int(116+k),int(125+k),int(121+k))\n im.save(O/(kind+'.jpg'),quality=92)\n'''
p.write_text(s)
p=Path('scripts/build_driving_assets.py');s=p.read_text().replace("material('land',(.22,.26,.23),.96);material('park',(.15,.26,.115),.95)","material('land',(.8,.8,.8),.96,tex='grass');material('park',(1,1,1),.95,tex='grass')").replace("material('pavement',(.34,.37,.36),.86)","material('pavement',(1,1,1),.86,tex='paving')")
a=s.index('  for k in range(7):',s.index("if kind=='palm':"));b=s.index(" manifest.append(export(kind",a)
s=s[:a]+'''  # Hundreds of individually oriented leaf blades replace solid foliage blobs.
  for k in range(16):
   a=rr.uniform(0,math.tau);r=rr.uniform(.5,2.6);x,y=math.cos(a)*r,math.sin(a)*r;z=rr.uniform(4.4,7.1);b.tube('bark',(0,0,3.4),(x,y,z),.085,7,r2=.025)
   for j in range(55):
    az=rr.uniform(0,math.tau);el=rr.uniform(-1,1);rad=rr.random()**.5*1.30
    center=Vector((x+math.cos(az)*rad,y+math.sin(az)*rad,z+el*.8));heading=rr.uniform(0,math.tau);tilt=rr.uniform(-.6,.9);u=Vector((math.cos(heading),math.sin(heading),tilt)).normalized();v=Vector((-math.sin(heading),math.cos(heading),rr.uniform(-.4,.4))).normalized();length=rr.uniform(.20,.36);width=length*.5
    pts=[center-u*length,center-u*length*.35+v*width,center+u*length*.5+v*width*.7,center+u*length,center+u*length*.5-v*width*.7,center-u*length*.35-v*width]
    b.face('leaflight' if j%3==0 else 'leaf',[tuple(q) for q in pts]);b.face('leaf',[tuple(q) for q in reversed(pts)])
''' + s[b:];p.write_text(s)
p=Path('src/city-world.ts');s=p.read_text().replace("smoothstep(-.03,.85,p.y)","smoothstep(-.03,.50,p.y)").replace('this.hemi.intensity=.64','this.hemi.intensity=.90').replace("this.night?.30:.64","this.night?.30:.90");p.write_text(s)
