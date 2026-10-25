// Roda no contexto da página (MAIN world), ao lado da wa-js (WPP).
// Recebe pedidos do content script via postMessage e executa só os métodos abaixo.
(() => {
  // Janela extra do WhatsApp (ligação em "Mover para nova janela"): foi aberta pela janela principal.
  // Lá não tem lista de conversas nem a wa-js funciona: a extensão não faz nada.
  try { if (window.opener && window.opener.location.host === location.host) return; } catch {}
  if (window.__azBridge) return;
  window.__azBridge = true;

  const post = (msg) => window.postMessage({ __az: 1, ...msg }, location.origin);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Na wa-js 4.7.1 isBusiness fica em WPP.profile (não em WPP.conn)
  const isBiz = () => { try { return !!(WPP.profile?.isBusiness || WPP.conn?.isBusiness)?.(); } catch { return null; } };
  // Função interna do WhatsApp que apaga (revoga) um status. A wa-js 4.7.1 procura o módulo "WAWebRevokeStatusAction";
  // no WhatsApp 2.3000.1050579926 ele se chama "WAWebDeleteStatusAction" (achado pelo mapa do Johon).
  // Ordem: função conhecida da wa-js -> nomes conhecidos -> módulos de AÇÃO com status+delete/revoke no nome
  // (ignora WASmaxIn*/WASmaxOut*, que só leem/montam pacotes, e Newsletter). Só guarda quando acha.
  let revokeAchado = null;
  const moduleIds = () => Object.keys(WPP.loader?.moduleRequire?.m || {});
  // WAWebDeleteStatusAction NÃO serve: só tem clearStatusForRemovedContact/deleteStatusForContact (limpa status de contatos).
  const NOMES_APAGAR = ['WAWebRevokeStatusAction'];
  const EXPORTS_APAGAR = ['sendStatusRevokeMsgAction', 'deleteStatusAction', 'sendStatusDeleteMsgAction', 'revokeStatusAction', 'deleteStatus', 'revokeStatus', 'default'];
  const candidatosApagar = () => {
    const ids = moduleIds();
    const pareceAcao = (i) => /^WAWeb/.test(i) && /Status/.test(i) && /(Delete|Revoke)/.test(i) && /Action$/.test(i) && !/Newsletter|Wam|Enum/.test(i);
    return [...NOMES_APAGAR.filter((n) => ids.includes(n)), ...ids.filter((i) => pareceAcao(i) && !NOMES_APAGAR.includes(i))];
  };
  const loadMod = (id) => { try { return WPP.loader.loadModule(id); } catch { return null; } };
  const findRevoke = () => {
    if (revokeAchado) return revokeAchado;
    const conhecido = WPP.whatsapp?.functions?.revokeStatus;
    if (typeof conhecido === 'function') return (revokeAchado = { fn: conhecido, onde: 'functions.revokeStatus' });
    for (const id of candidatosApagar()) {
      const m = loadMod(id);
      if (!m) continue;
      // só exports de REVOGAR (apagar para todos); nada de "Contact" (limpeza local de status de contatos)
      const k = [...EXPORTS_APAGAR, ...Object.keys(m)].find((n) => typeof m[n] === 'function' && /revoke|^default$/i.test(n) && !/contact/i.test(n));
      if (k) return (revokeAchado = { fn: m[k], onde: `${id}.${k}` });
    }
    return null;
  };
  // Para o relatório/mapa: módulos candidatos e o que cada um exporta
  const revokeCandidatos = () => candidatosApagar().slice(0, 10).map((id) => {
    const m = loadMod(id);
    return id + (m ? ' {' + Object.keys(m).filter((k) => typeof m[k] === 'function').join(', ') + '}' : ' (não carregou)');
  });
  // Chaves de recurso (testes A/B) do WhatsApp: nome + valor atual. Só leitura.
  const recursosInternos = () => {
    try {
      return (WPP.conn.getABProps?.() || []).map((p) => {
        const v = p.configValue ?? p.value;
        return { nome: p.name || String(p.configCode), valor: typeof v === 'object' ? JSON.stringify(v) : v };
      }).sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
    } catch (e) { return [{ erro: e?.message || String(e) }]; }
  };
  // v1.14.1: chave nova (zera o que foi "aprendido" antes: o caminho WPP.chat.deleteMessage podia só apagar de DENTRO do navegador
  // e o status voltava ao recarregar). Lápides: ids que o Johon apagou, para marcar "↩ voltou" se o WhatsApp recriar.
  const VIA = 'az-apagar-status-2', TOMB = 'az-status-apagados';
  const viaSalva = () => { try { return localStorage.getItem(VIA); } catch { return null; } };
  const lerTomb = () => {
    try { const o = JSON.parse(localStorage.getItem(TOMB) || '{}') || {}; const lim = Date.now() - 3 * 86400000; for (const k of Object.keys(o)) if (!(o[k].t > lim)) delete o[k]; return o; } catch { return {}; }
  };
  const marcarApagado = (id) => { try { const o = lerTomb(); o[id] = { t: Date.now(), n: (o[id]?.n || 0) + 1 }; localStorage.setItem(TOMB, JSON.stringify(o)); } catch { /* sem storage */ } };
  const esperaVolta = () => (typeof window.__azEsperaVolta === 'number' ? window.__azEsperaVolta : 3000); // gancho de teste; padrão 3 s
  const naoPersistiu = new Set(); // caminhos que "apagaram" mas o status voltou sozinho: ficam por último
  // Outras funções de revogar/apagar que os módulos de status do WhatsApp exportam (descobertas em tempo de execução)
  const MODS_STATUS = ['WAWebSendStatusMsgAction', 'WAWebStatusPostingUtils', 'WAWebStatusCollection', 'WAWebResendStatusMsg', 'WAWebPostSendStatusFailure'];
  const extrasApagar = () => {
    const out = [];
    for (const id of MODS_STATUS) {
      const m = loadMod(id); if (!m) continue;
      for (const k of Object.keys(m)) if (typeof m[k] === 'function' && /revoke|delet|remov/i.test(k) && !/contact/i.test(k)) out.push({ id, k, fn: m[k] });
    }
    return out;
  };
  // só para o mapa: o que os módulos de status exportam (nomes de funções, nunca dados)
  const statusExports = () => {
    const out = {};
    const ids = [...new Set([...MODS_STATUS, ...moduleIds().filter((i) => /^WAWeb/.test(i) && /Status/.test(i) && /(Action|Utils|Msg|Collection|Store|Job)$/.test(i) && !/Wam|Enum|Newsletter|Smax|Usync|Privacy|Mute|Poster|Impression|Download|Thumbnail|Sync|Reaction|Text/.test(i))])].slice(0, 30);
    for (const id of ids) { const m = loadMod(id); if (m) out[id] = Object.keys(m).filter((k) => typeof m[k] === 'function').slice(0, 25); }
    return out;
  };
  // Caminhos para apagar (revogar) um status meu, do mais específico ao mais genérico.
  const metodosApagar = async (mine) => {
    const out = [];
    const r = findRevoke();
    if (r) out.push({ nome: r.onde, fn: (msg) => r.fn(mine, msg) });
    // função do próprio WhatsApp (aparece no mapa como "removeStatusMessage"): tentamos com os argumentos mais prováveis
    const rsm = WPP.whatsapp?.functions?.removeStatusMessage;
    if (typeof rsm === 'function') {
      out.push({ nome: 'functions.removeStatusMessage(msg)', fn: (msg) => rsm(msg) });
      if (mine) out.push({ nome: 'functions.removeStatusMessage(meu StatusV3, msg)', fn: (msg) => rsm(mine, msg) });
    }
    const Cmd = WPP.whatsapp?.Cmd;
    if (typeof Cmd?.sendRevokeMsgs === 'function') {
      let chatStatus = null;
      try { chatStatus = WPP.whatsapp.ChatStore?.get?.('status@broadcast') || (await WPP.chat.find('status@broadcast').catch(() => null)); } catch {}
      if (chatStatus) out.push({ nome: 'Cmd.sendRevokeMsgs(chat status@broadcast)', fn: (msg) => Cmd.sendRevokeMsgs(chatStatus, { type: 'message', list: [msg] }, { clearMedia: true }) });
      if (mine) out.push({ nome: 'Cmd.sendRevokeMsgs(meu StatusV3)', fn: (msg) => Cmd.sendRevokeMsgs(mine, { type: 'message', list: [msg] }, { clearMedia: true }) });
    }
    for (const x of extrasApagar()) out.push({ nome: `${x.id}.${x.k}`, fn: (msg) => x.fn(msg) });
    // caminho oficial da wa-js para "apagar para todos" (busca a mensagem e a conversa por conta própria)
    out.push({ nome: 'WPP.chat.deleteMessage', fn: (msg) => WPP.chat.deleteMessage('status@broadcast', msg.id._serialized, true, true) });
    out.push({ nome: 'WPP.status.remove', fn: (msg) => WPP.status.remove(msg.id._serialized) });
    return out;
  };
  // ===== Laboratório: ligar/desligar chaves de recurso (A/B) do WhatsApp, só neste navegador =====
  // Mesmo mecanismo da wa-js: troca as funções getABProp* do módulo WAWebABProps por uma versão que,
  // para as chaves alteradas, devolve o valor escolhido. Guardado no localStorage do WhatsApp.
  // Modo seguro: se o WhatsApp não chegou a ficar pronto na abertura anterior com chaves alteradas, pausa tudo.
  const LAB = 'az-lab', LAB_BOOT = 'az-lab-boot', LAB_PAUSA = 'az-lab-pausado';
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }, del: (k) => { try { localStorage.removeItem(k); } catch {} } };
  let labOverrides = {};
  try { labOverrides = JSON.parse(ls.get(LAB) || '{}') || {}; } catch { labOverrides = {}; }
  // LAB_BOOT = quantas aberturas seguidas não chegaram a "pronto". Uma só acontece à toa (recarregou no meio,
  // atualizou a extensão, WhatsApp aberto em outra aba); pausa só na 2ª seguida.
  let falhas = parseInt(ls.get(LAB_BOOT), 10) || 0;
  if (falhas > 100) falhas = 1; // versões antigas guardavam a hora aqui
  if (falhas >= 2 && Object.keys(labOverrides).length && !ls.get(LAB_PAUSA)) ls.set(LAB_PAUSA, 'modo seguro: o WhatsApp não terminou de carregar 2 vezes seguidas');
  ls.set(LAB_BOOT, String(falhas + 1));
  const labPausado = () => ls.get(LAB_PAUSA);
  let labInstalado = false;
  const instalarLab = () => {
    if (labInstalado) return true;
    let m = null;
    try { m = WPP?.loader?.loadModule?.('WAWebABProps'); } catch { m = null; }
    if (!m) return false;
    let n = 0;
    for (const k of Object.keys(m)) {
      if (typeof m[k] !== 'function' || !/^getABProp/.test(k)) continue;
      const orig = m[k];
      m[k] = function (nome, ...resto) {
        if (typeof nome === 'string' && !labPausado() && Object.prototype.hasOwnProperty.call(labOverrides, nome)) return labOverrides[nome];
        return orig.call(this, nome, ...resto);
      };
      n++;
    }
    labInstalado = n > 0;
    return labInstalado;
  };
  // tenta instalar o quanto antes (antes do WhatsApp ler as chaves na abertura)
  const labBoot = setInterval(() => { if (instalarLab()) clearInterval(labBoot); }, 200);
  setTimeout(() => clearInterval(labBoot), 180000);
  const salvarLab = () => ls.set(LAB, JSON.stringify(labOverrides));
  const labEstado = () => ({ overrides: labOverrides, pausado: labPausado(), instalado: labInstalado });

  const isReady = () => !!(window.WPP && (WPP.isFullReady || WPP.isReady || WPP.loader?.isFullReady || WPP.loader?.isReady));
  // Mesmo formato do original: número puro vira @c.us; grupos têm id longo.
  const toWid = (e) => (!e ? '' : /@(c\.us|g\.us|lid)$/.test(e) ? e : e + (e.length > 16 ? '@g.us' : '@c.us'));
  // Resolve para o id que o WhatsApp usa de fato (pode ser @lid nas versões novas)
  const resolve = async (e) => { try { return (await WPP.chat.find(toWid(e)))?.id?._serialized || toWid(e); } catch { return toWid(e); } };
  const sid = (w) => (typeof w === 'string' ? w : w?._serialized);

  const info = (chat) => {
    const id = sid(chat.id);
    return {
      id,
      name: chat.formattedTitle || chat.name || chat.contact?.name || chat.contact?.pushname || id.split('@')[0],
      pushname: chat.contact?.pushname || chat.contact?.name || '',
      unread: chat.unreadCount || 0,
      t: chat.t || 0,
      isGroup: !!chat.isGroup,
      archived: !!chat.archive,
    };
  };

  // ---- Vagas nos grupos (v1.14): qual conversa é cada linha da lista? Lê as props do React da própria linha (e, se não achar,
  // usa o nome exibido quando ele é único). Só marca data-az-chat no DOM; o painel desenha o contador. ----
  const fiberDe = (el) => { const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$') || x.startsWith('__reactInternalInstance$')); return k ? el[k] : null; };
  const idDe = (o) => {
    try {
      const v = o?.id?._serialized || o?.chatId?._serialized || o?.wid?._serialized || (typeof o?.id === 'string' ? o.id : '') || (typeof o?._serialized === 'string' ? o._serialized : '');
      return /^[\w.:-]+@(g\.us|c\.us|lid|broadcast|newsletter)$/.test(v) ? v : '';
    } catch { return ''; }
  };
  const PROPS_ID = ['chat', 'chatModel', 'model', 'contact', 'item', 'data', 'chatId', 'id'];
  const idDaLinha = (row) => {
    const alvos = [row, ...Array.from(row.querySelectorAll('div, span')).slice(0, 5)];
    for (const el of alvos) {
      let f = fiberDe(el);
      for (let d = 0; f && d < 30; d++, f = f.return) {
        const p = f.memoizedProps; if (!p || typeof p !== 'object') continue;
        for (const k of PROPS_ID) { const id = idDe(p[k]) || (typeof p[k] === 'string' ? idDe({ id: p[k] }) : ''); if (id) return id; }
        const id = idDe(p); if (id) return id;
      }
    }
    return '';
  };
  // só nomes de props (nunca conteúdo) das primeiras camadas, para eu ajustar se o WhatsApp mudar a estrutura
  const amostraProps = (row) => {
    const out = []; let f = fiberDe(row);
    for (let d = 0; f && d < 6; d++, f = f.return) { const p = f.memoizedProps; out.push(p && typeof p === 'object' ? Object.keys(p).slice(0, 6).join(',') : '-'); }
    return out.join(' > ') || 'sem fiber';
  };
  // Ferramentas de grupo (v1.12.1): ler participantes (com flag de admin), identificar a mesma pessoa por telefone e nomes dos grupos.
  const dupTools = async () => {
    const nomeDe = {};
    for (const c of await WPP.chat.list()) { const i = sid(c.id); if (i && i.endsWith('@g.us')) nomeDe[i] = info(c).name; }
    const userDe = (x) => { const w = x?.id ?? x; return String(w?.user || String(w?._serialized || w || '').split('@')[0]); };
    // lê os participantes pelo modelo (tem isAdmin/isSuperAdmin); sem isso cai na API pública. ok=false se não conseguiu ler nada
    const lerGrupo = async (g) => {
      try {
        const gr = await WPP.group.ensureGroup(g); const ps = gr.groupMetadata.participants;
        const arr = ps.getModelsArray?.() || ps.models || [];
        if (arr.length) return { ok: true, lista: arr.map((p) => ({ wid: p.id, admin: !!(p.isAdmin || p.isSuperAdmin) })) };
      } catch { /* tenta pela API pública */ }
      try { return { ok: true, lista: ((await WPP.group.getParticipants(g)) || []).map((p) => ({ wid: p.id ?? p, admin: !!(p.isAdmin || p.isSuperAdmin) })) }; } catch { return { ok: false, lista: [] }; }
    };
    const memo = new Map();
    const canon = async (wid) => {
      const k = String(wid?._serialized || wid);
      if (memo.has(k)) return memo.get(k);
      let c = userDe(wid);
      if ((wid?.server || k.split('@')[1]) === 'lid') {
        try { const e = await WPP.contact.getPnLidEntry(wid); c = e?.phoneNumber ? userDe(e.phoneNumber) : 'lid:' + c; } catch { c = 'lid:' + c; }
      }
      memo.set(k, c); return c;
    };
    return { nomeDe, userDe, lerGrupo, canon };
  };
  // ---- v1.28: quem pode mandar pedidos à ponte ----
  // O painel manda uma chave (tk) em cada pedido; o 1º pedido com chave define a chave. Pedidos SEM a chave certa continuam possíveis para
  // leituras, mas os métodos que ENVIAM, BLOQUEIAM ou REMOVEM são recusados e todo pedido fica na auditoria. Limite honesto: a ponte vive na mesma
  // página que o WhatsApp, então um script que ESCUTE as mensagens da página ainda consegue ver a chave; isto barra pedidos soltos, não é um cofre.
  const SENSIVEIS = new Set(['sendText', 'sendFile', 'sendContact', 'sendStatus', 'removeStatus', 'block', 'enviarConvite', 'enviarConvites', 'pedidosPlano', 'padronizar', 'sendEspecial', 'removerDuplicados',
    'apagarParaTodos', 'minhasMsgs', 'recuperarAtivo', 'exportarLer', 'exportarMidia', 'contatoAparelho', 'conversasParaTreino', 'naoLidas', 'ligacaoAtivo', 'ligacaoContexto']);   // v1.42: tudo que apaga, lê conversas ou baixa mídia só obedece ao painel (com a chave dele)
  let tkOk = null, externas = 0, recusadas = 0; const auditoria = [];
  const api = {
    ready: () => isReady(),
    auditoria: () => ({ externas, recusadas, ultimas: auditoria.slice(-30) }),
    // Quem é este contato? (salvo na agenda? quais etiquetas?) Decide se o robô atende.
    contatoInfo: async (chatId) => {
      const out = { id: chatId, nome: '', salvo: null, etiquetas: [] };
      let nome = '';
      try { const ch = await WPP.chat.find(toWid(chatId)); if (ch) { nome = info(ch).name || ''; out.etiquetas = (ch.labels || []).map((x) => String(x?.id ?? x)); } } catch { /* sem chat */ }
      try {
        const ct = await WPP.contact.get(toWid(chatId));
        if (ct && typeof ct.isMyContact === 'boolean') out.salvo = ct.isMyContact;
        else if (ct && ['boolean', 'number'].includes(typeof ct.isAddressBookContact)) out.salvo = !!ct.isAddressBookContact;
      } catch { /* plano B abaixo */ }
      out.nome = nome;
      if (out.salvo === null) out.salvo = !/^\+?[\d\s()\-]{8,}$/.test(String(nome).trim()); // plano B: contato sem nome salvo aparece como número
      return out;
    },
    activeChat: () => {
      const c = WPP.chat.getActiveChat();
      return c ? info(c) : null;
    },
    chatInfo: async (ids) => {
      const out = [];
      for (const id of ids) {
        try {
          const c = await WPP.chat.find(toWid(id));
          if (c) out.push(info(c));
          else out.push({ id, name: id.split('@')[0], unread: 0, t: 0, missing: true });
        } catch {
          out.push({ id, name: id.split('@')[0], unread: 0, t: 0, missing: true });
        }
      }
      return out;
    },
    profilePic: async (id) => {
      try { return (await WPP.contact.getProfilePictureUrl(id)) || null; } catch { return null; }
    },
    openChat: async (id) => { await WPP.chat.openChatBottom(await resolve(id)); return true; },
    startChat: async (number, text) => {
      const r = await WPP.contact.queryExists(number + '@c.us');
      if (!r) return { exists: false };
      const id = await resolve(sid(r.wid));
      await WPP.chat.openChatBottom(id);
      if (text) { await sleep(500); await WPP.chat.setInputText(text, id); }
      return { exists: true, id };
    },
    setInputText: async (text) => { await WPP.chat.setInputText(text); return true; },
    sendActive: async (text) => {
      const c = WPP.chat.getActiveChat();
      if (!c) throw new Error('nenhuma conversa aberta');
      await WPP.chat.setInputText('', c.id._serialized);
      await WPP.chat.sendTextMessage(c.id._serialized, text, { createChat: true, waitForAck: false });
      return true;
    },
    // Conversas para o envio em lote (grupos e contatos; sem status, canais e listas de transmissão)
    listChats: async () => (await WPP.chat.list())
      .map((c) => ({ ...info(c), id: sid(c.id) }))
      .filter((c) => /@(c\.us|lid|g\.us)$/.test(c.id))
      .sort((a, b) => b.t - a.t),
    // Fila "aguardando resposta": conversas cuja ÚLTIMA mensagem é do cliente (não sua), há pelo menos `min` minutos.
    // Ignora arquivadas (inclui as ocultas), avisos do sistema e, se pedido, grupos. Mais antigas primeiro.
    aguardando: async (min = 15, grupos = false) => {
      const agora = Date.now() / 1000;
      const SISTEMA = /^(e2e_notification|notification_template|gp2|protocol|ciphertext|revoked|broadcast_notification|newsletter_notification)$/;
      const out = [];
      for (const c of await WPP.chat.list()) {
        const id = sid(c.id);
        if (!/@(c\.us|lid|g\.us)$/.test(id) || c.archive || (c.isGroup && !grupos)) continue;
        const msgs = c.msgs?.getModelsArray?.() || c.msgs?._models || [];
        let m = null;
        for (let i = msgs.length - 1; i >= 0; i--) if (!SISTEMA.test(msgs[i].type || '')) { m = msgs[i]; break; }
        if (!m || m.id?.fromMe || !m.t || agora - m.t < min * 60) continue;
        out.push({ ...info(c), desde: m.t, tipo: m.type, previa: m.type === 'chat' ? String(m.body || '').slice(0, 70) : '' });
      }
      return out.sort((a, b) => a.desde - b.desde);
    },
    // ---- Status (stories) ----
    sendStatus: async (kind, data, opts = {}) => {
      if (kind === 'text') await WPP.status.sendTextStatus(data, opts);
      else if (kind === 'image') await WPP.status.sendImageStatus(data, opts);
      else if (kind === 'video') await WPP.status.sendVideoStatus(data, opts);
      else throw new Error('o status só aceita texto, foto ou vídeo');
      return true;
    },
    // Meus status das últimas 24h (miniatura vem do body das mídias, que o WhatsApp guarda como jpeg base64)
    // A lista local pode guardar "fantasmas": envios que nunca chegaram ao servidor (ack < 1, ex.: o envio estourou o
    // tempo) e status vencidos. Vencidos saem; os não publicados vêm marcados (publicado: false).
    myStatus: async () => {
      const st = await WPP.status.getMyStatus();
      const msgs = st?.msgs?.getModelsArray?.() || st?.msgs?._models || [];
      const limite = Date.now() / 1000 - 86400, tomb = lerTomb(), out = [];
      for (const m of msgs.filter((x) => !x.isRevoked && x.type !== 'revoked' && (x.t || 0) > limite)) {
        const id = m.id._serialized;
        // o modelo do StatusV3 é "leve" (sem miniatura); o completo vem do MsgStore
        const f = (await Promise.resolve().then(() => WPP.chat.getMessageById(id)).catch(() => null)) || m;
        const ack = f.ack ?? m.ack ?? null, tipo = f.type || m.type;
        out.push({
          id, type: tipo, t: m.t || 0, ack,
          publicado: !(typeof ack === 'number' && ack < 1),
          text: tipo === 'chat' ? f.body || '' : f.caption || m.caption || '',
          thumb: (tipo === 'image' || tipo === 'video') && typeof f.body === 'string' && f.body.length > 20 && f.body.length < 400000 ? 'data:image/jpeg;base64,' + f.body : null,
          bg: typeof f.backgroundColor === 'number' ? '#' + (f.backgroundColor >>> 0).toString(16).padStart(8, '0').slice(2) : null,
          temMidia: tipo === 'chat' ? null : !!(f.directPath || f.mediaKey || f.filehash), // sem isso a miniatura/arquivo não existe mais
          voltou: !!tomb[id], tentativas: tomb[id]?.n || 0,
        });
      }
      return out.sort((a, b) => b.t - a.t);
    },
    // WPP.status.remove procura o status pelo número (getMaybeMePnUser) e falha em contas já migradas para @lid.
    // Por isso usamos o status que getMyStatus acha e chamamos a função interna de revogar do WhatsApp.
    // Apagar um status meu: tenta os caminhos em ordem e confere se ele sumiu de verdade depois de cada um.
    // O caminho que funcionou fica salvo (localStorage do WhatsApp) e é tentado primeiro nas próximas vezes.
    removeStatus: async (id) => {
      const mine = WPP.whatsapp.StatusV3Store?.getMyStatus?.() || (await WPP.status.getMyStatus());
      const lista = () => mine?.msgs?.getModelsArray?.() || mine?.msgs?._models || [];
      const daLista = lista().find((m) => m.id._serialized === id);
      if (!daLista) throw new Error('status não encontrado (já expirou ou foi apagado?)');
      // depois de recarregar a página o modelo do StatusV3 é "leve"; o revogar precisa do modelo completo do MsgStore
      const msg = (await Promise.resolve().then(() => WPP.chat.getMessageById(id)).catch(() => null)) || daLista;
      const sumiu = () => { const m = lista().find((x) => x.id._serialized === id); return !m || m.isRevoked || m.type === 'revoked'; };
      const confere = async () => { for (let i = 0; i < 20 && !sumiu(); i++) await sleep(250); return sumiu(); };
      // Nunca chegou ao servidor (ack < 1) ou já venceu: não há o que revogar para os contatos, é só lixo local.
      // Apaga "só para mim" e, se ainda ficar, tira da lista desta sessão.
      // "sumiu e continua sumido": o WhatsApp às vezes recria o status logo depois (reenvio/sincronização). Por isso confere de novo.
      const sumiuMesmo = async () => { if (!(await confere())) return false; await sleep(esperaVolta()); return sumiu(); };
      if ((typeof msg.ack === 'number' && msg.ack < 1) || (msg.t || 0) < Date.now() / 1000 - 86400) {
        try { await WPP.chat.deleteMessage('status@broadcast', id, true, false); } catch { /* tenta tirar da lista abaixo */ }
        if (!(await confere())) { try { mine.msgs.remove(daLista); } catch { /* sem remove */ } }
        if (sumiu()) { await sleep(esperaVolta()); if (sumiu()) { marcarApagado(id); return 'local (não publicado)'; } }
      }
      const metodos = await metodosApagar(mine);
      const salvo = viaSalva();
      const peso = (m) => (naoPersistiu.has(m.nome) ? 2 : m.nome === salvo ? 0 : 1);
      metodos.sort((x, y) => peso(x) - peso(y));
      const erros = [];
      for (const mt of metodos) {
        try { await mt.fn(msg); } catch (e) { erros.push(`${mt.nome}: ${e?.message || e}`); continue; }
        if (await sumiuMesmo()) {
          try { localStorage.setItem(VIA, mt.nome); } catch { /* sem storage */ }
          marcarApagado(id);
          return mt.nome;
        }
        if (sumiu()) erros.push(`${mt.nome}: sumiu mas voltou sozinho`), naoPersistiu.add(mt.nome);
        else erros.push(`${mt.nome}: chamado, mas o status continua`);
      }
      try { localStorage.removeItem(VIA); } catch { /* sem storage */ } // o diagnóstico não deve dizer "funcionou da última vez"
      throw new Error('não consegui apagar. Tentativas: ' + (erros.join(' | ') || 'nenhum método disponível'));
    },
    // Limites do próprio WhatsApp lidos das chaves de configuração (só leitura). Servem para avisar ANTES de enviar algo que vai falhar.
    limitesWA: () => {
      const mapa = new Map(recursosInternos().map((r) => [r.nome, r.valor]));
      const n = (k) => { const v = mapa.get(k); return typeof v === 'number' ? v : (v != null && v !== '' && !Number.isNaN(+v) ? +v : null); };
      const dias = n('scheduled_messages_window_duration_max_seconds');
      return { membrosGrupo: n('group_size_limit'), statusMidiaMB: n('default_status_media_limit_mb'), statusVideoSeg: n('status_video_max_duration'),
        midiaMB: n('default_media_limit_mb'), videoMB: n('default_video_limit_mb'), msgsFixadas: n('pinned_messages_m2_pin_max'), selecaoMidias: n('media_picker_select_limit'),
        editarMin: n('message_edit_window_duration_seconds') ? Math.round(n('message_edit_window_duration_seconds') / 60) : null, opcoesEnquete: n('poll_option_count'),
        descGrupo: n('group_description_length'), assuntoGrupo: n('group_max_subject'), agendarDias: dias ? Math.round(dias / 86400) : null };
    },
    // Tema do próprio WhatsApp ('dark' | 'light' | 'system'); fica salvo e a wa-js recarrega a página.
    setTheme: async (t) => { await WPP.conn.setTheme(t); return true; },
    sendText: async (id, text) => { await WPP.chat.sendTextMessage(id, text, { createChat: true }); return true; },
    sendFile: async (id, dataUrl, opts) => { await WPP.chat.sendFileMessage(id, dataUrl, { createChat: true, ...opts }); return true; },
    composing: async (id, s) => { await WPP.chat.markIsComposing(id, s * 1000); await sleep(s * 1000); return true; },
    recording: async (id, s) => { await WPP.chat.markIsRecording(id, s * 1000); await sleep(s * 1000); return true; },
    archive: async (id, v) => { await WPP.chat.archive(id, v); return true; },
    pin: async (id, v) => {
      try { await (v ? WPP.chat.pin(id) : WPP.chat.unpin(id)); } catch (e) { if (!/_error$/.test(e?.code || '')) throw e; } // já fixado/desfixado
      return true;
    },
    markUnread: async (id) => { await WPP.chat.markIsUnread(id); return true; },
    sendContact: async (id, numero, nome) => { await WPP.chat.sendVCardContactMessage(id, { id: numero + '@c.us', name: nome }); return true; },
    block: async (id) => { await (WPP.blocklist?.blockContact || WPP.contact.blockContact)(id); return true; },
    // Fixar do AtendeZap (mesmo mecanismo do original): chat.pin = timestamp só neste navegador,
    // sem limite de 3 e sem ir ao servidor. Quem está mais acima na lista recebe o maior valor.
    applyPins: async (ids, removed = []) => {
      for (const id of removed) { const c = await WPP.chat.find(toWid(id)).catch(() => null); if (c) delete c.__x_pin; }
      const base = Date.now();
      for (const [i, id] of ids.entries()) {
        const c = await WPP.chat.find(toWid(id)).catch(() => null);
        if (c) c.pin = base + ids.length - i;
      }
      return true;
    },
    // ---- Pedidos para entrar no grupo (v1.12) ----
    // gruposLista: grupos (id + nome) para montar os conjuntos "sem duplicar".
    gruposLista: async () => (await WPP.chat.list())
      .filter((c) => (sid(c.id) || '').endsWith('@g.us'))
      .map((c) => ({ id: sid(c.id), name: info(c).name }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR')),
    // pedidosLista: grupos em que você é admin e que têm pedidos pendentes (ids = só esses grupos; vazio = todos).
    pedidosLista: async (ids) => {
      const todos = (await WPP.chat.list()).filter((c) => (sid(c.id) || '').endsWith('@g.us'));
      const alvo = Array.isArray(ids) && ids.length ? todos.filter((c) => ids.includes(sid(c.id))) : todos;
      const out = [];
      const um = async (c) => {
        const id = sid(c.id);
        if (c.groupMetadata?.membershipApprovalMode === false) return; // sem aprovação de membros: não tem pedidos
        try { if (!(await WPP.group.iAmAdmin(id))) return; } catch { return; }
        try { const r = await WPP.group.getMembershipRequests(id); if (r?.length) out.push({ id, name: info(c).name, n: r.length }); } catch { /* sem acesso */ }
      };
      for (let i = 0; i < alvo.length; i += 6) await Promise.all(alvo.slice(i, i + 6).map(um));
      return out.sort((a, b) => b.n - a.n);
    },
    // pedidosPlano: prévia (executar=false) ou aprovação (executar=true) dos pedidos de `grupos`, na ordem dada.
    // conjuntos = [[idGrupo, idGrupo…]…]: quem JÁ está em outro grupo do mesmo conjunto (ou acabou de ser aprovado em um)
    // não é aprovado: fica pendente (ou é recusado, se recusar=true). Aprova em lotes de 20 com pausa entre eles.
    pedidosPlano: async (grupos, conjuntos = [], opc = {}) => {
      const { executar = false, recusar = false, excedente = false } = opc;
      const nomeDe = {};
      for (const c of await WPP.chat.list()) { const i = sid(c.id); if (i && i.endsWith('@g.us')) nomeDe[i] = info(c).name; }
      let lim = 1024; try { const l = await WPP.group.getGroupSizeLimit(); if (l > 0) lim = l; } catch { /* usa 1024 */ }
      const userDe = (x) => { const w = x?.id ?? x; return String(w?.user || String(w?._serialized || w || '').split('@')[0]); };
      const cache = new Map(); // grupo -> Set de "usuários" (parte antes do @)
      const membros = async (g) => {
        if (!cache.has(g)) {
          let lista = [];
          try { lista = await WPP.group.getParticipants(g); } catch { /* tenta pelo modelo */ }
          if (!lista?.length) {
            try { const gr = await WPP.group.ensureGroup(g); const ps = gr.groupMetadata.participants; lista = ps.getModelsArray?.() || ps.models || []; } catch { lista = []; }
          }
          cache.set(g, new Set((lista || []).map(userDe)));
        }
        return cache.get(g);
      };
      // quantos membros tem agora (contador do WhatsApp; senão o tamanho da lista) — e quanto já foi "ocupado" neste plano
      const ocupado = new Map();
      const ocup = async (g) => {
        if (!ocupado.has(g)) {
          let n = 0;
          try { n = (await WPP.chat.find(toWid(g)))?.groupMetadata?.participants?.length || 0; } catch { /* tenta abaixo */ }
          if (!n) { try { n = (await WPP.group.ensureGroup(g)).groupMetadata.participants.length || 0; } catch { /* usa a lista */ } }
          if (!n) n = (await membros(g)).size;
          ocupado.set(g, n);
        }
        return ocupado.get(g);
      };
      // todas as formas de identificar a pessoa (telefone e lid), porque o grupo pode listar de um jeito e o pedido de outro
      const formas = async (wid) => {
        const set = new Set([userDe(wid)]);
        let tel = null;
        try {
          const e = await WPP.contact.getPnLidEntry(wid);
          if (e?.phoneNumber) { tel = userDe(e.phoneNumber); set.add(tel); }
          if (e?.lid) set.add(userDe(e.lid));
        } catch { /* sem mapeamento */ }
        const w = wid?.id ?? wid;
        if (!tel && w?.server === 'c.us') tel = userDe(w);
        return { set, rotulo: tel ? '+' + tel : 'contato …' + userDe(wid).slice(-4) };
      };
      const irmaos = (g) => [...new Set(conjuntos.filter((c) => c.includes(g)).flat().filter((x) => x !== g))];
      const espera = (ms) => new Promise((r) => setTimeout(r, ms));
      const lotes = async (fn, widsList) => {
        let ok = 0, falhas = 0, erro = null;
        for (let i = 0; i < widsList.length; i += 20) {
          const lote = widsList.slice(i, i + 20);
          try {
            const res = await fn(lote);
            const f = Array.isArray(res) ? res.filter((x) => x && (x.error || x.code >= 400)).length : 0;
            ok += lote.length - f; falhas += f;
          } catch (e) { falhas += lote.length; erro = e?.message || String(e); }
          if (i + 20 < widsList.length) await espera(1200);
        }
        return { ok, falhas, erro };
      };
      const MAX_ADICOES = 40; // por execução: adicionar estranhos aos poucos (o resto continua pendente)
      let adicoesFeitas = 0;
      const out = [];
      for (const g of grupos) {
        const item = { id: g, name: nomeDe[g] || g, pedidos: 0, aprovar: [], duplicados: [], aprovados: 0, recusados: 0, falhas: 0,
          vagas: 0, redirecionar: [], semVaga: [], adicionados: 0, jaEra: 0, privacidade: 0, aguardando: 0, limpos: 0, convites: [] };
        let reqs = [];
        try { reqs = (await WPP.group.getMembershipRequests(g)) || []; } catch (e) { item.erro = e?.message || String(e); out.push(item); continue; }
        item.pedidos = reqs.length;
        const ok = [], dups = [];
        const os = irmaos(g);
        const meu = os.length ? await membros(g) : null;
        for (const r of reqs) {
          const wid = r?.id ?? r;
          const f = await formas(wid);
          let dup = null;
          for (const o of os) { const m = await membros(o); if ([...f.set].some((u) => m.has(u))) { dup = o; break; } }
          if (dup) { item.duplicados.push({ quem: f.rotulo, ja: nomeDe[dup] || dup }); dups.push(wid); } else ok.push({ wid, f });
        }
        // v1.19: aprova só até caber (o WhatsApp recusa o que passa do limite) e distribui o excedente
        item.vagas = Math.max(0, lim - await ocup(g));
        const entram = ok.slice(0, item.vagas), sobra = ok.slice(item.vagas);
        ocupado.set(g, (await ocup(g)) + entram.length);
        for (const x of entram) { item.aprovar.push(x.f.rotulo); if (meu) for (const u of x.f.set) meu.add(u); }
        const redir = [];
        for (const x of sobra) {
          let destino = null, melhor = 0;
          if (excedente) for (const o of os) { const livre = lim - await ocup(o); if (livre > melhor) { melhor = livre; destino = o; } }
          if (destino) {
            ocupado.set(destino, (await ocup(destino)) + 1);
            item.redirecionar.push({ quem: x.f.rotulo, destId: destino, destNome: nomeDe[destino] || destino }); redir.push({ ...x, destino });
            const md = await membros(destino); for (const u of x.f.set) md.add(u);
          } else item.semVaga.push(x.f.rotulo);
        }
        if (executar && entram.length) { const r = await lotes((l) => WPP.group.approve(g, l), entram.map((x) => x.wid)); item.aprovados = r.ok; item.falhas += r.falhas; if (r.erro) item.erro = r.erro; }
        if (executar && redir.length) {
          const limpar = [];
          for (const x of redir) {
            if (adicoesFeitas >= MAX_ADICOES) { item.semVaga.push(x.f.rotulo); continue; }
            adicoesFeitas++;
            try {
              const res = await WPP.group.addParticipants(x.destino, [x.wid]);
              const r = Object.values(res || {})[0] || {}, cod = Number(r.code);
              if (cod === 200) { item.adicionados++; limpar.push(x.wid); }
              else if (cod === 409) { item.jaEra++; limpar.push(x.wid); }
              else if (cod === 403) { item.privacidade++; item.convites.push({ id: String(x.wid?._serialized || x.wid), quem: x.f.rotulo, destId: x.destino, destNome: nomeDe[x.destino] || x.destino, code: r.invite_code || null, exp: r.invite_code_exp || null }); }
              else if (cod === 421) item.aguardando++;
              else item.falhas++;
            } catch (e) { item.falhas++; item.erro = e?.message || String(e); }
            await espera(1500);
          }
          // quem já foi colocado em outro grupo sai da fila deste (senão voltaria a aparecer como pendente)
          if (limpar.length) { const r = await lotes((l) => WPP.group.reject(g, l), limpar); item.limpos = r.ok; }
        }
        if (executar && recusar && dups.length) { const r = await lotes((l) => WPP.group.reject(g, l), dups); item.recusados = r.ok; item.falhas += r.falhas; if (r.erro) item.erro = r.erro; }
        out.push(item);
      }
      return out;
    },
    // convites exclusivos (cartão nativo do WhatsApp) para quem a privacidade não deixou adicionar. Poucos por vez e com pausa.
    enviarConvites: async (lista, legenda = '') => {
      const espera = (ms) => new Promise((r) => setTimeout(r, ms));
      let enviados = 0, falhas = 0; const erros = [];
      for (const c of (lista || []).slice(0, 20)) {
        try {
          if (!c.code) throw new Error('sem código de convite');
          await WPP.chat.sendGroupInviteMessage(c.id, { groupId: c.destId, inviteCode: c.code, inviteCodeExpiration: c.exp || undefined, caption: legenda || '' });
          enviados++;
        } catch (e) { falhas++; if (erros.length < 3) erros.push(e?.message || String(e)); }
        await espera(4000);
      }
      return { enviados, falhas, erros, restantes: Math.max(0, (lista || []).length - 20) };
    },
    // ---- v1.19: conjuntos de grupos ----
    // grupos em que você é ADMIN (com membros e limite), para escolher e gravar nos conjuntos
    gruposAdmin: async () => {
      let lim = 1024; try { const l = await WPP.group.getGroupSizeLimit(); if (l > 0) lim = l; } catch { /* usa 1024 */ }
      const todos = (await WPP.chat.list()).filter((c) => (sid(c.id) || '').endsWith('@g.us'));
      const out = [], t0 = performance.now(); let parcial = false;
      const um = async (c) => {
        const id = sid(c.id);
        try { if (!(await WPP.group.iAmAdmin(id))) return; } catch { return; }
        let m = c.groupMetadata?.participants?.length || 0;
        if (!m) { try { m = (await WPP.group.ensureGroup(id)).groupMetadata.participants.length || 0; } catch { /* sem contagem */ } }
        out.push({ id, name: info(c).name, m, l: lim });
      };
      for (let i = 0; i < todos.length; i += 6) { if (performance.now() - t0 > 45000) { parcial = true; break; } await Promise.all(todos.slice(i, i + 6).map(um)); }
      return { grupos: out.sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR')), total: todos.length, parcial };
    },
    // painel do conjunto: membros, limite e pedidos pendentes de cada grupo
    painelConjunto: async (ids) => {
      let lim = 1024; try { const l = await WPP.group.getGroupSizeLimit(); if (l > 0) lim = l; } catch { /* usa 1024 */ }
      const nomeDe = {};
      for (const c of await WPP.chat.list()) { const i = sid(c.id); if (i && i.endsWith('@g.us')) nomeDe[i] = info(c).name; }
      const out = [];
      for (const g of ids || []) {
        let m = 0;
        try { m = (await WPP.chat.find(toWid(g)))?.groupMetadata?.participants?.length || 0; } catch { /* tenta abaixo */ }
        if (!m) { try { m = (await WPP.group.ensureGroup(g)).groupMetadata.participants.length || 0; } catch { /* sem contagem */ } }
        let pend = null; try { pend = ((await WPP.group.getMembershipRequests(g)) || []).length; } catch { /* sem permissão */ }
        out.push({ id: g, name: nomeDe[g] || g, m, l: lim, pend });
      }
      return out;
    },
    // link público de convite do grupo; e o cartão de convite enviado numa conversa
    conviteGrupo: async (g) => { const code = await WPP.group.getInviteCode(g); return { code, link: 'https://chat.whatsapp.com/' + code }; },
    enviarConvite: async (chatId, g, legenda = '') => {
      const code = await WPP.group.getInviteCode(g);
      await WPP.chat.sendGroupInviteMessage(chatId, { groupId: g, inviteCode: code, caption: legenda || '' });
      return true;
    },
    // padronizar: aplica a mesma descrição/nome/ícone/permissões aos grupos (um a um, com pausa). Cada campo é opcional.
    padronizar: async (grupos, o = {}) => {
      const espera = (ms) => new Promise((r) => setTimeout(r, ms));
      const nomeDe = {};
      for (const c of await WPP.chat.list()) { const i = sid(c.id); if (i && i.endsWith('@g.us')) nomeDe[i] = info(c).name; }
      const out = [];
      for (const g of grupos || []) {
        const it = { id: g, name: nomeDe[g] || g, feito: [], erros: [] };
        const faz = async (rot, fn) => { try { await fn(); it.feito.push(rot); } catch (e) { it.erros.push(`${rot}: ${e?.message || e}`); } };
        if (typeof o.desc === 'string' && o.desc.trim()) await faz('descrição', () => WPP.group.setDescription(g, o.desc));
        if (typeof o.nome === 'string' && o.nome.trim()) await faz('nome', () => WPP.group.setSubject(g, o.nome.trim()));
        if (o.announcement === true || o.announcement === false) await faz(o.announcement ? 'só admins enviam' : 'todos enviam', () => WPP.group.setProperty(g, 'announcement', o.announcement));
        if (o.restrict === true || o.restrict === false) await faz(o.restrict ? 'só admins editam' : 'todos editam', () => WPP.group.setProperty(g, 'restrict', o.restrict));
        if (o.icone) await faz('ícone', () => WPP.group.setIcon(g, o.icone));
        out.push(it);
        await espera(1500);
      }
      return out;
    },
    // ação "Item especial" das respostas rápidas
    sendEspecial: async (chatId, a) => {
      switch (a.sub) {
        case 'pix': return WPP.chat.sendPixKeyMessage(chatId, { keyType: a.tipoChave || 'EVP', name: a.recebedor, key: a.chave }, {});
        case 'localizacao': return WPP.chat.sendLocationMessage(chatId, { lat: Number(a.lat), lng: Number(a.lng), name: a.nomeLocal || undefined, address: a.endereco || undefined });
        case 'enquete': return WPP.chat.sendCreatePollMessage(chatId, a.pergunta, String(a.opcoes || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 12), { selectableCount: Number(a.selecionaveis) || 0 });
        case 'convite': { const code = await WPP.group.getInviteCode(a.grupoId); return WPP.chat.sendGroupInviteMessage(chatId, { groupId: a.grupoId, inviteCode: code, caption: a.legenda || '' }); }
        default: throw new Error('item especial desconhecido: ' + a.sub);
      }
    },
    // votos da última enquete da conversa (quem votou em quê)
    votosEnquete: async (chatId) => {
      const msgs = await WPP.chat.getMessages(chatId, { count: 100 });
      const poll = [...(msgs || [])].reverse().find((m) => m.type === 'poll_creation');
      if (!poll) return { erro: 'Nenhuma enquete recente neste grupo.' };
      const v = await WPP.chat.getVotes(poll.id);
      const { canon } = await dupTools();
      const opcoes = (poll.pollOptions || []).map((o) => ({ nome: o.name, quem: [] }));
      for (const x of v.votes || []) {
        const c = await canon(x.sender), rot = c.startsWith('lid:') ? 'contato …' + c.slice(-4) : '+' + c;
        for (const i of Object.keys(x.selectedOptions || {})) if (opcoes[i]) opcoes[i].quem.push(rot);
      }
      return { pergunta: poll.pollName || poll.body || 'Enquete', total: (v.votes || []).length, opcoes };
    },
    // ---- Vagas nos grupos (v1.14) ----
    // marcarLinhas: põe data-az-chat=<id da conversa> em cada linha da lista. Devolve só contagens (e nomes de props se falhar).
    marcarLinhas: async () => {
      const rows = [...document.querySelectorAll('#pane-side [role="listitem"], #pane-side [role="row"]')];
      let fiber = 0, nome = 0, semId = 0, amostra = '', porNome = null;
      for (const row of rows) {
        let id = idDaLinha(row), via = 'fiber';
        if (!id) { // plano B: nome exibido, só se for único entre as conversas
          const t = row.querySelector('span[title]')?.getAttribute('title');
          if (t) {
            if (!porNome) { porNome = new Map(); for (const c of await WPP.chat.list()) { const n = info(c).name; porNome.set(n, [...(porNome.get(n) || []), sid(c.id)]); } }
            const l = porNome.get(t); if (l?.length === 1) { id = l[0]; via = 'nome'; }
          }
        }
        if (id) { row.setAttribute('data-az-chat', id); if (via === 'fiber') fiber++; else nome++; }
        else { row.removeAttribute('data-az-chat'); semId++; if (!amostra) amostra = amostraProps(row); }
      }
      return { linhas: rows.length, fiber, nome, semId, amostra };
    },
    // amostraLinhas: para o Diagnóstico/estrutura da tela — nomes das props do React das 3 primeiras linhas (nunca conteúdo)
    amostraLinhas: () => [...document.querySelectorAll('#pane-side [role="listitem"], #pane-side [role="row"]')].slice(0, 3)
      .map((row) => ({ achou: !!idDaLinha(row), props: amostraProps(row) })),
    // vagasGrupos: {idGrupo: {m: membros, l: limite}}. Usa o que já está carregado; só busca no servidor o que falta (3 por vez).
    vagasGrupos: async (ids) => {
      let lim = 1024;
      try { const l = await WPP.group.getGroupSizeLimit(); if (l > 0) lim = l; } catch { /* usa 1024 */ }
      const out = {}, lista = (ids || []).filter((i) => String(i).endsWith('@g.us'));
      const um = async (id) => {
        let n = 0;
        try { n = (await WPP.chat.find(toWid(id)))?.groupMetadata?.participants?.length || 0; } catch { /* tenta abaixo */ }
        if (!n) { try { n = (await WPP.group.ensureGroup(id)).groupMetadata.participants.length || 0; } catch { /* sem dado */ } }
        if (n) out[id] = { m: n, l: lim };
      };
      for (let i = 0; i < lista.length; i += 3) await Promise.all(lista.slice(i, i + 3).map(um));
      return out;
    },
    // v1.16 — inventário para comparar leituras: nomes dos módulos e valor de TODAS as chaves (numéricas e de texto também)
    inventario: () => ({
      versao: window.Debug?.VERSION || null, modulos: moduleIds(),
      flags: Object.fromEntries(recursosInternos().filter((r) => r.nome && !r.erro).map((r) => [r.nome, r.valor])),
    }),
    // v1.17 — "o que cada chave controla". No WhatsApp 2.3000.1050721289 o loader é o da Meta (loaderType "meta"), NÃO o webpack:
    // moduleRequire.m[id] quase nunca é a função do módulo. Dois caminhos: A) tenta o registro mesmo assim e conta os formatos;
    // B) PORTÕES: carrega os módulos Gating/Gate/Experiment/Eligib… (~330) pelo loadModule, lê o NOME das funções exportadas, o texto
    // delas (onde aparece o nome da chave) e, nas is*/has*/can*/should* sem parâmetros, o valor ATUAL (ligado/desligado nesta conta).
    // Em fatias (cede ao navegador); só nomes de módulos/funções/chaves e booleanos — nenhum conteúdo de conversa.
    referencias: async () => {
      const t0 = performance.now(), reg = WPP.loader?.moduleRequire?.m, ids = moduleIds();
      const flags = new Set(recursosInternos().filter((r) => r.nome && !r.erro).map((r) => r.nome));
      const RE = /["']([a-z][a-z0-9_]{5,90})["']/g, respira = () => new Promise((r) => setTimeout(r, 0));
      const achar = (fonte, cb) => { RE.lastIndex = 0; const vistos = new Set(); for (let x = RE.exec(fonte); x; x = RE.exec(fonte)) if (flags.has(x[1]) && !vistos.has(x[1])) { vistos.add(x[1]); cb(x[1]); } };
      const tipoDe = (r) => (r === null ? 'null' : Array.isArray(r) ? 'array' : typeof r);
      // ---- A) registro
      const tipos = {}, via = {}, ref = {}; let lidosReg = 0;
      const fonteDe = (rec) => {
        if (typeof rec === 'function') return ['fn', rec];
        if (Array.isArray(rec)) { const f = rec.find((x) => typeof x === 'function'); return f ? ['array', f] : null; }
        if (rec && typeof rec === 'object') for (const k of ['factory', 'f', 'fn', 'exec', 'load', '_factory', 'callback']) if (typeof rec[k] === 'function') return [k, rec[k]];
        return null;
      };
      for (let i = 0; i < ids.length; i++) {
        let rec; try { rec = reg?.[ids[i]]; } catch { rec = undefined; }
        const t = tipoDe(rec); tipos[t] = (tipos[t] || 0) + 1;
        const f = fonteDe(rec);
        if (f) { try { const txt = Function.prototype.toString.call(f[1]); via[f[0]] = (via[f[0]] || 0) + 1; lidosReg++; achar(txt, (n) => { const l = (ref[n] ||= []); if (l.length < 8) l.push(i); }); } catch { /* sem texto */ } }
        if (i % 200 === 199) await respira();
      }
      // v1.20: a wa-js expõe WPP.loader.moduleSource; descubro o que ele devolve (texto do módulo?) para o próximo ajuste
      const fonteMod = [];
      for (const id of ['WAWebABProps', 'WAWebStatusGatingUtils', ids[0]].filter(Boolean)) {
        try { const r = await WPP.loader.moduleSource?.(id); fonteMod.push({ id, tipo: tipoDe(r), len: typeof r === 'string' ? r.length : null }); }
        catch (e) { fonteMod.push({ id, erro: String(e?.message || e).slice(0, 80) }); }
      }
      const amostra = ['WAWebABProps', 'WAWebStatusGatingUtils', ids[0], ids[Math.floor(ids.length / 2)]].filter(Boolean).map((id) => {
        let rec; try { rec = reg?.[id]; } catch { rec = undefined; }
        return { id, tipo: tipoDe(rec), chaves: rec && typeof rec === 'object' ? Object.keys(rec).slice(0, 12) : null };
      });
      // ---- B) portões
      const GATE = /Gating|GateModel|Gate$|Gates$|ABProp|Experiment|Rollout|Eligib|FeatureFlag|Killswitch/;
      const alvo = ids.filter((i) => /^WA/.test(i) && GATE.test(i)), portoes = {}, nomes = {};
      let carregados = 0, funcoes = 0, chamadas = 0;
      const tB = performance.now();
      for (let j = 0; j < alvo.length && performance.now() - tB < 40000; j++) {
        const mod = loadMod(alvo[j]);
        if (!mod || typeof mod !== 'object') continue;
        carregados++;
        const nome = alvo[j].replace(/^WAWeb/, ''), fns = {};
        let chaves = []; try { chaves = Object.keys(mod).slice(0, 60); } catch { /* exports protegidos */ }
        for (const k of chaves) {
          let fn; try { fn = mod[k]; } catch { continue; }
          if (typeof fn !== 'function') continue;
          funcoes++;
          const fl = []; let v = null;
          try { achar(Function.prototype.toString.call(fn), (n) => fl.push(n)); } catch { /* sem texto */ }
          if (/^(is|has|can|should)[A-Z]/.test(k) && fn.length === 0) { // só leitura de estado: sem parâmetros e nunca "use*" (hooks do React)
            try { const r = fn(); v = r && typeof r.then === 'function' ? 'async' : (typeof r === 'boolean' || typeof r === 'number') ? r : null; chamadas++; } catch { v = 'erro'; }
          }
          fns[k] = [v, fl.slice(0, 6)];
          for (const n of fl) { const l = (nomes[n] ||= []); if (l.length < 4) l.push(`${nome}.${k}`); }
        }
        if (Object.keys(fns).length) portoes[nome] = fns;
        if (j % 12 === 11) await respira();
      }
      for (const n of Object.keys(ref)) { const l = (nomes[n] ||= []); for (const i of ref[n].slice(0, 2)) if (l.length < 4) l.push(ids[i]); }
      return { ref, nomes, portoes, stats: {
        modulos: ids.length, flagsTotal: flags.size, flagsComModulo: Object.keys(nomes).length, ms: Math.round(performance.now() - t0),
        registro: { tipos, via, lidos: lidosReg, flags: Object.keys(ref).length, amostra, moduleSource: fonteMod },
        portoes: { alvo: alvo.length, carregados, funcoes, chamadas, flags: Object.keys(nomes).filter((n) => Object.values(portoes).some((m) => Object.values(m).some((x) => x[1].includes(n)))).length },
      } };
    },
    // v1.20 — "Grupos só na aba Grupos". O WhatsApp decide quem entra na lista chamando getShouldAppearInList(chat); a própria wa-js
    // já troca essa função (é o que o WPP.chat.setChatList faz). Aqui trocamos DE NOVO, por cima, com a regra por aba — sem usar o
    // setChatList, que reinicia a aba ativa para "Tudo". O conteúdo manda o estado (liga/desliga, aba, busca) sempre que muda;
    // a regra só esconde GRUPO quando a aba é Tudo/Não lidas/Favoritas e não há texto na busca. Reversível: desligado = função original.
    gruposSo: (cfg) => {
      const GS = (window.__azGS ||= { cfg: {}, mod: null });
      GS.cfg = { ligado: !!cfg?.ligado, aba: cfg?.aba || null, busca: !!cfg?.busca };
      GS.esconde ||= (chat) => {
        const c = GS.cfg;
        if (!c.ligado || c.busca) return false;
        if (c.aba !== 'todas' && c.aba !== 'naolidas' && c.aba !== 'favoritas') return false; // aba Grupos, lista própria ou sem abas (Arquivadas)
        const id = chat?.id;
        return !!id && typeof id.isGroup === 'function' && id.isGroup();
      };
      if (!GS.mod) {
        let mod = null;
        try { mod = WPP.loader.search((m) => m && typeof m.getShouldAppearInList === 'function' && typeof m.getPreviewMessage === 'function'); } catch { mod = null; }
        if (!mod) return { ok: false, motivo: 'não achei o módulo getShouldAppearInList no WhatsApp' };
        const orig = mod.getShouldAppearInList;
        const nova = function (...a) {
          try { if (GS.esconde(a[0])) return false; } catch { /* na dúvida, o WhatsApp decide */ }
          return orig.apply(this, a);
        };
        try { Object.defineProperties(nova, Object.getOwnPropertyDescriptors(orig)); } catch { /* mesmas marcas da original (a wa-js faz igual) */ }
        try { mod.getShouldAppearInList = nova; } catch { return { ok: false, motivo: 'o WhatsApp não deixou trocar a função' }; }
        if (mod.getShouldAppearInList !== nova) return { ok: false, motivo: 'a troca da função não pegou' };
        GS.mod = mod;
      }
      try { WPP.whatsapp.ChatStore.trigger('sort'); } catch { /* sem ChatStore: a lista se atualiza no próximo evento */ }
      return { ok: true };
    },
    // ---- v1.22 Atendente IA ----
    // Só avisamos o painel de mensagens novas quando o Atendente está ligado (sem isso, nenhum evento é repassado).
    atendAtivo: (on) => { window.__azAtend = !!on; return true; },
    // v1.38 — liga/desliga o "Recuperar apagadas" (cfg = { grupos, midia, maxMB } ou null). Desligado, o ouvinte de apagadas não faz nada.
    recuperarAtivo: (cfg) => { window.__azRecuperar = cfg ? { grupos: cfg.grupos !== false, midia: cfg.midia === true, maxBytes: Math.min(8e6, Math.max(1e6, (Number(cfg.maxMB) || 3) * 1e6)) } : null; return true; },
    // Últimas mensagens da conversa em texto (mídias viram [áudio], [imagem]…). Fica só na memória do painel.
    historicoChat: async (chatId, n = 16) => {
      const msgs = await WPP.chat.getMessages(chatId, { count: Math.min(40, n + 4) });
      let chat = null; try { chat = await WPP.chat.find(toWid(chatId)); } catch { /* sem nome */ }
      const rot = { audio: '[áudio]', ptt: '[áudio]', image: '[imagem]', video: '[vídeo]', document: '[documento]', sticker: '[figurinha]', location: '[localização]', vcard: '[contato]', multi_vcard: '[contatos]' };
      const lista = (msgs || []).filter((m) => m.type !== 'revoked' && !/e2e|notification|gp2|protocol/.test(m.type || ''))
        .map((m) => ({ de: m.id?.fromMe ? 'atendente' : 'cliente', tipo: m.type, t: m.t || 0, ...(m.type === 'ptt' || m.type === 'audio' ? { mid: String(m.id?._serialized || ''), dur: Number(m.duration) || 0 } : {}),
          texto: m.type === 'chat' ? String(m.body || '') : `${m.caption ? m.caption + ' ' : ''}${rot[m.type] || '[' + m.type + ']'}`.trim() }))
        .filter((x) => x.texto).sort((x, y) => x.t - y.t).slice(-n);
      return { nome: chat ? info(chat).name : '', msgs: lista };
    },
    // v1.37 — as MINHAS mensagens enviadas na conversa (para apagar PARA TODOS a qualquer tempo). Só o necessário para a lista: id, hora, tipo e um trecho do texto. Nada disto sai do computador.
    minhasMsgs: async (chatId, n = 30) => {
      const msgs = await WPP.chat.getMessages(chatId, { count: Math.min(100, Math.max(10, n + 20)) });
      const rot = { audio: '[áudio]', ptt: '[áudio]', image: '[imagem]', video: '[vídeo]', document: '[documento]', sticker: '[figurinha]', location: '[localização]', vcard: '[contato]', multi_vcard: '[contatos]', poll_creation: '[enquete]' };
      const lista = (msgs || []).filter((m) => m.id?.fromMe && m.type !== 'revoked' && !/e2e|notification|gp2|protocol|call_log/.test(m.type || '') && m.id?._serialized)
        .map((m) => ({ id: String(m.id._serialized), t: m.t || 0, tipo: m.type, texto: (m.type === 'chat' ? String(m.body || '') : `${m.caption ? m.caption + ' ' : ''}${rot[m.type] || '[' + m.type + ']'}`).replace(/\s+/g, ' ').trim().slice(0, 90) }))
        .sort((x, y) => y.t - x.t).slice(0, n);
      return { msgs: lista };
    },
    // v1.37 — apaga PARA TODOS, uma a uma e com pausa, SÓ mensagens minhas; depois confere se virou "apagada" (o servidor do WhatsApp decide se aceita as muito antigas). Devolve [{id, ok, motivo}].
    apagarParaTodos: async (chatId, ids) => {
      const out = [], pausa = (ms) => new Promise((r) => setTimeout(r, ms));
      for (const id of (Array.isArray(ids) ? ids : []).slice(0, 50)) {
        try {
          const m = await WPP.chat.getMessageById(id);
          if (!m || !m.id?.fromMe) { out.push({ id, ok: false, motivo: 'não é uma mensagem sua (ou não foi encontrada)' }); continue; }
          if (m.type === 'revoked') { out.push({ id, ok: true, motivo: 'já estava apagada' }); continue; }
          await WPP.chat.deleteMessage(chatId, id, false, true);
          await pausa(1200);
          const dep = await WPP.chat.getMessageById(id).catch(() => null), ok = !dep || dep.type === 'revoked';
          out.push({ id, ok, motivo: ok ? '' : 'o WhatsApp não confirmou: o servidor pode recusar mensagens muito antigas' });
        } catch (e) { out.push({ id, ok: false, motivo: String(e?.message || e).slice(0, 120) }); }
        await pausa(500);
      }
      return out;
    },
    // v1.44 — RESUMIR O QUE PERDI: só leitura. Conversas individuais com mensagens NÃO LIDAS (as últimas N de cada), para o painel mascarar e a IA resumir.
    naoLidas: async (maxChats, porChat) => {
      const mc = Math.min(40, Math.max(3, Number(maxChats) || 15)), pc = Math.min(40, Math.max(3, Number(porChat) || 20));
      const lista = (await WPP.chat.list()).filter((c) => { const i = sid(c.id) || ''; return i && !/@(g\.us|broadcast|newsletter)$/.test(i) && (c.unreadCount || 0) !== 0; }).sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, mc), chats = [];
      for (const c of lista) {
        try {
          const n = Math.min(pc, c.unreadCount > 0 ? c.unreadCount : 5), ms = await WPP.chat.getMessages(sid(c.id), { count: n + 3 });
          const msgs = (ms || []).filter((m) => m?.id?._serialized && !m.id.fromMe && m.type !== 'revoked' && !/e2e|notification|gp2|protocol|call_log|ciphertext/.test(m.type || '')).sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, n).reverse()
            .map((m) => ({ t: m.t || 0, tipo: m.type || '', texto: String(m.type === 'chat' ? (m.body || '') : (m.caption || '')).slice(0, 400) }));
          if (msgs.length) chats.push({ id: sid(c.id), nome: info(c).name, nao: c.unreadCount > 0 ? c.unreadCount : msgs.length, msgs });
        } catch { /* conversa sem acesso: segue */ }
        await new Promise((r) => setTimeout(r, 100));
      }
      return { chats, total: lista.length };
    },
    // v1.44 — LIGAÇÃO → RESPOSTA AUTOMÁTICA. ligacaoAtivo liga/desliga o aviso; ligacaoContexto diz quando foi a SUA última mensagem (para não responder a quem você já atendeu).
    ligacaoAtivo: (on) => { window.__azLigacao = !!on; return true; },
    ligacaoContexto: async (chatId) => {
      const ms = await WPP.chat.getMessages(chatId, { count: 15 });
      return { ultimaMinha: (ms || []).filter((m) => m?.id?.fromMe).reduce((mx, m) => Math.max(mx, m.t || 0), 0) };
    },
    // v1.43 — APARELHO DO CONTATO: devolve só os ids das últimas mensagens RECEBIDAS dele (da mais nova para a mais antiga). Quem decide o palpite (Android/iPhone/Web) é o painel (lib/aparelho.js).
    contatoAparelho: async (chatId, n = 40) => {
      const grupo = /@g\.us$/.test(String(chatId));
      if (grupo) return { grupo: true, ids: [] };
      const msgs = await WPP.chat.getMessages(chatId, { count: Math.min(100, Math.max(10, Number(n) || 40)) });
      const ids = (msgs || []).filter((m) => m?.id?._serialized && !m.id.fromMe && !/e2e|notification|gp2|protocol|call_log|ciphertext/.test(m.type || '')).sort((a, b) => (b.t || 0) - (a.t || 0)).map((m) => String(m.id._serialized)).slice(0, 40);
      return { grupo: false, ids };
    },
    // v1.43 — TREINO COM CONVERSAS REAIS: só leitura. Conversas individuais (sem grupos) com movimento nos últimos `dias`, e só as mensagens de TEXTO (sem mídia). Nada sai do computador aqui:
    // o painel monta as trocas, mascara os dados pessoais e só então (com a sua confirmação) manda o resumo à IA.
    conversasParaTreino: async (dias, maxChats, porChat) => {
      const desde = Date.now() / 1000 - Math.min(60, Math.max(1, Number(dias) || 14)) * 86400, mc = Math.min(80, Math.max(5, Number(maxChats) || 30)), pc = Math.min(120, Math.max(20, Number(porChat) || 60));
      const lista = (await WPP.chat.list()).filter((c) => { const i = sid(c.id) || ''; return i && !/@(g\.us|broadcast|newsletter)$/.test(i) && (c.t || 0) >= desde; }).sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, mc);
      const chats = [];
      for (const c of lista) {
        try {
          const ms = await WPP.chat.getMessages(sid(c.id), { count: pc });
          const msgs = (ms || []).filter((m) => m?.id?._serialized && m.type === 'chat' && (m.t || 0) >= desde && String(m.body || '').trim()).map((m) => ({ t: m.t, fromMe: !!m.id.fromMe, texto: String(m.body).slice(0, 500) })).sort((a, b) => a.t - b.t);
          if (msgs.length) chats.push({ id: sid(c.id), nome: info(c).name, msgs });
        } catch { /* conversa sem acesso: segue */ }
        await new Promise((r) => setTimeout(r, 120));
      }
      return { chats, lidas: lista.length };
    },
    // v1.42 — EXPORTAR CONVERSA. Lê a conversa em páginas (da mais nova para a mais antiga) até passar do início do período e devolve só as mensagens de [de, ate] (milissegundos).
    // Só enxerga o que o WhatsApp Web consegue carregar; `maisAntiga` diz até onde ele chegou (o painel avisa se o começo do período ficou de fora).
    exportarLer: async (chatId, deMs, ateMs) => {
      const de = Number(deMs) / 1000, ate = Number(ateMs) / 1000;
      if (!(de > 0 && ate >= de)) throw new Error('intervalo inválido');
      const MAX = 30000, t0 = Date.now(), vistos = new Map();
      let ancora = '', paginas = 0, truncado = false;
      for (;;) {
        const lote = await WPP.chat.getMessages(chatId, ancora ? { count: 200, id: ancora } : { count: 200 }); paginas++;
        let novos = 0;
        for (const m of lote || []) { const id = m?.id?._serialized; if (id && !vistos.has(id)) { vistos.set(id, m); novos++; } }
        if (!novos) break;                                                   // não há mais mensagens anteriores
        const velha = [...vistos.values()].sort((a, b) => (a.t || 0) - (b.t || 0))[0];
        if ((velha.t || 0) < de) break;                                      // já passou do começo do período
        if (vistos.size >= MAX || paginas >= 160 || Date.now() - t0 > 180000) { truncado = true; break; }
        ancora = velha.id._serialized;
      }
      const todas = [...vistos.values()].sort((a, b) => (a.t || 0) - (b.t || 0));
      let chatNome = ''; try { const c = WPP.whatsapp.ChatStore.get(chatId); chatNome = c ? info(c).name : ''; } catch { chatNome = ''; }
      const grupo = /@g\.us$/.test(chatId), IGN = /^(e2e_notification|notification|notification_template|gp2|protocol|ciphertext|call_log|broadcast_notification)$/;
      const msgs = todas.filter((m) => (m.t || 0) >= de && (m.t || 0) <= ate && !IGN.test(m.type || '')).map((m) => {
        const tipo = m.type || '', apagada = tipo === 'revoked', fromMe = !!m.id?.fromMe;
        const quem = fromMe ? 'Eu' : String(m.senderObj?.pushname || m.senderObj?.formattedName || m.senderObj?.name || m.notifyName || (grupo ? (sid(m.author) || sid(m.from) || '') : chatNome) || '').replace(/@.*/, '').slice(0, 80);
        return { id: m.id._serialized, t: m.t || 0, fromMe, de: quem, tipo, apagada, viewOnce: !!(m.isViewOnce === true || m.viewOnce === true),
          texto: apagada ? '' : String(tipo === 'chat' ? (m.body || '') : (m.caption || '')).slice(0, 8000), mime: String(m.mimetype || ''), nome: String(m.filename || '').slice(0, 120), dur: Number(m.duration) || 0, tam: Number(m.size) || 0, lat: m.lat, lng: m.lng };
      });
      return { msgs, truncado, paginas, maisAntiga: todas[0]?.t || 0, chatNome, grupo, total: todas.length };
    },
    // v1.42 — baixa UMA mídia da conversa para o .zip (o WhatsApp pode já não ter o arquivo: aí devolve o motivo e o painel segue em frente).
    exportarMidia: async (id, maxBytes) => {
      const max = Math.min(100e6, Math.max(1e5, Number(maxBytes) || 25e6));
      try {
        const blob = await WPP.chat.downloadMedia(id);
        if (!blob) return { ok: false, motivo: 'o WhatsApp não devolveu o arquivo' };
        if (blob.size > max) return { ok: false, motivo: `arquivo grande demais (${(blob.size / 1e6).toFixed(1)} MB)` };
        return { ok: true, mime: blob.type || '', buf: await blob.arrayBuffer() };
      } catch (e) { return { ok: false, motivo: String(e?.message || e).slice(0, 120) }; }
    },
    // v1.29 — baixa UM áudio (para a IA transcrever). Devolve {mime, b64, bytes}; recusa arquivos grandes demais.
    baixarAudio: async (mid, maxBytes = 4000000) => {
      const blob = await WPP.chat.downloadMedia(mid);
      if (!blob) throw new Error('não consegui baixar o áudio');
      if (blob.size > maxBytes) throw new Error('áudio grande demais (' + Math.round(blob.size / 1024) + ' KB)');
      const bytes = new Uint8Array(await blob.arrayBuffer()); let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return { mime: blob.type || 'audio/ogg', b64: btoa(bin), bytes: blob.size };
    },
    // v1.24 — conversas individuais com mensagem NÃO lida nas últimas N horas (o robô as retoma depois de uma parada do computador/aba).
    naoRespondidas: async (horas = 3) => {
      const limite = Date.now() / 1000 - Math.max(0.1, Number(horas) || 3) * 3600, out = [];
      for (const c of await WPP.chat.list()) {
        const id = sid(c.id);
        if (!id || /@(g\.us|broadcast|newsletter)$/.test(id) || id === 'status@broadcast') continue;
        if ((c.unreadCount || 0) > 0 && (c.t || 0) >= limite) out.push({ id, t: c.t });
      }
      return out.sort((x, y) => y.t - x.t).slice(0, 30);
    },
    // Coloca um texto no campo de mensagem da conversa (não envia).
    rascunho: async (chatId, texto) => { await WPP.chat.openChatBottom(await resolve(chatId)); await WPP.chat.setInputText(texto, chatId); return true; },
    // ---- Duplicados que JÁ existem num conjunto "sem duplicar" (v1.12.1) ----
    // duplicadosConjunto: quem está em 2+ grupos do conjunto (só leitura). Devolve {grupos, itens:[{quem, grupos:[{id,name,pid,admin}]}]}.
    // pid = id da pessoa DENTRO daquele grupo (é o que a remoção usa). Compara por telefone, resolvendo lid → telefone.
    duplicadosConjunto: async (grupos) => {
      const { nomeDe, lerGrupo, canon } = await dupTools();
      let eu = null;
      try { eu = await canon(WPP.conn.getMyUserId()); } catch { /* sem isso, só não esconde você mesmo */ }
      const por = new Map(); // canônico -> [{g, pid, admin}]
      for (const g of grupos) {
        const ps = (await lerGrupo(g)).lista;
        for (let i = 0; i < ps.length; i += 25) {
          const cs = await Promise.all(ps.slice(i, i + 25).map((p) => canon(p.wid)));
          cs.forEach((c, j) => { if (c === eu) return; if (!por.has(c)) por.set(c, []); por.get(c).push({ g, pid: String(ps[i + j].wid?._serialized || ps[i + j].wid), admin: ps[i + j].admin }); });
        }
      }
      const itens = [];
      for (const [c, lista] of por) {
        const gs = [...new Map(lista.map((x) => [x.g, x])).values()];
        if (gs.length < 2) continue;
        itens.push({ quem: c.startsWith('lid:') ? 'contato …' + c.slice(-4) : '+' + c, protegido: gs.some((x) => x.admin), grupos: gs.map((x) => ({ id: x.g, name: nomeDe[x.g] || x.g, pid: x.pid, admin: x.admin })) });
      }
      itens.sort((a, b) => b.grupos.length - a.grupos.length || a.quem.localeCompare(b.quem));
      return { grupos: grupos.map((g) => ({ id: g, name: nomeDe[g] || g })), itens };
    },
    // removerDuplicados: remocoes = {idGrupo: [pid…]}; conjunto = ids de TODOS os grupos do conjunto.
    // ADMINISTRADOR NUNCA É REMOVIDO, nem se for admin em outro grupo do conjunto: a ponte lê de novo os admins de cada grupo do
    // conjunto (e do grupo alvo) e tira do pedido quem for admin em qualquer um. Se não conseguir conferir, não remove ninguém.
    // Só age onde você é admin; lotes de 10 com pausa.
    removerDuplicados: async (remocoes, conjunto = []) => {
      const { nomeDe, lerGrupo, canon } = await dupTools();
      const espera = (ms) => new Promise((r) => setTimeout(r, ms));
      const alvos = Object.keys(remocoes || {});
      const adminsCanon = new Set();
      let conferiu = true;
      for (const g of new Set([...conjunto, ...alvos])) {
        const r = await lerGrupo(g);
        if (!r.ok || !r.lista.length) { conferiu = false; continue; }
        for (const p of r.lista) if (p.admin) adminsCanon.add(await canon(p.wid));
      }
      const out = [];
      for (const [g, ids] of Object.entries(remocoes || {})) {
        const item = { id: g, name: nomeDe[g] || g, pedidos: ids.length, removidos: 0, falhas: 0, protegidos: 0 };
        if (!conferiu) { item.falhas = ids.length; item.erro = 'não consegui conferir quem é admin; nada foi removido'; out.push(item); continue; }
        let admin = false;
        try { admin = await WPP.group.iAmAdmin(g); } catch { /* trata como sem permissão */ }
        if (!admin) { item.falhas = ids.length; item.erro = 'você não é admin deste grupo'; out.push(item); continue; }
        const widPor = new Map((await lerGrupo(g)).lista.map((p) => [String(p.wid?._serialized || p.wid), p.wid]));
        const alvo = [];
        for (const id of ids) {
          const w = widPor.get(String(id));
          if (!w || adminsCanon.has(await canon(w))) continue; // admin em algum grupo do conjunto (ou fora do grupo): fica
          alvo.push(id);
        }
        item.protegidos = ids.length - alvo.length;
        for (let i = 0; i < alvo.length; i += 10) {
          const lote = alvo.slice(i, i + 10);
          try {
            const res = await WPP.group.removeParticipants(g, lote);
            const f = Array.isArray(res) ? res.filter((x) => x && (x.error || x.code >= 400)).length : 0;
            item.removidos += lote.length - f; item.falhas += f;
          } catch (e) { item.falhas += lote.length; item.erro = e?.message || String(e); }
          if (i + 10 < alvo.length) await espera(1500);
        }
        out.push(item);
      }
      return out;
    },
    // Conversa oculta = arquivada + silenciada "Sempre" (expiration -1, igual ao Silenciar › Sempre do WhatsApp).
    // A wa-js recusa -1 em WPP.chat.mute, então chama o modelo do chat direto (é o que ela faz por dentro).
    // Isso sincroniza com o celular. sim=false desarquiva e tira o silêncio.
    ocultar: async (ids, sim = true) => {
      const out = {};
      for (const id of ids) {
        const c = await WPP.chat.find(toWid(id)).catch(() => null);
        if (!c) { out[id] = null; continue; }
        try {
          const mutada = () => c.mute?.expiration === -1 || c.mute?.expiration > Date.now() / 1000;
          if (sim) {
            if (!c.archive) await WPP.chat.archive(c.id, true);
            if (!mutada()) {
              try { await c.mute.mute({ expiration: -1, isAutoMuted: false, sendDevice: true }); }
              catch { await WPP.chat.mute(c.id, { duration: 10 * 365 * 86400 }); }
            }
          } else {
            if (c.archive) await WPP.chat.archive(c.id, false);
            if (mutada()) await (c.mute?.unmute ? c.mute.unmute({ sendDevice: true }) : WPP.chat.unmute(c.id));
          }
          out[id] = { nome: c.formattedTitle || c.name || c.contact?.formattedName || id.split('@')[0], arquivada: !!c.archive, silenciada: mutada() };
        } catch (e) { out[id] = { erro: e.message }; }
      }
      return out;
    },
    // Quantas conversas arquivadas NÃO são ocultas (0 = a faixa "Arquivadas" só teria ocultas e pode sumir)
    arquivadasFora: async (ids) => {
      const ocultas = new Set(ids);
      return (await WPP.chat.list()).filter((c) => c.archive && !ocultas.has(c.id._serialized)).length;
    },
    // Menu do botão direito na lista só dá o nome exibido: acha o id da conversa por ele
    chatPorNome: async (nome) => {
      const l = await WPP.chat.list();
      const c = l.find((x) => (x.formattedTitle || x.name || x.contact?.formattedName) === nome);
      return c ? c.id._serialized : null;
    },
    // Diagnóstico: o que existe nesta versão do WhatsApp/wa-js
    diag: () => ({
      wppLoaded: !!window.WPP,
      waJs: WPP?.version || null,
      waVersion: WPP?.whatsapp?.Features?.getVersion?.() || window.Debug?.VERSION || null,
      ready: isReady(),
      fullReady: !!(WPP?.isFullReady || WPP?.loader?.isFullReady),
      hasLoader: !!WPP?.loader, hasWebpack: !!WPP?.webpack,
      active: (() => { try { const c = WPP.chat.getActiveChat(); return c ? c.id._serialized : null; } catch (e) { return 'erro: ' + e.message; } })(),
      // Funções da wa-js que a extensão usa (ao usar uma nova, acrescente aqui para o Diagnóstico checar)
      fnMap: Object.fromEntries(['chat.sendTextMessage', 'chat.sendFileMessage', 'chat.sendVCardContactMessage', 'chat.setInputText', 'conn.setTheme', 'chat.list', 'status.sendTextStatus', 'status.sendImageStatus', 'status.sendVideoStatus', 'status.getMyStatus', 'status.remove', 'whatsapp.Cmd.sendRevokeMsgs', 'chat.deleteMessage', 'chat.getMessageById',
        'chat.openChatBottom', 'chat.find', 'chat.getActiveChat', 'chat.markIsComposing', 'chat.markIsRecording', 'chat.archive', 'chat.mute', 'chat.unmute', 'chat.markIsUnread',
        'contact.queryExists', 'contact.getProfilePictureUrl', 'group.getMembershipRequests', 'group.approve', 'group.reject', 'group.getParticipants', 'group.iAmAdmin', 'group.removeParticipants', 'group.ensureGroup', 'group.getGroupSizeLimit', 'loader.search', 'group.addParticipants', 'group.getInviteCode', 'group.setDescription', 'group.setSubject', 'group.setProperty', 'group.setIcon', 'chat.sendGroupInviteMessage', 'chat.sendPixKeyMessage', 'chat.sendLocationMessage', 'chat.sendCreatePollMessage', 'chat.getVotes', 'chat.getMessages', 'conn.getMyUserId', 'contact.getPnLidEntry', 'blocklist.blockContact', 'labels.getAllLabels', 'labels.addOrRemoveLabels', 'profile.isBusiness']
        .map((p) => [p, typeof p.split('.').reduce((o, k) => o?.[k], WPP) === 'function'])
        .concat([['interno.apagarStatus', !!findRevoke() || typeof WPP.whatsapp?.Cmd?.sendRevokeMsgs === 'function']])),
      apagarStatusVia: viaSalva() || findRevoke()?.onde || null,
      modulosRevoke: revokeCandidatos(),
      limites: (() => { try { return api.limitesWA(); } catch { return null; } })(),
      business: isBiz(),
      lab: labEstado(),
      modulosAusentes: window.__azModulosAusentes || [],
      wrapInofensivos: window.__azWrapInofensivos || [],   // funções do WhatsApp que a wa-js tentou embrulhar e não existem mais (sem efeito)
      console: window.__azConsole || null,
    }),
    ping: () => Date.now(),
    labList: () => ({ ...labEstado(), recursos: recursosInternos() }),
    labSet: (nome, valor) => {
      if (valor === null || valor === undefined) delete labOverrides[nome];
      else labOverrides[nome] = valor;
      salvarLab();
      instalarLab();
      return labEstado();
    },
    labReset: () => { labOverrides = {}; salvarLab(); ls.del(LAB_PAUSA); return labEstado(); },
    labRetomar: () => { ls.del(LAB_PAUSA); return labEstado(); },
    recarregar: () => { setTimeout(() => location.reload(), 300); return true; },
    // Mapa geral do WhatsApp para ajustes futuros: nomes dos módulos internos, funções da wa-js e marcadores da tela.
    // Não inclui contatos, números nem mensagens (só nomes técnicos).
    mapa: () => {
      const ids = moduleIds();
      const PALAVRAS = ['revoke', 'status', 'send', 'pin', 'label', 'compose', 'theme', 'chat', 'msg', 'media', 'contact', 'group', 'archive', 'block', 'lid', 'newsletter', 'presence'];
      // v1.15: o antigo "indice" repetia 100% dos nomes de "modulos" (136 KB) e cortava cada palavra em 400; agora só as contagens
      const contagemPorPalavra = Object.fromEntries(PALAVRAS.map((p) => [p, ids.filter((i) => i.toLowerCase().includes(p)).length]));
      const wpp = {};
      for (const ns of Object.keys(WPP).sort()) {
        const v = WPP[ns];
        if (v && typeof v === 'object' && ns !== 'whatsapp') {
          wpp[ns] = Object.keys(v).filter((k) => typeof v[k] === 'function').sort();
        }
      }
      const whatsapp = Object.keys(WPP.whatsapp || {}).sort();
      const functions = Object.keys(WPP.whatsapp?.functions || {}).filter((k) => typeof WPP.whatsapp.functions[k] === 'function').sort();
      const conta = (sel, attr) => {
        const c = {};
        document.querySelectorAll(sel).forEach((e) => { const v = e.getAttribute(attr); c[v] = (c[v] || 0) + 1; });
        return c;
      };
      return {
        whatsapp: window.Debug?.VERSION || null, waJs: WPP.version || null, loaderType: WPP.loader?.loaderType || null,
        totalModulos: ids.length, contagemPorPalavra, modulos: ids,
        wppFuncoes: wpp, whatsappExports: whatsapp, whatsappFunctions: functions,
        apagarStatusVia: viaSalva() || findRevoke()?.onde || null,
        apagarStatusCandidatos: revokeCandidatos(),
        // v1.37: onde o WhatsApp guarda o prazo de "Apagar para todos" (só nomes e números de constantes; para um dia ajustarmos a tela do próprio WhatsApp)
        sondaApagarPrazo: (() => {
          const o = {};
          for (const nome of ['WAWebRevokeMsgConstants', 'WAWebRevokeMsgAction', 'WAWebMsgActionCapability']) {
            try { const mod = loadMod(nome); if (!mod) { o[nome] = null; continue; } const ex = {}; for (const k of Object.keys(mod).slice(0, 40)) { const v = mod[k]; ex[k] = typeof v === 'function' ? 'fn' : typeof v === 'number' || typeof v === 'boolean' ? v : typeof v === 'string' ? v.slice(0, 40) : typeof v; } o[nome] = ex; } catch (e) { o[nome] = 'erro: ' + String(e?.message || e).slice(0, 60); }
          }
          return o;
        })(),
        // v1.46: que CHAVES e que módulos de "portão" os módulos de visualização única do WhatsApp consultam (só NOMES; nenhum código vai para o relatório). Serve para achar a chave oficial que liga a abertura em aparelhos conectados.
        sondaViewOnce: (() => {
          const o = { modulos: {}, chaves: [], portoes: [] };
          try {
            const flags = new Map((recursosInternos() || []).map((x) => [x.nome, x.valor])), chaves = new Set(), portoes = new Set(), rxPortao = /^WA(Web)?[A-Za-z0-9.]*(Gating|ABProp|Capab|Companion|Linked|Device|Migrat)[A-Za-z0-9.]*$/;
            for (const nome of ['WAWebViewOnceState', 'WAWebMessageViewOncePendingCancel', 'WAWebViewOnceSunsetIcon.react', 'WAWebViewOnceScreenshotActionsWamEvent', 'WAWebViewOnceSunset.react', 'WAWebMessageViewOnce.react', 'WAWebAttachMediaViewOnceNux.react', 'WAWebAttachMediaViewOnce.react', 'WAWebAttachMediaViewOnceInChat.react']) {
              try {
                const mod = loadMod(nome); if (!mod) { o.modulos[nome] = null; continue; }
                const usa = new Set(), via = new Set();
                for (const k of Object.keys(mod)) {
                  const v = mod[k], f = typeof v === 'function' ? v : v && (v.type || v.render); if (typeof f !== 'function') continue;
                  let src = ''; try { src = Function.prototype.toString.call(f); } catch { continue; }
                  for (const m of src.matchAll(/["']([A-Za-z][A-Za-z0-9_.]{4,100})["']/g)) { if (flags.has(m[1])) usa.add(m[1]); else if (rxPortao.test(m[1])) via.add(m[1]); }
                }
                o.modulos[nome] = { chaves: [...usa], portoes: [...via] }; usa.forEach((k) => chaves.add(k)); via.forEach((k) => portoes.add(k));
              } catch (e) { o.modulos[nome] = 'erro: ' + String(e?.message || e).slice(0, 60); }
            }
            o.chaves = [...chaves].map((k) => ({ nome: k, valor: flags.get(k) })); o.portoes = [...portoes];
          } catch (e) { o.erro = String(e?.message || e).slice(0, 80); }
          return o;
        })(),
        // v1.47: o WhatsApp entregou o ARQUIVO da visualização única a este navegador ou só o aviso? SÓ metadados (tipos e sim/não): nenhum id, texto nem conteúdo.
        entregaViewOnce: (() => {
          const o = { varridas: 0, tipos: {}, viewOnce: { total: 0, comArquivo: 0, soAviso: 0, amostra: [] } };
          try {
            const col = WPP.whatsapp.MsgStore, lista = col.getModelsArray ? col.getModelsArray() : (col.models || []);
            for (const m of lista) {
              o.varridas++; const tp = String(m.type || '?'); o.tipos[tp] = (o.tipos[tp] || 0) + 1;
              if (!(m.isViewOnce === true || m.viewOnce === true || /view_?once/i.test(tp) || /view_?once/i.test(String(m.subtype || '')))) continue;
              const tem = !!(m.mediaKey || m.directPath || m.filehash || m.encFilehash); o.viewOnce.total++; if (tem) o.viewOnce.comArquivo++; else o.viewOnce.soAviso++;
              if (o.viewOnce.amostra.length < 12) o.viewOnce.amostra.push({ tipo: tp, subtipo: String(m.subtype || '').slice(0, 30), minha: !!m.id?.fromMe, temChave: !!m.mediaKey, temCaminho: !!m.directPath, temHash: !!(m.filehash || m.encFilehash), horas: Math.round((Date.now() / 1000 - (m.t || 0)) / 3600) });
            }
            o.tipos = Object.fromEntries(Object.entries(o.tipos).sort((x, y) => y[1] - x[1]).slice(0, 40));
          } catch (e) { o.erro = String(e?.message || e).slice(0, 80); }
          return o;
        })(),
        statusExports: (() => { try { return statusExports(); } catch { return null; } })(),
        limites: (() => { try { return api.limitesWA(); } catch { return null; } })(),
        recursos: recursosInternos(),
        tela: { testids: conta('[data-testid]', 'data-testid'), icones: conta('[data-icon]', 'data-icon'), temMain: !!document.getElementById('main'), temSide: !!document.getElementById('side') },
      };
    },
    // Testes ao vivo que não alteram nada (usados pelo autodiagnóstico). Cada um devolve {ok, d}.
    probe: async () => {
      const out = {};
      const t = async (k, fn) => {
        try { out[k] = { ok: true, d: String((await fn()) ?? '') }; }
        catch (e) { out[k] = { ok: false, d: e?.message || String(e) }; }
      };
      const myStatus = async () => WPP.whatsapp.StatusV3Store?.getMyStatus?.() || (await WPP.status.getMyStatus());
      await t('listaConversas', async () => (await WPP.chat.list()).length + ' conversas');
      await t('conversaAtiva', async () => {
        const c = WPP.chat.getActiveChat();
        if (!c) return 'nenhuma aberta';
        const f = await WPP.chat.find(c.id._serialized);
        if (!f) throw new Error('chat.find não achou a conversa aberta');
        return f.id._serialized;
      });
      await t('fixarLocal', async () => {
        const c = WPP.chat.getActiveChat() || (await WPP.chat.list())[0];
        if (!c) return 'sem conversas para testar';
        if (!('pin' in c) && !('__x_pin' in c)) throw new Error('o modelo de conversa não tem mais o campo pin');
        return 'campo pin presente';
      });
      await t('meusStatus', async () => {
        const st = await myStatus();
        const ms = st?.msgs?.getModelsArray?.() || st?.msgs?._models || [];
        if (!st) return 'sem status hoje';
        const acks = ms.map((m) => m.ack ?? '?').join(',');
        const velhos = ms.filter((m) => (m.t || 0) < Date.now() / 1000 - 86400).length;
        // com arquivo no WhatsApp? (status "fantasma" costuma não ter) e quantos voltaram depois de apagados
        const cheios = await Promise.all(ms.map(async (m) => (await Promise.resolve().then(() => WPP.chat.getMessageById(m.id._serialized)).catch(() => null)) || m));
        const arq = cheios.map((m) => (m.type === 'chat' ? 'texto' : (m.directPath || m.mediaKey || m.filehash) ? 'com-arquivo' : 'SEM-ARQUIVO')).join(',');
        const tomb = lerTomb(), voltaram = ms.filter((m) => tomb[m.id._serialized]).length;
        return `${ms.length} na lista local · ack: [${acks}] (≥1 = chegou ao servidor) · arquivo: [${arq}]${voltaram ? ` · ${voltaram} VOLTARAM depois de apagados` : ''}${velhos ? ` · ${velhos} vencidos` : ''}`;
      });
      await t('apagarStatus', async () => {
        if (!WPP.whatsapp.StatusV3Store?.getMyStatus) throw new Error('StatusV3Store.getMyStatus não encontrado');
        const mt = (await metodosApagar(await myStatus())).map((x) => x.nome);
        const salvo = viaSalva();
        if (typeof WPP.whatsapp?.Cmd?.sendRevokeMsgs !== 'function' && !findRevoke()) throw new Error('nenhuma função de revogar nesta versão. Candidatos: ' + (revokeCandidatos().join(' | ') || 'nenhum'));
        return salvo ? `funcionou da última vez via ${salvo}` : `${mt.length} caminhos para tentar (${mt.join(' → ')}); confirma no primeiro uso`;
      });
      await t('etiquetas', async () => (isBiz() ? (await WPP.labels.getAllLabels()).length + ' etiquetas' : 'conta não Business'));
      await t('tema', async () => {
        if (typeof WPP.conn.getTheme !== 'function') throw new Error('conn.getTheme não encontrado');
        return 'atual: ' + WPP.conn.getTheme();
      });
      await t('recursos', async () => {
        const r = recursosInternos();
        if (r[0]?.erro) throw new Error(r[0].erro);
        const off = r.filter((x) => x.valor === false || x.valor === 0 || x.valor === 'false').length;
        return `${r.length} chaves de recurso · ${off} desligadas (lista completa no "Gerar mapa do WhatsApp")`;
      });
      await t('meuId', async () => {
        const id = WPP.conn.getMyUserId?.();
        if (!id) throw new Error('não foi possível ler o próprio usuário');
        return 'ok';
      });
      return out;
    },
    labels: async () => {
      try {
        if (!isBiz()) return [];
        return (await WPP.labels.getAllLabels()).map((l) => ({ id: l.id, name: l.name, color: l.hexColor }));
      } catch { return []; }
    },
    label: async (id, labelId, type) => { await WPP.labels.addOrRemoveLabels([id], [{ labelId, type }]); return true; },
  };

  window.addEventListener('message', async (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.__az !== 1 || d.kind !== 'req') return;
    if (d.tk && !tkOk) tkOk = String(d.tk);
    const confiavel = !!d.tk && String(d.tk) === tkOk;
    if (!confiavel) externas++;
    auditoria.push({ t: Date.now(), m: String(d.method).slice(0, 40), ok: confiavel }); if (auditoria.length > 100) auditoria.shift();
    if (!confiavel && SENSIVEIS.has(d.method)) { recusadas++; return post({ kind: 'res', id: d.id, error: 'recusado: pedido sem a chave do painel (' + d.method + ')' }); }
    const fn = api[d.method];
    if (!fn) return post({ kind: 'res', id: d.id, error: 'método desconhecido: ' + d.method });
    try {
      const result = await fn(...(d.args || []));
      post({ kind: 'res', id: d.id, result });
    } catch (err) {
      post({ kind: 'res', id: d.id, error: err?.message || String(err) });
    }
  });

  const announce = () => {
    ls.del(LAB_BOOT); // chegou a ficar pronto: a abertura deu certo
    post({ kind: 'evt', type: 'ready' });
    WPP.on('chat.active_chat', (c) => post({ kind: 'evt', type: 'active_chat', chat: c ? info(c) : null }));
    // v1.22 — mensagens novas (só com o Atendente ligado; nunca de grupos, status ou canais; só dados mínimos)
    // v1.33.1 — grupos: a mensagem nova faz o WhatsApp reinserir o grupo na lista; reaplica o filtro logo depois (antes só no próximo tique de 1 s: o grupo "piscava")
    const reafirmaGrupos = (msg) => {
      const GS = window.__azGS;
      if (!GS?.mod || !GS.esconde?.({ id: { isGroup: () => true } }) || !/@g\.us$/.test(sid(msg?.id?.remote) || '')) return;
      clearTimeout(GS.tm); GS.tm = setTimeout(() => { try { WPP.whatsapp.ChatStore.trigger('sort'); } catch { /* sem ChatStore */ } }, 80);
    };
    WPP.on('chat.new_message', (msg) => {
      try { reafirmaGrupos(msg); } catch { /* mensagem estranha: ignora */ }
      try {
        if (!window.__azAtend || !msg || msg.isNewMsg === false) return;
        const id = msg.id, chatId = sid(id?.remote);
        if (!chatId || /@(g\.us|broadcast|newsletter)$/.test(chatId)) return;
        const tipo = msg.type, corpo = tipo === 'chat' ? msg.body : (msg.caption || '');
        post({ kind: 'evt', type: 'new_message', chatId, fromMe: !!id?.fromMe, tipo, body: String(corpo || '').slice(0, 1500), t: msg.t || Math.floor(Date.now() / 1000) });
      } catch { /* mensagem estranha: ignora */ }
    });
    // v1.44 — alguém LIGOU: só avisa o painel (ele decide); desligado, não faz nada. Nunca atende nem rejeita a chamada.
    WPP.on('call.incoming_call', (ev) => {
      if (!window.__azLigacao || !ev) return;
      try {
        const chatId = sid(ev.sender) || (typeof ev.peerJid === 'string' ? ev.peerJid : sid(ev.peerJid)) || '';
        post({ kind: 'evt', type: 'ligacao', chatId, isGroup: !!ev.isGroup, isVideo: !!ev.isVideo, offerTime: Number(ev.offerTime) || Math.floor(Date.now() / 1000) });
      } catch { /* evento estranho: ignora */ }
    });
    // v1.38 — "Recuperar apagadas". A wa-js emite chat.msg_revoke ANTES de o WhatsApp aplicar o apagar: neste instante a mensagem original ainda está inteira na memória.
    // Tiramos uma "foto" dela (texto, legenda, miniatura) SÍNCRONA e só se a função estiver ligada; a foto/áudio inteiro é tentado depois, se permitido (pode falhar: aí fica a miniatura).
    WPP.on('chat.msg_revoke', (ev) => {
      const cfg = window.__azRecuperar; if (!cfg || !ev) return;
      try {
        if (ev.id?.fromMe) return;                                              // fui eu que apaguei
        const refId = sid(ev.refId) || (typeof ev.refId === 'string' ? ev.refId : '');
        let m = null; try { m = refId ? WPP.whatsapp.MsgStore.get(refId) : null; } catch { m = null; }
        const chatId = sid(m?.id?.remote) || sid(ev.from) || '';
        let chatNome = ''; try { const c = chatId ? WPP.whatsapp.ChatStore.get(chatId) : null; chatNome = c ? info(c).name : ''; } catch { chatNome = ''; }
        const grupo = /@g\.us$/.test(chatId), tipo = m?.type || '';
        const midiaTipo = ['image', 'video', 'sticker'].includes(tipo);
        const snap = { id: refId || String(ev.id?._serialized || ''), chatId, chatNome, grupo, existe: !!m, tipo, t: m?.t || 0,
          texto: m ? String(tipo === 'chat' ? (m.body || '') : (m.caption || '')).slice(0, 4000) : '', thumb: m && midiaTipo ? String(m.body || '').slice(0, 60000) : '',
          mime: m?.mimetype || '', nome: m?.filename || '', dur: Number(m?.duration) || 0, viewOnce: !!(m && (m.isViewOnce === true || m.viewOnce === true)),
          deNome: String(m?.senderObj?.pushname || m?.senderObj?.formattedName || m?.notifyName || (grupo ? '' : chatNome) || '').slice(0, 80) };
        post({ kind: 'evt', type: 'msg_apagada', snap, ev: { fromMe: false, tipo: ev.type } });
        if (cfg.midia && m && !snap.viewOnce && ['image', 'ptt', 'audio'].includes(tipo) && refId && (grupo ? cfg.grupos : true)) {
          (async () => {
            try {
              const blob = await WPP.chat.downloadMedia(refId); if (!blob || blob.size > cfg.maxBytes) return;
              const bytes = new Uint8Array(await blob.arrayBuffer()); let bin = '';
              for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
              post({ kind: 'evt', type: 'msg_apagada_midia', id: snap.id, midia: { mime: blob.type || m.mimetype || (tipo === 'image' ? 'image/jpeg' : 'audio/ogg'), b64: btoa(bin) } });
            } catch { /* o WhatsApp já descartou o arquivo: fica só a miniatura/texto */ }
          })();
        }
      } catch { /* evento estranho: ignora */ }
    });
  };
  // A wa-js 4.x expõe WPP.loader (versões antigas: WPP.webpack). Espera ficar pronta e avisa.
  let announced = false;
  const boot = setInterval(() => {
    if (!window.WPP || announced || !isReady()) return;
    announced = true;
    clearInterval(boot);
    announce();
  }, 500);
})();
