# AtendeZap — mapa de funções (v1.39, organizado por ASSUNTO)

Regra: **cada opção mora onde se trata do seu assunto.** Grupo está em Grupos, privacidade em Privacidade, ferramenta em Ferramentas, diagnóstico em Diagnóstico.
O que ainda não foi confirmado no WhatsApp de verdade leva a etiqueta **🧪** (na aba e em "Partes do painel"). Função nova NASCE com 🧪 e só perde a etiqueta quando o Johon confirma no WhatsApp real.

## A barra (6 ícones) e o que tem em cada um
| Ícone | Assunto | Abas |
|---|---|---|
| ⚡ **Atendimento** | responder clientes | Respostas · Aguardando · Assinatura · Atendente IA · Memória IA · Lista de frete · Resumo 🧪 |
| 👥 **Grupos** | tudo de grupos | Pedidos · Conjuntos · Ajustes (vagas e "só na aba Grupos") |
| 🧰 **Ferramentas** | ações e utilitários | Iniciar conversa · Enviar para vários · Fixadas · Contato 🧪 · Exportar 🧪 · Backup |
| 🔒 **Privacidade** | o que aparece e o que some | Ocultas · Apagar 🧪 · Recuperar 🧪 |
| 🩺 **Diagnóstico** | saúde e análise | Saúde · Limites do WhatsApp · Avaliação 🧪 · Envios à IA · Laboratório 🧪 |
| ⚙ **Configurações** | a conta e o painel | Geral: Acesso da equipe, Posição do painel, Assistente de IA (chave), Partes do painel |

A aba **Ajustes** de Grupos, a **Lista de frete** e **Limites** moravam em Configurações; foram para o seu assunto. As chaves da planilha continuam as mesmas (`vagas`, `gruposSo`, `cargas`, `cfgLimites`).

## Inventário (recurso = a linha da aba Perfis da planilha)
Grau: ✅ confirmada no seu WhatsApp (autoteste ✔ real e/ou uso real) · 🟡 confirmada pelos testes, sem relato recente seu · 🧪 em teste (falta confirmar no WhatsApp real).
| Função | Onde | Recurso | Grau |
|---|---|---|---|
| Respostas rápidas | Atendimento › Respostas | `replies` | ✅ |
| Aguardando resposta | Atendimento › Aguardando | `fila` | 🟡 |
| Assinatura | Atendimento › Assinatura | `sig` | ✅ |
| Atendente IA (robô) | Atendimento › Atendente IA / Memória IA | `atendente` | ✅ (pendentes dentro dele: trava de robô único, modelo reserva, chaves em projetos diferentes) |
| Transcrição de áudios | Atendente IA › Ajustes | `iaAudio` | 🧪 |
| Lista de frete | Atendimento › Lista de frete | `cargas` | ✅ |
| Pedidos de grupos / Conjuntos | Grupos › Pedidos / Conjuntos | `pedidos` | ✅ |
| Vagas nos grupos | Grupos › Ajustes | `vagas` | ✅ |
| Grupos só na aba Grupos | Grupos › Ajustes | `gruposSo` | ✅ (correção do "Mostrar contato" aguarda o seu retorno) |
| Iniciar conversa | Ferramentas › Iniciar conversa | `start` | ✅ |
| Enviar para vários (+ Status) | Ferramentas › Enviar para vários | `lote` | ✅ |
| Fixadas | Ferramentas › Fixadas | `pins` | ✅ |
| Exportar conversa (texto, planilha e mídia de um período) | Ferramentas › Exportar | `exportar` | 🧪 |
| Contato do cliente + aparelho provável (Android/iPhone/Web) | Ferramentas › Contato | `contato` | 🧪 (é um palpite pelo formato dos ids) |
| Escuta automática + banco de conhecimento + aprovação automática com prova | Atendimento › Memória IA | `escuta` | 🧪 |
| Resumo do que perdi (IA resume as não lidas) | Atendimento › Resumo | `resumo` | 🧪 |
| Ligação não atendida → mensagem automática | Atendimento › Aguardando (card) | `ligacao` | 🧪 (não sei se o WhatsApp Web avisa a ligação) |
| Avaliação do atendimento contra a memória (sem IA) | Diagnóstico › Avaliação | `avaliacao` | 🧪 |
| Envios à IA (o que foi mandado ao Google, já mascarado, só na memória da página; com tempo e erro de cada envio) | Diagnóstico › Envios à IA | *(vem com `diag`)* | ✅ regra simples |
| Pacote de diagnóstico .zip (relatório, mapa e o que mudou, estrutura, ambiente, erros, chamadas, IA) | Diagnóstico › Saúde › Avançado | `diagAvancado` | ✅ |
| Começar aqui (primeira configuração guiada) | Configurações › Geral (cartão no topo) | *(sempre)* | ✅ |
| Testar a memória (o robô responde as perguntas que aprendeu?) | Atendente IA › Treino | *(parte do `atendente`)* | 🧪 |
| Backup | Ferramentas › Backup | `backup` | 🟡 |
| Ocultas | Privacidade › Ocultas | `ocultas` | 🟡 |
| Apagar para todos, a qualquer tempo | Privacidade › Apagar | `apagar` | 🧪 (falta saber se o servidor aceita as antigas) |
| Recuperar apagadas | Privacidade › Recuperar | `recuperar` | 🧪 (falta o teste com um contato apagando) |
| Diagnóstico (+ relatório, arquivos de suporte) | Diagnóstico › Saúde | `diag` (+ `diagAvancado`) | ✅ |
| Limites do WhatsApp | Diagnóstico › Limites | `cfgLimites` | ✅ |
| Laboratório (chaves escondidas) | Diagnóstico › Laboratório | `lab` | 🧪 (1 recurso testado: "1 apareceu, 0 não") |
| Acesso da equipe | Configurações › Geral | *(sempre aparece)* | ✅ |
| Posição · Assistente de IA (chave) · Partes do painel | Configurações › Geral | `cfgPosicao` · `cfgIA` · `cfgPartes` | ✅ |

## Ainda NÃO existem (nascem com 🧪 quando forem feitas)
Alerta de contato online · quadro Kanban leve · mensagens agendadas.

## Como TIRAR o 🧪 de uma função (quando o Johon confirmar)
1. `content/main.js`: apague o `, 'teste'` da linha da função em `MODULOS`.
2. `planilha/AdminControle.gs`: apague o `[Em teste] ` da descrição em `ADM_RECURSOS`.
3. Rode `node test/util.test.js`, `node test/admin.test.js` e o smoke completo.

## Como ADICIONAR uma função nova
1. Escolha o assunto (ícone) e a aba: `HUBS` e `HUB_DE` em `content/main.js`.
2. Crie o recurso: `AZACESSO.MODULOS`/`RECURSOS` (`lib/acesso.js`), `MODULOS` (com `'teste'`), `ADM_RECURSOS` e o bloco do assunto em `ADM_GRUPOS`.
3. Rode os testes (eles conferem que painel e planilha têm a mesma lista).

## Para confirmar cada 🧪 no WhatsApp real: veja `docs/TESTE-REAL.md`.
