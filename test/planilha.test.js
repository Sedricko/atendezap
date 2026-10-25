// node test/planilha.test.js — roda o AtendeZap.gs (Apps Script) num "vm" do Node, com a planilha simulada.
const fs = require('fs'), vm = require('vm'), assert = require('assert'), path = require('path');
const FONTE = fs.readFileSync(path.join(__dirname, '../planilha/AtendeZap.gs'), 'utf8');
function carrega(token, abasIniciais = {}) {
  const abas = JSON.parse(JSON.stringify(abasIniciais)), saidas = [], props = {};
  const out = (t) => ({ _t: t, setMimeType() { return this; } });
  const folha = (nome) => ({
    getLastRow: () => (abas[nome] || []).length, appendRow(r) { (abas[nome] ||= []).push(r); }, setFrozenRows() {}, deleteRows(i, n) { abas[nome].splice(i - 1, n); },
    getRange(r, c, n, m) {
      const self = {
        getValues: () => Array.from({ length: n }, (_, k) => { const lin = (abas[nome] || [])[r - 1 + k] || []; return Array.from({ length: m }, (__, j) => (lin[c - 1 + j] === undefined ? '' : lin[c - 1 + j])); }),
        setValues(v) { v.forEach((row, k) => { const i = r - 1 + k; (abas[nome] ||= []); if (i < abas[nome].length) { row.forEach((x, j) => { abas[nome][i][c - 1 + j] = x; }); } else abas[nome].push([...row]); }); saidas.push(['setValues', nome, r, v]); return self; },
        setFontWeight() { return self; },
      };
      return self;
    },
  });
  const ctx = { ContentService: { createTextOutput: out, MimeType: { JSON: 'json', TEXT: 'text' } }, LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; }, deleteProperty: (k) => { delete props[k]; } }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (n) => (abas[n] ? folha(n) : null), insertSheet: (n) => { abas[n] = []; return folha(n); } }) }, JSON, String, Object, Array, Math };
  vm.createContext(ctx);
  vm.runInContext(FONTE.replace(/^var TOKEN_IA = '';/m, 'var TOKEN_IA = ' + JSON.stringify(token) + ';'), ctx);   // ancorado: o cabeçalho também cita essa linha
  return { abas, saidas, props, post: (c) => JSON.parse(vm.runInContext('doPost', ctx)({ postData: { contents: JSON.stringify(c) } })._t), get: (p) => JSON.parse(vm.runInContext('doGet', ctx)({ parameter: p })._t) };
}
const SENHA = '9fK2xQ7mLr4vTz81';
// 1) senha: vazia/curta nunca vale; certa vale (com espaço sobrando); errada não
let s = carrega(''); assert.match(s.post({ token: 'x', aba: 'ping' }).erro, /defina a senha/); assert.equal(s.post({ token: '', aba: 'ping' }).ok, false);
assert.equal(carrega('curta').post({ token: 'curta', aba: 'ping' }).ok, false);
s = carrega(SENHA); assert.equal(s.post({ token: ' ' + SENHA + ' ', aba: 'ping' }).ok, true); assert.equal(s.post({ token: 'errada-errada-1', aba: 'ping' }).erro, 'senha (token) incorreta');
// 2) o AtendeZap descobre se o script está atualizado pela versão do ping
assert.ok(s.post({ token: SENHA, aba: 'ping' }).versao >= 2);
// 3) Demanda com as 3 colunas de tempo (14 colunas); fórmula neutralizada; cabeçalho criado
const linha = ['18/10/2026 07:31', 'buscar_carga', 'Goiânia', 'São Paulo', 'truck', 'baú', '', '', 'ofereceu', '', '=HYPERLINK("x")', '4200', '12', '95'];
let r = s.post({ token: SENHA, aba: 'IA - Demanda', linhas: [linha] }); assert.equal(r.ok, true); assert.equal(r.gravadas, 1);
assert.equal(s.abas['IA - Demanda'][0].length, 14); assert.equal(s.abas['IA - Demanda'][0][11], 'Tempo da IA (ms)'); assert.equal(s.abas['IA - Demanda'][0][13], 'Cliente demorou a responder (s)');
assert.equal(s.abas['IA - Demanda'][1][10], "'=HYPERLINK(\"x\")"); assert.equal(s.abas['IA - Demanda'][1][11], '4200'); assert.equal(s.abas['IA - Demanda'][1].length, 14);
// 4) aba de tempos aceita; aba estranha não
r = s.post({ token: SENHA, aba: 'IA - Tempos', linhas: [['18/10/2026 07:50', 'Atendente', 'respondeu depois do repasse', '95', 'valor']] }); assert.equal(r.ok, true);
assert.deepEqual(s.abas['IA - Tempos'][0], ['Data', 'Quem', 'Medida', 'Segundos', 'Detalhe']); assert.equal(s.abas['IA - Tempos'][1][3], '95');
assert.equal(s.post({ token: SENHA, aba: 'Outra Aba', linhas: [['x']] }).ok, false);
// 4b) v4: aba "IA - Conversas" (o banco de conhecimento): criada sozinha, 4 colunas, texto vira texto (nunca fórmula) e a versão do script sobe para 4
r = s.post({ token: SENHA, aba: 'IA - Conversas', linhas: [['23/10/2026 10:00', 'Vocês carregam aos domingos?', '=HYPERLINK("x")', 'Atendente (você)', 'coluna a mais ignorada']] }); assert.equal(r.ok, true); assert.equal(r.gravadas, 1);
assert.deepEqual(s.abas['IA - Conversas'][0], ['Data', 'Pergunta (sem dados pessoais)', 'Resposta (sem dados pessoais)', 'Quem respondeu']); assert.equal(s.abas['IA - Conversas'][1][2], "'=HYPERLINK(\"x\")"); assert.equal(s.abas['IA - Conversas'][1].length, 4);
assert.equal(s.post({ token: 'errada-errada-errada', aba: 'IA - Conversas', linhas: [['x']] }).ok, false);            // só quem tem a senha grava
assert.equal(s.post({ token: SENHA, aba: 'ping' }).versao, 5);
r = s.post({ token: SENHA, aba: 'IA - Avaliação', linhas: [['23/10/2026 18:00', '7', '12', '8', '6', '2', '4', '1', '=1+1']] }); assert.equal(r.ok, true); assert.deepEqual(s.abas['IA - Avaliação'][0], ['Data', 'Período (dias)', 'Trocas', 'Com memória', 'Bateram com a memória', 'Diferentes da memória', 'Sem memória', 'Sem resposta', 'Tempo mediano (s)']); assert.equal(s.abas['IA - Avaliação'][1][8], "'=1+1");   // v5: aba de avaliação (só números; fórmula vira texto)                                                       // a extensão confere esta versão antes de mandar linhas para a aba nova
// 5) aba "IA - Demanda" ANTIGA (11 colunas, já com dados): completa só os títulos novos e não mexe nos dados
const antiga = ['Data', 'Intenção', 'Origem', 'Destino', 'Veículo', 'Carroceria', 'Carga', 'Peso', 'Resultado', 'Motivo', 'Pergunta (sem dados pessoais)'];
const dado = ['18/10/2026 07:00', 'outro', '', '', '', '', '', '', 'humano', 'IA indisponível', 'Bom dia'];
s = carrega(SENHA, { 'IA - Demanda': [antiga, dado] });
assert.equal(s.post({ token: SENHA, aba: 'IA - Demanda', linhas: [linha] }).ok, true);
assert.equal(s.abas['IA - Demanda'][0].length, 14); assert.deepEqual(s.abas['IA - Demanda'][0].slice(0, 11), antiga); assert.equal(s.abas['IA - Demanda'][0][12], 'Cliente esperou (s)');
assert.deepEqual(s.abas['IA - Demanda'][1], dado);                                  // linha antiga intacta
assert.equal(s.abas['IA - Demanda'].length, 3);                                     // e a nova entrou embaixo
// 6) memória: precisa de senha; a ÚLTIMA linha de cada ID vale ("a" foi desligada depois)
s = carrega(SENHA, { 'IA - Memória': [['ID', 'Data', 'Tipo', 'Conteúdo', 'Ativo'], ['a', 'd', 'fato', 'Regra A', 'Sim'], ['b', 'd', 'fato', 'Regra B', 'Sim'], ['a', 'd', 'fato', 'Regra A', 'Não']] });
assert.equal(s.get({ acao: 'memoria', token: 'errada' }).ok, false);
r = s.get({ acao: 'memoria', token: SENHA }); assert.deepEqual(r.itens.map((i) => i.id), ['b']);


