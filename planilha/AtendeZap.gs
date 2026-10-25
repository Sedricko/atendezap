/**
 * AtendeZap — entrega os textos do Gerador de Anúncios para o WhatsApp (botão 🚚 da extensão) e guarda o APRENDIZADO DA IA.
 *
 * O QUE JÁ FAZIA (continua igual, sem senha, só leitura):
 *   - sem parâmetro  → textoListaCargas()          (lista de todas as cargas abertas)
 *   - ?id=9DA62645   → comAnuncio_(cargaPorId_(id)) (anúncio de uma carga, igual ao "Ver prévia")
 *
 * NOVO (v5) — aba "IA - Avaliação": uma linha por avaliação do atendimento (só números). A extensão só grava nela se esta versão (5) estiver colada.
 * NOVO (v4) — aba "IA - Conversas": o banco de conhecimento que o AtendeZap alimenta sozinho (pergunta do cliente + resposta sua, SEM dados pessoais). A extensão só grava nela se esta versão (4) estiver colada.
 * NOVO (v1.23) — abas de aprendizado da IA, protegidas por SENHA (TOKEN_IA abaixo):
 *   - POST  → grava linhas nas abas "IA - Demanda", "IA - Aprendizado" e "IA - Memória" (as abas são criadas sozinhas).
 *   - ?acao=memoria&token=…  → devolve as linhas ATIVAS da aba "IA - Memória" (você pode editar essa aba na planilha:
 *     escreva "Não" na coluna Ativo para a IA esquecer uma regra).
 *   O que a IA grava nunca é fórmula: textos que começam com = + - @ ganham um apóstrofo.
 *
 * COMO INSTALAR / ATUALIZAR:
 * 1. Planilha › Extensões › Apps Script › abra o arquivo AtendeZap › APAGUE o conteúdo e cole ESTE arquivo inteiro.
 * 2. Na linha  var TOKEN_IA = '';  (logo abaixo) escreva SUA senha entre as aspas (12 ou mais caracteres) e NÃO mexa em mais
 *    nenhuma linha do arquivo. Use a mesma senha no AtendeZap: Respostas rápidas › Memória IA › "Senha da planilha".
 * 3. Salvar › Implantar › Gerenciar implantações › ✏️ › Versão: "Nova versão" › Implantar.  (o link /exec continua o mesmo)
 *    Se for a primeira vez: Implantar › Nova implantação › App da Web › Executar como: Eu · Quem pode acessar: Qualquer pessoa.
 * Quem tiver o link consegue LER a lista de cargas (o mesmo texto que vai para os grupos); só quem souber a senha consegue gravar.
 */
var TOKEN_IA = '';   // ← ESCREVA SUA SENHA AQUI (12 ou mais caracteres). É a ÚNICA linha que você edita.

var ABAS_IA_ = {
  'IA - Demanda': ['Data', 'Intenção', 'Origem', 'Destino', 'Veículo', 'Carroceria', 'Carga', 'Peso', 'Resultado', 'Motivo', 'Pergunta (sem dados pessoais)', 'Tempo da IA (ms)', 'Cliente esperou (s)', 'Cliente demorou a responder (s)'],
  'IA - Aprendizado': ['Data', 'Tipo', 'Pergunta / texto', 'Resposta', 'Fonte', 'Status'],
  'IA - Memória': ['ID', 'Data', 'Tipo', 'Conteúdo', 'Ativo (Sim/Não)'],
  'IA - Tempos': ['Data', 'Quem', 'Medida', 'Segundos', 'Detalhe'],
  'IA - Conversas': ['Data', 'Pergunta (sem dados pessoais)', 'Resposta (sem dados pessoais)', 'Quem respondeu'],   // v4: banco de conhecimento (escuta automática do AtendeZap)
  'IA - Avaliação': ['Data', 'Período (dias)', 'Trocas', 'Com memória', 'Bateram com a memória', 'Diferentes da memória', 'Sem memória', 'Sem resposta', 'Tempo mediano (s)']   // v5: avaliação do atendimento (só números)
};
var VERSAO_IA_ = 5;   // o AtendeZap confere esta versão ao "Testar conexão" para avisar se o script está desatualizado

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.acao === 'memoria') return memoriaIA_(p);
  var texto;
  try {
    if (typeof leituraNova_ === 'function') leituraNova_();   // mesma leitura "fresca" que o painel faz
    if (p.id) {
      var c = comAnuncio_(cargaPorId_(String(p.id).replace(/^#/, '').trim()));
      texto = c && c.anuncio ? c.anuncio.texto : 'ERRO: carga ' + p.id + ' não encontrada na BASE.';
    } else {
      var r = textoListaCargas();
      texto = r && r.total ? r.texto : 'AVISO: nenhuma carga ativa no momento.';
    }
  } catch (err) {
    texto = 'ERRO na planilha: ' + err.message;
  }
  return ContentService.createTextOutput(String(texto)).setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    var b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!tokenOk_(b.token)) return json_({ ok: false, erro: senha_().length < 12 ? 'defina a senha TOKEN_IA no script (12 ou mais caracteres)' : 'senha (token) incorreta' });
    if (b.aba === 'ping') return json_({ ok: true, gravadas: 0, versao: VERSAO_IA_ });
    if (b.aba === 'robo') return robo_(b, false);
    if (b.aba === 'robo-livre') return robo_(b, true);
    if (b.aba === 'limpar') return limpar_(b);
    var cab = ABAS_IA_[b.aba];
    if (!cab) return json_({ ok: false, erro: 'aba não permitida' });
    var linhas = (b.linhas || []).slice(0, 200).map(function (l) {
      var r = []; for (var i = 0; i < cab.length; i++) r.push(celula_(l && l[i])); return r;
    });
    if (!linhas.length) return json_({ ok: true, gravadas: 0 });
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(b.aba) || ss.insertSheet(b.aba);
      if (sh.getLastRow() === 0) { sh.appendRow(cab); sh.setFrozenRows(1); sh.getRange(1, 1, 1, cab.length).setFontWeight('bold'); }
      else cabecalho_(sh, cab);   // aba antiga: completa só os títulos que faltam (colunas novas), sem mexer nos dados
      sh.getRange(sh.getLastRow() + 1, 1, linhas.length, cab.length).setValues(linhas);
    } finally { lock.releaseLock(); }
    return json_({ ok: true, gravadas: linhas.length });
  } catch (err) {
    return json_({ ok: false, erro: err.message });
  }
}

