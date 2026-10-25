// Roda antes da wa-js. Vigia os erros do console da página para o Diagnóstico:
// - "Module X was not found with ..." da wa-js: são funções que o AtendeZap não usa; guardamos e não repassamos.
// - erros do próprio WhatsApp (ErrorUtils etc.): repassamos FORA da nossa pilha (setTimeout), senão o Chrome
//   culpa a extensão por eles na página chrome://extensions (o embrulho do console.error fica na pilha).
// - erros que vêm de código da extensão: repassamos normalmente e contamos.
(() => {
  // Janela extra do WhatsApp (ligação em "Mover para nova janela"): foi aberta pela janela principal.
  // Lá não tem lista de conversas nem a wa-js funciona: a extensão não faz nada.
  try { if (window.opener && window.opener.location.host === location.host) return; } catch {}
  if (window.__azPre) return;
  window.__azPre = true;
  const ausentes = (window.__azModulosAusentes = []);
  const reg = (window.__azConsole = { whatsapp: 0, extensao: 0, ultimos: [] });
  // sem números longos (telefones/ids) e curto: o relatório não leva dados de conversa
  const limpa = (a) => a.map((x) => (x instanceof Error ? x.message : typeof x === 'object' ? '[objeto]' : String(x)))
    .join(' ').replace(/\d{6,}/g, '#').slice(0, 200);
  const anota = (origem, args) => {
    reg[origem]++;
    const msg = limpa(args);
    const igual = reg.ultimos.find((u) => u.origem === origem && u.msg === msg);
    if (igual) igual.n++;
    else { reg.ultimos.unshift({ origem, msg, n: 1, t: new Date().toTimeString().slice(0, 8) }); reg.ultimos.length = Math.min(reg.ultimos.length, 15); }
  };
  // só quem chamou DIRETO decide (linha depois de 'Error' e do embrulho): o WhatsApp passa por funções que a
  // wa-js embrulha, então nosso código aparece mais fundo na pilha de erros que são do WhatsApp
  const ehNosso = (pilha, pula = 2) => /chrome-extension:\/\//.test(String(pilha || '').split('\n')[pula] || '');
  const orig = console.error;
  console.error = function (...args) {
    const m = typeof args[0] === 'string' && /^Module (\S+) was not found with (.*)$/.exec(args[0]);
    if (m) {
      if (!ausentes.some((a) => a.nome === m[1])) ausentes.push({ nome: m[1], busca: m[2].slice(0, 160) });
      return;
    }
    // a wa-js avisa "func is not a function" quando uma das 44 funções internas do WhatsApp que ela embrulha deixou de existir. QUAL foi? (pela pilha + lib/wrapalvos.js).
    // Conhecida e inofensiva (isLidMigrated): só anota e ignora. Outra: segue como aviso, mas com o NOME da função, para o relatório mostrar o que mudou no WhatsApp.
    if (args[0] === 'func is not a function' && window.AZWRAP) {
      const alvo = window.AZWRAP.resolver(new Error().stack);
      if (alvo && window.AZWRAP.BENIGNOS.includes(alvo)) { const l = (window.__azWrapInofensivos = window.__azWrapInofensivos || []); if (!l.includes(alvo)) l.push(alvo); return; }
      if (alvo) args = ['func is not a function (wa-js: ' + alvo + ')'];
    }
    // a wa-js avisa assim quando não consegue trocar uma função interna (afeta só o setChatList, que não usamos): não é problema
    if (typeof args[0] === 'string' && /^(func is not an exported function|function path was not found)$/.test(args[0])) return;
    if (!/^ErrorUtils caught/.test(String(args[0])) && ehNosso(new Error().stack)) { anota('extensao', args); return orig.apply(this, args); }
    anota('whatsapp', args);
    setTimeout(orig.bind(console, ...args));
  };
  addEventListener('error', (e) => { if (/chrome-extension:/.test(e.filename || '') || ehNosso(e.error?.stack, 1)) anota('extensao', [e.message]); });
  addEventListener('unhandledrejection', (e) => { if (ehNosso(e.reason?.stack, 1)) anota('extensao', [e.reason?.message || e.reason]); });
})();
