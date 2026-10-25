/**
 * AtendeZap — PAINEL DE CONTROLE DA EQUIPE (v1.34)
 *
 * Esta planilha é SÓ SUA. Ela diz, para cada pessoa da equipe, o que a extensão pode usar,
 * e recebe de volta um resumo técnico de saúde (nunca conversas, nomes ou telefones).
 *
 * ⚠ USE UMA PLANILHA NOVA, COM PROJETO PRÓPRIO. Nunca cole este arquivo num projeto que já tem outro script (ex.: o do seu Gerador de Anúncios
 *   ou o AtendeZap.gs da lista de cargas). Motivos: (1) num projeto do Apps Script todos os arquivos dividem os mesmos nomes de função, e o
 *   doGet/doPost só pode existir uma vez; (2) quem tem acesso à planilha vê os códigos de todos e pode mudar as permissões.
 *   Todos os nomes deste arquivo começam com "adm" ou "ADM_" justamente para não pisar em nada, mas o doGet/doPost não dá para renomear.
 *
 * INSTALAÇÃO (uma vez):
 *  1) Crie uma planilha NOVA no Google Sheets (nome sugerido: "AtendeZap - Controle da equipe").
 *  2) Extensões > Apps Script. Apague o que houver e cole ESTE arquivo inteiro. Salve.
 *  3) Na barra de cima do editor escolha a função  admPrepararPlanilha  e clique em Executar. O Google pede autorização (Avançado > Acessar > Permitir).
 *     Isso cria as abas e instala o menu "AtendeZap Admin" (recarregue a planilha para vê-lo).
 *  4) Implantar > Nova implantação > Tipo "App da Web": Executar como "Eu", Quem tem acesso "Qualquer pessoa". Implantar.
 *     Copie o endereço que termina em /exec.
 *  5) Apps Script > Configurações do projeto > Propriedades do script > Adicionar: nome URL_EXEC, valor = o endereço /exec copiado.
 *  6) Na aba Usuarios escreva o NOME e o PERFIL de cada pessoa. Menu AtendeZap Admin > "2. Gerar códigos e convites".
 *  7) Mande a cada pessoa o texto da coluna Convite (começa com AZ1.). Ela cola em Configurações > Acesso da equipe.
 *     NADA vem liberado de fábrica: quem entra só vê o "Acesso da equipe". Você libera o que cada perfil pode usar na aba Perfis (célula vazia = bloqueado).
 *     Perfil em branco, ou que não existe na aba Perfis, também significa "só o acesso".
 *     Colou uma versão nova deste script? Ao reabrir a planilha ele acrescenta sozinho, na aba Perfis, as linhas de recursos novos (sem mexer no que você preencheu).
 *     Menu "7. Conferir perfis" avisa combinações que não funcionam (ex.: Laboratório liberado sem o Diagnóstico, onde ele mora; robô sem a chave do Gemini).
 *  7b) Cada convite vale para 1 COMPUTADOR por padrão (o 2º computador é recusado). Para a pessoa usar mais de um, escreva o número na coluna "Máx. computadores" da aba Usuarios.
 *     A aba Computadores mostra quem se conectou de onde. Pessoa trocou de computador? Menu "8. Liberar computadores de uma pessoa" desconecta os antigos para ela se conectar no novo.
 *  8) (Opcional) Menu "4. Ligar o vigia do robô": avisa por e-mail se o robô de alguém ficar mudo. Preencha emailAlerta na aba Global.
 *
 * Mudou algo no código depois? Implantar > Gerenciar implantações > lápis > Versão: Nova versão.
 * Mudou só células da planilha? Vale na hora: nada a reimplantar.
 */

var ADM_VERSAO = 3;
var ADM_ABA = { usuarios: 'Usuarios', perfis: 'Perfis', excecoes: 'Excecoes', global: 'Global', saude: 'Saude', computadores: 'Computadores', legenda: 'Legenda' };
// colunas de Usuarios (1 = A)
var ADM_U = { NOME: 1, CODIGO: 2, PERFIL: 3, ATIVO: 4, VALIDADE: 5, CONVITE: 6, ULTIMA: 7, VERSAO: 8, INST: 9, ROBO: 10, SINAL: 11, ALERTADO: 12, OBS: 13, MAXPC: 14 };
var ADM_CAB_USUARIOS = ['Nome', 'Código', 'Perfil', 'Ativo (sim/não)', 'Validade (dd/mm/aaaa)', 'Convite (mande à pessoa)', 'Última consulta', 'Versão', 'Instalação', 'Robô', 'Último sinal', 'Alertado', 'Observações', 'Máx. computadores (vazio = 1)'];
var ADM_CAB_SAUDE = ['Data', 'Pessoa', 'Versão', 'WhatsApp', 'Ok', 'Avisos', 'Problemas', 'Sem teste', 'Checagens com problema', 'Robô (modo)', 'Robô ligado', 'Respondeu 24h', 'Repasses 24h', 'Ignoradas 24h', 'Falhas IA 24h', 'Pendências', 'IA (s)', 'Cliente esperou (s)', 'Falhas IA hoje', 'Resumo (JSON)'];
// Cores da aba Perfis: [fundo, texto]. Verde = ATIVO, laranja = liberado mas vem desligado, vermelho = bloqueado (e vazio, que é a mesma coisa). AMARELO é só do modo AUTOMÁTICO do robô (atenção: responde sozinho).
var ADM_COR = { ligado: ['#ceead6', '#137333'], obrigatorio: ['#81c995', '#0d652d'], desligado: ['#fce5cd', '#b45f06'], bloqueado: ['#fad2cf', '#c5221f'], vazio: ['#fce8e6', '#c5221f'], automatico: ['#ffe599', '#7f6000'] };
// Limites: lista de valores (texto) ou faixa [mínimo, máximo] (números). Igual ao que a extensão aceita (lib/acesso.js LIMITES; o teste confere).
var ADM_LIMITES_VAL = { roboModoMax: ['desligado', 'sugerir', 'automatico'], roboMaxPorContatoDia: [1, 200], roboMaxPorHora: [1, 500], chavesMax: [1, 6], retencaoMaxDias: [1, 365] };
// Como a aba Perfis é organizada: [título do grupo, explicação, [chaves]]. Todo recurso e todo limite está em exatamente um grupo (o teste confere).
var ADM_GRUPOS = [
  ['▸ ATENDIMENTO', 'Responder clientes: respostas, fila de espera, assinatura, o robô (Atendente IA), a transcrição de áudios e a Lista de frete', ['replies', 'fila', 'sig', 'atendente', 'iaAudio', 'escuta', 'resumo', 'ligacao', 'cargas']],
  ['▸ GRUPOS', 'Tudo de grupos: pedidos para entrar, vagas e "grupos só na aba Grupos"', ['pedidos', 'vagas', 'gruposSo']],
  ['▸ FERRAMENTAS', 'Iniciar conversa, enviar para vários, fixar conversas, exportar conversa e backup', ['start', 'lote', 'pins', 'contato', 'exportar', 'backup']],
  ['▸ PRIVACIDADE', 'Ocultar conversas, apagar as suas mensagens para todos e recuperar o que os contatos apagarem', ['ocultas', 'apagar', 'recuperar']],
  ['▸ DIAGNÓSTICO', 'Saúde das funções, limites do WhatsApp, Laboratório (recursos escondidos) e arquivos para suporte (o autoteste roda mesmo com a aba escondida)', ['diag', 'cfgLimites', 'avaliacao', 'lab', 'diagAvancado']],
  ['▸ CONFIGURAÇÕES', 'Os cartões da tela de Configurações: posição do painel, partes do painel e a chave do Gemini (o "Acesso da equipe" sempre aparece)', ['cfgPosicao', 'cfgPartes', 'cfgIA']],
  ['▸ LIMITES (números; vazio = sem teto)', 'Tetos que valem por cima do que a pessoa configurou', ['limite:roboModoMax', 'limite:roboMaxPorContatoDia', 'limite:roboMaxPorHora', 'limite:chavesMax', 'limite:retencaoMaxDias']]
];
var ADM_CAB_COMPUTADORES = ['Pessoa', 'Código', 'Instalação', 'Computador', 'Primeira conexão', 'Última consulta', 'Versão', 'Situação (Liberado / Revogado)'];
var ADM_LIMITE_SAUDE = 5000;   // linhas guardadas na aba Saude (as mais antigas saem)

