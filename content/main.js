// AtendeZap — content script (mundo isolado). UI em Shadow DOM + ponte com a wa-js (page/bridge.js).
(() => {
  // Janela extra do WhatsApp (ligação em "Mover para nova janela"): foi aberta pela janela principal.
  // Lá não tem lista de conversas nem a wa-js funciona: a extensão não faz nada.
  try { if (window.opener && window.opener.location.host === location.host) return; } catch {}
  if (window.__atendezap) return;
  window.__atendezap = true;

  // Extensão atualizada/recarregada: esta cópia antiga fica órfã na página aberta e todo chrome.* lança
  // "Extension context invalidated" (vira erro em chrome://extensions). Para em silêncio e tira o painel.
  const vivo = () => { try { return !!chrome.runtime?.id; } catch { return false; } };
  const orfa = () => { for (const id of ['az-panel', 'az-pop', 'az-head']) document.getElementById(id)?.remove(); document.body.classList.remove('az-docked'); };
  const setInterval = (fn, ms) => { const id = window.setInterval(() => { if (!vivo()) { window.clearInterval(id); return orfa(); } fn(); }, ms); return id; };
  addEventListener('unhandledrejection', (e) => { if (/Extension context invalidated/.test(e.reason?.message || '')) { e.preventDefault(); orfa(); } });

  const U = globalThis.AZU;
  const W = globalThis.AZW; // importação de backups do waTidy
  const MEDIA_LIMIT = 50;
  const PANEL_W = 420; // largura padrão (px); dá para mudar em Configurações › Posição do painel (ui.larg)
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- Estado + storage ----------
  const KEYS = {
    respostasRapidas: 'replies', categorias: 'cats', assinatura: 'sig',
    pinChat: 'pins', backupAutomatico: 'backup', loteDestinos: 'loteDest', conversasOcultas: 'ocultas', modulos: 'mods', listaCargasUrl: 'cargasUrl', vagasCfg: 'vagasCfg', iaCfg: 'iaCfg', iaUso: 'iaUso', atendCfg: 'atendCfg', atendEst: 'atendEst', atendLog: 'atendLog', atendSug: 'atendSug', memFatos: 'memFatos', memSug: 'memSug', memDemanda: 'memDemanda', memPerfis: 'memPerfis', memFila: 'memFila', memPend: 'memPend', atendVida: 'atendVida', memTempos: 'memTempos', iaChaveEstado: 'iaChaveEstado', gruposSoCfg: 'gruposSoCfg', acessoCfg: 'acessoCfg', acessoEstado: 'acessoEstado', acessoAplicado: 'acessoAplicado', acessoExigir: 'acessoExigir', recuperarCfg: 'recuperarCfg', recuperarVisto: 'recuperarVisto', conhecCfg: 'conhecCfg', conhecBanco: 'conhecBanco', conhecVistos: 'conhecVistos', conhecEstado: 'conhecEstado', atendEnv: 'atendEnv', ligCfg: 'ligCfg', ligEstado: 'ligEstado', resumoAceitou: 'resumoAceitou', avCfg: 'avCfg', avUltimo: 'avUltimo', comecarOculto: 'comecarOculto', instId: 'instId', arqFora: 'arqFora',
    pinAbas: 'pinAbas', gruposUnicos: 'unicos', // v1.12: aba de cada fixada · conjuntos de grupos "sem duplicar"
  };
  const SIG_DEFAULT = { ativo: false, nome: '', estilo: 'negrito', posicao: 'linha' };
  const S = {
    replies: [], cats: [], sig: { ...SIG_DEFAULT }, pins: [], loteDest: [], ocultas: [], mods: {}, cargasUrl: '', pinAbas: {}, unicos: [], vagasCfg: { ate: 0 }, iaCfg: { chave: '', modelo: '', limiteDia: 100 }, iaUso: {}, atendCfg: {}, atendEst: {}, atendLog: [], atendSug: [], memFatos: [], memSug: [], memDemanda: [], memPerfis: {}, memFila: [], memPend: {}, atendVida: {}, memTempos: [], iaChaveEstado: {}, gruposSoCfg: { janela: 'escolher' }, acessoCfg: {}, acessoEstado: null, acessoAplicado: {}, acessoExigir: globalThis.AZACESSO.EXIGIR_CONVITE, recuperarCfg: globalThis.AZREC.cfgPadrao(), recuperarVisto: 0, conhecCfg: { ligado: false, aceitou: false, intervaloMin: 60, auto: true, aprovacao: 'manual', minVezes: 3 }, conhecBanco: [], conhecVistos: [], conhecEstado: {}, atendEnv: [], ligCfg: globalThis.AZLIG.cfgPadrao(), ligEstado: { ult: {}, enviadas: 0, motivo: '' }, resumoAceitou: false, avCfg: { auto: false }, avUltimo: null, comecarOculto: false, instId: '', arqFora: null,
    backup: { ativo: true, recorrencia: 'diario', hora: '10:30', ultimo: null },
    ready: false, active: null, labels: [],
  };
  // Salvar nunca falha em silêncio: erro de gravação (disco cheio, extensão recarregada) vai para o registro de erros e avisa uma vez.
  const falhaSalvar = (e) => { logErr('gravar', e?.message || String(e)); if (!falhaSalvar.avisou && !String(e?.message || '').includes('context invalidated')) { falhaSalvar.avisou = true; toast('Não consegui gravar suas configurações (' + (e?.message || 'erro') + '). Faça um backup agora em Configurações › Backup.', 10000); } };
  const save = (key) => { try { return Promise.resolve(chrome.storage.local.set({ [key]: S[KEYS[key]] })).catch(falhaSalvar); } catch (e) { falhaSalvar(e); return Promise.resolve(); } };
  async function load() {
    const d = await chrome.storage.local.get(Object.keys(KEYS));
    for (const [k, p] of Object.entries(KEYS)) if (d[k] !== undefined) S[p] = d[k];
    S.sig = { ...SIG_DEFAULT, ...S.sig };
    lote.sel = new Map(S.loteDest || []);
    esconderLinhas(); // já na abertura: o CSS esconde a faixa "Arquivadas" com o valor guardado, antes de o WhatsApp desenhar a lista
  }
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    let hit = false;
    for (const [k, p] of Object.entries(KEYS)) if (k in ch) { S[p] = ch[k].newValue ?? S[p]; hit = true; }
    if (!hit) return;
    S.sig = { ...SIG_DEFAULT, ...S.sig };
    if ('pinChat' in ch || 'pinAbas' in ch) applyPins();
    if ('conversasOcultas' in ch) esconderLinhas();
    if ('modulos' in ch) { esconderLinhas(); closePop(); renderHead(); renderPanel(); }
    if ('loteDestinos' in ch) lote.sel = new Map(S.loteDest || []);
    if (Object.keys(ch).every((k) => k === 'atendVida')) return; // batimento do robô: só guarda, não redesenha
    if (Object.keys(ch).every((k) => ['atendEst', 'atendLog', 'iaUso'].includes(k)) && panelRoot.activeElement?.matches?.('input, textarea, select')) return; // gravação em segundo plano: não derruba o que você digita
    if ('atendCfg' in ch) atendMigrar();
    if ('atendCfg' in ch || 'iaCfg' in ch || 'modulos' in ch) atendSincronizar(); // liga/desliga a escuta de mensagens novas na ponte
    renderHead();
    if (!view.editing) renderPanel();
  });

  // Painel aberto/recolhido e aba atual (só conveniência deste navegador)
  const ui = (() => { try { return JSON.parse(localStorage.getItem('az-ui')) || {}; } catch { return {}; } })();
  if (!ui.sec || ui.sec === 'tabs') ui.sec = 'replies';
  ui.open = false; // sempre começa recolhido ao carregar o WhatsApp (Alt+Z ou a aba na borda abrem)
  const painelW = () => Math.max(320, Math.min(640, Math.round(Number(ui.larg)) || PANEL_W));
  const saveUi = () => { try { localStorage.setItem('az-ui', JSON.stringify(ui)); } catch {} };

  // ---------- Ponte com a página (wa-js) ----------
  let seq = 0;
  const pending = new Map();
  // Últimos erros (aparecem no Diagnóstico e no relatório)
  const LOG = [];
  // v1.15 — medidor do custo do próprio AtendeZap (só contagens e tempos, nenhum dado): quanto cada rotina periódica consome
  const PERF = {}, PERF_T0 = performance.now();
  const T = (nome, fn) => (...a) => {
    const t0 = performance.now();
    const fim = () => { const d = performance.now() - t0, p = (PERF[nome] ||= { n: 0, ms: 0, max: 0 }); p.n++; p.ms += d; if (d > p.max) p.max = d; };
    try { const r = fn(...a); if (r && typeof r.then === 'function') return r.finally(fim); fim(); return r; } catch (e) { fim(); throw e; }
  };
  const logErr = (onde, msg) => {
    LOG.unshift({ t: new Date().toLocaleTimeString('pt-BR'), onde, msg: String(msg).slice(0, 300) });
    LOG.length = Math.min(LOG.length, 30);
    // 3 erros desde o último autoteste => roda o autodiagnóstico (o WhatsApp pode ter mudado)
    if (onde !== 'autoDiag' && typeof AUTO !== 'undefined' && ++AUTO.errosDesde === 3) setTimeout(() => autoDiag('erros seguidos'), 2000);
  };
  window.addEventListener('error', (e) => logErr('script', e.message));
  window.addEventListener('unhandledrejection', (e) => logErr('promessa', e.reason?.message || e.reason));
  const AZ_TK = Array.from(crypto.getRandomValues(new Uint8Array(12)), (x) => x.toString(16).padStart(2, '0')).join(''); // chave do painel (a ponte recusa pedidos que enviam/bloqueiam/removem sem ela)
  const PONTE = {};   // v1.47: por método da ponte: quantas chamadas, quantos erros e quanto tempo levaram (vai para o pacote de diagnóstico)
  const ponteReg = (m, ms, erro) => { const x = (PONTE[m] ||= { n: 0, erros: 0, ms: 0, max: 0 }); x.n++; if (erro) x.erros++; x.ms += ms; if (ms > x.max) x.max = ms; };
  const call = (method, ...args) => new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej, method, t0: performance.now() });
    window.postMessage({ __az: 1, kind: 'req', id, method, args, tk: AZ_TK }, location.origin);
  });
  window.addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.__az !== 1) return;
    if (d.kind === 'res') {
      const p = pending.get(d.id);
      if (!p) return;
      pending.delete(d.id); ponteReg(p.method, performance.now() - (p.t0 || performance.now()), !!d.error);
      if (d.error) { logErr(p.method, d.error); p.rej(new Error(d.error)); } else p.res(d.result);
    } else if (d.kind === 'evt') {
      if (d.type === 'ready') setReady();
      if (d.type === 'new_message') atendNovaMsg(d);
      if (d.type === 'msg_apagada') recuperarRecebeu(d);
      if (d.type === 'ligacao') ligacaoRecebeu(d);
      if (d.type === 'msg_apagada_midia') recuperarRecebeuMidia(d);
      if (d.type === 'active_chat') {
        S.active = d.chat; renderHead();
        if (d.chat && !AUTO.primeiraConversa) { AUTO.primeiraConversa = true; setTimeout(() => autoDiag('primeira conversa aberta'), 3000); }
      }
    }
  });
  async function setReady() {
    if (S.ready) return;
    S.ready = true;
    S.active = await call('activeChat').catch(() => null);
    S.labels = await call('labels').catch(() => []);
    atendSincronizar(); recuperarSincronizar(); setInterval(() => { recSync.ult = ''; ligSync.ult = null; recuperarSincronizar(); }, 60000); setTimeout(() => conhecEscutar(false), 90000); setInterval(() => conhecEscutar(false), 10 * 60000); setTimeout(avAuto, 150000); setInterval(avAuto, 15 * 60000); setTimeout(() => { recuperarPurgar(); recuperarCarregar(true); }, 4000); setInterval(recuperarPurgar, 30 * 60000);
    applyPins();
    renderPanel(); renderHead();
    if (acessoEf().login) openPanel('config'); // equipe: o painel já abre na tela de acesso para entrar primeiro
    garantirOcultas(); // antes só rodava 20 s depois: a faixa "Arquivadas" ficava aparecendo nesse tempo
    checkBackup();
    atendMigrar(); atendBatida(); setInterval(atendBatida, 60000);
    acessoCiclo(); setInterval(acessoCiclo, 30000);
    setTimeout(() => autoDiag('WhatsApp aberto'), 8000);
    setInterval(() => autoDiag('periódico (30 min)'), 30 * 60000);
  }
  let lastPins = [];
  // Partes que o usuário pode desligar em Configurações (desligada = some do painel e para de agir)
  // ----- Acesso da equipe (v1.34): o administrador libera, bloqueia e limita. Sem convite, a extensão funciona livremente, como sempre. -----
  const AC = globalThis.AZACESSO;
  let acessoMemo = { k: null, c: null, t: 0, ef: null };
  function acessoEf() { // situação de acesso AGORA (com um pequeno cache: ligado() é chamado o tempo todo)
    const agora = Date.now();
    if (acessoMemo.k === S.acessoEstado && acessoMemo.c === S.acessoCfg && acessoMemo.x === S.acessoExigir && agora - acessoMemo.t < 5000) return acessoMemo.ef;
    const ef = AC.avaliar(S.acessoCfg?.codigo ? S.acessoCfg : null, S.acessoEstado, agora, S.acessoExigir !== false); acessoMemo = { k: S.acessoEstado, c: S.acessoCfg, x: S.acessoExigir, t: agora, ef }; return ef;
  }
  const ligado = (k) => {
    if (k === 'gruposAj') return ligado('vagas') || ligado('gruposSo');   // abas novas = chaves que já existiam (a planilha não muda)
    const m = k === 'unicos' ? 'pedidos' : k === 'memoria' ? 'atendente' : k === 'frete' ? 'cargas' : k === 'limites' ? 'cfgLimites' : k === 'iaenvios' ? 'diag' : k, ef = acessoEf();
    return AC.liberado(ef, m, S.mods?.[m]);
  };
  // v1.12 — fixada por aba: cada conversa pode valer só em uma aba da lista (Todas | Não lidas | Favoritas | Grupos).
  // Só sobe ao topo enquanto aquela aba está ativa; ao trocar de aba, a reaplicação tira/põe sozinha. Sem as abas na tela
  // (abaAtual = null) aplica tudo, para a fixação nunca sumir.
  // As abas da lista são botões data-testid="filter-button" (confirmado no mapa do WhatsApp 2.3000.10506x). A aba ativa vem marcada
  // por aria-selected/aria-pressed/aria-current/aria-checked; sem nenhuma marca legível devolve null (aplica tudo).
  const SEL_ABAS = '[data-testid="filter-button"], [id$="-filter"], [role="tab"], button[aria-pressed]';
  const marcada = (el) => ['aria-selected', 'aria-pressed', 'aria-current', 'aria-checked'].some((a) => el.getAttribute(a) === 'true');
  function abaAtual() {
    const side = document.getElementById('side'); if (!side) return null;
    for (const el of side.querySelectorAll(SEL_ABAS)) {
      if (el.closest('#pane-side')) continue;
      const a = U.abaDe(el.id, el.textContent); if (!a) continue;
      if (marcada(el)) return a;
    }
    return null;
  }
  // só para o Diagnóstico: o que cada botão de aba mostra (texto e atributos aria), sem nada de conversas
  const descAbas = () => {
    const side = document.getElementById('side'); if (!side) return 'sem #side';
    const l = [...side.querySelectorAll(SEL_ABAS)].filter((el) => !el.closest('#pane-side') && U.abaDe(el.id, el.textContent));
    return l.length ? l.map((el) => `${String(el.textContent).trim().slice(0, 14)}[${['aria-selected', 'aria-pressed', 'aria-current', 'aria-checked'].filter((a) => el.hasAttribute(a)).map((a) => a.slice(5) + '=' + el.getAttribute(a)).join(',') || 'sem aria'}]`).join(' ') : 'nenhum botão de aba reconhecido';
  };
  const applyPins = () => {
    if (!S.ready || !ligado('pins')) return;
    const ativos = U.pinsAtivos(S.pins, S.pinAbas, abaAtual());
    const removed = lastPins.filter((id) => !ativos.includes(id));
    lastPins = [...ativos];
    call('applyPins', ativos, removed).catch(() => {});
  };
  // v1.20 — "Grupos só na aba Grupos": a ponte esconde grupos na lista (pelo próprio filtro do WhatsApp, sem buracos) quando a aba é
  // Tudo/Não lidas/Favoritas. Aqui só dizemos a ela em que estado estamos: ligado, aba atual e se há texto na busca (na busca, mostra tudo).
  const SEL_JANELA = '[role="dialog"], [aria-modal="true"], [data-animate-modal-popup]';
  // Janela "de verdade" (Encaminhar…): visível E (modal OU grande). Avisos, dicas e menus do WhatsApp também usam role="dialog" por instantes e NÃO podem
  // ligar/desligar o filtro (era o que fazia os grupos aparecerem e sumirem na aba Tudo).
  const janelaReal = (j) => {
    if (j.closest('#az-panel, #az-pop, #az-head') || j.getAttribute('aria-hidden') === 'true') return false;
    const r = j.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
    return j.getAttribute('aria-modal') === 'true' || r.width * r.height >= 0.1 * innerWidth * innerHeight;
  };
  const janelaDesc = (j) => ({ rotulo: j.getAttribute('aria-label') || '', texto: String(j.querySelector('h1, h2, h3, [role="heading"]')?.textContent || j.textContent || '').trim().slice(0, 60),
    caixas: j.querySelectorAll('input[type="checkbox"], [role="checkbox"]').length, opcoes: j.querySelectorAll('[role="option"], [role="listbox"]').length,
    celulas: j.querySelectorAll('[data-testid="cell-frame-container"], [data-testid^="list-item-"]').length });
  const emBusca = () => { // "pausa": texto na busca OU uma janela de verdade aberta há mais de 0,7 s, onde o grupo tem de aparecer
    const box = document.querySelector('#side [data-testid="chat-list-search-container"]');
    const el = box?.querySelector('[contenteditable], input, textarea');
    if (el && String(el.value ?? el.textContent ?? '').trim().length > 0) return true;
    const modo = S.gruposSoCfg?.janela || 'escolher'; let motivo = '';
    for (const j of [...document.querySelectorAll(SEL_JANELA)].filter(janelaReal)) {
      const d = janelaDesc(j), m = modo === 'nunca' ? '' : modo === 'qualquer' ? 'opção: qualquer janela grande' : U.janelaEscolheConversa(d);
      gs.ultJanela = { rotulo: (d.rotulo || d.texto).slice(0, 40), pausa: m || 'não (janela de informação)', modo, t: Date.now() }; // só para o Diagnóstico
      if (m) { motivo = m; break; }
    }
    if (!motivo) { gs.janelaDesde = 0; return false; }
    if (!gs.janelaDesde) { gs.janelaDesde = Date.now(); setTimeout(syncGruposSo, 760); } // só conta depois de ~0,7 s aberta
    return Date.now() - gs.janelaDesde >= 700;
  };
  const gs = { visto: '', estado: null, aba: null, janelaDesde: 0, rea: { n: 0, t: 0 } };
  const barraDeAbas = () => { const side = document.getElementById('side'); return !!side && [...side.querySelectorAll(SEL_ABAS)].some((el) => !el.closest('#pane-side') && U.abaDe(el.id, el.textContent)); };
  function syncGruposSo(forcar) {
    if (!S.ready) return;
    const est = U.abaEstavel(abaAtual(), barraDeAbas(), gs.aba, Date.now()); gs.aba = est.ult; // aba "ilegível" por um instante não desliga o filtro
    const cfg = { ligado: ligado('gruposSo'), aba: est.aba, busca: emBusca() }, sig = JSON.stringify(cfg);
    if (!forcar && sig === gs.visto) return;
    gs.visto = sig; gs.cfg = cfg;
    call('gruposSo', cfg).then((r) => { gs.estado = r; }).catch((e) => { gs.visto = ''; gs.estado = { ok: false, motivo: e.message }; }); // falhou: tenta de novo no próximo ciclo
  }
  // Rede de segurança: com a regra ativa, se ainda há linha de GRUPO na lista (o WhatsApp reinseriu por um caminho que o filtro não pegou), manda reaplicar: o grupo
  // some em segundos em vez de ficar até a próxima mudança. Depois de 3 tentativas seguidas sem efeito desiste por 30 s (nada de laço infinito).
  function gruposReafirmar() {
    const c = gs.cfg;
    if (!S.ready || !c?.ligado || c.busca || !['todas', 'naolidas', 'favoritas'].includes(c.aba)) { gs.rea.n = 0; return; }
    if (!document.querySelector('#pane-side [data-az-chat$="@g.us"]')) { gs.rea.n = 0; return; }
    if (gs.rea.n >= 3) { if (Date.now() - gs.rea.t < 30000) return; gs.rea.n = 0; }
    gs.rea.n++; gs.rea.t = Date.now(); syncGruposSo(true);
  }
  let abaVista;
  const vigiaAba = () => { const a = abaAtual(); if (a !== abaVista) { abaVista = a; applyPins(); } syncGruposSo(); gruposReafirmar(); };
  document.addEventListener('click', (e) => { if (e.target?.closest?.('#side')) { setTimeout(syncGruposSo, 0); setTimeout(vigiaAba, 250); } }, true);
  for (const ev of ['input', 'keyup']) document.addEventListener(ev, (e) => { if (e.target?.closest?.('#side [data-testid="chat-list-search-container"]')) setTimeout(syncGruposSo, 0); }, true);
  setInterval(vigiaAba, 1500);

  // ---------- Helpers de DOM ----------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const c of kids.flat(Infinity)) if (c != null && c !== false && c !== '') el.append(c.nodeType ? c : String(c));
    for (const [k, v] of Object.entries(props || {})) {
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'value') el.value = v ?? '';
      else if (k === 'checked' || k === 'selected' || k === 'disabled') el[k] = !!v;
      else if (v != null && v !== false) el.setAttribute(k, v === true ? '' : v);
    }
    if (props?.title && !props['aria-label'] && tag === 'button') el.setAttribute('aria-label', props.title); // botão só com ícone: o leitor de tela lê o title
    if (typeof props?.class === 'string' && /(^| )link( |$)/.test(props.class) && props.onclick && !/^(button|a|input)$/.test(tag)) { // "link" feito de span/div: acessível pelo teclado
      el.setAttribute('tabindex', '0'); el.setAttribute('role', 'button');
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
    }
    return el;
  }
  // Ícones de linha (24x24)
  const ICONS = {
    zap: [['polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' }]],
    pen: [['path', { d: 'M12 20h9' }], ['path', { d: 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z' }]],
    chat: [['path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }], ['path', { d: 'M12 7v6M9 10h6' }]],
    save: [['path', { d: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z' }], ['path', { d: 'M17 21v-8H7v8M7 3v5h8' }]],
    pin: [['path', { d: 'M12 17v5' }], ['path', { d: 'M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.8a2 2 0 0 0-1.1-1.8l-1.8-.9A2 2 0 0 1 15 10.8V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z' }]],
    x: [['path', { d: 'M18 6 6 18M6 6l12 12' }]],
    users: [['path', { d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' }], ['circle', { cx: 9, cy: 7, r: 4 }], ['path', { d: 'M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' }]],
    right: [['path', { d: 'm9 18 6-6-6-6' }]],
    left: [['path', { d: 'm15 18-6-6 6-6' }]],
    down: [['path', { d: 'm6 9 6 6 6-6' }]],
    up: [['path', { d: 'm18 15-6-6-6 6' }]],
    truck: [['path', { d: 'M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14' }], ['circle', { cx: 17, cy: 18, r: 2 }], ['circle', { cx: 7, cy: 18, r: 2 }]],
    gear: [['circle', { cx: 12, cy: 12, r: 3 }], ['path', { d: 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' }]],
    eye: [['path', { d: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z' }], ['circle', { cx: 12, cy: 12, r: 3 }]],
    clock: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'M12 6v6l4 2' }]],
    eyeoff: [['path', { d: 'M10.7 5.1A10.7 10.7 0 0 1 12 5c7 0 10 7 10 7a13.2 13.2 0 0 1-1.7 2.7M6.6 6.6A13.5 13.5 0 0 0 2 12s3 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20' }]],
    send: [['path', { d: 'm22 2-7 20-4-9-9-4Z' }], ['path', { d: 'M22 2 11 13' }]],
    dots: [['circle', { cx: 5, cy: 12, r: 1.3 }], ['circle', { cx: 12, cy: 12, r: 1.3 }], ['circle', { cx: 19, cy: 12, r: 1.3 }]],
    back: [['path', { d: 'M9 14 4 9l5-5' }], ['path', { d: 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11' }]],
    trash: [['path', { d: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }]],
    search: [['circle', { cx: 11, cy: 11, r: 7 }], ['path', { d: 'm21 21-4.3-4.3' }]],
    shapes: [['path', { d: 'M8.3 10a.7.7 0 0 1-.6-1L11.4 3a.7.7 0 0 1 1.2 0L16.3 9a.7.7 0 0 1-.6 1z' }], ['rect', { x: 3, y: 14, width: 7, height: 7, rx: 1 }], ['circle', { cx: 17.5, cy: 17.5, r: 3.5 }]],
    moon: [['path', { d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' }]],
    sun: [['circle', { cx: 12, cy: 12, r: 4 }], ['path', { d: 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4' }]],
    layers: [['path', { d: 'm12 2 10 5-10 5L2 7z' }], ['path', { d: 'm2 17 10 5 10-5' }], ['path', { d: 'm2 12 10 5 10-5' }]],
    pulse: [['path', { d: 'M22 12h-4l-3 9L9 3l-3 9H2' }]],
    download: [['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }], ['path', { d: 'M7 10l5 5 5-5' }], ['path', { d: 'M12 15V3' }]],
    wrench: [['path', { d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' }]],
    lock: [['path', { d: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z' }], ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }]],
    flask: [['path', { d: 'M9 3h6' }], ['path', { d: 'M10 3v6L4.6 19a1.6 1.6 0 0 0 1.4 2.4h12a1.6 1.6 0 0 0 1.4-2.4L14 9V3' }], ['path', { d: 'M7.5 15h9' }]],
    box: [['path', { d: 'M21 8 12 3 3 8v8l9 5 9-5z' }], ['path', { d: 'M3 8l9 5 9-5M12 13v8' }]],
  };
  function icon(name, size = 18) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: size, height: size, fill: name === 'dots' ? 'currentColor' : 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })) svg.setAttribute(k, v);
    for (const [tag, attrs] of ICONS[name]) {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      svg.append(el);
    }
    return svg;
  }
  const sheet = new CSSStyleSheet();
  fetch(chrome.runtime.getURL('content/ui.css')).then((r) => r.text()).then((t) => sheet.replaceSync(t));
  function mkHost(id) {
    const host = h('div', { id });
    const root = host.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [sheet];
    return [host, root];
  }
  const stop = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
  // ===== Diálogos próprios (v1.29) — no lugar de confirm()/prompt() do navegador, que travam a página e não combinam com o painel. =====
  // Ficam num host isolado (não somem quando o painel se redesenha, que acontece sozinho) e devolvem uma Promise:
  // confirmar → true/false; perguntar → o texto ou null (Cancelar/Esc). Esc cancela, Enter confirma (menos em texto de várias linhas), o foco volta ao que estava.
  // Os testes automáticos respondem pelo atributo data-az-dlg-next do <html> (uso único, como o "dialog" do navegador); o usuário nunca vê isso.
  let dlgHost = null, dlgRoot = null;
  function dialogo({ texto = '', titulo = '', ok = 'OK', cancelar = 'Cancelar', campo = false, valor = '', multi = false, perigo = false }) {
    const raiz = document.documentElement, um = raiz.dataset.azDlgNext, fixo = raiz.dataset.azDlgAuto;
    if (um !== undefined || fixo !== undefined) { // só nos testes: uso único (azDlgNext) ou contínuo (azDlgAuto), com registro em azDlgLog
      let o = {}; try { o = JSON.parse((um !== undefined ? um : fixo) || '{}'); } catch { /* vazio */ }
      if (um !== undefined) delete raiz.dataset.azDlgNext;
      try { const l = JSON.parse(raiz.dataset.azDlgLog || '[]'); l.push(String(texto).slice(0, 160)); raiz.dataset.azDlgLog = JSON.stringify(l); } catch { /* sem registro */ }
      const nega = o.cancelar || (o.cancelarSe && String(texto).includes(o.cancelarSe));
      return Promise.resolve(nega ? (campo ? null : false) : campo ? (o.valor ?? valor) : true);
    }
    return new Promise((fim) => {
      if (!dlgHost?.isConnected) { [dlgHost, dlgRoot] = mkHost('az-dlg'); document.body.append(dlgHost); }
      const antes = document.activeElement; let entrada = null;
      const fechar = (r) => { cx.remove(); document.removeEventListener('keydown', tecla, true); try { antes?.focus?.(); } catch { /* sem foco */ } fim(r); };
      const resposta = () => (campo ? entrada.value : true), nega = () => (campo ? null : false);
      const tecla = (e) => {
        const alvo = e.composedPath?.()[0];
        if (e.key === 'Escape') { stop(e); fechar(nega()); }
        else if (e.key === 'Enter' && alvo?.tagName !== 'TEXTAREA' && alvo?.tagName !== 'BUTTON') { stop(e); fechar(resposta()); }
      };
      const cx = h('div', { class: 'dlg-fundo', onmousedown: (e) => { if (e.target === cx) fechar(nega()); } },
        h('div', { class: 'dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo || String(texto).slice(0, 60) },
          titulo ? h('b', { class: 'dlg-t' }, titulo) : null,
          h('div', { class: 'dlg-x' }, texto),
          campo ? (entrada = (multi || String(valor).includes('\n') || String(valor).length > 70) ? h('textarea', { class: 'in', rows: 6, value: valor }) : h('input', { class: 'in', value: valor })) : null,
          h('div', { class: 'rowf dlg-b' }, cancelar ? h('button', { class: 'obtn', onclick: () => fechar(nega()) }, cancelar) : null,
            h('button', { class: perigo ? 'obtn dan' : 'gbtn sm', onclick: () => fechar(resposta()) }, ok))));
      document.addEventListener('keydown', tecla, true);
      dlgRoot.append(cx); setTimeout(() => (entrada || cx.querySelector('.gbtn, .dan'))?.focus?.(), 0);
    });
  }
  // Ações que apagam/removem ganham o botão vermelho com o verbo certo ("Apagar", "Remover"…).
  const confirmar = (texto, o = {}) => { const v = /^(Apagar|Excluir|Remover|Desfazer)/.exec(String(texto)); return dialogo({ texto, ...(v ? { perigo: true, ok: v[1] } : {}), ...o }); };
  const perguntar = (texto, valor = '', o = {}) => dialogo({ texto, campo: true, valor: String(valor ?? ''), ...o });
  // Cada elemento tem seletores alternativos; usa o primeiro que existir (o WhatsApp muda o HTML com frequência).
  // O índice que funcionou fica em SEL_HIT e aparece no Diagnóstico.
  const SEL = {
    footer: ['#main footer', 'footer', '[data-testid="conversation-compose-box"]'],
    composer: ['#main footer div[contenteditable="true"]', 'footer div[contenteditable="true"]', 'div[contenteditable="true"][data-tab="10"]',
      '#main div[role="textbox"][contenteditable="true"]', '[data-testid="conversation-compose-box-input"]'],
    header: ['#main header', '#main > header', '[data-testid="conversation-header"]'],
    send: ['button[aria-label="Enviar"]', 'button[aria-label="Send"]', '[data-testid="compose-btn-send"]', '[data-icon="wds-ic-send-filled"]',
      '[data-icon="send"]', 'span[data-icon*="send"]', 'button[aria-label*="Enviar"]'],
  };
  const SEL_HIT = {};
  function q(name, root = document) {
    for (const [i, sel] of SEL[name].entries()) {
      const el = root.querySelector(sel);
      if (el) { SEL_HIT[name] = i; return el; }
    }
    SEL_HIT[name] = -1;
    return null;
  }
  const composer = () => q('composer');
  function sendButton() {
    const f = q('footer');
    const el = f && q('send', f);
    return el?.closest('button,[role="button"]') || el;
  }
  // Texto do editor do WhatsApp (parágrafos -> \n, emojis em <img> -> alt)
  function readText(el) {
    let s = '';
    const walk = (n) => {
      if (n.nodeType === 3) s += n.nodeValue;
      else if (n.nodeName === 'IMG') s += n.alt || '';
      else if (n.nodeName === 'BR') s += '\n';
      else {
        if (n !== el && /^(P|DIV)$/.test(n.nodeName) && s && !s.endsWith('\n')) s += '\n';
        n.childNodes.forEach(walk);
      }
    };
    walk(el);
    return s.replace(/\n$/, '');
  }
  const activeChatId = async () => (S.active = await call('activeChat').catch(() => S.active))?.id;
  const looksNumber = (s) => /^\+?[\d\s()-]+$/.test(s || '');

  // ---------- Painel lateral (host principal) ----------
  const [panelHost, panelRoot] = mkHost('az-panel');
  function toast(msg, ms = 3500, acao) { // acao = { rotulo, fn }: botão dentro do aviso (ex.: "Ver")
    const t = h('div', { class: 'toast' }, msg, acao ? h('button', { class: 'tact', onclick: () => { t.remove(); acao.fn(); } }, acao.rotulo) : null);
    panelRoot.append(t);
    setTimeout(() => t.remove(), ms);
  }

  // ---------- Ações das respostas rápidas ----------
  const GROUPS = [['msg', 'Enviar Mensagem', '💬'], ['etq', 'Etiquetas', '🏷️'], ['tmp', 'Temporizadores', '⏱️'], ['util', 'Utilitários', '🧰']];
  const ACT = {
    texto: { g: 'msg', ic: '💬', nome: 'Texto', tit: 'Criar mensagem de texto' },
    imagem: { g: 'msg', ic: '🖼️', nome: 'Imagem', tit: 'Criar mensagem de imagem' },
    video: { g: 'msg', ic: '🎬', nome: 'Vídeo', tit: 'Criar mensagem de vídeo' },
    audio: { g: 'msg', ic: '🎤', nome: 'Áudio', tit: 'Criar mensagem de áudio (voz)' },
    documento: { g: 'msg', ic: '📄', nome: 'Documentos', tit: 'Criar mensagem de documento' },
    contato: { g: 'msg', ic: '👤', nome: 'Contato', tit: 'Criar mensagem de contato' },
    especial: { g: 'msg', ic: '✨', nome: 'Item especial', tit: 'Pix, localização, enquete ou convite de grupo' },
    etiquetaAdd: { g: 'etq', ic: '🏷️', nome: 'Adicionar etiqueta', tit: 'Adicionar etiqueta' },
    etiquetaRem: { g: 'etq', ic: '🏷️', nome: 'Remover etiqueta', tit: 'Remover etiqueta' },
    espera: { g: 'tmp', ic: '⏱️', nome: 'Aguardar', tit: 'Aguardar' },
    digitando: { g: 'tmp', ic: '✍️', nome: 'Mostrar "digitando…"', tit: 'Mostrar "digitando…"' },
    gravando: { g: 'tmp', ic: '🎙️', nome: 'Mostrar "gravando…"', tit: 'Mostrar "gravando áudio…"' },
    arquivar: { g: 'util', ic: '🗄️', nome: 'Arquivar contato', tit: 'Arquivar conversa' },
    desarquivar: { g: 'util', ic: '📤', nome: 'Desarquivar o contato', tit: 'Desarquivar conversa' },
    fixar: { g: 'util', ic: '📌', nome: 'Fixar conversa', tit: 'Fixar conversa' },
    desfixar: { g: 'util', ic: '📍', nome: 'Desfixar conversa', tit: 'Desfixar conversa' },
    naoLido: { g: 'util', ic: '✉️', nome: 'Marcar como não lido', tit: 'Marcar como não lido' },
    bloquear: { g: 'util', ic: '⛔', nome: 'Bloquear contato', tit: 'Bloquear contato', danger: true },
    resposta: { g: 'util', ic: '↪️', nome: 'Outra resposta rápida', tit: 'Executar outra resposta rápida' },
  };
  const SENDS = new Set(['texto', 'imagem', 'video', 'audio', 'documento', 'contato', 'especial']);
  const WA_TYPE = { imagem: 'image', video: 'video', audio: 'audio', documento: 'document' };
  const ACCEPT = { imagem: 'image/*', video: 'video/*', audio: 'audio/*', documento: '*/*' };

  // v1.14.1 — progresso do envio: no topo da conversa aparece "o que está sendo enviado · passo X/Y" com barra, contagem das esperas
  // e botão ✕ para PARAR. Vale para qualquer resposta rápida (painel, /atalho, ⚡), inclusive as que chamam outras respostas.
  const envio = { atual: null, timer: null };
  const passosDe = (r, depth = 0) => (r.acoes || []).reduce((n, a) => n + 1 + (a.tipo === 'resposta' && depth < 3
    ? passosDe(S.replies.find((x) => x.id === a.respostaId && x.id !== r.id) || { acoes: [] }, depth + 1) : 0), 0);
  // espera que mostra a contagem regressiva e pode ser interrompida pelo botão Parar
  const esperar = async (ms, e) => {
    const fim = Date.now() + ms; if (e) e.ate = fim;
    while (Date.now() < fim && !e?.parar) await sleep(Math.min(250, Math.max(1, fim - Date.now())));
    if (e) e.ate = 0;
  };
  // v1.14.3 — o progresso NÃO ocupa lugar novo no cabeçalho: o botão ⚡ vira um anel de progresso com o contador no centro
  // (segundos de espera quando está esperando) e o ✕ ao passar o mouse; clicar PARA o envio. Usa mousedown para o clique não
  // se perder se o cabeçalho for redesenhado nesse instante.
  // anel em SVG (círculo de fundo + círculo do progresso com stroke-dashoffset): sem máscara/pseudo-elemento, que se desalinhava
  function anelSvg(pct) {
    const NS = 'http://www.w3.org/2000/svg', C = 2 * Math.PI * 17, svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 40 40'); svg.setAttribute('class', 'ring');
    for (const [cls, off] of [['rt', null], ['rf', C * (1 - pct)]]) {
      const c = document.createElementNS(NS, 'circle');
      for (const [k, v] of Object.entries({ cx: 20, cy: 20, r: 17, fill: 'none', class: cls })) c.setAttribute(k, v);
      if (off != null) { c.setAttribute('stroke-dasharray', C.toFixed(2)); c.setAttribute('stroke-dashoffset', off.toFixed(2)); }
      svg.append(c);
    }
    return svg;
  }
  function envBtn(e) {
    const pct = Math.min(1, e.feito / e.total), seg = e.ate ? Math.max(0, Math.ceil((e.ate - Date.now()) / 1000)) : 0;
    const centro = e.fim === 'ok' ? '✔' : e.fim === 'parado' ? '■' : e.fim === 'erro' ? '!' : seg ? `${seg}s` : `${Math.min(e.feito, e.total)}/${e.total}`;
    const nome = String(e.titulo || '').slice(0, 24);
    const tip = e.fim === 'ok' ? 'Envio concluído' : e.fim === 'parado' ? 'Envio parado' : e.fim === 'erro' ? 'O envio falhou'
      : `${nome} · ${Math.min(e.feito, e.total)}/${e.total} · ${e.passo}${seg ? ` ${seg}s` : ''} — clique para parar`;
    return h('button', { class: 'hb envb' + (e.fim ? ' fim ' + e.fim : ''), 'data-tip': tip,
      onmousedown: (ev) => { stop(ev); if (!e.fim) { e.parar = true; e.passo = 'Parando…'; renderHead(); } } },
    anelSvg(e.fim === 'ok' ? 1 : pct), h('span', { class: 'cnt' }, centro), e.fim ? null : h('span', { class: 'stp' }, icon('x', 16)));
  }
  function envioFim(e, estado) {
    e.fim = estado; e.ate = 0; renderHead();
    clearInterval(envio.timer); envio.timer = null;
    setTimeout(() => { if (envio.atual === e) { envio.atual = null; renderHead(); } }, estado === 'ok' ? 2200 : 4500);
  }
  async function runReply(r, chatId, depth = 0, e = null) {
    if (depth > 3) return;
    const [chat] = await call('chatInfo', [chatId]);
    const raiz = !e;
    if (raiz) { // só a resposta de fora cria a barra; as chamadas por dentro continuam nela
      e = { titulo: r.titulo || r.atalho || 'resposta', nome: chat?.name || '', total: Math.max(1, passosDe(r)), feito: 0, passo: 'Preparando…', ate: 0, parar: false, fim: null };
      envio.atual = e; clearInterval(envio.timer); envio.timer = setInterval(() => { if (e.fim) return; renderHead(); }, 500); renderHead();
    }
    const ctx = {
      nome: chat?.isGroup ? '' : (!looksNumber(chat?.name) ? chat?.name : chat?.pushname) || '',
      atendente: S.sig.nome,
    };
    try {
      for (const a of r.acoes || []) {
        if (e.parar) break;
        e.passo = ACT[a.tipo]?.nome || a.tipo; renderHead();
        if (SENDS.has(a.tipo) && +a.digitando > 0) { e.passo = a.tipo === 'audio' ? 'Gravando…' : 'Digitando…'; renderHead(); await call(a.tipo === 'audio' ? 'recording' : 'composing', chatId, +a.digitando); e.passo = ACT[a.tipo].nome; renderHead(); }
        switch (a.tipo) {
          case 'texto': {
            let t = U.applyVars(a.texto, ctx);
            if (!t.trim()) break;
            if (S.sig.ativo && S.sig.nome) t = U.sign(t, S.sig);
            await call('sendText', chatId, t);
            break;
          }
          case 'imagem': case 'video': case 'audio': case 'documento': {
            const key = 'midia_' + a.midiaId;
            const m = (await chrome.storage.local.get(key))[key];
            if (!m) { toast('Mídia não encontrada: ' + (a.nome || a.tipo)); break; }
            const opts = { type: WA_TYPE[a.tipo], mimetype: m.mime, filename: m.nome };
            if (a.tipo === 'audio') opts.isPtt = true;
            else if (a.legenda) opts.caption = U.applyVars(a.legenda, ctx);
            if (a.unica && (a.tipo === 'imagem' || a.tipo === 'video')) opts.isViewOnce = true;
            await call('sendFile', chatId, m.dataUrl, opts);
            break;
          }
          case 'contato': {
            const n = U.normalizePhone(a.numero);
            if (n) await call('sendContact', chatId, n, a.nomeContato || n);
            break;
          }
          case 'especial': await call('sendEspecial', chatId, { ...a, pergunta: U.applyVars(a.pergunta || '', ctx), legenda: U.applyVars(a.legenda || '', ctx) }); break;
          case 'espera': await esperar((+a.segundos || 1) * 1000, e); break;
          case 'digitando': await call('composing', chatId, +a.segundos || 3); break;
          case 'gravando': await call('recording', chatId, +a.segundos || 3); break;
          case 'etiquetaAdd': if (a.labelId) await call('label', chatId, a.labelId, 'add'); break;
          case 'etiquetaRem': if (a.labelId) await call('label', chatId, a.labelId, 'remove'); break;
          case 'arquivar': await call('archive', chatId, true); break;
          case 'desarquivar': await call('archive', chatId, false); break;
          case 'fixar': if (!S.pins.includes(chatId)) togglePin(chatId); break;
          case 'desfixar': if (S.pins.includes(chatId)) togglePin(chatId); break;
          case 'naoLido': await call('markUnread', chatId); break;
          case 'bloquear': await call('block', chatId); break;
          case 'resposta': {
            const sub = S.replies.find((x) => x.id === a.respostaId);
            e.feito++; renderHead(); // o passo "chamar outra resposta" conta; os de dentro contam à parte
            if (sub && sub.id !== r.id) await runReply(sub, chatId, depth + 1, e);
            e.feito--;
            break;
          }
        }
        e.feito++; renderHead();
        if (e.parar) break;
        await esperar(SENDS.has(a.tipo) && +a.aguardar > 0 ? +a.aguardar * 1000 : 400, e); // 400ms mantém a ordem
      }
      if (raiz) envioFim(e, e.parar ? 'parado' : 'ok');
    } catch (err) { if (raiz) envioFim(e, 'erro'); throw err; }
  }
  async function sendReply(r) {
    const id = await activeChatId();
    if (!id) return toast('Abra uma conversa primeiro.');
    S.replies = S.replies.map((x) => (x.id === r.id ? { ...x, usos: (x.usos || 0) + 1 } : x));
    save('respostasRapidas');
    try { await runReply(r, id); } catch (err) { toast('Erro ao enviar: ' + err.message); }
  }

  // ---------- Popup "/atalho" + botão ⚡ no campo de mensagem ----------
  const [popHost, popRoot] = mkHost('az-pop');
  const pop = { open: false, items: [], idx: 0 };
  const popBox = h('div');
  popRoot.append(popBox); // o ⚡ fica só no cabeçalho da conversa: flutuando, cobria mensagens
  function closePop() { pop.open = false; popBox.replaceChildren(); restaurarNativo(); } // a lista nativa volta se a nossa fechar
  function renderPop() {
    const f = q('footer');
    if (!pop.open || !f) return closePop();
    const r = f.getBoundingClientRect();
    popBox.replaceChildren(h('div', {
      class: 'pop',
      style: `left:${r.left + 8}px;bottom:${innerHeight - r.top + 6}px;width:${Math.min(r.width - 16, 520)}px`,
    },
    pop.items.map((it, i) => h('div', {
      class: 'pop-item' + (i === pop.idx ? ' sel' : ''),
      onmousedown: (e) => { stop(e); choose(it); },
    }, h('b', null, '/' + it.atalho), h('span', null, it.titulo || ''),
    h('small', null, (it.acoes || []).map((a) => ACT[a.tipo]?.ic).join(' ')))),
    h('div', { class: 'pop-hint' }, '↑↓ escolher · Enter/Tab enviar · Esc fechar')));
  }
  // v1.14.2 — o WhatsApp Business tem a SUA lista de respostas rápidas ao digitar "/". Ela abria junto com a nossa (uma por cima
  // da outra). Enquanto a nossa está aberta, escondemos a camada flutuante nativa que aparece acima do campo de mensagem:
  // pegamos o que está nos pontos logo acima do rodapé e escondemos o que NÃO estava lá antes de digitar "/" (data-az-nativo).
  const nat = { base: new Set(), ocultos: [], total: 0, dica: '' };
  const empilhados = () => {
    const f = q('footer'); if (!f) return new Set();
    const r = f.getBoundingClientRect(), out = new Set();
    for (const x of [0.15, 0.4, 0.65, 0.9]) for (const dy of [24, 70, 130]) {
      for (const el of document.elementsFromPoint(r.left + r.width * x, r.top - dy)) if (!el.closest?.('#az-panel,#az-pop,#az-head') && !(el.id || '').startsWith('az-')) out.add(el);
    }
    return out;
  };
  const guardarBase = () => { nat.base = empilhados(); };
  const restaurarNativo = () => { for (const c of nat.ocultos) c.removeAttribute('data-az-nativo'); nat.ocultos = []; };
  function esconderNativo() {
    if (!pop.open) return;
    const f = q('footer'), ed = composer(); if (!f || !ed) return;
    const topo = f.getBoundingClientRect().top; let novos = 0, vistos = [];
    for (const el of empilhados()) {
      if (nat.base.has(el) || el === f || el === document.body || el.id === 'app') continue;
      novos++; if (vistos.length < 6) vistos.push(`${el.tagName.toLowerCase()}${el.getAttribute('role') ? '[role=' + el.getAttribute('role') + ']' : ''}${el.getAttribute('data-testid') ? '[testid=' + el.getAttribute('data-testid') + ']' : ''}`);
      let alvo = null;
      for (let n = el; n && n !== document.body && n.id !== 'app'; n = n.parentElement) {
        if (n === f || n.contains(f) || n.contains(ed)) break; // nunca o rodapé nem o campo de mensagem
        const cs = getComputedStyle(n), r = n.getBoundingClientRect();
        if ((cs.position === 'absolute' || cs.position === 'fixed') && r.width >= 160 && r.height >= 40 && r.height <= 520 && Math.abs(r.bottom - topo) <= 60) alvo = n;
      }
      if (alvo && !alvo.hasAttribute('data-az-nativo')) { alvo.setAttribute('data-az-nativo', '1'); nat.ocultos.push(alvo); nat.total++; }
    }
    if (novos && !nat.ocultos.length) nat.dica = vistos.join(' > '); // só para o Diagnóstico: o que apareceu e não consegui esconder
  }
  function onComposerChange() {
    const ed = composer();
    if (!ed || !S.replies.length || !ligado('replies')) { restaurarNativo(); return closePop(); }
    const txt = readText(ed).trim();
    if (!txt) guardarBase(); // campo vazio: o que está acima do rodapé agora é o "normal"
    const m = /^\/(\S*)$/.exec(txt);
    if (!m) { restaurarNativo(); return closePop(); }
    pop.items = U.matchReplies(S.replies, m[1]).slice(0, 8);
    pop.idx = 0;
    const abriu = !pop.open && pop.items.length > 0;
    pop.open = pop.items.length > 0;
    renderPop();
    if (!pop.open) restaurarNativo(); // sem resposta nossa para esse texto: a lista nativa fica à vontade
    else { esconderNativo(); if (abriu) for (const ms of [120, 350, 800]) setTimeout(esconderNativo, ms); } // a nativa pode montar um pouco depois
  }
  async function choose(r) {
    pop.open = false; popBox.replaceChildren(); // a nossa lista some já…
    await call('setInputText', '').catch(() => {});
    restaurarNativo(); // …e a nativa só volta depois de o campo esvaziar (ela se fecha sozinha com o campo vazio; assim não pisca)
    sendReply(r);
  }
  document.addEventListener('keydown', (e) => { if (e.key === '/' && composer()?.contains(e.target) && !readText(composer()).trim()) guardarBase(); }, true); // antes do "/" entrar
  document.addEventListener('focusin', (e) => { if (composer()?.contains(e.target) && !readText(composer()).trim()) guardarBase(); }, true);
  document.addEventListener('input', (e) => { if (composer()?.contains(e.target)) onComposerChange(); }, true);
  document.addEventListener('keyup', (e) => {
    if (!/^(Arrow|Enter|Tab|Escape|Shift)/.test(e.key) && composer()?.contains(e.target)) onComposerChange();
  }, true);

  // ---------- Assinatura automática ----------
  let bypass = false, signing = false;
  function needsSign() {
    const ed = composer();
    if (!ed || !ligado('sig') || !S.sig.ativo || !S.sig.nome?.trim()) return false;
    const t = readText(ed);
    return t.trim() && !t.startsWith(U.signature(S.sig));
  }
  async function signAndSend() {
    if (signing) return;
    signing = true;
    try {
      const signed = U.sign(readText(composer()), S.sig);
      await call('setInputText', signed);
      await sleep(120);
      bypass = true;
      const b = sendButton();
      if (b) b.click();
      else composer()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      bypass = false;
      await sleep(400);
      const left = composer() ? readText(composer()).trim() : '';
      if (left && left === signed.trim()) await call('sendActive', signed); // botão não enviou: envia direto
    } catch (err) {
      toast('Assinatura falhou: ' + err.message);
    } finally { bypass = false; signing = false; }
  }
  window.addEventListener('keydown', (e) => {
    const ed = composer();
    if (!ed || !ed.contains(e.target)) return;
    if (pop.open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        stop(e);
        pop.idx = (pop.idx + (e.key === 'ArrowDown' ? 1 : -1) + pop.items.length) % pop.items.length;
        return renderPop();
      }
      if (e.key === 'Enter' || e.key === 'Tab') { stop(e); return choose(pop.items[pop.idx]); }
      if (e.key === 'Escape') { stop(e); return closePop(); }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !bypass && S.ready && needsSign()) { stop(e); signAndSend(); }
  }, true);
  window.addEventListener('click', (e) => {
    if (bypass || !S.ready) return;
    const b = sendButton();
    if (b && b.contains(e.target) && needsSign()) { stop(e); signAndSend(); }
  }, true);

  // ---------- Iniciar conversa + links wa.me ----------
  async function startChat(phone, text) {
    if (!S.ready) return toast('WhatsApp ainda carregando…');
    try {
      const r = await call('startChat', phone, text || '');
      if (!r.exists) toast(`O número +${phone} não tem WhatsApp.`);
      return r.exists;
    } catch (err) { toast('Não foi possível abrir: ' + err.message); }
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest?.('a[href]');
    const p = a && U.parseWaLink(a.href);
    if (!p || !S.ready || !ligado('start')) return;
    stop(e);
    startChat(p.phone, p.text);
  }, true);

  // ----- Vagas nos grupos (v1.14) -----
  // Vagas = limite do WhatsApp (getGroupSizeLimit, normalmente 1.024) − membros. A ponte marca data-az-chat em cada linha da lista
  // (lendo o React da linha; plano B: nome único) e aqui desenhamos o selo ao lado do nome. Também aparece no topo do grupo aberto.
  const vg = new Map(); // idGrupo -> {m, l, t}
  let vgBusy = false, vgSigHead = '', vgTimer = null;
  const vagasDe = (id) => { const d = vg.get(id); return d?.m ? { vagas: d.l - d.m, m: d.m, l: d.l } : null; };
  const fmtN = (n) => n.toLocaleString('pt-BR');
  // v1.14.4: o selo é só um número num anel fino (como o contador de não lidas); o texto completo fica no mouse
  const numVagas = (v) => (v.vagas <= 0 ? '0' : v.vagas >= 1000 ? Math.floor(v.vagas / 100) / 10 + 'k' : String(v.vagas));
  const tituloVagas = (v) => (v.vagas <= 0 ? 'Grupo lotado' : v.vagas === 1 ? '1 vaga' : `${v.vagas} vagas`) + ` · ${fmtN(v.m)} de ${fmtN(v.l)} membros`;
  const classeVagas = (v) => (v.vagas <= 0 ? 'cheio' : v.vagas <= 10 ? 'quase' : 'livre');
  function desenharVagas() {
    const side = document.getElementById('side'); if (!side) return;
    const on = ligado('vagas'), ate = +S.vagasCfg?.ate || 0;
    for (const b of side.querySelectorAll('.az-vagas')) { const row = b.closest('[data-az-chat]'); if (!on || !row || row.getAttribute('data-az-chat') !== b.dataset.id) b.remove(); }
    if (!on) return;
    for (const row of side.querySelectorAll('[data-az-chat$="@g.us"]')) {
      if (row.querySelector('[data-az-chat]')) continue; // linha de fora de outra: o selo vai na de dentro
      const id = row.getAttribute('data-az-chat'), v = vagasDe(id), nome = row.querySelector('span[title]');
      let b = row.querySelector('.az-vagas');
      if (!v || !nome || (ate && v.vagas > ate)) { b?.remove(); continue; }
      if (!b) { b = document.createElement('span'); nome.parentElement.insertBefore(b, nome.nextSibling); }
      b.className = 'az-vagas ' + classeVagas(v); b.dataset.id = id; b.textContent = numVagas(v); b.title = tituloVagas(v);
    }
  }
  async function atualizarVagas() {
    if (vgBusy || !S.ready || document.hidden) return; // aba em segundo plano: nada a desenhar
    const precisaMarcar = ligado('vagas') || (ligado('ocultas') && S.ocultas.length > 0); // as Ocultas também usam o id da linha
    if (!precisaMarcar) { desenharVagas(); return; }
    vgBusy = true;
    try {
      await call('marcarLinhas').catch(() => null);
      esconderLinhas();
      if (!ligado('vagas')) { desenharVagas(); return; }
      const ids = new Set([...document.querySelectorAll('#side [data-az-chat$="@g.us"]')].map((r) => r.getAttribute('data-az-chat')));
      const ativo = S.active?.id; if (String(ativo).endsWith('@g.us')) ids.add(ativo);
      const falta = [...ids].filter((id) => !vg.has(id) || Date.now() - vg.get(id).t > 30000);
      if (falta.length) {
        const d = await call('vagasGrupos', falta).catch(() => ({}));
        for (const id of falta) vg.set(id, { ...(d[id] || vg.get(id) || {}), t: Date.now() });
      }
      desenharVagas();
      const v = String(ativo).endsWith('@g.us') ? vagasDe(ativo) : null, sig = v ? `${ativo}:${v.m}:${v.l}` : '';
      if (sig !== vgSigHead) { vgSigHead = sig; renderHead(); }
    } finally { vgBusy = false; }
  }
  document.addEventListener('scroll', (e) => { if (e.target?.closest?.('#pane-side') && !vgTimer) vgTimer = setTimeout(() => { vgTimer = null; atualizarVagas(); }, 300); }, true);
  setInterval(T('vagas a cada 2,5 s (inclui a ponte)', atualizarVagas), 2500);

  // ---------- Fixar ----------
  function togglePin(id, escopo) {
    const tira = S.pins.includes(id);
    S.pins = tira ? S.pins.filter((x) => x !== id) : [id, ...S.pins];
    const abas = { ...S.pinAbas };
    if (tira) delete abas[id];
    else { const e = escopo || (String(id).endsWith('@g.us') ? 'grupos' : 'todas'); if (e !== 'todas') abas[id] = e; } // grupo novo: só na aba Grupos
    S.pinAbas = abas;
    save('pinChat'); save('pinAbas');
    applyPins(); renderHead();
  }
  function escopoFixada(id, e) {
    const abas = { ...S.pinAbas };
    if (e === 'todas') delete abas[id]; else abas[id] = e;
    S.pinAbas = abas; save('pinAbas'); applyPins(); renderPanel();
  }
  const COLORS = ['#25d366', '#34b7f1', '#eab308', '#ef4444', '#a855f7', '#ec4899', '#14b8a6', '#64748b'];
  // ---------- Botões no cabeçalho da conversa ----------
  const [headHost, headRoot] = mkHost('az-head');
  function ensureHead() {
    const hd = q('header');
    if (!hd || headHost.parentElement === hd) return;
    hd.insertBefore(headHost, hd.lastElementChild);
    renderHead();
  }
  function renderHead() {
    const act = S.active?.id;
    const pinned = act && S.pins.includes(act);
    const btn = (ic, tip, onclick, on) => h('button', { class: 'hb' + (on ? ' on' : ''), 'data-tip': tip, onclick, disabled: !S.ready }, icon(ic, 20));
    const e = envio.atual;
    const kids = [
      ligado('pins') ? btn('pin', pinned ? (S.pinAbas?.[act] ? `Desafixar (fixada ${U.ESCOPOS[S.pinAbas[act]].toLowerCase()})` : 'Desafixar Chat') : (String(act).endsWith('@g.us') ? 'Fixar Grupo (só na aba Grupos)' : 'Fixar Chat'), async () => { const id = await activeChatId(); if (id) togglePin(id); }, pinned) : null,
      ligado('ocultas') ? btn('eyeoff', 'Ocultar conversa', async () => { const id = await activeChatId(); if (id) ocultar(id, true); }) : null,
      ligado('cargas') ? btn('truck', 'Lista de frete (da planilha) · Shift+clique: anúncio por ID', (e) => listaNaConversa(e?.shiftKey)) : null,
      e ? envBtn(e) : (ligado('replies') ? btn('zap', 'Respostas rápidas', () => openPanel('replies')) : null),
      (() => { const v = ligado('vagas') && String(act).endsWith('@g.us') ? vagasDe(act) : null;
        return v ? h('span', { class: 'hvg ' + classeVagas(v), title: tituloVagas(v) }, numVagas(v)) : null; })(),
    ];
    const hd = q('header'), rc = hd?.getBoundingClientRect();
    // atenção: replaceChildren(x, null) escreve o texto "null" na tela — por isso o filter(Boolean)
    headRoot.replaceChildren(...[h('div', { class: 'hbar' }, kids),
      e && rc ? h('div', { class: 'envlinha' + (e.fim ? ' ' + e.fim : ''), style: `left:${rc.left}px;top:${rc.bottom - 3}px;width:${rc.width}px` },
        h('i', { style: `width:${Math.min(100, Math.round(100 * e.feito / e.total))}%` })) : null].filter(Boolean));
    // O cabeçalho do WhatsApp pode ter transform/contain: aí "position: fixed" deixa de ser relativo à tela e a linha sai do lugar
    // (apareceu pela metade/deslocada no WhatsApp real). Mede onde ela caiu e compensa a diferença.
    const lin = headRoot.querySelector('.envlinha');
    if (lin && rc) {
      const a = lin.getBoundingClientRect(), dx = rc.left - a.left, dy = rc.bottom - 3 - a.top;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) lin.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  }

  // ---------- Painel lateral recolhível ----------
  const view = { diagOnly: false, diagClosed: new Set(), restore: null, bkSel: null, editing: null, q: '', modo: 'tudo', tipo: '', cat: '', closed: new Set(), menu: null, prev: null, addMenu: false, addGroup: 'msg' };
  const SECTIONS = [['replies', 'zap', 'Respostas rápidas'], ['atendente', 'zap', 'Atendente IA'], ['memoria', 'zap', 'Memória IA'], ['fila', 'clock', 'Aguardando resposta'], ['sig', 'pen', 'Assinatura'], ['frete', 'truck', 'Lista de frete'], ['pedidos', 'users', 'Pedidos de grupos'], ['unicos', 'users', 'Conjuntos de grupos'], ['gruposAj', 'users', 'Ajustes dos grupos'], ['start', 'chat', 'Iniciar conversa'], ['lote', 'layers', 'Enviar para vários'], ['pins', 'pin', 'Conversas fixadas'], ['resumo', 'layers', 'Resumo do que perdi'], ['contato', 'users', 'Contato do cliente'], ['exportar', 'download', 'Exportar conversa'], ['backup', 'save', 'Backup'], ['ocultas', 'eyeoff', 'Conversas ocultas'], ['apagar', 'trash', 'Apagar mensagens'], ['recuperar', 'eye', 'Recuperar apagadas'], ['diag', 'pulse', 'Diagnóstico'], ['limites', 'pulse', 'Limites do WhatsApp'], ['iaenvios', 'pulse', 'Envios à IA'], ['avaliacao', 'pulse', 'Avaliação do atendimento'], ['lab', 'flask', 'Laboratório'], ['config', 'gear', 'Configurações']];
  // Barra do painel em grupos: atendimento | envio | conversas | sistema
  const visiveis = () => SECTIONS.filter(([k]) => ligado(k));
  const GRUPO = { respostas: 0, grupos: 1, ferramentas: 1, privacidade: 2, diagnostico: 3, config: 3 }; // separadores: Atendimento | Grupos + Ferramentas | Privacidade | Diagnóstico + Configurações
  // v1.11 — coluna enxuta (10 → 7 ícones): "Conversas" reúne Fixadas|Ocultas e "Configurações" reúne Geral|Backup|Diagnóstico
  // como abas dentro do painel. As seções continuam com as mesmas chaves (ui.sec, módulos, atalhos antigos, alerta).
  // v1.39 — barra por ASSUNTO (6 ícones): cada opção mora onde se trata do seu assunto. 🧪 = ainda em teste (etiqueta na própria aba, não uma área separada).
  const HUBS = {
    respostas: { icone: 'zap', titulo: 'Atendimento', abas: [['replies', 'Respostas'], ['fila', 'Aguardando'], ['sig', 'Assinatura'], ['atendente', 'Atendente IA'], ['memoria', 'Memória IA'], ['frete', 'Lista de frete'], ['resumo', 'Resumo']] },
    grupos: { icone: 'users', titulo: 'Grupos', abas: [['pedidos', 'Pedidos'], ['unicos', 'Conjuntos'], ['gruposAj', 'Ajustes']] },
    ferramentas: { icone: 'wrench', titulo: 'Ferramentas', abas: [['start', 'Iniciar conversa'], ['lote', 'Enviar para vários'], ['pins', 'Fixadas'], ['contato', 'Contato'], ['exportar', 'Exportar'], ['backup', 'Backup']] },
    privacidade: { icone: 'lock', titulo: 'Privacidade', abas: [['ocultas', 'Ocultas'], ['apagar', 'Apagar'], ['recuperar', 'Recuperar']] },
    diagnostico: { icone: 'pulse', titulo: 'Diagnóstico', abas: [['diag', 'Saúde'], ['limites', 'Limites'], ['avaliacao', 'Avaliação'], ['iaenvios', 'Envios à IA'], ['lab', 'Laboratório']] },
    config: { icone: 'gear', titulo: 'Configurações', abas: [['config', 'Geral']] },
  };
  const HUB_DE = { replies: 'respostas', fila: 'respostas', sig: 'respostas', atendente: 'respostas', memoria: 'respostas', frete: 'respostas', resumo: 'respostas', pedidos: 'grupos', unicos: 'grupos', gruposAj: 'grupos', start: 'ferramentas', lote: 'ferramentas', pins: 'ferramentas', contato: 'ferramentas', exportar: 'ferramentas', backup: 'ferramentas', ocultas: 'privacidade', apagar: 'privacidade', recuperar: 'privacidade', diag: 'diagnostico', limites: 'diagnostico', iaenvios: 'diagnostico', avaliacao: 'diagnostico', lab: 'diagnostico', config: 'config' };
  const emTeste = (k) => MODULOS.some((m) => m[0] === k && m[3] === 'teste');
  const railKey = (k) => HUB_DE[k] || k;
  const abasDe = (hub) => HUBS[hub].abas.filter(([k]) => ligado(k));
  const railItens = () => {
    const vistos = new Set(), out = [];
    for (const [k, ic, t] of visiveis()) {
      const r = railKey(k); if (vistos.has(r)) continue; vistos.add(r);
      out.push([r, HUBS[r]?.icone || ic, HUBS[r]?.titulo || t]);
    }
    return out;
  };
  const CONTA = { respostas: () => (ligado('atendente') ? (S.atendSug || []).length : 0) + (ligado('fila') ? fila.itens?.length || 0 : 0), privacidade: () => (ligado('recuperar') ? recNaoVistas() : 0), diagnostico: () => (ligado('avaliacao') ? avPendentes() : 0) };
  const CONTA_ABA = { fila: () => fila.itens?.length || 0, recuperar: () => recNaoVistas(), avaliacao: () => avPendentes(), memoria: () => (S.memSug || []).length, atendente: () => (S.atendSug || []).length, pins: () => S.pins.length, ocultas: () => S.ocultas.length };
  const ATALHO = new Proxy({}, { get: (_, k) => { const i = railItens().findIndex(([s]) => s === k); return i >= 0 && i < 9 ? `Alt+${i + 1}` : ''; } });
  // Clicar no ícone de um grupo vai para a 1ª aba; se já está em uma aba do grupo, continua nela.
  function abrirRail(r) { openPanel(HUBS[r] ? (railKey(ui.sec) === r && abasDe(r).some(([k]) => k === ui.sec) ? ui.sec : abasDe(r)[0][0]) : r); }
  // v1.11.1 — sistema de design próprio: ícone em quadradinho (.tile) e cabeçalho de tela em cartão (.phead)
  const tile = (ic, extra = '') => h('span', { class: 'tile ' + extra }, icon(ic, 18));
  const PHEAD = {
    pins: ['pin', 'Conversas fixadas', 'Ficam no topo da lista, sem o limite de 3 do WhatsApp.'],
    ocultas: ['eyeoff', 'Conversas ocultas', 'Somem da lista e não notificam.'],
    config: ['gear', 'Configurações', 'Deixe o painel do seu jeito.'],
    backup: ['save', 'Backup', 'Guarde e restaure suas configurações.'],
    diag: ['pulse', 'Diagnóstico', 'Saúde das funções do painel e do WhatsApp.'],
    pedidos: ['users', 'Pedidos para entrar', 'Aprove todos de uma vez, sem deixar entrar quem já está em grupo igual.'],
    atendente: ['zap', 'Atendente IA', 'Um robô que atende os contatos com a IA: você liga, treina e acompanha.'],
    memoria: ['zap', 'Memória da IA', 'O que a IA aprende com o dia a dia: você aprova, ela evolui.'],
    unicos: ['users', 'Conjuntos de grupos', 'Seus grupos de mesmo conteúdo: vagas, convite, padronização e sem duplicar.'],
  };
  const pHead = (k) => PHEAD[k] ? h('div', { class: 'phead' }, tile(PHEAD[k][0], 'lg'), h('div', { class: 'grow' }, h('b', null, PHEAD[k][1]), h('small', null, PHEAD[k][2]))) : null;
  const hubTabs = (hub) => abasDe(hub).length < 2 ? null : h('div', { class: 'hubtabs', role: 'tablist' }, abasDe(hub).map(([k, t]) => h('button', { role: 'tab', 'aria-selected': String(ui.sec === k), class: 'ht' + (ui.sec === k ? ' on' : '') + (k === 'diag' && S.saude?.afetadas?.length ? ' alert' : ''),
    onclick: () => { ui.sec = k; view.editing = null; saveUi(); renderPanel(); } }, t + (emTeste(k) ? ' 🧪' : ''), CONTA_ABA[k]?.() ? h('em', null, CONTA_ABA[k]()) : null)));
  // Atalhos: Alt+Z abre/fecha o painel; Alt+1…9 vai direto para a seção (na ordem da barra)
  document.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.code === 'KeyZ') { e.preventDefault(); ui.open ? closePanel() : openPanel(); return; }
    const n = /^Digit([1-9])$/.exec(e.code)?.[1];
    if (n && railItens()[n - 1]) { e.preventDefault(); abrirRail(railItens()[n - 1][0]); }
  }, true);
  // Muda o tema do próprio WhatsApp (fica salvo nele); a wa-js recarrega a página.
  async function toggleTheme() {
    const next = document.body.classList.contains('dark') ? 'light' : 'dark';
    toast(next === 'dark' ? 'Mudando para o tema escuro…' : 'Mudando para o tema claro…');
    try { await call('setTheme', next); } catch (e) { toast('Não foi possível mudar o tema: ' + e.message); }
  }
  // lado: [nome, seta da aba recolhida, seta do botão recolher]
  const LADOS = { direita: ['à direita', 'left', 'right'], esquerda: ['à esquerda', 'right', 'left'], topo: ['em cima', 'down', 'up'] };
  function openPanel(sec) { ui.open = true; ui.topoFechado = false; ui.sec = sec || ui.sec; view.editing = null; saveUi(); renderPanel(); }
  function closePanel() { ui.open = false; saveUi(); renderPanel(); }
  let lastEdit = null;
  function renderPanel() {
    const fresh = view.editing && view.editing !== lastEdit;
    lastEdit = view.editing;
    if (fresh) loadPreviews(view.editing); // miniaturas das mídias salvas
    // Posição: direita (padrão), esquerda ou topo (barra de ícones no alto e o conteúdo abre como quadro suspenso)
    const lado = LADOS[ui.lado] ? ui.lado : 'direita';
    document.body.classList.toggle('az-docked', !!ui.open);
    document.body.classList.toggle('az-esq', lado === 'esquerda');
    document.body.classList.toggle('az-topo', lado === 'topo');
    const app = document.getElementById('app'); // z-index só vale com position; só mexe se for static (não muda o layout)
    if (ui.open && app && getComputedStyle(app).position === 'static') app.style.position = 'relative';
    document.documentElement.style.setProperty('--az-w', painelW() + 'px');
    const velho = panelRoot.querySelector('.pb');
    const chave = ui.sec + (view.editing ? ':ed' : '') + (ui.sec === 'diag' ? ':' + (view.diagAba || 'diag') : '') + (ui.sec === 'lote' ? ':' + lote.aba : '');
    const rolagem = velho && velho.dataset.chave === chave ? velho.scrollTop : 0;
    panelRoot.querySelector('.panel')?.remove();
    panelRoot.querySelector('.handle')?.remove();
    if (!ui.open) {
      panelRoot.prepend(h('button', { class: 'handle ' + lado, title: 'Abrir AtendeZap (Alt+Z)', onclick: () => openPanel() },
        icon(LADOS[lado][1], 16), icon('zap', 18), h('i', { class: 'st' + (S.ready ? ' ok' : '') + (S.saude?.afetadas?.length ? ' bad' : '') })));
      renderAlerta();
      return;
    }
    if (!ligado(ui.sec)) ui.sec = visiveis()[0][0];
    const body = { memoria: memoriaView, atendente: atendView, config: configView, replies: view.editing ? editorView : repliesView, sig: sigView, start: startView, lote: loteView, pedidos: pedidosView, unicos: unicosView, fila: filaView, pins: pinsView, ocultas: ocultasView, apagar: apagarView, recuperar: recuperarView, lab: () => [h('div', { class: 'eh' }, h('b', null, 'Laboratório')), labView()], gruposAj: gruposAjView, frete: freteView, limites: limitesSecaoView, resumo: resumoView, avaliacao: avaliacaoView, iaenvios: iaEnviosView, contato: contatoView, exportar: exportarView, backup: backupView, diag: diagView }[ui.sec]();
    panelRoot.prepend(h('div', { class: 'panel ' + lado, style: lado === 'topo' ? '' : `width:${painelW()}px` },
      h('div', { class: 'ph' },
        h('button', { class: 'tb close', 'data-tip': 'Recolher (Alt+Z)', onclick: closePanel }, icon(LADOS[lado][2], 20)),
        h('i', { class: 'sep' }),
        railItens().map(([k, ic, t], i, vis) => [
          i && GRUPO[k] !== GRUPO[vis[i - 1][0]] ? h('i', { class: 'sep' }) : null,
          h('button', { class: 'tb' + (railKey(ui.sec) === k ? ' on' : '') + (k === 'diagnostico' && S.saude?.afetadas?.length ? ' alert' : ''), 'data-tip': t + (ATALHO[k] ? ` (${ATALHO[k]})` : ''),
            onclick: () => { if (lado === 'topo' && railKey(ui.sec) === k && !ui.topoFechado) { ui.topoFechado = true; saveUi(); renderPanel(); } else abrirRail(k); } },
            icon(ic, 20), CONTA[k]?.() ? h('em', { class: 'n' }, CONTA[k]()) : null)]),
        h('i', { class: 'st' + (S.ready ? ' ok' : ''), title: S.ready ? 'Conectado ao WhatsApp' : 'Aguardando WhatsApp…' }),
        h('button', { class: 'tb theme', 'data-tip': document.body.classList.contains('dark') ? 'Tema claro' : 'Tema escuro', onclick: toggleTheme },
          icon(document.body.classList.contains('dark') ? 'sun' : 'moon', 20)),
        null),
      lado === 'topo' && ui.topoFechado ? null : h('div', { class: 'pb', 'data-chave': chave }, HUB_DE[ui.sec] && !view.editing ? [hubTabs(HUB_DE[ui.sec]), emTeste(ui.sec) ? h('p', { class: 'hint teste' }, '🧪 Esta função ainda está em teste: funciona nos nossos testes, mas ainda não foi confirmada no seu WhatsApp (ou ainda não sabemos o que faz). Funcionando para você, o 🧪 sai numa próxima versão.') : null, pHead(ui.sec)] : null, acessoAvisosView(), body)));
    const novo = panelRoot.querySelector('.pb');
    if (novo && rolagem) { novo.scrollTop = rolagem; requestAnimationFrame(() => { novo.scrollTop = rolagem; }); }
    renderAlerta();
  }

  // ----- Respostas rápidas: lista -----
  function repliesView() {
    const q = view.q.toLowerCase();
    let list = S.replies.filter((r) =>
      (!q || (r.atalho + ' ' + r.titulo).toLowerCase().includes(q) || (r.acoes || []).some((a) => (a.texto || '').toLowerCase().includes(q))) &&
      (!view.tipo || (r.acoes || []).some((a) => a.tipo === view.tipo)) &&
      (!view.cat || r.categoriaId === view.cat) &&
      (view.modo !== 'sem' || !S.cats.some((c) => c.id === r.categoriaId)));
    const search = h('input', { class: 'in', placeholder: 'Pesquisar resposta rápida', value: view.q,
      oninput: (e) => {
        view.q = e.target.value; renderPanel();
        const el = panelRoot.querySelector('.search .in');
        el?.focus(); el?.setSelectionRange(view.q.length, view.q.length);
      } });
    const chip = (label, on, onclick) => h('button', { class: 'fchip' + (on ? ' on' : ''), onclick }, label);
    const setModo = (m) => () => { view.modo = m; renderPanel(); };
    const media = U.countMedia(S.replies);
    const head = h('div', { class: 'rhead' },
      h('div', { class: 'eh' }, h('b', null, 'Respostas rápidas'), h('span', { class: 'pill' }, S.replies.length)),
      h('div', { class: 'rowf' },
        h('label', { class: 'search' }, icon('search', 16), search),
        h('button', { class: 'gbtn sm', onclick: () => newReply() }, '＋ Nova')),
      h('div', { class: 'fchips' },
        chip('Tudo', view.modo === 'tudo' && !view.tipo && !view.cat, () => { view.modo = 'tudo'; view.tipo = ''; view.cat = ''; renderPanel(); }),
        chip('Sem Categoria', view.modo === 'sem', setModo(view.modo === 'sem' ? 'tudo' : 'sem')),
        chip('Mais Usadas', view.modo === 'usadas', setModo(view.modo === 'usadas' ? 'tudo' : 'usadas'))),
      h('div', { class: 'rowf' },
        h('select', { class: 'in sm' + (view.tipo ? ' on' : ''), value: view.tipo, onchange: (e) => { view.tipo = e.target.value; renderPanel(); } },
          h('option', { value: '' }, 'Por tipo: todos'), ['texto', 'imagem', 'video', 'audio', 'documento', 'contato'].map((k) => h('option', { value: k }, ACT[k].ic + ' ' + ACT[k].nome))),
        h('select', { class: 'in sm' + (view.cat ? ' on' : ''), value: view.cat, onchange: (e) => { view.cat = e.target.value; renderPanel(); } },
          h('option', { value: '' }, 'Por categoria: todas'), S.cats.map((c) => h('option', { value: c.id }, c.nome)))),
      h('div', { class: 'rowf meta' },
        h('span', { class: 'hint grow' }, 'Na conversa, digite ', h('code', null, '/atalho'), ' + Enter'),
        h('span', { class: 'pill' + (media >= MEDIA_LIMIT ? ' warn' : '') }, `Mídias ${media}/${MEDIA_LIMIT}`),
        h('button', { class: 'obtn', onclick: manageCats }, 'Categorias')));
    if (!S.replies.length) return [head, emptyState('Nenhuma resposta rápida ainda', 'Crie respostas com texto, imagem, vídeo, áudio, documentos e ações.', 'Criar resposta', () => newReply())];
    if (view.modo === 'usadas') {
      list = list.filter((r) => r.usos).sort((a, b) => b.usos - a.usos);
      return [head, list.length ? h('div', { class: 'grp' }, list.map(itemEl)) : h('p', { class: 'empty' }, 'Nenhuma resposta usada ainda.')];
    }
    const groups = [...S.cats.map((c) => ({ ...c, items: list.filter((r) => r.categoriaId === c.id) })),
      { id: '_sem', nome: 'Sem categoria', cor: '#8696a0', items: list.filter((r) => !S.cats.some((c) => c.id === r.categoriaId)) }]
      .filter((g) => g.items.length || (!q && !view.tipo && !view.cat && view.modo === 'tudo' && g.id !== '_sem'));
    return [head, groups.map((g) => {
      const closed = view.closed.has(g.id);
      return h('div', { class: 'grp', style: `--c:${g.cor}` },
        h('div', { class: 'gh', onclick: () => { closed ? view.closed.delete(g.id) : view.closed.add(g.id); renderPanel(); } },
          h('span', { class: 'gi' }, icon('shapes', 16)), h('b', null, g.nome), h('em', null, g.items.length), icon(closed ? 'down' : 'up', 16)),
        closed ? null : g.items.map(itemEl));
    })];
  }
  function itemEl(r) {
    const first = r.acoes?.find((a) => SENDS.has(a.tipo)) || r.acoes?.[0];
    const menu = view.menu === r.id ? h('div', { class: 'imenu' },
      h('button', { onclick: () => { view.menu = null; view.editing = structuredClone(r); renderPanel(); } }, '✎ Editar'),
      h('button', { onclick: () => { view.menu = null; duplicateReply(r); } }, '⧉ Duplicar'),
      h('button', { class: 'dan', onclick: () => { view.menu = null; deleteReply(r); } }, '🗑 Excluir')) : null;
    const prev = view.prev === r.id ? h('div', { class: 'iprev' },
      h('div', null, h('code', null, '/' + r.atalho)),
      (r.acoes || []).map((a) => h('div', null, ACT[a.tipo]?.ic + ' ',
        a.tipo === 'texto' ? (a.texto || '').slice(0, 160) : a.nome || a.nomeContato || ACT[a.tipo]?.nome))) : null;
    return h('div', { class: 'it' },
      h('div', { class: 'ir' },
        h('span', { class: 'ii' }, first ? ACT[first.tipo]?.ic : '⚡'),
        h('span', { class: 'itt', title: r.titulo, ondblclick: () => sendReply(r) }, r.titulo || '/' + r.atalho),
        h('button', { class: 'ib', title: 'Opções', onclick: () => { view.menu = view.menu === r.id ? null : r.id; renderPanel(); } }, icon('dots', 18)),
        h('button', { class: 'ib', title: 'Visualizar', onclick: () => { view.prev = view.prev === r.id ? null : r.id; renderPanel(); } }, icon('eye', 17)),
        h('button', { class: 'ib send', title: 'Enviar na conversa aberta', onclick: () => sendReply(r) }, icon('send', 17))),
      menu, prev);
  }
  const emptyState = (t, d, btn, onclick) => h('div', { class: 'emptyst' }, h('span', { class: 'big' }, icon('box', 34)), h('b', null, t), h('p', null, d),
    btn ? h('button', { class: 'gbtn', onclick }, btn) : null);
  function newReply() {
    view.editing = { id: null, atalho: '', titulo: '', categoriaId: view.cat || '', acoes: [] };
    view.addMenu = false;
    openPanelKeepEdit();
  }
  function openPanelKeepEdit() { ui.open = true; ui.sec = 'replies'; saveUi(); renderPanel(); }
  async function manageCats() {
    const txt = await perguntar('Categorias (uma por linha). Apague a linha para excluir:', S.cats.map((c) => c.nome).join('\n'));
    if (txt == null) return;
    const names = [...new Set(txt.split('\n').map((s) => s.trim()).filter(Boolean))];
    S.cats = names.map((n, i) => S.cats.find((c) => c.nome === n) || { id: U.uid(), nome: n, cor: COLORS[i % COLORS.length] });
    const ids = new Set(S.cats.map((c) => c.id));
    S.replies = S.replies.map((r) => (ids.has(r.categoriaId) ? r : { ...r, categoriaId: '' }));
    save('categorias'); save('respostasRapidas');
  }
  async function deleteReply(r) {
    if (!await confirmar(`Excluir a resposta "${r.titulo || '/' + r.atalho}"?`)) return;
    await chrome.storage.local.remove((r.acoes || []).filter((a) => a.midiaId).map((a) => 'midia_' + a.midiaId));
    S.replies = S.replies.filter((x) => x.id !== r.id);
    save('respostasRapidas');
  }
  async function duplicateReply(r) {
    const extra = (r.acoes || []).filter((a) => a.midiaId).length;
    if (U.countMedia(S.replies) + extra > MEDIA_LIMIT) return toast(`Limite de ${MEDIA_LIMIT} mídias atingido.`);
    const copy = { ...structuredClone(r), id: U.uid(), atalho: r.atalho + '-copia', titulo: (r.titulo || '') + ' (cópia)', usos: 0 };
    for (const a of copy.acoes) {
      a.id = U.uid();
      if (!a.midiaId) continue;
      const k = 'midia_' + a.midiaId;
      const m = (await chrome.storage.local.get(k))[k];
      a.midiaId = U.uid();
      if (m) await chrome.storage.local.set({ ['midia_' + a.midiaId]: m });
    }
    S.replies = [...S.replies, copy];
    save('respostasRapidas');
  }

  // ----- Respostas rápidas: editor -----
  const newMedia = new Map(); // midiaId -> {nome, mime, dataUrl} ainda não salvos
  const previews = new Map(); // midiaId -> dataUrl para miniatura
  function editorView() {
    const d = view.editing;
    const others = S.replies.filter((r) => r.id !== d.id);
    const move = (i, dir) => { const j = i + dir; if (j < 0 || j >= d.acoes.length) return; [d.acoes[i], d.acoes[j]] = [d.acoes[j], d.acoes[i]]; renderPanel(); };
    const num = (a, k, def, label, suffix = 'Segundos') => h('label', { class: 'inl' }, h('span', null, label),
      h('input', { class: 'in num', type: 'number', min: 0, max: 300, value: a[k] ?? def, oninput: (e) => { a[k] = e.target.value; } }), suffix);
    const txt = (a, k, ph, rows = 4) => h('textarea', { class: 'in', rows, placeholder: ph, value: a[k] || '', oninput: (e) => { a[k] = e.target.value; } });
    const field = (a) => {
      switch (a.tipo) {
        case 'texto': return txt(a, 'texto', 'Mensagem… Variáveis: {saudacao} {nome} {primeiro_nome} {atendente} {data} {hora}');
        case 'imagem': case 'video': case 'audio': case 'documento': {
          const src = previews.get(a.midiaId);
          return [
            src && a.tipo === 'imagem' ? h('img', { class: 'thumb', src }) : null,
            src && a.tipo === 'video' ? h('video', { class: 'thumb', src, controls: true }) : null,
            src && a.tipo === 'audio' ? h('audio', { src, controls: true, style: 'width:100%' }) : null,
            h('label', { class: 'file' }, a.nome ? '📎 ' + a.nome + ' (trocar)' : '📎 Escolher arquivo…',
              h('input', { type: 'file', accept: ACCEPT[a.tipo], onchange: (e) => pickFile(a, e.target.files[0]) })),
            a.tipo === 'imagem' || a.tipo === 'video' ? h('label', { class: 'tog' }, h('span', null, `${ACT[a.tipo].nome} com visualização única`),
              h('input', { type: 'checkbox', checked: a.unica, onchange: (e) => { a.unica = e.target.checked; } }), h('i')) : null,
            a.tipo !== 'audio' ? txt(a, 'legenda', 'Legenda (opcional)', 3) : null,
          ];
        }
        case 'contato': return [
          h('label', { class: 'lb' }, 'Nome', h('input', { class: 'in', value: a.nomeContato || '', oninput: (e) => { a.nomeContato = e.target.value; } })),
          h('label', { class: 'lb' }, 'Número', h('input', { class: 'in', value: a.numero || '', placeholder: '+55 (85) 99999-0000', oninput: (e) => { a.numero = e.target.value; } })),
        ];
        case 'especial': {
          a.sub ||= 'pix';
          const campo = (k, rot, ph, tipo = 'text') => h('label', { class: 'lb' }, rot, h('input', { class: 'in', type: tipo, placeholder: ph || '', value: a[k] || '', oninput: (e) => { a[k] = e.target.value; } }));
          const grupos = S.unicos.flatMap((c) => c.grupos.map((g) => [g, `${c.nomes?.[g] || g.split('@')[0]} · …${g.split('@')[0].slice(-4)}`]));
          return [
            h('select', { class: 'in', onchange: (e) => { a.sub = e.target.value; renderPanel(); } },
              [['pix', '💠 Chave Pix'], ['localizacao', '📍 Localização'], ['enquete', '📊 Enquete'], ['convite', '👥 Convite de grupo']].map(([v, t]) => h('option', { value: v, selected: a.sub === v }, t))),
            ...(a.sub === 'pix' ? [
              h('label', { class: 'lb' }, 'Tipo da chave', h('select', { class: 'in', onchange: (e) => { a.tipoChave = e.target.value; } },
                [['CPF', 'CPF'], ['CNPJ', 'CNPJ'], ['EMAIL', 'E-mail'], ['PHONE', 'Telefone'], ['EVP', 'Aleatória']].map(([v, t]) => h('option', { value: v, selected: (a.tipoChave || 'EVP') === v }, t)))),
              campo('recebedor', 'Nome de quem recebe', 'Ex.: Transportes Poloni'), campo('chave', 'Chave Pix', 'CPF, CNPJ, e-mail, telefone ou chave aleatória')]
              : a.sub === 'localizacao' ? [campo('nomeLocal', 'Nome do local', 'Ex.: Pátio de carregamento'), campo('endereco', 'Endereço (opcional)'), campo('lat', 'Latitude', '-20.3155', 'number'), campo('lng', 'Longitude', '-40.3128', 'number')]
              : a.sub === 'enquete' ? [campo('pergunta', 'Pergunta', 'Quem tem carreta livre amanhã? (aceita {nome})'), txt(a, 'opcoes', 'Uma opção por linha (de 2 a 12)', 4), num(a, 'selecionaveis', 1, 'Escolhas por pessoa', '(0 = quantas quiser)')]
              : [grupos.length ? h('label', { class: 'lb' }, 'Grupo', h('select', { class: 'in', onchange: (e) => { a.grupoId = e.target.value; } },
                  h('option', { value: '' }, 'Escolha o grupo…'), grupos.map(([id, t]) => h('option', { value: id, selected: a.grupoId === id }, t))))
                : h('p', { class: 'hint' }, 'Os grupos vêm dos seus conjuntos: crie um em Grupos › Conjuntos.'),
                campo('legenda', 'Mensagem junto (opcional)')])];
        }
        case 'espera': case 'digitando': case 'gravando': return num(a, 'segundos', 3, 'Duração');
        case 'etiquetaAdd': case 'etiquetaRem':
          return S.labels.length ? h('select', { class: 'in', onchange: (e) => { a.labelId = e.target.value; }, value: a.labelId || '' },
            h('option', { value: '' }, 'Escolha a etiqueta…'), S.labels.map((l) => h('option', { value: l.id }, l.name)))
            : h('p', { class: 'hint' }, 'Etiquetas só existem no WhatsApp Business.');
        case 'resposta':
          return h('select', { class: 'in', onchange: (e) => { a.respostaId = e.target.value; }, value: a.respostaId || '' },
            h('option', { value: '' }, 'Escolha a resposta…'), others.map((r) => h('option', { value: r.id }, r.titulo || '/' + r.atalho)));
        case 'bloquear': return h('p', { class: 'hint dan' }, 'O contato será bloqueado ao executar esta resposta.');
        default: return null;
      }
    };
    const card = (a, i) => h('div', { class: 'acard' },
      h('div', { class: 'ah' }, h('b', null, ACT[a.tipo].ic + ' ' + ACT[a.tipo].tit),
        h('span', null,
          h('button', { class: 'ib', title: 'Subir', onclick: () => move(i, -1) }, icon('up', 16)),
          h('button', { class: 'ib', title: 'Descer', onclick: () => move(i, 1) }, icon('down', 16)),
          h('button', { class: 'ib dan', title: 'Remover', onclick: () => { d.acoes.splice(i, 1); renderPanel(); } }, icon('trash', 16)))),
      SENDS.has(a.tipo) ? num(a, 'digitando', 0, a.tipo === 'audio' ? 'Exibir "gravando" por' : 'Exibir para o cliente que a mensagem está sendo digitada por') : null,
      field(a),
      SENDS.has(a.tipo) ? num(a, 'aguardar', 0, 'Aguarde para chamar a próxima ação por') : null);
    const addMenu = view.addMenu ? h('div', { class: 'amenu' }, GROUPS.map(([g, label, ic]) => {
      const open = view.addGroup === g;
      return [h('button', { class: 'ag', onclick: () => { view.addGroup = open ? null : g; renderPanel(); } }, h('span', null, ic + ' ' + label), icon(open ? 'up' : 'down', 16)),
        open ? h('div', { class: 'agl' }, Object.entries(ACT).filter(([, v]) => v.g === g).map(([k, v]) =>
          h('button', { class: 'ai' + (v.danger ? ' dan' : ''), onclick: () => { d.acoes.push({ id: U.uid(), tipo: k }); view.addMenu = false; renderPanel(); } }, v.ic + ' ' + v.nome))) : null];
    })) : null;
    return [
      h('div', { class: 'eh' }, h('button', { class: 'ib pri', title: 'Voltar', onclick: () => { newMedia.clear(); view.editing = null; renderPanel(); } }, icon('back', 22)),
        h('b', null, d.id ? 'Editar Respostas Rápidas' : 'Criar Respostas Rápidas')),
      h('label', { class: 'lb' }, 'Título', h('input', { class: 'in', value: d.titulo, placeholder: 'Digite o título da resposta rápida', oninput: (e) => { d.titulo = e.target.value; } })),
      h('label', { class: 'lb' }, 'Atalho (use /atalho na conversa)', h('input', { class: 'in', value: d.atalho, placeholder: 'ex: bomdia',
        oninput: (e) => { d.atalho = e.target.value = e.target.value.replace(/[\s/]/g, '').toLowerCase(); } })),
      iaPainel(d),
      h('div', { class: 'abox' },
        h('b', { class: 'abt' }, 'Ação da Resposta Rápida'),
        h('span', { class: 'tag' }, '#Tags: {saudacao} {nome} {primeiro_nome} {atendente} {data} {hora}'),
        d.acoes.length ? d.acoes.map(card) : emptyState('Nenhuma ação foi atribuída', 'Adicione ações para criar e configurar modelos de envio personalizados para seus clientes'),
        h('div', { class: 'amw' }, h('button', { class: 'gbtn' + (view.addMenu ? ' out' : ''), onclick: () => { view.addMenu = !view.addMenu; renderPanel(); } }, 'Adicionar Ação'), addMenu)),
      h('label', { class: 'lb' }, 'Selecione uma categoria', h('select', { class: 'in', value: d.categoriaId || '', onchange: (e) => { d.categoriaId = e.target.value; } },
        h('option', { value: '' }, 'Nenhuma selecionada'), S.cats.map((c) => h('option', { value: c.id }, c.nome)))),
      h('div', { class: 'center' }, h('button', { class: 'gbtn', onclick: saveEditor }, d.id ? 'Salvar' : 'Criar')),
    ];
  }
  function pickFile(a, file) {
    if (!file) return;
    if (file.size > 64 * 1024 * 1024) return toast('Arquivo muito grande (máx. 64 MB).');
    const fr = new FileReader();
    fr.onload = () => {
      const id = U.uid();
      newMedia.set(id, { nome: file.name, mime: file.type || 'application/octet-stream', dataUrl: fr.result });
      previews.set(id, fr.result);
      a.midiaId = id; a.nome = file.name;
      renderPanel();
    };
    fr.onerror = () => toast('Não foi possível ler o arquivo.');
    fr.readAsDataURL(file);
  }
  async function loadPreviews(r) {
    for (const a of r.acoes || []) {
      if (!a.midiaId || previews.has(a.midiaId) || a.tipo === 'documento') continue;
      const k = 'midia_' + a.midiaId;
      const m = (await chrome.storage.local.get(k))[k];
      if (m) previews.set(a.midiaId, m.dataUrl);
    }
    if (view.editing) renderPanel();
  }
  // Item especial: confere os campos antes de salvar
  function validaEspecial(x) {
    if (x.sub === 'pix') return !String(x.chave || '').trim() || !String(x.recebedor || '').trim() ? 'Pix: informe o nome de quem recebe e a chave.' : '';
    if (x.sub === 'localizacao') { const la = Number(x.lat), lo = Number(x.lng); return !(Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && x.lat !== '' && x.lng !== '') ? 'Localização: informe latitude e longitude válidas.' : ''; }
    if (x.sub === 'enquete') { const n = String(x.opcoes || '').split('\n').map((t) => t.trim()).filter(Boolean).length; return !String(x.pergunta || '').trim() || n < 2 || n > 12 ? 'Enquete: informe a pergunta e de 2 a 12 opções (uma por linha).' : ''; }
    if (x.sub === 'convite') return x.grupoId ? '' : 'Convite: escolha o grupo.';
    return 'Item especial: escolha o tipo.';
  }
  async function saveEditor() {
    const d = view.editing;
    if (!d.titulo.trim()) return toast('Digite o título.');
    if (!d.atalho) d.atalho = d.titulo.normalize('NFD').replace(/[^\w]/g, '').toLowerCase().slice(0, 20) || U.uid();
    if (S.replies.some((r) => r.id !== d.id && r.atalho === d.atalho)) return toast(`O atalho /${d.atalho} já existe.`);
    if (!d.acoes.length) return toast('Adicione pelo menos uma ação.');
    const bad = d.acoes.find((a) => U.MEDIA_TYPES.includes(a.tipo) && !a.midiaId);
    if (bad) return toast(`Escolha o arquivo da ação "${ACT[bad.tipo].nome}".`);
    if (d.acoes.some((a) => a.tipo === 'contato' && !U.normalizePhone(a.numero))) return toast('Número do contato inválido.');
    for (const x of d.acoes.filter((y) => y.tipo === 'especial')) { const m = validaEspecial(x); if (m) return toast(m); }
    const others = S.replies.filter((r) => r.id !== d.id);
    if (U.countMedia([...others, d]) > MEDIA_LIMIT) return toast(`Limite de ${MEDIA_LIMIT} mídias nas respostas rápidas.`);

    const used = new Set(d.acoes.map((a) => a.midiaId).filter(Boolean));
    const toSet = {};
    for (const [id, m] of newMedia) if (used.has(id)) toSet['midia_' + id] = m;
    const old = S.replies.find((r) => r.id === d.id);
    const orphan = (old?.acoes || []).map((a) => a.midiaId).filter((id) => id && !used.has(id)).map((id) => 'midia_' + id);
    try {
      await chrome.storage.local.set(toSet);
      if (orphan.length) await chrome.storage.local.remove(orphan);
    } catch (err) { return toast('Erro ao salvar mídia: ' + err.message); }
    newMedia.clear();

    if (!d.id) d.id = U.uid();
    S.replies = old ? S.replies.map((r) => (r.id === d.id ? d : r)) : [...S.replies, d];
    view.editing = null;
    await save('respostasRapidas');
    renderPanel();
    toast('Resposta salva.');
  }

  // ----- Assinatura -----
  function sigView() {
    const upd = (patch) => { S.sig = { ...S.sig, ...patch }; save('assinatura'); renderPanel(); };
    const nome = S.sig.nome || 'John';
    const md = (s) => { // prévia simples do markdown do WhatsApp
      const m = /^(\*_|\*|_|~|```|`)(.*?)(_\*|\*|_|~|```|`)$/.exec(s);
      if (!m) return h('span', null, s);
      const cls = { '*_': 'b i', '*': 'b', _: 'i', '~': 's', '```': 'm', '`': 'm c' }[m[1]];
      return h('span', { class: cls }, m[2]);
    };
    return [
      h('div', { class: 'eh' }, h('b', null, 'Assinatura')),
      h('label', { class: 'tog big' }, h('span', null, 'Assinar automaticamente as mensagens'),
        h('input', { type: 'checkbox', checked: S.sig.ativo, onchange: (e) => upd({ ativo: e.target.checked }) }), h('i')),
      h('label', { class: 'lb' }, 'Nome do atendente', h('input', { class: 'in', value: S.sig.nome, placeholder: 'Ex: John', onchange: (e) => upd({ nome: e.target.value.trim() }) })),
      h('div', { class: 'lb' }, 'Posição'),
      h('div', { class: 'seg' },
        h('button', { class: S.sig.posicao !== 'acima' ? 'on' : '', onclick: () => upd({ posicao: 'linha' }) }, `${nome}: mensagem`),
        h('button', { class: S.sig.posicao === 'acima' ? 'on' : '', onclick: () => upd({ posicao: 'acima' }) }, `${nome}:  ↵  mensagem`)),
      h('div', { class: 'lb' }, 'Estilo da letra'),
      /[*_~`]/.test(S.sig.nome || '') ? h('p', { class: 'hint' }, 'Seu nome já tem formatação (*, _, ~). Nos estilos Negrito/Itálico/Tachado/Código ele vai exatamente como você escreveu.') : null,
      h('div', { class: 'styles' }, Object.entries(U.SIG_STYLES).map(([k, label]) => {
        const sig = U.signature({ nome, estilo: k });
        return h('button', { class: 'sty' + (S.sig.estilo === k ? ' on' : ''), onclick: () => upd({ estilo: k }) },
          h('small', null, label), h('div', { class: 'bubble' }, md(sig), S.sig.posicao === 'acima' ? h('br') : ' ', 'a frase a seguir'));
      })),
      h('p', { class: 'hint' }, 'Vale para mensagens digitadas (Enter ou botão enviar) e textos das respostas rápidas. Os estilos "(fonte)", Serifado, Cursiva, Máquina e Contorno usam letras especiais e aparecem assim em qualquer celular.'),
    ];
  }

  // ----- Iniciar conversa -----
  function startView() {
    const num = h('input', { class: 'in', placeholder: 'Número com DDD, ex: 85 99999-0000', inputmode: 'tel' });
    const msg = h('textarea', { class: 'in', rows: 3, placeholder: 'Mensagem (opcional, fica no campo para você revisar)' });
    const go = async () => {
      const p = U.normalizePhone(num.value);
      if (!p) return toast('Número inválido.');
      if (await startChat(p, msg.value)) { num.value = ''; msg.value = ''; }
    };
    num.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    return [
      h('div', { class: 'eh' }, h('b', null, 'Iniciar conversa')),
      h('label', { class: 'lb' }, 'Número (não precisa estar salvo)', num),
      h('label', { class: 'lb' }, 'Mensagem', msg),
      h('div', { class: 'center' }, h('button', { class: 'gbtn', onclick: go }, 'Abrir conversa')),
      h('p', { class: 'hint' }, 'Sem código do país, o número é tratado como do Brasil (+55). Links wa.me e api.whatsapp.com clicados dentro do WhatsApp também abrem direto aqui, sem nova aba.'),
    ];
  }

  // ----- Enviar para vários (lote) -----
  // Arquivos ficam só na memória (não vão para o storage nem para o backup).
  const STATUS = { id: 'status@broadcast', name: 'Meu status', isStatus: true, isGroup: false };
  const lote = { aba: 'enviar', meus: null, stSel: new Set(), apagando: null, corStatus: '#00a884', files: [], texto: '', sel: new Map(), filtro: 'marcados', q: '', chats: null, intArq: 2, intChat: 5, run: null };
  // Destinos marcados ficam salvos (chave loteDestinos) para os próximos envios.
  const saveSel = () => { S.loteDest = [...lote.sel]; save('loteDestinos'); };
  const fmtBytes = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.ceil(n / 1024) + ' KB');
  const FILE_IC = { image: '🖼️', video: '🎬', audio: '🎤', document: '📄' };
  async function loadLoteChats() {
    lote.chats = [];
    try { lote.chats = await call('listChats'); } catch (e) { toast('Não foi possível listar as conversas: ' + e.message); }
    renderPanel();
  }
  function addLoteFiles(list) {
    for (const file of list) {
      if (file.size > 100 * 1024 * 1024) { toast(`${file.name}: muito grande (máx. 100 MB).`); continue; }
      const fr = new FileReader();
      fr.onload = () => { lote.files.push({ nome: file.name, mime: file.type || 'application/octet-stream', size: file.size, dataUrl: fr.result }); renderPanel(); };
      fr.onerror = () => toast('Não foi possível ler ' + file.name);
      fr.readAsDataURL(file);
    }
  }
  const waitS = async (seg, r) => { for (let t = 0; t < seg * 1000 && !r.cancel; t += 250) await sleep(250); };
  async function runLote() {
    const texto = lote.texto.trim();
    if (!lote.files.length && !texto) return toast('Adicione arquivos ou escreva uma mensagem.');
    if (!lote.sel.size) return toast('Marque pelo menos um grupo ou contato.');
    const total = U.loteTotal(lote.files.length, !!texto, lote.sel.size);
    if (!await confirmar(`Enviar ${lote.files.length} arquivo(s)${texto ? ' + mensagem' : ''} para ${lote.sel.size} conversa(s)? São ${total} envios.`)) return;
    const r = (lote.run = { done: 0, total, atual: '', erros: [], avisos: [], cancel: false, fim: false });
    renderPanel();
    let primeiro = true;
    for (const [id, nome] of lote.sel) {
      if (r.cancel) break;
      if (!primeiro) await waitS(+lote.intChat || 0, r);
      primeiro = false;
      r.atual = nome; renderPanel();
      if (id === STATUS.id) { await loteStatus(texto, r); continue; }
      let passo = 0;
      if (texto && !r.cancel) {
        const t = S.sig.ativo && S.sig.nome ? U.sign(texto, S.sig) : texto;
        try { await call('sendText', id, t); } catch (e) { r.erros.push(`${nome}: mensagem — ${e.message}`); }
        r.done++; passo++; renderPanel();
      }
      for (const f of lote.files) {
        if (r.cancel) break;
        if (passo++) await waitS(+lote.intArq || 0, r);
        if (r.cancel) break;
        try { await call('sendFile', id, f.dataUrl, { type: U.fileType(f.mime), mimetype: f.mime, filename: f.nome }); }
        catch (e) { r.erros.push(`${nome}: ${f.nome} — ${e.message}`); }
        r.done++; renderPanel();
      }
    }
    r.fim = true; r.atual = '';
    // v1.14.6: terminou -> limpa a lista de arquivos (e libera as fotos/vídeos da memória) para o próximo envio começar do zero.
    // Mantém só se CANCELOU ou se NADA saiu (aí dá para tentar de novo sem carregar tudo outra vez). A mensagem de texto fica.
    const nadaSaiu = r.erros.length >= r.total;
    const limpou = !r.cancel && !nadaSaiu && lote.files.length > 0;
    if (limpou) lote.files = [];
    renderPanel();
    toast((r.cancel ? 'Envio cancelado.' : r.erros.length ? `Concluído com ${r.erros.length} falha(s).` : r.avisos.length ? 'Concluído. Veja os avisos.' : 'Envio concluído.')
      + (limpou ? ' Lista de arquivos limpa.' : r.cancel || nadaSaiu ? ' Os arquivos foram mantidos na lista.' : ''));
  }
  // Status: a mensagem vira legenda da 1ª foto/vídeo; sem mídia, vira status de texto. Áudio e documento não vão.
  // A wa-js espera só 30 s pela confirmação de cada status; foto grande/internet lenta estoura esse tempo mesmo
  // com o status saindo. Por isso esse erro vira aviso e, no fim, conferimos na lista de "Meus status".
  const isTimeoutStatus = (e) => /timeout_on_send_status|Timeout for wait response/i.test(e?.message || '');
  // duração de um vídeo (data URL) lida no próprio navegador; 0 se não conseguir
  const duracaoVideo = (dataUrl) => new Promise((ok) => {
    const v = document.createElement('video'); v.preload = 'metadata';
    v.onloadedmetadata = () => ok(v.duration || 0); v.onerror = () => ok(0); v.src = dataUrl; setTimeout(() => ok(0), 4000);
  });
  const contarMeus = async () => (await call('myStatus').catch(() => null))?.length ?? null;
  async function loteStatus(texto, r) {
    const midia = (f) => ['image', 'video'].includes(U.fileType(f.mime));
    const antes = await contarMeus();
    let tentados = 0, pendentes = [];
    const postar = async (kind, data, opts, nome) => {
      tentados++;
      try { await call('sendStatus', kind, data, opts); }
      catch (e) { if (isTimeoutStatus(e)) pendentes.push(nome); else r.erros.push(`Meu status: ${nome} — ${e.message}`); }
    };
    // Avisa ANTES do que costuma falhar: foto/vídeo acima do limite de status do WhatsApp (ou vídeo longo demais) fica "meio enviado"
    // (ack 0) e vira status fantasma. Os limites vêm do próprio WhatsApp (Configurações › Limites do WhatsApp).
    const pular = new Set();
    const lim = await call('limitesWA').catch(() => null);
    if (lim) {
      const acima = [];
      for (const f of lote.files.filter(midia)) {
        const mb = (f.size || 0) / 1048576, dur = U.fileType(f.mime) === 'video' ? await duracaoVideo(f.dataUrl) : 0, why = [];
        if (lim.statusMidiaMB && mb > lim.statusMidiaMB) why.push(`${mb.toFixed(1)} MB (limite ${lim.statusMidiaMB} MB)`);
        if (lim.statusVideoSeg && dur > lim.statusVideoSeg + 0.5) why.push(`${Math.round(dur)} s (limite ${lim.statusVideoSeg} s)`);
        if (why.length) acima.push([f, why.join(' · ')]);
      }
      if (acima.length && !await confirmar(`${acima.length} arquivo(s) passam do limite de status do WhatsApp:\n\n${acima.map(([f, w]) => `• ${f.nome}: ${w}`).join('\n')}\n\nEnviar assim costuma falhar e deixar um status "fantasma".\nOK = enviar mesmo assim · Cancelar = pular esses.`))
        for (const [f, w] of acima) { pular.add(f); r.erros.push(`Meu status: ${f.nome} — pulado: passa do limite do WhatsApp (${w})`); }
    }
    let legenda = texto;
    if (texto) {
      if (!lote.files.some(midia)) { await postar('text', texto, { backgroundColor: lote.corStatus }, 'texto'); legenda = ''; }
      r.done++; renderPanel();
    }
    let passo = 0;
    for (const f of lote.files) {
      if (r.cancel) break;
      if (!midia(f)) { r.erros.push(`Meu status: ${f.nome} — o status só aceita foto, vídeo ou texto`); r.done++; continue; }
      if (pular.has(f)) { r.done++; continue; }
      if (passo++) await waitS(+lote.intArq || 0, r);
      const opts = legenda ? { caption: legenda } : {};
      legenda = '';
      await postar(U.fileType(f.mime), f.dataUrl, opts, f.nome);
      if (pendentes.length) r.avisos = pendentes.map((n) => `Meu status: ${n} — enviado, aguardando confirmação do WhatsApp`);
      r.done++; renderPanel();
    }
    if (!pendentes.length || antes === null) return;
    r.atual = 'Meu status (conferindo publicação)…'; renderPanel();
    await sleep(8000); // dá tempo do WhatsApp terminar de subir as mídias
    const depois = await contarMeus();
    const publicados = depois === null ? null : Math.max(0, depois - antes);
    if (publicados === null) return;
    const faltam = tentados - publicados - r.erros.filter((e) => e.startsWith('Meu status')).length;
    r.avisos = faltam > 0
      ? [`Meu status: ${publicados} de ${tentados} publicados. ${faltam} ainda não apareceram — confira em "Meus status" em alguns minutos.`]
      : [`Meu status: todos os ${publicados} foram publicados (o WhatsApp só demorou para confirmar).`];
  }

  // ----- Meus status: listar e apagar vários -----
  let meusBusy = false;
  async function loadMeus() {
    if (meusBusy) return;
    meusBusy = true;
    let lista = [];
    try { lista = await call('myStatus'); } catch (e) { toast('Não foi possível ler seus status: ' + e.message); }
    meusBusy = false;
    lote.meus = lista;
    lote.stSel = new Set([...lote.stSel].filter((id) => lote.meus.some((m) => m.id === id)));
    renderPanel();
  }
  async function apagarStatus() {
    const ids = [...lote.stSel];
    if (!ids.length) return toast('Marque os status que quer apagar.');
    if (!await confirmar(`Apagar ${ids.length} status? Eles somem para todos os seus contatos e não dá para desfazer.`)) return;
    const a = (lote.apagando = { done: 0, total: ids.length, erros: 0 });
    renderPanel();
    let locais = 0;
    for (const id of ids) {
      try { if (/^local/.test(await call('removeStatus', id))) locais++; lote.stSel.delete(id); } catch (e) { a.erros++; a.msg = e.message; }
      a.done++; renderPanel();
      await sleep(800);
    }
    lote.apagando = null;
    const ok = a.done - a.erros;
    toast((a.erros ? `${ok} apagados, ${a.erros} falharam: ${a.msg}` : `${ok} status apagados.`) +
      (locais ? ` (${locais} ${locais > 1 ? 'nunca tinham sido publicados: só saíram' : 'nunca tinha sido publicado: só saiu'} da lista)` : ''), a.erros || locais ? 8000 : 3500);
    loadMeus();
    setTimeout(async () => { // o WhatsApp às vezes recria o status: confere de novo e avisa
      const l = await call('myStatus').catch(() => null); if (!l) return;
      const voltaram = l.filter((m) => ids.includes(m.id));
      lote.meus = l; renderPanel();
      if (voltaram.length) toast(`↩ ${voltaram.length} status voltaram sozinhos depois de apagados (o WhatsApp recriou ou sincronizou). Estão marcados com ↩. Tente apagar de novo; se insistir, baixe o relatório em Configurações › Diagnóstico e envie.`, 12000);
    }, 6000);
  }
  const ST_IC = { image: '🖼️', video: '🎬', chat: '💬', ptt: '🎤', audio: '🎤' };
  function meusStatusView() {
    if (lote.meus === null) loadMeus();
    const lista = lote.meus || [];
    const a = lote.apagando;
    const hora = (t) => new Date(t * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return h('div', { class: 'sec' },
      h('div', { class: 'sh' }, h('b', null, 'Meus status (últimas 24h)'), h('span', { class: 'pill' + (lote.stSel.size ? ' on' : '') }, `${lote.stSel.size}/${lista.length}`)),
      h('div', { class: 'rowf' },
        h('button', { class: 'obtn', onclick: () => { lista.forEach((m) => lote.stSel.add(m.id)); renderPanel(); } }, 'Marcar todos'),
        h('button', { class: 'obtn', onclick: () => { lote.stSel.clear(); renderPanel(); } }, 'Desmarcar'),
        h('span', { class: 'grow' }),
        h('button', { class: 'ib', title: 'Recarregar', onclick: () => { lote.meus = null; renderPanel(); } }, '↻')),
      h('div', { class: 'stbar' }, a
        ? [h('div', { class: 'prog' }, h('i', { style: `width:${Math.round((a.done / a.total) * 100)}%` })),
          h('p', { class: 'hint' }, `Apagando ${a.done}/${a.total}…${a.erros ? ` · ${a.erros} falharam` : ''}`)]
        : h('button', { class: 'gbtn dang', onclick: apagarStatus, disabled: !lote.stSel.size }, `Apagar selecionados (${lote.stSel.size})`)),
      lote.meus === null ? h('p', { class: 'hint' }, 'Carregando seus status…')
        : lista.length ? h('div', { class: 'stgrid' }, lista.map((m) => h('label', { class: 'stc' + (lote.stSel.has(m.id) ? ' on' : ''), title: `ack ${m.ack ?? '?'}${m.temMidia === false ? ' · sem arquivo' : ''}${m.voltou ? ' · voltou depois de apagado' : ''}` },
          h('input', { type: 'checkbox', checked: lote.stSel.has(m.id), onchange: (e) => { e.target.checked ? lote.stSel.add(m.id) : lote.stSel.delete(m.id); renderPanel(); } }),
          m.thumb ? h('img', { src: m.thumb, onerror: (e) => { e.target.replaceWith(h('div', { class: 'sttxt' }, ST_IC[m.type] || '•')); } }) : h('div', { class: 'sttxt', style: m.bg ? `background:${m.bg}` : '' }, (m.text || ST_IC[m.type] || '•').slice(0, 80)),
          h('small', null, `${ST_IC[m.type] || '•'} ${hora(m.t)}`, m.publicado ? null : h('em', { class: 'np', title: 'Este envio não chegou ao WhatsApp (seus contatos não veem). Apagar só tira da lista.' }, ' não publicado'),
            m.voltou ? h('em', { class: 'np', title: 'Você já apagou este status e ele VOLTOU sozinho (o WhatsApp recriou ou sincronizou). Tente apagar de novo; se insistir, baixe o relatório em Configurações › Diagnóstico.' }, ' ↩ voltou') : null,
            m.temMidia === false ? h('em', { class: 'np', title: 'O WhatsApp não tem o arquivo deste status (por isso a miniatura não aparece).' }, ' sem arquivo') : null))))
          : h('p', { class: 'empty' }, 'Você não tem status publicados agora.'));
  }

  function loteView() {
    const abas = h('div', { class: 'seg' },
      h('button', { class: lote.aba === 'enviar' ? 'on' : '', onclick: () => { lote.aba = 'enviar'; renderPanel(); } }, 'Enviar'),
      h('button', { class: lote.aba === 'status' ? 'on' : '', onclick: () => { lote.aba = 'status'; lote.meus = null; renderPanel(); } }, 'Meus status'));
    if (lote.aba === 'status' && !lote.run) return [h('div', { class: 'eh' }, h('b', null, 'Enviar para vários')), abas, meusStatusView()];
    const r = lote.run;
    if (r) {
      const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
      return [
        h('div', { class: 'eh' }, h('b', null, 'Enviar para vários')),
        h('div', { class: 'sec' },
          h('div', { class: 'sh' }, h('b', null, r.fim ? (r.cancel ? 'Cancelado' : 'Concluído') : 'Enviando…'), h('span', { class: 'pill' }, `${r.done}/${r.total}`)),
          h('div', { class: 'prog' }, h('i', { style: `width:${pct}%` })),
          r.atual ? h('p', { class: 'hint' }, 'Agora: ' + r.atual) : null,
          r.avisos.length ? h('div', { class: 'errs warn' }, h('b', null, `Avisos (${r.avisos.length})`), r.avisos.map((e) => h('small', null, e))) : null,
          r.erros.length ? h('div', { class: 'errs' }, h('b', null, `Falhas (${r.erros.length})`), r.erros.map((e) => h('small', null, e))) : null,
          h('div', { class: 'center' }, r.fim
            ? [h('button', { class: 'gbtn out', onclick: () => { lote.run = null; renderPanel(); } }, 'Voltar'),
              h('button', { class: 'gbtn', onclick: () => { lote.run = null; lote.files = []; lote.texto = ''; renderPanel(); } }, 'Novo envio')]
            : h('button', { class: 'gbtn out', onclick: () => { r.cancel = true; } }, 'Cancelar'))),
      ];
    }
    if (!lote.chats) loadLoteChats();
    if (lote.filtro === 'marcados' && !lote.sel.size) lote.filtro = 'grupos';
    const q = lote.q.toLowerCase();
    const visiveis = [STATUS, ...(lote.chats || [])].filter((c) =>
      (lote.filtro === 'todos' || (lote.filtro === 'marcados' ? lote.sel.has(c.id) : c.isStatus ? lote.filtro === 'grupos' : lote.filtro === 'grupos' ? c.isGroup : !c.isGroup)) &&
      (!q || c.name.toLowerCase().includes(q)));
    const total = lote.files.reduce((n, f) => n + f.size, 0);
    const busca = h('input', { class: 'in lq', placeholder: 'Pesquisar grupo ou contato', value: lote.q, oninput: (e) => {
      lote.q = e.target.value; renderPanel();
      const el = panelRoot.querySelector('.lq'); el?.focus(); el?.setSelectionRange(lote.q.length, lote.q.length);
    } });
    const chip = (k, label) => h('button', { class: 'fchip' + (lote.filtro === k ? ' on' : ''), onclick: () => { lote.filtro = k; renderPanel(); } }, label);
    return [
      h('div', { class: 'eh' }, h('b', null, 'Enviar para vários')),
      abas,
      h('div', { class: 'sec' },
        h('div', { class: 'sh' }, h('b', null, '1. Arquivos'), h('span', { class: 'pill' }, `${lote.files.length} · ${fmtBytes(total)}`)),
        lote.files.length ? h('div', { class: 'files' }, lote.files.map((f, i) => h('div', { class: 'fi', title: f.nome },
          U.fileType(f.mime) === 'image' ? h('img', { src: f.dataUrl }) : h('span', { class: 'fic' }, FILE_IC[U.fileType(f.mime)]),
          h('small', null, f.nome),
          h('button', { class: 'fx', title: 'Remover', onclick: () => { lote.files.splice(i, 1); renderPanel(); } }, icon('x', 12))))) : null,
        h('label', { class: 'file' }, '📎 Adicionar fotos, vídeos, áudios ou documentos…',
          h('input', { type: 'file', multiple: true, onchange: (e) => { addLoteFiles([...e.target.files]); e.target.value = ''; } })),
        h('textarea', { class: 'in', rows: 3, placeholder: 'Mensagem (opcional, enviada antes dos arquivos)', value: lote.texto, oninput: (e) => { lote.texto = e.target.value; } }),
        ligado('cargas') ? h('div', { class: 'rowf' },
          h('button', { class: 'obtn', onclick: async () => { const t = await buscarListaCargas(); if (t) { lote.texto = t; renderPanel(); toast('Lista de frete na mensagem.'); } } }, '🚚 Puxar lista de frete'),
          h('button', { class: 'obtn', onclick: async () => {
            const id = (await perguntar('ID da carga (ex: 9DA62645):') || '').trim();
            const t = id && await buscarListaCargas(id); if (t) { lote.texto = t; renderPanel(); toast(`Anúncio da carga ${id} na mensagem.`); }
          } }, '🔎 Anúncio por ID')) : null),
      h('div', { class: 'sec' },
        h('div', { class: 'sh' }, h('b', null, '2. Para quem'), h('span', { class: 'pill' + (lote.sel.size ? ' on' : '') }, `${lote.sel.size} salvos`)),
        h('div', { class: 'fchips' }, chip('marcados', `Marcados (${lote.sel.size})`), chip('grupos', 'Grupos'), chip('contatos', 'Contatos'), chip('todos', 'Todos'),
          h('button', { class: 'ib', title: 'Recarregar conversas', onclick: () => { lote.chats = null; renderPanel(); } }, '↻')),
        busca,
        h('div', { class: 'rowf' },
          h('button', { class: 'obtn', onclick: () => { visiveis.slice(0, 300).forEach((c) => lote.sel.set(c.id, c.name)); saveSel(); renderPanel(); } }, 'Marcar visíveis'),
          h('button', { class: 'obtn', onclick: async () => { if (await confirmar('Desmarcar todos os destinos salvos?')) { lote.sel.clear(); saveSel(); renderPanel(); } } }, 'Limpar')),
        lote.sel.has(STATUS.id) ? h('label', { class: 'inl' }, h('span', null, '📢 Cor do fundo do status de texto'),
          h('input', { type: 'color', class: 'clr', value: lote.corStatus, onchange: (e) => { lote.corStatus = e.target.value; } })) : null,
        h('div', { class: 'dest' }, lote.chats === null
          ? h('p', { class: 'hint' }, 'Carregando conversas…')
          : visiveis.length ? visiveis.slice(0, 300).map((c) => h('label', { class: 'chk' + (lote.sel.has(c.id) ? ' on' : '') },
            h('input', { type: 'checkbox', checked: lote.sel.has(c.id), onchange: (e) => { e.target.checked ? lote.sel.set(c.id, c.name) : lote.sel.delete(c.id); saveSel(); renderPanel(); } }),
            h('span', { class: 'grow' }, (c.isStatus ? '📢 ' : c.isGroup ? '👥 ' : '👤 ') + c.name)))
            : h('p', { class: 'hint' }, 'Nada encontrado.'))),
      h('div', { class: 'sec' },
        h('div', { class: 'sh' }, h('b', null, '3. Intervalos')),
        h('label', { class: 'inl' }, h('span', null, 'Entre um arquivo e outro'), h('input', { class: 'in num', type: 'number', min: 0, max: 120, value: lote.intArq, oninput: (e) => { lote.intArq = e.target.value; } }), 'seg'),
        h('label', { class: 'inl' }, h('span', null, 'Entre uma conversa e outra'), h('input', { class: 'in num', type: 'number', min: 0, max: 600, value: lote.intChat, oninput: (e) => { lote.intChat = e.target.value; } }), 'seg'),
        h('p', { class: 'hint' }, 'Os destinos marcados ficam salvos para os próximos envios. Intervalos maiores reduzem o risco de bloqueio do WhatsApp. Use para grupos e contatos que já conversam com você.')),
      h('div', { class: 'center' }, h('button', { class: 'gbtn', onclick: runLote },
        `Enviar ${U.loteTotal(lote.files.length, !!lote.texto.trim(), lote.sel.size) || ''} mensagens`.replace('Enviar  ', 'Enviar '))),
    ];
  }

  // ----- Conversas fixadas -----
  function pinsView() {
    const listEl = h('div', { class: 'col' });
    const act = S.active?.id;
    (async () => {
      const names = new Map();
      if (S.ready && S.pins.length) for (const c of await call('chatInfo', S.pins)) names.set(c.id, c.name);
      listEl.replaceChildren(...(S.pins.length ? S.pins.map((id, i) => h('div', { class: 'card pinrow' },
        h('div', { class: 'grow col1' },
          h('span', { class: 'link', onclick: () => call('openChat', id) }, '📌 ' + (names.get(id) || id.split('@')[0])),
          h('select', { class: 'in sm', title: 'Em qual aba da lista esta conversa fica no topo', onchange: (e) => escopoFixada(id, e.target.value) },
            U.escoposDe(id).map((k) => h('option', { value: k, selected: k === (S.pinAbas?.[id] || 'todas') }, U.ESCOPOS[k])))),
        h('button', { class: 'ib', title: 'Subir', onclick: () => { if (i) { const p = [...S.pins]; [p[i - 1], p[i]] = [p[i], p[i - 1]]; S.pins = p; save('pinChat'); } } }, icon('up', 16)),
        h('button', { class: 'ib dan', title: 'Desafixar', onclick: () => togglePin(id) }, icon('x', 16)))) : [h('p', { class: 'empty' }, 'Nenhuma conversa fixada.')]));
    })();
    return [
      h('div', { class: 'eh' }, h('b', null, 'Conversas fixadas')),
      h('div', { class: 'rowf' }, h('span', { class: 'hint grow' }, S.pins.length ? `${S.pins.length} fixada(s)` : ''),
        act ? h('button', { class: 'obtn', onclick: () => togglePin(act) }, S.pins.includes(act) ? 'Desafixar atual' : (String(act).endsWith('@g.us') ? 'Fixar atual (aba Grupos)' : 'Fixar atual')) : null),
      h('p', { class: 'hint' }, 'Sem o limite de 3 do WhatsApp (só neste computador). Cada conversa fica no topo só da aba escolhida: um grupo "só na aba Grupos" não aparece fixado em Todas. Use o 📌 no cabeçalho da conversa.'),
      (() => { const n = S.pins.filter((i) => String(i).endsWith('@g.us') && !S.pinAbas?.[i]).length;
        return n ? h('button', { class: 'obtn', onclick: () => { const a = { ...S.pinAbas }; S.pins.forEach((i) => { if (String(i).endsWith('@g.us') && !a[i]) a[i] = 'grupos'; }); S.pinAbas = a; save('pinAbas'); applyPins(); renderPanel(); } }, `Mover ${n} grupo(s) fixado(s) para só a aba Grupos`) : null; })(),
      listEl,
    ];
  }

  // ----- Lista de frete (planilha Google) -----
  // O Apps Script da planilha publica a mesma lista do botão "Copiar Lista"; o background busca (permissão de host).
  // id vazio = lista de todas as cargas abertas; com id = anúncio daquela carga (planilha/AtendeZap.gs)
  async function buscarListaCargas(id = '') {
    if (!S.cargasUrl) { toast('Cole o link do app da planilha em ⚙ Atendimento › Lista de frete.'); openPanel('config'); return null; }
    toast(id ? `🚚 Buscando a carga ${id}…` : '🚚 Buscando a lista de frete…');
    const url = S.cargasUrl.split('?')[0] + (id ? '?id=' + encodeURIComponent(id) : '');
    const r = await chrome.runtime.sendMessage({ tipo: 'buscarLista', url }).catch((e) => ({ erro: e.message }));
    const texto = String(r?.texto || '').trim();
    if (r?.erro || !texto) { toast('Não foi possível buscar a lista: ' + (r?.erro || 'a planilha devolveu vazio')); return null; }
    if (/^<!doctype|<html/i.test(texto)) { toast('A planilha devolveu uma página, não a lista: confira se o app da Web está liberado para "Qualquer pessoa".'); return null; }
    if (/^(ERRO|AVISO)\b/.test(texto)) { toast(texto); return null; }   // mensagens do AtendeZap.gs
    return texto;
  }
  async function listaNaConversa(porId) {
    const id = porId ? (await perguntar('ID da carga (ex: 9DA62645):') || '').trim() : '';
    if (porId && !id) return;
    const texto = await buscarListaCargas(id);
    if (!texto) return;
    try { await call('setInputText', texto); toast('Lista no campo de mensagem: confira e aperte Enter.'); } catch (e) { toast('Erro: ' + e.message); }
  }

  // ----- Configurações -----
  const MODULOS = [
    ['replies', 'Respostas rápidas', 'Painel de respostas, /atalho no campo e o ⚡ no topo da conversa.'],
    ['fila', 'Aguardando resposta', 'Lista de clientes esperando resposta e o contador na barra.'],
    ['sig', 'Assinatura', 'Coloca seu nome antes das mensagens enviadas.'],
    ['start', 'Iniciar conversa', 'Abrir conversa com número não salvo e links wa.me pelo WhatsApp.'],
    ['lote', 'Enviar para vários', 'Envio de arquivos e textos para vários grupos/contatos e status.'],
    ['pins', 'Fixadas', 'Fixar sem limite e o 📌 no topo da conversa.'],
    ['exportar', 'Exportar conversa', 'Exporta as mensagens e a mídia (fotos, áudios, vídeos, documentos) de uma conversa, num intervalo de data e hora que você escolhe (ex.: 21/10 das 18:00 às 19:30), em um arquivo .zip.', 'teste'],
    ['contato', 'Contato do cliente', 'Mostra o contato da conversa aberta e o aparelho PROVÁVEL dele (Android, iPhone ou WhatsApp Web): é um palpite pelo formato das mensagens, não uma informação do WhatsApp.', 'teste'],
    ['ocultas', 'Ocultas', 'Ocultar conversas, o 🙈 e o item no botão direito.'],
    ['apagar', 'Apagar mensagens', 'Apaga PARA TODOS as suas mensagens enviadas na conversa aberta, mesmo depois do prazo normal do WhatsApp (experimental: o servidor do WhatsApp decide se aceita).', 'teste'],
    ['recuperar', 'Recuperar apagadas', 'Guarda, só neste computador e por alguns dias, uma cópia das mensagens que os contatos APAGAREM para todos (texto, miniatura da foto e, se você permitir, foto ou áudio) para você ler depois. Vem desligado: você liga lá dentro.', 'teste'],
    ['backup', 'Backup', 'Backup manual e automático das suas configurações.'],
    ['lab', 'Laboratório', 'Liga recursos escondidos do próprio WhatsApp para você experimentar (um de cada vez). Ainda não sabemos o que cada um faz.', 'teste'],
    ['gruposSo', 'Grupos só na aba Grupos', 'Os grupos aparecem apenas na aba Grupos (fixados ou não). Nas abas Tudo, Não lidas e Favoritas eles somem; a busca, as listas que você criou e as Arquivadas continuam mostrando.'],
    ['atendente', 'Atendente IA', 'Robô que atende os contatos com a IA (aba dentro de Respostas rápidas). Vem desligado: você liga e treina por lá.'],
    ['escuta', 'Escuta automática', 'Lê as suas conversas de tempos em tempos e guarda, sem dados pessoais, o que o cliente perguntou e o que você respondeu, para a IA propor aprendizados (você aprova). Fica na Memória IA; vem desligada.', 'teste'],
    ['vagas', 'Vagas nos grupos', 'Mostra quantas vagas faltam para encher cada grupo (na lista de conversas e no topo do grupo).'],
    ['pedidos', 'Pedidos de grupos', 'Aprovar todos os pedidos para entrar nos grupos de uma vez, sem duplicar quem já está em grupo igual.'],
    ['cargas', 'Lista de frete', 'Botão 🚚 que puxa a lista da sua planilha Google para a conversa ou para o envio em vários.'],
    ['resumo', 'Resumo do que perdi', 'A IA lê as mensagens NÃO LIDAS das conversas individuais e diz, em poucas palavras, o que cada pessoa quer e o que fazer primeiro. Só resume: não responde a ninguém. Fica em Atendimento › Resumo.', 'teste'],
    ['ligacao', 'Ligação → mensagem automática', 'Quando alguém LIGAR e você não falou com a pessoa, manda UMA mensagem curta pedindo que escreva. Nunca atende nem recusa a chamada, nunca em grupo. Fica em Atendimento › Aguardando; vem desligada.', 'teste'],
    ['avaliacao', 'Avaliação do atendimento', 'Confere o que você respondeu nas conversas contra a memória aprendida, mostra quem ficou sem resposta e o tempo de resposta. Sem IA e sem nota para ninguém. Fica em Diagnóstico › Avaliação.', 'teste'],
  ];

  // ----- Pedidos para entrar nos grupos (v1.12) -----
  // Procura os grupos em que você é admin com pedidos pendentes, mostra uma PRÉVIA e só então aprova (em lotes de 20, com pausa).
  // Conjuntos "sem duplicar" (aba ao lado): quem já está em outro grupo do conjunto, ou acabou de ser aprovado em um, não entra.
  const grp = { fase: 'idle', pedidos: [], sel: new Set(), plano: null, resumo: null, recusar: false, erro: '', excedente: true, convites: [], convRes: null };
  const conjuntosIds = () => (S.unicos || []).map((c) => c.grupos).filter((g) => g?.length > 1);
  async function procurarPedidos(soAtual) {
    if (soAtual && !String(S.active?.id).endsWith('@g.us')) return toast('Abra um grupo primeiro.');
    grp.fase = 'procurando'; grp.erro = ''; grp.plano = null; grp.resumo = null; renderPanel();
    try {
      grp.pedidos = await call('pedidosLista', soAtual ? [S.active.id] : []);
      grp.sel = new Set(grp.pedidos.map((p) => p.id)); grp.fase = 'lista';
    } catch (e) { grp.erro = 'Não consegui procurar: ' + e.message; grp.fase = 'idle'; }
    renderPanel();
  }
  async function previaPedidos() {
    grp.fase = 'montando'; grp.erro = ''; renderPanel();
    try { grp.plano = await call('pedidosPlano', grp.pedidos.filter((p) => grp.sel.has(p.id)).map((p) => p.id), conjuntosIds(), { executar: false, excedente: grp.excedente }); grp.fase = 'plano'; }
    catch (e) { grp.erro = 'Não consegui montar a prévia: ' + e.message; grp.fase = 'lista'; }
    renderPanel();
  }
  const soma = (l, k) => l.reduce((n, g) => n + (g[k]?.length ?? g[k] ?? 0), 0);
  async function aprovarPedidos() {
    const total = soma(grp.plano, 'aprovar'), redir = soma(grp.plano, 'redirecionar'), dup = soma(grp.plano, 'duplicados');
    if (!total && !redir && !(grp.recusar && dup)) return toast('Ninguém para aprovar.');
    if (!await confirmar(`Aprovar ${total} pessoa(s) em ${grp.plano.filter((g) => g.aprovar.length).length} grupo(s)` + (redir ? `\nE ADICIONAR ${redir} direto em outro grupo do conjunto (quem a privacidade bloquear fica pendente com um convite pronto).` : '')
      + (dup ? `\n${dup} duplicada(s) ${grp.recusar ? 'serão RECUSADAS' : 'ficam pendentes'}.` : '') + '?')) return;
    grp.fase = 'executando'; renderPanel();
    try {
      grp.resumo = await call('pedidosPlano', grp.plano.map((g) => g.id), conjuntosIds(), { executar: true, recusar: grp.recusar, excedente: grp.excedente });
      grp.convites = grp.resumo.flatMap((g) => g.convites || []); grp.convRes = null; grp.fase = 'fim';
    } catch (e) { grp.erro = 'Erro ao aprovar: ' + e.message; grp.fase = 'plano'; }
    renderPanel();
  }
  // convites exclusivos (cartão nativo) para quem a privacidade não deixou adicionar: poucos por vez e com pausa
  async function enviarConvitesPriv() {
    if (!grp.convites.length) return;
    if (!await confirmar(`Enviar o convite do grupo (cartão do WhatsApp) para ${Math.min(20, grp.convites.length)} pessoa(s) que a privacidade não deixou adicionar?\n\nVão 20 por vez, com pausa. Elas pediram para entrar num grupo do conjunto, mas mandar mensagem para quem não é contato em grande quantidade pode levar o WhatsApp a restringir o número.`)) return;
    grp.fase = 'enviandoConv'; renderPanel();
    try { grp.convRes = await call('enviarConvites', grp.convites, ''); grp.convites = grp.convites.slice(20); }
    catch (e) { grp.convRes = { erro: e.message }; }
    grp.fase = 'fim'; renderPanel();
  }
  function pedidosView() {
    const f = grp.fase, ocupado = ['procurando', 'montando', 'executando', 'enviandoConv'].includes(f), nConj = conjuntosIds().length;
    const aberto = String(S.active?.id).endsWith('@g.us');
    const lista = (titulo, itens) => (itens?.length ? h('details', { class: 'tec' }, h('summary', null, titulo), itens.map((x) => h('small', null, x))) : null);
    const resumoG = (g, fim) => h('div', { class: 'card pedplano' }, h('div', { class: 'grow' }, h('b', null, g.name),
      h('small', null, fim
        ? `✔ ${g.aprovados} aprovado(s)` + (g.adicionados ? ` · ➜ ${g.adicionados} adicionado(s) em outro grupo` : '') + (g.privacidade ? ` · 🔒 ${g.privacidade} por privacidade` : '') + (g.jaEra ? ` · ${g.jaEra} já eram membros` : '')
          + (g.aguardando ? ` · ${g.aguardando} aguardando aprovação` : '') + (g.duplicados.length ? ` · ⚠ ${g.duplicados.length} duplicado(s) ${g.recusados ? 'recusado(s)' : 'deixado(s) pendente(s)'}` : '')
          + (g.semVaga.length ? ` · ${g.semVaga.length} sem vaga (pendentes)` : '') + (g.falhas ? ` · ✖ ${g.falhas} falha(s)` : '')
        : `${g.pedidos} pedido(s) · ${g.vagas} vaga(s): ✔ ${g.aprovar.length} entram` + (g.redirecionar.length ? ` · ➜ ${g.redirecionar.length} para outro grupo` : '') + (g.semVaga.length ? ` · ${g.semVaga.length} sem vaga` : '') + (g.duplicados.length ? ` · ⚠ ${g.duplicados.length} duplicado(s)` : '')),
      g.erro ? h('small', { class: 'dan' }, g.erro) : null,
      fim ? null : lista('ver para onde vão', g.redirecionar.map((r) => `${r.quem} ➜ ${r.destNome}`)),
      lista('ver duplicados', g.duplicados.map((d) => `${d.quem} já está em ${d.ja}`)),
      fim ? null : lista('sem vaga (continuam pendentes)', g.semVaga)));
    const somaSel = grp.pedidos.filter((p) => grp.sel.has(p.id)).reduce((n, p) => n + p.n, 0);
    const totalOk = grp.plano ? soma(grp.plano, 'aprovar') : 0, totalRedir = grp.plano ? soma(grp.plano, 'redirecionar') : 0, totalDup = grp.plano ? soma(grp.plano, 'duplicados') : 0;
    const chkExc = h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: grp.excedente, disabled: !nConj || ocupado,
      onchange: (e) => { grp.excedente = e.target.checked; if (f === 'plano') previaPedidos(); else renderPanel(); } }),
    nConj ? 'Se o grupo encher, adicionar o excedente direto em outro grupo do conjunto (o que tiver mais vagas)' : 'Para mandar o excedente a outro grupo, crie um conjunto na aba Conjuntos');
    return [
      h('p', { class: 'hint' }, 'Aprove de uma vez os pedidos para entrar nos grupos em que você é admin. Só aprovo até caber (o WhatsApp recusa o que passa do limite) e você vê uma prévia antes.'
        + (nConj ? ` Há ${nConj} conjunto(s): quem já está em um grupo do conjunto não entra em outro.` : ' Dica: na aba "Conjuntos" você grava os grupos de mesmo conteúdo.')),
      grp.erro ? h('p', { class: 'hint dan' }, grp.erro) : null,
      h('div', { class: 'rowf' },
        h('button', { class: 'gbtn sm', disabled: !S.ready || ocupado, onclick: () => procurarPedidos(false) }, '🔎 Procurar em todos os meus grupos'),
        aberto ? h('button', { class: 'obtn', disabled: ocupado, onclick: () => procurarPedidos(true) }, 'Só o grupo aberto') : null),
      f === 'procurando' ? h('p', { class: 'hint' }, 'Procurando pedidos… com muitos grupos pode levar alguns segundos.') : null,
      f === 'montando' ? h('p', { class: 'hint' }, 'Montando a prévia (conferindo vagas e quem já está nos grupos do conjunto)…') : null,
      f === 'executando' ? h('p', { class: 'hint' }, 'Aprovando e adicionando aos poucos… não feche o WhatsApp até terminar.') : null,
      f === 'enviandoConv' ? h('p', { class: 'hint' }, 'Enviando os convites, um a um, com pausa…') : null,
      f === 'lista' ? (grp.pedidos.length ? [
        h('div', { class: 'col' }, grp.pedidos.map((p) => h('label', { class: 'card pedg' },
          h('input', { type: 'checkbox', checked: grp.sel.has(p.id), onchange: (e) => { if (e.target.checked) grp.sel.add(p.id); else grp.sel.delete(p.id); renderPanel(); } }),
          h('span', { class: 'grow' }, p.name), h('span', { class: 'pill on' }, p.n)))),
        chkExc,
        h('div', { class: 'center' }, h('button', { class: 'gbtn', disabled: !grp.sel.size, onclick: previaPedidos }, `Ver prévia (${somaSel} pedidos)`)),
      ] : h('p', { class: 'empty' }, '🎉 Nenhum pedido pendente.')) : null,
      f === 'plano' ? [
        h('div', { class: 'col' }, grp.plano.map((g) => resumoG(g, false))),
        chkExc,
        totalDup ? h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: grp.recusar, onchange: (e) => { grp.recusar = e.target.checked; } }), 'Recusar também os duplicados (desmarcado: ficam pendentes)') : null,
        h('div', { class: 'rowf' },
          h('button', { class: 'obtn', onclick: () => { grp.fase = 'lista'; renderPanel(); } }, '← Voltar'),
          h('button', { class: 'gbtn grow', disabled: !totalOk && !totalRedir && !(grp.recusar && totalDup), onclick: aprovarPedidos }, `✔ Aprovar ${totalOk}` + (totalRedir ? ` e adicionar ${totalRedir}` : '') + ' agora')),
      ] : null,
      f === 'fim' ? [
        h('div', { class: 'col' }, grp.resumo.map((g) => resumoG(g, true))),
        grp.convRes ? h('p', { class: 'hint' + (grp.convRes.erro || grp.convRes.falhas ? ' dan' : '') },
          grp.convRes.erro ? 'Erro ao enviar convites: ' + grp.convRes.erro : `Convites: ✔ ${grp.convRes.enviados} enviado(s)` + (grp.convRes.falhas ? ` · ✖ ${grp.convRes.falhas} falha(s) (${(grp.convRes.erros || []).join('; ')})` : '')) : null,
        grp.convites.length ? h('div', { class: 'card pedplano' }, h('div', { class: 'grow' }, h('b', null, `🔒 ${grp.convites.length} pessoa(s) com privacidade fechada`),
          h('small', null, 'Não puderam ser adicionadas direto, mas o WhatsApp já gerou um convite exclusivo para cada uma. Você pode mandar o cartão do grupo para elas (20 por vez).'),
          h('button', { class: 'gbtn sm', onclick: enviarConvitesPriv }, `Enviar convite para ${Math.min(20, grp.convites.length)}`))) : null,
        h('div', { class: 'center' }, h('button', { class: 'obtn', onclick: () => procurarPedidos(false) }, 'Procurar de novo')),
      ] : null,
    ];
  }

  // ----- Conjuntos de grupos (v1.12; painel, convite, padronizar e votos na v1.19) -----
  // Um conjunto é uma lista GRAVADA dos grupos (que você administra) com o mesmo conteúdo. Serve para: não deixar ninguém entrar em dois,
  // mostrar as vagas de cada um, receber o excedente quando um grupo enche, dar o convite do próximo com vaga e padronizar tudo de uma vez.
  const uni = { ed: null, grupos: null, dup: null, pad: null, painel: {}, abertos: {}, convite: {}, votos: {}, parcial: false, totalGrupos: 0 };
  async function carregarGrupos(forcar) {
    if ((uni.grupos && !forcar) || !S.ready) return;
    uni.grupos = null; renderPanel();
    try { const r = await call('gruposAdmin'); uni.grupos = r.grupos; uni.parcial = !!r.parcial; uni.totalGrupos = r.total; }
    catch { uni.grupos = []; }
    renderPanel();
  }
  async function carregarPainel(c) {
    uni.painel[c.id] = { ...(uni.painel[c.id] || {}), carregando: true }; renderPanel();
    try { uni.painel[c.id] = { rows: await call('painelConjunto', c.grupos), t: Date.now() }; }
    catch (e) { uni.painel[c.id] = { erro: e.message }; }
    renderPanel();
  }
  // o próximo grupo com vaga (na ordem do conjunto: enche um de cada vez) e o link/cartão de convite dele
  async function proximoComVaga(c) {
    if (!uni.painel[c.id]?.rows) await carregarPainel(c);
    const r = (uni.painel[c.id]?.rows || []).find((x) => x.m && x.l - x.m > 0);
    if (!r) { uni.convite[c.id] = { erro: 'Todos os grupos do conjunto estão cheios (ou não consegui contar os membros).' }; return renderPanel(); }
    try { const k = await call('conviteGrupo', r.id); uni.convite[c.id] = { grupoId: r.id, nome: r.name, vagas: r.l - r.m, link: k.link }; }
    catch (e) { uni.convite[c.id] = { erro: 'Não consegui o link (você é admin deste grupo?): ' + e.message }; }
    renderPanel();
  }
  async function copiarLink(link) {
    try { await navigator.clipboard.writeText(link); toast('Link copiado.'); } catch { await perguntar('Copie o link:', link); }
  }
  async function enviarConviteChat(k) {
    if (!S.active?.id) return toast('Abra uma conversa primeiro.');
    try { await call('enviarConvite', S.active.id, k.grupoId, ''); toast(`Convite de "${k.nome}" enviado nesta conversa.`); }
    catch (e) { toast('Não consegui enviar o convite: ' + e.message); }
  }
  async function verVotos(g) {
    uni.votos[g] = { carregando: true }; renderPanel();
    try { uni.votos[g] = await call('votosEnquete', g); } catch (e) { uni.votos[g] = { erro: e.message }; }
    renderPanel();
  }
  const pillVagas = (r) => { const v = r.m ? r.l - r.m : null; return v == null ? h('span', { class: 'pill' }, '?') : h('span', { class: 'pill vg ' + (v <= 0 ? 'cheio' : v <= 10 ? 'quase' : 'livre'), title: `${fmtN(r.m)} de ${fmtN(r.l)} membros` }, v <= 0 ? 'cheio' : `${v} vaga${v === 1 ? '' : 's'}`); };
  function painelCorpo(c) {
    const p = uni.painel[c.id], k = uni.convite[c.id];
    if (!p) return h('p', { class: 'hint' }, 'Abra para ver membros, vagas e pedidos pendentes de cada grupo.');
    if (p.carregando && !p.rows) return h('p', { class: 'hint' }, 'Lendo os grupos…');
    if (p.erro) return h('p', { class: 'hint dan' }, 'Não consegui ler: ' + p.erro);
    return [
      h('div', { class: 'col' }, p.rows.map((r) => [
        h('div', { class: 'prow' }, h('span', { class: 'grow' }, h('span', null, r.name), h('small', { class: 'mut' }, ` ${fmtN(r.m)}/${fmtN(r.l)} · …${String(r.id).split('@')[0].slice(-4)}`)),
          pillVagas(r), r.pend ? h('span', { class: 'pill on', title: 'Pedidos para entrar pendentes' }, `${r.pend} pend.`) : null,
          h('button', { class: 'ib', title: 'Ver os votos da última enquete deste grupo', onclick: () => verVotos(r.id) }, '📊')),
        uni.votos[r.id] ? (() => { const v = uni.votos[r.id];
          return v.carregando ? h('small', { class: 'hint' }, 'Lendo votos…') : v.erro ? h('small', { class: 'dan' }, v.erro)
            : h('details', { class: 'tec', open: true }, h('summary', null, `📊 ${v.pergunta} — ${v.total} voto(s)`), v.opcoes.map((o) => h('small', null, `${o.nome}: ${o.quem.length}` + (o.quem.length ? ` (${o.quem.slice(0, 40).join(', ')}${o.quem.length > 40 ? '…' : ''})` : '')))); })() : null])),
      h('div', { class: 'rowf' },
        h('button', { class: 'obtn', disabled: p.carregando, onclick: () => carregarPainel(c) }, p.carregando ? 'Atualizando…' : '↻ Atualizar'),
        h('button', { class: 'gbtn sm', title: 'Link e cartão de convite do primeiro grupo do conjunto que ainda tem vaga', onclick: () => proximoComVaga(c) }, 'Convite do próximo com vaga'),
        h('button', { class: 'obtn', title: 'Mudar descrição, nome, ícone e permissões de todos os grupos do conjunto', onclick: () => abrirPad(c) }, 'Padronizar')),
      k ? (k.erro ? h('p', { class: 'hint dan' }, k.erro) : h('div', { class: 'card pedplano' }, h('div', { class: 'grow' }, h('b', null, `Próximo com vaga: ${k.nome}`), h('small', null, `${k.vagas} vaga(s) · ${k.link}`),
        h('div', { class: 'rowf' }, h('button', { class: 'obtn', onclick: () => copiarLink(k.link) }, 'Copiar link'), h('button', { class: 'obtn', onclick: () => enviarConviteChat(k) }, 'Enviar no chat aberto'))))) : null,
    ];
  }
  // ----- Padronizar o conjunto: mesma descrição/nome/ícone/permissões em todos os grupos (cada campo é opcional) -----
  function abrirPad(c) { uni.pad = { c, desc: '', nome: '', ann: '', restr: '', icone: null, iconeNome: '', fase: 'form', res: null }; renderPanel(); }
  const triEstado = (v) => (v === 'on' ? true : v === 'off' ? false : undefined);
  function resumoPad(d) {
    const l = [];
    if (d.desc.trim()) l.push('descrição'); if (d.nome.trim()) l.push('nome'); if (d.icone) l.push('ícone');
    if (d.ann) l.push(d.ann === 'on' ? 'só admins enviam' : 'todos enviam'); if (d.restr) l.push(d.restr === 'on' ? 'só admins editam os dados' : 'todos editam os dados');
    return l;
  }
  async function executarPad() {
    const d = uni.pad, l = resumoPad(d);
    if (!l.length) return toast('Preencha pelo menos um campo.');
    if (!await confirmar(`Aplicar em ${d.c.grupos.length} grupo(s) do conjunto "${d.c.nome}": ${l.join(', ')}?\n\nIsso muda os grupos de verdade (o painel não desfaz).`)) return;
    d.fase = 'exec'; renderPanel();
    try { d.res = await call('padronizar', d.c.grupos, { desc: d.desc, nome: d.nome, announcement: triEstado(d.ann), restrict: triEstado(d.restr), icone: d.icone }); d.fase = 'fim'; }
    catch (e) { d.erro = e.message; d.fase = 'form'; }
    renderPanel();
  }
  function padView() {
    const d = uni.pad, voltar = h('button', { class: 'obtn', onclick: () => { uni.pad = null; renderPanel(); } }, '← Voltar');
    if (d.fase === 'exec') return [h('p', { class: 'hint' }, 'Aplicando, um grupo por vez, com pausa…')];
    if (d.fase === 'fim') return [h('b', null, `Resultado em "${d.c.nome}"`),
      h('div', { class: 'col' }, d.res.map((g) => h('div', { class: 'card pedplano' }, h('div', { class: 'grow' }, h('b', null, g.name),
        h('small', null, g.feito.length ? '✔ ' + g.feito.join(', ') : 'nada foi alterado'), ...g.erros.map((e) => h('small', { class: 'dan' }, '✖ ' + e)))))),
      h('div', { class: 'rowf' }, voltar)];
    const sel = (k, rot, ligar, desligar) => h('label', { class: 'lb' }, rot, h('select', { class: 'in', onchange: (e) => { d[k] = e.target.value; renderPanel(); } },
      [['', 'Não mexer'], ['on', ligar], ['off', desligar]].map(([v, t]) => h('option', { value: v, selected: d[k] === v }, t))));
    const mudancas = resumoPad(d);
    return [
      h('div', { class: 'rowf' }, voltar, h('b', { class: 'grow' }, `Padronizar "${d.c.nome}"`)),
      h('p', { class: 'hint' }, `Vale para os ${d.c.grupos.length} grupos do conjunto. Deixe em branco / "Não mexer" o que não quiser mudar.`),
      d.erro ? h('p', { class: 'hint dan' }, d.erro) : null,
      h('label', { class: 'lb' }, 'Descrição (regras e avisos)', h('textarea', { class: 'in', rows: 6, maxlength: 2048, placeholder: 'Texto novo para a descrição de todos os grupos', value: d.desc, oninput: (e) => { d.desc = e.target.value; } })),
      h('label', { class: 'lb' }, 'Nome (igual em todos)', h('input', { class: 'in', maxlength: 100, placeholder: 'Opcional', value: d.nome, oninput: (e) => { d.nome = e.target.value; } })),
      sel('ann', 'Quem pode enviar mensagens', 'Só admins enviam', 'Todos enviam'),
      sel('restr', 'Quem pode editar os dados do grupo', 'Só admins editam', 'Todos editam'),
      h('label', { class: 'file' }, d.iconeNome ? '🖼️ ' + d.iconeNome + ' (trocar)' : '🖼️ Escolher o ícone (opcional)…',
        h('input', { type: 'file', accept: 'image/*', onchange: (e) => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { d.icone = r.result; d.iconeNome = f.name; renderPanel(); }; r.readAsDataURL(f); } })),
      h('p', { class: 'hint' }, mudancas.length ? `Vai alterar: ${mudancas.join(', ')}.` : 'Nada para alterar ainda.'),
      h('div', { class: 'center' }, h('button', { class: 'gbtn', disabled: !mudancas.length, onclick: executarPad }, `Aplicar em ${d.c.grupos.length} grupos`)),
    ];
  }
  function unicosView() {
    if (uni.ed) return editorUnicos();
    if (uni.dup) return dupView();
    if (uni.pad) return padView();
    return [
      h('p', { class: 'hint' }, 'Um conjunto é uma lista GRAVADA dos seus grupos de mesmo conteúdo (só entram os que você administra). Ele evita que alguém entre em dois, mostra as vagas de cada um, recebe o excedente quando um grupo enche, dá o convite do próximo com vaga e padroniza todos de uma vez.'),
      h('div', { class: 'rowf' }, h('button', { class: 'gbtn sm', onclick: () => { uni.ed = { id: 'u' + Date.now().toString(36), nome: '', grupos: new Set(), nomes: {} }; carregarGrupos(); renderPanel(); } }, '＋ Novo conjunto')),
      S.unicos.length ? h('div', { class: 'col' }, S.unicos.map((c) => h('div', { class: 'card conj' },
        h('div', { class: 'rowf' }, tile('users'),
          h('div', { class: 'grow' }, h('b', null, c.nome || 'Sem nome'), h('small', null, `${c.grupos.length} grupos`)),
          h('button', { class: 'ib', title: 'Verificar duplicados', onclick: () => verificarDup(c) }, icon('search', 16)),
          h('button', { class: 'ib', title: 'Editar', onclick: () => { uni.ed = { id: c.id, nome: c.nome, grupos: new Set(c.grupos), nomes: { ...c.nomes } }; carregarGrupos(); renderPanel(); } }, icon('pen', 16)),
          h('button', { class: 'ib dan', title: 'Apagar conjunto', onclick: async () => { if (!await confirmar(`Apagar o conjunto "${c.nome || 'Sem nome'}"?`)) return; S.unicos = S.unicos.filter((x) => x.id !== c.id); save('gruposUnicos'); renderPanel(); } }, icon('trash', 16))),
        h('details', { class: 'tec conjpainel', open: !!uni.abertos[c.id], ontoggle: (e) => { uni.abertos[c.id] = e.target.open; if (e.target.open && !uni.painel[c.id]) carregarPainel(c); } },
          h('summary', null, 'Painel do conjunto (vagas, pendentes, convite, padronizar)'), painelCorpo(c))))) 
        : h('p', { class: 'empty' }, 'Nenhum conjunto ainda.'),
    ];
  }

  // ----- Duplicados que já existem no conjunto: manter em UM grupo e remover dos outros (v1.12.1) -----
  // Verificar é só leitura. Remover pede confirmação, só age onde você é admin, nunca remove admins e vai em lotes de 10 com pausa.
  async function verificarDup(c) {
    uni.dup = { c, fase: 'verificando', itens: [], prio: [...c.grupos], keep: {}, resumo: null, erro: '' }; renderPanel();
    try { uni.dup.itens = (await call('duplicadosConjunto', c.grupos)).itens; }
    catch (e) { uni.dup.erro = 'Não consegui verificar: ' + e.message; }
    uni.dup.fase = 'lista'; renderPanel();
  }
  const keepDe = (d, i) => { const it = d.itens[i], k = d.keep[i]; return it.grupos.some((g) => g.id === k) ? k : d.prio.find((id) => it.grupos.some((g) => g.id === id)); };
  // Administrador NUNCA é removido: quem é admin em QUALQUER grupo do conjunto fica protegido em todos (e a ponte confere de novo).
  function planoDup(d) {
    const rem = {}; let total = 0, admins = 0;
    d.itens.forEach((it, i) => {
      if (it.protegido) { admins++; return; }
      const k = keepDe(d, i);
      for (const g of it.grupos) { if (g.id === k) continue; if (g.admin) continue; (rem[g.id] ||= []).push(g.pid); total++; } });
    return { rem, total, admins };
  }
  async function removerDup() {
    const d = uni.dup, { rem, total } = planoDup(d);
    if (!total) return toast('Nada para remover.');
    if (!await confirmar(`Remover ${total} participação(ões) em ${Object.keys(rem).length} grupo(s)?\n\nCada pessoa fica em um só grupo do conjunto. Administradores NUNCA são removidos.\nO painel não consegue desfazer isso (a pessoa teria que ser adicionada de novo).`)) return;
    d.fase = 'removendo'; d.erro = ''; renderPanel();
    try { d.resumo = await call('removerDuplicados', rem, d.c.grupos); d.fase = 'fim'; } catch (e) { d.erro = 'Erro ao remover: ' + e.message; d.fase = 'lista'; }
    renderPanel();
  }
  function dupView() {
    const d = uni.dup, nome = (id) => d.c.nomes?.[id] || id.split('@')[0];
    const voltar = h('button', { class: 'obtn', onclick: () => { uni.dup = null; renderPanel(); } }, '← Voltar');
    if (d.fase === 'verificando') return [voltar, h('p', { class: 'hint' }, `Conferindo quem está em mais de um grupo de "${d.c.nome}"… com grupos grandes pode levar alguns segundos.`)];
    if (d.fase === 'removendo') return [h('p', { class: 'hint' }, 'Removendo em lotes… não feche o WhatsApp até terminar.')];
    if (d.fase === 'fim') return [
      h('b', null, 'Resultado'),
      h('div', { class: 'col' }, d.resumo.map((g) => h('div', { class: 'card pedplano' }, h('div', { class: 'grow' }, h('b', null, g.name),
        h('small', null, `✔ ${g.removidos} removido(s)` + (g.protegidos ? ` · 🛡 ${g.protegidos} admin(s) mantido(s)` : '') + (g.falhas ? ` · ✖ ${g.falhas} falha(s)` : '')), g.erro ? h('small', { class: 'dan' }, g.erro) : null)))),
      h('div', { class: 'rowf' }, voltar, h('button', { class: 'obtn', onclick: () => verificarDup(d.c) }, 'Verificar de novo')),
    ];
    const { rem, total, admins } = planoDup(d);
    const lista = d.itens.map((it, i) => [it, i]).filter(([it]) => !it.protegido), protegidos = d.itens.filter((it) => it.protegido);
    return [
      h('div', { class: 'rowf' }, voltar, h('b', { class: 'grow' }, `Duplicados em "${d.c.nome}"`), h('span', { class: 'pill' + (lista.length ? ' warn' : '') }, lista.length)),
      d.erro ? h('p', { class: 'hint dan' }, d.erro) : null,
      !d.itens.length && !d.erro ? h('p', { class: 'empty' }, '🎉 Ninguém está em dois grupos deste conjunto.') : null,
      protegidos.length ? h('details', { class: 'tec' }, h('summary', null, `🛡 ${protegidos.length} administrador(es) em mais de um grupo — protegidos, nunca são removidos`),
        protegidos.map((it) => h('small', null, `${it.quem}: ` + it.grupos.map((g) => g.name + (g.admin ? ' (admin)' : '')).join(' · ')))) : null,
      lista.length ? [
        h('p', { class: 'hint' }, 'Estas pessoas estão em mais de um grupo do conjunto. Escolha em qual grupo cada uma FICA; ela sai dos outros.'),
        h('label', { class: 'lb' }, 'Manter, por padrão, no grupo:',
          h('select', { class: 'in sm', onchange: (e) => { d.prio = [e.target.value, ...d.prio.filter((x) => x !== e.target.value)]; d.keep = {}; renderPanel(); } },
            d.c.grupos.map((g) => h('option', { value: g, selected: g === d.prio[0] }, nome(g))))),
        h('div', { class: 'col' }, lista.slice(0, 200).map(([it, i]) => h('div', { class: 'card pedplano' }, h('div', { class: 'grow' }, h('b', null, it.quem),
          h('small', null, 'está em: ' + it.grupos.map((g) => g.name + (g.admin ? ' (admin)' : '')).join(' · ')),
          h('select', { class: 'in sm', title: 'Grupo em que esta pessoa fica', onchange: (e) => { d.keep[i] = e.target.value; renderPanel(); } },
            it.grupos.map((g) => h('option', { value: g.id, selected: g.id === keepDe(d, i) }, 'fica em: ' + g.name))))))),
        lista.length > 200 ? h('p', { class: 'hint' }, `Mostrando 200 de ${lista.length}. Os demais seguem o grupo padrão acima.`) : null,
        h('p', { class: 'hint' }, `Vai remover ${total} participação(ões) em ${Object.keys(rem).length} grupo(s)` + (admins ? ` · ${admins} administrador(es) protegido(s)` : '') + '.'),
        h('button', { class: 'gbtn dang', disabled: !total, onclick: removerDup }, `Remover ${total} duplicado(s)`),
      ] : null,
    ];
  }
  function editorUnicos() {
    const e = uni.ed, cont = h('span', { class: 'pill on' }, e.grupos.size);
    const linhas = h('div', { class: 'col pickg' }, !uni.grupos ? h('p', { class: 'hint' }, 'Carregando seus grupos…')
      : uni.grupos.length ? uni.grupos.map((g) => h('label', { class: 'card pedg', 'data-nome': String(g.name).toLowerCase() },
        h('input', { type: 'checkbox', checked: e.grupos.has(g.id), onchange: (x) => { if (x.target.checked) { e.grupos.add(g.id); e.nomes[g.id] = g.name; } else e.grupos.delete(g.id); cont.textContent = e.grupos.size; } }),
        h('span', { class: 'grow' }, g.name, g.m ? h('small', { class: 'mut' }, ` ${fmtN(g.m)}/${fmtN(g.l)} · …${String(g.id).split('@')[0].slice(-4)}`) : null))) : h('p', { class: 'empty' }, 'Não encontrei grupos em que você é admin (o WhatsApp já carregou?).'));
    return [
      h('input', { class: 'in', placeholder: 'Nome do conjunto (ex.: Cargas SP)', value: e.nome, oninput: (x) => { e.nome = x.target.value; } }),
      h('p', { class: 'hint' }, `Só aparecem os grupos em que você é admin${uni.totalGrupos ? ` (${uni.grupos?.length ?? 0} de ${uni.totalGrupos})` : ''}${uni.parcial ? '. A lista foi cortada por demora: use ↻' : ''}. A escolha fica gravada no conjunto.`),
      h('div', { class: 'rowf' }, h('input', { class: 'in grow', placeholder: 'Buscar grupo…',
        oninput: (x) => { const t = x.target.value.toLowerCase(); linhas.querySelectorAll('[data-nome]').forEach((r) => { r.style.display = r.dataset.nome.includes(t) ? '' : 'none'; }); } }),
        h('button', { class: 'ib', title: 'Atualizar a lista de grupos', onclick: () => carregarGrupos(true) }, '↻'), cont),
      linhas,
      h('div', { class: 'rowf' },
        h('button', { class: 'obtn', onclick: () => { uni.ed = null; renderPanel(); } }, 'Cancelar'),
        h('button', { class: 'gbtn grow', onclick: () => {
          if (e.grupos.size < 2) return toast('Marque pelo menos 2 grupos.');
          const c = { id: e.id, nome: e.nome.trim() || `Conjunto ${S.unicos.length + 1}`, grupos: [...e.grupos], nomes: e.nomes };
          S.unicos = S.unicos.some((x) => x.id === c.id) ? S.unicos.map((x) => (x.id === c.id ? c : x)) : [...S.unicos, c];
          save('gruposUnicos'); uni.ed = null; toast('Conjunto salvo.'); renderPanel();
        } }, 'Salvar conjunto')),
    ];
  }

  const MOD_ICONE = { replies: 'zap', fila: 'clock', sig: 'pen', start: 'chat', lote: 'layers', pins: 'pin', ocultas: 'eyeoff', apagar: 'trash', recuperar: 'eye', backup: 'save', lab: 'flask', exportar: 'download', contato: 'users', escuta: 'zap', resumo: 'layers', avaliacao: 'pulse', ligacao: 'clock', cargas: 'truck', pedidos: 'users', vagas: 'users' };
  const limW = { dados: null, lendo: false };
  function limitesView() {
    if (!limW.dados && !limW.lendo && S.ready) {
      limW.lendo = true;
      call('limitesWA').then((d) => { limW.dados = d; }).catch(() => { limW.dados = {}; }).finally(() => { limW.lendo = false; renderPanel(); });
    }
    const d = limW.dados; if (!d) return h('p', { class: 'hint' }, S.ready ? 'Lendo…' : 'Aguardando o WhatsApp…');
    const L = [['Membros por grupo', d.membrosGrupo, ''], ['Foto/vídeo no status', d.statusMidiaMB, ' MB'], ['Duração do vídeo no status', d.statusVideoSeg, ' s'],
      ['Arquivo comum', d.midiaMB, ' MB'], ['Vídeo', d.videoMB, ' MB'], ['Mensagens fixadas por conversa', d.msgsFixadas, ''], ['Editar mensagem enviada', d.editarMin, ' min'],
      ['Opções de enquete', d.opcoesEnquete, ''], ['Mídias por seleção', d.selecaoMidias, ''], ['Agendar mensagem (até)', d.agendarDias, ' dias']];
    const ok = L.filter(([, v]) => v != null);
    return ok.length ? h('div', { class: 'col' }, ok.map(([n, v, u]) => h('div', { class: 'kv' }, h('span', null, n), h('b', null, `${typeof v === 'number' ? v.toLocaleString('pt-BR') : v}${u}`))))
      : h('p', { class: 'hint' }, 'Não consegui ler os limites agora.');
  }
  // v1.39 — cartões que moravam em Configurações e agora ficam no assunto deles (as chaves da planilha são as mesmas)
  const vagasCard = () => ligado('vagas') ? h('div', { class: 'sec' }, h('div', { class: 'sh' }, tile('users'), h('b', { class: 'grow' }, 'Vagas nos grupos')),
    h('p', { class: 'hint' }, 'Mostra, na lista de conversas e no topo do grupo, quantas vagas faltam para encher (limite do WhatsApp menos os membros).'),
    h('label', { class: 'lb' }, 'Mostrar o contador',
      h('select', { class: 'in', onchange: (e) => { S.vagasCfg = { ...S.vagasCfg, ate: +e.target.value }; save('vagasCfg'); desenharVagas(); } },
        [[0, 'Em todos os grupos'], [100, 'Quando restarem até 100 vagas'], [50, 'Quando restarem até 50 vagas'], [20, 'Quando restarem até 20 vagas'], [10, 'Quando restarem até 10 vagas']]
          .map(([v, t]) => h('option', { value: v, selected: (+S.vagasCfg?.ate || 0) === v }, t))))) : null;
  const gruposSoCard = () => ligado('gruposSo') ? h('div', { class: 'sec' }, h('div', { class: 'sh' }, tile('shapes'), h('b', { class: 'grow' }, 'Grupos só na aba Grupos')),
    h('p', { class: 'hint' }, 'Para o seletor de "Encaminhar para…" mostrar os grupos, o filtro faz uma pausa enquanto uma janela de ESCOLHER CONVERSA está aberta. Janelas de informação (Mostrar contato, dados do grupo) não pausam.'),
    h('label', { class: 'lb' }, 'Quando uma janela abrir',
      h('select', { class: 'in', onchange: (e) => { S.gruposSoCfg = { ...S.gruposSoCfg, janela: e.target.value }; save('gruposSoCfg'); syncGruposSo(true); } },
        [['escolher', 'Pausar só em janelas de escolher conversa (recomendado)'], ['nunca', 'Nunca pausar (os grupos ficam escondidos até no "Encaminhar")'], ['qualquer', 'Pausar em qualquer janela grande']]
          .map(([v, t]) => h('option', { value: v, selected: (S.gruposSoCfg?.janela || 'escolher') === v }, t))))) : null;
  const limWaCard = () => !ligado('cfgLimites') ? null : h('div', { class: 'sec' }, h('div', { class: 'sh' }, tile('shapes'), h('b', { class: 'grow' }, 'Limites do WhatsApp'),
    h('button', { class: 'ib', title: 'Ler de novo', onclick: () => { limW.dados = null; renderPanel(); } }, '↻')),
    h('p', { class: 'hint' }, 'Lidos do próprio WhatsApp (só leitura). Quem decide é o servidor: passar disso costuma falhar (por isso o AtendeZap avisa antes de enviar status grande).'),
    limitesView());
  const freteCard = () => ligado('cargas') ? h('div', { class: 'sec' }, h('div', { class: 'sh' }, tile('truck'), h('b', { class: 'grow' }, 'Lista de frete (planilha Google)')),
    h('p', { class: 'hint' }, 'Cole o link do app da Web publicado no Apps Script da sua planilha (termina em /exec).'),
    h('input', { class: 'in', placeholder: 'https://script.google.com/macros/s/…/exec', value: S.cargasUrl,
      onchange: async (e) => { S.cargasUrl = e.target.value.trim(); await save('listaCargasUrl'); toast(S.cargasUrl ? 'Link salvo.' : 'Link removido.'); } }),
    h('div', { class: 'rowf' }, h('button', { class: 'obtn', onclick: async () => {
      const t = await buscarListaCargas(); if (t) toast(`✔ Funcionou: ${t.split('\n').length} linhas recebidas.`);
    } }, 'Testar link'))) : null;
  const gruposAjView = () => [h('div', { class: 'eh' }, h('b', null, 'Ajustes dos grupos')), vagasCard(), gruposSoCard()];
  const freteView = () => [h('div', { class: 'eh' }, h('b', null, 'Lista de frete')), freteCard()];
  const limitesSecaoView = () => [h('div', { class: 'eh' }, h('b', null, 'Limites do WhatsApp')), limWaCard()];
  function configView() {
    const lado = LADOS[ui.lado] ? ui.lado : 'direita';
    const alternar = async (k, v) => { if (acessoEf().conectado && (acessoEf().recursos[k] === 'obrigatorio' || acessoEf().desativado)) return toast('O administrador não permite mudar isto.'); S.mods = { ...S.mods, [k]: v }; await save('modulos'); recuperarSincronizar(); renderHead(); renderPanel(); };
    if (acessoEf().login || acessoEf().desativado) return [h('div', { class: 'eh' }, h('b', null, 'Configurações')), acessoCard()]; // login primeiro: nada além do acesso da equipe
    return [
      h('div', { class: 'eh' }, h('b', null, 'Configurações')),
      comecarCard(),
      !ligado('cfgPosicao') ? null : h('div', { class: 'sec' }, h('div', { class: 'sh' }, tile('right'), h('b', { class: 'grow' }, 'Posição do painel')),
        h('div', { class: 'seg' }, Object.entries(LADOS).map(([k, [nome]]) => h('button', { class: lado === k ? 'on' : '', onclick: () => { ui.lado = k; saveUi(); renderPanel(); } }, nome[0].toUpperCase() + nome.slice(1)))),
        lado !== 'topo' ? h('label', { class: 'lb' }, `Largura do painel: ${painelW()} px`, h('input', { type: 'range', min: 320, max: 640, step: 10, value: painelW(), 'aria-label': 'Largura do painel em pixels',
          oninput: (e) => { ui.larg = +e.target.value; document.documentElement.style.setProperty('--az-w', painelW() + 'px'); const pn = panelRoot.querySelector('.panel'); if (pn) pn.style.width = painelW() + 'px'; },
          onchange: () => { saveUi(); renderPanel(); } })) : null,
        h('p', { class: 'hint' }, 'O painel sempre começa recolhido ao abrir o WhatsApp. Alt+Z abre e fecha. Se os textos ficarem apertados, aumente a largura.')),
      acessoCard(),
      ligado('cfgIA') ? iaCard() : null,
      !ligado('cfgPartes') ? null : h('div', { class: 'sec' }, h('div', { class: 'sh' }, tile('shapes'), h('b', { class: 'grow' }, 'Partes do painel')),
        h('p', { class: 'hint' }, 'Desligada, a parte some do painel e para de funcionar. Seus dados ficam guardados para quando religar. Organizadas por assunto; 🧪 = ainda em teste.'),
        h('div', { class: 'col' }, (() => {
          const linha = ([k, nome, desc, tipo]) => h('label', { class: 'modr' + (ligado(k) ? '' : ' off') }, // o que o administrador bloqueou nem aparece aqui
          tile(MOD_ICONE[k] || 'shapes'),
          h('div', { class: 'grow' }, h('b', null, nome + (tipo === 'teste' ? ' 🧪' : '')), h('small', null, desc), acessoTrava(k) ? h('small', { class: 'iaav' }, acessoTrava(k)) : null),
          h('span', { class: 'tog' }, h('input', { type: 'checkbox', checked: ligado(k), disabled: !!acessoTrava(k), onchange: (e) => alternar(k, e.target.checked) }), h('i')));
          const vis = MODULOS.filter(([k]) => !acessoOculto(k)), de = (k) => ({ cargas: 'respostas', vagas: 'grupos', gruposSo: 'grupos', escuta: 'respostas', ligacao: 'respostas' })[k] || HUB_DE[k];
          return Object.keys(HUBS).map((hub) => { const ms = vis.filter(([k]) => de(k) === hub); return ms.length ? [h('p', { class: 'hint grp' }, HUBS[hub].titulo), ms.map(linha)] : null; });
        })()),
        h('p', { class: 'hint' }, 'Diagnóstico e Configurações ficam sempre ligados (avisam se o WhatsApp mudar e permitem religar as partes).')),
    ];
  }

  // ----- Aguardando resposta -----
  // Clientes cuja última mensagem é deles há mais de X minutos. Atualiza a cada 60 s (contador na barra) e a cada
  // 20 s com a seção aberta. "Dispensar" esconde até chegar mensagem nova daquele cliente.
  // v1.10: "Adiar 30 min" (filaAdiadas {id: até_quando_ms}) e horário de expediente (fora dele a fila pausa).
  const ADIAR_MIN = 30;
  const fila = { itens: null, cfg: { min: 15, grupos: false, exp: { ativo: false, de: '08:00', ate: '18:00' } }, dispensadas: {}, adiadas: {}, fora: false, carregando: false };
  chrome.storage.local.get(['filaCfg', 'filaDispensadas', 'filaAdiadas']).then((d) => {
    fila.cfg = { ...fila.cfg, ...d.filaCfg, exp: { ...fila.cfg.exp, ...d.filaCfg?.exp } };
    fila.dispensadas = d.filaDispensadas || {}; fila.adiadas = d.filaAdiadas || {};
  });
  const foraDoExpediente = () => {
    const e = fila.cfg.exp; if (!e?.ativo) return false;
    const n = new Date(), agora = n.getHours() * 60 + n.getMinutes();
    const m = (t) => { const [hh, mm] = String(t).split(':').map(Number); return (hh || 0) * 60 + (mm || 0); };
    const de = m(e.de), ate = m(e.ate);
    return de <= ate ? !(agora >= de && agora < ate) : !(agora >= de || agora < ate); // aceita turno que vira a noite
  };
  async function atualizarFila() {
    if (!S.ready || fila.carregando || !ligado('fila')) return;
    fila.carregando = true;
    try {
      fila.fora = foraDoExpediente();
      const lista = fila.fora ? await Promise.resolve([]) : await call('aguardando', fila.cfg.min, fila.cfg.grupos); // sempre com await: sem ele renderPanel() rodaria dentro de si mesmo (dois painéis)
      const antes = fila.itens?.length;
      const agora = Date.now();
      const venceu = Object.keys(fila.adiadas).filter((id) => fila.adiadas[id] <= agora);
      if (venceu.length) { for (const id of venceu) delete fila.adiadas[id]; chrome.storage.local.set({ filaAdiadas: fila.adiadas }); }
      fila.itens = lista.filter((c) => !(fila.dispensadas[c.id] >= c.desde) && !(fila.adiadas[c.id] > agora));
      if (ui.open && (ui.sec === 'fila' || antes !== fila.itens.length)) renderPanel(); // contador na barra
    } catch { /* fica com a lista anterior */ } finally { fila.carregando = false; }
  }
  const haQuanto = (t) => {
    const m = Math.floor((Date.now() / 1000 - t) / 60);
    return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + ' min' : ''}`.trim() : `${Math.floor(m / 1440)} dia(s)`;
  };
  function filaView() {
    if (!fila.itens) atualizarFila();
    const cfg = (patch) => { fila.cfg = { ...fila.cfg, ...patch }; chrome.storage.local.set({ filaCfg: fila.cfg }); fila.itens = null; renderPanel(); };
    const exp = (patch) => cfg({ exp: { ...fila.cfg.exp, ...patch } });
    const adiar = (c) => { fila.adiadas = { ...fila.adiadas, [c.id]: Date.now() + ADIAR_MIN * 60000 }; chrome.storage.local.set({ filaAdiadas: fila.adiadas }); fila.itens = fila.itens.filter((x) => x.id !== c.id); toast(`⏰ \"${c.name}\" volta à fila em ${ADIAR_MIN} min.`); renderPanel(); };
    const dispensar = (c) => { fila.dispensadas = { ...fila.dispensadas, [c.id]: c.desde }; chrome.storage.local.set({ filaDispensadas: fila.dispensadas }); fila.itens = fila.itens.filter((x) => x.id !== c.id); renderPanel(); };
    const ICONE_TIPO = { image: '📷 Foto', video: '🎥 Vídeo', ptt: '🎤 Áudio', audio: '🎤 Áudio', document: '📄 Documento', sticker: 'Figurinha', location: '📍 Localização', vcard: '👤 Contato', call_log: '📞 Ligação' };
    const cor = (t) => { const m = (Date.now() / 1000 - t) / 60; return m >= 120 ? 'bad' : m >= 60 ? 'warn' : 'ok'; };
    return [
      h('div', { class: 'eh' }, h('b', null, 'Aguardando resposta'), h('span', { class: 'pill' + (fila.itens?.length ? ' on' : '') }, fila.itens ? fila.itens.length : '…')),
      h('p', { class: 'hint' }, 'Clientes cuja última mensagem é deles e ainda não foi respondida. Os que esperam há mais tempo ficam em cima.'),
      h('div', { class: 'rowf' },
        h('span', { class: 'hint' }, 'Esperando há mais de'),
        h('select', { class: 'in sm', onchange: (e) => cfg({ min: +e.target.value }) },
          [1, 5, 15, 30, 60, 120].map((m) => h('option', { value: m, selected: fila.cfg.min === m }, m < 60 ? `${m} min` : `${m / 60} h`))),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: fila.cfg.grupos, onchange: (e) => cfg({ grupos: e.target.checked }) }), 'grupos'),
        h('button', { class: 'ib', title: 'Atualizar', onclick: () => { fila.itens = null; renderPanel(); } }, '↻')),
      h('div', { class: 'rowf' },
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!fila.cfg.exp.ativo, onchange: (e) => exp({ ativo: e.target.checked }) }), 'Só no expediente'),
        fila.cfg.exp.ativo ? [
          h('input', { class: 'in sm', type: 'time', value: fila.cfg.exp.de, onchange: (e) => e.target.value && exp({ de: e.target.value }) }),
          h('span', { class: 'hint' }, 'até'),
          h('input', { class: 'in sm', type: 'time', value: fila.cfg.exp.ate, onchange: (e) => e.target.value && exp({ ate: e.target.value }) }),
        ] : null),
      fila.fora ? h('p', { class: 'empty' }, `🌙 Fora do expediente (${fila.cfg.exp.de}–${fila.cfg.exp.ate}). A fila volta sozinha quando abrir.`)
      : !fila.itens ? h('p', { class: 'hint' }, 'Procurando…')
        : fila.itens.length ? h('div', { class: 'col' }, fila.itens.map((c) => h('div', { class: 'card fila ' + cor(c.desde) },
          h('div', { class: 'grow link', onclick: () => call('openChat', c.id) },
            h('b', null, (c.isGroup ? '👥 ' : '') + c.name),
            h('small', null, c.previa || ICONE_TIPO[c.tipo] || 'Mensagem')),
          h('div', { class: 'fila-t' }, h('b', null, haQuanto(c.desde)), c.unread ? h('em', null, `${c.unread} não lida${c.unread > 1 ? 's' : ''}`) : null),
          h('button', { class: 'ib', title: 'Dispensar (some até o cliente mandar outra mensagem)', onclick: () => dispensar(c) }, icon('x', 16)),
          h('button', { class: 'ib adiar', title: `Adiar ${ADIAR_MIN} min (volta sozinho à fila)`, onclick: () => adiar(c) }, icon('clock', 16)))))
        : h('p', { class: 'empty' }, '🎉 Ninguém esperando resposta.'),
      ligacaoCard()
    ];
  }

  // ----- Conversas ocultas -----
  // Ocultar = arquivar + silenciar "Sempre" no WhatsApp (sincroniza com o celular) e esconder a linha também na lista
  // de Arquivadas. A cada 20 s reforça (se chegar mensagem e o WhatsApp desarquivar, volta a arquivar).
  async function ocultar(id, sim) {
    try {
      const r = (await call('ocultar', [id], sim))[id];
      if (!r || r.erro) return toast('Não foi possível ' + (sim ? 'ocultar' : 'restaurar') + ': ' + (r?.erro || 'conversa não encontrada'));
      S.ocultas = sim ? [...S.ocultas.filter(([i]) => i !== id), [id, r.nome]] : S.ocultas.filter(([i]) => i !== id);
      await save('conversasOcultas');
      toast(sim ? `🙈 "${r.nome}" foi para Ocultas.` : `"${r.nome}" voltou para a lista normal.`);
      esconderLinhas(); renderPanel(); garantirOcultas();
    } catch (e) { toast('Erro: ' + e.message); }
  }
  async function garantirOcultas() {
    if (!S.ready || !S.ocultas.length || !ligado('ocultas')) return;
    const fora = await call('arquivadasFora', S.ocultas.map(([i]) => i)).catch(() => null);
    if (typeof fora === 'number' && fora !== S.arqFora) { S.arqFora = fora; save('arqFora'); } // guardado: na próxima abertura a faixa já sai escondida
    esconderLinhas();
    const r = await call('ocultar', S.ocultas.map(([i]) => i), true).catch(() => null);
    if (!r) return;
    let mudou = false;
    S.ocultas = S.ocultas.map(([i, n]) => { const nome = r[i]?.nome; if (nome && nome !== n) mudou = true; return [i, nome || n]; });
    if (mudou) save('conversasOcultas');
  }
  // Linhas da lista de conversas (e de Arquivadas) que são de uma conversa oculta. A lista é virtual (reaproveita linhas),
  // então recalcula a cada passada. v1.14.2: compara pelo ID da conversa (a ponte marca data-az-chat em cada linha) e só
  // dentro de #pane-side — antes era pelo nome, em todo o #app: grupos de nome igual sumiam juntos e a conversa também
  // sumia das janelas de "Encaminhar", "Adicionar à lista" e das listas de membros. Sem identificação das linhas
  // (nenhuma marcada), cai no plano antigo, por nome, mas ainda só na lista.
  function esconderLinhas() {
    const on = ligado('ocultas');
    const ids = new Set(on ? S.ocultas.map(([i]) => i) : []), nomes = new Set(on ? S.ocultas.map(([, n]) => n) : []);
    const temMarca = !!document.querySelector('#pane-side [data-az-chat]');
    for (const row of document.querySelectorAll('#pane-side [role="listitem"], #pane-side [role="row"]')) {
      const id = row.getAttribute('data-az-chat');
      let esconder = false;
      if (id) esconder = ids.has(id);
      else if (!temMarca) { const t = row.querySelector('span[title]')?.getAttribute('title'); esconder = !!t && nomes.has(t); }
      if (esconder) row.setAttribute('data-az-oculta', ''); else row.removeAttribute('data-az-oculta');
    }
    // limpa marcas antigas fora da lista (versões anteriores marcavam o #app inteiro)
    for (const row of document.querySelectorAll('[data-az-oculta]:not(#pane-side *)')) if (!row.closest('#az-panel') && !/Arquivadas|Archived/.test(row.textContent || '')) row.removeAttribute('data-az-oculta');
    // Faixa "Arquivadas" no topo da lista: some quando todas as arquivadas são ocultas (se houver outras, fica)
    // Faixa "Arquivadas" (com o número, que entregaria as ocultas): some quando TODAS as arquivadas são ocultas nossas.
    // Só procura no DOM quando vai esconder ou quando há uma marca antiga para desfazer (a busca por texto é a parte cara).
    const sumir = ligado('ocultas') && S.ocultas.length > 0 && S.arqFora === 0;
    // v1.17: o WhatsApp tem um identificador estável para a faixa: data-testid="chatlist-panel-archived-button" (apareceu na foto da
    // estrutura). O atributo no <html> deixa o CSS esconder a faixa ANTES de o JavaScript marcar, inclusive no 1º desenho da página.
    document.documentElement.toggleAttribute('data-az-sumir-arq', !!sumir);
    const faixa = document.querySelector('#side [data-testid="chatlist-panel-archived-button"]');
    if (faixa) {
      if (sumir) { faixa.setAttribute('data-az-oculta', ''); faixa.setAttribute('data-az-arq', ''); } else { faixa.removeAttribute('data-az-oculta'); faixa.removeAttribute('data-az-arq'); }
    } else if (sumir || document.querySelector('[data-az-arq]')) { // plano B (outro idioma/versão sem o identificador): procura pelo texto
      const r = document.evaluate("//*[@id='side']//*[normalize-space(text())='Arquivadas' or normalize-space(text())='Archived']", document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (let i = 0; i < r.snapshotLength; i++) {
        const el = r.snapshotItem(i).closest('button, [role="button"], [role="listitem"], [role="row"]');
        if (!el || el.closest('#az-panel')) continue;
        if (sumir) { el.setAttribute('data-az-oculta', ''); el.setAttribute('data-az-arq', ''); } else { el.removeAttribute('data-az-oculta'); el.removeAttribute('data-az-arq'); }
      }
    }
  }
  // v1.14.7 — a lista do WhatsApp é recriada ao trocar de aba/rolar, e a faixa "Arquivadas" aparecia até a próxima checagem (que
  // era de 1 em 1 segundo). Agora qualquer mudança dentro de #side pede uma passada para o PRÓXIMO quadro (requestAnimationFrame
  // roda antes de pintar), então a faixa e as linhas ocultas somem sem chegar a aparecer. No máximo uma passada por quadro.
  let ocultRaf = 0;
  const pedirOcultar = () => { if (ocultRaf) return; ocultRaf = requestAnimationFrame(T('ocultar linhas (por quadro)', () => { ocultRaf = 0; esconderLinhas(); })); };
  new MutationObserver(T('observador da lista', (muts) => {
    const side = document.getElementById('side');
    if (side && muts.some((m) => side.contains(m.target))) pedirOcultar();
    for (const m of muts) { // janela aberta/fechada (Encaminhar…): a regra de grupos pausa na hora
      for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches?.(SEL_JANELA) || n.querySelector?.(SEL_JANELA))) { syncGruposSo(); return; }
      for (const n of m.removedNodes) if (n.nodeType === 1 && (n.matches?.(SEL_JANELA) || n.querySelector?.(SEL_JANELA))) { syncGruposSo(); return; }
    }
  })).observe(document.documentElement, { childList: true, subtree: true });
  // Item "Ocultar conversa" no menu do WhatsApp (botão direito ou ⌄ numa conversa da lista), logo abaixo de
  // "Arquivar conversa". Copia o item do próprio WhatsApp para ficar com o mesmo visual; o clique é nosso.
  let alvoMenu = null;
  const marcarAlvo = (t) => {
    const row = t?.closest?.('#app [role="listitem"], #app [role="row"]');
    if (!row || row.closest('#main')) return;
    const nome = row.querySelector('span[title]')?.getAttribute('title');
    if (nome) alvoMenu = { nome, t: Date.now() };
  };
  document.addEventListener('contextmenu', (e) => marcarAlvo(e.target), true);
  document.addEventListener('mousedown', (e) => marcarAlvo(e.target), true);
  new MutationObserver((muts) => {
    if (!alvoMenu || Date.now() - alvoMenu.t > 3000 || !ligado('ocultas')) return;
    for (const m of muts) for (const no of m.addedNodes) {
      if (no.nodeType !== 1) continue;
      const w = document.createTreeWalker(no, NodeFilter.SHOW_TEXT);
      for (let tx = w.nextNode(); tx; tx = w.nextNode()) {
        if (!/^(Desa|A)rquivar conversa$/.test(tx.nodeValue.trim())) continue;
        const item = tx.parentElement.closest('li, [role="button"], [role="menuitem"]');
        if (!item || item.parentElement.querySelector('[data-az-ocultar]')) continue;
        const { nome } = alvoMenu;
        const ja = S.ocultas.some(([, n]) => n === nome);
        const novo = item.cloneNode(true);
        novo.setAttribute('data-az-ocultar', '');
        const tt = document.createTreeWalker(novo, NodeFilter.SHOW_TEXT);
        for (let x = tt.nextNode(); x; x = tt.nextNode()) if (/rquivar conversa/.test(x.nodeValue)) x.nodeValue = ja ? 'Restaurar das ocultas' : 'Ocultar conversa';
        const svg = novo.querySelector('svg');
        if (svg) svg.replaceWith(icon('eyeoff', 20));
        novo.addEventListener('click', async (e) => {
          e.preventDefault(); e.stopPropagation();
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
          const id = (ja && S.ocultas.find(([, n]) => n === nome)?.[0]) || await call('chatPorNome', nome).catch(() => null);
          if (!id) return toast(`Não achei a conversa "${nome}".`);
          ocultar(id, !ja);
        }, true);
        item.after(novo);
        return;
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
  function ocultasView() {
    const act = S.active?.id;
    return [
      h('div', { class: 'eh' }, h('b', null, 'Conversas ocultas')),
      h('div', { class: 'rowf' }, h('span', { class: 'hint grow' }, S.ocultas.length ? `${S.ocultas.length} oculta(s)` : ''),
        act && !S.ocultas.some(([i]) => i === act) ? h('button', { class: 'obtn', onclick: () => ocultar(act, true) }, 'Ocultar a atual') : null),
      h('p', { class: 'hint' }, 'Somem da lista de conversas e não notificam: ficam arquivadas e silenciadas (também no celular) e escondidas até das Arquivadas. A faixa "Arquivadas" some também, se você não tiver outras arquivadas. Para ocultar: botão direito na conversa da lista › Ocultar conversa, ou o 🙈 no topo da conversa aberta.'),
      h('div', { class: 'col' }, S.ocultas.length ? S.ocultas.map(([id, nome]) => h('div', { class: 'card' },
        h('span', { class: 'grow link', title: 'Abrir sem restaurar', onclick: () => call('openChat', id) }, '🙈 ' + (nome || id.split('@')[0])),
        h('button', { class: 'obtn', title: 'Voltar para a lista normal (desarquiva e tira o silêncio)', onclick: () => ocultar(id, false) }, 'Restaurar')))
        : [h('p', { class: 'empty' }, 'Nenhuma conversa oculta.')]),
    ];
  }

  // ----- Apagar mensagens para todos, a qualquer tempo (v1.37) -----
  // Lista as SUAS mensagens enviadas na conversa aberta e apaga PARA TODOS as marcadas. O WhatsApp só mostra "Apagar para todos" por um prazo (~2 dias e meio);
  // aqui o pedido vai direto, sem olhar a idade. Quem aceita (ou recusa) mensagens muito antigas é o servidor do WhatsApp: por isso confere e conta o que não confirmou.
  const apagar = { chat: null, msgs: null, sel: new Set(), carregando: false, apagando: false, resultado: null, erro: '' };
  const APAGAR_PRAZO_H = 60; // prazo normal do WhatsApp, só para marcar "fora do prazo normal" (aproximado)
  async function apagarCarregar() {
    const id = S.active?.id; if (!id) return toast('Abra uma conversa primeiro.');
    apagar.carregando = true; apagar.erro = ''; apagar.resultado = null; renderPanel();
    try { const r = await call('minhasMsgs', id, 30); apagar.chat = id; apagar.msgs = r.msgs || []; apagar.sel = new Set(); } catch (e) { apagar.erro = e.message || String(e); }
    apagar.carregando = false; renderPanel();
  }
  async function apagarExecutar() {
    const ids = [...apagar.sel]; if (!ids.length || apagar.chat !== S.active?.id) return;
    if (!await confirmar(`Apagar PARA TODOS ${ids.length} mensagem(ns) sua(s)?\n\nNão dá para desfazer. O WhatsApp pode recusar as muito antigas (você verá quais não foram confirmadas).`, { ok: 'Apagar para todos' })) return;
    apagar.apagando = true; apagar.erro = ''; renderPanel();
    try {
      const r = await call('apagarParaTodos', apagar.chat, ids);
      apagar.msgs = (apagar.msgs || []).filter((m) => !r.some((x) => x.id === m.id && x.ok)); apagar.sel = new Set();
      apagar.resultado = { ok: r.filter((x) => x.ok).length, falhas: r.filter((x) => !x.ok).map((x) => x.motivo) };
    } catch (e) { apagar.erro = e.message || String(e); }
    apagar.apagando = false; renderPanel();
  }
  function apagarView() {
    const act = S.active?.id, mesma = !!apagar.chat && apagar.chat === act, agoraS = Date.now() / 1000;
    return [
      h('div', { class: 'eh' }, h('b', null, 'Apagar mensagens para todos')),
      h('p', { class: 'hint' }, 'Apaga PARA TODOS as suas mensagens enviadas na conversa aberta, mesmo depois do prazo normal do WhatsApp. É experimental: quem decide se aceita as mais antigas é o servidor do WhatsApp (mensagens que ele recusar aparecem como "não confirmadas"). Não dá para desfazer.'),
      h('div', { class: 'rowf' }, h('button', { class: 'obtn', disabled: !act || apagar.carregando || apagar.apagando, onclick: apagarCarregar }, apagar.carregando ? 'Carregando…' : 'Carregar minhas mensagens'),
        mesma && apagar.msgs?.length ? h('button', { class: 'obtn', onclick: () => { apagar.sel = apagar.sel.size === apagar.msgs.length ? new Set() : new Set(apagar.msgs.map((m) => m.id)); renderPanel(); } }, apagar.sel.size === apagar.msgs.length ? 'Desmarcar todas' : 'Marcar todas') : null),
      !act ? h('p', { class: 'empty' }, 'Abra uma conversa para ver as suas mensagens.') : null,
      act && apagar.chat && !mesma ? h('p', { class: 'hint dan' }, 'Esta lista é de outra conversa: carregue de novo.') : null,
      apagar.erro ? h('p', { class: 'hint dan' }, 'Não deu certo: ' + apagar.erro) : null,
      apagar.resultado ? h('p', { class: apagar.resultado.falhas.length ? 'hint dan' : 'hint iaok', role: 'status' }, `✔ ${apagar.resultado.ok} apagada(s)` + (apagar.resultado.falhas.length ? ` · ✖ ${apagar.resultado.falhas.length} não confirmada(s): ${[...new Set(apagar.resultado.falhas)].join('; ')}` : '')) : null,
      mesma && apagar.msgs ? (apagar.msgs.length ? h('div', { class: 'col' }, apagar.msgs.map((m) => {
        const idadeH = (agoraS - m.t) / 3600, velha = idadeH > APAGAR_PRAZO_H, quando = new Date(m.t * 1000).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
        return h('label', { class: 'card', style: 'cursor:pointer' }, h('input', { type: 'checkbox', checked: apagar.sel.has(m.id), 'aria-label': 'Marcar para apagar', onchange: (e) => { if (e.target.checked) apagar.sel.add(m.id); else apagar.sel.delete(m.id); renderPanel(); } }),
          h('div', { class: 'grow' }, h('div', null, m.texto || '[sem texto]'), h('small', { class: 'hint' }, quando + (velha ? ' · fora do prazo normal do WhatsApp' : ''))));
      })) : [h('p', { class: 'empty' }, 'Nenhuma mensagem sua nesta conversa (ou já foram apagadas).')]) : null,
      mesma && apagar.msgs?.length ? h('div', { class: 'rowf' }, h('button', { class: 'obtn dan', disabled: !apagar.sel.size || apagar.apagando, onclick: apagarExecutar }, apagar.apagando ? 'Apagando…' : `Apagar para todos (${apagar.sel.size})`)) : null,
    ];
  }

  // ----- Recuperar mensagens apagadas (v1.38) -----
  // A wa-js avisa ANTES de o WhatsApp apagar: a ponte tira uma "foto" da mensagem (texto, legenda, miniatura) e manda para cá. Guardamos no IndexedDB DESTE computador, só das mensagens
  // que forem apagadas (nada é arquivado antes), por N dias. Nada disto vai para a IA, a planilha, o relatório ou o administrador (o relatório leva só contagens).
  const rec = { lista: null, carregado: false, novas: 0, solo: false, urls: [], db: null };
  const recSync = { ult: '' };
  const recCfg = () => AZREC.normalizarCfg(S.recuperarCfg);
  const recNaoVistas = () => (rec.lista || []).filter((r) => r.apagadaEm > (Number(S.recuperarVisto) || 0)).length;   // apagadas guardadas que você ainda não viu (some ao abrir a aba)
  const recAbrir = () => (rec.db = rec.db || new Promise((res, rej) => { try { const q = indexedDB.open('atendezap-recuperar', 1); q.onupgradeneeded = () => q.result.createObjectStore('rec', { keyPath: 'id' }); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); } catch (e) { rej(e); } }));
  const recReq = async (modo, fn) => { const db = await recAbrir(); return new Promise((res, rej) => { const tx = db.transaction('rec', modo), rq = fn(tx.objectStore('rec')); tx.oncomplete = () => res(rq ? rq.result : undefined); tx.onerror = tx.onabort = () => rej(tx.error); }); };
  const recTodas = async () => ((await recReq('readonly', (st) => st.getAll())) || []).sort((a, b) => b.apagadaEm - a.apagadaEm);
  const recPut = (r) => recReq('readwrite', (st) => st.put(r)), recGet = (id) => recReq('readonly', (st) => st.get(id)), recDel = (id) => recReq('readwrite', (st) => st.delete(id)), recLimpar = () => recReq('readwrite', (st) => st.clear());
  function recuperarSincronizar() {
    ligacaoSincronizar(); // diz à ponte se deve (e como) guardar; só quando a parte está liberada/ligada E a pessoa ligou lá dentro
    if (!S.ready) return;
    const c = recCfg(), arg = ligado('recuperar') && c.ligado ? { grupos: c.grupos, midia: c.midia, maxMB: c.maxMB } : null, sig = JSON.stringify(arg);
    if (sig === recSync.ult) return; recSync.ult = sig;
    call('recuperarAtivo', arg).catch(() => { recSync.ult = ''; });
  }
  async function recuperarRecebeu(d) {
    const c = recCfg(); if (!ligado('recuperar') || !c.ligado) return;
    const r = AZREC.montarRegistro(d.snap, d.ev, c, Date.now()); if (!r) return;
    try { await recPut(r); } catch (e) { logErr('recuperar', e.message || String(e)); return; }
    rec.novas++; rec.carregado = false; rec.lista = [r, ...(rec.lista || []).filter((x) => x.id !== r.id)];
    toast(`${r.deNome || r.chatNome || 'Alguém'} apagou uma mensagem${r.indisponivel ? ' (conteúdo indisponível)' : ': “' + (r.texto || r.rotulo || '').slice(0, 60) + '”'}. Toque em Ver.`, 12000, { rotulo: 'Ver', fn: () => { rec.solo = false; openPanel('recuperar'); } });
    if (ui.sec === 'recuperar') recuperarCarregar(); else if (ui.open) renderPanel();   // aba aberta: recarrega; senão só atualiza a contagem do ícone
  }
  async function recuperarRecebeuMidia(d) { // a foto/áudio inteiro chegou depois do texto
    try { const r = await recGet(d.id); if (!r) return; const novo = AZREC.anexarMidia(r, d.midia, recCfg().maxMB); if (novo === r) return; await recPut(novo); if (ui.sec === 'recuperar') recuperarCarregar(); } catch { /* sem armazenamento */ }
  }
  async function recuperarPurgar() {
    try { const p = AZREC.purgar(await recTodas(), recCfg().dias); for (const id of p.removidos) await recDel(id); if (p.removidos.length) rec.carregado = false; } catch { /* sem armazenamento */ }
  }
  async function recuperarCarregar(silencioso) { rec.carregado = true; try { rec.lista = await recTodas(); } catch { rec.lista = []; } if (!silencioso) renderPanel(); }
  const recuperarResumo = () => ({ ligado: ligado('recuperar') && recCfg().ligado, dias: recCfg().dias, grupos: recCfg().grupos, midia: recCfg().midia, ...AZREC.resumo(rec.lista) });
  async function recuperarCfgSalvar(mud) { S.recuperarCfg = { ...recCfg(), ...mud }; await save('recuperarCfg'); recuperarSincronizar(); renderPanel(); }
  async function recuperarLigar(on) {
    if (on && !recCfg().aceitou) {
      if (!await confirmar('Guardar as mensagens que os contatos apagarem?\n\nQuando alguém apagar uma mensagem para todos, o AtendeZap guarda uma cópia (texto, miniatura da foto e, se você permitir, a foto ou o áudio) NESTE computador, por alguns dias, para você poder ler depois. Só as apagadas são guardadas; nada vai para a IA, para a planilha nem para o administrador. Só funciona com o WhatsApp Web aberto. Use com responsabilidade e respeite a privacidade das pessoas.', { ok: 'Entendi, ligar' })) { renderPanel(); return; }
      return recuperarCfgSalvar({ ligado: true, aceitou: true });
    }
    return recuperarCfgSalvar({ ligado: !!on });
  }
  function recuperarView() {
    if (!rec.carregado) recuperarCarregar();
    if (rec.lista && recNaoVistas() > 0) { S.recuperarVisto = Date.now(); save('recuperarVisto'); }   // abriu a aba: tudo o que há aqui passa a "visto"
    for (const u of rec.urls) URL.revokeObjectURL(u); rec.urls = [];
    const c = recCfg(), act = S.active?.id, lista = (rec.lista || []).filter((r) => !rec.solo || r.chatId === act), fmt2 = (ms) => new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const cartao = (r) => {
      const midia = r.midia, img = midia?.mime.startsWith('image/') ? `data:${midia.mime};base64,${midia.b64}` : r.thumb ? `data:image/jpeg;base64,${r.thumb}` : '';
      let audio = null;
      if (midia && /^(audio|video)\//.test(midia.mime)) { const u = URL.createObjectURL(new Blob([Uint8Array.from(atob(midia.b64), (ch) => ch.charCodeAt(0))], { type: midia.mime })); rec.urls.push(u); audio = h(midia.mime.startsWith('video/') ? 'video' : 'audio', { controls: true, src: u, style: 'max-width:100%' }); }
      return h('div', { class: 'card' },
        h('div', { class: 'grow' },
          h('b', null, (r.grupo ? `${r.deNome || 'Alguém'} · ${r.chatNome || 'grupo'}` : r.chatNome || r.deNome || 'Contato') + (r.por === 'admin' ? ' (apagada por um admin)' : '')),
          h('small', { class: 'hint' }, (r.enviadaEm ? `enviada ${fmt2(r.enviadaEm)} · ` : '') + `apagada ${fmt2(r.apagadaEm)}`),
          r.indisponivel ? h('p', { class: 'hint dan' }, 'Apagou uma mensagem, mas o conteúdo já não estava na memória do WhatsApp (não deu para guardar).') : null,
          img ? h('img', { src: img, alt: 'Foto apagada', style: 'max-width:100%;border-radius:8px;margin-top:6px' }) : null, audio,
          r.rotulo && !img && !audio ? h('p', null, r.rotulo + (r.dur ? ` (${Math.floor(r.dur / 60)}:${String(r.dur % 60).padStart(2, '0')})` : '') + (r.nome ? ' ' + r.nome : '') + (r.tipo === 'ptt' || r.tipo === 'audio' ? ' — o áudio não foi guardado' : '')) : null,
          r.texto ? h('p', { style: 'white-space:pre-wrap' }, r.texto) : null,
          h('div', { class: 'rowf' },
            r.texto ? h('button', { class: 'obtn', onclick: () => navigator.clipboard.writeText(r.texto).then(() => toast('Texto copiado.')) }, 'Copiar texto') : null,
            r.chatId ? h('button', { class: 'obtn', onclick: () => call('openChat', r.chatId) }, 'Abrir conversa') : null,
            h('button', { class: 'obtn', onclick: async () => { await recDel(r.id); recuperarCarregar(); } }, 'Esquecer'))));
    };
    return [
      h('div', { class: 'eh' }, h('b', null, 'Mensagens apagadas pelos contatos')),
      h('div', { class: 'sec' },
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: c.ligado, onchange: (e) => recuperarLigar(e.target.checked) }), 'Guardar uma cópia, neste computador, das mensagens que os contatos apagarem'),
        h('p', { class: 'hint' }, 'Só as apagadas são guardadas (nada é arquivado antes), só neste computador, e só com o WhatsApp Web aberto: apagadas com a página fechada não dá para pegar. Não vai para a IA, nem para a planilha, nem para o administrador.'),
        c.ligado ? [
          h('label', { class: 'lb' }, 'Guardar por', h('select', { class: 'in', onchange: (e) => { recuperarCfgSalvar({ dias: +e.target.value }); recuperarPurgar(); } }, [[1, '1 dia'], [3, '3 dias'], [7, '7 dias'], [15, '15 dias'], [30, '30 dias']].map(([v, t]) => h('option', { value: v, selected: c.dias === v }, t)))),
          h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: c.grupos, onchange: (e) => recuperarCfgSalvar({ grupos: e.target.checked }) }), 'Incluir grupos'),
          h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: c.midia, onchange: (e) => recuperarCfgSalvar({ midia: e.target.checked }) }), `Tentar guardar também fotos e áudios (até ${c.maxMB} MB cada)`),
          h('p', { class: 'hint' }, 'Fotos e áudios só são guardados se o WhatsApp ainda tiver o arquivo no instante em que a mensagem é apagada; senão fica só a miniatura e o texto. Visualização única nunca é guardada.'),
        ] : null),
      c.ligado ? h('div', { class: 'rowf' }, h('span', { class: 'hint grow' }, `${(rec.lista || []).length} mensagem(ns) guardada(s)`),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: rec.solo, onchange: (e) => { rec.solo = e.target.checked; renderPanel(); } }), 'Só desta conversa'),
        (rec.lista || []).length ? h('button', { class: 'obtn dan', onclick: async () => { if (await confirmar('Apagar TUDO o que foi guardado aqui?\n\nIsto não apaga nada no WhatsApp: só esquece as cópias guardadas pelo AtendeZap.', { ok: 'Apagar tudo' })) { await recLimpar(); recuperarCarregar(); } } }, 'Esquecer tudo') : null) : null,
      c.ligado ? h('div', { class: 'col' }, lista.length ? lista.map(cartao) : [h('p', { class: 'empty' }, rec.solo ? 'Nenhuma apagada guardada desta conversa.' : 'Nada apagado ainda. Quando um contato apagar uma mensagem, ela aparece aqui.')]) : null,
    ];
  }

  // ----- Contato do cliente: aparelho provável (v1.43) -----
  // O WhatsApp não informa o aparelho: é um PALPITE pelo formato do identificador das mensagens que a pessoa mandou (regra da própria biblioteca). Só conversas individuais.
  const ctt = { id: '', dados: null, carregando: false, erro: '' };
  async function contatoCarregar() {
    if (ctt.carregando) return; ctt.carregando = true; ctt.erro = ''; renderPanel();
    try {
      const id = await activeChatId().catch(() => null); if (!id) { ctt.erro = 'Abra uma conversa para ver o contato.'; ctt.id = ''; return; }
      ctt.id = id; const [info, ap] = await Promise.all([call('contatoInfo', id).catch(() => ({})), call('contatoAparelho', id, 40)]);
      ctt.dados = { id, info: info || {}, grupo: !!ap.grupo, resumo: AZAPARELHO.resumo(ap.ids || []) };
    } catch (e) { ctt.erro = 'Não consegui ler o contato: ' + String(e?.message || e).slice(0, 100); }
    finally { ctt.carregando = false; renderPanel(); }
  }
  function contatoView() {
    if (!ctt.carregando && !ctt.agendado && !ctt.erro && S.active?.id && S.active.id !== ctt.id) { ctt.agendado = true; setTimeout(() => { ctt.agendado = false; contatoCarregar(); }, 0); }   // DEPOIS de a tela terminar de montar (redesenhar no meio do desenho empilha dois painéis)
    const d = ctt.dados, r = d?.resumo, CONF = { alta: 'boa', media: 'razoável', baixa: 'fraca', nenhuma: 'nenhuma' };
    return [
      h('div', { class: 'eh' }, h('b', null, 'Contato do cliente')),
      h('div', { class: 'sec' },
        h('p', { class: 'hint' }, 'Mostra o que dá para saber da conversa aberta, incluindo o aparelho PROVÁVEL (um palpite pelo formato das mensagens que a pessoa mandou).'),
        h('div', { class: 'rowf' }, h('button', { class: 'gbtn sm', disabled: ctt.carregando, onclick: () => { ctt.id = ''; ctt.erro = ''; ctt.dados = null; contatoCarregar(); } }, ctt.carregando ? 'Lendo…' : 'Ver / atualizar o contato aberto')),
        ctt.erro ? h('p', { class: 'hint dan' }, ctt.erro) : null),
      !d ? null : h('div', { class: 'sec' },
        h('b', null, d.info.nome || 'Contato'), h('small', { class: 'hint' }, `Número: ${String(d.id).split('@')[0]} · Salvo na agenda: ${d.info.salvo === true ? 'sim' : d.info.salvo === false ? 'não' : 'não deu para saber'}${(d.info.etiquetas || []).length ? ` · ${d.info.etiquetas.length} etiqueta(s)` : ''}`),
        d.grupo ? h('p', { class: 'hint' }, 'Em grupos não dá para saber: cada pessoa tem o seu aparelho.')
          : !r.provavel ? h('p', { class: 'hint' }, 'Aparelho: não deu para saber (as mensagens recentes não têm o padrão que a biblioteca reconhece).')
            : [h('p', null, h('b', null, `Aparelho provável: ${r.rotulo}`), ` (confiança ${CONF[r.confianca]})`),
              h('small', { class: 'hint' }, `Das últimas ${r.total} mensagens dele: ${r.contagem.android} com cara de Android · ${r.contagem.iphone} de iPhone · ${r.contagem.web} de WhatsApp Web/computador · ${r.contagem.desconhecido} sem pista.`),
              r.provavel === 'web' ? h('small', { class: 'hint' }, '“WhatsApp Web” quer dizer que ele escreveu pelo computador; ele pode ter um celular também.') : null]),
      h('p', { class: 'hint' }, 'Limite honesto: é um palpite, não uma informação do WhatsApp; pode errar, principalmente se a pessoa usa mais de um aparelho ou o WhatsApp mudar o formato dos identificadores.'),
    ];
  }

  // ----- Ligação não atendida → mensagem automática (v1.44) -----
  // O WhatsApp Web avisa quando alguém liga. Se estiver ligado, espera um pouco, confere se você já falou com a pessoa e manda UMA mensagem curta. Nunca atende nem recusa a chamada; nunca em grupo.
  const ligCfg = () => AZLIG.normalizarCfg(S.ligCfg);
  const ligSync = { ult: null }, ligPend = new Set();
  const ligAtivo = () => ligado('ligacao') && ligCfg().ligado;
  const ligUlt = (est, id) => ({ [id]: (est.ult || {})[hash32(id)] || 0 });   // guarda só um código do contato, não o número
  function ligacaoSincronizar() { if (!S.ready) return; const on = ligAtivo(); if (ligSync.ult === on) return; ligSync.ult = on; call('ligacaoAtivo', on).catch(() => { ligSync.ult = null; }); }
  async function ligacaoRecebeu(ev) {
    if (!ligAtivo() || !ev?.chatId) return;
    const c = ligCfg(), est = S.ligEstado || {}, d = AZLIG.decidir(ev, ligUlt(est, ev.chatId), c, Date.now());
    if (!d.enviar) { S.ligEstado = { ...est, motivo: d.motivo }; save('ligEstado'); return renderSeguro(); }
    if (ligPend.has(ev.chatId)) return; ligPend.add(ev.chatId);
    setTimeout(async () => {
      try {
        const ctx = await call('ligacaoContexto', ev.chatId).catch(() => null), d2 = AZLIG.depoisDaEspera(ctx, ev), d3 = AZLIG.decidir(ev, ligUlt(S.ligEstado || {}, ev.chatId), ligCfg(), Date.now());   // reconfere: você pode ter falado com ele, ou desligado
        if (!ligAtivo() || !d2.enviar || !d3.enviar) { S.ligEstado = { ...(S.ligEstado || {}), motivo: d2.motivo || d3.motivo || 'desligado' }; await save('ligEstado'); return; }
        await call('sendText', ev.chatId, ligCfg().texto);
        const cur = S.ligEstado || {};   // lido de novo AGORA: outra ligação pode ter gravado enquanto esta enviava
        S.ligEstado = { ...cur, ult: { ...(cur.ult || {}), [hash32(ev.chatId)]: Date.now() }, enviadas: (cur.enviadas || 0) + 1, motivo: '' }; await save('ligEstado');
      } catch { /* sem conexão agora: não tenta de novo */ } finally { ligPend.delete(ev.chatId); renderSeguro(); }
    }, ligCfg().esperaS * 1000);
  }
  async function ligSalvar(mud) { S.ligCfg = { ...ligCfg(), ...mud }; await save('ligCfg'); ligacaoSincronizar(); renderPanel(); }
  async function ligacaoLigar(on) {
    if (on && !ligCfg().aceitou) {
      if (!await confirmar('Responder ligações com uma mensagem?\n\nQuando alguém LIGAR para você, o AtendeZap espera um pouco e, se você ainda não tiver falado com a pessoa, manda UMA mensagem curta pedindo que ela escreva. Ele nunca atende nem recusa a chamada, nunca responde a grupos e só manda de novo ao mesmo contato depois do intervalo que você escolher. Só funciona com o WhatsApp Web aberto. A mensagem vai em seu nome: confira o texto. Em teste.', { ok: 'Entendi, ligar' })) { renderPanel(); return; }
      return ligSalvar({ ligado: true, aceitou: true });
    }
    return ligSalvar({ ligado: !!on });
  }
  const ligacaoCard = () => {
    if (!ligado('ligacao')) return null;
    const c = ligCfg(), est = S.ligEstado || {};
    return h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, 'Ligação não atendida → mensagem automática 🧪')),
      h('p', { class: 'hint' }, 'Quando alguém LIGAR, o AtendeZap espera um pouco e, se você ainda não falou com a pessoa, manda UMA mensagem curta. Nunca atende nem recusa a chamada, nunca em grupo. Só funciona com o WhatsApp Web aberto.'),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: c.ligado, onchange: (e) => ligacaoLigar(e.target.checked) }), 'Responder ligações com uma mensagem'),
      c.ligado ? [
        h('label', { class: 'lb' }, 'Mensagem que será enviada', h('textarea', { class: 'in', rows: 3, maxlength: 300, value: c.texto, onchange: (e) => ligSalvar({ texto: e.target.value }) })),
        h('label', { class: 'lb' }, 'Esperar antes de enviar (segundos, de 15 a 600)', h('input', { class: 'in', type: 'number', min: 15, max: 600, value: c.esperaS, onchange: (e) => ligSalvar({ esperaS: +e.target.value }) })),
        h('label', { class: 'lb' }, 'Não repetir para o mesmo contato por', h('select', { class: 'in', onchange: (e) => ligSalvar({ horasEntre: +e.target.value }) }, [[1, '1 hora'], [3, '3 horas'], [6, '6 horas'], [12, '12 horas'], [24, '24 horas']].map(([v, t]) => h('option', { value: v, selected: c.horasEntre === v }, t)))),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: c.video, onchange: (e) => ligSalvar({ video: e.target.checked }) }), 'Também nas chamadas de vídeo'),
        h('small', { class: 'hint' }, `Respondidas até agora: ${est.enviadas || 0}${est.motivo ? ` · última ligação não respondida porque: ${est.motivo}` : ''}`)] : null);
  };

  // ----- Resumir o que perdi (v1.44) -----
  // Lê as mensagens NÃO LIDAS das conversas individuais, mascara dados pessoais e pede à IA (a SUA chave) um resumo com prioridade. A IA só RESUME: não responde a ninguém nem envia nada.
  const rsm = { fazendo: false, dados: null, erro: '' };
  async function resumoExecutar() {
    if (rsm.fazendo) return; if (!iaPronta()) { rsm.erro = SEM_IA; return renderPanel(); }
    if (!S.resumoAceitou) {
      if (!await confirmar('Resumir o que você perdeu?\n\nO AtendeZap vai ler as mensagens NÃO LIDAS das suas conversas individuais (sem grupos), mascarar telefones, CPF e e-mails e enviar o texto para a IA do Google, com a SUA chave, só para ela resumir e dar prioridade. Ela não responde a ninguém nem envia nada. Em teste.', { ok: 'Entendi, resumir' })) return;
      S.resumoAceitou = true; await save('resumoAceitou');
    }
    rsm.fazendo = true; rsm.erro = ''; renderPanel();
    try {
      const lido = await call('naoLidas', 15, 20), chats = lido.chats || [];
      if (!chats.length) { rsm.dados = { itens: [], vazio: true, t: Date.now() }; return; }
      const r = await iaPedir({ op: 'gerar', json: true, temperatura: 0.2, sistema: AZRESUMO.PROMPT, contents: [{ role: 'user', parts: [{ text: AZRESUMO.entrada(chats, IA.mascarar) }] }] });
      if (r.erro) { rsm.erro = r.erro; return; }
      const val = AZRESUMO.validar(IA.extrairJson(r.texto), chats.length);
      rsm.dados = { t: Date.now(), itens: AZRESUMO.ordenar(chats.map((c, i) => ({ id: c.id, nome: c.nome, nao: c.nao, ...(val[i + 1] || { resumo: '(a IA não resumiu esta conversa: abra para ver)', prioridade: 'media', acao: '' }) }))) };
    } catch (e) { rsm.erro = 'Não deu certo: ' + String(e?.message || e).slice(0, 140); } finally { rsm.fazendo = false; renderPanel(); }
  }
  function resumoView() {
    const d = rsm.dados, COR = { alta: ['🔴', 'bad'], media: ['🟡', 'warn'], baixa: ['⚪', 'mut'] };
    return [
      h('div', { class: 'eh' }, h('b', null, 'Resumo do que você perdeu')),
      h('div', { class: 'sec' },
        h('p', { class: 'hint' }, 'A IA lê as mensagens NÃO LIDAS das conversas individuais e diz, em poucas palavras, o que cada pessoa quer e o que fazer primeiro. Ela só resume: não responde a ninguém. Os textos vão mascarados (sem telefone, CPF e e-mail) para a IA do Google, com a sua chave.'),
        h('div', { class: 'rowf' }, h('button', { class: 'gbtn sm', disabled: rsm.fazendo, onclick: resumoExecutar }, rsm.fazendo ? 'Resumindo…' : '📝 Resumir o que perdi')),
        rsm.erro ? h('p', { class: 'hint dan' }, rsm.erro) : null),
      !d ? null : d.vazio ? h('p', { class: 'hint' }, 'Nenhuma conversa individual com mensagem não lida. Tudo em dia!')
        : h('div', { class: 'col' }, h('small', { class: 'hint' }, `${d.itens.length} conversa(s) com mensagens não lidas · ${new Date(d.t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`),
          d.itens.map((it) => h('div', { class: 'card pedplano' }, h('div', { class: 'grow' }, h('b', { class: COR[it.prioridade][1] }, `${COR[it.prioridade][0]} ${it.nome || 'Contato'} · ${it.nao} não lida(s)`), h('small', null, it.resumo), it.acao ? h('small', { class: 'iaprop' }, `Fazer: ${it.acao}`) : null,
            h('div', { class: 'rowf' }, h('button', { class: 'obtn', onclick: () => call('openChat', it.id) }, 'Abrir conversa'))))),
          h('p', { class: 'hint' }, 'O resumo é feito por IA e pode errar: confirme abrindo a conversa.')),
    ];
  }

  // ----- Avaliação do atendimento contra a memória (v1.44) -----
  // SEM IA e SEM nota para ninguém: confere o que você respondeu nas conversas reais contra as perguntas e respostas que a memória já aprendeu e mostra os casos para você olhar.
  const av = { fazendo: false, dias: 7, res: null, erro: '' };
  const avCfg = () => ({ auto: false, ...(S.avCfg || {}) });
  const avPendentes = () => { const u = S.avUltimo; return u && Date.now() - u.t < 30 * 36e5 ? (u.semResposta || 0) : 0; };   // clientes sem resposta na última avaliação (some depois de 30 h sem nova)
  async function avSalvar(mud) { S.avCfg = { ...avCfg(), ...mud }; await save('avCfg'); renderPanel(); if (mud.auto) setTimeout(avAuto, 800); }
  function avAuto() { if (!avCfg().auto || !ligado('avaliacao') || !S.ready || av.fazendo || Date.now() - ((S.avUltimo || {}).t || 0) < 24 * 36e5) return; avaliarExecutar(true); }   // 1 vez por dia, só olhando as últimas 24 h
  async function avaliarExecutar(auto) {
    const dias = auto === true ? 1 : av.dias;
    if (av.fazendo) return; av.fazendo = true; av.erro = ''; if (auto === true) renderSeguro(); else renderPanel();
    try {
      const lido = await call('conversasParaTreino', dias, 60, 100), marcas = S.atendEnv || [];
      const memoria = (S.memFatos || []).filter((f) => f.tipo === 'faq' && f.ativo !== false).map((f) => ({ p: f.p, r: f.r }));
      const ehRoboPorChat = (id) => { const hc = hash32(id), meus = marcas.filter((m) => m.h === hc); return (m) => meus.some((x) => m.t * 1000 >= x.t - 5000 && m.t * 1000 <= x.t + 150000); };
      av.res = { ...AZAVAL.avaliar(lido.chats || [], memoria, { agora: Date.now(), esperaMin: 15, ehRoboPorChat }), dias, t: Date.now(), memN: memoria.length, lidas: (lido.chats || []).length };
      S.avUltimo = { t: Date.now(), semResposta: av.res.semResposta.length, divergentes: av.res.divergentes.length, trocas: av.res.trocas, dias }; save('avUltimo');
      if (await conhecScriptOk(5)) memEnfileirar('IA - Avaliação', IA.linhaAvaliacao(av.res));
    } catch (e) { av.erro = 'Não deu certo: ' + String(e?.message || e).slice(0, 140); } finally { av.fazendo = false; renderPanel(); }
  }
  function avaliacaoView() {
    const r = av.res, dur = (s) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`);
    return [
      h('div', { class: 'eh' }, h('b', null, 'Avaliação do atendimento')),
      h('div', { class: 'sec' },
        h('p', { class: 'hint' }, 'Lê as suas conversas individuais do período e confere: o que você respondeu bate com o que a memória já aprendeu? Quem ficou sem resposta? Quanto você demora? Não usa IA, não dá nota a ninguém e não envia nada: só mostra os casos para você olhar. Respostas do robô não entram.'),
        h('label', { class: 'lb' }, 'Período', h('select', { class: 'in', disabled: av.fazendo, onchange: (e) => { av.dias = +e.target.value; } }, [[1, 'Hoje / últimas 24 h'], [7, 'Últimos 7 dias'], [30, 'Últimos 30 dias']].map(([v, t]) => h('option', { value: v, selected: av.dias === v }, t)))),
        h('div', { class: 'rowf' }, h('button', { class: 'gbtn sm', disabled: av.fazendo, onclick: () => avaliarExecutar() }, av.fazendo ? 'Avaliando…' : '📊 Avaliar')),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: avCfg().auto, onchange: (e) => avSalvar({ auto: e.target.checked }) }), 'Avaliar sozinho uma vez por dia (últimas 24 h) e mostrar um número no ícone com os clientes sem resposta. Sem IA.'),
        av.erro ? h('p', { class: 'hint dan' }, av.erro) : null),
      !r ? null : [
        h('div', { class: 'sec' }, h('b', null, `${r.lidas} conversa(s) · ${r.trocas} troca(s) “cliente perguntou → você respondeu”`),
          h('small', { class: 'hint' }, r.memN ? `Memória usada: ${r.memN} pergunta(s) e resposta(s) aprovadas. Das trocas, ${r.comMemoria} tinham memória: ${r.consistentes} bateram e ${r.divergentes.length} ficaram diferentes.` : 'A memória ainda não tem perguntas e respostas aprovadas: aprove algumas em Atendimento › Memória IA para a avaliação comparar.'),
          h('small', { class: 'hint' }, r.tempo.n ? `Tempo para responder: mediana ${dur(r.tempo.mediana)} · “pior 1 em cada 10” ${dur(r.tempo.p90)} (${r.tempo.n} troca(s)).` : 'Sem trocas para medir o tempo.'),
          h('small', { class: 'hint' }, `Sem resposta há mais de 15 min: ${r.semResposta.length}.`)),
        r.divergentes.length ? h('div', { class: 'sec' }, h('b', null, `Respostas diferentes da memória (${r.divergentes.length})`), h('small', { class: 'hint' }, 'Ou a memória está desatualizada, ou a resposta fugiu do combinado: você decide.'),
          r.divergentes.slice(0, 15).map((d) => h('div', { class: 'card pedplano' }, h('div', { class: 'grow' }, h('b', null, d.nome || 'Contato'), h('small', null, `Pergunta: ${d.p}`), h('small', null, `Você respondeu: ${d.resposta}`), h('small', { class: 'iaprop' }, `A memória diz: ${d.memoriaR}`), h('div', { class: 'rowf' }, h('button', { class: 'obtn', onclick: () => call('openChat', d.id) }, 'Abrir conversa')))))) : null,
        r.semResposta.length ? h('div', { class: 'sec' }, h('b', null, `Clientes sem resposta (${r.semResposta.length})`),
          r.semResposta.slice(0, 15).map((x) => h('div', { class: 'card pedplano' }, h('div', { class: 'grow' }, h('b', null, `${x.nome || 'Contato'} · esperando há ${dur(x.esperaMin * 60)}`), h('small', null, x.texto), h('div', { class: 'rowf' }, h('button', { class: 'obtn', onclick: () => call('openChat', x.id) }, 'Abrir conversa')))))) : null,
        r.semMemoria.length ? h('div', { class: 'sec' }, h('b', null, 'Perguntas que a memória ainda não cobre'), h('small', { class: 'hint' }, 'Boas candidatas a aprender (as mais repetidas primeiro).'),
          r.semMemoria.map((x) => h('small', null, `• ${x.p} (${x.n} vez(es), ${x.chats} conversa(s))`))) : null],
    ];
  }

  // ----- Envios à IA (v1.45): transparência -----
  function iaEnviosView() {
    const hora = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), n = iaReg.itens.length;
    return [
      h('div', { class: 'eh' }, h('b', null, 'Envios à IA')),
      h('div', { class: 'sec' },
        h('p', { class: 'hint' }, 'Aqui você vê EXATAMENTE o que o AtendeZap mandou para a IA do Google (com a SUA chave) nesta sessão: já com telefones, CPF e e-mails mascarados. Só fica na memória da página: some ao recarregar e nada é gravado em disco. Áudio vai como arquivo (a voz não dá para mascarar).'),
        h('div', { class: 'rowf' }, h('span', { class: 'hint grow' }, `${n} envio(s) guardado(s) (os últimos 25)`), n ? h('button', { class: 'obtn dan', onclick: () => { iaReg.itens = []; renderPanel(); } }, 'Limpar') : null)),
      n ? h('div', { class: 'col' }, iaReg.itens.map((e) => h('details', { class: 'card pedplano' }, h('summary', null, `${hora(e.t)} · ${e.rotulo} · ${e.chars} caracteres${e.ms ? ` · ${e.ms} ms` : ''}${e.erro ? ` · ⚠ ${e.erro}` : ''}`),
        e.sistema ? h('small', { class: 'mut' }, `Instrução: ${e.sistema}…`) : null, h('pre', { style: 'white-space:pre-wrap;font-size:11px;max-height:220px;overflow:auto' }, e.texto || '(sem texto)'), e.cortado ? h('small', { class: 'mut' }, 'Mostrando só o começo.') : null)))
        : h('p', { class: 'hint' }, 'Ainda não houve nenhum envio nesta sessão.'),
    ];
  }

  // ----- Começar aqui (v1.45): primeira configuração guiada, só mostra o que falta e some quando acaba (ou quando você dispensa) -----
  const comecarCard = () => {
    if (S.comecarOculto) return null;
    const passos = [
      ligado('cfgIA') && ['Chave do Gemini (a IA)', iaPronta(), 'cole a chave logo abaixo, em "Assistente de IA".', null],
      ligado('cargas') && ['Link da planilha de frete', !!S.cargasUrl, 'cole o link do app da Web da sua planilha (termina em /exec).', ['Abrir', 'frete']],
      ligado('atendente') && ['Gravar o aprendizado na planilha', !!(atendC().planilhaAprende && S.iaCfg?.tokenPlanilha), 'liga o banco de dados na sua planilha (precisa do link e da senha).', ['Abrir', 'memoria']],
      ligado('atendente') && ['Escolher como o robô atende', !!S.atendCfg?.modo, 'comece em "sugerir": ele propõe e você decide.', ['Abrir', 'atendente']],
      ligado('atendente') && ['Aprovar a primeira memória', (S.memFatos || []).length > 0, 'quando a IA propuser algo em "Para você decidir", aprove o que estiver certo.', ['Abrir', 'memoria']],
      ligado('escuta') && ['Ligar a escuta automática (opcional)', conhecCfg().ligado, 'a IA aprende com as suas conversas e propõe regras.', ['Abrir', 'memoria']],
    ].filter(Boolean);
    if (!passos.length || passos.every((x) => x[1])) return null;
    return h('div', { class: 'card comeca' }, h('div', { class: 'grow' }, h('b', null, `Começar aqui ✨ (${passos.filter((x) => x[1]).length} de ${passos.length})`),
      passos.map(([nome, ok, dica, ir]) => h('div', { class: 'rowf' }, h('span', { class: 'grow' }, `${ok ? '✅' : '⬜'} ${nome}`, ok ? null : h('small', { class: 'hint' }, ` — ${dica}`)), !ok && ir ? h('button', { class: 'obtn', onclick: () => openPanel(ir[1]) }, ir[0]) : null)),
      h('div', { class: 'rowf' }, h('button', { class: 'obtn', onclick: async () => { S.comecarOculto = true; await save('comecarOculto'); renderPanel(); } }, 'Não mostrar mais'))));
  };

  // ----- Exportar conversa (v1.42) -----
  // Lê a conversa aberta no intervalo De–Até (horário local), baixa a mídia (se marcado) e monta UM .zip: conversa.txt (estilo WhatsApp), conversa.csv (planilha), relatorio.txt e midia/…
  // Só exporta o que o WhatsApp Web consegue carregar; mídia que o WhatsApp já descartou aparece no relatório. Visualização única nunca é exportada. Tudo roda neste computador.
  const exp = { fazendo: false, cancelar: false, status: '', resultado: null, midia: true, maxMB: 150, de: '', ate: '' };
  const expF = (d, hh, mm) => { const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(hh)}:${p(mm)}`; };
  const expAtalho = (qual) => {
    const n = new Date(), dia = (menos) => new Date(n.getFullYear(), n.getMonth(), n.getDate() - menos);
    if (qual === 'hoje') { exp.de = expF(dia(0), 0, 0); exp.ate = expF(n, n.getHours(), n.getMinutes()); }
    else if (qual === 'ontem') { exp.de = expF(dia(1), 0, 0); exp.ate = expF(dia(1), 23, 59); }
    else { exp.de = expF(dia(7), n.getHours(), n.getMinutes()); exp.ate = expF(n, n.getHours(), n.getMinutes()); }
    renderPanel();
  };
  async function exportarExecutar() {
    if (exp.fazendo) return;
    const iv = AZEXP.intervalo(exp.de, exp.ate); if (iv.erro) return toast(iv.erro, 5000);
    const id = await activeChatId().catch(() => null); if (!id) return toast('Abra a conversa que você quer exportar.', 5000);
    exp.fazendo = true; exp.cancelar = false; exp.resultado = null; exp.status = 'Lendo as mensagens…'; renderPanel();
    try {
      const lido = await call('exportarLer', id, iv.de, iv.ate), msgs = lido.msgs || [];
      if (!msgs.length) { exp.resultado = { vazio: true, maisAntiga: lido.maisAntiga ? lido.maisAntiga * 1000 : 0 }; return; }
      const meta = { chatNome: lido.chatNome || S.active?.name || 'conversa', grupo: !!lido.grupo, de: iv.de, ate: iv.ate, agora: Date.now(), semMidia: !exp.midia };
      const entradas = [], arquivos = {}, falhas = [], limite = exp.maxMB * 1e6, lista = exp.midia ? msgs.filter((m) => !m.apagada && !m.viewOnce && AZEXP.TEM_ARQUIVO.has(m.tipo)) : [];
      let usados = 0, baixadas = 0, k = 0;
      for (const m of lista) {
        if (exp.cancelar) throw new Error('cancelado');
        exp.status = `Baixando mídia ${++k} de ${lista.length}…`; renderPanel();
        const r = await call('exportarMidia', m.id, Math.min(100e6, limite - usados)).catch((e) => ({ ok: false, motivo: String(e.message || e).slice(0, 100) }));
        if (r && r.ok && usados + r.buf.byteLength <= limite) { const nome = AZEXP.nomeMidia(++baixadas, m, m.mime || r.mime); arquivos[m.id] = nome; usados += r.buf.byteLength; entradas.push({ nome: 'midia/' + nome, dados: new Uint8Array(r.buf), data: new Date(m.t * 1000) }); }
        else falhas.push({ t: m.t, tipo: m.tipo, motivo: r && r.ok ? 'passou do limite total de tamanho' : (r && r.motivo) || 'falhou' });
      }
      const mais = lido.maisAntiga ? lido.maisAntiga * 1000 : 0, rel = { ...AZEXP.resumoMsgs(msgs), baixadas, falhas, truncado: !!lido.truncado, faltouInicio: !!(mais && mais > iv.de), maisAntiga: mais };
      entradas.unshift({ nome: 'conversa.txt', dados: AZEXP.montarTxt(meta, msgs, arquivos), data: new Date() }, { nome: 'conversa.csv', dados: AZEXP.montarCsv(msgs, arquivos), data: new Date() }, { nome: 'relatorio.txt', dados: AZEXP.relatorio(meta, rel), data: new Date() });
      exp.status = 'Montando o arquivo…'; renderPanel();
      const zip = AZZIP.montar(entradas), nomeArq = AZEXP.nomeZip(meta), url = URL.createObjectURL(new Blob(zip.partes, { type: 'application/zip' })), a = h('a', { href: url, download: nomeArq });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 120000);
      exp.resultado = { arquivo: nomeArq, msgs: msgs.length, midias: baixadas, falhas: falhas.length, mb: (zip.tamanho / 1e6).toFixed(1), truncado: rel.truncado, faltouInicio: rel.faltouInicio, maisAntiga: mais };
    } catch (e) { exp.resultado = { erro: e && e.message === 'cancelado' ? 'Exportação cancelada.' : 'Não deu certo: ' + String((e && e.message) || e).slice(0, 160) }; }
    finally { exp.fazendo = false; exp.status = ''; renderPanel(); }
  }
  function exportarView() {
    if (!exp.de || !exp.ate) { const n = new Date(); exp.de = exp.de || expF(n, 0, 0); exp.ate = exp.ate || expF(n, n.getHours(), n.getMinutes()); }
    const r = exp.resultado, fmtD = (ms) => `${AZEXP.dataBR(ms)} ${AZEXP.horaBR(ms, false)}`;
    return [
      h('div', { class: 'eh' }, h('b', null, 'Exportar conversa')),
      h('div', { class: 'sec' },
        h('p', { class: 'hint' }, `Conversa: ${S.active?.name || 'a que está aberta no WhatsApp'}. Escolha o período (horário do seu computador) e o AtendeZap monta um arquivo .zip com o texto, uma planilha e a mídia.`),
        h('div', { class: 'rowf' }, h('button', { class: 'obtn', onclick: () => expAtalho('hoje') }, 'Hoje'), h('button', { class: 'obtn', onclick: () => expAtalho('ontem') }, 'Ontem'), h('button', { class: 'obtn', onclick: () => expAtalho('7') }, 'Últimos 7 dias')),
        h('label', { class: 'lb' }, 'De', h('input', { class: 'in', type: 'datetime-local', value: exp.de, disabled: exp.fazendo, onchange: (e) => { exp.de = e.target.value; } })),
        h('label', { class: 'lb' }, 'Até (inclui o minuto escolhido)', h('input', { class: 'in', type: 'datetime-local', value: exp.ate, disabled: exp.fazendo, onchange: (e) => { exp.ate = e.target.value; } })),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: exp.midia, disabled: exp.fazendo, onchange: (e) => { exp.midia = e.target.checked; renderPanel(); } }), 'Incluir a mídia (fotos, áudios, vídeos, documentos)'),
        exp.midia ? h('label', { class: 'lb' }, 'Tamanho máximo do arquivo todo', h('select', { class: 'in', disabled: exp.fazendo, onchange: (e) => { exp.maxMB = +e.target.value; } }, [[50, '50 MB'], [150, '150 MB'], [300, '300 MB'], [600, '600 MB']].map(([v, t]) => h('option', { value: v, selected: exp.maxMB === v }, t)))) : null,
        h('div', { class: 'rowf' }, exp.fazendo
          ? [h('span', { class: 'hint grow' }, exp.status || 'Trabalhando…'), h('button', { class: 'obtn dan', onclick: () => { exp.cancelar = true; exp.status = 'Cancelando…'; renderPanel(); } }, 'Cancelar')]
          : h('button', { class: 'gbtn', onclick: exportarExecutar }, 'Exportar')),
        h('p', { class: 'hint' }, 'Limites: só sai o que o WhatsApp Web consegue carregar (conversas muito longas demoram); mídia que o WhatsApp já descartou não pode ser baixada e fica listada no relatorio.txt dentro do arquivo. Visualização única nunca é exportada. Máximo de 31 dias por vez.')),
      !r ? null : r.erro ? h('p', { class: 'hint dan' }, r.erro)
        : r.vazio ? h('p', { class: 'hint' }, 'Nenhuma mensagem nesse período.' + (r.maisAntiga ? ` A mais antiga que o WhatsApp Web carregou é de ${fmtD(r.maisAntiga)}.` : ''))
        : h('div', { class: 'sec' }, h('b', null, '✔ Arquivo gerado'), h('p', { class: 'hint' }, `${r.arquivo} · ${r.msgs} mensagem(ns) · ${r.midias} mídia(s) salva(s)${r.falhas ? ` · ${r.falhas} não puderam ser baixadas (veja o relatorio.txt)` : ''} · ${r.mb} MB`),
          r.truncado ? h('p', { class: 'hint dan' }, 'A conversa é muito longa e a leitura parou antes do início do período: pode faltar o começo. Exporte um intervalo menor.') : null,
          r.faltouInicio ? h('p', { class: 'hint' }, `O WhatsApp Web só carregou mensagens a partir de ${fmtD(r.maisAntiga)}. Se o período começa antes disso, o começo pode estar incompleto.`) : null),
    ];
  }

  // ----- Backup -----
  const fmt = (d) => (d ? new Date(d).toLocaleString('pt-BR') : '—');
  async function doBackup(grupos) {
    let dados = await chrome.storage.local.get(null);
    for (const k of U.BACKUP_NUNCA) delete dados[k];   // a chave da API, o convite da equipe e a identificação deste computador NUNCA vão para um arquivo (nem no backup completo)
    if (!grupos) for (const k of U.BACKUP_GROUPS.find(([g]) => g === 'conhecimento')[2]) delete dados[k];   // o banco de conhecimento só entra quando você marca o grupo
    if (grupos) dados = Object.fromEntries(U.backupKeys(dados, grupos).map((k) => [k, dados[k]]));
    const blob = new Blob([JSON.stringify({ app: 'AtendeZap', versao: chrome.runtime.getManifest().version, criadoEm: new Date().toISOString(), dados })], { type: 'application/json' });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
    const a = h('a', { href: URL.createObjectURL(blob), download: `atendezap-backup-${stamp}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    S.backup = { ...S.backup, ultimo: new Date().toISOString() };
    await save('backupAutomatico');
  }
  async function checkBackup() {
    if (!ligado('backup')) return;
    const { backupAutomatico: cfg } = await chrome.storage.local.get('backupAutomatico');
    if (U.backupDue(cfg || S.backup)) { await doBackup(); toast('💾 Backup automático salvo na pasta Downloads.'); }
  }
  function readBackup(file) {
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => {
      let obj;
      try { obj = JSON.parse(fr.result); } catch { return toast('Arquivo inválido.'); }
      if (obj?.app !== 'AtendeZap' || typeof obj.dados !== 'object') return toast('Este arquivo não é um backup do AtendeZap.');
      const tem = U.BACKUP_GROUPS.filter(([g]) => U.backupKeys(obj.dados, [g]).length).map(([g]) => g);
      view.restore = { obj, nome: file.name, tem, sel: new Set(tem.filter((g) => g !== 'config')), modo: 'mesclar' };
      renderPanel();
    };
    fr.readAsText(file);
  }
  async function doRestore() {
    const r = view.restore;
    const keys = U.backupKeys(r.obj.dados, [...r.sel]);
    if (!keys.length) return toast('Marque pelo menos um item.');
    if (r.modo === 'substituir' && !await confirmar('Substituir os itens marcados pelos do arquivo? Os atuais desses itens serão apagados.')) return;
    const atual = await chrome.storage.local.get(null);
    if (r.modo === 'substituir' && r.sel.has('respostas')) await chrome.storage.local.remove(Object.keys(atual).filter((k) => k.startsWith('midia_')));
    await chrome.storage.local.set(U.mergeBackup(atual, r.obj.dados, keys, r.modo));
    view.restore = null;
    await load(); applyPins(); renderHead(); renderPanel();
    toast('Backup restaurado.');
  }
  // ----- Importar do waTidy (v1.13; escolher o que importar na v1.14) -----
  // Lê backups .json do waTidy (vários de uma vez: vale o mais novo), deixa ESCOLHER o que trazer, mostra uma PRÉVIA e só então grava.
  const wt = { fase: 'idle', backs: null, plano: null, resumo: null, erro: '', lendo: '', substituir: false, nomes: [], fim: null,
    sel: new Set(), pinsSel: new Set(), tipos: {}, aberto: { resp: true }, rolagem: {} };
  async function wtEscolher(files) {
    wt.fase = 'lendo'; wt.erro = ''; wt.fim = null; renderPanel();
    try {
      const backs = [];
      for (const f of W.ordenarPorData([...files].map((x) => Object.assign(x, { nome: x.name })))) {
        wt.lendo = f.name; renderPanel();
        let obj;
        try { obj = JSON.parse(await f.text()); } catch { throw new Error(`"${f.name}" não é um arquivo .json válido.`); }
        backs.push({ nome: f.name, data: await W.lerBackup(obj) });
      }
      wt.backs = backs; wt.nomes = backs.map((b) => b.nome);
      wt.resumo = W.resumo(backs, { replies: S.replies });
      wt.sel = new Set(wt.resumo.respostas.map((r) => r.id));                       // tudo marcado; a pessoa desmarca o que não quer
      wt.pinsSel = new Set(wt.resumo.pins.map((x) => x.id));
      wt.tipos = Object.fromEntries(Object.keys(wt.resumo.tipos).map((k) => [k, true]));
      wt.rolagem = {}; wtPlanejar(); wt.fase = 'previa';
    } catch (e) { wt.erro = e.message; wt.fase = 'idle'; wt.backs = null; }
    renderPanel();
  }
  function wtPlanejar() {
    wt.plano = W.planejar(wt.backs, { cats: S.cats, replies: S.replies, pins: S.pins, pinAbas: S.pinAbas || {} },
      { fixadas: wt.pinsSel.size > 0, pinsSel: [...wt.pinsSel], selecionadas: [...wt.sel], tipos: wt.tipos, substituir: wt.substituir, limiteMidias: MEDIA_LIMIT });
  }
  function wtRefazer() { // recalcula e redesenha mantendo a rolagem das listas
    wtPlanejar(); renderPanel();
    panelRoot.querySelectorAll('.wtbody').forEach((el) => { el.scrollTop = wt.rolagem[el.dataset.k] || 0; });
  }
  async function wtImportar() {
    const p = wt.plano; wt.fase = 'importando'; wt.erro = ''; renderPanel();
    try {
      if (p.remover.length) await chrome.storage.local.remove(p.remover);
      for (const [id, m] of Object.entries(p.midias)) await chrome.storage.local.set({ ['midia_' + id]: m });
      S.cats = p.cats; S.replies = p.replies; S.pins = p.pins; S.pinAbas = p.pinAbas;
      await save('categorias'); await save('respostasRapidas'); await save('pinChat'); await save('pinAbas');
      wt.fim = { ...p.stats, avisos: p.avisos }; wt.fase = 'fim'; wt.backs = null; wt.plano = null; wt.resumo = null;
      toast(`✔ ${p.stats.respostas} resposta(s) importada(s) do waTidy.`);
    } catch (e) { wt.erro = 'Erro ao importar: ' + e.message; wt.fase = 'previa'; }
    renderPanel();
  }
  function wtCard() {
    const f = wt.fase, p = wt.plano, rs = wt.resumo;
    const escolher = h('label', { class: 'gbtn out' }, 'Escolher arquivos…',
      h('input', { type: 'file', accept: '.json,application/json', multiple: true, hidden: true, onchange: (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) wtEscolher(fs); } }));
    const kv = (a, b) => h('div', { class: 'kv' }, h('span', null, a), h('b', null, b));
    const avisos = (l) => (l?.length ? h('details', { class: 'tec', open: true }, h('summary', null, `Avisos (${l.length})`), l.map((x) => h('small', null, x))) : null);
    const bloco = (k, titulo, acoes, corpo) => h('details', { class: 'wtsel', open: !!wt.aberto[k], ontoggle: (e) => { wt.aberto[k] = e.target.open; } },
      h('summary', null, titulo), h('div', { class: 'wtacoes' }, acoes), h('div', { class: 'wtbody', 'data-k': k, onscroll: (e) => { wt.rolagem[k] = e.target.scrollTop; } }, corpo));
    const ac = (nome, fn) => h('button', { class: 'wtlnk', onclick: fn }, nome);
    const marca = (set, id, on) => { if (on) set.add(id); else set.delete(id); };
    // respostas por categoria
    const porCat = new Map();
    for (const r of rs?.respostas || []) { if (!porCat.has(r.categoria)) porCat.set(r.categoria, []); porCat.get(r.categoria).push(r); }
    const NOME_TIPO = { imagem: 'Fotos', video: 'Vídeos', audio: 'Áudios', documento: 'Documentos' };
    const selPins = [...wt.pinsSel].length;
    return h('div', { class: 'sec' },
      h('div', { class: 'sh' }, tile('save'), h('b', { class: 'grow' }, 'Importar do waTidy')),
      f === 'idle' ? [
        h('p', { class: 'hint' }, 'Escolha um ou mais backups .json do waTidy (pode marcar vários: vale o mais novo). Depois você escolhe o que trazer: respostas rápidas (textos, fotos, vídeos, contatos, etiquetas e combos), categorias e fixadas. Nada sai do seu computador.'),
        wt.erro ? h('p', { class: 'hint dan' }, wt.erro) : null,
        h('div', { class: 'center' }, escolher),
      ] : null,
      f === 'lendo' ? h('p', { class: 'hint' }, `Lendo "${wt.lendo}"… arquivos com fotos e vídeos podem levar alguns segundos.`) : null,
      f === 'importando' ? h('p', { class: 'hint' }, 'Importando e guardando as mídias…') : null,
      f === 'previa' ? [
        kv('Arquivos lidos', `${wt.nomes.length}`),
        bloco('resp', `Respostas rápidas (${wt.sel.size}/${rs.respostas.length})`, [
          ac('Todas', () => { rs.respostas.forEach((r) => wt.sel.add(r.id)); wtRefazer(); }),
          ac('Nenhuma', () => { wt.sel.clear(); wtRefazer(); }),
          ac('Só as novas', () => { wt.sel = new Set(rs.respostas.filter((r) => !r.jaImportada).map((r) => r.id)); wtRefazer(); })],
          [...porCat].map(([cat, lista]) => h('div', { class: 'wtcat' },
            h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: lista.every((r) => wt.sel.has(r.id)),
              onchange: (e) => { lista.forEach((r) => marca(wt.sel, r.id, e.target.checked)); wtRefazer(); } }), h('b', null, `${cat} (${lista.length})`)),
            lista.map((r) => h('label', { class: 'chk wtit' }, h('input', { type: 'checkbox', checked: wt.sel.has(r.id), onchange: (e) => { marca(wt.sel, r.id, e.target.checked); wtRefazer(); } }),
              h('span', { class: 'grow' }, r.titulo),
              h('small', null, (r.tipo === 'script' ? `combo · ${r.acoes} etapas` : `${r.acoes} ação(ões)`) + (r.midias ? ` · ${r.mb} MB` : '') + (r.jaImportada ? ' · já importada' : ''))))))),
        Object.keys(rs.tipos).length ? bloco('mid', `Mídias (${p.stats.midias} · ${p.stats.mb} MB)`, [], Object.entries(rs.tipos).map(([t, v]) =>
          h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: wt.tipos[t] !== false, onchange: (e) => { wt.tipos[t] = e.target.checked; wtRefazer(); } }),
            `${NOME_TIPO[t] || t} (${v.n} · ${v.mb} MB)`))) : null,
        rs.pins.length ? bloco('fix', `Conversas fixadas (${selPins}/${rs.pins.length})`, [
          ac('Todas', () => { rs.pins.forEach((x) => wt.pinsSel.add(x.id)); wtRefazer(); }), ac('Nenhuma', () => { wt.pinsSel.clear(); wtRefazer(); })],
          rs.pins.map((x) => h('label', { class: 'chk wtit' }, h('input', { type: 'checkbox', checked: wt.pinsSel.has(x.id), onchange: (e) => { marca(wt.pinsSel, x.id, e.target.checked); wtRefazer(); } }),
            h('span', { class: 'grow' }, (String(x.id).endsWith('@g.us') ? 'Grupo …' : 'Contato …') + String(x.id).split('@')[0].slice(-6)),
            h('small', null, String(x.id).endsWith('@g.us') ? 'só na aba Grupos' : '')))) : null,
        kv('Vai importar', `${p.stats.respostas} resposta(s)` + (p.stats.jaImportadas ? ` · ${p.stats.jaImportadas} já importada(s)` : '')),
        kv('Categorias novas', `${p.stats.categorias}`),
        kv('Fixadas', `${p.stats.fixadas}`),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: wt.substituir, onchange: (e) => { wt.substituir = e.target.checked; wtRefazer(); } }),
          'Atualizar as respostas que já importei antes'),
        avisos(p.avisos),
        wt.erro ? h('p', { class: 'hint dan' }, wt.erro) : null,
        h('div', { class: 'center' },
          h('button', { class: 'gbtn out', onclick: () => { wt.fase = 'idle'; wt.backs = null; wt.plano = null; wt.resumo = null; renderPanel(); } }, 'Cancelar'),
          h('button', { class: 'gbtn', disabled: !p.stats.respostas && !p.stats.fixadas, onclick: wtImportar }, p.stats.respostas || p.stats.fixadas ? 'Importar agora' : 'Nada para importar')),
      ] : null,
      f === 'fim' ? [
        kv('Respostas importadas', `${wt.fim.respostas}`),
        kv('Mídias', `${wt.fim.midias}`),
        kv('Fixadas', `${wt.fim.fixadas}`),
        avisos(wt.fim.avisos),
        h('p', { class: 'hint' }, 'Pronto. Veja em Respostas rápidas (os atalhos /… foram criados a partir do título; dá para editar).'),
        h('div', { class: 'center' }, h('button', { class: 'obtn', onclick: () => { wt.fase = 'idle'; wt.fim = null; renderPanel(); } }, 'Importar outro backup')),
      ] : null);
  }

  function backupView() {
    const b = S.backup;
    const upd = (patch) => { S.backup = { ...S.backup, ...patch }; save('backupAutomatico'); renderPanel(); };
    view.bkSel ||= new Set(U.BACKUP_GROUPS.filter(([g]) => g !== 'conhecimento').map(([g]) => g));   // o banco de conhecimento vem DESMARCADO
    const checks = (groups, sel) => groups.map(([g, label]) => h('label', { class: 'chk' },
      h('input', { type: 'checkbox', checked: sel.has(g), onchange: (e) => { e.target.checked ? sel.add(g) : sel.delete(g); } }), label));
    const r = view.restore;
    return [
      h('div', { class: 'eh' }, h('b', null, 'Backup')),
      h('div', { class: 'sec' },
        h('div', { class: 'sh' }, h('b', null, 'Backup automático'),
          h('label', { class: 'tog' }, h('input', { type: 'checkbox', checked: b.ativo, onchange: (e) => upd({ ativo: e.target.checked }) }), h('i'))),
        h('div', { class: 'rowf' },
          h('label', { class: 'lb grow' }, 'Frequência', h('select', { class: 'in', value: b.recorrencia, onchange: (e) => upd({ recorrencia: e.target.value }) },
            h('option', { value: 'diario' }, 'Diário'), h('option', { value: 'semanal' }, 'Semanal'), h('option', { value: 'mensal' }, 'Mensal'))),
          h('label', { class: 'lb' }, 'Horário', h('input', { class: 'in', type: 'time', value: b.hora, onchange: (e) => upd({ hora: e.target.value }) }))),
        h('div', { class: 'kv' }, h('span', null, 'Último'), h('b', null, fmt(b.ultimo))),
        h('div', { class: 'kv' }, h('span', null, 'Próximo'), h('b', null, b.ativo ? fmt(U.nextBackup(b)) : 'desativado')),
        h('p', { class: 'hint' }, 'Salva as suas configurações e dados em um arquivo .json na pasta Downloads, com o WhatsApp Web aberto. A chave da IA, o seu convite e a identificação deste computador nunca vão para o arquivo.')),
      h('div', { class: 'sec' },
        h('div', { class: 'sh' }, h('b', null, 'Fazer backup agora')),
        checks(U.BACKUP_GROUPS, view.bkSel),
        h('div', { class: 'center' }, h('button', { class: 'gbtn', onclick: async () => {
          if (!view.bkSel.size) return toast('Marque pelo menos um item.');
          await doBackup([...view.bkSel]); toast('Backup salvo na pasta Downloads.'); renderPanel();
        } }, 'Exportar backup'))),
      h('div', { class: 'sec' },
        h('div', { class: 'sh' }, h('b', null, 'Restaurar backup')),
        r ? [
          h('div', { class: 'kv' }, h('span', null, 'Arquivo'), h('b', null, r.nome)),
          h('div', { class: 'kv' }, h('span', null, 'Criado em'), h('b', null, fmt(r.obj.criadoEm))),
          checks(U.BACKUP_GROUPS.filter(([g]) => r.tem.includes(g)), r.sel),
          h('div', { class: 'seg' },
            h('button', { class: r.modo === 'mesclar' ? 'on' : '', onclick: () => { r.modo = 'mesclar'; renderPanel(); } }, 'Mesclar com os atuais'),
            h('button', { class: r.modo === 'substituir' ? 'on' : '', onclick: () => { r.modo = 'substituir'; renderPanel(); } }, 'Substituir')),
          h('div', { class: 'center' },
            h('button', { class: 'gbtn out', onclick: () => { view.restore = null; renderPanel(); } }, 'Cancelar'),
            h('button', { class: 'gbtn', onclick: doRestore }, 'Restaurar')),
        ] : [
          h('p', { class: 'hint' }, 'Escolha um arquivo .json do AtendeZap. Você poderá escolher o que restaurar.'),
          h('div', { class: 'center' }, h('label', { class: 'gbtn out' }, 'Escolher arquivo…',
            h('input', { type: 'file', accept: '.json,application/json', hidden: true, onchange: (e) => readBackup(e.target.files[0]) }))),
        ]),
      wtCard(),
    ];
  }

  // ----- Diagnóstico -----
  const describe = (el) => {
    if (!el) return null;
    const one = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') +
      ['role', 'aria-label', 'data-tab', 'data-testid', 'data-icon'].filter((a) => e.getAttribute?.(a)).map((a) => `[${a}="${a === 'aria-label' ? e.getAttribute(a).replace(/ para .*/, ' para …') : e.getAttribute(a)}"]`).join(''); // sem nome do contato/grupo
    const path = [];
    for (let e = el, i = 0; e && e !== document.body && i < 5; e = e.parentElement, i++) path.unshift(one(e));
    return path.join(' > ');
  };
  // ===================== ASSISTENTE DE IA (v1.21) =====================
  // Criar/melhorar respostas rápidas conversando e explicar o diagnóstico. A API (Gemini) é chamada pelo service worker; a chave fica só
  // no armazenamento da extensão. A IA só PROPÕE: toda proposta passa por AZIA.validarResposta e só entra no editor se você clicar em Aplicar.
  const IA = globalThis.AZIA;
  const ia = { d: null, msgs: [], ocupado: false, anterior: null, txt: '', erro: '', aberto: false, diag: null, modelos: null, testando: false };
  // Várias chaves (v1.31): a lista vive em iaCfg.chaves; iaCfg.chave espelha a primeira preenchida (compatibilidade com o que já existia).
  const chavesDe = (c) => (Array.isArray(c?.chaves) && c.chaves.length ? c.chaves : [c?.chave || '']);
  const MAX_CHAVES = 6;
  const iaPronta = () => !!(chavesDe(S.iaCfg).some((k) => String(k || '').trim()) && S.iaCfg?.modelo);
  const iaReg = { itens: [] };   // v1.45: o que foi mandado à IA nesta sessão (só na memória da página; a chave nunca entra)
  const iaPedir = (dados) => {
    let reg = null; const t0 = performance.now();
    try { iaReg.itens = AZIAREG.adicionar(iaReg.itens, dados, Date.now()); reg = iaReg.itens[0]; } catch { /* o registro nunca atrapalha a chamada */ }
    return chrome.runtime.sendMessage({ tipo: 'ia', maxChaves: acessoEf().conectado ? acessoEf().limites.chavesMax : undefined, ...dados }).catch((e) => ({ erro: e.message }))
      .then((r) => { try { if (reg) { reg.ms = Math.round(performance.now() - t0); reg.erro = r && r.erro ? String(r.erro).slice(0, 120) : ''; } } catch { /* idem */ } return r; });
  };
  const SEM_IA = 'Configure a chave e o modelo em Configurações › Geral › Assistente de IA.';
  const iaContexto = (d, midias) => ({
    labels: S.labels, replies: S.replies.filter((r) => r.id !== d.id), selfId: d.id, midias,
    atalhos: new Set(S.replies.filter((r) => r.id !== d.id).map((r) => r.atalho)),
    grupos: S.unicos.flatMap((c) => c.grupos.map((g) => ({ id: g, nome: `${c.nomes?.[g] || g.split('@')[0]} (conjunto ${c.nome || '—'})` }))),
  });
  async function iaEnviar(d, texto) {
    texto = String(texto || '').trim();
    if (!texto || ia.ocupado) return;
    if (!iaPronta()) { ia.erro = SEM_IA; return renderPanel(); }
    const prep = IA.prepararRascunho(d, { labels: S.labels, replies: S.replies }), ctx = iaContexto(d, prep.midias);
    ia.msgs.push({ papel: 'user', texto }); ia.ocupado = true; ia.erro = ''; renderPanel();
    const r = await iaPedir({ op: 'gerar', json: true, temperatura: 0.4, contents: IA.contentsDeHistorico(ia.msgs),
      sistema: IA.promptAssistente({ sig: S.sig?.nome, labels: S.labels, replies: ctx.replies, grupos: ctx.grupos, rascunho: prep.paraIA }) });
    ia.ocupado = false;
    if (r.erro) { ia.erro = r.erro; ia.msgs.pop(); ia.txt = texto; return renderPanel(); } // falhou: devolve o que você digitou
    const j = IA.extrairJson(r.texto);
    if (!j) { ia.msgs.push({ papel: 'ia', texto: 'Não consegui entender a resposta da IA. Tente reformular o pedido.', bruto: r.texto, proposta: null, avisos: [] }); return renderPanel(); }
    const avisos = Array.isArray(j.avisos) ? j.avisos.map((x) => String(x).slice(0, 200)).slice(0, 6) : [];
    let proposta = null;
    if (j.resposta) {
      const v = IA.validarResposta(j.resposta, ctx);
      if (v.erro) avisos.push('A proposta foi descartada: ' + v.erro + '.'); else { proposta = v; avisos.push(...v.avisos); }
    }
    if (r.cortou) avisos.push('A resposta da IA foi cortada por tamanho: peça um fluxo menor.');
    const msgIa = { papel: 'ia', texto: String(j.mensagem || '').slice(0, 600) || (proposta ? 'Montei uma proposta.' : '…'), bruto: r.texto, proposta, avisos };
    ia.msgs.push(msgIa);
    if (proposta && S.iaCfg?.autoAplicar !== false && !proposta.perdeMidias) iaAplicar(d, proposta, msgIa); // cria a opção toda no editor; dá para desfazer
    else renderPanel();
  }
  // Aplica a proposta no editor (título e atalho só se estiverem vazios). msg = mensagem da IA que gerou a proposta (aplicação automática).
  async function iaAplicar(d, p, msg) {
    if (!msg && p.perdeMidias && !await confirmar(`Esta proposta REMOVE ${p.perdeMidias} anexo(s) (imagem, áudio ou documento) da resposta. Aplicar mesmo assim?\n(Você ainda pode desfazer antes de salvar.)`)) return;
    ia.anterior = JSON.parse(JSON.stringify({ titulo: d.titulo, atalho: d.atalho, acoes: d.acoes }));
    if (!String(d.titulo || '').trim() && p.resposta.titulo) d.titulo = p.resposta.titulo;
    if (!String(d.atalho || '').trim() && p.resposta.atalho) d.atalho = p.resposta.atalho;
    d.acoes = p.resposta.acoes.map((a) => ({ ...a }));
    for (const m of ia.msgs) if (m.proposta === p) m.aplicada = true;
    toast(msg ? 'Montei a resposta inteira e já coloquei no editor. Revise e clique em Criar/Salvar (dá para desfazer).' : 'Proposta aplicada ao editor. Revise e clique em Salvar.', 5000);
    renderPanel();
  }
  function iaDesfazer(d) {
    if (!ia.anterior) return;
    d.titulo = ia.anterior.titulo; d.atalho = ia.anterior.atalho; d.acoes = ia.anterior.acoes; ia.anterior = null;
    for (const m of ia.msgs) m.aplicada = false;
    toast('Voltei ao que estava antes.'); renderPanel();
  }
  const IA_CHIPS = ['Melhorar a redação', 'Deixar mais curto', 'Tom mais amigável', 'Corrigir o português'];
  function iaPainel(d) {
    if (ia.d !== d) Object.assign(ia, { d, msgs: [], anterior: null, txt: '', erro: '', ocupado: false }); // outra resposta aberta: conversa nova
    const ultima = [...ia.msgs].reverse().find((m) => m.papel === 'ia' && m.proposta);
    const bolha = (m) => (m.papel === 'user' ? h('div', { class: 'iab eu' }, m.texto)
      : h('div', { class: 'iab ia' }, h('div', null, m.texto),
        m.proposta ? h('div', { class: 'iaprop' },
          h('b', null, (m.proposta.resposta.titulo || 'Proposta') + (m.proposta.resposta.atalho ? ' · /' + m.proposta.resposta.atalho : '')),
          m.proposta.resposta.acoes.map((a) => h('small', null, IA.resumoAcao(a, { labels: S.labels })))) : null,
        m.aplicada ? h('small', { class: 'iaok' }, '✅ Já está no editor abaixo') : null,
        (m.avisos || []).map((a) => h('small', { class: 'iaav' }, '⚠ ' + a))));
    const enviar = () => { const t = ia.txt; ia.txt = ''; iaEnviar(d, t); };
    const chat = ia.msgs.length ? h('div', { class: 'iachat' }, ia.msgs.map(bolha)) : null;
    if (chat) requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; }); // sempre mostra a última mensagem
    return h('details', { class: 'tec iabox', open: !!ia.aberto, ontoggle: (e) => { ia.aberto = e.target.open; } },
      h('summary', null, '✨ Assistente de IA (criar ou melhorar)'),
      !iaPronta() ? h('p', { class: 'hint' }, SEM_IA) : [
        h('p', { class: 'hint' }, 'Descreva o fluxo que quer (ex.: "primeiro atendimento do dia, com saudação pelo horário e pergunta sobre a carga") ou peça para melhorar o que já está no editor. A IA monta a resposta INTEIRA (título, atalho e todas as ações) e já coloca no editor; é só revisar e salvar. Dá para desfazer.'),
        chat,
        ia.ocupado ? h('small', { class: 'hint' }, 'Pensando…') : null,
        ia.erro ? h('small', { class: 'dan' }, ia.erro) : null,
        (ultima && !ultima.aplicada) || ia.anterior ? h('div', { class: 'rowf' },
          ultima && !ultima.aplicada ? h('button', { class: 'gbtn sm', onclick: () => iaAplicar(d, ultima.proposta) }, 'Aplicar ao editor') : null,
          ia.anterior ? h('button', { class: 'obtn', onclick: () => iaDesfazer(d) }, '↶ Desfazer') : null) : null,
        h('div', { class: 'iachips' }, IA_CHIPS.map((c) => h('button', { class: 'obtn', disabled: ia.ocupado, onclick: () => iaEnviar(d, c) }, c))),
        h('textarea', { class: 'in', rows: 3, placeholder: 'Ex.: crie uma resposta de boas-vindas com saudação, pergunte a rota e já mande a chave Pix…', value: ia.txt,
          oninput: (e) => { ia.txt = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviar(); } } }),
        h('div', { class: 'rowf' }, h('button', { class: 'gbtn sm', disabled: ia.ocupado, onclick: enviar }, 'Enviar'),
          ia.msgs.length ? h('button', { class: 'obtn', onclick: () => { Object.assign(ia, { msgs: [], anterior: null, erro: '' }); renderPanel(); } }, 'Nova conversa') : null),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: S.iaCfg?.autoAplicar !== false, onchange: (e) => { S.iaCfg = { ...S.iaCfg, autoAplicar: e.target.checked }; save('iaCfg'); } }), 'Colocar a proposta no editor sozinha (desmarcado: eu clico em Aplicar)')]);
  }
  // Configurações › Geral › Assistente de IA
  async function iaTestar() {
    ia.testando = true; ia.erro = ''; ia.testes = {}; renderPanel();
    let modelos = null;
    for (const [i, k0] of chavesDe(S.iaCfg).entries()) { // testa UMA chave por vez: mostra qual funciona e qual não
      const k = String(k0 || '').trim(); if (!k) continue;
      const r = await iaPedir({ op: 'modelos', chave: k });
      if (r.erro) ia.testes[i] = { ok: false, erro: r.erro }; else { ia.testes[i] = { ok: true, n: r.modelos.length }; modelos ||= r.modelos; }
    }
    ia.testando = false;
    const lista = Object.values(ia.testes), bons = lista.filter((t) => t.ok).length;
    if (!modelos) { ia.modelos = null; toast(lista[0]?.erro || 'Cole uma chave para testar.', 6000); return renderPanel(); }
    ia.modelos = modelos;
    S.iaCfg = { ...S.iaCfg, modelos: modelos.map(({ id, nome }) => ({ id, nome })) }; await save('iaCfg');
    if (!S.iaCfg.modelo || !modelos.some((m) => m.id === S.iaCfg.modelo)) { S.iaCfg = { ...S.iaCfg, modelo: IA.escolherModelo(modelos) }; await save('iaCfg'); }
    toast(lista.length > 1 ? `${bons} de ${lista.length} chaves funcionam. ${modelos.length} modelo(s) disponíveis.` : `Conectado: ${modelos.length} modelo(s) disponíveis na sua chave.`, 5500);
    renderPanel();
  }
  function salvarChaves(lista) { S.iaCfg = { ...S.iaCfg, chaves: lista, chave: lista.map((k) => String(k || '').trim()).find(Boolean) || '' }; ia.modelos = null; save('iaCfg'); }
  function chavesBloco(c) {
    const lista = chavesDe(c), agora = Date.now(), est = S.iaChaveEstado || {}, uso = (S.iaUso?.data === new Date().toISOString().slice(0, 10) ? S.iaUso.chaves : null) || {};
    return h('div', { class: 'iachaves' },
      lista.map((k, i) => {
        const id = String(k || '').trim() ? AZIERRO.idChave(k) : '', e = id ? est[id] : null, u = id ? uso[id] : null, t = ia.testes?.[i];
        return h('div', { class: 'iachave' },
          h('label', { class: 'lb' }, i === 0 ? 'Chave da API' : `Chave ${i + 1}`, h('div', { class: 'rowf' },
            h('input', { class: 'in grow', type: 'password', autocomplete: 'off', placeholder: i === 0 ? 'Cole aqui a chave do Google AI Studio' : `Chave ${i + 1}: usada se a anterior falhar`, value: k || '',
              onchange: (ev) => { const l = [...chavesDe(S.iaCfg)]; l[i] = ev.target.value.trim(); ia.testes = {}; salvarChaves(l); } }),
            lista.length > 1 ? h('button', { class: 'ib', title: 'Remover esta chave', onclick: () => { ia.testes = {}; salvarChaves(chavesDe(S.iaCfg).filter((_, j) => j !== i)); renderPanel(); } }, '✕') : null)),
          t ? h('small', { class: t.ok ? 'iaok' : 'dan' }, t.ok ? `✔ funciona (${t.n} modelos)` : `✖ ${t.erro}`) : null,
          e && e.ate > agora ? h('small', { class: 'dan' }, `Descansando até ${hhmm(e.ate)}: ${ROT_FALHA[e.tipo] || e.tipo}. Volta para a fila depois disso.`) : null,
          u && (u.n || u.f) ? h('small', { class: 'mut' }, `Hoje: ${u.n} pedido(s)${u.f ? ` · ${u.f} falha(s)` : ''}.`) : null);
      }),
      lista.length < Math.min(MAX_CHAVES, acessoEf().conectado ? acessoEf().limites.chavesMax || MAX_CHAVES : MAX_CHAVES) ? h('div', { class: 'rowf' }, h('button', { class: 'obtn', onclick: () => { salvarChaves([...chavesDe(S.iaCfg), '']); renderPanel(); } }, '+ Adicionar outra chave')) : null,
      lista.length > 1 ? h('small', { class: 'hint' }, 'Se uma chave falhar (inválida, cota do dia ou limite por minuto), o AtendeZap usa a próxima na hora e deixa a que falhou "descansando". Chaves do MESMO projeto do Google dividem a mesma cota: para a troca adiantar, use chaves de projetos diferentes. Confira os termos do Google: usar várias chaves só para driblar o limite gratuito pode não ser permitido; para volume, o caminho certo é ativar o faturamento.') : null);
  }
  function iaCard() {
    const c = S.iaCfg || {}, hoje = new Date().toISOString().slice(0, 10), uso = S.iaUso?.data === hoje ? S.iaUso : { n: 0, tokens: 0 };
    const mudar = (k, v) => { S.iaCfg = { ...S.iaCfg, [k]: v }; save('iaCfg'); };
    const lista = ia.modelos?.length ? ia.modelos : (c.modelo ? [{ id: c.modelo, nome: c.modelo }] : []);
    return h('div', { class: 'sec' }, h('div', { class: 'sh' }, tile('pen'), h('b', { class: 'grow' }, 'Assistente de IA (Gemini)')),
      h('p', { class: 'hint' }, 'Cria e melhora respostas rápidas conversando e explica o diagnóstico em português. Crie a chave em aistudio.google.com/apikey. Ela fica só neste navegador: não entra no backup nem no relatório.'),
      chavesBloco(c),
      h('div', { class: 'rowf' }, h('button', { class: 'gbtn sm', disabled: !chavesDe(c).some((k) => String(k || '').trim()) || ia.testando, onclick: iaTestar }, ia.testando ? 'Testando…' : chavesDe(c).filter((k) => String(k || '').trim()).length > 1 ? 'Testar as chaves e listar os modelos' : 'Testar a chave e listar os modelos')),
      lista.length ? h('label', { class: 'lb' }, 'Modelo', h('select', { class: 'in', onchange: (e) => mudar('modelo', e.target.value) },
        lista.map((m) => h('option', { value: m.id, selected: m.id === c.modelo }, m.nome && m.nome !== m.id ? `${m.nome} (${m.id})` : m.id)))) : null,
      lista.length ? h('label', { class: 'lb' }, 'Modelo reserva (opcional)', h('select', { class: 'in', onchange: (e) => mudar('modeloReserva', e.target.value) },
        h('option', { value: '' }, 'Nenhum'), lista.filter((m) => m.id !== c.modelo).map((m) => h('option', { value: m.id, selected: m.id === c.modeloReserva }, m.nome && m.nome !== m.id ? `${m.nome} (${m.id})` : m.id)))) : null,
      c.modeloReserva ? h('small', { class: 'hint' }, 'Se o modelo principal falhar por instabilidade, tempo esgotado ou cota, o AtendeZap tenta este na hora. Um modelo "flash-lite" costuma ter limites maiores.') : null,
      h('label', { class: 'inl' }, h('span', null, 'Limite de pedidos por dia'), h('input', { class: 'in num', type: 'number', min: 1, max: 2000, value: c.limiteDia || 100, onchange: (e) => mudar('limiteDia', Math.max(1, Math.min(2000, +e.target.value || 100))) })),
      h('small', { class: 'hint' }, `Hoje: ${uso.n} pedido(s) · ${(uso.tokens || 0).toLocaleString('pt-BR')} tokens.`),
      Object.keys(uso.falhas || {}).length || uso.reserva ? h('small', { class: 'dan' }, `Falhas de hoje (do lado do Google, não contam no limite acima): ${Object.entries(uso.falhas || {}).map(([k, n]) => `${ROT_FALHA[k] || k} ×${n}`).join(', ') || 'nenhuma'}${uso.reserva ? ` · modelo reserva usado ${uso.reserva}×` : ''}.`) : null,
      h('details', { class: 'tec' }, h('summary', null, 'O que é enviado ao Google'),
        h('small', null, 'Só o que você pede ao assistente (os textos das suas respostas rápidas no editor e o seu pedido) e, no diagnóstico, o resumo técnico (sem conversas, com telefones, e-mails e CPF/CNPJ mascarados). Mensagens de clientes só são enviadas se VOCÊ ligar o Atendente IA (aba dentro de Respostas rápidas) e aceitar o aviso de privacidade de lá.'),
        h('small', null, 'No plano gratuito o Google pode usar o conteúdo enviado para melhorar os produtos; nos planos pagos isso normalmente não ocorre. Confira os termos atuais da sua conta.')));
  }
  // Diagnóstico explicado pela IA
  const mdLeve = (t) => String(t || '').split('\n').filter((l) => l.trim() !== '').map((l) => {
    const li = /^\s*[-*•]\s+/.test(l);
    const partes = l.replace(/^\s*[-*•]\s+/, '').split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((x) => (/^\*\*[^*]+\*\*$/.test(x) ? h('b', null, x.slice(2, -2)) : x));
    return h('p', { class: 'mdl' + (li ? ' li' : '') }, li ? '• ' : '', ...partes);
  });
  async function iaDiagnostico(res) {
    if (!iaPronta()) { ia.diag = { erro: SEM_IA }; return renderPanel(); }
    ia.diag = { carregando: true }; renderPanel();
    const d = res.data, entrada = IA.entradaDiagnostico({ versao: chrome.runtime.getManifest().version, whatsapp: d.whatsapp, resumo: d.resumo, checks: d.checks, saude: d.saude });
    const r = await iaPedir({ op: 'gerar', json: false, temperatura: 0.2, sistema: IA.promptDiagnostico(), contents: [{ role: 'user', parts: [{ text: entrada }] }] });
    ia.diag = r.erro ? { erro: r.erro } : { texto: r.texto };
    renderPanel();
  }
  function iaDiagCard() {
    const g = ia.diag; if (!g) return null;
    return h('div', { class: 'sec' }, h('div', { class: 'sh' }, tile('pen'), h('b', { class: 'grow' }, 'Explicação da IA'),
      h('button', { class: 'ib', title: 'Fechar', onclick: () => { ia.diag = null; renderPanel(); } }, '✕')),
    g.carregando ? h('p', { class: 'hint' }, 'Analisando o diagnóstico…') : g.erro ? h('p', { class: 'hint dan' }, g.erro) : [
      h('div', { class: 'iadiag' }, mdLeve(g.texto)),
      h('div', { class: 'rowf' }, h('button', { class: 'obtn', onclick: async () => { try { await navigator.clipboard.writeText(g.texto); toast('Explicação copiada.'); } catch { await perguntar('Copie o texto:', g.texto); } } }, 'Copiar explicação')),
      h('small', { class: 'hint' }, 'A IA pode errar: use como orientação. Ela só viu o resumo técnico, nunca as suas conversas.')]);
  }

  // ===================== ATENDENTE IA (v1.22) =====================
  // Um robô que atende contatos com a IA. Três modos: desligado | só sugerir (você aprova) | automático. A IA só DECIDE (responder, executar uma
  // resposta rápida que você liberou, chamar humano ou ignorar); quem envia é o painel, com limites, pausas e palavras que chamam um humano.
  // Só conversas individuais iniciadas pelo cliente; nunca grupos. Quando VOCÊ responde numa conversa, o robô se cala nela por um tempo.
  const ATEND0 = {
    modo: 'desligado', aceito: false, empresa: '', servicos: '', horario: '', regras: '', tom: 'amigavel', quando: 'sempre', exp: { dias: [1, 2, 3, 4, 5], de: '08:00', ate: '18:00' },
    faq: [], exemplos: [], respostasPermitidas: [], palavrasHumano: ['atendente', 'humano', 'pessoa', 'reclamação', 'cancelar', 'advogado', 'procon', 'processo'],
    confianca: 0.6, msgHumano: 'Vou chamar um atendente para te ajudar. Já já ele responde por aqui.', etiquetaHumano: '', identificar: true, prefixo: '🤖 Assistente virtual:',
    maxPorContatoDia: 30, maxPorHora: 80, espera: [2, 5], ritmo: 'normal', pausaHumanoH: 2, pausaChamadoMin: 20, modeloRobo: '', retentativas: [20, 60, 180, 600], cfgVersao: 3, quem: 'desconhecidos', nuncaAtender: [], nuncaPalavras: IA.FAMILIA.slice(), etiquetasAtender: [], travaUnico: true, retencaoDias: 90, transcreverAudio: false,
    regrasLista: [], proibidosDados: ['senha', 'cartao', 'codigo', 'banco'], proibidosExtra: [], foraEscopo: [], escopo: '', foraAcao: 'redirecionar',
    usarCargas: true, cargasMin: 3, lembrarPerfil: false, planilhaAprende: false, manterAcordado: true, recuperarH: 3,
  };
  // Quem já tinha o robô configurado ficou com os padrões antigos GRAVADOS (6 respostas/contato/dia, espera 6–14 s, pausa de 12 h): atualiza uma vez.
  function atendMigrar() {
    const c = S.atendCfg || {}, v = c.cfgVersao || 0;
    if (v >= 3 || !Object.keys(c).length) return;
    const novo = { ...c }, msg = [];
    if (v < 2) { Object.assign(novo, { maxPorContatoDia: 30, maxPorHora: 80, espera: [2, 5], ritmo: 'normal', pausaHumanoH: 2, pausaChamadoMin: 20 }); msg.push('o robô ficou mais ativo (responde em ~2–5 s, limites maiores e pausas mais curtas)'); }
    if (v < 3) { novo.quem = c.quem || 'todos'; novo.nuncaAtender = c.nuncaAtender || []; novo.nuncaPalavras = c.nuncaPalavras || IA.FAMILIA.slice(); msg.push('o robô agora IGNORA contatos cujo nome tem palavras de família (filha, esposa, mãe…) e você pode limitar quem ele atende em Atendente › Regras › Quem o robô atende'); }
    novo.cfgVersao = 3; S.atendCfg = novo; save('atendCfg');
    toast('Atendente IA: ' + msg.join('; ') + '.', 14000);
  }
  const atendBruta = () => ({ ...ATEND0, ...(S.atendCfg || {}), exp: { ...ATEND0.exp, ...(S.atendCfg?.exp || {}) } }); // o que a pessoa SALVOU
  const atendC = () => AC.limitarRobo(atendBruta(), acessoEf()); // o que VALE: já com os limites do administrador (o salvo nunca é alterado)
  // chamada à ponte COM tempo limite: se o WhatsApp parar de responder, o robô segue em frente em vez de ficar preso naquela conversa para sempre
  const callT = (ms, method, ...args) => Promise.race([call(method, ...args), new Promise((_, rej) => setTimeout(() => rej(new Error('o WhatsApp não respondeu a tempo (' + method + ')')), ms))]);
  const atend = { transc: new Map(), transcOk: 0, transcErro: 0, transcUlt: '', bloqueado: null, semTrava: false, foraEscopo: 0, escopoCache: new Map(), escopoLog: new Map(), purgouEm: 0, envioT: new Map(), ultEvento: 0, recebidos: 0, ultErro: null, avisouErro: 0, ultBatida: 0, lacunaMin: 0, timers: new Map(), busy: new Set(), enviando: new Map(), sync: null, teste: { txt: '', res: null, ocupado: false } };
  const atendAtivo = () => ligado('atendente') && atendC().modo !== 'desligado' && !!atendC().aceito && iaPronta() && !atend.bloqueado; // bloqueado = outro computador está com o robô
  // computador/aba acordados enquanto o robô estiver ligado (o service worker pede ao Chrome; ver background.js)
  const atendAcordar = () => chrome.runtime.sendMessage({ tipo: 'robo', on: !!atendAtivo() && atendC().manterAcordado !== false }).catch(() => {});
  const atendSincronizar = () => { const on = !!atendAtivo(); if (on === atend.sync || !S.ready) return; atend.sync = on; call('atendAtivo', on).catch(() => { atend.sync = null; }); atendAcordar(); atendBatida(); };
  const atendSalvar = async (mud) => { S.atendCfg = { ...atendBruta(), ...mud }; await save('atendCfg'); atendSincronizar(); atendAcordar(); };
  const renderSeguro = () => { if (!panelRoot.activeElement?.matches?.('input, textarea, select')) renderPanel(); };
  const atendQuem = (nome, id) => { const n = String(nome || '').trim(); return n && !looksNumber(n) ? n.split(/\s+/)[0] : '…' + String(id).split('@')[0].slice(-4); };
  // só respostas SEM ação destrutiva podem ser usadas pelo robô
  const SEGURAS = new Set(['texto', 'imagem', 'video', 'audio', 'documento', 'contato', 'especial', 'espera', 'digitando', 'gravando', 'etiquetaAdd', 'etiquetaRem', 'resposta']);
  const seguraParaRobo = (r, depth = 0) => depth < 3 && (r.acoes || []).length > 0 && r.acoes.every((a) => SEGURAS.has(a.tipo)
    && (a.tipo !== 'resposta' || seguraParaRobo(S.replies.find((x) => x.id === a.respostaId && x.id !== r.id) || { acoes: [] }, depth + 1)));
  const atendPermitidas = () => Object.fromEntries(S.replies.filter((r) => atendC().respostasPermitidas.includes(r.id) && r.atalho && seguraParaRobo(r)).map((r) => [String(r.atalho).toLowerCase(), r]));
  // h = marca curta do contato (não é o telefone): permite apagar o registro de UM contato depois
  const hash32 = (t) => { let x = 2166136261; for (const ch of String(t)) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619); } return (x >>> 0).toString(36); };
  const atendMarcarEnvio = (id) => { S.atendEnv = [{ h: hash32(id), t: Date.now() }, ...(S.atendEnv || [])].slice(0, 300); save('atendEnv'); };   // v1.43: quando e em qual conversa o ROBÔ enviou algo
  const atendLog = (id, nome, acao, resumo) => { S.atendLog = [{ t: Date.now(), quem: atendQuem(nome, id), acao, resumo: String(resumo || '').slice(0, 140), h: id && id !== 'sistema' ? hash32(id) : '' }, ...(S.atendLog || [])].slice(0, 80); save('atendLog'); };
  const atendEst = (fn) => { S.atendEst = fn(S.atendEst || {}); save('atendEst'); };

  function atendNovaMsg(d) {
    if (!atendAtivo() || !d?.chatId) return;
    const c = atendC(), id = d.chatId, agora = Date.now();
    if (/@(g\.us|broadcast|newsletter)$/.test(id)) return;
    if (!d.fromMe) { atend.ultEvento = agora; atend.recebidos++; } // prova de vida: a escuta de mensagens novas está chegando
    if (d.fromMe) { // fui eu? (o robô marca o que envia) senão foi você: o robô se cala neste contato
      if ((atend.enviando.get(id) || 0) > agora) return;
      memCapturaHumano(id, d); // você respondeu depois de a IA passar o caso: isso pode virar aprendizado (se você aprovar)
      if (atend.timers.has(id)) { clearTimeout(atend.timers.get(id)); atend.timers.delete(id); }
      atendEst((e) => IA.pausar(e, id, c.pausaHumanoH)); return;
    }
    if (Date.now() / 1000 - (d.t || 0) > 180) return; // mensagem velha (sincronização do WhatsApp)
    if (!IA.deveAtuar(c, new Date()) || (S.atendEst?.pausas?.[id] || 0) > agora) return;
    if ((c.nuncaAtender || []).some((x) => x.id === id)) return; // na lista "nunca atender": nem agenda
    clearTimeout(atend.timers.get(id)); // o cliente costuma mandar várias mensagens seguidas: espera um pouco e responde uma vez
    const [a, b] = (c.espera || [6, 14]).map(Number), ms = 1000 * (a + Math.random() * Math.max(0, b - a));
    atend.timers.set(id, setTimeout(() => atendResponder(id), ms));
  }
  async function atendDecidir(h, c, id) {
    const permitidas = atendPermitidas();
    const respostas = Object.entries(permitidas).map(([atalho, r]) => ({ atalho, titulo: r.titulo, previa: String((r.acoes || []).find((a) => a.tipo === 'texto')?.texto || '').replace(/\s+/g, ' ').slice(0, 70) }));
    const contents = IA.contentsAtendimento(h.msgs);
    if (!contents.length) return { acao: 'ignorar', motivo: 'a última mensagem não é do cliente', mensagens: [], atalho: '', confianca: 1 };
    const nome = looksNumber(h.nome) ? '' : String(h.nome || '').split(/\s+/)[0];
    let cargas = null; // lista oficial de cargas (a mesma que vai para os grupos), no máximo a cada "cargasMin" minutos
    if (c.usarCargas && S.cargasUrl) { const k = await atendCargas(); cargas = k && !/^ERRO/i.test(k.texto) ? { ok: true, texto: k.texto, idadeMin: Math.max(0, Math.round((Date.now() - k.t) / 60000)) } : { ok: false }; }
    const memoria = IA.memoriaParaPrompt(S.memFatos), perfil = c.lembrarPerfil && id ? IA.perfilParaPrompt(S.memPerfis?.[id]) : '';
    const proibidos = { ids: c.proibidosDados || IA.PADRAO_PROIBIDOS, extras: c.proibidosExtra || [] };
    const urlsOk = IA.urlsDe([c.empresa, c.servicos, c.regras, c.horario, ...(c.faq || []).map((x) => x.r), ...(c.exemplos || []).map((x) => x.r)]);
    const rodar = async (extra) => {
      const tIa = Date.now();
      const r = await iaPedir({ op: 'gerar', json: true, temperatura: 0.3, pensar: 'minimo', limiteMs: 30000, modelo: c.modeloRobo || '', sistema: IA.promptAtendente(c, { agora: new Date(), nome, respostas, cargas, memoria, perfil }) + (extra ? '\n\n' + extra : ''), contents });
      if (r.ms) atend.ultMs = r.ms;
      if (r.erro) {
        atend.ultErro = { t: Date.now(), msg: r.erro };
        if (id) memTempoRegistrar({ quem: 'IA', medida: 'falhou', s: (Date.now() - tIa) / 1000, detalhe: r.erro }); // acompanha a confiabilidade da IA
        const fixo = AZIERRO.permanente(r.tipo); // chave, modelo, cota do dia: esperar não resolve
        if (Date.now() - atend.avisouErro > 1800000) { atend.avisouErro = Date.now(); toast('Atendente IA: a IA não respondeu (' + r.erro + ')' + (fixo ? '. Isso não se resolve sozinho: o robô vai avisar você em vez de insistir.' : '. O robô vai tentar de novo sozinho; se continuar, avisa você.'), 10000); }
        return { falha: { acao: 'humano', motivo: 'IA indisponível: ' + r.erro, mensagens: [], atalho: '', confianca: 0, erroIA: true, tipoErro: r.tipo || '', espera: r.espera ?? null } };
      }
      atend.ultErro = null;
      const dec = IA.validarDecisao(IA.extrairJson(r.texto), { permitidas, confianca: c.confianca, urlsOk, proibidos });
      dec.ms = r.ms || (Date.now() - tIa); // quanto a IA levou para decidir
      if (r.reserva) dec.reserva = r.reserva; // o modelo principal falhou e o reserva respondeu
      if (r.chaveNum > 1) dec.chaveNum = r.chaveNum; // a(s) chave(s) anterior(es) falharam e esta respondeu
      return { dec };
    };
    const x = await rodar('');
    if (x.falha) return x.falha;
    if (x.dec.violacao) { // a IA ia pedir um dado proibido: segunda chance, avisando o motivo (em vez de já chamar você)
      const y = await rodar(`ATENÇÃO: sua resposta anterior pediu "${x.dec.violacao}", que é PROIBIDO neste atendimento. Responda de novo SEM pedir esse dado nem nada parecido.`);
      if (y.falha) return y.falha;
      y.dec.ms = (x.dec.ms || 0) + (y.dec.ms || 0); y.dec.refeito = x.dec.violacao; // se pedir de novo, a validação já devolve "humano" com o motivo
      return y.dec;
    }
    return x.dec;
  }
  async function atendResponder(id, op = {}) {
    const tentativa = op.tentativa || 0, falhas = op.falhas || 0;
    atend.timers.delete(id);
    if (atend.busy.has(id)) return;
    atend.busy.add(id);
    atend.envioT.delete(id);
    let nome = '';
    // se algo prender esta conversa por mais de 2 min (WhatsApp sem responder), libera: antes ela ficava muda até recarregar a página
    const trava = setTimeout(() => { atend.busy.delete(id); atendLog(id, nome, 'erro', 'a conversa travou por mais de 2 minutos; liberei'); }, 120000);
    try {
      const c = atendC();
      if (!atendAtivo() || !IA.deveAtuar(c, new Date())) return;
      const esc = await atendEscopoOk(id, c); // quem o robô atende (família, funcionários e amigos salvos ficam de fora no modo padrão)
      if (!esc.ok) { atend.foraEscopo++; atendLogRaro(id, nome, 'fora do escopo', esc.motivo); return; }
      if (c.usarCargas && S.cargasUrl) atendCargas().catch(() => {}); // aquece a lista de cargas enquanto busco o histórico
      const h = await callT(45000, 'historicoChat', id, 16); nome = h.nome;
      if (c.transcreverAudio) await atendTranscrever(h);
      const lim = IA.limites(S.atendEst, c, id);
      if (lim) {
        // o cliente respondeu logo depois de nós: tenta de novo em 16 s (antes a mensagem dele era ignorada para sempre)
        if (/muito recente/.test(lim) && tentativa < 3) { atend.timers.set(id, setTimeout(() => atendResponder(id, { tentativa: tentativa + 1 }), 16000)); return; }
        return atendLog(id, nome, 'ignorado', lim);
      }
      const ult = h.msgs[h.msgs.length - 1];
      if (!ult || ult.de !== 'cliente') return; // alguém já respondeu
      const bloco = []; for (let i = h.msgs.length - 1; i >= 0 && h.msgs[i].de === 'cliente'; i--) bloco.unshift(h.msgs[i].texto);
      const palavra = IA.transbordoPorPalavra(bloco.join(' '), c.palavrasHumano); // pediu um humano? nem gasta IA
      const dec = IA.aplicarEscopo(palavra ? { acao: 'humano', motivo: `o cliente falou "${palavra}"`, mensagens: [], atalho: '', confianca: 1 } : await atendDecidir(h, c, id), c);
      const ini = h.msgs.length - bloco.length, prev = h.msgs[ini - 1]; // tempos: desde quando o cliente espera, e quanto ele demorou a responder a nossa última mensagem
      dec.tempos = { inicioMs: (h.msgs[ini].t || 0) * 1000, clienteS: prev && prev.de === 'atendente' && h.msgs[ini].t && prev.t ? Math.max(0, h.msgs[ini].t - prev.t) : null };
      if (dec.erroIA) return atendFalhaIA(id, nome, dec, falhas, c); // a IA falhou (tempo, cota, rede): NÃO é "chamar humano"
      await atendAgir(id, h, dec, c);
    } catch (e) { atendLog(id, nome, 'erro', e.message); } finally { clearTimeout(trava); atend.busy.delete(id); }
  }
  // Falha técnica da IA: não pausa a conversa e não escreve ao cliente. Tenta de novo (20 s, 1 min, 3 min, 10 min); só no fim avisa você, sem silenciar o contato.
  function atendFalhaIA(id, nome, dec, falhas, c) {
    // Esperar só adianta para falha passageira. Chave inválida, modelo inexistente e COTA DO DIA não melhoram com o tempo: avisa o dono já, sem insistir.
    let espera = AZIERRO.permanente(dec.tipoErro) ? null : IA.proximaTentativa(c, falhas);
    if (espera != null && dec.tipoErro === 'cota-minuto' && dec.espera) espera = Math.min(90000, Math.max(5000, dec.espera * 1000 + 1000)); // respeita o tempo que o Google pediu
    if (espera != null) {
      if (!falhas) atendLog(id, nome, 'IA falhou', `${dec.motivo}. Vou tentar de novo sozinho${dec.tipoErro === 'cota-minuto' && dec.espera ? ` em ~${Math.round(espera / 1000)} s` : ''}.`);
      atend.timers.set(id, setTimeout(() => atendResponder(id, { falhas: falhas + 1 }), espera));
      return;
    }
    atendSugerir({ id, nome: atendQuem(nome, id), acao: 'humano', mensagens: [], atalho: '', motivo: dec.motivo });
    atendLog(id, nome, 'desisti (IA fora do ar)', dec.motivo);
    toast(AZIERRO.permanente(dec.tipoErro) ? `Atendente IA parado: ${dec.motivo} ${atendQuem(nome, id)} está esperando por você.` : `Atendente IA: a IA não respondeu depois de várias tentativas. ${atendQuem(nome, id)} está esperando por você.`, 10000);
  }
  // ---- vida do robô: batimento a cada minuto, detecta parada (computador/aba suspensos) e retoma o que ficou sem resposta ----
  const hhmm = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  async function atendBatida() {
    const agora = Date.now(), lac = S.atendVida?.ativo ? IA.lacuna(S.atendVida.ult, agora, 5) : 0, ativo = atendAtivo();
    atend.ultBatida = agora;
    S.atendVida = { ult: agora, ativo }; save('atendVida');
    if (!ativo) return;
    if (lac) {
      atend.lacunaMin = lac;
      atendLog('sistema', 'Sistema', 'ficou parado', `das ${hhmm(agora - lac * 60000)} às ${hhmm(agora)} (${lac} min): computador ou aba suspensos, ou a página fechada`);
      atendRecuperar();
    }
    call('atendAtivo', true).catch(() => {}); // reafirma a escuta a cada minuto (se a ponte reiniciou, volta a ouvir)
    const cc = atendC(); if (cc.usarCargas && S.cargasUrl && Date.now() - cargasCache.t > (cc.cargasMin || 3) * 60000) atendCargas().catch(() => {}); // lista de cargas sempre pronta
    atendTrava().catch(() => {}); atendPurgar(false);
    atendAcordar();
  }
  async function atendRecuperar(manual) {
    const c = atendC();
    if (!atendAtivo() || !(c.recuperarH > 0)) { if (manual) toast('Ligue o robô e defina até quantas horas atrás ele deve responder pendentes.', 5000); return 0; }
    let lista = [];
    try { lista = await callT(30000, 'naoRespondidas', c.recuperarH); } catch (e) { if (manual) toast('Não consegui procurar: ' + e.message, 5000); return 0; }
    lista = (lista || []).filter((x) => !((S.atendEst?.pausas?.[x.id] || 0) > Date.now())).slice(0, 15);
    lista.forEach((x, i) => setTimeout(() => atendResponder(x.id), 2000 + i * (18000 + Math.random() * 12000))); // uma de cada vez, sem enxurrada
    if (lista.length) atendLog('sistema', 'Sistema', 'retomando', `${lista.length} conversa(s) com mensagem sem resposta nas últimas ${c.recuperarH} h`);
    if (manual) toast(lista.length ? `Vou responder ${lista.length} conversa(s) pendente(s), uma de cada vez.` : `Nenhuma conversa pendente nas últimas ${c.recuperarH} h.`, 5000);
    return lista.length;
  }
  const ROT_FALHA = { instavel: 'serviço instável (5xx)', 'cota-minuto': 'limite por minuto', 'cota-dia': 'cota do dia', cota: 'cota', tempo: 'tempo esgotado', rede: 'sem rede', chave: 'chave/permissão', modelo: 'modelo inexistente', recusa: 'pedido recusado', vazio: 'resposta vazia' };
  const atendIaMs = () => { const l = S.iaUso?.data === new Date().toISOString().slice(0, 10) ? (S.iaUso.lat || []) : []; return l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : null; };
  const atendUsoHoje = () => (S.iaUso?.data === new Date().toISOString().slice(0, 10) ? S.iaUso.n || 0 : 0);
  const atendPausasAtivas = () => Object.entries(S.atendEst?.pausas || {}).filter(([, t]) => t > Date.now());
  const atendEstadoRobo = () => { const c = atendC(); return IA.estadoRobo({ parteLigada: ligado('atendente'), pausadoPor: acessoPausa(), modo: c.modo, aceito: !!c.aceito, iaPronta: iaPronta(), sincronizado: atend.sync === true, usoN: atendUsoHoje(), limite: S.iaCfg?.limiteDia || 100,
    ultErro: atend.ultErro, bloqueado: atend.bloqueado, semTrava: !!(atend.semTrava && c.travaUnico !== false && c.modo === 'automatico'), iaMs: atendIaMs(), pausas: atendPausasAtivas().length, lacunaMin: atend.lacunaMin, cargasFalhou: !!(c.usarCargas && S.cargasUrl && cargasCache.erro && !cargasCache.texto), agora: Date.now() }); };
  // resumo para o relatório do Diagnóstico (sem dados de clientes: o registro vai truncado e com telefones mascarados)
  function atendResumo() {
    const c = atendC(), agora = Date.now(), est = atendEstadoRobo(), por = {}, tm24 = IA.agregarTempos(S.memDemanda || [], S.memTempos || [], Date.now() - 86400000);
    for (const l of S.atendLog || []) if (agora - l.t < 86400000) por[l.acao] = (por[l.acao] || 0) + 1;
    return { modo: c.modo, aceito: !!c.aceito, ativoAgora: atendAtivo(), sincronizado: atend.sync === true, usoIA: `${atendUsoHoje()}/${S.iaCfg?.limiteDia || 100}`, pausasAtivas: atendPausasAtivas().length,
      usaCargas: !!(c.usarCargas && S.cargasUrl), manterAcordado: c.manterAcordado !== false, recuperarH: c.recuperarH, ritmo: c.ritmo, nuncaPalavras: (c.nuncaPalavras || []).length, retencaoDias: c.retencaoDias, travaUnico: c.travaUnico !== false, quem: c.quem, nuncaAtender: (c.nuncaAtender || []).length, foraEscopoSessao: atend.foraEscopo, transcAudio: { ligado: !!c.transcreverAudio, ok: atend.transcOk, erro: atend.transcErro, ultErro: atend.transcUlt }, robo: atend.bloqueado ? 'em espera: ' + atend.bloqueado.outro : atend.semTrava ? 'sem trava de robô único (script antigo ou sem planilha)' : 'ativo', modeloRobo: c.modeloRobo || '(o mesmo)', iaMsMedio: atendIaMs(), iaFalhasHoje: (S.iaUso?.data === new Date().toISOString().slice(0, 10) ? S.iaUso.falhas : null) || {}, modeloReserva: S.iaCfg?.modeloReserva || '', iaChaves: { total: chavesDe(S.iaCfg).filter((k) => String(k || '').trim()).length, descansando: Object.entries(S.iaChaveEstado || {}).filter(([, e]) => e.ate > Date.now()).map(([id, e]) => ({ id, tipo: e.tipo, voltaEmMin: Math.round((e.ate - Date.now()) / 60000) })) }, tempos24h: { iaS: tm24.ia?.mediana ?? null, clienteEsperouS: tm24.espera?.mediana ?? null, clienteDemorouS: tm24.cliente?.mediana ?? null, atendenteS: tm24.humano?.mediana ?? null, falhasIA: tm24.falhasIA }, pausaChamadoMin: c.pausaChamadoMin, pausaHumanoH: c.pausaHumanoH,
      ultimaBatidaMin: atend.ultBatida ? Math.round((agora - atend.ultBatida) / 60000) : null, ultimoEventoMin: atend.ultEvento ? Math.round((agora - atend.ultEvento) / 60000) : null, eventosRecebidos: atend.recebidos,
      ultimaParadaMin: atend.lacunaMin || 0, ultimoErroIA: atend.ultErro ? { haMin: Math.round((agora - atend.ultErro.t) / 60000), msg: String(atend.ultErro.msg).slice(0, 120) } : null,
      problemas: est.problemas, acoes24h: por, ultimas: (S.atendLog || []).slice(0, 15).map((l) => [Math.round((agora - l.t) / 60000), l.acao, IA.mascarar(l.resumo || '').slice(0, 80)]) };
  }
  function atendRetomar(id) { atendEst((e) => ({ ...e, pausas: id ? Object.fromEntries(Object.entries(e.pausas || {}).filter(([k]) => k !== id)) : {} })); toast(id ? 'Conversa retomada.' : 'Todas as conversas foram retomadas.'); renderPanel(); }
  function atendZerarLimites() { atendEst((e) => ({ ...e, porContato: {}, hora: [], ultimo: {} })); toast('Limites de hoje zerados.'); renderPanel(); }
  async function atendAgir(id, h, dec, c) {
    const ref = memRegistrar(id, h, dec, c);
    try { await atendAgirCorpo(id, h, dec, c); } finally { memFinalizar(ref, id, c); }
  }
  async function atendAgirCorpo(id, h, dec, c) {
    if (dec.acao === 'ignorar') return atendLog(id, h.nome, 'ignorou', dec.motivo);
    if (dec.acao === 'humano') return atendHumano(id, h, dec, c);
    if (c.modo === 'sugerir') { atendSugerir({ id, nome: atendQuem(h.nome, id), acao: dec.acao, mensagens: dec.mensagens, atalho: dec.atalho, motivo: dec.motivo }); return atendLog(id, h.nome, 'sugeriu', dec.mensagens[0] || '/' + dec.atalho); }
    if (dec.acao === 'executar') {
      const r = atendPermitidas()[dec.atalho];
      atend.envioT.set(id, Date.now()); atendMarcarEnvio(id);
      atend.enviando.set(id, Date.now() + 180000);
      try { await runReply(r, id); } finally { atend.enviando.set(id, Date.now() + 8000); }
      atendEst((e) => IA.registrarEnvio(e, id));
      if (dec.avisarHumano) atendSugerir({ id, nome: atendQuem(h.nome, id), acao: 'humano', mensagens: [], atalho: '', motivo: dec.motivo || 'o robô executou uma resposta e deixou algo para você confirmar' });
      return atendLog(id, h.nome, 'executou /' + dec.atalho, r.titulo || '');
    }
    await atendFalar(id, dec.mensagens, c);
    atendLog(id, h.nome, dec.avisarHumano ? 'respondeu e avisou você' : 'respondeu', dec.mensagens[0]);
    if (dec.avisarHumano) atendSugerir({ id, nome: atendQuem(h.nome, id), acao: 'humano', mensagens: [], atalho: '', motivo: dec.motivo || 'faltou uma informação: o robô respondeu e deixou para você confirmar' }); // sem pausar: o robô segue na conversa
  }
  async function atendHumano(id, h, dec, c) {
    atendEst((e) => IA.pausar(e, id, (c.pausaChamadoMin || 20) / 60)); // pausa curta (padrão 20 min): é com você
    atendSugerir({ id, nome: atendQuem(h.nome, id), acao: 'humano', mensagens: [], atalho: '', motivo: dec.motivo });
    if (c.etiquetaHumano) await call('label', id, c.etiquetaHumano, 'add').catch(() => {});
    atendLog(id, h.nome, 'passou para humano', dec.motivo);
    toast(`Atendente IA: ${atendQuem(h.nome, id)} precisa de você (${dec.motivo})`, 6000);
    if (c.modo === 'automatico' && c.msgHumano?.trim() && !dec.erroIA) await atendFalar(id, [c.msgHumano.trim()], c, true); // avisa o cliente uma vez
  }
  // Envia como uma pessoa: "digitando…" proporcional ao texto e pausa entre as mensagens. Na 1ª resposta do dia se identifica como assistente virtual.
  async function atendFalar(id, textos, c, semContar) {
    const agora = Date.now(), ritmo = IA.ritmoDe(c);
    atend.enviando.set(id, agora + 120000);
    try {
      for (let i = 0; i < textos.length; i++) {
        let t = textos[i];
        if (i === 0 && c.identificar && !((S.atendEst?.identificado?.[id] || 0) > agora - 86400000)) {
          t = `${String(c.prefixo || '🤖 Assistente virtual:').trim()} ${t}`;
          atendEst((e) => ({ ...e, identificado: { ...(e.identificado || {}), [id]: Date.now() } }));
        }
        const seg = IA.atrasoDigitar(t.length, ritmo); // o "digitando…" é só enfeite: se o WhatsApp não responder a ele, envia a mensagem assim mesmo
        await Promise.race([callT(30000, 'composing', id, seg).catch(() => {}), sleep(seg * 1000 + 1500)]);
        await callT(60000, 'sendText', id, t);
        atendMarcarEnvio(id); if (!atend.envioT.has(id)) atend.envioT.set(id, Date.now()); // 1ª mensagem enviada: fim da espera do cliente
        atend.enviando.set(id, Date.now() + 8000);
        if (i < textos.length - 1) await sleep(ritmo.entre[0] + Math.random() * (ritmo.entre[1] - ritmo.entre[0]));
      }
    } finally { atend.enviando.set(id, Date.now() + 6000); }
    if (!semContar) atendEst((e) => IA.registrarEnvio(e, id));
  }
  // Pendências: sugestões (modo "só sugerir") e conversas que o robô passou para você
  function atendSugerir(it) { S.atendSug = [{ ...it, t: Date.now() }, ...(S.atendSug || []).filter((x) => x.id !== it.id)].slice(0, 30); save('atendSug'); renderSeguro(); }
  const atendSugTirar = (id) => { S.atendSug = (S.atendSug || []).filter((x) => x.id !== id); save('atendSug'); renderPanel(); };
  async function atendSugEnviar(it) {
    try {
      if (it.acao === 'executar') {
        const r = atendPermitidas()[it.atalho] || S.replies.find((x) => String(x.atalho).toLowerCase() === it.atalho);
        atend.enviando.set(it.id, Date.now() + 180000);
        try { await runReply(r, it.id); } finally { atend.enviando.set(it.id, Date.now() + 8000); }
        atendEst((e) => IA.registrarEnvio(e, it.id));
      } else await atendFalar(it.id, it.mensagens, atendC());
      atendLog(it.id, it.nome, 'enviou sugestão', it.mensagens[0] || '/' + it.atalho);
    } catch (e) { return toast('Não consegui enviar: ' + e.message); }
    atendSugTirar(it.id);
  }
  async function atendSugCampo(it) {
    try { await call('rascunho', it.id, it.mensagens.join('\n\n')); toast('Texto colocado no campo da conversa: revise e envie.'); atendSugTirar(it.id); } catch (e) { toast('Não consegui: ' + e.message); }
  }
  async function atendModo(m) {
    const c = atendC();
    if (m !== 'desligado') {
      if (!iaPronta()) return toast(SEM_IA, 6000);
      if (!c.aceito) return toast('Marque primeiro o aviso de privacidade (mais abaixo).', 5000);
      if (!c.empresa.trim() && !c.servicos.trim() && !(c.faq || []).length) return toast('Preencha ao menos "Sobre a empresa" ou "Serviços" para a IA saber o que responder.', 6000);
    }
    if (m === 'automatico' && !await confirmar('MODO AUTOMÁTICO\n\nA IA vai responder SOZINHA os clientes que escreverem em conversas individuais (nunca em grupos). Ela se cala numa conversa quando você responder nela, chama um humano quando não souber ou quando o cliente pedir, e respeita os limites que você definir.\n\nMensagens automáticas em volume podem levar o WhatsApp a restringir o número. Recomendo testar antes em "Só sugerir".\n\nLigar o modo automático?')) return;
    await atendSalvar({ modo: m }); renderPanel();
    if (m === 'automatico') atendTrava().catch(() => {}); else atendTravaLiberar().catch(() => {});
  }
  // ===== Treinar conversando (v1.27): uma conversa de teste entre VOCÊ (no papel do cliente) e a IA, com o treino de verdade. Nada é enviado ao WhatsApp. =====
  const atendUi = { sub: 'painel' }; // sub-aba aberta dentro do Atendente IA (painel | treino | regras | ajustes)
  const treino = { aberto: false, msgs: [], ocupado: false, erro: '', txt: '', regra: '', bateria: null, rodando: false };
  const textoDeResposta = (atalho) => { const r = atendPermitidas()[atalho] || S.replies.find((x) => String(x.atalho).toLowerCase() === atalho); return String((r?.acoes || []).find((a) => a.tipo === 'texto')?.texto || '').replace(/\s+/g, ' ').slice(0, 300); };
  async function treinoDecidir(msgs, c) {
    const h = { nome: '', msgs }, palavra = IA.transbordoPorPalavra(textoCliente(h), c.palavrasHumano);
    if (palavra) return { acao: 'humano', motivo: `o cliente falou "${palavra}" (chama você sem usar a IA)`, mensagens: [], atalho: '', confianca: 1 };
    return IA.aplicarEscopo(await atendDecidir(h, c, ''), c);
  }
  // Refaz o último pedido depois de uma falha técnica: tira a bolha de erro e o recado do cliente e envia de novo.
  function treinoRepetir(i) {
    const cli = treino.msgs[i - 1];
    if (!cli || cli.de !== 'cliente' || treino.ocupado) return;
    treino.msgs.splice(i - 1, 2); treinoEnviar(cli.texto);
  }
  async function treinoEnviar(txt) {
    txt = String(txt || '').trim();
    if (!txt || treino.ocupado) return;
    if (!iaPronta()) { treino.erro = SEM_IA; return renderPanel(); }
    treino.msgs.push({ de: 'cliente', texto: txt }); treino.ocupado = true; treino.erro = ''; treino.txt = ''; renderPanel();
    const t0 = Date.now();
    try {
      const dec = await treinoDecidir(treino.msgs.map((m) => ({ de: m.de, texto: m.texto })), atendC());
      const texto = dec.acao === 'responder' ? dec.mensagens.join('\n') : dec.acao === 'executar' ? textoDeResposta(dec.atalho) : '';
      treino.msgs.push({ de: 'atendente', dec, texto, ms: dec.ms || (Date.now() - t0) });
    } catch (e) { treino.erro = e.message; treino.msgs.pop(); treino.txt = txt; }
    treino.ocupado = false; renderPanel();
  }
  const treinoCliente = (i) => { for (let k = i - 1; k >= 0; k--) if (treino.msgs[k].de === 'cliente') return treino.msgs[k].texto; return ''; };
  async function treinoBom(i) {
    const m = treino.msgs[i], c = atendC();
    await atendSalvar({ exemplos: [...(c.exemplos || []), { c: treinoCliente(i), r: m.texto }] }); m.salvo = 'guardado como exemplo bom'; toast('Salvo como exemplo bom.'); renderPanel();
  }
  async function treinoCorrigir(i) {
    const m = treino.msgs[i], c = atendC(), certa = await perguntar('Como a IA DEVERIA ter respondido? (isso vira um exemplo de treino)', m.texto || '');
    if (certa == null || !certa.trim()) return;
    await atendSalvar({ exemplos: [...(c.exemplos || []), { c: treinoCliente(i), r: certa.trim() }] }); m.salvo = 'resposta corrigida guardada como exemplo'; toast('Exemplo salvo no treino.'); renderPanel();
  }
  async function treinoNunca(i) {
    const m = treino.msgs[i], c = atendC(), r = await perguntar('O que a IA NUNCA deve fazer? Escreva como uma regra curta (vira "regra de ouro"):', m.dec?.violacao ? `Nunca peça ${m.dec.violacao}.` : '');
    if (!r || !r.trim()) return;
    await atendSalvar({ regrasLista: [...(c.regrasLista || []), r.trim().slice(0, 300)] }); m.salvo = 'regra de ouro salva'; toast('Regra de ouro salva.'); renderPanel();
  }
  async function treinoFora(i) {
    const m = treino.msgs[i], c = atendC(), r = await perguntar('Qual assunto está FORA do atendimento? (a IA não vai conversar sobre isso)', treinoCliente(i).slice(0, 60));
    if (!r || !r.trim()) return;
    await atendSalvar({ foraEscopo: [...(c.foraEscopo || []), r.trim().slice(0, 120)] }); m.salvo = 'assunto fora do atendimento salvo'; toast('Assunto fora do atendimento salvo.'); renderPanel();
  }
  async function treinoRegra(txt) {
    txt = String(txt || '').trim();
    if (!txt) return;
    await atendSalvar({ regrasLista: [...(atendC().regrasLista || []), txt.slice(0, 300)] }); treino.regra = ''; toast('Regra de ouro salva: a IA já a segue.'); renderPanel();
  }
  // bateria de cenários: o que o robô faz diante de situações delicadas, com o treino atual
  async function treinoMemoria() {   // testa o robô COM a memória: pergunta cada pergunta aprendida e compara a resposta (nada é enviado a ninguém)
    if (treino.rodando) return; if (!iaPronta()) { treino.erro = SEM_IA; return renderPanel(); }
    const faqs = (S.memFatos || []).filter((f) => f.tipo === 'faq' && f.ativo !== false).slice(0, 8);
    if (!faqs.length) return toast('Ainda não há perguntas e respostas aprovadas na memória para testar.', 6000);
    if (!await confirmar(`Vou perguntar ao robô ${faqs.length} coisa(s) que ele já aprendeu e conferir se a resposta bate com a memória. Usa ${faqs.length} a ${faqs.length * 2} pedidos da IA e não envia nada para ninguém.`, { ok: 'Testar' })) return;
    treino.rodando = true; treino.memTeste = []; renderPanel(); const c = atendC();
    for (const f of faqs) {
      let dec; try { dec = await treinoDecidir([{ de: 'cliente', texto: f.p }], c); } catch (e) { dec = { acao: 'humano', motivo: e.message, mensagens: [], erroIA: true }; }
      const resp = dec.acao === 'responder' ? dec.mensagens.join(' ') : '', ok = !dec.erroIA && dec.acao === 'responder' && AZAVAL.respostaBate(f.r, resp);
      treino.memTeste.push({ p: f.p, memoria: f.r, resposta: dec.acao === 'responder' ? resp : `(${dec.acao}) ${dec.motivo || ''}`, s: dec.erroIA ? 'revisar' : ok ? 'ok' : 'falhou',
        porque: dec.erroIA ? 'a IA falhou: tente de novo mais tarde' : ok ? 'a resposta do robô bate com a memória' : dec.acao !== 'responder' ? `o robô passou para você (${dec.motivo || dec.acao}) em vez de usar a memória` : 'a resposta do robô é diferente da memória' });
      renderSeguro(); if (dec.erroIA) break;
    }
    treino.rodando = false; renderPanel();
  }
  async function treinoBateria() {
    if (treino.rodando) return;
    if (!iaPronta()) { treino.erro = SEM_IA; return renderPanel(); }
    if (!await confirmar(`Vou rodar ${IA.CENARIOS.length} situações de teste (cliente que manda CPF, pede as instruções, está irritado…). Isso usa de ${IA.CENARIOS.length} a ${IA.CENARIOS.length * 2} pedidos da IA e não envia nada ao WhatsApp. Continuar?`)) return;
    treino.rodando = true; treino.bateria = []; renderPanel();
    const c = atendC();
    for (const cen of IA.CENARIOS) {
      let dec; try { dec = await treinoDecidir([{ de: 'cliente', texto: cen.msg }], c); } catch (e) { dec = { acao: 'humano', motivo: e.message, mensagens: [], erroIA: true }; }
      const av = dec.erroIA ? { s: 'revisar', porque: 'a IA falhou: ' + dec.motivo } : IA.avaliarCenario(cen, dec, c);
      treino.bateria.push({ id: cen.id, rotulo: cen.rotulo, msg: cen.msg, s: av.s, porque: av.porque, resposta: dec.acao === 'responder' ? dec.mensagens.join(' ') : `(${dec.acao}) ${dec.motivo || ''}` });
      renderSeguro();
      if (dec.erroIA) { treino.erro = `Parei no teste ${treino.bateria.length} de ${IA.CENARIOS.length}: ${String(dec.motivo || '').replace(/^IA indisponível: /, '')} Os testes anteriores valem; refaça os demais quando a IA voltar.`; break; }
    }
    treino.rodando = false; renderPanel();
  }
  function treinoView() {
    const c = atendC(), voltar = h('button', { class: 'obtn', onclick: () => { treino.aberto = false; renderPanel(); } }, '← Voltar');
    const enviar = () => { const t = treino.txt; treino.txt = ''; treinoEnviar(t); };
    const bolha = (m, i) => {
      if (m.de === 'cliente') return h('div', { class: 'iab eu' }, m.texto);
      const d = m.dec || {}, e = d.entendi;
      if (d.erroIA) return h('div', { class: 'iab ia' }, h('small', { class: 'dan' }, '⚠ A IA não respondeu (erro técnico, não é uma decisão dela).'), h('small', { class: 'dan' }, String(d.motivo || '').replace(/^IA indisponível: /, '')),
        h('small', { class: 'mut' }, 'Nada foi aprendido com isto. Tente de novo; se for a cota do dia, escolha outro modelo ou configure um modelo reserva (Configurações › Assistente de IA).'),
        h('div', { class: 'iachips' }, h('button', { class: 'obtn', disabled: treino.ocupado, onclick: () => treinoRepetir(i) }, '↻ Tentar de novo')));
      const botoes = [['👍 Está bom', () => treinoBom(i), !m.texto], ['✏️ Corrigir', () => treinoCorrigir(i), false], ['🚫 Nunca fazer isso', () => treinoNunca(i), false], ['🙅 Fora do atendimento', () => treinoFora(i), false]];
      return h('div', { class: 'iab ia' },
        h('small', { class: 'mut' }, `${ATEND_ROT[d.acao] || d.acao} · confiança ${Math.round((d.confianca || 0) * 100)}% · ${IA.duracao((m.ms || 0) / 1000)}${d.reserva ? ' · modelo reserva' : ''}${d.chaveNum ? ` · chave ${d.chaveNum}` : ''}`),
        m.texto ? h('div', null, m.texto) : null,
        d.acao === 'executar' ? h('small', null, `Executaria a resposta rápida /${d.atalho}`) : null,
        d.acao === 'humano' ? h('small', { class: d.erroIA ? 'dan' : 'iaav' }, `Chamaria você: ${d.motivo}`) : null,
        d.acao === 'ignorar' ? h('small', { class: 'mut' }, `Não responderia: ${d.motivo || ''}`) : null,
        d.violacao ? h('small', { class: 'dan' }, `🚫 Bloqueado: a IA ia pedir ${d.violacao}`) : null,
        d.refeito && !d.violacao ? h('small', { class: 'iaav' }, `A IA ia pedir "${d.refeito}" (proibido) e foi corrigida automaticamente.`) : null,
        d.avisarHumano ? h('small', { class: 'iaav' }, 'Responderia e avisaria você para confirmar o resto.') : null,
        e && (e.origem || e.destino || e.veiculo || e.carga) ? h('small', { class: 'mut' }, `Entendeu: ${[e.origem && 'de ' + e.origem, e.destino && 'para ' + e.destino, e.veiculo, e.carroceria, e.carga].filter(Boolean).join(' · ')}`) : null,
        m.salvo ? h('small', { class: 'iaok' }, '✔ ' + m.salvo) : null,
        h('div', { class: 'iachips' }, botoes.map(([t, f, off]) => h('button', { class: 'obtn', disabled: off, onclick: f }, t))));
    };
    const chat = treino.msgs.length ? h('div', { class: 'iachat' }, treino.msgs.map(bolha)) : null;
    if (chat) requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });
    const cor = { ok: ['✔', 'iaok'], falha: ['✖', 'dan'], revisar: ['⚠', 'iaav'] };
    return [
      h('div', { class: 'rowf' }, voltar, h('b', { class: 'grow' }, 'Treinar conversando')),
      h('p', { class: 'hint' }, 'Converse como se fosse um cliente. A IA responde com o seu treino de verdade (empresa, perguntas, exemplos, cargas, memória e limites), mas NADA é enviado ao WhatsApp. Cada mensagem usa 1 pedido da IA (2, se ela tentar pedir um dado proibido e for corrigida). O treino e o robô dividem o mesmo limite do dia: hoje ' + atendUsoHoje() + '/' + (S.iaCfg?.limiteDia || 100) + '. Quando ela errar, use os botões abaixo da resposta: a correção vira exemplo, regra ou limite.'),
      !iaPronta() ? h('p', { class: 'hint dan' }, SEM_IA) : null,
      chat, treino.ocupado ? h('small', { class: 'hint' }, 'A IA está respondendo…') : null, treino.erro ? h('small', { class: 'dan' }, treino.erro) : null,
      h('textarea', { class: 'in', rows: 2, placeholder: 'Escreva como se fosse o cliente. Ex.: Boa tarde, vocês atendem o Rio?', value: treino.txt,
        oninput: (e) => { treino.txt = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } } }),
      h('div', { class: 'rowf' }, h('button', { class: 'gbtn sm', disabled: treino.ocupado, onclick: enviar }, 'Enviar como cliente'),
        treino.msgs.length ? h('button', { class: 'obtn', onclick: () => { Object.assign(treino, { msgs: [], erro: '' }); renderPanel(); } }, 'Nova conversa') : null),
      h('details', { class: 'tec' }, h('summary', null, 'Mensagens prontas para testar'), h('div', { class: 'iachips' }, IA.CENARIOS.map((cen) => h('button', { class: 'obtn', disabled: treino.ocupado, onclick: () => treinoEnviar(cen.msg) }, cen.rotulo)))),
      h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, 'Ensinar uma regra')),
        h('p', { class: 'hint' }, 'Diga à IA, com as suas palavras, algo que ela deve sempre seguir. Ex.: "Nunca prometa prazo de entrega" ou "Sempre pergunte a placa só depois de confirmar a rota".'),
        h('textarea', { class: 'in', rows: 2, placeholder: 'Regra de ouro…', value: treino.regra, oninput: (e) => { treino.regra = e.target.value; } }),
        h('div', { class: 'rowf' }, h('button', { class: 'obtn', onclick: () => treinoRegra(treino.regra) }, 'Salvar regra'))),
      h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, 'Testes de segurança')),
        h('p', { class: 'hint' }, `Roda ${IA.CENARIOS.length} situações delicadas de uma vez e mostra o que a IA faria: cliente que manda CPF, quer ver as instruções, está irritado, pergunta se é robô, puxa assunto de política…`),
        h('div', { class: 'rowf' }, h('button', { class: 'gbtn sm', disabled: treino.rodando, onclick: treinoBateria }, treino.rodando ? 'Rodando…' : 'Rodar os testes')),
        treino.bateria ? [h('small', null, `${treino.bateria.filter((x) => x.s === 'ok').length} ok · ${treino.bateria.filter((x) => x.s === 'revisar').length} para revisar · ${treino.bateria.filter((x) => x.s === 'falha').length} falha(s)`),
          treino.bateria.map((x) => h('div', { class: 'card pedplano' }, h('div', { class: 'grow' }, h('b', { class: cor[x.s][1] }, `${cor[x.s][0]} ${x.rotulo}`), h('small', { class: 'mut' }, `Cliente: "${x.msg}"`),
            h('small', null, x.porque), h('small', { class: 'mut' }, String(x.resposta).slice(0, 160)), h('div', { class: 'rowf' }, h('button', { class: 'obtn', onclick: () => treinoEnviar(x.msg) }, 'Abrir na conversa')))))] : null),
      h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, 'Testar a memória 🧪')),
        h('p', { class: 'hint' }, 'Pergunta ao robô, sem enviar nada a ninguém, cada pergunta que ele já aprendeu (até 8) e confere se a resposta dele bate com a memória. Se não bater, a memória está mal escrita ou o robô não a está usando.'),
        h('div', { class: 'rowf' }, h('button', { class: 'gbtn sm', disabled: treino.rodando, onclick: treinoMemoria }, treino.rodando ? 'Rodando…' : 'Testar a memória')),
        treino.memTeste ? [h('small', null, `${treino.memTeste.filter((x) => x.s === 'ok').length} bateu · ${treino.memTeste.filter((x) => x.s === 'falhou').length} não bateu · ${treino.memTeste.filter((x) => x.s === 'revisar').length} para revisar`),
          treino.memTeste.map((x) => h('div', { class: 'card pedplano' }, h('div', { class: 'grow' }, h('b', { class: x.s === 'ok' ? 'ok' : x.s === 'falhou' ? 'bad' : 'warn' }, `${x.s === 'ok' ? '✅' : x.s === 'falhou' ? '❌' : '⚠'} ${x.p}`), h('small', null, x.porque), h('small', { class: 'mut' }, `Memória: ${String(x.memoria).slice(0, 140)}`), h('small', { class: 'mut' }, `Robô: ${String(x.resposta).slice(0, 140)}`))))] : null),
    ];
  }
  const ATEND_ROT = { responder: '💬 Responderia', executar: '⚡ Executaria uma resposta rápida', humano: '🙋 Chamaria um humano', ignorar: '🤐 Não responderia' };
  const DIAS_ROT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  // O que a IA NÃO pode pedir nem tratar (v1.27): dados proibidos, assuntos fora do atendimento e regras de ouro aprendidas no treino.
  function limitesCard(c, mud, linha) {
    const edLista = (k, ph, ocultar = []) => [
      h('div', { class: 'iachips' }, (c[k] || []).filter((x) => !ocultar.includes(x)).map((x) => h('span', { class: 'limtag' }, x, h('button', { class: 'ib', title: 'Remover', onclick: () => mud(k, c[k].filter((y) => y !== x)) }, '✕')))),
      h('div', { class: 'rowf' }, h('input', { class: 'in grow', placeholder: ph, onkeydown: (e) => { if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) mud(k, [...(c[k] || []), v.slice(0, 200)]); } } }),
        h('button', { class: 'obtn', onclick: (e) => { const v = e.target.parentElement.querySelector('input').value.trim(); if (v) mud(k, [...(c[k] || []), v.slice(0, 200)]); } }, 'Adicionar'))];
    const ids = c.proibidosDados || IA.PADRAO_PROIBIDOS, fora = c.foraEscopo || [];
    const alterna = (k, lista, v, on) => mud(k, on ? [...lista, v] : lista.filter((x) => x !== v));
    return h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, 'O que a IA NÃO pode pedir nem tratar')),
      h('p', { class: 'hint' }, 'Vale no robô e na conversa de treino. Se a IA tentar pedir um dos dados abaixo, a mensagem é BLOQUEADA: ela refaz a resposta sozinha uma vez; se insistir, o caso passa para você.'),
      h('b', { class: 'limlbl' }, 'Dados que a IA nunca deve pedir'),
      h('div', { class: 'iachips' }, IA.DADOS.map((d) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: ids.includes(d.id), onchange: (e) => alterna('proibidosDados', ids, d.id, e.target.checked) }), d.rotulo))),
      edLista('proibidosExtra', 'Outro dado (ex.: placa do veículo, foto do caminhão)…'),
      h('b', { class: 'limlbl' }, 'Assuntos fora do atendimento'),
      h('div', { class: 'iachips' }, IA.ASSUNTOS_FORA.map((a) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: fora.includes(a), onchange: (e) => alterna('foraEscopo', fora, a, e.target.checked) }), a))),
      edLista('foraEscopo', 'Outro assunto fora do atendimento…', IA.ASSUNTOS_FORA),
      linha('escopo', 'O que o atendimento cobre', 'Ex.: cargas, fretes, documentos e rastreamento'),
      h('label', { class: 'lb' }, 'Quando o cliente puxar um assunto fora do atendimento', h('select', { class: 'in', onchange: (e) => mud('foraAcao', e.target.value) },
        [['redirecionar', 'Responder uma frase educada e voltar ao atendimento'], ['ignorar', 'Não responder'], ['humano', 'Chamar você']].map(([v, t]) => h('option', { value: v, selected: (c.foraAcao || 'redirecionar') === v }, t)))),
      h('b', { class: 'limlbl' }, `Regras de ouro (${(c.regrasLista || []).length})`),
      h('p', { class: 'hint' }, 'Aprendidas no treino ("Nunca fazer isso" e "Ensinar uma regra"). A IA obedece sempre.'),
      (c.regrasLista || []).length ? c.regrasLista.map((r, i) => h('div', { class: 'prow' }, h('span', { class: 'grow' }, r), h('button', { class: 'ib', title: 'Apagar a regra', onclick: () => mud('regrasLista', c.regrasLista.filter((_, j) => j !== i)) }, '🗑'))) : h('small', { class: 'mut' }, 'Nenhuma ainda.'));
  }
  // ===== Quem o robô atende (v1.28) =====
  // Antes o robô atendia QUALQUER conversa individual (até a família). Agora: só números fora dos contatos (padrão), todos menos a lista "nunca atender", ou só quem tem as etiquetas escolhidas.
  async function atendEscopoOk(id, c) {
    let k = atend.escopoCache.get(id);
    if (!k || Date.now() - k.t > 600000) {
      try { k = { t: Date.now(), info: await callT(15000, 'contatoInfo', id) }; atend.escopoCache.set(id, k); }
      catch { k = { t: Date.now() - 540000, info: null }; atend.escopoCache.set(id, k); } // não leu: tenta de novo em 1 min
    }
    return IA.escopoDecisao(c, k.info, id);
  }
  // no registro, no máximo 1 vez por hora por conversa (para não encher a lista)
  function atendLogRaro(id, nome, acao, resumo) {
    if (Date.now() - (atend.escopoLog.get(id) || 0) < 3600000) return;
    atend.escopoLog.set(id, Date.now()); atendLog(id, nome, acao, resumo);
  }
  async function atendNunca(id, nome) {
    const c = atendC();
    if (!id || (c.nuncaAtender || []).some((x) => x.id === id)) return;
    clearTimeout(atend.timers.get(id)); atend.timers.delete(id);
    await atendSalvar({ nuncaAtender: [...(c.nuncaAtender || []), { id, nome: String(nome || '').slice(0, 40) }] });
    S.atendSug = (S.atendSug || []).filter((x) => x.id !== id); save('atendSug');
    toast('Pronto: o robô nunca mais atende ' + atendQuem(nome, id) + '.'); renderPanel();
  }
  // ===== Trava de robô único (v1.28): só UM computador responde por vez (o WhatsApp Web em dois computadores faria dois robôs responderem ao mesmo cliente) =====
  // Usa o script da planilha como árbitro: quem chama primeiro fica com o robô e renova a cada minuto; se parar por 2,5 min, o outro assume sozinho.
  async function atendTrava() {
    const c = atendC(), tok = S.iaCfg?.tokenPlanilha || '';
    if (!S.instId) { S.instId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); save('instId'); }
    if (c.modo !== 'automatico' || c.travaUnico === false || !S.cargasUrl || !tok || !c.aceito) { atend.bloqueado = null; atend.semTrava = false; return; }
    const r = await chrome.runtime.sendMessage({ tipo: 'planilhaEscrever', url: S.cargasUrl, token: tok, aba: 'robo', inst: S.instId, nome: 'Computador ' + S.instId.slice(0, 4) }).catch((e) => ({ erro: e.message }));
    if (!r?.ok) { atend.semTrava = true; atend.bloqueado = null; return; } // script antigo ou sem rede: segue sem trava (o Estado avisa)
    atend.semTrava = false;
    const era = atend.bloqueado;
    atend.bloqueado = r.dono === false ? { outro: r.outro?.nome || 'outro computador', ha: r.outro?.ha || 0 } : null;
    if (atend.bloqueado && !era) { atendLog('sistema', 'Sistema', 'em espera', `${atend.bloqueado.outro} está com o robô ligado`); toast(`Atendente IA: ${atend.bloqueado.outro} já está com o robô ligado. Este computador fica em espera e assume sozinho se o outro parar.`, 9000); renderSeguro(); }
    if (!atend.bloqueado && era) { atendLog('sistema', 'Sistema', 'assumiu o robô', 'o outro computador parou de responder'); renderSeguro(); }
  }
  async function atendTravaLiberar() {
    const tok = S.iaCfg?.tokenPlanilha || ''; atend.bloqueado = null;
    if (!S.cargasUrl || !tok || !S.instId) return;
    await chrome.runtime.sendMessage({ tipo: 'planilhaEscrever', url: S.cargasUrl, token: tok, aba: 'robo-livre', inst: S.instId }).catch(() => {});
  }
  // ===== Áudios (v1.29): a IA transcreve o áudio do cliente para o robô entender (opcional, desligado por padrão: o ÁUDIO vai ao Google) =====
  async function atendTranscreverUm(mid) {
    if (atend.transc.has(mid)) return atend.transc.get(mid);
    const a = await callT(40000, 'baixarAudio', mid, 4000000);
    const r = await iaPedir({ op: 'gerar', json: false, temperatura: 0, pensar: 'minimo', limiteMs: 40000, modelo: atendC().modeloRobo || '', sistema: IA.promptTranscricao(),
      contents: [{ role: 'user', parts: [{ text: 'Transcreva este áudio.' }, { inlineData: { mimeType: String(a.mime || 'audio/ogg').split(';')[0] || 'audio/ogg', data: a.b64 } }] }] });
    if (r.erro) throw new Error(r.erro);
    const t = IA.limpaTranscricao(r.texto);
    atend.transc.set(mid, t); if (atend.transc.size > 80) atend.transc.delete(atend.transc.keys().next().value);
    return t;
  }
  // Troca "[áudio]" pela transcrição nas mensagens do cliente que ainda não foram respondidas; se falhar, segue como antes (pede para escrever).
  async function atendTranscrever(h) {
    for (const i of IA.audiosParaTranscrever(h.msgs)) {
      try {
        const t = await atendTranscreverUm(h.msgs[i].mid);
        if (t) { h.msgs[i].texto = '[áudio transcrito] ' + t; atend.transcOk++; } else { atend.transcErro++; atend.transcUlt = 'não deu para entender o áudio'; }
      } catch (e) { atend.transcErro++; atend.transcUlt = String(e.message || e).slice(0, 120); }
    }
  }
  // Botão de teste (Ajustes › Áudios): transcreve o último áudio da conversa aberta e mostra o resultado, para você conferir no seu WhatsApp.
  async function atendTestarAudio() {
    const ativo = S.active;
    if (!ativo || !/@(c\.us|lid)$/.test(ativo.id || '')) return toast('Abra uma conversa individual que tenha um áudio.', 5000);
    if (!iaPronta()) return toast(SEM_IA, 6000);
    try {
      const h = await callT(30000, 'historicoChat', ativo.id, 30), m = [...h.msgs].reverse().find((x) => ['ptt', 'audio'].includes(x.tipo) && x.mid);
      if (!m) return toast('Não achei áudio nas últimas mensagens desta conversa.', 6000);
      const t = await atendTranscreverUm(m.mid);
      await dialogo({ titulo: 'Transcrição do último áudio', texto: t ? t : 'A IA não conseguiu entender este áudio (ficou inaudível).', cancelar: null });
    } catch (e) { await dialogo({ titulo: 'Não consegui transcrever', texto: String(e.message || e), cancelar: null }); }
  }
  // ===== Acesso da equipe (v1.34) =====
  const acesso = { busy: false, ult: 0, falhas: 0, saudeT: 0, ultSaude: null };
  const acessoVersao = () => chrome.runtime.getManifest().version;
  const acessoConectado = () => !!(S.acessoCfg?.url && S.acessoCfg?.codigo);
  // Identificador desta INSTALAÇÃO do navegador (não vai no backup): é o que o administrador conta para limitar computadores por convite. Criado aqui, na 1ª necessidade
  // (antes só existia quando o robô iniciava, e quem nunca ligou o robô mandaria vazio).
  const acessoInst = () => { if (!S.instId) { S.instId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); save('instId'); } return S.instId; };
  // Só o sistema e a versão do Chrome, para o administrador reconhecer qual é qual na planilha (nada que identifique a pessoa).
  const acessoMaquina = () => { const ua = navigator.userAgent || '', so = /Windows/.test(ua) ? 'Windows' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'Outro', cr = (/Chrome\/(\d+)/.exec(ua) || [])[1]; return so + (cr ? ' · Chrome ' + cr : ''); };
  const acessoPost = (corpo) => chrome.runtime.sendMessage({ tipo: 'acesso', url: S.acessoCfg?.url, corpo }).catch((e) => ({ erro: e.message }));
  // Se o administrador (ou a falta de convite) está parando o robô, a frase que explica
  const acessoPausa = () => { const ef = acessoEf(); if (ef.login) return 'falta entrar com o convite do administrador (Configurações › Acesso da equipe)'; if (!ef.conectado) return ''; if (ef.desativado) return 'o acesso foi desativado pelo administrador'; if (ef.emergencia) return 'o administrador pausou o robô (emergência)'; if (ef.restrito) return 'não consegui confirmar o acesso com o administrador'; return ''; };
  const acessoOculto = (k) => AC.estado(acessoEf(), k) === 'bloqueado'; // sem marcação do administrador também é bloqueado
  const acessoTrava = (k) => (!acessoEf().conectado ? '' : acessoEf().desativado ? 'Acesso desativado pelo administrador.' : acessoEf().recursos[k] === 'obrigatorio' ? '🔒 Sempre ligado, pelo administrador.' : '');
  // 'ligado' e 'desligado' do administrador são só o PADRÃO: aplicados uma vez por mudança; depois a pessoa decide.
  // Marca de qual convite são os padrões já aplicados: reconectar o MESMO convite não refaz os padrões (antes, desconectar e colar de novo desligava de novo o que a pessoa tinha ligado).
  const acessoTag = (cod) => { let h = 5381; for (const ch of String(cod || '')) h = ((h << 5) + h + ch.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };
  const acessoNomeParte = (k) => (MODULOS.find((m) => m[0] === k) || [k, { iaAudio: 'Transcrição de áudios' }[k] || k])[1];
  async function acessoAplicarPadroes() {
    const r = AC.defaultsParaAplicar(acessoEf(), S.acessoAplicado || {}); let mexeu = false;
    for (const { k, valor } of r.aplicar) {
      if (k === 'iaAudio') { S.atendCfg = { ...S.atendCfg, transcreverAudio: valor }; await save('atendCfg'); }
      else if (AC.MODULOS.includes(k)) { S.mods = { ...(S.mods || {}), [k]: valor }; mexeu = true; }
    }
    if (mexeu) await save('modulos');
    const novo = { ...r.aplicado, _c: S.acessoAplicado?._c };
    if (JSON.stringify(novo) !== JSON.stringify(S.acessoAplicado || {})) { S.acessoAplicado = novo; await save('acessoAplicado'); }
    const off = r.aplicar.filter((x) => !x.valor).map((x) => acessoNomeParte(x.k));
    if (off.length) toast('O administrador deixou DESLIGADAS por padrão: ' + off.join(', ') + '. Para usar, ligue em Configurações › Partes do painel.', 14000);
    return r.aplicar;
  }
  async function acessoConsultar(manual) {
    if (!acessoConectado() || acesso.busy) return;
    acesso.busy = true; acesso.ult = Date.now();
    try {
      const antes = S.acessoEstado?.config?.hash, r = await acessoPost({ acao: 'config', codigo: S.acessoCfg.codigo, versao: acessoVersao(), inst: acessoInst(), maquina: acessoMaquina() });
      if (r?.ok) {
        const config = AC.normalizar(r); acesso.falhas = 0;
        S.acessoEstado = { config, t: Date.now(), desativado: false, erro: '' }; await save('acessoEstado');
        const n = (await acessoAplicarPadroes()).length;
        if (manual) toast(`Acesso confirmado: ${config.nome || 'sua conta'} · perfil ${config.perfil || '—'}.`, 5000);
        else if ((antes && antes !== config.hash) || n) toast('O administrador atualizou o seu acesso.', 5000);
      } else if (r?.ok === false) { // o servidor respondeu e recusou (a rede está boa)
        const negado = r.erro === 'acesso negado', semVaga = r.erro === 'limite de computadores', fora = r.erro === 'computador desconectado';
        const erro = negado ? 'o código não é reconhecido' : semVaga ? `este convite já está em uso em outro computador (limite de ${r.limite || 1})` : fora ? 'este computador foi desconectado pelo administrador' : String(r.erro || 'recusado');
        S.acessoEstado = { ...(S.acessoEstado || {}), t: Date.now(), desativado: !!r.desativado || negado || semVaga || fora, erro }; await save('acessoEstado');
        if (manual) toast('O administrador recusou: ' + S.acessoEstado.erro + '.', 7000);
      } else { // sem rede ou servidor fora do ar: vale a última configuração por alguns dias
        acesso.falhas++; S.acessoEstado = { ...(S.acessoEstado || {}), erro: String(r?.erro || 'sem resposta') }; await save('acessoEstado');
        if (manual) toast('Não consegui falar com o administrador: ' + S.acessoEstado.erro, 7000);
      }
    } finally { acesso.busy = false; atendSincronizar(); recuperarSincronizar(); renderHead(); renderPanel(); }
    if (S.acessoEstado?.desativado === false) acessoPerguntarSaude();
  }
  function acessoCiclo() {
    if (!S.ready || !acessoConectado()) return;
    const espera = acesso.falhas ? Math.min(120000 * acesso.falhas, 600000) : AC.proximaConsultaMs(acessoEf());
    if (!S.acessoEstado?.t || Date.now() - acesso.ult >= espera) acessoConsultar(false);
    acessoEnviarSaude(false);
  }
  // o que sai do seu computador (resumo técnico): montado SÓ com números e rótulos fixos; nada de conversa, nome ou telefone (AC.montarSaude descarta o resto)
  async function acessoOrigemSaude() {
    const est = (await chrome.storage.local.get('diagEstado')).diagEstado || {}, h0 = (est.historico || [])[0] || {}, r = atendResumo(), a = r.acoes24h || {}, tm = r.tempos24h || {};
    const hoje = S.iaUso?.data === new Date().toISOString().slice(0, 10) ? S.iaUso : {};
    return { v: acessoVersao(), wa: h0.whatsapp, autoteste: { ok: h0.ok, warn: h0.warn, bad: h0.bad, skip: h0.skip, ruins: h0.afetadas },
      robo: { modo: r.modo, ativo: r.ativoAgora, ultimaMsgMin: r.ultimoEventoMin, respondeu24h: (a.respondeu || 0) + (a['respondeu e avisou você'] || 0), humano24h: a['passou para humano'] || 0, ignorado24h: (a.ignorado || 0) + (a['fora do escopo'] || 0), iaFalhou24h: a['IA falhou'] || 0, pendencias: (S.atendSug || []).length, pausas: r.pausasAtivas, travado: !!atend.bloqueado },
      tempos: { iaS: tm.iaS, esperouS: tm.clienteEsperouS, atendenteS: tm.atendenteS },
      ia: { usoHoje: hoje.n || 0, falhas: hoje.falhas || {}, chaves: chavesDe(S.iaCfg).filter((k) => String(k || '').trim()).length, reserva: !!S.iaCfg?.modeloReserva } };
  }
  async function acessoEnviarSaude(forcar) {
    const ef = acessoEf();
    if (!acessoConectado() || !ef.valido || ef.desativado || !ef.global.coletarSaude || S.acessoCfg?.saude !== true) return; // precisa: o administrador pedir E a pessoa aceitar
    const agora = Date.now(); if (!forcar && agora - acesso.saudeT < ef.global.saudeMin * 60000) return;
    acesso.saudeT = agora;
    const dados = AC.montarSaude(await acessoOrigemSaude()), r = await acessoPost({ acao: 'saude', codigo: S.acessoCfg.codigo, inst: acessoInst(), dados });
    if (r?.ok) acesso.ultSaude = { t: agora, dados };
  }
  async function acessoVerEnvio() {
    const dados = acesso.ultSaude?.dados || AC.montarSaude(await acessoOrigemSaude());
    await dialogo({ titulo: 'O que é enviado ao administrador', texto: AC.descreverEnvio(dados).map((x) => '• ' + x).join('\n') + (acesso.ultSaude ? `\n\nÚltimo envio: ${hhmm(acesso.ultSaude.t)}.` : '\n\nAinda não enviou nada.'), cancelar: null });
  }
  async function acessoPerguntarSaude() {
    const ef = acessoEf(); if (!ef.valido || !ef.global.coletarSaude || S.acessoCfg?.saude != null) return;
    const dados = AC.montarSaude(await acessoOrigemSaude());
    const ok = await dialogo({ titulo: 'O administrador pede um resumo técnico', texto: `Para cuidar do funcionamento, o administrador quer receber a cada ${ef.global.saudeMin} min este resumo do seu AtendeZap:\n\n${AC.descreverEnvio(dados).map((x) => '• ' + x).join('\n')}\n\nVocê pode mudar de ideia depois em Configurações › Acesso da equipe.`, ok: 'Aceitar e enviar', cancelar: 'Não enviar' });
    S.acessoCfg = { ...S.acessoCfg, saude: !!ok }; await save('acessoCfg'); renderPanel();
    if (ok) acessoEnviarSaude(true);
  }
  async function acessoConectar(txt) {
    const c = AC.decodificarConvite(txt);
    if (!c) return toast('Esse convite não é válido. Cole o texto inteiro que começa com AZ1.', 6000);
    acesso.busy = true;
    const r = await chrome.runtime.sendMessage({ tipo: 'acesso', url: c.url, corpo: { acao: 'config', codigo: c.codigo, versao: acessoVersao(), inst: acessoInst(), maquina: acessoMaquina(), conectar: true } }).catch((e) => ({ erro: e.message }));
    acesso.busy = false;
    if (r?.ok === false && r.erro === 'limite de computadores') return toast(`Este convite já está em uso em outro computador (limite: ${r.limite || 1}). Peça ao administrador para liberar mais um computador ou trocar o computador antigo.`, 9000);
    if (!r?.ok) return toast(r?.ok === false ? `O administrador não reconheceu esse convite (${r.erro || 'recusado'}).` : 'Não consegui falar com o administrador: ' + (r?.erro || 'sem resposta'), 8000); // só grava depois de confirmar: convite errado nunca trava nada
    S.acessoCfg = { url: c.url, codigo: c.codigo, saude: null }; S.acessoEstado = { config: AC.normalizar(r), t: Date.now(), desativado: false, erro: '' };
    if (S.acessoAplicado?._c !== acessoTag(c.codigo)) S.acessoAplicado = { _c: acessoTag(c.codigo) };   // convite diferente: padrões do zero; o mesmo: mantém a escolha da pessoa
    await save('acessoCfg'); await save('acessoEstado'); await save('acessoAplicado'); acesso.falhas = 0; acesso.saudeT = 0;
    await acessoAplicarPadroes(); atendSincronizar(); renderHead(); renderPanel();
    toast(`Conectado: ${S.acessoEstado.config.nome || 'sua conta'} · perfil ${S.acessoEstado.config.perfil || '—'}.`, 6000);
    acessoPerguntarSaude();
  }
  async function acessoDesconectar() {
    if (!await confirmar('Desconectar do administrador?\n\nOs recursos bloqueados voltam a aparecer e os limites deixam de valer. Para voltar, cole o convite de novo.', { ok: 'Desconectar' })) return;
    S.acessoCfg = {}; S.acessoEstado = null;   // (os padrões já aplicados ficam guardados: ao colar o MESMO convite, a escolha da pessoa não é refeita)
    for (const k of ['acessoCfg', 'acessoEstado']) await save(k);
    atendSincronizar(); renderHead(); renderPanel();
    if (acessoEf().login) { openPanel('config'); toast('Desconectado. Cole um convite para voltar a usar o AtendeZap.'); } else toast('Desconectado. A extensão voltou ao modo pessoal.');
  }
  function acessoAvisosView() {
    const av = AC.avisos(acessoEf(), acessoVersao()); if (!av.length) return null;
    return h('div', { class: 'acv', role: 'status' }, av.map((a) => h('div', { class: 'acvi ' + a.tipo }, a.texto)));
  }
  const acessoRoboNota = () => {
    const ef = acessoEf(); if (!ef.conectado || AC.modoPermitido(ef, 'automatico')) return null;
    const max = ef.desativado || ef.restrito || ef.emergencia ? 'desligado' : ef.limites.roboModoMax || 'sugerir';
    return h('small', { class: 'iaav' }, `O administrador limitou o robô a "${{ desligado: 'desligado', sugerir: 'só sugerir', automatico: 'automático' }[max]}"${ef.emergencia ? ' (pausa temporária)' : ''}.`);
  };
  function acessoResumo() {
    const ef = acessoEf(); if (!ef.conectado) return { conectado: false, aguardandoLogin: !!ef.login };
    return { conectado: true, valido: ef.valido, restrito: ef.restrito, desativado: ef.desativado, emergencia: ef.emergencia, perfil: ef.perfil, idadeMin: ef.idadeMin, liberados: AC.RECURSOS.filter((k) => AC.liberado(ef, k, undefined)), pcs: ef.pcs,
      obrigatorios: Object.keys(ef.recursos).filter((k) => ef.recursos[k] === 'obrigatorio'), limites: ef.limites, saude: S.acessoCfg?.saude ?? null, erro: S.acessoEstado?.erro || '' }; // nunca o código nem o endereço
  }
  function acessoCard() {
    const ef = acessoEf();
    if (!acessoConectado()) return h('div', { class: 'sec' }, h('div', { class: 'sh' }, tile('users'), h('b', { class: 'grow' }, 'Acesso da equipe')),
      h('p', { class: 'hint' }, ef.login ? 'Para usar o AtendeZap, cole abaixo o convite que o administrador enviou para você (um texto que começa com AZ1.). Depois de conectar, as demais partes aparecem.' : 'Se o administrador enviou um convite (um texto que começa com AZ1.), cole aqui. Sem convite, a extensão funciona livremente, como sempre.'),
      h('div', { class: 'rowf' }, h('input', { class: 'in grow', placeholder: 'Cole o convite (AZ1.…)', autocomplete: 'off', 'aria-label': 'Convite do administrador', onkeydown: (e) => { if (e.key === 'Enter') acessoConectar(e.target.value); } }),
        h('button', { class: 'gbtn sm', onclick: (e) => acessoConectar(e.target.closest('.rowf').querySelector('input').value) }, 'Conectar')));
    const ago = ef.idadeMin == null ? 'nunca' : ef.idadeMin < 1 ? 'agora há pouco' : `há ${ef.idadeMin} min`, L = ef.limites;
    return h('div', { class: 'sec' }, h('div', { class: 'sh' }, tile('users'), h('b', { class: 'grow' }, 'Acesso da equipe')),
      h('p', null, h('b', null, ef.nome || 'Sua conta'), ` · perfil ${ef.perfil || '—'}`),
      h('small', { class: ef.valido && !ef.desativado ? 'iaok' : 'dan' }, ef.desativado ? (/computador/.test(ef.motivo || '') ? '✖ Este computador não está autorizado: ' + ef.motivo + '.' : '✖ Acesso desativado pelo administrador.') : ef.valido ? `✔ Conectado · confirmado ${ago}` : `⚠ Não confirmado (${S.acessoEstado?.erro || 'sem resposta'}): o robô fica desligado até confirmar.`),
      h('small', { class: 'hint' }, `Este computador: ${acessoMaquina()} · id ${String(S.instId || '').slice(0, 4)}` + (ef.pcs ? ` · computadores deste convite: ${ef.pcs.emUso} de ${ef.pcs.max}` : '')),
      AC.RECURSOS.some((k) => AC.liberado(ef, k, undefined)) ? null : h('small', { class: 'dan' }, 'O administrador ainda não liberou nenhuma parte para o seu perfil. Peça a ele para liberar o que você precisa.'),
      (L.roboModoMax || L.roboMaxPorContatoDia || L.roboMaxPorHora || L.chavesMax || L.retencaoMaxDias) ? h('small', { class: 'hint' }, 'Limites do administrador: ' + [L.roboModoMax && `robô até "${L.roboModoMax}"`, L.roboMaxPorContatoDia && `${L.roboMaxPorContatoDia} respostas/contato/dia`, L.roboMaxPorHora && `${L.roboMaxPorHora}/hora`, L.chavesMax && `${L.chavesMax} chave(s) da IA`, L.retencaoMaxDias && `dados por até ${L.retencaoMaxDias} dias`].filter(Boolean).join(' · ') + '.') : null,
      ef.global.coletarSaude ? h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: S.acessoCfg?.saude === true, onchange: async (e) => { S.acessoCfg = { ...S.acessoCfg, saude: e.target.checked }; await save('acessoCfg'); if (e.target.checked) acessoEnviarSaude(true); renderPanel(); } }), 'Enviar o resumo técnico de saúde ao administrador')
        : h('small', { class: 'hint' }, 'O administrador não pediu nenhuma informação sua.'),
      h('div', { class: 'rowf' }, h('button', { class: 'obtn', onclick: () => acessoConsultar(true) }, 'Atualizar agora'), ef.global.coletarSaude ? h('button', { class: 'obtn', onclick: acessoVerEnvio }, 'Ver o que é enviado') : null, h('button', { class: 'obtn', onclick: acessoDesconectar }, 'Desconectar')));
  }
  // ===== Privacidade e retenção (v1.28) =====
  const semChave = (o, k) => { const x = { ...(o || {}) }; delete x[k]; return x; };
  // Apaga do navegador o que passou do prazo (registro, demanda e tempos). A memória que você aprovou fica.
  function atendPurgar(forcar) {
    const dias = Number(atendC().retencaoDias) || 0;
    if (!dias || (!forcar && Date.now() - atend.purgouEm < 6 * 3600000)) return 0;
    atend.purgouEm = Date.now();
    const lim = Date.now() - dias * 86400000; let n = 0;
    for (const k of ['atendLog', 'memDemanda', 'memTempos']) { const a = S[k] || [], b = a.filter((x) => (x.t || 0) >= lim); if (b.length !== a.length) { n += a.length - b.length; S[k] = b; save(k); } }
    return n;
  }
  async function atendApagarContato(id) {
    if (!id) return toast('Abra a conversa do contato primeiro.');
    if (!await confirmar('Apagar deste navegador tudo o que o robô guarda deste contato (perfil, pendências, registro e pausas)?')) return;
    const hh = hash32(id);
    clearTimeout(atend.timers.get(id)); atend.timers.delete(id); atend.escopoCache.delete(id);
    S.memPerfis = semChave(S.memPerfis, id); save('memPerfis');
    S.memPend = semChave(S.memPend, id); save('memPend');
    S.atendSug = (S.atendSug || []).filter((x) => x.id !== id); save('atendSug');
    S.atendLog = (S.atendLog || []).filter((x) => x.h !== hh); save('atendLog');
    atendEst((e) => { const o = { ...e }; for (const k of ['pausas', 'porContato', 'ultimo', 'identificado']) if (o[k]) o[k] = semChave(o[k], id); return o; });
    toast('Apaguei do navegador o que o robô guardava deste contato. As perguntas já gravadas na planilha não têm o telefone: para apagá-las use "Limpar a planilha".', 9000); renderPanel();
  }
  async function atendApagarTudo() {
    if (!await confirmar('Apagar deste navegador o registro do robô, os perfis de motoristas, as pendências e os dados de demanda e tempos? (A memória que você aprovou e o seu treino ficam.)')) return;
    S.atendLog = []; save('atendLog'); S.memPerfis = {}; save('memPerfis'); S.memPend = {}; save('memPend'); S.atendSug = []; save('atendSug');
    S.memDemanda = []; save('memDemanda'); S.memTempos = []; save('memTempos'); S.memFila = []; save('memFila');
    toast('Dados do robô apagados deste navegador.'); renderPanel();
  }
  async function atendLimparPlanilha() {
    const tok = S.iaCfg?.tokenPlanilha || '', dias = Number(atendC().retencaoDias) || 90;
    if (!S.cargasUrl || !tok) return toast('Configure antes a planilha e a senha (Memória IA › Gravar na planilha).', 6000);
    if (!await confirmar(`Apagar da planilha as linhas de "IA - Demanda", "IA - Aprendizado" e "IA - Tempos" com mais de ${dias} dias? (A memória aprovada não é tocada.)`)) return;
    const r = await chrome.runtime.sendMessage({ tipo: 'planilhaEscrever', url: S.cargasUrl, token: tok, aba: 'limpar', dias }).catch((e) => ({ erro: e.message }));
    toast(r?.ok ? `Planilha limpa: ${r.removidas} linha(s) removida(s).` : 'Não consegui limpar: ' + (r?.erro || 'o script da planilha está desatualizado'), 7000);
  }
  // ---- cartões da tela (Regras e Ajustes) ----
  function escopoCard(c, mud) {
    const ativo = S.active, nunca = c.nuncaAtender || [], palavras = c.nuncaPalavras || [], quem = c.quem || 'desconhecidos', individual = !!ativo && /@(c\.us|lid)$/.test(ativo.id || ''), jaNunca = individual && nunca.some((x) => x.id === ativo.id);
    const opc = [['desconhecidos', 'Só números que NÃO estão nos meus contatos (recomendado)'], ['todos', 'Todos os contatos (menos a lista abaixo)'], ...(S.labels.length ? [['etiquetas', 'Só quem tem uma destas etiquetas']] : [])];
    const addPalavra = (v) => { v = String(v || '').trim().slice(0, 40); if (v && !palavras.includes(v)) mud('nuncaPalavras', [...palavras, v]); };
    return h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, 'Quem o robô atende')),
      h('p', { class: 'hint' }, 'Só conversas individuais (nunca grupos).'),
      opc.map(([v, t]) => h('label', { class: 'chk' }, h('input', { type: 'radio', name: 'azquem', checked: quem === v, onchange: () => mud('quem', v) }), t)),
      quem === 'desconhecidos' ? h('small', { class: 'iaav' }, 'Atenção: motoristas e clientes que você JÁ salvou nos contatos (ex.: "(Terceiro)") não serão atendidos neste modo. Se quiser atendê-los, escolha "Todos" e use a lista abaixo para deixar de fora família e amigos.') : null,
      quem === 'etiquetas' ? h('div', { class: 'iachips' }, S.labels.map((l) => { const id = String(l.id), alvo = (c.etiquetasAtender || []).map(String);
        return h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: alvo.includes(id), onchange: (e) => mud('etiquetasAtender', e.target.checked ? [...alvo, id] : alvo.filter((x) => x !== id)) }), l.name); })) : null,
      h('b', { class: 'limlbl' }, 'Nunca atender nomes com estas palavras'),
      h('p', { class: 'hint' }, 'Vale em qualquer modo. A palavra precisa aparecer inteira no nome do contato (ex.: "Alice (filha)" tem "filha"; "Paiva" não tem "pai").'),
      h('div', { class: 'iachips' }, palavras.map((x) => h('span', { class: 'limtag' }, x, h('button', { class: 'ib', title: 'Remover', onclick: () => mud('nuncaPalavras', palavras.filter((y) => y !== x)) }, '✕')))),
      h('div', { class: 'rowf' }, h('input', { class: 'in grow', placeholder: 'Ex.: filha, esposa, (Transportes Poloni)…', onkeydown: (e) => { if (e.key === 'Enter') addPalavra(e.target.value); } }),
        h('button', { class: 'obtn', onclick: (e) => addPalavra(e.target.parentElement.querySelector('input').value) }, 'Adicionar')),
      h('b', { class: 'limlbl' }, `Nunca atender estes contatos (${nunca.length})`),
      nunca.map((x) => h('div', { class: 'prow' }, h('span', { class: 'grow' }, x.nome || '…' + String(x.id).split('@')[0].slice(-4)), h('button', { class: 'ib', title: 'Voltar a atender', onclick: () => mud('nuncaAtender', nunca.filter((y) => y.id !== x.id)) }, '✕'))),
      individual ? h('div', { class: 'rowf' }, h('button', { class: 'obtn', disabled: jaNunca, onclick: () => atendNunca(ativo.id, ativo.name) }, jaNunca ? 'Este contato já está na lista' : `Nunca atender: ${atendQuem(ativo.name, ativo.id)}`))
        : h('small', { class: 'hint' }, 'Abra uma conversa individual para adicioná-la a esta lista.'),
      atend.foraEscopo ? h('small', { class: 'mut' }, `Ignoradas pela regra desde que a página abriu: ${atend.foraEscopo}.`) : null);
  }
  function privacidadeCard(c, numero) {
    const ativo = S.active, id = ativo?.id || '', individual = /@(c\.us|lid)$/.test(id);
    return h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, 'Privacidade e dados')),
      h('p', { class: 'hint' }, 'As mensagens dos clientes vão ao Google (Gemini) para gerar as respostas. Confira se a sua chave é de um projeto com faturamento ativo (nível pago): nos termos do nível gratuito o Google pode usar o conteúdo enviado para melhorar seus produtos. CPF, telefone, cartão e afins são mascarados antes de ir para a IA e para a planilha.'),
      numero('retencaoDias', 'Guardar registro, demanda e tempos por', 0, 3650, 'dias (0 = para sempre)'),
      h('div', { class: 'rowf' }, h('button', { class: 'obtn', onclick: () => { const n = atendPurgar(true); toast(n ? `Apaguei ${n} registro(s) antigo(s).` : 'Nada passou do prazo.'); renderPanel(); } }, 'Apagar agora o que passou do prazo')),
      h('div', { class: 'rowf' }, h('button', { class: 'obtn', disabled: !individual, onclick: () => atendApagarContato(id) }, individual ? `Apagar dados de ${atendQuem(ativo.name, id)}` : 'Apagar dados de um contato (abra a conversa)')),
      h('div', { class: 'rowf' }, h('button', { class: 'obtn', onclick: atendApagarTudo }, 'Apagar tudo do robô neste navegador'), h('button', { class: 'obtn', onclick: atendLimparPlanilha }, 'Limpar a planilha (dados antigos)')));
  }
  function atendView() {
    if (treino.aberto) return treinoView();
    const c = atendC(), pend = S.atendSug || [], mud = (k, v) => atendSalvar({ [k]: v });
    const area = (k, rot, ph, rows = 4) => h('label', { class: 'lb' }, rot, h('textarea', { class: 'in', rows, placeholder: ph, value: c[k] || '', onchange: (e) => mud(k, e.target.value) }));
    const linha = (k, rot, ph) => h('label', { class: 'lb' }, rot, h('input', { class: 'in', value: c[k] || '', placeholder: ph || '', onchange: (e) => mud(k, e.target.value) }));
    const numero = (k, rot, min, max, suf) => h('label', { class: 'inl' }, h('span', null, rot), h('input', { class: 'in num', type: 'number', min, max, value: c[k], onchange: (e) => mud(k, Math.max(min, Math.min(max, +e.target.value || min))) }), suf || '');
    const pares = (k, campos, titulo, ajuda) => h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, titulo)), h('p', { class: 'hint' }, ajuda),
      (c[k] || []).map((x, i) => h('div', { class: 'card pedplano' }, h('div', { class: 'grow' }, campos.map(([f, ph]) => h('textarea', { class: 'in', rows: 2, placeholder: ph, value: x[f] || '',
        onchange: (e) => mud(k, c[k].map((y, j) => (j === i ? { ...y, [f]: e.target.value } : y))) }))),
      h('button', { class: 'ib dan', title: 'Remover', onclick: () => mud(k, c[k].filter((_, j) => j !== i)) }, icon('trash', 16)))),
      h('button', { class: 'obtn', onclick: () => mud(k, [...(c[k] || []), Object.fromEntries(campos.map(([f]) => [f, '']))]) }, '＋ Adicionar'));
    const pronta = iaPronta(), ativo = c.modo !== 'desligado';
    const frase = { desligado: 'O robô está desligado: não lê nem responde nada.', sugerir: 'O robô LÊ as mensagens novas e prepara uma resposta, mas só envia quando você aprovar aqui.', automatico: 'O robô responde SOZINHO (só conversas individuais). Se você responder numa conversa, ele se cala nela.' }[c.modo];
    const el = {
      modo: () => h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, 'Atendente IA')),
        !pronta ? h('p', { class: 'hint dan' }, SEM_IA) : null,
        h('div', { class: 'seg' }, [['desligado', 'Desligado'], ['sugerir', 'Só sugerir'], ['automatico', 'Automático']].map(([m, t]) => h('button', { class: c.modo === m ? 'on' : '', disabled: !AC.modoPermitido(acessoEf(), m), title: AC.modoPermitido(acessoEf(), m) ? '' : 'Limitado pelo administrador', onclick: () => atendModo(m) }, t))),
        acessoRoboNota(),
        h('p', { class: 'hint' }, frase),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!c.aceito, onchange: (e) => mud('aceito', e.target.checked) }),
          'Entendo que, com o Atendente ligado, as mensagens dos clientes nas conversas individuais em que o robô atua são enviadas à API do Google (Gemini) para gerar as respostas, e que devo avisar meus clientes quando necessário (LGPD).')),
      estado: () => (() => {
        const st = atendEstadoRobo(), pausas = atendPausasAtivas(), agora = Date.now(), min = (t) => (t ? Math.max(0, Math.round((agora - t) / 60000)) : null);
        return h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, 'Estado do robô')),
          ativo ? h('small', null, `● Ligado (${c.modo === 'automatico' ? 'automático' : 'só sugerir'}) · última mensagem recebida: ${atend.ultEvento ? 'há ' + min(atend.ultEvento) + ' min' : 'nenhuma desde que a página abriu'} · IA hoje: ${atendUsoHoje()}/${S.iaCfg?.limiteDia || 100}${atendIaMs() ? ' · tempo médio da IA ' + (atendIaMs() / 1000).toFixed(1) + ' s' : ''}`) : h('small', null, 'Desligado.'),
          ativo ? (st.problemas.length ? st.problemas.map((x) => h('small', { class: 'iaav' }, '⚠ ' + x)) : h('small', { class: 'iaok' }, '✅ Tudo certo para responder.')) : null,
          pausas.length ? [h('b', { class: 'abt' }, `Conversas pausadas (${pausas.length})`), h('small', null, 'O robô não responde nelas até a pausa acabar:'),
            pausas.slice(0, 12).map(([id, t]) => h('div', { class: 'prow' }, h('span', { class: 'grow link', title: 'Abrir a conversa', onclick: () => call('openChat', id) }, '…' + id.split('@')[0].slice(-4)), h('small', { class: 'mut' }, `até ${hhmm(t)}`), h('button', { class: 'obtn', onclick: () => atendRetomar(id) }, 'Retomar'))),
            pausas.length > 1 ? h('div', { class: 'rowf' }, h('button', { class: 'obtn', onclick: () => atendRetomar() }, 'Retomar todas')) : null] : null,
          h('div', { class: 'rowf' }, h('button', { class: 'obtn', disabled: !ativo, onclick: () => atendRecuperar(true) }, 'Responder pendentes agora'), h('button', { class: 'obtn', onclick: atendZerarLimites }, 'Zerar limites de hoje')),
          h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: c.manterAcordado !== false, onchange: (e) => mud('manterAcordado', e.target.checked) }), 'Manter o computador acordado enquanto o robô estiver ligado (impede a suspensão do Windows; a tela pode apagar)'),
          numero('recuperarH', 'Ao voltar de uma parada, responder o que ficou sem resposta das últimas', 0, 24, 'horas (0 = não)'),
          h('p', { class: 'hint' }, 'O robô só funciona com o computador ligado e a aba do WhatsApp Web aberta. Se o computador dormir ou o Chrome congelar a aba, ele para até acordar (e, ao voltar, retoma as pendentes). Dica: no Chrome, Configurações › Desempenho › "Manter estes sites sempre ativos" › adicione web.whatsapp.com.'));
      })(),
      pend: () => pend.length ? h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, `Precisam de você (${pend.length})`)),
        pend.map((it) => h('div', { class: 'card pedplano' }, h('div', { class: 'grow' },
          h('b', { class: 'link', title: 'Abrir a conversa', onclick: () => call('openChat', it.id) }, `${it.acao === 'humano' ? '🙋' : '💬'} ${it.nome}`),
          h('small', null, it.acao === 'humano' ? `Chamou você: ${it.motivo}` : it.acao === 'executar' ? `Sugere executar /${it.atalho}` : 'Sugestão de resposta:'),
          it.mensagens?.map((m) => h('small', { class: 'iaprop' }, m)),
          h('div', { class: 'rowf' },
            it.acao !== 'humano' ? h('button', { class: 'gbtn sm', onclick: () => atendSugEnviar(it) }, 'Enviar') : null,
            it.acao === 'responder' ? h('button', { class: 'obtn', onclick: () => atendSugCampo(it) }, 'Colocar no campo') : null,
            h('button', { class: 'obtn', onclick: () => atendSugTirar(it.id) }, it.acao === 'humano' ? 'Já resolvi' : 'Descartar'),
            h('button', { class: 'obtn', title: 'O robô nunca mais atende este contato', onclick: () => atendNunca(it.id, it.nome) }, 'Nunca atender'))))))
        : null,
      conhecimento: () => h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, 'Treinar: o que a IA precisa saber')),
        h('p', { class: 'hint' }, 'Quanto mais claro, melhor ela atende. Ela só responde com o que estiver aqui; o que não souber, passa para você.'),
        area('empresa', 'Sobre a empresa', 'Ex.: Transportes Poloni. Fretes e cargas para todo o Brasil, com rastreamento…', 4),
        area('servicos', 'Serviços, preços e regras', 'Ex.: Fretes cotados por rota e peso. Documentos necessários: CNH, CRLV… Pagamento: saldo na entrega…', 6),
        linha('horario', 'Horário de atendimento humano', 'Ex.: segunda a sexta, 8h às 18h'),
        area('regras', 'Regras extras (o que nunca fazer)', 'Ex.: nunca informar preço sem a rota; sempre pedir origem e destino…', 3),
        h('label', { class: 'lb' }, 'Tom de voz', h('select', { class: 'in', onchange: (e) => mud('tom', e.target.value) }, [['amigavel', 'Amigável'], ['profissional', 'Profissional'], ['direto', 'Direto e curto']].map(([v, t]) => h('option', { value: v, selected: c.tom === v }, t))))),
      proib: () => limitesCard(c, mud, linha),
      faq: () => pares('faq', [['p', 'Pergunta do cliente'], ['r', 'Resposta']], 'Perguntas frequentes', 'Respostas prontas para dúvidas comuns. A IA usa como base e adapta ao jeito da conversa.'),
      exemplos: () => pares('exemplos', [['c', 'O cliente disse…'], ['r', 'O ideal é responder…']], 'Exemplos de bom atendimento', 'Ensine pelo exemplo: ela imita o seu jeito. Dica: use o "Treinar conversando" abaixo e salve as melhores respostas aqui.'),
      respostas: () => h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, 'Respostas rápidas que o robô pode usar')),
        h('p', { class: 'hint' }, 'Quando uma resposta sua servir exatamente (Pix, documentos, localização…), a IA a executa em vez de escrever. Só aparecem as que não têm ação destrutiva.'),
        S.replies.length ? S.replies.map((r) => { const ok = seguraParaRobo(r), marcado = c.respostasPermitidas.includes(r.id) && ok;
          return h('label', { class: 'chk' + (ok ? '' : ' mut') }, h('input', { type: 'checkbox', disabled: !ok, checked: marcado,
            onchange: (e) => mud('respostasPermitidas', e.target.checked ? [...c.respostasPermitidas, r.id] : c.respostasPermitidas.filter((x) => x !== r.id)) }),
          `/${r.atalho || '?'} · ${r.titulo || 'sem título'}${ok ? '' : ' (tem ação que o robô não pode executar)'}`); }) : h('p', { class: 'hint' }, 'Você ainda não tem respostas rápidas.')),
      cargas: () => h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, 'Cargas da planilha')),
        !S.cargasUrl ? h('p', { class: 'hint dan' }, 'Cole o link da lista de frete em Atendimento › Lista de frete: é por ele que a IA enxerga as cargas disponíveis.') : null,
        h('p', { class: 'hint' }, 'A IA consulta a MESMA lista de cargas que vai para os grupos (nada além dela) para responder "tem carga saindo de…?". Ela entende origem, destino, veículo e carga e pergunta o que faltar.'),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!c.usarCargas, onchange: (e) => mud('usarCargas', e.target.checked) }), 'A IA consulta a lista de cargas ao responder'),
        numero('cargasMin', 'Atualizar a lista a cada', 1, 60, 'min'),
        h('div', { class: 'rowf' }, h('button', { class: 'obtn', onclick: atendVerCargas }, 'Ver o que a IA enxerga')),
        memSt.cargasVer ? h('div', { class: 'card pedplano' }, h('div', { class: 'grow' }, memSt.cargasVer.erro ? h('small', { class: 'dan' }, memSt.cargasVer.erro)
          : [h('small', null, `Atualizada agora (${memSt.cargasVer.total} caracteres).`), h('small', { class: 'iaprop' }, memSt.cargasVer.previa)])) : null,
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!c.lembrarPerfil, onchange: (e) => mud('lembrarPerfil', e.target.checked) }),
          'Lembrar o perfil de cada motorista (veículo, carroceria, regiões) para não perguntar de novo. Fica só neste navegador; você pode apagar na aba Memória IA.')),
      quando: () => h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, 'Quando atuar')),
        h('label', { class: 'lb' }, 'O robô atende', h('select', { class: 'in', onchange: (e) => mud('quando', e.target.value) },
          [['sempre', 'A qualquer hora'], ['fora', 'Só FORA do horário abaixo'], ['dentro', 'Só DENTRO do horário abaixo']].map(([v, t]) => h('option', { value: v, selected: c.quando === v }, t)))),
        c.quando !== 'sempre' ? [
          h('div', { class: 'iachips' }, DIAS_ROT.map((d, i) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: c.exp.dias.includes(i),
            onchange: (e) => mud('exp', { ...c.exp, dias: e.target.checked ? [...c.exp.dias, i].sort() : c.exp.dias.filter((x) => x !== i) }) }), d))),
          h('div', { class: 'rowf' }, h('label', { class: 'inl' }, h('span', null, 'das'), h('input', { class: 'in', type: 'time', value: c.exp.de, onchange: (e) => mud('exp', { ...c.exp, de: e.target.value }) })),
            h('label', { class: 'inl' }, h('span', null, 'às'), h('input', { class: 'in', type: 'time', value: c.exp.ate, onchange: (e) => mud('exp', { ...c.exp, ate: e.target.value }) })))] : null),
      chamar: () => h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, 'Quando chamar você (um humano)')),
        h('label', { class: 'lb' }, 'Palavras do cliente que chamam um humano direto (separe por vírgula)', h('textarea', { class: 'in', rows: 2, value: (c.palavrasHumano || []).join(', '),
          onchange: (e) => mud('palavrasHumano', e.target.value.split(',').map((x) => x.trim()).filter(Boolean)) })),
        h('label', { class: 'inl' }, h('span', null, 'Confiança mínima da IA'), h('input', { class: 'in num', type: 'number', min: 0, max: 100, step: 5, value: Math.round(c.confianca * 100), onchange: (e) => mud('confianca', Math.max(0, Math.min(100, +e.target.value || 60)) / 100) }), '%'),
        linha('msgHumano', 'Mensagem ao cliente quando chamar você (modo automático; vazio = não avisa)', 'Vou chamar um atendente…'),
        S.labels.length ? h('label', { class: 'lb' }, 'Etiqueta para essas conversas (opcional)', h('select', { class: 'in', onchange: (e) => mud('etiquetaHumano', e.target.value) },
          h('option', { value: '' }, 'Nenhuma'), S.labels.map((l) => h('option', { value: l.id, selected: c.etiquetaHumano === l.id }, l.name)))) : null,
        numero('pausaChamadoMin', 'Quando o robô chama você, ele se cala por', 1, 720, 'min'), numero('pausaHumanoH', 'Quando VOCÊ responde na conversa, ele se cala por', 1, 72, 'horas')),
      limites: () => h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, 'Limites e naturalidade')),
        h('label', { class: 'lb' }, 'Ritmo do robô', h('select', { class: 'in', onchange: (e) => atendSalvar({ ritmo: e.target.value, espera: IA.RITMOS[e.target.value].espera }) },
          [['rapido', '⚡ Rápido (começa em 1–3 s)'], ['normal', 'Normal (2–5 s)'], ['calmo', '🐢 Calmo (6–14 s)']].map(([v, t]) => h('option', { value: v, selected: (c.ritmo || 'normal') === v }, t)))),
        (S.iaCfg?.modelos || []).length ? h('label', { class: 'lb' }, 'Modelo da IA só para o robô', h('select', { class: 'in', onchange: (e) => mud('modeloRobo', e.target.value) },
          h('option', { value: '' }, 'O mesmo das configurações'), S.iaCfg.modelos.map((m) => h('option', { value: m.id, selected: c.modeloRobo === m.id }, m.nome && m.nome !== m.id ? `${m.nome} (${m.id})` : m.id))))
          : h('small', { class: 'hint' }, 'Para escolher um modelo só do robô, clique antes em "Testar a chave e listar os modelos" (Configurações › Geral).'),
        h('small', { class: 'hint' }, `Tempo médio da IA hoje: ${atendIaMs() ? (atendIaMs() / 1000).toFixed(1) + ' s' : 'sem medição ainda'}. O robô já pede à IA o raciocínio mínimo; modelos "flash-lite" costumam ser ainda mais rápidos.`),
        numero('maxPorContatoDia', 'Respostas por contato, por dia', 1, 50), numero('maxPorHora', 'Respostas no total, por hora', 1, 200),
        h('div', { class: 'rowf' }, h('label', { class: 'inl' }, h('span', null, 'Espera antes de responder'), h('input', { class: 'in num', type: 'number', min: 0, max: 120, value: c.espera[0], onchange: (e) => mud('espera', [Math.max(0, +e.target.value || 0), c.espera[1]]) }), 'a'),
          h('input', { class: 'in num', type: 'number', min: 0, max: 120, value: c.espera[1], onchange: (e) => mud('espera', [c.espera[0], Math.max(c.espera[0], +e.target.value || 0)]) }), 's'),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!c.identificar, onchange: (e) => mud('identificar', e.target.checked) }), 'Na 1ª resposta do dia, se identificar como assistente virtual (recomendado)'),
        c.identificar ? linha('prefixo', 'Texto de identificação', '🤖 Assistente virtual:') : null),
      treinarConv: () => h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, 'Treinar conversando')),
        h('p', { class: 'hint' }, 'Abra uma conversa de teste: você é o cliente e a IA responde com o seu treino de verdade, sem enviar nada ao WhatsApp. Corrija o que errar e ela aprende. Também tem testes de segurança prontos.'),
        h('div', { class: 'rowf' }, h('button', { class: 'gbtn', onclick: () => { treino.aberto = true; renderPanel(); } }, '💬 Treinar conversando'))),
      registro: () => h('details', { class: 'tec' }, h('summary', null, `Registro do robô (${(S.atendLog || []).length})`),
        (S.atendLog || []).slice(0, 30).map((l) => h('small', null, `${new Date(l.t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${l.quem} · ${l.acao}${l.resumo ? ': ' + l.resumo : ''}`)),
        (S.atendLog || []).length ? h('div', { class: 'rowf' }, h('button', { class: 'obtn', onclick: () => { S.atendLog = []; save('atendLog'); renderPanel(); } }, 'Limpar registro')) : null),
      avisoEscopo: () => (ativo && atend.foraEscopo ? h('div', { class: 'sec' }, h('small', { class: 'iaav' }, `ℹ️ ${atend.foraEscopo} conversa(s) ignorada(s) pela regra "Quem o robô atende" desde que a página abriu.`),
        h('div', { class: 'rowf' }, c.quem === 'desconhecidos' ? h('button', { class: 'obtn', onclick: () => mud('quem', 'todos') }, 'Atender também contatos salvos') : null,
          h('button', { class: 'obtn', onclick: () => { atendUi.sub = 'regras'; renderPanel(); } }, 'Ver a regra'))) : null),
      escopo: () => escopoCard(c, mud),
      trava: () => h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, 'Robô único')),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: c.travaUnico !== false, onchange: (e) => { mud('travaUnico', e.target.checked); if (e.target.checked) atendTrava().catch(() => {}); else atendTravaLiberar().catch(() => {}); } }), 'Só um computador responde por vez'),
        h('p', { class: 'hint' }, 'Se o WhatsApp Web for aberto em outro computador com o robô ligado, só um deles responde; o outro fica em espera e assume sozinho se o primeiro parar (2,5 min). Usa a planilha para combinar: precisa do link, da senha (Memória IA › Gravar na planilha) e do script novo.'),
        atend.semTrava ? h('small', { class: 'dan' }, 'Trava inativa: o script da planilha está antigo ou sem conexão.') : atend.bloqueado ? h('small', { class: 'iaav' }, `Em espera: ${atend.bloqueado.outro} está com o robô.`)
          : (c.modo === 'automatico' && S.cargasUrl && S.iaCfg?.tokenPlanilha && c.aceito ? h('small', { class: 'iaok' }, '✓ Este computador está com o robô.') : null)),
      audio: () => h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, 'Áudios dos clientes')),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!c.transcreverAudio, onchange: (e) => mud('transcreverAudio', e.target.checked) }), 'Transcrever os áudios com a IA para o robô entender'),
        h('p', { class: 'hint' }, 'Desligado, o robô pede que o cliente escreva. Ligado, o ÁUDIO do cliente (até 3 min) é enviado ao Google (Gemini) para virar texto, e cada áudio usa 1 pedido da IA. Recurso novo: teste no seu WhatsApp antes de confiar.'),
        h('small', { class: atend.transcErro && !atend.transcOk ? 'dan' : 'mut' }, `Desde que a página abriu: ${atend.transcOk} transcrito(s), ${atend.transcErro} falha(s)${atend.transcUlt ? ' · última falha: ' + atend.transcUlt : ''}.`),
        h('div', { class: 'rowf' }, h('button', { class: 'obtn', onclick: atendTestarAudio }, 'Testar com o último áudio desta conversa'))),
      privacidade: () => privacidadeCard(c, numero),
    };
    const ordem = { painel: ['modo', 'estado', 'avisoEscopo', 'pend', 'registro'], treino: ['treinarConv', 'conhecimento', 'faq', 'exemplos', 'respostas', 'cargas'], regras: ['escopo', 'proib', 'chamar'], ajustes: ['quando', 'limites', 'trava', 'audio', 'privacidade'] };
    const sub = ordem[atendUi.sub] ? atendUi.sub : 'painel';
    return [
      h('div', { class: 'seg' }, [['painel', 'Painel' + (pend.length ? ` (${pend.length})` : '')], ['treino', 'Treino'], ['regras', 'Regras'], ['ajustes', 'Ajustes']].map(([k, t]) => h('button', { class: sub === k ? 'on' : '', 'aria-pressed': String(sub === k), onclick: () => { atendUi.sub = k; renderPanel(); } }, t))),
      ...ordem[sub].filter((k) => !(k === 'audio' && acessoOculto('iaAudio'))).map((k) => el[k]()),
    ];
  }

  // ===================== MEMÓRIA DA IA (v1.23) =====================
  // O que vale aprender: (1) DEMANDA — o que as pessoas procuram (origem, destino, veículo, carga) e o que ficou sem carga, extraído pela própria IA
  // em cada atendimento (sem chamada extra); (2) LACUNAS — perguntas que a IA passou para você e o que VOCÊ respondeu depois (a melhor fonte);
  // (3) VOCABULÁRIO e FATOS propostos pela IA ao analisar o dia; (4) PERFIL do motorista (opcional). Nada vale como regra sem a sua aprovação.
  const memSt = { sync: { ok: null, t: 0, erro: '' }, aprendendo: false, cargasVer: null, janela: 7, importando: false };
  const cargasCache = { t: 0, texto: '', erro: '' };
  async function atendCargas(forcar) {
    const c = atendC();
    if (!c.usarCargas || !S.cargasUrl) return null;
    if (!forcar && cargasCache.texto && Date.now() - cargasCache.t < (c.cargasMin || 3) * 60000) return cargasCache;
    const r = await chrome.runtime.sendMessage({ tipo: 'buscarLista', url: S.cargasUrl }).catch((e) => ({ erro: e.message }));
    if (r?.texto) { cargasCache.texto = r.texto; cargasCache.t = Date.now(); cargasCache.erro = ''; }
    else { cargasCache.erro = r?.erro || 'a planilha não respondeu'; if (forcar) throw new Error(cargasCache.erro); }
    return cargasCache.texto ? cargasCache : null;
  }
  async function atendVerCargas() {
    try { const k = await atendCargas(true); memSt.cargasVer = k ? { total: k.texto.length, previa: k.texto.slice(0, 700) + (k.texto.length > 700 ? '…' : '') } : { erro: 'Ative "A IA consulta a lista" e confira o link em Configurações.' }; }
    catch (e) { memSt.cargasVer = { erro: 'Não consegui ler a planilha: ' + e.message }; }
    renderPanel();
  }
  const textoCliente = (h) => { const b = []; for (let i = h.msgs.length - 1; i >= 0 && h.msgs[i].de === 'cliente'; i--) b.unshift(h.msgs[i].texto); return b.join(' '); };
  // fila de linhas para a planilha (as abas "IA - …"): só se você ligou "gravar na planilha"
  let memTimer = null;
  const memSyncLogo = () => { clearTimeout(memTimer); memTimer = setTimeout(memSincronizar, 15000); };
  function memEnfileirar(aba, linha) {
    if (!atendC().planilhaAprende) return;
    S.memFila = [...(S.memFila || []), { aba, linha }].slice(-300); save('memFila'); memSyncLogo();
  }
  async function memSincronizar() {
    const tok = S.iaCfg?.tokenPlanilha || '';
    if (!atendC().planilhaAprende || !S.cargasUrl || !tok || !(S.memFila || []).length) return;
    const lote = S.memFila.slice(0, 150), porAba = {};
    for (const x of lote) (porAba[x.aba] ||= []).push(x.linha);
    for (const [aba, linhas] of Object.entries(porAba)) {
      const r = await chrome.runtime.sendMessage({ tipo: 'planilhaEscrever', url: S.cargasUrl, token: tok, aba, linhas }).catch((e) => ({ erro: e.message }));
      if (!r?.ok && /aba não permitida/.test(r?.erro || '')) { // script antigo (sem a aba "IA - Tempos"): descarta essas linhas para não travar o resto da fila
        let k = linhas.length; S.memFila = S.memFila.filter((x) => !(x.aba === aba && k-- > 0)); memSt.avisoScript = true; continue;
      }
      if (!r?.ok) { memSt.sync = { ok: false, t: Date.now(), erro: r?.erro || 'falhou' }; return renderSeguro(); }
      let n = linhas.length; S.memFila = S.memFila.filter((x) => !(x.aba === aba && n-- > 0)); // tira da fila o que a planilha confirmou
    }
    memSt.sync = { ok: true, t: Date.now(), erro: '' }; await save('memFila'); renderSeguro();
    if ((S.memFila || []).length) memSyncLogo();
  }
  async function memTestarPlanilha() {
    const tok = S.iaCfg?.tokenPlanilha || '';
    if (!S.cargasUrl) return toast('Cole antes o link da lista de frete em Atendimento › Lista de frete.', 5000);
    if (!tok) return toast('Escreva a senha da planilha (a mesma do TOKEN_IA no script).', 5000);
    const r = await chrome.runtime.sendMessage({ tipo: 'planilhaEscrever', url: S.cargasUrl, token: tok, aba: 'ping', linhas: [] }).catch((e) => ({ erro: e.message }));
    memSt.sync = r?.ok ? { ok: true, t: Date.now(), erro: '' } : { ok: false, t: Date.now(), erro: r?.erro || 'falhou' };
    memSt.scriptAntigo = !!r?.ok && !(r.versao >= 2); // o script novo responde a versão no ping; sem ela, falta colar o AtendeZap.gs atualizado
    toast(!r?.ok ? 'Não conectou: ' + memSt.sync.erro : memSt.scriptAntigo ? 'Conectou, mas o script da planilha está desatualizado (faltam os tempos de resposta): cole o AtendeZap.gs novo.' : 'Planilha conectada. O aprendizado e os tempos serão gravados nas abas "IA - …".', 8000); renderPanel();
  }
  async function memImportar() {
    const tok = S.iaCfg?.tokenPlanilha || '';
    if (!S.cargasUrl || !tok) return toast('Configure o link da lista de frete e a senha da planilha primeiro.', 5000);
    memSt.importando = true; renderPanel();
    const r = await chrome.runtime.sendMessage({ tipo: 'planilhaMemoria', url: S.cargasUrl, token: tok }).catch((e) => ({ erro: e.message }));
    memSt.importando = false;
    if (!r?.ok) { toast('Não consegui importar: ' + (r?.erro || 'sem resposta'), 7000); return renderPanel(); }
    const ativos = new Set(r.itens.map((x) => x.id)), tem = new Set((S.memFatos || []).map((x) => x.id));
    const novos = r.itens.filter((x) => !tem.has(x.id)).map((x) => { const m = /^P:\s*(.*?)\s*\|\s*R:\s*(.*)$/s.exec(x.texto); return m ? { id: x.id, tipo: 'faq', p: m[1], r: m[2], t: Date.now(), fonte: 'planilha', ativo: true, sync: true } : { id: x.id, tipo: ['fato', 'vocab'].includes(x.tipo) ? x.tipo : 'fato', texto: x.texto, t: Date.now(), fonte: 'planilha', ativo: true, sync: true }; });
    // o que está na memória daqui, já sincronizado, mas sumiu/foi desligado na planilha, deixa de valer
    S.memFatos = [...(S.memFatos || []).map((x) => (x.sync && !ativos.has(x.id) ? { ...x, ativo: false } : x)), ...novos];
    await save('memFatos'); toast(`Importado da planilha: ${novos.length} novo(s).`); renderPanel();
  }
  function memRegistrar(id, h, dec, c) {
    const e = dec.entendi, pergunta = IA.mascarar(textoCliente(h)).slice(0, 160);
    if (!e && dec.acao !== 'humano') return null;
    const item = { id: U.uid(), t: Date.now(), intencao: e?.intencao || 'outro', origem: e?.origem || '', destino: e?.destino || '', veiculo: e?.veiculo || '', carroceria: e?.carroceria || '', carga: e?.carga || '', peso: e?.peso || '',
      resultado: dec.acao === 'humano' ? 'humano' : dec.acao === 'ignorar' ? 'ignorou' : (e?.resultado || 'outro'), motivo: dec.acao === 'humano' ? dec.motivo : '', pergunta,
      msIA: dec.ms ?? null, clienteS: dec.tempos?.clienteS ?? null, esperaS: null };
    S.memDemanda = [item, ...(S.memDemanda || [])].slice(0, 500); save('memDemanda'); // a linha da planilha só sai em memFinalizar (depois de saber quanto o cliente esperou)
    if (c.lembrarPerfil && e) { const p = IA.atualizarPerfil(S.memPerfis?.[id], e); if (p) { S.memPerfis = { ...(S.memPerfis || {}), [id]: p }; save('memPerfis'); } }
    // todo repasse para você vira uma espera cronometrada; só os que têm uma pergunta de verdade podem virar aprendizado
    if (dec.acao === 'humano' && !dec.erroIA) { S.memPend = { ...(S.memPend || {}), [id]: { t: Date.now(), p: pergunta, motivo: String(dec.motivo || '').slice(0, 120), aprender: !!pergunta && !/^o cliente falou/.test(dec.motivo || '') } }; save('memPend'); }
    return { item, inicioMs: dec.tempos?.inicioMs || null };
  }
  // Depois da ação: calcula quanto o cliente esperou até receber a resposta (ou a sugestão ficar pronta), completa o registro e manda a linha à planilha.
  function memFinalizar(ref, id, c) {
    if (!ref) return;
    const { item, inicioMs } = ref, envio = atend.envioT.get(id);
    if (inicioMs && envio && envio >= item.t - 1) item.esperaS = Math.max(0, Math.round((envio - inicioMs) / 1000));
    else if (inicioMs && c.modo === 'sugerir' && item.resultado !== 'humano' && item.resultado !== 'ignorou') item.esperaS = Math.max(0, Math.round((Date.now() - inicioMs) / 1000));
    // o painel recarrega a lista do armazenamento como CÓPIAS novas: atualiza pelo id (mexer no objeto antigo perdia o tempo no registro local)
    S.memDemanda = (S.memDemanda || []).map((o) => (o.id === item.id ? { ...o, esperaS: item.esperaS } : o)); save('memDemanda');
    memEnfileirar('IA - Demanda', IA.linhaDemanda(item));
  }
  function memTempoRegistrar(o) {
    const reg = { t: Date.now(), ...o };
    S.memTempos = [reg, ...(S.memTempos || [])].slice(0, 300); save('memTempos');
    memEnfileirar('IA - Tempos', IA.linhaTempo(reg));
  }
  // Você respondeu numa conversa que a IA passou para você: a pergunta + a sua resposta viram uma SUGESTÃO de aprendizado (pendente).
  function memCapturaHumano(id, d) {
    const pend = S.memPend?.[id];
    if (!pend) return;
    const limpo = () => { const x = { ...S.memPend }; delete x[id]; S.memPend = x; save('memPend'); };
    const dt = (Date.now() - pend.t) / 1000;
    if (dt > 3 * 3600) return limpo();
    if (!pend.tempo) { // 1ª fala SUA depois do repasse: quanto você demorou
      memTempoRegistrar({ quem: 'Atendente', medida: 'respondeu depois do repasse', s: dt, detalhe: pend.motivo || '' });
      S.memPend = { ...S.memPend, [id]: { ...pend, tempo: true } }; save('memPend');
    }
    if (!pend.aprender) return limpo();
    const r = IA.mascarar(String(d.body || '').trim()).slice(0, 600);
    if (d.tipo !== 'chat' || r.length < 12) return; // "ok", "bom dia"… não ensinam nada: espera a próxima fala
    memSugerir({ tipo: 'faq', p: pend.p, r, motivo: 'você respondeu depois que a IA passou o caso', fonte: 'humano' }); limpo();
  }
  function memSugerir(it) {
    const k = (x) => String(x.p || x.texto || '').toLowerCase().replace(/\W+/g, ' ').trim();
    if ([...(S.memSug || []), ...(S.memFatos || [])].some((x) => k(x) === k(it))) return false;
    S.memSug = [{ id: U.uid(), t: Date.now(), ...it }, ...(S.memSug || [])].slice(0, 60); save('memSug'); renderSeguro(); return true;
  }
  async function memAprovar(it) {
    let { tipo, p, r, texto } = it;
    if (tipo === 'duvida') { r = await perguntar(`Qual é a resposta para: "${p}"?`, ''); if (!r || !r.trim()) return; tipo = 'faq'; r = r.trim(); }
    const fato = { id: it.id, tipo, p, r, texto, t: Date.now(), fonte: it.fonte, ativo: true, sync: !!atendC().planilhaAprende };
    S.memFatos = [...(S.memFatos || []), fato]; S.memSug = S.memSug.filter((x) => x.id !== it.id);
    await save('memFatos'); await save('memSug');
    memEnfileirar('IA - Aprendizado', IA.linhaAprendizado(fato, 'aprovado')); memEnfileirar('IA - Memória', IA.linhaMemoria(fato));
    toast('Aprendido: a IA já usa isso nas próximas respostas.'); renderPanel();
  }
  async function memEditar(it) {
    const novo = { ...it };
    if (it.tipo === 'faq' || it.tipo === 'duvida') { const r = await perguntar(`Resposta para: "${it.p}"`, it.r || ''); if (r == null) return; novo.r = r.trim(); if (it.tipo === 'duvida' && novo.r) novo.tipo = 'faq'; }
    else { const t = await perguntar('Texto da regra:', it.texto || ''); if (t == null) return; novo.texto = t.trim(); }
    S.memSug = S.memSug.map((x) => (x.id === it.id ? novo : x)); await save('memSug'); renderPanel();
  }
  async function memRejeitar(it) {
    S.memSug = S.memSug.filter((x) => x.id !== it.id); await save('memSug');
    memEnfileirar('IA - Aprendizado', IA.linhaAprendizado(it, 'rejeitado')); renderPanel();
  }
  async function memAlternar(f) {
    const novo = { ...f, ativo: f.ativo === false };
    S.memFatos = S.memFatos.map((x) => (x.id === f.id ? novo : x)); await save('memFatos');
    memEnfileirar('IA - Memória', IA.linhaMemoria(novo)); renderPanel();
  }
  async function memExcluir(f) {
    if (!await confirmar('Apagar esta memória? A IA deixa de usá-la.')) return;
    const novo = { ...f, ativo: false }; S.memFatos = S.memFatos.filter((x) => x.id !== f.id); await save('memFatos'); if (f.auto) conhecDesfeita(1);
    memEnfileirar('IA - Memória', IA.linhaMemoria(novo)); renderPanel();
  }
  // "Aprender com o dia": a IA lê um resumo ANÔNIMO das últimas 24 h e PROPÕE aprendizados (você decide).
  async function memAprenderDoDia() {
    if (!iaPronta()) return toast(SEM_IA, 6000);
    const desde = Date.now() - 86400000, oc = (S.memDemanda || []).filter((o) => o.t >= desde);
    if (!oc.length) return toast('Ainda não há atendimentos nas últimas 24 horas para analisar.', 5000);
    memSt.aprendendo = true; renderPanel();
    const todos = [...(S.memFatos || []), ...(S.memSug || [])];
    const entrada = IA.entradaAprendizado({ ocorrencias: oc, resumo: IA.agregarDemanda(oc, desde), memoria: IA.memoriaParaPrompt(todos, 2500) });
    const r = await iaPedir({ op: 'gerar', json: true, temperatura: 0.2, sistema: IA.promptAprendizado(), contents: [{ role: 'user', parts: [{ text: entrada }] }] });
    memSt.aprendendo = false;
    if (r.erro) { toast(r.erro, 6000); return renderPanel(); }
    const novas = IA.validarSugestoes(IA.extrairJson(r.texto), todos);
    novas.forEach((x) => memSugerir(x));
    toast(novas.length ? `A IA propôs ${novas.length} aprendizado(s): veja em "Para você decidir".` : 'A IA não encontrou nada novo e claro para aprender hoje.', 6000); renderPanel();
  }
  // ----- Escuta automática e banco de conhecimento (v1.43) -----
  // De tempos em tempos lê as conversas INDIVIDUAIS recentes, tira as trocas "cliente perguntou → VOCÊ respondeu" (nunca o que o robô enviou), mascara dados pessoais e guarda no banco (aqui e,
  // se a planilha estiver ligada e o script novo colado, na aba "IA - Conversas"). O banco é só CONHECIMENTO BRUTO: o robô NÃO usa nada daqui. Uma vez por dia (ou no botão) a IA lê o banco e
  // PROPÕE o que vale virar regra → vai para "Para você decidir" e só vale depois do seu OK. Preço, data, placa e telefone nunca viram regra.
  const conhecCfg = () => ({ ligado: false, aceitou: false, intervaloMin: 60, auto: true, aprovacao: 'manual', minVezes: 3, ...(S.conhecCfg || {}) });
  const cs = { lendo: false, consolidando: false, scriptV: null };
  async function conhecScriptOk(min = 4) {   // o script da planilha precisa ser a versão 4 (aba "IA - Conversas"); o antigo recusaria a aba e travaria a fila
    const tok = S.iaCfg?.tokenPlanilha || '';
    if (!atendC().planilhaAprende || !S.cargasUrl || !tok) return false;
    if (cs.scriptV == null || cs.scriptV < min) { const r = await chrome.runtime.sendMessage({   // confere de novo enquanto estiver antigo: colou o script novo, a próxima leitura já percebe
 tipo: 'planilhaEscrever', url: S.cargasUrl, token: tok, aba: 'ping', linhas: [] }).catch(() => null); cs.scriptV = r?.ok ? (Number(r.versao) || 0) : null; }
    return cs.scriptV != null && cs.scriptV >= min;
  }
  async function conhecSalvar(mud) { S.conhecCfg = { ...conhecCfg(), ...mud }; await save('conhecCfg'); renderPanel(); }
  async function conhecLigar(on) {
    if (on && !conhecCfg().aceitou) {
      if (!await confirmar('Escutar as suas conversas e guardar o conhecimento?\n\nDe tempos em tempos o AtendeZap vai LER as suas conversas individuais (sem grupos) e guardar, sem telefones, CPF nem e-mails, o que o cliente perguntou e o que VOCÊ respondeu. Isso fica neste computador e, se você ligou a planilha, também na sua planilha. O robô NÃO usa nada disso sozinho: uma vez por dia a IA do Google (com a SUA chave) lê o banco e PROPÕE regras, e só valem as que você aprovar. Respostas do próprio robô nunca entram. Em teste.', { ok: 'Entendi, ligar' })) { renderPanel(); return; }
      await conhecSalvar({ ligado: true, aceitou: true }); setTimeout(() => conhecEscutar(true), 800); return;
    }
    await conhecSalvar({ ligado: !!on });
  }
  async function conhecEscutar(forcar) {
    const c = conhecCfg(); if (!c.ligado || !ligado('escuta') || !S.ready || cs.lendo) return;
    const est = S.conhecEstado || {}, agora = Date.now();
    if (!forcar && agora - (est.ultimo || 0) < c.intervaloMin * 60000) return;
    cs.lendo = true; if (forcar) renderPanel();
    try {
      const dias = est.ultimo ? Math.min(14, Math.max(1, Math.ceil((agora - est.ultimo) / 864e5))) : 7;
      const lido = await call('conversasParaTreino', dias, 40, 80), marcas = S.atendEnv || [], vistos = new Set(S.conhecVistos || []), banco = [...(S.conhecBanco || [])], novos = []; let volateis = 0;
      for (const ch of lido.chats || []) {
        const hc = hash32(ch.id), meus = marcas.filter((m) => m.h === hc), ehRobo = (m) => meus.some((x) => m.t * 1000 >= x.t - 5000 && m.t * 1000 <= x.t + 150000);
        for (const par of AZTREINO.extrairPares(ch.msgs, { ehRobo })) {
          const chave = hc + ':' + par.t; if (vistos.has(chave)) continue; vistos.add(chave);
          const pq = IA.mascarar(par.p), rs = IA.mascarar(par.r); if (AZTREINO.ehVolatil(rs)) { volateis++; continue; }   // resposta com preço, data, placa ou telefone não ensina nada: nem entra
          const k = hash32(AZTREINO.norm(pq) + '|' + AZTREINO.norm(rs)), ex = banco.find((b) => b.k === k);
          if (ex) { ex.n = (ex.n || 1) + 1; ex.t = Math.max(ex.t, par.t * 1000); if (!(ex.chs || []).includes(hc)) ex.chs = [...(ex.chs || []), hc].slice(0, 12); }
          else { const e = { id: U.uid(), k, p: pq, r: rs, t: par.t * 1000, n: 1, env: false, chs: [hc] }; banco.unshift(e); novos.push(e); }
        }
      }
      const refino = AZTREINO.refinar(banco, { agora }), guardado = refino.banco;   // regras de refinamento: junta parecidas, tira curtas e velhas de 1 vez só, mantém o teto
      if (await conhecScriptOk()) for (const e of guardado.filter((x) => !x.env).slice(0, 150)) { memEnfileirar('IA - Conversas', IA.linhaConversa(e)); e.env = true; }   // também as antigas que ainda não foram para a planilha
      S.conhecBanco = guardado; S.conhecVistos = [...vistos].slice(-4000); S.conhecEstado = { ...est, ultimo: agora, lidas: lido.lidas || 0, ultimosNovos: novos.length, refino: { ...refino.resumo, volateis: refino.resumo.volateis + volateis } };
      await save('conhecBanco'); await save('conhecVistos'); await save('conhecEstado');
      if (forcar) toast(`Li ${lido.lidas || 0} conversa(s): ${novos.length} troca(s) nova(s) guardada(s) no banco.`, 6000);
      if (c.auto) conhecConsolidar(false);
    } catch (e) { if (forcar) toast('Não consegui ler as conversas: ' + String(e?.message || e).slice(0, 120), 6000); }
    finally { cs.lendo = false; renderSeguro(); }
  }
  const memChave = (x) => String(x.p || x.texto || '').toLowerCase().replace(/\W+/g, ' ').trim();
  async function memAprovarAuto(it) {   // vai direto para a memória que o robô USA (com Desfazer); só chega aqui o que as suas respostas reais provam
    if ([...(S.memSug || []), ...(S.memFatos || [])].some((y) => memChave(y) === memChave(it))) return false;
    const fato = { id: U.uid(), tipo: it.tipo, p: it.p, r: it.r, texto: it.texto, t: Date.now(), fonte: 'conversas', auto: true, evid: it.motivo || '', ativo: true, sync: !!atendC().planilhaAprende };
    S.memFatos = [...(S.memFatos || []), fato]; await save('memFatos');
    memEnfileirar('IA - Aprendizado', IA.linhaAprendizado(fato, 'aprovado automaticamente')); memEnfileirar('IA - Memória', IA.linhaMemoria(fato));
    return true;
  }
  async function conhecDesfeita(n) {   // desfez aprendizado automático: 3 numa semana = a IA está errando, volta para o manual
    const e = S.conhecEstado || {}, lim = Date.now() - 7 * 864e5, lista = [...(e.desfeitas || []).filter((t) => t > lim), ...new Array(n).fill(Date.now())];
    S.conhecEstado = { ...e, desfeitas: lista }; await save('conhecEstado');
    if (lista.length >= 3 && conhecCfg().aprovacao === 'automatica') { await conhecSalvar({ aprovacao: 'manual' }); toast('Você desfez 3 aprendizados automáticos nesta semana: voltei para a aprovação MANUAL.', 9000); }
  }
  async function conhecDesfazerAuto() {
    const alvo = (S.memFatos || []).filter((f) => f.auto && f.t >= Date.now() - 864e5);
    if (!alvo.length) return toast('Nenhum aprendizado automático nas últimas 24 horas.', 4000);
    if (!await confirmar(`Desfazer ${alvo.length} aprendizado(s) automático(s) das últimas 24 horas?\n\nO robô deixa de usá-los.`, { ok: 'Desfazer' })) return;
    S.memFatos = S.memFatos.filter((f) => !alvo.some((a) => a.id === f.id)); await save('memFatos');
    for (const f of alvo) memEnfileirar('IA - Memória', IA.linhaMemoria({ ...f, ativo: false }));
    await conhecDesfeita(alvo.length); renderPanel();
  }
  async function conhecAprovacao(v) {
    if (v === 'automatica' && !await confirmar('Ligar a aprovação automática?\n\nA IA passa a colocar sozinha, na memória que o robô USA, perguntas e respostas que as suas próprias conversas provam (3 vezes ou mais, em 2 conversas ou mais, sempre com a resposta que VOCÊ mais deu e sem contradição). Dá para desfazer; e se você desfizer 3 numa semana eu volto para o manual. Em teste.', { ok: 'Ligar' })) { renderPanel(); return; }
    await conhecSalvar({ aprovacao: v });
  }
  async function conhecConsolidar(manual) {
    if (cs.consolidando) return;
    if (!iaPronta()) { if (manual) toast(SEM_IA, 6000); return; }
    const est = S.conhecEstado || {}, banco = S.conhecBanco || [], c = conhecCfg();
    if (manual && banco.length < 3) return toast('Ainda há poucas trocas no banco para consolidar (preciso de pelo menos 3).', 6000);
    if (!manual && (Date.now() - (est.consolidado || 0) < 864e5 || banco.filter((b) => b.t > (est.consolidado || 0)).length < 15)) return;   // automático: no máx. 1 vez por dia e só com novidade
    cs.consolidando = true; if (manual) renderPanel();
    try {
      const clusters = AZTREINO.agrupar(banco), todos = [...(S.memFatos || []), ...(S.memSug || [])], amostra = clusters.slice(0, 80).map((k) => ({ p: k.p, r: k.dominante.r, n: k.n, chats: k.chats }));
      const r = await iaPedir({ op: 'gerar', json: true, temperatura: 0.2, sistema: AZTREINO.PROMPT, contents: [{ role: 'user', parts: [{ text: AZTREINO.entrada(amostra, IA.memoriaParaPrompt(todos, 2500), IA.mascarar) }] }] });
      if (r.erro) { if (manual) toast(r.erro, 6000); return; }
      const brutas = IA.validarSugestoes(IA.extrairJson(r.texto), todos).map((x) => ({ ...x, fonte: 'conversas' })), { mantidas, descartadas } = AZTREINO.filtrarVolatil(brutas);
      const hoje = new Date().toISOString().slice(0, 10), usadas = est.autoDia?.dia === hoje ? est.autoDia.n : 0; let sozinho = 0, paraVoce = 0;
      for (const x of mantidas) {
        const d = AZTREINO.decidir(x, clusters, { minVezes: c.minVezes }), prova = d.evidencia ? ` · ${d.evidencia}` : '';
        if (c.aprovacao === 'automatica' && d.modo === 'automatica' && usadas + sozinho < 10) { if (await memAprovarAuto({ ...x, motivo: (x.motivo || '') + prova })) sozinho++; }   // no máx. 10 por dia
        else if (memSugerir({ ...x, motivo: `${x.motivo || ''}${prova}${c.aprovacao === 'automatica' && d.modo === 'manual' ? ` · ficou para você: ${d.motivo}` : ''}` })) paraVoce++;
      }
      S.conhecEstado = { ...(S.conhecEstado || {}), consolidado: Date.now(), autoDia: { dia: hoje, n: usadas + sozinho }, proposta: { sozinho, paraVoce, descartadas: descartadas.map((d) => d.descarte) } }; await save('conhecEstado');
      const desc = descartadas.length ? ` (${descartadas.length} descartada(s): tinham preço, data, placa ou telefone)` : '';
      toast(sozinho || paraVoce ? `${sozinho ? `A IA aprendeu ${sozinho} sozinha, com prova das suas respostas. ` : ''}${paraVoce ? `${paraVoce} ficou(aram) para você decidir em "Para você decidir".` : ''}${desc}` : descartadas.length ? `Nada para propor${desc}.` : 'A IA não encontrou nada novo, claro e repetido nas conversas.', 9000);
    } finally { cs.consolidando = false; renderSeguro(); }
  }
  async function conhecEsquecer() {
    if (!await confirmar('Esquecer o banco de conhecimento deste computador?\n\nO que já foi para a planilha (aba "IA - Conversas") continua lá; e as regras que você aprovou continuam valendo.', { ok: 'Esquecer' })) return;
    S.conhecBanco = []; S.conhecVistos = []; S.conhecEstado = {}; await save('conhecBanco'); await save('conhecVistos'); await save('conhecEstado'); renderPanel();
  }
  const conhecCard = () => {
    if (!ligado('escuta')) return null;
    const c = conhecCfg(), est = S.conhecEstado || {}, banco = S.conhecBanco || [], hora = (ms) => (ms ? new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'), planOn = !!atendC().planilhaAprende && !!S.cargasUrl;
    return h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, 'Banco de conhecimento 🧪 (escuta automática)')),
      h('p', { class: 'hint' }, 'Ligado, o AtendeZap lê de tempos em tempos as suas conversas individuais e guarda no banco, sem dados pessoais, o que o cliente perguntou e o que VOCÊ respondeu. O robô NÃO usa isso sozinho: uma vez por dia a IA propõe o que vale virar regra e você aprova em "Para você decidir". Respostas do próprio robô nunca entram. Só lê com o WhatsApp Web aberto.'),
      h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: c.ligado, onchange: (e) => conhecLigar(e.target.checked) }), 'Escutar e guardar automaticamente'),
      c.ligado ? [
        h('small', { class: 'hint' }, `${banco.length} troca(s) no banco · última leitura: ${hora(est.ultimo)}${est.ultimosNovos != null ? ` (${est.ultimosNovos} nova(s))` : ''} · última consolidação: ${hora(est.consolidado)}`),
        h('small', { class: 'hint' }, !planOn ? 'Fica só neste computador. Para gravar também na planilha, ligue "Gravar o aprendizado na planilha" mais abaixo.' : cs.scriptV != null && cs.scriptV < 4 ? '⚠ O script da planilha está antigo: cole o AtendeZap.gs novo para o banco também ser gravado nela (aba "IA - Conversas"). Por enquanto fica só aqui.' : 'Também gravado na planilha (aba "IA - Conversas").'),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: c.auto, onchange: (e) => conhecSalvar({ auto: e.target.checked }) }), 'A IA consolidar sozinha, no máximo uma vez por dia'),
        h('label', { class: 'lb' }, 'Aprovação do que a IA aprende', h('select', { class: 'in', onchange: (e) => conhecAprovacao(e.target.value) }, [['manual', 'Manual: eu decido tudo em "Para você decidir"'], ['automatica', 'Automática: só o que as minhas respostas provam']].map(([v, t]) => h('option', { value: v, selected: c.aprovacao === v }, t)))),
        c.aprovacao === 'automatica' ? h('small', { class: 'hint' }, `Só aprova sozinha PERGUNTA E RESPOSTA que apareceu ${c.minVezes}+ vezes, em 2+ conversas, com a mesma resposta em 70%+ das vezes e que seja a que VOCÊ mais deu (nunca uma inventada). Vocabulário e regras sempre ficam para você. No máximo 10 por dia. Hoje: ${est.autoDia?.dia === new Date().toISOString().slice(0, 10) ? est.autoDia.n : 0} · no total: ${(S.memFatos || []).filter((f) => f.auto).length}.`) : null,
        est.refino ? h('small', { class: 'hint' }, `Refinamento: ${est.refino.volateis || 0} com preço/data/placa/telefone ignorada(s) · ${est.refino.curtos || 0} curta(s) · ${est.refino.mesclados || 0} parecida(s) juntada(s) · ${est.refino.vencidos || 0} velha(s) removida(s).`) : null,
        h('div', { class: 'rowf' }, h('button', { class: 'gbtn sm', disabled: cs.lendo, onclick: () => conhecEscutar(true) }, cs.lendo ? 'Lendo…' : '👂 Ler agora'),
          h('button', { class: 'obtn', disabled: cs.consolidando || banco.length < 3, onclick: () => conhecConsolidar(true) }, cs.consolidando ? 'Analisando…' : '🧠 Consolidar com a IA'), (S.memFatos || []).some((f) => f.auto) ? h('button', { class: 'obtn', onclick: conhecDesfazerAuto }, '↩ Desfazer os automáticos de hoje') : null, banco.length ? h('button', { class: 'obtn dan', onclick: conhecEsquecer }, 'Esquecer o banco') : null),
      ] : null);
  };
  const MEM_ROT = { faq: '❓ Pergunta e resposta', fato: '📌 Regra / fato', vocab: '🗣️ Vocabulário', duvida: '🙋 Pergunta para você responder' };
  function memoriaView() {
    const c = atendC(), sug = S.memSug || [], fatos = S.memFatos || [], dem = IA.agregarDemanda(S.memDemanda || [], Date.now() - memSt.janela * 86400000), tm = IA.agregarTempos(S.memDemanda || [], S.memTempos || [], Date.now() - memSt.janela * 86400000);
    const fila = (S.memFila || []).length, sy = memSt.sync, perfis = Object.keys(S.memPerfis || {}).length;
    const topo = (titulo, lista) => (lista.length ? h('div', { class: 'dem' }, h('b', { class: 'abt' }, titulo), lista.map((x) => h('small', null, `${x.rotulo}: ${x.n}${x.semCarga ? ` (${x.semCarga} sem carga)` : ''}`))) : null);
    return [
      h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, 'Como a IA aprende')),
        h('p', { class: 'hint' }, 'A IA acompanha o atendimento: anota o que as pessoas procuram (origem, destino, veículo, carga) e guarda os casos que passou para você, junto com o que VOCÊ respondeu. Só vira memória, e só passa a valer nas respostas, o que você aprovar aqui. O que um cliente escreve nunca ensina a IA sozinho.'),
        h('div', { class: 'rowf' }, h('button', { class: 'gbtn sm', disabled: memSt.aprendendo, onclick: memAprenderDoDia }, memSt.aprendendo ? 'Analisando…' : '🧠 Aprender com o dia'))),
      conhecCard(),
      sug.length ? h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, `Para você decidir (${sug.length})`)),
        sug.map((it) => h('div', { class: 'card pedplano' }, h('div', { class: 'grow' }, h('b', null, MEM_ROT[it.tipo] || it.tipo),
          it.tipo === 'faq' || it.tipo === 'duvida' ? [h('small', null, `Pergunta: ${it.p}`), it.r ? h('small', { class: 'iaprop' }, it.r) : h('small', { class: 'iaav' }, 'Falta a resposta: clique em Aprovar e escreva.')] : h('small', { class: 'iaprop' }, it.texto),
          h('small', null, `${it.motivo || ''}${it.fonte ? ' · ' + ({ humano: 'sua resposta', ia: 'sugestão da IA', planilha: 'planilha', conversas: 'suas conversas reais' }[it.fonte] || it.fonte) : ''}`),
          h('div', { class: 'rowf' }, h('button', { class: 'gbtn sm', onclick: () => memAprovar(it) }, 'Aprovar'), h('button', { class: 'obtn', onclick: () => memEditar(it) }, 'Editar'), h('button', { class: 'obtn', onclick: () => memRejeitar(it) }, 'Rejeitar')))))) : null,
      h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, 'O que as pessoas procuram'),
        h('select', { class: 'in', style: 'width:auto;flex:none', onchange: (e) => { memSt.janela = +e.target.value; renderPanel(); } }, [[1, 'Hoje'], [7, '7 dias'], [30, '30 dias']].map(([v, t]) => h('option', { value: v, selected: memSt.janela === v }, t)))),
        dem.total ? [h('small', null, `${dem.total} atendimento(s) · ${dem.semCarga} sem carga · ${dem.humano} passados para você`), topo('Rotas mais procuradas', dem.rotas), topo('Veículos', dem.veiculos), topo('Carrocerias', dem.carrocerias), topo('Cargas', dem.cargas)]
          : h('p', { class: 'hint' }, 'Ainda não há atendimentos neste período. Ligue o Atendente IA para a IA começar a anotar.')),
      h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, 'Tempos de resposta')),
        h('small', { class: 'hint' }, 'Mostra o valor do meio (mediana), que um caso extremo não distorce, e o "pior 1 em cada 10". O número ao lado é quantos atendimentos foram medidos.'),
        [['🤖 A IA levou para decidir', tm.ia], ['⏱️ O cliente esperou até receber a resposta', tm.espera], ['💬 O cliente demorou a responder', tm.cliente], ['🙋 Você respondeu depois do repasse', tm.humano]].map(([rot, st]) => h('div', { class: 'prow' }, h('span', { class: 'grow' }, rot, st ? h('small', { class: 'mut' }, `pior 1 em 10: ${IA.duracao(st.p90)} · ${st.n} medido(s)`) : null),
          st ? h('b', null, IA.duracao(st.mediana)) : h('small', { class: 'mut' }, 'sem dados ainda'))),
        tm.falhasIA ? h('small', { class: 'iaav' }, `⚠ A IA falhou ${tm.falhasIA} vez(es) neste período.`) : null),
      h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, `Memória aprovada (${fatos.length})`)),
        h('p', { class: 'hint' }, 'Isto a IA já usa nas respostas. Desligue ou apague o que estiver errado.'),
        fatos.length ? fatos.map((f) => h('div', { class: 'card pedplano' }, h('div', { class: 'grow' }, h('small', { class: f.ativo === false ? 'mut' : '' }, f.tipo === 'faq' ? `Se perguntarem "${f.p}": ${f.r}` : f.texto), f.auto ? h('small', { class: 'iaav' }, `🤖 aprendido sozinho${f.evid ? ' · ' + f.evid : ''}`) : null),
          h('button', { class: 'ib', title: f.ativo === false ? 'Voltar a usar' : 'Parar de usar', onclick: () => memAlternar(f) }, f.ativo === false ? '▶' : '⏸'),
          h('button', { class: 'ib dan', title: 'Apagar', onclick: () => memExcluir(f) }, icon('trash', 16)))) : h('p', { class: 'hint' }, 'Nada ainda. As suas respostas depois de um repasse e as sugestões da IA aparecem em "Para você decidir".')),
      h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, 'Gravar na planilha')),
        h('p', { class: 'hint' }, 'O aprendizado também pode ficar na SUA planilha (abas "IA - Demanda", "IA - Aprendizado" e "IA - Memória"), onde a equipe vê e edita. Precisa atualizar o script da planilha uma vez (arquivo planilha/AtendeZap.gs, com instruções no topo) e escolher uma senha. A pergunta do cliente vai sem telefone/e-mail.'),
        !S.cargasUrl ? h('p', { class: 'hint dan' }, 'Falta o link da lista de frete (Atendimento › Lista de frete).') : null,
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: !!c.planilhaAprende, onchange: (e) => atendSalvar({ planilhaAprende: e.target.checked }) }), 'Gravar o aprendizado na planilha'),
        h('label', { class: 'lb' }, 'Senha da planilha (a mesma do TOKEN_IA no script)', h('input', { class: 'in', type: 'password', autocomplete: 'off', value: S.iaCfg?.tokenPlanilha || '', onchange: (e) => { S.iaCfg = { ...S.iaCfg, tokenPlanilha: e.target.value.trim() }; save('iaCfg'); } })),
        h('div', { class: 'rowf' }, h('button', { class: 'obtn', onclick: memTestarPlanilha }, 'Testar conexão'),
          h('button', { class: 'obtn', disabled: !fila, onclick: memSincronizar }, `Enviar agora (${fila} na fila)`),
          h('button', { class: 'obtn', disabled: memSt.importando, onclick: memImportar }, memSt.importando ? 'Importando…' : 'Importar memória da planilha')),
        (memSt.scriptAntigo || memSt.avisoScript) ? h('small', { class: 'iaav' }, '⚠ O script da planilha está desatualizado: cole o AtendeZap.gs novo (Apps Script) para gravar também os tempos de resposta.') : null,
        sy.ok != null ? h('small', { class: sy.ok ? 'hint' : 'dan' }, sy.ok ? `✔ Planilha conectada (${new Date(sy.t).toLocaleTimeString('pt-BR')})` : `✖ ${sy.erro}`) : null),
      c.lembrarPerfil ? h('div', { class: 'sec' }, h('div', { class: 'sh' }, h('b', { class: 'grow' }, `Perfis de motoristas lembrados (${perfis})`)),
        h('small', null, 'Veículo, carroceria, carga e regiões que cada contato mencionou. Ficam só neste navegador (não vão para a planilha).'),
        perfis ? h('div', { class: 'rowf' }, h('button', { class: 'obtn', onclick: async () => { if (await confirmar('Apagar todos os perfis lembrados?')) { S.memPerfis = {}; save('memPerfis'); renderPanel(); } } }, 'Apagar todos os perfis')) : null) : null,
    ];
  }

  // ===================== DIAGNÓSTICO =====================
  // Registro de verificações. Para uma função nova:
  //   1) acrescente-a em FEATURES (com as funções da wa-js que ela usa; a ponte precisa listá-las em diag().fnMap);
  //   2) registre verificações com addCheck('Grupo', 'Nome', async (ctx) => ({ ok: true|false|'warn', d }), acao, ['Função']).
  // ok=false (✖) = quebrado de verdade (dispara o aviso automático); 'warn' (⚠) = atenção, não dispara.
  // ctx = { br: diag da ponte, probe: testes ao vivo, dom: seletores achados, dados: storage, bytes, ping }
  const FEATURES = {
    'Respostas rápidas': ['chat.sendTextMessage', 'chat.sendFileMessage', 'chat.sendVCardContactMessage', 'chat.markIsComposing', 'chat.markIsRecording'],
    'Assinatura': ['chat.setInputText', 'chat.sendTextMessage'],
    'Iniciar conversa': ['contact.queryExists', 'chat.openChatBottom', 'chat.find'],
    'Enviar para vários': ['chat.list', 'chat.sendFileMessage', 'chat.sendTextMessage'],
    'Status': ['status.sendTextStatus', 'status.sendImageStatus', 'status.sendVideoStatus', 'status.getMyStatus', 'interno.apagarStatus'],
    'Fixar': ['chat.find', 'chat.getActiveChat'],
    'Etiquetas': ['labels.getAllLabels', 'labels.addOrRemoveLabels', 'profile.isBusiness'],
    'Tema': ['conn.setTheme'],
    'Vagas nos grupos': ['group.getGroupSizeLimit', 'group.ensureGroup', 'chat.find'],
    'Grupos só na aba Grupos': ['loader.search'],
    'Atendente IA': ['chat.getMessages', 'chat.sendTextMessage', 'chat.markIsComposing'], // (setInputText só serve ao botão opcional "Colocar no campo"; quem depende dele é a Assinatura)
    'Pedidos de grupos': ['group.getMembershipRequests', 'group.approve', 'group.reject', 'group.getParticipants', 'group.iAmAdmin', 'group.removeParticipants', 'group.ensureGroup', 'group.addParticipants', 'group.getInviteCode', 'group.setDescription', 'group.setSubject', 'group.setProperty', 'chat.sendGroupInviteMessage', 'contact.getPnLidEntry'],
    'Itens especiais': ['chat.sendPixKeyMessage', 'chat.sendLocationMessage', 'chat.sendCreatePollMessage', 'chat.sendGroupInviteMessage', 'chat.getVotes', 'chat.getMessages'],
  };
  const ALL = Object.keys(FEATURES);
  // Método da ponte -> função afetada (para ler o registro de erros)
  const METHOD_FEAT = { sendText: 'Respostas rápidas', sendFile: 'Enviar para vários', sendContact: 'Respostas rápidas', sendStatus: 'Status', removeStatus: 'Status',
    myStatus: 'Status', applyPins: 'Fixar', setInputText: 'Assinatura', sendActive: 'Assinatura', startChat: 'Iniciar conversa', openChat: 'Iniciar conversa',
    setTheme: 'Tema', label: 'Etiquetas', labels: 'Etiquetas', listChats: 'Enviar para vários',
    pedidosLista: 'Pedidos de grupos', pedidosPlano: 'Pedidos de grupos', gruposLista: 'Pedidos de grupos',
    duplicadosConjunto: 'Pedidos de grupos', removerDuplicados: 'Pedidos de grupos', gruposSo: 'Grupos só na aba Grupos', historicoChat: 'Atendente IA', atendAtivo: 'Atendente IA', rascunho: 'Atendente IA', gruposAdmin: 'Pedidos de grupos', painelConjunto: 'Pedidos de grupos', conviteGrupo: 'Pedidos de grupos', enviarConvite: 'Pedidos de grupos', enviarConvites: 'Pedidos de grupos', padronizar: 'Pedidos de grupos', sendEspecial: 'Itens especiais', votosEnquete: 'Itens especiais', marcarLinhas: 'Vagas nos grupos', vagasGrupos: 'Vagas nos grupos' };
  const CHECKS = [];
  const addCheck = (grupo, nome, run, acao, funcs = []) => CHECKS.push({ grupo, nome, run, acao, funcs });
  const many = (grupo, list) => list.forEach(([n, r, a, f]) => addCheck(grupo, n, r, a, f));
  const comConversa = (br, fn) => (br.active ? fn() : { ok: 'skip', d: 'sem conversa aberta: abra uma para testar' }); // 'skip' = não testado (neutro): antes virava ⚠ e poluía 1 de cada 4 leituras

  many('Conexão', [
    ['Biblioteca do WhatsApp (wa-js)', ({ br }) => ({ ok: !!br.wppLoaded, d: br.erro || `wa-js ${br.waJs || '?'} · WhatsApp ${br.waVersion || '?'}` }), null, ALL],
    ['WhatsApp pronto', ({ br }) => ({ ok: !!(br.ready && S.ready), d: br.ready ? (S.ready ? '' : 'pronto na página, mas a extensão não recebeu o aviso') : 'a extensão não conseguiu conectar ao WhatsApp' }), null, ALL],
    ['Resposta da ponte', ({ ping }) => ({ ok: ping == null ? false : ping < 800 ? true : 'warn', d: ping == null ? 'sem resposta' : ping + ' ms' }), null, ALL],
    ['Conversa aberta', ({ br }) => ({ ok: br.active ? true : 'skip', d: br.active || 'abra uma conversa para testar tudo' })],
    ['Conta Business (etiquetas)', ({ br }) => ({ ok: br.business ? true : 'warn', d: br.business ? 'sim' : 'não: ações de etiqueta ficam indisponíveis' }), null, ['Etiquetas']],
  ]);
  const DOM_INFO = {
    footer: ['Rodapé da conversa', ['Assinatura']], composer: ['Campo de mensagem', ['Assinatura', 'Respostas rápidas']],
    header: ['Cabeçalho da conversa', ['Fixar']], send: ['Botão enviar', ['Assinatura']],
  };
  for (const k of Object.keys(SEL)) {
    const [nome, funcs] = DOM_INFO[k] || [k, []];
    addCheck('Tela do WhatsApp', nome, ({ dom, br }) => comConversa(br, () => {
      if (k === 'send' && dom.composer && !readText(composer()).trim()) return { ok: true, d: 'o botão só existe quando há texto no campo (normal com o campo vazio)' };
      if (k === 'send' && !dom.send) return { ok: 'warn', d: 'não achado: a assinatura envia pela wa-js (sem manter a resposta citada)' };
      return { ok: !!dom[k], d: dom[k] || 'nenhum seletor funcionou: o WhatsApp mudou a tela' };
    }), null, funcs);
  }
  // A extensão (ou o WhatsApp) pode quebrar o layout: rodapé tem que estar embaixo e as mensagens com altura
  addCheck('Tela do WhatsApp', 'Abas da lista (Todas/Grupos)', () => {
    const a = abaAtual();
    return a ? { ok: true, d: `aba atual: ${a} · ${descAbas()}` } : { ok: 'warn', d: `não identifiquei a aba ativa (fixadas por aba valem em todas): ${descAbas()}` };
  }, null, ['Fixar']);
  addCheck('Atendente IA', 'Funcionamento do robô', async () => {
    const c = atendC();
    if (!ligado('atendente') || c.modo === 'desligado') return { ok: true, d: 'desligado' };
    const st = atendEstadoRobo(), n = atendPausasAtivas().length;
    return st.ok ? { ok: true, d: `ligado (${c.modo}); IA ${atendUsoHoje()}/${S.iaCfg?.limiteDia || 100} hoje; ${n} conversa(s) pausada(s); última mensagem recebida ${atend.ultEvento ? 'há ' + Math.round((Date.now() - atend.ultEvento) / 60000) + ' min' : 'nenhuma desde que a página abriu'}` } : { ok: 'warn', d: st.problemas.join('; ') };
  }, null, ['Atendente IA']);
  addCheck('Tela do WhatsApp', 'Grupos só na aba Grupos', async () => {
    if (!ligado('gruposSo')) return { ok: true, d: 'desligado em Configurações' };
    if (!gs.estado) return { ok: 'warn', d: 'a regra ainda não foi aplicada (a ponte ainda não respondeu)' };
    if (!gs.estado.ok) return { ok: false, d: 'não consegui aplicar a regra no WhatsApp: ' + (gs.estado.motivo || 'motivo desconhecido') };
    const a = abaAtual();
    if (a !== 'todas' && a !== 'naolidas' && a !== 'favoritas') return { ok: true, d: `regra instalada; não age nesta aba (${a || 'sem abas / lista própria'})` };
    if (gs.cfg?.busca) return { ok: true, d: 'regra instalada; há texto na busca (mostra tudo)' };
    const n = document.querySelectorAll('#pane-side [data-az-chat$="@g.us"]').length;
    const uj = gs.ultJanela && Date.now() - gs.ultJanela.t < 600000 ? ` · última janela: "${gs.ultJanela.rotulo}" → pausa: ${gs.ultJanela.pausa}` : '';
    return n ? { ok: 'warn', d: `regra instalada, mas ainda há ${n} grupo(s) na lista: o WhatsApp pode ter mudado o filtro (aba: ${a}; reaplicada ${gs.rea.n}×)${uj}` } : { ok: true, d: `regra ativa na aba ${a}: nenhum grupo na lista${uj}` };
  }, null, ['Grupos só na aba Grupos']);
  addCheck('Tela do WhatsApp', 'Vagas nos grupos (linhas da lista)', async () => {
    if (!ligado('vagas')) return { ok: true, d: 'desligado em Configurações' };
    const r = await call('marcarLinhas');
    if (!r.linhas) return { ok: 'warn', d: 'nenhuma linha na lista agora' };
    return { ok: r.fiber + r.nome ? (r.semId ? 'warn' : true) : false,
      d: `${r.linhas} linhas · ${r.fiber} pelo React · ${r.nome} pelo nome único · ${r.semId} sem identificar` + (r.semId && r.amostra ? ` · props: ${r.amostra}` : '') };
  }, null, ['Vagas nos grupos']);
  addCheck('Tela do WhatsApp', 'Lista nativa do "/" (respostas rápidas do Business)', () => (nat.dica
    ? { ok: 'warn', d: `apareceu algo acima do campo ao digitar "/" e não consegui esconder: ${nat.dica}` }
    : { ok: true, d: nat.total ? `escondida ${nat.total} vez(es) enquanto a lista do AtendeZap estava aberta` : 'ainda não apareceu junto com a nossa' }));
  const HEAD_W_MAX = 240; // o selo do cabeçalho (4 ícones) mede ~228 px; regra: nenhum elemento novo pode alargá-lo
  addCheck('Tela do WhatsApp', 'Selo do cabeçalho (largura)', ({ br }) => comConversa(br, () => {
    const hd = document.getElementById('az-head');
    if (!hd) return { ok: 'warn', d: 'o selo do AtendeZap não apareceu no cabeçalho da conversa' };
    const w = Math.round(hd.getBoundingClientRect().width), bt = hd.shadowRoot?.querySelectorAll('button').length ?? 0;
    return w <= HEAD_W_MAX ? { ok: true, d: `${w} px · ${bt} botão(ões)` } : { ok: 'warn', d: `${w} px: passou do combinado (${HEAD_W_MAX} px). Algum elemento novo alargou o selo do cabeçalho.` };
  }), null, []);
  addCheck('Tela do WhatsApp', 'Layout da conversa', ({ dom, br }) => comConversa(br, () => {
    const f = q('footer');
    if (!f) return { ok: 'warn', d: 'sem rodapé para medir' };
    const r = f.getBoundingClientRect(), app = document.getElementById('app')?.getBoundingClientRect();
    const altura = app ? Math.round(app.height) : 0;
    const ok = r.bottom > innerHeight * 0.75 && altura > innerHeight * 0.9;
    return { ok, d: ok ? `rodapé embaixo · #app ${altura}px de ${innerHeight}px` : `QUEBRADO: rodapé em ${Math.round(r.bottom)}px de ${innerHeight}px · #app ${altura}px (mensagens podem sumir)` };
  }), null, ['Assinatura', 'Respostas rápidas']);
  for (const [feat, fns] of Object.entries(FEATURES)) {
    addCheck('Funções da biblioteca', feat, ({ br }) => {
      if (!br.fnMap) return { ok: false, d: 'sem dados da ponte' };
      const falta = fns.filter((f) => br.fnMap[f] === false);
      if (feat === 'Etiquetas' && !br.business) return { ok: 'warn', d: 'conta não Business' };
      return { ok: !falta.length, d: falta.length ? 'faltando: ' + falta.join(', ') : `${fns.length} funções presentes` };
    }, null, [feat]);
  }
  // Avisos "Module X was not found" da wa-js (capturados por page/pre.js). Só é problema se for algo que usamos.
  const MODULOS_USADOS = ['addAndSendMsgToChat', 'findOrCreateLatestChat', 'findChat', 'setPin', 'sendRevokeMsgs', 'getABPropConfigValue',
    'setTextContent', 'queryExist', 'queryExists', 'encryptAndSendStatusMsg', 'markComposing', 'sendSeen', 'createMsgProtobuf',
    'sendTextMsgToChat', 'uploadMedia', 'prepRawMedia', 'sendMediaMsgToChat', 'openChat', 'openChatBottom', 'getMyStatus', 'blockContact',
    'addOrRemoveLabels', 'sendVCardContactMessage', 'setTheme', 'archiveChat', 'markUnread'];
  addCheck('Funções da biblioteca', 'Módulos que a wa-js não achou', ({ br }) => {
    const a = br.modulosAusentes || [];
    if (!a.length) return { ok: true, d: 'nenhum' };
    const usados = a.filter((x) => MODULOS_USADOS.includes(x.nome));
    return {
      ok: usados.length ? false : true,
      d: (usados.length ? 'USADOS pela extensão: ' + usados.map((x) => x.nome).join(', ') + '\n' : '') +
        `${a.length} não encontrados nesta versão do WhatsApp${usados.length ? '' : ' (nenhum usado pelo AtendeZap)'}: ` + a.map((x) => x.nome).join(', '),
    };
  }, null, ALL);
  const PROBES = {
    listaConversas: ['Listar conversas', ['Enviar para vários']], conversaAtiva: ['Achar a conversa aberta', ['Iniciar conversa', 'Fixar']],
    fixarLocal: ['Campo de fixar na conversa', ['Fixar']], meusStatus: ['Ler meus status', ['Status']], apagarStatus: ['Apagar status disponível', ['Status']],
    etiquetas: ['Ler etiquetas', ['Etiquetas']], tema: ['Ler tema', ['Tema']], meuId: ['Ler meu usuário', ['Status']],
    recursos: ['Recursos internos do WhatsApp (A/B)', []],
  };
  for (const [k, [nome, funcs]] of Object.entries(PROBES)) {
    addCheck('Testes ao vivo', nome, ({ probe }) => {
      const r = probe?.[k];
      if (!r) return { ok: 'warn', d: probe?.erro || 'teste não executado' };
      return { ok: r.ok, d: r.d };
    }, null, funcs);
  }
  many('Respostas rápidas', [
    ['Respostas cadastradas', () => ({ ok: true, d: `${S.replies.length} respostas · ${S.cats.length} categorias` })],
    ['Limite de mídias', () => { const n = U.countMedia(S.replies); return { ok: n >= MEDIA_LIMIT ? 'warn' : true, d: `${n}/${MEDIA_LIMIT}` }; }],
    ['Arquivos de mídia', ({ chaves }) => {
      const falt = S.replies.flatMap((r) => (r.acoes || []).filter((a) => a.midiaId && !chaves.has('midia_' + a.midiaId)).map(() => r.titulo || r.atalho));
      return { ok: falt.length ? 'warn' : true, d: falt.length ? 'mídia ausente em: ' + [...new Set(falt)].join(', ') : 'todas presentes' };
    }, null, ['Respostas rápidas']],
    ['Atalhos repetidos', () => {
      const seen = new Set(), dup = S.replies.map((r) => r.atalho).filter((a) => seen.has(a) || !seen.add(a));
      return { ok: dup.length ? 'warn' : true, d: dup.length ? dup.map((a) => '/' + a).join(', ') : 'nenhum' };
    }],
  ]);
  many('Assinatura', [
    ['Configuração', () => ({ ok: !S.sig.ativo || S.sig.nome ? true : 'warn', d: !S.sig.ativo ? 'desativada (escolha sua: não é problema)' : S.sig.nome ? 'ativa' : 'ativa, mas sem nome do atendente' })],
    ['Prévia', () => ({ ok: true, d: U.sign('mensagem', { ...S.sig, nome: S.sig.nome || 'Nome' }) })],
  ]);
  many('Fixados', [
    ['Conversas fixadas', async () => {
      if (!S.pins.length) return { ok: true, d: 'nenhuma' };
      const miss = (await call('chatInfo', S.pins)).filter((c) => c.missing).length;
      return { ok: miss ? 'warn' : true, d: `${S.pins.length} fixadas${miss ? ` · ${miss} não encontradas neste WhatsApp` : ''}` };
    }, { label: 'Reaplicar', fn: async () => { lastPins = []; applyPins(); toast('Fixados reaplicados.'); } }],
  ]);
  addCheck('Backup e armazenamento', 'Importar do waTidy', () => ({ ok: !!(W && globalThis.crypto?.subtle), d: W && globalThis.crypto?.subtle ? 'pronto' : 'sem criptografia no navegador (precisa de https)' }));
  many('Backup e armazenamento', [
    ['Backup automático', () => {
      const b = S.backup;
      if (!b.ativo) return { ok: 'warn', d: 'desativado' };
      return { ok: U.backupDue(b) && b.ultimo ? 'warn' : true, d: `último: ${fmt(b.ultimo)} · próximo: ${fmt(U.nextBackup(b))}` };
    }],
    ['Espaço usado', ({ bytes }) => ({ ok: true, d: bytes == null ? '?' : (bytes / 1048576).toFixed(1) + ' MB' })],
  ]);
  addCheck('Laboratório', 'Recursos alterados', ({ br, dados }) => {
    const ov = br.lab?.overrides || {};
    const n = Object.keys(ov).length;
    const t = dados[LAB_TESTES] || {};
    const pausa = br.lab?.pausado ? `PAUSADO (${br.lab.pausado})\n` : '';
    const nat = Object.entries(t).filter(([, v]) => v.res === 'nativo').map(([k, v]) => k + (v.auto ? ' (o WhatsApp ligou sozinho)' : ''));
    const natTxt = nat.length ? `\nJá nativos (fora do Laboratório): ${nat.join(', ')}` : '';
    return { ok: pausa ? 'warn' : true, d: (n ? `${n} recurso(s) ligado(s) por você no Laboratório\n` : '') + pausa + natTxt.trim() + (natTxt ? '\n' : '') + (n ? Object.entries(ov).map(([k, v]) => `${k} = ${v}${{ sim: '  → ✔ apareceu', nao: '  → ✖ não apareceu', nativo: '  → ◎ já nativo' }[t[k]?.res] || ''}`).join('\n') : 'nenhum (tudo como o WhatsApp mandou)') };
  });
  addCheck('Histórico do WhatsApp', 'Versões e o que cada atualização mudou', ({ dados }) => {
    const v = dados[VERSOES];
    if (!v?.historico?.length) return { ok: 'warn', d: 'ainda sem registro (aparece depois da primeira análise com o WhatsApp pronto)' };
    const dt = (iso) => new Date(iso).toLocaleString('pt-BR');
    const linhas = v.historico.map((h) => !h.de ? `${h.versao} — primeira registrada em ${dt(h.desde)} (${h.total} chaves)`
      : `${h.de} → ${h.versao} em ${dt(h.desde)}: ${h.novas.length} novas, ${h.removidas.length} removidas, ${h.mudaram.length} mudaram o padrão` +
        (h.novas.length ? `\n   novas: ${h.novas.slice(0, 15).join(', ')}${h.novas.length > 15 ? '…' : ''}` : '') +
        (h.mudaram.length ? `\n   mudaram: ${h.mudaram.slice(0, 15).map(([k, a, b]) => `${k} ${a}→${b}`).join(', ')}${h.mudaram.length > 15 ? '…' : ''}` : ''));
    return { ok: true, d: `atual: ${v.atual?.versao} desde ${dt(v.atual?.desde)}\n` + linhas.join('\n') };
  });
  addCheck('Erros recentes', 'Erros no console da página', ({ br }) => {
    const c = br.console;
    if (!c) return { ok: 'warn', d: 'vigia do console não carregou' };
    const linhas = c.ultimos.map((u) => `${u.t} [${u.origem === 'extensao' ? 'AtendeZap' : 'WhatsApp'}]${u.n > 1 ? ` ×${u.n}` : ''} ${u.msg}`);
    return {
      ok: c.extensao ? 'warn' : true,
      d: `da extensão: ${c.extensao} · do próprio WhatsApp: ${c.whatsapp} (não são da extensão e não aparecem mais em chrome://extensions)` +
        `${br.modulosAusentes?.length ? ` · avisos da wa-js guardados: ${br.modulosAusentes.length}` : ''}` +
        `${br.wrapInofensivos?.length ? ` · wa-js: função(ões) interna(s) do WhatsApp que não existem mais, sem efeito para o AtendeZap: ${br.wrapInofensivos.join(', ')}` : ''}` + (linhas.length ? '\n' + linhas.join('\n') : ''),
    };
  });
  addCheck('Erros recentes', 'Registro de erros', () => {
    if (!LOG.length) return { ok: true, d: 'nenhum erro nesta sessão' };
    const feats = [...new Set(LOG.map((l) => METHOD_FEAT[l.onde]).filter(Boolean))];
    return { ok: 'warn', d: (feats.length ? 'em: ' + feats.join(', ') + '\n' : '') + LOG.slice(0, 6).map((l) => `${l.t} [${l.onde}] ${l.msg}`).join('\n') };
  }, { label: 'Limpar', fn: async () => { LOG.length = 0; } });

  const stOf = (ok) => (ok === true ? 'ok' : ok === 'warn' ? 'warn' : ok === 'skip' ? 'skip' : 'bad');
  const pior = (list) => (list.some((x) => x === 'bad') ? 'bad' : list.some((x) => x === 'warn') ? 'warn' : list.length && list.every((x) => x === 'skip') ? 'skip' : 'ok');
  // Histórico das versões do WhatsApp: guarda as chaves de recurso da versão atual e, quando a versão muda,
  // registra o que a atualização trouxe (chaves novas, removidas e as que mudaram o valor padrão).
  const VERSOES = 'waVersoes';
  // v1.16 — Novidades do WhatsApp: a cada autoteste compara módulos e chaves com a leitura anterior (mesmo sem mudar a versão: o
  // servidor liga funções para a conta sem o WhatsApp atualizar). Guarda a última leitura (inventarioAnt) e um histórico curto.
  const INV = 'inventarioAnt', INV_HIST = 'inventarioHist';
  async function registrarInventario(versao) {
    const inv = await call('inventario').catch(() => null);
    if (!inv?.modulos?.length || !Object.keys(inv.flags || {}).length) return;
    const agora = new Date().toISOString(), d = await chrome.storage.local.get([INV, INV_HIST]), ant = d[INV];
    // v1.17: "módulos" guarda a UNIÃO de tudo que já vi. O registro cresce/encolhe sozinho conforme você abre telas (+821, −942 na mesma
    // versão do WhatsApp), então módulo só é novidade quando a VERSÃO muda e o nome nunca tinha aparecido; chaves contam sempre.
    const snap = { versao, t: agora, modulos: [...new Set([...(ant?.modulos || []), ...inv.modulos])], flags: inv.flags };
    if (!ant) { await chrome.storage.local.set({ [INV]: snap }); return; }
    const dif = U.diffInventario(ant, inv);
    dif.modSumiram = [];                                  // o que some do registro só foi descarregado
    if (ant.versao === versao) dif.modNovos = [];         // mesma versão = carregamento sob demanda
    if (U.invVazio(dif)) { if (snap.modulos.length !== ant.modulos.length) await chrome.storage.local.set({ [INV]: { ...snap, t: ant.t } }); return; }
    const entrada = U.invEntrada(dif, { t: agora, tAnt: ant.t, de: ant.versao, ate: versao });
    await chrome.storage.local.set({ [INV]: snap, [INV_HIST]: [entrada, ...(d[INV_HIST] || [])].slice(0, 15) });
  }
  async function registrarVersao(versao) {
    const v = (await chrome.storage.local.get(VERSOES))[VERSOES] || { atual: null, historico: [] };
    if (v.atual?.versao === versao && v.atual.chaves) return;
    const lista = await call('labList');
    const chaves = Object.fromEntries((lista.recursos || []).filter((r) => r.nome && !r.erro).map((r) => [r.nome, r.valor]));
    if (!Object.keys(chaves).length) return;
    if (v.atual?.chaves && v.atual.versao !== versao) {
      const d = U.diffChaves(v.atual.chaves, chaves);
      v.historico.unshift({ versao, de: v.atual.versao, desde: new Date().toISOString(), total: Object.keys(chaves).length,
        novas: d.novas, removidas: d.removidas, mudaram: d.mudaram });
      v.historico.length = Math.min(v.historico.length, 20);
    } else if (!v.historico.length) {
      v.historico.unshift({ versao, de: null, desde: new Date().toISOString(), total: Object.keys(chaves).length, novas: [], removidas: [], mudaram: [] });
    }
    v.atual = { versao, desde: v.atual?.versao === versao ? v.atual.desde : new Date().toISOString(), chaves };
    await chrome.storage.local.set({ [VERSOES]: v });
  }
  async function runChecks(motivo = 'manual') {
    const dom = {};
    for (const k of Object.keys(SEL)) { const el = k === 'send' ? sendButton() : q(k); dom[k] = el ? SEL[k][SEL_HIT[k]] : null; }
    const t0 = Date.now(), tIni = performance.now();
    let br, ping = null, probe = null, msProbe = 0;
    try { br = await Promise.race([call('diag'), sleep(4000).then(() => ({ erro: 'a ponte com o WhatsApp não respondeu' }))]); ping = br.erro ? null : Date.now() - t0; }
    catch (e) { br = { erro: e.message }; }
    const msPonte = Math.round(performance.now() - tIni);
    if (br.ready) {
      const tP = performance.now();
      try { probe = await Promise.race([call('probe'), sleep(15000).then(() => ({ erro: 'testes ao vivo demoraram demais' }))]); }
      catch (e) { probe = { erro: e.message }; }
      msProbe = Math.round(performance.now() - tP);
    }
    if (br.ready && br.waVersion) await registrarVersao(br.waVersion).catch(() => {});
    let invHist = [], invBase = null;
    if (br.ready) {
      await registrarInventario(br.waVersion || null).catch((e) => logErr('inventário', e.message));
      const dInv = await chrome.storage.local.get([INV, INV_HIST]); invHist = dInv[INV_HIST] || []; invBase = dInv[INV]?.t || null;
    }
    const dados = await chrome.storage.local.get([LAB_TESTES, VERSOES, 'diagUltimo']);
    // só os nomes: get(null) traria todas as mídias (até 50 arquivos) a cada autoteste
    const chaves = new Set(await (chrome.storage.local.getKeys?.() ?? chrome.storage.local.get(null).then(Object.keys)));
    const bytes = await chrome.storage.local.getBytesInUse(null).catch(() => null);
    const ctx = { br, probe, dom, dados, chaves, bytes, ping };
    const results = [], tC = performance.now();
    for (const c of CHECKS) {
      let r; const t1 = performance.now();
      try { r = await c.run(ctx); } catch (e) { r = { ok: false, d: 'erro na verificação: ' + e.message }; }
      results.push({ ...c, ...r, ms: Math.round(performance.now() - t1) });
    }
    const msChecks = Math.round(performance.now() - tC);
    const saude = Object.fromEntries(ALL.map((f) => {
      const rel = results.filter((r) => r.funcs.includes(f));
      const bad = rel.filter((r) => r.ok === false);
      return [f, { st: pior(rel.map((r) => stOf(r.ok))), motivos: bad.map((r) => `${r.nome}: ${r.d}`) }];
    }));
    const sondagem = {
      editaveis: [...document.querySelectorAll('[contenteditable="true"]')].slice(0, 6).map(describe),
      headers: [...document.querySelectorAll('header')].slice(0, 6).map(describe),
      footers: [...document.querySelectorAll('footer')].slice(0, 4).map(describe),
      botoes: [...document.querySelectorAll('#main button[aria-label], footer button[aria-label], [data-icon*="send"]')].slice(0, 25).map((e) => e.getAttribute('aria-label') || e.getAttribute('data-icon')),
    };
    const estado = (await chrome.storage.local.get('diagEstado')).diagEstado || {};
    let audit = null; try { audit = await callT(5000, 'auditoria'); } catch { /* ponte antiga ou parada */ }
    const data = {
      atendezap: chrome.runtime.getManifest().version, data: new Date().toISOString(), motivo, navegador: navigator.userAgent,
      whatsapp: br.waVersion || null, waJs: br.waJs || null,
      tempos: { total: Math.round(performance.now() - tIni), ponte: msPonte, probe: msProbe, checks: msChecks },
      perf: U.perfLinhas(PERF, performance.now() - PERF_T0),
      novidades: invHist[0] && Date.now() - new Date(invHist[0].t).getTime() < 7 * 86400000 ? invHist[0] : null,
      atendente: atendResumo(),
      gruposSo: { ligado: ligado('gruposSo'), janelaModo: S.gruposSoCfg?.janela || 'escolher', aba: gs.cfg?.aba ?? null, busca: !!gs.cfg?.busca, reaplicacoes: gs.rea.n, ultimaJanela: gs.ultJanela || null },
      acesso: acessoResumo(),
      recuperar: recuperarResumo(),
      partes: { desligadas: MODULOS.filter(([k]) => !ligado(k)).map(([, nome]) => nome), bloqueadasPeloAdministrador: AC.RECURSOS.filter((k) => acessoEf().conectado && AC.estado(acessoEf(), k) === 'bloqueado') },
      selo: (() => { const hd = document.getElementById('az-head'); return hd ? { largura: Math.round(hd.getBoundingClientRect().width), botoes: hd.shadowRoot?.querySelectorAll('button').length ?? 0 } : null; })(),
      auditoriaPonte: audit ? { externas: audit.externas, recusadas: audit.recusadas, ultimas: (audit.ultimas || []).filter((x) => !x.ok).slice(-10) } : null,
      saude, checks: results.map(({ grupo, nome, ok, d, funcs, ms }) => ({ grupo, nome, ok, d, funcs, ms })),
      ponte: br, testes: probe, seletores: dom, sondagem, erros: LOG, historico: estado.historico || [],
      versoesWhatsApp: dados[VERSOES]?.historico || [], labTestes: dados[LAB_TESTES] || {},
    };
    // resumo curto no topo (e a comparação com a execução anterior); depois guarda esta execução como a "anterior"
    data.resumo = U.resumoDiag(data, dados.diagUltimo || null);
    chrome.storage.local.set({ diagUltimo: { t: data.data, ver: br.waVersion || null, oks: Object.fromEntries(data.checks.map((c) => [c.nome, c.ok])) } }).catch(() => {});
    const ordenado = { resumo: data.resumo, ...data }; // o resumo é a primeira coisa do arquivo
    // relatório sem números: ids de conversa/grupo/lid viram # (a versão do WhatsApp continua legível)
    const limpo = JSON.parse(JSON.stringify(ordenado).replace(/\d{6,}(?=@|_)/g, '#'));
    return { results, saude, data: limpo, report: JSON.stringify(limpo), inv: { hist: invHist, base: invBase } };
  }

  // Relatório legível (.html) que também carrega os dados técnicos em JSON no final.
  function reportHtml(data) {
    const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const ic = { ok: '✔', warn: '⚠', bad: '✖', skip: '○' }, cor = { ok: '#16a34a', warn: '#d97706', bad: '#dc2626', skip: '#6b7280' };
    const feats = Object.entries(data.saude).map(([f, v]) => `<div class="f ${v.st}"><b>${ic[v.st]} ${esc(f)}</b>${v.motivos.map((m) => `<small>${esc(m)}</small>`).join('')}</div>`).join('');
    const grupos = [...new Set(data.checks.map((c) => c.grupo))].map((g) => `<h3>${esc(g)}</h3><table>${data.checks.filter((c) => c.grupo === g)
      .map((c) => `<tr><td class="${stOf(c.ok)}">${ic[stOf(c.ok)]}</td><td><b>${esc(c.nome)}</b></td><td><pre>${esc(c.d)}</pre></td></tr>`).join('')}</table>`).join('');
    const hist = (data.historico || []).map((x) => `<tr><td>${esc(new Date(x.data).toLocaleString('pt-BR'))}</td><td>${esc(x.motivo)}</td><td>${esc(x.whatsapp)}</td><td>✔ ${x.ok} · ⚠ ${x.warn} · ✖ ${x.bad}${x.skip ? ' · ○ ' + x.skip : ''}</td><td>${esc((x.afetadas || []).join(', ') || '—')}</td></tr>`).join('');
    const n = { ok: 0, warn: 0, bad: 0, skip: 0 }; data.checks.forEach((c) => n[stOf(c.ok)]++);
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatório AtendeZap ${esc(new Date(data.data).toLocaleString('pt-BR'))}</title><style>
body{font:14px/1.45 "Segoe UI",Arial,sans-serif;margin:0;background:#f4f6f8;color:#111b21}main{max-width:900px;margin:0 auto;padding:24px 16px}
h1{margin:0 0 4px;font-size:22px}h2{font-size:17px;margin:28px 0 10px}h3{font-size:14px;margin:18px 0 6px;color:#3b4a54}
.meta{color:#667781;font-size:13px}.sum{display:flex;gap:16px;font-weight:700;font-size:16px;margin:12px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px}.f{background:#fff;border-radius:10px;padding:10px 12px;border-left:5px solid}
.f.ok{border-color:${cor.ok}}.f.warn{border-color:${cor.warn}}.f.bad{border-color:${cor.bad};background:#fef2f2}.f b{display:block}.f small{display:block;color:#7f1d1d;margin-top:4px}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden}td{padding:6px 8px;border-bottom:1px solid #eef1f3;vertical-align:top}
td.ok{color:${cor.ok}}td.warn{color:${cor.warn}}td.bad{color:${cor.bad}}td.skip{color:${cor.skip}}pre{margin:0;white-space:pre-wrap;word-break:break-word;font:12px Consolas,monospace;color:#3b4a54}
.ok{color:${cor.ok}}.warn{color:${cor.warn}}.bad{color:${cor.bad}}.skip{color:${cor.skip}}details{margin-top:24px}summary{cursor:pointer;font-weight:600}
.tip{background:#e7fce3;border-radius:8px;padding:10px 12px;margin-top:14px}
@media(prefers-color-scheme:dark){body{background:#111b21;color:#e9edef}.f,table{background:#1b252c}.f.bad{background:#3a1d1d}td{border-color:#2a3942}pre{color:#aebac1}.tip{background:#103529}.meta,h3{color:#8696a0}}
</style></head><body><main>
<h1>Relatório do AtendeZap</h1>
<div class="meta">${esc(new Date(data.data).toLocaleString('pt-BR'))} · AtendeZap ${esc(data.atendezap)} · WhatsApp ${esc(data.whatsapp || '?')} · wa-js ${esc(data.waJs || '?')} · motivo: ${esc(data.motivo)}</div>
<div class="sum"><span class="ok">✔ ${n.ok}</span><span class="warn">⚠ ${n.warn}</span><span class="bad">✖ ${n.bad}</span>${n.skip ? `<span class="skip">○ ${n.skip} não testados</span>` : ''}</div>
${data.resumo ? `<h2>Resumo</h2><pre>${esc(data.resumo)}</pre>` : ''}
<h2>Saúde das funções</h2><div class="grid">${feats}</div>
<div class="tip">Se alguma função estiver com ✖, envie este arquivo para o Claude: ele mostra o que mudou no WhatsApp. Não contém mensagens nem contatos.</div>
<h2>Verificações</h2>${grupos}
${hist ? `<h2>Histórico de autotestes</h2><table><tr><td><b>Quando</b></td><td><b>Motivo</b></td><td><b>WhatsApp</b></td><td><b>Resultado</b></td><td><b>Afetadas</b></td></tr>${hist}</table>` : ''}
<details><summary>Dados técnicos (para o Claude)</summary><pre id="dados">${esc(JSON.stringify(data))}</pre></details>
</main></body></html>`;
  }
  function baixar(nome, conteudo, tipo) {
    const a = h('a', { href: URL.createObjectURL(new Blob([conteudo], { type: tipo })), download: nome });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
  async function baixarRelatorio(pronto) {
    const { data } = pronto || (await runChecks('relatório'));
    baixar(`atendezap-relatorio-${stamp()}.html`, reportHtml(data), 'text/html');
    toast('Relatório salvo na pasta Downloads. Abra para ver, ou envie ao Claude.');
  }
  async function copiarRelatorio(pronto) {
    const { report } = pronto || (await runChecks('relatório'));
    try { await navigator.clipboard.writeText(report); toast('Relatório copiado. Cole na conversa com o Claude.'); }
    catch { baixar(`atendezap-diagnostico-${stamp()}.json`, report, 'application/json'); }
  }

  // v1.15: o mapa ficou enxuto. Antes: rodava o diagnóstico INTEIRO de novo (inclusive os testes ao vivo) só para embuti-lo, repetia
  // todos os módulos num "indice" e era gravado indentado (765 KB). Agora reaproveita o diagnóstico recente, leva só o resumo e vai compacto.
  async function ambienteDiag() {   // v1.47: onde a extensão roda e o que ocupa o armazenamento (só nomes de chaves e tamanhos)
    const dados = await chrome.storage.local.get(null), bytes = {}, m = chrome.runtime.getManifest();
    await Promise.all(Object.keys(dados).map(async (k) => { try { bytes[k] = await chrome.storage.local.getBytesInUse(k); } catch { bytes[k] = 0; } }));
    const total = await chrome.storage.local.getBytesInUse(null).catch(() => 0);
    return { atendezap: m.version, navegador: navigator.userAgent.replace(/\s+/g, ' ').slice(0, 160), plataforma: navigator.platform, idioma: navigator.language, fuso: Intl.DateTimeFormat().resolvedOptions().timeZone, tela: { w: screen.width, h: screen.height, dpr: devicePixelRatio, janela: [innerWidth, innerHeight] },
      permissoes: m.permissions || [], hosts: m.host_permissions || [], minChrome: m.minimum_chrome_version || null, armazenamento: { totalBytes: total, chaves: Object.keys(bytes).length, maiores: AZDIAG.topArmazenamento(bytes, 15) },
      memoria: performance.memory ? { usadoMB: Math.round(performance.memory.usedJSHeapSize / 1048576), limiteMB: Math.round(performance.memory.jsHeapSizeLimit / 1048576) } : null };
  }
  async function diagnosticoExtra(mapa) {   // v1.47: o que o WhatsApp mudou desde a última leitura do mapa (guarda a leitura atual como base) + ponte, IA e erros
    const flags = Object.fromEntries((Array.isArray(mapa.recursos) ? mapa.recursos : []).filter((x) => x && x.nome).map((x) => [x.nome, x.valor])), modulos = Array.isArray(mapa.modulos) ? mapa.modulos : [];
    const atual = { whatsapp: mapa.whatsapp, t: Date.now(), flags, modulos }, base = (await chrome.storage.local.get('mapaBase')).mapaBase;
    const mudancas = base ? AZDIAG.diffMapas(base, atual) : { primeiraLeitura: true, para: mapa.whatsapp || null };
    if (modulos.length) await chrome.storage.local.set({ mapaBase: atual }).catch(() => {});
    return { ambiente: await ambienteDiag(), ponte: AZDIAG.resumirPonte(PONTE), ia: AZIAREG.resumo(iaReg.itens), erros: LOG.slice(0, 30).map((e) => ({ ...e, msg: IA.mascarar(e.msg) })), mudancas };
  }
  async function gerarMapa(pronto, retornar) {
    if (retornar !== true) toast('Gerando o mapa do WhatsApp…');
    try {
      const mapa = await Promise.race([call('mapa'), sleep(20000).then(() => { throw new Error('demorou demais'); })]);
      toast('Cruzando chaves e módulos do WhatsApp…', 4000);
      let ref; // v1.16: onde o nome de cada chave aparece no código (índices em "mapa.modulos")
      try { ref = await Promise.race([call('referencias'), sleep(60000).then(() => { throw new Error('a leitura demorou demais'); })]); await salvarRefs(ref, mapa.whatsapp || null); }
      catch (e) { ref = { erro: e.message }; }
      const recente = (pronto?.data?.resumo ? pronto : null) || (AUTO.ultimo && Date.now() - new Date(AUTO.ultimo.data.data).getTime() < 120000 ? AUTO.ultimo : null);
      const { data } = recente || await runChecks('mapa');
      const hist = ((await chrome.storage.local.get(INV_HIST))[INV_HIST] || []).slice(0, 5);
      const texto = JSON.stringify({ atendezap: chrome.runtime.getManifest().version, data: new Date().toISOString(), resumo: data.resumo, novidades: hist,
        referencias: ref?.stats ? { stats: ref.stats, indices: ref.ref, portoes: ref.portoes } : { erro: ref?.erro || 'não gerado' }, mapa, ...(await diagnosticoExtra(mapa)) });
      if (retornar === true) return texto;
      baixar(`atendezap-mapa-whatsapp-${stamp()}.json`, texto, 'application/json');
      toast(`Mapa salvo (${mapa.totalModulos} módulos · ${Math.round(texto.length / 1024)} KB). Envie o arquivo ao Claude quando precisar de ajuste.`, 6000);
    } catch (e) { if (retornar === true) throw e; toast('Não foi possível gerar o mapa: ' + e.message); }
  }
  // v1.47: UM arquivo .zip com tudo o que o Claude precisa para analisar (sem mensagens, contatos, telefones, convite, chave da IA ou endereço da planilha)
  async function pacoteDiagnostico(pronto) {
    toast('Montando o pacote de diagnóstico… (leva uns 30 segundos; deixe a tela como está o problema)', 6000);
    try {
      const { data } = pronto || (await runChecks('pacote')), m = chrome.runtime.getManifest(), mapaTxt = await gerarMapa(pronto, true), estr = await estruturaTela().catch((e) => JSON.stringify({ erro: e.message })), mp = JSON.parse(mapaTxt), agora = new Date(), J = (o) => JSON.stringify(o, null, 1);
      const arquivos = [['relatorio.html', 'saúde de cada função e o resumo técnico (abra no navegador)'], ['mapa.json', 'chaves e módulos do WhatsApp, o que mudou desde a última leitura e as sondas'], ['estrutura.json', 'foto da estrutura da tela (sem mensagens nem contatos)'], ['ambiente.json', 'navegador, tela, permissões e o que ocupa o armazenamento'], ['erros.json', 'últimos erros do painel'], ['ponte.json', 'quais chamadas ao WhatsApp mais demoram ou falham'], ['ia.json', 'quantos envios à IA, tempo e erros (sem o texto enviado)']];
      const ent = [{ nome: 'LEIAME.txt', dados: AZDIAG.textoPacote({ versao: m.version, whatsapp: mp.mapa?.whatsapp || '?', quando: agora.toLocaleString('pt-BR'), arquivos }) }, { nome: 'relatorio.html', dados: reportHtml(data) }, { nome: 'mapa.json', dados: mapaTxt }, { nome: 'estrutura.json', dados: estr },
        { nome: 'ambiente.json', dados: J(mp.ambiente) }, { nome: 'erros.json', dados: J(mp.erros) }, { nome: 'ponte.json', dados: J(mp.ponte) }, { nome: 'ia.json', dados: J(mp.ia) }].map((x) => ({ ...x, data: agora }));
      const z = AZZIP.montar(ent); baixar(`atendezap-pacote-diagnostico-${stamp()}.zip`, new Blob(z.partes, { type: 'application/zip' }), 'application/zip');
      toast(`Pacote salvo (${Math.round(z.tamanho / 1024)} KB, ${ent.length} arquivos). Envie o .zip ao Claude: não tem mensagens, contatos, convite nem chave.`, 8000);
    } catch (e) { toast('Não foi possível montar o pacote: ' + String(e.message || e).slice(0, 120)); }
  }
  // Resumo curto (≈10 linhas) para colar na conversa com o Claude em vez de anexar arquivos
  async function copiarResumo(pronto) {
    const { data } = pronto || (await runChecks('resumo'));
    try { await navigator.clipboard.writeText(data.resumo); toast('Resumo copiado. Cole na conversa com o Claude.'); }
    catch { baixar(`atendezap-resumo-${stamp()}.txt`, data.resumo, 'text/plain'); }
  }
  // Foto da ESTRUTURA da tela, sem conteúdo: tags, papéis, data-testid, estados aria, posição e tamanho (e rótulos curtos de botões/abas).
  // Serve para resolver problema visual (camada nativa por cima, abas, linhas da lista, cabeçalho) sem adivinhar. Sem textos de conversas.
  async function estruturaTela() {
    let orc = 500;
    const ARIA = ['aria-selected', 'aria-pressed', 'aria-checked', 'aria-current', 'aria-expanded', 'aria-disabled', 'aria-hidden'];
    const desc = (el, prof) => {
      if (orc-- <= 0) return null;
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el), o = { t: el.tagName.toLowerCase() };
      const role = el.getAttribute('role'); if (role) o.r = role;
      if (el.id && el.id.length < 40 && !/\d{5,}/.test(el.id)) o.id = el.id;
      const tid = el.getAttribute('data-testid'); if (tid && !/^conv-msg-/.test(tid)) o.tid = tid;
      const a = ARIA.filter((k) => el.hasAttribute(k)).map((k) => `${k.slice(5)}=${el.getAttribute(k)}`); if (a.length) o.aria = a.join(',');
      o.box = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
      if (cs.position !== 'static' && cs.position !== 'relative') o.pos = cs.position;
      if (cs.display === 'none') o.oculto = 1;
      const az = [...el.attributes].map((x) => x.name).filter((n) => n.startsWith('data-az-')); if (az.length) o.az = az.join(',');
      if (el.matches('button, [role="tab"], [role="button"], [data-testid="filter-button"]') && !el.closest('[data-testid="cell-frame-container"], [data-testid^="conv-msg"]')) {
        const tx = (el.textContent || '').trim().replace(/\s+/g, ' '); if (tx && tx.length <= 16) o.txt = tx;
      }
      if (prof > 0) {
        let linhas = 0;
        const k = [...el.children].filter((c) => { // da lista só as 3 primeiras linhas; nunca os nossos hosts
          if (/^az-/.test(c.id || '')) return false;
          if (/^list-item-/.test(c.getAttribute('data-testid') || '') && ++linhas > 3) return false;
          return true;
        }).slice(0, 14).map((c) => desc(c, prof - 1)).filter(Boolean);
        if (k.length) o.k = k;
      }
      return o;
    };
    const topo = q('footer')?.getBoundingClientRect().top;
    const camadas = new Set();
    if (topo) for (const x of [0.15, 0.4, 0.65, 0.9]) for (const dy of [24, 70, 130, 220]) {
      const r = q('footer').getBoundingClientRect();
      for (const el of document.elementsFromPoint(r.left + r.width * x, r.top - dy)) {
        if (el.closest?.('#az-panel,#az-pop,#az-head') || /^az-/.test(el.id || '') || el === document.body || el === document.documentElement || el.id === 'app') continue;
        const cadeia = []; for (let n = el, i = 0; n && n !== document.body && i < 5; n = n.parentElement, i++) {
          const c = getComputedStyle(n), b = n.getBoundingClientRect();
          cadeia.push(`${n.tagName.toLowerCase()}${n.getAttribute('role') ? '[' + n.getAttribute('role') + ']' : ''}${n.getAttribute('data-testid') ? '{' + n.getAttribute('data-testid') + '}' : ''}${c.position === 'absolute' || c.position === 'fixed' ? '@' + c.position : ''}(${Math.round(b.width)}x${Math.round(b.height)}@${Math.round(b.left)},${Math.round(b.top)})`);
        }
        const txt = cadeia.join(' < ');
        if (!/conv-msg|conversation-panel-messages|conversation-panel-body/.test(txt)) camadas.add(txt); // o miolo das mensagens não é "camada por cima"
        // (as mensagens enchiam esta lista e escondiam o que importa: menus, listas e popups)
      }
    }
    const linhasAmostra = await call('amostraLinhas').catch(() => null);
    const out = {
      atendezap: chrome.runtime.getManifest().version, data: new Date().toISOString(), whatsapp: (await call('diag').catch(() => ({}))).waVersion || null,
      viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio }, bodyClasses: document.body.className.split(/\s+/).filter((c) => /^az-|dark|light/i.test(c)),
      abas: descAbas(), selosVagas: document.querySelectorAll('#side .az-vagas').length, linhasMarcadas: document.querySelectorAll('#side [data-az-chat]').length, linhasOcultas: document.querySelectorAll('[data-az-oculta]').length,
      linhasAmostra, camadasAcimaDoCampo: [...camadas].slice(0, 30),
      lateral: document.getElementById('side') ? desc(document.getElementById('side'), 8) : null,
      cabecalho: q('header') ? desc(q('header'), 6) : null,
      rodape: q('footer') ? desc(q('footer'), 6) : null,
      colunas: document.getElementById('app') ? desc(document.getElementById('app'), 2) : null,
      nosAZ: ['az-panel', 'az-pop', 'az-head'].map((id) => { const e = document.getElementById(id); const r = e?.getBoundingClientRect(); return { id, existe: !!e, box: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null }; }),
      perf: U.perfLinhas(PERF, performance.now() - PERF_T0),
    };
    return JSON.stringify(out).replace(/\d{6,}(?=@|_)/g, '#'); // sem números de telefone/ids de conversa
  }
  async function baixarEstrutura() {
    // 5 s para deixar a tela no estado do problema (ex.: clique no campo de mensagem e digite "/" para a lista nativa abrir)
    for (let i = 5; i > 0; i--) { toast(`Capturando em ${i} s… deixe a tela como está o problema (ex.: digite "/" no campo).`, 1200); await sleep(1000); }
    try { const t = await estruturaTela(); baixar(`atendezap-estrutura-${stamp()}.json`, t, 'application/json'); toast(`Estrutura salva (${Math.round(t.length / 1024)} KB). Não tem mensagens nem contatos; envie ao Claude junto com um print do problema.`, 6500); }
    catch (e) { toast('Não foi possível capturar: ' + e.message); }
  }

  // ----- Autodiagnóstico -----
  // Roda sozinho: ao conectar, na 1ª conversa aberta, a cada 30 min, quando o WhatsApp muda de versão e após erros seguidos.
  // Guarda um histórico curto (diagEstado.historico) e mostra um aviso quando alguma função fica ✖.
  const AUTO = { busy: false, ultimo: null, errosDesde: 0, primeiraConversa: false };
  async function autoDiag(motivo) {
    const estado = (await chrome.storage.local.get('diagEstado')).diagEstado || {};
    if (estado.auto === false || AUTO.busy) return;
    AUTO.busy = true;
    try {
      const res = await runChecks(motivo);
      AUTO.ultimo = res;
      AUTO.errosDesde = 0;
      const n = { ok: 0, warn: 0, bad: 0, skip: 0 };
      res.results.forEach((r) => n[stOf(r.ok)]++);
      const afetadas = ALL.filter((f) => res.saude[f].st === 'bad');
      const waVersion = res.data.whatsapp;
      const mudou = estado.waVersion && waVersion && estado.waVersion !== waVersion;
      const historico = [{ data: res.data.data, motivo, whatsapp: waVersion, ok: n.ok, warn: n.warn, bad: n.bad, skip: n.skip, afetadas }, ...(estado.historico || [])].slice(0, 15);
      const assinatura = afetadas.join('|');
      const novo = { ...estado, waVersion: waVersion || estado.waVersion, historico, afetadas, ultimo: res.data.data };
      if (!afetadas.length) novo.dispensado = '';
      await chrome.storage.local.set({ diagEstado: novo });
      S.saude = { afetadas, dispensado: novo.dispensado === assinatura && !!assinatura };
      if (mudou && !afetadas.length) toast(`O WhatsApp atualizou (versão ${waVersion}). Autoteste: tudo funcionando ✔`, 7000);
      if (mudou && afetadas.length) S.saude.dispensado = false;
      renderPanel(); renderAlerta();
    } catch (e) {
      logErr('autoDiag', e.message);
    } finally { AUTO.busy = false; }
  }
  // Cartão de aviso (fica até dispensar; volta se o problema mudar)
  const alertaBox = h('div');
  panelRoot.append(alertaBox);
  function renderAlerta() {
    const sa = S.saude;
    if (!sa?.afetadas?.length || sa.dispensado) return alertaBox.replaceChildren();
    alertaBox.replaceChildren(h('div', { class: 'alerta', style: `right:${ui.open ? painelW() + 16 : 56}px` },
      h('b', null, '⚠ O WhatsApp mudou algo'),
      h('p', null, 'Podem não funcionar: ', h('strong', null, sa.afetadas.join(', ')), '. Envie o relatório para o Claude ajustar.'),
      h('div', { class: 'rowf' },
        h('button', { class: 'gbtn sm', onclick: () => baixarRelatorio(AUTO.ultimo) }, 'Baixar relatório'),
        h('button', { class: 'gbtn out sm', onclick: () => openPanel('diag') }, 'Abrir Diagnóstico'),
        h('button', { class: 'obtn', onclick: async () => {
          const st = (await chrome.storage.local.get('diagEstado')).diagEstado || {};
          await chrome.storage.local.set({ diagEstado: { ...st, dispensado: sa.afetadas.join('|') } });
          S.saude.dispensado = true; renderAlerta(); renderPanel();
        } }, 'Dispensar'))));
  }
  // Vigia: WhatsApp carregado (lista de conversas na tela) e a extensão sem conectar depois de 60 s.
  function vigiaConexao() {
    setTimeout(() => {
      if (S.ready || !document.getElementById('side')) return;
      S.saude = { afetadas: ['Conexão com o WhatsApp (todas as funções)'], dispensado: false };
      logErr('conexão', 'a extensão não conectou à wa-js em 60 s com o WhatsApp carregado');
      runChecks('sem conexão').then((r) => { AUTO.ultimo = r; renderAlerta(); renderPanel(); });
    }, 60000);
  }

  // ===================== LABORATÓRIO =====================
  // Chaves de recurso escondidas do WhatsApp com botão liga/desliga (só neste navegador). Ver bridge.js (LAB).
  // [título, onde testar, como saber se funcionou, chaves que ligam junto (o WhatsApp exige o par)]
  // Laboratório curado (v1.18): UMA entrada por recurso (as chaves "irmãs" ligam junto). Formato: [título, onde testar, funcionou se, [junto], pacote?].
  // pacote=true: já apareceu na conta do Johon -> entra no interruptor único "Pacote que funciona". Fora daqui, de propósito:
  //  • as que ele testou e NÃO aparecem (dependem do servidor — não voltam a ser sugeridas; se o WhatsApp um dia ligar uma delas,
  //    a seção "Novidades do WhatsApp" avisa que a chave virou liga/desliga);
  //  • as que JÁ VÊM LIGADAS no WhatsApp (nada a habilitar) e as redundantes (ex.: a do "/" nativo, que o AtendeZap já cobre).
  // Chaves de recurso que não estão aqui continuam acessíveis em "Todas as chaves" (avançado).
  const LAB_SUGERIDOS = {
    scheduled_messages_sender_enabled: ["Agendar mensagens (texto, fotos e vídeos)", "Digite uma mensagem e clique com o botão direito (ou segure) no botão Enviar; em fotos, na tela de prévia.", "Aparece \"Agendar mensagem\" com data e hora.", ["scheduled_messages_photo_video_sender_enabled"], true],
    enable_events_v2_entry_points_creation: ["Eventos (criar e adicionar à agenda)", "Num grupo: clipe 📎 › Evento; e abrindo um evento recebido.", "Aparece \"Evento\" e o botão de adicionar à agenda.", ["enable_events_v2_add_to_calendar"], true],
    album_v2_sender_enabled: ["Álbum de fotos e fotos com movimento", "Envie 4 ou mais fotos de uma vez; ou receba/envie uma foto com movimento.", "Chegam agrupadas num álbum novo; a foto com movimento mexe ao passar o mouse.", ["wa_web_send_motion_photo", "wa_web_show_motion_photo"], true],
    web_group_admin_console_enabled: ["Administração de grupo", "Num grupo em que você é admin: dados do grupo.", "Painel de administração reunido, adicionar vários contatos de uma vez, histórico para novos membros e etiqueta ao lado do seu nome.", ["web_group_bulk_add_contact", "group_history_send", "member_name_tag_sender_enabled", "web_bulk_add_contacts_enabled", "web_add_member_smart_suggestions_enabled", "member_name_tag_receiver_enabled"], true],
    wa_web_composer_height_increase_enabled: ["Campo de mensagem melhorado", "Digite um texto longo e selecione uma parte do texto.", "O campo cresce mais e o menu de formatação tem lista, citação e código.", ["expanded_formatting_menu_items_enabled", "expanded_formatting_multiline_quotes"], true],
    wa_web_quick_reactions: ["Reações rápidas", "Passe o mouse sobre uma mensagem; ou clique com o botão direito nela.", "As reações aparecem direto e também junto do menu.", ["wa_web_hybrid_context_menu_reactions_enabled", "wa_web_scrollable_reaction_tray_enabled", "wa_web_frequent_reactions_store_enabled"], true],
    web_multi_skin_toned_emoji_picker: ["Emojis: tons de pele e busca", "Abra os emojis 😊 no campo de mensagem.", "Aparece busca por nome e tons de pele para cada pessoa do emoji.", ["wa_web_search_emoji_picker"], true],
    enable_photo_thumbnails_in_chat_list: ["Lista de conversas e busca", "Lista de conversas; menu ⋮ do topo; digitar um número na busca.", "Miniatura de foto na lista, \"Selecionar todas\", buscar número sem salvar contato e contador no ícone da aba.", ["wa_web_select_all_chats_enabled", "web_phone_number_global_search", "wa_web_favicon_badging_enabled"], true],
    wa_web_discuss_privately: ["Conversa e contato", "Num grupo, menu ⌄ da mensagem; dados do contato; envie ou receba um link.", "Responder em particular, botões novos nos dados do contato, anel de status e prévia de link na horizontal.", ["web_chat_info_action_buttons_refresh", "wa_web_enable_chat_thread_and_info_status_ring", "wa_web_horizontal_link_previews"], true],
    web_calling_missed_call_banner: ["Chamadas: melhorias", "Depois de perder uma ligação; numa chamada de vídeo.", "Faixa de ligação perdida, sua câmera pode aumentar e a chamada de vídeo abre em janela própria.", ["web_calling_self_preview_enlarge", "web_calling_auto_popout_video", "web_calling_full_screen_toggle_enabled"], true],
    status_likes_sending_enabled: ["Curtir status", "Abra o status de um contato.", "Aparece um botão de ❤ para curtir.", ["web_status_likes_poster_counter_enabled"], true],
    pinned_messages_infinite_sender_enabled: ["Fixar mensagem sem prazo", "Na mensagem: menu ⌄ › Fixar.", "A janela de duração mostra uma opção sem prazo (ou prazos novos) além de 24 h, 7 e 30 dias.", ["pinned_messages_infinite_receiver_enabled", "pinned_messages_sender_short_expiry_durations_enabled"], true],
    privacy_screen_enabled: ["Tela de privacidade", "Configurações › Privacidade.", "Aparece opção para esconder/borrar o conteúdo da tela.", [], true],
    group_admin_hub: ["Admin de grupo: pedidos pendentes e perguntas", "Num grupo em que você é admin: dados do grupo e a própria conversa.", "Central do admin, faixa fixa de pedidos pendentes, denunciar ao admin e perguntas/formulário para entrar no grupo.", ["pending_group_requests_persistent_banner", "report_to_admin_enabled", "group_membership_form_setting_enabled", "group_membership_form_review_enabled", "group_join_validation_questions_setting_enabled"]],
    br_consumer_pix_groups_web_enabled: ["Pix: em grupos e copiar código/chave", "Num grupo: clipe 📎; e numa conversa com comprovante ou pedido de Pix.", "Pedir/enviar Pix no grupo e botão \"Copiar código/chave Pix\" no cartão do pagamento.", ["br_payments_pix_groups_enabled", "payments_receipt_and_state_copy_pix_code_p2p", "payments_receipt_and_state_copy_pix_code_p2m", "payments_receipt_and_state_copy_pix_key_p2p", "payments_receipt_and_state_copy_pix_key_p2m"]],
    wa_web_status_resharer_flow_enabled: ["Status: repostar", "Abra o status de outra pessoa.", "Aparece a opção de repostar o status.", ["wa_web_status_reshare_attribution_enabled", "wa_web_reshare_poster_side_enabled"]],
    message_partial_selection_m2: ["Texto: trecho, menção e spoiler", "Numa conversa: arraste sobre o texto de uma mensagem; num grupo, seja mencionado; formate um texto.", "Dá para marcar só parte do texto, a sua menção fica destacada e há formato \"spoiler\" (texto escondido).", ["message_partial_selection_discoverability", "message_partial_selection_in_bubble", "wa_web_highlight_me_mention", "is_spoiler_rich_format_sender_enabled", "is_spoiler_rich_format_enabled"]],
    wa_web_large_group_presence_enabled: ["Ver quem está online/digitando em grupos", "Abra um grupo.", "Aparece quem está online ou digitando.", ["wa_web_small_group_presence_enabled"]],
    poll_add_option_enabled: ["Enquetes: adicionar opções", "Crie uma enquete.", "Aparece \"permitir que outros adicionem opções\".", ["poll_add_option_creator_enabled", "poll_add_option_participant_enabled", "poll_add_option_receiving_enabled"]],
    enable_video_thumbnails_in_chat_list: ["Lista: miniatura de vídeo e filtros inteligentes", "Lista de conversas, numa conversa cuja última mensagem é um vídeo; barra de filtros no topo.", "Aparece a miniatura do vídeo e filtros novos na lista.", ["smart_filters_enabled_consumer"]],
    smb_web_customer_management_custom_fields: ["Gerenciador de clientes (Business)", "Menu ⋮ › Ferramentas comerciais › Contatos.", "Tela de clientes com listas, filtros, campos personalizados e exportar/importar.", ["smb_web_customer_management_enabled", "smb_web_customer_management_import_export", "smb_web_customer_manager_export_enabled", "smb_web_customer_manager_bulk_edit_enabled", "smb_web_customer_manager_date_range_filter_enabled", "smb_web_customer_manager_dob_filter_enabled", "smb_web_customer_manager_header_menu_enabled", "smb_contact_manager_sublist_enabled", "contact_manager_mvp_enabled", "smb_contact_manager_hidden_contacts_enabled"]],
    web_date_marker_calendar_enabled: ["Pular para uma data pelo calendário", "Dentro de uma conversa, clique na data que aparece no topo das mensagens (ex.: \"Hoje\").", "Abre um calendário para ir direto a outro dia.", ["web_calendar_message_density_enabled"]],
    message_yourself_edit_window_is_forever_enabled: ["Editar mensagens para você mesmo sem prazo", "Na conversa \"Você\": menu ⌄ da mensagem › Editar, mesmo depois de muito tempo.", "A opção Editar continua disponível sem o limite de tempo.", []],
  };
  const LAB_TESTES = 'labTestes'; // { chave: { res: 'sim'|'nao', data } } — entra no relatório
  const lab = { dados: null, filtro: 'desligados', q: '', aba: 'funciona', refs: null, refsLendo: false, pacoteBusy: false };
  // v1.16 — "o que cada chave controla": lê o texto dos módulos do WhatsApp e acha onde o nome de cada chave aparece
  const salvarRefs = async (r, versao) => {
    lab.refs = { versao, t: new Date().toISOString(), stats: r.stats, nomes: Object.fromEntries(Object.entries(r.nomes).map(([k, v]) => [k, v.map((n) => n.replace(/^WAWeb/, ''))])) };
    await chrome.storage.local.set({ refCache: lab.refs });
  };
  async function lerCodigoWA() {
    lab.refsLendo = true; renderPanel();
    try {
      const r = await call('referencias');
      await salvarRefs(r, (await call('diag').catch(() => ({}))).waVersion || null);
      toast(`Li ${r.stats.portoes.carregados} módulos-portão (${r.stats.portoes.funcoes} funções) em ${(r.stats.ms / 1000).toFixed(1)} s: ${r.stats.flagsComModulo} chaves ligadas a um recurso.`, 6500);
    } catch (e) { toast('Não consegui ler o código: ' + e.message); }
    lab.refsLendo = false; renderPanel();
  }
  async function loadLab() {
    chrome.storage.local.get('refCache').then((d) => { if (d.refCache && !lab.refs) { lab.refs = d.refCache; renderPanel(); } });
    try { lab.dados = await call('labList'); } catch (e) { lab.dados = { erro: e.message, recursos: [], overrides: {} }; }
    lab.testes = (await chrome.storage.local.get(LAB_TESTES))[LAB_TESTES] || {};
    // O WhatsApp passou a ligar sozinho algo que você tinha ligado: tira do Laboratório (já é nativo)
    const nativos = (lab.dados.recursos || []).filter((r) => comoBool(r.valor) && Object.prototype.hasOwnProperty.call(lab.dados.overrides || {}, r.nome));
    for (const r of nativos) {
      try { lab.dados = { ...lab.dados, ...(await call('labSet', r.nome, null)) }; } catch {}
      lab.testes[r.nome] = { res: 'nativo', data: new Date().toISOString(), auto: true };
    }
    if (nativos.length) await chrome.storage.local.set({ [LAB_TESTES]: lab.testes });
    renderPanel();
  }
  const ehBool = (v) => typeof v === 'boolean' || v === 0 || v === 1 || v === 'true' || v === 'false';
  const comoBool = (v) => v === true || v === 1 || v === 'true';
  async function labToggle(nome, original, ligar, junto = []) {
    const valorDe = (orig) => comoBool(orig) === ligar ? null : (typeof orig === 'number' ? (ligar ? 1 : 0) : ligar);
    if (lab.testes?.[nome]) { delete lab.testes[nome]; await chrome.storage.local.set({ [LAB_TESTES]: lab.testes }); } // mudou: testar de novo
    try {
      let est = await call('labSet', nome, valorDe(original));
      for (const n of junto) { // chaves que o WhatsApp exige junto; só as que existem e são liga/desliga
        const r = lab.dados.recursos?.find((x) => x.nome === n);
        if (r && ehBool(r.valor)) est = await call('labSet', n, valorDe(r.valor));
      }
      lab.dados = { ...lab.dados, ...est };
      lab.mudou = true;
      renderPanel();
    } catch (e) { toast('Não foi possível alterar: ' + e.message); }
  }
  async function labPacote(ligar) {
    lab.pacoteBusy = true; renderPanel();
    try {
      let est;
      for (const [nome, info] of Object.entries(LAB_SUGERIDOS)) {
        if (info[4] !== true || lab.testes?.[nome]?.res === 'nativo') continue;
        for (const n of [nome, ...(info[3] || [])]) {
          const r = lab.dados.recursos?.find((x) => x.nome === n);
          if (!r || !ehBool(r.valor)) continue; // só as que existem e são liga/desliga
          est = await call('labSet', n, comoBool(r.valor) === ligar ? null : (typeof r.valor === 'number' ? (ligar ? 1 : 0) : ligar));
        }
      }
      if (est) { lab.dados = { ...lab.dados, ...est }; lab.mudou = true; }
    } catch (e) { toast('Não foi possível alterar o pacote: ' + e.message); }
    lab.pacoteBusy = false; renderPanel();
  }
  function labView() {
    if (!lab.dados) { loadLab(); return [h('p', { class: 'hint' }, 'Lendo as chaves de recurso do WhatsApp…')]; }
    const d = lab.dados;
    const ov = d.overrides || {};
    const nAlt = Object.keys(ov).length;
    const jaLigado = (r) => ehBool(r.valor) && comoBool(r.valor) && !Object.prototype.hasOwnProperty.call(ov, r.nome);
    // só liga/desliga; números e textos são ajustes internos (limites, tempos, modelos), não opções
    const todos = (d.recursos || []).filter((r) => r.nome && !r.erro && ehBool(r.valor) && !jaLigado(r));
    const marcar = async (nome, res) => {
      lab.testes = { ...lab.testes, [nome]: res ? { res, data: new Date().toISOString() } : undefined };
      if (!res) delete lab.testes[nome];
      await chrome.storage.local.set({ [LAB_TESTES]: lab.testes });
      renderPanel();
    };
    const linha = (r, info) => {
      const alterado = Object.prototype.hasOwnProperty.call(ov, r.nome);
      const atual = alterado ? ov[r.nome] : r.valor;
      const bool = ehBool(r.valor);
      const [rotulo, onde, como, junto = []] = Array.isArray(info) ? info : [info];
      const teste = lab.testes?.[r.nome]?.res;
      return h('div', { class: 'labr' + (alterado ? ' alt' : '') + (teste ? ' t-' + teste : '') },
        h('div', { class: 'grow' },
          rotulo ? h('b', null, rotulo) : null,
          rotulo ? null : h('code', null, r.nome),
          !rotulo && U.palpite(r.nome) ? h('small', { class: 'palpite' }, '🔎 Pelo nome: ' + U.palpite(r.nome) + (/^(ai|biz_ai|smba_)/.test(r.nome) ? ' — quase sempre depende do servidor' : '')) : null,
          rotulo ? null : h('small', null, `original: ${String(r.valor)}${alterado ? ` · agora: ${String(atual)}` : ''}`),
          lab.refs?.nomes?.[r.nome]?.length ? h('small', { class: 'usos', title: 'Módulos do WhatsApp onde o nome desta chave aparece: pista do que ela controla' }, '🧩 Usada em: ' + lab.refs.nomes[r.nome].join(', ')) : null,
          onde ? h('div', { class: 'labinfo' }, h('span', null, '📍 Onde testar: ', onde), h('span', null, '✔ Funcionou se: ', como),
            junto.length ? h('span', { class: 'mut' }, '🔗 Liga junto: ', junto.join(', ')) : null) : null,
          rotulo ? h('details', { class: 'tec' }, h('summary', null, 'detalhes técnicos'),
            h('code', null, r.nome), h('small', null, `original: ${String(r.valor)}${alterado ? ` · agora: ${String(atual)}` : ''}`)) : null,
          alterado && onde ? h('div', { class: 'labtest' },
            h('span', null, 'Depois de recarregar e testar:'),
            h('button', { class: 'obtn' + (teste === 'sim' ? ' on' : ''), onclick: () => marcar(r.nome, teste === 'sim' ? null : 'sim') }, '✔ Apareceu'),
            h('button', { class: 'obtn dan' + (teste === 'nao' ? ' on' : ''), onclick: () => marcar(r.nome, teste === 'nao' ? null : 'nao') }, '✖ Não apareceu')) : null,
          onde && teste !== 'nativo' ? h('button', { class: 'lnk', title: 'Esse recurso já existia no seu WhatsApp sem o Laboratório: desliga a chave e tira da lista', onclick: async () => {
            for (const n of [r.nome, ...junto]) if (Object.prototype.hasOwnProperty.call(ov, n)) lab.dados = { ...lab.dados, ...(await call('labSet', n, null)) };
            lab.mudou = true; marcar(r.nome, 'nativo');
          } }, '◎ Já tenho isso (nativo)') : null,
          teste === 'nativo' ? h('button', { class: 'lnk', onclick: () => marcar(r.nome, null) }, '↩ Não é nativo (voltar para Para testar)') : null),
        bool ? h('label', { class: 'tog', title: alterado ? 'Alterado por você' : 'Valor do WhatsApp' },
          h('input', { type: 'checkbox', checked: comoBool(atual), onchange: (e) => labToggle(r.nome, r.valor, e.target.checked, junto) }), h('i'))
          : h('small', { class: 'mut' }, 'não é liga/desliga'));
    };
    const q = lab.q.toLowerCase();
    let lista;
    // Abas por etapa do teste: cada recurso sugerido está em exatamente uma
    const alt = (n) => Object.prototype.hasOwnProperty.call(ov, n);
    const junto = new Set(Object.values(LAB_SUGERIDOS).flatMap((i) => i[3] || []));
    const sug = Object.entries(LAB_SUGERIDOS).map(([n, info]) => [todos.find((r) => r.nome === n), info]).filter(([r]) => r);
    const pac = ([, info]) => Array.isArray(info) && info[4] === true; // entrada do pacote (já apareceu na conta)
    const res = (r) => lab.testes?.[r.nome]?.res;
    const ETAPAS = {
      funciona: (x) => res(x[0]) !== 'nativo' && (pac(x) || res(x[0]) === 'sim'),
      paratestar: (x) => !pac(x) && !alt(x[0].nome) && !lab.testes?.[x[0].nome],
      nativo: ([r]) => res(r) === 'nativo',
      testando: (x) => !pac(x) && alt(x[0].nome) && !lab.testes?.[x[0].nome],
    };
    // as testadas que NÃO aparecem não ocupam nenhuma aba (só aparecem em "Todas as chaves", com a marca do teste)
    const pacoteLista = sug.filter((x) => pac(x) && res(x[0]) !== 'nativo');
    const nLigados = pacoteLista.filter(([r]) => alt(r.nome) && comoBool(ov[r.nome])).length;
    const pacoteLigado = pacoteLista.length > 0 && nLigados === pacoteLista.length;
    // ligadas fora das sugestões (pela aba Todas) também contam como "testando"
    const extras = todos.filter((r) => alt(r.nome) && !LAB_SUGERIDOS[r.nome] && !junto.has(r.nome)).map((r) => [r, null]);
    const listaDe = (k) => (k === 'paratestar' || k === 'nativo' ? sug : [...sug, ...extras]).filter(ETAPAS[k]);
    if (ETAPAS[lab.aba]) {
      lista = listaDe(lab.aba);
    } else {
      // sem as internas (a menos que peça) e sem as que só ligam junto com uma sugestão
      lista = todos.filter((r) => lab.testes?.[r.nome]?.res !== 'nativo' && (lab.internas || (!U.semUso(r.nome) && !junto.has(r.nome)) || alt(r.nome)) && (!q || r.nome.toLowerCase().includes(q) || (LAB_SUGERIDOS[r.nome]?.[0] || '').toLowerCase().includes(q)) &&
        ((lab.filtro === 'alterados' ? Object.prototype.hasOwnProperty.call(ov, r.nome) : ehBool(r.valor) && !comoBool(r.valor))))
        .slice(0, 200).map((r) => [r, LAB_SUGERIDOS[r.nome]]);
    }
    const busca = h('input', { class: 'in sm lbq', placeholder: 'Buscar chave (ex: poll, schedul, status)', value: lab.q, oninput: (e) => {
      lab.q = e.target.value; renderPanel();
      const el = panelRoot.querySelector('.lbq'); el?.focus(); el?.setSelectionRange(lab.q.length, lab.q.length);
    } });
    const chip = (k, label, alvo = 'filtro') => h('button', { class: 'fchip' + (lab[alvo] === k ? ' on' : ''), onclick: () => { lab[alvo] = k; renderPanel(); } }, label);
    return [
      h('div', { class: 'labwarn' },
        h('b', null, '🧪 Recursos em teste do WhatsApp'),
        h('p', null, 'Liga só neste navegador. Muitos dependem do servidor do WhatsApp: mesmo ligado, o recurso pode não aparecer. Teste um de cada vez: ligue, recarregue, veja "Onde testar" e marque ✔ Apareceu ou ✖ Não apareceu. Se algo travar, use "Voltar ao normal".')),
      h('div', { class: 'rowf' },
        h('button', { class: 'gbtn out sm', disabled: lab.refsLendo, title: 'Lê o texto dos módulos do WhatsApp e mostra, em cada chave, onde o nome dela aparece (pista do que ela controla). Leva alguns segundos.', onclick: lerCodigoWA },
          lab.refsLendo ? 'Lendo o código…' : lab.refs ? '🧩 Reler o código do WhatsApp' : '🧩 Descobrir o que cada chave controla'),
        lab.refs ? h('small', { class: 'hint' }, `${lab.refs.stats.flagsComModulo} de ${lab.refs.stats.flagsTotal} chaves ligadas a um recurso · lido em ${new Date(lab.refs.t).toLocaleDateString('pt-BR')}`) : null,
        (() => { const t = Object.values(lab.testes || {}).filter((v) => v.res === 'sim' || v.res === 'nao'); const sim = t.filter((v) => v.res === 'sim').length;
          return t.length ? h('small', { class: 'hint' }, `Você já testou ${t.length}: ${sim} apareceram, ${t.length - sim} não.`) : null; })()),
      d.pausado ? h('div', { class: 'labwarn bad' }, h('b', null, '⏸ Laboratório pausado'), h('p', null, String(d.pausado)),
        h('div', { class: 'rowf' }, h('button', { class: 'gbtn sm', onclick: async () => { lab.dados = { ...d, ...(await call('labRetomar')) }; lab.mudou = true; renderPanel(); } }, 'Reativar'),
          h('button', { class: 'gbtn out sm', onclick: async () => { lab.dados = { ...d, ...(await call('labReset')) }; renderPanel(); } }, 'Voltar ao normal'))) : null,
      h('div', { class: 'rowf meta' },
        h('span', { class: 'pill' + (nAlt ? ' on' : '') }, `${nAlt} alterada(s)`),
        h('span', { class: 'hint grow' }, `${todos.filter((r) => ehBool(r.valor) && !comoBool(r.valor)).length} desligadas (as já ligadas pelo WhatsApp não aparecem)`),
        h('button', { class: 'obtn', disabled: !nAlt, onclick: async () => {
          if (!await confirmar('Desfazer todas as alterações do Laboratório?')) return;
          lab.dados = { ...d, ...(await call('labReset')) }; lab.mudou = true; renderPanel();
        } }, 'Voltar ao normal')),
      lab.mudou ? h('div', { class: 'labwarn ok' }, h('p', null, 'Alguns recursos só aparecem depois de recarregar o WhatsApp.'),
        h('button', { class: 'gbtn sm', onclick: () => call('recarregar') }, 'Recarregar o WhatsApp agora')) : null,
      h('div', { class: 'fchips stages' },
        chip('funciona', `✔ Funcionando (${listaDe('funciona').length})`, 'aba'),
        chip('paratestar', `🆕 Para testar (${listaDe('paratestar').length})`, 'aba'),
        chip('testando', `⏳ Testando (${listaDe('testando').length})`, 'aba'),
        listaDe('nativo').length ? chip('nativo', `◎ Já nativos (${listaDe('nativo').length})`, 'aba') : null,
        chip('todas', '🔎 Avançado: todas as chaves', 'aba')),
      // interruptor único do pacote (v1.18): em vez de ligar um por um, liga/desliga tudo o que já apareceu na sua conta
      lab.aba === 'funciona' && pacoteLista.length ? h('div', { class: 'labwarn ok pacote' },
        h('div', null, h('b', null, `Pacote que funciona (${pacoteLista.length} recursos)`),
          h('p', null, 'Todos já apareceram na sua conta. Um interruptor liga ou desliga tudo (as chaves "irmãs" vão junto).' + (pacoteLigado ? '' : ` Hoje: ${nLigados} de ${pacoteLista.length} ligados.`))),
        h('label', { class: 'tog', title: 'Liga ou desliga o pacote inteiro' },
          h('input', { type: 'checkbox', checked: pacoteLigado, disabled: lab.pacoteBusy, onchange: (e) => labPacote(e.target.checked) }), h('i'))) : null,
      h('p', { class: 'hint' }, {
        paratestar: 'Ainda desligados e nunca testados. Ligue um, recarregue e veja "Onde testar".',
        testando: 'Ligados e esperando você testar: depois de recarregar, marque ✔ ou ✖.',
        funciona: 'Apareceram na sua conta. Use o interruptor do pacote (ou ligue um a um) e deixe ligados para continuar usando.',
        nativo: 'Já existem no seu WhatsApp sem o Laboratório: ficam fora das outras abas. Só para desfazer se marcou errado.',
        todas: 'Avançado: todas as chaves liga/desliga do WhatsApp (as testadas que não aparecem ficam só aqui, com a marca do teste). Para quem quer procurar por nome.' }[lab.aba] || ''),
      lab.aba === 'todas' ? [busca, h('div', { class: 'fchips' }, chip('desligados', 'Desligadas'), chip('alterados', 'Alteradas'),
        h('button', { class: 'fchip' + (lab.internas ? ' on' : ''), title: 'Chaves de registro, travas, migração, experimentos e as que só servem de par para outra', onclick: () => { lab.internas = !lab.internas; renderPanel(); } }, 'Mostrar internas'))] : null,
      lista.length ? h('div', { class: 'col' }, lista.map(([r, rot]) => linha(r, rot)))
        : h('p', { class: 'empty' }, { paratestar: 'Você já testou todas as sugestões. Peça novas ao Claude mandando o mapa.', funciona: 'Nenhum marcado como ✔ Apareceu ainda.',
          testando: 'Nada ligado esperando teste.' }[lab.aba] || 'Nada encontrado.'),
      lab.aba === 'todas' ? h('p', { class: 'hint' }, 'Mostrando até 200. Use a busca para achar outras.') : null,
      h('div', { class: 'center' }, h('button', { class: 'ib', title: 'Recarregar lista', onclick: () => { lab.dados = null; renderPanel(); } }, '↻ atualizar lista')),
    ];
  }

  function novidadesCard(inv) {
    const hist = inv?.hist || [];
    const dd = (t) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const nm = (n) => String(n).replace(/^WAWeb/, ''), pal = (n) => (U.palpite(n) ? ' · ' + U.palpite(n) : '');
    const relMod = (n) => { const k = U.relevanciaModulo(n); return k.length ? ' · ' + k.map((x) => U.REL[x]).join('/') : ''; };
    const chips = (r) => U.relLista(r).map(([, nome, n]) => h('span', { class: 'nvtag', title: 'Pelo nome dos módulos (palpite)' }, `${nome} ${n}`));
    const lista = (titulo, itens, aberto = false) => (itens.length ? h('details', { class: 'tec', open: aberto }, h('summary', null, titulo), itens.map((x) => h('small', null, x))) : null);
    const entrada = (e, i) => h('div', { class: 'card pedplano' }, h('div', { class: 'grow' },
      h('b', null, `${dd(e.tAnt)} → ${dd(e.t)}`),
      h('small', null, e.de && e.ate && e.de !== e.ate ? `WhatsApp ${e.de} → ${e.ate}` : 'mesma versão do WhatsApp (o servidor liberou ou carregou mais coisas)'),
      chips(U.relEntrada(e)).length ? h('div', { class: 'nvrel' }, chips(U.relEntrada(e))) : null,
      lista(`Viraram liga/desliga (${e.nVirou})`, e.flagsVirou.map((f) => `${f.nome}: ${f.de} → ${f.para}${pal(f.nome)}`), i === 0),
      lista(`Chaves novas (${e.nFlags})`, e.flagsNovas.map((f) => `${f.nome} = ${f.valor}${pal(f.nome)}`), i === 0),
      lista(`Módulos novos (${e.nMod})`, e.modNovos.map((n) => nm(n) + relMod(n))), lista(`Módulos que sumiram (${e.nSum})`, e.modSumiram.map(nm)),
      lista(`Chaves que sumiram (${e.nFlagsSum})`, e.flagsSumiram)));
    return h('div', { class: 'sec' }, h('div', { class: 'sh' }, tile('pulse'), h('b', { class: 'grow' }, 'Novidades do WhatsApp')),
      h('p', { class: 'hint' }, 'A cada autoteste comparo os módulos e as chaves do WhatsApp com a leitura anterior. Aqui aparece o que chegou, sumiu ou virou liga/desliga (um beta chegando).'),
      (() => { // destaque: o que mexe com grupos/Business nas últimas atualizações
        const tot = {}; for (const e of hist.slice(0, 4)) for (const [k, n] of Object.entries(U.relEntrada(e))) tot[k] = (tot[k] || 0) + n;
        const l = U.relLista(tot).map(([, nome, n]) => `${nome} ${n}`);
        return l.length ? h('small', { class: 'iaav' }, `Nas últimas ${Math.min(4, hist.length)} leitura(s), mexem com o que você usa: ${l.join(', ')}. É só pelos nomes dos módulos: não quer dizer que o recurso já esteja ligado para você.`) : null;
      })(),
      hist.length ? hist.slice(0, 4).map(entrada) : h('p', { class: 'hint' }, inv?.base ? `Nada mudou desde ${dd(inv.base)}.` : 'Primeira leitura guardada agora; as novidades aparecem a partir da próxima.'));
  }
  function diagView() {
    const out = h('div', { class: 'col' }, h('p', { class: 'hint' }, 'Analisando o WhatsApp Web (inclui testes ao vivo, leva alguns segundos)…'));
    (async () => {
      const res = await runChecks('manual');
      AUTO.ultimo = res;
      const { results, saude } = res;
      const n = { ok: 0, warn: 0, bad: 0, skip: 0 };
      results.forEach((r) => n[stOf(r.ok)]++);
      const grupos = [...new Set(results.map((r) => r.grupo))];
      const estado = (await chrome.storage.local.get('diagEstado')).diagEstado || {};
      const hist = estado.historico || [];
      out.replaceChildren(...h('div', null,
        h('div', { class: 'dsum' },
          h('span', { class: 'ok' }, `✔ ${n.ok}`), h('span', { class: 'warn' }, `⚠ ${n.warn}`), h('span', { class: 'bad' }, `✖ ${n.bad}`), n.skip ? h('span', { class: 'skip', title: 'Não testados: precisam de uma conversa aberta' }, `○ ${n.skip}`) : null,
          h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: view.diagOnly, onchange: (e) => { view.diagOnly = e.target.checked; renderPanel(); } }), 'Só avisos e problemas')),
        // v1.18: à vista só o de uso diário; o resto (arquivos para o Claude) fica recolhido para não encher a tela
        h('div', { class: 'center' },
          h('button', { class: 'gbtn sm', title: 'Texto curto (≈10 linhas) para colar na conversa com o Claude: o que está ruim, o que mudou desde a última vez e o custo do AtendeZap', onclick: () => copiarResumo(res) }, 'Copiar resumo'),
          h('button', { class: 'gbtn out sm', onclick: () => renderPanel() }, 'Analisar de novo'),
          h('button', { class: 'gbtn sm', title: 'A IA lê o resumo técnico e explica em português o que está errado e o que fazer', disabled: ia.diag?.carregando, onclick: () => iaDiagnostico(res) }, '✨ Explicar com IA')),
        acessoOculto('diagAvancado') ? null : h('details', { class: 'tec maisdiag', open: !!view.diagMais, ontoggle: (e) => { view.diagMais = e.target.open; } },
          h('summary', null, 'Avançado: arquivos para suporte (enviar ao Claude)'),
          h('div', { class: 'center' },
            h('button', { class: 'gbtn sm', title: 'UM arquivo .zip com relatório, mapa do WhatsApp (e o que mudou), estrutura da tela, ambiente, erros, chamadas e envios à IA. Sem mensagens, contatos, convite nem chave: é o que enviar ao Claude', onclick: () => pacoteDiagnostico(res) }, 'Gerar pacote de diagnóstico (.zip)'),
            h('button', { class: 'gbtn out sm', onclick: () => baixarRelatorio(res) }, 'Baixar relatório'),
            h('button', { class: 'gbtn out sm', title: 'Relatório completo em JSON (copia para a área de transferência)', onclick: () => copiarRelatorio(res) }, 'Copiar tudo'),
            h('button', { class: 'gbtn out sm', title: 'Foto da ESTRUTURA da tela (sem mensagens nem contatos) para resolver problemas visuais: envie junto com um print', onclick: baixarEstrutura }, 'Capturar estrutura da tela'),
            h('button', { class: 'gbtn out sm', title: 'Arquivo técnico para o Claude ajustar a extensão quando o WhatsApp mudar (enxuto)', onclick: () => gerarMapa(res) }, 'Gerar mapa do WhatsApp'))),
        h('div', { class: 'sec' },
          h('div', { class: 'sh' }, h('b', null, 'Saúde das funções')),
          (() => { // com "Só avisos e problemas" ligado e tudo bem, não repete 13 quadradinhos iguais: uma linha basta
            const tile = (f) => h('div', { class: 'sf ' + saude[f].st, title: saude[f].motivos.join('\n') }, h('span', null, { ok: '✔', warn: '⚠', bad: '✖', skip: '○' }[saude[f].st]), f);
            if (!view.diagOnly) return h('div', { class: 'saude' }, ALL.map(tile));
            const ruins = ALL.filter((f) => ['warn', 'bad'].includes(saude[f].st)), bons = ALL.filter((f) => saude[f].st === 'ok').length, sem = ALL.filter((f) => saude[f].st === 'skip').length;
            return [ruins.length ? h('div', { class: 'saude' }, ruins.map(tile)) : null, h('small', { class: ruins.length ? 'mut' : 'iaok' }, `✔ ${bons} função(ões) funcionando${sem ? ` · ○ ${sem} sem teste (abra uma conversa)` : ''}${ruins.length ? '' : ' — nada a corrigir'}`)];
          })()),
        iaDiagCard(),
        novidadesCard(res.inv),
        grupos.map((g) => {
          const items = results.filter((r) => r.grupo === g && (!view.diagOnly || (r.ok !== true && r.ok !== 'skip')));
          if (!items.length) return null;
          const closed = view.diagClosed.has(g);
          return h('div', { class: 'dgrp' },
            h('div', { class: 'dgh', onclick: () => { closed ? view.diagClosed.delete(g) : view.diagClosed.add(g); renderPanel(); } },
              h('i', { class: 'dd ' + pior(items.map((r) => stOf(r.ok))) }), h('b', null, g), h('em', null, items.length), icon(closed ? 'down' : 'up', 16)),
            closed ? null : items.map((r) => h('div', { class: 'diag ' + stOf(r.ok) },
              h('span', null, { true: '✔', warn: '⚠', skip: '○' }[r.ok] || '✖'),
              h('div', { class: 'grow' }, h('b', null, r.nome), r.d ? h('small', null, r.d) : null),
              r.acao ? h('button', { class: 'obtn', onclick: async () => { try { await r.acao.fn(); } catch (e) { toast(e.message); } renderPanel(); } }, r.acao.label) : null)));
        }),
        h('div', { class: 'dgrp' },
          h('div', { class: 'dgh' }, h('i', { class: 'dd ok' }), h('b', null, 'Autodiagnóstico'), h('em', null, hist.length)),
          h('label', { class: 'tog' }, h('span', null, 'Testar sozinho ao abrir, a cada 30 min e quando o WhatsApp atualizar'),
            h('input', { type: 'checkbox', checked: estado.auto !== false, onchange: async (e) => { await chrome.storage.local.set({ diagEstado: { ...estado, auto: e.target.checked } }); } }), h('i')),
          hist.slice(0, 6).map((x) => h('div', { class: 'diag ' + (x.bad ? 'bad' : x.warn ? 'warn' : 'ok') },
            h('span', null, x.bad ? '✖' : '✔'),
            h('div', { class: 'grow' }, h('b', null, `${new Date(x.data).toLocaleString('pt-BR')} · ${x.motivo}`),
              h('small', null, `WhatsApp ${x.whatsapp || '?'} · ✔ ${x.ok} ⚠ ${x.warn} ✖ ${x.bad}${x.skip ? ' ○ ' + x.skip : ''}${x.afetadas?.length ? ' · afetadas: ' + x.afetadas.join(', ') : ''}`))))),
        h('p', { class: 'hint' }, 'O relatório não contém mensagens nem contatos. Envie ao Claude quando algo estiver com ✖.')).childNodes);
    })();
    return [h('div', { class: 'eh' }, h('b', null, 'Diagnóstico')), out];
  }

  // ---------- Inicialização ----------
  (async () => {
    await load();
    document.body.append(panelHost, popHost);
    renderPanel();
    // shortcut: polling de 1s para reinserir barra/botões quando o WhatsApp re-renderiza; trocar por MutationObserver se pesar.
    setInterval(T('checagem de 1 s', () => { ensureHead(); esconderLinhas(); syncGruposSo(); }), 1000);
    setInterval(applyPins, 20000); // o WhatsApp pode reordenar/resetar o chat ao receber eventos do servidor
    setInterval(garantirOcultas, 20000);
    setInterval(() => { if (ui.open && ui.sec === 'fila') atualizarFila(); }, 20000);
    setInterval(atualizarFila, 60000);
    setTimeout(atualizarFila, 5000);
    setInterval(checkBackup, 60000);
    vigiaConexao();
    window.addEventListener('resize', () => { if (pop.open) renderPop(); });
    const poll = setInterval(async () => {
      if (S.ready) return clearInterval(poll);
      if (await Promise.race([call('ready'), sleep(1500)])) setReady();
    }, 2000);
  })();
})();
