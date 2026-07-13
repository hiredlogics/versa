import fs from "fs";
import path from "path";

const ENV_LOCAL = path.join(process.cwd(), ".env.local");
const ENV_DEFAULT = path.join(process.cwd(), ".env");
const ENV_FILE = ENV_LOCAL;

export interface EnvKeys {
  APOLLO_API_KEY: string;
  GROQ_API_KEY: string;
  OPENAI_API_KEY: string;
}

export function resolveEnvKey(key: keyof EnvKeys): string {
  const live = process.env[key]?.trim();
  if (live) return live;

  const fileValue = readEnvKeys()[key]?.trim();
  if (fileValue) {
    process.env[key] = fileValue;
    return fileValue;
  }

  return "";
}

export function getApiKeysStatus(): { apollo: boolean; ai: boolean; provider: string } {
  const groqKey = resolveEnvKey("GROQ_API_KEY");
  const openaiKey = resolveEnvKey("OPENAI_API_KEY");
  const aiKey = groqKey || openaiKey;

  return {
    apollo: Boolean(resolveEnvKey("APOLLO_API_KEY")),
    ai: Boolean(aiKey),
    provider: groqKey || aiKey.startsWith("gsk_") ? "Groq" : openaiKey ? "OpenAI" : "None",
  };
}

export function saveApiKeys(keys: EnvKeys): void {
  let content = "";

  if (fs.existsSync(ENV_FILE)) {
    content = fs.readFileSync(ENV_FILE, "utf-8");
  }

  const updates: Record<string, string> = {
    APOLLO_API_KEY: keys.APOLLO_API_KEY,
    GROQ_API_KEY: keys.GROQ_API_KEY,
    OPENAI_API_KEY: keys.OPENAI_API_KEY,
  };

  for (const [key, value] of Object.entries(updates)) {
    if (!value) continue;
    const regex = new RegExp(`^${key}=.*$`, "m");
    const line = `${key}=${value}`;
    if (regex.test(content)) {
      content = content.replace(regex, line);
    } else {
      content += content.endsWith("\n") || content === "" ? "" : "\n";
      content += `${line}\n`;
    }
  }

  fs.writeFileSync(ENV_FILE, content.trim() + "\n");

  process.env.APOLLO_API_KEY = keys.APOLLO_API_KEY?.trim() || process.env.APOLLO_API_KEY;
  process.env.GROQ_API_KEY = keys.GROQ_API_KEY?.trim() || process.env.GROQ_API_KEY;
  process.env.OPENAI_API_KEY = keys.OPENAI_API_KEY?.trim() || process.env.OPENAI_API_KEY;
}

function parseEnvFile(filePath: string): Partial<EnvKeys> {
  const result: Partial<EnvKeys> = {};
  if (!fs.existsSync(filePath)) return result;

  const content = fs.readFileSync(filePath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    const value = rest.join("=").trim().replace(/^["']|["']$/g, "");
    if (key === "APOLLO_API_KEY" && value) result.APOLLO_API_KEY = value;
    if (key === "GROQ_API_KEY" && value) result.GROQ_API_KEY = value;
    if (key === "OPENAI_API_KEY" && value) result.OPENAI_API_KEY = value;
  }
  return result;
}

export function readEnvKeys(): Partial<EnvKeys> {
  // .env first, then .env.local overrides (matches Next.js precedence)
  return { ...parseEnvFile(ENV_DEFAULT), ...parseEnvFile(ENV_LOCAL) };
}

export function maskKey(key: string | undefined): string {
  if (!key || key.length < 8) return key ? "••••••••" : "";
  return key.slice(0, 4) + "••••" + key.slice(-4);
}
