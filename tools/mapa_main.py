# Regenera docs/ARQUITETURA.md a partir de content/main.js e test/smoke.py. Uso (na pasta do projeto):  python3 tools/mapa_main.py
import re,collections
s=open('content/main.js',encoding='utf-8').read().split('\n')
sec=[]; fn=[]
for i,l in enumerate(s,1):
    m=re.match(r"  // ----- (.+?) -----",l)
    if m: sec.append((i,m.group(1)[:90]))
    m=re.match(r"  (?:async )?function (\w+)\(",l) or re.match(r"  const (\w+) = (?:async )?\(",l)
    if m: fn.append((i,m.group(1)))
out=['# Mapa do content/main.js (gerado por tools/mapa_main.py)','',f'`content/main.js` tem {len(s)} linhas e é UM bloco só (tudo depende das mesmas variáveis: `S`, `h`, `call`, `toast`, `renderPanel`). Não foi dividido de propósito: dividir sem poder testar no WhatsApp de verdade tem risco alto e valor baixo. Os marcadores `// ----- … -----` são irregulares (o primeiro cobre muita coisa): use também a busca por nome da função.','','## Por seção','']
for k,(i,n) in enumerate(sec):
    fim=sec[k+1][0]-1 if k+1<len(sec) else len(s)
    nomes=[f for l,f in fn if i<=l<=fim]
    out.append(f'- **{n}** — linhas {i}–{fim}'+(f': `{"`, `".join(nomes[:14])}`'+(' …' if len(nomes)>14 else '') if nomes else ''))
out+=['','## Onde mexer para…','',
 '- **Adicionar uma aba/função nova:** `SECTIONS`, `HUBS`, `HUB_DE`, `MODULOS` (4º item `\'teste\'` = 🧪), o objeto `body` em `renderPanel`, `MOD_ICONE`; `lib/acesso.js` (MODULOS, mesma ordem que em main.js); `planilha/AdminControle.gs` (`ADM_RECURSOS`, `ADM_GRUPOS`, exemplos); contagens em test/util.test.js e test/admin.test.js.',
 '- **Falar com o WhatsApp:** `page/bridge.js` (métodos em `api`; os que apagam, leem conversas ou enviam entram em `SENSIVEIS`); no painel use `call(\'metodo\', ...)`.',
 '- **Regra pura (sem tela):** crie/edite em `lib/*.js` e teste em `test/util.test.js`.',
 '- **Guardar dado:** `KEYS` + valor padrão (início do arquivo) e `save(\'chave\')`.','',
 '## Bibliotecas puras (lib/)','','`acesso` (liberação por perfil) · `recuperar` (mensagens apagadas) · `zip` e `exportar` (exportar conversa) · `aparelho` (aparelho do contato) · `treino` (escuta, refinamento, aprovação com prova) · `avaliar` (avaliação sem IA) · `resumo` (resumo do que perdi) · `ligacao` (resposta a ligações) · `iaerro` · `wrapalvos`.','',
 '## Prefixos de teste já usados em test/smoke.py (antes de criar um novo, confira)','']
t=open('test/smoke.py',encoding='utf-8').read()
c=collections.Counter(re.findall(r"'([a-z]{1,4})_\w+'\s*:\s*lambda",t))
out.append(', '.join(f'`{p}_` ({n})' for p,n in sorted(c.items())))
open('docs/ARQUITETURA.md','w',encoding='utf-8').write('\n'.join(out)+'\n'); print('docs/ARQUITETURA.md:',len(sec),'seções,',len(fn),'funções')
