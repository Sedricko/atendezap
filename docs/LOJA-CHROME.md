# Publicar o AtendeZap na Chrome Web Store (não listada)

Tudo o que a loja pede, já respondido. É só copiar e colar.
Campos marcados com **[VOCÊ]** dependem de você.

---

## 0. Antes de começar (uma vez só)

1. **Conta de desenvolvedor:** entre em https://chrome.google.com/webstore/devconsole com a conta Google que vai ser dona da extensão. Pague a taxa única de **US$ 5** e confirme o e-mail de contato.
2. **Declaração de comerciante (lei da União Europeia):** se for só para a sua equipe e grátis, escolha **"Não sou comerciante"**. **[VOCÊ]** Se a empresa vende a extensão, marque comerciante.
3. **Política de privacidade on-line.** A loja exige um link público.
   - Abra `docs/privacidade.html`.
   - Troque `[SEU E-MAIL DE CONTATO]` pelo seu e-mail.
   - Publique. O jeito mais fácil: Google Docs → cole o texto → **Arquivo › Compartilhar › Publicar na Web** → copie o link. O Google Sites também serve.

## 1. Gerar o pacote

```
tools/loja/empacotar.sh
```
Esse comando roda os testes rápidos e cria `dist/atendezap-loja.zip`. O zip leva só a extensão: o `manifest.json` na raiz e as pastas `content/`, `page/`, `lib/` e `icons/`. Ficam de fora os testes, os documentos e as planilhas.

No painel da loja: **Novo item** → envie o `atendezap-loja.zip`.

---

## 2. Aba "Detalhes do item na loja" (Store listing)

**Título:** vem do manifesto: `AtendeZap - Atendimento para WhatsApp Web`

**Resumo** (vem do manifesto, até 132 caracteres):
> Respostas rápidas com mídia e ações, assinatura automática, iniciar conversa, chats fixados, abas e backup automático.

**Descrição** (cole inteira):
```
AtendeZap é um painel de atendimento para quem atende clientes pelo WhatsApp Web no computador, em muitas conversas e grupos.

O QUE ELE FAZ
• Respostas rápidas: textos, imagens, áudios, documentos e contatos prontos, organizados por categoria. Digite /atalho na conversa e envie.
• Assinatura automática: seu nome no começo das mensagens, se quiser.
• Aguardando resposta: veja quem está esperando você responder e há quanto tempo.
• Iniciar conversa sem salvar o contato e enviar a mesma mensagem para vários contatos com intervalos seguros.
• Conversas fixadas, organização e backup das suas configurações.
• Grupos: aprove pedidos para entrar em vários grupos de uma vez, sem duplicar pessoas entre grupos do mesmo conjunto.
• Atendente IA (opcional): sugere respostas usando a SUA chave da API Google Gemini. Começa em "só sugerir": nada é enviado sem a sua aprovação.
• Acesso da equipe (opcional): o administrador escolhe, numa planilha Google, o que cada pessoa da equipe vê.

PRIVACIDADE
• Sem servidor próprio, sem cadastro, sem anúncios, sem rastreamento.
• Seus dados ficam no seu computador. Só saem para serviços que você mesmo configura: a API Gemini (com a sua chave) e as suas planilhas Google.
• Backups nunca levam a sua chave da IA nem o convite da equipe.

IMPORTANTE
AtendeZap é uma ferramenta independente e não tem nenhuma ligação com o WhatsApp ou a Meta. Use respeitando os Termos de Serviço do WhatsApp: não envie mensagens em massa para quem não pediu.
```

**Categoria:** Produtividade › Comunicação
**Idioma:** Português (Brasil)

**Imagens** (já prontas em `docs/loja/`):

| Campo | Arquivo |
|---|---|
| Ícone da loja (128×128) | `icons/icon128.png` |
| Capturas de tela (1280×800, envie as 5 nesta ordem) | `captura1.png` … `captura5.png` |
| Bloco promocional pequeno (440×280) | `bloco-pequeno-440x280.png` |
| Bloco grande / letreiro | deixe vazio (opcional) |

As capturas vêm do teste automático, numa página que **simula** o WhatsApp. Nenhum dado real aparece.

**Site oficial / Suporte:** pode deixar vazio, ou **[VOCÊ]** colocar o seu e-mail ou site.

---

## 3. Aba "Práticas de privacidade" (Privacy)

**Finalidade única** (Single purpose):
```
Ajudar empresas a atender clientes no WhatsApp Web: um painel lateral com respostas rápidas, assinatura, organização de conversas e grupos e um assistente opcional de IA que sugere respostas.
```

**Justificativa de cada permissão:**

