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


# ---------------- Version 4: "A steady job" ----------------
T = [0, 5.4, 8.1, 10.8, 15.0, 21.2, 27.6, 33.6, 42.4, 48.4]

# 1 Lydia wants something steady
full("s1", "lydia", T[0], T[1], align="top")
chip("s1meet", "Lydia wants a steady job", 1250, 0.3, T[1], EM, "#ffffff", 58, "black", w=880, h=150, dy=40)
chip("s1role", "Caregiver, Washington State", 1375, 0.9, T[1], CREAM, EM, 38, w=640, h=84, dy=30)
# 2 agents in the group chats
full("s2", "a1", T[1], T[2])
chip("s2a", "Posted in a group chat", 1350, T[1] + 0.3, T[2], NIGHT, "#ffffff", 44, "bold", w=640, h=100)
full("s3", "a2", T[2], T[3])
chip("s3fee", "\"Pay my fee first\"", 1370, T[2] + 0.3, T[3], "#fffdf5", RED, 50, "bold", w=620, h=110, dy=30, pop=1.4)
# 3 Miss Dona needs someone who stays
full("s4", "a5", T[3], T[4])
chip("s4chip", "Miss Dona, adult family home owner", 170, T[3] + 0.25, T[4], EM, "#ffffff", 34, w=720, h=84)
chip("s4need", "Needed: a live-in caregiver", 1370, T[3] + 1.2, T[4], CREAM, EM, 44, "bold", w=760, h=104, dy=30)
# 4 she posts the job herself
bg("s5bg", MINT, T[4], T[5])
layer("s5h", text("She posts the job herself", 56, EM, "xbold"), 540, 170, T[4] + 0.2, T[5], dy=30)
phone("s5p", "form", T[4] + 0.2, T[5], y=860)
for i, (t, at, x, yy, w) in enumerate([("Live-in or live-out", 16.6, 250, 470, 400), ("The hours", 18.0, 880, 640, 280), ("The pay", 18.9, 180, 820, 250), ("Start date", 19.8, 880, 1010, 290)]):
    side(f"s5c{i}", t, x, yy, at, T[5], PEACH, INK, 34, w=w)
# 5 Lydia sees it and applies
full("s6", "a6", T[5], T[6])
phone("s6p", "board", T[5] + 0.2, T[6], y=1030, k=0.76)
for i, (t, at, x, yy, w) in enumerate([("Real home", 22.6, 185, 900, 300), ("$4,200 a month", 23.6, 860, 1000, 400), ("11 miles away", 24.6, 200, 1130, 360)]):
    side(f"s6c{i}", t, x, yy, at, T[6], PEACH, INK, 34, w=w)
chip("s6apply", "Applied, with a short note", 1425, 25.6, T[6], EM, "#ffffff", 40, "bold", w=660, h=96, dy=0, pop=0.6)
# 6 Miss Dona checks, shortlists, messages
bg("s7bg", MINT, T[6], T[7])
layer("s7h", text("Checked before they meet", 56, EM, "xbold"), 540, 170, T[6] + 0.2, T[7], dy=30)
phone("s7p", "applicant", T[6] + 0.2, T[7], y=860)
side("s7a", "Credentials verified", 800, 320, 28.6, T[7], EM2, "#ffffff", 32, w=420)
side("s7b", "Shortlisted", 190, 1080, 30.2, T[7], PEACH, INK, 36, w=300)
side("s7c", "Messaged directly", 850, 1250, 31.4, T[7], EM, "#ffffff", 34, w=400)
# 7 recommendations, not stars
bg("s8bg", MINT, T[7], T[8])
layer("s8h", text("Recommendations,\nnot star ratings", 56, EM, "xbold", lh=70), 540, 190, T[7] + 0.2, T[8], dy=30)
phone("s8p", "rec", T[7] + 0.2, T[8], y=890)
side("s8a", "Written only when she asks", 540, 400, 36.6, T[8], EM, "#ffffff", 34, w=560)
side("s8b", "She chooses what shows", 760, 1150, 39.4, T[8], PEACH, INK, 34, w=500)
# 8 she starts Monday
full("s9", "a8", T[8], T[9])
chip("s9h", "Hired.", 1050, T[8] + 0.2, T[9], EM, "#ffffff", 84, "black", w=520, h=160, dy=0, pop=1.5)
chip("s9pay", "Paid directly by the home", 1200, T[8] + 1.4, T[9], CREAM, EM, 38, w=640, h=92, dy=0, pop=0.6)
chip("s9cut", "Nobody takes a cut", 1305, T[8] + 3.0, T[9], PEACH, INK, 38, "bold", w=520, h=92, dy=0, pop=0.6)
# 9 closing card
bg("s13bg", EM, T[9], DUR)
E0 = T[9] + 0.2
house = g({"type": "path", "closed": True, "vertices": [{"point": [0, -62]}, {"point": [62, -12]}, {"point": [62, 58]}, {"point": [-62, 58]}, {"point": [-62, -12]}]}, fill(EM))
heart = [ell(34, 34, PEACH, (-15, 8)), ell(34, 34, PEACH, (15, 8)),
         g({"type": "path", "closed": True, "vertices": [{"point": [-31, 15]}, {"point": [31, 15]}, {"point": [0, 48]}]}, fill(PEACH))]
