import { Sandbox } from "@vercel/sandbox";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
const wrapper = () => readFile(new URL("../runner/wrapper.go", import.meta.url));
const work = "/vercel/work";
export function validateSource(source) {
  if (typeof source !== "string" || Buffer.byteLength(source) > 20480)
    throw new Error("Choose a .go file smaller than 20 KB.");
  if (!/^\s*package\s+main\b/m.test(source) || !/func\s+Decide\s*\(/.test(source))
    throw new Error("Use the example: package main with func Decide(v View) Action.");
  if (/func\s+main\s*\(/.test(source))
    throw new Error("Upload your Decide function; the game supplies main for you.");
}
export function sourceVersion(source) {
  const directive = source
    .split(/^\s*package\s+main\b/m, 1)[0]
    .match(/^\s*\/\/\s*somas:api=(\d+)\s*$/m);
  if (directive && !["1", "2"].includes(directive[1]))
    throw new Error("This Go API version is unavailable. Choose version 1 or 2.");
  return directive ? Number(directive[1]) : 1;
}

export async function startAgent(
  source,
  { probe = false, version = sourceVersion(source) } = {},
) {
  validateSource(source);
  if (!process.env.SELFORG_GO_SNAPSHOT)
    throw new Error("The Go runner is not configured.");
  const sandbox = await Sandbox.create({
    source: { type: "snapshot", snapshotId: process.env.SELFORG_GO_SNAPSHOT },
    region: "lhr1",
    ports: [3000],
    resources: { vcpus: 1 },
    timeout: probe ? 75000 : 120000,
    persistent: false,
    networkPolicy: "deny-all",
    signal: AbortSignal.timeout(20000),
  });
  try {
    await sandbox.writeFiles([
      { path: `${work}/agent.go`, content: Buffer.from(source) },
      { path: `${work}/wrapper.go`, content: await wrapper() },
      {
        path: `${work}/view.go`,
        content: await readFile(
          new URL(
            version === 2 ? "../runner/view2.go" : "../runner/view1.go",
            import.meta.url,
          ),
        ),
      },
    ]);
    const build = await sandbox.runCommand({
      cmd: "/vercel/go/bin/go",
      args: [
        "build",
        "-trimpath",
        "-ldflags=-s -w",
        "-o",
        `${work}/agent`,
        `${work}/agent.go`,
        `${work}/wrapper.go`,
        `${work}/view.go`,
      ],
      cwd: work,
      timeoutMs: 30000,
      env: {
        GOCACHE: "/vercel/gocache",
        GOPATH: "/vercel/gopath",
        GOTOOLCHAIN: "local",
        GOPROXY: "off",
        GO111MODULE: "off",
        CGO_ENABLED: "0",
        GOMAXPROCS: "1",
      },
    });
    if (build.exitCode !== 0) {
      const error = (await build.stderr()).slice(0, 5000);
      throw new Error(`Go compile error:\n${error.replaceAll(work + "/", "")}`);
    }
    const token = randomBytes(24).toString("hex");
    await sandbox.runCommand({
      cmd: `${work}/agent`,
      cwd: work,
      env: { AGENT_TOKEN: token, GOMAXPROCS: "1", GOMEMLIMIT: "128MiB" },
      detached: true,
    });
    const url = sandbox.domain(3000);
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        const r = await fetch(url + "/ready", {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(1000),
        });
        if (r.status === 204) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 150));
    }
    if (!ready)
      throw new Error(
        "Agent could not start. Check for an init function that blocks or crashes.",
      );
    if (probe) {
      let response;
      try {
        response = await fetch(url + "/decide", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            Round: 1,
            PatchFood: 60,
            Energy: 6,
            AgentCount: 6,
            LastFood: 0,
            LastEnergy: 0,
            Seed: 7,
            DailyFood: 1,
            Price: 2,
            FieldCapacity: 60,
            EnergyCapacity: 6,
            Sunlight: 6,
          }),
          signal: AbortSignal.timeout(1800),
        });
      } catch {
        throw new Error(
          "Agent took too long to decide. Keep each decision under one second.",
        );
      }
      if (!response.ok)
        throw new Error("Agent crashed while deciding. Check your Decide function.");
      const text = await response.text();
      if (text.length > 2048) throw new Error("Agent returned too much data.");
      let action;
      try {
        action = JSON.parse(text);
      } catch {
        throw new Error("Agent must return Action{Food: ..., Energy: ...}.");
      }
      if (!Number.isSafeInteger(action.Food) || !Number.isSafeInteger(action.Energy))
        throw new Error("Food and Energy must be integers.");
      await sandbox.stop();
      return null;
    }
    return { url, token, stop: () => sandbox.stop() };
  } catch (error) {
    await sandbox.stop().catch(() => {});
    throw error;
  }
}
