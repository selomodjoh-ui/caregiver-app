import json

W, H = 1080, 1920
DUR = 60
O = 0.4  # the voice starts this long after the picture
EM, EM2, PEACH, MINT, INK, NIGHT, CREAM, RED = (
    "#1d3a6e", "#2f6fb5", "#f2b25c", "#e2e9f5", "#1a0f0a", "#17202b", "#fff6ea", "#c8321e")
L = []


def kf(pairs, ease="ease_out"):
    out = []
    for i, (t, v) in enumerate(pairs):
        k = {"time": round(t, 6), "value": v}
        if i < len(pairs) - 1:
            k["easing"] = ease
        out.append(k)
    return {"keyframes": out}


def layer(id, content, x, y, s, e, dy=60, rot=0, pop=False, fade=0.3, out=0.0, extra=None):
    s, e = round(s * 30) / 30, round(e * 30) / 30
    d = round(e - s, 3)
    an = {"opacity": kf([(s, 0), (s + fade, 1)] + ([(e - out, 1), (e - 0.01, 0)] if out else []))}
    tr = {}
    if dy:
        an["position"] = kf([(s, [x, y + dy]), (s + 0.45, [x, y])])
    else:
        tr["position"] = [x, y]
    if pop:
        an["scale"] = kf([(s, [pop, pop]), (s + 0.3, [1, 1])], "ease_in")
    if rot:
        tr["rotation"] = rot
    lay = {"id": id, "start": round(s, 6), "duration": round(e - s, 6), "content": content, "animations": an}
    if tr:
        lay["transform"] = tr
    if extra:
        for k, v in extra.items():
            if k == "animations":
                lay["animations"].update(v)
            else:
                lay[k] = v
    L.append(lay)
    return lay


def g(*items):
    return {"type": "group", "contents": list(items)}


def fill(c, o=None):
    f = {"type": "fill", "color": c}
    if o is not None:
        f["opacity"] = o
    return f


def rrect(w, h, c, r=0, pos=(0, 0), o=None):
    return g({"type": "rect", "position": list(pos), "size": [w, h], "roundness": r}, fill(c, o))


def ell(w, h, c, pos=(0, 0)):
    return g({"type": "ellipse", "position": list(pos), "size": [w, h]}, fill(c))


def shape(*items):
    return {"kind": "shape", "items": list(items)}


def text(t, size, color=INK, font="bold", wrap=None, align="center", lh=None):
    c = {"kind": "text", "text": t, "font": {"family": font, "size": size}, "color": color,
         "alignment": align, "verticalAlign": "center"}
    if wrap:
        c["wrapWidth"] = wrap
    if lh:
        c["lineHeight"] = lh
    return c


def img(asset, w, h, align="center"):
    return {"kind": "media", "assetId": asset, "fit": "cover", "bounds": [w, h], "align": align}


NFULL = [0]


def bg(id, color, s, e):
    s = round(s * 30) / 30
    e2 = round(min(e + 0.3, DUR) * 30) / 30
    lay = {"id": id, "start": round(s, 6), "duration": round(e2 - s, 6), "transform": {"position": [540, 960]},
           "content": {"kind": "color", "color": color}}
    if s > 0:
        lay["animations"] = {"opacity": kf([(s, 0), (s + 0.3, 1)], "ease_in_out")}
    L.append(lay)


def full(id, asset, s, e, align="center"):
    s = round(s * 30) / 30
    e2 = round(min(e + 0.3, DUR) * 30) / 30
    NFULL[0] += 1
    n = NFULL[0]
    z0, z1 = (1.02, 1.12) if n % 2 else (1.12, 1.02)
    dx = 14 if n % 4 < 2 else -14
    an = {"scale": kf([(s, [z0, z0]), (e2, [z1, z1])], "linear"),
          "position": kf([(s, [540 - dx, 960]), (e2, [540 + dx, 960])], "linear")}
    if s > 0:
        an["opacity"] = kf([(s, 0), (s + 0.3, 1)], "ease_in_out")
    L.append({"id": id, "start": round(s, 6), "duration": round(e2 - s, 6),
              "content": {"kind": "media", "assetId": asset, "fit": "cover", "align": align}, "animations": an})


def photo(id, asset, x, y, w, h, s, e, rot=0, align="center", dy=60, pop=False):
    layer(id + "_f", shape(rrect(w + 28, h + 28, "#ffffff", 18)), x, y, s, e, dy=dy, rot=rot, pop=pop)
    layer(id, img(asset, w, h, align), x, y, s, e, dy=dy, rot=rot, pop=pop)


