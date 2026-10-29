// Funções puras do Observador (usadas no service worker, no painel e nos testes).
(function (g) {
  const dois = n => String(n).padStart(2, '0');
  const OBS = {
    // Sites nunca registrados (bancos e pagamentos). O painel deixa editar.
    BLOQUEIO_PADRAO: ['bb.com.br', 'itau.com.br', 'bradesco.com.br', 'caixa.gov.br', 'santander.com.br', 'nubank.com.br',
      'bancointer.com.br', 'inter.co', 'sicoob.com.br', 'sicredi.com.br', 'mercadopago.com.br', 'paypal.com'],
    bloqueado: (host, lista) => lista.some(d => host === d || host.endsWith('.' + d)),
    dia: (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`; },
    hora: t => { const d = new Date(t); return `${dois(d.getHours())}:${dois(d.getMinutes())}`; },
    // Linha do tempo legível para a IA: site (tempo) — título, e embaixo o porquê e o que foi feito lá.
    texto(evs) {
      const out = [];
      evs.forEach((e, i) => {
        if (e.tipo === 'site') {
          const fim = evs.slice(i + 1).find(x => x.tipo === 'site' || x.tipo === 'fora');
          const min = fim ? ` (${Math.round((fim.t - e.t) / 60000)} min)` : '';
          out.push(`${OBS.hora(e.t)}${min} ${e.host} — ${e.titulo || ''}`);
        } else if (e.tipo === 'fora') out.push(`${OBS.hora(e.t)} fora do navegador ou site privado`);
        else out.push(`    ${{ porque: 'porque', clique: 'clicou', campo: 'preencheu' }[e.tipo] || e.tipo}: ${e.texto}`);
      });
      return out.join('\n');
    }
  };
  g.OBS = OBS;
  if (typeof module !== 'undefined') module.exports = OBS;
})(globalThis);
