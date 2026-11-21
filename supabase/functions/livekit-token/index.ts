import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk@2.20.1";

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

    const body = await req.json();
    const roomName = typeof body?.roomName === "string" ? body.roomName.trim() : "";

    if (!roomName || roomName.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(roomName)) {
      return json({ error: "A valid roomName is required" }, 400);
    }

    const { data: room, error: roomError } = await supabase
      .from("live_rooms")
      .select("host_id, status")
      .eq("room_name", roomName)
      .maybeSingle();

    if (roomError) {
      console.error("Live room lookup failed:", roomError.message);
      return json({ error: "Unable to verify live room access" }, 500);
    }

    if (!room || room.status !== "live") {
      return json({ error: "Live room not found or already ended" }, 404);
    }

    const isHost = room.host_id === user.id;
    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const livekitUrl = Deno.env.get("LIVEKIT_URL");

    if (!apiKey || !apiSecret || !livekitUrl) {
      console.error("LiveKit server configuration is incomplete");
      return json({ error: "LiveKit is not configured on the server" }, 500);
    }

    const accessToken = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      ttl: "1h",
    });

    accessToken.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: isHost,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await accessToken.toJwt();

    return json({
      token,
      serverUrl: livekitUrl,
      roomName,
      isHost,
      expiresIn: 3600,
    });
  } catch (error) {
    console.error("livekit-token error:", error instanceof Error ? error.message : "Unknown error");
    return json({ error: "Unable to create LiveKit access token" }, 500);
  }
});
