# Gera a arte do "Hipopota do Job" a partir de assets/hipopota/mockup.png (tela 940x1672) e sheet.png (folha 1536x1024 sobre preto).
# Uso: U2NET_HOME=~/.rembg uv run --with rembg --with onnxruntime --with opencv-python-headless --with pillow --with numpy python tools/hipopota_assets.py
# LaMa (retoque do fundo): curl -L -o ~/.cache/lama/lama_fp32.onnx https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx
import os, json
import numpy as np, cv2
from PIL import Image
D = 'assets/hipopota/'
todo = lambda name: not os.path.exists(D + name + '.webp')  # só refaz o que falta; apague o arquivo pra refazer
sheet = np.array(Image.open(D + 'sheet.png').convert('RGB'))
mock = np.array(Image.open(D + 'mockup.png').convert('RGB'))
_ses = None
def ses():
    global _ses
    if not _ses:
        from rembg import new_session
        _ses = new_session('birefnet-general-lite')
    return _ses

def alpha(rgb):
    """recorte pelo rembg; só o pedaço maior (e os grandes) ficam"""
    from rembg import remove
    a = np.array(remove(Image.fromarray(rgb), session=ses()))[..., 3]
    n, lab, st, _ = cv2.connectedComponentsWithStats((a > 30).astype(np.uint8))
    if n > 1:
        big = st[1:, cv2.CC_STAT_AREA].max()
        a = a * np.isin(lab, [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] > big * .04]).astype(np.uint8)
    return a

def cut(box, src=sheet):
    x0, y0, x1, y1 = box
    rgb = src[y0:y1, x0:x1].copy()
    img = Image.fromarray(np.dstack([rgb, alpha(rgb)]), 'RGBA')
    return img.crop(img.getbbox())

def glow(box):
    """brilho/fogo sobre preto: fica RGB e o CSS soma com mix-blend-mode:screen (preto = nada)"""
    x0, y0, x1, y1 = box
    rgb = sheet[y0:y1, x0:x1]
    m = (rgb.max(2) > 30).astype(np.uint8) * 255
    return Image.fromarray(rgb).crop(Image.fromarray(m).getbbox())

def save(img, name, h=None):
    if h: img = img.resize((round(img.width * h / img.height), h), Image.LANCZOS)
    img.save(D + name + '.webp', quality=90)
    return img.size

