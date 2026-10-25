# Auditoria do código (v1.47)

Feita com `tools/auditoria.py` (automática, repetível) + checagens à mão. Para repetir: `python3 tools/auditoria.py`.

## Resultado por área
| Área | O que foi checado | Resultado |
|---|---|---|
| Sintaxe | todos os `.js`, os 2 `.gs` (copiados como .js), `.py` e `.json` | ✅ sem erro |
| Padrões de risco | `innerHTML`/`outerHTML`/`insertAdjacentHTML`, `eval`, `new Function`, `document.write`, `postMessage('*')`, `console.*`, `debugger`, TODO/FIXME, `http://`, chaves/segredos escritos no código | ✅ nenhum (os 2 `http://` são o endereço do padrão SVG, não é rede) |
| Manifesto | permissões, hosts, CSP, recursos expostos | ✅ mínimo: `storage`, `unlimitedStorage` (respostas com mídia, backups e banco de conhecimento passam de 10 MB), `power` (mantém o computador acordado SÓ com o robô ligado); hosts: Google Apps Script, Gemini e web.whatsapp.com; só `content/ui.css` exposto. **Novo:** `minimum_chrome_version: 100` |
| Código morto | 482 definições de `main.js` + exports das bibliotecas | ✅ nenhuma sem uso (só `ESTADOS`, interno de `lib/acesso.js`) |
| Textos desatualizados | nomes antigos de telas em código e documentos | ✅ 1 no código corrigido ("Atendimento › Lista de frete"); o `LEIAME` (diário de 724 linhas) foi separado em `LEIAME.txt` (guia atual) e `docs/HISTORICO.txt` (diário) |
| URLs externas | tudo o que o código chama | ✅ só Gemini, Apps Script do usuário e WhatsApp, iguais ao manifesto; o `background.js` só busca URLs `https://script.google.com/macros/s/…/exec` |
| Dados pessoais nos arquivos de diagnóstico | varredura de telefones, ids de conversa, e-mails, CPF/CNPJ, chaves de IA, convites de grupo e URLs da planilha em relatório, mapa e estrutura reais | ✅ limpos (os "telefones" achados eram números de versão e horários) |
| Backups | o que vai para o arquivo | ✅ corrigido na v1.45: chave da IA, convite da equipe e identificação do computador nunca saem; banco de conhecimento só se marcado |
| Ponte (página ↔ painel) | quem pode mandar o quê | ✅ métodos que apagam, enviam, leem conversas ou baixam mídia só obedecem ao painel (`SENSIVEIS`); `apagarParaTodos` entrou na v1.42 (estava sem proteção) |

## Limite conhecido (modelo de ameaça)
A chave que o painel manda à ponte viaja por `window.postMessage`, e qualquer script que rode **no mesmo mundo da página** (o próprio WhatsApp ou outra extensão que injete script) consegue ler essas mensagens, e também enxerga `window.WPP` diretamente. Então a chave **evita uso acidental e chamadas de terceiros comuns, mas não é uma barreira contra um script malicioso dentro da própria página**. Isso é uma limitação da arquitetura (o Chrome não oferece canal privado entre o mundo isolado e o mundo da página). Mitigação: instale só extensões de confiança no mesmo perfil do Chrome.

## O que NÃO foi mudado, de propósito
- `content/main.js` (≈4.900 linhas) continua um bloco só: tudo depende das mesmas variáveis e dividir sem testar no WhatsApp real tem risco alto. Há o mapa em `docs/ARQUITETURA.md`.
- `lib/wppconnect-wa.js` é de terceiros (wa-js): não se edita; veja `lib/NOTICE-wa-js.txt`.

## Novidades de diagnóstico (v1.47)
`Diagnóstico › Saúde › Avançado › Gerar pacote de diagnóstico (.zip)` junta relatório, mapa, estrutura, ambiente, erros, chamadas e envios à IA. O mapa agora diz **o que o WhatsApp mudou** desde a leitura anterior e se a **visualização única** chegou como arquivo ou só como aviso. Nada leva mensagens, contatos, convite, chave ou endereço da planilha.
