# Checklist de teste no WhatsApp DE VERDADE

Tudo o que está marcado 🧪 no painel foi testado só em simulador. Só você confirma no WhatsApp real. Para cada item: **Faça → Esperado → Me mande**. Anote só o que der errado ou estranho; "tudo certo" também me ajuda a tirar o 🧪.

**Antes de começar:** instale a versão nova, recarregue o WhatsApp Web, e em ⚙ Configurações › Acesso da equipe clique em **Atualizar agora**. Se uma aba não aparecer, a parte está bloqueada ou desligada no seu perfil (planilha, coluna Administrador, valor `ligado`) ou desligada em Configurações › Partes do painel.
**Como me mandar o resultado:** um print da tela e, se der erro, o relatório de 🩺 Diagnóstico › Saúde (botão de relatório). Não precisa explicar muito.

## 🔒 Privacidade
1. **Apagar para todos, a qualquer tempo** — Privacidade › Apagar. *Faça:* abra uma conversa com alguém de confiança, mande 2 mensagens de teste, espere 1 minuto. Em Apagar, carregue as mensagens, marque as de teste e apague. Depois repita com **uma mensagem sua com mais de 2 dias**, sem importância. *Esperado:* as recentes somem para os dois lados. *Me mande:* se a antiga também sumiu ou se apareceu "o WhatsApp não confirmou" (é isso que preciso saber).
2. **Recuperar apagadas** — Privacidade › Recuperar. *Faça:* ligue a opção (aceite o aviso). Peça a um amigo para mandar e depois apagar para todos: um texto, uma foto e um áudio. *Esperado:* aparece o aviso "… apagou uma mensagem" com o botão **Ver**; o texto vem inteiro; a foto vem pelo menos como miniatura. *Me mande:* se a foto e o áudio vieram inteiros (marque "Tentar guardar também fotos e áudios") ou só a miniatura.

## 🧰 Ferramentas
3. **Exportar conversa** — Ferramentas › Exportar. *Faça:* escolha uma conversa com mídia, período de 1 a 2 horas do dia de hoje e exporte com mídia. Abra o .zip. *Esperado:* `conversa.txt`, `conversa.csv`, `relatorio.txt` e a pasta `midia/` com os arquivos. *Me mande:* o `relatorio.txt` e se as horas batem com o que você vê no WhatsApp. Depois tente um período de **3 dias atrás**: o relatório diz até onde o WhatsApp carregou?
4. **Contato / aparelho** — Ferramentas › Contato. *Faça:* abra 3 conversas de pessoas que você sabe o aparelho (um Android, um iPhone e alguém que usa o computador) e clique em "Ver / atualizar o contato aberto". *Esperado:* o aparelho provável certo. *Me mande:* quantos acertou de 3 (é um palpite pelo formato dos ids; preciso saber se ainda vale).

## ⚡ Atendimento
5. **Resumo do que perdi** — Atendimento › Resumo. *Faça:* deixe 3 ou 4 conversas com mensagens não lidas e clique em "Resumir o que perdi". *Esperado:* uma linha por conversa, prioridades coerentes, nenhum link. *Me mande:* se algum resumo estava errado ou inventado.
6. **Ligação → mensagem automática** — Atendimento › Aguardando. *Faça:* ligue (opção "Responder ligações…"), deixe o texto padrão e a espera em 15 s. Peça a um amigo para ligar para você e **não atenda**. *Esperado:* ~15 s depois ele recebe UMA mensagem sua; se ligar de novo na hora, não recebe outra. *Me mande:* se o aviso de ligação chegou (se nada acontecer, é provável que o WhatsApp Web não avise esse evento) e o que ele recebeu. **Teste também** ligando e depois escrevendo você mesmo antes dos 15 s: não deve mandar nada.
7. **Banco de conhecimento** — Atendimento › Memória IA. *Faça:* ligue "Escutar e guardar automaticamente" (aceite), clique **Ler agora**, depois **Consolidar com a IA**. Deixe a aprovação em **manual**. *Esperado:* "N troca(s) no banco", propostas em "Para você decidir" com a prova ("visto X vezes em Y conversas"). *Me mande:* se as propostas fazem sentido e se alguma tem dado que não devia (telefone, preço). Depois de 2 ou 3 dias de uso, se confiar, teste a aprovação **automática**.
8. **Testar a memória** — Atendimento › Atendente IA › Treino › Treinar conversando › "Testar a memória". *Esperado:* ✅ nas perguntas que o robô responde como a memória diz. *Me mande:* os ❌ e o que o robô respondeu.
9. **Transcrição de áudio do robô** — Atendente IA › Ajustes (botão de testar áudio). *Faça:* mande um áudio curto para o seu número com o robô em modo "sugerir". *Me mande:* o texto que apareceu.

## 🩺 Diagnóstico
10. **Avaliação** — Diagnóstico › Avaliação. *Faça:* avalie "Últimos 7 dias" (precisa de pelo menos uma pergunta e resposta aprovada na memória para comparar). *Me mande:* se os casos "diferentes da memória" e "sem resposta" realmente existem nas conversas citadas (abra com o botão).
11. **Laboratório** — Diagnóstico › Laboratório. Só se você quiser experimentar: ligue **uma** chave por vez, recarregue o WhatsApp e marque ✓ Apareceu ou ✕ Não apareceu. Se algo travar, "Voltar ao normal".

## Pendências de funções que já existem
12. **Grupos só na aba Grupos / Mostrar contato** — o filtro some com os grupos da aba Tudo; "Mostrar contato" não deve fazê-los reaparecer; "Encaminhar" ainda deve mostrá-los. *Me mande:* se continua certo ou se algum grupo pisca.
13. **Robô com modelo reserva e chaves em projetos diferentes** — só se você usa. *Me mande:* o relatório depois de um dia de uso.
