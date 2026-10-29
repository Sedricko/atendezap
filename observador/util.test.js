// node observador/util.test.js
const assert = require('assert');
const OBS = require('./extensao/util.js');

assert.ok(OBS.bloqueado('www.itau.com.br', OBS.BLOQUEIO_PADRAO));
assert.ok(OBS.bloqueado('itau.com.br', OBS.BLOQUEIO_PADRAO));
assert.ok(!OBS.bloqueado('meuitau.com.br.exemplo.com', OBS.BLOQUEIO_PADRAO));
assert.ok(!OBS.bloqueado('mail.google.com', OBS.BLOQUEIO_PADRAO));

const t = new Date(2026, 9, 29, 8, 12).getTime(), min = 60000;
assert.equal(OBS.dia(t), '2026-10-29');
assert.equal(OBS.texto([
  { t, tipo: 'site', host: 'mail.google.com', titulo: 'Caixa de entrada' },
  { t: t + min, tipo: 'porque', host: 'mail.google.com', texto: 'ver pedidos novos' },
  { t: t + 2 * min, tipo: 'clique', host: 'mail.google.com', texto: 'Responder' },
  { t: t + 3 * min, tipo: 'campo', host: 'mail.google.com', texto: 'Assunto' },
  { t: t + 8 * min, tipo: 'fora' },
  { t: t + 9 * min, tipo: 'site', host: 'web.whatsapp.com', titulo: 'WhatsApp' }
]), [
  '08:12 (8 min) mail.google.com — Caixa de entrada',
  '    porque: ver pedidos novos',
  '    clicou: Responder',
  '    preencheu: Assunto',
  '08:20 fora do navegador ou site privado',
  '08:21 web.whatsapp.com — WhatsApp'
].join('\n'));

console.log('ok');
