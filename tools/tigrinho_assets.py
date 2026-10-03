# Gera a arte do "Tigrinho Bolado" a partir de assets/tigrinho/mockup.png (tela 941x1671) e sheet.png
# (folha 1536x1024 sobre xadrez cinza: o recorte separa o cinza sem cor do desenho; brilho/fogo vira luz sobre preto).
# Uso: U2NET_HOME=~/.rembg uv run --with rembg --with onnxruntime --with opencv-python-headless --with pillow --with numpy python tools/tigrinho_assets.py
# LaMa (retoque do fundo): curl -L -o ~/.cache/lama/lama_fp32.onnx https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx
import os
import numpy as np, cv2
from PIL import Image
D = 'assets/tigrinho/'
todo = lambda name: not os.path.exists(D + name + '.webp')  # só refaz o que falta; apague o arquivo pra refazer
sheet = np.array(Image.open(D + 'sheet.png').convert('RGB'))
mock = np.array(Image.open(D + 'mockup.png').convert('RGB'))

def checker(rgb):
    a = rgb.astype(int); mx, mn = a.max(2), a.min(2)
    return ((mx - mn) < 14) & (mn > 176)

def cut(box, glow=False):
    """igual ao do dragão: solid = fundo é o cinza ligado à borda; glow = alfa pela saturação, sai sobre preto"""
    x0, y0, x1, y1 = box
    rgb = sheet[y0:y1, x0:x1].copy()
    ck = checker(rgb).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(ck, connectivity=4)
    border = set(np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]])) - {0}
    bg = np.isin(lab, list(border)) | (glow & (ck > 0))
    solid = (~bg).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(solid)
    if n > 1:  # sobra só o desenho grande (vizinho que encosta na caixa sai)
        big = st[1:, cv2.CC_STAT_AREA].max()
        solid = np.isin(lab, [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] > big * .03]).astype(np.uint8)
    a = cv2.GaussianBlur(cv2.erode(solid, np.ones((2, 2), np.uint8)).astype(np.float32), (3, 3), 0)
    if glow:
        f = rgb.astype(np.float32); sat = f.max(2) - f.min(2)
        k = np.clip((sat - 22) / 90, 0, 1) * cv2.dilate(solid, np.ones((9, 9), np.uint8))
        n, lab, st, _ = cv2.connectedComponentsWithStats((k < .3).astype(np.uint8), connectivity=4)
        border = set(np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
        for i in range(1, n):  # miolo branco do fogo volta a ser luz
            if i not in border and st[i, cv2.CC_STAT_AREA] < 2500: k[(lab == i) & (f.min(2) > 150)] = 1
        k = cv2.GaussianBlur(k, (3, 3), 0)
        img = Image.fromarray((f * k[..., None]).astype(np.uint8), 'RGB')
        return img.crop(Image.fromarray((k * 255).astype(np.uint8)).getbbox())
    img = Image.fromarray(np.dstack([rgb, (a * 255).astype(np.uint8)]), 'RGBA')
    return img.crop(img.getbbox())

def save(img, name, h=None):
    if h: img = img.resize((round(img.width * h / img.height), h), Image.LANCZOS)
    img.save(D + name + '.webp', quality=90)
    return img.size

# ---------- símbolos: normal (s_) e dourado de ganho (g_), mesmas colunas ----------
SYMS = ['bag', 'ingot', 'jade', 'orange', 'flower', 'fire', 'coin', 'env', 'wild']
XS = [18, 172, 342, 500, 655, 822, 995, 1165, 1330, 1512]
for (y0, y1), pre in (((304, 463), 's_'), ((463, 614), 'g_')):
    for nm, a, b in zip(SYMS, XS, XS[1:]):
        if todo(pre + nm): save(cut((a, y0, b, y1)), pre + nm, 170)

# ---------- tigre em poses, cabeças, fogo, moedas, enfeites ----------
PECAS = {  # nome: (caixa, altura de saída, glow)
    't_punch': ((505, 0, 758, 218), 420, False), 't_gift': ((758, 0, 985, 218), 420, False),
    't_jump1': ((985, 0, 1115, 150), 300, False), 't_jump2': ((1115, 0, 1252, 142), 300, False),
    't_coins': ((985, 150, 1190, 308), 320, False),
    'h1': ((512, 215, 618, 308), 190, False), 'h2': ((618, 215, 720, 308), 190, False), 'h3': ((720, 215, 820, 308), 190, False),
    'h4': ((820, 215, 908, 308), 190, False), 'h5': ((908, 215, 997, 308), 190, False),
    'logo': ((5, 0, 505, 305), 420, False),
    'firetiger': ((1252, 2, 1442, 118), 220, True), 'pawglow': ((1440, 0, 1536, 100), 170, True),
    'swirl': ((1262, 128, 1398, 218), 200, True), 'streak': ((1178, 222, 1318, 306), 150, True),
    'boom1': ((1316, 222, 1390, 302), 170, True), 'boom2': ((1388, 222, 1456, 302), 170, True), 'boom3': ((1454, 222, 1536, 302), 170, True),
    'fireball': ((1100, 130, 1258, 222), 170, True),
    'paw': ((856, 746, 950, 840), 140, False), 'pile': ((1006, 898, 1140, 1024), 150, False),
    'ingot': ((902, 932, 1008, 1014), 110, False), 'clouds': ((818, 846, 1002, 928), 140, False),
}
for name, (box, h, glow) in PECAS.items():
    if not todo(name): continue
    if name == 't_coins':  # a bola de fogo vizinha encosta no tigre: apaga ela (vira xadrez) antes de recortar
        keep = sheet[130:222, 1098:1192].copy(); sheet[130:222, 1098:1192] = 200
        save(cut(box, glow), name, h); sheet[130:222, 1098:1192] = keep
    else: save(cut(box, glow), name, h)

# moedas soltas (a folha tem várias de lado/de frente na coluna da direita)
COINS = {'coin1': (1400, 100, 1462, 162), 'coin2': (1460, 100, 1536, 168), 'coin3': (1400, 158, 1462, 222), 'coin4': (1460, 158, 1536, 225)}
for name, box in COINS.items():
    if todo(name): save(cut(box), name, 80)

# ---------- fundo ----------
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

_ses = None
def rem(rgb):
    global _ses
    from rembg import remove, new_session
    _ses = _ses or new_session('birefnet-general-lite')
    a = np.array(remove(Image.fromarray(rgb), session=_ses))[..., 3]
    n, lab, st, _ = cv2.connectedComponentsWithStats((a > 30).astype(np.uint8))
    if n > 1: a = a * (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    return a

# tigre: camada só acima do letreiro (o letreiro fica no fundo); as patas dos lados descem mais
TIGER = (90, 0, 900, 460)
def cutline(x):  # y (na arte) onde o letreiro começa, por coluna
    return 455 if x >= 735 else 345 if x < 175 else 300
if todo('tiger'):
    x0, y0, x1, y1 = TIGER
    a = rem(mock[y0:y1, x0:x1].copy()).astype(np.float32)
    ys = np.arange(y0, y1)[:, None]; cl = np.array([cutline(x) for x in range(x0, x1)])[None, :]
    a *= np.clip((cl - ys) / 6, 0, 1)  # borda macia de 6 px no corte
    Image.fromarray(np.dstack([mock[y0:y1, x0:x1], a.astype(np.uint8)]), 'RGBA').save(D + 'tiger.webp', quality=92)
LANT = (780, 0, 941, 400)
if todo('bg'):
    im = mock.copy()
    # número da lanterna (vira número ao vivo) e valores dos painéis: placa lisa
    TXT = [(822, 168, 908, 228), (425, 1182, 662, 1244), (78, 1300, 252, 1348), (408, 1300, 537, 1348), (704, 1300, 854, 1348)]
    for x0, y0, x1, y1 in TXT:
        p = 12; win = im[y0 - p:y1 + p, x0 - p:x1 + p].astype(np.float32)
        v = np.ones(win.shape[:2], np.float32); v[p - 2:-p + 2, p - 2:-p + 2] = 0
        sg = (y1 - y0) / 4
        fill = cv2.GaussianBlur(win * v[..., None], (0, 0), sg) / np.maximum(cv2.GaussianBlur(v, (0, 0), sg), 1e-3)[..., None]
        k = np.zeros(win.shape[:2], np.float32); k[p - 4:-p + 4, p - 4:-p + 4] = 1
        k = cv2.GaussianBlur(k, (0, 0), 3); k[p:-p, p:-p] = 1
        im[y0 - p:y1 + p, x0 - p:x1 + p] = (fill * k[..., None] + win * (1 - k[..., None])).astype(np.uint8)
    # lanterna sem número vira camada que balança (a borla vermelha entra pela cor)
    x0, y0, x1, y1 = LANT
    a = rem(im[y0:y1, x0:x1].copy())
    # o rembg larga a borla e o cordão dourado embaixo: entram pela cor, só na faixa do meio
    c = im[y0:y1, x0:x1].astype(int); sat = c.max(2) - c.min(2)
    red = (c[..., 0] > 110) & (c[..., 1] < 95) & (c[..., 2] < 95)
    gold = (sat > 90) & (c[..., 0] > 150) & (c[..., 1] > 90) & (c[..., 2] < 90)
    tail = (red | gold); tail[:250] = False; tail[370:] = False; tail[:, :62] = False; tail[:, 104:] = False
    a = np.maximum(a, cv2.morphologyEx(tail.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8)) * 255)
    n, lab, st, _ = cv2.connectedComponentsWithStats(cv2.dilate((a > 30).astype(np.uint8), np.ones((9, 9), np.uint8)))
    a = a * (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)  # lanterna + borla ligadas; pétala solta sai
    Image.fromarray(np.dstack([im[y0:y1, x0:x1], a]), 'RGBA').save(D + 'lantern.webp', quality=92)
    m = np.zeros(im.shape[:2], np.uint8)
    m[y0:y1, x0:x1] = cv2.dilate((a > 20).astype(np.uint8), np.ones((15, 15), np.uint8))
    # tigre: buraco atrás da camada retocado (só aparece na borda quando ele mexe)
    x0, y0, x1, y1 = TIGER
    ta = np.array(Image.open(D + 'tiger.webp'))[..., 3]
    m[y0:y1, x0:x1] |= cv2.dilate((ta > 20).astype(np.uint8), np.ones((9, 9), np.uint8))
    # nada abaixo do corte (é letreiro)
    cl = np.array([cutline(x) for x in range(im.shape[1])])
    m[np.arange(im.shape[0])[:, None] >= cl[None, :]] = 0
    inpaint(im, m, (0, 0, 512, 512))
    inpaint(im, m, (429, 0, 941, 512))
    # grade: colunas creme com divisória escura (os símbolos do desenho saem)
    X0, Y0, X1, Y1 = 104, 594, 838, 1146
    h, w = Y1 - Y0, X1 - X0
    yy, xx = np.mgrid[0:h, 0:w]
    v = 1 - .12 * ((yy - h / 2) / (h / 2)) ** 2
    col = (np.array([238, 222, 190]) * v[..., None]).astype(np.float32)
    for c in range(5):  # sombra nas bordas de cada coluna + divisória
        cx = 108 + c * 146.5 - X0
        d = np.minimum(np.abs(xx - cx), np.abs(xx - (cx + 142)))
        col *= (1 - .25 * np.exp(-d / 6))[..., None]
        if c: col[:, int(cx) - 3:int(cx)] = [120, 70, 40]
    im[Y0:Y1, X0:X1] = np.clip(col, 0, 255).astype(np.uint8)
    Image.fromarray(im).save(D + 'bg.webp', quality=88)
if todo('spinbtn'):
    Image.fromarray(mock[1376:1600, 358:582]).save(D + 'spinbtn.webp', quality=92)
if not os.path.exists('assets/card_grid_tigrinho.png'):
    Image.fromarray(mock[0:753, 0:941]).resize((400, 320), Image.LANCZOS).save('assets/card_grid_tigrinho.png', optimize=True)
print('ok')
