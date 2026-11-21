import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type,x-hlo-stage-secret",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  const expectedSecret = Deno.env.get("HLO_STAGE_SECRET") || "";
  if (!expectedSecret) {
    return new Response("Staging upload is disabled", { status: 503, headers: cors });
  }
  if (req.headers.get("x-hlo-stage-secret") !== expectedSecret) {
    return new Response("Forbidden", { status: 403, headers: cors });
  }

  try {
    const body = await req.json();
    const partNo = Number(body?.part_no);
    const b64 = String(body?.b64 || "");
    const sha256 = String(body?.sha256 || "");
    if (!Number.isInteger(partNo) || partNo < 1 || partNo > 100 || !b64 || !/^[a-f0-9]{64}$/i.test(sha256)) {
      return new Response("Bad payload", { status: 400, headers: cors });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { error } = await sb
      .from("hlo_asset_cache_v3")
      .upsert({ part_no: partNo, b64, sha256: sha256.toLowerCase(), updated_at: new Date().toISOString() }, { onConflict: "part_no" });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, part_no: partNo, len: b64.length }), {
      headers: { ...cors, "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...cors, "content-type": "application/json" },
    });
  }
});
