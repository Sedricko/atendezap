// Observador: anota, só neste computador, o site em uso, o porquê e o que foi feito nele.
importScripts('util.js');

const TIPOS = ['porque', 'clique', 'campo'];

async function cfg() {
  const { pausado = false, bloqueio = OBS.BLOQUEIO_PADRAO } = await chrome.storage.local.get(['pausado', 'bloqueio']);
  return { pausado, bloqueio };
}

async function grava(ev) {
  const k = 'd:' + OBS.dia(ev.t);
  const evs = (await chrome.storage.local.get(k))[k] || [];
  const u = evs[evs.length - 1];
  // o service worker reinicia e repete eventos: não anota o mesmo site/campo duas vezes seguidas
  if (u && u.tipo === ev.tipo && u.host === ev.host && u.texto === ev.texto && ev.tipo !== 'clique') return;
  evs.push(ev);
  await chrome.storage.local.set({ [k]: evs });
}
// fila: gravações em série para não perder evento em leitura-e-escrita simultânea
let fila = Promise.resolve();
const anota = ev => (fila = fila.then(() => grava(ev)).catch(() => {}));

async function registra(tab) {
  let host = '';
  try { const u = new URL(tab.url); if (/^https?:$/.test(u.protocol)) host = u.hostname; } catch {}
  const c = await cfg();
  if (c.pausado) return;
  if (!host || OBS.bloqueado(host, c.bloqueio)) return anota({ t: Date.now(), tipo: 'fora' });
  anota({ t: Date.now(), tipo: 'site', host, titulo: (tab.title || '').slice(0, 120) });
}

chrome.tabs.onActivated.addListener(({ tabId }) => chrome.tabs.get(tabId).then(registra, () => {}));
chrome.tabs.onUpdated.addListener((id, mud, tab) => { if (mud.status === 'complete' && tab.active) registra(tab); });
chrome.windows.onFocusChanged.addListener(async w => {
  if (w === chrome.windows.WINDOW_ID_NONE) return (await cfg()).pausado || anota({ t: Date.now(), tipo: 'fora' });
  const [tab] = await chrome.tabs.query({ active: true, windowId: w });
  if (tab) registra(tab);
});
chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: 'painel.html' }));

chrome.runtime.onMessage.addListener((m, s, responde) => {
  (async () => {
    const c = await cfg();
    let host = '';
    try { host = new URL(s.url).hostname; } catch {}
    if (!s.tab || !host || c.pausado || OBS.bloqueado(host, c.bloqueio)) return responde({});
    if (m.q === 'perguntar') {
      const k = 'd:' + OBS.dia();
      const evs = (await chrome.storage.local.get(k))[k] || [];
      const { motivos = [] } = await chrome.storage.local.get('motivos');
      return responde({ perguntar: !evs.some(e => e.tipo === 'porque' && e.host === host), motivos });
    }
    if (m.q === 'evento' && TIPOS.includes(m.tipo)) {
      const texto = String(m.texto || '').slice(0, 200);
      await anota({ t: Date.now(), tipo: m.tipo, host, texto });
      if (m.tipo === 'porque' && texto !== '(pulou)') {
        const { motivos = [] } = await chrome.storage.local.get('motivos');
        await chrome.storage.local.set({ motivos: [texto, ...motivos.filter(x => x !== texto)].slice(0, 30) });
      }
    }
    responde({});
  })();
  return true;
});
