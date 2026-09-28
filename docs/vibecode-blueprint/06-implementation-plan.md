# Plano de Implementação

> Como o app já está construído (não é um plano do zero), este documento tem duas partes: **como foi construído até aqui** (para dar contexto histórico a quem for mexer no código) e **sequência recomendada para resolver o que foi encontrado na revisão** (backlog priorizado).

## Como o app chegou até aqui

1. Versão original em Google Sheets + Apps Script (preservada em `_archive/`, arquivos `index_v1.html` a `index_v7.html` + `Codigo.gs`) — sofria de bugs de planilha (colunas trocadas, escrita não aditiva, mês padrão errado, lista de contas fixa no código, escrita "cega" via iframe oculto).
2. Reescrita completa para Supabase (Postgres + PostgREST), removendo a dependência de planilha e de Apps Script.
3. Passe de UI/UX: sistema de ícones SVG por categoria, alternância de tema claro/escuro, cores de avatar por hash, ajustes de alinhamento e ícones de gênero/família.
4. Ajustes sucessivos e ainda recentes na fórmula de "Sobra Projetada" (pelo menos 3 correções no histórico de commits) — sinal de que essa é a lógica mais instável do app.

## Backlog recomendado (ordem sugerida)

Ordenado do que mais afeta confiança nos números/segurança para o que é só limpeza:

1. **Unificar ou renomear os três cálculos de "sobra"** (Dashboard: Sobra Real e Sobra Projetada; Planejamento: Sobra) — hoje têm nomes parecidos e fórmulas diferentes, o maior risco de o usuário confiar no número errado. Fazer isso primeiro porque qualquer mudança de regra de negócio depois vai mexer nessas mesmas contas.
2. **Corrigir a priorização de contas vencidas com pagamento parcial** (`prioridadeConta`) — hoje uma conta vencida e parcialmente paga não sobe para o topo da lista de "A Pagar" como provavelmente deveria, por causa de uma ordem de verificação que torna esse caso inalcançável.
3. **Decidir um único comportamento de "parcelar"** — hoje existem dois (um que divide o valor por N, outro que repete o valor cheio em cada parcela), dependendo de onde o parcelamento é criado (Gastos vs. Planejamento). Escolher um e migrar o outro caminho para usá-lo.
4. **Resolver o campo morto `type: 'parcelado'`** — ou implementar de verdade (gravando `installment_current`/`installment_total`) ou remover a leitura desse caso do card de conta, já que hoje nunca é escrito.
5. **Completar a checagem de exclusão de categoria** — verificar também `fin_spending_entries` e `fin_category_budgets`, não só `fin_commitments`, antes de permitir apagar uma categoria.
6. **Mover a chave do Supabase para fora do HTML versionado publicamente** (variável de ambiente + build step mínimo, ou ao menos confirmar que a Row Level Security no Supabase está configurada para tornar essa exposição segura).
7. **Decidir o destino do formulário "Dados pessoais" do Perfil** — hoje salva no `localStorage` e nunca é lido de volta; ou remover, ou dar um uso real a ele (ex.: usar o "dia de recebimento" para ajustar a defasagem de entradas mencionada no modal de receita).
8. **Diferenciar mensagens de erro de carregamento** (rede vs. permissão vs. tabela ausente) em vez do texto genérico único.
9. **Extrair a função `addMeses` duplicada 3 vezes** para um único lugar, evitando divergência futura entre as cópias.

## Marcos de validação

- Depois do item 1 (unificação das "sobras"): comparar manualmente, por pelo menos um mês fechado, se o novo número bate com a soma real de entradas menos gastos/compromissos daquele mês, antes de confiar nele para os meses seguintes.
- Depois do item 3 (parcelamento único): criar uma compra parcelada de teste em 3x e conferir se o valor total das parcelas soma exatamente o valor original (sem sobra nem falta de centavos).
- Depois do item 6 (chave do Supabase): confirmar que, mesmo com a chave pública, não é possível ler/escrever dados a partir de outro domínio/app (testar com um `curl` simples contra a URL do Supabase usando só a chave anônima).

## Riscos e dependências

- **Não há ambiente de teste separado** (ver TRD) — qualquer mudança de schema ou de regra de cálculo deve ser testada com cautela contra o banco real, idealmente fora do horário de uso normal do app.
- **Nenhuma das mudanças acima tem teste automatizado** — o app não tem suíte de testes; validação hoje é manual, olhando os números na tela.
- **Mudar a fórmula de "sobra" é uma decisão de produto, não só técnica** — antes de implementar o item 1, vale confirmar com quem usa o app qual das três fórmulas reflete melhor o que a pessoa realmente quer saber (dinheiro que sobra de fato, ou dinheiro que vai sobrar considerando o que ainda falta pagar).
