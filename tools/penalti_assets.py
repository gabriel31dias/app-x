# Gera a arte do "Pênalti na Várzea" a partir de assets/penalti/fundo.png (tela 941x1672 com a interface desenhada)
# e sheet.png (peças já com fundo transparente, então o recorte é pelo alfa; só a torcida do cenário usa IA).
# Uso: uv run --with rembg --with onnxruntime --with opencv-python-headless --with pillow --with numpy python tools/penalti_assets.py
import os, json
import numpy as np, cv2
from PIL import Image
D = 'assets/penalti/'
todo = lambda name: not os.path.exists(D + name + '.webp')  # só refaz o que falta; apague o arquivo pra refazer
sheet = Image.open(D + 'sheet.png').convert('RGBA')
fundo = Image.open(D + 'fundo.png').convert('RGB')

def cut(box, keep_largest=True):
    """recorte pelo alfa da folha; keep_largest descarta pedaços dos quadros vizinhos (e a bola solta)"""
    r = np.array(sheet.crop(box))
    if keep_largest:
        n, lab, st, _ = cv2.connectedComponentsWithStats((r[..., 3] > 40).astype(np.uint8))
        if n > 1:
            big = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
            r[..., 3] = r[..., 3] * cv2.dilate((lab == big).astype(np.uint8), np.ones((5, 5), np.uint8))
    img = Image.fromarray(r, 'RGBA')
    return img.crop(img.getbbox())

