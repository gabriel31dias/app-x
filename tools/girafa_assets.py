# Gera a arte da "Girafa Doidona" a partir de assets/girafa/mockup.png (tela 1024x1536) e sheet.png (folha 1536x1024 COM transparência).
# Uso: U2NET_HOME=~/.rembg uv run --with rembg --with onnxruntime --with opencv-python-headless --with pillow --with numpy python tools/girafa_assets.py
# LaMa (retoque do fundo): ver tools/lalau_assets.py
import os
import numpy as np, cv2
from PIL import Image
D = 'assets/girafa/'
todo = lambda name: not os.path.exists(D + name + '.webp')  # só refaz o que falta; apague o arquivo pra refazer
sheet = np.array(Image.open(D + 'sheet.png').convert('RGBA'))
mock = Image.open(D + 'mockup.png').convert('RGB')

def piece(box, sep=4):
    """recorte pela transparência da folha. As caras da folha se encostam: afina a máscara (sep px) pra separar,
    fica com o pedaço maior e devolve a borda. Soltos pequenos que não encostam na caixa (gotas, brilhos) ficam."""
    x0, y0, x1, y1 = box
    p = sheet[y0:y1, x0:x1].copy()
    m = (p[..., 3] > 20).astype(np.uint8)
    k = np.ones((3, 3), np.uint8)
    e = cv2.erode(m, k, iterations=sep) if sep else m
    n, lab, st, _ = cv2.connectedComponentsWithStats(e)
    if n > 1:
        h, w = lab.shape
        big = 1 + st[1:, cv2.CC_STAT_AREA].argmax()
        keep = cv2.dilate((lab == big).astype(np.uint8), k, iterations=sep + 1) & m
        n2, lab2, st2, _ = cv2.connectedComponentsWithStats(m * (1 - cv2.dilate(keep, k, iterations=2)))
        for i in range(1, n2):  # soltos de dentro da caixa (não encostam na borda)
            sx, sy, sw, sh, _ = st2[i]
            if sx > 0 and sy > 0 and sx + sw < w and sy + sh < h and st2[i, 4] > 30: keep |= (lab2 == i).astype(np.uint8)
        p[..., 3] *= keep
    img = Image.fromarray(p, 'RGBA')
    return img.crop(img.getbbox())

PIECES = {
    # caras da girafa (expressões)
    'f_crazy': (10, 0, 215, 268), 'f_happy': (182, 0, 392, 252), 'f_wink': (372, 0, 592, 258), 'f_lol': (588, 0, 782, 258),
    'f_wink2': (752, 0, 962, 252), 'f_love': (924, 0, 1112, 252), 'f_hypno': (1098, 0, 1292, 252), 'f_mini': (1268, 140, 1352, 232),
    'f_cool': (1322, 0, 1532, 252), 'f_love2': (4, 250, 190, 452), 'f_nuts': (150, 188, 352, 452), 'f_cyclops': (328, 258, 502, 462),
    'f_cool2': (488, 258, 712, 462), 'f_safari': (708, 268, 882, 472),
    # pescoço balançando (6 quadros) e pescoços finos
    'neck0': (842, 248, 962, 472), 'neck1': (952, 240, 1072, 472), 'neck2': (1058, 240, 1162, 472), 'neck3': (1138, 240, 1242, 472),
    'neck4': (1228, 240, 1322, 472), 'neck5': (1308, 240, 1422, 472),
    # olhos, bocas, línguas, gotas
    'eyes_crazy': (18, 462, 182, 542), 'eyes_sleepy': (184, 462, 292, 542), 'eyes_half': (294, 462, 398, 542), 'eyes_love': (398, 462, 502, 542), 'eyes_sleepy2': (502, 462, 608, 542),
    'mouth1': (612, 462, 702, 548), 'mouth2': (700, 465, 782, 550), 'mouth3': (778, 465, 852, 562), 'heart': (848, 470, 892, 512), 'mouth4': (896, 465, 972, 548), 'tongue': (972, 465, 1048, 548),
    'drop1': (872, 500, 935, 565), 'drop2': (1055, 480, 1150, 560), 'drop3': (1150, 478, 1238, 545), 'drop4': (1225, 478, 1310, 545), 'drop5': (1312, 475, 1400, 545),
    # símbolos
    's_A': (10, 545, 142, 685), 's_K': (138, 545, 258, 685), 's_Q': (252, 545, 378, 692), 's_J': (372, 545, 492, 685), 's_10': (488, 545, 618, 685),
    's_banana': (598, 560, 748, 692), 's_melon': (738, 562, 882, 702), 's_pineapple': (882, 548, 1042, 702), 's_coconut': (1042, 568, 1178, 702),
    's_wild': (1172, 552, 1375, 712), 's_bonus': (1372, 558, 1532, 712),
    # acessórios, placas, folhas, moedas, efeitos
    'hat': (0, 688, 168, 774), 'glasses': (138, 688, 318, 762), 'sign1': (308, 688, 578, 832), 'sign2': (572, 688, 832, 832),
    'leaf1': (0, 776, 152, 872), 'leaf2': (152, 758, 308, 872), 'coins': (980, 700, 1215, 830), 'coin': (838, 700, 942, 790),
    'star': (982, 812, 1050, 870),
    'swirl0': (8, 858, 142, 1012), 'swirl1': (138, 858, 302, 1012), 'swirl2': (298, 858, 452, 1012), 'swirl3': (448, 858, 612, 1012), 'swirl4': (608, 858, 762, 1012), 'ring': (758, 880, 922, 1012),
    'dust1': (905, 838, 1045, 922), 'dust2': (898, 918, 1052, 1012), 'dust3': (1118, 848, 1282, 1012), 'boom': (1278, 812, 1536, 1024),
}
SEMENTE = {'f_mini', 'f_love2', 'f_nuts', 'f_cyclops'}  # desenhadas uma por cima da outra na folha: só servem de semente pra divisa das vizinhas
for name, box in PIECES.items():
    if name not in SEMENTE and todo(name): piece(box, sep=0 if name.startswith(('eyes', 'swirl', 'dust', 'boom', 'coins', 'drop', 'spark', 'ring')) else 4).save(D + name + '.webp', quality=90)

