# Gera a arte do "Calango do Nordeste" a partir de assets/calango/mockup.png (tela 941x1672) e sheet.png (peças).
# Uso: python tools/calango_assets.py  (precisa de pillow, numpy, opencv e rembg)
import os, json
import numpy as np, cv2
from PIL import Image, ImageDraw
import onnxruntime as ort
# sem o cache de memória do onnxruntime: com ele cada recorte segura ~7 GB e a máquina mata o processo no meio
_SO = ort.SessionOptions
def _so():
    o = _SO(); o.enable_cpu_mem_arena = False; o.enable_mem_pattern = False; return o
ort.SessionOptions = _so
from rembg import remove, new_session
D = 'assets/calango/'
sess = new_session('birefnet-general-lite')
todo = lambda name: not os.path.exists(D + name + '.webp')  # IA é lenta (CPU): só refaz o que falta; apague o arquivo pra refazer
sheet = Image.open(D + 'sheet.png').convert('RGB')
mock = Image.open(D + 'mockup.png').convert('RGB')

def cut(src, box, keep_largest=True, trim=True):
    """recorta com fundo transparente (2x pra IA enxergar melhor) e apara as bordas vazias"""
    c = src.crop(box); c = c.resize((c.width * 2, c.height * 2), Image.LANCZOS)
    r = np.array(remove(c, session=sess))
    r[..., :3] = np.array(c)  # a IA zera a cor do que acha que é fundo
    if keep_largest:  # só o maior pedaço: descarta pedaços dos vizinhos que entraram na caixa
        n, lab, st, _ = cv2.connectedComponentsWithStats((r[..., 3] > 40).astype(np.uint8))
        if n > 1:
            big = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
            r[..., 3] = r[..., 3] * cv2.dilate((lab == big).astype(np.uint8), np.ones((9, 9), np.uint8))
    img = Image.fromarray(r, 'RGBA')
    return img.crop(img.getbbox()) if trim else img.resize((img.width // 2, img.height // 2), Image.LANCZOS)

def strip(frames, name, h):
    """tira horizontal de quadros do mesmo tamanho (base alinhada, centralizados) pra CSS steps()"""
    k = h / max(f.height for f in frames)
    fr = [f.resize((round(f.width * k), round(f.height * k)), Image.LANCZOS) for f in frames]
    w = max(f.width for f in fr)
    out = Image.new('RGBA', (w * len(fr), h))
    for i, f in enumerate(fr): out.alpha_composite(f, (i * w + (w - f.width) // 2, h - f.height))
    out.save(D + name + '.webp', quality=88)

def symbol(img, name, size=256):
    s = size / max(img.size); img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    out = Image.new('RGBA', (size, size)); out.alpha_composite(img, ((size - img.width) // 2, (size - img.height) // 2))
    out.save(D + 's_' + name + '.webp', quality=90)

def tile(src, box, radius=16):
    """quadros com moldura: recorte direto (a IA come o fundo do quadro) + cantos arredondados"""
    t = src.crop(box).convert('RGBA'); m = Image.new('L', t.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, t.width - 1, t.height - 1), radius=radius, fill=255)
    t.putalpha(m); return t

def single(img, name, h):
    img.resize((round(img.width * h / img.height), h), Image.LANCZOS).save(D + name + '.webp', quality=88)

# ---------- símbolos ----------
if todo('s_wild'): symbol(tile(sheet, (1368, 382, 1530, 524)), 'wild')
if todo('s_scatter'): symbol(cut(mock, (554, 966, 708, 1136)), 'scatter')  # o scatter só existe no mockup
for name, box in {'cacto': (15, 388, 165, 522), 'casa': (175, 390, 342, 520), 'cachaca': (392, 382, 484, 522), 'caju': (508, 392, 652, 524),
                  'chapeu': (655, 398, 832, 522), 'sanfona': (830, 392, 1014, 522), 'jegue': (1022, 378, 1172, 522), 'fogueira': (1188, 382, 1352, 522)}.items():
    if todo('s_' + name): symbol(cut(sheet, box), name)

# ---------- animações ----------
if todo('poses'): strip([cut(sheet, b) for b in [(468, 0, 668, 272), (668, 0, 838, 182), (838, 0, 1016, 182), (1016, 0, 1172, 178)]], 'poses', 260)
if todo('faces'): strip([cut(sheet, b) for b in [(698, 176, 792, 268), (792, 176, 882, 268), (880, 176, 972, 268), (972, 172, 1104, 272),
                                                  (496, 266, 624, 374), (622, 266, 742, 374), (742, 266, 862, 374), (860, 266, 992, 374)]], 'faces', 200)
if todo('run'): strip([cut(sheet, (1112, 146, 1378, 250), keep_largest=False), cut(sheet, (1166, 2, 1362, 152), keep_largest=False)], 'run', 200)
for name, box, h, big in [('fire', (1162, 282, 1362, 382), 140, False), ('swirl', (1358, 0, 1522, 100), 160, False), ('coins', (1338, 90, 1532, 282), 220, False),
                          ('dust', (996, 262, 1152, 372), 160, False), ('spark', (1358, 284, 1442, 352), 120, True), ('spark2', (1442, 282, 1532, 356), 120, True),
                          ('bag', (996, 938, 1082, 1010), 120, True), ('stack', (876, 860, 1000, 1016), 160, False)]:
    if todo(name): single(cut(sheet, box, keep_largest=big), name, h)

# ---------- peças que se mexem, recortadas do mockup no lugar exato (sem aparar) ----------
BIG, LOGO = (222, 0, 700, 318), (136, 282, 776, 588)
PIECES = {'jegue_big': (770, 392, 941, 578)}
# placa pregada no poste: recorte direto pela forma da madeira (a IA pegava só a tábua de cima e o "10")
SIGN = (772, 56, 936, 234)
if todo('big'):
    logo = np.array(cut(mock, LOGO, trim=False)); logo[..., :3] = np.array(mock.crop(LOGO))
    Image.fromarray(logo, 'RGBA').save(D + 'logo.webp', quality=90)
    full = np.array(cut(mock, BIG, trim=False)); full[..., :3] = np.array(mock.crop(BIG))
    la = np.zeros(full.shape[:2], np.float32)  # o que é logo sai do calango (o logo fica numa camada por cima)
    ox, oy = LOGO[0] - BIG[0], LOGO[1] - BIG[1]
    sub = logo[:BIG[3] - LOGO[1], max(0, -ox):max(0, -ox) + BIG[2] - BIG[0], 3]
    la[oy:oy + sub.shape[0], max(ox, 0):max(ox, 0) + sub.shape[1]] = cv2.dilate(sub, np.ones((5, 5), np.uint8)) / 255
    full[..., 3] = (full[..., 3] * (1 - la)).astype(np.uint8)
    Image.fromarray(full, 'RGBA').save(D + 'big.webp', quality=90)
if todo('sign'):
    t = mock.crop(SIGN).convert('RGBA'); m = Image.new('L', t.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((2, 2, t.width - 3, t.height - 3), radius=10, fill=255)
    t.putalpha(m); t.save(D + 'sign.webp', quality=90)
for name, box in PIECES.items():
    if todo(name):
        p = np.array(cut(mock, box, trim=False)); p[..., :3] = np.array(mock.crop(box)); Image.fromarray(p, 'RGBA').save(D + name + '.webp', quality=90)

# ---------- fundo: calango, placa e jegue apagados; rolos vazios; HUD sem valores; logo fica (a camada cobre) ----------
if todo('bg'):
    im = cv2.imread(D + 'mockup.png')
    mask = np.zeros(im.shape[:2], np.uint8)
    for name, (x0, y0, x1, y1) in {'big': BIG, **PIECES}.items():
        a = np.array(Image.open(D + name + '.webp'))[..., 3]
        mask[y0:y1, x0:x1] |= cv2.dilate((a > 20).astype(np.uint8) * 255, np.ones((15, 15), np.uint8))
    logo_a = np.zeros(im.shape[:2], np.uint8); logo_a[LOGO[1]:LOGO[3], LOGO[0]:LOGO[2]] = np.array(Image.open(D + 'logo.webp'))[..., 3]
    mask[logo_a > 60] = 0
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    for x0, y0, x1, y1 in [(60, 1262, 292, 1308), (398, 1262, 548, 1308), (678, 1262, 884, 1308)]:  # valores do HUD
        mask[y0:y1, x0:x1] |= cv2.dilate((hsv[y0:y1, x0:x1, 2] > 120).astype(np.uint8) * 255, np.ones((5, 5), np.uint8))
    x0, y0, x1, y1 = SIGN; mask[y0:y1, x0:x1] = 255  # a placa sai inteira
    im = cv2.inpaint(im, mask, 9, cv2.INPAINT_TELEA)
    post = im[0:52, 846:876].copy()  # o poste de cima continua atrás da placa
    for y in range(52, y1 + 6, 52): h = min(52, y1 + 6 - y); im[y:y + h, 846:876] = post[:h]
    im = im.astype(np.float32)
    COLS = [(78, 233), (237, 391), (395, 549), (553, 708), (712, 866)]
    Y0, Y1 = 620, 1138
    for i, (x0, x1) in enumerate(COLS):  # papel creme com luz no meio, como na arte
        base = np.array([160, 200, 226] if i % 2 == 0 else [150, 192, 220], np.float32)  # BGR
        h, w = Y1 - Y0, x1 - x0
        yy, xx = np.mgrid[0:h, 0:w]
        glow = 1.08 - .28 * np.hypot((xx - w / 2) / (w / 2), (yy - h / 2) / (h / 1.2)).clip(0, 1)
        im[Y0:Y1, x0:x1] = base * glow[..., None]
    cv2.imwrite(D + 'bg.webp', np.clip(im, 0, 255).astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 90])

SPR = {}
for n, k in [('poses', 4), ('faces', 8), ('run', 2)]:
    w, h = Image.open(D + n + '.webp').size; SPR[n] = [k, w // k, h]
print('SPR', json.dumps(SPR))
