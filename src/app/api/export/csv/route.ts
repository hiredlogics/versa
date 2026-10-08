import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-current-user";
import { exportUserLeads } from "@/lib/services/leads/exportLeads";
import { BRAND } from "@/config/brand";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const searchId = searchParams.get("searchId") || undefined;
    const csvFormat = searchParams.get("format") === "ats" ? "ats" : "standard";

    const result = await exportUserLeads({ userId: user.id, searchId, format: "csv", csvFormat });
    if (!result) return NextResponse.json({ error: "No leads to export" }, { status: 404 });

    const date = new Date().toISOString().slice(0, 10);
    const name = [BRAND.slug, result.fileTag ?? "leads", csvFormat === "ats" ? "ats" : null, date]
      .filter(Boolean)
      .join("-");

    return new NextResponse(result.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}.csv"`,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Export failed";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