def agent(id, x, y, s, e, extra=None, dy=0):
    dark, edge = "#0b0f14", "#46566a"
    coat = g({"type": "path", "closed": True, "vertices": [
        {"point": [-120, -90]}, {"point": [120, -90]}, {"point": [215, 340]}, {"point": [-215, 340]}]},
        {"type": "stroke", "color": edge, "width": 6}, fill(dark))
    layer(id, shape(
        rrect(190, 130, dark, 16, (0, -335)),                       # hat crown
        rrect(190, 22, PEACH, 0, (0, -282)),                        # hat band
        ell(330, 56, dark, (0, -262)),                              # brim
        ell(84, 60, "#2a3440", (228, 20)),                          # open hand
        rrect(150, 44, dark, 20, (170, 10)),                        # sleeve
        g({"type": "ellipse", "position": [0, -175], "size": [160, 180]},
          {"type": "stroke", "color": edge, "width": 6}, fill("#11171f")),
        coat), x, y, s, e, dy=dy, extra=extra)


def caption(n, t, s, e):
    layer(f"cap{n}", text(t, 44, "#ffffff", "semi", wrap=900, lh=60), 540, 1590, s, e, dy=0, fade=0.2)



def chip(id, t, y, s, e, bgc=EM, fg="#ffffff", size=40, font="semi", w=None, h=None, dy=-30, pop=False):
    w = w or int(len(t) * size * 0.6) + 90
    h = h or int(size * 2.3)
    layer(id, shape(rrect(w, h, bgc, h // 2)), 540, y, s, e, dy=dy, pop=pop)
    layer(id + "T", text(t, size, fg, font), 540, y, s, e, dy=dy, pop=pop)


RAW = "https://raw.githubusercontent.com/selomodjoh-ui/caregiver-app/5f7750f746f52a21c25f7cd2a289eecdf02a1d9c/ad/"


def phone(id, asset, s, e, x=540, y=850, rise=420, fade=0.3, k=1.0):
    fw, fh, sw, sh = round(480 * k), round(992 * k), round(440 * k), round(952 * k)
    layer(id + "F", shape(rrect(fw, fh, "#0e1626", round(60 * k))), x, y, s, e, dy=rise)
    layer(id, {"kind": "media", "assetId": asset, "fit": "cover", "bounds": [sw, sh]}, x, y, s, e, dy=rise, fade=fade)


def swap(id, asset, s, e, x=540, y=850, k=1.0):
    layer(id, {"kind": "media", "assetId": asset, "fit": "cover", "bounds": [round(440 * k), round(952 * k)]}, x, y, s, e, dy=0, fade=0.45)


def side(id, t, x, y, s, e, bgc=EM, fg="#ffffff", size=36, w=None):
    w = w or int(len(t) * size * 0.58) + 70
    h = int(size * 2.2)
    layer(id, shape(rrect(w, h, bgc, h // 2)), x, y, s, e, dy=0, pop=0.5)
    layer(id + "T", text(t, size, fg, "semi"), x, y, s, e, dy=0, pop=0.5)


# 1 Meet Lydia
full("s1", "lydia", 0, 3.25, align="top")
chip("s1meet", "Meet Lydia", 1250, 0.3, 3.25, EM, "#ffffff", 84, "black", w=640, h=170, dy=40)
chip("s1role", "Caregiver, Washington State", 1385, 0.9, 3.25, CREAM, EM, 38, w=640, h=84, dy=30)
# 2 paid an agent
full("s2", "a1", 3.25, 5.9)
chip("s2fee", "Agent fee: paid", 1370, 4.3, 5.9, "#fffdf5", RED, 46, "bold", dy=30, pop=1.4)
# 3 never came
full("s3", "a2", 5.9, 8.85)
chip("s3head", "The work never came", 1120, 6.1, 8.85, NIGHT, "#ffffff", 52, "xbold")
layer("s3seenB", shape(rrect(300, 60, "#ffffff", 30)), 800, 1330, 7.4, 8.85, dy=0, pop=1.4)
layer("s3seen", text("Not delivered", 32, RED, "semi"), 800, 1330, 7.4, 8.85, dy=0, pop=1.4)
# 4 Miss Dona and agencies
full("s4", "a5", 8.85, 14.25)
chip("s4chip", "Miss Dona, adult family home owner", 170, 9.1, 14.25, EM, "#ffffff", 34, w=720, h=84)
layer("s4card", shape(rrect(860, 330, "#fffdf5", 36)), 540, 1180, 11.3, 14.25, dy=200)
layer("s4t", text("Agency invoice", 38, "#5d6b63", "medium", align="left"), 160, 1075, 11.3, 14.25, dy=200)
layer("s4a", text("One shift filled", 44, INK, "semi", align="left"), 160, 1160, 11.5, 14.25, dy=200)
layer("s4b", text("Agency cut", 44, RED, "bold", align="left"), 160, 1250, 12.3, 14.25, dy=40)
layer("s4c", text("on every shift", 44, RED, "bold", align="right"), 920, 1250, 12.9, 14.25, dy=40)
# 5 ShiftKind
full("s5", "a3", 14.25, 18.25)
phone("s5p", "home1", 14.5, 18.25, y=1000, k=0.82)
stamp_an = {"animations": {"scale": kf([(16.4, [3.0, 3.0]), (16.6, [0.9, 0.9]), (16.7, [1.06, 1.06]), (16.8, [1, 1])], "ease_in")}}
layer("s5stamp", shape(g({"type": "rect", "position": [0, 0], "size": [960, 250], "roundness": 26},
                         {"type": "stroke", "color": RED, "width": 14}, fill(CREAM, 0.95))),
      540, 1000, 16.4, 18.25, dy=0, rot=-7, fade=0.1, extra=stamp_an)
layer("s5stampT", text("NO AGENTS · NO FEES", 78, RED, "black"), 540, 1002, 16.4, 18.25, dy=0, rot=-7, fade=0.1, extra=stamp_an)
# 6 checked
bg("s6bg", MINT, 18.25, 23.5)
layer("s6h", text("Checked before you meet", 58, EM, "xbold"), 540, 170, 18.4, 23.5, dy=30)
phone("s6p", "creds", 18.5, 23.5, y=850)
side("s6a", "Home license checked", 300, 300, 18.9, 23.5, EM, "#ffffff", 32, w=440)
side("s6b", "Credentials verified", 790, 300, 19.6, 23.5, EM2, "#ffffff", 32, w=420)
# 7 real shift
full("s7", "a6", 23.5, 28.7)
phone("s7p", "shifts", 23.7, 28.7, y=850)
for i, (t, at, x, yy) in enumerate([("Real home", 24.6, 190, 420), ("Hours", 25.55, 905, 560), ("Pay", 26.25, 170, 760), ("Distance", 26.8, 900, 930)]):
    side(f"s7c{i}", t, x, yy, at, 28.7, PEACH, INK, 36)
# 8 free time
bg("s8bg", MINT, 28.7, 32.6)
layer("s8h", text("Work when it suits you", 58, EM, "xbold"), 540, 170, 28.9, 32.6, dy=30)
phone("s8p", "dates", 28.9, 32.6, y=850)
side("s8a", "Days and nights", 540, 300, 29.4, 32.6, EM, "#ffffff", 34, w=380)
side("s8b", "Even one date", 830, 1010, 31.1, 32.6, PEACH, INK, 36, w=340)
# 9 Miss Dona posts, sees who is free
full("s9", "a5", 32.6, 38.5)
phone("s9p", "post", 32.8, 38.5, y=1085, k=0.72)
swap("s9p2", "find", 34.9, 38.5, y=1085, k=0.72)
side("s9a", "Posted in a minute", 540, 200, 33.4, 34.9, EM, "#ffffff", 34, w=430)
for i, (t, at, x, yy) in enumerate([("Photos", 36.2, 165, 860), ("Credentials", 36.85, 905, 990), ("Ratings", 37.6, 170, 1150)]):
    side(f"s9c{i}", t, x, yy, at, 38.5, PEACH, INK, 36)
# 10 messages and alerts
bg("s10bg", MINT, 38.5, 43.1)
layer("s10h", text("Talk directly", 62, EM, "xbold"), 540, 220, 38.7, 43.1, dy=30)
photo("s10dA", "dona", 150, 480, 150, 150, 38.9, 43.1, align="top", dy=30)
layer("s10m1", shape(rrect(640, 110, "#ffffff", 55)), 580, 480, 38.9, 43.1, dy=30)
layer("s10m1T", text("Can you do Sunday night?", 40, INK, "medium"), 580, 480, 38.9, 43.1, dy=30)
photo("s10lA", "lydia", 930, 680, 150, 150, 39.6, 43.1, align="top", dy=30)
layer("s10m2", shape(rrect(560, 110, EM, 55)), 520, 680, 39.6, 43.1, dy=30)
layer("s10m2T", text("Yes! See you at 7.", 40, "#ffffff", "medium"), 520, 680, 39.6, 43.1, dy=30)
ns = 40.5
layer("s10n", shape(rrect(940, 250, "#0e1626", 44)), 540, 1040, ns, 43.1, dy=-80)
layer("s10nI", shape(rrect(96, 96, "#ffffff", 24)), 150, 1040, ns, 43.1, dy=-80)
layer("s10nIT", text("S", 64, EM, "xbold"), 150, 1042, ns, 43.1, dy=-80)
layer("s10nA", text("ShiftKind  ·  now", 30, "#b3c0d6", "medium", align="left"), 230, 965, ns, 43.1, dy=-80)
layer("s10nB", text("New message from Miss Dona's Home", 37, "#ffffff", "semi", align="left"), 230, 1030, ns, 43.1, dy=-80)
layer("s10nC", text("Open ShiftKind to read and reply.", 32, "#d3dcec", "medium", align="left"), 230, 1095, ns, 43.1, dy=-80)
layer("s10mid", text("No one in the middle.", 52, EM, "xbold"), 540, 1300, 41.4, 43.1, pop=1.4, dy=0)
# 11 paid directly, 12 ratings
full("s11", "a8", 43.1, 49.1)
chip("s11h", "Shift covered.", 1050, 43.3, 49.1, EM, "#ffffff", 76, "black", w=760, h=150, dy=0, pop=1.5)
chip("s11pay", "Paid directly by the home", 1195, 43.9, 49.1, CREAM, EM, 38, w=640, h=92, dy=0, pop=0.6)
chip("s11cut", "Nobody takes a cut", 1300, 45.5, 49.1, PEACH, INK, 38, "bold", w=520, h=92, dy=0, pop=0.6)
layer("s12starsB", shape(rrect(900, 110, CREAM, 55)), 540, 1412, 46.6, 49.1, dy=30)
for sd, cx in (("l", 290), ("d", 790)):
    for i in range(5):
        s = 46.8 + i * 0.1 + (0.3 if sd == "d" else 0)
        layer(f"s12s{sd}{i}", shape(g({"type": "polystar", "starType": "star", "points": 5, "position": [0, 0],
                                        "outerRadius": 32, "innerRadius": 14}, fill("#f5a623"))),
              cx - 152 + i * 76, 1412, s, 49.1, pop=0.2, dy=0)
# 13 closing card
bg("s13bg", EM, 49.1, DUR)
E0 = 49.3
house = g({"type": "path", "closed": True, "vertices": [{"point": [0, -62]}, {"point": [62, -12]}, {"point": [62, 58]}, {"point": [-62, 58]}, {"point": [-62, -12]}]}, fill(EM))
heart = [ell(34, 34, PEACH, (-15, 8)), ell(34, 34, PEACH, (15, 8)),
         g({"type": "path", "closed": True, "vertices": [{"point": [-31, 15]}, {"point": [31, 15]}, {"point": [0, 48]}]}, fill(PEACH))]
layer("s13logo", shape(*heart, house, rrect(190, 190, "#ffffff", 46)), 540, 300, E0, DUR, pop=0.4, dy=0)
layer("s13name", text("ShiftKind", 132, "#ffffff", "black"), 540, 540, E0 + 0.1, DUR, dy=40)
layer("s13tag", text("No agents. No fees.\nJust the shift.", 60, PEACH, "bold", lh=80), 540, 760, 50.3, DUR, dy=40)
layer("s13a", text("Free for caregivers", 46, "#ffffff", "semi"), 540, 950, 53.3, DUR, dy=30)
layer("s13b", text("Homes: 14 days free", 46, "#ffffff", "semi"), 540, 1020, 54.6, DUR, dy=30)
layer("s13pill", shape(rrect(780, 136, "#ffffff", 68)), 540, 1190, 56.7, DUR, pop=0.7, dy=0)
layer("s13url", text("getshiftkind.com", 66, EM, "xbold"), 540, 1190, 56.7, DUR, pop=0.7, dy=0)
layer("s13cbox", shape(rrect(820, 190, "#142a52", 36)), 540, 1400, 57.3, DUR, dy=30)
layer("s13mail", text("support@getshiftkind.com", 46, "#ffffff", "bold"), 540, 1360, 57.3, DUR, dy=30)
layer("s13tel", text("Call  +1 (347) 567-6442", 40, PEACH, "semi"), 540, 1435, 57.5, DUR, dy=30)
photo("s13l", "lydia", 420, 1690, 170, 225, 51.0, DUR, rot=-4, align="top")
photo("s13d", "dona", 660, 1690, 170, 225, 51.2, DUR, rot=4, align="top")

# captions
L.append({"id": "capplate", "start": 0, "duration": 49.1, "transform": {"position": [540, 1590]},
          "content": shape(rrect(980, 230, "#0e1626", 34))})
caps = [
    (0.3, 3.25, "Meet Lydia, a caregiver in Washington State."),
    (3.25, 5.9, "She once paid an agent a fee to find her work."),
    (5.9, 8.85, "The work never came, and the agent stopped answering."),
    (8.85, 11.25, "Miss Dona runs an adult family home."),
    (11.25, 14.25, "Agencies took a large cut on every shift she filled."),
    (14.25, 16.3, "ShiftKind takes out the middleman."),
    (16.3, 18.25, "No agents. No fees."),
    (18.25, 21.1, "Home licenses and caregiver credentials are checked,"),
    (21.1, 23.5, "so both sides know who they are dealing with."),
    (23.5, 26.1, "Lydia sees the real home, the hours,"),
    (26.1, 28.7, "the pay and the distance before she applies."),
    (28.7, 32.6, "She marks the days and nights she is free, down to a single date."),
    (32.6, 34.8, "Miss Dona posts a shift in a minute,"),
    (34.8, 38.5, "and sees who is free, with photos, credentials and ratings."),
    (38.5, 40.3, "They message each other directly,"),
    (40.3, 43.1, "and a phone alert means no reply is missed."),
    (43.1, 45.3, "The home pays Lydia herself."),
    (45.3, 46.5, "Nobody takes a cut."),
    (46.5, 49.1, "Each rates the other, so good work gets known."),
]
for i, (s, e, t) in enumerate(caps):
    caption(i, t, s, e)

# voice: one continuous take made with Canva's AI voice
L.append({"id": "vo", "start": O, "duration": 58.3, "content": {"kind": "audio", "assetId": "vo", "trim": {"in": 0, "out": 58.3}}})

F = lambda u: {"type": "font", "uri": "https://pastatic.picsart.com/" + u + ".ttf"}
P = lambda u: {"type": "image", "uri": "https://gcdn.picsart.com/picsart-mcp/" + u}
S = lambda n: {"type": "image", "uri": RAW + n + ".jpg", "width": 1170, "height": 2532}
scene = {
    "version": "1.0",
    "assets": {
        "lydia": dict(P("0248ffbf-049f-4854-a12a-66f5964ec9cd.png"), width=1760, height=2336),
        "dona": dict(P("bfe4d79e-6ae3-47ad-8529-14b526417492.png"), width=1760, height=2336),
        "a1": P("3fb8698d-d893-485f-baea-196cf7394830.jpg"), "a2": P("7c41ab6d-606a-43da-9b7e-1415aa622a55.jpg"),
        "a3": P("5989dcfe-dbb3-495e-b839-01fa5c769100.jpg"), "a5": P("90a15bbd-9a4a-4e35-8daa-342309d1cdd2.jpg"),
        "a6": P("f1c8b4b5-5255-4521-82bc-6fe3f83efc01.jpg"), "a8": P("69582633-a4bd-4a7d-96d8-437b98b652e3.jpg"),
        "home1": S("cg-home"), "shifts": S("cg-shifts"), "dates": S("cg-dates"), "creds": S("cg-creds"),
        "post": S("home-shifts-top"), "find": S("home-find"),
        "vo": {"type": "audio", "uri": "https://gcdn.picsart.com/picsart-mcp/52416ba5-598e-49fd-a476-a17a0eafc4c8.mp4", "duration": 58.334},
        "medium": F("26922534527094151495"), "semi": F("21826400837422618354"), "bold": F("13126613945243871786"),
        "xbold": F("36007769206346275091"), "black": F("63211336242695272495"),
    },
    "composition": {"width": W, "height": H, "fps": 30, "duration": DUR},
    "layers": L,
}
s = json.dumps(scene, separators=(",", ":"), ensure_ascii=False)
open("/home/claude/ad/scene3.json", "w").write(s)
print(len(L), "layers", len(s), "bytes")
