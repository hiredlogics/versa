import { NextRequest, NextResponse } from "next/server";
import { getAllLeads } from "@/lib/storage";
import { leadsToCSV, leadsToExcelBuffer } from "@/lib/export";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "csv";
    const leads = getAllLeads();

    if (leads.length === 0) {
      return NextResponse.json({ error: "No leads to export" }, { status: 404 });
    }

    if (format === "xlsx") {
      const buffer = await leadsToExcelBuffer(leads);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="leads-${Date.now()}.xlsx"`,
        },
      });
    }

    const csv = leadsToCSV(leads);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="leads-${Date.now()}.csv"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
