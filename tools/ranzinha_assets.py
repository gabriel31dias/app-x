# Gera a "ranzinha espiando" do site a partir de assets/ranzinha/sheet.png.
# Uso: python tools/ranzinha_assets.py  (precisa de pillow, numpy, opencv e rembg)
import json
import numpy as np, cv2
from PIL import Image
import onnxruntime as ort
# sem o cache de memória do onnxruntime: com ele cada recorte segura ~7 GB e a máquina mata o processo no meio
_SO = ort.SessionOptions
def _so():
    o = _SO(); o.enable_cpu_mem_arena = False; o.enable_mem_pattern = False; return o
ort.SessionOptions = _so
from rembg import remove, new_session
D = 'assets/ranzinha/'
sess = new_session('birefnet-general-lite')
sheet = Image.open(D + 'sheet.png').convert('RGB')

def cut(box, keep_largest=True):
    """recorte com fundo transparente no tamanho exato da caixa (2x pra IA enxergar melhor)"""
    c = sheet.crop(box); c2 = c.resize((c.width * 2, c.height * 2), Image.LANCZOS)
    r = np.array(remove(c2, session=sess)); r[..., :3] = np.array(c2)
    if keep_largest:
        n, lab, st, _ = cv2.connectedComponentsWithStats((r[..., 3] > 40).astype(np.uint8))
        if n > 1:
            big = 1 + np.argmax(st[1:, cv2.CC_STAT_AREA])
            r[..., 3] = r[..., 3] * cv2.dilate((lab == big).astype(np.uint8), np.ones((9, 9), np.uint8))
    return Image.fromarray(r, 'RGBA').resize(c.size, Image.LANCZOS)

# 1ª fileira: ela sai de trás do poste. Cada caixa começa logo depois do poste, então no site ela sai de trás da
# borda da tela. Mesmo y em todas: o olho fica na mesma altura de um quadro pro outro. O 7º é o susto (com o "!").
Y0, Y1 = 8, 244
PEEK = [(66, 160), (226, 330), (411, 536), (611, 740), (827, 986), (1057, 1236), (1301, 1530)]
frames = [cut((x0, Y0, x1, Y1), keep_largest=i < 6) for i, (x0, x1) in enumerate(PEEK)]
fw, fh = max(f.width for f in frames), Y1 - Y0
out = Image.new('RGBA', (fw * len(frames), fh))
for i, f in enumerate(frames): out.alpha_composite(f, (i * fw, 0))  # encostado à esquerda (= borda da tela)
out.save(D + 'peek.webp', quality=88)
print('SPR', json.dumps({'peek': [len(frames), fw, fh]}))