| Permissão | Justificativa (cole) |
|---|---|
| `storage` | Guardar no computador do usuário as respostas rápidas, a assinatura, as categorias e as preferências do painel. |
| `unlimitedStorage` | As respostas rápidas podem ter imagens, áudios e documentos, e o backup local das configurações passa facilmente do limite padrão de 10 MB. |
| `power` | Quando o usuário liga o Atendente IA, impede que o computador entre em suspensão. Assim o assistente continua respondendo. A permissão é solta assim que o assistente é desligado. |
| Permissão de host `web.whatsapp.com` | A extensão funciona só no WhatsApp Web: mostra o painel lateral e lê as conversas abertas no navegador para as funções de atendimento. |
| Permissão de host `script.google.com` e `script.googleusercontent.com` | Conectar às planilhas Google do próprio usuário (Apps Script que ele mesmo publica): lista de cargas, memória do assistente e controle de acesso da equipe. Só endereços https://script.google.com/macros/s/…/exec são aceitos. |
| Permissão de host `generativelanguage.googleapis.com` | Chamar a API Google Gemini com a chave do próprio usuário para sugerir respostas, quando ele ativa o assistente de IA. |

**Código remoto:** **Não, não estou usando código remoto.**
(Todo o JavaScript vai dentro do pacote. A biblioteca `lib/wppconnect-wa.js`, a wa-js 4.7.1 de código aberto, também vai inteira no pacote, com a licença em `lib/NOTICE-wa-js.txt`. A IA devolve só texto, nunca código.)

**Uso de dados.** Marque estes tipos de dados:
- ☑ **Informações de identificação pessoal** (nomes e números dos contatos que aparecem no WhatsApp)
- ☑ **Informações de autenticação** (a chave da API Gemini que o usuário informa)
- ☑ **Comunicações pessoais** (mensagens das conversas)
- ☑ **Conteúdo do site** (textos e mídias exibidos no WhatsApp Web)
- ☐ Informações de saúde, financeiras, de localização, histórico da Web, atividade do usuário: **não marcar**

Marque as três declarações:
- ☑ Não vendo nem transfiro dados de usuários a terceiros, exceto nos casos de uso aprovados.
- ☑ Não uso nem transfiro dados de usuários para fins não relacionados à finalidade única do item.
- ☑ Não uso nem transfiro dados de usuários para determinar crédito ou conceder empréstimos.

**URL da política de privacidade:** **[VOCÊ]** o link publicado no passo 0.3.

---

## 4. Aba "Distribuição"

- **Pagamento:** Gratuito
- **Visibilidade:** **Não listado**. Só quem tiver o link encontra a extensão.
- **Regiões:** Todas as regiões (ou só Brasil)

## 5. Instruções de teste (campo opcional; ajuda o revisor)

```
A extensão funciona em https://web.whatsapp.com e precisa de uma conta do WhatsApp conectada pelo QR code. Depois de entrar, aparece uma barra de ícones no lado direito. Clique no ⚡ (Atendimento) › Respostas para criar uma resposta rápida e, numa conversa, digite /atalho para usá-la. O assistente de IA é opcional e só funciona com uma chave da API Gemini do próprio usuário (Configurações › Assistente de IA). As planilhas também são opcionais. Sem elas, todas as funções locais funcionam.
```

## 6. Enviar

Clique em **Enviar para revisão**. Recomendo marcar **"Publicar manualmente depois da aprovação"** (deferred publish): você escolhe a hora em que a versão chega à equipe.

---

## 7. Depois de aprovada: trocar a versão "descompactada" pela da loja

⚠ **A versão da loja é outra extensão para o Chrome**: ela tem outro ID e começa **vazia**. Faça nesta ordem, em cada computador:

1. Na versão antiga: **Ferramentas › Backup › Exportar backup**.
2. Em `chrome://extensions`, **remova** a versão descompactada. Não deixe as duas ligadas juntas: o painel apareceria duas vezes.
3. Instale pelo link da loja.
4. Na versão nova: **Ferramentas › Backup › Restaurar backup** com o arquivo do passo 1.
5. Coloque de novo a **chave do Gemini** e o **convite da equipe**. Por segurança, eles nunca vão no backup.

## 8. Atualizar no futuro

1. Suba a versão no `manifest.json`. Ela tem que ser **sempre maior**: 1.47.1 → 1.47.2 → 1.48.0…
2. Rode `tools/loja/empacotar.sh`.
3. No painel: **Pacote › Enviar novo pacote** → **Enviar para revisão**.
4. Depois de aprovada, a versão chega sozinha aos computadores em algumas horas.
5. Se a versão pedir uma **permissão nova**, o Chrome desativa a extensão até cada pessoa aceitar. Evite.

## 9. Riscos de recusa (honestidade)

- **Nome com "WhatsApp":** o título usa "para WhatsApp Web", que é uso de referência, comum na loja. Mesmo assim, o revisor pode pedir para mudar.
- **"Enviar para vários":** a loja recusa ferramenta de spam. A função tem intervalos e limites, e a descrição pede uso responsável. Se o revisor implicar, a resposta é que a função é para clientes que já falam com a empresa.
- **Recuperar e Apagar mensagens:** ainda estão 🧪 (não testadas no WhatsApp real). Podem gerar pergunta do revisor sobre privacidade.
- **Biblioteca minificada (`wppconnect-wa.js`):** código minificado é permitido, código ofuscado não. Ela é open source (wa-js 4.7.1). Se pedirem, aponte o repositório oficial https://github.com/wppconnect-team/wa-js.
- Se for recusada, a loja manda o motivo por e-mail. Corrija e reenvie, sem custo extra.
