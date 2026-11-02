# Ícone original do Treino TalTech: capelo + check, estilo flat. Gera PNGs 16..256, .ico e preview.
from PIL import Image, ImageDraw, ImageFilter
SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256]

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))

def draw(size):
    S = 8 if size < 64 else 4
    W = size * S
    simple = size <= 24
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    # fundo: squircle com gradiente azul
    pad = 0 if simple else W * 0.04
    r = W * (0.20 if simple else 0.22)
    grad = Image.new("RGBA", (W, W))
    gd = ImageDraw.Draw(grad)
    top, bot = (59, 110, 230), (22, 40, 98)
    for y in range(W):
        gd.line([(0, y), (W, y)], fill=lerp(top, bot, y / W) + (255,))
    mask = Image.new("L", (W, W), 0)
    ImageDraw.Draw(mask).rounded_rectangle([pad, pad, W - pad - 1, W - pad - 1], radius=r, fill=255)
    img.paste(grad, (0, 0), mask)
    d = ImageDraw.Draw(img)
    u = W / 100.0
    white = (255, 255, 255, 255)
    # capelo (mortarboard)
    cx, cy = 50 * u, (40 if not simple else 42) * u
    hw, hh = (36 if not simple else 42) * u, (15 if not simple else 17) * u
    # base do chapéu (parte de baixo)
    bw = (21 if not simple else 25) * u
    d.polygon([(cx - bw, cy + 2 * u), (cx + bw, cy + 2 * u), (cx + bw, cy + (19 if not simple else 22) * u),
               (cx, cy + (25 if not simple else 28) * u), (cx - bw, cy + (19 if not simple else 22) * u)], fill=(225, 233, 252, 255))
    # placa superior (losango)
    if not simple:
        d.polygon([(cx, cy - hh + 3 * u), (cx + hw, cy + 3 * u), (cx, cy + hh + 3 * u), (cx - hw, cy + 3 * u)], fill=(10, 22, 60, 90))
    d.polygon([(cx, cy - hh), (cx + hw, cy), (cx, cy + hh), (cx - hw, cy)], fill=white)
    # borla
    if not simple:
        d.line([(cx, cy), (cx + hw * 0.78, cy + 4 * u), (cx + hw * 0.78, cy + 22 * u)], fill=(255, 196, 61, 255), width=int(3 * u))
        d.ellipse([cx + hw * 0.78 - 4 * u, cy + 20 * u, cx + hw * 0.78 + 4 * u, cy + 29 * u], fill=(255, 196, 61, 255))
        d.ellipse([cx - 3 * u, cy - 3 * u, cx + 3 * u, cy + 3 * u], fill=(255, 196, 61, 255))
    # selo verde com check
    br = (19 if not simple else 23) * u
    bx, by = (73 if not simple else 72) * u, (74 if not simple else 72) * u
    ring = (22, 40, 98, 255)
    d.ellipse([bx - br - 3.5 * u, by - br - 3.5 * u, bx + br + 3.5 * u, by + br + 3.5 * u], fill=ring)
    d.ellipse([bx - br, by - br, bx + br, by + br], fill=(34, 197, 94, 255))
    lw = int((5.5 if not simple else 7.5) * u)
    pts = [(bx - br * 0.50, by + br * 0.02), (bx - br * 0.12, by + br * 0.42), (bx + br * 0.55, by - br * 0.40)]
    d.line(pts, fill=white, width=lw, joint="curve")
    for p in (pts[0], pts[2]):
        d.ellipse([p[0] - lw / 2, p[1] - lw / 2, p[0] + lw / 2, p[1] + lw / 2], fill=white)
    return img.resize((size, size), Image.LANCZOS)

imgs = {s: draw(s) for s in SIZES}
for s, im in imgs.items():
    im.save(f"icon-{s}.png")
imgs[256].save("app.ico", format="ICO", sizes=[(s, s) for s in SIZES], append_images=[imgs[s] for s in SIZES if s != 256])
# preview: grande + tamanhos reais em fundo claro e escuro
pv = Image.new("RGBA", (760, 330), (244, 246, 250, 255))
pv.paste(imgs[256], (24, 37), imgs[256])
x = 310
for s in [128, 64, 48, 32, 24, 16]:
    for row, bg in enumerate([(244, 246, 250, 255), (32, 32, 36, 255)]):
        y0 = 40 + row * 150
        if x == 310:
            ImageDraw.Draw(pv).rectangle([300, y0 - 10, 750, y0 + 138], fill=bg)
        pv.paste(imgs[s], (x, y0 + (128 - s) // 2), imgs[s])
    x += s + 22
pv.save("icon-preview.png")
print("ok")