# caras e pescoços: as orelhas passam da caixa e encostam na vizinha. Divide a parte de cima da folha pelo contorno
# (watershed, uma semente no miolo de cada peça) e cada cara leva tudo que é dela, orelha inteira.
SPLIT = [n for n in PIECES if n.startswith(('f_', 'neck', 'eyes', 'mouth', 'tongue', 'heart', 'drop'))]
if any(todo(n) for n in SPLIT if n.startswith('f_')) or not os.path.exists(D + '.split'):
    Y = 560
    alpha = sheet[:Y, :, 3]; fg = (alpha > 20).astype(np.uint8)
    mk = np.zeros((Y, sheet.shape[1]), np.int32); mk[alpha < 8] = 1
    k3 = np.ones((3, 3), np.uint8)
    for i, n in enumerate(SPLIT):
        x0, y0, x1, y1 = PIECES[n]; y1 = min(y1, Y)
        e = cv2.erode(fg[y0:y1, x0:x1], k3, iterations=4)
        nn, lab, st, _ = cv2.connectedComponentsWithStats(e)
        if nn < 2: continue
        core = cv2.erode((lab == 1 + st[1:, cv2.CC_STAT_AREA].argmax()).astype(np.uint8), k3, iterations=6)
        mk[y0:y1, x0:x1][core > 0] = i + 2
    ws = cv2.watershed(cv2.cvtColor(sheet[:Y, :, :3], cv2.COLOR_RGB2BGR), mk)
    for i, n in enumerate(SPLIT):
        if not n.startswith('f_') or n in SEMENTE: continue
        x0, y0, x1, y1 = PIECES[n]; P = 90
        bx0, by0, bx1, by1 = max(0, x0 - P), max(0, y0 - P), min(sheet.shape[1], x1 + P), min(Y, y1 + P)
        reg = (ws[by0:by1, bx0:bx1] == i + 2) | (ws[by0:by1, bx0:bx1] == -1)  # -1 = linha da divisa
        reg = cv2.morphologyEx(reg.astype(np.uint8), cv2.MORPH_OPEN, k3) * fg[by0:by1, bx0:bx1]
        # + o corpo do recorte da caixa (separado da vizinha por erosão): o contorno às vezes dá um chifre pra vizinha
        e = cv2.erode(fg[y0:y1, x0:x1], k3, iterations=4); nn, lab, st, _ = cv2.connectedComponentsWithStats(e)
        corpo = cv2.dilate((lab == 1 + st[1:, cv2.CC_STAT_AREA].argmax()).astype(np.uint8), k3, iterations=5) & fg[y0:y1, x0:x1]
        reg[y0 - by0:y1 - by0, x0 - bx0:x1 - bx0] |= corpo
        nn, lab, st, _ = cv2.connectedComponentsWithStats(reg)
        if nn > 1: reg = (lab == 1 + st[1:, cv2.CC_STAT_AREA].argmax()).astype(np.uint8)
        p = sheet[by0:by1, bx0:bx1].copy(); p[..., 3] = p[..., 3] * reg
        img = Image.fromarray(p, 'RGBA'); img.crop(img.getbbox()).save(D + n + '.webp', quality=90)
    open(D + '.split', 'w').close()

