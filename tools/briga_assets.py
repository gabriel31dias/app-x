# Gera a arte da "Briga de Bêbados" a partir de assets/briga/mockup.png (tela 950x1656 desenhada) e sheet.png
# (folha com fundo transparente: o recorte é pelo alfa; só os dois brigões grandes do mockup usam IA, pra sair do
# fundo e virar camada animada na tela de aposta).
# Uso: uv run --with rembg --with scikit-image --with onnxruntime --with opencv-python-headless --with pillow --with numpy python tools/briga_assets.py
import os, json
import numpy as np, cv2
from PIL import Image
D = 'assets/briga/'
todo = lambda name: not os.path.exists(D + name + '.webp')  # só refaz o que falta; apague o arquivo pra refazer
sheet = Image.open(D + 'sheet.png').convert('RGBA')
A = np.array(sheet)
mock = Image.open(D + 'mockup.png').convert('RGB')

# ---------- os dois brigões: faixa (y0, y1) da folha e divisas entre quadros (x) ----------
# Cada quadro = pedaços do alfa cujo centro cai entre as divisas (pedaço pequeno = letreiro/respingo, sai).
ANIM = {
    'ze_idle': ((0, 137), [10, 95, 189, 284, 388, 500]),
    'ze_walk': ((0, 137), [515, 609, 709, 802, 898, 1010]),
    'ze_soco': ((138, 277), [5, 105, 189, 276, 362, 444, 505]),
    'ze_garrafa': ((138, 277), [505, 630, 728, 900]),
    'ze_empurra': ((138, 277), [880, 962, 1028, 1100, 1172, 1295]),
    'ze_dano': ((138, 277), [1298, 1378, 1447, 1530]),
    'ze_queda': ((278, 377), [15, 147, 321, 463, 624, 739, 915]),
    'ze_vit': ((278, 377), [945, 1061, 1177, 1285, 1410]),
    'to_idle': ((374, 513), [15, 126, 237, 352, 485]),
    'to_walk': ((374, 513), [515, 635, 730, 837, 917, 1030]),
    'to_soco': ((514, 662), [5, 124, 203, 301, 395, 505]),
    'to_garrafa': ((514, 662), [505, 604, 756, 940]),
    'to_agarra': ((514, 662), [940, 1025, 1108, 1240]),
    'to_dano': ((514, 662), [1255, 1377, 1450, 1530]),
    'to_queda': ((657, 772), [25, 189, 369, 470, 631, 855]),  # o 3º quadro é o Zé (erro da folha): o jogo não usa
}
K = 2  # a folha é pequena (~120 px por boneco): sai 2x maior pra não borrar tanto no celular

def frames(band, xs):
    """Os quadros da folha se encostam (o soco de um entra no corpo do outro): watershed a partir do tronco de cada
    boneco (ponto mais "gordo" do alfa na célula) separa pelo pescoço mais fino. Pedaço solto (garrafa, respingo)
    vai pro quadro onde cai o centro dele; letreiro e caquinho saem."""
    from skimage.segmentation import watershed
    y0, y1 = band
    m = (A[y0:y1, xs[0]:xs[-1], 3] > 60).astype(np.uint8)
    dist = cv2.distanceTransform(m, cv2.DIST_L2, 5)
    mk = np.zeros(m.shape, np.int32)
    for i in range(len(xs) - 1):
        a, b = xs[i] - xs[0], xs[i + 1] - xs[0]; y, x = np.unravel_index(np.argmax(dist[:, a:b]), dist[:, a:b].shape)
        mk[y, a + x] = i + 1
    lab = watershed(-dist, mk, mask=m.astype(bool))
    n, cc, st, cen = cv2.connectedComponentsWithStats(m * (lab == 0).astype(np.uint8))  # pedaços que nenhum tronco alcançou
    out = []
    for i in range(len(xs) - 1):
        keep = lab == i + 1; big = keep.sum()
        for c in range(1, n):
            if xs[i] <= xs[0] + cen[c][0] < xs[i + 1] and st[c, cv2.CC_STAT_AREA] > big * .04 and st[c, cv2.CC_STAT_HEIGHT] > 26: keep |= cc == c
        r = np.array(sheet.crop((xs[0], y0, xs[-1], y1)))
        r[..., 3] = r[..., 3] * cv2.dilate(keep.astype(np.uint8), np.ones((3, 3), np.uint8))
        img = Image.fromarray(r, 'RGBA'); out.append(img.crop(img.getbbox()))
    return out

