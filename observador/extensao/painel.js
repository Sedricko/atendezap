const $ = id => document.getElementById(id);
const st = chrome.storage.local;

function baixa(nome, conteudo, tipo) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  a.download = nome;
  a.click();
}

async function mostra() {
  const tudo = await st.get(null);
  const dias = Object.keys(tudo).filter(k => k.startsWith('d:')).map(k => k.slice(2)).sort().reverse();
  const atual = $('dia').value || dias[0];
  $('dia').replaceChildren(...dias.map(d => new Option(d, d, false, d === atual)));
  $('linha').textContent = atual ? OBS.texto(tudo['d:' + atual]) || '(vazio)' : 'Nada registrado ainda. Use o navegador normalmente.';
  $('pausa').textContent = tudo.pausado ? '▶ Continuar registrando' : '⏸ Pausar registro';
  if (document.activeElement !== $('bloq')) $('bloq').value = (tudo.bloqueio || OBS.BLOQUEIO_PADRAO).join('\n');
}

$('dia').onchange = mostra;
$('pausa').onclick = async () => { await st.set({ pausado: !(await st.get('pausado')).pausado }); mostra(); };
$('txt').onclick = async () => {
  const d = $('dia').value;
  if (d) baixa(`navegador-${d}.txt`, OBS.texto((await st.get('d:' + d))['d:' + d] || []), 'text/plain');
};
$('json').onclick = async () => baixa(`observador-backup-${OBS.dia()}.json`, JSON.stringify(await st.get(null)), 'application/json');
$('salvaBloq').onclick = async () => {
  await st.set({ bloqueio: $('bloq').value.split('\n').map(s => s.trim().toLowerCase()).filter(Boolean) });
  mostra();
};
$('apaga').onclick = async () => {
  if (!confirm('Apagar TODOS os registros? Não dá para desfazer.')) return;
  await st.remove(Object.keys(await st.get(null)).filter(k => k.startsWith('d:') || k === 'motivos'));
  $('dia').replaceChildren();
  mostra();
};
chrome.storage.onChanged.addListener(mostra);
mostra();
