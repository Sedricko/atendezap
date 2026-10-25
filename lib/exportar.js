// AtendeZap — "Exportar conversa" (v1.42). Regras PURAS (sem DOM/rede): intervalo de horário, nomes de arquivo, texto e planilha. Roda no painel e nos testes (Node).
// A mensagem chega da ponte como: { id, t (segundos), fromMe, de, tipo, texto, mime, nome, dur, tam, apagada, viewOnce, midia (tem arquivo?), lat, lng, resp }.
(() => {
  'use strict';
  const p2 = (n) => String(n).padStart(2, '0');
  const dataBR = (ms) => { const d = new Date(ms); return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`; };
  const horaBR = (ms, seg = true) => { const d = new Date(ms); return `${p2(d.getHours())}:${p2(d.getMinutes())}${seg ? ':' + p2(d.getSeconds()) : ''}`; };
  const MAX_DIAS = 31;
  // 'AAAA-MM-DDTHH:MM' (campo datetime-local, horário LOCAL) → milissegundos, ou NaN
  const parseLocal = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(s || '').trim()); if (!m) return NaN; const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0); return d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d.getTime() : NaN; };
  // o "Até" inclui o minuto inteiro (19:30 vale até 19:30:59)
  const intervalo = (deStr, ateStr) => {
    const de = parseLocal(deStr), ate = parseLocal(ateStr);
    if (isNaN(de) || isNaN(ate)) return { erro: 'Preencha "De" e "Até" com data e hora.' };
    if (de > ate) return { erro: 'O início ("De") precisa ser antes do fim ("Até").' };
    if (ate - de > MAX_DIAS * 864e5) return { erro: `Intervalo grande demais: no máximo ${MAX_DIAS} dias por exportação.` };
    return { de, ate: ate + 59999 };
  };
  const nomeSeguro = (s, max = 80) => String(s == null ? '' : s).replace(/[\u0000-\u001f\\/:*?"<>|]+/g, ' ').replace(/(^|\s)\.+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, max).trim();   // tira separadores, pedaços só de pontos (../..) e ponto no começo
  const EXT = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr', 'audio/opus': 'opus',
    'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/quicktime': 'mov', 'application/pdf': 'pdf', 'application/zip': 'zip', 'text/plain': 'txt', 'application/msword': 'doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx' };
  const mimeBase = (m) => String(m == null ? '' : m).split(';')[0].trim().toLowerCase();
  const ext = (mime, nome) => { const e = EXT[mimeBase(mime)]; if (e) return e; const m = /\.([A-Za-z0-9]{1,5})$/.exec(String(nome || '')); return m ? m[1].toLowerCase() : 'bin'; };
  const PREFIXO = { image: 'IMG', video: 'VID', audio: 'AUD', ptt: 'AUD', document: 'DOC', sticker: 'STK' };
  const TEM_ARQUIVO = new Set(['image', 'video', 'audio', 'ptt', 'document', 'sticker']);
  // nome único e em ordem: 0003_IMG_20261021_180540.jpg  (documento mantém o nome original: 0007_Canhoto.pdf)
  const nomeMidia = (i, m, mime) => {
    const d = new Date((m.t || 0) * 1000), e = ext(mime || m.mime, m.nome), n = String(i).padStart(4, '0');
    if (m.tipo === 'document' && nomeSeguro(m.nome)) { const base = nomeSeguro(m.nome).replace(/\.[A-Za-z0-9]{1,5}$/, ''); return `${n}_${base || 'documento'}.${e}`; }
    return `${n}_${PREFIXO[m.tipo] || 'ARQ'}_${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.${e}`;
  };
  const ROTULO = { image: '[foto]', video: '[vídeo]', audio: '[áudio]', ptt: '[áudio]', document: '[documento]', sticker: '[figurinha]', location: '[localização]', vcard: '[contato]', multi_vcard: '[contatos]', poll_creation: '[enquete]', ptv: '[vídeo]' };
  const rotulo = (m) => (m.apagada ? '[mensagem apagada]' : m.tipo === 'chat' ? '' : ROTULO[m.tipo] || (m.tipo ? `[${m.tipo}]` : ''));
  // uma mensagem em texto, no jeito do "Exportar conversa" do WhatsApp: [21/10/2026 18:05:40] Nome: texto
  const linhaTxt = (m, arquivo) => {
    const ms = (m.t || 0) * 1000, quem = m.fromMe ? 'Eu' : (m.de || 'Contato');
    let corpo;
    if (m.apagada) corpo = '[mensagem apagada]';
    else if (m.viewOnce) corpo = '[visualização única: não exportada]';
    else if (m.tipo === 'chat') corpo = m.texto || '';
    else { const partes = []; if (arquivo) partes.push(`<anexo: midia/${arquivo}>`); else partes.push(rotulo(m)); if (m.tipo === 'location' && (m.lat || m.lng)) partes.push(`(${m.lat}, ${m.lng})`); if (m.texto) partes.push(m.texto); corpo = partes.join(' '); }
    return `[${dataBR(ms)} ${horaBR(ms)}] ${quem}: ${corpo}`;
  };
  const montarTxt = (meta, msgs, arquivos = {}) => {
    const cab = [`Conversa: ${meta.chatNome || 'conversa'}${meta.grupo ? ' (grupo)' : ''}`, `Período: ${dataBR(meta.de)} ${horaBR(meta.de, false)} a ${dataBR(meta.ate)} ${horaBR(meta.ate, false)}`, `Exportado em: ${dataBR(meta.agora)} ${horaBR(meta.agora)} (AtendeZap)`, `Mensagens: ${msgs.length}`, ''];
    return cab.concat(msgs.map((m) => linhaTxt(m, arquivos[m.id]))).join('\n') + '\n';
  };
  const csvCampo = (v) => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };   // aspas duplas escapadas; fórmulas neutralizadas (=, +, -, @)
  const montarCsv = (msgs, arquivos = {}) => '\ufeff' + ['data;hora;remetente;tipo;texto;arquivo'].concat(msgs.map((m) => { const ms = (m.t || 0) * 1000;
    return [dataBR(ms), horaBR(ms), m.fromMe ? 'Eu' : (m.de || 'Contato'), m.apagada ? 'apagada' : m.tipo, m.apagada ? '' : m.texto, arquivos[m.id] ? 'midia/' + arquivos[m.id] : ''].map(csvCampo).join(';'); })).join('\r\n') + '\r\n';
  const resumoMsgs = (msgs) => ({ total: msgs.length, minhas: msgs.filter((m) => m.fromMe).length, deles: msgs.filter((m) => !m.fromMe).length, apagadas: msgs.filter((m) => m.apagada).length, comArquivo: msgs.filter((m) => !m.apagada && !m.viewOnce && TEM_ARQUIVO.has(m.tipo)).length });
  const relatorio = (meta, r) => [`AtendeZap — relatório da exportação`, `Conversa: ${meta.chatNome || ''}`, `Período: ${dataBR(meta.de)} ${horaBR(meta.de, false)} a ${dataBR(meta.ate)} ${horaBR(meta.ate, false)}`,
    `Mensagens exportadas: ${r.total} (minhas ${r.minhas}, deles ${r.deles}, apagadas ${r.apagadas})`, `Mídias: ${r.baixadas} salvas de ${r.comArquivo}${meta.semMidia ? ' (você escolheu exportar só o texto)' : ''}`,
    ...(r.truncado ? ['ATENÇÃO: a conversa é muito longa e a leitura parou antes de chegar ao início do período: pode faltar o começo. Exporte um intervalo menor.'] : []),
    ...(r.faltouInicio ? [`AVISO: a mensagem mais antiga que o WhatsApp Web carregou é de ${dataBR(r.maisAntiga)} ${horaBR(r.maisAntiga, false)}, depois do início do período. Se havia mensagens antes disso, o começo pode estar incompleto (ou a conversa começou depois).`] : []),
    ...(r.falhas.length ? ['', 'Mídias que NÃO puderam ser salvas (o WhatsApp não tinha mais o arquivo, ou passou do limite de tamanho):'].concat(r.falhas.map((f) => `- ${dataBR((f.t || 0) * 1000)} ${horaBR((f.t || 0) * 1000)} ${f.tipo}: ${f.motivo}`)) : []),
    '', 'Visualização única nunca é exportada. Mensagens apagadas aparecem como "[mensagem apagada]".'].join('\n') + '\n';
  const nomeZip = (meta) => { const d = new Date(meta.de), a = new Date(meta.ate), f = (x) => `${x.getFullYear()}-${p2(x.getMonth() + 1)}-${p2(x.getDate())} ${p2(x.getHours())}h${p2(x.getMinutes())}`; return `AtendeZap - ${nomeSeguro(meta.chatNome, 50) || 'conversa'} - ${f(d)} a ${f(a)}.zip`; };
  globalThis.AZEXP = { MAX_DIAS, TEM_ARQUIVO, parseLocal, intervalo, nomeSeguro, ext, nomeMidia, linhaTxt, montarTxt, montarCsv, resumoMsgs, relatorio, nomeZip, dataBR, horaBR };
})();
