// AtendeZap — Central da equipe (v1.52): regras puras, sem tela (testadas em test/util.test.js).
// A planilha NUNCA recebe o telefone do cliente: só uma "impressão digital" = SHA-256(senha da equipe + número), em hexadecimal.
// Limite honesto: quem tiver a planilha E a senha da equipe consegue, com esforço, testar números e descobrir quais são. Não é cofre.
(() => {
  const E = {};
  // Só conversa individual com número (…@c.us). @lid não é telefone (o mesmo cliente tem outro @lid em outro número da equipe): fica de fora.
  E.numeroDe = (chatId) => { const m = /^(\d{8,15})@c\.us$/.exec(String(chatId || '')); return m ? m[1] : null; };
  E.digital = async (segredo, chatId) => {
    const n = E.numeroDe(chatId); if (!n || !segredo) return null;
    const b = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${segredo}|${n}`));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
  };
  // O que mostrar ao abrir a conversa. info = resposta da planilha { dono, desde, passadoPor, motivo, quando }; eu = meu nome na equipe.
  E.aviso = (info, eu) => {
    if (!info?.dono) return null;
    const d = (t) => (t ? new Date(t).toLocaleDateString('pt-BR') : '');
    if (info.dono === eu) return info.passadoPor ? { tipo: 'meu', texto: `${info.passadoPor} passou este cliente para você em ${d(info.quando)}${info.motivo ? `: "${info.motivo}"` : '.'}` } : null;
    return { tipo: 'outro', texto: `Este cliente é de ${info.dono}${info.desde ? ` (desde ${d(info.desde)})` : ''}. Combine com ${info.dono} antes de negociar.` };
  };
  // Mensagem opcional ao cliente no "passar": o contato do colega (só se o colega tiver o número dele na planilha).
  E.textoPassar = (colega) => (colega?.whatsapp ? `A partir de agora quem vai te atender é ${colega.nome}: https://wa.me/${colega.whatsapp}` : null);
  E.limparColegas = (l) => (Array.isArray(l) ? l : []).slice(0, 50).map((c) => ({ nome: String(c?.nome || '').trim().slice(0, 60), whatsapp: String(c?.whatsapp || '').replace(/\D/g, '').slice(0, 15) || '' })).filter((c) => c.nome);
  globalThis.AZEQUIPE = E;
})();
