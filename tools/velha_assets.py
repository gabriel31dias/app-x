# Gera a arte do Jogo da Velha a partir do mockup: fundo sem peças/textos + peças X/O recortadas.
# Uso: python tools/velha_assets.py  (precisa de pillow + numpy)
import numpy as np
from PIL import Image
D = 'assets/velha/'
src = np.array(Image.open(D + 'mockup.png').convert('RGB')).astype(np.float32)
im = src.copy()

def interp(x0, x1, y0, y1):
    """preenche [x0,x1) x [y0,y1) interpolando entre a coluna x0-1 e a coluna x1 (sem borrar)"""
    a, b = im[y0:y1, x0 - 1], im[y0:y1, x1]
    t = np.linspace(0, 1, x1 - x0)[None, :, None]
    im[y0:y1, x0:x1] = a[:, None] * (1 - t) + b[:, None] * t

def paste(dst, part):
    x0, y0, x1, y1 = dst
    im[y0:y1, x0:x1] = np.array(Image.fromarray(part.astype(np.uint8)).resize((x1 - x0, y1 - y0), Image.LANCZOS))

# casas do tabuleiro (x0,y0,x1,y1) por linha; a casa vazia do meio de baixo vira o fundo de todas
CELLS = [[(180, 490, 366, 652), (376, 490, 566, 652), (576, 490, 764, 652)],
         [(168, 662, 364, 838), (374, 662, 570, 838), (580, 662, 776, 838)],
         [(158, 848, 362, 1030), (370, 848, 574, 1030), (584, 848, 788, 1030)]]
crop = lambda b: src[b[1]:b[3], b[0]:b[2]]
empty = crop(CELLS[2][1])

def piece(box, name):
    c = crop(box)
    e = np.array(Image.fromarray(empty.astype(np.uint8)).resize((c.shape[1], c.shape[0]), Image.LANCZOS)).astype(np.float32)
    d = np.abs(c - e).max(2)
    alpha = np.clip((d - 30) / 70, 0, 1) * 255
    alpha[:12], alpha[-12:], alpha[:, :12], alpha[:, -12:] = 0, 0, 0, 0  # sem o fio da borda da casa
    Image.fromarray(np.dstack([c, alpha]).astype(np.uint8), 'RGBA').save(D + name + '.webp', quality=90)
piece(CELLS[1][1], 'x')
piece(CELLS[0][1], 'o')

for row in CELLS:
    for b in row:
        if b != CELLS[2][1]: paste(b, empty)

interp(163, 352, 312, 404)   # nome/saldo jogador 1
interp(660, 828, 312, 404)   # nome/saldo jogador 2
interp(506, 654, 304, 424)   # foto do jogador 2 (vira o Computador)
interp(160, 480, 1100, 1168) # "SUA VEZ"
interp(524, 800, 1100, 1166) # relógio
interp(285, 662, 1242, 1300) # valor da aposta
interp(395, 548, 1534, 1584) # valor no JOGAR
interp(740, 868, 1560, 1592) # valor no JOGAR CONTRA
# fichas: apaga o número de uma ficha escura e cola nas 5 posições
CHIPS = [(165, 1315, 275, 1385), (290, 1315, 400, 1385), (415, 1315, 525, 1385), (540, 1315, 650, 1385), (668, 1315, 780, 1385)]
interp(430, 512, 1325, 1377)
chip = crop(CHIPS[2]) * 0 + im[1315:1385, 415:525]
for b in CHIPS: paste(b, chip)

Image.fromarray(np.clip(im, 0, 255).astype(np.uint8)).save(D + 'bg.webp', quality=90)
