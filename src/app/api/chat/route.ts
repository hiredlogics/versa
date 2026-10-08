import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import {
  getAllConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
  findSimilarConversation,
  mergeLeadsIntoConversation,
  migrateSessionsToConversations,
} from "@/lib/storage";
import {
  classifyChatIntent,
  generateConversationTitle,
  generateFollowUpResponse,
  generateGeneralResponse,
} from "@/lib/chat";
import { runLeadSearch } from "@/lib/lead-search";
import type { ChatMessage } from "@/lib/types";

export const maxDuration = 300;

export async function GET() {
  try {
    migrateSessionsToConversations();
    const conversations = getAllConversations().map((c) => {
      const searchMsg = c.messages.find((m) => m.type === "search" && m.session?.criteria);
      const criteria = searchMsg?.session?.criteria;
      return {
        id: c.id,
        title: c.title,
        industry: criteria?.industry || null,
        openToWork: criteria?.openToWork || false,
        leadCount: c.leads.length,
        messageCount: c.messages.length,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });
    return NextResponse.json({ conversations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { conversationId, message, forceSearch = false } = body as {
      conversationId?: string;
      message: string;
      forceSearch?: boolean;
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const userText = message.trim();
    let conversation = conversationId ? getConversation(conversationId) : null;

    if (!conversation) {
      const title = await generateConversationTitle(userText);
      conversation = createConversation(title);
    }

    const userMessage: ChatMessage = {
      id: randomUUID(),
      role: "user",
      content: userText,
      type: "text",
      createdAt: new Date().toISOString(),
    };
    conversation.messages.push(userMessage);

    // Check for similar existing conversation (different chat)
    const similar = !forceSearch ? findSimilarConversation(userText, conversation.id) : null;

    const intentResult = await classifyChatIntent(userText, conversation, Boolean(similar));

    let assistantMessage: ChatMessage;

    // Duplicate search in another conversation
    if (
      similar &&
      intentResult.intent === "lead_search" &&
      !forceSearch &&
      conversation.leads.length === 0
    ) {
      assistantMessage = {
        id: randomUUID(),
        role: "assistant",
        content: `You already searched for something similar in **"${similar.title}"** (${similar.leads.length} leads found).\n\nWould you like to open that conversation, or run a fresh search anyway?`,
        type: "duplicate",
        duplicateOf: { conversationId: similar.id, title: similar.title },
        createdAt: new Date().toISOString(),
      };
    }
    // Follow-up on existing leads
    else if (intentResult.intent === "follow_up") {
      if (conversation.leads.length === 0) {
        assistantMessage = {
          id: randomUUID(),
          role: "assistant",
          content:
            "I don't have any leads in this conversation yet. First, tell me who you want to find, for example: *Find SaaS founders in the US at 10 to 500 employee companies*, then I can help you with outreach, emails, and messaging.",
          type: "text",
          createdAt: new Date().toISOString(),
        };
      } else {
        const reply = await generateFollowUpResponse(userText, conversation);
        assistantMessage = {
          id: randomUUID(),
          role: "assistant",
          content: reply,
          type: "follow_up",
          createdAt: new Date().toISOString(),
        };
      }
    }
    // New lead search
    else if (intentResult.intent === "lead_search" || forceSearch) {
      console.log("[chat] Running lead search...");
      const { session, message: searchMessage } = await runLeadSearch(userText, undefined, {
        conversationId: conversation.id,
        conversationTitle: conversation.title,
      });
      mergeLeadsIntoConversation(conversation, session.leads);

      assistantMessage = {
        id: randomUUID(),
        role: "assistant",
        content: searchMessage.replace(/\*\*/g, ""),
        type: "search",
        session,
        createdAt: new Date().toISOString(),
      };

      if (conversation.messages.filter((m) => m.role === "user").length === 1) {
        conversation.title = await generateConversationTitle(userText);
      }
    }
    // General chat
    else {
      const reply = await generateGeneralResponse(userText, conversation);
      assistantMessage = {
        id: randomUUID(),
        role: "assistant",
        content: reply,
        type: "text",
        createdAt: new Date().toISOString(),
      };
    }

    conversation.messages.push(assistantMessage);
    updateConversation(conversation);

    return NextResponse.json({
      conversation,
      userMessage,
      assistantMessage,
      intent: intentResult.intent,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Chat failed";
    console.error("[chat] Error:", msg);

    if (msg.includes("tokens per day") || msg.includes("TPD")) {
      return NextResponse.json(
        {
          error:
            "Groq daily token limit reached. Searches now use scoring based on fixed rules (no AI tokens). Wait ~15 minutes or upgrade at console.groq.com. Try your search again.",
        },
        { status: 429 }
      );
    }

    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });
  deleteConversation(id);
  return NextResponse.json({ success: true });
}
