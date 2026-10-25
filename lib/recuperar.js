// AtendeZap — "Recuperar mensagens apagadas" (v1.38). Regras PURAS (sem DOM, sem rede, sem armazenamento): o que guardar, o que ignorar, como montar o registro,
// quando esquecer. Roda no painel (mundo isolado) e nos testes (Node). A cópia é feita pela ponte no instante em que o WhatsApp avisa que a mensagem vai ser apagada.
(() => {
  'use strict';
  // tipos que não têm conteúdo para recuperar (avisos do sistema, chamadas, o próprio "apagada")
  const SEM_CONTEUDO = /^(e2e_notification|notification|notification_template|gp2|protocol|revoked|call_log|ciphertext|broadcast_notification|template_button_reply)$/;
  const ROTULO = { chat: '', image: '[foto]', video: '[vídeo]', ptt: '[áudio]', audio: '[áudio]', document: '[documento]', sticker: '[figurinha]', location: '[localização]', vcard: '[contato]', multi_vcard: '[contatos]', poll_creation: '[enquete]', ptv: '[vídeo]' };
  const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
  const b64ok = (s) => B64.test(s) && s.length % 4 === 0;   // base64 de tamanho inválido o navegador recusa (imagem quebrada): melhor não guardar
  // o WhatsApp informa 'audio/ogg; codecs=opus': só o tipo base interessa (e o que vier depois do ';' é descartado)
  const mimeBase = (m) => String(m == null ? '' : m).split(';')[0].trim().toLowerCase();
  const trecho = (t, n = 1500) => String(t == null ? '' : t).replace(/[ \t]+\n/g, '\n').trim().slice(0, n);
  const num = (v, min, max, pad) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : pad; };
  const cfgPadrao = () => ({ ligado: false, aceitou: false, dias: 7, grupos: true, midia: false, maxMB: 3 });
  const normalizarCfg = (c) => { const p = cfgPadrao(), o = c || {}; return { ligado: o.ligado === true, aceitou: o.aceitou === true, dias: num(o.dias, 1, 30, p.dias), grupos: o.grupos !== false, midia: o.midia === true, maxMB: num(o.maxMB, 1, 8, p.maxMB) }; };
  // Por que NÃO guardar ('' = guardar).
  const pular = (snap, ev, cfg) => {
    if (!cfg || !cfg.ligado) return 'desligado';
    if (ev && ev.fromMe) return 'fui eu que apaguei';
    if (!snap || !snap.id) return 'sem identificação';
    if (snap.viewOnce) return 'visualização única: não se guarda';
    if (snap.grupo && cfg.grupos === false) return 'grupo (desligado nas opções)';
    if (snap.existe && SEM_CONTEUDO.test(snap.tipo || '')) return 'aviso do sistema';
    return '';
  };
  // snap = o que a ponte leu da mensagem original (antes de o WhatsApp apagá-la); ev = { fromMe, tipo }. Devolve o registro a guardar (ou null).
  const montarRegistro = (snap, ev, cfg, agora = Date.now()) => {
    if (pular(snap, ev, cfg)) return null;
    const tipo = String(snap.tipo || (snap.existe ? 'chat' : '')), thumb = String(snap.thumb || '');
    return {
      id: String(snap.id).slice(0, 120), chatId: String(snap.chatId || '').slice(0, 80), chatNome: trecho(snap.chatNome, 80), grupo: !!snap.grupo, deNome: trecho(snap.deNome || snap.chatNome, 80),
      tipo, rotulo: ROTULO[tipo] != null ? ROTULO[tipo] : (tipo ? `[${tipo}]` : ''), texto: trecho(snap.texto), thumb: b64ok(thumb) && thumb.length <= 60000 ? thumb : '',
      mime: /^((image|audio|video)\/[\w.+-]+|application\/pdf)$/.test(mimeBase(snap.mime)) ? mimeBase(snap.mime) : '',   // só tipos conhecidos (campo informativo) nome: trecho(snap.nome, 120), dur: num(snap.dur, 0, 36000, 0),
      enviadaEm: snap.t ? Math.round(Number(snap.t) * 1000) : 0, apagadaEm: agora, por: ev && ev.tipo === 'admin_revoke' ? 'admin' : 'remetente', indisponivel: !snap.existe, midia: null,
    };
  };
  // anexa foto/áudio recuperado (base64) ao registro, só se for do tipo e do tamanho permitidos
  const anexarMidia = (rec, m, maxMB = 3) => {
    if (!rec || !m || !/^(image|audio|video)\/[\w.+-]+$/.test(mimeBase(m.mime)) || !b64ok(String(m.b64 || ''))) return rec;
    const bytes = Math.floor(String(m.b64).length * 3 / 4); if (bytes > num(maxMB, 1, 8, 3) * 1e6) return rec;
    return { ...rec, midia: { mime: mimeBase(m.mime), b64: String(m.b64), bytes } };
  };
  // esquece o que passou do prazo (dias de 1 a 30)
  const purgar = (lista, dias, agora = Date.now()) => {
    const lim = num(dias, 1, 30, 7) * 864e5, manter = [], removidos = [];
    for (const r of lista || []) (agora - (r.apagadaEm || 0) <= lim ? manter : removidos).push(r);
    return { manter, removidos: removidos.map((r) => r.id) };
  };
  // só contagens (para o relatório: nunca o conteúdo)
  const resumo = (lista) => { const l = lista || []; return { n: l.length, comMidia: l.filter((r) => r.midia).length, grupos: l.filter((r) => r.grupo).length, semConteudo: l.filter((r) => r.indisponivel).length }; };
  globalThis.AZREC = { cfgPadrao, normalizarCfg, pular, montarRegistro, anexarMidia, purgar, resumo, trecho };
})();
