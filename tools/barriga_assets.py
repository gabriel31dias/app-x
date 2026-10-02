# Gera a arte do "Barriguinho" (crash) a partir de assets/barriga/mockup.png (tela 941x1672 desenhada) e sheet.png
# (folha com fundo transparente: o recorte é pelo alfa). O Barriguinho grande do mockup sai do fundo pela IA (kid.webp;
# o jogo incha a barriga desenhando linha por linha); o buraco e os hambúrgueres da esteira são
# retocados pelo LaMa (ONNX, ~200 MB, baixe uma vez:
#   curl -L -o ~/.cache/lama/lama_fp32.onnx https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx)
# Uso: uv run --with rembg --with onnxruntime --with opencv-python-headless --with pillow --with numpy python tools/barriga_assets.py
import os, json
import numpy as np, cv2
from PIL import Image
D = 'assets/barriga/'
todo = lambda name: not os.path.exists(D + name + '.webp')  # só refaz o que falta; apague o arquivo pra refazer
sheet = Image.open(D + 'sheet.png').convert('RGBA')
mock = Image.open(D + 'mockup.png').convert('RGB')

def cut(box, keep_largest=True):
    """recorte pelo alfa; keep_largest descarta pedaços dos vizinhos que entram na caixa"""
    r = np.array(sheet.crop(box))
    if keep_largest:
        n, lab, st, _ = cv2.connectedComponentsWithStats((r[..., 3] > 40).astype(np.uint8))
        if n > 1: r[..., 3] = r[..., 3] * cv2.dilate((lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8), np.ones((5, 5), np.uint8))
    img = Image.fromarray(r, 'RGBA'); return img.crop(img.getbbox())

def one(box, name, h, kl=True):
    if todo(name):
        c = cut(box, kl); k = h / c.height
        c.resize((round(c.width * k), h), Image.LANCZOS).save(D + name + '.webp', quality=90)

# ---------- peças da folha: nome -> (caixa, altura de saída, keep_largest) ----------
PECAS = {
    # hambúrgueres (esteira, voando, explosão)
    'b1': ((15, 630, 106, 728), 160, True), 'b2': ((124, 638, 217, 730), 160, True), 'b3': ((245, 641, 344, 732), 160, True),
    'b4': ((357, 639, 456, 733), 160, True), 'b5': ((478, 640, 576, 738), 160, True), 'bgold': ((593, 628, 707, 739), 180, False),
    'bbite': ((724, 650, 814, 741), 150, True), 'bchili': ((820, 629, 932, 747), 180, False), 'bopen': ((1150, 671, 1248, 748), 130, True),
    'bfire': ((1257, 679, 1377, 750), 120, False), 'meteor': ((1376, 679, 1530, 749), 110, False),
    # ingredientes (pedaços voando no estouro)
    'bun': ((47, 756, 130, 804), 70, True), 'patty': ((155, 760, 249, 811), 70, True), 'cheese': ((263, 759, 356, 812), 70, True),
    'lettuce': ((365, 752, 462, 806), 70, True), 'tomato': ((476, 759, 555, 810), 70, True), 'onion': ((571, 757, 646, 807), 70, True),
    'pickle': ((654, 761, 700, 802), 60, True), 'bacon': ((707, 768, 772, 810), 60, True), 'egg': ((787, 758, 864, 815), 70, True),
    # ketchup: esguichos, poças e respingos
    'squirt': ((1024, 768, 1133, 813), 70, True), 'squirt2': ((1144, 769, 1220, 826), 90, False),
    'splat1': ((30, 828, 158, 917), 200, False), 'splat2': ((267, 822, 449, 929), 220, False), 'drip': ((460, 827, 525, 960), 200, True),
    'splat3': ((535, 833, 674, 957), 220, False), 'splat4': ((195, 864, 266, 919), 110, True), 'splat5': ((447, 966, 538, 1013), 90, False),
    'splat6': ((595, 968, 741, 1015), 110, False), 'dots': ((16, 932, 96, 1000), 120, False),
    # explosão, fumaça e brilhos
    'boom': ((680, 814, 1222, 1020), 420, False), 'smoke1': ((1215, 882, 1332, 1008), 220, True), 'smoke2': ((1432, 875, 1518, 1012), 220, True),
    'smoke3': ((1237, 764, 1313, 855), 150, True), 'smoke4': ((1388, 764, 1519, 858), 160, False), 'puff': ((1339, 878, 1420, 975), 130, False),
    'chili': ((79, 931, 155, 1008), 110, True), 'spark': ((159, 929, 232, 1013), 140, True), 'bonus': ((248, 934, 338, 1020), 150, False),
    # Barriguinho: depois do estouro (sujo de ketchup, chamuscado, tonto) e o do esguicho
    'aftermath1': ((1143, 514, 1274, 652), 300, False), 'aftermath2': ((1280, 523, 1397, 663), 300, False), 'aftermath3': ((1403, 526, 1532, 660), 300, False),
    'vomit': ((939, 329, 1253, 517), 300, False), 'dizzy': ((1401, 346, 1534, 512), 300, False),
}
for name, (box, h, kl) in PECAS.items(): one(box, name, h, kl)

