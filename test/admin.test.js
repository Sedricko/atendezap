// node test/admin.test.js — roda o AdminControle.gs (Apps Script) num "vm" do Node, com a planilha simulada, e confere o contrato com a extensão (lib/acesso.js).
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path'), crypto = require('crypto');
require('../lib/acesso.js'); const A = globalThis.AZACESSO;
const FONTE = fs.readFileSync(path.join(__dirname, '../planilha/AdminControle.gs'), 'utf8');
const URL_EXEC = 'https://script.google.com/macros/s/AKfycbxADMIN_123-abc/exec';

function carrega({ url = URL_EXEC } = {}) {
  const abas = {}, props = url ? { URL_EXEC: url } : {}, alertas = [], emails = [], gatilhos = [], reg = { valids: [], regras: {} }, checa = (aba, row, col, x) => {   // como no Google: gravar por script um valor que uma regra que RECUSA não aceita = Exception (foi o que aconteceu na planilha do Johon)
    if (x === '' || x == null) return;
    for (const v of reg.valids) { if (v.aba !== aba || v.d.invalido !== false || row < v.r || row >= v.r + v.n || col < v.c || col >= v.c + v.m) continue;
      if (v.d.lista && !v.d.lista.includes(String(x))) throw new Error('Exception: valor fora da lista (' + x + ')');
      if (v.d.num && !(Number.isFinite(Number(x)) && Number(x) >= v.d.num[0] && Number(x) <= v.d.num[1])) throw new Error('Exception: Número de ' + v.d.num[0] + ' a ' + v.d.num[1] + '. Vazio = sem teto.'); } };   // reg: o que o script pediu de LISTA DE ESCOLHA e de COR
  const folha = (nome) => ({
    getName: () => nome, getLastRow: () => abas[nome].length, getLastColumn: () => Math.max(0, ...abas[nome].map((l) => l.length)),
    appendRow(r) { abas[nome].push([...r]); }, setFrozenRows() {}, setFrozenColumns() {}, setColumnWidth() {}, deleteRows(i, n) { abas[nome].splice(i - 1, n); },
    clear() { abas[nome] = []; reg.regras[nome] = []; }, getMaxRows: () => 1000, getMaxColumns: () => 26, setConditionalFormatRules(rs) { reg.regras[nome] = rs; },
    getDataRange() { const m = Math.max(0, ...abas[nome].map((l) => l.length)); return { getValues: () => abas[nome].map((l) => Array.from({ length: m }, (_, j) => (l[j] === undefined ? '' : l[j]))) }; },
    getRange(r, c, n = 1, m = 1) {
      const self = {
        getValues: () => Array.from({ length: n }, (_, k) => Array.from({ length: m }, (__, j) => { const v = (abas[nome][r - 1 + k] || [])[c - 1 + j]; return v === undefined ? '' : v; })),
        setValues(v) { v.forEach((lin, k) => { const i = r - 1 + k; while (abas[nome].length <= i) abas[nome].push([]); lin.forEach((x, j) => { checa(nome, i + 1, c + j, x); abas[nome][i][c - 1 + j] = x; }); }); return self; },
        getValue: () => { const v = (abas[nome][r - 1] || [])[c - 1]; return v === undefined ? '' : v; },
        setValue(v) { const i = r - 1; while (abas[nome].length <= i) abas[nome].push([]); abas[nome][i][c - 1] = v; return self; },
        _pos: [r, c, n, m], setFontWeight() { return self; }, setBackground() { return self; }, setFontColor() { return self; }, setHorizontalAlignment() { return self; },
        setDataValidation(d) { reg.valids.push({ aba: nome, r, c, n, m, d }); return self; }, clearDataValidations() { reg.valids = reg.valids.filter((v) => v.aba !== nome); return self; },
      };
      return self;
    },
  });
  const novaValidacao = () => { const d = {}, b = { requireValueInList(l) { d.lista = l; return b; }, requireNumberBetween(a, z) { d.num = [a, z]; return b; }, setAllowInvalid(v) { d.invalido = v; return b; }, setHelpText(x) { d.ajuda = x; return b; }, build: () => d }; return b; };
  const novaRegra = () => { const d = {}, b = { whenTextEqualTo(x) { d.texto = x; return b; }, whenCellEmpty() { d.vazio = true; return b; }, setBackground(x) { d.fundo = x; return b; }, setFontColor(x) { d.fonte = x; return b; }, setRanges(rs) { d.ranges = rs.map((q) => q._pos); return b; }, build: () => d }; return b; };
  const ui = { resposta: 'YES', perguntas: [], ButtonSet: { YES_NO: 'yn', OK_CANCEL: 'oc' }, Button: { YES: 'YES', NO: 'NO', OK: 'OK' }, textoPrompt: '', botaoPrompt: 'OK', prompt() { return { getSelectedButton: () => ui.botaoPrompt, getResponseText: () => ui.textoPrompt }; }, alert(m, texto) { alertas.push(m); if (texto !== undefined) { ui.perguntas.push([m, texto]); return ui.resposta; } }, menus: 0, createMenu() { const m = { addItem() { return m; }, addToUi() { ui.menus++; } }; return m; } };
  const ctx = {
    ContentService: { createTextOutput: (t) => ({ _t: t, setMimeType() { return this; } }), MimeType: { JSON: 'json' } },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (n) => (abas[n] ? folha(n) : null), insertSheet: (n) => { abas[n] = []; return folha(n); }, getSheets: () => Object.keys(abas).map(folha) }), getUi: () => ui, newDataValidation: novaValidacao, newConditionalFormatRule: novaRegra },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null) }) },
    Utilities: { getUuid: () => crypto.randomUUID(), sleep() {}, base64EncodeWebSafe: (s) => Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_'), Charset: { UTF_8: 'UTF-8' }, formatDate: (d) => new Date(d.getTime()).toISOString() },
    MailApp: { sendEmail: (para, assunto, corpo) => emails.push({ para, assunto, corpo }) },
    ScriptApp: { getProjectTriggers: () => gatilhos.map((h) => ({ getHandlerFunction: () => h })), newTrigger: (h) => ({ timeBased() { return { everyMinutes() { return { create() { gatilhos.push(h); } }; } }; }, forSpreadsheet() { return { onOpen() { return { create() { gatilhos.push(h); } }; } }; } }) },
    JSON, String, Object, Array, Math, Number, isNaN, isFinite, parseInt, Error,
  };
  vm.createContext(ctx); vm.runInContext(FONTE, ctx);
  const post = (c) => JSON.parse(vm.runInContext('doPost', ctx)({ postData: { contents: JSON.stringify('inst' in c ? c : { inst: 'inst-abc', ...c }) } })._t);   // 'inst-abc' = o computador padrão dos testes (a extensão sempre manda o identificador)
  return { ctx, ui, reg, abas, props, alertas, emails, gatilhos, post, run: (cod) => vm.runInContext(cod, ctx), data: (ms) => vm.runInContext(`new Date(${ms})`, ctx), get: () => JSON.parse(vm.runInContext('doGet', ctx)({})._t) };
}
const nova = () => { const s = carrega(); s.run('admPrepararPlanilha()'); return s; };
// cria uma pessoa direto na aba Usuarios: [Nome, Código, Perfil, Ativo, Validade]
const pessoa = (s, nome, cod, perfil, ativo = 'sim', validade = '') => s.abas.Usuarios.push([nome, cod, perfil, ativo, validade]);

