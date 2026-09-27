# Gera a arte do "Perereca Suicida" a partir de assets/perereca/mockup.png (tela) e sheet.png (peças).
# Uso: python tools/perereca_assets.py  (precisa de pillow, numpy, opencv e rembg)
import numpy as np, cv2
from PIL import Image
D = 'assets/perereca/'

# ---------- fundo: rolos vazios + sem o valor da aposta ----------
im = cv2.imread(D + 'mockup.png').astype(np.float32)

def interp(x0, x1, y0, y1):
    a, b = im[y0:y1, x0 - 1], im[y0:y1, x1]
    t = np.linspace(0, 1, x1 - x0)[None, :, None]
    im[y0:y1, x0:x1] = a[:, None] * (1 - t) + b[:, None] * t

# colunas escuras alternadas (verde-escuro / quase preto), com brilho no meio, como na arte
COLS = [(54, 243), (247, 423), (427, 610), (614, 795), (799, 981)]
Y0, Y1 = 708, 1198
for i, (x0, x1) in enumerate(COLS):
    base = np.array([28, 38, 18] if i % 2 == 0 else [20, 26, 14], np.float32)  # BGR
    h, w = Y1 - Y0, x1 - x0
    yy, xx = np.mgrid[0:h, 0:w]
    glow = 1.25 - .5 * np.hypot((xx - w / 2) / (w / 2), (yy - h / 2) / (h / 1.2)).clip(0, 1)
    im[Y0:Y1, x0:x1] = base * glow[..., None]
interp(186, 322, 1312, 1360)  # "R$ 1,00"
cv2.imwrite(D + 'bg.webp', np.clip(im, 0, 255).astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 90])

# ---------- peças da folha (recorte com IA: rembg birefnet) ----------
from rembg import remove, new_session
sheet = Image.open(D + 'sheet.png').convert('RGB')
mock = Image.open(D + 'mockup.png').convert('RGB')
sess = new_session('birefnet-general-lite')
import os
todo = lambda name: not os.path.exists(D + name + '.webp')  # IA é lenta (CPU): só refaz o que falta; apague o arquivo pra refazer

