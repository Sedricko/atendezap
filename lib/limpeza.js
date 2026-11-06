// AtendeZap — Limpar conversas antigas (v1.48): regras puras, sem tela e sem WhatsApp (testadas em test/util.test.js).
// Conversa = { id, grupo, t (segundos da última mensagem), unread, pin, labels (quantas etiquetas) }.
(() => {
  const L = {};
  L.FAIXAS = [30, 60, 90, 180, 360];
  const DIA = 864e5;
  const individual = (c) => !!c?.id && !c.grupo && !/@(g\.us|broadcast|newsletter)$/.test(c.id) && c.id !== 'status@broadcast';
  L.dias = (c, agora) => (c?.t > 0 ? Math.floor((agora - c.t * 1000) / DIA) : null);
  // Por que esta conversa NUNCA é apagada ('' = pode). pinsAZ = fixadas do AtendeZap (podem não estar marcadas no WhatsApp).
  L.protegida = (c, pinsAZ = []) => (c.pin || pinsAZ.includes(c.id) ? 'fixada' : (c.labels || 0) > 0 ? 'etiqueta' : (c.unread || 0) !== 0 ? 'não lida' : '');
  // Contagem por faixa (acumulada: "mais de 30 dias" inclui as de 60, 90…). Só conversas individuais com data conhecida.
  L.contar = (chats, agora, pinsAZ = []) => {
    const faixas = Object.fromEntries(L.FAIXAS.map((d) => [d, 0])), protegidas = { fixada: 0, etiqueta: 0, 'não lida': 0 };
    let total = 0;
    for (const c of chats || []) {
      if (!individual(c)) continue;
      const d = L.dias(c, agora); if (d == null) continue;
      total++;
      if (d < L.FAIXAS[0]) continue;
      const p = L.protegida(c, pinsAZ); if (p) { protegidas[p]++; continue; }
      for (const f of L.FAIXAS) if (d >= f) faixas[f]++;
    }
    return { faixas, protegidas, total };
  };
  // As conversas que "Apagar todas com mais de N dias" vai apagar (as mais antigas primeiro).
  L.candidatas = (chats, dias, agora, pinsAZ = []) => (chats || [])
    .filter((c) => individual(c) && !L.protegida(c, pinsAZ) && (L.dias(c, agora) ?? -1) >= dias)
    .map((c) => ({ id: c.id, nome: c.nome || '', dias: L.dias(c, agora) }))
    .sort((a, b) => b.dias - a.dias);
  // Grupo: mensagens com mais de N dias que podem sair (as com estrela ficam). msgs = [{ id, t, star }].
  L.velhasDoGrupo = (msgs, dias, agora) => (msgs || []).filter((m) => m?.id && m.t > 0 && !m.star && agora - m.t * 1000 >= dias * DIA).map((m) => m.id);
  globalThis.AZLIMP = L;
})();
