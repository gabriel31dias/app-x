# Gera a arte do "Sapinho Pulador Crash": fundo limpo (sem números/jogadores pintados) + tiras de animação
# da folha assets/sapo/sheet.png (já transparente). Uso: python tools/sapo_assets.py (pillow, numpy, opencv)
import numpy as np, cv2
from PIL import Image
D = 'assets/sapo/'

# ---------- fundo ----------
im = cv2.imread(D + 'fundo.png').astype(np.float32)
def hinterp(x0, x1, y0, y1):  # linha a linha, entre a coluna x0-1 e x1
    a, b = im[y0:y1, x0 - 1], im[y0:y1, x1]
    t = np.linspace(0, 1, x1 - x0)[None, :, None]
    im[y0:y1, x0:x1] = a[:, None] * (1 - t) + b[:, None] * t
def vinterp(x0, x1, y0, y1):  # coluna a coluna, entre a linha y0-1 e y1
    a, b = im[y0 - 1, x0:x1], im[y1, x0:x1]
    t = np.linspace(0, 1, y1 - y0)[:, None, None]
    im[y0:y1, x0:x1] = a[None] * (1 - t) + b[None] * t
hinterp(706, 852, 30, 74)       # saldo
vinterp(24, 180, 350, 968)      # histórico (valores falsos)
vinterp(662, 924, 336, 896)     # painel "jogadores" (falso) -> vira "suas apostas"
hinterp(180, 364, 1450, 1504)   # R$ 10,00
hinterp(576, 762, 1450, 1504)   # 2.00x
hinterp(290, 642, 1548, 1626)   # ▶ APOSTAR
cv2.imwrite(D + 'bg.webp', np.clip(im, 0, 255).astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 90])

# ---------- tiras ----------
sheet = np.array(Image.open(D + 'sheet.png').convert('RGBA'))
def cut(box):
    x0, y0, x1, y1 = box
    c = sheet[y0:y1, x0:x1].copy()
    n, lab, st, _ = cv2.connectedComponentsWithStats((c[..., 3] > 90).astype(np.uint8))
    if n > 1:  # só o sapo principal (+ brilho em volta); descarta pedaços dos vizinhos
        big = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
        keep = cv2.dilate((lab == big).astype(np.uint8), np.ones((25, 25), np.uint8))
        keep = cv2.GaussianBlur(keep.astype(np.float32), (0, 0), 4)
        c[..., 3] = (c[..., 3] * np.clip(keep * 1.5, 0, 1)).astype(np.uint8)
    img = Image.fromarray(c, 'RGBA')
    return img.crop(img.getbbox())
def strip(boxes, name, h):
    fr = [cut(b) for b in boxes]
    k = h / max(f.height for f in fr)
    fr = [f.resize((round(f.width * k), round(f.height * k)), Image.LANCZOS) for f in fr]
    w = max(f.width for f in fr)
    out = Image.new('RGBA', (w * len(fr), h))
    for i, f in enumerate(fr): out.alpha_composite(f, (i * w + (w - f.width) // 2, h - f.height))
    out.save(D + name + '.webp', quality=88)
    print(f'{name}: [{len(fr)}, {w}, {h}]')
R1 = [(0, 0, 168, 208), (165, 0, 322, 208), (318, 0, 482, 208), (478, 0, 650, 208), (646, 0, 818, 208), (814, 0, 992, 208), (988, 0, 1210, 208)]
R2 = [(0, 208, 152, 400), (148, 208, 292, 400), (286, 208, 432, 400), (428, 208, 590, 400), (578, 208, 694, 400), (690, 208, 800, 400), (796, 208, 942, 400), (940, 208, 1062, 400), (1040, 180, 1215, 415)]
R3 = [(0, 385, 152, 530), (150, 385, 302, 530), (300, 385, 468, 530), (462, 385, 632, 530), (628, 385, 780, 530)]
strip(R1[:2], 'idle', 200)
strip(R1[2:] + R2[:4], 'fly', 200)
strip(R2[4:], 'fall', 200)
strip(R3, 'dead', 150)
strip([(545, 672, 642, 770), (643, 672, 731, 772), (732, 672, 826, 780), (831, 670, 950, 784), (959, 670, 1080, 800), (1086, 670, 1208, 804)], 'splash', 130)