def cut(src, box, keep_largest=True, trim=True):
    """recorta com fundo transparente (2x pra IA enxergar melhor) e apara as bordas vazias"""
    c = src.crop(box); c = c.resize((c.width * 2, c.height * 2), Image.LANCZOS)
    r = np.array(remove(c, session=sess))
    if keep_largest:  # só o maior pedaço: descarta pedaços dos vizinhos que entraram na caixa
        n, lab, st, _ = cv2.connectedComponentsWithStats((r[..., 3] > 40).astype(np.uint8))
        if n > 1:
            big = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
            keep = cv2.dilate((lab == big).astype(np.uint8), np.ones((9, 9), np.uint8))
            r[..., 3] = r[..., 3] * keep
    img = Image.fromarray(r, 'RGBA')
    return img.crop(img.getbbox()) if trim else img.resize((img.width // 2, img.height // 2), Image.LANCZOS)

def strip(frames, name, h):
    """tira horizontal de quadros do mesmo tamanho (base alinhada, centralizados) pra CSS steps()"""
    fr = [f.resize((round(f.width * h / max(g.height for g in frames)), round(f.height * h / max(g.height for g in frames))), Image.LANCZOS) for f in frames]
    w = max(f.width for f in fr)
    out = Image.new('RGBA', (w * len(fr), h))
    for i, f in enumerate(fr): out.alpha_composite(f, (i * w + (w - f.width) // 2, h - f.height))
    out.save(D + name + '.webp', quality=88)
    print(name, len(fr), 'quadros de', w, 'x', h)

# símbolos (quadrados, 256px)
def symbol(img, name, size=256):
    s = size / max(img.size); img = img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)
    out = Image.new('RGBA', (size, size)); out.alpha_composite(img, ((size - img.width) // 2, (size - img.height) // 2))
    out.save(D + 's_' + name + '.webp', quality=90)

FACE_X = [70, 185, 302, 430, 548, 657, 775, 905, 1042, 1172, 1305]
if todo('faces'):
    faces = [cut(sheet, (x - 70, 492, x + 72, 622)) for x in FACE_X]
    for name, i in [('wild', 10), ('dinheiro', 5), ('coracao', 4), ('estrela', 6)]: symbol(faces[i], name)
    strip(faces, 'faces', 200)  # expressões: animação do wild ganhando
for name, box in [('folha', (15, 722, 175, 862)), ('lotus', (165, 722, 305, 862)), ('coroa', (300, 722, 458, 862)),
                  ('A', (468, 722, 606, 862)), ('K', (598, 722, 727, 862)), ('Q', (718, 722, 852, 862)),
                  ('J', (843, 722, 962, 862)), ('10', (952, 722, 1092, 862))]:
    if todo('s_' + name): symbol(cut(sheet, box), name)

JUMP_X = [85, 255, 425, 575, 725, 880, 1025, 1180, 1330, 1458]
if todo('jump'): strip([cut(sheet, (x - 85, 378, x + 85, 508)) for x in JUMP_X], 'jump', 220)
IDLE_X = [95, 260, 425, 580, 730, 880, 1030, 1180, 1320, 1460]
if todo('idle'): strip([cut(sheet, (x - 82, 280, x + 78, 395)) for x in IDLE_X], 'idle', 180)
if todo('splash'): strip([cut(sheet, b, False) for b in [(10, 622, 162, 726), (160, 622, 307, 726), (305, 622, 452, 726), (448, 622, 592, 726), (583, 622, 722, 726)]], 'splash', 180)
if todo('coroa_gira'): strip([cut(sheet, (x - 58, 622, x + 58, 722)) for x in [798, 910, 1022, 1135, 1250]], 'coroa_gira', 180)
# perereca grande da tela: recortada do próprio mockup pra encaixar exatamente em cima da pintada
if todo('big'):
    big = cut(mock, (60, 360, 912, 706), trim=False)  # sem aparar: ocupa exatamente x 60-912, y 360-706 da tela
    big.save(D + 'big.webp', quality=90)

# ---------- pernas separadas (pra animar): recorta do big.webp; big_body.webp = corpo sem elas ----------
# coordenadas da arte (a .big começa em 60,360). 'cut' = área que vira peça; 'hole' = o que sai do corpo
# (menor que 'cut': a faixa que sobra no corpo cobre a emenda quando a peça gira)
LEGS = {
    'leg_back':   dict(cut=[(60, 500), (245, 500), (275, 540), (302, 560), (302, 706), (60, 706)],
                       hole=[(60, 500), (245, 500), (275, 540), (302, 560), (302, 706), (60, 706)]),  # = cut: a emenda do quadril fica coberta pelo bumbum
    # bumbum (rebolada): gira em torno da junção com a barriga; o corpo fica com uma faixa em baixo pra cobrir a emenda
    'rump':       dict(cut=[(266, 480), (298, 430), (360, 418), (440, 428), (482, 452), (507, 500), (512, 560), (498, 612), (440, 634), (360, 634), (300, 624), (264, 592)],
                       hole=[(266, 480), (298, 430), (360, 418), (440, 428), (482, 452), (507, 500), (510, 560), (492, 600), (440, 618), (360, 618), (300, 610), (264, 588)]),
    'leg_front1': dict(cut=[(285, 638), (428, 638), (428, 706), (285, 706)],
                       hole=[(285, 652), (428, 652), (428, 706), (285, 706)]),
    'leg_front2': dict(cut=[(498, 638), (628, 638), (628, 706), (498, 706)],
                       hole=[(498, 652), (628, 652), (628, 706), (498, 706)]),
}
full = np.array(Image.open(D + 'big.webp').convert('RGBA'))
body = full.copy()
bgimg = cv2.imread(D + 'bg.webp')
paint_mask = np.zeros(bgimg.shape[:2], np.uint8)
for name, g in LEGS.items():
    poly = lambda pts: np.array([(x - 60, y - 360) for x, y in pts], np.int32)
    m = np.zeros(full.shape[:2], np.uint8); cv2.fillPoly(m, [poly(g['cut'])], 255)
    # bumbum e perna de trás rebolam: a borda do corte some aos poucos (senão o canto reto espeta pra fora
    # da silhueta ao girar) e o corpo guarda uma faixa parada por cima dessa borda (hole encolhido)
    twerk = name in ('rump', 'leg_back')
    if twerk:
        soft = cv2.GaussianBlur(cv2.erode(m, np.ones((13, 13), np.uint8)), (0, 0), 5)
        if name == 'leg_back': cv2.fillPoly(soft, [poly(LEGS['rump']['cut'])], 0); m = np.maximum(soft, m & cv2.fillPoly(np.zeros_like(m), [poly(LEGS['rump']['cut'])], 255))  # colada no bumbum fica dura: os dois giram juntos
        else: m = soft
    if name == 'rump':  # a coxa é só da perna (senão sobra um pedaço quando ela chuta); 3px de sobra por cima da perna pra não abrir risco na emenda
        m[cv2.erode(cv2.fillPoly(np.zeros_like(m), [poly(LEGS['leg_back']['cut'])], 255), np.ones((7, 7), np.uint8)) > 0] = 0
    piece = full.copy(); piece[..., 3] = (piece[..., 3].astype(np.uint16) * m // 255).astype(np.uint8)
    Image.fromarray(piece, 'RGBA').save(D + name + '.webp', quality=90)
    h = np.zeros(full.shape[:2], np.uint8); cv2.fillPoly(h, [poly(g['hole'])], 255)
    if twerk: h = cv2.erode(h, np.ones((41, 41), np.uint8))
    h = cv2.GaussianBlur(h, (0, 0), 1.5)
    body[..., 3] = (body[..., 3].astype(np.uint16) * (255 - h) // 255).astype(np.uint8)
    # a perna pintada no fundo também sai (senão aparece dobrada quando a peça mexe)
    leg_alpha = (piece[..., 3] > 20).astype(np.uint8) * 255
    paint_mask[360:706, 60:912] |= leg_alpha
Image.fromarray(body, 'RGBA').save(D + 'big_body.webp', quality=90)
# apaga a perereca pintada inteira: assim o preenchimento puxa água/folhas, não o rosa do corpo
# (as camadas cobrem tudo; só aparece nas beiradas quando uma parte se mexe)
paint_mask[360:706, 60:912] |= (full[..., 3] > 20).astype(np.uint8) * 255
paint_mask = cv2.dilate(paint_mask, np.ones((25, 25), np.uint8))
bgimg = cv2.inpaint(bgimg, paint_mask, 12, cv2.INPAINT_TELEA)
cv2.imwrite(D + 'bg.webp', bgimg, [cv2.IMWRITE_WEBP_QUALITY, 90])
