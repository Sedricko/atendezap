// Classifica um erro da API do Gemini. PURO: roda no service worker (importScripts) e nos testes (require).
// Devolve { tipo, msg, espera }: o tipo diz o que fazer (esperar, trocar de modelo, avisar o dono) e msg é o texto em português.
(() => {
  const segundos = (s) => { const m = /^(\d+(?:\.\d+)?)s$/.exec(String(s || '').trim()); return m ? Math.ceil(Number(m[1])) : null; };
  // falha = 'tempo' (a requisição estourou o tempo) | 'rede' (sem conexão) quando não houve resposta HTTP
  function classificar(status, corpo, falha) {
    const e = corpo?.error || {}, msg = String(e.message || '').slice(0, 200), det = Array.isArray(e.details) ? e.details : [];
    if (falha === 'tempo') return { tipo: 'tempo', msg: 'A IA demorou demais para responder.', espera: null };
    if (falha === 'rede') return { tipo: 'rede', msg: 'Sem conexão com o Google (rede).', espera: null };
    if (status === 400 && /api key/i.test(msg)) return { tipo: 'chave', msg: 'A chave da API não é válida: confira se copiou inteira.', espera: null };
    if (status === 400) return { tipo: 'recusa', msg: `O Google recusou o pedido (400)${msg ? ': ' + msg : ''}`, espera: null };
    if (status === 401 || status === 403) return { tipo: 'chave', msg: `A chave não tem permissão para isso (${status})${msg ? ': ' + msg : ''}`, espera: null };
    if (status === 404) return { tipo: 'modelo', msg: 'Modelo não encontrado: escolha outro em Configurações › Assistente de IA.', espera: null };
    if (status === 429) {
      let espera = null, ids = '';
      for (const d of det) {
        if (/RetryInfo/.test(d['@type'] || '')) espera = segundos(d.retryDelay);
        if (/QuotaFailure/.test(d['@type'] || '')) ids += ' ' + (d.violations || []).map((v) => `${v.quotaId || ''} ${v.quotaMetric || ''}`).join(' ');
      }
      const texto = `${ids} ${msg}`;
      if (/per.?day|daily/i.test(texto)) return { tipo: 'cota-dia', msg: 'A cota do DIA do Google acabou para este modelo. Ela volta mais tarde; até lá, escolha outro modelo (ou um modelo reserva) ou ative o faturamento.', espera };
      if (/per.?minute|per.?second/i.test(texto) || (espera != null && espera <= 120)) return { tipo: 'cota-minuto', msg: `Limite por minuto do Google atingido${espera ? ` (tente de novo em ~${espera} s)` : ''}.`, espera };
      return { tipo: 'cota', msg: 'Limite de uso da API do Google atingido (cota). Espere um pouco ou confira o seu plano.', espera };
    }
    if (status >= 500) return { tipo: 'instavel', msg: `O serviço do Google está instável (${status}). Tente de novo em instantes.`, espera: null };
    return { tipo: 'outro', msg: `Erro ${status}${msg ? ': ' + msg : ''}`, espera: null };
  }
  // O que NÃO se resolve esperando (insistir só gasta pedidos e atrasa o aviso ao dono).
  const permanente = (tipo) => ['chave', 'modelo', 'recusa', 'cota-dia'].includes(tipo);
  // Quando vale tentar o modelo reserva: tudo que é do lado do Google/rede (inclusive a cota do dia do modelo principal), menos erro de chave/modelo/pedido.
  const usaReserva = (tipo) => ['tempo', 'rede', 'instavel', 'cota-minuto', 'cota-dia', 'cota'].includes(tipo);
  // ----- várias chaves (v1.31) -----
  // Identificação da chave SEM guardar o segredo: só o final e o tamanho (aparece na tela e no relatório).
  const idChave = (k) => `…${String(k || '').trim().slice(-4)}/${String(k || '').trim().length}`;
  // Lista de chaves configuradas (a antiga "chave" única continua valendo). Sem repetidas nem vazias.
  const listaChaves = (cfg = {}) => [...new Set((Array.isArray(cfg.chaves) && cfg.chaves.length ? cfg.chaves : [cfg.chave]).map((k) => String(k || '').trim()).filter(Boolean))];
  // Problema DA CHAVE ou do projeto dela: outra chave pode funcionar. Instabilidade do serviço, tempo esgotado e modelo inexistente não são da chave.
  const trocaChave = (tipo) => ['chave', 'cota-dia', 'cota-minuto', 'cota'].includes(tipo);
  // Até quando a chave fica "descansando" depois de falhar: inválida 1 h; cota do dia até as 08:00 UTC (meia-noite no Pacífico, hora em que o Google renova);
  // limite por minuto pelo tempo que o Google pediu (5 a 120 s); cota sem detalhe 2 min. Descansar só muda a ORDEM: se todas falharem, tenta de novo mesmo assim.
  function descanso(tipo, espera, agora = Date.now()) {
    if (tipo === 'chave') return agora + 3600000;
    if (tipo === 'cota-dia') { const d = new Date(agora), alvo = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 8); return alvo > agora ? alvo : alvo + 86400000; }
    if (tipo === 'cota-minuto') return agora + Math.max(5, Math.min(120, espera || 60)) * 1000;
    if (tipo === 'cota') return agora + 120000;
    return 0;
  }
  // Ordem de tentativa: as que não estão descansando (na ordem em que você cadastrou) e, depois, as descansando (a que volta mais cedo primeiro).
  function ordemChaves(chaves, estado = {}, agora = Date.now()) {
    const livres = [], desc = [];
    for (const k of chaves) { const e = estado[idChave(k)]; (e && e.ate > agora ? desc : livres).push(k); }
    desc.sort((a, b) => estado[idChave(a)].ate - estado[idChave(b)].ate);
    return [...livres, ...desc];
  }
  globalThis.AZIERRO = { classificar, permanente, usaReserva, idChave, listaChaves, trocaChave, descanso, ordemChaves };
})();
