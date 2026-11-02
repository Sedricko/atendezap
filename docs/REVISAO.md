# Revisão completa do AtendeZap (v1.47.3, 02/11/2026) — 23 correções

Feita pelo roteiro "Prompt de revisão completa do app". Regras seguidas: só corrigir defeito real e confirmado no código, sem mudar o que já funciona nem o visual. Tudo está no Git: cada mudança pode ser desfeita.

## Como foi feito
1. **Mapa do projeto:** `docs/ARQUITETURA.md` e `docs/FUNCOES.md` (já existiam e continuam válidos).
2. **Auditoria automática** (`python3 tools/auditoria.py`): sem erro de sintaxe, sem `innerHTML`, `eval`, `console`, segredo no código nem permissão a mais.
3. **Revisão linha a linha em 4 partes:** ponte com o WhatsApp, acesso e planilhas, bibliotecas, painel. Cada achado foi conferido no código antes da correção.
4. **Testes:** os 3 testes rápidos e o teste completo de ponta a ponta (simulador). Cada defeito corrigido ganhou um teste.

## Corrigido

| # | Gravidade | Onde | O que estava errado | O que foi feito |
|---|---|---|---|---|
| 1 | alto | `planilha/AdminControle.gs` | Texto vindo da extensão (resumo de saúde, nome do computador, versão) era gravado na planilha sem proteção e podia virar fórmula. Uma fórmula maliciosa poderia vazar os códigos de convite. | Todo texto vindo de fora passa por `admCel_` (começa com `=`, `+`, `-` ou `@` → vira texto). |
| 2 | alto | `page/bridge.js` | `sendActive` (envia mensagem) e `historicoChat`, `baixarAudio`, `aguardando`, `votosEnquete` (leem conversa ou mídia) obedeciam a pedidos sem a chave do painel. | Entraram em `SENSIVEIS`. |
| 3 | alto | `content/main.js` (robô) | O robô conferia "ligado, sem pausa" só no início. Se você respondesse à mão enquanto a IA pensava (até 1 min), ele enviava mesmo assim. | Reconfere logo antes de enviar e entre uma mensagem e outra. |
| 4 | alto | `content/main.js` (ligação) | A mensagem automática da ligação era vista como "você respondeu" e calava o robô por 2 h naquela conversa. | Marcada como envio automático. |
| 5 | alto | `content/util.js` | A identificação do computador (`instId`) ia no backup completo; restaurar em outro PC fazia os dois contarem como um só. | Entrou na lista do que nunca vai para o backup. |
| 6 | alto | `lib/recuperar.js` | Nome do arquivo e duração do áudio das mensagens recuperadas estavam dentro de um comentário e nunca eram guardados. | Linha corrigida. |
| 7 | alto | `content/ia.js` | Dois telefones seguidos no texto não eram mascarados antes de ir para a IA. | Mascarados. |
| 8 | médio | `content/ia.js` | Celular sem DDD ("99999-0000") não era mascarado. | Mascarado ("1200 reais" continua igual). |
| 9 | médio | `content/main.js` (robô) | A trava de 2 min liberava a conversa com o envio ainda em andamento; podia sair resposta duplicada. | A rodada que travou não envia mais e não solta a trava da rodada nova. |
| 10 | médio | `content/main.js` | Clique duplo em "Enviar" numa sugestão do robô mandava a mensagem duas vezes. | O botão trava no primeiro clique. |
| 11 | médio | `content/main.js` (acesso) | Trocar o convite durante uma consulta: a resposta do convite antigo podia marcar o novo como desativado. | A resposta do convite antigo é descartada; não conecta outro no meio de uma consulta. |
| 12 | médio | `content/main.js` + `lib/acesso.js` | Recusa passageira da planilha (erro no script) renovava a validade offline da configuração antiga, sem prazo. | Só renova quando a planilha confirma; relógio adiantado também não estica a validade. |
| 13 | médio | `planilha/AdminControle.gs` | A espera anti-tentativa (0,4 s) segurava a fila de todos; muitas tentativas com código falso travavam quem tem código certo. | A fila é liberada antes de esperar. |
| 14 | médio | `content/main.js` | A pergunta "enviar o resumo de saúde?" se empilhava uma vez a cada consulta. | Uma pergunta por vez. |
| 15 | médio | `content/main.js` | Dois envios da memória da IA à planilha ao mesmo tempo duplicavam linhas. | Um envio por vez. |
| 16 | médio | `content/util.js` | "(085) 99999-0000" virava número inválido. | O 0 da ligação interurbana sai. |
| 17 | baixo | `content/util.js` | Backup mensal em 31/01 ia para 03/03. | Vai para 28/02. |
| 18 | baixo | `planilha/AdminControle.gs` | Perfil em branco podia pegar uma coluna sem nome da aba Perfis. | Perfil em branco = só o "Acesso da equipe". |
| 19 | baixo | `planilha/AdminControle.gs` | Código de convite só com números (raro) virava número na planilha e parava de funcionar. | Códigos novos começam com letra (os antigos continuam valendo). |
| 20 | baixo | `planilha/AdminControle.gs` | Validade escrita como `2026-12-31`, `31.12.2026` ou `31-12-2026` era ignorada (o convite nunca vencia). | Esses formatos agora valem. Texto que não é data continua sem validade, para não bloquear ninguém por engano. |
| 21 | baixo | `planilha/AdminControle.gs` | `versaoMinima` digitada como `1.40` virava o número 1.4. | A célula passa a ser texto puro ao reabrir a planilha. Se já estiver como 1.4, digite de novo. |
| 22 | baixo | `background.js` | Robô e Resumo usando a IA no mesmo segundo: a contagem de uso perdia um registro. | Lê a contagem de novo na hora de gravar e soma só o que aquela chamada fez. |
| 23 | baixo | `content/main.js` | Restaurar backup em "substituir" apagava as mídias antes de gravar as novas; se a gravação falhasse, elas se perdiam. | Grava primeiro e só depois apaga as antigas; se falhar, avisa e não apaga nada. |


Fica de fora (sem efeito para você): enquanto o WhatsApp carrega, o painel guarda alguns pedidos "está pronto?" que nunca recebem resposta (poucos bytes, somem ao recarregar).

## Interface
A revisão das telas e do CSS não achou elementos cortados ou sobrepostos; o teste completo tira fotos de todas as telas.

## Como testar à mão (depois de atualizar a extensão)
1. ↻ em `chrome://extensions`, F5 no WhatsApp; confira a versão 1.47.3.
2. **Robô:** ligue em "sugerir"; peça para alguém escrever; responda você à mão antes da sugestão aparecer → a sugestão não deve vir. Clique duas vezes rápido em "Enviar" numa sugestão → só uma mensagem sai.
3. **Backup:** faça um backup completo e confira que restaurar em outro computador não "rouba" a vaga do primeiro.
4. **Recuperar apagadas 🧪:** peça para alguém mandar e apagar um PDF → o nome do arquivo aparece.
5. **Planilha do administrador:** cole o `AdminControle.gs` novo no Apps Script e reabra a planilha.
