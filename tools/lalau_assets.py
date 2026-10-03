# Gera a arte do "Jogo do Lalau" a partir de assets/lalau/mockup.png (tela 1024x1536) e sheet.png (folha 1536x1024 COM transparência).
# Uso: U2NET_HOME=~/.rembg uv run --with rembg --with onnxruntime --with opencv-python-headless --with pillow --with numpy python tools/lalau_assets.py
# LaMa (retoque do fundo): curl -L -o ~/.cache/lama/lama_fp32.onnx https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx
import os, json
import numpy as np, cv2
from PIL import Image
D = 'assets/lalau/'
todo = lambda name: not os.path.exists(D + name + '.webp')  # só refaz o que falta; apague o arquivo pra refazer
sheet = np.array(Image.open(D + 'sheet.png').convert('RGBA'))
mock = np.array(Image.open(D + 'mockup.png').convert('RGB'))

def piece(box, whole=False, keep=.03):
    """recorte pela transparência da própria folha; sem whole, só o pedaço maior da caixa (vizinhos encostados saem)"""
    x0, y0, x1, y1 = box
    p = sheet[y0:y1, x0:x1].copy()
    if not whole:
        n, lab, st, _ = cv2.connectedComponentsWithStats((p[..., 3] > 20).astype(np.uint8))
        if n > 1:
            big = st[1:, cv2.CC_STAT_AREA].max()
            keep = [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] > big * keep]
            p[..., 3] *= np.isin(lab, keep)
    img = Image.fromarray(p, 'RGBA')
    return img.crop(img.getbbox())

def save(img, name, h=None):
    if h: img = img.resize((round(img.width * h / img.height), h), Image.LANCZOS)
    img.save(D + name + '.webp', quality=90)

