import { NextRequest, NextResponse } from "next/server";
import { getConversation } from "@/lib/storage";
import { leadsToCSV, leadsToExcelBuffer } from "@/lib/export";

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
    const safeTitle = conversation.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 40);

    if (format === "xlsx") {
      const buffer = await leadsToExcelBuffer(leads);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${safeTitle}-${leads.length}-leads.xlsx"`,
        },
      });
    }

    const csv = leadsToCSV(leads);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${safeTitle}-${leads.length}-leads.csv"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
