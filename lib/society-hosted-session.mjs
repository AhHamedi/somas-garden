import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "amoeboids_session_v1";
const digest = (secret, value) =>
  createHmac("sha256", secret).update(value).digest("hex");

export function sessionIdentity(cookie, secret, scope = "production") {
  if (!secret) throw new Error("The hosted game is not configured.");
  const value = String(cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  const match = /^([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(value || "");
  const valid =
    match &&
    timingSafeEqual(
      Buffer.from(match[2], "hex"),
      Buffer.from(digest(secret, `${scope}:cookie:${match[1]}`), "hex"),
    );
  const id = valid ? match[1] : randomBytes(16).toString("hex");
  return {
    id,
    fresh: !valid,
    name: `amoeboids-${scope === "production" ? "p" : "v"}-${id}`,
    token: digest(secret, `${scope}:engine:${id}`),
    cookie: `${SESSION_COOKIE}=${id}.${digest(secret, `${scope}:cookie:${id}`)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`,
  };
}

export function requestAllowed(req, allowedOrigins) {
  const origin = req.headers.origin;
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

export function clientIdentity(req, secret) {
  const ip = String(
    req.headers["x-vercel-forwarded-for"] ||
      req.headers["x-forwarded-for"] ||
      req.socket?.remoteAddress ||
      "unknown",
  )
    .split(",")[0]
    .trim();
  return digest(secret, `client:${ip}`);
}