# ---------- jacaré: quadros do mesmo tamanho, alinhados pelo pé (centro da metade de baixo) ----------
CHARS = {
    'w': (80, 300, 2, [('walk1', 455, 622), ('walk2', 605, 765), ('beer', 765, 908), ('walk3', 908, 1030),
                       ('kick', 1027, 1180), ('dance', 1180, 1352), ('lounge', 1352, 1536)]),
    'sw': (312, 452, 2, [('1', 10, 192), ('2', 193, 366), ('3', 366, 550), ('4', 551, 772), ('5', 772, 988),
                        ('6', 988, 1182), ('7', 1182, 1370), ('8', 1370, 1530)]),
}
meta = {}
for ch, (y0, y1, k, frames) in CHARS.items():
    if all(not todo(f'{ch}_{n}') for n, _, _ in frames) and os.path.exists(D + 'chars.json'): continue
    cuts = []
    for n, x0, x1 in frames:
        p = sheet[y0:y1, x0:x1].copy()
        a = p[..., 3]
        nn, lab, st, _ = cv2.connectedComponentsWithStats((a > 20).astype(np.uint8))
        if nn > 1 and ch == 'w':  # andando: só o corpo (o vizinho que encosta na caixa sai)
            big = 1 + st[1:, cv2.CC_STAT_AREA].argmax()
            p[..., 3] *= (lab == big)
        if ch == 'sw' and x0 < 550: p[:346 - y0, :, 3] = 0  # ponta do letreiro da folha encosta nos 3 primeiros
        ys, xs = np.nonzero(p[(y1 - y0) // 2:, :, 3] > 128)
        cuts.append((n, p, xs.mean() if len(xs) else (x1 - x0) / 2))
    half = max(max(c, p.shape[1] - c) for _, p, c in cuts)
    W, Hh = int(2 * half) + 4, y1 - y0
    for n, p, c in cuts:
        out = np.zeros((Hh, W, 4), np.uint8)
        dx = int(round(W / 2 - c))
        out[:, dx:dx + p.shape[1]] = p
        Image.fromarray(out, 'RGBA').resize((W * k, Hh * k), Image.LANCZOS).save(D + f'{ch}_{n}.webp', quality=92)
    meta[ch] = [W * k, Hh * k]
if meta:
    old = json.load(open(D + 'chars.json')) if os.path.exists(D + 'chars.json') else {}
    json.dump({**old, **meta}, open(D + 'chars.json', 'w'))

# ---------- símbolos e peças soltas ----------
PECAS = {  # nome: (caixa, altura de saída)
    's_lalau': ((8, 620, 188, 792), 180), 's_lalau2': ((709, 618, 885, 792), 180), 's_fish': ((540, 624, 709, 790), 180),
    's_crown': ((626, 455, 806, 608), 150), 's_hammock': ((970, 459, 1126, 618), 180), 's_cooler': ((803, 446, 969, 628), 160),
    's_beer': ((2, 451, 147, 625), 160), 's_hook': ((491, 455, 618, 608), 150), 's_lily': ((331, 455, 492, 607), 130),
    's_wild': ((1121, 446, 1356, 625), 170), 's_chest': ((1345, 459, 1533, 630), 170),
    'fish': ((143, 455, 340, 620), 160), 'leaf1': ((686, 808, 757, 900), 90),
    'star': ((52, 869, 145, 985), 160), 'spark': ((302, 846, 434, 1000), 160), 'coinburst': ((421, 857, 547, 1000), 160),
    'pile': ((763, 787, 953, 921), 140), 'splash1': ((939, 803, 1064, 916), 140), 'splash2': ((1042, 794, 1187, 916), 140),
    'plank': ((1243, 908, 1521, 1002), 90), 'sign': ((539, 891, 855, 1004), 120), 'bush': ((1101, 894, 1241, 1004), 120),
}
for name, (box, h) in PECAS.items():
    if todo(name): save(piece(box, keep=.3 if name == 'star' else .03), name, h)
# moeda girando: 9 quadros na tira de cima (da frente até de lado)
COINS = [(11, 790, 70, 858), (83, 791, 133, 859), (154, 792, 199, 862), (216, 794, 281, 855), (287, 795, 348, 858),
         (362, 793, 411, 861), (423, 791, 478, 863), (481, 807, 514, 863), (517, 792, 540, 862)]
for i, box in enumerate(COINS):
    if todo(f'coin{i + 1}'): save(piece(box), f'coin{i + 1}', 64)

import onnxruntime as ort
def _so():
    o = ort_so(); o.enable_cpu_mem_arena = False; o.enable_mem_pattern = False; return o
ort_so = ort.SessionOptions; ort.SessionOptions = _so  # sem o cache de memória do onnxruntime (estoura a RAM)
lama = None
def inpaint(im, m, box):
    """retoca m (máscara) dentro da janela box com o LaMa (entrada 512x512)"""
    global lama
    lama = lama or ort.InferenceSession(os.path.expanduser('~/.cache/lama/lama_fp32.onnx'))
    x0, y0, x1, y1 = box
    win, wm = im[y0:y1, x0:x1], m[y0:y1, x0:x1]
    x = cv2.resize(win, (512, 512), interpolation=cv2.INTER_AREA).transpose(2, 0, 1)[None].astype(np.float32) / 255
    mk = (cv2.resize(wm, (512, 512), interpolation=cv2.INTER_NEAREST) > 0)[None, None].astype(np.float32)
    out = lama.run(None, {'image': x, 'mask': mk})[0][0].transpose(1, 2, 0)
    out = cv2.resize(np.clip(out, 0, 255).astype(np.uint8), (x1 - x0, y1 - y0), interpolation=cv2.INTER_CUBIC)
    k = cv2.GaussianBlur((wm > 0).astype(np.float32), (7, 7), 0)[..., None]
    im[y0:y1, x0:x1] = (out * k + win * (1 - k)).astype(np.uint8)

# ---------- letreiro com o Lalau (camada animada) e fundo sem ele ----------
HB = (20, 0, 1004, 580)
hm = None
if todo('hero') or todo('bg'):
    from rembg import remove, new_session
    x0, y0, x1, y1 = HB
    a = np.array(remove(Image.fromarray(mock[y0:y1, x0:x1].copy()), session=new_session('birefnet-general-lite')))[..., 3]
    n, lab, st, _ = cv2.connectedComponentsWithStats((a > 30).astype(np.uint8))
    a = a * (lab == 1 + st[1:, cv2.CC_STAT_AREA].argmax())
    hm = a
    if todo('hero'):
        img = Image.fromarray(np.dstack([mock[y0:y1, x0:x1], a.astype(np.uint8)]), 'RGBA')
        print('hero bbox', img.getbbox())
        img.save(D + 'hero.webp', quality=92)
if todo('bg'):
    im = mock.copy()
    m = np.zeros(im.shape[:2], np.uint8)
    x0, y0, x1, y1 = HB
    m[y0:y1, x0:x1] = (hm > 40).astype(np.uint8)
    m[530:] = 0  # a trave de cima da moldura fica (o letreiro cobre)
    m = cv2.dilate(m, np.ones((17, 17), np.uint8))
    inpaint(im, m, (0, 0, 540, 560))
    inpaint(im, m, (484, 0, 1024, 560))
    # aposta (vira valor ao vivo): placa lisa
    for x0, y0, x1, y1 in ((238, 1270, 362, 1308),):
        p = 12; win = im[y0 - p:y1 + p, x0 - p:x1 + p].astype(np.float32)
        v = np.ones(win.shape[:2], np.float32); v[p - 2:-p + 2, p - 2:-p + 2] = 0
        sg = (y1 - y0) / 4
        fill = cv2.GaussianBlur(win * v[..., None], (0, 0), sg) / np.maximum(cv2.GaussianBlur(v, (0, 0), sg), 1e-3)[..., None]
        k = np.zeros(win.shape[:2], np.float32); k[p - 4:-p + 4, p - 4:-p + 4] = 1
        k = cv2.GaussianBlur(k, (0, 0), 3); k[p:-p, p:-p] = 1
        im[y0 - p:y1 + p, x0 - p:x1 + p] = (fill * k[..., None] + win * (1 - k[..., None])).astype(np.uint8)
    # grade: 5 colunas verde-pântano com luz no meio (os símbolos do desenho saem)
    for c in range(5):
        x0, y0, x1, y1 = 44 + c * 188, 598, 44 + c * 188 + 186, 1140
        h, w = y1 - y0, x1 - x0
        yy, xx = np.mgrid[0:h, 0:w]
        v = 1 - .35 * (((xx - w / 2) / (w / 2)) ** 2) - .45 * (((yy - h / 2) / (h / 2)) ** 2)
        im[y0:y1, x0:x1] = np.clip(np.array([22, 62, 46]) * v[..., None] + np.array([6, 16, 12]), 0, 255).astype(np.uint8)
    for c in range(1, 5):  # divisória fina entre colunas
        x = 44 + c * 188 - 2
        im[598:1140, x - 1:x + 1] = (8, 22, 16)
    Image.fromarray(im).save(D + 'bg.webp', quality=88)
if todo('spinbtn'):
    Image.fromarray(mock[1176:1388, 460:672]).save(D + 'spinbtn.webp', quality=92)
if not os.path.exists('assets/card_grid_lalau.png'):
    Image.fromarray(mock[0:819, 0:1024]).resize((400, 320), Image.LANCZOS).save('assets/card_grid_lalau.png', optimize=True)
print('ok')
