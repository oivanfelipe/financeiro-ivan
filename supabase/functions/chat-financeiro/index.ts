// Proxy do assistente financeiro: guarda a chave do Groq no servidor (secret GROQ_API_KEY),
// valida a entrada e limita o uso diário. O app envia a conversa + um resumo calculado das finanças.
import { createClient } from "npm:@supabase/supabase-js@2";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// llama-3.3-70b-versatile foi descontinuado pelo Groq (16/08/2026); o substituto indicado é o gpt-oss-120b.
const MODEL = Deno.env.get("GROQ_MODEL") ?? "openai/gpt-oss-120b";
const LIMITE_DIARIO = Number(Deno.env.get("AI_DAILY_LIMIT") ?? "200");
const MAX_MSGS = 12;
const MAX_CHARS_MSG = 2000;
const MAX_CHARS_CONTEXTO = 24000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM = `Você é o assistente financeiro pessoal do Ivan, dentro do app "Orçamento Ivan". Responda sempre em português do Brasil, de forma direta e curta.

Regras:
- Use SOMENTE os números do CONTEXTO abaixo. Nunca invente valores. Se faltar um dado para responder, diga qual falta e pergunte.
- Os números do contexto já foram calculados pelo app: copie-os, não recalcule totais. Em contas simples (dividir, comparar), mostre a conta.
- "folga" = entradas do mês menos o comprometido do mês. É o que sobra para gastos novos sem apertar o dia a dia.
- Para parcelamento: se o contexto trouxer "simulacao_parcelamento", escolha entre as opções dele e recomende a mais curta que esteja "confortavel"; se nenhuma for, diga a mais curta "apertada" e o risco. Considere também os compromissos dos meses seguintes (campo "projecao_meses").
- Para "quanto posso gastar em X": use o campo "categorias": "previsto" é o orçamento do mês da categoria (o que foi planejado), "gasto" o que já saiu e "resta" o que ainda cabe (previsto menos gasto; negativo = passou). Diferencie o que resta na categoria do que cabe na folga geral.
- Para "quanto gastei em X" (padaria, ifood, uber, lazer…): use o campo "busca". Cada item tem o "termo", o "total_12_meses", o "no_mes_aberto", o "por_mes" e a lista de "lancamentos" reais. Esses totais JÁ foram somados pelo app: responda com eles (cite o mês aberto, o total e, se ajudar, os meses) e nunca diga que não tem a informação quando "encontrados" for maior que zero. Itens com "sinonimo_de" são nomes parecidos que o app também procurou (ex.: o usuário disse "gasolina" e o item se chama "combustivel"): use-os e diga qual nome achou.
- Para "quanto tenho disponível/posso gastar com X": procure X (ou um nome parecido) em "planejamento_mes" (campo "item"): "previsto" é o orçamento do item, "pago" o que já saiu e "falta" o que ainda resta pagar dele; some também o "gasto" dos lançamentos em "busca" quando fizer sentido. Responda com: previsto do item, quanto já foi, quanto resta — e, se existir, o quanto resta na categoria (campo "categorias"). Só diga que não achou depois de olhar "busca", "planejamento_mes" e "categorias", incluindo nomes parecidos.
- Se a mensagem do usuário for curta ("isso", "sim", "ok") ela continua o assunto da mensagem anterior: responda ao assunto anterior, nunca trate a palavra como um item a procurar.
- "lancamentos_mes" lista todos os lançamentos do mês aberto: "item" é a subcategoria ou descrição (ex.: "Padaria"), "categoria" é o grupo (ex.: "Alimentação"). Use para detalhar (maior gasto, datas, quantos lançamentos).
- Valores em R$ no formato brasileiro (R$ 1.234,56). Se "entradas_estimadas" for true em um mês, avise que a entrada é estimada.
- Seja honesto sobre incerteza; isto não é consultoria financeira regulada. Sem sermão: dê a recomendação e o porquê em poucas linhas.`;

type Msg = { role: "user" | "assistant"; content: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // Prefere o secret da Edge Function; se não houver, lê da tabela app_secrets (RLS sem políticas: só a service role acessa)
  let apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) {
    const { data } = await db.from("app_secrets").select("value").eq("name", "GROQ_API_KEY").maybeSingle();
    apiKey = data?.value;
  }
  if (!apiKey) return json({ error: "not_configured" }, 503);

  let body: { messages?: unknown; context?: unknown };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }

  const raw = Array.isArray(body.messages) ? body.messages : [];
  const messages: Msg[] = raw
    .filter((m): m is Msg => !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_MSGS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS_MSG) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") return json({ error: "bad_request" }, 400);

  const contexto = JSON.stringify(body.context ?? {}).slice(0, MAX_CHARS_CONTEXTO);

  // Limite diário (protege a cota do Groq, já que o app não tem login)
  const dia = new Date().toISOString().slice(0, 10);
  const { data: uso } = await db.from("ai_usage").select("count").eq("day", dia).maybeSingle();
  const n = (uso?.count ?? 0) + 1;
  if (n > LIMITE_DIARIO) return json({ error: "daily_limit" }, 429);
  await db.from("ai_usage").upsert({ day: dia, count: n });

  const resp = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      // gpt-oss é um modelo de raciocínio: o raciocínio gasta tokens da mesma cota, então o teto é maior
      // e o esforço é baixo (as contas já vêm prontas do app).
      reasoning_effort: "low",
      max_completion_tokens: 2000,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "system", content: `CONTEXTO (JSON):\n${contexto}` },
        ...messages,
      ],
    }),
  });

  if (!resp.ok) {
    // Devolve o código e a mensagem do Groq (nunca a chave) para facilitar o diagnóstico
    let detalhe = "";
    try { detalhe = String((await resp.json())?.error?.message ?? "").slice(0, 200); } catch { /* corpo não-JSON */ }
    const status = resp.status === 429 ? 429 : 502;
    return json({ error: resp.status === 429 ? "provider_rate_limit" : "provider_error", provider_status: resp.status, detalhe }, status);
  }
  const data = await resp.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) return json({ error: "empty_reply" }, 502);
  return json({ reply });
});
