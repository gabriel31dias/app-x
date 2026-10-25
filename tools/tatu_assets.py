# Gera a arte do "Tatu na BR" a partir de assets/tatu/mockup.png (tela 1024x1536) e das folhas com transparência
# sheet.png (veículos e efeitos), chars.png (quadros do tatu) e ui.png (logo, letreiros, botões), todas 1536x1024.
# Uso: uv run --with onnxruntime --with opencv-python-headless --with pillow --with numpy python tools/tatu_assets.py
# LaMa (retoque do fundo): curl -L -o ~/.cache/lama/lama_fp32.onnx https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx
import os, json
import numpy as np, cv2
from PIL import Image
D = 'assets/tatu/'
todo = lambda name: not os.path.exists(D + name + '.webp')  # só refaz o que falta; apague o arquivo pra refazer
mock = np.array(Image.open(D + 'mockup.png').convert('RGB'))
SHEETS = {n: np.array(Image.open(D + n + '.png').convert('RGBA')) for n in ('sheet', 'chars', 'ui')}

def piece(sheet, box, keep=.04):
    """recorte pelo alfa da folha: fica o pedaço maior da caixa e os que tiverem pelo menos `keep` do tamanho dele
    (o boné voando fica, migalha do quadro vizinho sai); keep=0 fica tudo"""
    x0, y0, x1, y1 = box
    p = SHEETS[sheet][y0:y1, x0:x1].copy()
    if keep:
        n, lab, st, _ = cv2.connectedComponentsWithStats((p[..., 3] > 20).astype(np.uint8))
        if n > 1:
            big = st[1:, cv2.CC_STAT_AREA].max()
            ok = [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] >= big * keep]
            p[..., 3] *= np.isin(lab, ok).astype(np.uint8)
    img = Image.fromarray(p, 'RGBA')
    return img.crop(img.getbbox())

def save(img, name, s=1.0):
    if s != 1: img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    img.save(D + name + '.webp', quality=90)
    return img.size

META = {}
def out(sheet, name, box, s=1.0, keep=.04):
    if todo(name): save(piece(sheet, box, keep), name, s)
    META[name] = list(Image.open(D + name + '.webp').size)

# ---------- veículos (todos virados pra direita; o jogo espelha nas faixas que vêm da direita) ----------
VEIC = {'kombi': (10, 112, 312, 324), 'melancia': (318, 130, 702, 326), 'onibus': (712, 130, 1059, 326), 'moto': (1060, 134, 1253, 322),
        'hatch': (1255, 168, 1530, 324), 'pickup': (14, 380, 326, 562), 'carroca': (327, 362, 622, 562), 'lixo': (620, 380, 942, 577),
        'policia': (944, 398, 1192, 562), 'tanque': (1194, 372, 1534, 567)}
for n, box in VEIC.items(): out('sheet', 'v_' + n, box, .8)
# ---------- peças da estrada e efeitos ----------
for n, box, keep in [('bump', (14, 636, 318, 734), .04), ('bumpgold', (318, 616, 634, 758), 0), ('plank', (640, 626, 896, 752), .04),
                     ('pothole', (910, 600, 1168, 774), 0), ('cone', (1172, 606, 1308, 770), .04), ('barrier', (1334, 582, 1524, 776), .04),
                     ('dust', (16, 786, 274, 976), 0), ('skid', (282, 790, 580, 978), 0), ('coin', (590, 798, 754, 974), .04),
                     ('coins', (772, 786, 1024, 980), 0), ('sparkle', (1052, 780, 1252, 984), 0), ('boom', (1262, 780, 1516, 992), .04)]:
    out('sheet', n, box, .7, keep)

# ---------- tatu: 16 quadros, mesma escala da folha (o jogo alinha pela base) ----------
CH = [(0, 50, 362, [10, 270, 522, 752, 990, 1265, 1532]),        # 0 parado, 1 piscando, 2 olhando, 3 nervoso, 4-5 andando
      (1, 362, 662, [28, 282, 557, 822, 1027, 1302, 1532]),      # 6 pulo, 7 arrancada, 8 susto, 9 bola, 10 rolando, 11 tonto
      (2, 658, 978, [160, 437, 752, 1062, 1334])]                # 12 festa, 13 boné, 14 saco de moedas, 15 joinha
i = 0
for _, y0, y1, xs in CH:
    for a, b in zip(xs, xs[1:]):
        out('chars', f't{i}', (a, y0, b, y1), .75, .03); i += 1