// 7) TRAVA DE ROBÔ ÚNICO (v1.28): só um computador responde por vez; o outro assume sozinho se o primeiro parar por 2,5 min
s = carrega(SENHA);
assert.equal(s.post({ token: SENHA, aba: 'robo', nome: 'sem identificação' }).ok, false);                                   // sem id do computador
let a = s.post({ token: SENHA, aba: 'robo', inst: 'AAA', nome: 'Computador AAAA' }); assert.equal(a.ok, true); assert.equal(a.dono, true);
a = s.post({ token: SENHA, aba: 'robo', inst: 'AAA', nome: 'Computador AAAA' }); assert.equal(a.dono, true);                  // quem tem a trava renova
let b = s.post({ token: SENHA, aba: 'robo', inst: 'BBB', nome: 'Computador BBBB' }); assert.equal(b.ok, true); assert.equal(b.dono, false); assert.equal(b.outro.nome, 'Computador AAAA'); assert.ok(b.outro.ha >= 0);
assert.equal(s.post({ token: 'errada-errada-1', aba: 'robo', inst: 'BBB' }).ok, false);                                       // precisa da senha
// o primeiro parou há mais de 2,5 min: o segundo assume
s.props.ROBO_IA = JSON.stringify({ inst: 'AAA', nome: 'Computador AAAA', t: Date.now() - 200000 });
b = s.post({ token: SENHA, aba: 'robo', inst: 'BBB', nome: 'Computador BBBB' }); assert.equal(b.dono, true);
a = s.post({ token: SENHA, aba: 'robo', inst: 'AAA', nome: 'Computador AAAA' }); assert.equal(a.dono, false); assert.equal(a.outro.nome, 'Computador BBBB');
// desligar libera na hora (só quem tem a trava libera)
assert.equal(s.post({ token: SENHA, aba: 'robo-livre', inst: 'AAA' }).ok, true); assert.ok(s.props.ROBO_IA);                // AAA não era o dono: nada muda
assert.equal(s.post({ token: SENHA, aba: 'robo-livre', inst: 'BBB' }).ok, true); assert.equal(s.props.ROBO_IA, undefined);
a = s.post({ token: SENHA, aba: 'robo', inst: 'AAA', nome: 'Computador AAAA' }); assert.equal(a.dono, true);
// 8) LIMPEZA POR DIAS (LGPD): apaga só o bloco antigo do começo das abas de dados; a memória aprovada não é tocada
const dia = (n) => { const d = new Date(Date.now() - n * 86400000); return d.toLocaleDateString('pt-BR') + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const cab = ['Data', 'x'];
s = carrega(SENHA, { 'IA - Demanda': [cab, ['01/01/2020, 10:00', 'velha1'], ['15/06/2021, 08:30', 'velha2'], [dia(40), 'velha3'], [dia(5), 'nova1'], [dia(1), 'nova2']],
  'IA - Tempos': [cab, [dia(100), 'velha'], [dia(2), 'nova']], 'IA - Aprendizado': [cab], 'IA - Memória': [['ID', 'Data', 'Tipo', 'Conteúdo', 'Ativo'], ['a', '01/01/2020, 10:00', 'fato', 'Regra A', 'Sim']] });
assert.equal(s.post({ token: SENHA, aba: 'limpar' }).ok, false);                                                              // sem "dias" não apaga nada
assert.equal(s.post({ token: 'errada-errada-1', aba: 'limpar', dias: 30 }).ok, false);
r = s.post({ token: SENHA, aba: 'limpar', dias: 30 }); assert.equal(r.ok, true); assert.equal(r.removidas, 4);
assert.deepEqual(s.abas['IA - Demanda'].map((l) => l[1]), ['x', 'nova1', 'nova2']); assert.deepEqual(s.abas['IA - Tempos'].map((l) => l[1]), ['x', 'nova']);
assert.equal(s.abas['IA - Memória'].length, 2);                                                                               // memória intacta
r = s.post({ token: SENHA, aba: 'limpar', dias: 30 }); assert.equal(r.removidas, 0);                                          // rodar de novo não apaga mais nada
console.log('script da planilha: todos os casos ok (tempos, cabeçalho, trava de robô único e limpeza)');
