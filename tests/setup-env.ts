// Load .env then .env.local into process.env for every vitest worker.
// (@next/env skips .env.local when NODE_ENV=test, which vitest sets, so we
// parse the files directly. Existing process.env values always win.)
import fs from "fs";
import path from "path";

for (const file of [".env", ".env.local"]) {
  const filePath = path.join(process.cwd(), file);
  if (!fs.existsSync(filePath)) continue;
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
