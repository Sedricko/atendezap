// AtendeZap — "Avaliação do atendimento contra a memória" (v1.44). Regras PURAS, SEM IA: confere o que você respondeu nas conversas reais contra as perguntas e respostas que a memória já aprendeu.
// Não dá "nota" a ninguém: mostra números e lista os casos para você olhar (resposta diferente da memória, pergunta sem memória, cliente sem resposta, tempo de resposta).
(() => {
  'use strict';
  const T = globalThis.AZTREINO;
  // a resposta dada cobre o que a memória diz? (60% das palavras-chave da memória aparecem) e as duas concordam em "não"
  const respostaBate = (memR, resp) => {
    const a = T.tokens(memR), b = T.tokens(resp); if (!a.size || !b.size) return false;
    return T.temNao(memR) === T.temNao(resp) && T.inter(a, b) / a.size >= 0.6;
  };
  const percentil = (arr, q) => { if (!arr.length) return 0; const s = [...arr].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
  // chats = [{ id, nome, msgs: [{ t (s), fromMe, texto }] }]; memoria = [{ p, r }]; ehRoboPorChat(id) → (msg) => boolean
  const avaliar = (chats, memoria, { agora = Date.now(), esperaMin = 15, ehRoboPorChat = () => () => false } = {}) => {
    const mem = (memoria || []).map((f) => ({ ...f, tp: T.tokens(f.p) })), out = { trocas: 0, comMemoria: 0, consistentes: 0, divergentes: [], semMemoria: [], semResposta: [], tempo: { n: 0, mediana: 0, p90: 0 } };
    const dts = [], sobras = [];
    for (const ch of chats || []) {
      const msgs = [...(ch.msgs || [])].sort((a, b) => (a.t || 0) - (b.t || 0));
      for (const par of T.extrairPares(msgs, { ehRobo: ehRoboPorChat(ch.id) })) {
        out.trocas++; if (par.dt >= 0) dts.push(par.dt);
        const f = mem.find((m) => m.tp.size && T.mesmaPergunta(m.tp, T.tokens(par.p)));
        if (!f) { sobras.push({ p: par.p, r: par.r, n: 1, chs: [ch.id], t: par.t * 1000 }); continue; }
        out.comMemoria++;
        if (respostaBate(f.r, par.r)) out.consistentes++; else out.divergentes.push({ id: ch.id, nome: ch.nome || '', p: par.p, resposta: par.r, memoriaP: f.p, memoriaR: f.r, t: par.t });
      }
      const ult = msgs[msgs.length - 1];   // o cliente falou por último e passou do tempo: ficou sem resposta
      if (ult && !ult.fromMe && !T.trivial(ult.texto) && (agora / 1000 - ult.t) / 60 >= esperaMin) out.semResposta.push({ id: ch.id, nome: ch.nome || '', texto: String(ult.texto).slice(0, 160), esperaMin: Math.round((agora / 1000 - ult.t) / 60) });
    }
    out.semMemoria = T.agrupar(sobras).filter((c) => c.n >= 1).slice(0, 8).map((c) => ({ p: c.p, n: c.n, chats: c.chats })).sort((a, b) => b.n - a.n);
    out.tempo = { n: dts.length, mediana: percentil(dts, 0.5), p90: percentil(dts, 0.9) };
    out.semResposta.sort((a, b) => b.esperaMin - a.esperaMin);
    return out;
  };
  globalThis.AZAVAL = { respostaBate, percentil, avaliar };
})();
