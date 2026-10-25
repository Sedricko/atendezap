---
name: atendezap-extensao-whatsapp
description: Continuar o desenvolvimento do AtendeZap (extensão Chrome MV3 para WhatsApp Web do Johon + duas planilhas Google com scripts). Passagem de bastão para QUALQUER conversa nova ou outra IA: estado atual (v1.47.0), regras inegociáveis, como testar e empacotar, armadilhas já resolvidas e pendências.
---

# AtendeZap — passagem de bastão (estado na v1.47.0)

> Ponto de partida para **qualquer conversa nova ou outra IA**. Leia inteiro antes de mexer em qualquer coisa. O diário completo por versão está em `docs/SKILL-HISTORICO.md` (consulte só para achar o motivo de uma decisão antiga).

## 1. Quem e o quê
- **Dono: o Johon** (notas muito antigas diziam "William" por engano). Atende clientes de **frete e cargas** pelo computador, em muitos grupos de WhatsApp. **Não é programador:** responda em **português do Brasil**, em linguagem simples, objetiva, sem enrolação; diga sempre **o que mudou, como testar, riscos e o que NÃO foi verificado**.
- **Projeto:** extensão própria (Chrome/Edge, MV3) para o WhatsApp Web, inspirada no waTidy, **sem servidor e sem licença**, mais duas planilhas Google com Apps Script: a de **frete/IA** (`planilha/AtendeZap.gs`, versão 5) e a do **Painel Administrador** (`planilha/AdminControle.gs`, controla o que cada pessoa da equipe vê).
- **O que ele valoriza:** achar tudo fácil (a barra é organizada por **assunto**), nada que possa banir ou quebrar o WhatsApp dele, honestidade sobre o que foi ou não testado de verdade, e autonomia ("continue, não peça") **dentro das regras do item 5**. Em decisão de risco, pergunte uma vez.

## 2. Para começar (peça se faltar; sem o zip NÃO reescreva a extensão de memória)
1. `atendezap.zip` mais recente (pasta `atendezap/` na raiz, **com `test/`**), `AtendeZap.gs`, `AdminControle.gs` e este `SKILL.md`.
2. Descompacte em `/home/claude/work/` e rode: `node test/util.test.js && node test/admin.test.js && node test/planilha.test.js`. Depois o teste de ponta a ponta (ver item 6). **Só mexa depois de ver tudo passar.**
3. Leia `docs/FUNCOES.md` (o que existe e onde), `docs/ARQUITETURA.md` (mapa do `main.js`), `docs/TESTE-REAL.md` (o que o Johon ainda precisa confirmar) e `tools/teste/README.md` (como testar).
4. Se ele mandar **pacote de diagnóstico (.zip)**, relatório, mapa ou estrutura: leia o `mapa.json` (`mudancas`, `entregaViewOnce`, `sondaViewOnce`, `recursos`), `ambiente.json`, `ponte.json`, `ia.json` e `erros.json` antes de propor qualquer ajuste.

## 3. Estado atual (v1.47.0)
- **Barra com 6 ícones, por assunto:** ⚡ Atendimento (Respostas · Aguardando · Assinatura · Atendente IA · Memória IA · Lista de frete · Resumo) · 👥 Grupos (Pedidos · Conjuntos · Ajustes) · 🧰 Ferramentas (Iniciar conversa · Enviar para vários · Fixadas · Contato · Exportar · Backup) · 🔒 Privacidade (Ocultas · Apagar · Recuperar) · 🩺 Diagnóstico (Saúde · Limites · Avaliação · Envios à IA · Laboratório) · ⚙ Configurações (Começar aqui · Acesso da equipe · Posição · Assistente de IA · Partes do painel).
- **29 recursos** que o administrador libera ou bloqueia por perfil (vazio = bloqueado). **🧪 = ainda não confirmado no WhatsApp REAL:** apagar, recuperar, exportar, contato, escuta (banco de conhecimento), resumo, ligação (resposta automática), avaliação e laboratório. Tudo foi testado **só em simulador**; o Johon **ainda não devolveu nenhum teste real** desses itens (ver `docs/TESTE-REAL.md`).
- **Confirmados no WhatsApp real (relatórios e uso dele):** respostas rápidas, assinatura, iniciar conversa, enviar para vários (e Status), fixadas, pedidos de grupos, vagas, "grupos só na aba Grupos", Atendente IA, acesso da equipe, diagnóstico.
- **Testes (verificados em 24/10/2026, rodada final da v1.47.0):** 335 verificações de ponta a ponta, `_regressoes: []`, `errors: []`, `FIM saída=0`; `util.test.js`, `admin.test.js` e `planilha.test.js` passam.
- **Conferir se recebeu os arquivos certos:** `manifest.json` diz `1.47.0`; a pasta `atendezap/` tem **52 arquivos**; `AtendeZap.gs` tem `VERSAO_IA_ = 5`; `A.RECURSOS.length` é 29. Se algo for diferente, diga ao Johon antes de mexer.
- **Segurança já feita:** backups nunca levam chave da IA, convite da equipe nem identificação do computador (`AZU.BACKUP_NUNCA`); a ponte só obedece ao painel em tudo que apaga, envia, lê conversa ou baixa mídia (`SENSIVEIS`); diagnóstico sem dados pessoais. Limite conhecido da ponte: `docs/AUDITORIA.md`.

