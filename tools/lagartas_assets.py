# Gera a arte da "Corrida das Lagartas" a partir de assets/lagartas/mockup.png (tela 941x1672 desenhada) e sheet.png
# (peças já com fundo transparente: recorte pelo alfa). As lagartas não têm ciclo de andar na folha: o jogo alterna 3
# poses e faz o estica-e-encolhe no CSS. Só as 5 paradas na largada do mockup usam IA pra sair do fundo.
# Uso: uv run --with rembg --with onnxruntime --with opencv-python-headless --with pillow --with numpy python tools/lagartas_assets.py
import os, json
import numpy as np, cv2
from PIL import Image
D = 'assets/lagartas/'
todo = lambda name: not os.path.exists(D + name + '.webp')  # só refaz o que falta; apague o arquivo pra refazer
sheet = Image.open(D + 'sheet.png').convert('RGBA')
mock = Image.open(D + 'mockup.png').convert('RGB')

def cut(box, keep_largest=True, src=None):
    r = np.array((src or sheet).crop(box))
    if keep_largest:
        n, lab, st, _ = cv2.connectedComponentsWithStats((r[..., 3] > 40).astype(np.uint8))
        if n > 1:
            big = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
            r[..., 3] = r[..., 3] * cv2.dilate((lab == big).astype(np.uint8), np.ones((5, 5), np.uint8))
    img = Image.fromarray(r, 'RGBA')
    return img.crop(img.getbbox())