// Recursos que a extensão entende (precisa ser igual à lista da extensão: o teste confere). [chave, descrição]
var ADM_RECURSOS = [
  ['replies', 'Atendimento › Respostas rápidas (e o /atalho no campo de mensagem)'], ['fila', 'Atendimento › Aguardando resposta'],
  ['sig', 'Atendimento › Assinatura'], ['start', 'Ferramentas › Iniciar conversa'],
  ['lote', 'Ferramentas › Enviar para vários'], ['pins', 'Ferramentas › Fixadas (sem o limite de 3 do WhatsApp)'],
  ['ocultas', 'Privacidade › Ocultas'], ['apagar', '[Em teste] Privacidade › Apagar mensagens para todos, a qualquer tempo (experimental: o servidor do WhatsApp decide se aceita as antigas)'],
  ['recuperar', '[Em teste] Privacidade › Recuperar mensagens que os contatos apagarem (cópia local e temporária; a pessoa liga lá dentro)'], ['backup', 'Ferramentas › Backup'],
  ['lab', '[Em teste] Diagnóstico › Laboratório: liga recursos escondidos do próprio WhatsApp para experimentar (ainda não sabemos o que cada um faz)'], ['gruposSo', 'Grupos › Ajustes: "grupos só na aba Grupos"'],
  ['atendente', 'Atendimento › Atendente IA (robô). Libere também "cfgIA": é onde a pessoa coloca a chave do Gemini'], ['vagas', 'Grupos › Ajustes: vagas nos grupos'],
  ['pedidos', 'Grupos › Pedidos para entrar e Conjuntos'], ['cargas', 'Atendimento › Lista de frete (a planilha Google do robô)'],
  ['iaAudio', '[Em teste] Atendimento › Atendente IA: transcrever áudios do robô (precisa de "atendente")'], ['diagAvancado', 'Diagnóstico › Saúde: arquivos para suporte (fica dentro da aba Saúde: precisa de "diag")'],
  ['diag', 'Diagnóstico › Saúde (o autoteste continua rodando e enviando, com a aba escondida)'], ['cfgPosicao', 'Configurações › Geral: cartão "Posição do painel"'],
  ['cfgIA', 'Configurações › Geral: cartão "Assistente de IA" (a chave do Gemini da pessoa)'], ['cfgPartes', 'Configurações › Geral: cartão "Partes do painel" (ligar/desligar as partes liberadas)'],
  ['cfgLimites', 'Diagnóstico › Limites do WhatsApp (só leitura)'], ['exportar', '[Em teste] Ferramentas › Exportar conversa: mensagens e mídia de um intervalo de data e hora, em um arquivo .zip'],
  ['contato', '[Em teste] Ferramentas › Contato: dados do contato aberto e o aparelho provável dele (Android, iPhone ou Web)'], ['resumo', '[Em teste] Atendimento › Resumo: a IA resume as mensagens não lidas das conversas individuais e sugere o que fazer primeiro (só resume, não responde a ninguém)'], ['ligacao', '[Em teste] Atendimento › Aguardando: responde com UMA mensagem curta quem ligar e não foi atendido (nunca em grupo, nunca atende nem recusa a chamada; a pessoa liga lá dentro)'], ['avaliacao', '[Em teste] Diagnóstico › Avaliação: confere o que a pessoa respondeu contra a memória aprendida, quem ficou sem resposta e o tempo de resposta (sem IA, sem nota para ninguém)'],
  ['escuta', '[Em teste] Atendimento › Memória IA › Banco de conhecimento: lê as conversas de tempos em tempos e guarda o conhecimento (sem dados pessoais); a pessoa liga lá dentro e a IA só propõe, ela aprova']
];
// Limites (valor vazio = sem teto). [chave, descrição]
var ADM_LIMITES = [
  ['roboModoMax', 'Robô: modo máximo (desligado | sugerir | automatico)'], ['roboMaxPorContatoDia', 'Robô: máx. respostas por contato por dia (1-200)'],
  ['roboMaxPorHora', 'Robô: máx. respostas por hora (1-500)'], ['chavesMax', 'IA: máx. de chaves do Gemini (1-6)'], ['retencaoMaxDias', 'Dados do robô: máx. de dias guardados (1-365)']
];
var ADM_GLOBAL = [
  ['emergencia', 'nao', 'sim = PAUSA o robô de todos (vale em até "consultaMin" minutos)'], ['emergenciaMensagem', '', 'Texto mostrado na tela durante a pausa'],
  ['versaoMinima', '', 'Ex.: 1.34.0 — quem estiver com versão menor vê um aviso para atualizar'], ['aviso', '', 'Recado que aparece na tela de todos'],
  ['coletarSaude', 'sim', 'sim = a extensão pode enviar o resumo de saúde (cada pessoa ainda precisa aceitar)'], ['consultaMin', '10', 'De quantos em quantos minutos a extensão consulta esta planilha (5-120)'],
  ['saudeMin', '30', 'De quantos em quantos minutos envia o resumo de saúde (10-240)'], ['validadeOfflineDias', '7', 'Dias que a última configuração vale se a internet/planilha falhar (depois o robô desliga)'],
  ['vigiaMin', '15', 'Minutos sem sinal de um robô LIGADO para você receber o alerta'], ['emailAlerta', '', 'Seu e-mail para os alertas do vigia']
];
// perfis de exemplo: [Novo, Básico, Com robô, Administrador]. CÉLULA VAZIA = BLOQUEADO (nada vem liberado de fábrica: o administrador marca o que cada perfil pode usar).
// Limites vazios = sem teto (o robô, porém, fica em "só sugerir" se roboModoMax estiver vazio).
var ADM_PERFIS_EXEMPLO = {
  replies: ['', 'ligado', 'ligado', 'ligado'], fila: ['', 'ligado', 'ligado', 'ligado'], sig: ['', 'ligado', 'ligado', 'ligado'], start: ['', 'ligado', 'ligado', 'ligado'], lote: ['', 'desligado', 'desligado', 'ligado'],
  pins: ['', 'ligado', 'ligado', 'ligado'], ocultas: ['', 'ligado', 'ligado', 'ligado'], apagar: ['', 'bloqueado', 'bloqueado', 'ligado'], recuperar: ['', 'bloqueado', 'bloqueado', 'ligado'], exportar: ['', 'bloqueado', 'bloqueado', 'ligado'], contato: ['', 'bloqueado', 'bloqueado', 'ligado'], escuta: ['', 'bloqueado', 'bloqueado', 'ligado'], resumo: ['', 'bloqueado', 'bloqueado', 'ligado'], ligacao: ['', 'bloqueado', 'bloqueado', 'ligado'], avaliacao: ['', 'bloqueado', 'bloqueado', 'ligado'], backup: ['', 'ligado', 'ligado', 'ligado'], lab: ['', 'bloqueado', 'bloqueado', 'ligado'], gruposSo: ['', 'ligado', 'ligado', 'ligado'],
  atendente: ['', 'bloqueado', 'ligado', 'ligado'], vagas: ['', 'ligado', 'ligado', 'ligado'], pedidos: ['', 'desligado', 'desligado', 'ligado'], cargas: ['', 'ligado', 'ligado', 'ligado'],
  iaAudio: ['', 'bloqueado', 'desligado', 'ligado'], diagAvancado: ['', 'bloqueado', 'bloqueado', 'ligado'],
  diag: ['', 'bloqueado', 'bloqueado', 'ligado'], cfgPosicao: ['', 'ligado', 'ligado', 'ligado'], cfgIA: ['', 'bloqueado', 'ligado', 'ligado'], cfgPartes: ['', 'bloqueado', 'bloqueado', 'ligado'], cfgLimites: ['', 'bloqueado', 'bloqueado', 'ligado'],
  'limite:roboModoMax': ['', 'desligado', 'sugerir', 'automatico'], 'limite:roboMaxPorContatoDia': ['', '', '15', ''], 'limite:roboMaxPorHora': ['', '', '40', ''], 'limite:chavesMax': ['', '1', '2', '6'], 'limite:retencaoMaxDias': ['', '90', '90', '']
};
var ADM_NOMES_PERFIS = ['Novo', 'Básico', 'Com robô', 'Administrador'];   // "Novo" fica em branco: quem entra sem perfil (ou com perfil que não existe) só vê o "Acesso da equipe"

