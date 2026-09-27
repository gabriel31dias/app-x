# Gera assets/capivara/bg.webp a partir do mockup: casas vazias, sem números e sem a capivara
# pintada (a capivara animada do sprites/capy-logo.png vai por cima). Uso: python tools/capivara_assets.py
import cv2, numpy as np
D = 'assets/capivara/'
im = cv2.imread(D + 'mockup.png').astype(np.float32)

def interp(x0, x1, y0, y1):
    """preenche [x0,x1) x [y0,y1) interpolando entre a coluna x0-1 e a coluna x1"""
    a, b = im[y0:y1, x0 - 1], im[y0:y1, x1]
    t = np.linspace(0, 1, x1 - x0)[None, :, None]
    im[y0:y1, x0:x1] = a[:, None] * (1 - t) + b[:, None] * t

for x0, x1 in [(195, 400), (410, 615), (625, 832)]:
    for y0, y1 in [(537, 697), (707, 865), (875, 1033)]:
        interp(x0 + 14, x1 - 14, y0 + 12, y1 - 12)
interp(240, 420, 1152, 1210)  # saldo
interp(705, 890, 1152, 1210)  # ganho
interp(165, 285, 1330, 1398)  # aposta

# capivara pintada: cada linha vira um degradê entre as bordas (verde da floresta) + desfoque
# (o fundo da floresta já é desfocado, então não aparece como borrão)
m = np.zeros(im.shape[:2], np.uint8)
cv2.ellipse(m, (522, 165), (200, 150), 0, 0, 360, 255, -1)
m[150:306, 335:712] = 255
fill = im.copy()
for y in range(m.shape[0]):
    xs = np.where(m[y])[0]
    if len(xs):
        x0, x1 = xs[0], xs[-1] + 1
        t = np.linspace(0, 1, x1 - x0)[:, None]
        fill[y, x0:x1] = im[y, x0 - 3] * (1 - t) + im[y, x1 + 2] * t
fill = cv2.GaussianBlur(fill, (0, 0), 22) * .8  # escurece: o meio da floresta é mais fundo
a = cv2.GaussianBlur(m.astype(np.float32) / 255, (0, 0), 16)[..., None]
im = im * (1 - a) + fill * a

cv2.imwrite(D + 'bg.webp', np.clip(im, 0, 255).astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 90])