def strip(frames, name, h):
    k = h / max(f.height for f in frames)
    fr = [f.resize((round(f.width * k), round(f.height * k)), Image.LANCZOS) for f in frames]
    w = max(f.width for f in fr)
    out = Image.new('RGBA', (w * len(fr), h))
    for i, f in enumerate(fr): out.alpha_composite(f, (i * w + (w - f.width) // 2, h - f.height))
    out.save(D + name + '.webp', quality=90)

def one(box, name, h, **kw):
    if todo(name):
        c = cut(box, **kw); c.resize((round(c.width * h / c.height), h), Image.LANCZOS).save(D + name + '.webp', quality=90)

# ---------- as 5 lagartas: 3 poses (1ª linha da grade de cada uma) e retrato grande (os de turbo da folha vêm com o rastro
# cortado em retângulo: o jogo faz o turbo com brilho no CSS) ----------
POSES = [  # colunas da 1ª linha de poses (y 188-285)
    [(5, 90), (88, 172), (170, 258)], [(258, 352), (352, 448), (446, 548)], [(545, 640), (638, 732), (728, 822)],
    [(822, 920), (918, 1012), (1008, 1100)], [(1108, 1218), (1218, 1338), (1338, 1442)],
]
RETRATO = [(0, 200), (262, 470), (535, 740), (805, 1000), (1065, 1265)]
for i in range(5):
    if todo(f'crawl{i + 1}'): strip([cut((a, 185, b, 288)) for a, b in POSES[i]], f'crawl{i + 1}', 220)
    one((RETRATO[i][0], 0, RETRATO[i][1], 192), f'big{i + 1}', 260)

# ---------- efeitos, interface e cenário ----------
PECAS = {  # nome: (caixa, altura de saída, keep_largest)
    'dust1': ((15, 460, 160, 540), 110, True), 'dust2': ((170, 460, 300, 540), 110, True), 'dust3': ((420, 460, 540, 540), 120, True),
    'dirt': ((540, 460, 660, 540), 100, False), 'dirt2': ((880, 460, 1005, 540), 100, False), 'streak': ((15, 555, 160, 612), 70, False),
    'leaf1': ((1020, 470, 1062, 515), 60, True), 'leaf2': ((1110, 470, 1160, 515), 60, True), 'leaf3': ((1160, 470, 1205, 515), 60, True),
    'hearts': ((490, 625, 555, 660), 70, False), 'stars': ((745, 618, 875, 668), 100, False), 'swirl': ((672, 625, 712, 668), 70, False),
    'b1': ((938, 748, 1033, 822), 90, True), 'b2': ((1043, 748, 1138, 822), 90, True), 'b3': ((1148, 748, 1243, 822), 90, True),
    'b4': ((1253, 748, 1350, 822), 90, True), 'b5': ((1360, 748, 1458, 822), 90, True),
    'largada': ((60, 740, 405, 955), 260, False), 'chegada': ((465, 740, 760, 905), 230, False),
    'mushroom': ((790, 750, 925, 880), 200, True), 'flag': ((962, 832, 1060, 930), 130, True), 'trophy': ((1235, 828, 1368, 965), 170, True),
    'crown': ((1095, 925, 1212, 1015), 100, True), 'carrot': ((1462, 752, 1530, 905), 150, True), 'bomb': ((1355, 905, 1448, 1015), 110, True),
    'log': ((665, 890, 915, 990), 150, False), 'rock': ((465, 925, 545, 985), 90, True), 'rock2': ((125, 940, 200, 1000), 80, True),
    'bush': ((525, 865, 605, 925), 90, True), 'bush2': ((1380, 835, 1455, 895), 80, True), 'bush3': ((270, 925, 355, 995), 90, True),
    'stump': ((30, 960, 115, 1012), 80, True), 'sign': ((10, 865, 100, 960), 120, True), 'leafbig': ((200, 915, 290, 965), 70, True),
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
faixa('mid', 2000, 320, [('mushroom', 40, 1.5), ('bush', 330, 1.6), ('log', 520, 1.3), ('rock', 880, 1.4), ('mushroom', 1060, 1.1), ('bush3', 1300, 1.6),
                        ('sign', 1500, 1.3), ('bush2', 1700, 1.7), ('rock2', 1860, 1.3)])
faixa('front', 1600, 170, [('bush', 20, 1.8), ('leafbig', 240, 2.2), ('bush3', 420, 1.8), ('rock2', 650, 1.6), ('bush2', 820, 2), ('leafbig', 1050, 2.3), ('bush', 1250, 1.9), ('stump', 1470, 1.6)])

# ---------- tela de escolha: as 5 lagartas na largada saem do fundo no lugar exato e viram camada animada ----------
LARGADA = [(0, 722, 210, 950), (198, 740, 385, 950), (384, 745, 560, 950), (558, 735, 740, 952), (728, 735, 918, 950)]
CARTAS = [(22, 192), (205, 372), (387, 555), (568, 735), (748, 918)]
VALORES = [(246, 1382, 432, 1434)] + [(x0 + 14, 1298, x1 - 14, 1340) for x0, x1 in CARTAS]  # aposta e odds desenhadas
_sess = None
def rembg(img):
    global _sess
    from rembg import remove, new_session
    if _sess is None:
        import onnxruntime as ort
        so = ort.SessionOptions  # sem o cache de memória do onnxruntime (estoura a RAM)
        def _so():
            o = so(); o.enable_cpu_mem_arena = False; o.enable_mem_pattern = False; return o
        ort.SessionOptions = _so
        _sess = new_session('birefnet-general-lite')
    return remove(img, session=_sess)
if todo('bg'):
    im = cv2.cvtColor(np.array(mock), cv2.COLOR_RGB2BGR); mask = np.zeros(im.shape[:2], np.uint8)
    for k, (x0, y0, x1, y1) in enumerate(LARGADA, 1):
        c = mock.crop((x0, y0, x1, y1)); c2 = c.resize((c.width * 2, c.height * 2), Image.LANCZOS)
        a = np.array(rembg(c2).resize(c.size, Image.LANCZOS))[..., 3]
        n, lab, st, _ = cv2.connectedComponentsWithStats((a > 30).astype(np.uint8))
        if n > 1: a = a * (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
        g = np.array(c.convert('RGBA')); g[..., 3] = a
        Image.fromarray(g, 'RGBA').save(D + f'start{k}.webp', quality=90)
        mask[y0:y1, x0:x1] |= cv2.dilate((a > 30).astype(np.uint8) * 255, np.ones((7, 7), np.uint8))
    im = cv2.inpaint(im, mask, 11, cv2.INPAINT_TELEA)
    for x0, y0, x1, y1 in VALORES:  # apaga os números desenhados com a cor escura da placa
        sub = im[y0:y1, x0:x1]; cor = np.median(sub.reshape(-1, 3)[sub.reshape(-1, 3).sum(1) < 200], 0)
        im[y0 + 3:y1 - 3, x0 + 4:x1 - 4] = cor
    cv2.imwrite(D + 'bg.webp', im, [cv2.IMWRITE_WEBP_QUALITY, 88])
if todo('bugs'):  # torcida de insetos das laterais do mockup, lado a lado, pro fundo da corrida
    l, r = mock.crop((0, 335, 245, 560)), mock.crop((700, 330, 941, 555))
    t = Image.new('RGB', (l.width + r.width, 225)); t.paste(l, (0, 0)); t.paste(r.resize((r.width, 225)), (l.width, 0)); t.save(D + 'bugs.webp', quality=86)
if todo('apostar'): mock.crop((270, 1468, 662, 1598)).save(D + 'apostar.webp', quality=90)
if not os.path.exists('assets/card_grid_lagartas.png'):
    mock.crop((0, 30, 941, 782)).resize((400, 320), Image.LANCZOS).save('assets/card_grid_lagartas.png', optimize=True)

SPR = {}
for i in range(1, 6):
    w, h = Image.open(D + f'crawl{i}.webp').size; SPR[f'crawl{i}'] = [3, w // 3, h]
    for k in ('big',): w, h = Image.open(D + f'{k}{i}.webp').size; SPR[f'{k}{i}'] = [1, w, h]
print('SPR', json.dumps(SPR, separators=(',', ':')))