def strip(fr, name):
    """tira horizontal: quadros com os pés (média do alfa na base) no centro da célula e base alinhada, mesma escala"""
    fr = [f.resize((f.width * K, f.height * K), Image.LANCZOS) for f in fr]
    def pe(f):
        a = np.array(f)[..., 3]; base = a[int(a.shape[0] * .85):] > 60
        return np.nonzero(base)[1].mean() if base.any() else f.width / 2
    ps = [pe(f) for f in fr]
    half = int(max(max(p, f.width - p) for p, f in zip(ps, fr))) + 24  # folga: punho na borda some no arredondamento da escala
    h = max(f.height for f in fr) + 16  # folga em cima também (boné)
    out = Image.new('RGBA', (half * 2 * len(fr), h))
    for i, (f, p) in enumerate(zip(fr, ps)): out.alpha_composite(f, (i * half * 2 + half - round(p), h - f.height))
    out.save(D + name + '.webp', quality=90)
    return [len(fr), half * 2, h]

SPR = {}
for name, (band, xs) in ANIM.items():
    if todo(name): SPR[name] = strip(frames(band, xs), name)
    else:
        w, h = Image.open(D + name + '.webp').size; SPR[name] = [len(xs) - 1, w // (len(xs) - 1), h]

# ---------- efeitos e objetos (recorte pelo alfa; o maior pedaço quando o vizinho encosta) ----------
def cut(box, keep_largest):
    r = np.array(sheet.crop(box))
    if keep_largest:
        n, lab, st, _ = cv2.connectedComponentsWithStats((r[..., 3] > 40).astype(np.uint8))
        if n > 1: r[..., 3] = r[..., 3] * cv2.dilate((lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8), np.ones((5, 5), np.uint8))
    img = Image.fromarray(r, 'RGBA'); return img.crop(img.getbbox())
PECAS = {  # nome: (caixa na folha, altura de saída, keep_largest)
    'hit1': ((8, 790, 48, 866), 150, True), 'hit2': ((50, 790, 95, 862), 150, True), 'hit3': ((96, 790, 156, 862), 150, True),
    'hit4': ((158, 790, 222, 862), 150, True), 'hit5': ((224, 790, 292, 872), 160, True),
    'smoke1': ((280, 790, 366, 882), 170, True), 'smoke2': ((337, 790, 445, 882), 170, True), 'smoke3': ((445, 788, 512, 886), 170, False),
    'star': ((526, 794, 562, 830), 70, True), 'stars': ((520, 790, 680, 870), 130, False), 'swirl': ((680, 785, 728, 866), 110, False),
    'bottle': ((738, 802, 786, 878), 140, True), 'shards': ((790, 776, 975, 876), 170, False),
    'blood': ((985, 798, 1140, 860), 90, False),
    'pow': ((1168, 772, 1292, 870), 200, True), 'bam': ((1298, 780, 1412, 866), 190, True), 'crash': ((1412, 782, 1533, 870), 190, True),
    'chair': ((8, 895, 104, 1010), 190, True), 'table': ((180, 880, 296, 976), 170, True), 'stool': ((368, 898, 442, 1002), 160, True),
    'plank': ((506, 890, 582, 958), 90, True), 'tire': ((704, 895, 750, 1008), 160, True), 'roundtable': ((750, 898, 910, 1022), 200, True),
    'barrel': ((864, 890, 925, 958), 110, True), 'beer1': ((930, 893, 965, 998), 140, True), 'beer2': ((966, 893, 1046, 1014), 150, False),
    'beer3': ((1050, 892, 1086, 1002), 140, True), 'beer4': ((1086, 892, 1120, 1000), 140, True), 'cone': ((1216, 892, 1280, 966), 120, True),
    'champ': ((1296, 895, 1404, 1018), 200, False), 'popbottle': ((1412, 895, 1534, 1018), 200, False),
}
for name, (box, h, kl) in PECAS.items():
    if todo(name):
        c = cut(box, kl); c.resize((round(c.width * h / c.height), h), Image.LANCZOS).save(D + name + '.webp', quality=90)

# ---------- tela de aposta: os brigões grandes do mockup saem do fundo no lugar exato e o buraco é retocado ----------
# O buraco é preenchido pelo LaMa (ONNX, ~200 MB, baixe uma vez:
#   curl -L -o ~/.cache/lama/lama_fp32.onnx https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx)
BRIGOES = {'big0': (10, 335, 420, 890), 'big1': (525, 380, 945, 895)}
import onnxruntime as ort
so = ort.SessionOptions  # sem o cache de memória do onnxruntime (estoura a RAM)
def _so():
    o = so(); o.enable_cpu_mem_arena = False; o.enable_mem_pattern = False; return o
ort.SessionOptions = _so
for name, (x0, y0, x1, y1) in BRIGOES.items():
    if not todo(name): continue
    from rembg import remove, new_session
    c = mock.crop((x0, y0, x1, y1))
    a = np.array(remove(c, session=new_session('birefnet-general-lite')))[..., 3]
    n, lab, st, _ = cv2.connectedComponentsWithStats((a > 30).astype(np.uint8))
    if n > 1: a = a * (lab == 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
    g = np.array(c.convert('RGBA')); g[..., 3] = a
    Image.fromarray(g, 'RGBA').save(D + name + '.webp', quality=90)
if todo('bg'):
    lama = ort.InferenceSession(os.path.expanduser('~/.cache/lama/lama_fp32.onnx'))
    im = np.array(mock)
    for name, (x0, y0, x1, y1) in BRIGOES.items():
        a = np.array(Image.open(D + name + '.webp'))[..., 3]
        m = np.zeros(im.shape[:2], np.uint8); m[y0:y1, x0:x1] = cv2.dilate((a > 20).astype(np.uint8), np.ones((15, 15), np.uint8))
        # janela quadrada em volta do brigão (com contexto), reduzida pra 512 que é a entrada do modelo
        cx, cy, s = (x0 + x1) // 2, (y0 + y1) // 2, max(x1 - x0, y1 - y0) + 120
        bx0, by0 = max(0, min(im.shape[1] - s, cx - s // 2)), max(0, min(im.shape[0] - s, cy - s // 2))
        win, wm = im[by0:by0 + s, bx0:bx0 + s], m[by0:by0 + s, bx0:bx0 + s]
        x = cv2.resize(win, (512, 512), interpolation=cv2.INTER_AREA).transpose(2, 0, 1)[None].astype(np.float32) / 255
        mk = (cv2.resize(wm, (512, 512), interpolation=cv2.INTER_NEAREST) > 0)[None, None].astype(np.float32)
        out = lama.run(None, {'image': x, 'mask': mk})[0][0].transpose(1, 2, 0)
        out = cv2.resize(np.clip(out, 0, 255).astype(np.uint8), (s, s), interpolation=cv2.INTER_CUBIC)
        k = cv2.GaussianBlur(wm.astype(np.float32), (9, 9), 0)[..., None]  # costura suave
        im[by0:by0 + s, bx0:bx0 + s] = (out * k + win * (1 - k)).astype(np.uint8)
    Image.fromarray(im).save(D + 'bg.webp', quality=88)
# carinhas (barra de vida e resultado) e o botão APOSTAR (pulsa por cima do desenhado)
for name, box in {'face0': (95, 880, 395, 1050), 'face1': (560, 870, 860, 1050), 'apostar': (160, 1478, 792, 1618)}.items():
    if todo(name): mock.crop(box).save(D + name + '.webp', quality=90)
if not os.path.exists('assets/card_grid_briga.png'):
    mock.crop((0, 0, 950, 760)).resize((400, 320), Image.LANCZOS).save('assets/card_grid_briga.png', optimize=True)

print('SPR', json.dumps(SPR, separators=(',', ':')))
