# TRD — Documento de Requisitos Técnicos

> Reflete a stack como está hoje no repositório, não uma recomendação.

## Stack

- **Frontend:** HTML + CSS + JavaScript puro (vanilla), sem framework (nenhum React/Vue/Svelte), sem build step (nenhum bundler, sem `package.json`). Tudo em um único arquivo: `index.html` (~2600 linhas, HTML + `<style>` + `<script>` inline).
- **Backend:** não existe um backend próprio (sem servidor Node/API própria). O browser fala diretamente com o Supabase (Postgres via API REST automática do PostgREST), usando a biblioteca `@supabase/supabase-js@2` carregada por CDN (jsDelivr).
- **Banco de dados:** Supabase Postgres. Tabelas `fin_categories`, `fin_payment_methods`, `fin_category_budgets`, `fin_commitments`, `fin_commitment_payments`, `fin_spending_entries`, `fin_income_entries`, mais duas *views* de leitura agregada: `fin_commitment_summary` e `fin_spending_summary` (ver Esquema de Backend).
- **Hospedagem:** Vercel, como site estático. `vercel.json` define apenas um rewrite catch-all (`/(.*)` → `/index.html`), padrão de SPA — embora o app não use roteamento por URL de fato (troca de aba é só JS, sem deep-link).

## Ferramentas e serviços externos

- **Supabase** — banco de dados + API REST automática + (presumivelmente) Row Level Security configurada direto no projeto Supabase (não visível no código do frontend). É o único serviço externo real do app.
- **Google Fonts** — fonte "Plus Jakarta Sans" (pesos 400/500/600/700/800), carregada via `<link>` no `<head>`.
- **Nenhuma autenticação** — o cliente Supabase é inicializado com uma chave anônima (`anon key`) pública, sem fluxo de login, sessão ou usuário.

## Restrições técnicas

Decisões já tomadas no código atual — mudá-las é um projeto à parte, não um ajuste pontual:

- **Sem framework e sem build step.** Qualquer alteração de UI ou lógica é feita direto no `index.html`. Introduzir React/build tooling é uma reescrita, não uma modificação incremental.
- **Sem autenticação.** Todo o app assume um único usuário/lar com acesso total ao banco. Adicionar login exigiria repensar RLS no Supabase e todo o fluxo de carregamento de dados.
- **Layout mobile-first fixo.** `body { max-width: 480px; margin: 0 auto; }` — não há breakpoints para tablet/desktop. Em telas largas, o app apenas fica centralizado com espaço vazio nas laterais.
- **Sem roteamento por URL.** Um F5 (refresh) sempre volta para a aba Dashboard e para o mês atual — não há como linkar diretamente para uma aba ou mês específico.
- **Chave e URL do Supabase hardcoded no HTML servido publicamente.** Não há `.env`, não há separação de chave por ambiente. Trocar de projeto Supabase (ex.: para um ambiente de teste) exige editar o arquivo à mão.

## Ambientes

**Pendência visível:** não existe separação entre desenvolvimento, teste e produção. Há um único `index.html`, um único projeto Vercel e um único projeto Supabase — o mesmo banco de dados usado no dia a dia é o único banco disponível para testar mudanças. Qualquer alteração de schema ou lógica de escrita deve ser testada com cautela (idealmente contra uma cópia/branch do banco Supabase, se o plano do Supabase permitir), já que não há ambiente de staging.