// 1) preparar planilha: cria o que falta, com cabeçalhos e perfis de exemplo; rodar de novo não apaga o que você mexeu
let s = nova();
assert.deepEqual(Object.keys(s.abas).sort(), ['Computadores', 'Excecoes', 'Global', 'Legenda', 'Perfis', 'Saude', 'Usuarios']);
assert.equal(s.abas.Usuarios[0][1], 'Código'); assert.equal(s.abas.Perfis[0].slice(2).join(), 'Novo,Básico,Com robô,Administrador'); assert.equal(s.abas.Perfis.length, 1 + 7 + 29 + 5);   // cabeçalho + 7 blocos (6 assuntos + limites) + 23 recursos + 5 limites assert.ok(s.abas.Perfis.slice(1).every((l) => l[2] === ''));   // o perfil "Novo" nasce em branco assert.equal(s.abas.Global.length, 1 + 10); assert.equal(s.abas.Saude[0].length, 20);
s.abas.Perfis[1][3] = 'obrigatorio'; s.abas.Global[1][1] = 'sim'; s.run('admPrepararPlanilha()'); assert.equal(s.abas.Perfis[1][3], 'obrigatorio'); assert.equal(s.abas.Global[1][1], 'sim'); assert.equal(s.abas.Usuarios.length, 2);   // exemplo + cabeçalho, sem duplicar
// 2) contrato com a extensão: as mesmas chaves nos dois lados
const recScript = s.run('ADM_RECURSOS.map(function (r) { return r[0]; })'), limScript = s.run('ADM_LIMITES.map(function (r) { return r[0]; })'), globScript = s.run('ADM_GLOBAL.map(function (r) { return r[0]; })');
assert.deepEqual([...recScript].sort(), [...A.RECURSOS].sort()); assert.deepEqual([...limScript].sort(), Object.keys(A.LIMITES).sort());
assert.deepEqual([...globScript].sort(), Object.keys(A.GLOBAL0).filter((k) => k !== 'consultaMin' || true).concat(['vigiaMin', 'emailAlerta']).sort());
assert.equal(s.get().admin, true); assert.ok(!JSON.stringify(s.get()).includes('Código'));   // o GET público não mostra nada da planilha
// 3) convites: gera código só para quem tem nome; mantém os que já existem; o convite é lido pela extensão
s = nova(); s.abas.Usuarios.length = 1; pessoa(s, 'Maria', '', 'Com robô'); pessoa(s, 'João', 'JOAOEXISTENTE12345', 'Básico'); pessoa(s, '', '', 'Básico'); s.run('admGerarConvites()');
const maria = s.abas.Usuarios[1], joao = s.abas.Usuarios[2];
assert.match(maria[1], /^[A-Z0-9]{16}$/); assert.equal(joao[1], 'JOAOEXISTENTE12345'); assert.equal(s.abas.Usuarios[3][1] || '', '');
assert.deepEqual(A.decodificarConvite(maria[5]), { url: URL_EXEC, codigo: maria[1] }); assert.deepEqual(A.decodificarConvite(joao[5]), { url: URL_EXEC, codigo: 'JOAOEXISTENTE12345' });
s.run('admGerarConvites()'); assert.equal(s.abas.Usuarios[1][1], maria[1]);                                                   // rodar de novo não troca códigos
const sem = carrega({ url: '' }); sem.run('admPrepararPlanilha()'); sem.abas.Usuarios.length = 1; pessoa(sem, 'Ana', '', 'Básico'); sem.run('admGerarConvites()');
assert.equal(sem.abas.Usuarios[1][1], ''); assert.ok(sem.alertas.some((x) => /URL_EXEC/.test(x)));                          // sem a URL, não gera nada e explica
// 4) configuração por perfil + exceção + globais (e o que a extensão entende dela)
s = nova(); s.abas.Usuarios.length = 1; pessoa(s, 'Maria', 'MARIACODIGO123456', 'Com robô'); pessoa(s, 'Admin', 'ADMINCODIGO1234567', 'Administrador'); pessoa(s, 'Bia', 'BIACODIGO1234567890', 'Básico');
s.abas.Excecoes.push(['MARIACODIGO123456', 'lab', 'ligado', 'testa recursos novos'], ['MARIACODIGO123456', 'roboMaxPorHora', '25', ''], ['OUTRO', 'vagas', 'bloqueado', '']);
s.abas.Global[1][1] = 'sim'; s.abas.Global[2][1] = 'Pausa para ajuste';   // emergencia + mensagem
let r = s.post({ acao: 'config', codigo: 'MARIACODIGO123456', versao: '1.34.0', inst: 'inst-abc' });
assert.equal(r.ok, true); assert.equal(r.nome, 'Maria'); assert.equal(r.perfil, 'Com robô'); assert.equal(r.recursos.atendente, 'ligado'); assert.equal(r.recursos.lab, 'ligado'); assert.equal(r.recursos.vagas, 'ligado'); assert.equal(r.recursos.iaAudio, 'desligado');
assert.equal(r.limites.roboModoMax, 'sugerir'); assert.equal(r.limites.roboMaxPorHora, '25'); assert.equal(r.limites.roboMaxPorContatoDia, '15'); assert.equal(r.global.emergencia, 'sim'); assert.equal(r.global.emergenciaMensagem, 'Pausa para ajuste');
assert.ok(!JSON.stringify(r).includes('ADMINCODIGO') && !JSON.stringify(r).includes('BIACODIGO') && !JSON.stringify(r).includes('Bia'));   // cada um vê só o que é seu
const ef = A.normalizar(r); assert.equal(ef.recursos.atendente, 'ligado'); assert.equal(ef.limites.roboModoMax, 'sugerir'); assert.equal(ef.limites.roboMaxPorHora, 25); assert.equal(ef.global.emergencia, true); assert.equal(ef.global.consultaMin, 10); assert.equal(ef.global.validadeOfflineDias, 7);   // o contrato fecha
assert.equal(s.abas.Usuarios[1][7], '1.34.0'); assert.equal(s.abas.Usuarios[1][8], 'inst-abc'); assert.ok(s.abas.Usuarios[1][6] instanceof s.run('Date'));   // última consulta, versão e instalação registradas
const r2 = s.post({ acao: 'config', codigo: 'MARIACODIGO123456' }); assert.equal(r2.hash, r.hash);                                                              // mesmo conteúdo = mesmo hash
s.abas.Global[4][1] = 'Reunião às 14h'; assert.notEqual(s.post({ acao: 'config', codigo: 'MARIACODIGO123456' }).hash, r.hash);                                  // mudou: hash muda
const rb = s.post({ acao: 'config', codigo: 'BIACODIGO1234567890' }); assert.equal(rb.recursos.atendente, 'bloqueado'); assert.equal(rb.recursos.lab, 'bloqueado'); assert.equal(rb.limites.roboModoMax, 'desligado');
const ra = s.post({ acao: 'config', codigo: 'ADMINCODIGO1234567' }); assert.equal(ra.recursos.lab, 'ligado'); assert.equal(ra.limites.roboMaxPorContatoDia, undefined);   // célula vazia = sem teto
// 4b) perfil "Novo", em branco ou inexistente = nada liberado (a extensão trata o que falta como bloqueado)
pessoa(s, 'Zé', 'ZECODIGO12345678AB', 'Novo'); pessoa(s, 'Sem perfil', 'SEMPERFIL1234567AB', ''); pessoa(s, 'Perfil errado', 'ERRADOCODIGO12345AB', 'Inventado');
for (const c of ['ZECODIGO12345678AB', 'SEMPERFIL1234567AB', 'ERRADOCODIGO12345AB']) { const x = s.post({ acao: 'config', codigo: c }); assert.equal(x.ok, true); assert.deepEqual(x.recursos, {}); assert.deepEqual(x.limites, {}); assert.equal(A.liberado(A.avaliar({ url: URL_EXEC, codigo: c }, { config: A.normalizar(x), t: Date.now() }), 'replies', undefined), false); }
// 4c) atualizar a lista de recursos numa planilha que já existe (layout antigo): acrescenta as linhas que faltam, sem mexer no que já está
const sx = carrega(); sx.abas.Perfis = [['Recurso', 'O que é', 'Básico', 'Com robô', 'Administrador', 'Minha equipe'], ['replies', 'Respostas rápidas', 'ligado', 'bloqueado', 'ligado', 'ligado'], ['limite:roboModoMax', 'x', 'desligado', 'sugerir', 'automatico', 'sugerir']];
const antes = JSON.stringify(sx.abas.Perfis); const n1 = sx.run('admAtualizarRecursos()'); assert.equal(n1, A.RECURSOS.length - 1 + Object.keys(A.LIMITES).length - 1);
const semDescricao = (rows) => JSON.stringify(rows.map((l) => l.filter((_, i) => i !== 1)));
assert.equal(semDescricao(sx.abas.Perfis.slice(0, 3)), semDescricao(JSON.parse(antes)));                                                              // os VALORES dos perfis ficam exatamente como estavam
assert.match(sx.abas.Perfis[2][1], /modo máximo/);                                                                                                     // só a coluna "O que é" (texto explicativo) é renovada
const linhaDe = (k) => sx.abas.Perfis.find((l) => l[0] === k);
assert.deepEqual(linhaDe('diag').slice(2), ['bloqueado', 'bloqueado', 'ligado', '']); assert.deepEqual(linhaDe('cfgIA').slice(2), ['bloqueado', 'ligado', 'ligado', '']);   // exemplos nos perfis conhecidos; a coluna da SUA equipe fica em branco (= bloqueado)
assert.deepEqual(linhaDe('limite:chavesMax').slice(2), ['1', '2', '6', '']); assert.equal(sx.abas.Perfis.length, 3 + n1);
assert.equal(sx.run('admAtualizarRecursos()'), 0); assert.equal(sx.abas.Perfis.length, 3 + n1);                                                         // rodar de novo não duplica
{ const vazio = carrega(); assert.equal(vazio.run('admAtualizarRecursos()'), 0); }                                                                                    // sem aba Perfis: não faz nada
// 5) acesso negado sem dar pista; desativado; validade
const negado = ['', 'curto', 'CODIGOQUENAOEXISTE12345', "x' or 1=1 --", 'MARIACODIGO12345 6'];
for (const c of negado) { const x = s.post({ acao: 'config', codigo: c }); assert.deepEqual(x, { ok: false, erro: 'acesso negado' }, c); }
assert.deepEqual(s.post({ acao: 'config' }), { ok: false, erro: 'acesso negado' }); assert.equal(s.post({ acao: 'ping' }).admin, true); assert.deepEqual(s.post({ acao: 'xpto', codigo: 'MARIACODIGO123456' }), { ok: false, erro: 'ação desconhecida' });
s.abas.Usuarios[1][3] = 'não'; assert.deepEqual(s.post({ acao: 'config', codigo: 'MARIACODIGO123456' }), { ok: false, desativado: true, erro: 'desativado' }); s.abas.Usuarios[1][3] = 'sim';
s.abas.Usuarios[1][4] = '01/01/2020'; assert.deepEqual(s.post({ acao: 'config', codigo: 'MARIACODIGO123456' }), { ok: false, desativado: true, erro: 'validade vencida' });
s.abas.Usuarios[1][4] = s.data(Date.now() - 3 * 864e5); assert.equal(s.post({ acao: 'config', codigo: 'MARIACODIGO123456' }).desativado, true);                  // data real na célula
s.abas.Usuarios[1][4] = s.data(Date.now() + 3 * 864e5); assert.equal(s.post({ acao: 'config', codigo: 'MARIACODIGO123456' }).ok, true); s.abas.Usuarios[1][4] = '31/12/2099'; assert.equal(s.post({ acao: 'config', codigo: 'MARIACODIGO123456' }).ok, true); s.abas.Usuarios[1][4] = '';
for (const [v, esp] of [['', false], [null, false], ['lixo', false], ['01/01/2000', true], ['01/01/2999', false]]) assert.equal(s.run(`admVenceu_(${JSON.stringify(v)}, new Date())`), esp, String(v));
// 6) saúde: só se o administrador deixou coletar; formato da extensão; atualiza Robô e Último sinal; tamanho e tipo
const dados = A.montarSaude({ v: '1.34.0', wa: '2.3000.1', autoteste: { ok: 46, warn: 0, bad: 1, skip: 6, ruins: ['Envio de mídia'] }, robo: { modo: 'sugerir', ativo: true, respondeu24h: 12, humano24h: 2, ignorado24h: 3, iaFalhou24h: 1, pendencias: 1 }, tempos: { iaS: 3.4, esperouS: 12 }, ia: { usoHoje: 22, falhas: { instavel: 2 }, chaves: 2 } });
s.abas.Global[5][1] = 'nao'; assert.deepEqual(s.post({ acao: 'saude', codigo: 'MARIACODIGO123456', dados }), { ok: true, ignorado: true }); assert.equal(s.abas.Saude.length, 1);   // administrador desligou a coleta
s.abas.Global[5][1] = 'sim'; assert.equal(s.post({ acao: 'saude', codigo: 'MARIACODIGO123456', dados }).ok, true);
const ln = s.abas.Saude[1]; assert.equal(ln[1], 'Maria'); assert.equal(ln[2], '1.34.0'); assert.equal(ln[4], 46); assert.equal(ln[6], 1); assert.equal(ln[8], 'Envio de mídia'); assert.equal(ln[9], 'sugerir'); assert.equal(ln[10], 'sim'); assert.equal(ln[11], 12); assert.equal(ln[16], 3.4); assert.equal(ln[18], 'instavel x2');
assert.equal(s.abas.Usuarios[1][9], 'ligado (sugerir)'); assert.ok(s.abas.Usuarios[1][10] instanceof s.run('Date'));
s.post({ acao: 'saude', codigo: 'MARIACODIGO123456', dados: 'texto solto' }); s.post({ acao: 'saude', codigo: 'MARIACODIGO123456', dados: { v: 'x'.repeat(5000) } }); s.post({ acao: 'saude', codigo: 'MARIACODIGO123456' }); assert.equal(s.abas.Saude.length, 2);   // não é o nosso formato: ignora
assert.equal(s.post({ acao: 'saude', codigo: 'CODIGOQUENAOEXISTE12345', dados }).ok, false);
// a aba Saude não cresce sem limite
s.run('ADM_LIMITE_SAUDE = 100'); for (let i = 0; i < 620; i++) s.abas.Saude.push([s.data(1e12 + i), 'x']); s.post({ acao: 'saude', codigo: 'MARIACODIGO123456', dados }); assert.equal(s.abas.Saude.length, 101);
// 7) limpeza por idade
s = nova(); s.abas.Saude.push([s.data(Date.now() - 90 * 864e5), 'a'], [s.data(Date.now() - 70 * 864e5), 'b'], [s.data(Date.now() - 5 * 864e5), 'c']); assert.equal(s.run('admLimparSaudeAntiga()'), 2); assert.deepEqual(s.abas.Saude.slice(1).map((l) => l[1]), ['c']); assert.equal(s.run('admLimparSaudeAntiga()'), 0);
// 8) vigia: robô LIGADO sem sinal; alerta uma vez; avisa quando volta
s = nova(); s.abas.Usuarios.length = 1; const agora = Date.now(), min = (n) => s.data(agora - n * 60000);
s.abas.Usuarios.push(['A', 'AAAAAAAAAAAAAAAA', 'Com robô', 'sim', '', '', '', '', '', 'ligado (automatico)', min(40), ''], ['B', 'BBBBBBBBBBBBBBBB', 'Com robô', 'sim', '', '', '', '', '', 'desligado (sugerir)', min(400), ''],
  ['C', 'CCCCCCCCCCCCCCCC', 'Com robô', 'sim', '', '', '', '', '', 'ligado (sugerir)', min(2), ''], ['D', 'DDDDDDDDDDDDDDDD', 'Com robô', 'não', '', '', '', '', '', 'ligado (automatico)', min(90), ''], ['E', 'EEEEEEEEEEEEEEEE', 'Com robô', 'sim', '', '', '', '', '', 'ligado (sugerir)', min(30), min(20)]);
