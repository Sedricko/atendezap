importScripts('lib/iaerro.js', 'lib/acesso.js'); // classificação dos erros do Gemini (pura, também testada em Node)
// Clique no ícone: foca a aba do WhatsApp Web ou abre uma nova.
chrome.action.onClicked.addListener(async () => {
  const [tab] = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  if (!tab) return chrome.tabs.create({ url: 'https://web.whatsapp.com/' });
  await chrome.windows.update(tab.windowId, { focused: true });
  await chrome.tabs.update(tab.id, { active: true });
});

// Lista de cargas: busca o texto no app da Web (Apps Script) da planilha do Johon. Fica aqui no service worker
// porque a extensão tem permissão para script.google.com (do content script o CORS bloquearia).
chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
  if (msg?.tipo !== 'buscarLista') return;
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec(\?.*)?$/.test(msg.url || '')) { responder({ erro: 'link inválido: precisa ser https://script.google.com/macros/s/…/exec' }); return; }
  fetch(msg.url, { redirect: 'follow', credentials: 'omit' })
    .then(async (r) => { const t = await r.text(); responder(r.ok ? { texto: t } : { erro: `a planilha respondeu ${r.status}` }); })
    .catch((e) => responder({ erro: e.message }));
  return true; // resposta assíncrona
});

