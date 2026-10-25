# Mapa do content/main.js (gerado por tools/mapa_main.py)

`content/main.js` tem 4918 linhas e é UM bloco só (tudo depende das mesmas variáveis: `S`, `h`, `call`, `toast`, `renderPanel`). Não foi dividido de propósito: dividir sem poder testar no WhatsApp de verdade tem risco alto e valor baixo. Os marcadores `// ----- … -----` são irregulares (o primeiro cobre muita coisa): use também a busca por nome da função.

## Por seção

- **Acesso da equipe (v1.34): o administrador libera, bloqueia e limita. Sem convite, a extens** — linhas 135–677: `acessoEf`, `ligado`, `marcada`, `abaAtual`, `descAbas`, `applyPins`, `janelaReal`, `janelaDesc`, `emBusca`, `barraDeAbas`, `syncGruposSo`, `gruposReafirmar`, `vigiaAba`, `h` …
- **Vagas nos grupos (v1.14)** — linhas 678–890: `vagasDe`, `fmtN`, `numVagas`, `tituloVagas`, `classeVagas`, `desenharVagas`, `atualizarVagas`, `togglePin`, `escopoFixada`, `ensureHead`, `renderHead`, `visiveis`, `emTeste`, `railKey` …
- **Respostas rápidas: lista** — linhas 891–999: `repliesView`, `itemEl`, `emptyState`, `newReply`, `openPanelKeepEdit`, `manageCats`, `deleteReply`, `duplicateReply`
- **Respostas rápidas: editor** — linhas 1000–1154: `editorView`, `pickFile`, `loadPreviews`, `validaEspecial`, `saveEditor`
- **Assinatura** — linhas 1155–1184: `sigView`
- **Iniciar conversa** — linhas 1185–1203: `startView`
- **Enviar para vários (lote)** — linhas 1204–1329: `saveSel`, `fmtBytes`, `loadLoteChats`, `addLoteFiles`, `waitS`, `runLote`, `isTimeoutStatus`, `duracaoVideo`, `contarMeus`, `loteStatus`
- **Meus status: listar e apagar vários** — linhas 1330–1470: `loadMeus`, `apagarStatus`, `meusStatusView`, `loteView`
- **Conversas fixadas** — linhas 1471–1496: `pinsView`
- **Lista de frete (planilha Google)** — linhas 1497–1518: `buscarListaCargas`, `listaNaConversa`
- **Configurações** — linhas 1519–1544
- **Pedidos para entrar nos grupos (v1.12)** — linhas 1545–1643: `conjuntosIds`, `procurarPedidos`, `previaPedidos`, `soma`, `aprovarPedidos`, `enviarConvitesPriv`, `pedidosView`
- **Conjuntos de grupos (v1.12; painel, convite, padronizar e votos na v1.19)** — linhas 1644–1704: `carregarGrupos`, `carregarPainel`, `proximoComVaga`, `copiarLink`, `enviarConviteChat`, `verVotos`, `pillVagas`, `painelCorpo`
- **Padronizar o conjunto: mesma descrição/nome/ícone/permissões em todos os grupos (cada camp** — linhas 1705–1765: `abrirPad`, `triEstado`, `resumoPad`, `executarPad`, `padView`, `unicosView`
- **Duplicados que já existem no conjunto: manter em UM grupo e remover dos outros (v1.12.1)** — linhas 1766–1920: `verificarDup`, `keepDe`, `planoDup`, `removerDup`, `dupView`, `editorUnicos`, `limitesView`, `vagasCard`, `gruposSoCard`, `limWaCard`, `freteCard`, `gruposAjView`, `freteView`, `limitesSecaoView` …
- **Aguardando resposta** — linhas 1921–1993: `foraDoExpediente`, `atualizarFila`, `haQuanto`, `filaView`
- **Conversas ocultas** — linhas 1994–2121: `ocultar`, `garantirOcultas`, `esconderLinhas`, `pedirOcultar`, `marcarAlvo`, `ocultasView`
- **Apagar mensagens para todos, a qualquer tempo (v1.37)** — linhas 2122–2163: `apagarCarregar`, `apagarExecutar`, `apagarView`
- **Recuperar mensagens apagadas (v1.38)** — linhas 2164–2245: `recCfg`, `recNaoVistas`, `recAbrir`, `recReq`, `recTodas`, `recPut`, `recuperarSincronizar`, `recuperarRecebeu`, `recuperarRecebeuMidia`, `recuperarPurgar`, `recuperarCarregar`, `recuperarResumo`, `recuperarCfgSalvar`, `recuperarLigar` …
- **Contato do cliente: aparelho provável (v1.43)** — linhas 2246–2277: `contatoCarregar`, `contatoView`
- **Ligação não atendida → mensagem automática (v1.44)** — linhas 2278–2321: `ligCfg`, `ligAtivo`, `ligUlt`, `ligacaoSincronizar`, `ligacaoRecebeu`, `ligSalvar`, `ligacaoLigar`, `ligacaoCard`
- **Resumir o que perdi (v1.44)** — linhas 2322–2356: `resumoExecutar`, `resumoView`
- **Avaliação do atendimento contra a memória (v1.44)** — linhas 2357–2399: `avCfg`, `avPendentes`, `avSalvar`, `avAuto`, `avaliarExecutar`, `avaliacaoView`
- **Envios à IA (v1.45): transparência** — linhas 2400–2413: `iaEnviosView`
- **Começar aqui (v1.45): primeira configuração guiada, só mostra o que falta e some quando ac** — linhas 2414–2430: `comecarCard`
- **Exportar conversa (v1.42)** — linhas 2431–2493: `expF`, `expAtalho`, `exportarExecutar`, `exportarView`
- **Backup** — linhas 2494–2538: `fmt`, `doBackup`, `checkBackup`, `readBackup`, `doRestore`
- **Importar do waTidy (v1.13; escolher o que importar na v1.14)** — linhas 2539–2693: `wtEscolher`, `wtPlanejar`, `wtRefazer`, `wtImportar`, `wtCard`, `backupView`
- **Diagnóstico** — linhas 2694–3882: `describe`, `chavesDe`, `iaPronta`, `iaPedir`, `iaContexto`, `iaEnviar`, `iaAplicar`, `iaDesfazer`, `iaPainel`, `iaTestar`, `salvarChaves`, `chavesBloco`, `iaCard`, `mdLeve` …
- **Escuta automática e banco de conhecimento (v1.43)** — linhas 3883–4528: `conhecCfg`, `conhecScriptOk`, `conhecSalvar`, `conhecLigar`, `conhecEscutar`, `memChave`, `memAprovarAuto`, `conhecDesfeita`, `conhecDesfazerAuto`, `conhecAprovacao`, `conhecConsolidar`, `conhecEsquecer`, `conhecCard`, `memoriaView` …
- **Autodiagnóstico** — linhas 4529–4918: `autoDiag`, `renderAlerta`, `vigiaConexao`, `salvarRefs`, `lerCodigoWA`, `loadLab`, `ehBool`, `comoBool`, `labToggle`, `labPacote`, `labView`, `novidadesCard`, `diagView`

## Onde mexer para…

- **Adicionar uma aba/função nova:** `SECTIONS`, `HUBS`, `HUB_DE`, `MODULOS` (4º item `'teste'` = 🧪), o objeto `body` em `renderPanel`, `MOD_ICONE`; `lib/acesso.js` (MODULOS, mesma ordem que em main.js); `planilha/AdminControle.gs` (`ADM_RECURSOS`, `ADM_GRUPOS`, exemplos); contagens em test/util.test.js e test/admin.test.js.
- **Falar com o WhatsApp:** `page/bridge.js` (métodos em `api`; os que apagam, leem conversas ou enviam entram em `SENSIVEIS`); no painel use `call('metodo', ...)`.
- **Regra pura (sem tela):** crie/edite em `lib/*.js` e teste em `test/util.test.js`.
- **Guardar dado:** `KEYS` + valor padrão (início do arquivo) e `save('chave')`.

## Bibliotecas puras (lib/)

`acesso` (liberação por perfil) · `recuperar` (mensagens apagadas) · `zip` e `exportar` (exportar conversa) · `aparelho` (aparelho do contato) · `treino` (escuta, refinamento, aprovação com prova) · `avaliar` (avaliação sem IA) · `resumo` (resumo do que perdi) · `ligacao` (resposta a ligações) · `iaerro` · `wrapalvos`.

## Prefixos de teste já usados em test/smoke.py (antes de criar um novo, confira)

`ac_` (31), `ap_` (3), `au_` (3), `av_` (1), `bk_` (1), `cc_` (1), `ch_` (4), `ct_` (1), `dg_` (5), `dl_` (1), `es_` (11), `ex_` (6), `fl_` (8), `gs_` (19), `ia_` (8), `ie_` (1), `inv_` (1), `lg_` (2), `lm_` (8), `nv_` (1), `perm_` (1), `pv_` (3), `rb_` (21), `rc_` (14), `rcp_` (8), `refs_` (1), `rel_` (1), `rs_` (8), `rsu_` (1), `sc_` (4), `tm_` (1), `tp_` (8), `tr_` (3), `va_` (1)
