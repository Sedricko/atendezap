// Gera lib/wrapalvos.js: a tabela "posição (linha, coluna) de cada wrapModuleFunction na wa-js -> nome da função do WhatsApp que ela embrulha".
// Serve para o relatório dizer QUAL função causou o aviso "func is not a function". Rode de novo sempre que trocar lib/wppconnect-wa.js:
//   node tools/gerar-wrapalvos.js        (o teste test/util.test.js confere se a tabela atual bate com a wa-js empacotada)
const fs = require('fs'), path = require('path');
// Funções do WhatsApp que a wa-js embrulha só como "cinto de segurança" e que o WhatsApp já removeu: o aviso é inofensivo para o AtendeZap.
// isLidMigrated: try/catch ao redor de uma checagem da migração de contatos (LID) que o WhatsApp tirou; só o diagnóstico interno da wa-js a usava.
const BENIGNOS = ['isLidMigrated'];
function alvos(lib) {
  const out = [], re = /\(0,\w+\.wrapModuleFunction\)\((\w+)\.(\w+)\s*,/g; let m;
  while ((m = re.exec(lib))) { const i = m.index, linha = lib.slice(0, i).split('\n').length, col = i - (lib.lastIndexOf('\n', i - 1) + 1) + 1; out.push([linha, col, m[2]]); }
  return out;
}
function gerar(lib) {
  const A = alvos(lib);
  return `// GERADO por tools/gerar-wrapalvos.js a partir de lib/wppconnect-wa.js (${A.length} chamadas de wrapModuleFunction). NÃO edite à mão: o teste confere.
// Carregado no mundo da página ANTES de page/pre.js. [linha, coluna, função do WhatsApp que a wa-js embrulha], em ordem de posição.
(() => {
  'use strict';
  const ALVOS = ${JSON.stringify(A)};
  // inofensivos: ver tools/gerar-wrapalvos.js
  const BENIGNOS = ${JSON.stringify(BENIGNOS)};
  // pilha de um console.error("func is not a function") -> nome da função que a wa-js tentou embrulhar ('' se não der para saber).
  // 1º quadro da wa-js = dentro do wrapModuleFunction (onde o erro é impresso); 2º = a chamada que pediu o embrulho (a posição que procuramos).
  const resolver = (pilha) => {
    const q = String(pilha || '').split('\\n').filter((l) => /wppconnect-wa\\.js:\\d+:\\d+/.test(l)), m = q[1] && /wppconnect-wa\\.js:(\\d+):(\\d+)/.exec(q[1]);
    if (!m) return '';
    const L = +m[1], C = +m[2]; let nome = '';
    for (const [l, c, n] of ALVOS) { if (l < L || (l === L && c <= C)) nome = n; else break; }
    return nome;
  };
  globalThis.AZWRAP = { ALVOS, BENIGNOS, resolver };
})();
`;
}
module.exports = { alvos, gerar, BENIGNOS };
if (require.main === module) {
  const lib = fs.readFileSync(path.join(__dirname, '../lib/wppconnect-wa.js'), 'utf8');
  fs.writeFileSync(path.join(__dirname, '../lib/wrapalvos.js'), gerar(lib));
  console.log('lib/wrapalvos.js gerado:', alvos(lib).length, 'chamadas,', new Set(alvos(lib).map((a) => a[2])).size, 'funções');
}