# carinhas (13, da feliz à estourada): tira com quadros do mesmo tamanho, base alinhada
FACES = [(14, 115), (134, 243), (248, 360), (365, 480), (482, 583), (582, 691), (692, 800), (802, 908), (911, 1011), (1013, 1135)]
if todo('faces'):
    fr = [cut((a, 510, b, 640)) for a, b in FACES]
    h = 200; fr = [f.resize((round(f.width * h / f.height), h), Image.LANCZOS) for f in fr]
    w = max(f.width for f in fr) + 8; out = Image.new('RGBA', (w * len(fr), h))
    for i, f in enumerate(fr): out.alpha_composite(f, (i * w + (w - f.width) // 2, 0))
    out.save(D + 'faces.webp', quality=90)

# ---------- mockup: o Barriguinho grande vira camadas (corpo + barriga) e o fundo é retocado ----------
KID = (150, 500, 740, 1110)       # caixa do Barriguinho (com a cadeira) no mockup
BURGERS = [(0, 1045, 140, 1295), (205, 1080, 395, 1262), (505, 1078, 745, 1272), (870, 1062, 941, 1222)]  # esteira
import onnxruntime as ort
so = ort.SessionOptions  # sem o cache de memória do onnxruntime (estoura a RAM)
def _so():
    o = so(); o.enable_cpu_mem_arena = False; o.enable_mem_pattern = False; return o
ort.SessionOptions = _so
if todo('kid'):
    from rembg import remove, new_session
    c = mock.crop(KID)
    a = np.array(remove(c, session=new_session('birefnet-general-lite')))[..., 3]
    n, lab, st, _ = cv2.connectedComponentsWithStats((a > 30).astype(np.uint8))
    if n > 1: a = a * (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    g = np.array(c.convert('RGBA')); g[..., 3] = a
    Image.fromarray(g, 'RGBA').save(D + 'kid.webp', quality=92)
if todo('bg'):
    lama = ort.InferenceSession(os.path.expanduser('~/.cache/lama/lama_fp32.onnx'))
    im = np.array(mock); full = np.zeros(im.shape[:2], np.uint8)
    a = np.array(Image.open(D + 'kid.webp'))[..., 3]
    full[KID[1]:KID[3], KID[0]:KID[2]] = cv2.dilate((a > 20).astype(np.uint8), np.ones((17, 17), np.uint8))
    burg = np.zeros_like(full)
    for x0, y0, x1, y1 in BURGERS: burg[y0:y1, x0:x1] = 1
    def fill(m, box):
        x0, y0, x1, y1 = box; s = max(x1 - x0, y1 - y0) + 140
        bx0 = max(0, min(im.shape[1] - s, (x0 + x1) // 2 - s // 2)); by0 = max(0, min(im.shape[0] - s, (y0 + y1) // 2 - s // 2))
        win, wm = im[by0:by0 + s, bx0:bx0 + s].copy(), m[by0:by0 + s, bx0:bx0 + s]
        x = cv2.resize(win, (512, 512), interpolation=cv2.INTER_AREA).transpose(2, 0, 1)[None].astype(np.float32) / 255
        mk = (cv2.resize(wm, (512, 512), interpolation=cv2.INTER_NEAREST) > 0)[None, None].astype(np.float32)
        out = lama.run(None, {'image': x, 'mask': mk})[0][0].transpose(1, 2, 0)
        out = cv2.resize(np.clip(out, 0, 255).astype(np.uint8), (s, s), interpolation=cv2.INTER_CUBIC)
        k = cv2.GaussianBlur(wm.astype(np.float32), (9, 9), 0)[..., None]
        im[by0:by0 + s, bx0:bx0 + s] = (out * k + win * (1 - k)).astype(np.uint8)
    fill(full, KID)
    for b in BURGERS: fill(burg, b)
    Image.fromarray(im).save(D + 'bg.webp', quality=88)
if not os.path.exists('assets/card_grid_barriga.png'):
    mock.crop((0, 0, 941, 752)).resize((400, 320), Image.LANCZOS).save('assets/card_grid_barriga.png', optimize=True)
w, h = Image.open(D + 'faces.webp').size
print('FACES', [len(FACES), w // len(FACES), h])