// ---------------------------------------------------------------- utilidades puras (testadas)
function admSemAcento_(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function admSim_(v) { var x = admSemAcento_(v); return x === 'sim' || x === 's' || x === 'true' || x === '1' || x === 'on'; }
function admJson_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function admHash_(s) { var h = 5381, i; for (i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function admNovoCodigo_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 16).toUpperCase(); }
function admCodificarConvite_(url, codigo) { return 'AZ1.' + Utilities.base64EncodeWebSafe(JSON.stringify({ u: url, c: codigo }), Utilities.Charset.UTF_8).replace(/=+$/, ''); }
function admDataBR_(d) { return Utilities.formatDate(d, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm'); }
// validade pode vir como Date (célula de data) ou texto "dd/mm/aaaa"; vazio = sem validade
// Mesma leitura de estados da extensão (lib/acesso.js, estadoDe): na dúvida, o mais RESTRITIVO ("não" = bloqueado). O teste confere os dois lados.
function admEstado_(v) {
  var x = admSemAcento_(v);
  if (['bloqueado', 'bloquear', 'bloqueada', 'nao', 'off', 'negado', 'proibido'].indexOf(x) >= 0) return 'bloqueado';
  if (['obrigatorio', 'obrigatoria', 'obrigar'].indexOf(x) >= 0) return 'obrigatorio';
  if (['ligado', 'ligada', 'on', 'sim', 'liberado', 'padrao ligado'].indexOf(x) >= 0) return 'ligado';
  if (['desligado', 'desligada', 'padrao desligado'].indexOf(x) >= 0) return 'desligado';
  return '';
}
// Combinações que NÃO funcionam na extensão (ex.: Laboratório liberado sem o Diagnóstico, onde ele mora). vals = toda a aba Perfis (com cabeçalho). Devolve uma lista de avisos.
function admProblemasPerfis_(vals) {
  var out = [], cab = vals[0] || [], c, r, k, est, lim, nome, ok, algum;
  for (c = 2; c < cab.length; c++) {
    nome = String(cab[c] == null ? '' : cab[c]).trim(); if (!nome) continue;
    est = {}; lim = {};
    for (r = 1; r < vals.length; r++) {
      k = String(vals[r][0] == null ? '' : vals[r][0]).trim();
      if (k.indexOf('limite:') === 0) lim[k.slice(7)] = vals[r][c]; else est[k] = admEstado_(vals[r][c]);
    }
    ok = (function (e) { return function (key) { return e[key] === 'ligado' || e[key] === 'desligado' || e[key] === 'obrigatorio'; }; })(est);
    algum = ADM_RECURSOS.some(function (x) { return ok(x[0]); });
    if (!algum) { out.push(nome + ': nada liberado. A pessoa só vê o "Acesso da equipe".'); continue; }
    if (ok('diagAvancado') && !ok('diag')) out.push(nome + ': "diagAvancado" fica dentro da aba Diagnóstico, mas "diag" não está liberado.');
    if (ok('atendente') && !ok('cfgIA')) out.push(nome + ': o robô ("atendente") precisa da chave do Gemini da pessoa, mas "cfgIA" não está liberado: ela não consegue colocar a chave.');
    if (ok('iaAudio') && !ok('atendente')) out.push(nome + ': "iaAudio" (transcrever áudios) é do robô, mas "atendente" não está liberado.');
    if (ok('atendente') && String(lim.roboModoMax == null ? '' : lim.roboModoMax).trim() === '') out.push(nome + ': sem "limite:roboModoMax" o robô só SUGERE (nunca responde sozinho). Escreva automatico para liberar o modo automático.');
  }
  return out;
}
// ---------------------------------------------------------------- limite de computadores por convite
// Quantos computadores a pessoa pode usar (coluna "Máx. computadores"); vazio ou inválido = 1; no máximo 20.
function admMaxPc_(v) {
  var n = parseInt(String(v == null ? '' : v).trim(), 10);
  if (!isFinite(n) || n < 1) return 1;
  return Math.min(n, 20);
}
function admRevogado_(situacao) { var x = admSemAcento_(situacao); return x === 'revogado' || x === 'desconectado' || x === 'bloqueado'; }
// Decide o que fazer com um computador (instalação) que pede acesso. regs = linhas da aba Computadores desta pessoa: [{linha, inst, situacao}].
// conectar = true só quando a pessoa está COLANDO o convite (aí um computador revogado pode voltar, se houver vaga); numa consulta comum, revogado continua recusado.
function admDecidirComputador_(regs, inst, max, conectar) {
  var i, ativos = 0, meu = null;
  for (i = 0; i < regs.length; i++) {
    if (!admRevogado_(regs[i].situacao)) ativos++;
    if (regs[i].inst === inst) meu = regs[i];
  }
  if (meu && !admRevogado_(meu.situacao)) return { acao: 'ok', ativos: ativos, linha: meu.linha };
  if (meu && !conectar) return { acao: 'recusar', erro: 'computador desconectado', ativos: ativos };
  if (ativos < max) return { acao: meu ? 'reativar' : 'registrar', ativos: ativos, linha: meu ? meu.linha : 0 };
  return { acao: 'recusar', erro: 'limite de computadores', ativos: ativos };
}
function admGarantirComputadores_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(ADM_ABA.computadores);
  if (!sh) sh = ss.insertSheet(ADM_ABA.computadores);
  if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, ADM_CAB_COMPUTADORES.length).setValues([ADM_CAB_COMPUTADORES]); sh.getRange(1, 1, 1, ADM_CAB_COMPUTADORES.length).setFontWeight('bold'); sh.setFrozenRows(1); }
  return sh;
}
// Confere e registra o computador desta consulta. Devolve { recusa } (resposta pronta) ou { pcs: {emUso, max} }.
function admChecarComputador_(u, nome, codigo, b, agora, acao) {
  var inst = String(b.inst == null ? '' : b.inst).trim(), sh, vals, regs = [], r, max, d, maq = String(b.maquina || '').slice(0, 40), ver = String(b.versao || '').slice(0, 14), emUso;
  if (!/^[A-Za-z0-9_-]{6,60}$/.test(inst)) return { recusa: { ok: false, erro: 'extensão desatualizada' } };   // sem identificador não há como contar computadores
  sh = admGarantirComputadores_(); vals = sh.getDataRange().getValues(); max = admMaxPc_(u[ADM_U.MAXPC - 1]);
  for (r = 1; r < vals.length; r++) if (String(vals[r][1]).trim() === codigo) regs.push({ linha: r + 1, inst: String(vals[r][2]).trim(), situacao: vals[r][7] });
  d = admDecidirComputador_(regs, inst, max, acao === 'config' && b.conectar === true);
  if (acao === 'saude' && d.acao !== 'ok') return { recusa: { ok: false, erro: 'computador não registrado' } };
  if (d.acao === 'recusar') return { recusa: { ok: false, erro: d.erro, limite: max, emUso: d.ativos } };
  emUso = d.ativos;
  if (acao === 'config') {
    if (d.acao === 'registrar') { sh.appendRow([nome, codigo, inst, maq, agora, agora, ver, 'Liberado']); emUso++; }
    else {
      sh.getRange(d.linha, 6, 1, 2).setValues([[agora, ver]]);
      if (maq) sh.getRange(d.linha, 4).setValue(maq);
      if (d.acao === 'reativar') { sh.getRange(d.linha, 8).setValue('Liberado'); emUso++; }
    }
  }
  return { pcs: { emUso: emUso, max: max } };
}
// Desconecta (marca como Revogado) os computadores de uma pessoa, pelo nome ou código. Devolve quantos; -1 se não achou a pessoa.
function admLiberarComputadores_(texto) {
  var us = admAba_(ADM_ABA.usuarios), pc = admAba_(ADM_ABA.computadores), vals, v2, i, cod = '', alvo = admSemAcento_(texto), n = 0;
  if (!us || !pc || !alvo) return -1;
  vals = us.getDataRange().getValues();
  for (i = 1; i < vals.length; i++) {
    if (admSemAcento_(vals[i][ADM_U.NOME - 1]) === alvo || String(vals[i][ADM_U.CODIGO - 1]).trim().toLowerCase() === alvo) { cod = String(vals[i][ADM_U.CODIGO - 1]).trim(); break; }
  }
  if (!cod) return -1;
  v2 = pc.getDataRange().getValues();
  for (i = 1; i < v2.length; i++) if (String(v2[i][1]).trim() === cod && !admRevogado_(v2[i][7])) { pc.getRange(i + 1, 8).setValue('Revogado'); n++; }
  return n;
}
function admLiberarComputadores() {
  var ui; try { ui = SpreadsheetApp.getUi(); } catch (e) { return 0; }
  var r = ui.prompt('Liberar computadores', 'Nome (ou código) da pessoa. Os computadores dela serão desconectados na próxima consulta (até 10 minutos) e ela poderá se conectar de novo, até o limite de computadores dela.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return 0;
  var n = admLiberarComputadores_(r.getResponseText());
  ui.alert(n < 0 ? 'Não achei essa pessoa na aba Usuarios (escreva o nome exatamente como está na coluna Nome, ou o código).' : n + ' computador(es) desconectado(s). A pessoa pode colar o convite de novo, até o limite dela.');
  return n;
}
// Planilha de versão antiga: cria a aba Computadores e o título da coluna "Máx. computadores" na aba Usuarios (nunca mexe nos seus dados).
function admCompletar_() {
  var us = admAba_(ADM_ABA.usuarios);
  if (!us) return;
  admGarantirComputadores_();
  if (String(us.getRange(1, ADM_U.MAXPC).getValue() || '') === '') us.getRange(1, ADM_U.MAXPC).setValue(ADM_CAB_USUARIOS[ADM_U.MAXPC - 1]).setFontWeight('bold');
}

// ---------------------------------------------------------------- organização e aparência (cores, listas de escolha, grupos)
function admTipoLinha_(chave) {
  var k = String(chave == null ? '' : chave).trim(), i;
  if (k.charAt(0) === '▸') return 'grupo';
  if (k.indexOf('limite:') === 0) return 'limite';
  for (i = 0; i < ADM_RECURSOS.length; i++) if (ADM_RECURSOS[i][0] === k) return 'recurso';
  return k ? 'outro' : 'vazia';
}
function admTemGrupos_(vals) { var r; for (r = 1; r < vals.length; r++) if (String(vals[r][0] == null ? '' : vals[r][0]).charAt(0) === '▸') return true; return false; }
// Monta as linhas da aba Perfis (sem o cabeçalho) em grupos. porChave = { chave: linha existente }: os valores que já existem são mantidos; o que falta recebe o valor de exemplo
// do perfil conhecido (ou fica em branco = bloqueado). Linhas que a extensão não conhece vão para o grupo "OUTROS" sem perder nada.
function admMontarPerfis_(cab, porChave) {
  var nomes = ADM_NOMES_PERFIS.map(admSemAcento_), descs = {}, usadas = {}, out = [], extras = [], g, i, k, c;
  for (i = 0; i < ADM_RECURSOS.length; i++) descs[ADM_RECURSOS[i][0]] = ADM_RECURSOS[i][1];
  for (i = 0; i < ADM_LIMITES.length; i++) descs['limite:' + ADM_LIMITES[i][0]] = ADM_LIMITES[i][1];
  function vazia(titulo, desc) { var l = [titulo, desc], j; for (j = 2; j < cab.length; j++) l.push(''); return l; }
  function linhaDe(chave) {
    var base = porChave[chave], ex = ADM_PERFIS_EXEMPLO[chave], row = [chave, descs[chave]], j, idx;
    for (j = 2; j < cab.length; j++) {
      if (base) row.push(base[j] == null ? '' : base[j]);
      else { idx = nomes.indexOf(admSemAcento_(cab[j])); row.push(idx >= 0 && ex ? ex[idx] : ''); }
    }
    return row;
  }
  for (g = 0; g < ADM_GRUPOS.length; g++) {
    out.push(vazia(ADM_GRUPOS[g][0], ADM_GRUPOS[g][1]));
    for (i = 0; i < ADM_GRUPOS[g][2].length; i++) { k = ADM_GRUPOS[g][2][i]; usadas[k] = 1; out.push(linhaDe(k)); }
  }
  for (k in porChave) if (!usadas[k]) extras.push(porChave[k]);
  if (extras.length) {
    out.push(vazia('▸ OUTROS', 'Linhas que a extensão não reconhece (criadas por você ou de uma versão antiga). Não têm efeito.'));
    for (i = 0; i < extras.length; i++) { c = extras[i].slice(0, cab.length); while (c.length < cab.length) c.push(''); out.push(c); }
  }
  return out;
}
// Reorganiza a aba Perfis em grupos, mantendo TODOS os valores. Pelo menu pergunta antes e guarda uma cópia; em modo silencioso (semPergunta) só roda se a aba já é organizada.
function admOrganizarPerfis_(semPergunta) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = admAba_(ADM_ABA.perfis), vals, cab, porChave = {}, r, k, linhas, ui, bk;
  if (!sh || sh.getLastRow() < 1) return -1;
  vals = sh.getDataRange().getValues(); cab = vals[0];
  if (!semPergunta) {
    try { ui = SpreadsheetApp.getUi(); } catch (e) { return -1; }
    if (ui.alert('Organizar a aba Perfis?', 'As linhas serão colocadas em grupos, com lista de escolha e cores (verde = ativo, vermelho = bloqueado). TODOS os seus valores são mantidos e uma cópia da aba atual fica guardada. Continuar?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return 0;
  }
  for (r = 1; r < vals.length; r++) { k = String(vals[r][0] == null ? '' : vals[r][0]).trim(); if (!k || k.charAt(0) === '▸') continue; if (!porChave[k]) porChave[k] = vals[r]; }
  linhas = admMontarPerfis_(cab, porChave);
  if (!semPergunta) { bk = ss.insertSheet('Perfis (cópia ' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd HH.mm.ss') + ')'); bk.getRange(1, 1, vals.length, cab.length).setValues(vals); }
  sh.clear();
  // As regras de validação (lista, "número de 1 a 365"...) têm de sair ANTES de gravar: clear() NÃO as remove, e uma regra do layout anterior recusa o texto novo
  // (foi o erro "Exception: Número de 1 a 365" que parou o menu 9 no meio, deixando a aba pela metade).
  sh.getRange(1, 1, Math.max(sh.getMaxRows(), 1), Math.max(sh.getMaxColumns(), 1)).clearDataValidations();
  sh.getRange(1, 1, linhas.length + 1, cab.length).setValues([cab].concat(linhas));
  admFormatarPerfis_();
  return linhas.length;
}
function admOrganizarPerfis() {
  var n = admOrganizarPerfis_(false);
  try { if (n > 0) SpreadsheetApp.getUi().alert('Aba Perfis organizada em grupos, com cores e listas de escolha. A versão anterior ficou guardada numa aba "Perfis (cópia …)": pode apagar quando conferir.'); else if (n < 0) SpreadsheetApp.getUi().alert('Não consegui organizar: a aba Perfis não existe ainda (rode a preparação da planilha).'); } catch (e) { /* sem tela */ }
  return n;
}
function admRegraCor_(texto, par, ranges) {
  var b = SpreadsheetApp.newConditionalFormatRule();
  b = texto === null ? b.whenCellEmpty() : b.whenTextEqualTo(texto);
  return b.setBackground(par[0]).setFontColor(par[1]).setRanges(ranges).build();
}
function admValidacaoLimite_(lim) {
  var b = SpreadsheetApp.newDataValidation();
  b = typeof lim[0] === 'string' ? b.requireValueInList(lim, true).setHelpText('Escolha: ' + lim.join(' | ')) : b.requireNumberBetween(lim[0], lim[1]).setHelpText('Número de ' + lim[0] + ' a ' + lim[1] + '. Vazio = sem teto.');
  return b.setAllowInvalid(false).build();
}
// Aparência da aba Perfis: lista de escolha em TODA linha de recurso, cores (verde ativo, amarelo liberado-mas-desligado, vermelho bloqueado ou vazio), limites com lista/faixa, grupos em destaque.
function admFormatarPerfis_() {
  var sh = admAba_(ADM_ABA.perfis), vals, ncol, np, r, c, k, tipo, atual = null, corridas = [], ranges = [], regras = [], lista, lim, rangesModo = [];
  if (!sh || sh.getLastRow() < 1) return 0;
  vals = sh.getDataRange().getValues(); ncol = vals[0].length; np = ncol - 2;
  if (np < 1) return 0;
  sh.getRange(1, 1, 1, ncol).setFontWeight('bold').setBackground('#202124').setFontColor('#ffffff');
  sh.setFrozenRows(1); sh.setFrozenColumns(2); sh.setColumnWidth(1, 175); sh.setColumnWidth(2, 560);
  for (c = 3; c <= ncol; c++) sh.setColumnWidth(c, 125);
  lista = SpreadsheetApp.newDataValidation().requireValueInList(['ligado', 'desligado', 'bloqueado', 'obrigatorio'], true).setAllowInvalid(false)
    .setHelpText('ligado = liberado e já vem ligado | desligado = liberado, mas vem DESLIGADO (a pessoa pode ligar) | bloqueado = NÃO existe para a pessoa | obrigatorio = sempre ligado').build();
  for (r = 2; r <= vals.length; r++) {
    k = String(vals[r - 1][0] == null ? '' : vals[r - 1][0]).trim(); tipo = admTipoLinha_(k);
    if (tipo === 'recurso') {
      sh.getRange(r, 3, 1, np).setDataValidation(lista).setHorizontalAlignment('center');
      if (atual && atual.fim === r - 1) atual.fim = r; else { atual = { ini: r, fim: r }; corridas.push(atual); }
      continue;
    }
    atual = null;
    if (tipo === 'grupo') sh.getRange(r, 1, 1, ncol).setBackground('#434343').setFontColor('#ffffff').setFontWeight('bold');
    else if (tipo === 'limite') {
      sh.getRange(r, 1, 1, ncol).setBackground('#f1f3f4'); lim = ADM_LIMITES_VAL[k.slice(7)];
      if (lim) sh.getRange(r, 3, 1, np).setDataValidation(admValidacaoLimite_(lim)).setHorizontalAlignment('center');
      if (k === 'limite:roboModoMax') rangesModo.push(sh.getRange(r, 3, 1, np));
    }
  }
  for (r = 0; r < corridas.length; r++) ranges.push(sh.getRange(corridas[r].ini, 3, corridas[r].fim - corridas[r].ini + 1, np));
  if (ranges.length) regras = [admRegraCor_('ligado', ADM_COR.ligado, ranges), admRegraCor_('obrigatorio', ADM_COR.obrigatorio, ranges), admRegraCor_('desligado', ADM_COR.desligado, ranges), admRegraCor_('bloqueado', ADM_COR.bloqueado, ranges), admRegraCor_(null, ADM_COR.vazio, ranges)];
  if (rangesModo.length) regras = regras.concat([admRegraCor_('desligado', ADM_COR.bloqueado, rangesModo), admRegraCor_('sugerir', ADM_COR.ligado, rangesModo), admRegraCor_('automatico', ADM_COR.automatico, rangesModo)]);   // modo do robô: vermelho desligado, verde só sugere, AMARELO automático
  sh.setConditionalFormatRules(regras);
  return corridas.length;
}
// Usuarios: lista de perfis (os da aba Perfis), sim/não em verde/vermelho e número de computadores de 1 a 20.
function admFormatarUsuarios_() {
  var sh = admAba_(ADM_ABA.usuarios), pf = admAba_(ADM_ABA.perfis), nomes = [], vals, c, n = 1000, ativo, sim, nao;
  if (!sh) return;
  sh.getRange(1, 1, 1, ADM_CAB_USUARIOS.length).setFontWeight('bold').setBackground('#202124').setFontColor('#ffffff'); sh.setFrozenRows(1);
  if (pf && pf.getLastRow() >= 1) { vals = pf.getDataRange().getValues(); for (c = 2; c < vals[0].length; c++) if (String(vals[0][c] == null ? '' : vals[0][c]).trim()) nomes.push(String(vals[0][c]).trim()); }
  if (nomes.length) sh.getRange(2, ADM_U.PERFIL, n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(nomes, true).setAllowInvalid(false).setHelpText('Escolha um perfil da aba Perfis. Em branco (ou perfil que não existe) = a pessoa só vê o Acesso da equipe.').build());
  sh.getRange(2, ADM_U.ATIVO, n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['sim', 'não'], true).setAllowInvalid(false).setHelpText('sim = pode usar | não = desativada (tudo para na próxima consulta)').build()).setHorizontalAlignment('center');
  sh.getRange(2, ADM_U.MAXPC, n, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireNumberBetween(1, 20).setAllowInvalid(false).setHelpText('Quantos computadores a pessoa pode usar com o convite (de 1 a 20). Vazio = 1.').build()).setHorizontalAlignment('center');
  ativo = [sh.getRange(2, ADM_U.ATIVO, n, 1)];
  sh.setConditionalFormatRules([admRegraCor_('sim', ADM_COR.ligado, ativo), admRegraCor_('não', ADM_COR.bloqueado, ativo), admRegraCor_('nao', ADM_COR.bloqueado, ativo)]);
}
// Global: emergência e coleta de saúde viram sim/não coloridos (emergência SIM = vermelho: é um alarme).
function admFormatarGlobal_() {
  var sh = admAba_(ADM_ABA.global), vals, r, k, rangesEm = [], rangesCol = [], lista;
  if (!sh || sh.getLastRow() < 1) return;
  vals = sh.getDataRange().getValues();
  sh.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#202124').setFontColor('#ffffff');
  lista = SpreadsheetApp.newDataValidation().requireValueInList(['sim', 'nao'], true).setAllowInvalid(false).setHelpText('sim ou nao').build();
  for (r = 2; r <= vals.length; r++) {
    k = String(vals[r - 1][0] == null ? '' : vals[r - 1][0]).trim();
    if (k === 'emergencia') { sh.getRange(r, 2).setDataValidation(lista).setHorizontalAlignment('center'); rangesEm.push(sh.getRange(r, 2)); }
    if (k === 'coletarSaude') { sh.getRange(r, 2).setDataValidation(lista).setHorizontalAlignment('center'); rangesCol.push(sh.getRange(r, 2)); }
  }
  sh.setConditionalFormatRules([].concat(rangesEm.length ? [admRegraCor_('sim', ADM_COR.bloqueado, rangesEm), admRegraCor_('nao', ADM_COR.ligado, rangesEm)] : [], rangesCol.length ? [admRegraCor_('sim', ADM_COR.ligado, rangesCol), admRegraCor_('nao', ADM_COR.bloqueado, rangesCol)] : []));
}
function admFormatarExcecoes_() {
  var sh = admAba_(ADM_ABA.excecoes), chaves = [], i;
  if (!sh) return;
  sh.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#202124').setFontColor('#ffffff');
  for (i = 0; i < ADM_RECURSOS.length; i++) chaves.push(ADM_RECURSOS[i][0]);
  for (i = 0; i < ADM_LIMITES.length; i++) chaves.push(ADM_LIMITES[i][0]);
  sh.getRange(2, 2, 500, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(chaves, true).setAllowInvalid(false).setHelpText('Escolha o recurso ou limite que vale só para esta pessoa.').build());
  sh.setConditionalFormatRules([admRegraCor_('automatico', ADM_COR.automatico, [sh.getRange(2, 3, 500, 1)])]);   // modo automático do robô em amarelo
}
// Aba explicativa com as cores (sempre reescrita: é só documentação).
function admGarantirLegenda_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(ADM_ABA.legenda), l, r, cor = { 'ligado': 'ligado', 'obrigatorio': 'obrigatorio', 'desligado': 'desligado', 'bloqueado': 'bloqueado', '(vazio)': 'vazio' }, negrito = [], modo = {};
  if (!sh) sh = ss.insertSheet(ADM_ABA.legenda);
  l = [['LEGENDA DA ABA PERFIS', ''], ['ligado', 'LIBERADO e já vem LIGADO. A pessoa pode desligar. (VERDE)'], ['obrigatorio', 'LIBERADO e TRAVADO ligado: a pessoa não consegue desligar. (VERDE ESCURO)'],
    ['desligado', 'LIBERADO, mas vem DESLIGADO: a pessoa VÊ a função e pode ligar. Atenção: isto NÃO é "desativado" (use bloqueado para isso). (LARANJA)'], ['bloqueado', 'NÃO EXISTE para a pessoa: some da tela e não funciona. É o jeito de desativar. (VERMELHO)'],
    ['(vazio)', 'Igual a bloqueado: nada vem liberado de fábrica. (VERMELHO CLARO)'], ['', ''],
    ['MODO DO ROBÔ (limite:roboModoMax)', ''], ['desligado', 'o robô fica desligado para a pessoa. (VERMELHO)'], ['sugerir', 'o robô só SUGERE as respostas e você confirma: é o padrão quando a célula está vazia. (VERDE)'], ['automatico', 'o robô RESPONDE SOZINHO aos clientes: atenção. (AMARELO)'], ['', ''],
    ['DEPENDÊNCIAS', ''], ['diagAvancado', 'mora dentro da aba Diagnóstico: libere também "diag". (O Laboratório tem a própria aba, na área "Em teste".)'], ['atendente', 'o robô precisa de "cfgIA" (a chave do Gemini da pessoa).'],
    ['iaAudio', 'transcrever áudios é do robô: precisa de "atendente".'], ['', ''], ['Menu AtendeZap Admin', '7. Conferir perfis avisa as combinações que não funcionam.']];
  sh.clear(); sh.getRange(1, 1, l.length, 2).setValues(l);
  for (r = 1; r <= l.length; r++) if (/^[A-ZÀ-Ú][A-ZÀ-Ú (). :a-z]*$/.test(l[r - 1][0]) && l[r - 1][1] === '' && l[r - 1][0] !== '') sh.getRange(r, 1, 1, 2).setFontWeight('bold');
  sh.setColumnWidth(1, 230); sh.setColumnWidth(2, 700);
  for (r = 2; r <= 6; r++) sh.getRange(r, 1).setBackground(ADM_COR[cor[l[r - 1][0]]][0]).setFontColor(ADM_COR[cor[l[r - 1][0]]][1]);
  modo = { 9: 'bloqueado', 10: 'ligado', 11: 'automatico' };
  for (r in modo) sh.getRange(Number(r), 1).setBackground(ADM_COR[modo[r]][0]).setFontColor(ADM_COR[modo[r]][1]);
}
function admFormatarTudo_() {
  var fs = [admFormatarPerfis_, admFormatarUsuarios_, admFormatarGlobal_, admFormatarExcecoes_, admGarantirLegenda_], i;
  if (!admAba_(ADM_ABA.usuarios)) return;   // planilha ainda não preparada: não cria nada
  for (i = 0; i < fs.length; i++) { try { fs[i](); } catch (e) { /* a aparência nunca derruba a planilha */ } }
}

function admVenceu_(v, agora) {
  if (v === '' || v == null) return false;
  var d = v instanceof Date ? v : null, m;
  if (!d && (m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v).trim()))) d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (!d || isNaN(d.getTime())) return false;
  var fim = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
  return agora.getTime() > fim.getTime();
}
// Monta a configuração de UMA pessoa: coluna do perfil + exceções dela + globais. perfisVals = toda a aba Perfis (com cabeçalho); excecoesVals = aba Excecoes; globalVals = aba Global.
function admMontarConfig_(perfil, codigo, perfisVals, excecoesVals, globalVals) {
  var recursos = {}, limites = {}, glob = {}, i, col = -1, cab = perfisVals[0] || [], r, k, v, validos = {}, vl = {};
  for (i = 0; i < ADM_RECURSOS.length; i++) validos[ADM_RECURSOS[i][0]] = 1;
  for (i = 0; i < ADM_LIMITES.length; i++) vl['limite:' + ADM_LIMITES[i][0]] = ADM_LIMITES[i][0];
  for (i = 2; i < cab.length; i++) if (admSemAcento_(cab[i]) === admSemAcento_(perfil)) { col = i; break; }
  for (r = 1; r < perfisVals.length; r++) {
    k = String(perfisVals[r][0] || '').trim(); v = col >= 0 ? perfisVals[r][col] : '';
    if (v === '' || v == null) continue;
    if (validos[k]) recursos[k] = String(v).trim(); else if (vl[k]) limites[vl[k]] = String(v).trim();
  }
  for (r = 1; r < excecoesVals.length; r++) { // Excecoes: Código | Recurso | Valor
    if (String(excecoesVals[r][0] || '').trim() !== codigo) continue;
    k = String(excecoesVals[r][1] || '').trim(); v = excecoesVals[r][2];
    if (v === '' || v == null) continue;
    if (validos[k]) recursos[k] = String(v).trim(); else if (vl['limite:' + k]) limites[k] = String(v).trim(); else if (vl[k]) limites[vl[k]] = String(v).trim();
  }
  for (r = 1; r < globalVals.length; r++) { k = String(globalVals[r][0] || '').trim(); if (k) glob[k] = globalVals[r][1]; }
  return { recursos: recursos, limites: limites, global: {
    emergencia: admSim_(glob.emergencia) ? 'sim' : 'nao', emergenciaMensagem: String(glob.emergenciaMensagem || ''), versaoMinima: String(glob.versaoMinima || ''), aviso: String(glob.aviso || ''),
    coletarSaude: admSim_(glob.coletarSaude) ? 'sim' : 'nao', consultaMin: glob.consultaMin, saudeMin: glob.saudeMin, validadeOfflineDias: glob.validadeOfflineDias } };
}
// Quem precisa de alerta: robô LIGADO sem sinal há mais de vigiaMin e ainda não alertado; e quem VOLTOU (alertado e com sinal recente). linhas = valores da aba Usuarios (sem cabeçalho).
function admQuemAlertar_(linhas, agora, vigiaMin) {
  var out = { alertar: [], voltou: [] }, i, l, ativo, rob, sinal, passou;
  for (i = 0; i < linhas.length; i++) {
    l = linhas[i]; ativo = admSim_(l[ADM_U.ATIVO - 1]); rob = admSemAcento_(l[ADM_U.ROBO - 1]); sinal = l[ADM_U.SINAL - 1];
    if (!ativo || !(sinal instanceof Date)) continue;
    passou = (agora.getTime() - sinal.getTime()) / 60000;
    if (rob.indexOf('ligado') === 0 && passou > vigiaMin && !l[ADM_U.ALERTADO - 1]) out.alertar.push(i);
    else if (l[ADM_U.ALERTADO - 1] && passou <= vigiaMin) out.voltou.push(i);
  }
  return out;
}
function admAba_(nome) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nome); }
function admLerAba_(nome) { var sh = admAba_(nome); return sh && sh.getLastRow() > 0 ? sh.getDataRange().getValues() : [[]]; }

