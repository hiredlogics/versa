import { NextRequest, NextResponse } from "next/server";
import {
  searchAndVerifyOpenToWorkCandidates,
  convertCandidatesToCsv,
} from "@/lib/services/apify/open-to-work";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { role, location, count = 10, format = "json" } = body;

    if (!role || typeof role !== "string" || role.trim().length === 0) {
      return NextResponse.json(
        { error: "Please provide a job role to search." },
        { status: 400 }
      );
    }

    const requestedCount = Math.min(Math.max(Number(count) || 10, 1), 1000);
    const candidates = await searchAndVerifyOpenToWorkCandidates({
      role: role.trim(),
      location: location?.trim() || "United States",
      count: requestedCount,
      skipApify: requestedCount > 25,
    });

    if (format === "json") {
      return NextResponse.json({
        total: candidates.length,
        openToWorkCount: candidates.filter((c) => c.isOpenToWork).length,
        candidates,
      });
    }

    // CSV download
    const csv = convertCandidatesToCsv(
      candidates.filter((candidate) => candidate.isOpenToWork)
    );
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
