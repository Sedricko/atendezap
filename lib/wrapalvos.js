// GERADO por tools/gerar-wrapalvos.js a partir de lib/wppconnect-wa.js (44 chamadas de wrapModuleFunction). NÃO edite à mão: o teste confere.
// Carregado no mundo da página ANTES de page/pre.js. [linha, coluna, função do WhatsApp que a wa-js embrulha], em ordem de posição.
(() => {
  'use strict';
  const ALVOS = [[2,108064,"getABPropConfigValue"],[2,108439,"isCallingEnabled"],[2,108491,"isUnsupportedBrowserForWebCalling"],[2,108560,"getUnsupportedBrowserReason"],[2,108625,"isVoipDownloadEnabled"],[2,128157,"handleChatSimpleReceipt"],[2,128274,"handleGroupSimpleReceipt"],[2,128392,"handleStatusSimpleReceipt"],[2,133490,"addToLabelCollection"],[2,133597,"removeLabelFromCollection"],[2,138928,"upsertVotes"],[2,141296,"createOrUpdateReactions"],[2,193798,"getABPropConfigValue"],[2,193915,"genMinimalLinkPreview"],[2,197514,"createMsgProtobuf"],[2,198356,"encodeMaybeMediaType"],[2,198467,"mediaTypeFromProtobuf"],[2,198907,"typeAttributeFromProtobuf"],[2,200026,"createFanoutMsgStanza"],[2,201240,"encryptAndSendSenderKeyMsg"],[2,201871,"deprecatedSendStanzaAndReturnAck"],[2,202470,"getABPropConfigValue"],[2,226426,"generateVideoThumbsAndDuration"],[2,227192,"processRawSticker"],[2,227462,"uploadMedia"],[2,230310,"typeAttributeFromProtobuf"],[2,231813,"mediaTypeFromProtobuf"],[2,231924,"typeAttributeFromProtobuf"],[2,240586,"getShouldAppearInList"],[2,241145,"isFilterExcludedFromSearchTreatmentInInboxFlow"],[2,244993,"mediaTypeFromProtobuf"],[2,245393,"typeAttributeFromProtobuf"],[2,245815,"isUnreadTypeMsg"],[2,246013,"createChatRecord"],[2,246201,"isLidMigrated"],[2,246293,"getABPropConfigValue"],[2,261700,"getErrorCodeFromLogoutReason"],[2,294378,"getNumChatsPinned"],[2,319540,"updateDBForGroupAction"],[2,422467,"createMsgProtobuf"],[2,422891,"encryptAndSendMsg"],[2,423408,"getABPropConfigValue"],[2,423578,"primaryFeatureEnabled"],[2,427493,"handleSingleMsg"]];
  // inofensivos: ver tools/gerar-wrapalvos.js
  const BENIGNOS = ["isLidMigrated"];
  // pilha de um console.error("func is not a function") -> nome da função que a wa-js tentou embrulhar ('' se não der para saber).
  // 1º quadro da wa-js = dentro do wrapModuleFunction (onde o erro é impresso); 2º = a chamada que pediu o embrulho (a posição que procuramos).
  const resolver = (pilha) => {
    const q = String(pilha || '').split('\n').filter((l) => /wppconnect-wa\.js:\d+:\d+/.test(l)), m = q[1] && /wppconnect-wa\.js:(\d+):(\d+)/.exec(q[1]);
    if (!m) return '';
    const L = +m[1], C = +m[2]; let nome = '';
    for (const [l, c, n] of ALVOS) { if (l < L || (l === L && c <= C)) nome = n; else break; }
    return nome;
  };
  globalThis.AZWRAP = { ALVOS, BENIGNOS, resolver };
})();