// ---- Assistente de IA (v1.21) ----
// A chamada à API do Gemini sai DAQUI: a página do WhatsApp bloqueia chamadas externas e a chave da API não pode ficar lá.
// O painel manda { tipo:'ia', op:'modelos' | 'gerar', ... }; a chave é lida do armazenamento da extensão só neste arquivo.
const IA_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const iaEsperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function iaChamar(url, opts, limiteMs = 60000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), limiteMs);
  try { return await fetch(url, { ...opts, signal: ctl.signal, credentials: 'omit' }); } finally { clearTimeout(t); }
}
function iaErro(status, corpo) { return globalThis.AZIERRO.classificar(status, corpo).msg; }
async function iaTratar(m) {
  const { iaCfg = {} } = await chrome.storage.local.get('iaCfg');
  const E = globalThis.AZIERRO, chaves = E.listaChaves(iaCfg).slice(0, Math.max(1, Math.min(6, Number(m.maxChaves) || 6))), kTeste = String(m.chave || '').trim(); // várias chaves: a antiga "chave" única continua valendo
  if (!chaves.length && !(m.op === 'modelos' && kTeste)) return { erro: 'Falta a chave da API (Configurações › Assistente de IA).' };
  if (m.op === 'modelos') {
    const cab = { 'x-goog-api-key': kTeste || chaves[0] }; // m.chave testa UMA chave específica (o painel testa uma por uma)
    const out = []; let pag = '';
    for (let i = 0; i < 5; i++) {
      const r = await iaChamar(`${IA_BASE}/models?pageSize=200${pag ? '&pageToken=' + encodeURIComponent(pag) : ''}`, { headers: cab });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { erro: iaErro(r.status, j) };
      for (const x of j.models || []) if ((x.supportedGenerationMethods || []).includes('generateContent')) out.push({ id: String(x.name).replace(/^models\//, ''), nome: x.displayName || x.name, entrada: x.inputTokenLimit, saida: x.outputTokenLimit });
      pag = j.nextPageToken || ''; if (!pag) break;
    }
    return { modelos: out };
  }
  if (m.op === 'gerar') {
    const principal = String(m.modelo || iaCfg.modelo || '').trim();
    if (!principal) return { erro: 'Escolha o modelo em Configurações › Assistente de IA.' };
    const hoje = new Date().toISOString().slice(0, 10), { iaUso = {} } = await chrome.storage.local.get('iaUso');
    const uso = iaUso.data === hoje ? iaUso : { data: hoje, n: 0, tokens: 0, lat: [], falhas: {}, reserva: 0 }, lim = Number(iaCfg.limiteDia) || 100;
    if (uso.n >= lim) return { erro: `Limite de ${lim} pedidos por dia atingido (dá para mudar em Configurações › Assistente de IA).`, tipo: 'limite-local' };
    const base = { temperature: Number.isFinite(m.temperatura) ? m.temperatura : 0.4, maxOutputTokens: 4096, ...(m.json ? { responseMimeType: 'application/json' } : {}) };
    const reserva = String(iaCfg.modeloReserva || '').trim(), temReserva = !!reserva && reserva !== principal && !m.semReserva;
    // Raciocínio: nos modelos Gemini 3.x ele vem LIGADO no máximo e uma resposta simples pode levar dezenas de segundos. Para tarefas rápidas
    // (m.pensar) tenta o nível mínimo; se o modelo recusar (400 falando de "thinking"), recua para "low", depois budget 0, depois sem pedir nada.
    const ordem = m.pensar ? (m.pensar === 'baixo' ? ['level:low', 'budget:0', 'none'] : ['level:minimal', 'level:low', 'budget:0', 'none']) : ['none'];
    const cfgDe = (k) => (k === 'level:minimal' ? { thinkingLevel: 'minimal' } : k === 'level:low' ? { thinkingLevel: 'low' } : k === 'budget:0' ? { thinkingBudget: 0 } : null);
    const { iaThink = {} } = await chrome.storage.local.get('iaThink');
    // Uma tentativa completa com UM modelo e UMA chave (com o recuo do raciocínio). Devolve { ok, ... } ou { info: { tipo, msg, espera } }.
    const tentar = async (modelo, cab) => {
      const url = `${IA_BASE}/models/${encodeURIComponent(modelo)}:generateContent`, chave = `${modelo}|${m.pensar || ''}`;
      let i = Math.max(0, ordem.indexOf(iaThink[chave])), r, j, t0 = Date.now();
      try {
        for (; i < ordem.length; i++) {
          const tc = cfgDe(ordem[i]);
          const init = { method: 'POST', headers: { ...cab, 'content-type': 'application/json' }, body: JSON.stringify({ systemInstruction: { parts: [{ text: String(m.sistema || '') }] }, contents: m.contents, generationConfig: { ...base, ...(tc ? { thinkingConfig: tc } : {}) } }) };
          t0 = Date.now();
          r = await iaChamar(url, init, Number(m.limiteMs) || 60000);
          if (r.status === 503 && !temReserva) { await iaEsperar(1500); r = await iaChamar(url, init, Number(m.limiteMs) || 60000); } // serviço ocupado: uma segunda tentativa (com reserva, troca de modelo em vez de esperar)
          j = await r.json().catch(() => ({}));
          if (r.status === 400 && tc && /think|reason/i.test(j?.error?.message || '')) continue; // este modelo não aceita esse nível: tenta o seguinte
          break;
        }
      } catch (e) { return { info: E.classificar(0, null, e?.name === 'AbortError' ? 'tempo' : 'rede') }; }
      if (!r.ok) return { info: E.classificar(r.status, j) };
      const ms = Date.now() - t0, cand = j.candidates?.[0], texto = (cand?.content?.parts || []).map((p) => p.text || '').join('').trim();
      if (!texto) return { info: { tipo: 'vazio', msg: j.promptFeedback?.blockReason ? `A IA recusou o pedido (${j.promptFeedback.blockReason}).` : `A IA não devolveu texto${cand?.finishReason ? ' (' + cand.finishReason + ')' : ''}.`, espera: null } };
      const usado = ordem[Math.min(i, ordem.length - 1)];
      if (m.pensar && iaThink[chave] !== usado) { iaThink[chave] = usado; await chrome.storage.local.set({ iaThink: { ...iaThink } }); } // lembra o que este modelo aceita
      return { ok: true, texto, tokens: j.usageMetadata?.totalTokenCount || 0, ms, cortou: cand.finishReason === 'MAX_TOKENS', modelo };
    };
    // Percorre as chaves: as que NÃO estão descansando primeiro. Só troca de chave quando o problema é DA CHAVE (inválida, cota do dia, limite por minuto);
    // instabilidade do Google ou tempo esgotado não melhoram com outra chave (aí vale o modelo reserva). A chave que falhou "descansa" e vai para o fim da fila.
    const { iaChaveEstado = {} } = await chrome.storage.local.get('iaChaveEstado'), estado = { ...iaChaveEstado }, agora = Date.now(), fila = E.ordemChaves(chaves, estado, agora);
    const porChave = { ...(uso.chaves || {}) }, tentativas = [], eventos = [];
    let r = null, usouReserva = false, falhaPrincipal = null, chaveNum = 0;
    for (const k of fila) {
      const id = E.idChave(k), cab = { 'x-goog-api-key': k }; usouReserva = false; falhaPrincipal = null;
      r = await tentar(principal, cab);
      if (!r.ok && temReserva && E.usaReserva(r.info.tipo)) { // o principal falhou por motivo do Google/rede/cota: tenta o reserva na hora, com a mesma chave
        falhaPrincipal = r.info; const r2 = await tentar(reserva, cab);
        if (r2.ok) { r = r2; usouReserva = true; }
      }
      porChave[id] = { n: (porChave[id]?.n || 0) + (r.ok ? 1 : 0), f: (porChave[id]?.f || 0) + (r.ok ? 0 : 1) };
      if (r.ok) { delete estado[id]; chaveNum = chaves.indexOf(k) + 1; if (falhaPrincipal) eventos.push(falhaPrincipal); break; }
      tentativas.push({ id, info: r.info }); eventos.push(r.info);
      if (!E.trocaChave(r.info.tipo)) break; // não é problema da chave: outra não ajuda
      estado[id] = { ate: E.descanso(r.info.tipo, r.info.espera, agora), tipo: r.info.tipo, t: agora };
    }
    // contagem do dia: inclui as FALHAS (para você ver que é o Google e não o limite local de pedidos)
    const novo = { data: hoje, n: uso.n + (r.ok ? 1 : 0), tokens: (uso.tokens || 0) + (r.ok ? r.tokens : 0), lat: r.ok ? [...(uso.lat || []).slice(-19), r.ms] : (uso.lat || []), falhas: { ...(uso.falhas || {}) }, reserva: (uso.reserva || 0) + (usouReserva ? 1 : 0), chaves: porChave };
    for (const f of eventos) novo.falhas[f.tipo] = (novo.falhas[f.tipo] || 0) + 1;
    await chrome.storage.local.set({ iaUso: novo, iaChaveEstado: estado });
    if (!r.ok) {
      const ref = tentativas.find((t) => !E.permanente(t.info.tipo)) || tentativas[tentativas.length - 1]; // se alguma falha passa com o tempo, é essa que vale para o robô
      return { erro: tentativas.length > 1 ? `Nenhuma das ${tentativas.length} chaves funcionou. ${ref.info.msg}` : ref.info.msg, tipo: ref.info.tipo, espera: ref.info.espera ?? null, chavesTentadas: tentativas.length };
    }
    return { texto: r.texto, tokens: r.tokens, ms: r.ms, cortou: r.cortou, ...(chaves.length > 1 ? { chaveNum } : {}), ...(usouReserva ? { reserva: r.modelo, motivoReserva: falhaPrincipal.tipo } : {}) };
  }
  return { erro: 'operação desconhecida' };
}
chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
  if (msg?.tipo !== 'ia') return;
  iaTratar(msg).then(responder, (e) => responder({ erro: e?.name === 'AbortError' ? 'A IA demorou demais para responder.' : (e?.message || String(e)) }));
  return true; // resposta assíncrona
});

// ---- Planilha: aprendizado da IA (v1.23) ----
// Grava (POST) e lê (GET) as abas "IA - …" do mesmo Apps Script da lista de cargas. Fica aqui porque só o service worker tem permissão
// para script.google.com. A senha (token) vai no corpo do POST; o script recusa se não bater.
const planilhaUrlOk = (u) => /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec(\?.*)?$/.test(u || '');
async function planilhaJson(r) {
  const t = await r.text();
  try { return JSON.parse(t); } catch { return { erro: 'a planilha não respondeu como esperado (o script foi atualizado e reimplantado?): ' + t.replace(/\s+/g, ' ').slice(0, 120) }; }
}
chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
  if (msg?.tipo !== 'planilhaEscrever' && msg?.tipo !== 'planilhaMemoria') return;
  if (!planilhaUrlOk(msg.url)) { responder({ erro: 'link inválido: precisa ser https://script.google.com/macros/s/…/exec' }); return; }
  (async () => {
    const u = new URL(msg.url);
    if (msg.tipo === 'planilhaMemoria') {
      u.searchParams.set('acao', 'memoria'); u.searchParams.set('token', String(msg.token || ''));
      return planilhaJson(await fetch(u.toString(), { redirect: 'follow', credentials: 'omit' }));
    }
    const corpo = JSON.stringify({ token: String(msg.token || ''), aba: String(msg.aba || ''), linhas: (msg.linhas || []).slice(0, 200), inst: String(msg.inst || '').slice(0, 40), nome: String(msg.nome || '').slice(0, 40), dias: Number(msg.dias) || 0 });
    return planilhaJson(await fetch(u.toString(), { method: 'POST', redirect: 'follow', credentials: 'omit', headers: { 'content-type': 'text/plain;charset=utf-8' }, body: corpo }));
  })().then(responder, (e) => responder({ erro: e?.message || String(e) }));
  return true; // resposta assíncrona
});

