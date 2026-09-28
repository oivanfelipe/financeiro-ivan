# AppFlow — Fluxo e Navegação do App

## Mapa de telas

Seis abas fixas na navegação inferior, todas dentro da mesma página (sem URL própria por aba):

- **Dashboard** — visão geral do mês: quanto sobra, o que estourou o teto, ranking de gastos por categoria. Só leitura (não tem formulário próprio, só abre o modal de drilldown de categoria).
- **Planejamento** — cadastro dos compromissos do mês (recorrentes e pontuais) e das entradas (receitas) do mês.
- **A Pagar** — lista de contas com vencimento definido, para marcar como pagas (total ou parcialmente).
- **Gastos** — lançamento rápido de um gasto avulso do dia a dia, com opção de parcelamento.
- **Faturas** — total fechado de cada cartão de crédito no mês (automáticos + parcelados + gastos manuais).
- **Perfil** — cadastro de categorias, cartões/métodos de pagamento, tetos de gasto, e dados pessoais (nome/dia de recebimento).

## Jornada principal

Fluxo típico de uso ao longo de um mês:

1. Usuário abre o app → cai automaticamente na aba **Dashboard**, mês atual carregado (se o mês for novo/vazio, o app propaga sozinho os compromissos recorrentes do mês anterior).
2. Vai para **Planejamento** → clica em "+ Nova" → cadastra os compromissos do mês (ex.: aluguel, assinatura, presente) escolhendo tipo de recorrência (automático/manual/pontual) e, opcionalmente, cartão vinculado → clica em "+ Adicionar" nas Entradas para lançar a receita do mês.
3. Ao longo do mês, vai para **A Pagar** → conforme uma conta vence, clica em "Registrar pagamento" → escolhe valor pago e método de pagamento → confirma como pagamento parcial ou conclusão total.
4. Também ao longo do mês, vai para **Gastos** → preenche o formulário (valor, categoria, método, data) → clica em "Registrar" (ou marca "Parcelado?" antes, se for uma compra a prazo).
5. Vai para **Faturas** → confere o total fechado de cada cartão de crédito, cruzando com a fatura real do banco.
6. Volta para o **Dashboard** → acompanha "Sobra Real"/"Sobra Projetada" e a lista "Acima do teto" para saber se alguma categoria estourou.

## Jornadas alternativas

- **Editar ou excluir um compromisso já criado** — menu "⋯" no card, disponível em Planejamento e A Pagar.
- **Limpar duplicados** — botão "Dupl." em Planejamento, remove compromissos com nome repetido (case-insensitive) no mês atual, mantendo o primeiro.
- **Trocar de mês** — setas "‹ ›" no cabeçalho. Se o mês de destino ainda não tiver nenhum compromisso recorrente, o app copia automaticamente os do mês anterior antes de exibir a tela.
- **Editar valor de um "automático" direto pela aba Faturas** — sem precisar ir até Planejamento.
- **Cadastrar categoria, cartão ou teto novo "na hora"** — a partir do Perfil, ou diretamente pelos modais de novo compromisso/gasto quando a opção desejada ainda não existe.
- **Drilldown de categoria** — clicar em uma categoria no Dashboard abre um modal com o detalhamento dos lançamentos daquela categoria no mês.
- **Alternar tema claro/escuro** — ícone de sol/lua no cabeçalho, independente da preferência do sistema.

## Estados especiais

- **Carregando:** cada aba mostra um spinner com o texto "Carregando..." em seu próprio espaço (`#dash-root`, `#planejamento-root`, `#pagar-root`), na primeira renderização.
- **Erro de conexão:** toast vermelho fixo no rodapé. **Resolvido:** antes a mensagem era sempre o texto genérico "Erro ao conectar ao banco de dados.", e um erro retornado pelo Supabase (permissão, tabela ausente) nem chegava a esse texto — era ignorado em silêncio e o mês só aparecia vazio. Agora `loadAll`/`loadMes` checam o erro de cada consulta e mostram uma mensagem que diferencia "sem conexão com a internet" de um erro real do banco, com a mensagem original do Supabase incluída (ver item 8 do Plano de Implementação).
- **Lista vazia:** estado vazio (`.empty-state`, ícone + texto curto) quando não há contas, gastos ou entradas lançadas no mês.
- **Categoria sem teto definido:** aparece separada, sem barra de progresso, em vez de ser omitida.
- **Cartão sem consumo no mês:** o cartão inteiro é ocultado da aba Faturas (não aparece com total zero).
- **Botão "Tentar de novo" no toast de erro:** existe visualmente no CSS/HTML, mas **pendência visível:** o código nunca preenche a variável que ele depende (`ultimaAcaoParams`) — na prática esse botão nunca aparece, é um mecanismo incompleto.