// ---------------------------------------------------------------- web app
function doGet(e) { return admJson_({ ok: true, admin: true, versao: ADM_VERSAO }); }   // nada sensível: só confirma que o endereço é este script

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    var b = JSON.parse((e && e.postData && e.postData.contents) || '{}'), acao = String(b.acao || '');
    if (acao === 'ping') return admJson_({ ok: true, admin: true, versao: ADM_VERSAO });
    var codigo = String(b.codigo || '').trim(), agora = new Date(), sh = admAba_(ADM_ABA.usuarios);
    if (!sh || !/^[A-Za-z0-9]{8,64}$/.test(codigo)) { Utilities.sleep(400); return admJson_({ ok: false, erro: 'acesso negado' }); }
    var vals = sh.getDataRange().getValues(), linha = -1, i;
    for (i = 1; i < vals.length; i++) if (String(vals[i][ADM_U.CODIGO - 1]).trim() === codigo) { linha = i; break; }
    if (linha < 0) { Utilities.sleep(400); return admJson_({ ok: false, erro: 'acesso negado' }); }   // não diz se o código existe
    var u = vals[linha], nome = String(u[ADM_U.NOME - 1] || ''), perfil = String(u[ADM_U.PERFIL - 1] || '');
    if (!admSim_(u[ADM_U.ATIVO - 1])) return admJson_({ ok: false, desativado: true, erro: 'desativado' });
    if (admVenceu_(u[ADM_U.VALIDADE - 1], agora)) return admJson_({ ok: false, desativado: true, erro: 'validade vencida' });
    var pc = { pcs: null };
    if (acao === 'config' || acao === 'saude') { pc = admChecarComputador_(u, nome, codigo, b, agora, acao); if (pc.recusa) return admJson_(pc.recusa); }   // limite de computadores por convite
    var global = admLerAba_(ADM_ABA.global), cfg = admMontarConfig_(perfil, codigo, admLerAba_(ADM_ABA.perfis), admLerAba_(ADM_ABA.excecoes), global);
    if (acao === 'config') {
      sh.getRange(linha + 1, ADM_U.ULTIMA, 1, 3).setValues([[agora, String(b.versao || '').slice(0, 14), String(b.inst || '').slice(0, 40)]]);
      var corpo = { nome: nome, perfil: perfil, recursos: cfg.recursos, limites: cfg.limites, global: cfg.global };
      return admJson_({ ok: true, nome: nome, perfil: perfil, recursos: cfg.recursos, limites: cfg.limites, global: cfg.global, pcs: pc.pcs, hash: admHash_(JSON.stringify(corpo)), agora: agora.getTime() });
    }
    if (acao === 'saude') {
      if (cfg.global.coletarSaude !== 'sim') return admJson_({ ok: true, ignorado: true });
      admRegistrarSaude_(sh, linha + 1, nome, b.dados, agora);
      return admJson_({ ok: true });
    }
    return admJson_({ ok: false, erro: 'ação desconhecida' });
  } catch (err) {
    return admJson_({ ok: false, erro: 'erro no script: ' + String(err && err.message || err).slice(0, 120) });
  } finally { try { lock.releaseLock(); } catch (x) { /* sem trava */ } }
}

