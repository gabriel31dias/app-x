# Gera a arte da "Roleta do Inferno" a partir de assets/roleta/mockup.png (tela 941x1672 com a mesa desenhada)
# e sheet.png (folha 1536x1024 COM transparência: o recorte é pelo alfa, sem IA).
# Uso: U2NET_HOME=~/.rembg uv run --with rembg --with onnxruntime --with opencv-python-headless --with pillow --with numpy python tools/roleta_assets.py
import os
import numpy as np, cv2
from PIL import Image
D = 'assets/roleta/'
todo = lambda name: not os.path.exists(D + name + '.webp')  # só refaz o que falta; apague o arquivo pra refazer
sheet = np.array(Image.open(D + 'sheet.png').convert('RGBA'))

def piece(box, whole=False, keep=.002):
    """recorte pela transparência da folha; sem whole, só os pedaços grandes da caixa (vizinhos encostados saem)"""
    x0, y0, x1, y1 = box
    p = sheet[y0:y1, x0:x1].copy()
    if not whole:
        n, lab, st, _ = cv2.connectedComponentsWithStats((p[..., 3] > 20).astype(np.uint8))
        if n > 1:
            big = st[1:, cv2.CC_STAT_AREA].max(); h, w = lab.shape
            # pedaço que encosta na borda da caixa é do vizinho (a não ser o maior)
            borda = lambda i: st[i, 0] == 0 or st[i, 1] == 0 or st[i, 0] + st[i, 2] == w or st[i, 1] + st[i, 3] == h
            p[..., 3] *= np.isin(lab, [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] == big or (st[i, cv2.CC_STAT_AREA] > big * keep and not borda(i))])
    img = Image.fromarray(p, 'RGBA')
    return img.crop(img.getbbox())

PIECES = {
    # personagens
    'reaper': (1115, 175, 1355, 445), 'head': (1340, 0, 1520, 212), 'skull': (1350, 205, 1520, 405),
    'penta': (1135, 0, 1300, 205), 'chainL': (1100, 0, 1150, 230), 'chainR': (1285, 0, 1345, 230),
    # bola e efeitos
    'ball': (748, 382, 828, 468), 'comet': (826, 380, 1165, 475), 'disc': (1180, 405, 1370, 530), 'boom': (1375, 400, 1536, 540),
    'slash1': (350, 570, 535, 695), 'slash2': (465, 635, 705, 700), 'smoke': (700, 600, 1000, 800), 'flame': (995, 702, 1095, 795),
    'blood1': (1145, 535, 1380, 700), 'blood2': (1370, 530, 1536, 705), 'blood3': (975, 645, 1150, 705), 'fire': (750, 870, 930, 1024),
    'crystals': (925, 915, 1135, 1024), 'coins': (612, 925, 740, 1022), 'gem': (608, 845, 662, 925),
    # fichas (a de 500 é a vermelha escurecida no CSS)
    'chipRed': (5, 465, 140, 585), 'chipBlack': (143, 472, 265, 585), 'chipBlue': (268, 474, 392, 585), 'chipGreen': (393, 465, 520, 585),
    'chipPurple': (3, 578, 120, 685), 'chipGold': (175, 570, 305, 695),
    # faixa com caveira (letreiro) e velas
    'banner': (5, 655, 705, 800), 'candle': (148, 862, 220, 1015), 'candle2': (220, 865, 310, 1018),
}
WHOLE = set()
for name, box in PIECES.items():
    if todo(name): piece(box, whole=name in WHOLE).save(D + name + '.webp', quality=90)

# ---------- mão da Morte: sai do fundo (LaMa retoca) e vira 5 peças animadas (palma + 4 dedos) ----------
# Precisa de: U2NET_HOME=~/.rembg uv run --with rembg --with onnxruntime ... (e ~/.cache/lama/lama_fp32.onnx, ver lalau_assets.py)
HAND = (150, 300, 390, 490)  # caixa da mão no mockup; as peças saem todas do tamanho da caixa (empilham no mesmo lugar)
DEDOS = {'hand_f1': (0, 80, 78), 'hand_f2': (80, 112, 84), 'hand_f3': (112, 140, 80), 'hand_f4': (150, 240, 58)}  # faixa x e nó (y) na caixa
if todo('hand_palm') or todo('bg'):
    import onnxruntime as ort
    from rembg import remove, new_session
    mock = Image.open(D + 'mockup.png').convert('RGB')
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
    # fundo do jogo = mockup sem a mão (o jogo desenha a roleta girando, os números e o saldo por cima)
    im = np.array(mock); mk = np.zeros(im.shape[:2], np.uint8); mk[y0:y1, x0:x1] = a > 20
    mk = cv2.dilate(mk, np.ones((11, 11), np.uint8))
    lama = ort.InferenceSession(os.path.expanduser('~/.cache/lama/lama_fp32.onnx'))
    wx0, wy0, wx1, wy1 = 14, 140, 526, 652
    win, wm = im[wy0:wy1, wx0:wx1].copy(), mk[wy0:wy1, wx0:wx1]
    out = lama.run(None, {'image': win.transpose(2, 0, 1)[None].astype(np.float32) / 255, 'mask': (wm > 0)[None, None].astype(np.float32)})[0][0].transpose(1, 2, 0)
    k = cv2.GaussianBlur((wm > 0).astype(np.float32), (9, 9), 0)[..., None]
    im[wy0:wy1, wx0:wx1] = (np.clip(out, 0, 255) * k + win * (1 - k)).astype(np.uint8)
    Image.fromarray(im).save(D + 'bg.webp', quality=88)
# card do lobby (400x320): logo + ceifador + roleta
if not os.path.exists('assets/card_grid_roleta_inferno.png'):
    Image.open(D + 'mockup.png').convert('RGB').crop((318, 22, 628, 270)).resize((400, 320), Image.LANCZOS).save('assets/card_grid_roleta_inferno.png')
