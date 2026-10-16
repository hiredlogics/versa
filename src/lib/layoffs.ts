import layoffsJson from "../../data/layoffs.json";
import type { LayoffRecord } from "@/lib/open-to-work-score";

/**
 * Company layoffs from data/layoffs.json (fill it with `npm run layoffs:import -- file.csv`).
 * Imported, not read from disk, so it ships with the build on every server.
 */
export const LAYOFFS: LayoffRecord[] = (layoffsJson as unknown[]).filter(
  (entry): entry is LayoffRecord =>
    typeof entry === "object" &&
    entry !== null &&
    typeof (entry as LayoffRecord).company === "string" &&
    typeof (entry as LayoffRecord).date === "string"
);
