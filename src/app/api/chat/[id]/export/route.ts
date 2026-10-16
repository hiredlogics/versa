import { NextRequest, NextResponse } from "next/server";
import { getConversation } from "@/lib/storage";
import { leadsToAtsCSV, leadsToCSV, leadsToExcelBuffer, slugify } from "@/lib/export";
import { BRAND } from "@/config/brand";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const conversation = getConversation(id);

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const leads = conversation.leads;
    if (leads.length === 0) {
      return NextResponse.json({ error: "No leads in this conversation" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") || "csv";
    const csvFormat = format === "ats" ? "ats" : "standard";
    const safeTitle = slugify(conversation.title, 40) || "leads";

    if (format === "xlsx") {
      const buffer = await leadsToExcelBuffer(leads);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${safeTitle}-${leads.length}-leads.xlsx"`,
        },
      });
    }

    const csv = csvFormat === "ats" ? leadsToAtsCSV(leads) : leadsToCSV(leads);
    const date = new Date().toISOString().slice(0, 10);
    const filename = [BRAND.slug, safeTitle, csvFormat === "ats" ? "ats" : null, date]
      .filter(Boolean)
      .join("-");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}.csv"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
