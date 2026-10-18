"""Light sound effects for the promo, no music: python3 tools/score.py → sfx.wav

Synthesised with onetake's palette (tools/sfx_palette.py): air for the line and the camera, wood for the two
clicks, a bubble for the heart, glass for the lyric lines and the colour changes, a felt sub for the landings and the sky cuts.
Times come from the composition's own timeline (the `const T = {...}` block in comp.html), so a retimed beat
takes its sound with it. Peaks at -8 dBFS, so music can be laid on top later.
"""
import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from sfx_palette import Score, air, glass, wood, sub, bubble

src = open(os.path.join(HERE, "..", "comp.html"), encoding="utf-8").read()
block = re.search(r"const T = \{(.*?)\n\};", src, re.S).group(1)
T = {k: eval(v) for k, v in re.findall(r"(\w+):\s*(\[[^\]]*\]|[\d.]+)", block)}
DUR = float(re.search(r"const DUR = ([\d.]+);", src).group(1))

s = Score(dur=DUR, T60=1.1)
place = s.place

# the dot, and the line drawn across
place(bubble(560, 0.24), T["dot"], 0.22, 0.0, 0.3)
place(air(1.0, 300, 2600, 1.3, 0.25), T["draw0"] - 0.02, 0.24, -0.45, 0.45, pan_to=0.45)
# the bar forms around it, the library grows out of the bar; the hand opens the album wall; it folds back
place(air(0.5, 400, 1600, 1.3, 0.4), T["bar0"], 0.16, 0.0, 0.4)
place(sub(64, 0.5), T["bar1"], 0.14, 0.0, 0.3)
place(air(0.75, 200, 1800, 1.1, 0.45), T["win0"], 0.22, 0.1, 0.5)
place(wood(240, 0.08), T["click0"], 0.28, -0.3, 0.2); place(wood(190, 0.07), T["click0"] + 0.06, 0.18, -0.3, 0.2)
place(air(0.5, 2000, 300, 1.4, 0.5), T["fold0"], 0.20, 0.0, 0.45)
# the line lifts into the lyrics, a glass touch per line; the desktop opens around one and closes into the line
place(air(0.6, 300, 1400, 1.3, 0.5), T["lift0"], 0.14, 0.0, 0.5)
for t, f in zip(T["lyr"], (659, 784, 880, 988)):
    place(glass(f, 0.7, 0.5), t, 0.08, 0.0, 0.5)
place(air(0.7, 220, 2400, 1.2, 0.4), T["desk0"], 0.24, 0.0, 0.55)
place(air(0.5, 2200, 260, 1.4, 0.5), T["deskOut0"], 0.20, 0.0, 0.5)
# winds into the groove, the record lands; four colour cuts
place(air(0.8, 200, 1200, 1.2, 0.5), T["wind0"], 0.22, 0.2, 0.5, pan_to=-0.2)
place(sub(58, 0.7), T["discIn1"] - 0.05, 0.22, -0.2, 0.35)
for i, t in enumerate(T["colors"]):
    place(glass((523, 659, 784, 1046)[i], 0.45, 0.7), t, 0.07, -0.2, 0.35)
# unrolls into the horizon, the sky rises, three hard cuts of weather, it drains
place(air(0.7, 1200, 220, 1.3, 0.4), T["unwind0"], 0.20, -0.2, 0.5, pan_to=0.3)
place(air(0.6, 200, 2600, 1.2, 0.35), T["sky0"], 0.26, 0.0, 0.55)
for i, t in enumerate(T["cuts"]):
    place(sub(72 - i * 3, 0.42), t, 0.30, 0.0, 0.25)
place(air(0.5, 2400, 300, 1.4, 0.5), T["drain0"], 0.22, 0.0, 0.5)
# NetEase: the horizon gathers into the bar, the window grows; push in, the heart, the whip, the comments
place(air(0.55, 1800, 400, 1.3, 0.4), T["nt0"], 0.16, 0.0, 0.45)
place(sub(64, 0.5), T["nbar1"], 0.14, 0.0, 0.3)
place(air(0.75, 200, 1800, 1.1, 0.45), T["nwin0"], 0.22, 0.1, 0.5)
place(air(0.45, 300, 2400, 1.4, 0.5), T["h7out"], 0.18, 0.2, 0.45, pan_to=-0.2)
place(wood(240, 0.08), T["click1"], 0.30, -0.15, 0.2); place(wood(190, 0.07), T["click1"] + 0.06, 0.20, -0.15, 0.2)
place(bubble(700, 0.26), T["click1"] + 0.04, 0.26, -0.15, 0.3)
place(air(0.45, 2600, 300, 1.4, 0.4), T["h8out"], 0.30, -0.35, 0.45, pan_to=0.4)
place(wood(240, 0.08), T["click2"], 0.28, 0.0, 0.2); place(wood(190, 0.07), T["click2"] + 0.06, 0.18, 0.0, 0.2)
place(air(0.5, 300, 2200, 1.3, 0.35), T["panel0"], 0.20, -0.2, 0.45)
place(air(0.5, 2000, 300, 1.4, 0.5), T["nfold0"], 0.20, 0.0, 0.45)
# two computers
place(air(0.5, 300, 1800, 1.3, 0.5), T["lan0"], 0.14, 0.0, 0.45)
place(bubble(480, 0.24), T["lanBar0"] + 0.02, 0.16, -0.45, 0.3); place(bubble(520, 0.24), T["lanBar0"] + 0.08, 0.16, 0.45, 0.3)
place(air(0.5, 2000, 300, 1.4, 0.5), T["lanOut0"], 0.20, 0.0, 0.5)
# the name lands, the line under it
place(sub(48, 1.1), T["mark"] + 0.25, 0.42, 0.0, 0.45)
place(glass(523, 1.2, 0.35), T["tag"], 0.07, 0.0, 0.6)

s.write(os.path.join(HERE, "..", "sfx.wav"))
print("sfx.wav", DUR, "s,", len(T), "beats read from comp.html")
