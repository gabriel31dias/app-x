# Gera a arte do "Dragão da Sorte" a partir de assets/dragao/mockup.png (tela 941x1671 desenhada) e sheet.png
# (folha 1536x1024 sobre xadrez cinza: o recorte separa o cinza sem cor do desenho; brilho/fogo vira alfa pela cor).
# Uso: uv run --with rembg --with onnxruntime --with opencv-python-headless --with pillow --with numpy python tools/dragao_assets.py
# LaMa (retoque do fundo): curl -L -o ~/.cache/lama/lama_fp32.onnx https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx
import os, json
import numpy as np, cv2
from PIL import Image
D = 'assets/dragao/'
todo = lambda name: not os.path.exists(D + name + '.webp')  # só refaz o que falta; apague o arquivo pra refazer
sheet = np.array(Image.open(D + 'sheet.png').convert('RGB'))
mock = np.array(Image.open(D + 'mockup.png').convert('RGB'))

def checker(rgb):
    a = rgb.astype(int); mx, mn = a.max(2), a.min(2)
    return ((mx - mn) < 14) & (mn > 176)

def cut(box, glow=False):
    """solid: fundo = cinza ligado à borda do recorte (o miolo creme das pedras fica). glow: alfa pela saturação
    (fogo, brilho) e a cor é 'descontada' do cinza que vazava por trás."""
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
    if glow:  # fogo/brilho sai sobre preto (o CSS soma a luz com mix-blend-mode:screen): cinza sem cor vira preto
        f = rgb.astype(np.float32); sat = f.max(2) - f.min(2)
        k = np.clip((sat - 22) / 90, 0, 1) * cv2.dilate(solid, np.ones((9, 9), np.uint8))
        # miolo branco do fogo tem pouca cor (igual ao xadrez): buraco pequeno e claro cercado de fogo volta a ser luz
        n, lab, st, _ = cv2.connectedComponentsWithStats((k < .3).astype(np.uint8), connectivity=4)
        border = set(np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
        for i in range(1, n):
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

# divisas medidas na linha normal (na dourada as peças se encostam, mas estão nas mesmas colunas)
TILES = ['zhong', 'fa', 'dong', 'wan', 'bam3', 'bam5', 'dots', 'bai']
ICONS = ['wild', 'scatter', 'coin', 'bag', 'lotus', 'temple']
XS = [10, 102, 195, 290, 383, 475, 568, 663, 757], [765, 880, 989, 1099, 1228, 1364, 1522]
for (y0, y1), pre in (((345, 470), 's_'), ((472, 602), 'g_')):
    for names, xs in zip((TILES, ICONS), XS):
        for nm, a, b in zip(names, xs, xs[1:]):
            if todo(pre + nm): save(cut((a, y0, b, y1)), pre + nm, 150)

# ---------- dragões, fogo, brilhos, moedas, enfeites ----------
PECAS = {  # nome: (caixa, altura de saída, glow)
    'head1': ((436, 4, 586, 146), 220, False), 'head2': ((586, 4, 729, 152), 220, False), 'head3': ((729, 4, 857, 152), 220, False),
    'head4': ((857, 4, 996, 152), 220, False), 'head5': ((996, 4, 1136, 152), 220, False),
    'orb': ((1128, 4, 1236, 118), 140, False),
    'drag_pearl': ((474, 150, 625, 282), 240, False), 'drag_coil': ((624, 150, 763, 282), 240, False),
    'drag_fire': ((760, 150, 958, 284), 240, True), 'drag_slim': ((956, 150, 1072, 284), 240, False),
    'ring': ((1228, 0, 1430, 92), 160, True), 'burst': ((1420, 76, 1536, 168), 200, True),
    'swirl': ((1080, 150, 1250, 292), 220, True), 'spark': ((1242, 150, 1336, 214), 140, True),
    'fire1': ((474, 280, 630, 345), 110, True), 'fire2': ((630, 280, 795, 345), 110, True),
    'fire3': ((800, 280, 965, 345), 110, True), 'fire4': ((968, 280, 1146, 345), 110, True),
    'cloud1': ((1230, 2, 1340, 80), 110, False), 'cloud2': ((1250, 210, 1345, 272), 100, False),
    'cloud3': ((790, 870, 970, 958), 120, False), 'cloud4': ((1280, 954, 1444, 1022), 110, False),
    'coins_pile': ((1404, 160, 1536, 272), 160, False), 'coins_spray': ((1146, 268, 1270, 345), 120, False),
    'coin': ((778, 972, 830, 1018), 90, False), 'coin_side': ((994, 940, 1058, 1020), 110, False),
    'coins_stack': ((1148, 948, 1284, 1020), 110, False),
    'lantern': ((860, 602, 952, 832), 300, False), 'logo': ((2, 0, 476, 338), 400, False),
    'spinbtn': ((2, 815, 200, 1012), 260, False),
    'petal1': ((180, 968, 228, 1004), 50, False), 'petal2': ((268, 968, 326, 1010), 50, False), 'petal3': ((376, 976, 422, 1012), 50, False),
    'leaf1': ((520, 984, 582, 1014), 44, False),
}
for name, (box, h, glow) in PECAS.items():
    if todo(name): save(cut(box, glow), name, h)

# ---------- fundo: pedras, números e o dragão de cima saem; o dragão vira camada animada ----------
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

# grade: 5 colunas (4-5-5-5-4 pedras), mesma conta do CSS (--col-x / --row)
COLS, W, ROW, BOT = [120, 260, 400, 540, 680], 138, 127, 1188
H = [4, 5, 5, 5, 4]
DRAGON = (205, 0, 830, 330)  # caixa do dragão do topo na arte
if todo('dragon'):
    from rembg import remove, new_session
    x0, y0, x1, y1 = DRAGON
    c = Image.fromarray(mock[y0:y1, x0:x1])
    a = np.array(remove(c, session=new_session('birefnet-general-lite')))[..., 3]
    a[228:, :] = 0  # embaixo é o letreiro: fica no fundo
    n, lab, st, _ = cv2.connectedComponentsWithStats((a > 30).astype(np.uint8))
    if n > 1: a = a * (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    Image.fromarray(np.dstack([mock[y0:y1, x0:x1], a]), 'RGBA').save(D + 'dragon.webp', quality=92)
if todo('bg'):
    im = mock.copy()
    # textos que viram número ao vivo: ganho, saldo, aposta, último ganho, lanterna e os x1 x2 x3 x5.
    # Placas lisas (o LaMa inventava letras)
    TXT = [(426, 1222, 668, 1300), (62, 1347, 262, 1396), (396, 1347, 544, 1398), (696, 1347, 866, 1396),
           (810, 156, 910, 240), (172, 468, 296, 538), (340, 470, 436, 536), (496, 470, 592, 536), (642, 470, 740, 536)]
    for x0, y0, x1, y1 in TXT:
        # média ponderada só dos pixels de fora (desfoque normalizado): enche liso, sem os losangos da difusão
        p = 12; win = im[y0 - p:y1 + p, x0 - p:x1 + p].astype(np.float32)
        v = np.ones(win.shape[:2], np.float32); v[p - 2:-p + 2, p - 2:-p + 2] = 0
        sg = (y1 - y0) / 4
        fill = cv2.GaussianBlur(win * v[..., None], (0, 0), sg) / np.maximum(cv2.GaussianBlur(v, (0, 0), sg), 1e-3)[..., None]
        k = np.zeros(win.shape[:2], np.float32); k[p - 4:-p + 4, p - 4:-p + 4] = 1
        k = cv2.GaussianBlur(k, (0, 0), 3); k[p:-p, p:-p] = 1  # borda macia, miolo todo trocado
        im[y0 - p:y1 + p, x0 - p:x1 + p] = (fill * k[..., None] + win * (1 - k[..., None])).astype(np.uint8)
    # lanterna (já sem o número) vira camada que balança; o letreiro só vira máscara do brilho que passa nele
    from rembg import remove, new_session
    ses = new_session('birefnet-general-lite')
    LANT, LOGO = (770, 0, 945, 395), (205, 228, 740, 450)
    for name, (x0, y0, x1, y1) in (('lantern_m', LANT), ('logo_m', LOGO)):
        a = np.array(remove(Image.fromarray(im[y0:y1, x0:x1]), session=ses))[..., 3]
        n, lab, st, _ = cv2.connectedComponentsWithStats((a > 30).astype(np.uint8))
        if n > 1: a = a * (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
        if name == 'lantern_m':  # o rembg larga a borla vermelha embaixo: entra pela cor
            c = im[y0:y1, x0:x1].astype(int); red = (c[..., 0] > 110) & (c[..., 1] < 95) & (c[..., 2] < 95)
            red[:250] = False; red[:, :50] = False; red[:, 130:] = False
            a = np.maximum(a, cv2.morphologyEx(red.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)) * 255)
            n, lab, st, _ = cv2.connectedComponentsWithStats((a > 30).astype(np.uint8))
            a = a * (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)  # pétala vermelha solta sai
        Image.fromarray(np.dstack([im[y0:y1, x0:x1], a]), 'RGBA').save(D + name + '.webp', quality=92)
    x0, y0, x1, y1 = LANT
    m = np.zeros(im.shape[:2], np.uint8)
    m[y0:y1, x0:x1] = cv2.dilate((np.array(Image.open(D + 'lantern_m.webp'))[..., 3] > 20).astype(np.uint8), np.ones((15, 15), np.uint8))
    inpaint(im, m, (941 - 420, 0, 941, 420))
    # dragão: buraco atrás da camada retocado (só aparece na borda quando ele mexe)
    x0, y0, x1, y1 = DRAGON
    m = np.zeros(im.shape[:2], np.uint8)
    m[y0:y1, x0:x1] = cv2.dilate((np.array(Image.open(D + 'dragon.webp'))[..., 3] > 20).astype(np.uint8), np.ones((5, 5), np.uint8))
    m[y0 + 228:] = 0
    inpaint(im, m, (x0 - 20, 0, x1 + 20, 420))
    # colunas da grade: fundo vermelho escuro com luz no meio (as pedras do desenho saem)
    for c, x in enumerate(COLS):
        top = BOT - H[c] * ROW - (12 if H[c] == 4 else 4)  # sobra de pedra do desenho em cima das colunas curtas
        h, w = BOT + 6 - top, W + 6
        yy, xx = np.mgrid[0:h, 0:w]
        v = 1 - .55 * (((xx - w / 2) / (w / 2)) ** 2) - .25 * (yy / h)
        col = np.array([118, 14, 16]) * v[..., None] + np.array([22, 2, 4])
        im[top:top + h, x - 3:x - 3 + w] = np.clip(col, 0, 255).astype(np.uint8)
    Image.fromarray(im).save(D + 'bg.webp', quality=88)
if not os.path.exists('assets/card_grid_dragao_sorte.png'):
    Image.fromarray(mock[0:753, 0:941]).resize((400, 320), Image.LANCZOS).save('assets/card_grid_dragao_sorte.png', optimize=True)
print('ok')
