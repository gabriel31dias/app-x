# Gera a arte da "Corrida dos Jegues" a partir de assets/jegues/mockup.png (tela 941x1672 desenhada) e sheet.png
# (peças já com fundo transparente: o recorte é pelo alfa; só os jegues parados nos portões do mockup usam IA,
# pra sair do fundo e virar sprite animado).
# Uso: uv run --with rembg --with onnxruntime --with opencv-python-headless --with pillow --with numpy python tools/jegues_assets.py
import os, json
import numpy as np, cv2
from PIL import Image
D = 'assets/jegues/'
todo = lambda name: not os.path.exists(D + name + '.webp')  # só refaz o que falta; apague o arquivo pra refazer
sheet = Image.open(D + 'sheet.png').convert('RGBA')
mock = Image.open(D + 'mockup.png').convert('RGB')

def cut(box, keep_largest=True, src=None):
    """recorte pelo alfa; keep_largest descarta pedaços dos quadros vizinhos"""
    r = np.array((src or sheet).crop(box))
    if keep_largest:
        n, lab, st, _ = cv2.connectedComponentsWithStats((r[..., 3] > 40).astype(np.uint8))
        if n > 1:
            big = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
            r[..., 3] = r[..., 3] * cv2.dilate((lab == big).astype(np.uint8), np.ones((5, 5), np.uint8))
    img = Image.fromarray(r, 'RGBA')
    return img.crop(img.getbbox())