# ---------- interface ----------
for n, box, keep in [('logo', (30, 6, 822, 400), .002), ('sacou', (784, 6, 1528, 408), .002), ('atropelou', (28, 380, 816, 752), .002),
                     ('btnSacar', (852, 412, 1480, 584), .04), ('btnGo', (842, 584, 1490, 758), .04),
                     ('risk0', (6, 752, 206, 1000), .04), ('risk1', (206, 752, 406, 1000), .04), ('risk2', (406, 752, 606, 1000), .04),
                     ('risk3', (606, 752, 818, 1000), .04), ('bigcoin', (1330, 766, 1534, 990), .04)]:
    out('ui', n, box, .6, keep)

# ---------- cenário: a tela sem carros, quebra-molas e tatu, fatiada (topo, 6 faixas, calçada) ----------
SEP = [212, 316, 433, 562, 688, 817, 945]  # divisas das faixas (meio-fio), de cima pra baixo
CARS = [(140, 212, 334, 300), (752, 182, 1024, 312), (155, 318, 334, 420), (712, 326, 898, 422), (40, 452, 292, 552), (668, 418, 1024, 560),
        (40, 566, 288, 678), (786, 582, 1010, 678), (166, 660, 398, 814), (816, 708, 1024, 812), (30, 822, 252, 942), (736, 834, 1004, 942)]
BUMPS = [(398, 190, 632, 300)] + [(410, y0 + 14, 620, y1 - 14) for y0, y1 in zip(SEP[1:], SEP[2:])]
TATU = (420, 944, 614, 1222)
import onnxruntime as ort
def _so():
    o = ort_so(); o.enable_cpu_mem_arena = False; o.enable_mem_pattern = False; return o
ort_so = ort.SessionOptions; ort.SessionOptions = _so  # sem o cache de memória do onnxruntime (estoura a RAM)
lama = None
def inpaint(im, m, box):
    """retoca m (máscara) dentro da janela box com o LaMa (entrada 512x512)"""
    global lama
    lama = lama or ort.InferenceSession(os.path.expanduser('~/.cache/lama/lama_fp32.onnx'))
    x0, y0, x1, y1 = box
    win, wm = im[y0:y1, x0:x1], m[y0:y1, x0:x1]
    if not wm.any(): return
    x = cv2.resize(win, (512, 512), interpolation=cv2.INTER_AREA).transpose(2, 0, 1)[None].astype(np.float32) / 255
    mk = (cv2.resize(wm, (512, 512), interpolation=cv2.INTER_NEAREST) > 0)[None, None].astype(np.float32)
    o = lama.run(None, {'image': x, 'mask': mk})[0][0].transpose(1, 2, 0)
    o = cv2.resize(np.clip(o, 0, 255).astype(np.uint8), (x1 - x0, y1 - y0), interpolation=cv2.INTER_CUBIC)
    k = cv2.GaussianBlur((wm > 0).astype(np.float32), (7, 7), 0)[..., None]
    im[y0:y1, x0:x1] = (o * k + win * (1 - k)).astype(np.uint8)
    m[y0:y1, x0:x1] = 0

names = ['top', 'side'] + [f'lane{t}' for t in range(6)]
if any(todo(n) for n in names):
    im = mock.copy()
    m = np.zeros(im.shape[:2], np.uint8)
    for x0, y0, x1, y1 in CARS: m[y0:y1 + 14, x0:x1] = 1  # + a sombra embaixo
    for x0, y0, x1, y1 in BUMPS + [TATU]: m[y0:y1, x0:x1] = 1
    m = cv2.dilate(m, np.ones((21, 21), np.uint8))
    # janelas 512x512 em tamanho real (sem perder nitidez): primeiro a coluna do meio (quebra-molas e tatu numa janela só,
    # senão fica emenda no x=512), depois os carros de cada lado
    for y in (100, 400, 700, 900): inpaint(im, m, (256, y, 768, y + 512))
    for y in (100, 400, 700):
        for x in (0, 512):
            inpaint(im, m, (x, y, x + 512, y + 512))
    img = Image.fromarray(im)
    img.crop((0, 0, 1024, SEP[0])).save(D + 'top.webp', quality=88)
    for t in range(6): img.crop((0, SEP[t], 1024, SEP[t + 1])).save(D + f'lane{t}.webp', quality=88)
    img.crop((0, SEP[6], 1024, 1536)).save(D + 'side.webp', quality=88)
# painel de baixo fixo (o mundo rola atrás dele): topo esfumado
if todo('panel'):
    p = mock[1176:].copy()
    a = np.full(p.shape[:2], 255, np.uint8)
    a[:14] = np.linspace(0, 255, 14)[:, None]
    Image.fromarray(np.dstack([p, a]), 'RGBA').save(D + 'panel.webp', quality=90)

# card do lobby (400x320): logo, estrada e carros
if not os.path.exists('assets/card_grid_tatu.png'):
    Image.fromarray(mock[0:819]).resize((400, 320), Image.LANCZOS).save('assets/card_grid_tatu.png', optimize=True)

print('SEP', SEP)
print('META', json.dumps(META, separators=(',', ':')))
