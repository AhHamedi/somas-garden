// A Drive is the writable working copy. A stopped workspace can give its slot
// to another browser after its entire data directory has a verified private copy.
import { Drive, Sandbox } from "@vercel/sandbox";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { db } from "./db.mjs";

const bucket = "selforg-society-archives";
const chunkBytes = 4 * 1024 * 1024;
const region = "lhr1";
const namePattern = /^amoeboids-[pv]-[a-f0-9]{32}$/;

function state(name, action, lease, archive = null) {
  return db("rpc/selforg_volume_state", {
    method: "POST",
    body: { p_name: name, p_action: action, p_lease: lease, p_archive: archive },
  });
}

function status(error) {
  return error.response?.status ?? error.status;
}
async function existing(get) {
  try {
    return await get();
  } catch (error) {
    if (status(error) === 404) return null;
    throw error;
  }
}
export function storageFull(error) {
  return (
    (status(error) === 402 || /Status code 402/.test(error.message)) &&
    /drive storage|snapshots storage/i.test(error.message)
  );
}
async function object(path, method, body) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(
    process.env.SUPABASE_URL + "/storage/v1/object/" + bucket + path,
    {
      method,
      body,
      headers: {
        apikey: key,
        Authorization: "Bearer " + key,
        ...(body
          ? {
              "Content-Type":
                method === "DELETE" ? "application/json" : "application/octet-stream",
            }
          : {}),
      },
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok)
    throw new Error("Private workspace storage returned " + response.status);
  return response;
}
function part(i) {
  return "part-" + String(i).padStart(5, "0");
}
function pathFor(name, manifest, i) {
  return name + "/" + manifest.generation + "/" + part(i);
}
async function removeParts(name, manifest) {
  const prefixes = Array.from({ length: manifest.count }, (_, i) =>
    pathFor(name, manifest, i),
  );
  if (prefixes.length) await object("", "DELETE", JSON.stringify({ prefixes }));
}
async function command(vm, script, args = []) {
  const result = await vm.runCommand({
    cmd: "bash",
    args: ["-euc", script, "archive", ...args],
  });
  if (result.exitCode !== 0)
    throw new Error(
      "Workspace file transfer failed: " + (await result.stderr()).slice(0, 180),
    );
  return (await result.stdout()).trim();
}
async function withTransferVM(drive, readOnly, work) {
  const vm = await Sandbox.create({
    region,
    runtime: "node22",
    persistent: false,
    networkPolicy: "deny-all",
    resources: { vcpus: 1 },
    timeout: 150000,
    mounts: { "/data": readOnly ? drive.snapshot() : drive },
  });
  try {
    return await work(vm);
  } finally {
    await vm.stop();
  }
}
async function backup(drive) {
  const manifest = { generation: randomUUID(), count: 0, sha256: "" };
  try {
    await withTransferVM(drive, true, async (vm) => {
      // Include every file on the volume including uploaded strategy executables.
      const output = await command(
        vm,
        `mkdir /tmp/pack
        tar --exclude=./lost+found --exclude=./boot.lock -czf /tmp/archive -C /data .
        split -b 4194304 -d -a 5 /tmp/archive /tmp/pack/part-
        sha256sum /tmp/archive | cut -d' ' -f1
        ls /tmp/pack | wc -l`,
      );
      const [digest, n] = output.split(/\s+/);
      const count = Number(n);
      if (
        !/^[0-9a-f]{64}$/.test(digest) ||
        !Number.isInteger(count) ||
        count < 1 ||
        count > 260
      )
        throw new Error("Invalid workspace archive");
      const verified = createHash("sha256");
      for (let i = 0; i < count; i++) {
        const bytes = await vm.readFileToBuffer({ path: "/tmp/pack/" + part(i) });
        if (!bytes?.length || bytes.length > chunkBytes)
          throw new Error("Incomplete workspace archive");
        const path = "/" + pathFor(drive.name, manifest, i);
        await object(path, "POST", bytes);
        manifest.count++;
        const downloaded = await object(path, "GET");
        verified.update(Buffer.from(await downloaded.arrayBuffer()));
      }
      if (verified.digest("hex") !== digest)
        throw new Error("Workspace backup did not verify");
      manifest.sha256 = digest;
    });
    return manifest;
  } catch (error) {
    await removeParts(drive.name, manifest).catch(() => {});
    throw error;
  }
}
async function restore(drive, archive) {
  await withTransferVM(drive, false, async (vm) => {
    await command(vm, "mkdir /tmp/parts");
    for (let i = 0; i < archive.count; i++) {
      const res = await object("/" + pathFor(drive.name, archive, i), "GET");
      await vm.writeFiles([
        { path: "/tmp/parts/" + part(i), content: Buffer.from(await res.arrayBuffer()) },
      ]);
    }
    // Restore into a fresh Drive only. A retry reapplies the same verified archive before marking it ready.
    await command(
      vm,
      `cat /tmp/parts/part-* > /tmp/archive
      echo "$1  /tmp/archive" | sha256sum -c - >/dev/null
      tar -xzf /tmp/archive --no-same-owner --no-overwrite-dir -C /data
      sync`,
      [archive.sha256],
    );
  });
}