layer("s13logo", shape(*heart, house, rrect(190, 190, "#ffffff", 46)), 540, 300, E0, DUR, pop=0.4, dy=0)
layer("s13name", text("ShiftKind", 132, "#ffffff", "black"), 540, 540, E0 + 0.1, DUR, dy=40)
layer("s13tag", text("Shifts and steady jobs.\nNo agents. No fees.", 60, PEACH, "bold", lh=80), 540, 760, 49.8, DUR, dy=40)
layer("s13a", text("Free for caregivers", 46, "#ffffff", "semi"), 540, 950, 53.0, DUR, dy=30)
layer("s13b", text("Homes: 14 days free", 46, "#ffffff", "semi"), 540, 1020, 54.4, DUR, dy=30)
layer("s13pill", shape(rrect(780, 136, "#ffffff", 68)), 540, 1190, 56.4, DUR, pop=0.7, dy=0)
layer("s13url", text("getshiftkind.com", 66, EM, "xbold"), 540, 1190, 56.4, DUR, pop=0.7, dy=0)
layer("s13cbox", shape(rrect(820, 190, "#142a52", 36)), 540, 1400, 57.0, DUR, dy=30)
layer("s13mail", text("support@getshiftkind.com", 46, "#ffffff", "bold"), 540, 1360, 57.0, DUR, dy=30)
layer("s13tel", text("Call  +1 (347) 567-6442", 40, PEACH, "semi"), 540, 1435, 57.2, DUR, dy=30)
photo("s13l", "lydia", 420, 1690, 170, 225, 50.6, DUR, rot=-4, align="top")
photo("s13d", "dona", 660, 1690, 170, 225, 50.8, DUR, rot=4, align="top")

# captions (these are also the voice-over lines)
L.append({"id": "capplate", "start": 0, "duration": T[9], "transform": {"position": [540, 1590]},
          "content": shape(rrect(980, 230, "#0e1626", 34))})
caps = [
    (0.3, 2.9, "Lydia has picked up shifts on ShiftKind."),
    (2.9, T[1], "Now she wants a steady job."),
    (T[1], T[2], "In the group chats, agents post live-in jobs"),
    (T[2], T[3], "and ask for a fee first."),
    (T[3], T[4], "Miss Dona needs a live-in caregiver who will stay."),
    (T[4], 17.8, "She posts the job herself: live-in or live-out,"),
    (17.8, T[5], "the hours, the pay and the start date."),
    (T[5], 24.4, "Lydia sees the real home, the pay and the distance,"),
    (24.4, T[6], "and applies with a short note."),
    (T[6], 30.0, "Miss Dona sees her verified credentials,"),
    (30.0, T[7], "shortlists her, and messages her directly."),
    (T[7], 35.6, "There are no star ratings."),
    (35.6, 39.2, "Lydia asked a home she worked for to write a recommendation,"),
    (39.2, T[8], "and she chose to show it."),
    (T[8], 44.6, "Monday, she starts."),
    (44.6, T[9], "The home pays her directly, and nobody takes a cut."),
]
for i, (s, e, t) in enumerate(caps):
    caption(i, t, s, e)

F = lambda u: {"type": "font", "uri": "https://pastatic.picsart.com/" + u + ".ttf"}
P = lambda u: {"type": "image", "uri": "https://gcdn.picsart.com/picsart-mcp/" + u}
S = lambda u: dict(P(u), width=1170, height=2532)
scene = {
    "version": "1.0",
    "assets": {
        "lydia": dict(P("0248ffbf-049f-4854-a12a-66f5964ec9cd.png"), width=1652, height=2336),
        "dona": dict(P("bfe4d79e-6ae3-47ad-8529-14b526417492.png"), width=1760, height=2336),
        "a1": P("3fb8698d-d893-485f-baea-196cf7394830.jpg"), "a2": P("7c41ab6d-606a-43da-9b7e-1415aa622a55.jpg"),
        "a5": P("90a15bbd-9a4a-4e35-8daa-342309d1cdd2.jpg"),
        "a6": P("f1c8b4b5-5255-4521-82bc-6fe3f83efc01.jpg"), "a8": P("69582633-a4bd-4a7d-96d8-437b98b652e3.jpg"),
        "form": S("d7bf1a57-89de-4b6b-8f34-2f8491d27685.jpg"), "board": S("b8030027-253a-4759-9b06-3dda4c80cb64.jpg"),
        "applicant": S("1b0c5b23-66ce-4245-b438-9c9fec9eeef2.jpg"), "rec": S("d91bd3bd-5963-489f-bfc3-69fb99b9c86a.jpg"),
        "medium": F("26922534527094151495"), "semi": F("21826400837422618354"), "bold": F("13126613945243871786"),
        "xbold": F("36007769206346275091"), "black": F("63211336242695272495"),
    },
    "composition": {"width": W, "height": H, "fps": 30, "duration": DUR},
    "layers": L,
}
s = json.dumps(scene, separators=(",", ":"), ensure_ascii=False)
open("/home/claude/ad/scene4.json", "w").write(s)
print(len(L), "layers", len(s), "bytes")
