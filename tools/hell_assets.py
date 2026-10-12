# Gera a arte do "Hell Slots" a partir de assets/hell/mockup.png (tela 1024x1536 com a interface desenhada)
# e sheet.png (folha 1536x1024 COM transparência: o recorte é pelo alfa, sem IA).
# Uso: uv run --with opencv-python-headless --with pillow --with numpy python tools/hell_assets.py
import os
import numpy as np, cv2
from PIL import Image
D = 'assets/hell/'
todo = lambda name: not os.path.exists(D + name + '.webp')  # só refaz o que falta; apague o arquivo pra refazer
sheet = np.array(Image.open(D + 'sheet.png').convert('RGBA'))
sheet[:255, 418:560, 3] = 0  # a Morte pequena encosta na grande: some daqui (é recortada da cópia abaixo)
mock = Image.open(D + 'mockup.png').convert('RGB')

def piece(box, keep=.002, src=None):
    """recorte pela transparência da folha: fica o pedaço maior e os soltos que não encostam na borda da caixa (vizinhos saem)"""
    x0, y0, x1, y1 = box
    p = (sheet if src is None else src)[y0:y1, x0:x1].copy()
    n, lab, st, _ = cv2.connectedComponentsWithStats((p[..., 3] > 20).astype(np.uint8))
    if n > 1:
        big = st[1:, cv2.CC_STAT_AREA].max(); h, w = lab.shape
        borda = lambda i: st[i, 0] == 0 or st[i, 1] == 0 or st[i, 0] + st[i, 2] == w or st[i, 1] + st[i, 3] == h
        p[..., 3] *= np.isin(lab, [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] == big or (st[i, cv2.CC_STAT_AREA] > big * keep and not borda(i))])
    img = Image.fromarray(p, 'RGBA')
    return img.crop(img.getbbox())

PIECES = {
    # a Morte e o demônio
    'reaper': (5, 0, 560, 428), 'reaper2': (415, 0, 705, 252), 'demonhead': (620, 5, 885, 215),
    # símbolos soltos (saltam do quadro quando ganham)
    'p_wild': (1100, 10, 1300, 225), 'p_scatter': (1095, 215, 1295, 425), 'p_king': (550, 210, 730, 435), 'p_banshee': (720, 140, 925, 405),
    'p_raven': (925, 225, 1095, 455), 'p_candles': (5, 400, 190, 600), 'p_demon': (180, 385, 440, 605), 'p_hand': (490, 380, 645, 600),
    'p_book': (640, 400, 880, 600), 'p_dagger': (860, 405, 1010, 620), 'p_cross': (990, 420, 1150, 650),
    # raios dos rolos (toque da Morte), pedras, moedas e tesouros
    'beamR': (1305, 5, 1378, 250), 'beamF': (1378, 5, 1448, 250), 'beamK': (1448, 5, 1532, 250),
    'gemR': (1305, 255, 1378, 340), 'gemB': (1378, 255, 1450, 340), 'gemG': (1450, 255, 1532, 340), 'gemP': (1322, 335, 1420, 428), 'gemY': (1420, 335, 1515, 428),
    'hourglass': (660, 600, 772, 752), 'coin': (1138, 508, 1258, 622), 'stack': (1255, 515, 1405, 622), 'bag': (1395, 520, 1532, 652),
    'gold': (1040, 625, 1300, 762), 'bars': (1280, 640, 1482, 762), 'coins': (858, 860, 1182, 1024), 'chest': (1295, 860, 1532, 1024),
    # efeitos
    'star': (752, 752, 898, 872), 'smoke': (902, 752, 1038, 872), 'slash': (1038, 778, 1252, 848), 'flare': (1250, 750, 1536, 872),
    'blood': (268, 865, 420, 1022), 'ring': (418, 865, 580, 1022), 'fire': (578, 865, 712, 1022), 'firering': (710, 865, 862, 1022),
    'burst': (1178, 858, 1300, 1022), 'spinbtn': (5, 735, 270, 1022),
}
ORIG = np.array(Image.open(D + 'sheet.png').convert('RGBA'))
for name, box in PIECES.items():
    if todo(name): piece(box, src=ORIG if name == 'reaper2' else None).save(D + name + '.webp', quality=90)
# tiras borradas do rolo girando (6 quadros)
for i, x in enumerate([270, 352, 432, 513, 592, 670]):
    if todo(f'blur{i}'): piece((x, 750, x + 80, 866)).save(D + f'blur{i}.webp', quality=88)

