import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const durations: Record<string, { ban: string; hours: number | null }> = {
  "24h": { ban: "24h", hours: 24 },
  "72h": { ban: "72h", hours: 72 },
  "168h": { ban: "168h", hours: 168 },
  "720h": { ban: "720h", hours: 720 },
  permanent: { ban: "876000h", hours: null },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const authorization = req.headers.get("Authorization") ?? "";
    const jwt = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!jwt) return json({ error: "Authentication required" }, 401);
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !anonKey || !serviceKey) {
      console.error("Admin suspension function is missing server configuration");
      return json({ error: "Server configuration is incomplete" }, 500);
    }
    const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user: admin }, error: authError } = await authClient.auth.getUser(jwt);
    if (authError || !admin) return json({ error: "Invalid or expired session" }, 401);
    if (admin.app_metadata?.role !== "admin") return json({ error: "Admin access required" }, 403);

    const body = await req.json();
    const action = body?.action;
    const targetUserId = typeof body?.targetUserId === "string" ? body.targetUserId : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (!["suspend", "unsuspend"].includes(action)) return json({ error: "Invalid action" }, 400);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetUserId)) return json({ error: "Invalid member ID" }, 400);
    if (targetUserId === admin.id) return json({ error: "You cannot suspend your own admin account" }, 400);
    if (reason.length < 5 || reason.length > 500) return json({ error: "اكتب سببًا من 5 إلى 500 حرف" }, 400);

    const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: targetData, error: targetError } = await service.auth.admin.getUserById(targetUserId);
    if (targetError || !targetData?.user) return json({ error: "Member not found" }, 404);
    if (targetData.user.app_metadata?.role === "admin") return json({ error: "Admin accounts cannot be suspended from this panel" }, 403);

    if (action === "suspend") {
      const duration = durations[body?.duration];
      if (!duration) return json({ error: "Invalid suspension duration" }, 400);
      const { error: banError } = await service.auth.admin.updateUserById(targetUserId, { ban_duration: duration.ban });
      if (banError) {
        console.error("Supabase Auth suspension failed:", banError.message);
        return json({ error: "Unable to suspend this account" }, 502);
      }
      const until = duration.hours === null ? null : new Date(Date.now() + duration.hours * 3600000).toISOString();
      const { error: recordError } = await service.from("user_suspensions").upsert({
        user_id: targetUserId, reason, suspended_by: admin.id, suspended_at: new Date().toISOString(),
        suspended_until: until, revoked_at: null, revoked_by: null, updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (recordError) {
        console.error("Suspension record write failed:", recordError.message);
        await service.auth.admin.updateUserById(targetUserId, { ban_duration: "none" });
        return json({ error: "Could not save the suspension record; the ban was rolled back" }, 500);
      }
      const { error: auditError } = await service.from("admin_user_actions").insert({
        admin_id: admin.id, target_user_id: targetUserId, action: "suspend", reason, duration: body.duration,
      });
      if (auditError) {
        console.error("Suspension audit write failed:", auditError.message);
        return json({ error: "Suspension was applied but the audit record failed; contact support" }, 500);
      }
      return json({ success: true, action, suspendedUntil: until });
    }

    const { error: unbanError } = await service.auth.admin.updateUserById(targetUserId, { ban_duration: "none" });
    if (unbanError) {
      console.error("Supabase Auth unsuspension failed:", unbanError.message);
      return json({ error: "Unable to lift the account suspension" }, 502);
    }
    const { error: updateError } = await service.from("user_suspensions")
      .update({ revoked_at: new Date().toISOString(), revoked_by: admin.id, updated_at: new Date().toISOString() })
      .eq("user_id", targetUserId).is("revoked_at", null);
    if (updateError) return json({ error: "Account was unbanned but the suspension record could not be updated" }, 500);
    const { error: auditError } = await service.from("admin_user_actions").insert({
      admin_id: admin.id, target_user_id: targetUserId, action: "unsuspend", reason, duration: null,
    });
    if (auditError) return json({ error: "Suspension lifted but the audit record failed; contact support" }, 500);
    return json({ success: true, action });
  } catch (error) {
    console.error("admin-user-suspension error:", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "Unable to process the admin action" }, 500);
  }
});