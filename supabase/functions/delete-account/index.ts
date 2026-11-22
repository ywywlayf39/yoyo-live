import { createClient } from "npm:@supabase/supabase-js@2";
import { RoomServiceClient } from "npm:livekit-server-sdk@2.20.1";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization") ?? "";
    const jwt = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!jwt) return json({ error: "Authentication required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
    let serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (secretKeysRaw) {
      try {
        const keys = JSON.parse(secretKeysRaw);
        if (typeof keys?.default === "string") {
          serviceRoleKey = Deno.env.get(keys.default) ?? serviceRoleKey;
        }
      } catch {
        // Keep the legacy service-role-key fallback.
      }
    }

    const publishableKeysRaw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
    let publicKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (publishableKeysRaw) {
      try {
        const keys = JSON.parse(publishableKeysRaw);
        if (typeof keys?.default === "string") {
          publicKey = Deno.env.get(keys.default) ?? publicKey;
        }
      } catch {
        // Keep the legacy anon-key fallback.
      }
    }

    if (!supabaseUrl || !serviceRoleKey || !publicKey) {
      console.error("Account deletion server configuration is incomplete");
      return json({ error: "خدمة حذف الحساب غير مهيأة على الخادم." }, 500);
    }

    const authClient = createClient(supabaseUrl, publicKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser(jwt);
    if (authError || !user) return json({ error: "انتهت جلسة الدخول. سجّل الدخول مرة أخرى." }, 401);

    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== true) return json({ error: "تأكيد حذف الحساب مطلوب." }, 400);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const userId = user.id;

    // Disconnect this user's active LiveKit rooms when server credentials are available.
    const livekitKey = Deno.env.get("LIVEKIT_API_KEY");
    const livekitSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const livekitUrl = Deno.env.get("LIVEKIT_URL");
    if (livekitKey && livekitSecret && livekitUrl) {
      const roomNames = new Set<string>();
      const { data: hostedRooms, error: hostedError } = await admin
        .from("live_rooms").select("room_name").eq("host_id", userId).eq("status", "live");
      if (hostedError) throw hostedError;
      for (const room of hostedRooms ?? []) roomNames.add(room.room_name);

      const { data: calls, error: callsError } = await admin
        .from("live_calls").select("room_name").or(`caller_id.eq.${userId},receiver_id.eq.${userId}`).in("status", ["ringing", "accepted"]);
      if (callsError) throw callsError;
      for (const call of calls ?? []) roomNames.add(call.room_name);

      if (roomNames.size) {
        const serviceUrl = livekitUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
        const roomService = new RoomServiceClient(serviceUrl, livekitKey, livekitSecret);
        for (const roomName of roomNames) {
          const active = await roomService.listRooms([roomName]);
          if (active.length) await roomService.deleteRoom(roomName);
        }
      }
    }

    // Remove profile images owned by this account before deleting the Auth user.
    const bucket = admin.storage.from("profile-avatars");
    const pageSize = 500;
    for (;;) {
      const { data: files, error: listError } = await bucket.list(userId, { limit: pageSize, offset: 0 });
      if (listError) throw listError;
      if (!files?.length) break;
      const paths = files
        .filter((file) => file.name)
        .map((file) => `${userId}/${file.name}`);
      if (!paths.length) break;
      const { error: removeError } = await bucket.remove(paths);
      if (removeError) throw removeError;
      if (files.length < pageSize) break;
    }

    const deletions = [
      admin.from("direct_messages").delete().or(`sender_id.eq.${userId},recipient_id.eq.${userId}`),
      admin.from("gift_transfers").delete().or(`sender_id.eq.${userId},receiver_id.eq.${userId}`),
      admin.from("live_calls").delete().or(`caller_id.eq.${userId},receiver_id.eq.${userId}`),
      admin.from("live_rooms").delete().eq("host_id", userId),
      admin.from("user_blocks").delete().or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
      admin.from("user_reports").delete().or(`reporter_id.eq.${userId},reported_user_id.eq.${userId}`),
      admin.from("wallet_transactions").delete().eq("user_id", userId),
      admin.from("withdrawal_requests").delete().eq("user_id", userId),
      admin.from("wallets").delete().eq("user_id", userId),
      admin.from("member_public_profiles").delete().eq("id", userId),
      admin.from("profiles").delete().eq("id", userId),
    ];

    for (const operation of deletions) {
      const { error } = await operation;
      if (error) throw error;
    }

    const { error: deleteUserError } = await admin.auth.admin.deleteUser(userId);
    if (deleteUserError) throw deleteUserError;

    return json({ deleted: true });
  } catch (error) {
    console.error("Account deletion failed:", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "تعذر حذف الحساب بالكامل الآن. لم نؤكد الحذف؛ حاول مرة أخرى أو تواصل مع الدعم." }, 500);
  }
});
