import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-current-user";
import { exportUserLeads } from "@/lib/services/leads/exportLeads";
import { BRAND } from "@/config/brand";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const searchId = searchParams.get("searchId") || undefined;

    const result = await exportUserLeads({ userId: user.id, searchId, format: "csv" });
    if (!result) return NextResponse.json({ error: "No leads to export" }, { status: 404 });

    return new NextResponse(result.csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${BRAND.slug}-leads-${result.count}.csv"`,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Export failed";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