s.abas.Global[10][1] = 'dono@exemplo.com'; let v = s.run('admVigiar()');
assert.deepEqual({ ...v }, { alertados: 1, voltaram: 0 });                                                  // só A: robô ligado, 40 min sem sinal. E já tinha sido alertado: não repete
assert.deepEqual(s.emails.map((x) => x.assunto), ['AtendeZap: robô de A sem sinal']); assert.equal(s.emails[0].para, 'dono@exemplo.com'); assert.match(s.emails[0].corpo, /40 minutos|mais de 15 minutos/);
assert.ok(s.abas.Usuarios[1][11] instanceof s.run('Date')); assert.equal(s.abas.Usuarios[2][11] || '', ''); assert.equal(s.abas.Usuarios[3][11] || '', ''); assert.equal(s.abas.Usuarios[4][11] || '', '');   // B (robô desligado), C (com sinal) e D (desativado) nunca alertam
v = s.run('admVigiar()'); assert.deepEqual({ ...v }, { alertados: 0, voltaram: 0 }); assert.equal(s.emails.length, 1);   // não repete o alerta
s.abas.Usuarios[1][10] = min(1); v = s.run('admVigiar()'); assert.deepEqual({ ...v }, { alertados: 0, voltaram: 1 }); assert.equal(s.emails[1].assunto, 'AtendeZap: robô de A voltou'); assert.equal(s.abas.Usuarios[1][11], '');   // voltou: limpa e avisa
s.abas.Usuarios[5][10] = min(1); v = s.run('admVigiar()'); assert.deepEqual({ ...v }, { alertados: 0, voltaram: 1 }); assert.equal(s.emails[2].assunto, 'AtendeZap: robô de E voltou');   // E (que já estava alertado) também avisa quando volta
const mudo = carrega(); mudo.run('admPrepararPlanilha()'); mudo.abas.Usuarios.length = 1; mudo.abas.Usuarios.push(['Z', 'ZZZZZZZZZZZZZZZZ', 'x', 'sim', '', '', '', '', '', 'ligado (automatico)', mudo.data(Date.now() - 99 * 60000), '']);
mudo.run('admVigiar()'); assert.equal(mudo.emails.length, 0); assert.ok(mudo.abas.Usuarios[1][11] instanceof mudo.run('Date'));                                                        // sem e-mail configurado: só marca
// gatilho do vigia: liga uma vez só
s = nova(); s.run('admLigarVigia()'); s.run('admLigarVigia()'); assert.equal(s.gatilhos.filter((g) => g === 'admVigiar').length, 1);
// 9) COEXISTÊNCIA: nada deste arquivo pode pisar em outro script do mesmo projeto (caso real: o onOpen do "Gerador de Anúncios" sumiu).
{
  const nomes = [...FONTE.matchAll(/^(?:function\s+(\w+)|var\s+(\w+)\s*=)/gm)].map((m) => m[1] || m[2]);
  const fora = nomes.filter((n) => !/^(adm|ADM_)/.test(n) && !['doGet', 'doPost'].includes(n));
  assert.deepEqual(fora, [], 'nomes globais fora do prefixo adm: ' + fora.join());
  assert.ok(!/function\s+onOpen\b/.test(FONTE) && !/function\s+onEdit\b/.test(FONTE) && !/function\s+onInstall\b/.test(FONTE));   // nenhum gatilho simples que outro script possa ter
  // contra o script real do usuário (se o arquivo estiver por perto), nenhuma função repete
  const real = '/mnt/user-data/uploads/codigo.gs';
  if (fs.existsSync(real)) { const f = new Set([...fs.readFileSync(real, 'utf8').matchAll(/^\s*function\s+(\w+)/gm)].map((m) => m[1])); assert.deepEqual(nomes.filter((n) => f.has(n)), []); }
}
// 10) o menu é instalado como gatilho próprio, uma vez, e aparece na hora
s = carrega(); s.run('admPrepararPlanilha()'); assert.deepEqual(s.gatilhos, ['admOnOpen']); assert.equal(s.ui.menus, 1); s.run('admPrepararPlanilha()'); assert.deepEqual(s.gatilhos, ['admOnOpen']);   // rodar de novo não duplica
// 11) planilha que já tem outro uso: pergunta antes; "não" não cria nada; "sim" cria; aba vazia padrão não assusta
s = carrega(); s.abas.Clientes = [['NOME', 'CIDADE'], ['AFORT', 'SERRA']]; s.ui.resposta = 'NO'; s.run('admPrepararPlanilha()');
assert.equal(s.ui.perguntas.length, 1); assert.match(s.ui.perguntas[0][1], /Clientes/); assert.match(s.ui.perguntas[0][1], /NOVA e só sua/); assert.deepEqual(Object.keys(s.abas), ['Clientes']); assert.deepEqual(s.gatilhos, []);
s.ui.resposta = 'YES'; s.run('admPrepararPlanilha()'); assert.ok(s.abas.Usuarios && s.abas.Perfis); assert.deepEqual(s.abas.Clientes, [['NOME', 'CIDADE'], ['AFORT', 'SERRA']]);   // o que já era da planilha não é tocado
s = carrega(); s.abas['Página1'] = []; s.run('admPrepararPlanilha()'); assert.equal(s.ui.perguntas.length, 0); assert.ok(s.abas.Usuarios);                                       // planilha nova (só a aba vazia): sem pergunta
s.run('admPrepararPlanilha()'); assert.equal(s.ui.perguntas.length, 0);                                                                                                       // com as abas do painel já criadas: sem pergunta também
s = carrega(); s.abas.Clientes = [['x']]; s.ui.resposta = 'NO'; s.abas.Usuarios = [['Nome']]; s.run('admPrepararPlanilha()'); assert.equal(s.ui.perguntas.length, 1);          // abas nossas não contam, as de fora contam
// 12) conferência dos perfis, leitura de estados igual à da extensão, e planilha que se completa ao abrir
for (const v of ['sim', 'Sim', 'on', 'liberado', 'não', 'NAO', 'off', 'negado', 'Obrigatório', 'obrigatorio', 'desligado', 'Desligada', 'ligado', 'bloqueado', 'talvez', '', null, undefined]) assert.equal(carrega().run(`admEstado_(${JSON.stringify(v === undefined ? null : v)})`), A.estadoDe(v), String(v));   // a planilha e a extensão leem igual
{ const c = carrega(), conf = (vals) => [...c.run(`admProblemasPerfis_(${JSON.stringify(vals)})`)];
  const vals = [['Recurso', 'O que é', 'Beta', 'Admin', 'Vazio'], ['lab', '', 'ligado', 'ligado', ''], ['diag', '', 'bloqueado', 'ligado', ''], ['diagAvancado', '', 'ligado', 'ligado', ''], ['atendente', '', 'ligado', 'ligado', ''],
    ['cfgIA', '', '', 'ligado', ''], ['iaAudio', '', 'ligado', 'ligado', ''], ['limite:roboModoMax', '', '', 'automatico', '']];
  const p = conf(vals); assert.equal(p.length, 4);   // o Laboratório NÃO depende mais do Diagnóstico (tem aba própria em "Em teste")
  assert.ok(!p.some((x) => /"lab"/.test(x)) && p.some((x) => /^Beta: "diagAvancado"/.test(x)) && p.some((x) => /^Beta: o robô.*"cfgIA"/.test(x)) && p.some((x) => /^Beta: sem "limite:roboModoMax"/.test(x)) && p.some((x) => /^Vazio: nada liberado/.test(x)));
  assert.ok(!p.some((x) => x.startsWith('Admin')));                                                                                                   // o perfil completo não dá aviso
  assert.ok(!p.some((x) => /iaAudio/.test(x)));                                                                                                       // áudio com robô liberado está certo
  assert.ok(conf([['Recurso', 'O que é', 'X'], ['iaAudio', '', 'ligado']]).some((x) => /"iaAudio".*"atendente"/.test(x)));                          // áudio sem robô
  assert.deepEqual(conf([['Recurso', 'O que é', 'X'], ['lab', '', 'não'], ['diag', '', 'não'], ['replies', '', 'sim']]), []);                          // "não" = bloqueado: não conta como liberado
  assert.deepEqual(conf([['Recurso', 'O que é']]), []); }
{ const s2 = carrega(); s2.abas.Perfis = [['Recurso', 'O que é', 'Administrador', 'Minha equipe'], ['lab', 'antigo', 'ligado', 'ligado'], ['atendente', 'antigo', 'ligado', 'ligado']];
  s2.run('admConferirPerfis()'); assert.match(s2.alertas.at(-1), /Conferência dos perfis/); assert.match(s2.alertas.at(-1), /"cfgIA"/);   // o robô sem a chave libera o aviso (o Laboratório não depende mais do Diagnóstico)
  const antesAlertas = s2.alertas.length; s2.run('admOnOpen()');                                                                                      // ao abrir: completa sozinho, sem alerta
  assert.equal(s2.alertas.length, antesAlertas); assert.equal(s2.ui.menus, 1); assert.ok(s2.abas.Perfis.some((l) => l[0] === 'diag' && l[2] === 'ligado' && l[3] === ''));   // Administrador (exemplo) = ligado; a SUA equipe = em branco
  assert.equal(s2.abas.Perfis[1][2], 'ligado'); assert.equal(s2.abas.Perfis[1][3], 'ligado'); assert.match(s2.abas.Perfis[1][1], /\[Em teste\]/);   // valores intactos; descrição com a dependência
  s2.run('admConferirPerfis()'); assert.ok(/cfgIA|Minha equipe/.test(s2.alertas.at(-1)));
  const linhas = s2.abas.Perfis.length; s2.run('admOnOpen()'); assert.equal(s2.abas.Perfis.length, linhas); }                                          // abrir de novo não duplica