# ---------- cenário: girafa do tornado (some), girafas dos lados e o logo saem do fundo (IA), o fundo é retocado (LaMa) ----------
CAMADAS = {'hero': (255, 0, 912, 428), 'sideL': (0, 318, 300, 712), 'sideR': (818, 392, 1024, 712), 'logo': (195, 400, 840, 715)}
if any(todo(n) for n in ['sideL', 'sideR', 'logo', 'bg']):
    import onnxruntime as ort
    from rembg import remove, new_session
    sess = new_session('birefnet-general-lite')
    im = np.array(mock); mk = np.zeros(im.shape[:2], np.uint8)
    for name, (x0, y0, x1, y1) in CAMADAS.items():
        c = mock.crop((x0, y0, x1, y1)); c2 = c.resize((c.width * 2, c.height * 2), Image.LANCZOS)
        a = np.array(remove(c2, session=sess).resize(c.size, Image.LANCZOS))[..., 3]
        n, lab, st, _ = cv2.connectedComponentsWithStats((a > 30).astype(np.uint8))
        big = st[1:, cv2.CC_STAT_AREA].max()
        a = (a * np.isin(lab, [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] > big * .08])).astype(np.uint8)
        if name != 'hero': Image.fromarray(np.dstack([np.array(c), a]), 'RGBA').save(D + name + '.webp', quality=92)  # a do tornado só vira máscara
        if name != 'logo': mk[y0:y1, x0:x1] |= (a > 20)  # o logo só cresce no lugar: não precisa tirar do fundo
    mk[0:425, 264:600] = 1; mk[315:420, 580:810] = 1  # o pescoço-tornado sai junto (a girafa do topo agora é outra, de frente, montada no jogo)
    mk = cv2.dilate(mk, np.ones((15, 15), np.uint8))
    lama = ort.InferenceSession(os.path.expanduser('~/.cache/lama/lama_fp32.onnx'))
    for wx0, wy0, wx1, wy1 in [(0, 250, 380, 730), (700, 330, 1024, 730), (240, 0, 940, 560)]:  # topo por último (cobre a sobra das outras)
        win, wm = im[wy0:wy1, wx0:wx1].copy(), mk[wy0:wy1, wx0:wx1]
        x = cv2.resize(win, (512, 512), interpolation=cv2.INTER_AREA).transpose(2, 0, 1)[None].astype(np.float32) / 255
        mm = (cv2.resize(wm, (512, 512), interpolation=cv2.INTER_NEAREST) > 0)[None, None].astype(np.float32)
        out = lama.run(None, {'image': x, 'mask': mm})[0][0].transpose(1, 2, 0)
        out = cv2.resize(np.clip(out, 0, 255).astype(np.uint8), (wx1 - wx0, wy1 - wy0), interpolation=cv2.INTER_CUBIC)
        k = cv2.GaussianBlur((wm > 0).astype(np.float32), (21, 21), 0)[..., None]
        im[wy0:wy1, wx0:wx1] = (out * k + win * (1 - k)).astype(np.uint8)
    Image.fromarray(im).save(D + 'bg.webp', quality=88)

# miolo do botão girar (gira junto com o rolo)
if todo('spinface'):
    from PIL import ImageDraw
    c = mock.crop((430, 1235, 594, 1399)).convert('RGBA'); m = Image.new('L', c.size, 0)
    ImageDraw.Draw(m).ellipse((4, 4, 160, 160), fill=255); c.putalpha(m); c.save(D + 'spinface.webp', quality=90)
# card do lobby (400x320)
if not os.path.exists('assets/card_grid_girafa.png'):
    mock.crop((180, 96, 900, 672)).resize((400, 320), Image.LANCZOS).save('assets/card_grid_girafa.png')