function admRegistrarSaude_(shUsuarios, linhaUsuario, nome, d, agora) {
  if (!d || typeof d !== 'object') return;
  var txt = JSON.stringify(d); if (txt.length > 4000) return;   // resumo é pequeno; maior que isso não é o nosso formato
  var a = d.autoteste || {}, r = d.robo || {}, t = d.tempos || {}, ia = d.ia || {}, sh = admAba_(ADM_ABA.saude), n = function (v) { return typeof v === 'number' && isFinite(v) ? v : ''; };
  var falhas = []; for (var k in (ia.falhas || {})) falhas.push(String(k).slice(0, 14) + ' x' + n(ia.falhas[k]));
  var ruins = (Array.isArray(a.ruins) ? a.ruins : []).slice(0, 8).map(function (x) { return String(x).slice(0, 60); }).join('; ');
  sh.appendRow([agora, nome, String(d.v || '').slice(0, 14), String(d.wa || '').slice(0, 20), n(a.ok), n(a.warn), n(a.bad), n(a.skip), ruins, String(r.modo || '').slice(0, 12), r.ativo === true ? 'sim' : 'nao',
    n(r.respondeu24h), n(r.humano24h), n(r.ignorado24h), n(r.iaFalhou24h), n(r.pendencias), n(t.iaS), n(t.esperouS), falhas.join(', '), txt]);
  shUsuarios.getRange(linhaUsuario, ADM_U.ROBO, 1, 2).setValues([[(r.ativo === true ? 'ligado (' : 'desligado (') + String(r.modo || '').slice(0, 12) + ')', agora]]);
  var ultima = sh.getLastRow(); if (ultima > ADM_LIMITE_SAUDE + 500) sh.deleteRows(2, ultima - 1 - ADM_LIMITE_SAUDE);   // fica o cabeçalho + as ADM_LIMITE_SAUDE mais novas
}

