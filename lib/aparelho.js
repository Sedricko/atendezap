// AtendeZap — "Aparelho do contato" (v1.43). Regra PURA, a mesma que a biblioteca wa-js usa: olha o identificador da mensagem.
//   id com mais de 21 caracteres → Android · começa com "3A" → iPhone · começa com "3EB0" → WhatsApp Web/computador · o resto → desconhecido.
// É um PALPITE pelo formato do id (o WhatsApp não informa o aparelho): por isso olhamos várias mensagens e mostramos o quanto dá para confiar.
(() => {
  'use strict';
  const idDe = (ser) => { const p = String(ser == null ? '' : ser).split('_'); return p.length >= 3 ? p[2] : p[p.length - 1]; };   // 'false_5511999990001@c.us_3EB0AB…' → '3EB0AB…'
  const tipoDoId = (ser) => { const id = idDe(ser); if (!id) return 'desconhecido'; if (id.length > 21) return 'android'; if (id.startsWith('3A')) return 'iphone'; if (id.startsWith('3EB0')) return 'web'; return 'desconhecido'; };
  const ROTULO = { android: 'Android', iphone: 'iPhone', web: 'WhatsApp Web / computador', desconhecido: 'não deu para saber' };
  // ids = mensagens RECEBIDAS do contato, da mais nova para a mais antiga. Empate: vale a mais recente.
  const resumo = (ids) => {
    const lista = (ids || []).map(tipoDoId), cont = { android: 0, iphone: 0, web: 0, desconhecido: 0 }; for (const t of lista) cont[t]++;
    const conhecidos = lista.length - cont.desconhecido; let provavel = null, topo = 0;
    for (const t of lista) { if (t !== 'desconhecido' && cont[t] > topo) { topo = cont[t]; provavel = t; } }
    const parte = conhecidos ? topo / conhecidos : 0;
    const confianca = !provavel ? 'nenhuma' : conhecidos >= 5 && parte >= 0.8 ? 'alta' : conhecidos >= 2 && parte >= 0.6 ? 'media' : 'baixa';
    return { total: lista.length, contagem: cont, provavel, rotulo: provavel ? ROTULO[provavel] : ROTULO.desconhecido, confianca, conhecidos };
  };
  globalThis.AZAPARELHO = { idDe, tipoDoId, resumo, ROTULO };
})();
