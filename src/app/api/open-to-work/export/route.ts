import { NextRequest, NextResponse } from "next/server";
import {
    searchAndVerifyOpenToWorkCandidates,
    convertCandidatesToCsv,
} from "@/lib/services/apify/open-to-work";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { role, location, count = 10, format = "csv" } = body;

        if (!role || typeof role !== "string" || role.trim().length === 0) {
            return NextResponse.json(
                { error: "Please provide a Job Role / Title to search." },
                { status: 400 }
            );
        }

        // 1. Dhoondho aur Apify se Open to Work verify karo
        const candidates = await searchAndVerifyOpenToWorkCandidates({
            role: role.trim(),
            location: location?.trim() || "United States",
            count: Number(count) || 10,
        });

        // 2. Agar frontend ko screen par table preview ke liye JSON chahiye
        if (format === "json") {
            return NextResponse.json({
                total: candidates.length,
                openToWorkCount: candidates.filter((c) => c.isOpenToWork).length,
                candidates,
            });
        }

        // 3. Direct CSV file download response
        const csvData = convertCandidatesToCsv(candidates);
        const cleanRole = role.toLowerCase().replace(/[^a-z0-9]/g, "-");
        const filename = `open-to-work-${cleanRole}-${new Date().toISOString().split("T")[0]}.csv`;

        return new NextResponse(csvData, {
            status: 200,
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="${filename}"`,
            },
        });
    } catch (error) {
        console.error("[Open to Work Search Route Error]:", error);
        const message = error instanceof Error ? error.message : "Search failed";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
