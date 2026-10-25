# Roteiro de desenvolvimento (atualizado na v1.47)

| # | Item | Estado |
|---|---|---|
| 1 | Checklist de teste real das funções 🧪 | ✅ `docs/TESTE-REAL.md` — **depende do Johon testar no WhatsApp real e mandar o resultado** |
| 2 | Testes de conversa (robô × memória) | ✅ Atendente IA › Treino › "Testar a memória" 🧪 |
| 3 | Avaliação do atendimento contra a memória | ✅ Diagnóstico › Avaliação 🧪 (sem IA, sem nota); aba `IA - Avaliação` na planilha (script v5) |
| 4 | Resumir o que perdi | ✅ Atendimento › Resumo 🧪 |
| 5 | Dívida técnica | ⚠ PARCIAL: scripts de teste guardados em `tools/teste/` (README com as armadilhas), mapa do `main.js` em `docs/ARQUITETURA.md` (`python3 tools/mapa_main.py`). **Não dividi o `main.js`** (4.800+ linhas, um bloco só): risco alto, valor baixo sem teste no WhatsApp real. O teste completo continua levando ~20 min (tem muita espera fixa): use o teste reduzido (`tools/teste/README.md`). |
| 6 | Ligação perdida → resposta automática | ✅ construída 🧪 (Atendimento › Aguardando). **Não sei se o WhatsApp Web avisa a ligação:** só o teste real responde (item 6 do checklist) |

## O que NÃO dá para eu fazer sozinha (e o que destrava)
- Confirmar nada no WhatsApp de verdade → o Johon segue `docs/TESTE-REAL.md`.
- Instalar a extensão e colar os 3 scripts (AtendeZap.gs v5, AdminControle.gs) nas planilhas.

## Próximas ideias (depois do teste real)
1. Tirar o 🧪 do que o Johon confirmar (passo a passo em `docs/FUNCOES.md`).
2. Se a ligação não chegar: tirar `ligacao` ou trocar por outra abordagem.
3. Avaliação com IA (opcional): julgar a QUALIDADE das respostas além de bater/não bater com a memória (só se o Johon quiser; gasta cota da chave).
4. Alerta de contato online · quadro Kanban leve · mensagens agendadas.
5. Acelerar o teste completo (trocar esperas fixas por esperas por condição) — só com calma, para não criar testes instáveis.

## v1.45–v1.47 (feito)
Backup seguro · Envios à IA · avaliação automática · Começar aqui · sonda de visualização única · auditoria geral (docs/AUDITORIA.md) · LEIAME separado do histórico · diagnóstico ampliado (pacote .zip, diferença entre mapas, ambiente, ponte, IA, entrega de visualização única).
