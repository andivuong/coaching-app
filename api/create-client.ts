import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "nodejs" };

function json(res: any, status: number, body: any) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return json(res, 401, { error: "Missing Authorization" });
  }

  const token = auth.replace("Bearer ", "");

  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const COACH_EMAIL = (process.env.COACH_EMAIL || "").toLowerCase();

  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !userData.user) {
    return json(res, 401, { error: "Invalid user" });
  }

  if ((userData.user.email || "").toLowerCase() !== COACH_EMAIL) {
    return json(res, 403, { error: "Not coach" });
  }

  const { email, password, name, license_days } = req.body || {};
  if (!email || !password || !name || !license_days) {
    return json(res, 400, { error: "Missing fields" });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: createdUser, error: createError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createError || !createdUser.user) {
    return json(res, 400, { error: "User create failed" });
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + Number(license_days));

  await supabaseAdmin.from("app_clients").insert({
    user_id: createdUser.user.id,
    email,
    role: "client",
    license_expires_at: expiresAt.toISOString(),
  });

  return json(res, 200, { ok: true });
}
