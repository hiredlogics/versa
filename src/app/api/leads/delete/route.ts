import { NextRequest, NextResponse } from "next/server";
import { deleteLead, clearAllLeads } from "@/lib/storage";

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const clearAll = searchParams.get("clearAll");

    if (clearAll === "true") {
      clearAllLeads();
      return NextResponse.json({ success: true, message: "All leads cleared" });
    }

    if (!id) {
      return NextResponse.json({ error: "Lead ID is required" }, { status: 400 });
    }

    deleteLead(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete lead";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
