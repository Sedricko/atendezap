// AtendeZap — Laboratório › Funções do WhatsApp (v1.49): agrupa as chaves pelas "funções-porteiro" do próprio código do WhatsApp.
// Cada função is/has/can/should…() lê uma ou mais chaves: essas chaves são as dependências dela, e um botão liga/desliga todas juntas.
// Regras puras, sem tela (testadas em test/util.test.js). Limites e anti-spam NUNCA entram (só chaves liga/desliga; o monitor só lê os limites).
(() => {
  const F = {};
  F.AREAS = [[/^Status/, 'Status'], [/Newsletter|Channel/, 'Canais'], [/Group|Community/, 'Grupos e comunidades'], [/Call|Voip/, 'Ligações'],
    [/Biz|Business|Smb|Catalog|Order|Ctwa|Payment|Pix/, 'Business e pagamentos'], [/Poll/, 'Enquetes'], [/Pin/, 'Fixar'], [/Event/, 'Eventos'],
    [/Media|Image|Video|Sticker|Ptt|Album|Gif/, 'Mídia'], [/Search/, 'Busca'], [/Privacy|Lock/, 'Privacidade'], [/Ai[A-Z]|MetaAi|Bot|Hatch/, 'Meta AI'],
    [/Username/, 'Nome de usuário'], [/Messag|Msg|Chat|Composer|Reaction|Reply|Edit/, 'Mensagens e conversa']];
  F.area = (mod) => (F.AREAS.find(([rx]) => rx.test(mod)) || [null, 'Outros'])[1];
  // "isStatusLikesSendEnabled" -> "Status likes send" (o nome é do próprio WhatsApp, em inglês)
  F.nome = (fn) => String(fn).replace(/^(is|has|can|should)/, '').replace(/(Enabled|Enable|Allowed|Supported)$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').trim().toLowerCase().replace(/^./, (c) => c.toUpperCase());
  const ehBool = (v) => typeof v === 'boolean' || v === 0 || v === 1 || v === 'true' || v === 'false';
  F.comoBool = (v) => v === true || v === 1 || v === 'true';
  const PERIGO = /capping|spam|integrity|restrict|enforce|ban|block|report|limit|quota|kill_switch|defense/i;   // nunca vira botão
  // portoes = { Modulo: { funcao: [resultado, [chaves]] } } (do "Ler o código"); recursos = [{ nome, valor }]; novas = ids vistos pela 1ª vez.
  F.agrupar = (portoes, recursos, novas = []) => {
    const val = new Map((recursos || []).map((r) => [r.nome, r.valor])), visto = new Map(), out = [];
    for (const [mod, fns] of Object.entries(portoes || {})) for (const [fn, par] of Object.entries(fns || {})) {
      const [resultado, chaves] = Array.isArray(par) ? par : [null, []];
      if (!/^(is|has|can|should)[A-Z]/.test(fn) || !chaves?.length) continue;
      const cs = [...new Set(chaves.filter((k) => val.has(k)))];
      if (!cs.length || !cs.every((k) => ehBool(val.get(k))) || cs.some((k) => PERIGO.test(k))) continue;
      const id = `${mod}.${fn}`, sig = [...cs].sort().join('|');
      if (visto.has(sig)) { visto.get(sig).tambem.push(id); continue; }   // outra função lendo as MESMAS chaves: é a mesma função na prática
      const it = { id, modulo: mod, area: F.area(mod), nome: F.nome(fn), chaves: cs, resultado, novo: novas.includes(id), tambem: [] };
      visto.set(sig, it); out.push(it);
    }
    return out.sort((a, b) => b.novo - a.novo || a.area.localeCompare(b.area, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR'));
  };
  // Estado agora (original do WhatsApp + o que você mudou no Laboratório): 'ligado' | 'desligado' | 'parcial'.
  F.estado = (it, valorDe) => { const n = it.chaves.filter((k) => F.comoBool(valorDe(k))).length; return n === it.chaves.length ? 'ligado' : n ? 'parcial' : 'desligado'; };
  F.ids = (portoes) => Object.entries(portoes || {}).flatMap(([m, fns]) => Object.keys(fns || {}).map((f) => `${m}.${f}`));
  globalThis.AZFUN = F;
})();