def strip(frames, name, h):
    """tira horizontal de quadros do mesmo tamanho (centralizados, base alinhada) pra animar por background-position"""
    k = h / max(f.height for f in frames)
    fr = [f.resize((round(f.width * k), round(f.height * k)), Image.LANCZOS) for f in frames]
    w = max(f.width for f in fr)
    out = Image.new('RGBA', (w * len(fr), h))
    for i, f in enumerate(fr): out.alpha_composite(f, (i * w + (w - f.width) // 2, h - f.height))
    out.save(D + name + '.webp', quality=90)

def one(box, name, h, **kw):
    if todo(name):
        c = cut(box, **kw); c.resize((round(c.width * h / c.height), h), Image.LANCZOS).save(D + name + '.webp', quality=90)

# ---------- os 5 jegues: corrida, tombo, parado e caras (divisas = colunas mais vazias entre quadros) ----------
JEGUES = [  # faixa y, corrida, tombo, parado, caras
    ((0, 142), [150, 240, 342, 433, 522, 604, 707], (707, 901), [901, 1026, 1122], [1122, 1244, 1336, 1427, 1515]),
    ((138, 270), [153, 251, 367, 470, 595, 704], (704, 917), [917, 1010, 1127], [1127, 1231, 1349, 1444, 1522]),
    ((265, 395), [155, 259, 360, 460, 555, 655], (655, 922), [922, 1013, 1123], [1123, 1245, 1341, 1428, 1520]),
    ((388, 535), [146, 260, 360, 491, 608, 712], (712, 929), [929, 1020, 1124], [1124, 1234, 1338, 1439, 1518]),
    ((528, 668), [150, 268, 387, 505, 630], (630, 905), [905, 1016, 1118], [1118, 1248, 1345, 1444, 1522]),
]
SPR = {}
for i, ((y0, y1), run, fall, stand, faces) in enumerate(JEGUES, 1):
    frames = lambda xs, **kw: [cut((a, y0, b, y1), **kw) for a, b in zip(xs, xs[1:])]
    if todo(f'run{i}'): strip(frames(run), f'run{i}', 240)
    if todo(f'stand{i}'): strip(frames(stand), f'stand{i}', 260)
    if todo(f'fall{i}'): strip([cut((fall[0], y0, fall[1], y1), keep_largest=False)], f'fall{i}', 200)  # a poeira faz parte
    if todo(f'face{i}'): strip(frames(faces[:-1]) + [cut((faces[-2], y0, faces[-1], y1), keep_largest=False)], f'face{i}', 220)  # a tonta tem estrelinhas soltas

# ---------- efeitos, interface, cenário, público e acessórios ----------
PECAS = {  # nome: (caixa na folha, altura de saída, keep_largest)
    'dust1': ((95, 690, 170, 755), 110, True), 'dust2': ((245, 675, 330, 755), 130, True), 'dust3': ((430, 670, 540, 755), 150, True),
    'dust4': ((545, 668, 650, 755), 160, True), 'clods': ((740, 750, 860, 800), 70, False), 'streak': ((520, 755, 735, 800), 60, False),
    'confetti': ((880, 690, 1035, 805), 200, False), 'burst': ((1040, 690, 1135, 800), 180, False), 'stars': ((1138, 695, 1250, 790), 160, False),
    'whirl': ((1250, 700, 1345, 790), 130, False), 'boltY': ((1438, 690, 1530, 745), 90, False), 'boltB': ((1435, 750, 1530, 800), 90, False),
    'b1': ((22, 838, 82, 888), 90, True), 'b2': ((88, 838, 146, 888), 90, True), 'b3': ((152, 838, 210, 888), 90, True),
    'b4': ((215, 838, 274, 888), 90, True), 'b5': ((280, 838, 340, 888), 90, True),
    'largada': ((15, 890, 205, 955), 150, False), 'chegada': ((205, 890, 392, 955), 150, False),
    'trophy': ((25, 955, 95, 1022), 140, True), 'flag': ((100, 955, 172, 1012), 120, True), 'ribbon': ((175, 960, 268, 1012), 80, True),
    'podium': ((266, 962, 370, 1018), 140, True),
    'cactus': ((375, 815, 442, 972), 300, True), 'fence': ((445, 838, 642, 915), 150, True), 'hay': ((436, 918, 510, 968), 90, True),
    'hay2': ((512, 918, 578, 968), 90, True), 'cactus2': ((640, 818, 745, 948), 250, False), 'tower': ((743, 812, 820, 912), 260, True),
    'bunting': ((825, 842, 940, 892), 90, True), 'crates': ((818, 892, 882, 945), 110, True), 'sign': ((576, 932, 632, 1010), 130, True),
    'skull': ((700, 945, 758, 1008), 90, True), 'wagon': ((942, 935, 1105, 1012), 140, True), 'arch': ((932, 812, 1110, 900), 200, False),
    'fence2': ((900, 895, 1012, 938), 80, True), 'grass': ((420, 965, 470, 1010), 60, True), 'rocks': ((468, 965, 562, 1010), 60, False),
    'crowd1': ((1112, 832, 1340, 918), 200, False), 'crowd2': ((1112, 915, 1342, 1012), 220, False),
    'hat': ((1343, 840, 1412, 890), 80, True), 'carrot': ((1462, 838, 1522, 895), 90, True), 'crown': ((1362, 895, 1412, 945), 90, True),
    'medal': ((1415, 893, 1458, 948), 90, True), 'star': ((1420, 950, 1462, 992), 80, True),
}
for name, (box, h, kl) in PECAS.items(): one(box, name, h, keep_largest=kl)

# ---------- faixas de cenário da corrida (repetem sem emenda: nada encosta na borda) ----------
def P(n): return Image.open(D + n + '.webp').convert('RGBA')
def faixa(name, w, h, itens):
    if not todo(name): return
    out = Image.new('RGBA', (w, h))
    for n, x, s in itens:
        im = P(n); im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        out.alpha_composite(im, (x, h - im.height))
    out.save(D + name + '.webp', quality=88)
# fundo: público atrás da cerca, torre e bandeirinhas
faixa('far', 1800, 300, [('tower', 40, 1), ('crowd1', 250, .95), ('crowd2', 480, .85), ('bunting', 700, 1.3), ('crowd1', 830, 1), ('crowd2', 1060, .9),
                        ('tower', 1290, .9), ('crowd2', 1420, .95), ('fence', 0, .7), ('fence', 300, .7), ('fence', 600, .7), ('fence', 900, .7), ('fence', 1200, .7), ('fence', 1500, .7)])
# meio: cactos, feno, placa, caveira, carroça
faixa('mid', 2200, 300, [('cactus', 60, .9), ('hay', 260, 1), ('hay2', 330, 1), ('sign', 520, 1), ('cactus2', 700, 1), ('skull', 980, 1), ('wagon', 1150, 1.1),
                        ('rocks', 1420, 1.2), ('cactus', 1600, .8), ('crates', 1800, 1.1), ('grass', 1960, 1.3), ('rocks', 2060, 1)])
# frente: cerca de madeira e mato
faixa('front', 1400, 170, [('fence', 0, 1.02), ('fence', 350, 1.02), ('fence', 700, 1.02), ('fence', 1050, 1.02), ('grass', 300, 1.5), ('grass', 900, 1.4)])

# ---------- tela de escolha: os jegues parados dos portões saem do fundo no lugar exato (gate1..5) e viram camada animada ----------
PORTOES = [(38, 378, 222, 742), (222, 400, 396, 742), (396, 430, 560, 742), (560, 380, 725, 742), (722, 430, 920, 742)]
if todo('bg'):
    import onnxruntime as ort
    so = ort.SessionOptions  # sem o cache de memória do onnxruntime (estoura a RAM)
    def _so():
        o = so(); o.enable_cpu_mem_arena = False; o.enable_mem_pattern = False; return o
    ort.SessionOptions = _so
    from rembg import remove, new_session
    sess = new_session('birefnet-general-lite')
    im = cv2.cvtColor(np.array(mock), cv2.COLOR_RGB2BGR); mask = np.zeros(im.shape[:2], np.uint8)
    for x0, y0, x1, y1 in PORTOES:
        c = mock.crop((x0, y0, x1, y1)); c2 = c.resize((c.width * 2, c.height * 2), Image.LANCZOS)
        a = np.array(remove(c2, session=sess).resize(c.size, Image.LANCZOS))[..., 3]
        n, lab, st, _ = cv2.connectedComponentsWithStats((a > 30).astype(np.uint8))  # só o jegue (o maior pedaço)
        if n > 1: a = a * (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
        g = np.array(c.convert('RGBA')); g[..., 3] = a
        Image.fromarray(g, 'RGBA').save(D + f'gate{PORTOES.index((x0, y0, x1, y1)) + 1}.webp', quality=90)  # o jegue no lugar exato
        mask[y0:y1, x0:x1] |= cv2.dilate((a > 30).astype(np.uint8) * 255, np.ones((7, 7), np.uint8))
    cv2.imwrite(D + 'bg.webp', cv2.inpaint(im, mask, 11, cv2.INPAINT_TELEA), [cv2.IMWRITE_WEBP_QUALITY, 88])
# cartas "escolha seu jegue": recortes retos (sobem e brilham ao escolher)
for i, x in enumerate([28, 208, 390, 572, 752], 1):
    if todo(f'card{i}'): mock.crop((x, 905, x + 164, 1122)).save(D + f'card{i}.webp', quality=90)
if not os.path.exists('assets/card_grid_jegues.png'):
    mock.crop((0, 0, 941, 752)).resize((400, 320), Image.LANCZOS).save('assets/card_grid_jegues.png', optimize=True)

for n in [f'{k}{i}' for i in range(1, 6) for k in ('run', 'stand', 'fall', 'face')]:
    w, h = Image.open(D + n + '.webp').size
    k = {'run': len(JEGUES[int(n[-1]) - 1][1]) - 1, 'stand': 2, 'fall': 1, 'face': 4}[n[:-1]]
    SPR[n] = [k, w // k, h]
print('SPR', json.dumps(SPR, separators=(',', ':')))
