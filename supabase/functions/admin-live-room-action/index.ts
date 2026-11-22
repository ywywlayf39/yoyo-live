import { createClient } from "npm:@supabase/supabase-js@2";
import { RoomServiceClient } from "npm:livekit-server-sdk@2.20.1";

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
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) return json({ error: "Authentication required" }, 401);
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!url || !anon || !serviceKey) return json({ error: "Server configuration is incomplete" }, 500);

    const auth = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user: admin }, error: authError } = await auth.auth.getUser(jwt);
    if (authError || !admin) return json({ error: "Invalid or expired session" }, 401);
    if (admin.app_metadata?.role !== "admin") return json({ error: "Admin access required" }, 403);

    const body = await req.json();
    const roomId = typeof body?.roomId === "string" ? body.roomId : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roomId)) return json({ error: "Invalid live room ID" }, 400);
    if (reason.length < 5 || reason.length > 500) return json({ error: "اكتب سببًا من 5 إلى 500 حرف" }, 400);

    const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: room, error: roomError } = await service.from("live_rooms")
      .select("id, room_name, host_id, host_name, title, status")
      .eq("id", roomId).maybeSingle();
    if (roomError) return json({ error: "Unable to load live room" }, 500);
    if (!room || room.status !== "live") return json({ error: "البث غير موجود أو انتهى بالفعل" }, 404);

    const target = await service.auth.admin.getUserById(room.host_id);
    if (target.error || !target.data.user) return json({ error: "Host account not found" }, 404);
    if (target.data.user.app_metadata?.role === "admin") return json({ error: "لا يمكن إنهاء بث حساب إداري من هذه الأداة" }, 403);

    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const livekitUrl = Deno.env.get("LIVEKIT_URL");
    if (!apiKey || !apiSecret || !livekitUrl) return json({ error: "LiveKit server configuration is incomplete" }, 500);
    const serviceUrl = livekitUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
    const roomService = new RoomServiceClient(serviceUrl, apiKey, apiSecret);
    const rooms = await roomService.listRooms([room.room_name]);
    if (rooms.length) await roomService.deleteRoom(room.room_name);

    const endedAt = new Date().toISOString();
    const { data: ended, error: endError } = await service.from("live_rooms")
      .update({ status: "ended", ended_at: endedAt })
      .eq("id", room.id).eq("status", "live").select("id").maybeSingle();
    if (endError || !ended) {
      console.error("Live room status update failed:", endError?.message ?? "Room was not updated");
      return json({ error: "تم فصل غرفة البث لكن تعذر تحديث حالتها في قاعدة البيانات؛ راجع السجلات" }, 500);
    }

    const { error: auditError } = await service.from("admin_user_actions").insert({
      admin_id: admin.id, target_user_id: room.host_id, action: "end_live_room",
      reason, duration: null,
    });
    if (auditError) console.error("Live room moderation audit failed:", auditError.message);
    return json({ success: true, roomId: room.id, hostName: room.host_name, auditWarning: !!auditError });
  } catch (error) {
    console.error("admin-live-room-action error:", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "تعذر تنفيذ إجراء مراجعة البث" }, 500);
  }
});