# ---------- personagens: quadros do mesmo tamanho, alinhados pelo corpo (centro da metade de baixo) ----------
# a folha é pequena (~170 px de altura): sai 2x pra aparecer do tamanho do mockup sem borrão grosso
CHARS = {
    'f': ((0, 178), 2.2, [('idle1', 372, 580), ('idle2', 580, 772), ('wink', 772, 937), ('laugh', 937, 1112), ('toast', 1112, 1335), ('dance', 1335, 1536)]),
    'm': ((195, 342), 2.6, [('idle1', 0, 182), ('idle2', 182, 335), ('laugh', 335, 500), ('wink', 500, 668), ('hold', 668, 812),
                            ('throw1', 812, 975), ('throw2', 975, 1180), ('throw3', 1180, 1362), ('throw4', 1362, 1536)]),
}
meta = {}
for ch, ((y0, y1), k, frames) in CHARS.items():
    if all(not todo(f'{ch}_{n}') for n, _, _ in frames) and os.path.exists(D + 'chars.json'): continue
    cuts = []
    for n, x0, x1 in frames:
        rgb = sheet[y0:y1, x0:x1].copy()
        a = alpha(rgb)
        ys, xs = np.nonzero(a[(y1 - y0) // 2:] > 128)
        cuts.append((n, rgb, a, xs.mean() if len(xs) else (x1 - x0) / 2))
    # largura comum: o maior lado de cada quadro a partir do centro
    half = max(max(c, a.shape[1] - c) for _, _, a, c in cuts)
    W, Hh = int(2 * half) + 4, y1 - y0
    for n, rgb, a, c in cuts:
        out = np.zeros((Hh, W, 4), np.uint8)
        dx = int(round(W / 2 - c))
        out[:, dx:dx + rgb.shape[1], :3] = rgb; out[:, dx:dx + rgb.shape[1], 3] = a
        im = Image.fromarray(out, 'RGBA').resize((round(W * k), round(Hh * k)), Image.LANCZOS)
        im.save(D + f'{ch}_{n}.webp', quality=92)
    meta[ch] = [round(W * k), round(Hh * k)]
if meta:
    old = json.load(open(D + 'chars.json')) if os.path.exists(D + 'chars.json') else {}
    json.dump({**old, **meta}, open(D + 'chars.json', 'w'))

# ---------- peças soltas da folha ----------
PECAS = {  # nome: (caixa, altura de saída)
    'logo': ((5, 0, 372, 196), 300),
    'scat1': ((1218, 656, 1323, 778), 150), 'scat2': ((1323, 656, 1424, 778), 150), 'scat3': ((1424, 656, 1530, 778), 150),
    'wild1': ((572, 505, 691, 626), 150), 'wild2': ((691, 505, 810, 626), 150), 'wild3': ((810, 505, 930, 626), 150),
    'kiss1': ((935, 510, 1040, 615), 110), 'kiss2': ((1040, 510, 1140, 615), 110), 'kiss3': ((1140, 510, 1246, 615), 110),
    'drink1': ((1250, 505, 1332, 626), 130), 'drink2': ((1332, 505, 1414, 626), 130), 'drink3': ((1414, 505, 1520, 626), 130),
    'bigwin': ((5, 650, 186, 782), 260), 'megawin': ((700, 658, 862, 782), 260),
    'cash1': ((790, 385, 882, 480), 110), 'cash2': ((882, 385, 975, 480), 110),
    'champ1': ((484, 360, 584, 480), 130), 'champ3': ((688, 360, 790, 480), 130),
    'shoe1': ((18, 360, 142, 480), 130), 'car1': ((1188, 385, 1318, 478), 110),
    'palm1': ((1150, 905, 1292, 1022), 200), 'palm2': ((1292, 905, 1422, 1022), 200), 'palm3': ((1422, 905, 1536, 1022), 200),
    'cork': ((1020, 795, 1095, 890), 120), 'flute': ((1095, 795, 1172, 890), 120),
}
for name, (box, h) in PECAS.items():
    if todo(name): save(cut(box), name, h)

# tiras com várias peças pequenas: cada pedaço solto vira um sprite (moeda1..n, nota1..n, coracao1..n)
def split(box, pre, h, minarea=250, glowy=False, maxn=8):
    x0, y0, x1, y1 = box
    rgb = sheet[y0:y1, x0:x1]
    a = (rgb.max(2) > 40).astype(np.uint8) if glowy else (alpha(rgb.copy()) > 100).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(cv2.dilate(a, np.ones((5, 5), np.uint8)))
    idx = sorted(range(1, n), key=lambda i: -st[i, cv2.CC_STAT_AREA])[:maxn]
    for j, i in enumerate(sorted(idx, key=lambda i: st[i, cv2.CC_STAT_LEFT])):
        if st[i, cv2.CC_STAT_AREA] < minarea: continue
        x, y, w, hh = st[i, :4]
        if glowy: img = Image.fromarray(rgb[y:y + hh, x:x + w])
        else:
            m = (lab[y:y + hh, x:x + w] == i) & (a[y:y + hh, x:x + w] > 0)
            img = Image.fromarray(np.dstack([rgb[y:y + hh, x:x + w], (m * 255).astype(np.uint8)]), 'RGBA')
        save(img, f'{pre}{j + 1}', h)
if todo('coin1'): split((0, 805, 315, 880), 'coin', 64)
if todo('note1'): split((318, 795, 552, 885), 'note', 70)
if todo('heart1'): split((1345, 800, 1536, 892), 'heart', 60)
GLOWS = {'star1': (725, 805, 790, 872), 'star2': (836, 800, 912, 878), 'star3': (925, 798, 1012, 880),
         'firework1': (1178, 795, 1262, 880), 'firework2': (1262, 795, 1345, 880)}
for name, box in GLOWS.items():
    if todo(name): save(glow(box), name, 160)

# ---------- símbolos: a própria célula do mockup (fundo da casa incluso) ----------
CX, CY, CW, CH = [92, 284, 475, 666], [552, 716, 880, 1044, 1208], 184, 160
CELLS = {'hipf': (0, 0), 'a': (1, 0), 'cash': (2, 0), 'hipm': (3, 0), 'k': (0, 1), 'champ': (1, 1), 'shoe': (2, 1),
         'car': (3, 1), 'q': (2, 2), 'wild': (3, 2), 'j': (2, 3)}
for name, (c, r) in CELLS.items():
    if todo('s_' + name): Image.fromarray(mock[CY[r]:CY[r] + CH, CX[c]:CX[c] + CW]).save(D + f's_{name}.webp', quality=92)

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

# casa vazia (fundo do scatter): a casa do K sem a letra
if todo('cell'):
    c = mock[CY[1]:CY[1] + CH, CX[0]:CX[0] + CW].copy()
    f = c.astype(int); m = ((f.max(2) > 120) | (f.max(2) - f.min(2) > 90)).astype(np.uint8)
    m[:12] = m[-12:] = 0; m[:, :12] = m[:, -12:] = 0  # a borda da casa fica
    m = cv2.dilate(m, np.ones((9, 9), np.uint8))
    big = cv2.resize(c, (512, 512)); bm = cv2.resize(m, (512, 512), interpolation=cv2.INTER_NEAREST)
    inpaint(big, bm, (0, 0, 512, 512))
    Image.fromarray(cv2.resize(big, (CW, CH), interpolation=cv2.INTER_AREA)).save(D + 'cell.webp', quality=92)

# ---------- fundo: hipopótamos e letreiro saem (viram camadas animadas), números e grade ficam lisos ----------
if todo('bg'):
    im = mock.copy()
    m = np.zeros(im.shape[:2], np.uint8)
    for x0, y0, x1, y1 in ((0, 80, 500, 540), (470, 80, 940, 540)):
        m[y0:y1, x0:x1] |= (alpha(im[y0:y1, x0:x1].copy()) > 40).astype(np.uint8)
    m[440:] = 0  # plantas e dinheiro da base do letreiro ficam no fundo (o letreiro novo cobre o meio)
    m = cv2.dilate(m, np.ones((15, 15), np.uint8))
    inpaint(im, m, (0, 40, 512, 552))
    inpaint(im, m, (428, 40, 940, 552))
    # números que viram valor ao vivo: saldo, aposta, ganho (placa lisa; o LaMa inventava letras)
    for x0, y0, x1, y1 in ((680, 24, 852, 70), (140, 1476, 274, 1530), (618, 1476, 758, 1530)):
        p = 12; win = im[y0 - p:y1 + p, x0 - p:x1 + p].astype(np.float32)
        v = np.ones(win.shape[:2], np.float32); v[p - 2:-p + 2, p - 2:-p + 2] = 0
        sg = (y1 - y0) / 4
        fill = cv2.GaussianBlur(win * v[..., None], (0, 0), sg) / np.maximum(cv2.GaussianBlur(v, (0, 0), sg), 1e-3)[..., None]
        k = np.zeros(win.shape[:2], np.float32); k[p - 4:-p + 4, p - 4:-p + 4] = 1
        k = cv2.GaussianBlur(k, (0, 0), 3); k[p:-p, p:-p] = 1
        im[y0 - p:y1 + p, x0 - p:x1 + p] = (fill * k[..., None] + win * (1 - k[..., None])).astype(np.uint8)
    # grade: vinho escuro com luz no meio (os símbolos do desenho saem)
    x0, y0, x1, y1 = 88, 548, 852, 1374
    h, w = y1 - y0, x1 - x0
    yy, xx = np.mgrid[0:h, 0:w]
    v = 1 - .5 * (((xx - w / 2) / (w / 2)) ** 2) - .3 * (((yy - h / 2) / (h / 2)) ** 2)
    im[y0:y1, x0:x1] = np.clip(np.array([46, 8, 30]) * v[..., None] + np.array([10, 2, 8]), 0, 255).astype(np.uint8)
    Image.fromarray(im).save(D + 'bg.webp', quality=88)
if todo('spinbtn'):
    Image.fromarray(mock[1395:1587, 372:564]).save(D + 'spinbtn.webp', quality=92)
if not os.path.exists('assets/card_grid_hipopota.png'):
    Image.fromarray(mock[0:752, 0:940]).resize((400, 320), Image.LANCZOS).save('assets/card_grid_hipopota.png', optimize=True)
print('ok')
