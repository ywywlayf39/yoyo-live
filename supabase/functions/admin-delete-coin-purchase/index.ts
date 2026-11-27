import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const authorization = req.headers.get("Authorization") ?? "";
    const jwt = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!jwt) return json({ error: "Authentication required" }, 401);
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !anonKey || !serviceKey) return json({ error: "Server configuration is incomplete" }, 500);
    const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user: admin }, error: authError } = await authClient.auth.getUser(jwt);
    if (authError || !admin) return json({ error: "Invalid or expired session" }, 401);
    if (admin.app_metadata?.role !== "admin") return json({ error: "Admin access required" }, 403);
    const body = await req.json().catch(() => ({}));
    const requestId = typeof body?.requestId === "string" ? body.requestId : "";
    const action = body?.action === "delete_receipt" ? "delete_receipt" : "delete_request";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) return json({ error: "Invalid purchase request ID" }, 400);
    const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: request, error: readError } = await service.from("coin_purchase_requests")
      .select("id,user_id,status,proof_storage_path").eq("id", requestId).maybeSingle();
    if (readError) { console.error("Coin purchase request lookup failed:", readError.message); return json({ error: "Unable to load purchase request" }, 500); }
    if (!request) return json({ error: "Purchase request not found" }, 404);
    if (action === "delete_receipt") {
      if (!request.proof_storage_path) return json({ error: "لا توجد صورة إيصال لحذفها." }, 409);
      if (!request.proof_storage_path.startsWith(request.user_id + "/")) return json({ error: "Invalid receipt storage path" }, 409);
      const { error: storageError } = await service.storage.from("payment-proofs").remove([request.proof_storage_path]);
      if (storageError) { console.error("Payment proof cleanup failed:", storageError.message); return json({ error: "تعذر حذف صورة الإيصال من التخزين." }, 502); }
      const { error: clearPathError } = await service.from("coin_purchase_requests").update({ proof_storage_path: null })
        .eq("id", requestId).eq("proof_storage_path", request.proof_storage_path);
      if (clearPathError) { console.error("Payment proof path cleanup failed:", clearPathError.message); return json({ error: "تم حذف الصورة لكن تعذر تحديث سجل الإيصال؛ حدّث اللوحة." }, 500); }
      return json({ success: true, receiptDeleted: true, requestDeleted: false });
    }
    if (request.status === "approved") return json({ error: "لا يمكن حذف طلب معتمد؛ يمكنك حذف صورة الإيصال فقط مع الاحتفاظ بسجل العملية." }, 409);
    const { data: deleted, error: deleteError } = await service.from("coin_purchase_requests").delete()
      .eq("id", requestId).in("status", ["pending", "reviewing", "rejected"]).select("id").maybeSingle();
    if (deleteError || !deleted) { console.error("Coin purchase request delete failed:", deleteError?.message ?? "No row deleted"); return json({ error: "تعذر حذف الطلب؛ ربما تغيرت حالته. حدّث اللوحة وحاول مرة أخرى." }, 409); }
    let receiptDeleted = true;
    if (request.proof_storage_path) {
      if (!request.proof_storage_path.startsWith(request.user_id + "/")) {
        receiptDeleted = false;
        console.error("Rejected unexpected payment proof path for request", requestId);
      } else {
        const { error: storageError } = await service.storage.from("payment-proofs").remove([request.proof_storage_path]);
        if (storageError) { receiptDeleted = false; console.error("Payment proof cleanup failed:", storageError.message); }
      }
    }
    return json({ success: true, receiptDeleted, requestDeleted: true });
  } catch (error) {
    console.error("admin-delete-coin-purchase error:", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "Unable to process purchase request deletion" }, 500);
  }
});