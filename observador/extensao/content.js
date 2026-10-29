// Observador: pergunta "por que está aqui?" uma vez por dia em cada site e anota cliques e campos preenchidos.
// Nunca anota o que você digita: só o NOME do campo (e nunca campos de senha).
(() => {
  if (window.top !== window) return;
  const envia = (tipo, texto) => texto && chrome.runtime.sendMessage({ q: 'evento', tipo, texto }).catch(() => {});
  const curto = s => (s || '').trim().split('\n')[0].replace(/\s+/g, ' ').slice(0, 60);  // 1ª linha: nome do chat, não a prévia da mensagem
  let caixa;

  document.addEventListener('click', e => {
    if (caixa && e.composedPath().includes(caixa)) return;
    const el = e.target.closest?.('a,button,summary,[role=button],[role=link],[role=menuitem],[role=tab],[role=option],[role=listitem],[role=row],input[type=submit],input[type=button]');
    if (el) envia('clique', curto(el.getAttribute('aria-label') || el.innerText || el.value || el.title));
  }, true);

  const escritos = new WeakSet();
  document.addEventListener('focusin', e => escritos.delete(e.target), true);
  document.addEventListener('input', e => {
    const el = e.target;
    if (escritos.has(el) || el.type === 'password' || (caixa && e.composedPath().includes(caixa))) return;
    escritos.add(el);
    envia('campo', curto(el.labels?.[0]?.innerText || el.getAttribute('aria-label') || el.placeholder || el.name || 'texto'));
  }, true);

  chrome.runtime.sendMessage({ q: 'perguntar' }).then(r => {
    if (!r?.perguntar) return;
    const host = document.createElement('div');
    const sh = host.attachShadow({ mode: 'open' });
    sh.innerHTML = `<style>
      div{position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#fff;color:#222;border:1px solid #bbb;border-radius:10px;
          padding:10px;font:14px system-ui,sans-serif;box-shadow:0 4px 16px #0003;width:280px}
      input{width:100%;box-sizing:border-box;padding:6px;margin:6px 0;font:inherit}
      button{font:inherit;padding:4px 10px;cursor:pointer}</style>
      <div role="dialog" aria-label="Observador">
        <label for="p">Por que você está neste site agora?</label>
        <input id="p" list="m" placeholder="ex.: ver pedidos novos" autocomplete="off"><datalist id="m"></datalist>
        <button id="ok">Salvar</button> <button id="pular">Pular hoje</button></div>`;
    for (const m of r.motivos) sh.getElementById('m').append(new Option(m));
    const fecha = texto => { envia('porque', texto); host.remove(); };
    const salva = () => { const v = sh.getElementById('p').value.trim(); if (v) fecha(v); };
    sh.getElementById('ok').onclick = salva;
    sh.getElementById('pular').onclick = () => fecha('(pulou)');
    sh.getElementById('p').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') salva(); if (e.key === 'Escape') host.remove(); };
    caixa = host;
    document.documentElement.append(host);
    setTimeout(() => host.remove(), 60000);  // sem resposta: some e pergunta de novo na próxima visita
  }).catch(() => {});
})();
