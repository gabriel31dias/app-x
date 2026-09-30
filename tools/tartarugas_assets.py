# Gera a arte da "Corrida das Toruguitas" a partir de assets/tartarugas/mockup.png (tela 941x1672 desenhada) e
# sheet.png (peças sobre fundo cinza-escuro liso, SEM transparência). O recorte da folha é por cor: fundo = parecido
# com a cor da borda E ligado à borda (o contorno preto das tartarugas segura o preenchimento). A IA de recorte não
# serve aqui: come as tartarugas escuras (Relâmpuga e Cascudinha). Só as 5 paradas na largada do mockup usam IA.
# Uso: uv run --with rembg --with onnxruntime --with opencv-python-headless --with pillow --with numpy python tools/tartarugas_assets.py
import os, json
import numpy as np, cv2
from PIL import Image, ImageFilter
D = 'assets/tartarugas/'
todo = lambda name: not os.path.exists(D + name + '.webp')  # só refaz o que falta; apague o arquivo pra refazer
SH = np.array(Image.open(D + 'sheet.png').convert('RGB')).astype(np.int16)
mock = Image.open(D + 'mockup.png').convert('RGB')

_sess = None
def rembg(img):
    """recorte por IA (só pro que está sobre fundo colorido do mockup); carrega o modelo uma vez"""
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

def key(box, tol=16, keep_largest=True, cut_bottom=0):
    """recorte por cor do fundo (ver topo do arquivo); cut_bottom apaga a linha de chão da folha"""
    x0, y0, x1, y1 = box; c = SH[y0:y1, x0:x1]
    bg = np.median(np.concatenate([c[0], c[-1], c[:, 0], c[:, -1]]), 0)
    near = (np.abs(c - bg).max(-1) < tol).astype(np.uint8)
    n, lab = cv2.connectedComponents(near)
    borda = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    a = (~np.isin(lab, list(borda))).astype(np.uint8) * 255
    if cut_bottom:  # linha de chão da folha: corta o fim e apaga o que for escuro/marrom logo acima (a sombra do chão)
        a[-cut_bottom:] = 0
        base = c[-cut_bottom - 10:-cut_bottom]; a[-cut_bottom - 10:-cut_bottom][base.sum(-1) < 170] = 0
    a = cv2.morphologyEx(a, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    if keep_largest:
        n, lab, st, _ = cv2.connectedComponentsWithStats((a > 0).astype(np.uint8))
        if n > 1: a = a * cv2.dilate((lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8), np.ones((3, 3), np.uint8))
    a = cv2.GaussianBlur(a, (3, 3), 0)
    img = Image.fromarray(np.dstack([c.astype(np.uint8), a]), 'RGBA')
    return img.crop(img.getbbox())

def up(img, h):
    """amplia (a folha é pequena) e dá uma nitidez leve pra não ficar borrado"""
    img = img.resize((round(img.width * h / img.height), h), Image.LANCZOS)
    return img.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))