// ---------------------------------------------------------------- menu do administrador
// Menu instalado como GATILHO PRÓPRIO (e não pela função "onOpen"): assim não briga com o onOpen de outro script.
function admInstalarMenu() {
  var ja = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'admOnOpen'; });
  if (!ja) ScriptApp.newTrigger('admOnOpen').forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onOpen().create();
}
// Abas que NÃO são do painel e já têm conteúdo = esta planilha tem outro uso (e o painel não deveria ficar aqui).
function admOutrosDados_(ss) {
  var nossas = {}, k, abas = ss.getSheets(), i, nomes = [];
  for (k in ADM_ABA) nossas[ADM_ABA[k]] = 1;
  for (i = 0; i < abas.length; i++) if (!nossas[abas[i].getName()] && abas[i].getLastRow() > 0) nomes.push(abas[i].getName());
  return nomes;
}

function admOnOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('AtendeZap Admin').addItem('1. Preparar planilha (primeira vez)', 'admPrepararPlanilha').addItem('2. Gerar códigos e convites', 'admGerarConvites')
      .addItem('3. Limpar saúde antiga (60 dias)', 'admLimparSaudeAntiga').addItem('4. Ligar o vigia do robô', 'admLigarVigia').addItem('5. Verificar robôs agora', 'admVigiar').addItem('6. Atualizar lista de recursos', 'admAtualizarRecursos').addItem('7. Conferir perfis (combinações que não funcionam)', 'admConferirPerfis').addItem('8. Liberar computadores de uma pessoa', 'admLiberarComputadores').addItem('9. Organizar e colorir a aba Perfis', 'admOrganizarPerfis').addToUi();
  } catch (e) { /* fora da planilha */ }
  try { admCompletar_(); } catch (e3) { /* planilha ainda não preparada */ }
  try { admAtualizarRecursos(true); } catch (e2) { /* sem aba Perfis ainda */ }
  admFormatarTudo_();   // listas de escolha e cores em todas as linhas (idempotente)   // ao abrir, completa a aba Perfis com os recursos novos (sem alerta e sem mexer no que você preencheu)
}

