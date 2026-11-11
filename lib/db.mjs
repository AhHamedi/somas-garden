export function environment() {
  return process.env.VERCEL_ENV === "production" ? "production" : "preview";
}
export async function db(path, { method = "GET", body, minimal = false } = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY,
    url = process.env.SUPABASE_URL;
  if (!key || !url) throw new Error("The garden is not configured yet.");
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: minimal ? "return=minimal" : "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const e = new Error(result?.message || "Could not save the garden.");
    e.status = response.status;
    throw e;
  }
  return result;
}
