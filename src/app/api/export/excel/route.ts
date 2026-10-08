import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-current-user";
import { exportUserLeads } from "@/lib/services/leads/exportLeads";
import { BRAND } from "@/config/brand";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const searchId = searchParams.get("searchId") || undefined;

    const result = await exportUserLeads({ userId: user.id, searchId, format: "xlsx" });
    if (!result || !result.buffer) return NextResponse.json({ error: "No leads to export" }, { status: 404 });

    const date = new Date().toISOString().slice(0, 10);
    const name = [BRAND.slug, result.fileTag ?? "leads", date].join("-");

    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}.xlsx"`,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Export failed";
    return NextResponse.json({ error: msg }, { status: msg === "Unauthorized" ? 401 : 500 });
  }
}