// Depois de colar uma versão nova do script: ACRESCENTA na aba Perfis as linhas de recursos/limites que ainda não existem (nunca mexe no que você já preencheu).
// Nas colunas dos perfis de exemplo (Novo, Básico, Com robô, Administrador) já entra o valor sugerido; nas suas colunas, fica em branco = bloqueado.
function admAtualizarRecursos(silencioso) {
  var sh = admAba_(ADM_ABA.perfis), vals, cab, tem = {}, todos, i, c, r, linha, ex, idx, novas = [], descs = {}, k, mudou = 0;
  if (!sh || sh.getLastRow() < 1) return 0;
  vals = sh.getDataRange().getValues(); cab = vals[0];
  for (r = 1; r < vals.length; r++) tem[String(vals[r][0]).trim()] = 1;
  todos = ADM_RECURSOS.map(function (x) { return [x[0], x[1]]; }).concat(ADM_LIMITES.map(function (x) { return ['limite:' + x[0], x[1]]; }));
  for (i = 0; i < todos.length; i++) descs[todos[i][0]] = todos[i][1];
  for (r = 1; r < vals.length; r++) {   // só a coluna "O que é" (texto explicativo, com as dependências); os valores dos perfis nunca são tocados
    k = String(vals[r][0]).trim();
    if (descs[k] && String(vals[r][1]) !== descs[k]) { sh.getRange(r + 1, 2).setValue(descs[k]); mudou++; }
  }
  for (i = 0; i < todos.length; i++) {
    if (tem[todos[i][0]]) continue;
    linha = [todos[i][0], todos[i][1]]; ex = ADM_PERFIS_EXEMPLO[todos[i][0]];
    for (c = 2; c < cab.length; c++) {
      idx = ADM_NOMES_PERFIS.map(admSemAcento_).indexOf(admSemAcento_(cab[c]));
      linha.push(idx >= 0 && ex ? ex[idx] : '');
    }
    novas.push(linha);
  }
  if (novas.length) sh.getRange(sh.getLastRow() + 1, 1, novas.length, novas[0].length).setValues(novas);
  if (novas.length && admTemGrupos_(vals)) admOrganizarPerfis_(true);   // aba já organizada por este script: os recursos novos entram no grupo certo
  if (!silencioso) { try { SpreadsheetApp.getUi().alert(novas.length ? novas.length + ' linha(s) nova(s) na aba Perfis. Preencha as colunas dos seus perfis (vazio = bloqueado) e use o menu "7. Conferir perfis".' : 'A aba Perfis já está com todos os recursos' + (mudou ? ' (descrições atualizadas).' : '.')); } catch (e) { /* sem tela */ } }
  return novas.length;
}

