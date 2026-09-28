# Esquema de Backend

## Fluxo de autenticação

**Não existe.** O app se conecta ao Supabase com uma chave anônima (`anon key`) pública, hardcoded no `index.html`, sem login, sem sessão, sem distinção de usuário. Todo dado é lido/escrito como se houvesse um único "dono" de todos os registros. Qualquer controle de acesso que exista está apenas no lado do banco (Row Level Security do Supabase), não é visível nem gerenciado pelo frontend.

## Tabelas

### `fin_categories`
| Coluna | Tipo (inferido) | Descrição |
|---|---|---|
| id | uuid/int | Identificador |
| name | text | Nome da categoria |
| emoji | text | Emoji ou string curta usada como ícone visual |
| sort_order | int | Ordem de exibição |

### `fin_payment_methods` (cartões e métodos de pagamento)
| Coluna | Tipo (inferido) | Descrição |
|---|---|---|
| id | uuid/int | Identificador |
| name | text | Nome do cartão/método |
| type | enum text | `credito` \| `debito` \| `pix` \| `dinheiro` |
| billing_day | int | Dia do mês em que a fatura fecha/vence |
| color | text (hex) | Cor de identificação visual |
| active | boolean | Se `false`, some das listas ativas (tratado como `active !== false`) |
| sort_order | int | Ordem de exibição |

### `fin_category_budgets` ("tetos" — limite de gasto por categoria)
| Coluna | Tipo (inferido) | Descrição |
|---|---|---|
| id | uuid/int | Identificador |
| category_id | FK → fin_categories.id | Categoria limitada |
| limit_amount | numeric | Valor do teto mensal |
| month | int, nullable | Se `null`, é o teto padrão/permanente; se preenchido, seria um teto específico daquele mês |
| year | int, nullable | Acompanha `month` |

**Pendência visível:** o app só cria/edita registros com `month = null` (teto padrão). A leitura considera um teto específico do mês se existir, mas **não há tela para criar esse tipo de registro** — esse caminho do schema está morto na prática.

### `fin_commitments` ("contas"/compromissos planejados — tabela base)
| Coluna | Tipo (inferido) | Descrição |
|---|---|---|
| id | uuid/int | Identificador |
| month, year | int | Mês/ano de referência do compromisso |
| name | text | Nome do compromisso |
| category_id | FK → fin_categories.id | Categoria |
| type | enum text | `fixo` \| `pontual` \| `fatura` (ver pendência abaixo sobre `parcelado`) |
| planned_amount | numeric | Valor planejado |
| due_day | int, nullable | Dia de vencimento; `null` = sem vencimento (cobrado direto no cartão, não aparece em "A Pagar") |
| default_payment_method_id | FK → fin_payment_methods.id, nullable | Cartão/método padrão de cobrança |
| recurrence_type | enum text | `automatico` \| `manual` \| `pontual` (padrão `manual` quando nulo) |

**Resolvido:** a tela lia e exibia `installment_current`/`installment_total` para `type === 'parcelado'`, mas nenhuma rotina de escrita jamais gravava `type: 'parcelado'` ou esses dois campos — parcelamentos reais são criados como N linhas separadas com `type: 'pontual'` e nome sufixado `"(i/N)"`. A leitura morta desse caso foi removida do card de conta; a informação de parcela já aparece no nome (ver item 4 do Plano de Implementação).

### `fin_commitment_summary` (view, somente leitura)
Agrega `fin_commitments` + soma de pagamentos + nome da categoria. Campos usados: `id, name, category_id, category_name, planned_amount, due_day, paid, remaining, type`. O app complementa essa view com uma segunda consulta a `fin_commitments` para obter `default_payment_method_id` e `recurrence_type`, que a view não expõe.

