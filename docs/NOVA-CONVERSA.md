# Como continuar o AtendeZap em outra conversa ou com outra IA

Guia para o **Johon**. Serve quando a conversa ficar longa demais, quando você trocar de conversa, ou quando quiser testar outra IA.

## 1) Guarde estes 4 arquivos (sempre a última versão que eu te entreguei)
| Arquivo | Para quê |
|---|---|
| `atendezap.zip` | a extensão inteira, com os testes e toda a documentação (`docs/`) |
| `AtendeZap.gs` | script da planilha de frete/IA (versão 5) |
| `AdminControle.gs` | script da planilha do Painel Administrador |
| `SKILL.md` | a passagem de bastão: estado, regras, como testar e entregar (é o mesmo que `docs/SKILL.md` dentro do zip) |

Sem o zip a IA nova **não deve** reescrever a extensão de memória: peça sempre o zip primeiro.

## 2) Em uma conversa nova do MESMO projeto (Claude)
A skill `atendezap-extensao-whatsapp` carrega sozinha. Anexe o zip e os dois `.gs` e cole o texto do item 4.

## 3) Em OUTRA IA
Anexe os 4 arquivos e cole o texto do item 4. **Ela precisa conseguir executar código** (Node e Python com Playwright) para rodar os testes. Se ela só conversa, ela poderá ler e propor código, mas **você** teria de rodar os testes (comandos em `tools/teste/README.md`) e colar o resultado, e o risco de erro é maior.

## 4) Texto para colar na primeira mensagem
```
Você vai continuar o desenvolvimento do AtendeZap, extensão de WhatsApp Web que uso para atender clientes de frete.
Anexei: atendezap.zip (versão mais recente), AtendeZap.gs, AdminControle.gs e SKILL.md.

Faça nesta ordem, sem pular:
1. Leia o SKILL.md inteiro.
2. Descompacte o zip e rode os testes rápidos (comandos no item 2 do SKILL.md). Me diga o resultado.
3. Leia docs/FUNCOES.md e docs/TESTE-REAL.md.
4. Só então atenda ao meu pedido: [ESCREVA AQUI O QUE VOCÊ QUER].

Regras: responda em português do Brasil, em linguagem simples (não sou programador). Não reescreva a extensão de memória.
Não contorne proteções de privacidade do WhatsApp (por exemplo, visualização única). Diga sempre o que foi testado só em simulador
e o que NÃO foi verificado no WhatsApp real. No fim, me devolva os 4 arquivos atualizados (zip, os 2 .gs e o SKILL.md).
```

## 5) Como conferir se a IA nova entendeu (faça 5 perguntas)
1. *"Qual é a versão atual?"* → **1.47.0** (ou a que consta no `manifest.json` do zip).
2. *"Quantos ícones tem a barra e quais?"* → **6**: Atendimento, Grupos, Ferramentas, Privacidade, Diagnóstico, Configurações.
3. *"O que fazer com visualização única?"* → **não contornar**: o aviso é regra do WhatsApp; só diagnosticar e, se quiser, avisar e pedir o reenvio normal.
4. *"Como rodar os testes e o que significa 🧪?"* → comandos do item 2 do SKILL.md; 🧪 = testado só em simulador.
5. *"Quantos arquivos tem o zip e quantas verificações passaram?"* → **52 arquivos**; **335** verificações de ponta a ponta (sem regressão), mais os 3 testes rápidos passando.

## 6) O que NÃO passa de uma conversa para outra
- **A memória da conversa.** Tudo o que importa está nos arquivos acima.
- **O que você testou no WhatsApp de verdade.** Conte à IA nova o que já confirmou e o que não (a lista está em `docs/TESTE-REAL.md`).
- **O estado das suas planilhas.** Diga se já colou os `.gs` novos e se terminou a recuperação da aba Perfis.

## 7) Ao terminar cada conversa
Peça: *"atualize o SKILL.md e me devolva os 4 arquivos"*. Assim o próximo começa já no ponto certo.