function memoriaIA_(p) {
  if (!tokenOk_(p.token)) return json_({ ok: false, erro: 'senha (token) incorreta' });
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('IA - Memória'), itens = [];
  if (sh && sh.getLastRow() > 1) {
    var ultimos = {};   // a ÚLTIMA linha de cada ID vale (assim "Não" numa linha nova desliga uma regra antiga)
    sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues().forEach(function (r) { if (r[0]) ultimos[String(r[0])] = r; });
    Object.keys(ultimos).forEach(function (id) {
      var r = ultimos[id], ativo = String(r[4]).toLowerCase();
      if (ativo === 'não' || ativo === 'nao') return;
      if (r[3]) itens.push({ id: id, tipo: String(r[2] || 'fato'), texto: String(r[3]) });
    });
  }
  return json_({ ok: true, itens: itens });
}

// Trava de robô único: só UM computador responde por vez. Quem chama primeiro fica com o robô e renova a cada minuto; se parar por 2,5 min, outro assume.
function robo_(b, liberar) {
  var inst = String(b.inst || '').slice(0, 40);
  if (!inst) return json_({ ok: false, erro: 'sem identificação do computador' });
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var p = PropertiesService.getScriptProperties(), agora = Date.now(), cur = null;
    try { cur = JSON.parse(p.getProperty('ROBO_IA') || 'null'); } catch (e) { cur = null; }
    var vivo = cur && agora - cur.t < 150000;
    if (liberar) { if (cur && cur.inst === inst) p.deleteProperty('ROBO_IA'); return json_({ ok: true, dono: false, livre: true }); }
    if (vivo && cur.inst !== inst) return json_({ ok: true, dono: false, outro: { nome: String(cur.nome || ''), ha: Math.round((agora - cur.t) / 1000) } });
    p.setProperty('ROBO_IA', JSON.stringify({ inst: inst, nome: String(b.nome || '').slice(0, 40), t: agora }));
    return json_({ ok: true, dono: true });
  } finally { lock.releaseLock(); }
}
// Limpeza (LGPD): apaga das abas de demanda, aprendizado e tempos as linhas mais antigas que N dias (coluna A = data). A memória aprovada não é tocada.
function limpar_(b) {
  var dias = Math.max(1, Math.min(3650, Number(b.dias) || 0));
  if (!Number(b.dias)) return json_({ ok: false, erro: 'informe quantos dias manter' });
  var limite = Date.now() - dias * 86400000, ss = SpreadsheetApp.getActiveSpreadsheet(), total = 0;
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    ['IA - Demanda', 'IA - Aprendizado', 'IA - Tempos'].forEach(function (nome) {
      var sh = ss.getSheetByName(nome); if (!sh || sh.getLastRow() < 2) return;
      var datas = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues(), n = 0;
      for (var i = 0; i < datas.length; i++) { var t = dataLinha_(datas[i][0]); if (t !== null && t < limite) n++; else break; }   // só o bloco antigo do começo (as linhas entram em ordem)
      if (n) { sh.deleteRows(2, n); total += n; }
    });
  } finally { lock.releaseLock(); }
  return json_({ ok: true, removidas: total });
}
function dataLinha_(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') return v.getTime();
  var m = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ,]+(\d{1,2}):(\d{2}))?/.exec(String(v || ''));
  return m ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)).getTime() : null;
}
function senha_() { return String(TOKEN_IA || '').trim(); }
// Completa os títulos de colunas que ainda não existem (ex.: as colunas de tempo na aba "IA - Demanda" criada antes).
function cabecalho_(sh, cab) {
  var r = sh.getRange(1, 1, 1, cab.length), atual = r.getValues()[0], mudou = false;
  for (var i = 0; i < cab.length; i++) if (!String(atual[i] || '').trim()) { atual[i] = cab[i]; mudou = true; }
  if (mudou) r.setValues([atual]).setFontWeight('bold');
}
function tokenOk_(t) { return senha_().length >= 12 && String(t || '').trim() === senha_(); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
// Nunca deixa um texto virar fórmula (o conteúdo pode vir de clientes) e limita o tamanho.
function celula_(v) {
  var t = String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, 900);
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}
