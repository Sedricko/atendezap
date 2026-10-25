// Funções puras (testáveis fora do navegador). Exporta em globalThis.AZU.
(() => {
  const AZU = {};

  AZU.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // "(85) 9 9999-0000" -> "5585999990000". Sem DDI e com 10/11 dígitos, assume Brasil (55).
  AZU.normalizePhone = (raw) => {
    let d = String(raw || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    const intl = /^\s*(\+|00)/.test(String(raw));
    if (!intl && (d.length === 10 || d.length === 11)) d = '55' + d;
    return d.length >= 8 && d.length <= 15 ? d : null;
  };

  // Extrai número e texto de links wa.me / api.whatsapp.com / whatsapp://send
  AZU.parseWaLink = (href) => {
    try {
      const u = new URL(href);
      let phone = null;
      if (/(^|\.)wa\.me$/.test(u.hostname)) phone = u.pathname.split('/')[1];
      else if (/whatsapp\.com$/.test(u.hostname) && /^\/send/.test(u.pathname)) phone = u.searchParams.get('phone');
      else if (u.protocol === 'whatsapp:') phone = u.searchParams.get('phone');
      else return null;
      const n = AZU.normalizePhone(phone);
      return n ? { phone: n, text: u.searchParams.get('text') || '' } : null;
    } catch { return null; }
  };

  AZU.saudacao = (date) => {
    const h = date.getHours();
    return h >= 5 && h < 12 ? 'Bom dia' : h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite';
  };

  AZU.applyVars = (text, ctx, date = new Date()) => {
    const nome = (ctx.nome || '').trim();
    const map = {
      nome,
      primeiro_nome: nome.split(/\s+/)[0] || '',
      saudacao: AZU.saudacao(date),
      atendente: ctx.atendente || '',
      data: date.toLocaleDateString('pt-BR'),
      hora: date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    };
    return String(text || '').replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
  };

  // Estilos de assinatura: markdown do WhatsApp ou letras Unicode (aparecem estilizadas em qualquer celular).
  const UNI = {
    u_negrito: [0x1d5d4, 0x1d5ee, 0x1d7ec], u_italico: [0x1d608, 0x1d622, null], u_serif: [0x1d400, 0x1d41a, 0x1d7ce],
    u_cursiva: [0x1d4d0, 0x1d4ea, null], u_mono: [0x1d670, 0x1d68a, 0x1d7f6], u_duplo: [0x1d538, 0x1d552, 0x1d7d8],
  };
  const DUPLO_HOLES = { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' };
  AZU.unicodeStyle = (text, estilo) => {
    const [up, low, dig] = UNI[estilo];
    return [...String(text).normalize('NFD')].map((ch) => {
      const c = ch.codePointAt(0);
      if (estilo === 'u_duplo' && DUPLO_HOLES[ch]) return DUPLO_HOLES[ch];
      if (c >= 65 && c <= 90) return String.fromCodePoint(up + c - 65);
      if (c >= 97 && c <= 122) return String.fromCodePoint(low + c - 97);
      if (dig && c >= 48 && c <= 57) return String.fromCodePoint(dig + c - 48);
      return ch;
    }).join('');
  };
  AZU.SIG_STYLES = {
    negrito: 'Negrito', italico: 'Itálico', negrito_italico: 'Negrito + itálico', tachado: 'Tachado',
    mono: 'Monoespaçado', codigo: 'Código', normal: 'Normal',
    u_negrito: 'Negrito (fonte)', u_italico: 'Itálico (fonte)', u_serif: 'Serifado', u_cursiva: 'Cursiva',
    u_mono: 'Máquina de escrever', u_duplo: 'Contorno',
  };
  const WRAP = { negrito: '*', italico: '_', tachado: '~', mono: '```', codigo: '`', normal: '' };
  AZU.signature = (cfg) => {
    const n = String(cfg.nome || '').trim() + ':';
    const e = cfg.estilo || 'negrito';
    if (UNI[e]) return AZU.unicodeStyle(n, e);
    // Nome que já traz formatação do WhatsApp (*negrito*, _itálico_…) vai como está: embrulhar de novo quebra a marcação.
    if (/[*_~`]/.test(cfg.nome || '')) return n;
    if (e === 'negrito_italico') return '*_' + n + '_*';
    const w = WRAP[e] ?? '*';
    return w + n + w;
  };
  AZU.sign = (text, cfg) => {
    const sig = AZU.signature(cfg);
    if (text.startsWith(sig)) return text;
    return sig + (cfg.posicao === 'acima' ? '\n' : ' ') + text;
  };

  // Próximo horário de backup depois de `ultimo` (ISO ou null).
  AZU.nextBackup = (cfg, now = new Date()) => {
    const [hh, mm] = String(cfg.hora || '10:30').split(':').map(Number);
    if (!cfg.ultimo) {
      const d = new Date(now); d.setHours(hh, mm, 0, 0);
      return d <= now ? now : d;
    }
    const d = new Date(cfg.ultimo);
    if (cfg.recorrencia === 'semanal') d.setDate(d.getDate() + 7);
    else if (cfg.recorrencia === 'mensal') d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + 1);
    d.setHours(hh, mm, 0, 0);
    return d;
  };
  AZU.backupDue = (cfg, now = new Date()) => !!cfg?.ativo && AZU.nextBackup(cfg, now) <= now;

  AZU.MEDIA_TYPES = ['imagem', 'video', 'audio', 'documento'];
  AZU.countMedia = (replies) =>
    replies.reduce((n, r) => n + (r.acoes || []).filter((a) => AZU.MEDIA_TYPES.includes(a.tipo) && a.midiaId).length, 0);

  // Filtro do popup "/atalho": prefixo do atalho primeiro, depois título contendo.
  AZU.matchReplies = (replies, q) => {
    q = q.toLowerCase();
    const pre = replies.filter((r) => (r.atalho || '').toLowerCase().startsWith(q));
    const tit = replies.filter((r) => !pre.includes(r) && (r.titulo || '').toLowerCase().includes(q));
    return [...pre, ...tit];
  };

  // Grupos do backup -> chaves do storage. Mídias (midia_*) acompanham as respostas rápidas.
  // v1.12 — abas de filtro da lista de conversas (Todas | Não lidas | Favoritas | Grupos) e escopo das fixadas.
  // Fixada com escopo só vale (sobe ao topo) enquanto aquela aba está ativa; sem escopo = "todas" (comportamento antigo).
  // aba == null (não achou as abas na tela) -> aplica tudo, para a fixação nunca "sumir".
  const semAcento = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  // v1.33.1: ao redesenhar a barra de abas o WhatsApp deixa a aba ativa "ilegível" por instantes. Segura a última aba por até `seg` ms SÓ quando a barra SUMIU;
  // barra presente e nenhuma aba conhecida marcada = o usuário abriu outra lista: aí é null de verdade e vale na hora.
  AZU.abaEstavel = (aba, barraPresente, ult, agora, seg = 3000) => {
    if (aba) return { aba, ult: { v: aba, t: agora } };
    if (!barraPresente && ult && agora - ult.t < seg) return { aba: ult.v, ult };
    return { aba: null, ult: barraPresente ? null : ult };
  };
  // Que janelas pausam o filtro "Grupos só na aba Grupos"? SÓ as de ESCOLHER CONVERSA (Encaminhar para…, Nova conversa, Adicionar à lista…): o seletor delas usa a mesma
  // lista e o grupo tem de aparecer lá. Janelas de INFORMAÇÃO ("Mostrar contato", dados do grupo…) NÃO pausam (era o que fazia os grupos aparecerem ao clicar num contato).
  // d = { rotulo, texto, caixas, opcoes, celulas } lido da janela (texto = título/1º texto, até 60 caracteres). Devolve o motivo da pausa ('' = não pausa).
  AZU.janelaEscolheConversa = (d = {}) => {
    if (d.caixas) return 'tem caixas de seleção';
    if (d.opcoes) return 'tem lista de opções';
    if (d.celulas >= 3) return 'tem uma lista de conversas';
    const t = `${d.rotulo || ''} ${String(d.texto || '').slice(0, 60)}`;
    if (/encaminh|forward|compartilh|share|enviar para|send to|adicionar (à|a|na|em) lista|add to (a )?list|nova conversa|new chat|novo grupo|new group|selecionar (contatos|conversas)|select (contacts|chats)/i.test(t)) return 'o título pede para escolher conversas';
    return '';
  };
  AZU.abaDe = (id, texto) => {
    const porId = { 'all-filter': 'todas', 'unread-filter': 'naolidas', 'favorites-filter': 'favoritas', 'groups-filter': 'grupos' };
    if (porId[id]) return porId[id];
    const t = semAcento(texto).replace(/[\s\d()·.]+$/, '').trim();
    if (/^(todas?|tudo|all)$/.test(t)) return 'todas'; // no WhatsApp em português a 1ª aba se chama "Tudo"
    if (/^(nao lidas?|unread)$/.test(t)) return 'naolidas';
    if (/^(favorit[ao]s?|favorites?)$/.test(t)) return 'favoritas';
    if (/^(grupos?|groups?)$/.test(t)) return 'grupos';
    return null;
  };
  AZU.pinsAtivos = (pins, escopos, aba) => (pins || []).filter((id) => { const e = (escopos || {})[id] || 'todas'; return e === 'todas' || aba == null || e === aba; });
  AZU.ESCOPOS = { todas: 'Em todas as abas', grupos: 'Só na aba Grupos', favoritas: 'Só em Favoritas', naolidas: 'Só em Não lidas' };
  AZU.escoposDe = (id) => (String(id).endsWith('@g.us') ? ['todas', 'grupos', 'favoritas', 'naolidas'] : ['todas', 'favoritas', 'naolidas']);

  // v1.15 — diagnóstico enxuto: custo do próprio AtendeZap e resumo curto (para colar na conversa em vez de mandar 2 arquivos)
  // perf = {nome: {n, ms, max}}; janelaMs = tempo desde que começou a medir. Devolve linhas "nome: n× · média · máx" e o % do tempo.
  AZU.perfLinhas = (perf, janelaMs) => {
    const itens = Object.entries(perf || {}).map(([nome, v]) => ({ nome, n: v.n, ms: v.ms, max: v.max, med: v.n ? v.ms / v.n : 0 })).sort((a, b) => b.ms - a.ms);
    const total = itens.reduce((t, i) => t + i.ms, 0), pct = janelaMs > 0 ? (100 * total) / janelaMs : 0;
    return { pct: Math.round(pct * 10) / 10, linhas: itens.slice(0, 6).map((i) => `${i.nome}: ${i.n}× · média ${i.med.toFixed(1)} ms · máx ${Math.round(i.max)} ms`) };
  };
  // data = objeto do relatório; anterior = {t, ver, oks:{nome: ok}} da execução anterior (ou null)
  AZU.resumoDiag = (data, anterior) => {
    const ic = { true: '✔', false: '✖', warn: '⚠', skip: '○' }, st = (ok) => (ok === true ? 'ok' : ok === 'warn' ? 'warn' : ok === 'skip' ? 'skip' : 'bad');
    const n = { ok: 0, warn: 0, bad: 0, skip: 0 };
    for (const c of data.checks || []) n[st(c.ok)]++;
    const L = [];
    const quando = new Date(data.data), dd = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    L.push(`AtendeZap ${data.atendezap} · WhatsApp ${data.whatsapp || '?'} · wa-js ${data.waJs || '?'} · ${dd(quando)} (${data.motivo})`);
    L.push(`Saúde: ✔ ${n.ok} · ⚠ ${n.warn} · ✖ ${n.bad}${n.skip ? ` · ○ ${n.skip} não testados (sem conversa aberta)` : ''}`);
    const ruins = (data.checks || []).filter((c) => c.ok !== true && c.ok !== 'skip');
    if (ruins.length) { L.push('Atenção:'); for (const c of ruins.slice(0, 12)) L.push(` ${ic[c.ok] || '?'} ${c.nome} — ${String(c.d || '').replace(/\s+/g, ' ').slice(0, 150)}`); }
    const afet = Object.entries(data.saude || {}).filter(([, v]) => v.st === 'bad').map(([f]) => f);
    if (afet.length) L.push(`Funções com problema: ${afet.join(', ')}`);
    if (anterior?.oks) {
      const quebrou = [], voltou = [];
      for (const c of data.checks || []) {
        const antes = anterior.oks[c.nome]; if (antes === undefined || antes === 'skip' || c.ok === 'skip') continue; // não testado não é piora nem melhora
        if (antes === true && c.ok !== true) quebrou.push(`${c.nome} (${ic[antes]}→${ic[c.ok]})`);
        if (antes !== true && c.ok === true) voltou.push(c.nome);
      }
      const novos = (data.checks || []).filter((c) => !(c.nome in anterior.oks)).length;
      L.push(`Desde o relatório anterior (${dd(new Date(anterior.t))}${anterior.ver && anterior.ver !== data.whatsapp ? `, WhatsApp ${anterior.ver}→${data.whatsapp}` : ''}): `
        + (quebrou.length || voltou.length || novos ? `${quebrou.length ? 'PIOROU: ' + quebrou.join('; ') : ''}${quebrou.length && voltou.length ? ' · ' : ''}${voltou.length ? 'melhorou: ' + voltou.join('; ') : ''}${novos ? ` · ${novos} checagem(ns) nova(s)` : ''}` : 'nada mudou'));
    } else L.push('Desde o relatório anterior: sem base de comparação (primeira vez).');
    const ap = data.auditoriaPonte; // v1.29: pedidos à ponte que NÃO vieram do painel (outro script ou extensão na página do WhatsApp)
    if (ap && ap.recusadas) L.push(`Ponte: ${ap.recusadas} pedido(s) para ENVIAR, BLOQUEAR ou REMOVER vieram sem a chave do painel e foram RECUSADOS (algum script ou outra extensão da página tentou usar a ponte do AtendeZap).`);
    else if (ap && ap.externas) L.push(`Ponte: ${ap.externas} pedido(s) de leitura vieram de fora do painel (nada foi enviado nem alterado).`);
    const ac = data.acesso; // v1.34: acesso da equipe
    if (ac?.conectado) L.push(`Acesso da equipe: perfil ${ac.perfil || '—'}${ac.desativado ? ' · DESATIVADO pelo administrador' : ac.emergencia ? ' · robô PAUSADO pelo administrador' : ac.restrito ? ' · NÃO CONFIRMADO há dias (robô desligado)' : ` · confirmado há ${ac.idadeMin ?? '?'} min`}${ac.liberados?.length ? ' · liberados: ' + ac.liberados.join(', ') : ' · NADA liberado ainda'}.`);
    if (data.partes?.desligadas?.length) L.push('Partes do painel DESLIGADAS: ' + data.partes.desligadas.join(', ') + ' (ligue em Configurações › Partes do painel).');   // v1.36.1: explica robô parado, fila sumida etc.
    const lab = Object.entries(data.ponte?.lab?.overrides || {});
    if (lab.length) L.push(`Laboratório ligado: ${lab.map(([k]) => k).slice(0, 8).join(', ')}${lab.length > 8 ? '…' : ''}`);
    if (data.novidades) L.push(`Novidades do WhatsApp: ${AZU.invTexto(data.novidades)}`);
    if (data.atendente && data.atendente.modo && data.atendente.modo !== 'desligado') {
      const r = data.atendente;
      L.push(`Atendente IA: ${r.modo} · IA ${r.usoIA} hoje · ${r.pausasAtivas} pausada(s) · última mensagem ${r.ultimoEventoMin == null ? 'nenhuma desde que a página abriu' : 'há ' + r.ultimoEventoMin + ' min'}${r.problemas?.length ? ' · ⚠ ' + r.problemas.join('; ') : ' · sem problemas'}`);
    }
    if (data.tempos) {
      const lentos = (data.checks || []).filter((c) => c.ms > 250).sort((a, b) => b.ms - a.ms).slice(0, 3).map((c) => `${c.nome} ${c.ms} ms`);
      L.push(`Tempo: ${(data.tempos.total / 1000).toFixed(1)} s (ponte ${data.tempos.ponte} ms · testes ao vivo ${data.tempos.probe} ms · checagens ${data.tempos.checks} ms)${lentos.length ? ' · lentas: ' + lentos.join(', ') : ''}`);
    }
    if (data.perf) L.push(`Custo do AtendeZap: ${data.perf.pct}% do tempo${data.perf.linhas.length ? ' — ' + data.perf.linhas.slice(0, 3).join(' | ') : ''}`);
    if ((data.erros || []).length) L.push(`Erros recentes (${data.erros.length}): ${data.erros.slice(0, 3).map((e) => `${e.onde || e.where || ''} ${e.msg || e.mensagem || e.message || ''}`.trim().slice(0, 100)).join(' | ')}`);
    return L.join('\n');
  };

  // v1.16 — "novidades do WhatsApp": o que apareceu/sumiu/virou entre duas leituras do inventário {modulos:[nomes], flags:{nome: valor}}.
  // Roda a cada autoteste, mesmo sem mudar a versão (o servidor liga funções para a conta sem o WhatsApp atualizar).
  const ehBool = (v) => v === true || v === false || v === 'true' || v === 'false';
  AZU.diffInventario = (ant, atual) => {
    const A = new Set(ant.modulos || []), B = new Set(atual.modulos || []);
    const d = AZU.diffChaves(ant.flags || {}, atual.flags || {});
    const virou = d.mudaram.filter(([, de, para]) => ehBool(de) && ehBool(para)).map(([nome, de, para]) => ({ nome, de, para }));
    return {
      modNovos: [...B].filter((m) => !A.has(m)), modSumiram: [...A].filter((m) => !B.has(m)),
      flagsNovas: d.novas.map((nome) => ({ nome, valor: atual.flags[nome] })), flagsSumiram: d.removidas,
      flagsVirou: virou, flagsOutras: d.mudaram.length - virou.length,
    };
  };
  // ---- relevância dos módulos novos (v1.33): o que mexe com o que você usa. Só pelos NOMES dos módulos: é um palpite, não garante que esteja ligado para você. ----
  AZU.REL = { grupos: 'Grupos', business: 'Business', org: 'Organizações' };
  const TOK_REL = {
    grupos: ['group', 'groups', 'community', 'communities', 'subgroup', 'subgroups'],
    business: ['business', 'biz', 'smb', 'catalog', 'catalogs', 'commerce', 'coex', 'storefront', 'cart', 'payment', 'payments', 'pix', 'product', 'products', 'ctwa'],
    org: ['org', 'orgs'],
  };
  // "WASmaxInGroupsGetLinkedGroups…" -> ['wa','smax','in','groups','get','linked','groups'…]; compara PALAVRAS inteiras ("Border" não é "order", "Cartographer" não é "cart")
  AZU.tokensModulo = (nome) => (String(nome).replace(/^use(?=[A-Z])/, '').replace(/\.react$/i, '').match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+/g) || []).map((t) => t.toLowerCase());
  AZU.relevanciaModulo = (nome) => {
    const t = AZU.tokensModulo(nome), conexaoDireta = t.some((x, i) => x === 'direct' && t[i + 1] === 'connection'); // "DirectConnection": conexão direta do Business
    return Object.keys(TOK_REL).filter((k) => t.some((x) => TOK_REL[k].includes(x)) || (k === 'business' && conexaoDireta));
  };
  AZU.contarRel = (nomes) => { const r = { grupos: 0, business: 0, org: 0 }; for (const n of nomes || []) for (const k of AZU.relevanciaModulo(n)) r[k]++; return r; };
  AZU.priorizarRel = (nomes) => [...nomes.filter((n) => AZU.relevanciaModulo(n).length), ...nomes.filter((n) => !AZU.relevanciaModulo(n).length)]; // os relevantes primeiro (estável)
  AZU.relEntrada = (e) => e?.relNovos || AZU.contarRel(e?.modNovos || []); // entradas antigas não têm a contagem guardada: usa os nomes que sobraram
  // Lista [[chave, nome, n]] só com o que tem módulo, SEMPRE na mesma ordem (Grupos, Business, Organizações): o armazenamento do Chrome reordena as chaves do objeto.
  AZU.relLista = (rel) => Object.keys(AZU.REL).filter((k) => rel && rel[k]).map((k) => [k, AZU.REL[k], rel[k]]);
  AZU.invVazio = (d) => !d || !(d.modNovos.length || d.modSumiram.length || d.flagsNovas.length || d.flagsSumiram.length || d.flagsVirou.length);
  // entrada compacta para o histórico (limites para não crescer sem fim)
  AZU.invEntrada = (d, meta) => ({
    ...meta, nMod: d.modNovos.length, nSum: d.modSumiram.length, nFlags: d.flagsNovas.length, nFlagsSum: d.flagsSumiram.length, nVirou: d.flagsVirou.length, nOutras: d.flagsOutras,
    relNovos: AZU.contarRel(d.modNovos), modNovos: AZU.priorizarRel(d.modNovos).slice(0, 60), modSumiram: d.modSumiram.slice(0, 30), // a contagem é da lista COMPLETA; dos 60 nomes guardados, os relevantes vêm primeiro
    flagsNovas: d.flagsNovas.slice(0, 80).map((f) => ({ nome: f.nome, valor: String(f.valor).slice(0, 60) })), flagsSumiram: d.flagsSumiram.slice(0, 30),
    flagsVirou: d.flagsVirou.slice(0, 80),
  });
  AZU.invTexto = (e) => {
    if (!e) return '';
    const dd = (t) => { const d = new Date(t); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };
    const partes = [];
    if (e.nMod) partes.push(`+${e.nMod} módulos`); if (e.nSum) partes.push(`−${e.nSum} módulos`);
    const rel = AZU.relLista(AZU.relEntrada(e)).map(([, nome, n]) => `${nome} ${n}`);
    if (e.nMod && rel.length) partes.push(`mexem com o que você usa: ${rel.join(', ')}`);
    if (e.nFlags) partes.push(`+${e.nFlags} chaves (${e.flagsNovas.slice(0, 3).map((f) => f.nome).join(', ')}${e.nFlags > 3 ? '…' : ''})`);
    if (e.nVirou) partes.push(`${e.nVirou} viraram liga/desliga (${e.flagsVirou.slice(0, 3).map((f) => `${f.nome} ${f.de}→${f.para}`).join(', ')}${e.nVirou > 3 ? '…' : ''})`);
    if (e.nFlagsSum) partes.push(`−${e.nFlagsSum} chaves`);
    return `${dd(e.tAnt)}→${dd(e.t)}${e.de && e.ate && e.de !== e.ate ? ` (WhatsApp ${e.de}→${e.ate})` : ''}: ${partes.join(' · ') || 'sem mudanças'}`;
  };

  AZU.BACKUP_GROUPS = [
    ['respostas', 'Respostas rápidas, categorias e mídias', ['respostasRapidas', 'categorias']],
    ['assinatura', 'Assinatura', ['assinatura']],
    ['fixados', 'Conversas fixadas (e a aba de cada uma)', ['pinChat', 'pinAbas']],
    ['unicos', 'Grupos sem duplicar (conjuntos)', ['gruposUnicos']],
    ['lote', 'Destinos salvos do envio para vários', ['loteDestinos']],
    ['ocultas', 'Conversas ocultas', ['conversasOcultas']],
    ['config', 'Configuração do backup automático', ['backupAutomatico']],
    ['ajustes', 'Configurações do painel (partes ligadas, link da lista de frete)', ['modulos', 'listaCargasUrl', 'vagasCfg', 'gruposSoCfg', 'recuperarCfg', 'atendCfg', 'memFatos', 'conhecCfg', 'ligCfg', 'avCfg', 'resumoAceitou', 'comecarOculto']],
    ['conhecimento', 'Banco de conhecimento (trocas já sem dados pessoais) — fica de fora, a não ser que você marque', ['conhecBanco', 'conhecVistos', 'conhecEstado']],
  ];
  // chaves que NUNCA vão para um arquivo de backup (segredos e identificação deste computador), nem no backup completo
  AZU.BACKUP_NUNCA = ['iaCfg', 'iaUso', 'acessoCfg', 'acessoInst', 'acessoEstado', 'acessoAplicado', 'mapaBase', 'refCache', 'inventarioHist', 'diagUltimo'];   // + caches do diagnóstico (grandes e que não voltam na restauração)
  AZU.backupKeys = (dados, grupos) => {
    const keys = [];
    for (const [g, , ks] of AZU.BACKUP_GROUPS) if (grupos.includes(g)) keys.push(...ks.filter((k) => k in dados));
    if (grupos.includes('respostas')) keys.push(...Object.keys(dados).filter((k) => k.startsWith('midia_')));
    return keys;
  };
  // Mescla: listas com id juntam (o do arquivo vence), listas simples somam sem repetir, o resto é substituído.
  AZU.mergeBackup = (atual, entrada, keys, modo) => {
    const out = {};
    for (const k of keys) {
      const a = atual[k], b = entrada[k];
      if (modo !== 'mesclar' || !Array.isArray(a) || !Array.isArray(b)) { out[k] = b; continue; }
      if (b.every(Array.isArray)) { // pares [id, nome] (destinos salvos)
        out[k] = [...new Map([...a, ...b].map((x) => [x[0], x])).values()];
      } else if (b.every((x) => x && typeof x === 'object' && 'id' in x)) {
        const m = new Map(a.map((x) => [x.id, x]));
        for (const x of b) m.set(x.id, x);
        out[k] = [...m.values()];
      } else out[k] = [...new Set([...a, ...b])];
    }
    // Restaurar NUNCA liga o robô: num segundo computador (ou perfil) dois robôs responderiam ao mesmo cliente. O aceite da privacidade também precisa ser dado de novo.
    if (out.atendCfg && typeof out.atendCfg === 'object') out.atendCfg = { ...out.atendCfg, modo: 'desligado', aceito: false };
    return out;
  };

  // Tipo de envio da wa-js a partir do mime do arquivo (envio em lote)
  AZU.fileType = (mime) => {
    const m = String(mime || '');
    if (/^image\/(png|jpe?g|webp)$/.test(m)) return 'image';
    if (m.startsWith('video/')) return 'video';
    if (m.startsWith('audio/')) return 'audio';
    return 'document';
  };
  // Quantas mensagens o lote vai mandar
  AZU.loteTotal = (nArquivos, temTexto, nDestinos) => nDestinos * (nArquivos + (temTexto ? 1 : 0));

  // O que mudou nas chaves de recurso do WhatsApp entre duas versões ({nome: valor} -> {nome: valor})
  AZU.diffChaves = (antes, depois) => ({
    novas: Object.keys(depois).filter((k) => !(k in antes)),
    removidas: Object.keys(antes).filter((k) => !(k in depois)),
    mudaram: Object.keys(depois).filter((k) => k in antes && JSON.stringify(antes[k]) !== JSON.stringify(depois[k])).map((k) => [k, antes[k], depois[k]]),
  });

  // Chaves de recurso que são engrenagem interna do WhatsApp (registro, travas de emergência, migração, cache,
  // experimentos, anúncios…): não mudam nada que dê para ver/usar, então ficam fora do Laboratório.
  AZU.ehInterna = (nome) => /(^|_)(log|logs|logging|logged|killswitch|kill|holdout|dummy|wam|metric|metrics|telemetry|debug|test|testing|fix|fixes|migration|migrate|infra|cache|cached|prefetch|sync|syncd|db|worker|voip|wasm|rust|anr|bitmap|qpl|ms|ttl|version|versions|variant|experiment|exp|exposure|upsell|qp|nux|tos|gating|ctwa|3pd|1pd|signal|signals|ml|bwe|stanza|smax|mex|usync|lid|pn|e2ee|integrity|compliance|dsa|abprop|dogfooding|intern|internal|mock|dev|uj|tracking|latency|perf|optimization|optimizations|optimise|optimize|reliability|cleanup|soak|backtest|holdouts|ads|ad)(_|$)/.test(nome);
  // Some também da lista padrão: IA da Meta e afins (centenas de chaves, quase todas dependem do servidor) e as que
  // não têm nenhuma palavra reconhecível no nome (não dá para dizer o que fazem).
  AZU.semUso = (nome) => AZU.ehInterna(nome) || /^(ai|bonsai|aura|hatch|maiba|asteria|bot|imagine|gen_?ai|smba_business_broadcast_genai|web_business_broadcast_genai|wa_native_ads|native_ads|mm_|ig_|fb_|xplat|win_|mac_|android_|ios_)/.test(nome) || !AZU.palpite(nome) ||
    /_ai_|^biz_ai|_ai$|experience_id|^payments_upr|^bb_|^ks_|^rt_|lanczos|vod_|vsr|codec|transcode|shimmer|animation|eligibility|external_ctx|orphan|preload|streamer|consistency|waldo|hybrid|windows|desktop|educational|loading|render|rendering|placeholder|holdout|argentina|mexico|india|indonesia|colombia|peru|chile|jordan|oman|tunisia|dominican|egypt|saudi|uae|nigeria|kenya|turkey|philippines|vietnam|thailand|malaysia|pakistan|bangladesh|eu_only|_eu_|_us_|_uk_/.test(nome);
  // "Pelo nome": tradução palavra a palavra do nome da chave (palpite, não é descrição oficial)
  const TOK = { ai: 'IA da Meta', bot: 'robô', bots: 'robôs', chat: 'conversa', chats: 'conversas', chatlist: 'lista de conversas', group: 'grupo', groups: 'grupos', status: 'status',
    poll: 'enquete', polls: 'enquetes', sticker: 'figurinha', stickers: 'figurinhas', call: 'ligação', calls: 'ligações', calling: 'ligações', video: 'vídeo', audio: 'áudio', ptt: 'áudio',
    media: 'mídia', photo: 'foto', photos: 'fotos', image: 'imagem', message: 'mensagem', messages: 'mensagens', msg: 'mensagem', msgs: 'mensagens', search: 'busca', reaction: 'reação',
    reactions: 'reações', channel: 'canal', channels: 'canais', newsletter: 'canal', business: 'Business', smb: 'Business', biz: 'Business', smba: 'Business', catalog: 'catálogo',
    payment: 'pagamento', payments: 'pagamentos', pix: 'Pix', event: 'evento', events: 'eventos', community: 'comunidade', communities: 'comunidades', username: 'nome de usuário',
    usernames: 'nomes de usuário', contact: 'contato', contacts: 'contatos', edit: 'editar', editor: 'editor', forward: 'encaminhar', forwarding: 'encaminhamento', pin: 'fixar',
    pinned: 'fixado', archive: 'arquivar', mute: 'silenciar', muted: 'silenciado', notification: 'notificação', notifications: 'notificações', link: 'link', links: 'links',
    preview: 'prévia', previews: 'prévias', album: 'álbum', hd: 'HD', thread: 'conversa', threads: 'conversas', sender: '(quem envia)', receiver: '(quem recebe)', receiving: '(receber)',
    send: 'enviar', sending: 'envio', create: 'criar', creation: 'criação', share: 'compartilhar', sharing: 'compartilhamento', schedule: 'agendar', scheduled: 'agendado',
    list: 'lista', lists: 'listas', filter: 'filtro', filters: 'filtros', quick: 'rápido', reply: 'resposta', replies: 'respostas', draft: 'rascunho', drafts: 'rascunhos',
    theme: 'tema', avatar: 'avatar', avatars: 'avatares', music: 'música', location: 'localização', document: 'documento', admin: 'administrador', member: 'membro', members: 'membros',
    invite: 'convite', invites: 'convites', broadcast: 'transmissão', label: 'etiqueta', labels: 'etiquetas', order: 'pedido', orders: 'pedidos', cart: 'carrinho', home: 'início',
    profile: 'perfil', privacy: 'privacidade', screen: 'tela', settings: 'configurações', menu: 'menu', button: 'botão', icon: 'ícone', banner: 'faixa', emoji: 'emoji',
    keyboard: 'teclado', shortcut: 'atalho', shortcuts: 'atalhos', voice: 'voz', voicemail: 'recado de voz', camera: 'câmera', screenshare: 'compartilhar tela', story: 'status',
    likes: 'curtidas', like: 'curtir', comment: 'comentário', comments: 'comentários', mention: 'menção', mentions: 'menções', translate: 'traduzir', translation: 'tradução',
    transcription: 'transcrição', summary: 'resumo', summarize: 'resumir', meta: 'Meta', glasses: 'óculos', imagine: 'gerar imagem', web: '', wa: '', enabled: '', enable: '',
    is: '', the: '', for: '', to: '', of: '', in: '', on: '', and: '', with: '', new: 'novo', v2: '(v2)', m1: '', m2: '', m3: '' };
  AZU.palpite = (nome) => [...new Set(String(nome).split('_').map((p) => TOK[p] ?? null).filter((x) => x))].join(' · ');

  globalThis.AZU = AZU;
})();