## 4. Pendências e próximos passos
**Do Johon (nada disso eu consigo fazer sozinha):**
1. Instalar a v1.47, colar os dois `.gs` nas planilhas e **terminar a recuperação da aba Perfis** se ainda não fez (o menu 9 foi consertado na v1.40.1: restaurar a cópia `Perfis (cópia …)` mais recente, colar o script novo e rodar o menu 9). **Apagar backups antigos** da pasta Downloads (os do backup automático antigo podem ter o convite).
2. Testar pelo `docs/TESTE-REAL.md` e contar o resultado; depois **Diagnóstico › Saúde › Avançado › Gerar pacote de diagnóstico (.zip)** e mandar.
**Meus, quando houver retorno:** tirar o 🧪 do que for confirmado (passo a passo em `docs/FUNCOES.md`) e consertar o que quebrar.
**Visualização única (assunto aberto):** o aviso "só pode abrir no celular" é regra **oficial** do WhatsApp para aparelhos conectados, não defeito nosso. O WhatsApp tem recurso oficial **em beta** para abrir em aparelhos conectados (WABetaInfo, Android 2.25.3.7, início de 2025; sem confirmação de liberação geral). O mapa de 24/10 (WhatsApp 2.3000.1051602143) **não tem nenhuma chave com esse nome** nem módulo de controle legível (a leitura só alcança poucos módulos). **Próximo passo:** ler `mapa.entregaViewOnce` do pacote novo: se `comArquivo > 0` (o WhatsApp entregou o arquivo e a tela não mostra), vale procurar a chave; se `soAviso` (só o aviso), é decisão do servidor e do celular e nenhuma chave resolve. Oferecido e **ainda não feito**: aviso "visualização única" + resposta rápida pedindo o reenvio normal (sempre como sugestão).
**Ideias (a pedido dele):** funil de frete (etapas por conversa: pediu carga → negociando → fechado → canhoto entregue), avaliação do atendimento com IA (opcional, gasta cota), mensagens agendadas (só com o WhatsApp aberto), alerta de online (baixa prioridade e pouco confiável).
**Dívida técnica (decidida, não mexer sem motivo):** `content/main.js` (~4.900 linhas) é um bloco só de propósito; o teste completo leva ~20 min por esperas fixas.

## 5. Regras inegociáveis
- **Privacidade de terceiros:** nunca ajudar a ver quem escondeu "online", nunca extrair, mostrar, salvar, exportar ou recuperar **visualização única** (a extensão a ignora de propósito em Recuperar e Exportar), nunca burlar proteção que o WhatsApp ou o remetente escolheram. Relatório, mapa e pacote **nunca** levam mensagens, contatos, ids com número, convites de grupo, chave da IA, convite da equipe nem URL da planilha.
- **Limites:** só os limites de TELA podem ser contornados (ex.: fixar sem limite); os do servidor não; os anti-spam (conversas novas, encaminhar, transmissão) **não ajudar a burlar**: risco de banir o número da empresa.
- **Administrador de grupo NUNCA é removido** de grupo (regra dele, v1.12.2): quem é admin em qualquer grupo do conjunto fica protegido em todos; se não der para conferir, não remove ninguém. Nunca criar opção para remover admin.
- **A IA nunca inventa dados** (preço, data, placa, disponibilidade de carga); toda proposta da IA tem Desfazer; o robô nasce em "sugerir"; ligação automática, escuta e aprovação automática nascem **desligadas** e pedem aceite; aprovação automática só para pergunta+resposta **provada** pelas respostas reais (3+ vezes, 2+ conversas, 70%+ iguais, máx. 10/dia, trava em 3 desfeitos na semana).
- **Selo do cabeçalho da conversa (`#az-head`):** cabem exatamente 4 botões + contador de vagas em 228 px; **nenhum elemento novo pode alargá-lo**.
- **waTidy/Pragmaz:** só referência de comportamento (manifesto, regras de rede, textos de tela, prints); a licença da Pragmaz proíbe engenharia reversa e **nada é copiado**. `lib/wppconnect-wa.js` é a wa-js 4.7.1 (terceiros, não editar; `lib/NOTICE-wa-js.txt`).
- **Honestidade:** nunca afirme que algo funciona no WhatsApp real se só passou no simulador; diga o que não foi verificado. Função nova **nasce com 🧪**.
- Não reintroduzir o que ele mandou remover: abas personalizadas (`userTabs`), ⚡ flutuante acima do campo, selo em pílula "N vagas".