def strip(frames, name, h):
    """tira horizontal de quadros do mesmo tamanho (centralizados, base alinhada) pra animar por background-position"""
    k = h / max(f.height for f in frames)
    fr = [f.resize((round(f.width * k), round(f.height * k)), Image.LANCZOS) for f in frames]
    w = max(f.width for f in fr)
    out = Image.new('RGBA', (w * len(fr), h))
    for i, f in enumerate(fr): out.alpha_composite(f, (i * w + (w - f.width) // 2, h - f.height))
    out.save(D + name + '.webp', quality=90)

def row(name, splits, y0, y1, h, **kw):
    if todo(name): strip([cut((a, y0, b, y1), **kw) for a, b in zip(splits, splits[1:])], name, h)

# ---------- personagens (divisas = colunas mais vazias entre um quadro e outro) ----------
row('kick', [0, 168, 313, 435, 567, 691, 823, 978, 1135, 1270, 1390, 1536], 0, 236, 300)  # de costas: corrida e chute
row('celeb', [20, 161, 291, 402, 540, 662, 779], 236, 445, 300)  # de frente pulando
row('slide', [779, 967], 236, 445, 260)  # comemoração de joelho
row('fallen', [966, 1258], 245, 442, 220)  # caído no chão (errou): só o que está sozinho (o da direita vem com outro por cima)
row('gk', [0, 182, 343, 524, 645], 436, 605, 260)  # goleiro esperando / se preparando
row('gkdive', [645, 915], 436, 605, 240)  # voo pro lado (espelha no CSS pro outro)
row('gksave', [1071, 1222, 1378, 1536], 436, 605, 240)  # defesa no meio, caído, deslizando

# ---------- bola e efeitos ----------
for name, box in {'ball': (5, 605, 104, 730), 'blur1': (206, 605, 334, 730), 'blur2': (334, 605, 473, 730), 'blur3': (473, 605, 597, 730),
                  'fireball': (597, 605, 735, 730), 'glowY': (735, 605, 876, 730), 'glowG': (876, 605, 1019, 730), 'glowR': (1019, 605, 1153, 730),
                  'comet': (1153, 605, 1265, 730), 'dirt': (1380, 605, 1536, 730), 'gol': (5, 876, 320, 1020), 'perdeu': (322, 880, 518, 1020),
                  'dust1': (519, 885, 676, 978), 'dust2': (676, 885, 822, 978), 'spark': (822, 872, 956, 992)}.items():
    if todo(name): cut(box, keep_largest=name not in ('gol', 'dirt')).save(D + name + '.webp', quality=90)

# ---------- cenário ----------
# A IA não separa bem o logo nem a torcida desse desenho, então os dois ficam no fundo:
# - logo: só a máscara (pro brilho passar por cima) e a bola recortada em círculo (gira no lugar, sem buraco)
# - torcida: o jogo anima faixas do próprio fundo (crowd.webp) esticando pra cima a partir da trave
LOGO = (190, 18, 780, 345)
BOLA = (712, 198, 47)  # centro e raio da bola do logo
VALOR = [(66, 388, 264, 462), (644, 386, 898, 462)]  # "R$ 2,00" e "R$ 4,00 2X" desenhados: o jogo escreve por cima

def rembg_alpha(box, model):
    import onnxruntime as ort
    so = ort.SessionOptions  # sem o cache de memória do onnxruntime (estoura a RAM)
    def _so():
        o = so(); o.enable_cpu_mem_arena = False; o.enable_mem_pattern = False; return o
    ort.SessionOptions = _so
    from rembg import remove, new_session
    c = fundo.crop(box); c2 = c.resize((c.width * 2, c.height * 2), Image.LANCZOS)
    return np.array(remove(c2, session=new_session(model)).resize(c.size, Image.LANCZOS))[..., 3]

if todo('logomask'):
    a = np.maximum(rembg_alpha(LOGO, 'isnet-general-use'), rembg_alpha(LOGO, 'birefnet-general-lite'))
    hsv = cv2.cvtColor(np.array(fundo.crop(LOGO)), cv2.COLOR_RGB2HSV)
    verde = (hsv[..., 0] >= 35) & (hsv[..., 0] <= 85) & (hsv[..., 1] > 150) & (hsv[..., 2] > 150)  # letras de VÁRZEA
    verde[:170] = False
    a = np.maximum(a, cv2.dilate(verde.astype(np.uint8) * 255, np.ones((5, 5), np.uint8)))
    a = cv2.morphologyEx(a, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
    Image.fromarray(np.dstack([np.full(a.shape + (3,), 255, np.uint8), a]), 'RGBA').save(D + 'logomask.webp', quality=85)
if todo('logoball'):
    x, y, r = BOLA
    c = np.array(fundo.crop((x - r, y - r, x + r, y + r)).convert('RGBA'))
    yy, xx = np.mgrid[:2 * r, :2 * r]
    c[..., 3] = (np.clip(r - np.hypot(xx - r + .5, yy - r + .5), 0, 1) * 255).astype(np.uint8)
    Image.fromarray(c, 'RGBA').save(D + 'logoball.webp', quality=90)
if todo('bg'):
    im = np.array(fundo)
    for x0, y0, x1, y1 in VALOR:  # apaga o valor com a cor escura da placa (mediana dos pixels escuros da área)
        sub = im[y0:y1, x0:x1]; dark = sub[sub.sum(-1) < 120]
        cor = np.median(dark, 0) if len(dark) else np.array([10, 20, 14])
        blk = np.zeros_like(sub, dtype=np.float32); blk[:] = cor
        m = np.zeros(sub.shape[:2], np.float32); cv2.rectangle(m, (3, 3), (sub.shape[1] - 4, sub.shape[0] - 4), 1, -1)
        m = cv2.GaussianBlur(m, (7, 7), 0)[..., None]
        im[y0:y1, x0:x1] = (sub * (1 - m) + blk * m).astype(np.uint8)
    Image.fromarray(im).save(D + 'bg.webp', quality=88)
if todo('crowd'):
    fundo.crop((0, 430, 941, 604)).save(D + 'crowd.webp', quality=90)

# botões ESQUERDA / MEIO / DIREITA do cenário: recortes retos (afundam ao tocar)
for name, box in {'btnL': (28, 1394, 318, 1614), 'btnM': (340, 1394, 615, 1614), 'btnR': (632, 1394, 916, 1614)}.items():
    if todo(name): fundo.crop(box).save(D + name + '.webp', quality=90)

# card do lobby (400x320): logo sobre o gol e a torcida
if not os.path.exists('assets/card_grid_penalti.png'):
    c = fundo.crop((0, 110, 941, 862)).resize((400, 320), Image.LANCZOS)
    c.save('assets/card_grid_penalti.png', optimize=True)

SPR = {}
for n in ['kick', 'celeb', 'slide', 'fallen', 'gk', 'gkdive', 'gksave']:
    w, h = Image.open(D + n + '.webp').size
    k = {'kick': 11, 'celeb': 6, 'slide': 1, 'fallen': 1, 'gk': 4, 'gkdive': 1, 'gksave': 3}[n]
    SPR[n] = [k, w // k, h]
print('SPR', json.dumps(SPR))
