# Backend — Google Apps Script

O `Codigo.gs` deste diretório é o backend do app. Ele **não roda a partir do
GitHub**: precisa ser colado no editor de Apps Script ligado à planilha.

Era ali que estavam os dois bugs: o lançamento **sobrescrevia** a célula em vez
de somar, e algumas gravações caíam na coluna errada (categoria na **B** em vez
da **C**, valor na **D — Orçamento** em vez da **E — Custo**).

---

## Como publicar (5 minutos)

1. Abra a planilha **Orçamento Ivan Felipe - App**.
2. Menu **Extensões → Apps Script**.
3. Selecione **todo** o conteúdo do arquivo que abrir e apague.
4. Cole o conteúdo inteiro de [`Codigo.gs`](./Codigo.gs).
5. Salve (💾 ou `Ctrl+S`).
6. **Implantar → Gerenciar implantações** → ícone de **lápis** (editar) →
   em **Versão**, escolha **Nova versão** → **Implantar**.

> Use **Gerenciar implantações**, não "Nova implantação". Editando a implantação
> existente a URL `/exec` continua a mesma e o app não precisa de nenhuma
> mudança. Se criar uma implantação nova, a URL muda e é preciso atualizar a
> constante `SCRIPT_URL` no `index.html`.

Para conferir se pegou, abra no navegador:

```
<SUA_URL>/exec?action=ping
```

Deve responder `{"ok":true,"versao":"2026.08-somar", ...}`.

Enquanto a versão publicada não for `2026.08-somar`, o app mostra uma tarja
amarela avisando que o backend está desatualizado — assim nenhum lançamento é
feito às cegas contra o script antigo.

---

## Limpar o estrago do script antigo (opcional, roda uma vez)

No editor do Apps Script, escolha a função no seletor do topo e clique
**Executar**:

1. **`simularCorrecaoPlanilha`** — não altera nada, só lista o que seria
   ajustado. Leia o registro de execução (`Ctrl+Enter`).
2. **`corrigirPlanilha`** — aplica os ajustes listados.

O que ele conserta:

| # | Problema | Correção |
|---|----------|----------|
| 1 | Cabeçalho da coluna B vazio / `Column 7` | Escreve `Data` |
| 2 | Categoria gravada na coluna B | Move para a coluna C e limpa a B |
| 3 | Orçamento (D) que é cópia idêntica do Custo (E) nessas linhas | Limpa a D |
| 4 | Data de transação numa linha sem custo nenhum | Limpa a data |

Nas abas atuais isso pega as linhas **Almoço Mexicano**, **Transferência carro**
e **crédito vivo** (aba de Agosto) e as datas soltas de 09/08 que sobraram na
última aba.

Linhas corretas não são tocadas. Ainda assim, se quiser rede de segurança:
**Arquivo → Criar uma cópia** da planilha antes de rodar.

---

## Contrato da API

Todas as chamadas são `GET` e aceitam `&callback=` para JSONP.

| Ação | Parâmetros | O que faz |
|------|-----------|-----------|
| `getSheets` | — | Lista as abas + qual é a do mês corrente |
| `read` | `sheet` | Devolve as linhas da aba já com números limpos |
| `lancar` | `sheet`, `nome`, `value`, `row`, `date`, `modo` | **Soma** `value` na coluna Custo (`modo=substituir` troca) |
| `inserir` | `sheet`, `nome`, `categoria`, `value`, `date` | Cria linha nova; se o item já existir, soma nele |
| `ping` | — | Versão do backend |

`lancar` devolve `anterior`, `lancado` e `total`, que é o que o app usa para
mostrar a conta "R$ 145,00 + R$ 232,50 = R$ 377,50" no toast.

---

## Testes

```bash
node apps-script/testes/teste-backend.js    # lógica do Codigo.gs (mock do SpreadsheetApp)
node apps-script/testes/teste-frontend.js   # index.html no Chromium (precisa de playwright)
```

O teste do backend roda o `Codigo.gs` de verdade contra uma cópia dos dados
reais da aba de Agosto — inclusive as linhas quebradas — e confere que o
lançamento soma, que a coluna Orçamento nunca é escrita e que o
`corrigirPlanilha` conserta só o que deve.
