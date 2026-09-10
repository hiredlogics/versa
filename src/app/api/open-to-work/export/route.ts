import { NextRequest, NextResponse } from "next/server";
import {
  MAX_OPEN_TO_WORK_SCAN,
  searchAndVerifyOpenToWorkCandidates,
  convertCandidatesToCsv,
} from "@/lib/services/apify/open-to-work";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { role, location, count = 10, format = "json", enrichLinkedInUrls, enrichLimit } = body;

    if (!role || typeof role !== "string" || role.trim().length === 0) {
      return NextResponse.json(
        { error: "Please provide a job role to search." },
        { status: 400 }
      );
    }

    const requestedCount = Math.min(Math.max(Number(count) || 10, 1), MAX_OPEN_TO_WORK_SCAN);
    const result = await searchAndVerifyOpenToWorkCandidates({
      role: role.trim(),
      location: location?.trim() || "United States",
      count: requestedCount,
      enrichLinkedInUrls: enrichLinkedInUrls === true,
      enrichLimit: Number(enrichLimit),
    });
    const { candidates } = result;

    if (format === "json") {
      return NextResponse.json({
        total: candidates.length,
        openToWorkCount: candidates.length,
        scanned: result.scanned,
        scanLimit: result.scanLimit,
        enrichedForLinkedInUrl: result.enrichedForLinkedInUrl,
        candidates,
      });
    }

    // CSV download
    const csv = convertCandidatesToCsv(candidates);
    const cleanRole = role.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const filename = `open-to-work-${cleanRole}-${new Date().toISOString().split("T")[0]}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[Open to Work Export Error]:", error);
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
