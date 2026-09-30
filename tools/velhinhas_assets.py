# Gera a arte da "Corrida das Velhinhas" a partir de assets/velhinhas/mockup.png (tela 941x1672 desenhada) e sheet.png
# (peças já com fundo transparente: recorte pelo alfa). Só as 5 velhinhas da largada do mockup usam IA pra sair do fundo.
# Uso: uv run --with rembg --with onnxruntime --with opencv-python-headless --with pillow --with numpy python tools/velhinhas_assets.py
import os, json
import numpy as np, cv2
from PIL import Image
D = 'assets/velhinhas/'
todo = lambda name: not os.path.exists(D + name + '.webp')  # só refaz o que falta; apague o arquivo pra refazer
sheet = Image.open(D + 'sheet.png').convert('RGBA')
mock = Image.open(D + 'mockup.png').convert('RGB')

def cut(box, keep_largest=True):
    r = np.array(sheet.crop(box))
    if keep_largest:
        n, lab, st, _ = cv2.connectedComponentsWithStats((r[..., 3] > 40).astype(np.uint8))
        if n > 1:
            big = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
            r[..., 3] = r[..., 3] * cv2.dilate((lab == big).astype(np.uint8), np.ones((5, 5), np.uint8))
    img = Image.fromarray(r, 'RGBA')
    return img.crop(img.getbbox())

def frames_row(y0, y1, xs, top=.3, pad=80):
    """quadros de uma fileira sem corte reto (as velhinhas encostam umas nas outras na folha). Cada quadro olha uma
    janela um pouco maior que a sua divisa; as CABEÇAS (faixa de cima, onde elas não se tocam; frigideira preta não
    conta) viram sementes que crescem juntas só por dentro do que é opaco. O quadro fica com o que a cabeça dele
    alcançou primeiro, então a divisa segue o contorno das velhinhas e não uma linha reta."""
    r = np.array(sheet.crop((0, y0, 1130, y1)))
    a = r[..., 3]; hy = int(a.shape[0] * top)
    k, lab, st, cen = cv2.connectedComponentsWithStats((a[:hy] > 200).astype(np.uint8))
    heads = [j for j in range(1, k) if st[j, cv2.CC_STAT_AREA] > 250 and r[:hy][lab == j][:, :3].mean() > 70]
    cruz = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], np.uint8)
    own = np.zeros(a.shape, np.int32)  # a fileira inteira: todas as cabeças crescem juntas
    for q, j in enumerate(heads, 1): own[:hy][lab == j] = q
    opaco = a > 20
    while True:  # crescimento em ondas: todas as cabeças avançam 1 pixel por vez
        livre = opaco & (own == 0); novo = own.copy()
        for q in range(1, len(heads) + 1): novo[livre & (cv2.dilate((own == q).astype(np.uint8), cruz) > 0) & (novo == 0)] = q
        if (novo == own).all(): break
        own = novo
    out = []
    for x0, x1 in zip(xs, xs[1:]):
        w0, w1 = max(0, x0 - pad), min(1130, x1 + pad)  # a janela só corta rastro de poeira comprido
        mine = 1 + heads.index(max([j for j in heads if x0 <= cen[j][0] < x1], key=lambda j: st[j, cv2.CC_STAT_AREA]))
        m = r[:, w0:w1].copy(); m[..., 3] = m[..., 3] * (own[:, w0:w1] == mine)
        img = Image.fromarray(m, 'RGBA'); out.append(img.crop(img.getbbox()))
    return out

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

# ---------- as 5 velhinhas: corrida (divisas = colunas mais vazias), tropeço + chão, comemoração, carinha ----------
VELHAS = [  # faixa y, corrida, tropeço, chão, comemoração, carinha (1ª da grade de caras)
    ((0, 160), [0, 133, 246, 338, 433, 532, 625, 731], (731, 832), (954, 1060), (1058, 1170), (1168, 5, 1242, 85)),
    ((160, 300), [0, 128, 241, 339, 449, 556, 658, 802], (802, 932), (932, 1039), (1039, 1135), (1138, 176, 1208, 248)),
    ((300, 445), [0, 145, 259, 374, 487, 590, 704, 822], (822, 942), (942, 1047), (1040, 1135), (1134, 324, 1212, 396)),
    ((445, 570), [0, 138, 238, 325, 444, 540, 642, 739], (834, 948), (948, 1032), (1032, 1124), (1128, 405, 1200, 482)),
    ((570, 712), [0, 107, 226, 309, 425, 513, 646], (765, 914), (914, 1037), (1037, 1153), (1148, 490, 1218, 566)),
]
for i, ((y0, y1), run, trip, chao, festa, cara) in enumerate(VELHAS, 1):
    if todo(f'run{i}'): strip(frames_row(y0, y1, run), f'run{i}', 240)
    if todo(f'fall{i}'): strip([cut((trip[0], y0, trip[1], y1), keep_largest=False), cut((chao[0], y0, chao[1], y1), keep_largest=False)], f'fall{i}', 220)
    one((festa[0], y0, festa[1], y1), f'cheer{i}', 260, keep_largest=False)
    one(cara, f'face{i}', 200)
    one((10 + i * 0 + [0, 108, 215, 327, 437][i - 1], 905, [110, 218, 330, 440, 553][i - 1], 1015), f'ico{i}', 160)  # quadradinho da interface

