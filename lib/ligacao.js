// AtendeZap — "Ligação não atendida → resposta automática" (v1.44). Regras PURAS. O WhatsApp Web avisa quando alguém liga (evento call.incoming_call); o painel decide, espera um pouco,
// confere se você já falou com a pessoa e só então manda UMA mensagem curta. Nunca em grupo, nunca de novo para o mesmo contato dentro do intervalo.
(() => {
  'use strict';
  const TEXTO = 'Oi! Vi que você ligou. Não consigo atender ligação agora; me escreva aqui por mensagem que eu respondo assim que possível.';
  const num = (v, min, max, pad) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : pad; };
  const cfgPadrao = () => ({ ligado: false, aceitou: false, texto: TEXTO, esperaS: 60, horasEntre: 6, video: true });
  const normalizarCfg = (c) => { const o = c || {}, p = cfgPadrao(); return { ligado: o.ligado === true, aceitou: o.aceitou === true, texto: String(o.texto == null ? p.texto : o.texto).replace(/\s+/g, ' ').trim().slice(0, 300) || p.texto, esperaS: num(o.esperaS, 15, 600, p.esperaS), horasEntre: num(o.horasEntre, 1, 72, p.horasEntre), video: o.video !== false }; };
  // 1ª decisão (assim que a ligação toca). ult = { [chatId]: milissegundos da última resposta automática }
  const decidir = (ev, ult, cfg, agora = Date.now()) => {
    if (!cfg || !cfg.ligado) return { enviar: false, motivo: 'desligado' };
    if (!ev || !ev.chatId) return { enviar: false, motivo: 'sem contato' };
    if (ev.isGroup || /@g\.us$/.test(ev.chatId)) return { enviar: false, motivo: 'ligação de grupo' };
    if (ev.isVideo && cfg.video === false) return { enviar: false, motivo: 'videochamada (desligado nas opções)' };
    if (agora - ((ult || {})[ev.chatId] || 0) < cfg.horasEntre * 36e5) return { enviar: false, motivo: 'já respondi a este contato há pouco' };
    return { enviar: true, motivo: '' };
  };
  // 2ª decisão (depois da espera): se você já escreveu para ele por volta da ligação (até 5 min antes ou depois), não manda nada
  const depoisDaEspera = (ctx, ev) => ((ctx && ctx.ultimaMinha) || 0) * 1000 >= ((ev && ev.offerTime) || 0) * 1000 - 300000 ? { enviar: false, motivo: 'você já falou com ele' } : { enviar: true, motivo: '' };
  globalThis.AZLIG = { TEXTO, cfgPadrao, normalizarCfg, decidir, depoisDaEspera };
})();
