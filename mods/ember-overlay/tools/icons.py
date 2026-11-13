import subprocess, base64, os, sys
# Run from a folder containing lucide-static (npm pack lucide-static; tar xzf *.tgz).
from PIL import Image
S = 48
M = {
 "fps":"gauge","cps":"mouse-pointer-click","keystrokes":"keyboard","ping":"signal","coords":"map-pin","direction":"compass",
 "biome":"trees","armor":"shield","potions":"flask-conical","stopwatch":"timer","clock":"clock","speed":"wind","memory":"memory-stick",
 "day":"calendar-days","server":"server","held":"pickaxe","arrows":"bow-arrow","light":"lightbulb","chunk":"grid-3x3","entities":"users",
 "session":"hourglass","target":"scan-eye","food":"drumstick","radar":"radar","minimap":"map","worldmap":"earth","fullbright":"sun","zoom":"zoom-in",
 "crosshair":"crosshair","minimal_bob":"footprints","particles":"sparkles","hide_hand":"hand","cinematic_key":"clapperboard",
 "hide_scoreboard":"list-ordered","hide_bossbar":"crown","hide_vanilla_effects":"eye-off","hide_titles":"heading","low_health":"heart-pulse",
 "durability_warning":"triangle-alert","clear_water":"droplets","item_physics":"box","block_outline":"square-dashed","low_fire":"flame",
 "macros":"message-square-text","server_switcher":"arrow-left-right","freelook":"eye","snap_look":"rotate-ccw","chat_filter":"filter",
 "inventory_search":"package-search","screenshot_manager":"image","memory_cleaner":"trash-2","toggle_sprint":"zap","toggle_sneak":"chevrons-down",
 "death_coords":"skull","reconnect":"refresh-cw","copy_coords":"copy","server_memory":"history",
 "ui_search":"search","ui_settings":"settings","ui_back":"chevron-left","ui_key":"keyboard","ui_layout":"layout-dashboard","ui_all":"layout-grid",
 "ui_on":"toggle-right","ui_hud":"monitor","ui_visual":"palette","ui_utility":"wrench","ui_owned":"package-check","ui_servers":"server","ui_shots":"images","ui_close":"x",
}
out = {}
sheet = Image.new("RGB", (len(M)*52, 52), (23,26,32))
for i,(k,name) in enumerate(M.items()):
    svg = f"package/icons/{name}.svg"
    if not os.path.exists(svg): print("MISSING", k, name); continue
    data = open(svg).read().replace('stroke="currentColor"','stroke="#ffffff"')
    open("t.svg","w").write(data)
    subprocess.run(["rsvg-convert","-w",str(S),"-h",str(S),"t.svg","-o","t.png"],check=True)
    im = Image.open("t.png").convert("RGBA")
    runs = bytearray()
    for y in range(S):
        x = 0
        while x < S:
            a = im.getpixel((x,y))[3]
            lvl = round(a/255*15)
            if lvl == 0: x += 1; continue
            x0 = x
            while x < S and round(im.getpixel((x,y))[3]/255*15) == lvl: x += 1
            runs += bytes([y, x0, x-x0, lvl])
    out[k] = base64.b64encode(bytes(runs)).decode()
    # preview
    for j in range(0,len(runs),4):
        y,x0,l,lv = runs[j:j+4]
        c = int(23+(233-23)*lv/15)
        for xx in range(x0,x0+l): sheet.putpixel((i*52+2+xx, 2+y),(c,c,c))
sheet = sheet.resize((sheet.width*2, sheet.height*2), Image.NEAREST)
sheet.save("sheet.png")
print(len(out), "icons, avg runs", sum(len(base64.b64decode(v))//4 for v in out.values())//len(out))
import json; json.dump(out, open("icons.json","w"))
