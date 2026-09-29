# Gera a arte do "Crodila Transex" a partir de assets/crodila/mockup.png (tela 1024x1536) e sheet.png (peças).
# Uso: python tools/crodila_assets.py  (precisa de pillow, numpy, opencv e rembg)
import os, json
import numpy as np, cv2
from PIL import Image
from rembg import remove, new_session
D = 'assets/crodila/'
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
SYMS = {'wild': (972, 762, 1154, 1012), 'scatter': (1150, 762, 1350, 1014), 'crodila': (8, 752, 188, 897),
        'coroa': (922, 468, 1098, 614), 'labios': (776, 486, 928, 610), 'salto': (1098, 460, 1234, 608),
        'drink': (466, 476, 602, 624), 'dinheiro': (598, 486, 760, 620), 'coco': (733, 606, 884, 754),
        'coracao': (22, 622, 158, 750)}
for name, box in SYMS.items():
    if todo('s_' + name): symbol(cut(sheet, box), name)

# ---------- animações (tiras) ----------
BODY_X = [(0, 215), (195, 382), (372, 552), (535, 748), (748, 938), (928, 1138), (1122, 1338), (1333, 1536)]
if todo('walk'): strip([cut(sheet, (x0, 0, x1, 332)) for x0, x1 in BODY_X], 'walk', 320)
FACE_X = [(0, 162), (158, 312), (308, 452), (448, 592), (588, 722), (718, 852), (848, 988), (984, 1132), (1128, 1322)]
if todo('faces'): strip([cut(sheet, (x0, 322, x1, 468)) for x0, x1 in FACE_X], 'faces', 200)
for name, box, h, big in [('logo', (0, 444, 352, 642), 300, True), ('bonus', (1348, 762, 1534, 1014), 300, True),
                          ('cash_burst', (1262, 580, 1536, 775), 300, False), ('money', (0, 892, 215, 1024), 220, False),
                          ('money2', (205, 892, 442, 1024), 220, False), ('hearts', (636, 885, 982, 1024), 220, False),
                          ('coin', (984, 652, 1088, 748), 120, True), ('bolsa', (352, 468, 482, 604), 160, True)]:
    if todo(name): single(cut(sheet, box, keep_largest=big), name, h)

# ---------- Crodila grande do mockup: corpo + cabeça separada (pra balançar), no lugar exato ----------
BIG = (430, 0, 1010, 575)
if todo('big_body'):
    full = np.array(cut(mock, BIG, trim=False))
    full[..., :3] = np.array(mock.crop(BIG))  # a IA zera a cor do que acha que é fundo
    # a IA levou pedaços do logo junto (o "A" e o "X" encostam no cabelo): tira tudo que é logo
    LOGO = (20, 110, 535, 475)
    logo = np.array(cut(mock, LOGO, trim=False))
    logo[..., :3] = np.array(mock.crop(LOGO))
    Image.fromarray(logo, 'RGBA').save(D + 'logo_art.webp', quality=90)  # logo com a silhueta dele, por cima da Crodila
    la = np.zeros(full.shape[:2], np.float32)
    ox, oy = LOGO[0] - BIG[0], LOGO[1] - BIG[1]  # logo começa antes da caixa da Crodila em x
    sub = logo[:, -ox:, 3] if ox < 0 else logo[..., 3]
    la[oy:oy + sub.shape[0], max(ox, 0):max(ox, 0) + sub.shape[1]] = cv2.dilate(sub, np.ones((5, 5), np.uint8)) / 255
    full[..., 3] = (full[..., 3] * (1 - la)).astype(np.uint8)
    # cabeça (cabelo, óculos, focinho): polígono em coordenadas do mockup; pivô no pescoço (~650, 290)
    HEAD = [(430, 0), (840, 0), (840, 190), (760, 215), (700, 250), (660, 290), (600, 300), (560, 330), (500, 360), (430, 360)]
    m = np.zeros(full.shape[:2], np.uint8)
    cv2.fillPoly(m, [np.array([(x - BIG[0], y - BIG[1]) for x, y in HEAD], np.int32)], 255)
    soft = cv2.GaussianBlur(cv2.erode(m, np.ones((9, 9), np.uint8)), (0, 0), 6)  # borda some aos poucos: não aparece emenda ao girar
    head = full.copy(); head[..., 3] = (head[..., 3].astype(np.uint16) * soft // 255).astype(np.uint8)
    Image.fromarray(head, 'RGBA').save(D + 'big_head.webp', quality=90)
    # o corpo guarda a cabeça por baixo (a camada de cima cobre; ao girar não abre buraco)
    Image.fromarray(full, 'RGBA').save(D + 'big_body.webp', quality=90)

# ---------- fundo: rolos vazios + Crodila apagada (as camadas cobrem) ----------
im = cv2.imread(D + 'mockup.png')
a = np.array(Image.open(D + 'big_body.webp'))[..., 3]
mask = np.zeros(im.shape[:2], np.uint8)
mask[BIG[1]:BIG[3], BIG[0]:BIG[2]] = cv2.dilate((a > 20).astype(np.uint8) * 255, np.ones((15, 15), np.uint8))
mask[575:, :] = 0  # a moldura dos rolos fica
mask[110:475, 20:535] = 0  # o logo fica (ele vai numa camada por cima da Crodila, como na arte)
im = cv2.inpaint(im, mask, 9, cv2.INPAINT_TELEA).astype(np.float32)
# colunas cor de pergaminho com luz no meio, como na arte
COLS = [(58, 230), (235, 418), (422, 600), (606, 786), (792, 965)]
Y0, Y1 = 575, 1210
for i, (x0, x1) in enumerate(COLS):
    base = np.array([118, 178, 214] if i % 2 == 0 else [104, 164, 204], np.float32)  # BGR
    h, w = Y1 - Y0, x1 - x0
    yy, xx = np.mgrid[0:h, 0:w]
    glow = 1.12 - .35 * np.hypot((xx - w / 2) / (w / 2), (yy - h / 2) / (h / 1.2)).clip(0, 1)
    im[Y0:Y1, x0:x1] = base * glow[..., None]
cv2.imwrite(D + 'bg.webp', np.clip(im, 0, 255).astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 90])

SPR = {}
for n, k in [('walk', 8), ('faces', 9)]:
    w, h = Image.open(D + n + '.webp').size; SPR[n] = [k, w // k, h]
print('SPR', json.dumps(SPR))

# ---------- evento topless censurado: quadro de frente sem o bikini de cima (a tarja cobre o peito no jogo) ----------
if todo('topless'):
    fw = SPR['walk'][1]
    f = np.array(Image.open(D + 'walk.webp').convert('RGBA').crop((0, 0, fw, SPR['walk'][2])))
    hsv = cv2.cvtColor(f[..., :3], cv2.COLOR_RGB2HSV)
    pink = ((hsv[..., 0] >= 135) | (hsv[..., 0] <= 8)) & (hsv[..., 1] > 70) & (f[..., 3] > 100)
    area = np.zeros_like(pink); area[84:168, 78:174] = True  # só o torso: fora ficam cabelo, bolsa e calcinha
    m = cv2.dilate((pink & area).astype(np.uint8) * 255, np.ones((5, 5), np.uint8))
    rgb = cv2.inpaint(np.ascontiguousarray(f[..., :3]), m, 7, cv2.INPAINT_TELEA)
    Image.fromarray(np.dstack([rgb, f[..., 3]]), 'RGBA').save(D + 'topless.webp', quality=90)
