import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function goBinary() {
  if (process.env.GO_BINARY) return resolveIfPath(process.env.GO_BINARY);
  const local = resolve(
    ".tools/go/bin/" + (process.platform === "win32" ? "go.exe" : "go"),
  );
  return existsSync(local) ? local : "go";
}
function resolveIfPath(value) {
  return /[\\/]/.test(value) ? resolve(value) : value;
}
