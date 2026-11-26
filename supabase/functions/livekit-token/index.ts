import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken, RoomServiceClient } from "npm:livekit-server-sdk@2.20.1";

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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const authorization = req.headers.get("Authorization") ?? "";
    const jwt = authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";

    if (!jwt) return json({ error: "Authentication required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const publishableKeysRaw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
    let supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (publishableKeysRaw) {
      try {
        const keys = JSON.parse(publishableKeysRaw);
        const defaultEnvName = keys?.default;
        if (typeof defaultEnvName === "string") {
          supabaseKey = Deno.env.get(defaultEnvName) ?? supabaseKey;
        }
      } catch {
        // Fall back to the legacy anon key if the key map is unavailable.
      }
    }

    if (!supabaseUrl || !supabaseKey) {
      console.error("Supabase Auth configuration is missing");
      return json({ error: "Server authentication is not configured" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      return json({ error: "Invalid or expired session" }, 401);
    }

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) {
      console.error("Suspension status service configuration is missing");
      return json({ error: "Unable to verify account status" }, 500);
    }
    const service = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const checkSuspension = async (userId: string) => {
      const { data, error } = await service.from("user_suspensions")
        .select("reason, suspended_until")
        .eq("user_id", userId)
        .is("revoked_at", null)
        .maybeSingle();
      if (error) throw new Error("Unable to verify account status");
      return !!data && (!data.suspended_until || new Date(data.suspended_until).getTime() > Date.now());
    };

    const body = await req.json();
    const roomName = typeof body?.roomName === "string" ? body.roomName.trim() : "";
    const action = body?.action === undefined ? "join" : body.action;

    if (action !== "join" && action !== "end" && action !== "seat_permissions") {
      return json({ error: "A valid action is required" }, 400);
    }

    if (!roomName || roomName.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(roomName)) {
      return json({ error: "A valid roomName is required" }, 400);
    }
    if (action !== "end" && await checkSuspension(user.id)) {
      return json({ error: "تم إيقاف حسابك مؤقتًا أو بشكل دائم. تواصل مع الدعم لمعرفة التفاصيل." }, 403);
    }

    // Read room ownership with the service client after authenticating the caller.
    // This avoids an RLS-hidden row being mistaken for a missing room during end.
    const { data: liveRoom, error: liveRoomError } = await service
      .from("live_rooms")
      .select("host_id, status")
      .eq("room_name", roomName)
      .maybeSingle();

    if (liveRoomError) {
      console.error("Live room lookup failed:", liveRoomError.message);
      return json({ error: "Unable to verify live room access" }, 500);
    }

    let isHost = false;
    let isCall = false;
    let isVoiceRoom = false;
    let voiceRoomId: string | null = null;
    let callType: string | null = null;
    let callId: string | null = null;
    let callParticipantCallerId: string | null = null;
    let callParticipantReceiverId: string | null = null;

    if (liveRoom) {
      // Ending a room is idempotent: a retry after the first successful
      // shutdown must not turn an already-ended room into a 404.
      if (liveRoom.status !== "live" && action !== "end") {
        return json({ error: "Live room not found or already ended" }, 404);
      }
      isHost = liveRoom.host_id === user.id;
    } else {
      const { data: call, error: callError } = await supabase
        .from("live_calls")
        .select("id, caller_id, receiver_id, call_type, status")
        .eq("room_name", roomName)
        .maybeSingle();

      if (callError) {
        console.error("Live call lookup failed:", callError.message);
        return json({ error: "Unable to verify call access" }, 500);
      }

      if (!call) {
        const { data: voiceRoom, error: voiceRoomError } = await service
          .from("voice_rooms")
          .select("id, host_id, status")
          .eq("room_name", roomName)
          .maybeSingle();
        if (voiceRoomError) return json({ error: "Unable to verify voice room access" }, 500);
        if (!voiceRoom || voiceRoom.status !== "live") return json({ error: "Live room, call, or voice room not found" }, 404);
        isVoiceRoom = true;
        voiceRoomId = voiceRoom.id;
        isHost = voiceRoom.host_id === user.id;

      } else {
      const isCaller = call.caller_id === user.id;
      const isReceiver = call.receiver_id === user.id;
      if (!isCaller && !isReceiver) return json({ error: "You are not a participant in this call" }, 403);
      if (call.status === "rejected" || call.status === "ended") {
        return json({ error: "This call has ended" }, 404);
      }
      if (isReceiver && call.status !== "accepted") {
        return json({ error: "Accept the call before joining" }, 403);
      }
      if (isCaller && call.status !== "ringing" && call.status !== "accepted") {
        return json({ error: "This call is no longer active" }, 404);
      }

      isCall = true;
      callType = call.call_type;
      callId = call.id;
      callParticipantCallerId = call.caller_id;
      callParticipantReceiverId = call.receiver_id;
      }
    }

    const otherParticipantId = isCall
      ? (user.id === callParticipantCallerId ? callParticipantReceiverId : callParticipantCallerId)
      : (!isHost && liveRoom ? liveRoom.host_id : null);

    if (otherParticipantId && action !== "end") {
      if (await checkSuspension(otherParticipantId)) {
        return json({ error: "هذا الحساب موقوف حاليًا ولا يمكن الانضمام إلى البث أو المكالمة" }, 403);
      }
      const { data: blockRows, error: blockError } = await supabase
        .from("user_blocks")
        .select("blocker_id, blocked_id")
        .or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`);
      if (blockError) {
        console.error("Live room block check failed:", blockError.message);
        return json({ error: "Unable to verify room safety" }, 500);
      }
      const blocked = (blockRows ?? []).some((row) =>
        (row.blocker_id === user.id && row.blocked_id === otherParticipantId) ||
        (row.blocker_id === otherParticipantId && row.blocked_id === user.id)
      );
      if (blocked) return json({ error: "You cannot join this room because one of you has blocked the other" }, 403);
    }

    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const livekitUrl = Deno.env.get("LIVEKIT_URL");

    if (!apiKey || !apiSecret || !livekitUrl) {
      console.error("LiveKit server configuration is incomplete");
      return json({ error: "LiveKit is not configured on the server" }, 500);
    }

    if (action === "join" && isVoiceRoom && voiceRoomId) {
      const { data: membership, error: membershipError } = await service
        .from("voice_room_members")
        .select("user_id")
        .eq("room_id", voiceRoomId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (membershipError) return json({ error: "Unable to verify voice-room membership" }, 500);
      if (!membership) return json({ error: "Join the voice room before requesting a speaker token" }, 403);
    }

    if (action === "seat_permissions") {
      const targetUserId = typeof body?.targetUserId === "string" ? body.targetUserId : "";
      if (!isVoiceRoom || !voiceRoomId || !targetUserId || targetUserId.length > 128) {
        return json({ error: "A valid voice-room participant is required" }, 400);
      }
      if (!isHost && targetUserId !== user.id) {
        return json({ error: "Only the host may change another participant's speaker permissions" }, 403);
      }
      const { data: assignedSeat, error: seatError } = await service
        .from("voice_room_seats")
        .select("user_id")
        .eq("room_id", voiceRoomId)
        .eq("user_id", targetUserId)
        .maybeSingle();
      if (seatError) return json({ error: "Unable to verify speaker seat" }, 500);
      const canPublish = !!assignedSeat;
      const serviceUrl = livekitUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
      try {
        const roomService = new RoomServiceClient(serviceUrl, apiKey, apiSecret);
        await roomService.updateParticipant(roomName, targetUserId, {
          permission: { canPublish, canSubscribe: true, canPublishData: true },
        });
        return json({ updated: true, targetUserId, canPublish });
      } catch (error) {
        console.error("LiveKit speaker permission update failed:", error instanceof Error ? error.message : "Unknown error");
        return json({ error: "تعذر تحديث صلاحية المايك للمشارك المتصل" }, 502);
      }
    }

    if (action === "end") {
      if (!isHost && !isCall) {
        return json({ error: "Only the room host can end this live stream" }, 403);
      }

      const serviceUrl = livekitUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
      try {
        const roomService = new RoomServiceClient(serviceUrl, apiKey, apiSecret);
        const activeRooms = await roomService.listRooms([roomName]);
        if (activeRooms.length > 0) {
          await roomService.deleteRoom(roomName);
        }
      } catch (error) {
        console.error("LiveKit room deletion failed:", error instanceof Error ? error.message : "Unknown error");
        return json({ error: "Unable to disconnect participants from this room" }, 502);
      }

      if (isVoiceRoom) {
        const { data: endedVoiceRoom, error: voiceEndError } = await service
          .from("voice_rooms")
          .update({ status: "ended", ended_at: new Date().toISOString() })
          .eq("room_name", roomName)
          .eq("host_id", user.id)
          .eq("status", "live")
          .select("id")
          .maybeSingle();
        if (voiceEndError) return json({ error: "Voice room could not be marked as ended" }, 500);
        return json({ ended: true, isVoiceRoom: true, roomName, alreadyEnded: !endedVoiceRoom });
      }

      if (isCall && callId) {
        const { data: endedCall, error: endError } = await supabase
          .from("live_calls")
          .update({ status: "ended" })
          .eq("id", callId)
          .in("status", ["ringing", "accepted"])
          .select("id")
          .maybeSingle();

        if (endError || !endedCall) {
          console.error("Live call end update failed:", endError?.message ?? "Call was not updated");
          return json({ error: "Call could not be marked as ended" }, 500);
        }

        return json({ ended: true, isCall: true, roomName });
      }

      const { data: endedRoom, error: endError } = await service
        .from("live_rooms")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("room_name", roomName)
        .eq("host_id", user.id)
        .eq("status", "live")
        .select("id")
        .maybeSingle();

      if (endError) {
        console.error("Live room end update failed:", endError.message);
        return json({ error: "Live room could not be marked as ended" }, 500);
      }

      if (!endedRoom) {
        // A second tap/retry can arrive after the first request committed.
        // Confirm ownership and the terminal state before returning success.
        const { data: alreadyEnded, error: verifyError } = await service
          .from("live_rooms")
          .select("id")
          .eq("room_name", roomName)
          .eq("host_id", user.id)
          .eq("status", "ended")
          .maybeSingle();
        if (verifyError || !alreadyEnded) {
          console.error("Live room end verification failed:", verifyError?.message ?? "Room was not found as ended");
          return json({ error: "Live room could not be confirmed as ended" }, 500);
        }
      }

      return json({ ended: true, alreadyEnded: !endedRoom, isCall: false, roomName });
    }

    const accessToken = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      ttl: "1h",
    });

    let voiceSeatHolder = false;
    if (isVoiceRoom && voiceRoomId && !isHost) {
      const { data: seat, error: seatLookupError } = await service
        .from("voice_room_seats")
        .select("id")
        .eq("room_id", voiceRoomId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (seatLookupError) return json({ error: "Unable to verify speaker seat" }, 500);
      voiceSeatHolder = !!seat;
    }

    accessToken.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: isCall || isHost || (isVoiceRoom && voiceSeatHolder),
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await accessToken.toJwt();

    return json({
      token,
      serverUrl: livekitUrl,
      roomName,
      isHost,
      isCall,
      isVoiceRoom,
      callType,
      expiresIn: 3600,
    });
  } catch (error) {
    console.error("livekit-token error:", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "Unable to create LiveKit access token" }, 500);
  }
});
