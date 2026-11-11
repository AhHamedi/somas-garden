import { chromium } from "playwright";
import { readFile } from "node:fs/promises";

export const launchBrowser = (options = {}) =>
  chromium.launch({ headless: true, ...options });
export const isLocalOrigin = (origin) =>
  ["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname);

let session;
export async function localSession() {
  if (!session) {
    const file = process.env.DEV_SESSION_FILE || ".local/dev.json";
    session = readFile(file, "utf8")
      .then(JSON.parse)
      .catch(() => {
        throw new Error(
          "Start npm run dev before running this check, or use npm run test:browser.",
        );
      });
  }
  return session;
}
export async function testOrigin() {
  if (process.env.TEST_ORIGIN) return process.env.TEST_ORIGIN;
  return (await localSession()).origin;
}
export async function engineUrl() {
  return (await localSession()).engineOrigin + "/api/engine";
}
export async function engineHeaders() {
  return { Authorization: "Bearer " + (await localSession()).engineSecret };
}
export function requireHostedWrites() {
  if (!process.argv.includes("--hosted-writes")) {
    throw new Error(
      "This check creates hosted test data. Run its explicit test:hosted command.",
    );
  }
  if (!process.env.TEST_ORIGIN)
    throw new Error("Set TEST_ORIGIN to the deployment being checked.");
}