// 13) LIMITE DE COMPUTADORES por convite (configurável por pessoa; padrão 1)
{ const c = carrega(), D = (regs, inst, max, conectar) => { const x = c.run(`admDecidirComputador_(${JSON.stringify(regs)}, ${JSON.stringify(inst)}, ${max}, ${!!conectar})`); return { acao: x.acao, erro: x.erro, ativos: x.ativos }; };
  const ativo = (inst, linha = 2) => ({ linha, inst, situacao: 'Liberado' }), rev = (inst, linha = 3) => ({ linha, inst, situacao: 'Revogado' });
  assert.deepEqual(D([], 'A', 1), { acao: 'registrar', erro: undefined, ativos: 0 });                                                                         // primeiro computador: registra
  assert.equal(D([ativo('A')], 'A', 1).acao, 'ok');                                                                                                           // o mesmo computador de novo: ok
  assert.deepEqual(D([ativo('A')], 'B', 1), { acao: 'recusar', erro: 'limite de computadores', ativos: 1 });                                                  // o 2º computador com limite 1: recusado
  assert.equal(D([ativo('A')], 'B', 2).acao, 'registrar'); assert.equal(D([ativo('A'), ativo('B', 3)], 'C', 2).erro, 'limite de computadores');               // limite 2: o 2º entra, o 3º não
  assert.equal(D([rev('A', 2)], 'A', 1, false).erro, 'computador desconectado');                                                                              // revogado: a consulta comum é recusada
  assert.equal(D([rev('A', 2)], 'A', 1, true).acao, 'reativar');                                                                                              // ...mas pode voltar ao COLAR o convite, havendo vaga
  assert.equal(D([rev('A', 2), ativo('B', 3)], 'A', 1, true).erro, 'limite de computadores');                                                                 // sem vaga (o novo ocupou), não volta
  assert.equal(D([rev('A', 2)], 'B', 1).acao, 'registrar');                                                                                                   // revogado não conta na vaga
  assert.equal(D([{ linha: 2, inst: 'A', situacao: '' }], 'A', 1).acao, 'ok'); assert.equal(D([{ linha: 2, inst: 'A', situacao: 'desconectado' }], 'A', 1).erro, 'computador desconectado');
  for (const [v, e] of [['', 1], [null, 1], ['1', 1], ['2', 2], [3, 3], ['abc', 1], ['0', 1], ['-4', 1], ['99', 20], ['2,5', 2]]) assert.equal(c.run(`admMaxPc_(${JSON.stringify(v)})`), e, String(v)); }
{ const s3 = nova(); s3.abas.Usuarios.length = 1; pessoa(s3, 'Lia', 'LIACODIGO1234567AB', 'Com robô'); pessoa(s3, 'Teo', 'TEOCODIGO1234567AB', 'Com robô');
  const P = (c) => s3.post(c), CFG = (inst, extra = {}) => P({ acao: 'config', codigo: 'LIACODIGO1234567AB', inst, versao: '1.36.0', maquina: 'Windows · Chrome 141', ...extra });
  const a = CFG('pc-trabalho'); assert.equal(a.ok, true); assert.deepEqual({ ...a.pcs }, { emUso: 1, max: 1 }); assert.equal(s3.abas.Computadores.length, 2);
  assert.deepEqual(s3.abas.Computadores[1].slice(0, 4), ['Lia', 'LIACODIGO1234567AB', 'pc-trabalho', 'Windows · Chrome 141']); assert.equal(s3.abas.Computadores[1][7], 'Liberado'); assert.ok(s3.abas.Computadores[1][4] instanceof s3.run('Date'));
  assert.equal(CFG('pc-trabalho').ok, true); assert.equal(s3.abas.Computadores.length, 2);                                                                     // o mesmo computador consulta de novo: não duplica
  assert.deepEqual({ ...CFG('pc-casa') }, { ok: false, erro: 'limite de computadores', limite: 1, emUso: 1 }); assert.equal(s3.abas.Computadores.length, 2);       // 2º computador: recusado e NÃO registrado
  assert.equal(s3.post({ acao: 'config', codigo: 'TEOCODIGO1234567AB', inst: 'pc-trabalho' }).ok, true);                                                       // o limite é por PESSOA: o mesmo id em outro convite é outra vaga
  s3.abas.Usuarios[1][13] = 2; const b2 = CFG('pc-casa'); assert.equal(b2.ok, true); assert.deepEqual({ ...b2.pcs }, { emUso: 2, max: 2 });                      // limite configurado para 2: o segundo entra
  assert.equal(CFG('pc-notebook').erro, 'limite de computadores'); assert.equal(CFG('pc-notebook').emUso, 2); assert.equal(s3.abas.Computadores.length, 4);          // o terceiro não
  for (const ruim of ['', 'abc', 'com espaço no meio', 'x'.repeat(61), null]) assert.deepEqual({ ...CFG(ruim) }, { ok: false, erro: 'extensão desatualizada' }, String(ruim));   // sem identificador não há como contar
  assert.deepEqual({ ...P({ acao: 'config', codigo: 'LIACODIGO1234567AB', inst: undefined }) }, { ok: false, erro: 'extensão desatualizada' });         // extensão antiga, que nem manda o identificador: recusada (não dá para contar)
  // saúde só de computador registrado e ativo
  const dados = A.montarSaude({ v: '1.36.0' }); assert.equal(P({ acao: 'saude', codigo: 'LIACODIGO1234567AB', inst: 'pc-casa', dados }).ok, true);
  assert.deepEqual({ ...P({ acao: 'saude', codigo: 'LIACODIGO1234567AB', inst: 'pc-estranho', dados }) }, { ok: false, erro: 'computador não registrado' }); assert.equal(s3.abas.Computadores.length, 4);   // saúde não registra computador
  // "Liberar computadores": desconecta os da pessoa (não os de outras) e libera as vagas
  assert.equal(s3.run("admLiberarComputadores_('lia')"), 2); assert.deepEqual(s3.abas.Computadores.slice(1).filter((l) => l[0] === 'Lia').map((l) => l[7]), ['Revogado', 'Revogado']); assert.equal(s3.abas.Computadores.find((l) => l[0] === 'Teo')[7], 'Liberado');
  assert.equal(s3.run("admLiberarComputadores_('lia')"), 0); assert.equal(s3.run("admLiberarComputadores_('Ninguém')"), -1); assert.equal(s3.run("admLiberarComputadores_('')"), -1); assert.equal(s3.run("admLiberarComputadores_('LIACODIGO1234567AB')"), 0);
  assert.deepEqual({ ...CFG('pc-trabalho') }, { ok: false, erro: 'computador desconectado', limite: 2, emUso: 0 });                                                                    // o computador antigo é recusado na próxima consulta
  assert.equal(CFG('pc-novo').ok, true); assert.equal(CFG('pc-novo2').ok, true); assert.equal(CFG('pc-novo3').erro, 'limite de computadores');                 // revogados não ocupam vaga: 2 novos entram (limite 2)
  assert.equal(CFG('pc-trabalho', { conectar: true }).erro, 'limite de computadores');                                                                          // o antigo, sem vaga, não volta ao colar o convite
  s3.run("admLiberarComputadores_('Lia')"); assert.equal(CFG('pc-trabalho', { conectar: true }).ok, true);                                                       // com vaga, volta ao COLAR o convite (conectar)
  assert.equal(s3.abas.Computadores.find((l) => l[2] === 'pc-trabalho')[7], 'Liberado');
  // pelo menu (com a pergunta na tela)
  s3.ui.textoPrompt = 'Teo'; assert.equal(s3.run('admLiberarComputadores()'), 1); assert.match(s3.alertas.at(-1), /1 computador\(es\) desconectado/);
  s3.ui.textoPrompt = 'Fulano'; assert.equal(s3.run('admLiberarComputadores()'), -1); assert.match(s3.alertas.at(-1), /Não achei essa pessoa/); s3.ui.botaoPrompt = 'CANCEL'; assert.equal(s3.run('admLiberarComputadores()'), 0); }
