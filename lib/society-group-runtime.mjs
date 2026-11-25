// Public routes are shared with the local proxy. The engine's internal group
// import route is reachable only from the server-side compile callback.
export const groupRoute = /^groups(?:\/[1-6](?:\/(?:use|edit))?)?$/;
export const publicEngineRoute =
  /^(config|strategies(?:\/[a-f0-9]{32})?|runs(?:\/[a-f0-9]{32}(?:\/(?:history|study|events|export|step|run|pause|frames\/\d+|agents\/\d+))?)?)$/;

export async function importGroupBehaviour(host, behaviour) {
  const reply = await fetch(`${host.origin}/api/society/strategies/import`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${host.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(behaviour),
    signal: AbortSignal.timeout(120000),
  });
  const data = await reply.json();
  if (!reply.ok)
    throw Object.assign(
      new Error(data.error || "The game could not load this behaviour."),
      {
        status: reply.status,
      },
    );
  return data;
}
