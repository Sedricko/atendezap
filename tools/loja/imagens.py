# Gera as imagens da Chrome Web Store em docs/loja/ a partir dos prints do teste de ponta a ponta (página SIMULADA, sem dados reais).
# Uso:  python3 tools/loja/imagens.py <pasta_dos_prints_do_smoke>
import os, sys
from PIL import Image, ImageDraw, ImageFont
P, OUT = sys.argv[1], 'docs/loja'
os.makedirs(OUT, exist_ok=True)
F = lambda n, b=False: ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf' % ('-Bold' if b else ''), n)
FUNDO, CLARO = (11, 95, 85), (233, 237, 239)
TELAS = [('b-respostas.png', 'Respostas rápidas', 'Textos, mídias e ações prontos,\norganizados por categoria.\nDigite /atalho na conversa.'),
         ('rb-atendente.png', 'Atendente IA', 'Sugere respostas com a sua chave\ndo Gemini. Nasce em "só sugerir":\nvocê aprova antes de enviar.'),
         ('u-fila.png', 'Aguardando resposta', 'Veja quem está esperando você\nresponder e há quanto tempo.'),
         ('x-pedidos-previa.png', 'Pedidos de grupos', 'Aprove de uma vez os pedidos para\nentrar nos seus grupos, sem\nduplicar pessoas.'),
         ('c-novo-menu.png', 'Monte suas respostas', 'Mensagem, imagem, áudio, contato,\netiquetas e temporizadores\nnuma resposta só.')]
def base(w, h):
    im = Image.new('RGB', (w, h), FUNDO); d = ImageDraw.Draw(im)
    d.ellipse((w - h * 0.55, -h * 0.35, w + h * 0.45, h * 0.65), fill=(14, 108, 97))
    return im, d
for i, (f, tit, sub) in enumerate(TELAS, 1):
    im, d = base(1280, 800)
    painel = Image.open(os.path.join(P, f)).crop((980, 0, 1400, 860)).resize((372, 762))
    im.paste(painel, (1280 - 372 - 90, 19))
    d.text((90, 280), 'AtendeZap', font=F(30, True), fill=(140, 220, 200))
    d.text((90, 330), tit, font=F(52, True), fill='white')
    d.multiline_text((90, 420), sub, font=F(30), fill=CLARO, spacing=12)
    im.save(f'{OUT}/captura{i}.png')
ic = Image.open('icons/icon128.png').convert('RGBA')
im, d = base(440, 280); im.paste(ic.resize((96, 96)), (32, 92), ic.resize((96, 96)))
d.text((146, 100), 'AtendeZap', font=F(34, True), fill='white')
d.multiline_text((148, 148), 'Atendimento rápido\nno WhatsApp Web', font=F(19), fill=CLARO, spacing=6)
im.save(f'{OUT}/bloco-pequeno-440x280.png')
print('ok:', sorted(os.listdir(OUT)))
