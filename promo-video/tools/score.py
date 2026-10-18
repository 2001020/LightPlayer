"""Light sound effects for the promo, no music: python3 tools/score.py → sfx.wav

Synthesised with onetake's palette (tools/sfx_palette.py): air for the dot's flights and the camera, wood for the
clicks and the landings, a bubble for the heart, glass for the lyric bounces and the colour changes, a felt sub for the sky cuts.
Times come from the composition's own timeline (the `const T = {...}` block in comp.html), so a retimed beat
takes its sound with it. Peaks at -8 dBFS, so music can be laid on top later.
"""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sfx_palette import Score, air, glass, wood, sub, bubble

src = open(os.path.join(HERE, "..", "comp.html"), encoding="utf-8").read()
block = re.search(r"const T = \{(.*?)\n\};", src, re.S).group(1)
body = re.sub(r"//[^\n]*", "", block)                     # the JS object literal as JSON
body = re.sub(r"(\w+):", r'"\1":', body)
T = json.loads("{" + re.sub(r",\s*$", "", body.strip()) + "}")
DUR = float(re.search(r"const DUR = ([\d.]+);", src).group(1))

s = Score(dur=DUR, T60=1.1)
place = s.place

# the dot appears, drops into the player and the library grows out of it; the hand opens the album wall; it folds back
place(bubble(560, 0.24), T["dot"], 0.22, 0.0, 0.3)
place(air(0.6, 1600, 300, 1.3, 0.6), T["drop0"], 0.16, 0.0, 0.4)
place(wood(200, 0.1), T["drop1"], 0.30, 0.0, 0.25); place(sub(70, 0.45), T["drop1"], 0.18, 0.0, 0.3)
place(air(0.5, 400, 1600, 1.3, 0.4), T["bar0"], 0.16, 0.0, 0.4)
place(air(0.75, 200, 1800, 1.1, 0.45), T["win0"], 0.22, 0.1, 0.5)
place(wood(240, 0.08), T["click0"], 0.28, -0.3, 0.2); place(wood(190, 0.07), T["click0"] + 0.06, 0.18, -0.3, 0.2)
place(air(0.5, 2000, 300, 1.4, 0.5), T["fold0"], 0.20, 0.0, 0.45)
# it hops up to the lyrics and bounces along them, three soft touches a line
place(air(0.5, 300, 1500, 1.3, 0.5), T["up0"], 0.14, 0.0, 0.5)
starts = [T["up1"]] + T["lyr"][:3]
for i, t0 in enumerate(starts):
    t1 = starts[i + 1] if i + 1 < len(starts) else T["desk0"]
    t0 += 0.18 if i else 0
    for j in range(3):
        place(glass((784, 880, 988, 1046)[i] * (1, 1.12, 1.26)[j], 0.35, 0.8), t0 + (t1 - t0) * j / 3, 0.045, -0.3 + 0.3 * j, 0.4)
# the desktop opens out of it and closes back into it
place(air(0.7, 220, 2400, 1.2, 0.4), T["desk0"], 0.24, 0.0, 0.55)
place(air(0.5, 2200, 260, 1.4, 0.5), T["deskOut0"], 0.20, 0.0, 0.5)
# it lands on the record's spindle, the record grows; four colour cuts
place(wood(220, 0.1), T["toDisc1"], 0.24, -0.2, 0.25)
place(air(0.6, 200, 1400, 1.2, 0.4), T["discIn0"], 0.20, -0.2, 0.5)
place(sub(58, 0.7), T["discIn1"] - 0.05, 0.22, -0.2, 0.35)
for i, t in enumerate(T["colors"]):
    place(glass((523, 659, 784, 1046)[i], 0.45, 0.7), t, 0.07, -0.2, 0.35)
# it rises as the sun, the sky rises with it; three hard cuts of weather; it falls onto the heart
place(air(0.9, 200, 2600, 1.1, 0.5), T["rise0"], 0.26, -0.1, 0.55)
for i, t in enumerate(T["cuts"]):
    place(sub(72 - i * 3, 0.42), t, 0.30, 0.0, 0.25)
place(air(0.5, 2400, 300, 1.4, 0.5), T["drain0"], 0.20, 0.0, 0.5)
place(air(0.7, 2200, 260, 1.3, 0.7), T["fall0"], 0.18, -0.2, 0.45, pan_to=-0.4)
place(wood(200, 0.1), T["fall1"], 0.30, -0.4, 0.25); place(sub(68, 0.45), T["fall1"], 0.18, -0.4, 0.3)
# NetEase grows out of the heart; push in, the heart, the whip, the comments; folds back into the heart
place(air(0.75, 200, 1800, 1.1, 0.45), T["nwin0"], 0.22, 0.1, 0.5)
place(air(0.45, 300, 2400, 1.4, 0.5), T["h7out"], 0.18, 0.2, 0.45, pan_to=-0.2)
place(wood(240, 0.08), T["click1"], 0.30, -0.15, 0.2); place(wood(190, 0.07), T["click1"] + 0.06, 0.20, -0.15, 0.2)
place(bubble(700, 0.26), T["click1"] + 0.04, 0.26, -0.15, 0.3)
place(air(0.45, 2600, 300, 1.4, 0.4), T["h8out"], 0.30, -0.35, 0.45, pan_to=0.4)
place(wood(240, 0.08), T["click2"], 0.28, 0.0, 0.2); place(wood(190, 0.07), T["click2"] + 0.06, 0.18, 0.0, 0.2)
place(air(0.5, 300, 2200, 1.3, 0.35), T["panel0"], 0.20, -0.2, 0.45)
place(air(0.5, 2000, 300, 1.4, 0.5), T["nfold0"], 0.20, 0.0, 0.45)
# two computers: it hops to each, they open; it carries the song back and forth
for t, pan in ((T["toL1"], -0.45), (T["toR1"], 0.45), (T["pp"][0][1], -0.45), (T["pp"][1][1], 0.45)):
    place(bubble(520 if pan > 0 else 480, 0.22), t, 0.18, pan, 0.3)
place(air(0.5, 2000, 300, 1.4, 0.5), T["lanOut0"], 0.20, 0.0, 0.5)
# it becomes the icon, the name lands
place(bubble(420, 0.3), T["icon0"], 0.24, 0.0, 0.35)
place(sub(48, 1.1), T["mark"] + 0.3, 0.42, 0.0, 0.45)
place(glass(523, 1.2, 0.35), T["tag"], 0.07, 0.0, 0.6)

s.write(os.path.join(HERE, "..", "sfx.wav"))
print("sfx.wav", DUR, "s,", len(T), "beats read from comp.html")
