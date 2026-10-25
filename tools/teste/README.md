# Como testar o AtendeZap (scripts que antes ficavam soltos em /tmp)

Rode tudo a partir de `/home/claude/work/atendezap`. O navegador de teste é o Chromium do Playwright (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`).

## Testes rápidos (segundos) — rode SEMPRE antes de empacotar
```
node test/util.test.js        # regras puras (lib/*.js), contratos painel x planilha, trava de funções do main.js
node test/admin.test.js       # script do Painel Administrador (AdminControle.gs) com simulador fiel ao Google
node test/planilha.test.js    # script da planilha de frete (AtendeZap.gs)
```

## Teste de ponta a ponta COMPLETO (~20 min): `test/smoke.py`
O teste é longo e escreve a saída só no FIM. Rode desacoplado e espere em chamadas de no máximo 300 s:
```
rm -rf /home/claude/work/smoke_d && cp -r . /home/claude/work/smoke_d && rm -f /home/claude/out64.txt
(setsid nohup tools/teste/roda_smoke_completo.sh > /dev/null 2>&1 < /dev/null &)
# ... espere ... e então:   tail -c 200 /home/claude/out64.txt     (termina com "FIM saída=0" e "_regressoes": [])
```
- Arquivo de saída VAZIO e sem processo = rodada INTERROMPIDA (não aprovada): refaça.
- Resultado = JSON com `errors` (erros de console) e `_regressoes` (expectativas que falharam). Aprovado = os dois vazios e `FIM saída=0`.

## Teste reduzido (~5 a 9 min): só os blocos novos
`mk_reduzido.py <marcador-inicial> <prefixos> <saida.py> [marcador-final]` gera uma cópia do smoke só com as verificações cujas chaves começam pelos prefixos.
```
python3 tools/teste/mk_reduzido.py "# v1.34: Acesso da equipe" "ct_,es_,rsu_,av_,tm_,lg_" test/smoke_acesso.py "# limite diário e chave ausente"
rm -rf /home/claude/work/smoke_e && cp -r . /home/claude/work/smoke_e && rm -f test/smoke_acesso.py /home/claude/out65.txt
(setsid nohup tools/teste/roda_red.sh > /dev/null 2>&1 < /dev/null &)
```
**APAGUE `test/smoke_acesso.py` antes de empacotar.**

## Armadilhas que já custaram caro
- **Prefixo de chave de teste:** antes de criar `xx_nome`, confira `grep -o "'xx_[a-z_]*'" test/smoke.py`. Colidiram `rc_` e `rs_` com testes antigos e quebraram o montador reduzido. Livres/em uso hoje: ver o fim de docs/ARQUITETURA.md.
- **`pkill -f` com texto que aparece no próprio comando mata o seu shell** (retorno -1 sem saída). Use `pgrep -f '[t]est/smoke.py'` só para olhar.
- **Nunca chame `renderPanel()` de forma síncrona dentro de uma view** (empilha dois painéis). Adie com `setTimeout`.
- **A saída das ferramentas mostra aspas como `\"`, mas os arquivos têm aspas simples.** Procure o texto real.
- **Edite com script que confere `count == 1` e roda `node --check` ANTES de gravar.**
- **O simulador mais permissivo que o serviço real esconde bugs** (foi assim com as regras de validação do Google Sheets).
- Telefone de 11 dígitos é mascarado como CPF (`***.***.***-**`); o simulador registra envio como `[texto, conversa]`; `ligacao` espera no mínimo 15 s.
