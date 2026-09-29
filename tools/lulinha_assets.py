# Gera a arte do "Lulinha" a partir de assets/lulinha/mockup.png (tela 941x1672) e sheet.png (peças).
# Uso: python tools/lulinha_assets.py  (precisa de pillow, numpy, opencv e rembg)
import os, json
import numpy as np, cv2
from PIL import Image
from rembg import remove, new_session
D = 'assets/lulinha/'
sess = new_session('birefnet-general-lite')
todo = lambda name: not os.path.exists(D + name + '.webp')  # IA é lenta (CPU): só refaz o que falta; apague o arquivo pra refazer
sheet = Image.open(D + 'sheet.png').convert('RGB')
mock = Image.open(D + 'mockup.png').convert('RGB')

def cut(src, box, keep_largest=True, trim=True):
    """recorta com fundo transparente (2x pra IA enxergar melhor) e apara as bordas vazias"""
    c = src.crop(box); c = c.resize((c.width * 2, c.height * 2), Image.LANCZOS)
    r = np.array(remove(c, session=sess))
    if keep_largest:  # só o maior pedaço: descarta pedaços dos vizinhos que entraram na caixa
        n, lab, st, _ = cv2.connectedComponentsWithStats((r[..., 3] > 40).astype(np.uint8))
        if n > 1:
            big = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
            keep = cv2.dilate((lab == big).astype(np.uint8), np.ones((9, 9), np.uint8))
            r[..., 3] = r[..., 3] * keep
    img = Image.fromarray(r, 'RGBA')
    return img.crop(img.getbbox()) if trim else img.resize((img.width // 2, img.height // 2), Image.LANCZOS)

SPR = {}
def strip(frames, name, h):
    """tira horizontal de quadros do mesmo tamanho (base alinhada, centralizados) pra CSS steps()"""
    k = h / max(f.height for f in frames)
    fr = [f.resize((round(f.width * k), round(f.height * k)), Image.LANCZOS) for f in frames]
    w = max(f.width for f in fr)
    out = Image.new('RGBA', (w * len(fr), h))
    for i, f in enumerate(fr): out.alpha_composite(f, (i * w + (w - f.width) // 2, h - f.height))
    out.save(D + name + '.webp', quality=88)

def single(img, name, h):
    img.resize((round(img.width * h / img.height), h), Image.LANCZOS).save(D + name + '.webp', quality=88)

def symbol(img, name, size=256):
    s = size / max(img.size); img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    out = Image.new('RGBA', (size, size)); out.alpha_composite(img, ((size - img.width) // 2, (size - img.height) // 2))
    out.save(D + 's_' + name + '.webp', quality=90)

# ---------- símbolos dos rolos (caixas na sheet.png) ----------
def tile(box):
    """quadrados com moldura: recorte direto (a IA come o fundo do quadro) + cantos arredondados"""
    t = sheet.crop(box).convert('RGBA')
    m = Image.new('L', t.size, 0); from PIL import ImageDraw
    ImageDraw.Draw(m).rounded_rectangle((0, 0, t.width - 1, t.height - 1), radius=9, fill=255)
    t.putalpha(m); return t
TILES = {'wild': (14, 585, 132, 700), 'lula': (215, 585, 320, 700), 'carro': (752, 585, 860, 700),
         'congresso': (861, 585, 972, 700), 'bandeira': (974, 585, 1080, 700)}
SYMS = {'estrela': (628, 478, 724, 582), 'cofre': (298, 468, 417, 582), 'saco': (8, 455, 107, 582),
        'dinheiro': (718, 492, 854, 582), 'reforma': (528, 468, 630, 582)}
for name, box in TILES.items(): symbol(tile(box), name)
for name, box in SYMS.items():
    if todo('s_' + name): symbol(cut(sheet, box), name)

# ---------- animações (tiras) ----------
if todo('run'): strip([cut(sheet, (x0, 0, x1, 150)) for x0, x1 in [(583, 750), (765, 945), (948, 1152), (1158, 1333), (1333, 1532)]], 'run', 220)
if todo('pf_run'): strip([cut(sheet, (x0, 286, x1, 398)) for x0, x1 in [(8, 98), (94, 198), (198, 293), (293, 390), (405, 538), (533, 622), (618, 718), (713, 834)]], 'pf_run', 200)
if todo('car'): strip([cut(sheet, (x0, 398, x1, 478)) for x0, x1 in [(168, 305), (315, 452), (452, 560), (560, 685)]], 'car', 160)
clean = sheet.copy(); clean.paste((240, 240, 240), (698, 278, 838, 402))
for name, box, h in [('heli', (3, 386, 152, 466), 140), ('burst', (698, 278, 1042, 478), 300), ('catch', (1028, 286, 1322, 428), 260),
                     ('jail', (1320, 292, 1518, 428), 260), ('banner', (3, 3, 568, 292), 400), ('face', (1428, 422, 1522, 534), 200)]:
    if todo(name): single(cut(clean if name == 'burst' else sheet, box, keep_largest=name not in ('burst', 'banner')), name, h)

# ---------- peças da tela que se mexem: recortadas do mockup, no lugar exato (sem aparar) ----------
PIECES = {'big': (262, 4, 766, 430), 'pf_big': (672, 312, 868, 540), 'heli_big': (74, 2, 268, 106), 'sign': (752, 0, 938, 250)}
for name, box in PIECES.items():
    if not todo(name): continue
    p = cut(mock, box, keep_largest=name != 'big', trim=False)  # Lula: fica com as moedas do saco (pedaços soltos)
    if name == 'big':  # ...mas não com o boné do federal que entra no canto da caixa
        a = np.array(p); a[308 - box[1]:, 738 - box[0]:, 3] = 0
        # a IA acha que a pilha de moedas em cima do saco é fundo: soma os pixels dourados dessa área
        hsv = cv2.cvtColor(np.array(mock.crop(box)), cv2.COLOR_RGB2HSV)
        gold = ((hsv[..., 0] >= 8) & (hsv[..., 0] <= 35) & (hsv[..., 1] > 110) & (hsv[..., 2] > 90)).astype(np.uint8)
        pile = np.zeros_like(gold); pile[0:175 - box[1], 300 - box[0]:640 - box[0]] = 1
        gold = cv2.morphologyEx(gold * pile, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
        gold = cv2.morphologyEx(gold, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
        a[..., 3] = np.maximum(a[..., 3], cv2.GaussianBlur(gold * 255, (0, 0), 1.2))
        a[..., :3] = np.array(mock.crop(box))  # a IA zera a cor do que acha que é fundo
        p = Image.fromarray(a)
    p.save(D + name + '.webp', quality=90)
print('PIECES', json.dumps(PIECES))

# ---------- fundo: rolos vazios, HUD sem valores, peças animadas apagadas ----------
im = cv2.imread(D + 'mockup.png')
mask = np.zeros(im.shape[:2], np.uint8)
for name, (x0, y0, x1, y1) in PIECES.items():
    a = np.array(Image.open(D + name + '.webp'))[..., 3]
    mask[y0:y1, x0:x1] |= (a > 20).astype(np.uint8) * 255
mask = cv2.dilate(mask, np.ones((15, 15), np.uint8))
# valores do HUD (texto claro dentro dos painéis)
hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
for x0, y0, x1, y1 in [(70, 1188, 275, 1240), (392, 1188, 548, 1240), (690, 1188, 880, 1240)]:
    mask[y0:y1, x0:x1] |= cv2.dilate(((hsv[y0:y1, x0:x1, 2] > 110)).astype(np.uint8) * 255, np.ones((7, 7), np.uint8))
im = cv2.inpaint(im, mask, 9, cv2.INPAINT_TELEA)

# rolos: colunas verde-escuras com brilho no meio, como na arte
COLS = [(52, 215), (218, 387), (390, 558), (562, 730), (733, 890)]
Y0, Y1 = 620, 1114
im = im.astype(np.float32)
for i, (x0, x1) in enumerate(COLS):
    base = np.array([30, 48, 14] if i % 2 == 0 else [22, 36, 10], np.float32)  # BGR
    h, w = Y1 - Y0, x1 - x0
    yy, xx = np.mgrid[0:h, 0:w]
    glow = 1.3 - .55 * np.hypot((xx - w / 2) / (w / 2), (yy - h / 2) / (h / 1.2)).clip(0, 1)
    im[Y0:Y1, x0:x1] = base * glow[..., None]
for x0, x1 in zip([c[1] for c in COLS[:-1]], [c[0] for c in COLS[1:]]):
    im[Y0:Y1, x0:x1] = [8, 60, 110]  # filete dourado escuro entre colunas
cv2.imwrite(D + 'bg.webp', np.clip(im, 0, 255).astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 90])

for n in ['run', 'pf_run', 'car']:
    w, h = Image.open(D + n + '.webp').size
    SPR[n] = {'run': 5, 'pf_run': 8, 'car': 4}[n]; SPR[n] = [SPR[n], w // SPR[n], h]
print('SPR', json.dumps(SPR))
