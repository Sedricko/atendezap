// AtendeZap — "Acesso da equipe" (v1.34). Regras PURAS: o que o administrador libera, bloqueia ou limita para cada usuário, e o resumo
// de saúde que a extensão pode enviar de volta. Sem DOM, sem rede: roda no painel, no service worker e nos testes (Node).
(() => {
  'use strict';
  // Recursos que o administrador controla: os 14 módulos do painel + 2 ajustes finos.
  const MODULOS = ['replies', 'fila', 'sig', 'start', 'lote', 'pins', 'exportar', 'contato', 'ocultas', 'apagar', 'recuperar', 'backup', 'lab', 'gruposSo', 'atendente', 'escuta', 'vagas', 'pedidos', 'cargas', 'resumo', 'ligacao', 'avaliacao'];
  // além dos módulos: ajustes finos e as partes da tela de Configurações/Diagnóstico (nada disso vem liberado de fábrica)
  const EXTRAS = ['iaAudio', 'diagAvancado', 'diag', 'cfgPosicao', 'cfgIA', 'cfgPartes', 'cfgLimites'];
  const RECURSOS = [...MODULOS, ...EXTRAS];
  // bloqueado = some da tela e não funciona | desligado = vem desligado, o usuário pode ligar | ligado = vem ligado, o usuário pode desligar | obrigatorio = sempre ligado
  const ESTADOS = ['bloqueado', 'desligado', 'ligado', 'obrigatorio'];
  const ORDEM_MODO = { desligado: 0, sugerir: 1, automatico: 2 };
  // limites numéricos/enumerados: [mínimo, máximo] ou lista de valores aceitos
  const LIMITES = { roboModoMax: ['desligado', 'sugerir', 'automatico'], roboMaxPorContatoDia: [1, 200], roboMaxPorHora: [1, 500], chavesMax: [1, 6], retencaoMaxDias: [1, 365] };
  // LOGIN OBRIGATÓRIO: instalação sem convite mostra SÓ o cartão "Acesso da equipe" até a pessoa colar o convite. Para uso pessoal sem convite, ponha false aqui
  // (ou grave acessoExigir:false no armazenamento da extensão).
  const EXIGIR_CONVITE = true;
  const GLOBAL0 = { emergencia: false, emergenciaMensagem: '', versaoMinima: '', aviso: '', coletarSaude: false, consultaMin: 10, saudeMin: 30, validadeOfflineDias: 7 };

  const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const num = (v, min, max, pad) => { if (v === undefined || v === null || String(v).trim() === '') return pad; const n = Math.round(Number(String(v).replace(',', '.'))); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : pad; }; // vazio = padrão (antes virava 0 e caía no mínimo)
  const bool = (v) => ['true', 'sim', 's', '1', 'on', 'yes'].includes(semAcento(v));
  const texto = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const estadoDe = (v) => {
    const x = semAcento(v);
    // Na dúvida, o mais RESTRITIVO: "não"/"off" significam bloqueado (e não "liberado, só que desligado"). "desligado" continua sendo liberado-mas-desligado.
    if (['bloqueado', 'bloquear', 'bloqueada', 'nao', 'off', 'negado', 'proibido'].includes(x)) return 'bloqueado';
    if (['obrigatorio', 'obrigatoria', 'obrigar'].includes(x)) return 'obrigatorio';
    if (['ligado', 'ligada', 'on', 'sim', 'liberado', 'padrao ligado'].includes(x)) return 'ligado';
    if (['desligado', 'desligada', 'padrao desligado'].includes(x)) return 'desligado';
    return ''; // vazio ou desconhecido = o administrador não opinou
  };

  // ---------- convite: um texto único com o endereço do script e o código da pessoa ----------
  const URL_OK = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;
  const b64u = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const deb64u = (s) => decodeURIComponent(escape(atob(String(s).replace(/-/g, '+').replace(/_/g, '/'))));
  const codificarConvite = (url, codigo) => 'AZ1.' + b64u(JSON.stringify({ u: url, c: codigo }));
  // Só aceita endereço do Google Apps Script: o código da pessoa nunca é enviado a um servidor qualquer.
  const decodificarConvite = (txt) => {
    try {
      const m = /^AZ1\.([\w-]+)$/.exec(String(txt || '').trim()); if (!m) return null;
      const o = JSON.parse(deb64u(m[1])), url = String(o.u || ''), codigo = String(o.c || '');
      return URL_OK.test(url) && /^[A-Za-z0-9]{8,64}$/.test(codigo) ? { url, codigo } : null;
    } catch { return null; }
  };

  // ---------- resposta do servidor -> configuração saneada (só o que é conhecido; o resto é ignorado) ----------
  const normalizar = (r) => {
    const recursos = {}, limites = {}, g = { ...GLOBAL0 };
    for (const k of RECURSOS) { const e = estadoDe(r?.recursos?.[k]); if (e) recursos[k] = e; }
    for (const [k, def] of Object.entries(LIMITES)) {
      const v = r?.limites?.[k]; if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(def) && typeof def[0] === 'string') { const x = semAcento(v); if (def.includes(x)) limites[k] = x; }
      else limites[k] = num(v, def[0], def[1], undefined);
      if (limites[k] === undefined) delete limites[k];
    }
    const o = r?.global || {};
    g.emergencia = bool(o.emergencia); g.emergenciaMensagem = texto(o.emergenciaMensagem, 140); g.versaoMinima = /^\d+(\.\d+){0,2}$/.test(texto(o.versaoMinima, 12)) ? texto(o.versaoMinima, 12) : '';
    g.aviso = texto(o.aviso, 200); g.coletarSaude = bool(o.coletarSaude); g.consultaMin = num(o.consultaMin, 5, 120, GLOBAL0.consultaMin); g.saudeMin = num(o.saudeMin, 10, 240, GLOBAL0.saudeMin); g.validadeOfflineDias = num(o.validadeOfflineDias, 1, 30, GLOBAL0.validadeOfflineDias);
    const pcs = r?.pcs && typeof r.pcs === 'object' ? { emUso: num(r.pcs.emUso, 0, 99, 0), max: num(r.pcs.max, 1, 20, 1) } : null; // computadores deste convite (só para mostrar)
    return { nome: texto(r?.nome, 60), perfil: texto(r?.perfil, 40), recursos, limites, global: g, pcs, hash: texto(r?.hash, 40) };
  };

  // ---------- situação atual (o que vale AGORA) ----------
  // acesso = { url, codigo } (do convite) ou vazio; estado = { config, t, desativado } guardado da última consulta.
  const avaliar = (acesso, estado, agora = Date.now(), exigir = false) => {
    const conectado = !!(acesso && acesso.url && acesso.codigo);
    const cfg = conectado && estado?.config ? estado.config : null, g = { ...GLOBAL0, ...(cfg?.global || {}) };
    if (!conectado) return { conectado: false, login: !!exigir, pcs: null, motivo: '', valido: false, restrito: false, desativado: false, emergencia: false, recursos: {}, limites: {}, global: { ...GLOBAL0 }, nome: '', perfil: '', idadeMin: null };
    const desativado = estado?.desativado === true, idade = cfg ? agora - (estado.t || 0) : Infinity;
    const valido = !!cfg && idade <= g.validadeOfflineDias * 864e5;
    return { conectado, login: false, pcs: cfg?.pcs || null, motivo: desativado ? String(estado?.erro || '') : '', valido, restrito: !desativado && !valido, desativado, emergencia: !!g.emergencia, recursos: cfg?.recursos || {}, limites: cfg?.limites || {}, global: g, nome: cfg?.nome || '', perfil: cfg?.perfil || '', idadeMin: cfg ? Math.round(idade / 60000) : null };
  };

  // Estado EFETIVO de um recurso para a pessoa. NADA vem liberado de fábrica: sem marcação do administrador o recurso é 'bloqueado'.
  // 'livre' = modo pessoal (sem convite e sem exigir login): a extensão funciona como sempre.
  const estado = (ef, chave) => {
    if (!RECURSOS.includes(chave)) return 'livre';
    if (!ef?.conectado) return ef?.login ? 'bloqueado' : 'livre';
    if (ef.desativado) return 'bloqueado';
    return ef.recursos?.[chave] || 'bloqueado';
  };
  // Um recurso aparece/funciona? escolha = o que o usuário marcou (true/false/undefined).
  const liberado = (ef, chave, escolha) => {
    const st = estado(ef, chave);
    if (st === 'bloqueado') return false;
    if (st === 'obrigatorio') return true;
    return escolha !== false;          // 'livre', 'ligado' e 'desligado': vale a escolha da pessoa
  };
  // 'ligado' e 'desligado' são só o PADRÃO: aplicados uma vez por mudança, e depois o usuário decide. Devolve o que aplicar e o novo registro do que já foi aplicado.
  const defaultsParaAplicar = (ef, aplicado = {}) => {
    const aplicar = [], novo = {};
    if (!ef?.conectado || ef.desativado) return { aplicar, aplicado: { ...aplicado } };
    for (const k of RECURSOS) {
      const st = ef.recursos?.[k];
      if (st !== 'ligado' && st !== 'desligado') continue;
      novo[k] = st; if (aplicado[k] !== st) aplicar.push({ k, valor: st === 'ligado' });
    }
    return { aplicar, aplicado: novo };
  };

  // ---------- limites do robô sobre a configuração salva do usuário (a salva não é alterada) ----------
  const limitarRobo = (cfg, ef) => {
    if (ef?.login) return { ...cfg, modo: 'desligado' };
    if (!ef?.conectado) return cfg;
    const c = { ...cfg }, L = ef.limites || {};
    const max = ef.desativado || ef.restrito || ef.emergencia ? 'desligado' : (L.roboModoMax || 'sugerir'); // sem teto definido pelo administrador: só sugere (nunca automático por omissão)
    if ((ORDEM_MODO[c.modo] ?? 0) > ORDEM_MODO[max]) c.modo = max;
    if (L.roboMaxPorContatoDia) c.maxPorContatoDia = Math.min(Number(c.maxPorContatoDia) || L.roboMaxPorContatoDia, L.roboMaxPorContatoDia);
    if (L.roboMaxPorHora) c.maxPorHora = Math.min(Number(c.maxPorHora) || L.roboMaxPorHora, L.roboMaxPorHora);
    if (L.retencaoMaxDias) c.retencaoDias = Math.min(Number(c.retencaoDias) || L.retencaoMaxDias, L.retencaoMaxDias);
    const au = estado(ef, 'iaAudio'); if (au === 'bloqueado') c.transcreverAudio = false; else if (au === 'obrigatorio') c.transcreverAudio = true;
    return c;
  };
  const modoPermitido = (ef, modo) => {
    if (ef?.login) return modo === 'desligado';
    if (!ef?.conectado) return true;
    const max = ef.desativado || ef.restrito || ef.emergencia ? 'desligado' : (ef.limites?.roboModoMax || 'sugerir');
    return (ORDEM_MODO[modo] ?? 0) <= ORDEM_MODO[max];
  };

  // ---------- avisos na tela ----------
  const versaoMenor = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0; } return false; };
  const avisos = (ef, versao) => {
    const out = [];
    if (!ef?.conectado) return out;
    if (ef.desativado) out.push({ tipo: 'desativado', texto: /computador/.test(ef.motivo || '') ? `Este computador não está autorizado: ${ef.motivo}. Fale com o administrador.` : 'Seu acesso foi desativado pelo administrador. Fale com ele para voltar a usar.' });
    else if (ef.emergencia) out.push({ tipo: 'emergencia', texto: ef.global.emergenciaMensagem || 'O administrador pausou o robô por um momento.' });
    else if (ef.restrito) out.push({ tipo: 'restrito', texto: 'Não consegui confirmar seu acesso com o administrador há mais de ' + ef.global.validadeOfflineDias + ' dia(s): o robô ficou desligado até a conexão voltar.' });
    if (ef.global.versaoMinima && versao && versaoMenor(versao, ef.global.versaoMinima)) out.push({ tipo: 'versao', texto: `Há uma versão nova do AtendeZap (${ef.global.versaoMinima} ou mais). Peça o pacote ao administrador e atualize.` });
    if (ef.global.aviso) out.push({ tipo: 'aviso', texto: ef.global.aviso });
    return out;
  };
  // quando consultar de novo (ms): em emergência ou desativado, com mais calma/atenção conforme o caso
  const proximaConsultaMs = (ef) => (ef?.desativado ? 30 : ef?.emergencia ? Math.min(ef.global.consultaMin, 2) : ef?.global?.consultaMin || GLOBAL0.consultaMin) * 60000;

  // ---------- resumo de saúde enviado ao administrador: SÓ campos conhecidos, números e rótulos fixos; nunca texto de conversa, nome ou telefone ----------
  const n0 = (v, max = 1e7) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.min(max, Math.round(n * 10) / 10)) : 0; };
  const rotulo = (v) => String(v ?? '').replace(/[0-9]{6,}/g, '…').replace(/[@<>{}"\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const verOk = (v) => (/^[0-9][0-9.]{0,14}$/.test(String(v ?? '')) ? String(v) : '');
  const montarSaude = (o = {}) => {
    const a = o.autoteste || {}, r = o.robo || {}, t = o.tempos || {}, i = o.ia || {}, f = {};
    for (const [k, v] of Object.entries(i.falhas || {})) if (/^[a-z-]{2,14}$/.test(k)) f[k] = n0(v, 1e5);
    return {
      v: verOk(o.v), wa: verOk(o.wa),
      autoteste: { ok: n0(a.ok, 999), warn: n0(a.warn, 999), bad: n0(a.bad, 999), skip: n0(a.skip, 999), ruins: (Array.isArray(a.ruins) ? a.ruins : []).slice(0, 8).map(rotulo).filter(Boolean) },
      robo: { modo: ORDEM_MODO[r.modo] !== undefined ? r.modo : 'desligado', ativo: r.ativo === true, ultimaMsgMin: r.ultimaMsgMin == null ? null : n0(r.ultimaMsgMin, 1e6), respondeu24h: n0(r.respondeu24h), humano24h: n0(r.humano24h), ignorado24h: n0(r.ignorado24h), iaFalhou24h: n0(r.iaFalhou24h), pendencias: n0(r.pendencias, 9999), pausas: n0(r.pausas, 9999), travado: r.travado === true },
      tempos: { iaS: t.iaS == null ? null : n0(t.iaS, 9999), esperouS: t.esperouS == null ? null : n0(t.esperouS, 1e6), atendenteS: t.atendenteS == null ? null : n0(t.atendenteS, 1e6) },
      ia: { usoHoje: n0(i.usoHoje, 1e5), falhas: f, chaves: n0(i.chaves, 6), reserva: i.reserva === true },
    };
  };
  // o mesmo resumo em português simples, para a pessoa conferir ANTES de aceitar enviar
  const descreverEnvio = (s) => [
    `Versão da extensão ${s.v || '?'} e do WhatsApp ${s.wa || '?'}`,
    `Autoteste: ${s.autoteste.ok} ok, ${s.autoteste.warn} avisos, ${s.autoteste.bad} problemas${s.autoteste.ruins.length ? ' (' + s.autoteste.ruins.join(', ') + ')' : ''}`,
    `Robô: modo ${s.robo.modo}, ${s.robo.ativo ? 'ligado' : 'desligado'}; em 24 h: ${s.robo.respondeu24h} respostas, ${s.robo.humano24h} repasses, ${s.robo.ignorado24h} ignoradas, ${s.robo.iaFalhou24h} falhas da IA; ${s.robo.pendencias} pendências`,
    `Tempos: IA ${s.tempos.iaS ?? '—'} s · cliente esperou ${s.tempos.esperouS ?? '—'} s · atendente ${s.tempos.atendenteS ?? '—'} s`,
    `IA hoje: ${s.ia.usoHoje} pedidos, ${s.ia.chaves} chave(s)${Object.keys(s.ia.falhas).length ? ', falhas: ' + Object.entries(s.ia.falhas).map(([k, n]) => `${k} ×${n}`).join(', ') : ''}`,
    'NUNCA é enviado: texto de conversas, nomes, telefones, fotos ou as suas chaves.',
  ];

  globalThis.AZACESSO = { estado, EXIGIR_CONVITE, MODULOS, EXTRAS, RECURSOS, ESTADOS, LIMITES, GLOBAL0, estadoDe, URL_OK, codificarConvite, decodificarConvite, normalizar, avaliar, liberado, defaultsParaAplicar, limitarRobo, modoPermitido, avisos, versaoMenor, proximaConsultaMs, montarSaude, descreverEnvio };
})();