## 6. Como trabalhar (processo que funciona)
1. Edite com **script Python que confere `count == 1` do trecho e roda `node --check` ANTES de gravar** (salve o script em arquivo para repetir após um erro). Nunca troque blocos por âncora adivinhada.
2. Para o que mexe em tela: `ir(page, nome)` do smoke abre o ícone e depois a aba (`ABA_DE` mapeia nome → (ícone, aba)).
3. **Testes rápidos (segundos):** `node test/util.test.js`, `admin.test.js`, `planilha.test.js`.
4. **Teste de ponta a ponta completo (~20 min):** `tools/teste/roda_smoke_completo.sh` desacoplado (`setsid nohup … &`), esperando em chamadas de no máximo 300 s. A saída só aparece no FIM: arquivo vazio e sem processo = rodada interrompida (refazer). Aprovado = `errors: []`, `_regressoes: []`, `FIM saída=0`.
5. **Teste reduzido:** `tools/teste/mk_reduzido.py` com prefixos de chave (confira antes `grep -o "'xx_[a-z_]*'" test/smoke.py`: `rc_` e `rs_` já colidiram). **Apague `test/smoke_acesso.py` antes de empacotar.**
6. Toda mudança nas contagens: `A.RECURSOS` (29) em `test/util.test.js` e as contagens de `test/admin.test.js`; `MODULOS` de `main.js` e `lib/acesso.js` têm de ter a **mesma ordem**; a ordem de `SECTIONS` define a **ordem dos ícones** da barra (confira `ac_todos_barra`).
7. Ao terminar: `python3 tools/mapa_main.py` (atualiza `docs/ARQUITETURA.md`), atualizar `docs/FUNCOES.md`, `LEIAME.txt`, este arquivo e a versão no `manifest.json`.

## 7. Como entregar
Ao fim de cada rodada, gerar e **apresentar ao Johon**: `atendezap.zip` (`cd /home/claude/work && zip -qr /mnt/user-data/outputs/atendezap.zip atendezap -x 'atendezap/node_modules/*'`), `AtendeZap.gs`, `AdminControle.gs` (copiar de `planilha/`) e `SKILL.md` (copiar de `docs/SKILL.md`). Diga o que ele precisa fazer (instalar, colar scripts) e o que NÃO foi verificado. Atualizar = substituir a pasta, ↻ na extensão em `chrome://extensions`, F5 no WhatsApp.

## 8. Arquitetura (resumo; detalhes em `docs/ARQUITETURA.md`)
- `manifest.json` (MV3): scripts no mundo MAIN (`page/pre.js` → `lib/wppconnect-wa.js` → `page/bridge.js`) e no mundo isolado (`content/util.js` … `lib/*.js` … `content/main.js`). `background.js` = service worker (IA Gemini, planilhas, robô vivo).
- `page/bridge.js` é a **única** parte que toca `window.WPP`; fala com o painel por `postMessage` (`req`/`res`/`evt`). Métodos que apagam, enviam, leem conversa ou baixam mídia entram em `SENSIVEIS`.
- `content/main.js`: toda a UI e a lógica (Shadow DOM: `az-panel`, `az-pop`, `az-head`). Dados em `chrome.storage.local` (`KEYS` + valores padrão no início).
- `lib/*.js`: regras **puras** testáveis em Node (`acesso`, `recuperar`, `zip`, `exportar`, `aparelho`, `treino`, `avaliar`, `resumo`, `ligacao`, `iaregistro`, `diagnostico`, `iaerro`, `wrapalvos`). Lógica nova que não precisa de tela vai para cá, com teste em `test/util.test.js`.
- Documentos: `LEIAME.txt` (guia atual do usuário), `docs/` (FUNCOES, ARQUITETURA, TESTE-REAL, ROTEIRO, AUDITORIA, HISTORICO, SKILL-HISTORICO, NOVA-CONVERSA), `tools/` (testes e auditoria).

