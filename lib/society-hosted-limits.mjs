import { db, environment as hostedEnvironment } from "./db.mjs";

// Allocation limits, not gameplay limits: reopening an admitted browser session
// never consumes another allocation. The SQL RPC enforces these atomically.
export const SOCIETY_SESSION_LIMITS = Object.freeze({
  globalPerDay: 30,
  clientPerDay: 4,
});

const hash = /^[a-f0-9]{32,128}$/;

export async function claimSocietySession(
  { sessionId, clientKey, environment = hostedEnvironment() },
  { request = db } = {},
) {
  if (!hash.test(sessionId ?? "") || !hash.test(clientKey ?? ""))
    throw new TypeError("Society allocation requires hashed session and client IDs.");
  if (!["preview", "production"].includes(environment))
    throw new TypeError("Choose the preview or production society environment.");

  const result = await request("rpc/selforg_claim_society_session", {
    method: "POST",
    body: { p_environment: environment, p_session: sessionId, p_client: clientKey },
  });

  if (
    !result ||
    typeof result.allowed !== "boolean" ||
    typeof result.created !== "boolean" ||
    (!result.allowed &&
      (!["global_limit", "client_limit"].includes(result.reason) ||
        !Number.isInteger(result.retry_after) ||
        result.retry_after < 1 ||
        result.retry_after > 86400))
  ) {
    const error = new Error("The hosted session limit service is unavailable.");
    error.status = 503;
    throw error;
  }

  if (result.allowed)
    return {
      allowed: true,
      created: result.created,
      retryAfter: 0,
      reason: result.created ? "created" : "existing",
      message: "",
    };

  return {
    allowed: false,
    created: false,
    retryAfter: result.retry_after,
    reason: result.reason,
    message:
      result.reason === "client_limit"
        ? "This connection has reached today's limit for new game sessions. Reopen an existing session or try again after midnight UTC."
        : "Today's limit for new game sessions has been reached. Existing sessions still work; please try again after midnight UTC.",
  };
}