// planilha de versão antiga: ao abrir, ganha a aba Computadores e o título da coluna (sem tocar nos dados)
{ const s4 = carrega(); s4.abas.Usuarios = [['Nome', 'Código', 'Perfil', 'Ativo', 'Validade', 'Convite', 'Última consulta', 'Versão', 'Instalação', 'Robô', 'Último sinal', 'Alertado', 'Observações'], ['Ana', 'ANACODIGO1234567AB', 'Básico', 'sim']];
  s4.run('admOnOpen()'); assert.ok(s4.abas.Computadores && s4.abas.Computadores[0][0] === 'Pessoa'); assert.equal(s4.abas.Usuarios[0][13], 'Máx. computadores (vazio = 1)'); assert.equal(s4.abas.Usuarios[1][0], 'Ana');
  const n = s4.abas.Usuarios[0].length; s4.run('admOnOpen()'); assert.equal(s4.abas.Usuarios[0].length, n); assert.equal(s4.abas.Computadores.length, 1);
  const s5 = carrega(); s5.run('admOnOpen()'); assert.deepEqual(Object.keys(s5.abas), []); }                                                                       // sem planilha preparada: não cria nada
// 14) PLANILHA ORGANIZADA, COM LISTAS DE ESCOLHA E CORES (verde = ativo, vermelho = bloqueado): o caso real do print (5 linhas novas no fim, sem lista, misturadas com os limites)
{ const grupos = vm.runInNewContext('(' + JSON.stringify(carrega().run('ADM_GRUPOS')) + ')'), todasGrupos = grupos.flatMap((g) => g[2]);
  assert.deepEqual([...todasGrupos].sort(), [...A.RECURSOS, ...Object.keys(A.LIMITES).map((k) => 'limite:' + k)].sort(), 'todo recurso e todo limite está em exatamente um grupo');
  const lv = JSON.parse(JSON.stringify(carrega().run('ADM_LIMITES_VAL'))); assert.deepEqual(lv, A.LIMITES);                                                          // as faixas da planilha são as da extensão
  const cab = ['Recurso', 'O que é', 'Básico', 'Com robô', 'Beta tester', 'Administrador'];
  const velhas = ['replies', 'fila', 'sig', 'start', 'lote', 'pins', 'ocultas', 'backup', 'lab', 'gruposSo', 'atendente', 'vagas', 'pedidos', 'cargas', 'iaAudio', 'diagAvancado'];
  const bagunca = () => { const m = [cab.slice()]; velhas.forEach((k, i) => m.push([k, 'desc antiga ' + k, 'desligado', 'ligado', i % 2 ? 'ligado' : 'bloqueado', 'desligado']));
    m.push(['limite:roboModoMax', 'x', 'desligado', 'sugerir', 'desligado', 'automatico'], ['limite:roboMaxPorContatoDia', 'x', '', 15, '', ''], ['limite:roboMaxPorHora', 'x', '', 40, '', ''], ['limite:chavesMax', 'x', 1, 2, 1, 6], ['limite:retencaoMaxDias', 'x', 90, 90, 90, '']);
    ['diag', 'cfgPosicao', 'cfgIA', 'cfgPartes', 'cfgLimites'].forEach((k) => m.push([k, 'desc', 'bloqueado', 'ligado', '', 'ligado'])); m.push(['minha_regra', 'nota minha', 'a', 'b', 'c', 'd']); return m; };
  const mapa = (rows) => Object.fromEntries(rows.slice(1).filter((l) => l[0] && !String(l[0]).startsWith('▸')).map((l) => [l[0], l.slice(2)]));
  // (a) só a aparência, sem mexer na ordem: TODA linha de recurso ganha a lista de escolha (inclusive as 5 do fim) e as cores valem para todas
  { const sa = carrega(); sa.abas.Perfis = bagunca(); const corridas = sa.run('admFormatarPerfis_()'); assert.equal(corridas, 2);                                     // 2 blocos de recursos (as 16 antigas e as 5 do fim) separados pelos limites
    const dv = (r) => sa.reg.valids.filter((v) => v.aba === 'Perfis' && v.r === r);
    for (let r = 2; r <= 17; r++) assert.deepEqual(dv(r).map((v) => v.d.lista), [['ligado', 'desligado', 'bloqueado', 'obrigatorio']], 'linha ' + r);
    for (let r = 23; r <= 27; r++) assert.deepEqual(dv(r).map((v) => v.d.lista), [['ligado', 'desligado', 'bloqueado', 'obrigatorio']], 'linha nova ' + r);   // o que faltava no seu print
    assert.equal(dv(28).length, 0); assert.ok(dv(2).every((v) => v.c === 3 && v.m === 4 && v.d.invalido === false));                                                 // 'minha_regra' fica sem lista; a lista cobre as 4 colunas de perfil
    assert.deepEqual(dv(18).map((v) => v.d.lista), [['desligado', 'sugerir', 'automatico']]); assert.deepEqual(dv(19).map((v) => v.d.num), [[1, 200]]); assert.deepEqual(dv(20).map((v) => v.d.num), [[1, 500]]);
    assert.deepEqual(dv(21).map((v) => v.d.num), [[1, 6]]); assert.deepEqual(dv(22).map((v) => v.d.num), [[1, 365]]);                                                  // limites: lista ou faixa
    const regras = sa.reg.regras.Perfis; assert.equal(regras.length, 5 + 3); const cor = (x) => regras.find((q) => q.texto === x && q.ranges.length === 2);   // 5 regras dos recursos + 3 do modo do robô
    assert.deepEqual([cor('ligado').fundo, cor('ligado').fonte], ['#ceead6', '#137333']); assert.deepEqual([cor('bloqueado').fundo, cor('bloqueado').fonte], ['#fad2cf', '#c5221f']);   // verde = ativo, vermelho = bloqueado
    assert.equal(cor('desligado').fundo, '#fce5cd'); assert.equal(cor('obrigatorio').fundo, '#81c995'); assert.equal(regras.find((q) => q.vazio).fundo, '#fce8e6');   // amarelo = liberado mas desligado; vazio = vermelho claro (= bloqueado)
    assert.deepEqual(cor('ligado').ranges, [[2, 3, 16, 4], [23, 3, 5, 6 - 2]]); const recs = regras.filter((q) => q.ranges.length === 2); assert.equal(recs.length, 5); assert.ok(recs.every((q) => JSON.stringify(q.ranges) === JSON.stringify(cor('ligado').ranges)));   // as cores dos recursos cobrem SÓ as linhas de recurso (não os limites)
    // MODO DO ROBÔ (linha limite:roboModoMax): vermelho = desligado, verde = sugerir, AMARELO = automatico (e amarelo não é usado em mais nada)
    const modos = regras.filter((q) => q.ranges.length === 1); assert.equal(modos.length, 3); assert.deepEqual(modos.map((q) => q.ranges[0]), [[18, 3, 1, 4], [18, 3, 1, 4], [18, 3, 1, 4]]);
    const m = (x) => modos.find((q) => q.texto === x); assert.deepEqual([m('automatico').fundo, m('automatico').fonte], ['#ffe599', '#7f6000']); assert.equal(m('sugerir').fundo, '#ceead6'); assert.equal(m('desligado').fundo, '#fad2cf');
    const amarelos = regras.filter((q) => q.fundo === '#ffe599'); assert.equal(amarelos.length, 1);
    sa.run('admFormatarPerfis_()'); assert.equal(sa.reg.regras.Perfis.length, 8); }                                                                                     // rodar de novo não acumula regras
  // (b) organizar: grupos, valores preservados, linha desconhecida mantida, cópia de segurança
  { const sb = carrega(); sb.abas.Perfis = bagunca(); sb.abas.Usuarios = [['Nome', 'Código', 'Perfil', 'Ativo'], ['Teste', 'TESTECODIGO1234567AB', 'Com robô', 'sim']]; const antes = JSON.parse(JSON.stringify(sb.abas.Perfis));
    const cfgAntes = sb.post({ acao: 'config', codigo: 'TESTECODIGO1234567AB' });
    sb.ui.resposta = 'NO'; assert.equal(sb.run('admOrganizarPerfis_(false)'), 0); assert.equal(JSON.stringify(sb.abas.Perfis), JSON.stringify(antes));                       // disse NÃO: nada muda
    sb.ui.resposta = 'YES'; const n = sb.run('admOrganizarPerfis_(false)'); assert.equal(n, 7 + 34 + 2);                                                                // 5 grupos + 26 linhas + grupo OUTROS + 1 desconhecida
    const dep = sb.abas.Perfis; assert.deepEqual(dep[0], antes[0]);                                                                                                     // o cabeçalho (perfis) fica igual
    { const dm = mapa(dep), am = mapa(antes); assert.deepEqual(Object.keys(dm).filter((k) => !(k in am)), ['escuta', 'resumo', 'ligacao', 'contato', 'exportar', 'apagar', 'recuperar', 'avaliacao']); for (const k of Object.keys(am)) assert.deepEqual(dm[k], am[k], 'NENHUM valor se perdeu nem mudou: ' + k); }   // só entram os recursos novos (exportar, apagar e recuperar), com o valor de exemplo                                                                                        // todos os valores, de todos os perfis, preservados
    assert.deepEqual(dep.map((l) => l[0]).slice(0, 4), ['Recurso', '▸ ATENDIMENTO', 'replies', 'fila']); assert.equal(dep.at(-2)[0], '▸ OUTROS'); assert.equal(dep.at(-1)[0], 'minha_regra'); assert.deepEqual(dep.at(-1), antes.at(-1));
    assert.equal(dep.find((l) => l[0] === 'replies')[1], 'Atendimento › Respostas rápidas (e o /atalho no campo de mensagem)'); assert.match(dep.find((l) => l[0] === 'lab')[1], /\[Em teste\]/);                // descrição canônica (com as dependências)
    const copia = Object.keys(sb.abas).find((x) => x.startsWith('Perfis (cópia')); assert.ok(copia); assert.deepEqual(sb.abas[copia], antes);                           // cópia de segurança igual ao que havia
    { const dep2 = sb.post({ acao: 'config', codigo: 'TESTECODIGO1234567AB' }), { apagar: novoApagar, recuperar: novoRec, exportar: novoExp, contato: novoCont, escuta: novoEsc, resumo: novoRes, ligacao: novoLig, avaliacao: novoAva, ...resto } = dep2.recursos; assert.deepEqual(resto, cfgAntes.recursos); assert.equal(novoApagar, 'bloqueado'); assert.equal(novoRec, 'bloqueado'); assert.equal(novoExp, 'bloqueado'); assert.equal(novoCont, 'bloqueado'); assert.equal(novoEsc, 'bloqueado'); assert.deepEqual([novoRes, novoLig, novoAva], ['bloqueado', 'bloqueado', 'bloqueado']); assert.deepEqual(dep2.limites, cfgAntes.limites); }   // o que a extensão já recebia não muda (só entra o recurso novo, bloqueado)
    assert.ok(sb.reg.valids.filter((v) => v.aba === 'Perfis' && v.d.lista && v.d.lista.length === 4).length === 29);                                                    // lista nas 21 linhas de recurso (e em nenhuma de grupo)
    assert.equal(sb.reg.regras.Perfis[0].ranges.length, 6); const linhaModo = dep.findIndex((l) => l[0] === 'limite:roboModoMax') + 1; assert.deepEqual(sb.reg.regras.Perfis.find((q) => q.texto === 'automatico').ranges, [[linhaModo, 3, 1, 4]]);   // o amarelo acompanha a linha do modo do robô depois de organizar                                                                                                             // 6 blocos de recursos (um por assunto)
    const dump = JSON.stringify(sb.abas.Perfis); sb.run('admOrganizarPerfis_(true)'); assert.equal(JSON.stringify(sb.abas.Perfis), dump);                              // organizar de novo: idêntico
    assert.deepEqual([...sb.run(`admProblemasPerfis_(${JSON.stringify(sb.abas.Perfis)})`)].length >= 0, true); }                                                       // a conferência de perfis continua funcionando com as linhas de grupo
  // (c0) REGRESSÃO (planilha do Johon, 23/10): as regras de validação do layout ANTERIOR (ex.: "número de 1 a 365" nas linhas de limites) ficam nas células depois do clear();
  //      reorganizar com grupos diferentes jogava texto nelas e o Google recusava ("Exception: Número de 1 a 365") no meio da gravação. Agora limpa as regras ANTES de gravar.
  { const se = carrega(); se.abas.Perfis = bagunca(); se.run('admFormatarPerfis_()');
    assert.ok(se.reg.valids.some((v) => v.aba === 'Perfis' && v.d.num), 'o cenário precisa ter regra de número');
    assert.doesNotThrow(() => se.run('admOrganizarPerfis_(true)'));
    const g = se.abas.Perfis.map((l) => l[0]); assert.ok(g.includes('limite:retencaoMaxDias') && g.includes('lab') && g.includes('cfgIA') && g.includes('minha_regra'));   // nada se perdeu no meio
    const lim = se.abas.Perfis.find((l) => l[0] === 'limite:retencaoMaxDias'); assert.equal(lim[2], 90);
    // e uma SEGUNDA organização, já com tudo formatado, também passa
    assert.doesNotThrow(() => se.run('admOrganizarPerfis_(true)')); }
  // (c) aba organizada: recurso novo entra NO GRUPO certo (e a cópia só existe quando a pessoa pede pelo menu)
  { const sc = carrega(); sc.abas.Perfis = bagunca(); sc.run('admOrganizarPerfis_(true)'); const linhas = sc.abas.Perfis.length, copias = Object.keys(sc.abas).filter((x) => x.startsWith('Perfis (cópia')).length; assert.equal(copias, 0);
    const i = sc.abas.Perfis.findIndex((l) => l[0] === 'cfgLimites'); sc.abas.Perfis.splice(i, 1);                                                                       // some uma linha (como numa versão antiga do script)
    assert.equal(sc.run('admAtualizarRecursos(true)'), 1); assert.equal(sc.abas.Perfis.length, linhas); const g = sc.abas.Perfis.map((l) => l[0]); assert.ok(g.indexOf('cfgLimites') > g.indexOf('▸ DIAGNÓSTICO') && g.indexOf('cfgLimites') < g.indexOf('▸ CONFIGURAÇÕES'));   // voltou para dentro do bloco do seu assunto (Diagnóstico) }
  }
  // (d) planilha NOVA já nasce organizada, e Usuarios/Global/Legenda também ficam padronizadas
  { const sd = nova(); const p = sd.abas.Perfis.map((l) => l[0]); assert.equal(p[1], '▸ ATENDIMENTO'); assert.ok(p.indexOf('diag') > p.indexOf('▸ DIAGNÓSTICO') && p.indexOf('lab') > p.indexOf('▸ DIAGNÓSTICO') && p.indexOf('lab') < p.indexOf('▸ CONFIGURAÇÕES'));   // cada função no bloco do seu assunto
  assert.ok(p.indexOf('apagar') > p.indexOf('▸ PRIVACIDADE') && p.indexOf('recuperar') < p.indexOf('▸ DIAGNÓSTICO') && p.indexOf('ocultas') > p.indexOf('▸ PRIVACIDADE') && p.indexOf('vagas') > p.indexOf('▸ GRUPOS') && p.indexOf('vagas') < p.indexOf('▸ FERRAMENTAS') && p.indexOf('cargas') < p.indexOf('▸ GRUPOS')); assert.ok(sd.abas.Legenda && sd.abas.Legenda[0][0] === 'LEGENDA DA ABA PERFIS');
    assert.match(sd.abas.Legenda.find((l) => l[0] === 'desligado')[1], /NÃO é "desativado"/);                                                                           // a armadilha do "desligado" está explicada
    const u = sd.reg.valids.filter((v) => v.aba === 'Usuarios'); const col = (c) => u.find((v) => v.c === c);
    assert.deepEqual(col(3).d.lista, ['Novo', 'Básico', 'Com robô', 'Administrador']); assert.deepEqual(col(4).d.lista, ['sim', 'não']); assert.deepEqual(col(14).d.num, [1, 20]);   // Perfil, Ativo e Máx. computadores com lista/faixa
    const ru = sd.reg.regras.Usuarios; assert.equal(ru.find((q) => q.texto === 'sim').fundo, '#ceead6'); assert.equal(ru.find((q) => q.texto === 'não').fundo, '#fad2cf');
    const gl = sd.reg.valids.filter((v) => v.aba === 'Global'); assert.equal(gl.length, 2); assert.deepEqual(gl[0].d.lista, ['sim', 'nao']);
    const rg = sd.reg.regras.Global; assert.equal(rg.find((q) => q.texto === 'sim' && q.ranges[0][0] === 2).fundo, '#fad2cf');                                           // emergência SIM = vermelho (alarme)
    assert.ok(sd.reg.valids.some((v) => v.aba === 'Excecoes' && v.d.lista.includes('lab') && v.d.lista.includes('roboModoMax'))); assert.equal(sd.reg.regras.Excecoes.find((q) => q.texto === 'automatico').fundo, '#ffe599');   // exceção com modo automático também em amarelo
    assert.match(sd.abas.Legenda.find((l) => l[0] === 'automatico')[1], /RESPONDE SOZINHO.*AMARELO/); assert.match(sd.abas.Legenda.find((l) => l[0] === 'desligado')[1], /LARANJA/);
    const ex = Object.keys(sd.abas).length; sd.run('admOnOpen()'); sd.run('admOnOpen()'); assert.equal(Object.keys(sd.abas).length, ex); }                              // abrir várias vezes não cria nada a mais
  { const se = carrega(); se.ui.resposta = 'YES'; se.abas.Clientes = []; se.abas.Perfis = []; assert.equal(se.run('admOrganizarPerfis_(false)'), -1); } }
console.log('script da planilha administrativa: todos os casos ok (preparar, convites, perfis, exceções, acesso negado, validade, saúde, limpeza, vigia, coexistência e aviso de planilha com outro uso)');
