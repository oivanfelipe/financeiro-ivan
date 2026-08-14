# Orçamento Ivan

App de lançamento de gastos ligado à planilha **Orçamento Ivan Felipe - App**.

- `index.html` — o app (página única, sem build, servida pelo GitHub Pages)
- `apps-script/Codigo.gs` — o backend que lê e escreve na planilha
- `apps-script/README.md` — **como publicar o backend** e limpar a planilha
- `index_v1..v6.html` — versões antigas, mantidas só como histórico

> ⚠️ Depois de subir este código, o backend **precisa ser republicado** —
> veja [`apps-script/README.md`](./apps-script/README.md). Sem isso o app mostra
> uma tarja amarela e continua com o comportamento antigo.

---

## Estrutura da planilha

Cada aba é um mês (`8 - Agosto`, `9 - Setembro`, ...) com o mesmo cabeçalho:

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| Detalhes da despesa | Data | Categoria | **Orçamento** | **Custo** | Data da transação | Observações |

- **Orçamento (D)** é o previsto do mês. O app **nunca escreve nessa coluna**.
- **Custo (E)** é o realizado. É a única coluna que recebe lançamento.

---

## O que foi corrigido

### 1. Lançamento sobrescrevia em vez de somar

Cada gasto substituía o valor da célula. Gastou R$ 145 no mercado e depois mais
R$ 232,50? A planilha ficava com R$ 232,50, não com R$ 377,50.

Agora `lancarCusto_` lê o valor atual e grava `atual + novo`. O app mostra a
conta explícita no aviso de confirmação — `R$ 145,00 + R$ 232,50 = R$ 377,50` —
e, antes de salvar, já exibe em quanto a célula vai ficar.

Existe um modo **Substituir** ao lado, para quando o objetivo for corrigir um
lançamento errado. Ele é escolha consciente, nunca o padrão.

### 2. Gravação na coluna errada

Alguns itens caíam com a **categoria na coluna B** (Data) e o **valor na coluna
D (Orçamento)**, inflando o previsto do mês. Na aba de Agosto isso pegou
"Almoço Mexicano", "Transferência carro" e "crédito vivo".

Agora as colunas são descobertas pelo **cabeçalho** da aba, não por posição
fixa, e há uma trava (`gravarCusto_`) que impede fisicamente um gasto de ser
gravado na coluna de Orçamento. A inserção de item novo monta a linha inteira de
uma vez, com cada campo na sua coluna.

Para limpar as linhas já bagunçadas existe a função `corrigirPlanilha()` —
instruções em [`apps-script/README.md`](./apps-script/README.md).

### 3. O app abria no mês errado

O mês inicial era `abas[abas.length - 1]`, ou seja, sempre a **última aba**
(Dezembro). Foi o que deixou datas de transação de agosto na aba de dezembro.
Agora o mês corrente é resolvido pelo nome/número da aba, no backend e no front.

### 4. Itens e valores estavam chumbados no HTML

O `index.html` trazia uma cópia congelada da planilha de agosto: números de
linha, nomes e orçamentos escritos à mão. Qualquer linha inserida ou reordenada
na planilha fazia o app escrever no item errado — e os valores exibidos já
estavam desatualizados (Google One aparecia como R$ 12,50 contra R$ 25,00 na
planilha; "Imposto nota" contra "Imposto nota + INSS").

Agora tudo — categorias, itens, orçamentos, vencimentos — é lido da aba
selecionada. Ao gravar, o app manda a linha **e** o nome; o backend confere se
batem e, se a planilha mudou no meio do caminho, procura pelo nome.

### 5. Gravação era cega

As escritas iam por um `<iframe>` escondido e o app **nunca lia a resposta** —
ele mostrava "✓ Salvo!" mesmo quando a planilha recusava. Foi por isso que a
gravação na coluna errada passou tanto tempo despercebida.

Agora toda escrita passa por JSONP e espera a confirmação real, com o valor final
da célula. Erro vira aviso vermelho, não falso positivo.

### 6. Contas eram uma lista fixa de 10 itens

A aba "Contas" tinha 10 contas com dia de vencimento escritos no código, e
"pago" era um estado que só existia na memória do navegador. Agora a lista sai
da coluna **Data** da própria aba (dia do mês ou `AUTOMÁTICO`) e o status vem do
Custo já lançado, com estado **Parcial** para pagamento incompleto.

### 7. Uma falha derrubava o app inteiro

Se o Chart.js do CDN não carregasse, a exceção subia e as **três abas** exibiam
"não foi possível carregar os dados", mesmo com os dados já em mãos. Cada aba
agora é renderizada isoladamente e o gráfico é opcional.

### 8. Orçamentos divergentes entre meses

Dois itens tinham previsto inconsistente de um mês para o outro. Confirmados com
o Ivan e acertados por `ajustarValores()`:

| Item | Onde | De | Para | Por quê |
|------|------|-----|------|---------|
| Google One | Setembro | R$ 12,50 | R$ 25,00 | Agosto foi pago a R$ 25,00; 12,50 era o preço antigo |
| Imposto nota → **+ INSS** | Setembro a Dezembro | R$ 618,00 | R$ 788,00 | o INSS (R$ 170,00) continua devido e se perdeu ao copiar o mês |

---

## Testes

```bash
node apps-script/testes/teste-backend.js    # 67 checagens da lógica do Codigo.gs
node apps-script/testes/teste-frontend.js   # 26 checagens do index.html no Chromium
```

O teste do backend roda o `Codigo.gs` de verdade contra um mock do
`SpreadsheetApp` carregado com os dados reais da aba de Agosto, incluindo as
linhas quebradas. O do front sobe o `index.html` no Chromium com o Apps Script
simulado e cobre também os cenários de falha (CDN fora do ar, backend antigo).
