# Gera a arte do "Pato Bolado Crash" a partir de assets/pato/fundo.png (cenário 940x1672, sem interface),
# mockup.png (referência da tela) e sheet.png (peças sobre fundo preto).
# Uso: python tools/pato_assets.py  (precisa de pillow, numpy, opencv e rembg)
import os, json
import numpy as np, cv2
from PIL import Image
import onnxruntime as ort
# sem o cache de memória do onnxruntime: com ele cada recorte segura ~7 GB e a máquina mata o processo no meio
_SO = ort.SessionOptions
def _so():
    o = _SO(); o.enable_cpu_mem_arena = False; o.enable_mem_pattern = False; return o
ort.SessionOptions = _so
from rembg import remove, new_session
D = 'assets/pato/'
sess = new_session('birefnet-general-lite')
todo = lambda name: not os.path.exists(D + name + '.webp')  # IA é lenta (CPU): só refaz o que falta; apague o arquivo pra refazer
sheet = Image.open(D + 'sheet.png').convert('RGB')
fundo = Image.open(D + 'fundo.png').convert('RGB')

def cut(src, box, glow=False, trim=True, keep_largest=True):
    """recorta com fundo transparente (2x pra IA enxergar melhor). glow: mantém também a fumaça verde
    brilhante em volta (a IA acha que é fundo), pelo brilho dos pixels verdes"""
    c = src.crop(box); c = c.resize((c.width * 2, c.height * 2), Image.LANCZOS)
    r = np.array(remove(c, session=sess))
    r[..., :3] = np.array(c)  # a IA zera a cor do que acha que é fundo
    if glow:
        hsv = cv2.cvtColor(np.array(c), cv2.COLOR_RGB2HSV)
        green = (hsv[..., 0] >= 35) & (hsv[..., 0] <= 90)
        lum = np.clip((hsv[..., 2].astype(np.float32) - 35) / 70, 0, 1) * 255
        r[..., 3] = np.maximum(r[..., 3], (lum * green).astype(np.uint8))
    if keep_largest:  # só o maior pedaço: descarta pedaços dos quadros vizinhos e os títulos da folha
        n, lab, st, _ = cv2.connectedComponentsWithStats((r[..., 3] > 40).astype(np.uint8))
        if n > 1:
            big = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
            r[..., 3] = r[..., 3] * cv2.dilate((lab == big).astype(np.uint8), np.ones((9, 9), np.uint8))
    img = Image.fromarray(r, 'RGBA')
    return img.crop(img.getbbox()) if trim else img.resize((img.width // 2, img.height // 2), Image.LANCZOS)

SPR = {}
def strip(frames, name, h):
    """tira horizontal de quadros do mesmo tamanho (centralizados, base alinhada) pra CSS steps()"""
    k = h / max(f.height for f in frames)
    fr = [f.resize((round(f.width * k), round(f.height * k)), Image.LANCZOS) for f in frames]
    w = max(f.width for f in fr)
    out = Image.new('RGBA', (w * len(fr), h))
    for i, f in enumerate(fr): out.alpha_composite(f, (i * w + (w - f.width) // 2, h - f.height))
    out.save(D + name + '.webp', quality=88)

def row(name, xs, y0, y1, h, **kw):
    if todo(name): strip([cut(sheet, (x0, y0, x1, y1), **kw) for x0, x1 in xs], name, h)

# ---------- personagem ----------
row('idle', [(383, 482), (488, 588), (588, 706), (708, 840), (838, 976), (972, 1096), (1092, 1212), (1208, 1346), (1342, 1506)], 10, 142, 240)
row('faces', [(3, 107), (108, 212), (213, 317), (322, 432), (438, 552), (558, 667), (678, 792), (798, 907), (913, 1032),
              (1058, 1167), (1168, 1302), (1303, 1432), (1438, 1533)], 478, 592, 220)
row('win', [(3, 212), (208, 347), (343, 527), (523, 677), (673, 800)], 622, 795, 300, keep_largest=False)  # moedas soltas em volta fazem parte
row('fall', [(803, 937), (933, 1042), (1038, 1182), (1178, 1342), (1343, 1533)], 624, 795, 300, keep_largest=False)  # penas soltas fazem parte; y 624 corta o título
for name, box, h in [('leaf', (3, 922, 72, 1022), 120), ('leaf_gold', (135, 905, 202, 1022), 120), ('leaf_neon', (200, 905, 262, 1022), 120),
                     ('feather', (735, 932, 792, 1018), 120), ('cap', (838, 918, 937, 1022), 160), ('coin', (406, 925, 464, 1004), 100)]:
    if todo(name): cut(sheet, box).resize((round(h * (box[2] - box[0]) / (box[3] - box[1])), h), Image.LANCZOS).save(D + name + '.webp', quality=88)

# ---------- efeitos: fundo preto puro, então vão crus e o jogo usa mix-blend-mode:screen (o preto some) ----------
for name, box in {'trail1': (3, 800, 82, 902), 'trail2': (83, 800, 162, 902), 'trail3': (240, 800, 320, 902), 'streak': (460, 800, 682, 902),
                  'sparkle': (693, 800, 795, 902), 'star': (843, 800, 917, 902), 'burst': (968, 800, 1037, 902),
                  'smoke': (1093, 800, 1205, 902), 'smoke2': (1198, 800, 1312, 902), 'boom': (1328, 800, 1533, 902)}.items():
    if todo(name):
        c = np.array(sheet.crop(box)).astype(np.float32)
        c = np.clip((c - 12) * 255 / 243, 0, 255)  # o "preto" da folha tem ~10 de brilho: zera pra não ficar quadrado no screen
        Image.fromarray(c.astype(np.uint8)).save(D + name + '.webp', quality=88)

# ---------- logo do cenário: recortado no lugar (anima por cima) e apagado do fundo ----------
LOGO = (150, 8, 860, 402)
if todo('logo'): cut(fundo, LOGO, trim=False).save(D + 'logo.webp', quality=90)
if todo('bg'):
    im = cv2.imread(D + 'fundo.png')
    a = np.array(Image.open(D + 'logo.webp'))[..., 3]
    mask = np.zeros(im.shape[:2], np.uint8)
    mask[LOGO[1]:LOGO[3], LOGO[0]:LOGO[2]] = cv2.dilate((a > 20).astype(np.uint8) * 255, np.ones((15, 15), np.uint8))
    cv2.imwrite(D + 'bg.webp', cv2.inpaint(im, mask, 9, cv2.INPAINT_TELEA), [cv2.IMWRITE_WEBP_QUALITY, 88])

# ---------- voo: sem o rastro verde da folha (ele é cortado reto na borda de cada quadro; o jogo faz o rastro
# com partículas). Só o 1º quadro sai inteiro: nos outros o corpo invade o quadro vizinho. O jogo anima esse
# quadro com movimento contínuo (bater de asa, balanço, inclinação). ----------
FLY_OK = [(3, 127)]
row('fly_ok', FLY_OK, 338, 448, 220)

for n, k in [('idle', 9), ('fly_ok', 1), ('faces', 13), ('win', 5), ('fall', 5)]:
    w, h = Image.open(D + n + '.webp').size; SPR[n] = [k, w // k, h]
print('SPR', json.dumps(SPR))

