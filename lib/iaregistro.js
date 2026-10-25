// AtendeZap — "Envios à IA" (v1.45): transparência. Monta o registro do que o painel mandou para a IA do Google, para o usuário CONFERIR com os próprios olhos.
// Regras PURAS. Fica só na memória da página (some ao recarregar); nada é gravado em disco. A chave da API nunca entra aqui: só se copiam campos conhecidos.
(() => {
  'use strict';
  const MARCAS = [['aprende com conversas reais', 'Banco de conhecimento (consolidar)'], ['resume o que o atendente perdeu', 'Resumo do que perdi'], ['analisa o atendimento de um dia', 'Aprender com o dia'], ['assistente virtual de atendimento', 'Atendente IA (decisão)'],
    ['transcreve áudios', 'Transcrição de áudio'], ['explica o diagnóstico', 'Explicar o diagnóstico'], ['respostas rápidas', 'Respostas rápidas (assistente de IA)']];
  const rotulo = (sistema, op) => { const s = String(sistema || '').toLowerCase(); for (const [m, r] of MARCAS) if (s.includes(m)) return r; return op && op !== 'gerar' ? `Chave / modelos (${op})` : 'Outra chamada à IA'; };
  const corta = (t, n) => String(t == null ? '' : t).slice(0, n);
  // dados = o que se passa a iaPedir: { op, sistema, contents: [{ role, parts: [{ text } | { inlineData: { mimeType, data } }] }] }
  const montar = (dados, agora = Date.now()) => {
    const d = dados || {}, partes = [];
    for (const c of Array.isArray(d.contents) ? d.contents : []) {
      const txt = (c.parts || []).map((p) => (p && p.text ? p.text : p && p.inlineData ? `[${p.inlineData.mimeType || 'mídia'}: ~${Math.round(String(p.inlineData.data || '').length * 0.75 / 1024)} KB — o ARQUIVO em si vai para a IA]` : '')).filter(Boolean).join(' ');
      if (txt) partes.push(`${c.role === 'model' ? 'IA' : 'Painel'}: ${txt}`);
    }
    const texto = partes.join('\n\n');
    return { t: agora, ms: 0, erro: '', rotulo: rotulo(d.sistema, d.op), chars: texto.length, texto: corta(texto, 2500), cortado: texto.length > 2500, sistema: corta(String(d.sistema || '').replace(/\s+/g, ' ').trim(), 160) };
  };
  const adicionar = (lista, dados, agora, max = 25) => [montar(dados, agora), ...(lista || [])].slice(0, max);
  // resumo do que já foi enviado (tempo e erro de cada chamada): para o pacote de diagnóstico
  const resumo = (itens) => { const l = itens || [], por = {}; for (const e of l) { const x = (por[e.rotulo] ||= { n: 0, erros: 0, ms: 0, chars: 0 }); x.n++; if (e.erro) x.erros++; x.ms += e.ms || 0; x.chars += e.chars || 0; }
    return { envios: l.length, comErro: l.filter((e) => e.erro).length, porRotulo: Object.entries(por).map(([rotulo, x]) => ({ rotulo, n: x.n, erros: x.erros, mediaMs: x.n ? Math.round(x.ms / x.n) : 0, caracteres: x.chars })).sort((a, b) => b.n - a.n) }; };
  globalThis.AZIAREG = { rotulo, montar, adicionar, resumo };
})();