# ---------- efeitos, interface e cenário ----------
PECAS = {  # nome: (caixa, altura de saída, keep_largest)
    'dust1': ((20, 725, 120, 772), 100, False), 'dust2': ((125, 725, 230, 772), 100, False), 'dust3': ((20, 775, 130, 822), 100, False),
    'dirt': ((265, 725, 395, 772), 80, False), 'dirt2': ((395, 725, 520, 772), 80, False),
    'hearts': ((598, 718, 732, 752), 60, False), 'zzz': ((738, 715, 812, 750), 60, False), 'streakB': ((818, 715, 888, 752), 60, False),
    'sparks': ((598, 758, 652, 818), 100, False), 'stars': ((652, 758, 722, 818), 100, False), 'swirl': ((728, 758, 792, 812), 90, False),
    'streakR': ((795, 758, 885, 818), 80, False),
    'crowd': ((12, 818, 548, 902), 200, False), 'hay': ((553, 828, 683, 905), 120, True), 'fence': ((692, 832, 862, 912), 140, False),
    'lights': ((898, 715, 1182, 852), 180, False), 'banner': ((1180, 660, 1515, 812), 260, False), 'arrow': ((1298, 828, 1418, 885), 80, True),
    'flag2': ((1438, 812, 1530, 886), 110, True), 'plank': ((862, 850, 968, 912), 80, True),
    'trophy': ((562, 912, 672, 1015), 170, True), 'crown': ((682, 918, 782, 1012), 100, True), 'coin': ((802, 925, 878, 1003), 90, True),
    'medal': ((892, 925, 968, 1003), 90, True), 'horn': ((972, 925, 1078, 1012), 110, True), 'pan': ((1078, 915, 1162, 1012), 110, True),
    'walker': ((1160, 912, 1262, 1018), 120, True), 'flag': ((1266, 915, 1338, 1018), 120, True), 'ribbon': ((1332, 882, 1528, 968), 90, True),
}
for name, (box, h, kl) in PECAS.items(): one(box, name, h, keep_largest=kl)

# ---------- faixas de cenário da corrida (repetem sem emenda) ----------
def P(n): return Image.open(D + n + '.webp').convert('RGBA')
def faixa(name, w, h, itens):
    if not todo(name): return
    out = Image.new('RGBA', (w, h))
    for n, x, s in itens:
        im = P(n); im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        out.alpha_composite(im, (x, h - im.height))
    out.save(D + name + '.webp', quality=88)
faixa('far', 2400, 220, [('crowd', 0, 1), ('crowd', 1270, 1)])  # a arquibancada de velhinhos, duas vezes
faixa('mid', 2000, 170, [('hay', 60, 1.1), ('arrow', 360, 1.3), ('plank', 620, 1.3), ('hay', 900, 1.2), ('walker', 1180, .9), ('flag2', 1420, 1.2), ('hay', 1700, 1)])
faixa('front', 1400, 150, [('fence', 0, 1.05), ('fence', 350, 1.05), ('fence', 700, 1.05), ('fence', 1050, 1.05)])

# ---------- tela de escolha: as 5 velhinhas da largada saem do fundo no lugar exato e viram camada animada ----------
LARGADA = [(14, 622, 208, 968), (200, 638, 388, 962), (374, 638, 558, 998), (556, 622, 718, 968), (702, 632, 941, 978)]
CARTAS = [(22, 192), (205, 372), (386, 555), (567, 735), (748, 918)]
VALORES = [(250, 1398, 434, 1448)] + [(x0 + 14, 1308, x1 - 14, 1350) for x0, x1 in CARTAS]  # aposta e odds desenhadas
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
        if n > 1:  # a velhinha e o que ela segura (frigideira, andador): pedaços com pelo menos 4% do maior
            big = st[1:, cv2.CC_STAT_AREA].max(); a = a * np.isin(lab, [k for k in range(1, n) if st[k, cv2.CC_STAT_AREA] >= .04 * big]).astype(np.uint8)
        g = np.array(c.convert('RGBA')); g[..., 3] = a
        Image.fromarray(g, 'RGBA').save(D + f'start{k}.webp', quality=90)
        mask[y0:y1, x0:x1] |= cv2.dilate((a > 30).astype(np.uint8) * 255, np.ones((7, 7), np.uint8))
    im = cv2.inpaint(im, mask, 11, cv2.INPAINT_TELEA)
    for x0, y0, x1, y1 in VALORES:  # apaga os números desenhados com a cor escura da placa
        sub = im[y0:y1, x0:x1]; cor = np.median(sub.reshape(-1, 3)[sub.reshape(-1, 3).sum(1) < 200], 0)
        im[y0 + 3:y1 - 3, x0 + 4:x1 - 4] = cor
    cv2.imwrite(D + 'bg.webp', im, [cv2.IMWRITE_WEBP_QUALITY, 88])
if todo('apostar'): mock.crop((272, 1484, 666, 1614)).save(D + 'apostar.webp', quality=90)
if not os.path.exists('assets/card_grid_velhinhas.png'):
    mock.crop((0, 40, 941, 792)).resize((400, 320), Image.LANCZOS).save('assets/card_grid_velhinhas.png', optimize=True)

SPR = {}
for i in range(1, 6):
    for k, n in (('run', len(VELHAS[i - 1][1]) - 1), ('fall', 2), ('cheer', 1), ('face', 1)):
        w, h = Image.open(D + f'{k}{i}.webp').size; SPR[f'{k}{i}'] = [n, w // n, h]
print('SPR', json.dumps(SPR, separators=(',', ':')))