// Cold is published before deleting the hot copy. A retry can distinguish the
// verified original Drive from a newly allocated, partially restored Drive.
export async function parkVolume(name) {
  if (!namePattern.test(name)) throw new Error("Invalid workspace name");
  const lease = randomUUID();
  const claim = await state(name, "park", lease);
  if (claim.state !== "locked") return false;
  try {
    const drive = await existing(() => Drive.get({ name }));
    if (!drive || drive.currentSessionId) return false;
    const vm = await existing(() => Sandbox.get({ name, resume: false }));
    if (vm && vm.status !== "stopped") return false;
    if (!claim.archive) {
      const archive = await backup(drive);
      await state(name, "record", lease, { ...archive, driveId: drive.driveId });
    }
    if (vm) await vm.delete({ deleteOrphanSnapshots: true });
    await drive.delete();
    return true;
  } finally {
    await state(name, "release", lease);
  }
}

export async function freeIdleVolume(name) {
  const { drives } = await Drive.list({
    limit: 50,
    sortBy: "updatedAt",
    sortOrder: "asc",
  });
  for (const d of drives) {
    if (
      d.name === name ||
      !namePattern.test(d.name) ||
      d.name.split("-")[1] !== name.split("-")[1] ||
      d.currentSessionId
    )
      continue;
    try {
      if (await parkVolume(d.name)) return true;
    } catch (error) {
      console.error("Could not archive idle workspace:", error.message);
    }
  }
  return false;
}

async function allocate(name) {
  const create = () => Drive.getOrCreate({ name, region, maxSize: 1024 ** 3 });
  try {
    return await create();
  } catch (error) {
    if (!storageFull(error) || !(await freeIdleVolume(name))) throw error;
    return create();
  }
}

export async function workspaceDrive(name, allowCreate) {
  const lease = randomUUID();
  for (let i = 0; i < 45; i++) {
    const claim = await state(name, "access", lease);
    if (claim.state === "busy") {
      await delay(800);
      continue;
    }
    if (claim.state === "ready") {
      const drive = await existing(() => Drive.get({ name }));
      return drive || (allowCreate ? await allocate(name) : null);
    }
    if (claim.state !== "locked" || !claim.archive)
      throw new Error("Invalid workspace state");
    try {
      const drive = (await existing(() => Drive.get({ name }))) || (await allocate(name));
      if (drive.driveId !== claim.archive.driveId) await restore(drive, claim.archive);
      await state(name, "activate", lease);
      await removeParts(name, claim.archive).catch((error) =>
        console.error("Could not retire restored archive:", error.message),
      );
      return drive;
    } finally {
      await state(name, "release", lease);
    }
  }
  throw new Error("Workspace storage is busy");
}