### `fin_commitment_payments`
| Coluna | Tipo (inferido) | Descrição |
|---|---|---|
| id | uuid/int | Identificador |
| commitment_id | FK → fin_commitments.id | Compromisso pago |
| amount | numeric | Valor pago (permite pagamento parcial) |
| payment_method_id | FK → fin_payment_methods.id, nullable | Método usado no pagamento |
| note | text, nullable | Observação |
| payment_date | date | Data do pagamento (padrão: hoje) |

Regra: pagar com um método do tipo `credito` também cria automaticamente uma linha em `fin_spending_entries`, para que o valor entre no total da fatura daquele cartão — ou seja, um pagamento vira, ao mesmo tempo, um registro de pagamento **e** um lançamento de gasto.

### `fin_spending_entries` ("gastos" avulsos)
| Coluna | Tipo (inferido) | Descrição |
|---|---|---|
| id | uuid/int | Identificador |
| month, year | int | Mês/ano de referência |
| category_id | FK → fin_categories.id | Categoria |
| payment_method_id | FK → fin_payment_methods.id | Método usado |
| amount | numeric | Valor gasto |
| description | text, nullable | Observação livre |
| spend_date | date | Data do gasto |
| subcategory | text, nullable | Rótulo livre de subcategoria, usado também como sugestão de autocomplete |

**Parcialmente resolvido:** a opção "Parcelado?" na tela de Gastos **não grava nesta tabela** — ela cria N linhas em `fin_commitments` (mesmo mecanismo do parcelamento do Planejamento). Isso continua assim (é a arquitetura de dados, não muda). O que era uma pendência — o Planejamento repetir o valor cheio em cada parcela em vez de dividir — foi corrigido: as duas telas agora dividem o valor total pelo número de parcelas, com o resto absorvido pela última (ver item 3 do Plano de Implementação).

### `fin_spending_summary` (view, somente leitura)
Agrega `fin_spending_entries` por cartão e categoria. Campos usados: `card_id, category_id, category_name, total_spent`. Usada exclusivamente pela aba Faturas.

### `fin_income_entries` ("entradas"/receitas)
| Coluna | Tipo (inferido) | Descrição |
|---|---|---|
| id | uuid/int | Identificador |
| month, year | int | Mês/ano de referência |
| amount | numeric | Valor da entrada |
| description | text, nullable | Observação |
| entry_date | date, nullable | Data da entrada |

**Pendência visível:** o texto de ajuda no modal diz que "entrada lançada no mês M cai no mês M+1", mas nenhuma consulta aplica esse deslocamento — a soma de entradas usada nos cálculos de sobra é sempre a do mês exibido, sem defasagem. Ou o texto está errado, ou a lógica está incompleta; hoje os dois não combinam.

## Relacionamentos

```
fin_categories ──< fin_commitments.category_id
fin_categories ──< fin_spending_entries.category_id
fin_categories ──< fin_category_budgets.category_id

fin_payment_methods ──< fin_commitments.default_payment_method_id
fin_payment_methods ──< fin_spending_entries.payment_method_id
fin_payment_methods ──< fin_commitment_payments.payment_method_id

fin_commitments ──< fin_commitment_payments.commitment_id
fin_commitments ──(view agregada)── fin_commitment_summary
fin_spending_entries ──(view agregada)── fin_spending_summary

fin_income_entries (sem FK — tabela independente, só filtrada por month/year)
```

**Resolvido:** ao excluir uma categoria, o app só verificava se existiam `fin_commitments` referenciando-a antes de bloquear a exclusão — não verificava `fin_spending_entries` nem `fin_category_budgets`. Agora as três tabelas são checadas antes de permitir a exclusão (ver item 5 do Plano de Implementação).

## Regras de acesso aos dados

Não há distinção de perfil de acesso no frontend — um único nível de acesso, tudo liberado para leitura e escrita através da chave anônima. Qualquer restrição real (por exemplo, impedir escrita a partir de outro domínio) precisaria estar configurada como política de Row Level Security direto no projeto Supabase, fora do escopo deste arquivo.