def strip(frames, name, h):
    """tira horizontal de quadros do mesmo tamanho (centralizados, base alinhada) pra animar por background-position"""
    k = h / max(f.height for f in frames)
    fr = [up(f, round(f.height * k)) for f in frames]
    w = max(f.width for f in fr)
    out = Image.new('RGBA', (w * len(fr), h))
    for i, f in enumerate(fr): out.alpha_composite(f, (i * w + (w - f.width) // 2, h - f.height))
    out.save(D + name + '.webp', quality=90)

# ---------- as 5 tartarugas andando: 8 quadros por fileira (faixa y, colunas de cada quadro) ----------
ANDAR = [
    ((276, 332), [(85, 148), (165, 235), (255, 320), (335, 404), (421, 486), (505, 572), (590, 658), (677, 747)]),
    ((334, 390), [(83, 147), (168, 230), (253, 317), (341, 402), (426, 488), (508, 574), (590, 658), (679, 750)]),
    ((392, 450), [(87, 152), (161, 240), (251, 327), (338, 414), (425, 498), (507, 580), (591, 663), (673, 746)]),
    ((452, 508), [(77, 146), (157, 230), (240, 315), (325, 398), (411, 485), (499, 571), (584, 659), (674, 747)]),
    ((510, 568), [(79, 146), (161, 231), (248, 318), (336, 403), (420, 487), (503, 572), (581, 654), (676, 745)]),
]
for i, ((y0, y1), cols) in enumerate(ANDAR, 1):
    if todo(f'walk{i}'): strip([key((a - 4, y0, b + 4, y1), cut_bottom=7) for a, b in cols], f'walk{i}', 220)

# ---------- caras (grade do canto direito): 5 por tartaruga ----------
CARAS_Y = [(8, 68), (68, 128), (126, 188), (186, 248), (246, 308)]
for i, (y0, y1) in enumerate(CARAS_Y, 1):
    if not todo(f'face{i}'): continue
    row = key((1180, y0, 1535, y1), keep_largest=False)
    a = np.array(row)[..., 3] > 40; col = a.sum(0); segs = []; inn = False
    for x, v in enumerate(col):
        if v > 2 and not inn: s = x; inn = True
        if v <= 2 and inn: segs.append((s, x)); inn = False
    if inn: segs.append((s, len(col)))
    segs = sorted(sorted(segs, key=lambda g: g[1] - g[0])[-5:])  # as 5 cabeças (maiores pedaços)
    strip([row.crop((a0, 0, a1, row.height)).crop(row.crop((a0, 0, a1, row.height)).getbbox()) for a0, a1 in segs], f'face{i}', 200)

# ---------- efeitos e extras ----------
PECAS = {  # nome: (caixa, altura de saída, keep_largest)
    'dust1': ((205, 616, 280, 668), 110, True), 'dust2': ((330, 590, 410, 668), 130, True), 'dust3': ((505, 585, 595, 668), 150, True),
    'clods': ((380, 668, 470, 700), 60, False), 'speed': ((605, 598, 835, 645), 70, False),
    'stars': ((853, 616, 920, 685), 120, False), 'whirl': ((920, 616, 1002, 698), 130, False), 'leaves': ((1005, 616, 1088, 698), 120, False),
    'confetti': ((1092, 590, 1248, 700), 190, False), 'trophy': ((1250, 595, 1336, 698), 170, True),
    'flag': ((852, 925, 918, 1002), 120, True), 'crown': ((918, 930, 992, 990), 100, True), 'carrot': ((1030, 910, 1118, 1012), 130, False),
    'watch': ((1138, 920, 1210, 1005), 120, True), 'ribbon': ((1205, 925, 1332, 985), 90, True), 'iniciar': ((542, 903, 785, 1012), 170, True),
}
# brilhos e poeira: sem recorte (o halo escuro ficaria); vão crus com o cinza do fundo zerado e o jogo usa
# mix-blend-mode:screen (o preto some)
BRILHO = {'dust1', 'dust2', 'dust3', 'speed', 'stars', 'whirl', 'confetti'}
for name, (box, h, kl) in PECAS.items():
    if not todo(name): continue
    if name in BRILHO:
        x0, y0, x1, y1 = box; c = np.clip((SH[y0:y1, x0:x1].astype(np.float32) - 30) * 255 / 225, 0, 255).astype(np.uint8)
        up(Image.fromarray(c).convert('RGBA'), h).convert('RGB').save(D + name + '.webp', quality=90)
    else: up(key(box, keep_largest=kl), h).save(D + name + '.webp', quality=90)

# ---------- cenário da corrida: o panorama da folha (LARGADA ... CHEGADA), público e a cerca da frente do mockup ----------
if todo('pano'): up(Image.fromarray(SH[738:890, 2:1072].astype(np.uint8)).convert('RGBA'), 460).convert('RGB').save(D + 'pano.webp', quality=86)
if todo('crowd'): up(Image.fromarray(SH[740:890, 1092:1338].astype(np.uint8)).convert('RGBA'), 300).convert('RGB').save(D + 'crowd.webp', quality=86)
if todo('fence'):  # cerca da frente: a IA não separa a do mockup; usa a da Corrida dos Jegues (mesmo estilo)
    Image.open('assets/jegues/front.webp').save(D + 'fence.webp', quality=88)

# ---------- tela de escolha: as 5 tartarugas paradas na largada saem do fundo no lugar exato e viram camada animada ----------
LARGADA = [(28, 690, 192, 860), (200, 690, 362, 860), (378, 695, 560, 860), (568, 695, 728, 860), (736, 690, 912, 860)]
VALORES = [(250, 1398, 434, 1450)] + [(x0 + 14, 1306, x1 - 14, 1350) for x0, x1 in [(22, 192), (205, 372), (385, 555), (567, 735), (748, 918)]]  # aposta e odds desenhadas
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
# botão APOSTAR do mockup: recorte reto (anima ao tocar). As cartas o jogo tira do próprio bg.webp (sem os números).
if todo('apostar'): mock.crop((268, 1482, 668, 1618)).save(D + 'apostar.webp', quality=90)
if not os.path.exists('assets/card_grid_tartarugas.png'):
    mock.crop((0, 20, 941, 772)).resize((400, 320), Image.LANCZOS).save('assets/card_grid_tartarugas.png', optimize=True)

SPR = {}
for n in [f'{k}{i}' for i in range(1, 6) for k in ('walk', 'face')]:
    w, h = Image.open(D + n + '.webp').size; k = 8 if n.startswith('walk') else 5
    SPR[n] = [k, w // k, h]
print('SPR', json.dumps(SPR, separators=(',', ':')))
