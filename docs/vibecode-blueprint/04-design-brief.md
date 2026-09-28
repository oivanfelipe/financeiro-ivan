# Design Brief — UI e UX

## Tom visual

Minimalista, denso em informação mas organizado em cards, com um único acento de cor (roxo) usado com moderação para ações e estados ativos. Visual "app de banco/fintech" mobile — parecido com apps como Nubank/Mercado Pago no uso de cards, badges coloridos por status e números grandes em destaque no topo de cada tela ("hero number").

## Paleta de cores

Definida via CSS custom properties (`:root`), com um jogo completo para tema claro e escuro:

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--accent` | `#7C3AED` (roxo) | mesmo | Botões primários, item ativo, badge "automático" |
| `--accent-soft` | `#F5F3FF` | `#2E1065` | Fundo suave de chips/badges com acento |
| `--bg` | `#FFFFFF` | `#0C0A1A` | Fundo da página |
| `--surface` | `#F8FAFC` | `#160F2A` | Fundo dos cards |
| `--surface2` | `#F1F5F9` | `#1E1535` | Fundo de trilho de progresso, superfície secundária |
| `--border` | `#EAECF0` | `#2A1F45` | Bordas de cards, divisores |
| `--text-1` | `#0D1117` | `#F0EEFF` | Texto principal |
| `--text-2` | `#6B7280` | `#8B81A8` | Texto secundário |
| `--text-3` | `#B0B7C3` | `#3D3055` | Texto terciário/labels |
| `--green` / `--green-bg` | `#059669` / `#F0FDF4` | — / `#052E16` | Sucesso, pago, dentro do teto |
| `--red` / `--red-bg` | `#DC2626` / `#FEF2F2` | — / `#3B0A0A` | Erro, vencido, acima do teto |
| `--amber` / `--amber-bg` | `#D97706` / `#FFFBEB` | — / `#3B1F00` | Alerta, "hoje"/"esta semana", perto do teto |

Paleta adicional (independente do tema, usada só para avatares de categoria, hash determinístico por nome/id — mesma categoria sempre com a mesma cor):
`#7C3AED #0EA5E9 #10B981 #F59E0B #EF4444 #8B5CF6 #06B6D4 #84CC16 #F97316 #EC4899 #6366F1 #14B8A6`

**Exceção hardcoded:** categorias cujo nome (sem acento, minúsculo) é "melina" ou "mel" sempre recebem a cor `#EC4899` (rosa), ignorando o hash — ver pendência no PRD sobre categorias com nome de pessoa.

## Tipografia

Fonte única: **Plus Jakarta Sans** (Google Fonts), pesos 400/500/600/700/800, com fallback `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`. Não há fonte secundária. Uso por peso:
- 700–800: números grandes (hero), títulos de card, valores
- 600: nomes de item, badges, botões
- 400–500: texto secundário, labels, meta-informação

Números monetários usam `font-variant-numeric: tabular-nums` (alinhamento de dígitos), consistente em todos os valores.

## Componentes e estilo

- **Bordas:** arredondadas em toda a interface — `--radius: 12px` para cards, `99px`/pill para badges e chips, `10px` para botões e inputs, `20px 20px 0 0` para o topo dos modais (bottom-sheet).
- **Cards:** receita única reaproveitada em todas as telas — fundo `--surface`, borda 1px `--border`, `--radius`, padding ~14–16px. Card de conta a vencer ganha borda colorida inteira (vermelha se vencida, âmbar se vence hoje).
- **Badges/chips:** formato pílula, cor de fundo suave + texto na cor forte correspondente (ex.: badge "Pago" = fundo verde claro, texto verde escuro).
- **Barra de progresso:** trilho `--surface2` de 6px de altura, preenchimento colorido (verde/âmbar/vermelho conforme percentual), usada de forma idêntica em pace de categoria, progresso de conta e teto.
- **Avatares de categoria:** quadrado arredondado 36×36 (28×28 na versão pequena), com fundo colorido e, em ordem de prioridade: ícone SVG (se o nome da categoria bater com uma palavra-chave reconhecida) → emoji cadastrado → primeira letra do nome.
- **Modais:** padrão bottom-sheet (sobem do rodapé, cobrem até 90% da altura da tela, com "alça" visual no topo), nunca modal centralizado.
- **Ícones:** exclusivamente SVG inline no estilo Lucide (traço, `stroke-width: 2`, pontas arredondadas) — nenhuma fonte de ícone externa, nenhum carregamento de biblioteca de ícones em runtime.
- **Densidade:** compacta — múltiplos cards pequenos por tela, pouco espaço em branco, prioridade em caber informação sem rolagem excessiva.

## Padrão por tipo de tela

- **Toda tela começa com um "hero"**: eyebrow (label pequena maiúscula), número grande central, sub-texto e chips de resumo — usado em Dashboard, Planejamento, A Pagar, Gastos e Faturas.
- **Telas de lista** (A Pagar, Gastos, Planejamento) sempre agrupam por seção lógica (status, dia, tipo de recorrência) com um divisor de seção (`.secao-divider`, label maiúscula + linha).
- **Telas de formulário/cadastro** (novo compromisso, novo gasto, nova categoria/cartão/teto) sempre abrem como modal bottom-sheet com botão de ação primário fixo no rodapé do modal (`.btn-save`, ocupa a maior parte da largura ao lado de "Cancelar").
- **Navegação inferior fixa** (6 ícones + indicador de aba ativa) e **cabeçalho fixo no topo** (título do app, navegação de mês, tema, atualizar) em todas as telas — nunca somem ao rolar.
- **Inputs** sempre com `font-size: 16px` forçado (evita zoom automático no iOS ao focar um campo).