# quadros dos símbolos: recortados direto da grade do mockup (fundo de cada quadro junto)
CX, CY, CW, CH = [78, 255, 431, 607, 784], [606, 794, 972], 166, 172
TILES = {'wild': (0, 0), 'raven': (1, 0), 'book': (2, 0), 'hand': (3, 0), 'dagger': (4, 0), 'candles': (0, 1), 'banshee': (1, 1),
         'king': (2, 1), 'potion': (3, 1), 'cross': (4, 1), 'demon': (0, 2), 'scatter': (3, 2)}
for name, (c, r) in TILES.items():
    if todo('s_' + name): mock.crop((CX[c], CY[r], CX[c] + CW, CY[r] + CH)).save(D + 's_' + name + '.webp', quality=90)

# miolo do botão girar (gira junto com o rolo) e a cara da Morte do fundo (olha pro jogador)
if todo('spinface'):
    c = mock.crop((440, 1265, 600, 1425)).convert('RGBA'); m = Image.new('L', c.size, 0)
    from PIL import ImageDraw; ImageDraw.Draw(m).ellipse((4, 4, 156, 156), fill=255); c.putalpha(m); c.save(D + 'spinface.webp', quality=90)
# card do lobby (400x320): ceifador + logo
if not os.path.exists('assets/card_grid_hell.png'):
    mock.crop((250, 84, 790, 516)).resize((400, 320), Image.LANCZOS).save('assets/card_grid_hell.png')

# ---------- mão da Morte: sai do fundo (LaMa retoca) e vira 5 peças animadas (palma + 4 dedos) ----------
# Precisa de: U2NET_HOME=~/.rembg uv run --with rembg --with onnxruntime ... (e ~/.cache/lama/lama_fp32.onnx, ver lalau_assets.py)
HAND = (195, 140, 460, 305)  # caixa da mão no mockup; todas as peças saem do tamanho da caixa (empilham no mesmo lugar)
# dedos: faixa x na caixa e altura do nó (daí pra baixo é dedo); o pivô de cada um fica no jogo (hell.html)
DEDOS = {'hand_f1': (0, 52, 74), 'hand_f2': (52, 103, 72), 'hand_f3': (103, 152, 50), 'hand_f4': (152, 265, 58)}
if todo('hand_palm') or todo('bg'):
    import onnxruntime as ort
    from rembg import remove, new_session
    x0, y0, x1, y1 = HAND
    c = mock.crop(HAND); c3 = c.resize((c.width * 3, c.height * 3), Image.LANCZOS)
    a = np.array(remove(c3, session=new_session('birefnet-general-lite')).resize(c.size, Image.LANCZOS))[..., 3]
    n, lab, st, _ = cv2.connectedComponentsWithStats((a > 30).astype(np.uint8))
    a = (a * (lab == 1 + st[1:, cv2.CC_STAT_AREA].argmax())).astype(np.uint8)
    rgb = np.array(c); yy, xx = np.mgrid[:a.shape[0], :a.shape[1]]
    dedo = np.zeros_like(a, bool)
    for name, (dx0, dx1, ky) in DEDOS.items():
        sel = (xx >= dx0) & (xx < dx1) & (yy >= ky - 4); dedo |= (xx >= dx0) & (xx < dx1) & (yy >= ky + 8)
        Image.fromarray(np.dstack([rgb, a * sel]), 'RGBA').save(D + name + '.webp', quality=92)
    Image.fromarray(np.dstack([rgb, a * ~dedo]), 'RGBA').save(D + 'hand_palm.webp', quality=92)
    # fundo sem a mão: LaMa numa janela 512 em volta
    im = np.array(mock); mk = np.zeros(im.shape[:2], np.uint8); mk[y0:y1, x0:x1] = a > 20
    mk = cv2.dilate(mk, np.ones((9, 9), np.uint8))
    lama = ort.InferenceSession(os.path.expanduser('~/.cache/lama/lama_fp32.onnx'))
    wx0, wy0, wx1, wy1 = 70, 0, 582, 512
    win, wm = im[wy0:wy1, wx0:wx1].copy(), mk[wy0:wy1, wx0:wx1]
    x = win.transpose(2, 0, 1)[None].astype(np.float32) / 255
    out = lama.run(None, {'image': x, 'mask': (wm > 0)[None, None].astype(np.float32)})[0][0].transpose(1, 2, 0)
    k = cv2.GaussianBlur((wm > 0).astype(np.float32), (7, 7), 0)[..., None]
    im[wy0:wy1, wx0:wx1] = (np.clip(out, 0, 255) * k + win * (1 - k)).astype(np.uint8)
    Image.fromarray(im).save(D + 'bg.webp', quality=88)  # fundo do jogo = mockup sem a mão
