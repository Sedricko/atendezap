// AtendeZap — Monitor de limitações e "o que o WhatsApp registra" (v1.49). Regras puras, sem tela (testadas em test/util.test.js).
// Só LÊ: nada aqui muda limite ou regra anti-spam (regra do Johon: limites do servidor e anti-spam nunca são burlados).
(() => {
  const M = {};
  // [chave, nome em português, o que significa, grupo]. As explicações vêm do nome da chave e da função-porteiro que a lê: são leitura, não documentação oficial.
  M.CATALOGO = [
    ['wa_individual_new_chat_msg_capping_enabled', 'Teto de mensagens para contatos novos', 'Ligado = o WhatsApp limita quantas mensagens você manda para números com quem nunca conversou.', 'antispam'],
    ['wa_individual_new_chat_msg_capping_limit', 'Tamanho desse teto', '0 = sem teto definido para a sua conta.', 'antispam'],
    ['wa_individual_new_chat_thread_capping_limit', 'Teto de conversas novas', 'Quantas conversas novas você pode abrir (0 = sem teto).', 'antispam'],
    ['new_chat_msg_capping_first_warning_threshold_percentage', 'Aviso do teto, em %', 'Com o teto ligado, o WhatsApp avisa ao chegar nesta porcentagem.', 'antispam'],
    ['wa_nct_capping_kill_switch_enabled', 'Trava geral do teto', 'Ligada = o teto de contatos novos fica desativado. Se desligar, o teto pode passar a valer.', 'antispam'],
    ['enable_spam_reporting_pre_logging', 'Registro ao abrir "denunciar"', 'O WhatsApp registra quando alguém abre a opção de denunciar, mesmo sem confirmar.', 'antispam'],
    ['unknown_user_persistence_logging_enabled', 'Registro de conversa com quem não é contato', 'Mensagens com números fora da agenda são acompanhadas.', 'antispam'],
    ['rt_receive_reporting_tag', 'Etiqueta de denúncia nas mensagens recebidas', 'Cada mensagem leva uma etiqueta: se alguém denunciar, o WhatsApp confirma quem mandou o quê.', 'antispam'],
    ['rt_sender_reporting_token_version', 'Versão da etiqueta de denúncia', 'Mudou de versão = mudou a forma de rastrear denúncias.', 'antispam'],
    ['defense_mode_quarantine_bulk_unblock_limit', 'Desbloqueio em massa (modo defesa)', 'Quantos contatos dá para desbloquear de uma vez quando a conta está em modo de defesa.', 'antispam'],
    ['enable_group_create_or_add_rate_limiting_error_ux', 'Aviso de limite ao criar ou adicionar em grupo', 'Ligado = aparece aviso quando você cria grupos ou adiciona pessoas rápido demais.', 'antispam'],
    ['smba_business_broadcast_recipient_limit', 'Transmissão (Business): destinatários', '-1 = sem teto.', 'envio'],
    ['smbi_premium_broadcast_max_recipient_limit', 'Transmissão paga: destinatários', 'Teto da transmissão paga do Business.', 'envio'],
    ['premium_broadcast_smb_capping_enabled', 'Teto da transmissão Business', 'Ligado = a transmissão do Business tem teto.', 'envio'],
    ['default_media_limit_mb', 'Arquivo comum (MB)', 'Tamanho máximo de foto, áudio ou documento.', 'envio'],
    ['default_video_limit_mb', 'Vídeo (MB)', 'Tamanho máximo de vídeo.', 'envio'],
    ['default_status_media_limit_mb', 'Foto/vídeo no status (MB)', 'Tamanho máximo no status.', 'envio'],
    ['media_picker_select_limit', 'Mídias por envio', 'Quantas fotos/vídeos dá para escolher de uma vez.', 'envio'],
    ['scheduled_messages_window_duration_max_seconds', 'Agendar mensagem até (segundos)', 'Quanto tempo à frente dá para agendar.', 'envio'],
    ['group_size_limit', 'Membros por grupo', 'Máximo de pessoas num grupo.', 'grupos'],
    ['community_announcement_group_size_limit', 'Membros no grupo de avisos da comunidade', 'Máximo no grupo de avisos.', 'grupos'],
    ['group_history_new_user_threshold_secs', 'Histórico para quem entra no grupo (segundos)', 'Quem entra recebe as mensagens deste período.', 'grupos'],
    ['group_history_message_count_limit', 'Mensagens do histórico para quem entra', 'Quantas mensagens antigas quem entra recebe.', 'grupos'],
    ['parent_group_link_limit', 'Grupos por comunidade', 'Máximo de grupos ligados a uma comunidade.', 'grupos'],
    ['pinned_messages_m2_pin_max', 'Mensagens fixadas por conversa', 'Máximo de mensagens fixadas.', 'grupos'],
  ];
  M.GRUPOS = { antispam: 'Anti-spam e denúncia', envio: 'Envio e tamanhos', grupos: 'Grupos e conversas', outras: 'Outros limites (nome técnico)' };
  // Outras chaves com cara de limite (fora do catálogo): entram na comparação com o nome técnico. Telemetria, IA e música ficam de fora.
  const LIMITE = /limit|max_|_max\b|_max_|capping|quota|threshold|rate_limit|spam|integrity|restrict|enforce|defense|block/i;
  const FORA = /logging|_log_|wam|qpl|^ai_|meta_ai|bonsai|hatch|music|aura|bug_report|calling_|voip|av1_|audio_level/i;
  const NOMES = new Set(M.CATALOGO.map((c) => c[0]));
  M.monitorado = (k) => NOMES.has(k) || (LIMITE.test(k) && !FORA.test(k));
  M.extrair = (recursos) => Object.fromEntries((recursos || []).filter((r) => r?.nome && M.monitorado(r.nome)).map((r) => [r.nome, r.valor]));
  const ig = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // O que mudou desde a base ("visto"). Sem base = primeira leitura: nada é "mudança".
  M.comparar = (base, atual) => {
    if (!base) return [];
    const info = Object.fromEntries(M.CATALOGO.map(([k, n, e, g]) => [k, { nome: n, explica: e, grupo: g }]));
    const ks = new Set([...Object.keys(base), ...Object.keys(atual || {})]), out = [];
    for (const k of ks) {
      const a = Object.prototype.hasOwnProperty.call(base, k) ? base[k] : undefined, b = Object.prototype.hasOwnProperty.call(atual || {}, k) ? atual[k] : undefined;
      if (ig(a, b)) continue;
      out.push({ k, antes: a, agora: b, tipo: a === undefined ? 'nova' : b === undefined ? 'sumiu' : 'mudou', ...(info[k] || { nome: k, explica: '', grupo: 'outras' }) });
    }
    const ordem = ['antispam', 'envio', 'grupos', 'outras'];
    return out.sort((x, y) => ordem.indexOf(x.grupo) - ordem.indexOf(y.grupo) || x.k.localeCompare(y.k));
  };
  // "O que o WhatsApp registra": os módulos de telemetria (…WamEvent) por assunto. Só nomes; o que cada um mede é leitura do nome.
  M.ASSUNTOS = [
    ['Denúncia, bloqueio e anti-spam', /Spam|Report|Block|Abuse|Integrity|Suspicious|Restrict|Ban[A-Z]|Ban$|Enforcement|Capping|Fraud|Scam/],
    ['Mensagens', /Message|Msg|Send|Receive|Forward|Revoke|Edit|Reaction|Delete/],
    ['Ligações', /Call|Voip/], ['Status', /Status/], ['Grupos e comunidades', /Group|Community/],
    ['Contatos e busca', /Contact|Search|Phonebook|Address/], ['Business e anúncios', /Biz|Business|Ctwa|Ad[A-Z]|Catalog|Order|Payment|Smb/],
    ['Canais', /Newsletter|Channel/], ['Mídia', /Media|Image|Video|Audio|Ptt|Sticker|Document|Gif/], ['Meta AI', /Ai[A-Z]|MetaAi|Bot/],
    ['Aparelho e login', /Login|Logout|Device|Companion|Session|Pairing|Registration|Linked/],
    ['Uso da tela', /Navigation|Click|Tap|View|Open|Impression|Banner|Nux|Tooltip|Menu|Drawer|Scroll|Ui[A-Z]/],
    ['Desempenho e erros', /Perf|Latency|Crash|Error|Load|Startup|Memory|Battery|Network|Qpl/],
    ['Privacidade', /Privacy|ViewOnce|Screenshot|Disappearing|Ephemeral|LastSeen|Online|Presence|Typing/],
  ];
  M.eventos = (modulos) => (modulos || []).filter((n) => typeof n === 'string' && n.endsWith('WamEvent')).map((n) => n.replace(/^WAWeb/, '').replace(/WamEvent$/, ''));
  M.assuntoDe = (ev) => (M.ASSUNTOS.find(([, rx]) => rx.test(ev)) || ['Outros'])[0];
  M.porAssunto = (evs) => { const o = {}; for (const e of evs || []) (o[M.assuntoDe(e)] ||= []).push(e); return o; };
  M.eventosNovos = (base, atual) => (base ? (atual || []).filter((e) => !base.includes(e)) : []);
  globalThis.AZMON = M;
})();