## 9. Armadilhas já resolvidas (não repetir)
- **A saída das ferramentas mostra aspas como `\"`, mas os arquivos têm aspas simples:** procure o texto real. `cut -c` corta caractere UTF-8 ao meio: imprima com Python.
- **`pkill -f` com texto que está no próprio comando mata o seu shell** (retorno -1 sem saída). Use `pgrep -f '[t]exto'` só para olhar.
- **Nunca chame `renderPanel()` de forma síncrona dentro de uma view** (nem em função async sem `await`): empilha dois painéis ("intercepts pointer events" no teste). Adie com `setTimeout`.
- **Simulador mais permissivo que o serviço real esconde bugs** (as regras de validação do Google Sheets recusam gravar texto em célula com regra de número; `clear()` não remove regra). Mantenha o simulador de `admin.test.js` fiel.
- O primeiro argumento de um `onclick` é o evento: use `onclick: () => fn()` quando `fn` tem parâmetro.
- Estado que duas tarefas assíncronas gravam (ex.: `ligEstado`): ler **fresco** na hora de gravar.
- Telefone de 11 dígitos é mascarado como CPF (`***.***.***-**`); id de conversa mascarado vira `#@c.us` (não é dado pessoal).
- O simulador registra envio como `[texto, conversa]`; a tela de Treino só abre depois de "Treinar conversando"; `ligacao` espera no mínimo 15 s; o envio à planilha espera 15 s (botão "Enviar agora" manda já).
- Backup: **só grupos conhecidos voltam na restauração**; dado sem grupo não é restaurável. Caches de diagnóstico (`mapaBase`, `refCache`…) ficam fora do backup.
- wa-js 4.7.1: não há `WPP.webpack` (é `WPP.loader`); contas `@lid`: resolver com `WPP.chat.find(toWid(id))`; confirme caminhos com `grep` em `lib/wppconnect-wa.js`. `WPP.loader.loadModule` só alcança poucos módulos (por isso sondas por módulo são limitadas).
- DOM real: `#main header[data-testid=conversation-header]`, `#main footer [contenteditable][data-tab=10]`, `#side > #pane-side`; abas `button[role=tab]`; "Extension context invalidated" após atualizar é tratado em `main.js`.
- Classes CSS colidem no Shadow DOM (nomes específicos); `replaceChildren(array)` não achata (use `h()`).
- O teste de varredura de dado pessoal do pacote usa `\d{6,}@(c.us|g.us|lid)` (id COM número); `#@c.us` é seguro.

## 10. Como acrescentar uma função nova
1. Lógica pura → `lib/<nome>.js` + testes em `test/util.test.js` (e registrar o script no `manifest.json` antes de `content/main.js`).
2. WhatsApp → método em `page/bridge.js` (retorno serializável; se envia/apaga/lê conversa, entra em `SENSIVEIS`).
3. Tela → `SECTIONS`, `HUBS`, `HUB_DE`, o objeto `body` em `renderPanel`; se pode ser desligada: `MODULOS` (4º item `'teste'` = 🧪) e guardas `ligado('k')`.
4. Liberação → `lib/acesso.js` (mesma ordem de `MODULOS`), `planilha/AdminControle.gs` (`ADM_RECURSOS`, `ADM_GRUPOS`, exemplos), contagens nos testes.
5. Dados → `KEYS` e valor padrão; se for para backup: `AZU.BACKUP_GROUPS`; se for segredo ou cache: `AZU.BACKUP_NUNCA`.
6. Testes de ponta a ponta no `test/smoke.py` (chave de teste com prefixo livre) e simulador fiel à API real.
7. Documentar: `docs/FUNCOES.md`, `LEIAME.txt`, este arquivo; subir a versão.

## 11. Ao FIM de cada sessão (para não perder o fio)
Atualize **este arquivo** (estado, pendências, o que foi e o que não foi verificado, novas armadilhas) e `docs/ROTEIRO.md`; acrescente o detalhe da versão em `docs/SKILL-HISTORICO.md` (uma entrada curta no topo); regenere `docs/ARQUITETURA.md`; entregue os 4 arquivos do item 7. Se a conversa for trocada, o Johon usa `docs/NOVA-CONVERSA.md`.
