// Proxy do assistente financeiro: guarda a chave do Groq no servidor (secret GROQ_API_KEY),
// valida a entrada e limita o uso diário. O app envia a conversa + um resumo calculado das finanças.
import { createClient } from "npm:@supabase/supabase-js@2";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = Deno.env.get("GROQ_MODEL") ?? "llama-3.3-70b-versatile";
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
- Para "quanto posso gastar em X": use o campo "categorias" (previsto, gasto, resta) e a folga. Diferencie o que resta na categoria do que cabe na folga geral.
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
      max_tokens: 900,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "system", content: `CONTEXTO (JSON):\n${contexto}` },
        ...messages,
      ],
    }),
  });

  if (!resp.ok) {
    const status = resp.status === 429 ? 429 : 502;
    return json({ error: resp.status === 429 ? "provider_rate_limit" : "provider_error" }, status);
  }
  const data = await resp.json();
  const reply = data?.choices?.[0]?.message?.content?.trim();
  if (!reply) return json({ error: "empty_reply" }, 502);
  return json({ reply });
});
