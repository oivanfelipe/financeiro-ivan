# PRD — Documento de Requisitos do Produto

> Documento gerado retroativamente a partir da leitura completa do código atual (`index.html`), não de uma especificação prévia. Reflete o que o app **faz hoje**, com pendências marcadas explicitamente onde o comportamento é ambíguo, incompleto ou inconsistente.

## Resumo do app

"Orçamento Ivan" é um app web mobile-first, de página única, para controle financeiro pessoal/familiar: planeja compromissos mensais (fixos e pontuais), registra pagamentos e gastos avulsos, acompanha faturas de cartão de crédito e tetos de gasto por categoria, e mostra quanto sobra de dinheiro no mês.

## Problema que resolve

Liga três momentos que normalmente ficam soltos em planilhas separadas:
1. **Planejamento** — o que eu pretendo gastar/pagar este mês (compromissos, tetos por categoria).
2. **Execução** — o que eu já paguei de fato (pagamentos parciais/totais de contas, gastos avulsos lançados no dia a dia).
3. **Consequência** — quanto sobra considerando entradas (receitas), o que foi ou não pago, e categorias que estouraram o teto.

## Público-alvo

Usuário único ("Ivan"). **Não existe autenticação nem conta multiusuário real** — o app usa uma única chave anônima do Supabase compartilhada, ou seja, é o orçamento de uma casa/família, mas tecnicamente é um único "banco de dados" sem separação de acesso por pessoa.

**Pendência visível:** categorias com nomes específicos ("Melina", "Bem", "Mel") recebem ícone e cor especiais (ver Design Brief), o que sugere uma intenção de representar membros da família. Hoje isso é só uma categoria de gasto com nome de pessoa — não existe um conceito real de "membro da família" com conta, permissão ou visão própria. Se a intenção é ter perfis por pessoa, isso é uma funcionalidade nova, não uma que já existe.

## Funcionalidades da primeira versão

Lista das funcionalidades que já existem, construídas, hoje:

1. **Dashboard** — mostra "Sobra Real" (entradas − gastos lançados) e "Sobra Projetada" (entradas − compromissos projetados), alerta de categorias que estouraram o teto, progresso de gasto por categoria com teto definido, e ranking de todas as categorias por valor gasto no mês.
2. **Planejamento** — cadastro de compromissos do mês (recorrência automática/manual/pontual, opcionalmente vinculado a um cartão), registro de entradas de receita do mês, opção de repetir um compromisso por N meses ou parcelá-lo, limpeza de compromissos duplicados por nome.
3. **A Pagar** — lista apenas os compromissos que têm dia de vencimento definido, ordenados por urgência (vencido → hoje → esta semana → futuro → pago), com registro de pagamento total ou parcial e histórico de pagamentos por conta.
4. **Gastos** — lançamento rápido de um gasto avulso (categoria, subcategoria livre, método de pagamento, data, observação), com opção de parcelar o valor total em N meses.
5. **Faturas** — para cada cartão de crédito ativo, mostra o total fechado do mês somando gastos manuais no cartão + compromissos automáticos + compromissos parcelados vinculados ao cartão.
6. **Perfil** — CRUD de categorias (nome + emoji/ícone), CRUD de cartões/métodos de pagamento (nome, tipo, dia de fechamento, cor), definição de teto de gasto mensal por categoria, e um formulário de "dados pessoais" (nome, dia de recebimento) salvo só no navegador.
7. **Tema claro/escuro** — alternável manualmente, com fallback para preferência do sistema.

## Fora do escopo da primeira versão

Não implementado hoje, e não deve ser assumido como já existente ao planejar próximos passos:

- Autenticação, login ou qualquer separação de dados por usuário/pessoa
- Aplicativo nativo (iOS/Android) — é só web mobile-first
- Relatórios exportáveis (PDF/Excel), gráficos históricos entre meses
- Notificações push ou lembretes de vencimento
- Integração bancária (Open Finance) ou importação automática de extrato
- Anexo de comprovante/nota fiscal a um gasto ou pagamento
- Suporte a mais de uma moeda
- Layout responsivo para tablet/desktop (o app é fixo em largura máxima de 480px)

## Critério de sucesso

**Pendência visível:** não há métrica de sucesso formalizada no código (sem analytics, sem tracking de uso). Na prática, o critério implícito de "pronto e funcionando" é: o usuário consegue, todo mês, lançar entradas e compromissos, marcar contas como pagas, lançar gastos avulsos, e ver a "Sobra Real"/"Sobra Projetada" batendo com a realidade — sem precisar recorrer à planilha antiga (ver `_archive/`, versão anterior do app baseada em Google Sheets/Apps Script).

**Resolvido:** o app tinha três números de "sobra" diferentes, calculados de três formas diferentes, em duas abas (Dashboard: "Sobra Real" e "Sobra Projetada"; Planejamento: "Sobra"). Unificado para uma única fórmula oficial (Sobra Projetada), que agora é o número principal do Dashboard e é reaproveitada no Planejamento; Sobra Real permanece como informação secundária, claramente rotulada. Ver item 1 do Plano de Implementação.
