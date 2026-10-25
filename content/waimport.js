// AtendeZap — importação de backups do waTidy (v1.13). Roda no navegador do Johon; nada sai do computador.
// O backup do waTidy guarda respostas, categorias e fixadas CRIPTOGRAFADAS (AES, no formato "Salted__" do OpenSSL) com a
// senha fixa do próprio waTidy, e as ações em claro. A senha abaixo só serve para LER OS SEUS PRÓPRIOS backups e trazer
// as respostas para o AtendeZap (portabilidade dos seus dados). Não é usada para mais nada.
(() => {
  const AZW = (globalThis.AZW = {});
  const WT_KEY = 'ffce211a-7b07-4d91-ba5d-c40bb4034a83';

  // ---- MD5 (o WebCrypto não tem; o OpenSSL usa MD5 para derivar chave e IV) ----
  const md5 = (data) => {
    const K = new Uint32Array(64), SH = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
    const n = data.length, total = ((n + 9 + 63) >> 6) << 6;
    const buf = new Uint8Array(total); buf.set(data); buf[n] = 0x80;
    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, (n << 3) >>> 0, true); dv.setUint32(total - 4, Math.floor(n / 0x20000000), true);
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    const M = new Uint32Array(16);
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
        else { F = C ^ (B | ~D); g = (7 * i) % 16; }
        F = (F + A + K[i] + M[g]) >>> 0;
        A = D; D = C; C = B;
        const s = SH[(i >> 4) * 4 + (i & 3)];
        B = (B + ((F << s) | (F >>> (32 - s)))) >>> 0;
      }
      a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    const out = new Uint8Array(16), o = new DataView(out.buffer);
    [a0, b0, c0, d0].forEach((v, i) => o.setUint32(i * 4, v, true));
    return out;
  };
  AZW.md5 = md5;
  const cat = (...as) => { const r = new Uint8Array(as.reduce((n, a) => n + a.length, 0)); let o = 0; for (const a of as) { r.set(a, o); o += a.length; } return r; };
  const evp = (pass, salt) => { // EVP_BytesToKey (MD5, 1 volta) -> 32 bytes de chave + 16 de IV
    let d = new Uint8Array(0), prev = new Uint8Array(0);
    while (d.length < 48) { prev = md5(cat(prev, pass, salt)); d = cat(d, prev); }
    return { key: d.slice(0, 32), iv: d.slice(32, 48) };
  };
  const subtle = () => globalThis.crypto?.subtle || null;

  // Decifra um texto "U2FsdGVkX1…" (CryptoJS AES com senha) e devolve o JSON de dentro.
  AZW.decifrar = async (b64, senha = WT_KEY) => {
    const s = subtle(); if (!s) throw new Error('Este navegador não tem criptografia disponível (precisa de https).');
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (String.fromCharCode(...raw.slice(0, 8)) !== 'Salted__') throw new Error('Formato de backup desconhecido.');
    const { key, iv } = evp(new TextEncoder().encode(senha), raw.slice(8, 16));
    const k = await s.importKey('raw', key, 'AES-CBC', false, ['decrypt']);
    let plano;
    try { plano = await s.decrypt({ name: 'AES-CBC', iv }, k, raw.slice(16)); }
    catch { throw new Error('Não consegui abrir este backup (não é do waTidy ou é de outra versão).'); }
    // Com a senha errada, ~0,4% das vezes o preenchimento (padding) "bate" por acaso e sai lixo: sem este cuidado o erro era um SyntaxError técnico do JSON.
    try { return JSON.parse(new TextDecoder().decode(plano)); }
    catch { throw new Error('Não consegui abrir este backup (não é do waTidy, a senha não confere ou é de outra versão).'); }
  };
  const talvez = async (v) => (typeof v === 'string' ? AZW.decifrar(v) : (v ?? []));

  // Lê um backup do waTidy já convertido de JSON: { respostas, categorias, pins, acoes }
  AZW.lerBackup = async (obj) => {
    if (!obj || typeof obj !== 'object' || !('respostasRapidas' in obj) || !Array.isArray(obj.respostasRapidasAcao))
      throw new Error('Este arquivo não parece um backup do waTidy.');
    return {
      respostas: await talvez(obj.respostasRapidas), categorias: await talvez(obj.categoria),
      pins: await talvez(obj.pinChat), acoes: obj.respostasRapidasAcao,
    };
  };

  // ---- conversão para o modelo do AtendeZap ----
  const num = (v) => { const n = +v; return Number.isFinite(n) && n > 0 ? n : 0; };
  // variáveis do waTidy -> as do AtendeZap (as sem equivalente ficam como estão e entram no aviso)
  const SEM_PAR = /#(numero|telefone|empresa|data_[a-z]+)/gi;
  const vars = (t, aviso) => {
    let s = String(t ?? '');
    s = s.replace(/#primeiro_?nome/gi, '{primeiro_nome}').replace(/#sauda[cç][aã]o/gi, '{saudacao}').replace(/#nome(?![\wÀ-ÿ])/gi, '{nome}');
    if (aviso && SEM_PAR.test(s)) { aviso.semPar = true; SEM_PAR.lastIndex = 0; }
    return s;
  };
  const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'application/pdf': 'pdf' };
  const TIPO_MIDIA = { image: 'imagem', video: 'video', audio: 'audio', ptt: 'audio', document: 'documento', file: 'documento' };
  const slug = (t) => String(t || '').normalize('NFD').replace(/[^\w]/g, '').toLowerCase().slice(0, 20);
  const dataDe = (nome) => { // backup_09-07-2026_08__04__11.json -> instante (para ordenar do mais antigo ao mais novo)
    const m = /(\d{2})-(\d{2})-(\d{4})_(\d{2})__(\d{2})__(\d{2})/.exec(nome || '');
    return m ? Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +m[6]) : 0;
  };
  AZW.ordenarPorData = (arqs) => [...arqs].sort((a, b) => dataDe(a.nome ?? a.name) - dataDe(b.nome ?? b.name));

  // junta os backups (do mais antigo ao mais novo; o mais novo vence): respostas, categorias, ações e fixadas por id
  const fundir = (backups) => {
    const R = new Map(), C = new Map(), A = new Map(), P = new Map();
    for (const { data } of backups) {
      for (const c of data.categorias || []) C.set(c.id, c);
      for (const r of data.respostas || []) R.set(r.id, r);
      for (const x of data.acoes || []) A.set(x.id, x.acao || []);
      for (const p of data.pins || []) P.set(p.chatID, p.pin);
    }
    return { R, C, A, P };
  };
  const tipoMidia = (a) => (a.type === 'image' ? 'imagem' : a.type === 'video' ? 'video' : (a.type === 'audio' || a.type === 'ptt') ? 'audio' : (a.type === 'document' || a.type === 'file') ? 'documento' : null);
  const mbDe = (a) => (a.propriedades?.base64 ? a.propriedades.base64.length * 0.75 / 1048576 : 0);

  // O que há dentro dos backups, para a pessoa escolher o que importar.
  // -> { respostas:[{id,titulo,categoria,tipo,acoes,midias,mb,deps,jaImportada}], pins:[{id,pin}], tipos:{imagem:{n,mb},…} }
  AZW.resumo = (backups, estado) => {
    const { R, C, A, P } = fundir(backups), tipos = {};
    const respostas = [...R.values()].map((r) => {
      const acs = r.type === 'script' ? [] : (A.get(r.id) || []);
      let midias = 0, mb = 0;
      for (const a of acs) { const t = tipoMidia(a); if (t && a.propriedades?.base64) { midias++; mb += mbDe(a); (tipos[t] ||= { n: 0, mb: 0 }); tipos[t].n++; tipos[t].mb += mbDe(a); } }
      return { id: r.id, titulo: r.titulo || '(sem título)', categoria: C.get(r.categoria)?.name || 'Sem categoria', tipo: r.type,
        acoes: r.type === 'script' ? (r.script || []).length : acs.length, midias, mb: Math.round(mb * 10) / 10,
        deps: r.type === 'script' ? (r.script || []).map((x) => x.id) : [], jaImportada: (estado?.replies || []).some((x) => x.wt === r.id) };
    });
    for (const t of Object.values(tipos)) t.mb = Math.round(t.mb * 10) / 10;
    return { respostas, pins: [...P.entries()].sort((a, b) => b[1] - a[1]).map(([id, pin]) => ({ id, pin })), tipos };
  };

  // backups: [{nome, data}] (do mais antigo ao mais novo; o mais novo vence). estado: {cats, replies, pins, pinAbas}.
  // opc: {fixadas, substituir, limiteMidias, selecionadas (ids do waTidy; indefinido = todas, [] = nenhuma), pinsSel (ids; só vale com fixadas),
  //       tipos ({imagem:false…} para NÃO importar aquele tipo de mídia)}. Não altera nada: devolve o novo estado e o relatório.
  AZW.planejar = (backups, estado, opc = {}) => {
    const U = globalThis.AZU, uid = U.uid;
    const limite = opc.limiteMidias ?? 50;
    const avisos = [], sem = new Map(), aviso = {};
    const { R, C, A, P } = fundir(backups);
    // quais respostas entram: as escolhidas + as que um combo escolhido usa (e que ainda não existem aqui)
    const jaTem = (id) => estado.replies.some((x) => x.wt === id);
    const alvo = new Set(Array.isArray(opc.selecionadas) ? opc.selecionadas.filter((id) => R.has(id)) : [...R.keys()]); // [] = nenhuma; indefinido = todas
    const puxadas = [];
    for (let mudou = true; mudou;) {
      mudou = false;
      for (const id of [...alvo]) {
        const r = R.get(id);
        for (const s of (r?.type === 'script' ? r.script || [] : [])) if (R.has(s.id) && !alvo.has(s.id) && !jaTem(s.id)) { alvo.add(s.id); puxadas.push(R.get(s.id).titulo); mudou = true; }
      }
    }
    // categorias: reaproveita as de mesmo nome e só cria as que alguma resposta escolhida usa
    const cats = [...estado.cats], catDe = new Map(); let catsNovas = 0;
    const catId = (wtId) => {
      if (catDe.has(wtId)) return catDe.get(wtId);
      const c = C.get(wtId), nome = String(c?.name || '').trim(); if (!nome) return '';
      let ex = cats.find((x) => String(x.nome).toLowerCase() === nome.toLowerCase());
      if (!ex) { ex = { id: uid(), nome, cor: c.hexColor || '#25d366' }; cats.push(ex); catsNovas++; }
      catDe.set(wtId, ex.id); return ex.id;
    };
    const midias = {}, remover = [];
    let nMid = U.countMedia(estado.replies), mb = 0;
    const atalhos = new Set(estado.replies.map((r) => r.atalho));
    const replies = [...estado.replies], idPorWt = new Map(estado.replies.filter((r) => r.wt).map((r) => [r.wt, r.id]));
    const stats = { respostas: 0, puladas: 0, jaImportadas: 0, categorias: 0, midias: 0, mb: 0, fixadas: 0 };
    const semTipo = {};

    const converterAcao = (a, rotulo) => {
      const p = a.propriedades || {}, base = { id: uid() };
      const tempos = { digitando: num(p.composing), aguardar: num(p.aguarde) };
      switch (a.type) {
        case 'txt': return { ...base, tipo: 'texto', texto: vars(p.mensagem, aviso), ...tempos };
        case 'image': case 'video': case 'audio': case 'ptt': case 'document': case 'file': {
          const tipo = TIPO_MIDIA[a.type];
          if (opc.tipos && opc.tipos[tipo] === false) { semTipo[tipo] = (semTipo[tipo] || 0) + 1; return null; }
          if (!p.base64) { sem.set(a.type + ' sem arquivo', (sem.get(a.type + ' sem arquivo') || 0) + 1); return null; }
          const m = /^data:([^;,]+)[^,]*,/.exec(p.base64);
          const mime = m?.[1] || ({ imagem: 'image/jpeg', video: 'video/mp4', audio: 'audio/ogg', documento: 'application/octet-stream' })[tipo];
          const dataUrl = m ? p.base64 : `data:${mime};base64,${p.base64}`;
          const midiaId = uid(), n = rotulo.n++;
          const nome = `${slug(rotulo.t) || 'midia'}-${n}.${EXT[mime] || 'bin'}`;
          midias[midiaId] = { nome, mime, dataUrl };
          mb += dataUrl.length * 0.75 / 1048576; nMid++;
          const out = { ...base, tipo, midiaId, nome, ...tempos };
          if (tipo !== 'audio') out.legenda = vars(p.mensagem, aviso);
          if (p.isViewOnce && (tipo === 'imagem' || tipo === 'video')) out.unica = true;
          return out;
        }
        case 'contact': {
          const numero = U.normalizePhone(p.userID) || String(p.userID || '').replace(/\D/g, '');
          if (!U.normalizePhone(p.userID)) avisos.push(`Contato "${p.userName || p.userID}" em "${rotulo.t}": confira o número.`);
          return { ...base, tipo: 'contato', numero, nomeContato: p.userName || '', ...tempos };
        }
        case 'linkPreview': {
          stats.prev = (stats.prev || 0) + 1;
          return { ...base, tipo: 'texto', texto: [p.title, p.description, p.link].filter(Boolean).join('\n'), digitando: 0, aguardar: 2 };
        }
        case 'addLabel': return { ...base, tipo: 'etiquetaAdd', labelId: String(p.labelID ?? '') };
        case 'removeLabel': return { ...base, tipo: 'etiquetaRem', labelId: String(p.labelID ?? '') };
        case 'timer': return { ...base, tipo: 'espera', segundos: num(p.segundos) || 1 };
        default: sem.set(a.type, (sem.get(a.type) || 0) + 1); return null;
      }
    };

    const novoAtalho = (titulo) => { let b = slug(titulo) || uid(), a = b, i = 2; while (atalhos.has(a)) a = b.slice(0, 17) + '-' + i++; atalhos.add(a); return a; };
    const prontas = []; // {r, resp, acoes}
    for (const r of R.values()) {
      if (!alvo.has(r.id)) continue;
      const existente = replies.find((x) => x.wt === r.id);
      if (existente && !opc.substituir) { stats.jaImportadas++; continue; }
      let acoes = [];
      if (r.type !== 'script') {
        const rotulo = { t: r.titulo, n: 1 };
        acoes = (A.get(r.id) || []).map((a) => converterAcao(a, rotulo)).filter(Boolean);
        if (!acoes.length) { avisos.push(`"${r.titulo}" não tem ações para importar: pulada.`); stats.puladas++; continue; }
        const k = acoes.filter((a) => a.midiaId).length;
        if (k && nMid > limite) {
          for (const a of acoes) if (a.midiaId) { delete midias[a.midiaId]; nMid--; }
          avisos.push(`Limite de ${limite} mídias: "${r.titulo}" não foi importada.`); stats.puladas++; continue;
        }
      }
      prontas.push({ r, existente, acoes });
    }
    // 1ª passada: respostas comuns (para o script poder apontar para elas)
    for (const it of prontas.filter((x) => x.r.type !== 'script')) {
      const { r, existente } = it;
      const id = existente?.id || uid();
      if (!existente && estado.replies.some((x) => !x.wt && String(x.titulo).trim().toLowerCase() === String(r.titulo).trim().toLowerCase()))
        avisos.push(`Já existe "${r.titulo}" no AtendeZap (criada por você): a importação cria outra ao lado.`);
      if (existente) { remover.push(...(existente.acoes || []).filter((a) => a.midiaId).map((a) => 'midia_' + a.midiaId)); }
      const resp = { id, atalho: existente?.atalho || novoAtalho(r.titulo), titulo: r.titulo || '', categoriaId: catId(r.categoria), usos: existente?.usos || 0, acoes: it.acoes, wt: r.id };
      const i = replies.findIndex((x) => x.id === id); if (i >= 0) replies[i] = resp; else replies.push(resp);
      idPorWt.set(r.id, id); stats.respostas++;
    }
    // 2ª passada: scripts ("combo") = outras respostas em sequência; o tempo de cada item (menos o 1º) é esperado ANTES dele
    for (const it of prontas.filter((x) => x.r.type === 'script')) {
      const { r, existente } = it;
      const acoes = [];
      (r.script || []).forEach((s, idx) => {
        const alvo = idPorWt.get(s.id);
        if (!alvo) { avisos.push(`Combo "${r.titulo}": uma das respostas não foi encontrada e ficou de fora.`); return; }
        if (idx > 0 && num(s.timer)) acoes.push({ id: uid(), tipo: 'espera', segundos: num(s.timer) });
        acoes.push({ id: uid(), tipo: 'resposta', respostaId: alvo });
      });
      if (!acoes.length) { avisos.push(`Combo "${r.titulo}" ficou sem etapas: pulado.`); stats.puladas++; continue; }
      const id = existente?.id || uid();
      const resp = { id, atalho: existente?.atalho || novoAtalho(r.titulo), titulo: r.titulo || '', categoriaId: catId(r.categoria), usos: existente?.usos || 0, acoes, wt: r.id };
      const i = replies.findIndex((x) => x.id === id); if (i >= 0) replies[i] = resp; else replies.push(resp);
      idPorWt.set(r.id, id); stats.respostas++;
    }
    stats.categorias = catsNovas; stats.puxadas = puxadas.length;
    stats.midias = Object.keys(midias).length; stats.mb = Math.round(mb * 10) / 10;

    // fixadas: ordem da mais recente para a mais antiga; grupo vai só para a aba Grupos (padrão do AtendeZap)
    const pins = [...estado.pins], pinAbas = { ...estado.pinAbas };
    if (opc.fixadas) {
      const so = opc.pinsSel ? new Set(opc.pinsSel) : null;
      for (const [id] of [...P.entries()].sort((a, b) => b[1] - a[1])) {
        if (!id || pins.includes(id) || (so && !so.has(id))) continue;
        pins.push(id); stats.fixadas++;
        if (String(id).endsWith('@g.us')) pinAbas[id] = 'grupos';
      }
    }
    if (puxadas.length) avisos.push(`Os combos escolhidos usam outras respostas, que também foram importadas: ${puxadas.join(', ')}.`);
    for (const [t, n] of Object.entries(semTipo)) avisos.push(`${n} mídia(s) do tipo ${t} não foram importadas (você desmarcou).`);
    if (stats.prev) avisos.push(`${stats.prev} prévia(s) de link viraram texto (título, descrição e link): o cartão de prévia personalizado não é reproduzido.`);
    if (aviso.semPar) avisos.push('Alguns textos usam variáveis do waTidy sem equivalente (#numero, #empresa, #telefone…): ficaram como estão.');
    for (const [t, n] of sem) avisos.push(`${n} ação(ões) "${t}" não têm equivalente no AtendeZap e foram puladas.`);
    return { cats, replies, midias, remover, pins, pinAbas, stats, avisos, totalWt: R.size };
  };
})();
