import fs from "node:fs";
import path from "node:path";

interface LayoffEntry {
  company: string;
  date: string;
  source?: string;
}

const LAYOFFS_FILE = path.resolve(process.cwd(), "data", "layoffs.json");

export async function importLayoffs(filePathOrUrl?: string) {
  let entries: LayoffEntry[] = [];

  if (filePathOrUrl && fs.existsSync(filePathOrUrl)) {
    const raw = fs.readFileSync(filePathOrUrl, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      entries = parsed;
    }
  } else if (filePathOrUrl && filePathOrUrl.startsWith("http")) {
    const res = await fetch(filePathOrUrl);
    if (res.ok) {
      const parsed = await res.json();
      if (Array.isArray(parsed)) {
        entries = parsed;
      }
    }
  } else {
    // Read existing or create empty array
    if (fs.existsSync(LAYOFFS_FILE)) {
      try {
        const raw = fs.readFileSync(LAYOFFS_FILE, "utf-8");
        entries = JSON.parse(raw);
      } catch {
        entries = [];
      }
    }
  }

  // Ensure data directory exists
  const dir = path.dirname(LAYOFFS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(LAYOFFS_FILE, JSON.stringify(entries, null, 2) + "\n", "utf-8");
  console.log(`Saved ${entries.length} layoff entries to ${LAYOFFS_FILE}`);
}

if (process.argv[1]?.endsWith("import-layoffs.ts")) {
  const target = process.argv[2];
  importLayoffs(target).catch((err) => {
    console.error("Failed to import layoffs:", err);
    process.exit(1);
  });
}
