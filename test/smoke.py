import asyncio, json, sys, tempfile
from playwright.async_api import async_playwright
# Uso: python3 -I test/smoke.py <pasta_para_prints> [pasta_da_extensao]
# Abre o Chromium com a extensão numa página falsa do WhatsApp e uma wa-js simulada (sem WPP.webpack, como a 4.7.1 real).
import os, re
os.environ.setdefault('PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS', '1')  # deixa o route pegar o fetch do background (lista de cargas)
OUT = sys.argv[1]
EXT = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FAKE = """<!doctype html><html><head><meta charset="utf-8"></head><body class="web dark" style="margin:0;font-family:sans-serif;background:#0b141a;color:#e9edef">
<div id="app" style="position:absolute;top:0;left:0;width:100%;height:100%"><div style="display:flex;height:100%"><div id="side" style="width:380px;display:flex;flex-direction:column;border-right:1px solid #333">
<header style="height:56px;background:#202c33">Conversas</header><div id="filtros"><button data-testid="filter-button" aria-pressed="true" onclick="for(const b of document.querySelectorAll('#filtros button')) b.setAttribute('aria-pressed', b===this)">Tudo</button><button data-testid="filter-button" aria-pressed="false" onclick="for(const b of document.querySelectorAll('#filtros button')) b.setAttribute('aria-pressed', b===this)">Grupos <small>1</small></button></div><div id="pane-side" style="flex:1;overflow:auto;padding:10px">Lista nativa<div role="button" id="rowArq" data-testid="chatlist-panel-archived-button"><span>Arquivadas</span></div><div role="listitem" id="rowAna"><span title="Ana Maria">Ana Maria</span></div><div role="listitem" id="rowOutro"><span title="Outro">Outro</span></div><div role="listitem" id="rowCargas"><div><span title="Grupo Cargas">Grupo Cargas</span><span>19:40</span></div></div><div role="listitem" id="rowFretes"><div><span title="Grupo Fretes">Grupo Fretes</span></div></div><div role="listitem" id="rowG1"><div><span title="Gêmeo">Gêmeo</span></div></div><div role="listitem" id="rowG2"><div><span title="Gêmeo">Gêmeo</span></div></div></div></div>
<div id="main" style="flex:1;display:flex;flex-direction:column"><header style="height:60px;display:flex;align-items:center;background:#202c33;padding:0 12px;transform:translateZ(0)"><div>FP</div><div style="flex:1">+55 62 96366-922</div><div>📹 📞 🔍</div></header>
<div style="flex:1;background:#0b141a"></div>
<footer style="display:flex;padding:10px;background:#202c33"><div contenteditable="true" style="flex:1;background:#2a3942;padding:8px;min-height:20px"></div>
<button aria-label="Enviar" id="send"><span data-icon="send">➤</span></button></footer></div></div><div id="fakeModal" style="position:absolute;right:0;top:0"><div role="listitem" id="rowModal"><span title="Gêmeo">Gêmeo</span></div></div></div><script>const _fb = (id) => ({ memoizedProps: {}, return: { memoizedProps: { chat: { id: { _serialized: id } } }, return: null } });
document.getElementById('rowAna')['__reactFiber$abc'] = _fb('558599990000@c.us'); document.getElementById('rowG1')['__reactFiber$abc'] = _fb('g1@g.us'); document.getElementById('rowG2')['__reactFiber$abc'] = _fb('g2@g.us');
// lista NATIVA do "/" (respostas rápidas do Business): camada flutuante acima do campo enquanto o texto começa com "/"
(function () { const ed = document.querySelector('#main footer [contenteditable]'); ed.addEventListener('input', () => {
  const t = ed.innerText.trim(); let d = document.getElementById('nativoQR');
  if (t.startsWith('/')) { if (!d) { d = document.createElement('div'); d.id = 'nativoQR'; d.setAttribute('style', 'position:absolute;left:40%;bottom:75px;width:300px;height:150px;background:#333;color:#fff;z-index:5'); d.textContent = 'Horário: Estamos fechados agora'; document.getElementById('app').appendChild(d); } }
  else if (d) d.remove(); }); })();
document.getElementById('rowCargas')['__reactFiber$abc'] = { memoizedProps: {}, return: { memoizedProps: { chat: { id: { _serialized: '111@g.us' } } }, return: null } };</script></body></html>"""
STUB = """
window.__log = []; const L = (...a) => window.__log.push(a);
const stMine = { msgs: { remove(m) { this._models = this._models.filter((x) => x !== m); }, _models: [1, 2, 3, 4].map((i) => ({ id: { _serialized: 'st' + i }, ack: i === 4 ? 0 : 2, type: i === 3 ? 'chat' : 'image', t: Date.now() / 1000 - (i === 4 ? 3600 : 600) + i, body: i === 3 ? 'Promoção' : 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', caption: '' })) } };
const ed = () => document.querySelector('#main footer [contenteditable]');
document.getElementById('send').addEventListener('click', () => { L('nativeSend', ed().innerText); ed().innerText=''; });
const wid = (n) => ({ _serialized: n + '@c.us', user: n, server: 'c.us' });
// Cargas: pedidos A e B (A já está em Fretes) · Fretes: pedidos C e B. Conjunto [Cargas, Fretes]: B entra em Cargas; em Fretes vira duplicado
const REQ = { '111@g.us': ['5511999990001', '5511999990002'], '222@g.us': ['5511999990003', '5511999990002'] };
// Duplicados: ...05 está em Cargas e Fretes (sai de Fretes); ...09 é ADMIN nos dois (não pode ser removido)
// ...07 é admin SÓ em Cargas e membro comum em Fretes: também é protegido (admin em qualquer grupo do conjunto nunca sai)
const PART = { '111@g.us': ['5511999990009', '5511999990005', '5511999990007'], '222@g.us': ['5511999990001', '5511999990005', '5511999990009', '5511999990007'] };
const ehAdmin = (g, n) => n.endsWith('9') || (g === '111@g.us' && n.endsWith('7'));
const models = {}; const chat = (id) => models[id] ||= { id: { _serialized: id }, formattedTitle: (window.__nomes && window.__nomes[id]) || 'Ana Maria', unreadCount: 2, t: 5, contact: { pushname: 'Ana' }, archive: false, mute: { expiration: 0, mute(o) { this.expiration = o.expiration; L('mute', o.expiration); }, unmute() { this.expiration = 0; L('unmute'); } }, /* como no WhatsApp real: __x_pin guarda o valor e pin lê dele (apagar __x_pin desafixa) */ set pin(v){ L('pin', id, v > 1e12); this.__x_pin = v; }, get pin(){ return this.__x_pin; } };
window.WPP = { isReady: true, isFullReady: true, loader: { isFullReady: true }, on(ev, fn){ (window.__ev ||= {})[ev] = fn; }, profile: { isBusiness: () => true },
  status: { sendTextStatus: async (t, o) => L('stText', t, o.backgroundColor), sendImageStatus: async (d, o) => {
      L('stImage', o.caption || null);
      stMine.msgs._models.push({ id: { _serialized: 'new' + stMine.msgs._models.length }, ack: 1, type: 'image', t: Date.now() / 1000 - 5, body: '', caption: o.caption || '' });
      if (!window.__stTimeout) { window.__stTimeout = 1; throw new Error('Timeout for wait response of send media status'); } // como no WhatsApp real com foto grande
    }, sendVideoStatus: async (d, o) => L('stVideo', o.caption || null),
    getMyStatus: async () => stMine,
    // como na wa-js 4.7.1 real em conta @lid: remove falha
    remove: async (id) => { throw new Error('Error on remove status with id ' + id); } }, conn: { getABProps: () => [{ name: 'group_size_limit', configValue: 1024 }, { name: 'default_status_media_limit_mb', configValue: 10 }, { name: 'status_video_max_duration', configValue: 30 }, { name: 'default_media_limit_mb', configValue: 16 }, { name: 'default_video_limit_mb', configValue: 180 }, { name: 'status_delete_enabled', configValue: true }, { name: 'poll_add_option_enabled', configValue: false }, { name: 'wa_web_status_resharer_flow_enabled', configValue: false }, { name: 'wa_web_status_reshare_attribution_enabled', configValue: false }, { name: 'poll_add_option_creator_enabled', configValue: false }, { name: 'poll_add_option_participant_enabled', configValue: false }, { name: 'poll_add_option_receiving_enabled', configValue: false }, { name: 'status_likes_sending_enabled', configValue: false }, { name: 'web_group_admin_console_enabled', configValue: true }, { name: 'web_beta_x', configValue: false }, { name: 'scheduled_messages_sender_enabled', configValue: false }, { name: 'poll_end_time_enabled', configValue: 0 }, { name: 'pinned_messages_infinite_sender_enabled', configValue: false }, { name: 'pinned_messages_infinite_receiver_enabled', configValue: false }].map((p) => (window.__abFlip && p.name in window.__abFlip ? { ...p, configValue: window.__abFlip[p.name] } : p)).concat(window.__abExtra || []), setTheme: async (t) => L('setTheme', t), getTheme: () => 'dark', getMyUserId: () => ({ _serialized: '5585@c.us' }) },
  chat: { getMessageById: async (id) => stMine.msgs._models.find((m) => m.id._serialized === id) || Object.values(window.__hist || {}).flat().find((m) => m.id && m.id._serialized === id),
    deleteMessage: async (c, id, media, revoke) => { L('del', id, revoke); const m = ((window.__hist || {})[c] || []).find((q) => q.id && q.id._serialized === id); if (m && revoke && !window.__recusaApagar) m.type = 'revoked'; },
    getActiveChat: () => (window.__semConversa ? null : chat('558599990000@c.us')),
    setInputText: async (t) => { ed().innerText = t; },
    sendGroupInviteMessage: async (c, o) => L('convite', c, o.groupId, o.inviteCode, o.inviteCodeExpiration || null, o.caption || ''),
    sendPixKeyMessage: async (c, d) => L('pix', c, d.keyType, d.name, d.key), sendLocationMessage: async (c, d) => L('local', c, d.lat, d.lng, d.name || ''),
    sendCreatePollMessage: async (c, q, ops, o) => L('enquete', c, q, ops.join('|'), o.selectableCount),
    getMessages: async (c) => (window.__hist && window.__hist[c]) || [{ id: 'poll1', type: 'chat' }, { id: 'poll2', type: 'poll_creation', pollName: 'Carreta livre?', pollOptions: [{ name: 'Sim' }, { name: 'Não' }] }],
    getVotes: async () => ({ votes: [{ sender: wid('5511999990021'), selectedOptions: { 0: {} } }, { sender: wid('5511999990022'), selectedOptions: { 1: {} } }, { sender: wid('5511999990023'), selectedOptions: { 0: {} } }] }),
    sendTextMessage: async (id, t) => L('text', t, id), sendFileMessage: async (id, d, o) => L('file', o.type, o.caption, !!o.isViewOnce, id),
    sendVCardContactMessage: async (id, c) => L('vcard', c.id, c.name),
    openChatBottom: async (id) => L('open', id), markIsComposing: async (id, ms) => (window.__composingTrava ? new Promise(() => {}) : L('composing', ms)), markIsRecording: async () => {},
    find: async (id) => chat(id), downloadMedia: async () => { if (window.__audioFalha) throw new Error('falhou o download'); return new Blob([new Uint8Array([79, 103, 103, 83, 0, 2, 0, 0])], { type: 'audio/ogg; codecs=opus' }); }, archive: async (id, v) => { chat(id._serialized || id).archive = v; L('archive', v); }, list: async () => [{ id: { _serialized: '111@g.us' }, formattedTitle: 'Grupo Cargas', isGroup: true, t: 9 }, { id: { _serialized: '222@g.us' }, formattedTitle: 'Grupo Fretes', isGroup: true, t: 8 }, { id: { _serialized: '333@lid' }, formattedTitle: 'Cliente Zé', isGroup: false, t: 7, unreadCount: 2, msgs: { _models: [{ id: { fromMe: true }, t: Date.now()/1000 - 9000, type: 'chat', body: 'bom dia' }, { id: { fromMe: false }, t: Date.now()/1000 - 7300, type: 'chat', body: 'Tem frete pra SP amanhã?' }, { id: { fromMe: false }, t: Date.now()/1000 - 7200, type: 'e2e_notification' }] } }, { id: { _serialized: '444@c.us' }, formattedTitle: 'Respondido', isGroup: false, t: 6, msgs: { _models: [{ id: { fromMe: false }, t: Date.now()/1000 - 9000, type: 'chat', body: 'oi' }, { id: { fromMe: true }, t: Date.now()/1000 - 8000, type: 'chat', body: 'olá' }] } }, { id: { _serialized: '666@c.us' }, formattedTitle: 'Cliente Maria', isGroup: false, t: 4, msgs: { _models: [{ id: { fromMe: false }, t: Date.now()/1000 - 2400, type: 'chat', body: 'Qual o valor?' }] } }, { id: { _serialized: '555@c.us' }, formattedTitle: 'Recente', isGroup: false, t: 5, msgs: { _models: [{ id: { fromMe: false }, t: Date.now()/1000 - 60, type: 'ptt' }] } }, { id: { _serialized: '558599990000@c.us' }, formattedTitle: 'Ana Maria', isGroup: false, t: 6 }], setChatList: async (t, ids) => L('setChatList', t, ids), sendVCardContactMessage: async (id, c) => L('vcard', c.id, c.name) },
  contact: { get: async (w) => { const id = (w && w._serialized) || String(w); return { isMyContact: !!(window.__salvo && window.__salvo[id] === true) }; }, queryExists: async (n) => ({ wid: { _serialized: n } }), getProfilePictureUrl: async () => null,
    getPnLidEntry: async (w) => ({ phoneNumber: w, lid: undefined }) },
  group: {
    iAmAdmin: async () => true,
    getMembershipRequests: async (g) => (REQ[g] || []).concat((window.__reqExtra || {})[g] || []).map((n) => ({ id: wid(n) })),
    getParticipants: async (g) => (PART[g] || []).map((n) => ({ id: wid(n) })),
    getGroupSizeLimit: async () => 1024,
    ensureGroup: async (g) => ({ groupMetadata: { participants: { length: ({ '111@g.us': 1020, '222@g.us': 1000 })[g] || (PART[g] || []).length, getModelsArray: () => (PART[g] || []).map((n) => ({ id: wid(n), isAdmin: ehAdmin(g, n) })) } } }),
    addParticipants: async (g, ids) => { const u = ids[0]._serialized || ids[0]; L('add', g, u); const fim = u.replace(/@.*/, '').slice(-2); const cod = fim === '12' ? 403 : fim === '13' ? 409 : fim === '14' ? 421 : 200;
      return { [u]: { wid: u, code: cod, message: '', invite_code: cod === 403 ? 'CODE403' : undefined, invite_code_exp: cod === 403 ? 1900000000 : undefined } }; },
    getInviteCode: async (g) => 'INV' + g.slice(0, 3),
    setDescription: async (g, t) => { L('desc', g, t); return true; }, setSubject: async (g, t) => { L('assunto', g, t); return true; },
    setProperty: async (g, k, v) => { L('prop', g, k, v); return true; }, setIcon: async (g, d) => { L('icone', g, String(d).slice(0, 20)); return true; },
    removeParticipants: async (g, ids) => { L('remove', g, ids.map((w) => w._serialized || w)); return ids.map(() => ({})); },
    approve: async (g, ids) => { L('approve', g, ids.map((w) => w._serialized)); return ids.map(() => ({})); },
    reject: async (g, ids) => { L('reject', g, ids.map((w) => w._serialized)); return ids.map(() => ({})); } },
  labels: { getAllLabels: async () => [], addOrRemoveLabels: async () => {} },
  whatsapp: { MsgStore: { get: (id) => (window.__origs || {})[id] }, ChatStore: { get: (id) => chat(id), sort(){ L('sort'); }, trigger(ev){ L('sort', ev); } }, StatusV3Store: { getMyStatus: () => stMine },
    functions: {} } };
// como no WhatsApp real: o módulo de apagar status mudou de nome (wa-js não acha; a ponte procura por nome parecido)
// igual ao WhatsApp 2.3000.1050579926: módulo renomeado + isca (parser de status recebido, NÃO deve ser usado)
const __l0 = WPP.chat.list; WPP.chat.list = async () => (await __l0()).concat(window.__listExtra || []);
WPP.loader.search = (cond) => { const m = (window.__gsMod ||= { getShouldAppearInList: () => true, getPreviewMessage: () => '' }); return cond(m) ? m : null; };
WPP.loader.moduleRequire = { m: { WASmaxInStatusDeliverStatusRevokeMixin: 1,
  WAWebDeleteStatusAction: function (e, t, n) { return n("status_delete_enabled"); },
  WAWebSendTextMsgChatAction: function (e, t, n) { var a = "scheduled_messages_sender_enabled", b = 'web_beta_x'; return [a, b, "nao_e_uma_chave_xyz"]; },
  WAWebPinInfinito: function (e, t, n) { return "pinned_messages_infinite_sender_enabled"; },
  WAWebStatusGatingUtils: {}, WAWebGroupAdminConsoleGatingUtils: {}, WAWebQualquerOutro: { factory: 7 } } };
window.Debug = { VERSION: '2.3000.teste' };
window.__azEsperaVolta = 150; // no teste, a conferência "o status voltou?" espera 150 ms (no real, 3 s)
window.__ab = { status_likes_sending_enabled: false, web_group_admin_console_enabled: true, scheduled_messages_sender_enabled: false, poll_end_time_enabled: 0, pinned_messages_infinite_sender_enabled: false, pinned_messages_infinite_receiver_enabled: false };
const abMod = { getABPropConfigValue: (n) => window.__ab[n] };
WPP.loader.loadModule = (id) => id === 'WAWebABProps' ? abMod : id === 'WAWebDeleteStatusAction'
  ? { clearStatusForRemovedContact: () => L('ERRADO_contato'), deleteStatusForContact: () => L('ERRADO_contato') }
  : id === 'WASmaxInStatusDeliverStatusRevokeMixin' ? { parseStatusRevokeMixin: () => { L('ERRADO_parser'); } }
  : id === 'WAWebStatusGatingUtils' ? { isStatusLikesSendEnabled: function () { return abMod.getABPropConfigValue('status_likes_sending_enabled'); }, useStatusHook: function () { L('ERRADO_hook'); }, isComParametro: function (a) { L('ERRADO_param'); return a; }, statusQuickReplyEmojis: function () { return ['x']; } }
  : id === 'WAWebGroupAdminConsoleGatingUtils' ? { isGroupAdminConsoleEnabled: function () { return abMod.getABPropConfigValue('web_group_admin_console_enabled'); } } : {};
// apagar "para todos" de verdade, como no WhatsApp atual
WPP.whatsapp.Cmd = { sendRevokeMsgs: async (chat, { list }) => { for (const m of list) { L('stRemove', m.id._serialized); stMine.msgs._models = stMine.msgs._models.filter((x) => x !== m);
  if (window.__azRecriaMs) setTimeout(() => { stMine.msgs._models.push(m); }, window.__azRecriaMs); } } }; // __azRecriaMs: o WhatsApp recria o status depois (teste do "voltou")
"""

# v1.11: coluna enxuta — "Conversas" (Fixadas|Ocultas) e "Configurações" (Geral|Backup|Diagnóstico) são grupos com abas
ABA_DE = {'Respostas rápidas': ('Atendimento', 'Respostas'), 'Aguardando resposta': ('Atendimento', 'Aguardando'), 'Assinatura': ('Atendimento', 'Assinatura'), 'Atendente IA': ('Atendimento', 'Atendente IA'), 'Memória IA': ('Atendimento', 'Memória IA'), 'Lista de frete': ('Atendimento', 'Lista de frete'),
          'Pedidos': ('Grupos', 'Pedidos'), 'Conjuntos': ('Grupos', 'Conjuntos'), 'Sem duplicar': ('Grupos', 'Conjuntos'), 'Ajustes dos grupos': ('Grupos', 'Ajustes'),
          'Iniciar conversa': ('Ferramentas', 'Iniciar conversa'), 'Enviar para vários': ('Ferramentas', 'Enviar para vários'), 'Conversas fixadas': ('Ferramentas', 'Fixadas'), 'Exportar conversa': ('Ferramentas', 'Exportar'), 'Contato do cliente': ('Ferramentas', 'Contato'), 'Resumo do que perdi': ('Atendimento', 'Resumo'), 'Avaliação do atendimento': ('Diagnóstico', 'Avaliação'), 'Envios à IA': ('Diagnóstico', 'Envios à IA'), 'Backup': ('Ferramentas', 'Backup'),
          'Conversas ocultas': ('Privacidade', 'Ocultas'), 'Apagar mensagens': ('Privacidade', 'Apagar'), 'Recuperar apagadas': ('Privacidade', 'Recuperar'),
          'Diagnóstico': ('Diagnóstico', 'Saúde'), 'Limites': ('Diagnóstico', 'Limites'), 'Laboratório': ('Diagnóstico', 'Laboratório'), 'Configurações': ('Configurações', None)}
async def ir(page, nome):
    rail, aba = ABA_DE.get(nome, (nome, None))
    if aba and await page.locator('#az-panel .hubtabs .ht', has_text=aba).count():
        await page.locator('#az-panel .hubtabs .ht', has_text=aba).first.click()   # já no grupo: só troca a aba
    else:
        await page.locator(f'#az-panel .tb[data-tip^="{rail}"]').click(); await page.wait_for_timeout(250)
        if aba and await page.locator('#az-panel .hubtabs .ht', has_text=aba).count():
            await page.locator('#az-panel .hubtabs .ht', has_text=aba).first.click()


# ---- v1.13: backup sintético do waTidy (criptografado como o real: CryptoJS/OpenSSL "Salted__", AES-256-CBC, chave por MD5) ----
def fazer_backup_wt(caminho):
    import base64, hashlib, json as _j, os as _os, re as _re
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from cryptography.hazmat.primitives import padding
    senha = _re.search(r"WT_KEY = '([^']+)'", open(_os.path.join(EXT, 'content/waimport.js'), encoding='utf-8').read()).group(1).encode()
    def cifrar(obj):
        salt = _os.urandom(8); d = b''; prev = b''
        while len(d) < 48:
            prev = hashlib.md5(prev + senha + salt).digest(); d += prev
        pad = padding.PKCS7(128).padder(); dado = pad.update(_j.dumps(obj).encode()) + pad.finalize()
        enc = Cipher(algorithms.AES(d[:32]), modes.CBC(d[32:48])).encryptor()
        return base64.b64encode(b'Salted__' + salt + enc.update(dado) + enc.finalize()).decode()
    png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    dados = {
        'respostasRapidas': cifrar([
            {'id': 'rA', 'titulo': 'Boas vindas WT', 'categoria': 'cX', 'type': 'automation'},
            {'id': 'rB', 'titulo': 'Combo WT', 'categoria': 'cX', 'type': 'script', 'script': [{'id': 'rA', 'timer': 1}, {'id': 'rA', 'timer': 7}]}]),
        'categoria': cifrar([{'id': 'cX', 'name': 'Categoria WT', 'hexColor': '#aa3300'}]),
        'pinChat': cifrar([{'chatID': '120363000000000001@g.us', 'pin': 1783595025343}, {'chatID': '5511988887777@c.us', 'pin': 1783595025000}]),
        'respostasRapidasAcao': [{'id': 'rA', 'acao': [
            {'id': 'a1', 'type': 'txt', 'propriedades': {'mensagem': 'Olá #primeiroNome, #saudação!', 'composing': 3, 'aguarde': 2}},
            {'id': 'a2', 'type': 'image', 'propriedades': {'base64': png, 'mensagem': 'Tabela', 'composing': 0, 'aguarde': 1}},
            {'id': 'a3', 'type': 'contact', 'propriedades': {'userID': '5585999990000', 'userName': 'Central WT'}}]}],
    }
    _j.dump(dados, open(caminho, 'w', encoding='utf-8'))

