import { cp, copyFile, rm } from "node:fs/promises";

await rm("hosted-public", { recursive: true, force: true });
await cp("public", "hosted-public", { recursive: true });
await copyFile("public/index.html", "hosted-public/legacy.html");
await copyFile("public/society.html", "hosted-public/index.html");