// ---- Acesso da equipe (v1.34) ----
// Fala com a planilha administrativa (Apps Script). Só aceita endereço do Google Apps Script: o código da pessoa nunca vai a outro servidor.
chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
  if (msg?.tipo !== 'acesso') return;
  if (!globalThis.AZACESSO.URL_OK.test(msg.url || '')) { responder({ erro: 'link inválido: precisa ser https://script.google.com/macros/s/…/exec' }); return; }
  (async () => {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
    try { return planilhaJson(await fetch(msg.url, { method: 'POST', redirect: 'follow', credentials: 'omit', signal: ctl.signal, headers: { 'content-type': 'text/plain;charset=utf-8' }, body: JSON.stringify(msg.corpo || {}) })); }
    finally { clearTimeout(t); }
  })().then(responder, (e) => responder({ erro: e?.name === 'AbortError' ? 'o servidor demorou demais para responder' : (e?.message || String(e)) }));
  return true; // resposta assíncrona
});

// ---- Atendente IA: manter o computador e a aba acordados (v1.24) ----
// Sem isto o robô para quando o computador suspende ou o Chrome descarta a aba parada (visto no relatório: 3 h sem nenhum sinal de vida).
// "system" impede a SUSPENSÃO do computador (a tela pode apagar). Só vale enquanto o robô está ligado; desligou, solta tudo.
chrome.runtime.onMessage.addListener((msg, sender, responder) => {
  if (msg?.tipo !== 'robo') return;
  self.__robo = { on: !!msg.on, t: Date.now() };
  try {
    if (msg.on) chrome.power?.requestKeepAwake?.('system'); else chrome.power?.releaseKeepAwake?.();
    if (sender?.tab?.id != null) chrome.tabs.update(sender.tab.id, { autoDiscardable: !msg.on }).catch(() => {});
    responder({ ok: true });
  } catch (e) { responder({ erro: e?.message || String(e) }); }
});