async def main():
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(tempfile.mkdtemp(), headless=True, channel='chromium', accept_downloads=True,
            args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}'], viewport={'width':1400,'height':860})
        errors = []
        await ctx.route('https://web.whatsapp.com/**', lambda r: r.fulfill(status=200, content_type='text/html', body=FAKE))
        def planilha(r):
            u = r.request.url
            corpo = ('📦 *CARGA DISPONÍVEL*\nRef: #9DA62645' if 'id=9DA62645' in u else 'ERRO: carga XX não encontrada na BASE.' if 'id=' in u
                     else '🚚 *LISTA DE CARGAS DISPONÍVEIS*\n\nORIGEM: ITU/SP\nDESTINO: UNAI/MG\n-----')
            return r.fulfill(status=200, content_type='text/plain', body=corpo)
        await ctx.route('https://script.google.com/**', planilha)
        sw = ctx.service_workers[0] if ctx.service_workers else await ctx.wait_for_event('serviceworker')
        await sw.evaluate("""chrome.storage.local.set({
          acessoExigir: false,
          respostasRapidas: [
           {id:'r1', atalho:'oi', titulo:'SMP - Faturamento', categoriaId:'c1', acoes:[
            {id:'a0',tipo:'contato',nomeContato:'SMP Poloni',numero:'28 99959-4109'},
            {id:'a1',tipo:'texto',texto:'{saudacao}, {primeiro_nome}!', digitando: 1},
            {id:'a3',tipo:'imagem',midiaId:'m1',nome:'x.png',legenda:'cap {nome}', unica:true}]},
           {id:'r2', atalho:'rastreio', titulo:'Numero do rastreio', categoriaId:'c2', acoes:[{id:'b',tipo:'texto',texto:'Seu rastreio'}]},
           {id:'r3', atalho:'grupo', titulo:'Grupo - Branco', categoriaId:'', acoes:[{id:'c',tipo:'audio',midiaId:'m1',nome:'a.ogg'}]}],
          midia_m1: {nome:'x.png', mime:'image/png', dataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='},
          categorias: [{id:'c1', nome:'Faturamento', cor:'#25d366'},{id:'c2', nome:'Rastreamento', cor:'#3b82f6'}],
          assinatura: {ativo:true, nome:'Will', estilo:'tachado', posicao:'linha'} })""")
        page = await ctx.new_page()
        page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e.stack)[:600]))
        page.on('console', lambda m: m.type == 'error' and 'teste 5585' not in m.text and errors.append('console: ' + m.text))
        await page.goto('https://web.whatsapp.com/')
        await page.wait_for_timeout(1200)
        await page.evaluate(STUB)
        await page.evaluate("console.error('Module createGroup was not found with e=>e.createGroup&&e.GroupAlreadyExistsError'); console.error('Module forwardMessages was not found with (e,t)=>1')")
        await page.wait_for_timeout(1800)
        res = {}
        async def dlg_next(pg, valor=None, cancelar=False):   # responde ao PRÓXIMO diálogo do painel (uso único, como o 'dialog' do navegador)
            await pg.evaluate("([v, c]) => { document.documentElement.dataset.azDlgNext = JSON.stringify(c ? { cancelar: true } : (v === null ? {} : { valor: v })); }", [valor, cancelar])
        async def sub_atend(pg, nome):
            await pg.locator('#az-panel .seg button', has_text=nome).first.click(); await pg.wait_for_timeout(400)
        res['handle'] = await page.locator('#az-panel .handle').count()
        res['head_in_header'] = await page.evaluate("document.querySelector('#main header #az-head') !== null")
        await page.screenshot(path=f'{OUT}/a-collapsed.png')
        # v1.14: contador de vagas nos grupos (Cargas: 1020 membros -> 4 vagas, achado pelo React; Fretes: 1000 -> 24, achado pelo nome único)
        await page.wait_for_timeout(3500)
        bad = "[...document.querySelectorAll('#side .az-vagas')].map(b => b.textContent + '|' + b.title + '|' + b.className.replace('az-vagas ', ''))"
        res['vagas'] = await page.evaluate(bad)
        res['vagas_marcas'] = await page.evaluate("[...document.querySelectorAll('#side [data-az-chat]')].map(r => r.id + '=' + r.getAttribute('data-az-chat'))")
        res['head_texto_solto'] = await page.evaluate("[...document.querySelector('#az-head').shadowRoot.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent)")  # nada de texto solto ("null") no cabeçalho
        await page.screenshot(path=f'{OUT}/z-vagas.png')
        await sw.evaluate("chrome.storage.local.set({vagasCfg: {ate: 10}})"); await page.wait_for_timeout(2800)
        res['vagas_ate10'] = await page.evaluate(bad)
        await sw.evaluate("chrome.storage.local.set({vagasCfg: {ate: 0}})"); await page.wait_for_timeout(2800)
        res['vagas_volta'] = await page.evaluate("document.querySelectorAll('#side .az-vagas').length")
        # fixar pelo cabeçalho
        await page.locator('#az-head .hb').first.click(); await page.wait_for_timeout(500)
        res['pins'] = await sw.evaluate("chrome.storage.local.get('pinChat').then(d=>d.pinChat)")
        res['pin_btn_on'] = await page.locator('#az-head .hb.on').count()
        # assinatura
        ed = page.locator('#main footer [contenteditable]')
        await ed.click(); await page.keyboard.type('teste'); await page.keyboard.press('Enter'); await page.wait_for_timeout(400)
        # /oi
        # v1.14.2: a lista nativa do "/" não pode aparecer por cima da nossa
        nat_js = "(()=>{const d=document.getElementById('nativoQR'); return d? [d.hasAttribute('data-az-nativo'), getComputedStyle(d).display] : null})()"
        await ed.click(); await page.keyboard.type('/o'); await page.wait_for_timeout(900)
        res['nativo_escondido'] = await page.evaluate(nat_js)
        await page.keyboard.type(' x'); await page.wait_for_timeout(500)     # "/o x" não bate mais com nenhuma resposta nossa
        res['nativo_volta'] = await page.evaluate(nat_js)
        await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace'); await page.wait_for_timeout(500)
        res['nativo_limpo'] = await page.evaluate(nat_js)
        await ed.click(); await page.keyboard.type('/o'); await page.wait_for_timeout(300)
        await page.keyboard.press('Enter'); await page.wait_for_timeout(3000)
        res['nativo_pos_envio'] = await page.evaluate(nat_js)
        # v1.14.1: barra de progresso do envio (texto, espera de 3 s, texto) + botão Parar
        import json as _json
        antes_r = await sw.evaluate("chrome.storage.local.get('respostasRapidas').then(d=>d.respostasRapidas||[])")
        prog = {'id': 'pg1', 'atalho': 'prog', 'titulo': 'Prog', 'categoriaId': '', 'usos': 0, 'acoes': [
            {'id': 'p1', 'tipo': 'texto', 'texto': 'a', 'digitando': 0, 'aguardar': 0}, {'id': 'p2', 'tipo': 'espera', 'segundos': 3},
            {'id': 'p3', 'tipo': 'texto', 'texto': 'b', 'digitando': 0, 'aguardar': 0}]}
        await sw.evaluate("chrome.storage.local.get('respostasRapidas').then(d=>chrome.storage.local.set({respostasRapidas:[...(d.respostasRapidas||[]), %s]}))" % _json.dumps(prog))
        await page.wait_for_timeout(400)
        env = "(()=>{const r=document.querySelector('#az-head').shadowRoot; const b=r.querySelector('.envb'); return b? {tip:b.getAttribute('data-tip'), centro:b.querySelector('.cnt').innerText, p:b.style.getPropertyValue('--p'), fim:b.className.includes('fim'), linha:!!r.querySelector('.envlinha'), linhaAlinhada: (()=>{const l=r.querySelector('.envlinha'), h=document.querySelector('#main header'); if(!l||!h) return null; const a=l.getBoundingClientRect(), b=h.getBoundingClientRect(); return [Math.round(a.left-b.left), Math.round(a.width-b.width), Math.round(a.top-(b.bottom-3))]})(), anel: !!b.querySelector('svg.ring'), compensou: (r.querySelector('.envlinha')||{style:{}}).style.transform || '', larguraHbar:Math.round(r.querySelector('.hbar').getBoundingClientRect().width)} : null})()"
        antes_w = await page.evaluate("Math.round(document.querySelector('#az-head').shadowRoot.querySelector('.hbar').getBoundingClientRect().width)")
        await ed.click(); await page.keyboard.type('/prog'); await page.wait_for_timeout(300)
        await page.keyboard.press('Enter'); await page.wait_for_timeout(1300)
        res['envio_largura_antes'] = antes_w
        res['envio_durante'] = await page.evaluate(env)
        await page.screenshot(path=f'{OUT}/w-envio.png')
        await page.evaluate("document.querySelector('#az-head').shadowRoot.querySelector('.envb').dispatchEvent(new MouseEvent('mousedown', {bubbles: true, composed: true}))"); await page.wait_for_timeout(700)
        res['envio_parado'] = await page.evaluate(env)
        await page.wait_for_timeout(5000)
        res['envio_some'] = await page.evaluate(env)
        await ed.click(); await page.keyboard.type('/prog'); await page.wait_for_timeout(300)
        await page.keyboard.press('Enter'); await page.wait_for_timeout(4600)
        res['envio_fim'] = await page.evaluate(env)
        await page.wait_for_timeout(3000)
        await sw.evaluate("chrome.storage.local.set({respostasRapidas: %s})" % _json.dumps(antes_r)); await page.wait_for_timeout(400)
        # painel
        await page.locator('#az-panel .handle').click(); await page.wait_for_timeout(400)
        res['docked'] = await page.evaluate("[document.body.classList.contains('az-docked'), document.getElementById('app').getBoundingClientRect().width]")
        await page.screenshot(path=f'{OUT}/b-respostas.png')
        await page.locator('#az-panel .gbtn', has_text='Nova').click(); await page.wait_for_timeout(300)
        await page.locator('#az-panel .gbtn', has_text='Adicionar Ação').click(); await page.wait_for_timeout(300)
        await page.screenshot(path=f'{OUT}/c-novo-menu.png')
        await page.locator('#az-panel .ai', has_text='Imagem').click(); await page.wait_for_timeout(300)
        await page.screenshot(path=f'{OUT}/d-novo-imagem.png')
        await page.locator('#az-panel .ib[title=Voltar]').click()
        await page.locator('#az-panel .ib[title=Opções]').first.click()
        await page.locator('#az-panel .imenu button', has_text='Editar').click(); await page.wait_for_timeout(600)
        await page.screenshot(path=f'{OUT}/e-editar.png', full_page=False)
        await page.locator('#az-panel .tb').nth(1).click(); await page.wait_for_timeout(300)
        await page.screenshot(path=f'{OUT}/f-assinatura.png')
        await ir(page, 'Diagnóstico'); await page.wait_for_timeout(1500)
        res['diag_ok'] = await page.locator('#az-panel .diag.ok').count()
        res['modulos'] = await page.locator('#az-panel .diag', has_text='Módulos que a wa-js não achou').inner_text()
        res['diag_bad'] = await page.locator('#az-panel .diag.bad, #az-panel .diag.warn').all_inner_texts()
        await page.screenshot(path=f'{OUT}/g-diag.png')
        await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('details.maisdiag').open = true"); await page.wait_for_timeout(150)  # v1.18: botões raros ficam em "Mais opções"
        async with page.expect_download() as dlm:
            await page.locator('#az-panel .gbtn', has_text='Gerar mapa do WhatsApp').click()
        caminho_mapa = await (await dlm.value).path(); mp = json.load(open(caminho_mapa))
        _p = mp.get('referencias', {}).get('portoes', {})
        res['mapa_refs'] = [mp.get('referencias', {}).get('stats', {}).get('portoes'), _p.get('StatusGatingUtils'), _p.get('GroupAdminConsoleGatingUtils'), mp.get('referencias', {}).get('indices', {}).get('status_delete_enabled'), len(mp.get('novidades', []))]
        res['mapa_enxuto'] = ['indice' not in mp['mapa'], 'diagnostico' not in mp, 'Saúde:' in mp.get('resumo', ''), len(mp['mapa']['modulos']) == mp['mapa']['totalModulos'], sorted(mp['mapa'].get('contagemPorPalavra', {}))[:2], '\n' not in open(caminho_mapa).read().strip()]
        res['mapa'] = (mp['mapa']['totalModulos'], mp['mapa']['apagarStatusVia'], len(mp['mapa']['wppFuncoes'].get('chat', [])), mp['mapa']['recursos'])
        # v1.47: DIAGNÓSTICO AMPLIADO — o mapa traz ambiente, ponte, IA, erros e o que mudou; o pacote .zip reúne tudo e NÃO leva dado pessoal
        res['dg_mapa_extras'] = {'chaves': all(k in mp for k in ['ambiente', 'ponte', 'ia', 'erros', 'mudancas']), 'primeira_leitura': mp['mudancas'].get('primeiraLeitura') is True or 'contagem' in mp['mudancas'], 'entrega_view_once': 'varridas' in mp['mapa'].get('entregaViewOnce', {}) and 'viewOnce' in mp['mapa']['entregaViewOnce'],
                                 'ambiente': 'storage' in mp['ambiente']['permissoes'] and mp['ambiente']['minChrome'] == '100' and mp['ambiente']['armazenamento']['chaves'] > 0 and mp['ambiente']['armazenamento']['totalBytes'] > 0 and len(mp['ambiente']['armazenamento']['maiores']) > 0}
        async with page.expect_download() as dlz:
            await page.locator('#az-panel .gbtn', has_text='Gerar pacote de diagnóstico').click()
        zip_pac = __import__('zipfile').ZipFile(await (await dlz.value).path()); nomes_z = sorted(zip_pac.namelist()); conteudo_z = {n: zip_pac.read(n).decode('utf-8') for n in nomes_z}
        PII_RX = __import__('re').compile(r"\d{6,}@(?:c\.us|g\.us|lid)|AIza[0-9A-Za-z_-]{20,}|script\.google\.com/macros/s/[\w-]+/exec|chat\.whatsapp\.com/[A-Za-z0-9]{10,}|SEGREDO")
        pii_det = {n: sorted({c[max(0, m.start() - 25):m.end() + 12].replace('\n', ' ') for m in PII_RX.finditer(c)})[:4] for n, c in conteudo_z.items()}; pii_det = {n: v for n, v in pii_det.items() if v}; pii = list(pii_det)
        res['dg_pii'] = pii_det
        pj = {n: json.loads(c) for n, c in conteudo_z.items() if n.endswith('.json')}
        res['dg_pacote'] = {'arquivos': nomes_z, 'abre': zip_pac.testzip() is None, 'json_ok': sorted(pj) == ['ambiente.json', 'erros.json', 'estrutura.json', 'ia.json', 'mapa.json', 'ponte.json'], 'sem_dado_pessoal': pii == [], 'leiame': 'NÃO leva mensagens, nomes de contatos, telefones' in conteudo_z['LEIAME.txt'] and 'mapa.json:' in conteudo_z['LEIAME.txt'],
                            'ponte': len(pj['ponte.json']) > 0 and all(set(e) == {'metodo', 'n', 'erros', 'mediaMs', 'maxMs'} for e in pj['ponte.json']), 'mudancas': 'contagem' in pj['mapa.json']['mudancas'] and pj['mapa.json']['mudancas']['de'] == pj['mapa.json']['mudancas']['para'], 'ia': set(pj['ia.json']) == {'envios', 'comErro', 'porRotulo'}, 'relatorio': '<html' in conteudo_z['relatorio.html'].lower()}
        # v1.15: foto da estrutura da tela (sem conteúdo)
        await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('details.maisdiag').open = true"); await page.wait_for_timeout(150)  # v1.18: botões raros ficam em "Mais opções"
        async with page.expect_download() as dle:
            await page.locator('#az-panel .gbtn', has_text='Capturar estrutura').click()
        bruto = open(await (await dle.value).path(), encoding='utf-8').read(); est = json.loads(bruto)
        import re as _re
        res['estrutura'] = [sorted(est.keys()), len(bruto) // 1024, est['lateral']['t'], len(est['camadasAcimaDoCampo']), est['abas'], [n['id'] for n in est['nosAZ'] if n['existe']], bool(_re.search(r'\d{6,}', bruto))]
        # v1.16: novidades do WhatsApp (módulos e chaves entre duas leituras) e cruzamento chave -> módulo
        res['inv_base'] = await sw.evaluate("chrome.storage.local.get('inventarioAnt').then(d => d.inventarioAnt ? [d.inventarioAnt.modulos.length, Object.keys(d.inventarioAnt.flags).length] : null)")
        await page.evaluate("window.__abFlip = { web_beta_x: true }; window.__abExtra = [{ name: 'nova_funcao_x_enabled', configValue: true }]; WPP.loader.moduleRequire.m.WAWebNovoModulo = function (e, t, n) { return n('nova_funcao_x_enabled'); }; true")
        await page.locator('#az-panel .gbtn', has_text='Analisar de novo').click(); await page.wait_for_timeout(3500)
        res['inv_depois'] = await sw.evaluate("chrome.storage.local.get('inventarioHist').then(d => { const e = (d.inventarioHist || [])[0]; return e ? { nMod: e.nMod, modNovos: e.modNovos, flagsNovas: e.flagsNovas.map(f => f.nome), virou: e.flagsVirou.map(f => f.nome + ':' + f.de + '>' + f.para) } : null })")
        res['inv_card'] = await page.evaluate("(()=>{const s=[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.sec')].find(x=>x.innerText.includes('Novidades do WhatsApp')); return s? s.innerText.replace(/\\n/g,' | ').slice(0, 320) : null})()")
        await page.screenshot(path=f'{OUT}/q-novidades.png')
        await page.evaluate("window.__abFlip = {}; window.__abExtra = []; delete WPP.loader.moduleRequire.m.WAWebNovoModulo")
        # v1.33: novidades do WhatsApp que mexem com o que você usa (grupos, Business, organizações) em destaque
        await sw.evaluate("""chrome.storage.local.get('inventarioHist').then((d) => { const agora = Date.now(), vazio = { nSum: 0, nFlags: 0, nFlagsSum: 0, nVirou: 0, nOutras: 0, modSumiram: [], flagsNovas: [], flagsSumiram: [], flagsVirou: [] };
          const velha = { ...vazio, t: new Date(agora - 3600e3).toISOString(), tAnt: new Date(agora - 7200e3).toISOString(), de: '2.3000.1', ate: '2.3000.2', nMod: 100, relNovos: { grupos: 57, business: 9, org: 0 }, modNovos: ['WASmaxInGroupsFoo'] };
          const nova = { ...vazio, t: new Date(agora - 60e3).toISOString(), tAnt: new Date(agora - 3600e3).toISOString(), de: '2.3000.2', ate: '2.3000.3', nMod: 5, modNovos: ['WASmaxInGroupsGetLinkedGroupsParticipantsClientErrors', 'WAWebBusinessDirectConnectionModel', 'useWAWebGroupOrgMembershipChanges', 'WAWebVoipChunkLoadFailFast', 'WAWebOrgValues'] };
          return chrome.storage.local.set({ inventarioHist: [nova, velha, ...(d.inventarioHist || [])] }); })""")
        await page.locator('#az-panel .gbtn', has_text='Analisar de novo').click(); await page.wait_for_timeout(3500)
        res['nv_rel'] = await page.evaluate("""(() => { const sec = [...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.sec')].find((x) => x.innerText.includes('Novidades do WhatsApp')); if (!sec) return null;
          return { chips: [...sec.querySelectorAll('.nvtag')].map((e) => e.textContent), destaque: [...sec.querySelectorAll('small')].map((e) => e.textContent).find((t) => t.includes('mexem com o que você usa')) || '',
            itens: [...sec.querySelectorAll('details small')].map((e) => e.textContent).filter((t) => t.includes(' · ')) }; })()""")
        await page.screenshot(path=f'{OUT}/q-novidades-rel.png')
        # Laboratório
        await ir(page, 'Laboratório'); await page.wait_for_timeout(800)
        await page.locator('#az-panel .gbtn', has_text=re.compile('Descobrir o que cada chave controla|Reler o código do WhatsApp')).click(); await page.wait_for_timeout(1800)
        res['refs'] = await sw.evaluate("chrome.storage.local.get('refCache').then(d => d.refCache ? { flagsComModulo: d.refCache.stats.flagsComModulo, portoes: d.refCache.stats.portoes, registro: d.refCache.stats.registro.tipos, status: d.refCache.nomes.status_delete_enabled, agenda: d.refCache.nomes.scheduled_messages_sender_enabled, curtidas: d.refCache.nomes.status_likes_sending_enabled, admin: d.refCache.nomes.web_group_admin_console_enabled, falsa: d.refCache.nomes.nao_e_uma_chave_xyz || null } : null)")
        res['refs_na_tela'] = await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('.pb').innerText.includes('Usada em: SendTextMsgChatAction')")
        await page.locator('#az-panel .fchip', has_text='Para testar').click(); await page.wait_for_timeout(300)
        await page.locator('#az-panel .labr', has_text='Enquetes: adicionar opções').locator('label.tog').click(); await page.wait_for_timeout(500)
        res['lab_valor'] = await page.evaluate("WPP.loader.loadModule('WAWebABProps').getABPropConfigValue('poll_add_option_enabled')")
        res['lab_ls'] = await page.evaluate("localStorage.getItem('az-lab')")
        res['lab_junto'] = res['lab_ls']   # a entrada liga a chave e as 3 irmãs de uma vez
        await page.locator('#az-panel .fchip', has_text='Funcionando').click(); await page.wait_for_timeout(300)
        # rolagem preservada ao ligar uma opção do fim da lista + descrição + marcação de teste
        vp = page.viewport_size; await page.set_viewport_size({'width': vp['width'], 'height': 380}); await page.wait_for_timeout(200)
        await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('.pb').scrollTop = 150")
        tog = page.locator('#az-panel .labr', has_text='Curtir status').locator('label.tog')
        await tog.scroll_into_view_if_needed()
        antes = await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('.pb').scrollTop")
        await tog.click(); await page.wait_for_timeout(500)
        depois = await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('.pb').scrollTop")
        res['lab_rolagem'] = (antes, depois)
        await page.set_viewport_size(vp)
        await page.locator('#az-panel .fchip', has_text='Testando').click(); await page.wait_for_timeout(300)
        linha = page.locator('#az-panel .labr', has_text='Enquetes: adicionar opções')
        res['lab_info'] = await linha.locator('.labinfo').count()
        await linha.locator('.obtn', has_text='✔ Apareceu').click(); await page.wait_for_timeout(400)
        res['lab_teste'] = await sw.evaluate("chrome.storage.local.get('labTestes').then(d=>Object.entries(d.labTestes||{}).map(([k,v])=>[k,v.res]))")
        res['menu_por_cima'] = await page.evaluate('''() => { const m = document.createElement('div'); m.id='fakemenu';
          const app = document.querySelector('#app'); const w = app.getBoundingClientRect().right;
          m.style.cssText = `position:absolute;top:200px;left:${w-80}px;width:200px;height:120px;background:#fff;z-index:5`;
          app.append(m); const el = document.elementFromPoint(w+40, 250); m.remove();
          return [document.body.classList.contains('az-docked'), el && el.id]; }''')
        await page.locator('#az-panel .fchip', has_text='Para testar').click(); await page.wait_for_timeout(300)
        await page.locator('#az-panel .labr', has_text='Status: repostar').locator('label.tog').click(); await page.wait_for_timeout(500)
        res['lab_junto2'] = await page.evaluate("localStorage.getItem('az-lab')")
        res['console'] = await page.evaluate("(() => { console.error('ErrorUtils caught an error: teste 5585999990000'); return { w: window.__azConsole.whatsapp, e: window.__azConsole.extensao, m: window.__azConsole.ultimos[0] }; })()")
        res['layout'] = await page.evaluate("[document.body.classList.contains('az-docked'), Math.round(document.querySelector('#main footer').getBoundingClientRect().bottom), innerHeight, getComputedStyle(document.querySelector('#app')).position]")
        res['lab_chips'] = await page.locator('#az-panel .fchips.stages .fchip').all_inner_texts()
        await page.locator('#az-panel .fchip', has_text='Funcionando').click(); await page.wait_for_timeout(300)
        res['aba_funciona'] = [t.split('\n')[0] for t in await page.locator('#az-panel .labr').all_inner_texts()]
        # interruptor único do pacote: liga tudo (e as irmãs) sem apagar os resultados dos testes
        await page.locator('#az-panel .pacote label.tog').click(); await page.wait_for_timeout(900)
        res['lab_pacote_ligado'] = await page.evaluate("Object.keys(JSON.parse(localStorage.getItem('az-lab') || '{}')).filter(k => /pinned_messages|scheduled_messages|poll_add/.test(k)).sort()")
        res['lab_pacote_card'] = await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('.pacote')?.innerText.replace(/\\n/g,' ').slice(0, 160)")
        await page.locator('#az-panel .fchip', has_text='Testando').click(); await page.wait_for_timeout(300)
        res['aba_atestar'] = [t.split('\n')[0] for t in await page.locator('#az-panel .labr').all_inner_texts()]
        await page.screenshot(path=f'{OUT}/r-lab-abas.png')
        await page.locator('#az-panel .fchip', has_text='Para testar').click(); await page.wait_for_timeout(300)
        async with page.expect_popup() as pop_info:
            await page.evaluate("window.open(location.href, 'ligacao', 'width=600,height=500')")
        pop = await pop_info.value; await pop.wait_for_timeout(2500)
        res['janela_ligacao_sem_painel'] = await pop.evaluate("[!!window.opener, !!document.querySelector('#az-panel'), !!window.__azBridge]")
        await pop.close()
        await sw.evaluate("chrome.storage.local.get('waVersoes').then(d=>{const v=d.waVersoes; v.atual={versao:'2.3000.antiga', desde:v.atual.desde, chaves:{...v.atual.chaves, chave_que_saiu:true, web_beta_x:true}}; delete v.atual.chaves.scheduled_messages_sender_enabled; return chrome.storage.local.set({waVersoes:v});})")
        await ir(page, 'Diagnóstico'); await page.wait_for_timeout(300)
        await page.locator('#az-panel .gbtn', has_text='Analisar de novo').click(); await page.wait_for_timeout(2500)
        res['versoes'] = await sw.evaluate("chrome.storage.local.get('waVersoes').then(d=>d.waVersoes.historico.map(h=>[h.de,h.versao,h.novas,h.removidas,h.mudaram]))")
        res['versoes_check'] = await page.locator('#az-panel .diag', has_text='Versões e o que cada').inner_text()
        await ir(page, 'Laboratório'); await page.wait_for_timeout(500)
        # Já tenho (nativo)
        await page.locator('#az-panel .fchip', has_text='Testando').click(); await page.wait_for_timeout(300)
        await page.locator('#az-panel .labr', has_text='Status: repostar').locator('.lnk', has_text='Já tenho').click(); await page.wait_for_timeout(500)
        res['nativo'] = [await page.evaluate("localStorage.getItem('az-lab')"), await sw.evaluate("chrome.storage.local.get('labTestes').then(d=>d.labTestes.wa_web_status_resharer_flow_enabled?.res)"),
                         await page.locator('#az-panel .fchip', has_text='Já nativos').count()]
        # Ocultar conversa
        await page.evaluate("window.__log.length = 0")
        await page.locator('#az-head .hb[data-tip="Ocultar conversa"]').click(); await page.wait_for_timeout(1500)
        res['ocultar'] = [await page.evaluate("JSON.stringify(window.__log.filter(l=>['archive','mute'].includes(l[0])))"),
                          await sw.evaluate("chrome.storage.local.get('conversasOcultas').then(d=>d.conversasOcultas)"),
                          await page.evaluate("[getComputedStyle(rowAna).display, getComputedStyle(rowOutro).display, getComputedStyle(rowArq).display]")]
        await ir(page, 'Conversas ocultas'); await page.wait_for_timeout(400)
        await page.screenshot(path=f'{OUT}/s-ocultas.png')
        await page.locator('#az-panel .card .obtn', has_text='Restaurar').click(); await page.wait_for_timeout(1500)
        res['restaurar'] = [await page.evaluate("JSON.stringify(window.__log.filter(l=>['archive','unmute'].includes(l[0])).slice(-2))"),
                            await sw.evaluate("chrome.storage.local.get('conversasOcultas').then(d=>d.conversasOcultas)"),
                            await page.evaluate("[getComputedStyle(rowAna).display, getComputedStyle(rowArq).display]")]
        # menu do botão direito do WhatsApp (simulado como o real: aparece um menu com "Arquivar conversa")
        await page.evaluate('''document.addEventListener('contextmenu', (e) => { e.preventDefault(); if (document.getElementById('fakemenuwa')) return;
          const m = document.createElement('div'); m.id = 'fakemenuwa'; m.setAttribute('role', 'application');
          m.innerHTML = '<ul><li role="button"><span><svg width="20" height="20"></svg></span><span>Arquivar conversa</span></li><li role="button"><span>Apagar conversa</span></li></ul>';
          document.querySelector('#app').append(m); document.addEventListener('keydown', (k) => { if (k.key === 'Escape') m.remove(); }, { once: true }); })''')
        await page.evaluate("window.__log.length = 0")
        await page.locator('#rowAna').click(button='right'); await page.wait_for_timeout(400)
        res['menu_itens'] = await page.evaluate("[...document.querySelectorAll('#fakemenuwa li')].map(l=>l.innerText)")
        await page.locator('#fakemenuwa [data-az-ocultar]').click(); await page.wait_for_timeout(1500)
        res['menu_toast'] = await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('.toasts, .toast')?.innerText")
        res['menu_log'] = await page.evaluate("JSON.stringify(window.__log.slice(-6))")
        res['menu_ocultar'] = [await page.evaluate("JSON.stringify(window.__log.filter(l=>['archive','mute'].includes(l[0])))"), await page.evaluate("!!document.getElementById('fakemenuwa')"),
                               await sw.evaluate("chrome.storage.local.get('conversasOcultas').then(d=>d.conversasOcultas)")]
        # v1.14.7: a faixa "Arquivadas" recriada pelo WhatsApp (troca de aba) tem que sumir NO MESMO QUADRO, sem esperar a checagem de 1 s
        res['arq_html_attr'] = await page.evaluate("document.documentElement.hasAttribute('data-az-sumir-arq')")
        res['arq_persistido'] = await sw.evaluate("chrome.storage.local.get('arqFora').then(d => d.arqFora)")
        res['arq_inicial'] = await page.evaluate("document.querySelector('[id^=rowArq]').hasAttribute('data-az-oculta')")
        res['arq_recriada'] = await page.evaluate("""new Promise((ok) => {
          const a = document.querySelector('[id^=rowArq]'), n = a.cloneNode(true); n.removeAttribute('data-az-oculta'); n.removeAttribute('data-az-arq'); n.id = 'rowArq2'; a.replaceWith(n);
          window.__arqCssAntes = getComputedStyle(n).display; // sem o JS ter marcado ainda: só o CSS do <html>
          const t0 = performance.now();
          requestAnimationFrame(() => setTimeout(() => ok([n.hasAttribute('data-az-oculta'), Math.round(performance.now() - t0)]), 0));
        })""")
        res['arq_css_antes_do_js'] = await page.evaluate('window.__arqCssAntes')
        # v1.14.2: ocultar só a conversa escolhida (mesmo nome, ids diferentes) e nunca fora da lista
        oc_antes = await sw.evaluate("chrome.storage.local.get('conversasOcultas').then(d=>d.conversasOcultas||[])")
        await sw.evaluate("chrome.storage.local.set({conversasOcultas: [['g1@g.us', 'Gêmeo']]})"); await page.wait_for_timeout(3600)
        res['gemeos'] = await page.evaluate("['rowG1','rowG2','rowModal'].map(i => i + '=' + document.getElementById(i).hasAttribute('data-az-oculta'))")
        await sw.evaluate("chrome.storage.local.set({conversasOcultas: %s})" % __import__('json').dumps(oc_antes)); await page.wait_for_timeout(600)
        await ir(page, 'Diagnóstico'); await page.wait_for_timeout(300)
        await ir(page, 'Laboratório'); await page.wait_for_timeout(500)
        await page.keyboard.press('Alt+KeyZ'); await page.wait_for_timeout(300)
        fechado = await page.evaluate("!document.querySelector('#az-panel').shadowRoot.querySelector('.panel')")
        await page.keyboard.press('Alt+KeyZ'); await page.wait_for_timeout(300)
        await page.keyboard.press('Alt+Digit3'); await page.wait_for_timeout(300)
        res['atalhos'] = [fechado, await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('.eh b')?.innerText")]
        await page.screenshot(path=f'{OUT}/t-barra.png')
        await ir(page, 'Diagnóstico'); await page.wait_for_timeout(300)
        await ir(page, 'Laboratório'); await page.wait_for_timeout(500)
        await ir(page, 'Aguardando resposta'); await page.wait_for_timeout(1200)
        res['fila'] = await page.locator('#az-panel .card.fila').all_inner_texts()
        await page.screenshot(path=f'{OUT}/u-fila.png')
        await page.locator('#az-panel .card.fila .ib').first.click(); await page.wait_for_timeout(300)
        res['fila_dispensada'] = [await page.locator('#az-panel .card.fila').count(), await sw.evaluate("chrome.storage.local.get('filaDispensadas').then(d=>Object.keys(d.filaDispensadas||{}))")]
        # v1.12: conjunto "sem duplicar" + pedidos de grupos + fixar por aba
        await ir(page, 'Sem duplicar')
        await page.locator('#az-panel .gbtn', has_text='Novo conjunto').click(); await page.wait_for_timeout(700)
        n_grupos = await page.locator('#az-panel .pickg input').count()
        await page.locator('#az-panel .pickg input').nth(0).click(); await page.locator('#az-panel .pickg input').nth(1).click()
        await page.locator('#az-panel input[placeholder^="Nome do conjunto"]').fill('Cargas')
        await page.screenshot(path=f'{OUT}/x-unicos-editor.png')
        await page.locator('#az-panel .gbtn', has_text='Salvar conjunto').click(); await page.wait_for_timeout(400)
        res['unicos'] = [n_grupos, await sw.evaluate("chrome.storage.local.get('gruposUnicos').then(d=>(d.gruposUnicos||[]).map(c=>[c.nome,c.grupos]))")]
        await page.screenshot(path=f'{OUT}/x-unicos.png')
        # duplicados que já existem: verificar -> manter em um grupo -> remover dos outros
        await page.locator('#az-panel .ib[title="Verificar duplicados"]').first.click(); await page.wait_for_timeout(1200)
        res['dup_lista'] = await page.locator('#az-panel .pedplano').all_inner_texts()
        res['dup_resumo'] = await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.hint')].map(e=>e.innerText).filter(t=>t.startsWith('Vai remover'))")
        res['dup_protegidos'] = await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('details.tec summary')?.innerText")
        await page.screenshot(path=f'{OUT}/x-duplicados.png')
        await page.evaluate("window.__log.length = 0")
        await dlg_next(page)
        await page.locator('#az-panel .gbtn.dang').click(); await page.wait_for_timeout(1500)
        res['dup_fim'] = await page.locator('#az-panel .pedplano').all_inner_texts()
        res['dup_log'] = await page.evaluate("JSON.stringify(window.__log.filter(l=>l[0]==='remove'))")
        await page.screenshot(path=f'{OUT}/x-duplicados-fim.png')
        # defesa na ponte: mesmo que o painel mande um admin, a ponte tira do pedido
        await page.evaluate("window.__log.length = 0")
        res['dup_ponte'] = await page.evaluate("""new Promise((ok) => {
          const h = (e) => { if (e.data?.__az === 1 && e.data.kind === 'res' && e.data.id === 9001) { window.removeEventListener('message', h); ok(JSON.stringify(e.data.result || e.data.error)); } };
          window.addEventListener('message', h);
          window.postMessage({ __az: 1, kind: 'req', id: 9001, method: 'removerDuplicados', args: [{ '222@g.us': ['5511999990009@c.us', '5511999990007@c.us', '5511999990005@c.us'] }, ['111@g.us', '222@g.us']] }, location.origin);
        })""")
        res['dup_ponte_log'] = await page.evaluate("JSON.stringify(window.__log.filter(l=>l[0]==='remove'))")
        await page.locator('#az-panel .obtn', has_text='Voltar').first.click(); await page.wait_for_timeout(300)
        await ir(page, 'Pedidos')
        await page.locator('#az-panel .gbtn', has_text='Procurar em todos').click(); await page.wait_for_timeout(900)
        res['ped_lista'] = await page.locator('#az-panel .pedg').all_inner_texts()
        await page.locator('#az-panel .gbtn', has_text='Ver prévia').click(); await page.wait_for_timeout(900)
        res['ped_plano'] = await page.locator('#az-panel .pedplano').all_inner_texts()
        await page.locator('#az-panel .pedplano details summary').first.click()
        await page.screenshot(path=f'{OUT}/x-pedidos-previa.png')
        await page.evaluate("window.__log.length = 0")
        await dlg_next(page)
        await page.locator('#az-panel .gbtn', has_text='Aprovar').click(); await page.wait_for_timeout(1500)
        res['ped_fim'] = await page.locator('#az-panel .pedplano').all_inner_texts()
        res['ped_log'] = await page.evaluate("JSON.stringify(window.__log.filter(l=>['approve','reject'].includes(l[0])))")
        await page.screenshot(path=f'{OUT}/x-pedidos-fim.png')
        # v1.19: grupo cheio -> o excedente é ADICIONADO direto em outro grupo do conjunto (2 novos respostas: 200 adicionou, 403 privacidade, 409 já era)
        await page.evaluate("window.__reqExtra = { '111@g.us': ['5511999990011', '5511999990017', '5511999990018', '5511999990012', '5511999990013', '5511999990016'] }; true")
        await ir(page, 'Pedidos')
        await page.locator('#az-panel .gbtn', has_text='Procurar em todos').click(); await page.wait_for_timeout(1000)
        await page.locator('#az-panel .gbtn', has_text='Ver prévia').click(); await page.wait_for_timeout(1500)
        res['exc_plano'] = await page.locator('#az-panel .pedplano').all_inner_texts()
        res['exc_marcado'] = await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('label.chk')].find(l => l.innerText.includes('excedente'))?.querySelector('input')?.checked")
        await page.evaluate("window.__log.length = 0")
        await dlg_next(page)
        await page.locator('#az-panel .gbtn', has_text=re.compile('Aprovar')).click(); await page.wait_for_timeout(9500)
        res['exc_fim'] = await page.locator('#az-panel .pedplano').all_inner_texts()
        res['exc_log'] = await page.evaluate("JSON.stringify(window.__log.filter(l => ['approve', 'add', 'reject'].includes(l[0])))")
        await page.screenshot(path=f'{OUT}/v-excedente.png')
        await page.evaluate("window.__log.length = 0")
        await dlg_next(page)
        await page.locator('#az-panel .gbtn', has_text='Enviar convite para').click(); await page.wait_for_timeout(6000)
        res['exc_convite_log'] = await page.evaluate("JSON.stringify(window.__log.filter(l => l[0] === 'convite'))")
        await page.evaluate("window.__reqExtra = {}; true")
        # v1.19: painel do conjunto (membros, vagas, pendentes), convite do próximo com vaga, votos de enquete e padronizar
        await ir(page, 'Conjuntos'); await page.wait_for_timeout(300)
        await page.locator('#az-panel details.conjpainel summary').first.click(); await page.wait_for_timeout(1800)
        res['painel_linhas'] = await page.locator('#az-panel .prow').all_inner_texts()
        await page.locator('#az-panel .gbtn', has_text='Convite do próximo com vaga').click(); await page.wait_for_timeout(900)
        res['painel_proximo'] = await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.card')].find(c => c.innerText.includes('Próximo com vaga'))?.innerText.replace(/\\n/g, ' | ')")
        await page.evaluate("window.__log.length = 0")
        await page.locator('#az-panel .obtn', has_text='Enviar no chat aberto').click(); await page.wait_for_timeout(600)
        res['painel_convite_chat'] = await page.evaluate("JSON.stringify(window.__log.filter(l => l[0] === 'convite'))")
        await page.locator('#az-panel .prow .ib').first.click(); await page.wait_for_timeout(900)
        res['painel_votos'] = await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('details.tec')].map(d => d.innerText.replace(/\\n/g, ' | ')).find(t => t.includes('Carreta livre'))")
        await page.screenshot(path=f'{OUT}/v-painel.png')
        await page.locator('#az-panel .obtn', has_text='Padronizar').click(); await page.wait_for_timeout(400)
        await page.locator('#az-panel textarea').fill('Regras: respeite os horários.')
        await page.locator('#az-panel select').first.select_option('on'); await page.wait_for_timeout(200)
        await page.evaluate("window.__log.length = 0")
        await dlg_next(page)
        await page.locator('#az-panel .gbtn', has_text='Aplicar em').click(); await page.wait_for_timeout(5000)
        res['pad_log'] = await page.evaluate("JSON.stringify(window.__log.filter(l => ['desc', 'prop', 'assunto', 'icone'].includes(l[0])))")
        res['pad_fim'] = await page.locator('#az-panel .pedplano').all_inner_texts()
        await page.locator('#az-panel .obtn', has_text='Voltar').click(); await page.wait_for_timeout(300)
        # v1.19: ação "Item especial" (Pix, localização, enquete, convite) numa resposta rápida
        antes_e = await sw.evaluate("chrome.storage.local.get('respostasRapidas').then(d => d.respostasRapidas || [])")
        esp = {'id': 'es1', 'atalho': 'esp', 'titulo': 'Esp', 'categoriaId': '', 'usos': 0, 'acoes': [
            {'id': 'e1', 'tipo': 'especial', 'sub': 'pix', 'tipoChave': 'CNPJ', 'recebedor': 'Poloni', 'chave': '12345678000199', 'digitando': 0, 'aguardar': 0},
            {'id': 'e2', 'tipo': 'especial', 'sub': 'localizacao', 'lat': '-20.3155', 'lng': '-40.3128', 'nomeLocal': 'Patio', 'digitando': 0, 'aguardar': 0},
            {'id': 'e3', 'tipo': 'especial', 'sub': 'enquete', 'pergunta': 'Carreta livre, {nome}?', 'opcoes': 'Sim\nNao', 'selecionaveis': 1, 'digitando': 0, 'aguardar': 0},
            {'id': 'e4', 'tipo': 'especial', 'sub': 'convite', 'grupoId': '222@g.us', 'legenda': 'Entre aqui', 'digitando': 0, 'aguardar': 0}]}
        await sw.evaluate("chrome.storage.local.get('respostasRapidas').then(d => chrome.storage.local.set({respostasRapidas: [...(d.respostasRapidas || []), %s]}))" % __import__('json').dumps(esp))
        await page.wait_for_timeout(400)
        await page.evaluate("window.__log.length = 0")
        await page.evaluate("document.querySelector('#main footer [contenteditable]').focus(); true")   # o painel aberto cobre o campo: foca sem clicar
        await page.keyboard.type('/esp'); await page.wait_for_timeout(300)
        await page.keyboard.press('Enter'); await page.wait_for_timeout(4500)
        res['especial_log'] = await page.evaluate("JSON.stringify(window.__log.filter(l => ['pix', 'local', 'enquete', 'convite'].includes(l[0])))")
        await sw.evaluate("chrome.storage.local.set({respostasRapidas: %s})" % __import__('json').dumps(antes_e)); await page.wait_for_timeout(300)
        # v1.21: assistente de IA — a API do Gemini é SIMULADA dentro do service worker (nenhuma chamada real, nenhuma chave real)
        await sw.evaluate("""(() => { self.__iaLog = []; self.__fetchReal = self.__fetchReal || self.fetch;
          self.fetch = async (url, init) => {
            const u = String(url);
            if (u.includes('script.google.com')) { self.__sheetLog = self.__sheetLog || [];
              if (u.includes('/s/ADMINTESTE/exec')) {
                const b = JSON.parse(init.body || '{}'), A = self.__admin || {}, resp = (o) => new Response(JSON.stringify(o), { status: 200 });
                self.__adminLog = [...(self.__adminLog || []), { acao: b.acao, codigo: b.codigo, dados: b.dados, versao: b.versao, inst: b.inst, maquina: b.maquina, conectar: b.conectar }];
                if (A.fora) return new Response('<html>erro</html>', { status: 500 });
                if (b.codigo !== 'CODIGOTESTE123456') return resp({ ok: false, erro: 'acesso negado' });
                if (A.recusa) return resp({ ok: false, erro: A.recusa, limite: A.limite || 1, emUso: 1 });   // limite de computadores / computador desconectado
                if (A.desativado) return resp({ ok: false, desativado: true, erro: 'desativado' });
                if (b.acao === 'config') return resp({ ok: true, nome: 'Maria', perfil: 'Com robô', recursos: A.recursos || {}, limites: A.limites || {}, global: A.global || {}, pcs: A.pcs, hash: JSON.stringify([A.recursos, A.limites, A.global]).length + 'h', agora: Date.now() });
                if (b.acao === 'saude') return resp({ ok: true });
                return resp({ ok: false, erro: 'ação desconhecida' });
              }
              if (init && init.method === 'POST') { const b = JSON.parse(init.body); self.__sheetLog.push({ aba: b.aba, token: b.token, linhas: b.linhas, inst: b.inst, dias: b.dias });
                if (b.token !== 'SEGREDO') return new Response(JSON.stringify({ ok: false, erro: 'senha (token) incorreta' }), { status: 200 });
                if (b.aba === 'robo') return new Response(JSON.stringify(self.__outroRobo ? { ok: true, dono: false, outro: { nome: 'Computador zz99', ha: 12 } } : { ok: true, dono: true }), { status: 200 });
                if (b.aba === 'robo-livre') return new Response(JSON.stringify({ ok: true, dono: false, livre: true }), { status: 200 });
                if (b.aba === 'limpar') return new Response(JSON.stringify({ ok: true, removidas: 3 }), { status: 200 });
                if (b.aba === 'IA - Tempos' && self.__scriptAntigoAbas) return new Response(JSON.stringify({ ok: false, erro: 'aba não permitida' }), { status: 200 });
                if (b.aba === 'IA - Avaliação' && (self.__scriptVersao || 0) < 5) return new Response(JSON.stringify({ ok: false, erro: 'aba não permitida' }), { status: 200 });
                if (b.aba === 'IA - Conversas' && (self.__scriptVersao || 0) < 4) return new Response(JSON.stringify({ ok: false, erro: 'aba não permitida' }), { status: 200 });
                return new Response(JSON.stringify({ ok: true, gravadas: (b.linhas || []).length, ...(b.aba === 'ping' && self.__scriptVersao ? { versao: self.__scriptVersao } : {}) }), { status: 200 }); }
              if (u.includes('acao=memoria')) return new Response(JSON.stringify({ ok: true, itens: [{ id: 'x1', tipo: 'fato', texto: 'Não transportamos explosivos.' }] }), { status: 200 });
              return new Response('🚚 CARGAS DISPONÍVEIS\\n1) Goiânia/GO → São Paulo/SP · truck baú · 12 t\\n2) Uberlândia/MG → Santos/SP · carreta sider · 28 t', { status: 200 }); }
            if (!u.includes('generativelanguage.googleapis.com')) return self.__fetchReal(url, init);
            const corpo = init && init.body ? JSON.parse(init.body) : null, sys = corpo && corpo.systemInstruction ? corpo.systemInstruction.parts[0].text : '';
            self.__iaLog.push({ url: String(url), chave: (init.headers || {})['x-goog-api-key'], json: corpo ? (corpo.generationConfig.responseMimeType || '') : '', sistema: sys.slice(0, 40),
              msgs: corpo ? corpo.contents.length : 0, ultimo: corpo ? corpo.contents[corpo.contents.length - 1].parts[0].text.slice(0, 160) : '', think: corpo && corpo.generationConfig && corpo.generationConfig.thinkingConfig ? JSON.stringify(corpo.generationConfig.thinkingConfig) : '', atencao: sys.includes('ATENÇÃO: sua resposta anterior pediu'), temSistemaComRascunho: sys.includes('Rascunho atual'), temCargas: sys.includes('CARGAS DISPONÍVEIS AGORA'), temMemoria: sys.includes('MEMÓRIA APRENDIDA'), temPerfil: sys.includes('JÁ SABEMOS DESTE CONTATO') });
            const ok = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
            const kk = (init.headers || {})['x-goog-api-key'], fk = self.__falhaChave && self.__falhaChave[kk];
            self.__chavesUsadas = [...(self.__chavesUsadas || []), kk];
            if (fk && (fk.vezes == null || fk.vezes > 0)) { if (fk.vezes != null) fk.vezes--; return new Response(JSON.stringify(fk.corpo || { error: { message: 'falha simulada' } }), { status: fk.status }); }
            const tcfg = corpo && corpo.generationConfig ? corpo.generationConfig.thinkingConfig : null;
            const mm = /models\\/([^:\\/]+):generateContent/.exec(u), fm = mm && self.__falhaModelo && self.__falhaModelo[mm[1]];
            if (mm) self.__chamadasModelo = [...(self.__chamadasModelo || []), mm[1]];
            if (fm && (fm.vezes == null || fm.vezes > 0)) { if (fm.vezes != null) fm.vezes--; return new Response(JSON.stringify(fm.corpo || { error: { message: 'falha simulada' } }), { status: fm.status }); }
            if (sys.includes('transcreve áudios')) { self.__transcCalls = (self.__transcCalls || 0) + 1; self.__ultimoAudio = corpo.contents[0].parts.filter((p) => p.inlineData).map((p) => [p.inlineData.mimeType, p.inlineData.data.length > 0]);
              return ok({ candidates: [{ content: { parts: [{ text: self.__transcricao || 'tem carga saindo de goiânia?' }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 40 } }); }
            if (sys.includes('assistente virtual de atendimento') && (self.__falhasIA || 0) > 0) { self.__falhasIA--; return new Response(JSON.stringify({ error: { message: 'The model is overloaded.' } }), { status: 500 }); }
            if (tcfg && tcfg.thinkingLevel === 'minimal' && self.__recusaMinimal) return new Response(JSON.stringify({ error: { message: 'thinking_level minimal is not supported by this model' } }), { status: 400 });
            if (String(url).includes('/models?')) return ok({ models: [{ name: 'models/gemini-3.6-flash', displayName: 'Gemini 3.6 Flash', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] }, { name: 'models/gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash-Lite', supportedGenerationMethods: ['generateContent'] }] });
            if (sys.includes('assistente virtual de atendimento')) { const u = corpo.contents[corpo.contents.length - 1].parts[0].text.toLowerCase();
              const dec = u.includes('cpf-teste') ? (sys.includes('ATENÇÃO: sua resposta anterior pediu') ? { acao: 'responder', mensagens: ['Claro! Qual a sua rota de interesse?'], confianca: 0.9, entendi: { intencao: 'outro', resultado: 'perguntou' } } : { acao: 'responder', mensagens: ['Claro! Pode me informar o seu CPF?'], confianca: 0.9, entendi: { intencao: 'outro', resultado: 'perguntou' } })
                : u.includes('cpf-sempre') ? { acao: 'responder', mensagens: ['Pode me informar o seu CPF?'], confianca: 0.9, entendi: { intencao: 'outro', resultado: 'perguntou' } }
                : u.includes('política') ? { acao: 'responder', mensagens: ['Só atendo sobre cargas e fretes.'], confianca: 0.9, entendi: { intencao: 'fora_do_escopo', resultado: 'outro' } }
                : u.includes('qual o valor') ? { acao: 'responder', mensagens: ['O valor é combinado com o contratante; já avisei nosso atendente para confirmar.'], confianca: 0.9, avisar_humano: true, entendi: { intencao: 'pagamento', resultado: 'outro' } }
                : u.includes('goiânia') || u.includes('goiania') ? (sys.includes('Goiânia/GO → São Paulo/SP') ? { acao: 'responder', mensagens: ['Tem sim: Goiânia/GO → São Paulo/SP, truck baú, 12 t.'], confianca: 0.9, entendi: { intencao: 'buscar_carga', origem: 'Goiânia', veiculo: 'truck', carroceria: 'baú', resultado: 'ofereceu' } } : { acao: 'humano', motivo: 'sem a lista de cargas', confianca: 0.9 })
                : u.includes('curitiba') ? { acao: 'responder', mensagens: ['Agora não tenho carga para Curitiba. Qual o seu veículo?'], confianca: 0.9, entendi: { intencao: 'buscar_carga', destino: 'Curitiba', resultado: 'sem_carga' } }
                : u.includes('pix') ? { acao: 'executar', atalho: 'pixrobo', confianca: 0.9 } : u.includes('perigo') ? { acao: 'executar', atalho: 'perigo', confianca: 0.9 }
                : u.includes('frete') ? { acao: 'humano', motivo: 'preço não consta nas informações', confianca: 0.9 } : u.includes('link') ? { acao: 'responder', mensagens: ['Veja https://evil.example/x'], confianca: 0.9 }
                : u.includes('carregam aos domingos') ? { acao: 'responder', mensagens: ['Aos domingos só com agendamento prévio.'], confianca: 0.9, entendi: { intencao: 'outro', resultado: 'perguntou' } } : u.includes('obrigado') ? { acao: 'ignorar', motivo: 'agradecimento', confianca: 0.9 } : { acao: 'responder', mensagens: ['Olá! Posso ajudar com cargas e fretes.'], confianca: 0.9, entendi: { intencao: 'outro', resultado: 'perguntou' } };
              return ok({ candidates: [{ content: { parts: [{ text: JSON.stringify(dec) }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 100 } }); }
            if (sys.includes('analisa o atendimento de um dia')) return ok({ candidates: [{ content: { parts: [{ text: JSON.stringify({ sugestoes: [
              { tipo: 'vocab', texto: 'LS significa carreta (semirreboque).', motivo: 'apareceu várias vezes' }, { tipo: 'duvida', p: 'Vocês carregam aos domingos?', motivo: 'perguntado 3 vezes sem resposta' }, { tipo: 'fato', texto: 'Veja https://golpe.example/x', motivo: 'link' }] }) }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 200 } });
            if (sys.includes('aprende com conversas reais')) { self.__ultimoTreino = corpo.contents[0].parts[0].text; self.__treinoChamadas = (self.__treinoChamadas || 0) + 1;
              return ok({ candidates: [{ content: { parts: [{ text: JSON.stringify({ sugestoes: [{ tipo: 'faq', p: 'Vocês carregam aos domingos?', r: 'Aos domingos só com agendamento prévio.', motivo: 'visto em 2 trocas' }, { tipo: 'faq', p: 'Quanto custa para BH?', r: 'R$ 3800 para BH', motivo: 'visto 1 vez' },
                { tipo: 'faq', p: 'Aceitam carga de grãos?', r: 'Sim, aceitamos grãos.', motivo: 'visto 2 vezes' },
                { tipo: 'vocab', texto: 'LS significa carreta (semirreboque).', motivo: 'apareceu' }, { tipo: 'fato', texto: 'Veja https://golpe.example/x', motivo: 'link' }] }) }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 250 } }); }
            if (sys.includes('resume o que o atendente perdeu')) { self.__ultimoResumo = corpo.contents[0].parts[0].text;
              return ok({ candidates: [{ content: { parts: [{ text: JSON.stringify({ resumos: [{ i: 1, resumo: 'Quer saber se tem carga para BH. Veja https://golpe.example/x', prioridade: 'alta', acao: 'Responder hoje' }, { i: 2, resumo: 'Só agradeceu.', prioridade: 'baixa', acao: '' }, { i: 3, resumo: 'Pergunta se o canhoto foi aprovado.', prioridade: 'media', acao: 'Conferir o canhoto' }] }) }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 180 } }); }
            if (sys.includes('explica o diagnóstico')) return ok({ candidates: [{ content: { parts: [{ text: '**Situação**\\nTudo certo, só um aviso.\\n**O que fazer agora**\\n- Recarregue a página.' }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 321 } });
            return ok({ candidates: [{ content: { parts: [{ text: JSON.stringify({ mensagem: 'Montei um fluxo de boas-vindas.', resposta: { titulo: 'Boas-vindas IA', atalho: 'oi', acoes: [
              { tipo: 'digitando', segundos: 2 }, { tipo: 'texto', texto: '{saudacao}, {primeiro_nome}! Como posso ajudar?', digitando: 2, aguardar: 1 }, { tipo: 'especial', sub: 'pix', tipoChave: 'CNPJ', recebedor: 'Poloni', chave: '' }, { tipo: 'bloquear' }] },
              avisos: ['Informe a chave Pix real.'] }) }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 456 } });
          }; return true; })()""")
        await sw.evaluate("chrome.storage.local.remove(['iaCfg', 'iaUso'])"); await page.wait_for_timeout(300)
        # configuração: chave -> testar -> o modelo padrão vem da lista da própria API (flash estável mais novo; embedding e lite ficam de fora do padrão)
        await ir(page, 'Configurações'); await page.wait_for_timeout(300)
        await page.locator('#az-panel input[type=password]').fill('TESTKEY123'); await page.keyboard.press('Tab'); await page.wait_for_timeout(400)
        await page.locator('#az-panel .gbtn', has_text='Testar a chave').click(); await page.wait_for_timeout(1200)
        res['ia_modelo'] = await sw.evaluate("chrome.storage.local.get('iaCfg').then(d => d.iaCfg.modelo)")
        await page.screenshot(path=f'{OUT}/ia-config.png')
        res['ia_opcoes'] = await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('select option')].map(o => o.textContent).filter(t => t.includes('gemini'))")
        res['ia_log_modelos'] = await sw.evaluate("({ n: self.__iaLog.length, chave: self.__iaLog[0].chave, urlSemChave: !self.__iaLog[0].url.includes('TESTKEY'), url: self.__iaLog[0].url.replace(/\\\\?.*/, '') })")
        # assistente no editor: pede, vê a PROPOSTA (com aviso e a ação proibida descartada), aplica e desfaz
        await ir(page, 'Respostas rápidas'); await page.wait_for_timeout(300)
        await page.locator('#az-panel .gbtn', has_text='Nova').click(); await page.wait_for_timeout(300)
        await page.locator('#az-panel details.iabox summary').click(); await page.wait_for_timeout(200)
        await page.locator('#az-panel .iabox textarea').fill('crie uma boas-vindas com pix'); await page.locator('#az-panel .iabox .gbtn', has_text='Enviar').click(); await page.wait_for_timeout(1500)
        res['ia_bolha'] = await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.iab.ia')].map(b => b.innerText.replace(/\\\\n/g, ' | ')).join(' || ')")
        await page.screenshot(path=f'{OUT}/ia-editor.png')
        res['ia_req1'] = await sw.evaluate("(() => { const l = self.__iaLog[self.__iaLog.length - 1]; return { json: l.json, msgs: l.msgs, sistema: l.sistema, ultimo: l.ultimo, comRascunho: l.temSistemaComRascunho }; })()")
        res['ia_aplicou_sozinha'] = await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.iaok')].map(e => e.innerText)")   # "já está no editor"
        await page.wait_for_timeout(300)
        res['ia_editor_depois'] = [await page.locator('#az-panel .acard').count(), await page.locator('#az-panel .eh ~ label input').first.input_value(), await page.locator('#az-panel .eh ~ label input').nth(1).input_value()]
        await page.locator('#az-panel .iabox .obtn', has_text='Desfazer').click(); await page.wait_for_timeout(400)
        res['ia_desfeito'] = [await page.locator('#az-panel .acard').count(), await page.locator('#az-panel .eh ~ label input').first.input_value()]
        await page.locator('#az-panel .iabox .obtn', has_text='Deixar mais curto').click(); await page.wait_for_timeout(1500)   # segunda mensagem: a API recebe o histórico inteiro
        res['ia_req2_msgs'] = await sw.evaluate("self.__iaLog[self.__iaLog.length - 1].msgs")
        await page.locator('#az-panel .eh .ib').first.click(); await page.wait_for_timeout(300)
        # diagnóstico explicado pela IA
        await ir(page, 'Diagnóstico'); await page.wait_for_timeout(500)
        await page.wait_for_timeout(1800)   # (o Laboratório agora tem aba própria em "Em teste": o Diagnóstico não tem mais a chavinha)
        await page.locator('#az-panel .gbtn', has_text='Explicar com IA').click(); await page.wait_for_timeout(1500)
        res['ia_diag'] = await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('.iadiag')?.innerText.replace(/\\\\n/g, ' | ')")
        await page.screenshot(path=f'{OUT}/ia-diag.png')
        res['ia_diag_req'] = await sw.evaluate("(() => { const l = self.__iaLog[self.__iaLog.length - 1]; return { json: l.json, ultimo: l.ultimo.slice(0, 40) }; })()")
        res['ia_uso'] = await sw.evaluate("chrome.storage.local.get('iaUso').then(d => ({ n: d.iaUso.n, tokens: d.iaUso.tokens }))")
        # v1.22: Atendente IA (robô). Mensagens novas = eventos simulados da wa-js; a IA = a simulada acima; envios caem em window.__log
        antes_r = await sw.evaluate("chrome.storage.local.get('respostasRapidas').then(d => d.respostasRapidas || [])")
        rpix = {'id': 'rpix', 'atalho': 'pixrobo', 'titulo': 'Pix do robô', 'categoriaId': '', 'usos': 0, 'acoes': [{'id': 'p1', 'tipo': 'texto', 'texto': 'Chave Pix: 123', 'digitando': 0, 'aguardar': 0}]}
        rbad = {'id': 'rbad', 'atalho': 'perigo', 'titulo': 'Perigo', 'categoriaId': '', 'usos': 0, 'acoes': [{'id': 'b1', 'tipo': 'bloquear'}]}
        await sw.evaluate("chrome.storage.local.set({ respostasRapidas: %s })" % json.dumps(antes_r + [rpix, rbad]))
        cfg = {'cfgVersao': 2, 'modo': 'automatico', 'aceito': True, 'empresa': 'Transportes Poloni: fretes e cargas.', 'servicos': 'Atendemos todo o Brasil. Site: https://poloni.example/',
               'respostasPermitidas': ['rpix', 'rbad'], 'palavrasHumano': ['atendente', 'humano'], 'confianca': 0.6, 'msgHumano': 'Vou chamar um atendente.', 'identificar': True,
               'prefixo': '🤖 Assistente virtual:', 'maxPorContatoDia': 6, 'maxPorHora': 30, 'espera': [0.05, 0.1], 'pausaHumanoH': 12, 'quando': 'sempre'}
        await sw.evaluate("chrome.storage.local.set({ atendCfg: %s })" % json.dumps(cfg)); await page.wait_for_timeout(900)
        async def chega(chat, texto, mim=False):
            await page.evaluate("""([c, t, m]) => { const h = (window.__hist ||= {}); (h[c] ||= []).push({ id: { fromMe: m }, type: 'chat', body: t, t: Math.floor(Date.now() / 1000) });
              window.__ev['chat.new_message']({ id: { remote: c, fromMe: m }, type: 'chat', body: t, t: Math.floor(Date.now() / 1000), isNewMsg: true }); }""", [chat, texto, mim])
        async def textos(chat):
            return await page.evaluate("(c) => window.__log.filter(l => l[0] === 'text' && l[2] === c).map(l => l[1])", chat)
        async def n_ia():
            return await sw.evaluate("self.__iaLog.length")
        A, B, D, E, F, G, H = ['5511999990%d@c.us' % n for n in (30, 31, 33, 34, 35, 36, 37)]
        await page.evaluate("window.__log.length = 0")
        # A) cliente escreve -> a IA responde (se identifica como assistente virtual na 1ª resposta)
        await chega(A, 'Oi, boa tarde'); await page.wait_for_timeout(4500)
        res['rb_resposta'] = await textos(A)
        await chega(A, 'e o horário?'); await page.wait_for_timeout(1500)                      # logo em seguida: respeita o intervalo mínimo
        res['rb_intervalo'] = len(await textos(A))   # ainda não: o intervalo mínimo não passou; o robô volta a tentar sozinho
        # B) pediu um atendente: nem gasta IA, avisa uma vez e fica pausado (você pode ser chamado)
        n0 = await n_ia(); await chega(B, 'quero falar com um atendente'); await page.wait_for_timeout(3500)
        res['rb_humano'] = [await textos(B), (await n_ia()) - n0]
        await chega(B, 'alô?'); await page.wait_for_timeout(1500)
        res['rb_pausado'] = len(await textos(B))
        # C) grupo: nunca
        await chega('120363@g.us', 'oi pessoal'); await page.wait_for_timeout(800)
        res['rb_grupo'] = len(await textos('120363@g.us'))
        # D) você respondeu na conversa: o robô se cala
        await chega(D, 'Já te respondo!', True); await chega(D, 'tem vaga?'); await page.wait_for_timeout(1500)
        res['rb_voce_assumiu'] = len(await textos(D))
        # E) executa uma resposta rápida liberada
        await chega(E, 'me passa o pix'); await page.wait_for_timeout(4000)
        res['rb_executou'] = [t for t in await textos(E) if 'Chave Pix: 123' in t]
        # F) tenta usar uma resposta NÃO liberada (tem "bloquear"); G) inventa um link; H) agradecimento
        await chega(F, 'quero o perigo'); await page.wait_for_timeout(4000)
        await chega(G, 'me manda um link'); await page.wait_for_timeout(4000)
        await chega(H, 'muito obrigado!'); await page.wait_for_timeout(1800)
        await page.wait_for_timeout(4000); res['rb_seguimento'] = await textos(A)   # a 2ª mensagem do cliente A foi respondida depois do intervalo, não ignorada
        res['rb_vida'] = await sw.evaluate("chrome.storage.local.get('atendVida').then(d => [Date.now() - d.atendVida.ult < 120000, d.atendVida.ativo])")
        res['rb_robo_sw_ligado'] = await sw.evaluate("self.__robo && self.__robo.on")   # o robô pediu ao Chrome para manter o computador/aba acordados
        sug = await sw.evaluate("chrome.storage.local.get(['atendSug', 'atendLog']).then(d => ({ sug: d.atendSug.map(s => [s.id.slice(-4), s.acao, s.motivo]), log: d.atendLog.map(l => l.acao) }))")
        res['rb_pendencias'] = sug['sug']; res['rb_log'] = sug['log']
        res['rb_F_G_H_textos'] = [len(await textos(F)), len(await textos(G)), len(await textos(H))]       # F e G só o aviso "vou chamar"; H nada
        # I) modo "só sugerir": prepara a resposta e espera você aprovar
        await sw.evaluate("chrome.storage.local.get('atendCfg').then(d => chrome.storage.local.set({ atendCfg: { ...d.atendCfg, modo: 'sugerir' } }))"); await page.wait_for_timeout(700)
        J = '5511999990038@c.us'; await chega(J, 'bom dia'); await page.wait_for_timeout(2500)
        res['rb_sugestao'] = [len(await textos(J)), await sw.evaluate("chrome.storage.local.get('atendSug').then(d => d.atendSug.filter(s => s.id.endsWith('0038@c.us')).map(s => [s.acao, s.mensagens[0]]))")]
        await ir(page, 'Respostas rápidas'); await page.wait_for_timeout(300)
        res['rb_abas'] = await page.locator('#az-panel .hubtabs .ht').all_inner_texts()
        await page.locator('#az-panel .hubtabs .ht', has_text='Atendente IA').click(); await page.wait_for_timeout(500)
        await page.screenshot(path=f'{OUT}/rb-atendente.png')
        await page.locator('#az-panel .card', has_text='Sugestão de resposta').locator('.gbtn', has_text='Enviar').click(); await page.wait_for_timeout(4500)
        res['rb_sugestao_enviada'] = await textos(J)
        # J) treinar conversando: a IA responde sem enviar nada; corrigir a resposta alimenta o treino
        await sub_atend(page, 'Treino'); await page.locator('#az-panel .gbtn', has_text='Treinar conversando').click(); await page.wait_for_timeout(500)
        await page.locator('#az-panel textarea[placeholder^="Escreva como se fosse o cliente"]').fill('Boa tarde, vocês atendem o Rio?'); await page.locator('#az-panel .gbtn', has_text='Enviar como cliente').click(); await page.wait_for_timeout(1800)
        res['rb_simulou'] = await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.iab.ia')].map(b => b.innerText.replace(/\\n/g, ' | '))")
        await page.locator('#az-panel .iab.ia .obtn', has_text='Corrigir').click(); await page.wait_for_timeout(500)
        await page.locator('#az-dlg .dlg input, #az-dlg .dlg textarea').first.fill('Atendemos sim! De onde para onde?'); await page.locator('#az-dlg .dlg .gbtn', has_text='OK').click(); await page.wait_for_timeout(600)
        res['rb_exemplo'] = await sw.evaluate("chrome.storage.local.get('atendCfg').then(d => d.atendCfg.exemplos)")
        await page.locator('#az-panel .obtn', has_text='Voltar').click(); await page.wait_for_timeout(400)
        # I2) estado do robô: conversas pausadas aparecem e podem ser retomadas; pendentes (mensagem não lida) são retomadas
        res['rb_pausadas_antes'] = await sw.evaluate("chrome.storage.local.get('atendEst').then(d => Object.keys(d.atendEst.pausas || {}).length)")
        await sub_atend(page, 'Painel'); await page.locator('#az-panel .obtn', has_text='Retomar todas').click(); await page.wait_for_timeout(600)
        res['rb_pausadas_depois'] = await sw.evaluate("chrome.storage.local.get('atendEst').then(d => Object.keys(d.atendEst.pausas || {}).length)")
        R = '5511999990050@c.us'
        await page.evaluate("([r]) => { window.__listExtra = [{ id: { _serialized: r }, formattedTitle: 'Pendente', isGroup: false, t: Math.floor(Date.now() / 1000), unreadCount: 1 }]; window.__hist = window.__hist || {}; window.__hist[r] = [{ id: { fromMe: false }, type: 'chat', body: 'bom dia, tem carga?', t: Math.floor(Date.now() / 1000) }]; }", [R])
        await page.locator('#az-panel .obtn', has_text='Responder pendentes agora').click(); await page.wait_for_timeout(7000)
        res['rb_retomou_pendente'] = await sw.evaluate("chrome.storage.local.get('atendSug').then(d => d.atendSug.filter(s => s.id.endsWith('0050@c.us')).map(s => s.acao))")
        await page.evaluate("window.__listExtra = []")
        # K) sem aceitar o aviso de privacidade não liga
        await sw.evaluate("chrome.storage.local.get('atendCfg').then(d => chrome.storage.local.set({ atendCfg: { ...d.atendCfg, modo: 'desligado', aceito: false } }))"); await page.wait_for_timeout(700)
        await page.locator('#az-panel .seg button', has_text='Automático').click(); await page.wait_for_timeout(500)
        res['rb_sem_aceite'] = await sw.evaluate("chrome.storage.local.get('atendCfg').then(d => d.atendCfg.modo)")
        # desligado: o robô nem recebe os eventos de mensagem
        n1 = await n_ia(); await chega('5511999990039@c.us', 'oi'); await page.wait_for_timeout(1200)
        res['rb_desligado_sem_ia'] = (await n_ia()) - n1
        res['rb_robo_sw_desligado'] = await sw.evaluate("self.__robo && self.__robo.on")
        await sw.evaluate("chrome.storage.local.set({ respostasRapidas: %s })" % json.dumps(antes_r)); await sw.evaluate("chrome.storage.local.set({ atendCfg: {}, atendEst: {}, atendLog: [], atendSug: [] })")
        await page.evaluate("window.__hist = {}"); await page.wait_for_timeout(300)
        # v1.23: a IA enxerga a lista de cargas da planilha, entende o que a pessoa procura e APRENDE (com a sua aprovação), gravando na planilha
        await sw.evaluate("chrome.storage.local.set({ listaCargasUrl: 'https://script.google.com/macros/s/TESTE123/exec' })")
        await sw.evaluate("chrome.storage.local.get('iaCfg').then(d => chrome.storage.local.set({ iaCfg: { ...d.iaCfg, tokenPlanilha: 'SEGREDO' } }))")
        cfg2 = {**cfg, 'modo': 'automatico', 'usarCargas': True, 'lembrarPerfil': True, 'planilhaAprende': True, 'msgHumano': '', 'respostasPermitidas': []}
        await sw.evaluate("chrome.storage.local.set({ atendCfg: %s })" % json.dumps(cfg2)); await page.wait_for_timeout(900)
        K1, K2, K3, K4, K5 = ['5511999990%d@c.us' % n for n in (41, 42, 43, 44, 45)]
        await page.evaluate("window.__log.length = 0")
        async def ia_ult():
            return await sw.evaluate("self.__iaLog.filter(x => x.sistema.startsWith('Você é um assistente virtual')).slice(-1)[0]")
        await chega(K1, 'tem carga saindo de goiânia?'); await page.wait_for_timeout(4500)                 # a IA vê a lista e oferece a carga
        res['rc_resposta'] = await textos(K1); l1 = await ia_ult(); res['rc_prompt'] = [l1['temCargas'], l1['temMemoria'], l1['temPerfil']]
        await chega(K2, 'tem carga para curitiba?'); await page.wait_for_timeout(4500)                      # nada combina: pergunta o perfil do veículo
        res['rc_demanda'] = await sw.evaluate("chrome.storage.local.get('memDemanda').then(d => d.memDemanda.map(o => [o.origem, o.destino, o.veiculo, o.resultado]).reverse())")
        res['rc_perfil'] = await sw.evaluate("chrome.storage.local.get('memPerfis').then(d => Object.values(d.memPerfis).map(p => [p.veiculo, p.carroceria, p.regioes]))")
        await sw.evaluate("chrome.storage.local.set({ atendEst: {} })"); await page.wait_for_timeout(400)
        await chega(K1, 'oi de novo'); await page.wait_for_timeout(4500)                                    # o perfil lembrado entra no prompt do mesmo contato
        res['rc_perfil_no_prompt'] = (await ia_ult())['temPerfil']
        await chega(K4, '=1+1 tem carga?'); await page.wait_for_timeout(4500)                                # texto de cliente que parece fórmula
        # a IA passa o caso; VOCÊ responde depois -> vira sugestão de aprendizado (pendente), com o telefone mascarado
        await chega(K3, 'quanto custa o frete? meu zap 27 99999-1234'); await page.wait_for_timeout(3500)
        await chega(K3, 'O frete é por tonelada e depende da rota; me diga origem e destino.', True); await page.wait_for_timeout(700)
        res['rc_sugestao'] = await sw.evaluate("chrome.storage.local.get('memSug').then(d => d.memSug.map(s => [s.tipo, s.p, s.r, s.fonte]))")
        await ir(page, 'Respostas rápidas'); await page.wait_for_timeout(300)
        await page.locator('#az-panel .hubtabs .ht', has_text='Memória IA').click(); await page.wait_for_timeout(600)
        await page.screenshot(path=f'{OUT}/rc-memoria.png')
        res['rc_tela_demanda'] = await page.evaluate("(() => { const t = document.querySelector('#az-panel').shadowRoot.querySelector('.pb').innerText; return [t.includes('Goiânia → ?'), t.includes('? → Curitiba: 1 (1 sem carga)')]; })()")
        await page.locator('#az-panel .card', has_text='Pergunta: quanto custa').locator('.gbtn', has_text='Aprovar').click(); await page.wait_for_timeout(700)
        res['rc_aprovou'] = await sw.evaluate("chrome.storage.local.get(['memFatos', 'memSug', 'memFila']).then(d => [d.memFatos.map(f => [f.tipo, f.p.slice(0, 20), f.r.slice(0, 18)]), d.memSug.length, d.memFila.map(f => f.aba)])")
        await chega(K5, 'oi, bom dia'); await page.wait_for_timeout(4500)                                   # a memória aprovada já vale na próxima resposta
        res['rc_memoria_no_prompt'] = (await ia_ult())['temMemoria']
        # aprender com o dia: a IA propõe (vocabulário e uma dúvida para VOCÊ responder); a sugestão com link é descartada
        await page.locator('#az-panel .gbtn', has_text='Aprender com o dia').click(); await page.wait_for_timeout(1800)
        res['rc_aprender'] = await sw.evaluate("chrome.storage.local.get('memSug').then(d => d.memSug.map(s => [s.tipo, s.fonte]).sort())")
        await dlg_next(page, 'Aos domingos só com agendamento.')
        await page.locator('#az-panel .card', has_text='carregam aos domingos').locator('.gbtn', has_text='Aprovar').click(); await page.wait_for_timeout(700)
        res['rc_duvida_respondida'] = await sw.evaluate("chrome.storage.local.get('memFatos').then(d => d.memFatos.filter(f => f.tipo === 'faq').map(f => f.r))")
        # planilha: conectar, enviar a fila (com a senha) e importar a memória escrita lá
        await page.locator('#az-panel .obtn', has_text='Testar conexão').click(); await page.wait_for_timeout(900)
        await page.locator('#az-panel .obtn', has_text='Enviar agora').click(); await page.wait_for_timeout(1500)
        res['rc_planilha'] = await sw.evaluate("(() => { const l = self.__sheetLog; const demanda = l.filter(x => x.aba === 'IA - Demanda').flatMap(x => x.linhas);"
            " return { abas: [...new Set(l.map(x => x.aba))].sort(), tokens: [...new Set(l.map(x => x.token))], nDemanda: demanda.length, celulaFormula: demanda.map(r => r[10]).filter(c => /^.?=1/.test(c)), semTelefone: !JSON.stringify(l).includes('99999'),"
            " fila: 0 }; })()")
        res['rc_fila_depois'] = await sw.evaluate("chrome.storage.local.get('memFila').then(d => d.memFila.length)")
        await page.locator('#az-panel .obtn', has_text='Importar memória').click(); await page.wait_for_timeout(1200)
        res['rc_importou'] = await sw.evaluate("chrome.storage.local.get('memFatos').then(d => d.memFatos.filter(f => f.id === 'x1').map(f => [f.fonte, f.texto]))")
        await sw.evaluate("chrome.storage.local.set({ atendCfg: {}, atendEst: {}, atendLog: [], atendSug: [], listaCargasUrl: '', memFatos: [], memSug: [], memDemanda: [], memPerfis: {}, memFila: [], memPend: {} })")
        await page.evaluate("window.__hist = {}"); await page.wait_for_timeout(300)
        # v1.25: robô mais fluido. Falha da IA = tentar de novo (sem pausar nem escrever ao cliente); responder E avisar; raciocínio mínimo com recuo; "digitando" travado
        cfg3 = {**cfg, 'cfgVersao': 2, 'modo': 'automatico', 'usarCargas': False, 'lembrarPerfil': False, 'planilhaAprende': False, 'msgHumano': 'Vou chamar um atendente.', 'respostasPermitidas': [], 'retentativas': [1, 1, 1, 1], 'espera': [0.05, 0.1]}
        await sw.evaluate("chrome.storage.local.set({ atendCfg: %s, atendEst: {}, atendLog: [], atendSug: [], iaThink: {} })" % json.dumps(cfg3)); await page.wait_for_timeout(1200)
        F1, F2, F3, F4, F5 = ['5511999990%d@c.us' % n for n in (61, 62, 63, 64, 65)]
        await page.evaluate("window.__log.length = 0")
        async def pausas_de(cid):   # compara o id COMPLETO (antes eu procurava um pedaço que nunca existia e dava 0 por acidente)
            return await sw.evaluate("chrome.storage.local.get('atendEst').then(d => Object.keys((d.atendEst || {}).pausas || {}).filter(k => k === '%s').length)" % cid)
        async def sug_de(cid):
            return await sw.evaluate("chrome.storage.local.get('atendSug').then(d => d.atendSug.filter(s => s.id === '%s').map(s => s.acao))" % cid)
        # 1) a IA falha 2 vezes e volta: o cliente recebe a resposta, nada de pausa, nada de "vou chamar um atendente"
        n0 = await n_ia(); await sw.evaluate("self.__falhasIA = 2")
        await chega(F1, 'bom dia, tudo bem?'); await page.wait_for_timeout(9500)
        res['fl_resposta'] = await textos(F1); res['fl_chamadas'] = (await n_ia()) - n0; res['fl_pausa'] = await pausas_de(F1)
        # 2) a IA fica fora do ar: depois das tentativas avisa VOCÊ, sem pausar e sem escrever ao cliente; quando volta, a conversa continua
        await sw.evaluate("self.__falhasIA = 99")
        await chega(F2, 'tem carga?'); await page.wait_for_timeout(8500)
        antes = [len(await textos(F2)), await pausas_de(F2), await sug_de(F2)]
        await sw.evaluate("self.__falhasIA = 0")
        await chega(F2, 'ainda está aí?'); await page.wait_for_timeout(6000)
        res['fl_persistente'] = antes + [len(await textos(F2)), await pausas_de(F2)]
        # 3) faltou informação (valor): responde o que sabe, AVISA você e a conversa segue com o robô (não pausa)
        await chega(F3, 'qual o valor do frete?'); await page.wait_for_timeout(5000)
        res['fl_avisou'] = [await textos(F3), await pausas_de(F3), await sug_de(F3)]
        # 4) o robô pede à IA o raciocínio MÍNIMO; se o modelo recusar, recua sozinho e lembra o que ele aceita
        await sw.evaluate("self.__recusaMinimal = true")
        n1 = await n_ia(); await chega(F4, 'bom dia'); await page.wait_for_timeout(5500)
        res['fl_pensar'] = await sw.evaluate("({ seq: self.__iaLog.slice(%d).filter(x => x.sistema.startsWith('Você é um assistente virtual')).map(x => x.think), memo: null })" % n1)
        res['fl_pensar']['memo'] = await sw.evaluate("chrome.storage.local.get('iaThink').then(d => Object.values(d.iaThink || {}))")
        await sw.evaluate("self.__recusaMinimal = false")
        # 5) o "digitando…" travou no WhatsApp: a resposta sai mesmo assim
        await page.evaluate("window.__composingTrava = true")
        await chega(F5, 'oi, tem carga?'); await page.wait_for_timeout(6500)
        res['fl_digitando_travado'] = len(await textos(F5)); await page.evaluate("window.__composingTrava = false")
        # 6) quem já tinha o robô configurado (padrões antigos gravados) é atualizado uma vez; o que é seu (texto, respostas) fica
        await sw.evaluate("chrome.storage.local.set({ atendCfg: { modo: 'desligado', empresa: 'Minha empresa', maxPorContatoDia: 6, maxPorHora: 30, espera: [6, 14], pausaHumanoH: 12 } })"); await page.wait_for_timeout(1000)
        res['fl_migrou'] = await sw.evaluate("chrome.storage.local.get('atendCfg').then(d => { const c = d.atendCfg; return [c.cfgVersao, c.maxPorContatoDia, c.maxPorHora, c.espera, c.pausaHumanoH, c.pausaChamadoMin, c.empresa, c.quem, (c.nuncaPalavras || []).includes('filha')]; })")
        await sw.evaluate("chrome.storage.local.set({ atendCfg: {}, atendEst: {}, atendLog: [], atendSug: [], iaThink: {} })"); await page.wait_for_timeout(500)
        # v1.26: tempos de resposta (IA, cliente esperou, cliente demorou a responder, atendente) no painel e na planilha
        cfg4 = {**cfg, 'cfgVersao': 2, 'modo': 'automatico', 'usarCargas': False, 'lembrarPerfil': False, 'planilhaAprende': True, 'msgHumano': '', 'respostasPermitidas': [], 'retentativas': [1, 1, 1, 1], 'espera': [0.05, 0.1]}
        await sw.evaluate("chrome.storage.local.set({ listaCargasUrl: 'https://script.google.com/macros/s/TESTE123/exec', atendCfg: %s, atendEst: {}, atendLog: [], atendSug: [], memDemanda: [], memTempos: [], memFila: [], memPend: {} })" % json.dumps(cfg4))
        await sw.evaluate("chrome.storage.local.get('iaCfg').then(d => chrome.storage.local.set({ iaCfg: { ...d.iaCfg, tokenPlanilha: 'SEGREDO' } }))"); await page.wait_for_timeout(1200)
        T1, T2, T3 = ['5511999990%d@c.us' % n for n in (71, 72, 73)]
        await sw.evaluate("self.__sheetLog = []")
        # 1) o cliente demorou 2 min para responder a nossa última mensagem; a IA decidiu; mede quanto o cliente esperou
        await page.evaluate("([c]) => { (window.__hist ||= {})[c] = [{ id: { fromMe: true }, type: 'chat', body: 'Olá, em que posso ajudar?', t: Math.floor(Date.now() / 1000) - 120 }]; }", [T1])
        await chega(T1, 'tempos-teste: tem carga?'); await page.wait_for_timeout(5000)
        res['tp_demanda'] = await sw.evaluate("chrome.storage.local.get('memDemanda').then(d => d.memDemanda.filter(o => (o.pergunta || '').includes('tempos-teste')).map(o => [typeof o.msIA, o.msIA >= 0, o.esperaS, o.clienteS]))")
        # 2) a IA falha uma vez (a falha é medida e anotada) e depois responde
        await sw.evaluate("self.__falhasIA = 1")
        await chega(T2, 'tempos-teste: segunda'); await page.wait_for_timeout(6500)
        res['tp_falha'] = await sw.evaluate("chrome.storage.local.get('memTempos').then(d => d.memTempos.filter(o => o.quem === 'IA').map(o => [o.medida, typeof o.s]))")
        # 3) repasse (o cliente pediu um atendente) e VOCÊ responde ~3 s depois: tempo do atendente
        await chega(T3, 'quero um atendente'); await page.wait_for_timeout(4200)
        await chega(T3, 'Oi! Sou o João, já te ajudo com isso.', True); await page.wait_for_timeout(800)
        res['tp_atendente'] = await sw.evaluate("chrome.storage.local.get('memTempos').then(d => d.memTempos.filter(o => o.quem === 'Atendente').map(o => [o.medida, o.s >= 2, o.s < 30]))")
        # 4) tela: o cartão "Tempos de resposta" e as linhas que vão para a planilha (colunas de tempo + aba de tempos)
        await ir(page, 'Respostas rápidas'); await page.wait_for_timeout(300)
        await page.locator('#az-panel .hubtabs .ht', has_text='Memória IA').click(); await page.wait_for_timeout(600)
        await page.screenshot(path=f'{OUT}/tp-tempos.png')
        res['tp_tela'] = await page.evaluate("(() => { const t = document.querySelector('#az-panel').shadowRoot.querySelector('.pb').innerText; return [t.includes('Tempos de resposta'), t.includes('A IA levou para decidir'), t.includes('O cliente esperou até receber a resposta'), t.includes('O cliente demorou a responder'), t.includes('Você respondeu depois do repasse'), /A IA falhou 1 vez/.test(t)]; })()")
        if await sw.evaluate("chrome.storage.local.get('memFila').then(d => d.memFila.length)"):
            await page.locator('#az-panel .obtn', has_text='Enviar agora').click(); await page.wait_for_timeout(1800)
        res['tp_planilha'] = await sw.evaluate("(() => { const l = self.__sheetLog; const dem = l.filter(x => x.aba === 'IA - Demanda').flatMap(x => x.linhas).filter(r => (r[10] || '').includes('tempos-teste')); const tem = l.filter(x => x.aba === 'IA - Tempos').flatMap(x => x.linhas);"
            " return { demCols: dem.map(r => r.length), demTempos: dem.map(r => r.slice(11)), tempos: tem.map(r => [r[1], r[2]]) }; })()")
        # 5) script ANTIGO da planilha: o teste de conexão avisa; e uma aba recusada não trava o resto da fila
        await page.locator('#az-panel .obtn', has_text='Testar conexão').click(); await page.wait_for_timeout(1200)
        res['tp_script_antigo'] = await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('.pb').innerText.includes('script da planilha está desatualizado')")
        await sw.evaluate("self.__scriptVersao = 2"); await page.locator('#az-panel .obtn', has_text='Testar conexão').click(); await page.wait_for_timeout(1200)
        res['tp_script_novo'] = await page.evaluate("!document.querySelector('#az-panel').shadowRoot.querySelector('.pb').innerText.includes('script da planilha está desatualizado')")
        await sw.evaluate("self.__scriptAntigoAbas = true; self.__sheetLog = []")
        await sw.evaluate("chrome.storage.local.set({ memFila: [{ aba: 'IA - Tempos', linha: ['d', 'IA', 'falhou', '1', 'x'] }, { aba: 'IA - Demanda', linha: ['d', 'outro', '', '', '', '', '', '', 'ok', '', 'fila-teste', '', '', ''] }] })"); await page.wait_for_timeout(500)
        await page.locator('#az-panel .obtn', has_text='Enviar agora').click(); await page.wait_for_timeout(1800)
        res['tp_fila_antiga'] = [await sw.evaluate("chrome.storage.local.get('memFila').then(d => d.memFila.length)"), await sw.evaluate("self.__sheetLog.some(x => x.aba === 'IA - Demanda' && x.linhas.some(r => r[10] === 'fila-teste'))"),
            await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('.pb').innerText.includes('script da planilha está desatualizado')")]
        await sw.evaluate("self.__scriptAntigoAbas = false; self.__scriptVersao = undefined")
        await sw.evaluate("chrome.storage.local.set({ atendCfg: {}, atendEst: {}, atendLog: [], atendSug: [], listaCargasUrl: '', memDemanda: [], memTempos: [], memFila: [], memPend: {} })"); await page.wait_for_timeout(500)
        # v1.27: treinar conversando + limites (o que a IA não pode pedir; assuntos fora do atendimento; regras de ouro)
        cfg5 = {**cfg, 'cfgVersao': 2, 'modo': 'automatico', 'usarCargas': False, 'lembrarPerfil': False, 'planilhaAprende': False, 'msgHumano': '', 'respostasPermitidas': [], 'retentativas': [1, 1, 1, 1], 'espera': [0.05, 0.1],
                'proibidosDados': ['cpf', 'senha'], 'proibidosExtra': [], 'foraEscopo': ['Política e eleições'], 'foraAcao': 'redirecionar', 'regrasLista': [], 'exemplos': []}
        await sw.evaluate("chrome.storage.local.set({ atendCfg: %s, atendEst: {}, atendLog: [], atendSug: [], memDemanda: [], memTempos: [], memFila: [], memPend: {} })" % json.dumps(cfg5)); await page.wait_for_timeout(1200)
        G1, G2, G3, G4, G5 = ['5511999990%d@c.us' % n for n in (81, 82, 83, 84, 85)]
        await page.evaluate("window.__log.length = 0")
        # 1) a IA ia pedir o CPF (proibido): o painel bloqueia e ela refaz sozinha; o cliente recebe a resposta limpa e a conversa não é pausada
        n0 = await n_ia(); await chega(G1, 'cpf-teste: quero uma carga'); await page.wait_for_timeout(5500)
        res['lm_refeito'] = [await textos(G1), (await n_ia()) - n0, await sw.evaluate("self.__iaLog.slice(%d).filter(x => x.sistema.startsWith('Você é um assistente virtual')).map(x => x.atencao)" % n0), await pausas_de(G1)]
        # 2) insiste em pedir o CPF: a mensagem nunca chega ao cliente e o caso passa para você, com o motivo
        await chega(G2, 'cpf-sempre: quero uma carga'); await page.wait_for_timeout(5500)
        res['lm_bloqueado'] = [await textos(G2), await sug_de(G2), await sw.evaluate("chrome.storage.local.get('atendSug').then(d => (d.atendSug.find(s => s.id === '%s') || {}).motivo || '')" % G2)]
        # 3) assunto fora do atendimento: redirecionar (frase educada) | ignorar | chamar você
        for acao, chat in (('redirecionar', G3), ('ignorar', G4), ('humano', G5)):
            await sw.evaluate("chrome.storage.local.get('atendCfg').then(d => chrome.storage.local.set({ atendCfg: { ...d.atendCfg, foraAcao: '%s' } }))" % acao); await page.wait_for_timeout(900)
            await chega(chat, 'o que acha da política?'); await page.wait_for_timeout(4500)
        res['lm_fora'] = {'redirecionar': await textos(G3), 'ignorar': await textos(G4), 'humano': [await textos(G5), await sug_de(G5)]}
        # 4) tela de limites: marcar um dado, adicionar um dado e um assunto
        await ir(page, 'Respostas rápidas'); await page.locator('#az-panel .hubtabs .ht', has_text='Atendente IA').click(); await page.wait_for_timeout(600); await sub_atend(page, 'Regras')
        res['lm_tela'] = await page.evaluate("(() => { const t = document.querySelector('#az-panel').shadowRoot.querySelector('.pb').innerText; return ['O que a IA NÃO pode pedir nem tratar', 'Dados que a IA nunca deve pedir', 'Cartão / CVV', 'Política e eleições', 'O que o atendimento cobre', 'Regras de ouro (0)'].map(x => t.includes(x)); })()")
        await page.locator('#az-panel label.chk', has_text='Cartão / CVV').locator('input').check(); await page.wait_for_timeout(500)
        await page.locator('#az-panel input[placeholder^="Outro dado"]').fill('placa do veículo'); await page.locator('#az-panel input[placeholder^="Outro dado"]').press('Enter'); await page.wait_for_timeout(500)
        await page.locator('#az-panel input[placeholder^="Outro assunto"]').fill('futebol'); await page.locator('#az-panel input[placeholder^="Outro assunto"]').press('Enter'); await page.wait_for_timeout(500)
        res['lm_config'] = await sw.evaluate("chrome.storage.local.get('atendCfg').then(d => [d.atendCfg.proibidosDados.includes('cartao'), d.atendCfg.proibidosExtra, d.atendCfg.foraEscopo.includes('futebol')])")
        # 5) conversa de treino: o bloqueio aparece; "Nunca fazer isso", "Fora do atendimento" e "Ensinar uma regra" alimentam o treino
        await sub_atend(page, 'Treino'); await page.locator('#az-panel .gbtn', has_text='Treinar conversando').click(); await page.wait_for_timeout(500)
        await page.locator('#az-panel .obtn', has_text='Nova conversa').click(); await page.wait_for_timeout(300)   # a conversa anterior fica guardada ao voltar: começa uma nova
        await page.locator('#az-panel textarea[placeholder^="Escreva como se fosse o cliente"]').fill('cpf-sempre: quero uma carga'); await page.locator('#az-panel .gbtn', has_text='Enviar como cliente').click(); await page.wait_for_timeout(2500)
        res['lm_treino_bloqueio'] = await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.iab.ia')].map(b => b.innerText.replace(/\\n/g, ' | '))")
        await dlg_next(page, 'Nunca peça CPF.'); await page.locator('#az-panel .iab.ia .obtn', has_text='Nunca fazer isso').click(); await page.wait_for_timeout(600)
        await dlg_next(page, 'Preços de concorrentes'); await page.locator('#az-panel .iab.ia .obtn', has_text='Fora do atendimento').click(); await page.wait_for_timeout(600)
        await page.locator('#az-panel textarea[placeholder^="Regra de ouro"]').fill('Nunca prometa prazo de entrega.'); await page.locator('#az-panel .obtn', has_text='Salvar regra').click(); await page.wait_for_timeout(600)
        res['lm_treino_salvou'] = await sw.evaluate("chrome.storage.local.get('atendCfg').then(d => [d.atendCfg.regrasLista, d.atendCfg.foraEscopo.includes('Preços de concorrentes')])")
        # 6) testes de segurança prontos: roda os 10 cenários e mostra o que a IA faria
        await dlg_next(page); await page.locator('#az-panel .gbtn', has_text='Rodar os testes').click(); await page.wait_for_timeout(9000)
        await page.screenshot(path=f'{OUT}/treino-bateria.png')
        res['lm_bateria'] = await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.card.pedplano')].map(c => c.querySelector('b').innerText)")
        await page.locator('#az-panel .obtn', has_text='Voltar').click(); await page.wait_for_timeout(400)
        await sw.evaluate("chrome.storage.local.set({ atendCfg: {}, atendEst: {}, atendLog: [], atendSug: [], memDemanda: [], memTempos: [], memFila: [], memPend: {} })"); await page.wait_for_timeout(500)
        # v1.28: quem o robô atende, "nunca atender", trava de robô único, privacidade e chave da ponte
        cfg6 = {**cfg, 'cfgVersao': 3, 'modo': 'automatico', 'usarCargas': False, 'lembrarPerfil': False, 'planilhaAprende': False, 'msgHumano': '', 'respostasPermitidas': [], 'retentativas': [1, 1, 1, 1], 'espera': [0.05, 0.1],
                'quem': 'desconhecidos', 'nuncaAtender': [], 'nuncaPalavras': ['filha'], 'travaUnico': True, 'retencaoDias': 1}
        await sw.evaluate("chrome.storage.local.set({ atendCfg: %s, atendEst: {}, atendLog: [], atendSug: [], memDemanda: [], memTempos: [], memFila: [], memPend: {}, memPerfis: {}, listaCargasUrl: '' })" % json.dumps(cfg6)); await page.wait_for_timeout(1200)
        V1, V2, V3, V4, V5 = ['5511999990%d@c.us' % n for n in (101, 102, 103, 104, 105)]   # ids únicos: o bloco do treino (v1.27) já usa 80–85
        await page.evaluate("([a, b]) => { window.__salvo = { [a]: true, [b]: true }; window.__nomes = { [b]: 'Alice (filha)' }; }", [V2, V3])
        res['dbg_info'] = await page.evaluate("""([ids]) => new Promise((fim) => { const out = {};
          const esperar = (id) => new Promise((f) => { const h = (e) => { if (e.source === window && e.data && e.data.__az === 1 && e.data.kind === 'res' && e.data.id === id) { window.removeEventListener('message', h); f(e.data); } }; window.addEventListener('message', h); setTimeout(() => f({ error: 'sem resposta' }), 4000); });
          (async () => { for (const [i, id] of ids.entries()) { window.postMessage({ __az: 1, kind: 'req', id: 'dbg' + i, method: 'contatoInfo', args: [id] }, location.origin); const r = await esperar('dbg' + i); out[id] = r.result || r.error; } fim(out); })(); })""", [[V1, V2, V3]])
        # 1) padrão "só números fora dos contatos": o desconhecido é atendido, o contato salvo NÃO (e nem gasta a IA)
        n0 = await n_ia()
        await chega(V1, 'bom dia, tem carga?'); await chega(V2, 'bom dia, tem carga?'); await page.wait_for_timeout(5500)
        res['sc_desconhecidos'] = [len(await textos(V1)), len(await textos(V2)), (await n_ia()) - n0, await sw.evaluate("chrome.storage.local.get('atendLog').then(d => d.atendLog.filter(l => l.acao === 'fora do escopo').map(l => l.resumo.slice(0, 22)))")]
        # 2) a tela "Regras": muda para "todos"; o contato salvo passa a ser atendido, mas "Alice (filha)" continua de fora (palavra de família no nome)
        await ir(page, 'Respostas rápidas'); await page.locator('#az-panel .hubtabs .ht', has_text='Atendente IA').click(); await page.wait_for_timeout(400); await sub_atend(page, 'Regras')
        await page.screenshot(path=f'{OUT}/regras.png')
        res['sc_tela'] = await page.evaluate("(() => { const t = document.querySelector('#az-panel').shadowRoot.querySelector('.pb').innerText; return ['Quem o robô atende', 'Só números que NÃO estão nos meus contatos', 'Nunca atender nomes com estas palavras', 'filha', 'O que a IA NÃO pode pedir nem tratar'].map((x) => t.includes(x)); })()")
        await page.locator('#az-panel label.chk', has_text='Todos os contatos').locator('input').check(); await page.wait_for_timeout(800)
        await chega(V2, 'ainda tem carga?'); await chega(V3, 'bom dia, tem carga?'); await page.wait_for_timeout(5500)
        res['dbg_sc'] = {'textos': {k: await textos(k) for k in [V1, V2, V3]}, 'log': await sw.evaluate("chrome.storage.local.get('atendLog').then(d => d.atendLog.map(l => [l.acao, l.resumo.slice(0, 50)]))"), 'cfg': await sw.evaluate("chrome.storage.local.get('atendCfg').then(d => ({ quem: d.atendCfg.quem, v: d.atendCfg.cfgVersao }))")}
        res['sc_todos'] = [len(await textos(V2)), len(await textos(V3)), await sw.evaluate("chrome.storage.local.get('atendCfg').then(d => d.atendCfg.quem)")]
        # 3) "Nunca atender" direto do cartão "Precisam de você": a conversa sai da lista e o robô não agenda mais nada para ela
        await chega(V4, 'quero falar com um atendente'); await page.wait_for_timeout(3500)
        await sub_atend(page, 'Painel'); await page.locator('#az-panel .obtn', has_text='Nunca atender').first.click(); await page.wait_for_timeout(900)
        nV4 = len(await textos(V4)); await chega(V4, 'oi, tem carga?'); await page.wait_for_timeout(4000)
        res['sc_nunca'] = [(await sw.evaluate("chrome.storage.local.get('atendCfg').then(d => d.atendCfg.nuncaAtender.map(x => x.id))")) == [V4], await sw.evaluate("chrome.storage.local.get('atendSug').then(d => d.atendSug.filter(s => s.id === '%s').length)" % V4), len(await textos(V4)) - nV4]
        # 4) trava de robô único: outro computador está com o robô → este fica em espera e NÃO responde; quando o outro para, assume sozinho; desligar libera a trava
        await sw.evaluate("chrome.storage.local.set({ listaCargasUrl: 'https://script.google.com/macros/s/TESTE123/exec' })")
        await sw.evaluate("chrome.storage.local.get('iaCfg').then(d => chrome.storage.local.set({ iaCfg: { ...d.iaCfg, tokenPlanilha: 'SEGREDO' } }))"); await page.wait_for_timeout(800)
        await sw.evaluate("self.__outroRobo = true; self.__sheetLog = []")
        await dlg_next(page)
        await page.locator('#az-panel .seg button', has_text='Só sugerir').click(); await page.wait_for_timeout(500); await page.locator('#az-panel .seg button', has_text='Automático').click(); await page.wait_for_timeout(2500)
        await chega(V5, 'tem carga?'); await page.wait_for_timeout(3500)
        res['tr_bloqueado'] = [len(await textos(V5)), await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('.pb').innerText.includes('Computador zz99')")]
        await sw.evaluate("self.__outroRobo = false")
        await page.locator('#az-panel .seg button', has_text='Só sugerir').click(); await page.wait_for_timeout(500)
        await dlg_next(page); await page.locator('#az-panel .seg button', has_text='Automático').click(); await page.wait_for_timeout(2500)
        await chega(V5, 'e então, tem carga?'); await page.wait_for_timeout(5500)
        res['tr_assumiu'] = len(await textos(V5))
        await page.locator('#az-panel .seg button', has_text='Desligado').click(); await page.wait_for_timeout(1500)
        res['tr_pedidos'] = await sw.evaluate("({ livre: self.__sheetLog.some((x) => x.aba === 'robo-livre'), comId: self.__sheetLog.filter((x) => x.aba === 'robo').every((x) => (x.inst || '').length >= 6), n: self.__sheetLog.filter((x) => x.aba === 'robo').length })")
        # 5) privacidade: apaga só o que passou do prazo; "apagar tudo" e "limpar a planilha" (pedem confirmação)
        await sw.evaluate("chrome.storage.local.set({ memDemanda: [{ id: 'o1', t: Date.now() - 3 * 86400000, intencao: 'outro' }, { id: 'n1', t: Date.now() - 3600000, intencao: 'outro' }], memTempos: [{ t: Date.now() - 5 * 86400000, quem: 'IA', medida: 'falhou', s: 1 }], atendLog: [{ t: Date.now() - 9 * 86400000, quem: 'x', acao: 'a', resumo: '', h: 'h1' }, { t: Date.now(), quem: 'y', acao: 'b', resumo: '', h: 'h2' }] })"); await page.wait_for_timeout(600)
        await sub_atend(page, 'Ajustes'); await page.screenshot(path=f'{OUT}/ajustes.png')
        await page.locator('#az-panel .obtn', has_text='Apagar agora o que passou do prazo').click(); await page.wait_for_timeout(700)
        res['pv_prazo'] = [await sw.evaluate("chrome.storage.local.get('memDemanda').then(d => d.memDemanda.map(o => o.id))"), await sw.evaluate("chrome.storage.local.get('memTempos').then(d => d.memTempos.length)"), await sw.evaluate("chrome.storage.local.get('atendLog').then(d => d.atendLog.map(o => o.h))")]
        await sw.evaluate("self.__sheetLog = []")
        await dlg_next(page); await page.locator('#az-panel .obtn', has_text='Limpar a planilha').click(); await page.wait_for_timeout(1200)
        res['pv_planilha'] = await sw.evaluate("self.__sheetLog.filter((x) => x.aba === 'limpar').map((x) => x.dias)")
        await dlg_next(page); await page.locator('#az-panel .obtn', has_text='Apagar tudo do robô').click(); await page.wait_for_timeout(700)
        res['pv_tudo'] = [await sw.evaluate("chrome.storage.local.get('memDemanda').then(d => d.memDemanda.length)"), await sw.evaluate("chrome.storage.local.get('atendLog').then(d => d.atendLog.length)"), await sw.evaluate("chrome.storage.local.get('atendSug').then(d => d.atendSug.length)")]
        # 5b) o diálogo REAL do painel (não o do navegador): texto, botão vermelho com o verbo certo, Cancelar e Esc não apagam; confirmar apaga
        await sw.evaluate("chrome.storage.local.set({ memDemanda: [{ id: 'k1', t: Date.now(), intencao: 'outro' }] })"); await page.wait_for_timeout(500)
        await page.locator('#az-panel .obtn', has_text='Apagar tudo do robô').click(); await page.wait_for_timeout(500)
        dl_a = await page.evaluate("(() => { const d = document.querySelector('#az-dlg').shadowRoot; const b = d.querySelector('.dlg-b'); return { texto: d.querySelector('.dlg-x').innerText.slice(0, 40), botoes: [...b.querySelectorAll('button')].map((x) => x.innerText + (x.className.includes('dan') ? '(vermelho)' : '')) , foco: !!d.activeElement }; })()")
        await page.locator('#az-dlg .dlg .obtn', has_text='Cancelar').click(); await page.wait_for_timeout(400)
        dl_b = [await sw.evaluate("chrome.storage.local.get('memDemanda').then(d => d.memDemanda.length)"), await page.locator('#az-dlg .dlg').count()]
        await page.locator('#az-panel .obtn', has_text='Apagar tudo do robô').click(); await page.wait_for_timeout(500); await page.keyboard.press('Escape'); await page.wait_for_timeout(400)
        dl_c = [await sw.evaluate("chrome.storage.local.get('memDemanda').then(d => d.memDemanda.length)"), await page.locator('#az-dlg .dlg').count()]
        await page.locator('#az-panel .obtn', has_text='Apagar tudo do robô').click(); await page.wait_for_timeout(500); await page.locator('#az-dlg .dlg .dan', has_text='Apagar').click(); await page.wait_for_timeout(600)
        res['dl_real'] = {'tela': dl_a, 'cancelar': dl_b, 'esc': dl_c, 'confirmar': [await sw.evaluate("chrome.storage.local.get('memDemanda').then(d => d.memDemanda.length)"), await page.locator('#az-dlg .dlg').count()]}
        # 6) a ponte só EXECUTA pedidos que enviam/bloqueiam/removem com a chave do painel; um script solto não consegue, mas a leitura segue
        res['ponte_chave'] = await page.evaluate("""() => new Promise((fim) => {
          const esperar = (id) => new Promise((f) => { const h = (e) => { if (e.source === window && e.data && e.data.__az === 1 && e.data.kind === 'res' && e.data.id === id) { window.removeEventListener('message', h); f(e.data); } }; window.addEventListener('message', h); setTimeout(() => f({ error: 'sem resposta' }), 4000); });
          (async () => { const n0 = window.__log.length;
            window.postMessage({ __az: 1, kind: 'req', id: 'x1', method: 'sendText', args: ['5511999990099@c.us', 'mensagem de um script qualquer'] }, location.origin); const a = await esperar('x1');
            window.postMessage({ __az: 1, kind: 'req', id: 'x2', method: 'chatInfo', args: ['5511999990099@c.us'] }, location.origin); const b = await esperar('x2');
            window.postMessage({ __az: 1, kind: 'req', id: 'x3', method: 'auditoria', args: [] }, location.origin); const c = await esperar('x3');
            fim({ sensivel: a.error || 'EXECUTOU', leitura: b.error ? 'erro: ' + b.error : 'ok', enviou: window.__log.slice(n0).filter((l) => l[0] === 'text').length, auditoria: c.result ? [c.result.externas >= 2, c.result.recusadas >= 1] : null }); })(); })""")
        await sw.evaluate("self.__outroRobo = false; chrome.storage.local.set({ atendCfg: {}, atendEst: {}, atendLog: [], atendSug: [], listaCargasUrl: '', memDemanda: [], memTempos: [], memFila: [], memPend: {}, memPerfis: {} })"); await page.wait_for_timeout(500)
        # v1.29: sem a permissão "tabs" (o acesso por host_permissions basta): achar a aba do WhatsApp e mantê-la acordada continuam funcionando
        res['perm_tabs'] = await sw.evaluate("(async () => { const perms = chrome.runtime.getManifest().permissions; const t = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' }); let manter = false; try { await chrome.tabs.update(t[0].id, { autoDiscardable: false }); manter = true; } catch (e) { manter = String(e.message); } return { semTabs: !perms.includes('tabs'), achouAba: t.length >= 1, urlVisivel: !!(t[0] && t[0].url), manter }; })()")
        # v1.29: áudio do cliente — transcrito (opcional) para o robô entender; desligado = o robô pede para escrever
        cfg7 = {**cfg, 'cfgVersao': 3, 'modo': 'automatico', 'usarCargas': False, 'lembrarPerfil': False, 'planilhaAprende': False, 'msgHumano': '', 'respostasPermitidas': [], 'retentativas': [1, 1, 1, 1], 'espera': [0.05, 0.1],
                'quem': 'todos', 'nuncaAtender': [], 'nuncaPalavras': [], 'travaUnico': False, 'transcreverAudio': True}
        await sw.evaluate("chrome.storage.local.set({ atendCfg: %s, atendEst: {}, atendLog: [], atendSug: [], memDemanda: [], memTempos: [], memFila: [], memPend: {}, listaCargasUrl: '' })" % json.dumps(cfg7)); await page.wait_for_timeout(1200)
        W1, W2, W3 = ['5511999990%d@c.us' % n for n in (111, 112, 113)]
        async def audio(chat, mid, dur=5):
            await page.evaluate("""([c, mid, dur]) => { const h = (window.__hist ||= {}); (h[c] ||= []).push({ id: { fromMe: false, _serialized: mid }, type: 'ptt', duration: dur, t: Math.floor(Date.now() / 1000) });
              window.__ev['chat.new_message']({ id: { remote: c, fromMe: false }, type: 'ptt', t: Math.floor(Date.now() / 1000), isNewMsg: true }); }""", [chat, mid, dur])
        async def ultima_decisao():
            return await sw.evaluate("self.__iaLog.filter((x) => x.sistema.startsWith('Você é um assistente virtual')).slice(-1).map((x) => x.ultimo)[0] || ''")
        # 1) ligado: o áudio é baixado, a IA transcreve e o robô responde ao que foi dito
        await sw.evaluate("self.__transcCalls = 0; self.__ultimoAudio = null; self.__transcricao = 'bom dia, tudo bem?'")
        await audio(W1, 'mid-w1'); await page.wait_for_timeout(6500)
        res['au_ligado'] = {'resposta': len(await textos(W1)), 'transc': await sw.evaluate("self.__transcCalls"), 'visto': 'áudio transcrito' in await ultima_decisao(), 'audio': await sw.evaluate("self.__ultimoAudio && self.__ultimoAudio[0]")}
        # 2) desligado: sem transcrição; a IA vê só "[áudio]"
        await sw.evaluate("chrome.storage.local.get('atendCfg').then(d => chrome.storage.local.set({ atendCfg: { ...d.atendCfg, transcreverAudio: false } }))"); await page.wait_for_timeout(900)
        t0 = await sw.evaluate("self.__transcCalls")
        await audio(W2, 'mid-w2'); await page.wait_for_timeout(6500)
        res['au_desligado'] = [len(await textos(W2)), (await sw.evaluate("self.__transcCalls")) - t0, (await ultima_decisao()).startswith('[áudio]')]
        # 3) o download falha: o robô responde do mesmo jeito (pede para escrever) e a tela mostra a falha
        await sw.evaluate("chrome.storage.local.get('atendCfg').then(d => chrome.storage.local.set({ atendCfg: { ...d.atendCfg, transcreverAudio: true } }))"); await page.evaluate("window.__audioFalha = true"); await page.wait_for_timeout(900)
        await audio(W3, 'mid-w3'); await page.wait_for_timeout(6500)
        await page.evaluate("window.__audioFalha = false")
        await ir(page, 'Respostas rápidas'); await page.locator('#az-panel .hubtabs .ht', has_text='Atendente IA').click(); await page.wait_for_timeout(400); await sub_atend(page, 'Ajustes')
        res['au_falha'] = [len(await textos(W3)), await page.evaluate("(() => { const t = document.querySelector('#az-panel').shadowRoot.querySelector('.pb').innerText; return t.includes('Áudios dos clientes') && /1 transcrito\\(s\\), 1 falha\\(s\\)/.test(t) && t.includes('falhou o download'); })()")]
        await sw.evaluate("chrome.storage.local.set({ atendCfg: {}, atendEst: {}, atendLog: [], atendSug: [], memDemanda: [], memTempos: [], memFila: [], memPend: {} })"); await page.wait_for_timeout(500)
        # v1.30: falhas do Google — modelo reserva, cota do dia sem insistir, limite por minuto respeitando o tempo pedido, bolha de falha no treino, bateria que para
        cfg8 = {**cfg, 'cfgVersao': 3, 'modo': 'automatico', 'usarCargas': False, 'lembrarPerfil': False, 'planilhaAprende': False, 'msgHumano': '', 'respostasPermitidas': [], 'retentativas': [1, 1, 1, 1], 'espera': [0.05, 0.1],
                'quem': 'todos', 'nuncaAtender': [], 'nuncaPalavras': [], 'travaUnico': False, 'transcreverAudio': False}
        await sw.evaluate("chrome.storage.local.set({ atendCfg: %s, atendEst: {}, atendLog: [], atendSug: [], memDemanda: [], memTempos: [], memFila: [], memPend: {}, listaCargasUrl: '' })" % json.dumps(cfg8)); await page.wait_for_timeout(1200)
        MOD = await sw.evaluate("chrome.storage.local.get('iaCfg').then(d => d.iaCfg.modelo)")
        uso0 = await sw.evaluate("chrome.storage.local.get('iaUso').then(d => ({ ...(d.iaUso && d.iaUso.falhas || {}), reserva: d.iaUso && d.iaUso.reserva || 0 }))")
        X1, X2, X3 = ['5511999990%d@c.us' % n for n in (121, 122, 123)]
        COTA_DIA = {'error': {'code': 429, 'message': 'Quota exceeded', 'details': [{'@type': 'type.googleapis.com/google.rpc.QuotaFailure', 'violations': [{'quotaId': 'GenerateRequestsPerDayPerProjectPerModel-FreeTier'}]}]}}
        COTA_MIN = {'error': {'code': 429, 'message': 'Quota exceeded', 'details': [{'@type': 'type.googleapis.com/google.rpc.QuotaFailure', 'violations': [{'quotaId': 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier'}]}, {'@type': 'type.googleapis.com/google.rpc.RetryInfo', 'retryDelay': '1s'}]}}
        async def chamadas(): return await sw.evaluate("self.__chamadasModelo || []")
        # 1) o modelo principal está instável (503): com modelo reserva, responde na hora com ele
        await sw.evaluate("chrome.storage.local.get('iaCfg').then(d => chrome.storage.local.set({ iaCfg: { ...d.iaCfg, modeloReserva: 'gemini-reserva' } }))"); await page.wait_for_timeout(500)
        await sw.evaluate("self.__chamadasModelo = []; self.__falhaModelo = { %s: { status: 503, corpo: { error: { message: 'overloaded' } } } }" % json.dumps(MOD))
        await chega(X1, 'bom dia, tudo bem?'); await page.wait_for_timeout(5500)
        res['rs_reserva'] = [len(await textos(X1)), await chamadas()]
        # 2) a COTA DO DIA acabou (sem reserva): não insiste (uma chamada só) e avisa o dono na hora, sem escrever ao cliente
        await sw.evaluate("chrome.storage.local.get('iaCfg').then(d => chrome.storage.local.set({ iaCfg: { ...d.iaCfg, modeloReserva: '' } }))"); await page.wait_for_timeout(500)
        await sw.evaluate("self.__chamadasModelo = []; self.__falhaModelo = { %s: { status: 429, corpo: %s } }" % (json.dumps(MOD), json.dumps(COTA_DIA)))
        await chega(X2, 'bom dia, tudo bem?'); await page.wait_for_timeout(5500)
        res['rs_cota_dia'] = [len(await textos(X2)), len(await chamadas()), await sw.evaluate("chrome.storage.local.get('atendSug').then(d => d.atendSug.filter(s => s.id === '%s').map(s => s.motivo.slice(0, 40)))" % X2),
                              await sw.evaluate("chrome.storage.local.get('atendLog').then(d => d.atendLog.filter(l => l.acao.startsWith('desisti')).length)")]
        # 3) limite POR MINUTO com o tempo que o Google pediu: espera (no mínimo 5 s) e depois responde sozinho
        await sw.evaluate("self.__chamadasModelo = []; self.__falhaModelo = { %s: { status: 429, vezes: 1, corpo: %s } }" % (json.dumps(MOD), json.dumps(COTA_MIN)))
        await chega(X3, 'bom dia, tudo bem?'); await page.wait_for_timeout(11000)
        res['rs_cota_min'] = [len(await textos(X3)), len(await chamadas()), await sw.evaluate("chrome.storage.local.get('atendLog').then(d => d.atendLog.filter(l => l.acao === 'IA falhou').map(l => /em ~5 s/.test(l.resumo)))")]
        await sw.evaluate("self.__falhaModelo = null")
        # 4) treino: falha técnica aparece como FALHA (sem "chamaria um humano" nem botões de ensinar) e "Tentar de novo" refaz
        await ir(page, 'Respostas rápidas'); await page.locator('#az-panel .hubtabs .ht', has_text='Atendente IA').click(); await page.wait_for_timeout(400); await sub_atend(page, 'Treino')
        await page.locator('#az-panel .gbtn', has_text='Treinar conversando').click(); await page.wait_for_timeout(500)
        await page.locator('#az-panel .obtn', has_text='Nova conversa').click() if await page.locator('#az-panel .obtn', has_text='Nova conversa').count() else None
        await sw.evaluate("self.__falhaModelo = { %s: { status: 503, vezes: 2, corpo: { error: { message: 'overloaded' } } } }" % json.dumps(MOD))
        await page.locator('#az-panel textarea[placeholder^="Escreva como se fosse o cliente"]').fill('Boa tarde, vocês atendem o Rio?'); await page.locator('#az-panel .gbtn', has_text='Enviar como cliente').click(); await page.wait_for_timeout(4500)
        res['rs_treino_falha'] = await page.evaluate("""(() => { const r = document.querySelector('#az-panel').shadowRoot, b = [...r.querySelectorAll('.iab.ia')].pop(); if (!b) return null; const t = b.innerText;
          return { avisa: t.includes('A IA não respondeu (erro técnico'), semHumano: !t.includes('Chamaria um humano'), semEnsinar: !t.includes('Corrigir') && !t.includes('Nunca fazer isso') && !t.includes('Fora do atendimento'), repetir: t.includes('Tentar de novo'), bloco: getComputedStyle(b.querySelector('small')).display }; })()""")
        await page.locator('#az-panel .iab.ia .obtn', has_text='Tentar de novo').click(); await page.wait_for_timeout(3500)
        res['rs_treino_repetiu'] = await page.evaluate("""(() => { const r = document.querySelector('#az-panel').shadowRoot, b = [...r.querySelectorAll('.iab.ia')].pop(), cli = r.querySelectorAll('.iab.eu').length; return { cliente: cli, ia: r.querySelectorAll('.iab.ia').length, ensina: !!b && b.innerText.includes('Corrigir'), semErro: !!b && !b.innerText.includes('erro técnico') }; })()""")
        # 5) a bateria de testes PARA na primeira falha técnica (não gasta 10 pedidos para devolver 10 avisos sem sentido)
        await sw.evaluate("self.__chamadasModelo = []; self.__falhaModelo = { %s: { status: 503, corpo: { error: { message: 'overloaded' } } } }" % json.dumps(MOD))
        await dlg_next(page); await page.locator('#az-panel .gbtn, #az-panel .obtn', has_text='Rodar os testes').first.click(); await page.wait_for_timeout(7000)
        res['rs_bateria'] = [await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('.pb').innerText.includes('Parei no teste 1 de 10')"), len(await chamadas())]
        await sw.evaluate("self.__falhaModelo = null; self.__chamadasModelo = []")
        # 6) o cartão de configuração mostra as falhas do dia (do lado do Google) e o uso do modelo reserva
        await ir(page, 'Configurações'); await page.wait_for_timeout(500)
        uso1 = await sw.evaluate("chrome.storage.local.get('iaUso').then(d => ({ ...(d.iaUso && d.iaUso.falhas || {}), reserva: d.iaUso && d.iaUso.reserva || 0 }))")
        res['rs_falhas'] = {k: uso1.get(k, 0) - uso0.get(k, 0) for k in ['instavel', 'cota-dia', 'cota-minuto', 'reserva']} if hasattr(uso1, 'get') else None
        res['rs_config'] = await page.evaluate("(() => { const t = document.querySelector('#az-panel').shadowRoot.querySelector('.pb').innerText; return [t.includes('Falhas de hoje'), t.includes('cota do dia ×'), t.includes('modelo reserva usado 1×'), t.includes('Modelo reserva (opcional)')]; })()")
        await sw.evaluate("self.__falhaModelo = null; chrome.storage.local.get('iaCfg').then(d => chrome.storage.local.set({ iaCfg: { ...d.iaCfg, modeloReserva: '' } })); chrome.storage.local.set({ atendCfg: {}, atendEst: {}, atendLog: [], atendSug: [], memDemanda: [], memTempos: [], memFila: [], memPend: {} })"); await page.wait_for_timeout(500)
        # v1.31: várias chaves — troca só quando o problema é DA CHAVE; instabilidade não troca; a que falhou "descansa"; tela com "+", teste por chave e remover
        K1, K2, K3 = 'TESTKEY123', 'SECONDKEY456', 'THIRDKEY789'
        await sw.evaluate("chrome.storage.local.set({ atendCfg: %s, atendEst: {}, atendLog: [], atendSug: [], memDemanda: [], memTempos: [], memFila: [], memPend: {}, iaChaveEstado: {}, listaCargasUrl: '' })" % json.dumps(cfg8))
        await sw.evaluate("chrome.storage.local.get('iaCfg').then(d => chrome.storage.local.set({ iaCfg: { ...d.iaCfg, chave: '%s', chaves: ['%s', '%s'], modeloReserva: '' } }))" % (K1, K1, K2)); await page.wait_for_timeout(900)
        Y1, Y2, Y3, Y4 = ['5511999990%d@c.us' % n for n in (131, 132, 133, 134)]
        id1 = '…' + K1[-4:] + '/' + str(len(K1))
        async def usadas(): return await sw.evaluate("self.__chavesUsadas || []")
        async def estado_chaves(): return await sw.evaluate("chrome.storage.local.get('iaChaveEstado').then(d => Object.fromEntries(Object.entries(d.iaChaveEstado || {}).map(([k, v]) => [k, v.tipo + (v.ate > Date.now() ? ':futuro' : ':passado')])))")
        # a) a cota do DIA da chave 1 acabou: usa a 2 na hora, a 1 fica descansando e o pedido seguinte já começa pela 2
        await sw.evaluate("self.__chavesUsadas = []; self.__falhaChave = { %s: { status: 429, corpo: %s } }" % (json.dumps(K1), json.dumps(COTA_DIA)))
        await chega(Y1, 'bom dia, tudo bem?'); await page.wait_for_timeout(5500)
        a_resp, a_usadas, a_estado = len(await textos(Y1)), await usadas(), await estado_chaves()
        await sw.evaluate("self.__chavesUsadas = []")
        await chega(Y2, 'bom dia, tudo bem?'); await page.wait_for_timeout(5500)
        res['ch_cota_dia'] = {'resp1': a_resp, 'usadas1': a_usadas, 'estado': a_estado, 'resp2': len(await textos(Y2)), 'usadas2': await usadas(), 'id': id1}
        # b) chave 1 inválida e a 2 sem cota do dia: "Nenhuma das 2 chaves funcionou"; o robô NÃO insiste e avisa o dono
        await sw.evaluate("chrome.storage.local.set({ iaChaveEstado: {} }); self.__chavesUsadas = []; self.__falhaChave = { %s: { status: 400, corpo: { error: { message: 'API key not valid' } } }, %s: { status: 429, corpo: %s } }" % (json.dumps(K1), json.dumps(K2), json.dumps(COTA_DIA)))
        await chega(Y3, 'bom dia, tudo bem?'); await page.wait_for_timeout(5500)
        res['ch_todas_falham'] = [len(await textos(Y3)), await usadas(), await sw.evaluate("chrome.storage.local.get('atendSug').then(d => d.atendSug.filter(s => s.id === '%s').map(s => s.motivo.slice(0, 60)))" % Y3)]
        # c) instabilidade do Google (503) NÃO é problema da chave: não troca (a 2 nunca é chamada); a nova tentativa do robô responde com a mesma chave
        await sw.evaluate("chrome.storage.local.set({ iaChaveEstado: {} }); self.__chavesUsadas = []; self.__falhaChave = { %s: { status: 503, vezes: 2, corpo: { error: { message: 'overloaded' } } } }" % json.dumps(K1))
        await chega(Y4, 'bom dia, tudo bem?'); await page.wait_for_timeout(9000)
        c_usadas = await usadas(); res['ch_503_nao_troca'] = [len(await textos(Y4)), K2 in c_usadas, len(c_usadas)]
        # d) tela: dois campos, "+" cria o 3º, salvar, "Testar as chaves" mostra qual funciona, "descansando", remover
        await sw.evaluate("self.__falhaChave = null; chrome.storage.local.set({ iaChaveEstado: { [%s]: { ate: Date.now() + 3600000, tipo: 'cota-dia', t: Date.now() } } })" % json.dumps(id1)); await page.wait_for_timeout(300)
        await ir(page, 'Configurações'); await page.wait_for_timeout(700)
        n_campos = lambda: page.locator('#az-panel input[type=password]').count()
        tela = {'campos0': await n_campos(), 'descansando': await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('.pb').innerText.includes('Descansando até')")}
        await page.locator('#az-panel .obtn', has_text='+ Adicionar outra chave').click(); await page.wait_for_timeout(400)
        tela['campos1'] = await n_campos()
        await page.locator('#az-panel input[type=password]').nth(2).fill(K3); await page.keyboard.press('Tab'); await page.wait_for_timeout(500)
        tela['salvou'] = await sw.evaluate("chrome.storage.local.get('iaCfg').then(d => [d.iaCfg.chaves, d.iaCfg.chave])")
        tela['rotulo'] = await page.locator('#az-panel .gbtn', has_text='Testar as chaves').count()
        await sw.evaluate("self.__falhaChave = { %s: { status: 400, corpo: { error: { message: 'API key not valid' } } } }" % json.dumps(K2))
        await page.locator('#az-panel .gbtn', has_text='Testar as chaves').click(); await page.wait_for_timeout(2500)
        tela['teste'] = await page.evaluate("(() => { const t = document.querySelector('#az-panel').shadowRoot.querySelector('.pb').innerText; return [(t.match(/✔ funciona/g) || []).length, t.includes('✖ A chave da API não é válida')]; })()")
        await page.screenshot(path=f'{OUT}/chaves.png')
        await page.locator('#az-panel button[title="Remover esta chave"]').nth(2).click(); await page.wait_for_timeout(500)
        tela['campos2'] = await n_campos(); tela['depois'] = await sw.evaluate("chrome.storage.local.get('iaCfg').then(d => d.iaCfg.chaves)")
        res['ch_tela'] = tela
        await sw.evaluate("self.__falhaChave = null; chrome.storage.local.set({ iaChaveEstado: {}, atendCfg: {}, atendEst: {}, atendLog: [], atendSug: [], memDemanda: [], memTempos: [], memFila: [], memPend: {} }); chrome.storage.local.get('iaCfg').then(d => chrome.storage.local.set({ iaCfg: { ...d.iaCfg, chave: '%s', chaves: ['%s'] } }))" % (K1, K1)); await page.wait_for_timeout(500)
        # v1.32: sem conversa aberta os testes viram "não testados" (○), não avisos (⚠); com tudo bem a grade se recolhe; o selo do cabeçalho tem checagem de largura
        async def diag_only(valor):   # liga/desliga "Só avisos e problemas" (clicar refaz a análise)
            cb = page.locator('#az-panel .dsum input[type=checkbox]')
            if (await cb.is_checked()) != valor: await cb.click(); await page.wait_for_timeout(2500)
        LER = """(() => { const r = document.querySelector('#az-panel').shadowRoot, d = r.querySelector('.dsum'); const txt = (e) => e.innerText.replace(/\\s+/g, ' ');
          return { dsum: d ? txt(d) : null, skips: [...r.querySelectorAll('.diag.skip')].map(txt), warns: [...r.querySelectorAll('.diag.warn')].map(txt), tiles: r.querySelectorAll('.sf').length, resumo: [...r.querySelectorAll('.sec small')].map(txt).filter((t) => t.includes('funcionando')),
            selo: [...r.querySelectorAll('.diag')].filter((e) => e.innerText.includes('Selo do cabeçalho (largura)')).map((e) => [e.className, txt(e)]) }; })()"""
        await page.evaluate("window.__semConversa = true")
        await ir(page, 'Diagnóstico'); await page.wait_for_timeout(2500); await diag_only(False)
        sem = await page.evaluate(LER)
        res['dg_sem_conversa'] = {'bolinha': '○' in (sem['dsum'] or ''), 'skips': len(sem['skips']), 'todosSemConversa': all('sem conversa aberta' in t or 'abra uma conversa' in t for t in sem['skips']), 'avisoFalso': [w for w in sem['warns'] if 'abra uma conversa' in w or 'sem conversa aberta' in w]}
        await page.evaluate("window.__semConversa = false")
        await ir(page, 'Respostas rápidas'); await ir(page, 'Diagnóstico'); await page.wait_for_timeout(2500)
        com = await page.evaluate(LER)
        res['dg_com_conversa'] = {'semBolinha': '○' not in (com['dsum'] or ''), 'selo': com['selo']}
        await diag_only(True); rec = await page.evaluate(LER)
        res['dg_grade'] = {'tiles': rec['tiles'], 'linha': rec['resumo']}
        await diag_only(False)
        # v1.34: Acesso da equipe — o administrador libera, bloqueia e limita (planilha como painel de controle)
        import base64
        ADM, COD = 'https://script.google.com/macros/s/ADMINTESTE/exec', 'CODIGOTESTE123456'
        conv = lambda url, cod: 'AZ1.' + base64.urlsafe_b64encode(json.dumps({'u': url, 'c': cod}).encode()).decode().rstrip('=')
        async def admin(cfg): await sw.evaluate("self.__admin = %s" % json.dumps(cfg))
        async def st(chave): return await sw.evaluate("chrome.storage.local.get('%s').then(d => d['%s'])" % (chave, chave))
        async def conectar(texto):
            await ir(page, 'Configurações'); await page.wait_for_timeout(500)
            await page.locator('#az-panel input[placeholder^="Cole o convite"]').fill(texto); await page.locator('#az-panel .gbtn', has_text='Conectar').click(); await page.wait_for_timeout(2200)
        async def atualizar():
            await ir(page, 'Configurações'); await page.wait_for_timeout(400); await page.locator('#az-panel .obtn', has_text='Atualizar agora').click(); await page.wait_for_timeout(2200)
        PBTXT = "document.querySelector('#az-panel').shadowRoot.querySelector('.pb').innerText"
        G0 = {'coletarSaude': 'sim', 'saudeMin': 10, 'consultaMin': 10, 'validadeOfflineDias': 7}
        PERFIL = {'recursos': {'replies': 'ligado', 'diag': 'ligado', 'cfgPosicao': 'ligado', 'cfgIA': 'ligado', 'cfgPartes': 'ligado', 'lab': 'bloqueado', 'cargas': 'obrigatorio', 'vagas': 'ligado', 'pedidos': 'desligado', 'atendente': 'ligado', 'iaAudio': 'bloqueado', 'diagAvancado': 'bloqueado'}, 'limites': {'roboModoMax': 'sugerir', 'roboMaxPorHora': '20', 'chavesMax': '1'}, 'global': G0}
        cfgA = {**cfg, 'cfgVersao': 3, 'modo': 'automatico', 'quem': 'todos', 'nuncaPalavras': [], 'travaUnico': False, 'usarCargas': False, 'lembrarPerfil': False, 'planilhaAprende': False, 'msgHumano': '', 'respostasPermitidas': [], 'retentativas': [1, 1, 1, 1], 'espera': [0.05, 0.1], 'transcreverAudio': False}
        await sw.evaluate("chrome.storage.local.set({ acessoCfg: {}, acessoEstado: null, acessoAplicado: {}, modulos: {}, atendCfg: %s, atendEst: {}, atendLog: [], atendSug: [], memDemanda: [], memTempos: [], memFila: [], memPend: {}, listaCargasUrl: '' }); self.__adminLog = []; self.__admin = {}" % json.dumps(cfgA)); await page.wait_for_timeout(1200)
        Q1, Q2, Q3 = ['5511999990%d@c.us' % n for n in (141, 142, 143)]
        # 1) convites ruins não gravam nada: texto solto, outro servidor (nem chega a falar com ele) e código errado
        await conectar('isto não é um convite'); r1 = await st('acessoCfg')
        await conectar(conv('https://evil.example.com/exec', COD)); r2 = await st('acessoCfg')
        await conectar(conv(ADM, 'CODIGOERRADO1234567')); r3 = await st('acessoCfg')
        res['ac_convite_ruim'] = {'texto': not (r1 or {}).get('codigo'), 'outro_servidor': not (r2 or {}).get('codigo'), 'codigo_errado': not (r3 or {}).get('codigo'), 'chamadas': await sw.evaluate("(self.__adminLog || []).map((x) => x.codigo)")}
        # 2) convite certo: conecta, aplica o perfil (padrões "ligado/desligado" uma vez) e aceita enviar o resumo de saúde
        await admin(PERFIL); await dlg_next(page); await conectar(conv(ADM, COD)); await page.wait_for_timeout(1200)
        cs, es, md = await st('acessoCfg'), await st('acessoEstado'), await st('modulos')
        res['ac_conectou'] = {'codigo': (cs or {}).get('codigo') == COD, 'perfil': ((es or {}).get('config') or {}).get('perfil'), 'saude': (cs or {}).get('saude'), 'vagas': (md or {}).get('vagas'), 'pedidos': (md or {}).get('pedidos')}
        saude = await sw.evaluate("(self.__adminLog || []).filter((x) => x.acao === 'saude').map((x) => x.dados)")
        res['ac_saude'] = {'enviou': len(saude) >= 1, 'campos': sorted(saude[0].keys()) if saude else None, 'sem_arroba_nem_nome': bool(saude) and '@' not in json.dumps(saude) and 'Maria' not in json.dumps(saude)}
        # 3) o bloqueado some; o obrigatório fica travado; o que o usuário mudar depois NÃO é desfeito pelo padrão
        await ir(page, 'Configurações'); await page.wait_for_timeout(600)
        res['ac_tela'] = await page.evaluate("""(() => { const r = document.querySelector('#az-panel').shadowRoot, linhas = [...r.querySelectorAll('.modr')].map((x) => [x.innerText.replace(/\\s+/g, ' '), x.querySelector('input').disabled]), f = (n) => linhas.find((l) => l[0].includes(n));
          return { lab: !!f('Laboratório'), frete: f('Lista de frete') ? [f('Lista de frete')[0].includes('Sempre ligado'), f('Lista de frete')[1]] : null, vagas: f('Vagas nos grupos') ? f('Vagas nos grupos')[1] : null, cartao: r.querySelector('.pb').innerText.includes('perfil Com robô'), mais_chave: r.querySelector('.pb').innerText.includes('+ Adicionar outra chave') }; })()""")
        await sw.evaluate("chrome.storage.local.get('modulos').then(d => chrome.storage.local.set({ modulos: { ...d.modulos, pedidos: true } }))"); await page.wait_for_timeout(500); await atualizar()
        res['ac_padrao_uma_vez'] = (await st('modulos')).get('pedidos')
        await ir(page, 'Diagnóstico'); await page.wait_for_timeout(2500)
        res['ac_diag'] = await page.evaluate("(() => { const r = document.querySelector('#az-panel').shadowRoot; return { lab: [...r.querySelectorAll('.pb button')].some((b) => b.innerText.includes('Laboratório')), avancado: !!r.querySelector('details.maisdiag') }; })()")
        await ir(page, 'Respostas rápidas'); await page.locator('#az-panel .hubtabs .ht', has_text='Atendente IA').click(); await page.wait_for_timeout(400)
        if await page.locator('#az-panel .obtn', has_text='Voltar').count(): await page.locator('#az-panel .obtn', has_text='Voltar').first.click(); await page.wait_for_timeout(400)   # um bloco anterior deixou o "Treinar conversando" aberto
        await sub_atend(page, 'Ajustes')
        res['ac_audio_some'] = await page.evaluate(PBTXT + ".includes('Áudios dos clientes')")
        # 4) limite do robô: o salvo é "automático", mas ele só SUGERE (nada é enviado ao cliente) e o salvo não muda
        await sub_atend(page, 'Painel'); auto_travado = await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.seg button')].find((b) => b.innerText.includes('Automático')).disabled")
        await chega(Q1, 'bom dia, tudo bem?'); await page.wait_for_timeout(6000)
        res['ac_robo_limitado'] = {'enviou': len(await textos(Q1)), 'sugestoes': await sw.evaluate("chrome.storage.local.get('atendSug').then(d => d.atendSug.filter((s) => s.id === '%s').map((s) => s.acao))" % Q1), 'salvo': (await st('atendCfg')).get('modo'), 'botao_automatico_travado': auto_travado}
        # 5) aviso do administrador e EMERGÊNCIA: o robô para (nem sugere), e a mensagem aparece na tela
        await admin({**PERFIL, 'global': {**G0, 'aviso': 'Reunião às 14h'}}); await atualizar()
        res['ac_aviso'] = await page.evaluate(PBTXT + ".includes('Reunião às 14h')")
        await admin({**PERFIL, 'global': {**G0, 'emergencia': 'sim', 'emergenciaMensagem': 'Pausa para ajuste'}}); await atualizar()
        await chega(Q2, 'bom dia, tudo bem?'); await page.wait_for_timeout(4500)
        res['ac_emergencia'] = {'banner': await page.evaluate(PBTXT + ".includes('Pausa para ajuste')"), 'enviou': len(await textos(Q2)), 'sugestoes': await sw.evaluate("chrome.storage.local.get('atendSug').then(d => d.atendSug.filter((s) => s.id === '%s').length)" % Q2)}
        # 6) desativado: os recursos somem, mas Configurações abre (para desconectar)
        await admin({'desativado': True}); await atualizar()
        res['ac_desativado'] = {'banner': await page.evaluate(PBTXT + ".includes('foi desativado pelo administrador')"), 'respostas_na_barra': await page.locator('#az-panel .tb[data-tip^="Atendimento"]').count(), 'config_abre': await page.evaluate(PBTXT + ".includes('Acesso da equipe')")}
        await admin(PERFIL); await atualizar(); res['ac_reativado'] = await page.locator('#az-panel .tb[data-tip^="Atendimento"]').count()
        # 7) servidor fora do ar: vale a última configuração; passou da validade: o robô desliga e avisa
        await admin({'fora': True}); await atualizar()
        es2 = await st('acessoEstado')
        res['ac_offline'] = {'erro': bool((es2 or {}).get('erro')), 'config_mantida': ((es2 or {}).get('config') or {}).get('perfil') == 'Com robô', 'lab_continua_bloqueado': not await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.modr')].some((x) => x.innerText.includes('Laboratório'))")}
        await sw.evaluate("chrome.storage.local.get('acessoEstado').then(d => chrome.storage.local.set({ acessoEstado: { ...d.acessoEstado, t: Date.now() - 8 * 864e5 } }))"); await page.wait_for_timeout(800)
        await chega(Q3, 'bom dia, tudo bem?'); await page.wait_for_timeout(4500)
        res['ac_expirou'] = {'banner': await page.evaluate(PBTXT + ".includes('Não consegui confirmar seu acesso')"), 'sugestoes': await sw.evaluate("chrome.storage.local.get('atendSug').then(d => d.atendSug.filter((s) => s.id === '%s').length)" % Q3)}
        await admin(PERFIL); await atualizar(); res['ac_voltou'] = not await page.evaluate(PBTXT + ".includes('Não consegui confirmar seu acesso')")
        # 8) desconectar: tudo volta ao modo pessoal (Laboratório reaparece, modo automático liberado)
        await dlg_next(page); await page.locator('#az-panel .obtn', has_text='Desconectar').click(); await page.wait_for_timeout(1500)
        await ir(page, 'Configurações'); await page.wait_for_timeout(500)
        res['ac_desconectou'] = {'cfg': not ((await st('acessoCfg')) or {}).get('codigo'), 'lab_voltou': await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.modr')].some((x) => x.innerText.includes('Laboratório'))"), 'cartao_de_convite': await page.locator('#az-panel input[placeholder^="Cole o convite"]').count()}
        await sw.evaluate("chrome.storage.local.set({ acessoCfg: {}, acessoEstado: null, acessoAplicado: {}, modulos: {}, atendCfg: {}, atendEst: {}, atendLog: [], atendSug: [], memDemanda: [], memTempos: [], memFila: [], memPend: {} }); self.__admin = {}"); await page.wait_for_timeout(600)
        # v1.34.1: LOGIN OBRIGATÓRIO — instalação nova mostra SÓ o "Acesso da equipe" até colar o convite
        await sw.evaluate("chrome.storage.local.set({ acessoExigir: true, acessoCfg: {}, acessoEstado: null, acessoAplicado: {}, modulos: {}, atendCfg: %s, atendEst: {}, atendLog: [], atendSug: [] }); self.__admin = %s; self.__adminLog = []" % (json.dumps(cfgA), json.dumps(PERFIL))); await page.wait_for_timeout(1800)
        TELA = """(() => { const r = document.querySelector('#az-panel').shadowRoot, abas = [...r.querySelectorAll('.hubtabs .ht')].map((b) => b.innerText.trim()); return { cartoes: [...r.querySelectorAll('.pb .sec')].map((x) => (x.querySelector('.sh b') || {}).innerText), sem_diag_nem_backup: !abas.some((a) => /Diagn|Backup/.test(a)), aberto: document.body.classList.contains('az-docked') }; })()"""
        await ir(page, 'Configurações'); await page.wait_for_timeout(600)
        tela = await page.evaluate(TELA)
        res['ac_login_tela'] = {**tela, 'respostas_na_barra': await page.locator('#az-panel .tb[data-tip^="Atendimento"]').count(), 'config_na_barra': await page.locator('#az-panel .tb[data-tip^="Configurações"]').count()}
        QL = '5511999990144@c.us'; await chega(QL, 'bom dia, tudo bem?'); await page.wait_for_timeout(4500)
        res['ac_login_robo'] = {'enviou': len(await textos(QL)), 'sugestoes': await sw.evaluate("chrome.storage.local.get('atendSug').then(d => (d.atendSug || []).length)")}
        await dlg_next(page); await conectar(conv(ADM, COD)); await page.wait_for_timeout(1200)
        res['ac_login_entrou'] = {'mais_de_um_cartao': len((await page.evaluate(TELA))['cartoes']) > 1, 'respostas_na_barra': await page.locator('#az-panel .tb[data-tip^="Atendimento"]').count()}
        await dlg_next(page); await page.locator('#az-panel .obtn', has_text='Desconectar').click(); await page.wait_for_timeout(1800)
        tela2 = await page.evaluate(TELA)
        res['ac_login_sair'] = {'cartoes': tela2['cartoes'], 'aberto': tela2['aberto'], 'cfg_vazia': not ((await st('acessoCfg')) or {}).get('codigo'), 'respostas_na_barra': await page.locator('#az-panel .tb[data-tip^="Atendimento"]').count()}
        await sw.evaluate("chrome.storage.local.set({ acessoExigir: false, acessoCfg: {}, acessoEstado: null, acessoAplicado: {}, modulos: {}, atendCfg: {}, atendEst: {}, atendLog: [], atendSug: [] }); self.__admin = {}"); await page.wait_for_timeout(1200)
        # v1.35: NADA VEM LIBERADO DE FÁBRICA — perfil vazio = só o "Acesso da equipe"; o administrador libera item a item
        G1 = {**G0, 'coletarSaude': 'nao'}
        await sw.evaluate("chrome.storage.local.set({ acessoExigir: true, acessoCfg: {}, acessoEstado: null, acessoAplicado: {}, modulos: {}, atendCfg: %s, atendEst: {}, atendLog: [], atendSug: [] }); self.__adminLog = []" % json.dumps(cfgA)); await admin({'recursos': {}, 'limites': {}, 'global': G1}); await page.wait_for_timeout(1500)
        await conectar(conv(ADM, COD)); await page.wait_for_timeout(1000); await ir(page, 'Configurações'); await page.wait_for_timeout(700)
        v0 = await page.evaluate(TELA)
        res['ac_vazio_tela'] = {**v0, 'aviso': await page.evaluate(PBTXT + ".includes('ainda não liberou nenhuma parte')"), 'respostas_na_barra': await page.locator('#az-panel .tb[data-tip^="Atendimento"]').count(), 'config_na_barra': await page.locator('#az-panel .tb[data-tip^="Configurações"]').count()}
        await admin({'recursos': {'atendente': 'ligado', 'replies': 'ligado', 'cfgPosicao': 'ligado'}, 'limites': {}, 'global': G1}); await atualizar()
        v1 = await page.evaluate(TELA); QV = '5511999990145@c.us'
        await chega(QV, 'bom dia, tudo bem?'); await page.wait_for_timeout(6000)
        res['ac_vazio_libera'] = {'cartoes': v1['cartoes'], 'respostas_na_barra': await page.locator('#az-panel .tb[data-tip^="Atendimento"]').count(), 'aviso_sumiu': not await page.evaluate(PBTXT + ".includes('ainda não liberou nenhuma parte')")}
        res['ac_vazio_robo'] = {'enviou': len(await textos(QV)), 'sugestoes': await sw.evaluate("chrome.storage.local.get('atendSug').then(d => (d.atendSug || []).filter((s) => s.id === '%s').map((s) => s.acao))" % QV), 'salvo': (await st('atendCfg')).get('modo')}
        await sw.evaluate("chrome.storage.local.set({ acessoExigir: false, acessoCfg: {}, acessoEstado: null, acessoAplicado: {}, modulos: {}, atendCfg: {}, atendEst: {}, atendLog: [], atendSug: [] }); self.__admin = {}"); await page.wait_for_timeout(1200)
        # v1.35.1: perfil ADMINISTRADOR com os 21 recursos ligados — TUDO o que a planilha oferece tem de aparecer e funcionar na extensão (era o caso do Laboratório que não aparecia)
        TODOS = {k: 'ligado' for k in ['replies', 'fila', 'sig', 'start', 'lote', 'pins', 'ocultas', 'apagar', 'recuperar', 'exportar', 'contato', 'escuta', 'resumo', 'ligacao', 'avaliacao', 'backup', 'lab', 'gruposSo', 'atendente', 'vagas', 'pedidos', 'cargas', 'iaAudio', 'diagAvancado', 'diag', 'cfgPosicao', 'cfgIA', 'cfgPartes', 'cfgLimites']}
        await sw.evaluate("chrome.storage.local.set({ acessoExigir: true, acessoCfg: {}, acessoEstado: null, acessoAplicado: {}, modulos: {}, atendCfg: %s, atendEst: {}, atendLog: [], atendSug: [] }); self.__adminLog = []" % json.dumps(cfgA)); await admin({'recursos': TODOS, 'limites': {'roboModoMax': 'automatico', 'chavesMax': '6'}, 'global': G1}); await page.wait_for_timeout(1500)
        await conectar(conv(ADM, COD)); await page.wait_for_timeout(1200); await ir(page, 'Configurações'); await page.wait_for_timeout(800)
        res['ac_todos_config'] = await page.evaluate("""(() => { const r = document.querySelector('#az-panel').shadowRoot; return { cartoes: [...r.querySelectorAll('.pb .sec')].map((x) => (x.querySelector('.sh b') || {}).innerText), abas: [...r.querySelectorAll('.hubtabs .ht')].map((b) => b.innerText.replace(/\\d+$/, '').trim()), mais_chave: r.querySelector('.pb').innerText.includes('+ Adicionar outra chave') }; })()""")
        BARRA = "[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.ph .tb[data-tip]')].map((b) => b.dataset.tip.replace(/ \\(Alt\\+\\d\\)$/, '')).filter((t) => !/^(Recolher|Tema)/.test(t))"
        ABAS = "[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.hubtabs .ht')].map((b) => b.innerText.replace(/\\d+$/, '').trim())"
        CARTOES = "[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.pb .sec .sh b')].map((b) => b.innerText)"
        barra = {'icones': await page.evaluate(BARRA), 'abas': {}, 'cartoes': {}}
        for rail, via in [('Atendimento', 'Respostas rápidas'), ('Grupos', 'Pedidos'), ('Ferramentas', 'Iniciar conversa'), ('Privacidade', 'Conversas ocultas'), ('Diagnóstico', 'Limites'), ('Configurações', 'Configurações')]:
            await ir(page, via); await page.wait_for_timeout(500); barra['abas'][rail] = await page.evaluate(ABAS)
        for nome in ['Ajustes dos grupos', 'Lista de frete', 'Limites']:
            await ir(page, nome); await page.wait_for_timeout(500); barra['cartoes'][nome] = await page.evaluate(CARTOES)
        res['ac_todos_barra'] = barra
        await ir(page, 'Diagnóstico'); await page.wait_for_timeout(2500)
        res['ac_todos_diag'] = {'avancado': await page.evaluate("!!document.querySelector('#az-panel').shadowRoot.querySelector('details.maisdiag')")}
        await ir(page, 'Laboratório'); await page.wait_for_timeout(500)
        res['ac_todos_diag']['laboratorio'] = await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('.eh b')?.innerText === 'Laboratório'")
        await ir(page, 'Respostas rápidas'); await page.locator('#az-panel .hubtabs .ht', has_text='Atendente IA').click(); await page.wait_for_timeout(400)
        if await page.locator('#az-panel .obtn', has_text='Voltar').count(): await page.locator('#az-panel .obtn', has_text='Voltar').first.click(); await page.wait_for_timeout(400)
        await sub_atend(page, 'Painel'); automatico_livre = await page.evaluate("![...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.seg button')].find((b) => b.innerText.includes('Automático')).disabled")
        await sub_atend(page, 'Ajustes')
        res['ac_todos_robo'] = {'audio': await page.evaluate(PBTXT + ".includes('Áudios dos clientes')"), 'automatico_livre': automatico_livre}
        await sw.evaluate("chrome.storage.local.set({ acessoExigir: false, acessoCfg: {}, acessoEstado: null, acessoAplicado: {}, modulos: {}, atendCfg: {}, atendEst: {}, atendLog: [], atendSug: [] }); self.__admin = {}"); await page.wait_for_timeout(1200)
        # v1.36: LIMITE DE COMPUTADORES por convite — o servidor recusa o excedente; a extensão explica e nada trava por engano
        await sw.evaluate("chrome.storage.local.set({ instId: '', acessoExigir: true, acessoCfg: {}, acessoEstado: null, acessoAplicado: {}, modulos: {}, atendCfg: %s, atendEst: {}, atendLog: [], atendSug: [] }); self.__adminLog = []" % json.dumps(cfgA)); await page.wait_for_timeout(1500)
        PC = {**PERFIL, 'global': G1}
        await admin({**PC, 'recusa': 'limite de computadores', 'limite': 1}); await conectar(conv(ADM, COD))
        logc = await sw.evaluate("(self.__adminLog || []).filter((x) => x.acao === 'config').map((x) => ({ inst: x.inst, maquina: x.maquina, conectar: x.conectar }))")
        telapc = await page.evaluate(TELA)
        res['ac_pc_recusado'] = {'gravou': bool(((await st('acessoCfg')) or {}).get('codigo')), 'login': telapc['cartoes'] == ['Acesso da equipe'], 'mandou_inst': bool(logc) and len(logc[0]['inst'] or '') >= 8, 'mandou_maquina': bool(logc) and bool(logc[0]['maquina']), 'conectar': bool(logc) and logc[0]['conectar'] is True, 'inst_guardado': bool(logc) and (await st('instId')) == logc[0]['inst']}
        await admin({**PC, 'pcs': {'emUso': 1, 'max': 2}}); await conectar(conv(ADM, COD)); await page.wait_for_timeout(800); await ir(page, 'Configurações'); await page.wait_for_timeout(600)
        TOASTS = "[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.toast')].map((t) => t.innerText).join(' | ')"
        res['ac_pc_cartao'] = {'conectou': bool(((await st('acessoCfg')) or {}).get('codigo')), 'pcs': await page.evaluate(PBTXT + ".includes('computadores deste convite: 1 de 2')"), 'maquina': await page.evaluate(PBTXT + ".includes('Este computador:')"),
                               'aviso_padrao': await page.evaluate("(" + TOASTS + ").includes('DESLIGADAS por padrão') && (" + TOASTS + ").includes('Pedidos de grupos')")}   # o padrão \"desligado\" do administrador é AVISADO (antes desligava em silêncio)
        await admin({**PC, 'recusa': 'computador desconectado'}); await atualizar()
        res['ac_pc_desconectado'] = {'banner': await page.evaluate(PBTXT + ".includes('Este computador não está autorizado')"), 'motivo': await page.evaluate(PBTXT + ".includes('desconectado pelo administrador')"), 'respostas_na_barra': await page.locator('#az-panel .tb[data-tip^="Atendimento"]').count()}
        await sw.evaluate("chrome.storage.local.get('modulos').then((d) => chrome.storage.local.set({ modulos: { ...d.modulos, pedidos: true } }))"); await page.wait_for_timeout(500)   # a pessoa LIGA o que veio desligado por padrão
        await admin(PC); await dlg_next(page); await page.locator('#az-panel .obtn', has_text='Desconectar').click(); await page.wait_for_timeout(1500)   # a pessoa desconecta e cola o convite de novo
        await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.toast')].forEach((t) => t.remove())")
        await sw.evaluate("self.__adminLog = []"); await conectar(conv(ADM, COD)); await page.wait_for_timeout(800)
        logv = await sw.evaluate("(self.__adminLog || []).filter((x) => x.acao === 'config').map((x) => x.conectar)")
        res['ac_pc_volta'] = {'conectou': bool(((await st('acessoCfg')) or {}).get('codigo')), 'conectar': bool(logv) and logv[0] is True, 'respostas_na_barra': await page.locator('#az-panel .tb[data-tip^="Atendimento"]').count(),
                              'mantem_escolha': ((await st('modulos')) or {}).get('pedidos') is True, 'sem_novo_aviso': not await page.evaluate("(" + TOASTS + ").includes('DESLIGADAS por padrão')")}   # reconectar o MESMO convite não refaz o padrão (nem avisa de novo)
        await sw.evaluate("chrome.storage.local.set({ acessoExigir: false, acessoCfg: {}, acessoEstado: null, acessoAplicado: {}, modulos: {}, atendCfg: {}, atendEst: {}, atendLog: [], atendSug: [] }); self.__admin = {}"); await page.wait_for_timeout(1200)
        # v1.37: APAGAR PARA TODOS, a qualquer tempo — lista só as MINHAS mensagens, apaga as marcadas e conta o que o WhatsApp não confirmou
        CHAT_AP = '558599990000@c.us'
        await page.evaluate("""(c) => { const t = Math.floor(Date.now() / 1000), m = (id, fromMe, type, body, dt, extra) => ({ id: { fromMe, _serialized: id }, type, body, t: t - dt, ...extra });
          window.__hist = { [c]: [m('true_A', true, 'chat', 'Preço 4200 para Goiânia', 5 * 86400), m('true_B', true, 'chat', 'Bom dia, tudo bem?', 3600), m('true_C', true, 'image', '', 90000, { caption: 'Foto do canhoto' }),
            m('false_D', false, 'chat', 'oi, quero carga', 7200), m('true_E', true, 'revoked', '', 4000), m('true_F', true, 'e2e_notification', '', 4000)] }; window.__recusaApagar = false; window.__semConversa = false; window.__log.length = 0; }""", CHAT_AP)
        await page.wait_for_timeout(400); await ir(page, 'Apagar mensagens'); await page.wait_for_timeout(500)
        LINHAS = "[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.pb label.card')].map((l) => l.innerText.replace(/\\s+/g, ' ').trim())"
        await page.locator('#az-panel .obtn', has_text='Carregar minhas mensagens').click(); await page.wait_for_timeout(900)
        linhas = await page.evaluate(LINHAS)
        res['ap_lista'] = {'n': len(linhas), 'ordem': [l[:15] for l in linhas], 'fora_do_prazo': ['fora do prazo normal' in l for l in linhas], 'sem_cliente_nem_apagadas': not any('quero carga' in l for l in linhas)}
        cx = page.locator('#az-panel .pb label.card input[type=checkbox]'); await cx.nth(0).check(); await cx.nth(2).check(); await page.wait_for_timeout(300)   # a mais nova (B) e a mais antiga (A, fora do prazo)
        await dlg_next(page); await page.locator('#az-panel .obtn', has_text='Apagar para todos (2)').click(); await page.wait_for_timeout(5500)
        dels = await page.evaluate("window.__log.filter((l) => l[0] === 'del').map((l) => [l[1], l[2]])"); restam = await page.evaluate(LINHAS)
        res['ap_apagou'] = {'resultado': await page.evaluate(PBTXT + ".includes('✔ 2 apagada(s)')"), 'ids': sorted(d[0] for d in dels), 'paraTodos': all(d[1] is True for d in dels), 'restam': [l[:15] for l in restam]}
        # o servidor recusa (mensagem muito antiga): fica tudo como estava e o painel explica
        await page.evaluate("window.__recusaApagar = true; window.__log.length = 0"); await cx.nth(0).check(); await page.wait_for_timeout(300)
        await dlg_next(page); await page.locator('#az-panel .obtn', has_text='Apagar para todos (1)').click(); await page.wait_for_timeout(3500)
        res['ap_recusa'] = {'explica': await page.evaluate(PBTXT + ".includes('1 não confirmada') && " + PBTXT + ".includes('servidor')"), 'tentou': await page.evaluate("window.__log.filter((l) => l[0] === 'del').length"), 'continua_na_lista': len(await page.evaluate(LINHAS))}
        await page.evaluate("window.__recusaApagar = false; window.__hist = {}; window.__log.length = 0"); await page.wait_for_timeout(300)
        # v1.38: RECUPERAR MENSAGENS APAGADAS — a ponte tira a "foto" da mensagem no instante em que o WhatsApp avisa que ela será apagada; só liga se a pessoa ligar
        CHG = '120363000000000001@g.us'
        await page.evaluate("""(g) => { window.__nomes = { ...(window.__nomes || {}), [g]: 'Cargas Goiás' }; const t = Math.floor(Date.now() / 1000), c1 = '5511999990001@c.us', m = (id, remote, type, body, extra) => ({ id: { fromMe: false, _serialized: id, remote: { _serialized: remote } }, type, body, t: t - 600, ...extra });
          window.__origs = { false_T1: m('false_T1', c1, 'chat', 'Preço 3800 para BH', { senderObj: { pushname: 'Zé Motorista' } }), false_I1: m('false_I1', c1, 'image', 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', { caption: 'canhoto', mimetype: 'image/jpeg' }),
            false_P1: m('false_P1', c1, 'ptt', '', { duration: 12, mimetype: 'audio/ogg; codecs=opus' }), false_V1: m('false_V1', c1, 'image', 'AAAA', { isViewOnce: true }), false_X1: m('false_X1', c1, 'chat', 'fui eu que apaguei'),
            false_G1: m('false_G1', g, 'chat', 'Carga disponível Goiânia', { senderObj: { pushname: 'Maria Despachante' } }), false_G2: m('false_G2', g, 'chat', 'Outra carga Anápolis', { senderObj: { pushname: 'Maria Despachante' } }) };
          window.__revoga = (ref, de, eu, tipo) => window.__ev['chat.msg_revoke']({ id: { fromMe: !!eu, _serialized: 'rev_' + ref }, refId: { _serialized: ref }, from: { _serialized: de }, type: tipo || 'sender_revoke' }); }""", CHG)
        C1 = '5511999990001@c.us'; REV = lambda ref, de=C1, eu=False, tipo='sender_revoke': page.evaluate("([r, d, e, t]) => window.__revoga(r, d, e, t)", [ref, de, eu, tipo])
        LISTA_RC = "[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.pb .col .card')].map((c) => c.innerText.replace(/\\s+/g, ' ').trim())"
        marca = lambda txt: page.locator('#az-panel label.chk', has_text=txt).locator('input')
        await ir(page, 'Recuperar apagadas'); await page.wait_for_timeout(700)
        await REV('false_T1'); await page.wait_for_timeout(500)   # DESLIGADO: nada é guardado
        ponte_antes = await page.evaluate("window.__azRecuperar"); liga_visivel = await marca('Guardar uma cópia').count()
        await dlg_next(page); await marca('Guardar uma cópia').check(); await page.wait_for_timeout(1000)
        res['rcp_desligado'] = {'ponte': ponte_antes, 'opcao_visivel': liga_visivel == 1, 'ligou': await page.evaluate("window.__azRecuperar"), 'nada_guardado_antes': await page.evaluate(PBTXT + ".includes('Nada apagado ainda')")}
        # texto: guarda e AVISA na hora
        await REV('false_T1'); await page.wait_for_timeout(900); l1 = await page.evaluate(LISTA_RC); toasts = await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.toast')].map((t) => t.innerText).join(' | ')")
        res['rcp_texto'] = {'n': len(l1), 'contato': 'Ana Maria' in l1[0], 'texto': 'Preço 3800 para BH' in l1[0], 'aviso': 'apagou uma mensagem' in toasts and 'Preço 3800' in toasts}
        # o "botão de recuperar": o aviso traz um botão Ver; o ícone Privacidade mostra quantas apagadas você ainda não viu; abrir a aba zera
        await ir(page, 'Respostas rápidas'); await page.wait_for_timeout(500)
        BADGE = '''document.querySelector('#az-panel').shadowRoot.querySelector('.ph .tb[data-tip^="Privacidade"] em.n')?.innerText || null'''
        await REV('false_T1'); await page.wait_for_timeout(1300)
        badge_antes = await page.evaluate(BADGE); ver = page.locator('#az-panel .toast button', has_text='Ver'); tem_ver = await ver.count()
        await ver.last.click(); await page.wait_for_timeout(1000)
        res['rcp_botao'] = {'ver': tem_ver >= 1, 'badge_antes': badge_antes, 'abriu': await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('.eh b')?.innerText") == 'Mensagens apagadas pelos contatos', 'badge_depois': await page.evaluate(BADGE)}
        # foto: miniatura aparece (e a legenda); visualização única e "fui eu" NUNCA entram
        await REV('false_I1'); await REV('false_V1'); await REV('false_X1', C1, True); await page.wait_for_timeout(900)
        l2 = await page.evaluate(LISTA_RC); img = await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.pb .col .card img')].map((i) => i.getAttribute('src').slice(0, 30))")
        res['rcp_foto'] = {'n': len(l2), 'miniatura': img == ['data:image/jpeg;base64,iVBORw0'], 'legenda': any('canhoto' in c for c in l2)}
        # conteúdo que o WhatsApp já não tinha na memória: aparece o AVISO (não some em silêncio)
        await REV('false_ZZZ'); await page.wait_for_timeout(900); l3 = await page.evaluate(LISTA_RC)
        res['rcp_indisponivel'] = {'n': len(l3), 'aviso': any('conteúdo já não estava na memória' in c for c in l3)}
        # grupos: aparecem com quem escreveu + o grupo; desligando "Incluir grupos", não entram mais
        await REV('false_G1', CHG); await page.wait_for_timeout(900); l4 = await page.evaluate(LISTA_RC)
        await marca('Incluir grupos').uncheck(); await page.wait_for_timeout(800); ponte_sem_grupos = await page.evaluate("window.__azRecuperar"); await REV('false_G2', CHG); await page.wait_for_timeout(900); l5 = await page.evaluate(LISTA_RC)
        res['rcp_grupos'] = {'entrou': any('Maria Despachante · Cargas Goiás' in c and 'Carga disponível Goiânia' in c for c in l4), 'depois_de_desligar': len(l5) == len(l4), 'ponte_grupos': ponte_sem_grupos['grupos']}
        await marca('Incluir grupos').check(); await page.wait_for_timeout(600)
        # fotos/áudios: só com a opção; o tipo real do WhatsApp ("audio/ogg; codecs=opus") é aceito e o áudio fica tocável
        await marca('Tentar guardar também fotos e áudios').check(); await page.wait_for_timeout(800); ponte_midia = await page.evaluate("window.__azRecuperar")
        await REV('false_P1'); await page.wait_for_timeout(2200)
        audios = await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.pb .col .card audio')].length")
        res['rcp_audio'] = {'ponte_midia': ponte_midia['midia'], 'tocavel': audios == 1}
        # esquecer uma, esquecer tudo; e desligar zera a ponte
        antes = len(await page.evaluate(LISTA_RC)); await page.locator('#az-panel .pb .col .card .obtn', has_text='Esquecer').first.click(); await page.wait_for_timeout(700); depois = len(await page.evaluate(LISTA_RC))
        await dlg_next(page); await page.locator('#az-panel .obtn', has_text='Esquecer tudo').click(); await page.wait_for_timeout(900)
        vazio = await page.evaluate(PBTXT + ".includes('Nada apagado ainda')"); await marca('Guardar uma cópia').uncheck(); await page.wait_for_timeout(800)
        res['rcp_esquecer'] = {'uma': antes - depois == 1, 'tudo': vazio, 'desligou_ponte': await page.evaluate("window.__azRecuperar") is None}
        await sw.evaluate("chrome.storage.local.set({ recuperarCfg: { ligado: false, aceitou: false, dias: 7, grupos: true, midia: false, maxMB: 3 } })"); await page.evaluate("window.__origs = {}"); await page.wait_for_timeout(500)
        # v1.42: EXPORTAR CONVERSA — 21/10/2026 das 18:00 às 19:30: só o que está no período, com a mídia, num .zip que abre em outro programa (zipfile do Python)
        CHAT_EX = '558599990000@c.us'
        await page.evaluate("""(c) => { const T = (h, mi, s) => Math.floor(new Date(2026, 9, 21, h, mi, s).getTime() / 1000), m = (id, fromMe, type, body, t, extra) => ({ id: { fromMe, _serialized: id }, type, body, t, ...extra }), ze = { senderObj: { pushname: 'Zé Motorista' } };
          window.__hist = { [c]: [m('false_X0', false, 'chat', 'antes do período', T(17, 59, 59), ze), m('false_XA', false, 'e2e_notification', '', T(18, 0, 30)), m('false_X1', false, 'chat', 'Bom dia, tem carga para BH?', T(18, 0, 0), ze), m('true_X2', true, 'chat', 'Tem sim: R$ 3800', T(18, 3, 12)),
            m('false_X3', false, 'image', 'iVBORw0=', T(18, 5, 40), { ...ze, caption: 'canhoto; "assinado"', mimetype: 'image/jpeg' }), m('false_X4', false, 'ptt', '', T(18, 40, 0), { ...ze, mimetype: 'audio/ogg; codecs=opus', duration: 12 }),
            m('false_X5', false, 'document', '', T(19, 10, 0), { ...ze, filename: 'Canhoto 123.pdf', mimetype: 'application/pdf' }), m('false_X6', false, 'revoked', '', T(19, 20, 0), ze), m('false_X7', false, 'image', 'x', T(19, 25, 0), { ...ze, isViewOnce: true, caption: 'segredo', mimetype: 'image/jpeg' }),
            m('false_X8', false, 'chat', 'ainda dentro (19:30:20)', T(19, 30, 20), ze), m('false_X9', false, 'chat', 'depois do período', T(19, 31, 0), ze)] }; window.__audioFalha = false; }""", CHAT_EX)
        await ir(page, 'Exportar conversa'); await page.wait_for_timeout(600)
        DT = page.locator('#az-panel input[type="datetime-local"]')
        async def exportar_zip(nome):
            await DT.nth(0).fill('2026-10-21T18:00'); await DT.nth(1).fill('2026-10-21T19:30')
            async with page.expect_download() as dlx:
                await page.locator('#az-panel .gbtn', has_text='Exportar').click()
            dx = await dlx.value; cam = f'{OUT}/{nome}.zip'; await dx.save_as(cam); await page.wait_for_timeout(500)
            return dx.suggested_filename, __import__('zipfile').ZipFile(cam)
        arq, zf = await exportar_zip('export-ok')
        txt = zf.read('conversa.txt').decode('utf-8'); rel = zf.read('relatorio.txt').decode('utf-8'); csv_bruto = zf.read('conversa.csv'); csv = csv_bruto.decode('utf-8-sig'); msgs_txt = [l for l in txt.split('\n') if l.startswith('[21/10/2026')]
        res['ex_zip'] = {'arquivo': arq, 'abre': zf.testzip() is None, 'nomes': sorted(zf.namelist()), 'painel': await page.evaluate(PBTXT + ".includes('Arquivo gerado')")}
        res['ex_texto'] = {'qtd': len(msgs_txt), 'primeira': msgs_txt[0] if msgs_txt else '', 'ultima': msgs_txt[-1] if msgs_txt else '', 'fora': not any(s in txt for s in ['antes do período', 'depois do período', 'segredo']),
                           'apagada': any('[mensagem apagada]' in l for l in msgs_txt), 'anexo': any('<anexo: midia/0001_IMG_20261021_180540.jpg> canhoto; "assinado"' in l for l in msgs_txt), 'unica': any('[visualização única: não exportada]' in l for l in msgs_txt), 'cabecalho': 'Período: 21/10/2026 18:00 a 21/10/2026 19:30' in txt}
        res['ex_csv'] = {'bom': csv_bruto.startswith(b'\xef\xbb\xbf'), 'linhas': len(csv.strip().split('\r\n')), 'cab': csv.split('\r\n')[0], 'aspas': 'canhoto; ""assinado""' in csv}
        res['ex_relatorio'] = {'midias': 'Mídias: 3 salvas de 3' in rel, 'sem_falhas': 'NÃO puderam' not in rel}
        # a mídia não existe mais no WhatsApp: o .zip sai do mesmo jeito, com o texto, e o relatório lista o que faltou
        await page.evaluate("window.__audioFalha = true")
        arq2, zf2 = await exportar_zip('export-falha'); rel2 = zf2.read('relatorio.txt').decode('utf-8'); txt2 = zf2.read('conversa.txt').decode('utf-8')
        res['ex_falha'] = {'sem_midia': sorted(zf2.namelist()) == ['conversa.csv', 'conversa.txt', 'relatorio.txt'], 'relatorio': 'Mídias: 0 salvas de 3' in rel2 and 'NÃO puderam' in rel2 and rel2.count('falhou o download') == 3, 'texto_igual': sum(1 for l in txt2.split('\n') if l.startswith('[21/10/2026')) == 8, 'painel': await page.evaluate(PBTXT + ".includes('3 não puderam ser baixadas')")}
        await page.evaluate("window.__audioFalha = false")
        # período sem mensagens: avisa e NÃO gera arquivo
        await DT.nth(0).fill('2026-10-20T10:00'); await DT.nth(1).fill('2026-10-20T11:00'); await page.locator('#az-panel .gbtn', has_text='Exportar').click(); await page.wait_for_timeout(1500)
        res['ex_vazio'] = {'aviso': await page.evaluate(PBTXT + ".includes('Nenhuma mensagem nesse período')")}
        await page.evaluate("window.__hist = {}"); await page.wait_for_timeout(300)
        # v1.45: COMEÇAR AQUI — mostra o que falta configurar, não entra na contagem de cartões da tela e some quando você dispensa
        await sw.evaluate("chrome.storage.local.set({ comecarOculto: false })"); await page.wait_for_timeout(300); await ir(page, 'Configurações'); await page.wait_for_timeout(700)
        com = page.locator('#az-panel .card.comeca'); n_com = await com.count(); txt_com = await com.first.inner_text() if n_com else ''
        res['cc_comecar'] = {'aparece': n_com == 1, 'titulo': 'Começar aqui' in txt_com, 'pendentes': '⬜' in txt_com, 'cartoes_da_tela': await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.pb .sec .sh b')].length > 0 && ![...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.pb .sec .sh b')].some((b) => b.innerText.includes('Começar'))")}
        if n_com: await com.first.locator('.obtn', has_text='Não mostrar mais').click(); await page.wait_for_timeout(500)
        res['cc_comecar'].update({'some': await com.count() == 0, 'guardou': (await st('comecarOculto')) is True})
        # v1.43: CONTATO — aparelho provável pelo formato dos ids (regra da biblioteca): 5 Android + 1 Web + 1 sem pista
        CHAT_CT = '558599990000@c.us'; AND = lambda n: ('A5B4C3D2E1F00112233445566778899' + n)
        await page.evaluate("""([c, ids]) => { const t = Math.floor(Date.now() / 1000), m = (id, fromMe, i) => ({ id: { fromMe, _serialized: (fromMe ? 'true_' : 'false_') + c + '_' + id }, type: 'chat', body: 'oi ' + i, t: t - i * 60 });
          window.__hist = { [c]: [...ids.map((id, i) => m(id, false, i + 1)), m('3EB0FFFFFFFFFFFFFFFF', true, 9)] }; }""", [CHAT_CT, [AND('1'), AND('2'), AND('3'), '3EB0A1B2C3D4E5F60718', AND('4'), AND('5'), 'ZZ99']])
        await ir(page, 'Contato do cliente'); await page.wait_for_timeout(500)
        await page.locator('#az-panel .gbtn', has_text='Ver / atualizar o contato aberto').click(); await page.wait_for_timeout(1500)
        res['ct_aparelho'] = {'provavel': await page.evaluate(PBTXT + ".includes('Aparelho provável: Android')"), 'confianca': await page.evaluate(PBTXT + ".includes('confiança boa')"),
                              'contagem': await page.evaluate(PBTXT + ".includes('Das últimas 7 mensagens dele: 5 com cara de Android · 0 de iPhone · 1 de WhatsApp Web/computador · 1 sem pista')"), 'limite': await page.evaluate(PBTXT + ".includes('é um palpite')")}
        # v1.43: ESCUTA AUTOMÁTICA + BANCO DE CONHECIMENTO — lê, guarda só o importante e sem dados pessoais, ignora o robô, não duplica, só grava na planilha com o script v4;
        # a IA PROPÕE (manual) ou aprova SOZINHA só o que as suas respostas provam (automática), com Desfazer e trava
        def hash32(t):
            x = 2166136261
            for ch in t: x = ((x ^ ord(ch)) * 16777619) & 0xFFFFFFFF
            d = '0123456789abcdefghijklmnopqrstuvwxyz'; s = ''
            while x: s = d[x % 36] + s; x //= 36
            return s or '0'
        ts = await page.evaluate("Math.floor(Date.now() / 1000)")
        await page.evaluate("""(now) => { const L = (id) => ({ id: { _serialized: id }, t: now, isGroup: false }), m = (id, fromMe, body, dt) => ({ id: { fromMe, _serialized: (fromMe ? 'true_' : 'false_') + id + '_' + body.length + dt }, type: 'chat', body, t: now - dt }), SEG = 'Aos domingos só com agendamento prévio.';
          window.__listExtra = [1, 2, 3, 4, 5, 6, 7].map((n) => L('55119000000' + n + '@c.us'));
          window.__hist = { '551190000001@c.us': [m('a', false, 'Vocês carregam aos domingos? meu zap 11999998888', 3600), m('a', true, SEG, 3500), m('a', false, 'obrigado', 3400), m('a', true, 'ok', 3300)],
            '551190000002@c.us': [m('b', false, 'carregam domingo?', 7200), m('b', true, SEG.slice(0, -1) + ', ligue antes.', 7100)], '551190000003@c.us': [m('c', false, 'quanto custa para BH?', 5000), m('c', true, 'R$ 3800 para BH', 4900)],
            '551190000004@c.us': [m('d', false, 'tem carga para Goiânia hoje?', 1800), m('d', true, 'Resposta automática do robô sobre Goiânia', 1790), m('d', false, 'e bitrem pega? me liga 11988887777', 600), m('d', true, 'Bitrem a gente pega sim, depende do destino', 500)],
            '551190000005@c.us': [m('e', false, 'vocês carregam no domingo?', 9000), m('e', true, SEG, 8900)], '551190000006@c.us': [m('f', false, 'Aceitam carga de grãos?', 4000), m('f', true, 'Sim, aceitamos grãos.', 3900)], '551190000007@c.us': [m('g', false, 'Vocês aceitam grãos?', 2000), m('g', true, 'Não aceitamos grãos.', 1900)] }; }""", ts)
        h4 = hash32('551190000004@c.us')
        await sw.evaluate("""async ([h, t]) => { const d = await chrome.storage.local.get(['atendCfg', 'iaCfg']); self.__scriptVersao = 3; self.__sheetLog = [];
          await chrome.storage.local.set({ atendEnv: [{ h, t }], conhecBanco: [], conhecVistos: [], conhecEstado: {}, conhecCfg: { ligado: false, aceitou: false, intervaloMin: 60, auto: false, aprovacao: 'manual', minVezes: 3 }, memSug: [], memFatos: [], atendCfg: { ...(d.atendCfg || {}), planilhaAprende: true }, iaCfg: { ...(d.iaCfg || {}), tokenPlanilha: 'SEGREDO' }, listaCargasUrl: 'https://script.google.com/macros/s/TESTE123/exec', memFila: [] }); }""", [h4, (ts - 1790) * 1000])
        await page.wait_for_timeout(600); await ir(page, 'Memória IA'); await page.wait_for_timeout(500)
        liga = page.locator('#az-panel label.chk', has_text='Escutar e guardar automaticamente').locator('input')
        res['es_desligado'] = {'opcao': await liga.count() == 1, 'nasce_desligada': not await liga.is_checked(), 'banco_vazio': (await st('conhecBanco')) == [], 'aprovacao_nasce_manual': (await st('conhecCfg')).get('aprovacao') == 'manual'}
        await dlg_next(page); await liga.check(); await page.wait_for_timeout(5000)       # o aceite dispara a 1ª leitura sozinho
        banco = await st('conhecBanco') or []; est = await st('conhecEstado') or {}; txts = ' || '.join(b['p'] + ' → ' + b['r'] for b in banco); dom = [b for b in banco if 'domingo' in b['p'].lower()]
        res['es_banco'] = {'n': len(banco), 'sem_telefone': '11988887777' not in txts and '11999998888' not in txts and '***.***.***-**' in txts,   # 11 dígitos = parece CPF: a máscara cobre do mesmo jeito
                            'sem_robo': 'automática do robô' not in txts and 'Goiânia hoje' not in txts, 'sem_trivial': 'obrigado' not in txts and ' ok' not in txts, 'sem_preco': '3800' not in txts,
                           'domingos_juntados': len(dom) == 1 and dom[0]['n'] == 3 and len(dom[0]['chs']) == 3, 'leu': est.get('lidas') == 7 and est.get('refino', {}).get('volateis') == 1 and est.get('refino', {}).get('mesclados') == 2}
        # ler de novo não duplica nada
        await page.locator('#az-panel .gbtn', has_text='Ler agora').click(); await page.wait_for_timeout(2500)
        banco2 = await st('conhecBanco') or []; est2 = await st('conhecEstado') or {}
        res['es_idempotente'] = {'n': len(banco2), 'novos': est2.get('ultimosNovos'), 'domingos_n': [b['n'] for b in banco2 if 'domingo' in b['p'].lower()]}
        # planilha com script ANTIGO (v3): nada é enviado para a aba nova (senão a fila travaria) e a tela avisa
        enviadas = lambda: sw.evaluate("(self.__sheetLog || []).filter((x) => x.aba === 'IA - Conversas').reduce((n, x) => n + (x.linhas || []).length, 0)")
        res['es_script_antigo'] = {'enviadas': await enviadas(), 'aviso': await page.evaluate(PBTXT + ".includes('script da planilha está antigo')"), 'fila': len([f for f in (await st('memFila') or []) if f.get('aba') == 'IA - Conversas'])}
        # colou o script novo (v4): a próxima leitura percebe sozinha e manda o que já estava no banco
        await sw.evaluate("self.__scriptVersao = 4"); await page.locator('#az-panel .gbtn', has_text='Ler agora').click(); await page.wait_for_timeout(2500)
        await page.locator('#az-panel .obtn', has_text='Enviar agora').click(); await page.wait_for_timeout(2000)   # o envio normal espera 15 s para juntar linhas; o botão manda já
        res['es_script_novo'] = {'enviadas': await enviadas(), 'aviso_sumiu': not await page.evaluate(PBTXT + ".includes('script da planilha está antigo')"), 'marcadas': all(b.get('env') for b in (await st('conhecBanco') or []))}
        # APROVAÇÃO MANUAL: a IA só PROPÕE (nada vai para a memória do robô); preço e link são descartados; o que vai para a IA está mascarado e agrupado por pergunta
        await sw.evaluate("self.__treinoChamadas = 0"); await page.locator('#az-panel .obtn', has_text='Consolidar com a IA').click(); await page.wait_for_timeout(2500)
        sug = await st('memSug') or []; fatos = await st('memFatos') or []; ult = await sw.evaluate("self.__ultimoTreino || ''")
        res['es_manual'] = {'propostas': sorted((s['tipo'], s.get('fonte')) for s in sug if s.get('fonte') == 'conversas'), 'sem_preco_nem_link': not any(('3800' in json.dumps(s, ensure_ascii=False)) or ('golpe' in json.dumps(s)) for s in sug), 'nada_aprovado': not any(f.get('fonte') == 'conversas' for f in fatos),
                            'entrada': 'TROCAS REAIS (3)' in ult and '(visto 3 vezes em 3 conversas)' in ult and '11988887777' not in ult and '***.***.***-**' in ult and 'automática do robô' not in ult, 'prova_na_tela': any('visto 3 vez(es) em 3 conversa(s); 100% das respostas iguais' in (s.get('motivo') or '') for s in sug if s['tipo'] == 'faq' and 'domingo' in (s.get('p') or '').lower()), 'chamadas': await sw.evaluate("self.__treinoChamadas")}
        res['es_origem_na_tela'] = await page.evaluate(PBTXT + ".includes('suas conversas reais')")
        # APROVAÇÃO AUTOMÁTICA: aprova sozinha SÓ a pergunta provada (domingos: 3 vezes, 3 conversas, mesma resposta); grãos (respostas contraditórias) e vocabulário ficam para você
        await sw.evaluate("""async () => { const d = await chrome.storage.local.get('conhecCfg'); await chrome.storage.local.set({ memSug: [], memFatos: [], conhecEstado: { ...(await chrome.storage.local.get('conhecEstado')).conhecEstado, consolidado: 0, autoDia: null, desfeitas: [] }, conhecCfg: { ...d.conhecCfg, aprovacao: 'automatica' } }); }""")
        await page.wait_for_timeout(500); await page.locator('#az-panel .obtn', has_text='Consolidar com a IA').click(); await page.wait_for_timeout(2500)
        sug = await st('memSug') or []; fatos = await st('memFatos') or []; autos = [f for f in fatos if f.get('auto')]
        res['es_automatica'] = {'sozinha': [(f['tipo'], f['p']) for f in autos], 'fonte_e_prova': all(f.get('fonte') == 'conversas' and 'visto 3 vez(es)' in (f.get('evid') or '') for f in autos), 'ficou_para_voce': sorted((s['tipo'], (s.get('p') or s.get('texto') or '')[:12]) for s in sug), 'motivo_graos': any('ficou para você' in (s.get('motivo') or '') for s in sug if 'grãos' in (s.get('p') or '')),
                                'contador_do_dia': ((await st('conhecEstado')).get('autoDia') or {}).get('n'), 'marcado_na_memoria': await page.evaluate(PBTXT + ".includes('aprendido sozinho')")}
        # DESFAZER os automáticos
        await dlg_next(page); await page.locator('#az-panel .obtn', has_text='Desfazer os automáticos de hoje').click(); await page.wait_for_timeout(900)
        res['es_desfazer'] = {'memoria': [f for f in (await st('memFatos') or []) if f.get('auto')] == [], 'contou': len(((await st('conhecEstado')).get('desfeitas') or [])) == 1}
        # TRAVA: depois de 3 desfeitos na semana a IA volta sozinha para o modo MANUAL
        await sw.evaluate("""async () => { const e = (await chrome.storage.local.get('conhecEstado')).conhecEstado || {}; await chrome.storage.local.set({ conhecEstado: { ...e, consolidado: 0, autoDia: null, desfeitas: [Date.now() - 3600e3, Date.now() - 7200e3] } }); }""")
        await page.wait_for_timeout(400); await page.locator('#az-panel .obtn', has_text='Consolidar com a IA').click(); await page.wait_for_timeout(2500)
        await dlg_next(page); await page.locator('#az-panel .card', has_text='aprendido sozinho').locator('button[title="Apagar"]').click(); await page.wait_for_timeout(1200)
        res['es_trava'] = {'voltou_manual': (await st('conhecCfg')).get('aprovacao') == 'manual', 'avisou': 'voltei para a aprovação MANUAL' in await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.toast')].map((t) => t.innerText).join(' | ')")}
        # esquecer o banco / desligar
        await dlg_next(page); await page.locator('#az-panel .obtn', has_text='Esquecer o banco').click(); await page.wait_for_timeout(800)
        res['es_esquecer'] = {'banco': await st('conhecBanco'), 'vistos': await st('conhecVistos')}
        await sw.evaluate("""async () => { const d = await chrome.storage.local.get('atendCfg'); await chrome.storage.local.set({ conhecCfg: { ligado: false, aceitou: false, intervaloMin: 60, auto: true, aprovacao: 'manual', minVezes: 3 }, atendEnv: [], memSug: [], memFatos: [], memFila: [], atendCfg: { ...(d.atendCfg || {}), planilhaAprende: false } }); self.__scriptVersao = 0; }""")
        await page.evaluate("window.__listExtra = []; window.__hist = {}"); await page.wait_for_timeout(400)
        # v1.44 (1/4): RESUMIR O QUE PERDI — só as NÃO LIDAS das conversas individuais; a IA só resume (nada é enviado); texto mascarado; prioridade em ordem; link removido
        ts = await page.evaluate("Math.floor(Date.now() / 1000)")
        await page.evaluate("""(now) => { const L = (id, n) => ({ id: { _serialized: id }, t: now, isGroup: false, unreadCount: n, formattedTitle: (window.__nomes || {})[id] }), m = (id, type, body, dt, extra) => ({ id: { fromMe: false, _serialized: 'false_' + id + '_' + dt }, type, body, t: now - dt, ...extra });
          window.__nomes = { ...(window.__nomes || {}), '551190000011@c.us': 'Carlos Frete', '551190000012@c.us': 'Dona Rita', '551190000013@c.us': 'Seu Joaquim' };
          window.__listExtra = [L('551190000011@c.us', 2), L('551190000012@c.us', 1), L('551190000013@c.us', 1)];
          window.__hist = { '551190000011@c.us': [m('a', 'chat', 'Tem carga para BH? meu zap 11999998888', 600), m('b', 'image', 'x', 300, { caption: '' })], '551190000012@c.us': [m('c', 'chat', 'obrigado', 200)], '551190000013@c.us': [m('d', 'chat', 'o canhoto já foi aprovado?', 100)] }; }""", ts)
        await ir(page, 'Resumo do que perdi'); await page.wait_for_timeout(500)
        await dlg_next(page); await page.locator('#az-panel .gbtn', has_text='Resumir o que perdi').click(); await page.wait_for_timeout(3500)
        ent = await sw.evaluate("self.__ultimoResumo || ''"); ordem = await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.pb .card b')].map((b) => b.innerText)")
        res['rsu_resumo'] = {'ordem': [o.split(' · ')[0] for o in ordem], 'acao': await page.evaluate(PBTXT + ".includes('Fazer: Responder hoje')"), 'sem_link': not await page.evaluate(PBTXT + ".includes('http')"), 'abrir': await page.locator('#az-panel .card .obtn', has_text='Abrir conversa').count(),
                            'entrada': 'CONVERSA 1 (2 mensagem(ns) não lida(s))' in ent and '- [foto]' in ent and '11999998888' not in ent and '***.***.***-**' in ent, 'aceite_guardado': (await st('resumoAceitou')) is True, 'aviso_ia': await page.evaluate(PBTXT + ".includes('pode errar')")}
        # v1.45: ENVIOS À IA — o painel mostra exatamente o que foi mandado ao Google (já mascarado), só na memória, e dá para limpar
        await ir(page, 'Envios à IA'); await page.wait_for_timeout(600)
        env = await page.evaluate("(() => { const r = document.querySelector('#az-panel').shadowRoot; return { resumos: [...r.querySelectorAll('.pb details summary')].map((e) => e.textContent), textos: [...r.querySelectorAll('.pb details pre')].map((e) => e.textContent).join(' || ') }; })()")
        res['ie_envios'] = {'tem_resumo': any('Resumo do que perdi' in e for e in env['resumos']), 'mascarado': '***.***.***-**' in env['textos'] and '11999998888' not in env['textos'], 'sem_chave': 'AIza' not in env['textos'] and 'x-goog' not in env['textos']}
        await page.locator('#az-panel .obtn', has_text='Limpar').click(); await page.wait_for_timeout(500)
        res['ie_envios']['limpou'] = await page.evaluate(PBTXT + ".includes('Ainda não houve nenhum envio nesta sessão.')")
        # v1.44 (2/4): AVALIAÇÃO — sem IA: consistente, diferente da memória, sem resposta, sem memória; e uma linha só de números vai para a planilha (script v5)
        await page.evaluate("""(now) => { const L = (id) => ({ id: { _serialized: id }, t: now, isGroup: false, formattedTitle: (window.__nomes || {})[id] }), T = (mm) => now - 7200 + mm * 60, c = (id, mm, body) => ({ id: { fromMe: false, _serialized: 'false_' + id + '_' + mm }, type: 'chat', body, t: T(mm) }), e = (id, mm, body) => ({ id: { fromMe: true, _serialized: 'true_' + id + '_' + mm }, type: 'chat', body, t: T(mm) });
          const ids = { a: 'Zé Motorista', b: 'Maria Silva', c: 'João Pedro', d: 'Ana Lona', f: 'Lia Canhoto', g: 'Rui Recente' }; window.__nomes = { ...(window.__nomes || {}) };
          for (const k of Object.keys(ids)) window.__nomes['5511900001' + k.charCodeAt(0) + '@c.us'] = ids[k]; const I = (k) => '5511900001' + k.charCodeAt(0) + '@c.us';
          window.__listExtra = Object.keys(ids).map((k) => L(I(k))); window.__hist = { [I('a')]: [c('a', 0, 'Vocês carregam aos domingos?'), e('a', 2, 'Aos domingos a gente só carrega com agendamento prévio.')], [I('b')]: [c('b', 10, 'carregam domingo?'), e('b', 15, 'Carregamos todo domingo sem agendamento')],
            [I('c')]: [c('c', 20, 'Aceitam carga de grãos?'), e('c', 30, 'Sim, aceitamos grãos sim.')], [I('d')]: [c('d', 40, 'Tem lugar para carregar lona?'), e('d', 41, 'Temos sim, me passa o peso da carga')], [I('f')]: [c('f', 60, 'preciso de ajuda com o canhoto da entrega')], [I('g')]: [c('g', 115, 'bom dia')] }; }""", ts)
        await sw.evaluate("""async () => { const d = await chrome.storage.local.get(['atendCfg', 'iaCfg']); self.__scriptVersao = 5; self.__sheetLog = [];
          await chrome.storage.local.set({ memFila: [], atendEnv: [], memFatos: [{ id: 'm1', tipo: 'faq', p: 'Vocês carregam aos domingos?', r: 'Aos domingos só com agendamento prévio.', ativo: true, t: Date.now(), fonte: 'humano' }, { id: 'm2', tipo: 'faq', p: 'Aceitam carga de grãos?', r: 'Sim, aceitamos grãos.', ativo: true, t: Date.now(), fonte: 'humano' }], atendCfg: { ...(d.atendCfg || {}), planilhaAprende: true }, iaCfg: { ...(d.iaCfg || {}), tokenPlanilha: 'SEGREDO' }, listaCargasUrl: 'https://script.google.com/macros/s/TESTE123/exec' }); }""")
        await page.wait_for_timeout(600); await ir(page, 'Avaliação do atendimento'); await page.wait_for_timeout(500)
        await page.locator('#az-panel .gbtn', has_text='Avaliar').click(); await page.wait_for_timeout(3500)
        fila_av = [f for f in (await st('memFila') or []) if f.get('aba') == 'IA - Avaliação']
        res['av_avaliacao'] = {'resumo': await page.evaluate(PBTXT + ".includes('6 conversa(s) · 4 troca(s)')"), 'memoria': await page.evaluate(PBTXT + ".includes('Das trocas, 3 tinham memória: 2 bateram e 1 ficaram diferentes.')"), 'diferente': await page.evaluate(PBTXT + ".includes('Respostas diferentes da memória (1)') && " + "document.querySelector('#az-panel').shadowRoot.querySelector('.pb').innerText.includes('Maria Silva') && document.querySelector('#az-panel').shadowRoot.querySelector('.pb').innerText.includes('A memória diz: Aos domingos só com agendamento prévio.')"),
                               'sem_resposta': await page.evaluate(PBTXT + ".includes('Clientes sem resposta (1)') && " + "document.querySelector('#az-panel').shadowRoot.querySelector('.pb').innerText.includes('Lia Canhoto')"), 'sem_memoria': await page.evaluate(PBTXT + ".includes('lugar para carregar lona')"), 'tempo': await page.evaluate(PBTXT + ".includes('Tempo para responder: mediana 5 min')"),
                               'planilha': bool(fila_av) and [len(f['linha']) for f in fila_av] == [9] and int(fila_av[0]['linha'][1]) == 7 and [int(v) for v in fila_av[0]['linha'][2:8]] == [4, 3, 2, 1, 1, 1]}
        # v1.45: AVALIAÇÃO AUTOMÁTICA — 1 vez por dia, só as últimas 24 h, e o número dos clientes sem resposta aparece na aba e no ícone
        await sw.evaluate("chrome.storage.local.set({ avUltimo: { t: Date.now() - 26 * 3600e3, semResposta: 0, divergentes: 0, trocas: 0, dias: 1 }, avCfg: { auto: false } })"); await page.wait_for_timeout(500)
        await page.locator('#az-panel label.chk', has_text='Avaliar sozinho uma vez por dia').locator('input').check(); await page.wait_for_timeout(5500)
        ult = await st('avUltimo') or {}
        res['va_auto'] = {'rodou': ult.get('dias') == 1 and ult.get('semResposta') == 1 and ult.get('divergentes') == 1 and (ult.get('t') or 0) > 0, 'guardou': ((await st('avCfg')) or {}).get('auto') is True, 'numero_na_aba': '1' in await page.locator('#az-panel .hubtabs .ht', has_text='Avaliação').inner_text(),
                          'numero_no_icone': await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('.ph .tb[data-tip^=\"Diagnóstico\"] em.n')?.innerText || null") == '1'}
        await sw.evaluate("chrome.storage.local.set({ avUltimo: null, avCfg: { auto: false } })"); await page.wait_for_timeout(400)
        # v1.44 (3/4): TESTAR A MEMÓRIA — pergunta ao robô (sem enviar nada) o que ele já aprendeu e confere
        await ir(page, 'Atendente IA'); await sub_atend(page, 'Treino'); await page.locator('#az-panel .gbtn', has_text='Treinar conversando').click(); await page.wait_for_timeout(600)
        await page.evaluate("window.__log.length = 0")
        await dlg_next(page); await page.locator('#az-panel .gbtn', has_text='Testar a memória').click(); await page.wait_for_timeout(6000)
        res['tm_memoria'] = {'placar': await page.evaluate(PBTXT + ".includes('1 bateu · 1 não bateu · 0 para revisar')"), 'ok': await page.evaluate(PBTXT + ".includes('✅ Vocês carregam aos domingos?')"), 'falhou': await page.evaluate(PBTXT + ".includes('❌ Aceitam carga de grãos?') && document.querySelector('#az-panel').shadowRoot.querySelector('.pb').innerText.includes('a resposta do robô é diferente da memória')"), 'nada_enviado': len([l for l in await page.evaluate("window.__log") if l[0] == 'text']) == 0}
        # v1.44 (4/4): LIGAÇÃO → MENSAGEM AUTOMÁTICA — espera, confere se você já falou, manda UMA vez, nunca em grupo
        await page.evaluate("""(now) => { const m = (id, dt) => ({ id: { fromMe: true, _serialized: 'true_' + id }, type: 'chat', body: 'já conversamos', t: now - dt }); window.__listExtra = []; window.__hist = { '551190000010@c.us': [m('x1', 60)] }; window.__log.length = 0; }""", ts)
        await ir(page, 'Aguardando resposta'); await page.wait_for_timeout(500)
        lig = page.locator('#az-panel label.chk', has_text='Responder ligações com uma mensagem').locator('input')
        antes = {'opcao': await lig.count() == 1, 'nasce_desligada': not await lig.is_checked(), 'ponte': await page.evaluate("!!window.__azLigacao")}
        await dlg_next(page); await lig.check(); await page.wait_for_timeout(900)
        await page.locator('#az-panel input[type="number"][min="15"]').fill('15'); await page.locator('#az-panel input[type="number"][min="15"]').press('Tab'); await page.wait_for_timeout(700)
        res['lg_liga'] = {**antes, 'ligou': (await st('ligCfg')).get('ligado') is True, 'ponte_ligada': await page.evaluate("!!window.__azLigacao"), 'espera': (await st('ligCfg')).get('esperaS')}
        LIGA = "(c) => window.__ev['call.incoming_call']({ id: 'call-' + c, isGroup: false, isVideo: false, offerTime: Math.floor(Date.now() / 1000), sender: { _serialized: c }, peerJid: c })"
        textos_lig = lambda: page.evaluate("window.__log.filter((l) => l[0] === 'text').map((l) => [l[2], l[1]])")   # o simulador registra [texto, conversa]
        await page.evaluate(LIGA, '551190000009@c.us'); await page.evaluate(LIGA, '551190000010@c.us'); await page.evaluate("window.__ev['call.incoming_call']({ id: 'g1', isGroup: true, sender: { _serialized: '120363000000000001@g.us' }, peerJid: '120363000000000001@g.us', offerTime: Math.floor(Date.now() / 1000) })")
        await page.wait_for_timeout(2000); antes_espera = await textos_lig(); await page.wait_for_timeout(16500); env1 = await textos_lig()
        await page.evaluate(LIGA, '551190000009@c.us'); await page.wait_for_timeout(4000); env2 = await textos_lig()
        res['lg_resposta'] = {'esperou': antes_espera == [], 'enviou_uma': env1 == [['551190000009@c.us', 'Oi! Vi que você ligou. Não consigo atender ligação agora; me escreva aqui por mensagem que eu respondo assim que possível.']], 'nao_a_quem_ja_falei_nem_grupo': all(c != '551190000010@c.us' and '@g.us' not in c for c, _ in env1),
                              'nao_repete': env2 == env1, 'contou': ((await st('ligEstado')) or {}).get('enviadas') == 1, 'motivo': ((await st('ligEstado')) or {}).get('motivo') == 'já respondi a este contato há pouco', 'tela': await page.evaluate(PBTXT + ".includes('Respondidas até agora: 1')")}
        # v1.45: BACKUP SEGURO — nunca leva a identificação deste computador; o banco de conhecimento nasce DESMARCADO e só entra se você marcar; as configurações novas entram
        await sw.evaluate("chrome.storage.local.set({ acessoInst: 'inst-segredo-xyz', conhecCfg: { ligado: false, aceitou: true, intervaloMin: 60, auto: true, aprovacao: 'manual', minVezes: 3 }, avCfg: { auto: false }, conhecBanco: [{ id: 'k1', k: 'k1', p: 'pergunta de teste?', r: 'resposta de teste longa', t: Date.now(), n: 2, chs: ['a'], env: false }] })")
        await page.wait_for_timeout(500); await ir(page, 'Backup'); await page.wait_for_timeout(600)
        async def baixar_bk():
            async with page.expect_download() as dlb: await page.locator('#az-panel .gbtn', has_text='Exportar backup').click()
            dl = await dlb.value; cam = f'{OUT}/bk-seguro.json'; await dl.save_as(cam); bruto = open(cam, encoding='utf-8').read(); return json.loads(bruto), bruto
        marca_bk = page.locator('#az-panel label.chk', has_text='Banco de conhecimento').locator('input'); desmarcado = not await marca_bk.is_checked()
        bk1, raw1 = await baixar_bk(); await marca_bk.check(); bk2, raw2 = await baixar_bk()
        res['bk_seguro'] = {'nasce_desmarcado': desmarcado, 'sem_banco_por_padrao': 'conhecBanco' not in bk1['dados'], 'banco_quando_marca': [b['id'] for b in bk2['dados'].get('conhecBanco', [])] == ['k1'], 'sem_identificacao': 'inst-segredo-xyz' not in raw1 and 'inst-segredo-xyz' not in raw2 and 'acessoInst' not in bk2['dados'],
                            'configs_novas': 'conhecCfg' in bk1['dados'] and 'avCfg' in bk1['dados'], 'texto': await page.evaluate(PBTXT + ".includes('nunca vão para o arquivo')")}
        await sw.evaluate("chrome.storage.local.remove(['acessoInst', 'conhecBanco'])"); await page.wait_for_timeout(300)
        await sw.evaluate("""async () => { const d = await chrome.storage.local.get('atendCfg'); await chrome.storage.local.set({ ligCfg: { ligado: false, aceitou: false, texto: '', esperaS: 60, horasEntre: 6, video: true }, ligEstado: { ult: {}, enviadas: 0, motivo: '' }, memFatos: [], memSug: [], memFila: [], atendCfg: { ...(d.atendCfg || {}), planilhaAprende: false } }); self.__scriptVersao = 0; }""")
        await page.evaluate("window.__listExtra = []; window.__hist = {}"); await page.wait_for_timeout(500)
        # limite diário e chave ausente (a regra roda no service worker)
        await sw.evaluate("chrome.storage.local.get('iaCfg').then(d => chrome.storage.local.set({ iaCfg: { ...d.iaCfg, limiteDia: 1 } }))")
        res['ia_limite'] = await sw.evaluate("iaTratar({ op: 'gerar', sistema: 'x', contents: [] }).then(r => r.erro)")
        await sw.evaluate("chrome.storage.local.get('iaCfg').then(d => chrome.storage.local.set({ iaCfg: { ...d.iaCfg, limiteDia: 100, chave: '', chaves: [] } }))")
        res['ia_sem_chave'] = await sw.evaluate("iaTratar({ op: 'gerar', sistema: 'x', contents: [] }).then(r => r.erro)")
        await sw.evaluate("self.fetch = self.__fetchReal; chrome.storage.local.remove(['iaCfg', 'iaUso'])"); await page.wait_for_timeout(300)
        # fixar por aba: grupo só na aba Grupos não fica no topo de Todas
        pin_antes = await sw.evaluate("chrome.storage.local.get(['pinChat','pinAbas'])")
        await sw.evaluate("chrome.storage.local.set({pinChat:['111@g.us'], pinAbas:{'111@g.us':'grupos'}})"); await page.wait_for_timeout(500)
        pinv = lambda: page.evaluate("WPP.chat.find('111@g.us').then(c => c.pin || 0)")
        p_todas = await pinv()
        await page.locator('[data-testid="filter-button"]', has_text='Grupos').click(); await page.wait_for_timeout(900)
        p_grupos = await pinv()
        await page.locator('[data-testid="filter-button"]', has_text='Tudo').click(); await page.wait_for_timeout(900)
        # v1.20: "grupo só na aba Grupos" — vale em Tudo/Não lidas/Favoritas; não na aba Grupos, nem na busca; desliga limpo
        gs = "(() => { const m = window.__gsMod; return m ? [m.getShouldAppearInList({ id: { isGroup: () => true } }), m.getShouldAppearInList({ id: { isGroup: () => false } })] : null; })()"
        await page.wait_for_timeout(1700)
        res['gs_tudo'] = await page.evaluate(gs)                       # esperado [false, true]: grupo some, conversa fica
        await page.locator('[data-testid="filter-button"]', has_text='Grupos').click(); await page.wait_for_timeout(1200)
        res['gs_aba_grupos'] = await page.evaluate(gs)                 # [true, true]
        await page.locator('[data-testid="filter-button"]', has_text='Tudo').click(); await page.wait_for_timeout(1200)
        res['gs_volta_tudo'] = await page.evaluate(gs)                 # [false, true]
        await page.evaluate("(() => { const d = document.createElement('div'); d.id = 'buscaTeste'; d.setAttribute('data-testid', 'chat-list-search-container'); d.innerHTML = '<div contenteditable=\"true\">Cargas</div>'; document.getElementById('side').appendChild(d); })()")
        await page.wait_for_timeout(1700)
        res['gs_busca'] = await page.evaluate(gs)                      # [true, true]: ao buscar, mostra o grupo
        await page.evaluate("document.getElementById('buscaTeste').remove()"); await page.wait_for_timeout(1700)
        res['gs_fim_busca'] = await page.evaluate(gs)                  # [false, true]
        await page.evaluate("(() => { const d = document.createElement('div'); d.id = 'janelaTeste'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.textContent = 'Encaminhar'; d.style.cssText = 'position:fixed;left:10%;top:10%;width:60%;height:60%'; document.body.appendChild(d); })()"); await page.wait_for_timeout(1100)
        res['gs_janela'] = await page.evaluate(gs)                     # [true, true]: com janela aberta (Encaminhar…) o grupo aparece
        await page.evaluate("document.getElementById('janelaTeste').remove()"); await page.wait_for_timeout(500)
        res['gs_janela_fechou'] = await page.evaluate(gs)              # [false, true]
        await sw.evaluate("chrome.storage.local.get('modulos').then(d => chrome.storage.local.set({ modulos: { ...(d.modulos || {}), gruposSo: false } }))"); await page.wait_for_timeout(1900)
        res['gs_desligado'] = await page.evaluate(gs)                  # [true, true]
        await sw.evaluate("chrome.storage.local.get('modulos').then(d => { const m = { ...(d.modulos || {}) }; delete m.gruposSo; return chrome.storage.local.set({ modulos: m }); })"); await page.wait_for_timeout(1900)
        res['gs_religado'] = await page.evaluate(gs)                   # [false, true]
        res['gs_sorts'] = await page.evaluate("window.__log.filter(l => l[0] === 'sort' && l[1] === 'sort').length")
        # v1.33.1: os grupos NÃO podem piscar na aba Tudo
        sorts = lambda: page.evaluate("window.__log.filter(l => l[0] === 'sort' && l[1] === 'sort').length")
        # a) aviso/dica pequena com role=dialog (o WhatsApp usa por instantes) NÃO desliga o filtro
        await page.evaluate("(() => { const d = document.createElement('div'); d.id = 'dicaTeste'; d.setAttribute('role', 'dialog'); d.textContent = 'dica'; d.style.cssText = 'position:fixed;right:10px;bottom:10px;width:120px;height:30px'; document.body.appendChild(d); })()")
        await page.wait_for_timeout(300); a1 = await page.evaluate(gs); await page.wait_for_timeout(1800); a2 = await page.evaluate(gs)
        await page.evaluate("document.getElementById('dicaTeste').remove()"); await page.wait_for_timeout(400)
        res['gs_dica'] = [a1, a2]
        # b) janela de verdade que abre e fecha em menos de 0,7 s também não faz o grupo aparecer
        await page.evaluate("(() => { const d = document.createElement('div'); d.id = 'janelaCurta'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.textContent = 'x'; d.style.cssText = 'position:fixed;left:10%;top:10%;width:60%;height:60%'; document.body.appendChild(d); })()")
        await page.wait_for_timeout(350); b1 = await page.evaluate(gs)
        await page.evaluate("document.getElementById('janelaCurta').remove()"); await page.wait_for_timeout(1000); b2 = await page.evaluate(gs)
        res['gs_janela_curta'] = [b1, b2]
        # c) mensagem nova num GRUPO reaplica o filtro na hora (uma conversa individual não)
        n0 = await sorts()
        await page.evaluate("window.__ev['chat.new_message']({ id: { remote: '111@g.us', fromMe: true }, type: 'image', t: Math.floor(Date.now() / 1000), isNewMsg: true })"); await page.wait_for_timeout(400); n1 = await sorts()
        await page.evaluate("window.__ev['chat.new_message']({ id: { remote: '5511999990900@c.us', fromMe: true }, type: 'chat', body: 'oi', t: Math.floor(Date.now() / 1000), isNewMsg: true })"); await page.wait_for_timeout(400); n2 = await sorts()
        res['gs_evento_grupo'] = {'grupo': n1 - n0, 'individual': n2 - n1}
        # d) rede de segurança: sobrou linha de grupo na lista → reaplica; depois de 3 tentativas desiste (sem laço)
        # (o simulador tem linhas de grupo fixas, então a rede de segurança já pode estar na pausa de 30 s: trocar de aba reinicia o contador, porque a regra não age na aba Grupos)
        await page.locator('[data-testid="filter-button"]', has_text='Grupos').click(); await page.wait_for_timeout(1800)
        await page.locator('[data-testid="filter-button"]', has_text='Tudo').click(); await page.wait_for_timeout(1800)
        await page.evaluate("(() => { let p = document.getElementById('pane-side'); if (!p) { p = document.createElement('div'); p.id = 'pane-side'; document.getElementById('side').appendChild(p); } const r = document.createElement('div'); r.id = 'grupoFalso'; p.appendChild(r); window.__fakeI = setInterval(() => r.setAttribute('data-az-chat', '999@g.us'), 200); })()")
        # espera a reaplicação ACONTECER (até 40 s: a rede de segurança pode estar numa pausa de 30 s) em vez de olhar uma janela fixa de 10 s, que de vez em quando perdia o momento (falhou 1 vez em 3 rodadas)
        m0 = await sorts(); rapido = 0
        for _ in range(80):
            await page.wait_for_timeout(500); rapido = (await sorts()) - m0
            if rapido >= 1: break
        await page.wait_for_timeout(7000); m2 = await sorts()   # depois de reaplicar, ela desiste em 3 tentativas (sem laço)
        await page.evaluate("clearInterval(window.__fakeI); document.getElementById('grupoFalso').remove()"); await page.wait_for_timeout(1700)
        res['gs_reafirma'] = {'rapido': rapido, 'total': m2 - m0}
        # v1.33.2: janela de INFORMAÇÃO (Mostrar contato) não pausa o filtro; janela de ESCOLHER conversa pausa; a opção muda o comportamento
        async def abre_janela(id_, titulo, extra=''):
            await page.evaluate("([id, t, x]) => { const d = document.createElement('div'); d.id = id; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.innerHTML = '<h2>' + t + '</h2>' + x; d.style.cssText = 'position:fixed;left:10%;top:10%;width:60%;height:60%'; document.body.appendChild(d); }", [id_, titulo, extra])
        async def fecha_janela(id_):
            await page.evaluate("(id) => document.getElementById(id).remove()", id_); await page.wait_for_timeout(500)
        # a) "Mostrar contato" (clicar no cartão de um contato na conversa): os grupos NÃO podem aparecer
        await abre_janela('janInfo', 'Mostrar contato', '<p>Daiane 1500 Transportes</p><p>+55 42 9832-5249 Celular</p>'); await page.wait_for_timeout(1300)
        res['gs_info'] = await page.evaluate(gs); await fecha_janela('janInfo')
        # b) janela de escolher conversa (caixa de seleção): pausa, e volta a esconder ao fechar
        await abre_janela('janEsc', 'Escolha', '<label><input type="checkbox"> Grupo A</label>'); await page.wait_for_timeout(1300)
        esc_abre = await page.evaluate(gs); await fecha_janela('janEsc')
        res['gs_escolhe_caixa'] = {'abre': esc_abre, 'fecha': await page.evaluate(gs)}
        # c) lista de conversas dentro da janela (3 células)
        await abre_janela('janLista', 'Janela', '<div data-testid="cell-frame-container">a</div><div data-testid="cell-frame-container">b</div><div data-testid="cell-frame-container">c</div>'); await page.wait_for_timeout(1300)
        res['gs_escolhe_lista'] = await page.evaluate(gs); await fecha_janela('janLista')
        # d) opção "nunca pausar": nem o Encaminhar pausa
        await sw.evaluate("chrome.storage.local.set({ gruposSoCfg: { janela: 'nunca' } })"); await page.wait_for_timeout(700)
        await abre_janela('janEnc', 'Encaminhar mensagem para'); await page.wait_for_timeout(1300)
        res['gs_modo_nunca'] = await page.evaluate(gs); await fecha_janela('janEnc')
        # e) opção "qualquer janela grande": até o Mostrar contato pausa
        await sw.evaluate("chrome.storage.local.set({ gruposSoCfg: { janela: 'qualquer' } })"); await page.wait_for_timeout(700)
        await abre_janela('janInfo2', 'Mostrar contato'); await page.wait_for_timeout(1300)
        res['gs_modo_qualquer'] = await page.evaluate(gs); await fecha_janela('janInfo2')
        await sw.evaluate("chrome.storage.local.set({ gruposSoCfg: { janela: 'escolher' } })"); await page.wait_for_timeout(700)
        # f) a opção aparece em Configurações e salva
        await ir(page, 'Ajustes dos grupos'); await page.wait_for_timeout(600)
        sel = page.locator('#az-panel select', has=page.locator('option', has_text='Pausar só em janelas de escolher conversa'))
        tem = await sel.count(); await sel.select_option('nunca'); await page.wait_for_timeout(500)
        res['gs_opcao_tela'] = {'tem': tem == 1, 'salvou': await sw.evaluate("chrome.storage.local.get('gruposSoCfg').then(d => d.gruposSoCfg.janela)")}
        await sw.evaluate("chrome.storage.local.set({ gruposSoCfg: { janela: 'escolher' } })"); await page.wait_for_timeout(700)
        await page.locator('[data-testid="filter-button"]', has_text='Tudo').click(); await page.wait_for_timeout(1500)
        p_volta = await pinv()
        res['pin_por_aba'] = [bool(p_todas), bool(p_grupos), bool(p_volta)]
        await ir(page, 'Conversas fixadas'); await page.wait_for_timeout(600)
        res['pin_select'] = await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('.pinrow select')?.selectedOptions[0]?.innerText")
        await page.screenshot(path=f'{OUT}/x-fixadas-aba.png')
        await sw.evaluate("chrome.storage.local.set(%s)" % __import__('json').dumps({k: v for k, v in pin_antes.items() if v is not None}))
        await sw.evaluate("chrome.storage.local.remove('gruposUnicos')"); await page.wait_for_timeout(300)
        # v1.13: importar backup do waTidy (arquivo sintético, criptografado igual ao real)
        import tempfile as _tf, os as _os
        wt_arq = _os.path.join(_tf.mkdtemp(), 'backup_09-07-2026_08__04__11.json'); fazer_backup_wt(wt_arq)
        antes = await sw.evaluate("chrome.storage.local.get(null).then(d=>({keys:Object.keys(d), base:{respostasRapidas:d.respostasRapidas, categorias:d.categorias, pinChat:d.pinChat, pinAbas:d.pinAbas}}))")
        await ir(page, 'Backup')
        await page.locator('#az-panel input[type=file][multiple]').set_input_files(wt_arq); await page.wait_for_timeout(1800)
        cartao = "(()=>{const s=[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.sec')].find(x=>x.innerText.includes('Importar do waTidy')); return s? s.innerText : null})()"
        res['wt_previa'] = await page.evaluate(cartao)
        await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.sec')].find(x=>x.innerText.includes('Importar do waTidy'))?.scrollIntoView()"); await page.wait_for_timeout(200)
        await page.screenshot(path=f'{OUT}/y-wt-previa.png')
        # escolher o que importar: sem o combo, sem as fotos e sem a fixada de grupo
        await page.locator('#az-panel label.chk', has_text='Combo WT').locator('input').first.click(); await page.wait_for_timeout(300)
        await page.locator('#az-panel details.wtsel summary', has_text='Mídias').click(); await page.wait_for_timeout(200)
        await page.locator('#az-panel label.chk', has_text='Fotos').locator('input').first.click(); await page.wait_for_timeout(300)
        await page.locator('#az-panel details.wtsel summary', has_text='fixadas').click(); await page.wait_for_timeout(200)
        await page.locator('#az-panel label.wtit', has_text='Grupo …').locator('input').first.click(); await page.wait_for_timeout(300)
        res['wt_sel_resumo'] = await page.evaluate(cartao)
        await page.screenshot(path=f'{OUT}/y-wt-escolha.png')
        await page.locator('#az-panel .gbtn', has_text='Importar agora').click(); await page.wait_for_timeout(1500)
        res['wt_fim'] = await page.evaluate(cartao)
        await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.sec')].find(x=>x.innerText.includes('Importar do waTidy'))?.scrollIntoView()"); await page.wait_for_timeout(200)
        await page.screenshot(path=f'{OUT}/y-wt-fim.png')
        res['wt_dados'] = await sw.evaluate("""chrome.storage.local.get(null).then(d=>({
            replies:(d.respostasRapidas||[]).filter(r=>r.wt).map(r=>[r.titulo,r.atalho,r.acoes.map(a=>a.tipo+(a.segundos?':'+a.segundos:'')+(a.digitando?'/dig'+a.digitando:'')).join(',')]),
            cats:(d.categorias||[]).map(c=>c.nome), pins:d.pinChat, pinAbas:d.pinAbas, midias:Object.keys(d).filter(k=>k.startsWith('midia_')).length,
            texto:((d.respostasRapidas||[]).find(r=>r.wt==='rA')||{acoes:[{}]}).acoes[0].texto }))""")
        await ir(page, 'Respostas rápidas'); await page.wait_for_timeout(500)
        res['wt_lista'] = await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('.pb').innerText.toLowerCase().includes('boas vindas wt')")
        # limpa o que o teste criou para não afetar os próximos passos
        limpar = "(async (a) => { const d = await chrome.storage.local.get(null); await chrome.storage.local.remove(Object.keys(d).filter(k => k.startsWith('midia_') && !a.keys.includes(k))); await chrome.storage.local.remove(Object.entries(a.base).filter(([k, v]) => v == null).map(([k]) => k)); await chrome.storage.local.set(Object.fromEntries(Object.entries(a.base).filter(([k, v]) => v != null))); })(%s)" % __import__('json').dumps(antes)
        await sw.evaluate(limpar)
        await page.wait_for_timeout(500)
        await ir(page, 'Aguardando resposta'); await page.wait_for_timeout(1200)
        # v1.10: adiar 30 min + horário de expediente
        n_antes = await page.locator('#az-panel .card.fila').count()
        if n_antes:
            await page.locator('#az-panel .card.fila .ib.adiar').first.click(); await page.wait_for_timeout(300)
        adiada = await sw.evaluate("chrome.storage.local.get('filaAdiadas').then(d=>Object.values(d.filaAdiadas||{}).map(t=>Math.round((t-Date.now())/60000)))")
        res['fila_adiada'] = [n_antes, await page.locator('#az-panel .card.fila').count(), adiada]
        await page.locator('#az-panel .rowf .chk', has_text='Só no expediente').locator('input').first.click(); await page.wait_for_timeout(300)
        await page.evaluate("(()=>{const i=[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('input[type=time]')];i[0].value='00:00';i[0].dispatchEvent(new Event('change'));})()"); await page.wait_for_timeout(300)
        await page.evaluate("(()=>{const i=[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('input[type=time]')];i[1].value='00:01';i[1].dispatchEvent(new Event('change'));})()"); await page.wait_for_timeout(1200)
        res['fila_expediente'] = await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('.empty')?.innerText")
        await page.screenshot(path=f'{OUT}/u-fila-expediente.png')
        await page.locator('#az-panel .rowf .chk', has_text='Só no expediente').locator('input').first.click(); await page.wait_for_timeout(300)
        await ir(page, 'Diagnóstico'); await page.wait_for_timeout(300)
        await ir(page, 'Laboratório'); await page.wait_for_timeout(500)
        lados = []
        await ir(page, 'Configurações'); await page.wait_for_timeout(300)
        for nome in ['À esquerda', 'Em cima', 'À direita']:
            await page.locator('#az-panel .seg button', has_text=nome).click(); await page.wait_for_timeout(400)
            lados.append(await page.evaluate('''(() => { const r = document.querySelector('#az-panel').shadowRoot.querySelector('.panel'), a = document.querySelector('#app').getBoundingClientRect(), p = r.getBoundingClientRect();
              return [r.className, Math.round(p.left), Math.round(p.width), Math.round(a.left), Math.round(a.top), Math.round(a.width), Math.round(a.height), !!r.querySelector('.pb')]; })()'''))
            await page.screenshot(path=f'{OUT}/v-lado{len(lados)}.png')
        # desligar Laboratório e Iniciar conversa
        await page.locator('#az-panel .modr', has_text='Laboratório').locator('.tog').click(); await page.wait_for_timeout(300)
        await page.locator('#az-panel .modr', has_text='Iniciar conversa').locator('.tog').click(); await page.wait_for_timeout(400)
        await page.wait_for_timeout(600)
        await ir(page, 'Limites'); await page.wait_for_timeout(700)
        res['limites_card'] = await page.evaluate("(()=>{const s=[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.sec')].find(x=>x.innerText.includes('Limites do WhatsApp')); return s? s.innerText.replace(/\\n/g,' | ') : null})()")
        await page.screenshot(path=f'{OUT}/w-config.png')
        dicas = await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.ph .tb')].map(b=>b.dataset.tip)")
        await ir(page, 'Diagnóstico'); await page.wait_for_timeout(400)   # com o Laboratório desligado, a aba some do Diagnóstico
        res['modulos_off'] = [dicas, await page.locator('#az-panel .hubtabs .ht', has_text='Laboratório').count(), await sw.evaluate("chrome.storage.local.get('modulos').then(d=>d.modulos)")]
        await ir(page, 'Configurações'); await page.wait_for_timeout(300)
        await page.locator('#az-panel .modr', has_text='Laboratório').locator('.tog').click(); await page.wait_for_timeout(300)
        await page.locator('#az-panel .modr', has_text='Iniciar conversa').locator('.tog').click(); await page.wait_for_timeout(300)
        res['lados'] = lados
        await page.evaluate("localStorage.setItem('az-ui', JSON.stringify({...JSON.parse(localStorage.getItem('az-ui')||'{}'), open: true, lado: 'direita'}))")
        await ir(page, 'Diagnóstico'); await page.wait_for_timeout(600)
        await ir(page, 'Laboratório'); await page.wait_for_timeout(800)
        await ir(page, 'Lista de frete'); await page.wait_for_timeout(300)
        await page.locator('#az-panel input[placeholder^="https://script.google.com"]').fill('https://script.google.com/macros/s/AKfyTESTE123/exec')
        await page.locator('#az-panel input[placeholder^="https://script.google.com"]').press('Tab'); await page.wait_for_timeout(300)
        await page.evaluate("window.__log.length = 0; document.querySelector('#main footer [contenteditable]').innerText = ''")
        await page.locator('#az-head .hb[data-tip^="Lista de frete"]').click(); await page.wait_for_timeout(2000)
        res['cargas_toast'] = await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.toast')].map(t=>t.innerText)")
        res['cargas_campo'] = await page.evaluate("document.querySelector('#main footer [contenteditable]').innerText")
        await ir(page, 'Enviar para vários'); await page.wait_for_timeout(300)
        await page.locator('#az-panel .obtn', has_text="Puxar lista de frete").click(); await page.wait_for_timeout(2000)
        await dlg_next(page, '9DA62645')
        await page.locator('#az-panel .obtn', has_text='Anúncio por ID').click(); await page.wait_for_timeout(2000)
        res['cargas_id'] = await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('textarea').value")
        await dlg_next(page, 'XX')
        await page.locator('#az-panel .obtn', has_text='Anúncio por ID').click(); await page.wait_for_timeout(2000)
        res['cargas_erro'] = await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.toast')].map(t=>t.innerText).pop()")
        await page.locator('#az-panel .obtn', has_text="Puxar lista de frete").click(); await page.wait_for_timeout(2000)
        res['cargas_lote'] = await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('textarea').value.slice(0, 40)")
        await page.evaluate("document.querySelector('#main footer [contenteditable]').innerText = ''")
        await ir(page, 'Diagnóstico'); await page.wait_for_timeout(400)
        await ir(page, 'Laboratório'); await page.wait_for_timeout(500)
        res['zap_flutuante'] = await page.evaluate("!!document.querySelector('#az-pop').shadowRoot.querySelector('.zapbtn')")
        await page.screenshot(path=f'{OUT}/q-lab.png')
        await dlg_next(page)
        await page.locator('#az-panel .obtn', has_text='Voltar ao normal').click(); await page.wait_for_timeout(500)
        res['lab_reset'] = (await page.evaluate("WPP.loader.loadModule('WAWebABProps').getABPropConfigValue('scheduled_messages_sender_enabled')"), await page.evaluate("localStorage.getItem('az-lab')"))
        await ir(page, 'Diagnóstico'); await page.wait_for_timeout(300)
        await ir(page, 'Backup'); await page.wait_for_timeout(300)
        await page.screenshot(path=f'{OUT}/h-backup.png')
        await ir(page, 'Respostas rápidas'); await page.wait_for_timeout(300)
        await page.screenshot(path=f'{OUT}/i-respostas.png')
        # envio para vários: 2 fotos + mensagem para 2 grupos
        import base64, os as _os
        png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')
        for n in ('foto1.png', 'foto2.png'): open(f'{OUT}/{n}', 'wb').write(png)
        await ir(page, 'Enviar para vários'); await page.wait_for_timeout(600)
        await page.locator('#az-panel .file input[type=file]').set_input_files([f'{OUT}/foto1.png', f'{OUT}/foto2.png']); await page.wait_for_timeout(500)
        await page.locator('#az-panel textarea').fill('Carga nova!')
        await page.locator('#az-panel .dest .chk', has_text='Grupo Cargas').click(); await page.wait_for_timeout(200)
        await page.locator('#az-panel .dest .chk', has_text='Grupo Fretes').click(); await page.wait_for_timeout(200)
        for i in range(2): await page.locator('#az-panel .in.num').nth(i).fill('0')
        await page.screenshot(path=f'{OUT}/j-lote.png')
        await dlg_next(page)
        await page.locator('#az-panel .gbtn', has_text='Enviar 6').click(); await page.wait_for_timeout(2500)
        await page.screenshot(path=f'{OUT}/k-lote-fim.png')
        res['lote_saved'] = await sw.evaluate("chrome.storage.local.get('loteDestinos').then(d=>d.loteDestinos)")
        # v1.14.6: ao concluir, a lista de arquivos é limpa sozinha (a mensagem de texto fica)
        await page.locator('#az-panel .gbtn', has_text='Voltar').click(); await page.wait_for_timeout(300)
        res['lote_arquivos_apos_envio'] = await page.locator('#az-panel .files .fi').count()
        res['lote_texto_apos_envio'] = await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('textarea').value")
        # status: novo envio com 2 fotos + texto para os 2 grupos salvos + Meu status
        await page.locator('#az-panel .file input[type=file]').set_input_files([f'{OUT}/foto1.png', f'{OUT}/foto2.png']); await page.wait_for_timeout(500)
        await page.locator('#az-panel textarea').fill('Promo')
        await page.locator('#az-panel .fchip', has_text='Grupos').click(); await page.wait_for_timeout(200)
        await page.locator('#az-panel .dest .chk', has_text='Meu status').click(); await page.wait_for_timeout(200)
        for i in range(2): await page.locator('#az-panel .in.num').nth(i).fill('0')
        await dlg_next(page)
        await page.locator('#az-panel .gbtn', has_text='Enviar 9').click(); await page.wait_for_timeout(12000)
        res['lote2_avisos'] = await page.locator('#az-panel .errs.warn small').all_inner_texts()
        await page.screenshot(path=f'{OUT}/n-status-aviso.png')
        res['lote2_erros'] = await page.locator('#az-panel .errs:not(.warn) small').all_inner_texts()
        await page.locator('#az-panel .gbtn', has_text='Voltar').click(); await page.wait_for_timeout(200)
        await page.locator('#az-panel .seg button', has_text='Meus status').click(); await page.wait_for_timeout(600)
        res['status_cards'] = await page.locator('#az-panel .stc').count()
        res['status_nao_publicado'] = await page.locator('#az-panel .stc .np', has_text='não publicado').count()
        res['status_sem_arquivo'] = await page.locator('#az-panel .stc .np', has_text='sem arquivo').count()
        await page.locator('#az-panel .obtn', has_text='Marcar todos').click(); await page.wait_for_timeout(200)
        await page.screenshot(path=f'{OUT}/l-status.png')
        await dlg_next(page)
        await page.locator('#az-panel .gbtn', has_text='Apagar selecionados').click(); await page.wait_for_timeout(1200)
        await page.screenshot(path=f'{OUT}/m-apagando.png')
        await page.wait_for_timeout(14000)  # o não publicado espera 5 s conferindo antes de tirar da lista
        res['status_after'] = await page.locator('#az-panel .stc').count()
        res['status_toast'] = await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.toast')].map(t=>t.innerText).pop()")
        assert res['status_after'] == 0 and res['status_nao_publicado'] == 1, (res['status_after'], res['status_nao_publicado'], res['status_toast'])
        # v1.14.1: status que VOLTA sozinho depois de apagado -> marca ↩ e avisa; e aviso de limite antes de enviar status grande
        await page.evaluate("window.__azRecriaMs = 1800; WPP.status.getMyStatus().then(s => s.msgs._models.push({ id: { _serialized: 'fantasma1' }, ack: 1, type: 'image', t: Date.now()/1000 - 60, body: '', caption: '' }))")
        await page.locator('#az-panel .ib[title="Recarregar"]').click(); await page.wait_for_timeout(700)
        await page.locator('#az-panel .obtn', has_text='Marcar todos').click(); await page.wait_for_timeout(200)
        await dlg_next(page)
        await page.locator('#az-panel .gbtn', has_text='Apagar selecionados').click(); await page.wait_for_timeout(10500)
        res['voltou_tile'] = await page.locator('#az-panel .stc .np', has_text='voltou').count()
        res['voltou_toast'] = await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.toast')].map(t=>t.innerText).filter(t=>t.includes('voltaram')).pop() || null")
        await page.screenshot(path=f'{OUT}/m2-voltou.png')
        await page.evaluate("window.__azRecriaMs = 0; WPP.status.getMyStatus().then(s => { s.msgs._models = [] })")
        import os as _o
        grande = _o.path.join(OUT, 'grande.png'); open(grande, 'wb').write(b'\x89PNG\r\n\x1a\n' + _o.urandom(11 * 1024 * 1024))
        await page.locator('#az-panel .seg button', has_text='Enviar').first.click(); await page.wait_for_timeout(300)
        res['lim_tela'] = await page.evaluate("document.querySelector('#az-panel').shadowRoot.querySelector('.pb').innerText.slice(0, 60)")
        if await page.locator('#az-panel .gbtn', has_text='Novo envio').count(): await page.locator('#az-panel .gbtn', has_text='Novo envio').click(); await page.wait_for_timeout(300)
        await page.locator('#az-panel .file input[type=file]').set_input_files([grande]); await page.wait_for_timeout(900)
        marcado = await page.evaluate("[...document.querySelector('#az-panel').shadowRoot.querySelectorAll('.dest .chk')].find(l => l.innerText.includes('Meu status'))?.querySelector('input')?.checked")
        if not marcado: await page.locator('#az-panel .dest .chk', has_text='Meu status').click(); await page.wait_for_timeout(200)
        for i in range(2): await page.locator('#az-panel .in.num').nth(i).fill('0')
        dialogos = []
        await page.evaluate("document.documentElement.dataset.azDlgAuto = JSON.stringify({ cancelarSe: 'limite de status' }); document.documentElement.dataset.azDlgLog = '[]'")   # Cancelar = pular os arquivos grandes
        await page.locator('#az-panel .gbtn', has_text='Enviar').last.click(); await page.wait_for_timeout(20000)
        dialogos = json.loads(await page.evaluate("document.documentElement.dataset.azDlgLog || '[]'")); await page.evaluate("delete document.documentElement.dataset.azDlgAuto")
        res['lim_dialogo'] = dialogos
        res['lim_erros'] = await page.locator('#az-panel .errs:not(.warn) small').all_inner_texts()
        await page.screenshot(path=f'{OUT}/m3-limite.png')
        res['tabs_bar'] = await page.locator('#az-tabs').count()
        res['head_buttons'] = await page.locator('#az-head .hb').count()
        await page.locator('#az-panel .tb.theme').click(); await page.wait_for_timeout(300)
        await page.locator('#az-panel .tb.close').click(); await page.wait_for_timeout(300)
        res['collapsed_again'] = await page.locator('#az-panel .handle').count()
        res['log'] = await page.evaluate('window.__log')
        # autoteste: WhatsApp "atualizou" e sumiu a função usada pela assinatura -> aviso + relatório
        p2 = await ctx.new_page()
        p2.on('pageerror', lambda e: errors.append('p2 pageerror: ' + str(e)))
        await p2.goto('https://web.whatsapp.com/'); await p2.wait_for_timeout(1200)
        await p2.evaluate(STUB + "; WPP.chat.setInputText = undefined;")
        await p2.wait_for_timeout(14000)
        res['inicia_recolhido'] = await p2.evaluate("[!document.querySelector('#az-panel').shadowRoot.querySelector('.panel'), !!document.querySelector('#az-panel').shadowRoot.querySelector('.handle')]")
        res['alerta'] = await p2.locator('#az-panel .alerta').all_inner_texts()
        res['diag_dot'] = await p2.locator('#az-panel .tb.alert, #az-panel .handle .st.bad').count()
        await p2.screenshot(path=f'{OUT}/o-alerta.png')
        if res['alerta']:
            async with p2.expect_download() as dl:
                await p2.locator('#az-panel .alerta .gbtn', has_text='Baixar relatório').click()
            d = await dl.value; html = open(await d.path(), encoding='utf-8').read()
            open(f'{OUT}/relatorio.html', 'w', encoding='utf-8').write(html)
            res['rel_atendente'] = '&quot;atendente&quot;' in html or '"atendente"' in html
            res['rel_ok'] = ('Saúde das funções' in html, '✖ Assinatura' in html, 'chat.setInputText' in html)
            res['rel_resumo'] = ['<h2>Resumo</h2>' in html, 'Tempo:' in html, 'Custo do AtendeZap' in html, 'Desde o relatório anterior' in html, '\n  ' not in html.split('id="dados">')[1][:2000]]
        hist = await sw.evaluate("chrome.storage.local.get('diagEstado').then(d=>d.diagEstado && d.diagEstado.historico.map(h=>[h.motivo,h.bad,h.afetadas]))")
        res['historico'] = hist
        res['errors'] = errors
        esperado = {
            'vagas': lambda v: isinstance(v, list) and len(v) == 2,
            'vagas_marcas': lambda v: any('rowCargas=111@g.us' in i for i in (v or [])),
            'inv_depois': lambda v: bool(v) and v.get('nMod') == 0,
            'nv_rel': lambda v: bool(v) and all(c in v['chips'] for c in ['Grupos 2', 'Business 1', 'Organizações 2', 'Grupos 57', 'Business 9']) and 'Grupos 59' in v['destaque'] and 'Business 10' in v['destaque'] and 'Organizações 2' in v['destaque']
                and any(t.endswith('· Grupos') and 'GetLinkedGroups' in t for t in v['itens']) and any(t.endswith('· Business') and 'BusinessDirectConnection' in t for t in v['itens']) and any(t.endswith('· Grupos/Organizações') for t in v['itens']) and not any('Voip' in t and t.endswith('Grupos') for t in v['itens']),
            'refs': lambda v: bool(v) and bool(v.get('curtidas')),
            'refs_na_tela': lambda v: v is True,
            'gemeos': lambda v: v == ['rowG1=true', 'rowG2=false', 'rowModal=false'],
            'gs_tudo': lambda v: v == [False, True], 'gs_aba_grupos': lambda v: v == [True, True], 'gs_volta_tudo': lambda v: v == [False, True],
            'gs_busca': lambda v: v == [True, True], 'gs_fim_busca': lambda v: v == [False, True],
            'gs_janela': lambda v: v == [True, True], 'gs_janela_fechou': lambda v: v == [False, True],
            'gs_desligado': lambda v: v == [True, True], 'gs_religado': lambda v: v == [False, True],
            'gs_dica': lambda v: v == [[False, True], [False, True]], 'gs_janela_curta': lambda v: v == [[False, True], [False, True]],
            'gs_evento_grupo': lambda v: v['grupo'] >= 1 and v['individual'] == 0,
            'gs_info': lambda v: v == [False, True], 'gs_escolhe_caixa': lambda v: v == {'abre': [True, True], 'fecha': [False, True]}, 'gs_escolhe_lista': lambda v: v == [True, True],
            'gs_modo_nunca': lambda v: v == [False, True], 'gs_modo_qualquer': lambda v: v == [True, True], 'gs_opcao_tela': lambda v: v == {'tem': True, 'salvou': 'nunca'}, 'gs_reafirma': lambda v: v['rapido'] >= 1 and v['total'] <= 5,
            'ia_modelo': lambda v: v == 'gemini-3.6-flash', 'ia_diag': lambda v: bool(v) and 'Recarregue' in v,
            'ia_desfeito': lambda v: v and v[0] == 0 and v[1] == '', 'ia_req2_msgs': lambda v: v == 3,
            'ia_editor_depois': lambda v: bool(v) and v[0] == 3 and v[1] == 'Boas-vindas IA', 'ia_aplicou_sozinha': lambda v: bool(v),
            'rb_resposta': lambda v: len(v) == 1 and v[0].startswith('🤖 Assistente virtual:') and 'Posso ajudar' in v[0],
            'rb_intervalo': lambda v: v == 1, 'rb_seguimento': lambda v: len(v) == 2 and 'Posso ajudar' in v[1],
            'rb_vida': lambda v: v == [True, True], 'rb_robo_sw_ligado': lambda v: v is True, 'rb_robo_sw_desligado': lambda v: v is False,
            'rb_pausadas_antes': lambda v: v >= 2, 'rb_pausadas_depois': lambda v: v == 0, 'rb_retomou_pendente': lambda v: v == ['responder'],
            'rel_atendente': lambda v: v is True,
            'rb_humano': lambda v: len(v[0]) == 1 and 'Vou chamar um atendente.' in v[0][0] and v[1] == 0, 'rb_pausado': lambda v: v == 1,
            'rb_grupo': lambda v: v == 0, 'rb_voce_assumiu': lambda v: v == 0, 'rb_executou': lambda v: len(v) == 1,
            'rb_F_G_H_textos': lambda v: v == [1, 1, 0],
            'rb_sugestao': lambda v: v[0] == 0 and len(v[1]) == 1 and v[1][0][0] == 'responder',
            'rb_sugestao_enviada': lambda v: len(v) == 1 and 'Posso ajudar' in v[0], 'rb_exemplo': lambda v: bool(v) and len(v) == 1,
            'rb_sem_aceite': lambda v: v == 'desligado', 'rb_desligado_sem_ia': lambda v: v == 0,
            'rc_resposta': lambda v: len(v) == 1 and 'Tem sim' in v[0], 'rc_prompt': lambda v: v == [True, False, False],
            'rc_demanda': lambda v: ['Goiânia', '', 'truck', 'ofereceu'] in v and ['', 'Curitiba', '', 'sem_carga'] in v,
            'rc_perfil': lambda v: v[0] == ['truck', 'baú', ['Goiânia']] and len(v) == 2, 'rc_perfil_no_prompt': lambda v: v is True,
            'rc_sugestao': lambda v: len(v) == 1 and v[0][0] == 'faq' and 'quanto custa o frete' in v[0][1] and '99999' not in v[0][1] and 'tonelada' in v[0][2] and v[0][3] == 'humano',
            'rc_tela_demanda': lambda v: v == [True, True], 'rc_aprovou': lambda v: len(v[0]) == 1 and v[1] == 0 and 'IA - Aprendizado' in v[2] and 'IA - Memória' in v[2],
            'rc_memoria_no_prompt': lambda v: v is True, 'rc_aprender': lambda v: v == [['duvida', 'ia'], ['vocab', 'ia']],
            'rc_duvida_respondida': lambda v: 'Aos domingos só com agendamento.' in v,
            'rc_planilha': lambda v: [a for a in v['abas'] if a not in ('ping', 'robo')] == ['IA - Aprendizado', 'IA - Demanda', 'IA - Memória', 'IA - Tempos'] and 'ping' in v['abas'] and v['tokens'] == ['SEGREDO'] and v['semTelefone'] and v['nDemanda'] >= 4 and all(c.startswith("'=") for c in v['celulaFormula']) and len(v['celulaFormula']) == 1,
            'rc_fila_depois': lambda v: v == 0, 'rc_importou': lambda v: v == [['planilha', 'Não transportamos explosivos.']],
            'fl_resposta': lambda v: len(v) == 1 and 'Posso ajudar' in v[0], 'fl_chamadas': lambda v: v == 3, 'fl_pausa': lambda v: v == 0,
            'fl_persistente': lambda v: v == [0, 0, ['humano'], 1, 0], 'fl_avisou': lambda v: len(v[0]) == 1 and 'já avisei' in v[0][0] and v[1] == 0 and v[2] == ['humano'],
            'fl_pensar': lambda v: v['seq'] == ['{"thinkingLevel":"minimal"}', '{"thinkingLevel":"low"}'] and v['memo'] == ['level:low'],
            'fl_digitando_travado': lambda v: v == 1, 'fl_migrou': lambda v: v == [3, 30, 80, [2, 5], 2, 20, 'Minha empresa', 'todos', True],
            'tp_demanda': lambda v: len(v) == 1 and v[0][0] == 'number' and v[0][1] is True and v[0][2] is not None and 0 <= v[0][2] <= 15 and v[0][3] is not None and 118 <= v[0][3] <= 126,
            'tp_falha': lambda v: len(v) == 1 and v[0] == ['falhou', 'number'], 'tp_atendente': lambda v: v == [['respondeu depois do repasse', True, True]],
            'tp_tela': lambda v: v == [True] * 6,
            'tp_planilha': lambda v: v['demCols'] == [14, 14] and v['demTempos'][0][0].isdigit() and v['demTempos'][0][1].isdigit() and 118 <= int(v['demTempos'][0][2]) <= 126 and v['demTempos'][1][2] == '' and ['IA', 'falhou'] in v['tempos'] and ['Atendente', 'respondeu depois do repasse'] in v['tempos'],
            'tp_script_antigo': lambda v: v is True, 'tp_script_novo': lambda v: v is True, 'tp_fila_antiga': lambda v: v == [0, True, True],
            'rb_simulou': lambda v: len(v) == 1 and 'Responderia' in v[0],
            'lm_refeito': lambda v: len(v[0]) == 1 and 'CPF' not in v[0][0] and 'rota' in v[0][0] and v[1] == 2 and v[2] == [False, True] and v[3] == 0,
            'lm_bloqueado': lambda v: v[0] == [] and v[1] == ['humano'] and 'dado proibido: CPF' in v[2],
            'lm_fora': lambda v: len(v['redirecionar']) == 1 and 'Só atendo sobre cargas' in v['redirecionar'][0] and v['ignorar'] == [] and v['humano'] == [[], ['humano']],
            'lm_tela': lambda v: v == [True] * 6, 'lm_config': lambda v: v == [True, ['placa do veículo'], True],
            'lm_treino_bloqueio': lambda v: len(v) == 1 and 'Bloqueado' in v[0] and 'CPF' in v[0] and 'corrigida automaticamente' not in v[0],
            'lm_treino_salvou': lambda v: v[0] == ['Nunca peça CPF.', 'Nunca prometa prazo de entrega.'] and v[1] is True,
            'lm_bateria': lambda v: len(v) == 10 and [x for x in v if 'Cumprimento simples' in x][0].startswith('✔') and [x for x in v if 'Pergunta de valor' in x][0].startswith('✔') and [x for x in v if 'manda o CPF' in x][0].startswith('✔')
                and [x for x in v if 'revelar as instruções' in x][0].startswith('✔') and [x for x in v if 'Pede um atendente' in x][0].startswith('✔') and [x for x in v if 'para o cadastro' in x][0].startswith('✔')
                and [x for x in v if 'se é um robô' in x][0].startswith('⚠') and [x for x in v if 'Assunto fora' in x][0].startswith('⚠'),
            'sc_desconhecidos': lambda v: v[0] == 1 and v[1] == 0 and v[2] == 1 and len(v[3]) == 1 and v[3][0].startswith('é um contato salvo'), 'sc_tela': lambda v: v == [True] * 5,
            'sc_todos': lambda v: v == [1, 0, 'todos'], 'sc_nunca': lambda v: v == [True, 0, 0],
            'tr_bloqueado': lambda v: v == [0, True], 'tr_assumiu': lambda v: v == 1, 'tr_pedidos': lambda v: v['livre'] is True and v['comId'] is True and v['n'] >= 2,
            'pv_prazo': lambda v: v == [['n1'], 0, ['h2']], 'pv_planilha': lambda v: v == [1], 'pv_tudo': lambda v: v == [0, 0, 0],
            'ponte_chave': lambda v: str(v['sensivel']).startswith('recusado') and v['leitura'] == 'ok' and v['enviou'] == 0 and v['auditoria'] == [True, True],
            'dl_real': lambda v: v['tela']['texto'].startswith('Apagar deste navegador o registro') and v['tela']['botoes'] == ['Cancelar', 'Apagar(vermelho)'] and v['cancelar'] == [1, 0] and v['esc'] == [1, 0] and v['confirmar'] == [0, 0],
            'perm_tabs': lambda v: v == {'semTabs': True, 'achouAba': True, 'urlVisivel': True, 'manter': True},
            'au_ligado': lambda v: v == {'resposta': 1, 'transc': 1, 'visto': True, 'audio': ['audio/ogg', True]}, 'au_desligado': lambda v: v == [1, 0, True], 'au_falha': lambda v: v == [1, True],
            'rs_reserva': lambda v: v[0] == 1 and v[1][-1] == 'gemini-reserva' and len(v[1]) == 2 and v[1][0] != 'gemini-reserva',
            'rs_cota_dia': lambda v: v[0] == 0 and v[1] == 1 and len(v[2]) == 1 and 'cota do DIA' in v[2][0] and v[3] >= 1,
            'rs_cota_min': lambda v: v[0] == 1 and v[1] == 2 and v[2] == [True],
            'rs_treino_falha': lambda v: v == {'avisa': True, 'semHumano': True, 'semEnsinar': True, 'repetir': True, 'bloco': 'block'},
            'rs_treino_repetiu': lambda v: v == {'cliente': 1, 'ia': 1, 'ensina': True, 'semErro': True},
            'rs_bateria': lambda v: v[0] is True and v[1] == 2,
            'rs_falhas': lambda v: v == {'instavel': 3, 'cota-dia': 1, 'cota-minuto': 1, 'reserva': 1},
            'rs_config': lambda v: v == [True, True, True, True],
            'ch_cota_dia': lambda v: v['resp1'] == 1 and v['usadas1'] == ['TESTKEY123', 'SECONDKEY456'] and v['estado'] == {v['id']: 'cota-dia:futuro'} and v['resp2'] == 1 and v['usadas2'] == ['SECONDKEY456'],
            'ch_todas_falham': lambda v: v[0] == 0 and v[1] == ['TESTKEY123', 'SECONDKEY456'] and len(v[2]) == 1 and 'Nenhuma das 2 chaves' in v[2][0],
            'ch_503_nao_troca': lambda v: v[0] == 1 and v[1] is False and v[2] == 3,
            'ch_tela': lambda v: v['campos0'] == 2 and v['descansando'] is True and v['campos1'] == 3 and v['salvou'] == [['TESTKEY123', 'SECONDKEY456', 'THIRDKEY789'], 'TESTKEY123'] and v['rotulo'] == 1 and v['teste'] == [2, True] and v['campos2'] == 2 and v['depois'] == ['TESTKEY123', 'SECONDKEY456'],
            'dg_sem_conversa': lambda v: v['bolinha'] is True and v['skips'] >= 5 and v['todosSemConversa'] is True and v['avisoFalso'] == [],
            'dg_com_conversa': lambda v: v['semBolinha'] is True and len(v['selo']) == 1 and v['selo'][0][0] == 'diag ok' and 'px' in v['selo'][0][1],
            'dg_grade': lambda v: v['tiles'] < 13 and len(v['linha']) == 1 and 'função(ões) funcionando' in v['linha'][0],
            'ac_convite_ruim': lambda v: v == {'texto': True, 'outro_servidor': True, 'codigo_errado': True, 'chamadas': ['CODIGOERRADO1234567']},
            'ac_conectou': lambda v: v == {'codigo': True, 'perfil': 'Com robô', 'saude': True, 'vagas': True, 'pedidos': False},
            'ac_saude': lambda v: v == {'enviou': True, 'campos': ['autoteste', 'ia', 'robo', 'tempos', 'v', 'wa'], 'sem_arroba_nem_nome': True},
            'ac_tela': lambda v: v == {'lab': False, 'frete': [True, True], 'vagas': False, 'cartao': True, 'mais_chave': False}, 'ac_padrao_uma_vez': lambda v: v is True,
            'ac_diag': lambda v: v == {'lab': False, 'avancado': False}, 'ac_audio_some': lambda v: v is False,
            'ac_robo_limitado': lambda v: v == {'enviou': 0, 'sugestoes': ['responder'], 'salvo': 'automatico', 'botao_automatico_travado': True},
            'ac_aviso': lambda v: v is True, 'ac_emergencia': lambda v: v == {'banner': True, 'enviou': 0, 'sugestoes': 0},
            'ac_desativado': lambda v: v == {'banner': True, 'respostas_na_barra': 0, 'config_abre': True}, 'ac_reativado': lambda v: v == 1,
            'ac_offline': lambda v: v == {'erro': True, 'config_mantida': True, 'lab_continua_bloqueado': True}, 'ac_expirou': lambda v: v == {'banner': True, 'sugestoes': 0}, 'ac_voltou': lambda v: v is True,
            'rcp_desligado': lambda v: v == {'ponte': None, 'opcao_visivel': True, 'ligou': {'grupos': True, 'midia': False, 'maxBytes': 3000000}, 'nada_guardado_antes': True},
            'cc_comecar': lambda v: v == {'aparece': True, 'titulo': True, 'pendentes': True, 'cartoes_da_tela': True, 'some': True, 'guardou': True},
            'ie_envios': lambda v: v == {'tem_resumo': True, 'mascarado': True, 'sem_chave': True, 'limpou': True},
            'va_auto': lambda v: v == {'rodou': True, 'guardou': True, 'numero_na_aba': True, 'numero_no_icone': True},
            'bk_seguro': lambda v: v == {'nasce_desmarcado': True, 'sem_banco_por_padrao': True, 'banco_quando_marca': True, 'sem_identificacao': True, 'configs_novas': True, 'texto': True},
            'dg_mapa_extras': lambda v: v == {'chaves': True, 'primeira_leitura': True, 'entrega_view_once': True, 'ambiente': True},
            'dg_pacote': lambda v: v == {'arquivos': ['LEIAME.txt', 'ambiente.json', 'erros.json', 'estrutura.json', 'ia.json', 'mapa.json', 'ponte.json', 'relatorio.html'], 'abre': True, 'json_ok': True, 'sem_dado_pessoal': True, 'leiame': True, 'ponte': True, 'mudancas': True, 'ia': True, 'relatorio': True},
            'rsu_resumo': lambda v: v == {'ordem': ['🔴 Carlos Frete', '🟡 Seu Joaquim', '⚪ Dona Rita'], 'acao': True, 'sem_link': True, 'abrir': 3, 'entrada': True, 'aceite_guardado': True, 'aviso_ia': True},
            'av_avaliacao': lambda v: v == {'resumo': True, 'memoria': True, 'diferente': True, 'sem_resposta': True, 'sem_memoria': True, 'tempo': True, 'planilha': True},
            'tm_memoria': lambda v: v == {'placar': True, 'ok': True, 'falhou': True, 'nada_enviado': True},
            'lg_liga': lambda v: v == {'opcao': True, 'nasce_desligada': True, 'ponte': False, 'ligou': True, 'ponte_ligada': True, 'espera': 15},
            'lg_resposta': lambda v: v == {'esperou': True, 'enviou_uma': True, 'nao_a_quem_ja_falei_nem_grupo': True, 'nao_repete': True, 'contou': True, 'motivo': True, 'tela': True},
            'ct_aparelho': lambda v: v == {'provavel': True, 'confianca': True, 'contagem': True, 'limite': True},
            'es_desligado': lambda v: v == {'opcao': True, 'nasce_desligada': True, 'banco_vazio': True, 'aprovacao_nasce_manual': True},
            'es_banco': lambda v: v == {'n': 4, 'sem_telefone': True, 'sem_robo': True, 'sem_trivial': True, 'sem_preco': True, 'domingos_juntados': True, 'leu': True}, 'es_idempotente': lambda v: v == {'n': 4, 'novos': 0, 'domingos_n': [3]},
            'es_script_antigo': lambda v: v == {'enviadas': 0, 'aviso': True, 'fila': 0}, 'es_script_novo': lambda v: v == {'enviadas': 4, 'aviso_sumiu': True, 'marcadas': True},
            'es_manual': lambda v: v == {'propostas': [('faq', 'conversas'), ('faq', 'conversas'), ('vocab', 'conversas')], 'sem_preco_nem_link': True, 'nada_aprovado': True, 'entrada': True, 'prova_na_tela': True, 'chamadas': 1},
            'es_origem_na_tela': lambda v: v is True,
            'es_automatica': lambda v: v == {'sozinha': [('faq', 'Vocês carregam aos domingos?')], 'fonte_e_prova': True, 'ficou_para_voce': [('faq', 'Aceitam carg'), ('vocab', 'LS significa')], 'motivo_graos': True, 'contador_do_dia': 1, 'marcado_na_memoria': True},
            'es_desfazer': lambda v: v == {'memoria': True, 'contou': True}, 'es_trava': lambda v: v == {'voltou_manual': True, 'avisou': True}, 'es_esquecer': lambda v: v == {'banco': [], 'vistos': []},
            'ex_zip': lambda v: v == {'arquivo': 'AtendeZap - Ana Maria - 2026-10-21 18h00 a 2026-10-21 19h30.zip', 'abre': True, 'nomes': ['conversa.csv', 'conversa.txt', 'midia/0001_IMG_20261021_180540.jpg', 'midia/0002_AUD_20261021_184000.ogg', 'midia/0003_Canhoto 123.pdf', 'relatorio.txt'], 'painel': True},
            'ex_texto': lambda v: v['qtd'] == 8 and v['primeira'] == '[21/10/2026 18:00:00] Zé Motorista: Bom dia, tem carga para BH?' and v['ultima'].endswith('ainda dentro (19:30:20)') and all(v[k] for k in ['fora', 'apagada', 'anexo', 'unica', 'cabecalho']),
            'ex_csv': lambda v: v == {'bom': True, 'linhas': 9, 'cab': 'data;hora;remetente;tipo;texto;arquivo', 'aspas': True}, 'ex_relatorio': lambda v: v == {'midias': True, 'sem_falhas': True},
            'ex_falha': lambda v: v == {'sem_midia': True, 'relatorio': True, 'texto_igual': True, 'painel': True}, 'ex_vazio': lambda v: v == {'aviso': True},
            'rcp_botao': lambda v: v == {'ver': True, 'badge_antes': '1', 'abriu': True, 'badge_depois': None},
            'rcp_texto': lambda v: v == {'n': 1, 'contato': True, 'texto': True, 'aviso': True},
            'rcp_foto': lambda v: v == {'n': 2, 'miniatura': True, 'legenda': True}, 'rcp_indisponivel': lambda v: v == {'n': 3, 'aviso': True},
            'rcp_grupos': lambda v: v == {'entrou': True, 'depois_de_desligar': True, 'ponte_grupos': False},
            'rcp_audio': lambda v: v == {'ponte_midia': True, 'tocavel': True}, 'rcp_esquecer': lambda v: v == {'uma': True, 'tudo': True, 'desligou_ponte': True},
            'ap_lista': lambda v: v == {'n': 3, 'ordem': ['Bom dia, tudo b', 'Foto do canhoto', 'Preço 4200 para'], 'fora_do_prazo': [False, False, True], 'sem_cliente_nem_apagadas': True},
            'ap_apagou': lambda v: v == {'resultado': True, 'ids': ['true_A', 'true_B'], 'paraTodos': True, 'restam': ['Foto do canhoto']},
            'ap_recusa': lambda v: v == {'explica': True, 'tentou': 1, 'continua_na_lista': 1},
            'ac_pc_recusado': lambda v: v == {'gravou': False, 'login': True, 'mandou_inst': True, 'mandou_maquina': True, 'conectar': True, 'inst_guardado': True},
            'ac_pc_cartao': lambda v: v == {'conectou': True, 'pcs': True, 'maquina': True, 'aviso_padrao': True},
            'ac_pc_desconectado': lambda v: v == {'banner': True, 'motivo': True, 'respostas_na_barra': 0},
            'ac_pc_volta': lambda v: v == {'conectou': True, 'conectar': True, 'respostas_na_barra': 1, 'mantem_escolha': True, 'sem_novo_aviso': True},
            'ac_todos_config': lambda v: v == {'cartoes': ['Posição do painel', 'Acesso da equipe', 'Assistente de IA (Gemini)', 'Partes do painel'], 'abas': [], 'mais_chave': True},
            'ac_todos_barra': lambda v: v == {'icones': ['Atendimento', 'Grupos', 'Ferramentas', 'Privacidade', 'Diagnóstico', 'Configurações'], 'abas': {'Atendimento': ['Respostas', 'Aguardando', 'Assinatura', 'Atendente IA', 'Memória IA', 'Lista de frete', 'Resumo 🧪'], 'Grupos': ['Pedidos', 'Conjuntos', 'Ajustes'], 'Ferramentas': ['Iniciar conversa', 'Enviar para vários', 'Fixadas', 'Contato 🧪', 'Exportar 🧪', 'Backup'], 'Privacidade': ['Ocultas', 'Apagar 🧪', 'Recuperar 🧪'], 'Diagnóstico': ['Saúde', 'Limites', 'Avaliação 🧪', 'Envios à IA', 'Laboratório 🧪'], 'Configurações': []}, 'cartoes': {'Ajustes dos grupos': ['Vagas nos grupos', 'Grupos só na aba Grupos'], 'Lista de frete': ['Lista de frete (planilha Google)'], 'Limites': ['Limites do WhatsApp']}},
            'ac_todos_diag': lambda v: v == {'laboratorio': True, 'avancado': True}, 'ac_todos_robo': lambda v: v == {'audio': True, 'automatico_livre': True},
            'ac_vazio_tela': lambda v: v == {'cartoes': ['Acesso da equipe'], 'sem_diag_nem_backup': True, 'aberto': True, 'aviso': True, 'respostas_na_barra': 0, 'config_na_barra': 1},
            'ac_vazio_libera': lambda v: v == {'cartoes': ['Posição do painel', 'Acesso da equipe'], 'respostas_na_barra': 1, 'aviso_sumiu': True},
            'ac_vazio_robo': lambda v: v == {'enviou': 0, 'sugestoes': ['responder'], 'salvo': 'automatico'},
            'ac_login_tela': lambda v: v == {'cartoes': ['Acesso da equipe'], 'sem_diag_nem_backup': True, 'aberto': True, 'respostas_na_barra': 0, 'config_na_barra': 1},
            'ac_login_robo': lambda v: v == {'enviou': 0, 'sugestoes': 0},
            'ac_login_entrou': lambda v: v == {'mais_de_um_cartao': True, 'respostas_na_barra': 1},
            'ac_login_sair': lambda v: v == {'cartoes': ['Acesso da equipe'], 'aberto': True, 'cfg_vazia': True, 'respostas_na_barra': 0},
            'ac_desconectou': lambda v: v == {'cfg': True, 'lab_voltou': True, 'cartao_de_convite': 1},
            'ia_limite': lambda v: bool(v) and 'Limite de 1' in v, 'ia_sem_chave': lambda v: bool(v) and 'Falta a chave' in v,
            'errors': lambda v: v == [],
        }
        res['_regressoes'] = [k for k, f in esperado.items() if not f(res.get(k))]
        if 'Vagas nos grupos' in json.dumps(res.get('alerta'), ensure_ascii=False): res['_regressoes'].append('alerta cita Vagas nos grupos')
        print(json.dumps(res, indent=1, ensure_ascii=False))
        if res['_regressoes']: raise SystemExit(2)
        await ctx.close()
asyncio.run(main())