// Mostra as combinações que não funcionam nos perfis (menu 7).
function admConferirPerfis() {
  var p = admProblemasPerfis_(admLerAba_(ADM_ABA.perfis));
  try { SpreadsheetApp.getUi().alert('Conferência dos perfis:\n\n' + (p.length ? p.join('\n\n') : 'Tudo certo: nenhum perfil com combinação que não funciona.')); } catch (e) { /* sem tela */ }
  return p;
}

// Cria só o que falta (nunca apaga nem sobrescreve o que você já preencheu).
function admPrepararPlanilha() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), nomes = [ADM_ABA.usuarios, ADM_ABA.perfis, ADM_ABA.excecoes, ADM_ABA.global, ADM_ABA.saude, ADM_ABA.computadores], i, sh;
  var outras = admOutrosDados_(ss);
  if (outras.length) {   // planilha com outro uso: pergunta antes de criar qualquer coisa
    var ui; try { ui = SpreadsheetApp.getUi(); } catch (e) { return; }
    var r = ui.alert('Atenção: esta planilha já tem outros dados', 'Abas com dados: ' + outras.join(', ') + '.\n\nO painel de controle deve ficar numa planilha NOVA e só sua: quem tiver acesso a esta veria os códigos de todos e poderia mudar as permissões. Criar as abas do painel aqui mesmo assim?', ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;
  }
  for (i = 0; i < nomes.length; i++) if (!ss.getSheetByName(nomes[i])) ss.insertSheet(nomes[i]);
  sh = ss.getSheetByName(ADM_ABA.usuarios); if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, ADM_CAB_USUARIOS.length).setValues([ADM_CAB_USUARIOS]); sh.getRange(1, 1, 1, ADM_CAB_USUARIOS.length).setFontWeight('bold'); sh.setFrozenRows(1);
    sh.getRange(2, 1, 1, 5).setValues([['Exemplo (apague ou troque)', '', 'Com robô', 'sim', '']]); }
  sh = ss.getSheetByName(ADM_ABA.perfis);
  if (sh.getLastRow() === 0) {   // já nasce organizada em grupos (a aparência é aplicada pelo admOnOpen no fim)
    var cab0 = ['Recurso', 'O que é'].concat(ADM_NOMES_PERFIS), linhas0 = [cab0].concat(admMontarPerfis_(cab0, {}));
    sh.getRange(1, 1, linhas0.length, cab0.length).setValues(linhas0);
  }
  sh = ss.getSheetByName(ADM_ABA.excecoes); if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, 4).setValues([['Código da pessoa', 'Recurso ou limite', 'Valor', 'Observação']]); sh.getRange(1, 1, 1, 4).setFontWeight('bold'); sh.setFrozenRows(1); }
  sh = ss.getSheetByName(ADM_ABA.global); if (sh.getLastRow() === 0) { sh.getRange(1, 1, ADM_GLOBAL.length + 1, 3).setValues([['Chave', 'Valor', 'O que faz']].concat(ADM_GLOBAL)); sh.getRange(1, 1, 1, 3).setFontWeight('bold'); sh.setFrozenRows(1); }
  admGarantirComputadores_();
  sh = ss.getSheetByName(ADM_ABA.saude); if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, ADM_CAB_SAUDE.length).setValues([ADM_CAB_SAUDE]); sh.getRange(1, 1, 1, ADM_CAB_SAUDE.length).setFontWeight('bold'); sh.setFrozenRows(1); }
  try { admInstalarMenu(); admOnOpen(); } catch (e) { /* sem permissão para gatilho: o menu não aparece, mas as funções funcionam pelo editor */ }
  try { SpreadsheetApp.getUi().alert('Planilha preparada. Agora siga os passos 4 a 6 do começo do script (implantar, URL_EXEC, convites).'); } catch (e) { /* sem tela */ }
}

function admGerarConvites() {
  var sh = admAba_(ADM_ABA.usuarios), url = PropertiesService.getScriptProperties().getProperty('URL_EXEC') || '', vals, i, feitos = 0;
  if (!sh) return;
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) {
    try { SpreadsheetApp.getUi().alert('Falta a propriedade URL_EXEC (passo 5 do começo do script): o endereço /exec da implantação.'); } catch (e) { /* sem tela */ }
    return;
  }
  vals = sh.getDataRange().getValues();
  for (i = 1; i < vals.length; i++) {
    if (!String(vals[i][ADM_U.NOME - 1] || '').trim()) continue;
    var cod = String(vals[i][ADM_U.CODIGO - 1] || '').trim();
    if (!cod) { cod = admNovoCodigo_(); sh.getRange(i + 1, ADM_U.CODIGO).setValue(cod); }
    sh.getRange(i + 1, ADM_U.CONVITE).setValue(admCodificarConvite_(url, cod)); feitos++;
  }
  try { SpreadsheetApp.getUi().alert(feitos + ' convite(s) gerado(s) na coluna Convite. Mande cada um só para a pessoa certa.'); } catch (e) { /* sem tela */ }
}

function admLimparSaudeAntiga() {
  var sh = admAba_(ADM_ABA.saude), corte = new Date(new Date().getTime() - 60 * 864e5), vals, n = 0;
  if (!sh || sh.getLastRow() < 2) return 0;
  vals = sh.getDataRange().getValues();
  while (n < vals.length - 1 && vals[n + 1][0] instanceof Date && vals[n + 1][0].getTime() < corte.getTime()) n++;   // as linhas mais antigas ficam no começo
  if (n > 0) sh.deleteRows(2, n);
  return n;
}

function admLigarVigia() {
  var existe = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'admVigiar'; });
  if (!existe) ScriptApp.newTrigger('admVigiar').timeBased().everyMinutes(10).create();
  try { SpreadsheetApp.getUi().alert(existe ? 'O vigia já estava ligado.' : 'Vigia ligado: confere a cada 10 minutos. Preencha emailAlerta na aba Global.'); } catch (e) { /* sem tela */ }
}

function admVigiar() {
  var sh = admAba_(ADM_ABA.usuarios); if (!sh || sh.getLastRow() < 2) return { alertados: 0, voltaram: 0 };
  var glob = {}, gv = admLerAba_(ADM_ABA.global), r, vals = sh.getRange(2, 1, sh.getLastRow() - 1, ADM_CAB_USUARIOS.length).getValues(), agora = new Date();
  for (r = 1; r < gv.length; r++) glob[String(gv[r][0]).trim()] = gv[r][1];
  var vigiaMin = Number(glob.vigiaMin) > 0 ? Number(glob.vigiaMin) : 15, email = String(glob.emailAlerta || '').trim();
  var q = admQuemAlertar_(vals, agora, vigiaMin), i;
  for (i = 0; i < q.alertar.length; i++) {
    var l = vals[q.alertar[i]];
    if (email) MailApp.sendEmail(email, 'AtendeZap: robô de ' + l[ADM_U.NOME - 1] + ' sem sinal', 'O robô de ' + l[ADM_U.NOME - 1] + ' está LIGADO, mas não manda sinal há mais de ' + vigiaMin + ' minutos (último: ' + admDataBR_(l[ADM_U.SINAL - 1]) + '). O computador pode ter dormido ou a aba fechou.');
    sh.getRange(q.alertar[i] + 2, ADM_U.ALERTADO).setValue(agora);
  }
  for (i = 0; i < q.voltou.length; i++) {
    var v = vals[q.voltou[i]];
    if (email) MailApp.sendEmail(email, 'AtendeZap: robô de ' + v[ADM_U.NOME - 1] + ' voltou', 'O robô de ' + v[ADM_U.NOME - 1] + ' voltou a mandar sinal.');
    sh.getRange(q.voltou[i] + 2, ADM_U.ALERTADO).setValue('');
  }
  return { alertados: q.alertar.length, voltaram: q.voltou.length };
}
