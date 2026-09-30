# Gera a arte do "Urubuzinho Carioca" a partir de assets/urubu/mockup.png (tela 1024x1536) e sheet.png (peças).
# Uso: python tools/urubu_assets.py  (precisa de pillow, numpy, opencv e rembg)
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
D = 'assets/urubu/'
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

def tile(src, box, radius=14):
    """quadros com moldura: recorte direto (a IA come o fundo do quadro) + cantos arredondados"""
    t = src.crop(box).convert('RGBA'); m = Image.new('L', t.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, t.width - 1, t.height - 1), radius=radius, fill=255)
    t.putalpha(m); return t

# ---------- símbolos ----------
if todo('s_urubu'): symbol(tile(mock, (62, 677, 240, 850)), 'urubu')     # o quadro do urubu só existe no mockup
if todo('s_praia'): symbol(tile(sheet, (1098, 490, 1198, 598)), 'praia')
if todo('s_scatter'): symbol(tile(sheet, (1406, 814, 1532, 958), 18), 'scatter')  # a IA come o céu do quadro
for name, box in {'wild': (1266, 810, 1404, 958), 'saco': (8, 478, 108, 592),
                  'dinheiro': (588, 342, 706, 452), 'chope': (558, 462, 668, 604), 'coco': (12, 335, 132, 470),
                  'chinelo': (388, 470, 548, 602), 'futebol': (462, 342, 584, 462)}.items():
    if todo('s_' + name): symbol(cut(sheet, box), name)

# ---------- animações ----------
WALK = [(703, 828), (828, 935), (933, 1048), (1046, 1163), (1163, 1288), (1288, 1413), (1411, 1534)]
if todo('walk'): strip([cut(sheet, (x0, 348, x1, 482)) for x0, x1 in WALK], 'walk', 240)
POSES = [(982, 1160, 0, 170), (1160, 1330, 0, 170), (1330, 1534, 0, 170),
         (875, 1055, 162, 342), (1052, 1222, 170, 342), (1218, 1400, 170, 342), (1398, 1534, 170, 342)]
if todo('poses'): strip([cut(sheet, (x0, y0, x1, y1)) for x0, x1, y0, y1 in POSES], 'poses', 240)
for name, box, h in [('casing', (470, 712, 528, 780), 60), ('coin', (986, 612, 1056, 702), 90),
                     ('coins', (1296, 710, 1534, 822), 200), ('hibisco', (220, 468, 385, 608), 140)]:
    if todo(name):
        c = cut(sheet, box, keep_largest=name != 'coins'); c.resize((round(c.width * h / c.height), h), Image.LANCZOS).save(D + name + '.webp', quality=88)

# ---------- urubu grande do mockup: corpo + braço com a arma separado (coice), logo por cima, no lugar exato ----------
BIG, LOGO = (170, 0, 900, 420), (90, 318, 1000, 668)
ARM = [(688, 150), (748, 44), (842, 26), (872, 70), (848, 118), (830, 150), (850, 270), (812, 300), (748, 306), (698, 250)]
GUN = [(688, 150), (748, 44), (842, 26), (872, 70), (848, 118), (830, 150), (838, 205), (700, 205)]  # parte de cima: sai do corpo
if todo('big_body'):
    logo = np.array(cut(mock, LOGO, trim=False)); logo[..., :3] = np.array(mock.crop(LOGO))
    Image.fromarray(logo, 'RGBA').save(D + 'logo.webp', quality=90)
    full = np.array(cut(mock, BIG, keep_largest=False, trim=False)); full[..., :3] = np.array(mock.crop(BIG))
    # o que é logo sai do urubu (o logo fica numa camada por cima)
    la = np.zeros(full.shape[:2], np.float32)
    ox, oy = LOGO[0] - BIG[0], LOGO[1] - BIG[1]
    sub = logo[:BIG[3] - LOGO[1], max(0, -ox):max(0, -ox) + BIG[2] - BIG[0], 3]
    la[oy:oy + sub.shape[0], max(ox, 0):max(ox, 0) + sub.shape[1]] = cv2.dilate(sub, np.ones((5, 5), np.uint8)) / 255
    full[..., 3] = (full[..., 3] * (1 - la)).astype(np.uint8)
    # tiro pintado na arte (clarão e cápsulas no céu) não é urubu
    full[:130, 830 - BIG[0]:, 3] = 0
    poly = lambda pts: np.array([(x - BIG[0], y - BIG[1]) for x, y in pts], np.int32)
    arm_m = cv2.fillPoly(np.zeros(full.shape[:2], np.uint8), [poly(ARM)], 255)
    arm = full.copy(); arm[..., 3] = (arm[..., 3].astype(np.uint16) * cv2.GaussianBlur(arm_m, (0, 0), 1.5) // 255).astype(np.uint8)
    Image.fromarray(arm, 'RGBA').save(D + 'big_arm.webp', quality=90)
    gun_m = cv2.GaussianBlur(cv2.fillPoly(np.zeros(full.shape[:2], np.uint8), [poly(GUN)], 255), (0, 0), 2)
    body = full.copy(); body[..., 3] = (body[..., 3].astype(np.uint16) * (255 - gun_m) // 255).astype(np.uint8)
    Image.fromarray(body, 'RGBA').save(D + 'big_body.webp', quality=90)

# ---------- fundo: urubu, tiro pintado e símbolos apagados; rolos vazios; logo fica (a camada cobre) ----------
if todo('bg'):
    im = cv2.imread(D + 'mockup.png')
    a = np.array(Image.open(D + 'big_body.webp'))[..., 3] | np.array(Image.open(D + 'big_arm.webp'))[..., 3]
    mask = np.zeros(im.shape[:2], np.uint8)
    mask[BIG[1]:BIG[3], BIG[0]:BIG[2]] = cv2.dilate((a > 20).astype(np.uint8) * 255, np.ones((21, 21), np.uint8))
    for x0, y0, x1, y1 in [(820, 0, 1000, 110), (720, 45, 780, 95), (850, 105, 900, 155), (930, 80, 985, 125), (825, 180, 870, 230)]:
        mask[y0:y1, x0:x1] = 255  # clarão e cápsulas pintados
    logo_a = np.zeros(im.shape[:2], np.uint8); logo_a[LOGO[1]:LOGO[3], LOGO[0]:LOGO[2]] = np.array(Image.open(D + 'logo.webp'))[..., 3]
    mask[logo_a > 60] = 0
    im = cv2.inpaint(im, mask, 9, cv2.INPAINT_TELEA).astype(np.float32)
    COLS = [(64, 240), (245, 420), (426, 602), (607, 785), (790, 964)]
    Y0, Y1 = 677, 1200
    for i, (x0, x1) in enumerate(COLS):  # papel creme com luz no meio, como na arte
        base = np.array([176, 214, 232] if i % 2 == 0 else [166, 205, 226], np.float32)  # BGR
        h, w = Y1 - Y0, x1 - x0
        yy, xx = np.mgrid[0:h, 0:w]
        glow = 1.08 - .28 * np.hypot((xx - w / 2) / (w / 2), (yy - h / 2) / (h / 1.2)).clip(0, 1)
        im[Y0:Y1, x0:x1] = base * glow[..., None]
    cv2.imwrite(D + 'bg.webp', np.clip(im, 0, 255).astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 90])

SPR = {}
for n, k in [('walk', len(WALK)), ('poses', len(POSES))]:
    w, h = Image.open(D + n + '.webp').size; SPR[n] = [k, w // k, h]
print('SPR', json.dumps(SPR))
