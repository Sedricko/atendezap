// AtendeZap — Risco de banimento (v1.50): conta o que a EXTENSÃO enviou hoje e compara com faixas de cautela. Regras puras (testadas em test/util.test.js).
// As faixas são CAUTELA nossa, não números oficiais: o WhatsApp não publica limites. O sinal mais forte é o do próprio WhatsApp (teto de contatos novos ligado).
// Só avisa: nunca bloqueia nem ajuda a passar de limite. Guarda só contagens e "impressões digitais" (hash) dos destinos, nunca número nem mensagem.
(() => {
  const R = {};
  R.FAIXAS = { destinos: [150, 300], mensagens: [400, 800], porMinuto: [20, 40], iniciadas: [30, 60], status: [30, 60] };   // [amarelo, vermelho] por dia (porMinuto = pico)
  R.NOMES = { destinos: 'conversas diferentes que receberam mensagem', mensagens: 'mensagens enviadas pelo AtendeZap', porMinuto: 'pico de mensagens num minuto', iniciadas: 'conversas novas iniciadas', status: 'status publicados' };
  const ENVIO = new Set(['sendText', 'sendFile', 'sendContact', 'sendEspecial']);
  const dia = (agora) => { const d = new Date(agora); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
  R.vazio = (agora) => ({ dia: dia(agora), mensagens: 0, destinos: [], porMinuto: 0, minuto: 0, noMinuto: 0, iniciadas: 0, status: 0 });
  // Um envio que passou pela ponte. h = hash do destino (o painel calcula). Muda de dia = zera.
  R.registrar = (est, metodo, h, agora) => {
    let e = est && est.dia === dia(agora) ? { ...est, destinos: [...(est.destinos || [])] } : R.vazio(agora);
    if (metodo === 'sendStatus') { e.status++; return e; }
    if (metodo === 'startChat') { e.iniciadas++; return e; }
    if (!ENVIO.has(metodo)) return e;
    e.mensagens++;
    if (h && !e.destinos.includes(h)) e.destinos.push(h);
    const m = Math.floor(agora / 60000);
    e.noMinuto = e.minuto === m ? e.noMinuto + 1 : 1; e.minuto = m; e.porMinuto = Math.max(e.porMinuto, e.noMinuto);
    return e;
  };
  R.valores = (e) => ({ destinos: (e?.destinos || []).length, mensagens: e?.mensagens || 0, porMinuto: e?.porMinuto || 0, iniciadas: e?.iniciadas || 0, status: e?.status || 0 });
  // nivel: 'verde' | 'amarelo' | 'vermelho'; tetoLigado = o monitor viu o teto de contatos novos ligado na conta.
  R.avaliar = (e, agora, tetoLigado = false) => {
    const v = R.valores(e && e.dia === dia(agora) ? e : null), motivos = [];
    let nivel = 'verde';
    for (const [k, [am, vm]] of Object.entries(R.FAIXAS)) {
      if (v[k] >= vm) { nivel = 'vermelho'; motivos.push({ k, nivel: 'vermelho', valor: v[k], faixa: vm }); }
      else if (v[k] >= am) { if (nivel === 'verde') nivel = 'amarelo'; motivos.push({ k, nivel: 'amarelo', valor: v[k], faixa: am }); }
    }
    if (tetoLigado) { nivel = 'vermelho'; motivos.unshift({ k: 'teto', nivel: 'vermelho' }); }
    return { nivel, motivos, valores: v };
  };
  // Antes do "Enviar para vários": como fica o dia se mandar para n conversas (cada uma recebe "msgs" envios).
  R.previsao = (e, n, msgs, agora, tetoLigado = false) => {
    const v = R.valores(e && e.dia === dia(agora) ? e : null);
    return R.avaliar({ dia: dia(agora), ...v, destinos: Array.from({ length: v.destinos + n }, (_, i) => i), mensagens: v.mensagens + n * msgs }, agora, tetoLigado);
  };
  globalThis.AZRISCO = R;
})();
