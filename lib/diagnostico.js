// AtendeZap — diagnóstico (v1.47). Regras PURAS que montam o que vai no pacote de suporte: diferença entre dois mapas do WhatsApp, resumo das chamadas à ponte, ranking de armazenamento e o texto do pacote.
// Nada aqui lê conversa: só nomes de chaves/módulos, contagens e tempos.
(() => {
  'use strict';
  const mesmo = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // base/atual = { whatsapp, t?, flags: { nome: valor }, modulos: [ids] } → o que o WhatsApp acrescentou, tirou ou mudou entre as duas leituras
  const diffMapas = (base, atual, max = 150) => {
    const fa = (base && base.flags) || {}, fb = (atual && atual.flags) || {}, novas = [], removidas = [], mudaram = [];
    for (const k of Object.keys(fb)) { if (!(k in fa)) novas.push({ nome: k, valor: fb[k] }); else if (!mesmo(fa[k], fb[k])) mudaram.push({ nome: k, de: fa[k], para: fb[k] }); }
    for (const k of Object.keys(fa)) if (!(k in fb)) removidas.push({ nome: k, valor: fa[k] });
    const ma = new Set((base && base.modulos) || []), mb = new Set((atual && atual.modulos) || []), modNovos = [...mb].filter((x) => !ma.has(x)).sort(), modRem = [...ma].filter((x) => !mb.has(x)).sort(), c = (l) => l.slice(0, max);
    return { de: (base && base.whatsapp) || '?', para: (atual && atual.whatsapp) || '?', quandoBase: (base && base.t) || 0,
      contagem: { chavesNovas: novas.length, chavesRemovidas: removidas.length, chavesMudaram: mudaram.length, modulosNovos: modNovos.length, modulosRemovidos: modRem.length },
      chavesNovas: c(novas), chavesRemovidas: c(removidas), chavesMudaram: c(mudaram), modulosNovos: c(modNovos), modulosRemovidos: c(modRem) };
  };
  // PONTE = { metodo: { n, erros, ms, max } } → os métodos que mais custaram (n × média), com média, máximo e erros
  const resumirPonte = (p, n = 12) => Object.entries(p || {}).map(([metodo, x]) => ({ metodo, n: x.n || 0, erros: x.erros || 0, mediaMs: x.n ? Math.round(x.ms / x.n) : 0, maxMs: Math.round(x.max || 0) }))
    .sort((a, b) => b.n * b.mediaMs - a.n * a.mediaMs || b.n - a.n).slice(0, n);
  const topArmazenamento = (bytesPorChave, n = 12) => Object.entries(bytesPorChave || {}).map(([chave, bytes]) => ({ chave, bytes: Number(bytes) || 0 })).sort((a, b) => b.bytes - a.bytes).slice(0, n);
  const textoPacote = ({ versao, whatsapp, quando, arquivos }) => ['AtendeZap — pacote de diagnóstico', `AtendeZap ${versao} · WhatsApp ${whatsapp} · ${quando}`, '', 'O que tem aqui:', ...(arquivos || []).map(([n, d]) => `- ${n}: ${d}`), '',
    'PRIVACIDADE: este pacote NÃO leva mensagens, nomes de contatos, telefones, ids de conversa, links de convite, a chave da IA, o convite da equipe nem o endereço da sua planilha.',
    'Só vão nomes de chaves e módulos do WhatsApp, contagens, tempos, tamanhos de armazenamento e mensagens de erro (com números longos mascarados).', '', 'Envie o .zip inteiro ao Claude.'].join('\n') + '\n';
  globalThis.AZDIAG = { diffMapas, resumirPonte, topArmazenamento, textoPacote };
})();
