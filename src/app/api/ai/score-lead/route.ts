import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/get-current-user";
import { scoreLeadsWithAi } from "@/lib/services/ai/scoreLead";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { leads, searchIntent, keywords } = await request.json();
    if (!Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json({ error: "Leads array required" }, { status: 400 });
    }
    const result = await scoreLeadsWithAi(
      leads,
      { searchIntent, keywords },
      { userId: user.id }
    );
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Score failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
