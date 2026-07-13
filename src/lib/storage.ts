import fs from "fs";
import path from "path";
import type { ChatConversation, ChatMessage, LeadSearchSession, ScoredLead } from "./types";
import { randomUUID } from "crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const LEADS_FILE = path.join(DATA_DIR, "leads.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const CONVERSATIONS_FILE = path.join(DATA_DIR, "conversations.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJsonFile<T>(filePath: string, defaultValue: T): T {
  ensureDataDir();
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
    return defaultValue;
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  try {
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

function writeJsonFile<T>(filePath: string, data: T) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function getAllLeads(): ScoredLead[] {
  return readJsonFile<ScoredLead[]>(LEADS_FILE, []);
}

export function saveLeads(
  leads: ScoredLead[],
  meta?: { searchPrompt?: string; searchTitle?: string; conversationId?: string; conversationTitle?: string }
): ScoredLead[] {
  const existing = getAllLeads();
  const existingMap = new Map(existing.map((l) => [l.id, l]));
  const now = new Date().toISOString();

  for (const lead of leads) {
    const prev = existingMap.get(lead.id);
    const historyEntry = {
      action: prev ? "Updated from search" : "Found in search",
      searchPrompt: meta?.searchPrompt || lead.searchPrompt,
      conversationTitle: meta?.conversationTitle,
      conversationId: meta?.conversationId,
      timestamp: now,
    };

    const merged: ScoredLead = {
      ...(prev || lead),
      ...lead,
      hasEmail: Boolean(lead.email),
      history: [...(prev?.history || []), historyEntry],
      updatedAt: now,
      createdAt: prev?.createdAt || lead.createdAt || now,
      searchTitle: meta?.searchTitle || lead.searchTitle || prev?.searchTitle,
    };

    existingMap.set(lead.id, merged);
  }

  const merged = Array.from(existingMap.values()).sort(
    (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
  );
  writeJsonFile(LEADS_FILE, merged);
  return merged;
}

export function getAllSessions(): LeadSearchSession[] {
  return readJsonFile<LeadSearchSession[]>(SESSIONS_FILE, []);
}

export function saveSession(
  session: LeadSearchSession,
  meta?: { conversationId?: string; conversationTitle?: string }
): LeadSearchSession {
  const sessions = getAllSessions();
  sessions.unshift(session);
  writeJsonFile(SESSIONS_FILE, sessions.slice(0, 100));
  if (session.leads.length > 0) {
    saveLeads(session.leads, {
      searchPrompt: session.prompt,
      searchTitle: session.title || session.criteria.summary,
      conversationId: meta?.conversationId,
      conversationTitle: meta?.conversationTitle,
    });
  }
  return session;
}

export function deleteLead(id: string): boolean {
  const leads = getAllLeads().filter((l) => l.id !== id);
  writeJsonFile(LEADS_FILE, leads);
  return true;
}

export function clearAllLeads(): void {
  writeJsonFile(LEADS_FILE, []);
}

// --- Chat conversations ---

export function getAllConversations(): ChatConversation[] {
  return readJsonFile<ChatConversation[]>(CONVERSATIONS_FILE, []).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

/** Migrate legacy sessions.json into conversations if none exist yet */
export function migrateSessionsToConversations(): void {
  const existing = readJsonFile<ChatConversation[]>(CONVERSATIONS_FILE, []);
  if (existing.length > 0) return;

  const sessions = getAllSessions();
  if (sessions.length === 0) return;

  const conversations: ChatConversation[] = sessions.map((session) => {
    const title =
      session.criteria?.summary ||
      session.prompt.slice(0, 50) + (session.prompt.length > 50 ? "..." : "");

    const userMsg: ChatMessage = {
      id: randomUUID(),
      role: "user",
      content: session.prompt,
      type: "text",
      createdAt: session.createdAt,
    };

    const assistantMsg: ChatMessage = {
      id: randomUUID(),
      role: "assistant",
      content: `Found ${session.leads.length} high-quality leads.`,
      type: "search",
      session,
      createdAt: session.createdAt,
    };

    return {
      id: randomUUID(),
      title,
      messages: [userMsg, assistantMsg],
      leads: session.leads,
      createdAt: session.createdAt,
      updatedAt: session.createdAt,
    };
  });

  writeJsonFile(CONVERSATIONS_FILE, conversations);
}

export function getConversation(id: string): ChatConversation | null {
  return getAllConversations().find((c) => c.id === id) || null;
}

export function createConversation(title = "New chat"): ChatConversation {
  const now = new Date().toISOString();
  const conversation: ChatConversation = {
    id: randomUUID(),
    title,
    messages: [],
    leads: [],
    createdAt: now,
    updatedAt: now,
  };
  const conversations = getAllConversations();
  conversations.unshift(conversation);
  writeJsonFile(CONVERSATIONS_FILE, conversations);
  return conversation;
}

export function updateConversation(conversation: ChatConversation): ChatConversation {
  const conversations = getAllConversations();
  const index = conversations.findIndex((c) => c.id === conversation.id);
  conversation.updatedAt = new Date().toISOString();

  if (index >= 0) {
    conversations[index] = conversation;
  } else {
    conversations.unshift(conversation);
  }

  writeJsonFile(
    CONVERSATIONS_FILE,
    conversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  );
  return conversation;
}

export function deleteConversation(id: string): boolean {
  const conversations = getAllConversations().filter((c) => c.id !== id);
  writeJsonFile(CONVERSATIONS_FILE, conversations);
  return true;
}

export function addMessageToConversation(
  conversationId: string,
  message: ChatMessage
): ChatConversation | null {
  const conversation = getConversation(conversationId);
  if (!conversation) return null;

  conversation.messages.push(message);
  conversation.updatedAt = new Date().toISOString();
  return updateConversation(conversation);
}

export function mergeLeadsIntoConversation(
  conversation: ChatConversation,
  newLeads: ScoredLead[]
): ScoredLead[] {
  const existingIds = new Set(conversation.leads.map((l) => l.id));
  const merged = [...conversation.leads];
  for (const lead of newLeads) {
    if (!existingIds.has(lead.id)) {
      merged.push(lead);
      existingIds.add(lead.id);
    }
  }
  conversation.leads = merged.sort((a, b) => b.score - a.score);
  return conversation.leads;
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function similarityScore(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  const wordsA = new Set(na.split(" ").filter((w) => w.length > 3));
  const wordsB = new Set(nb.split(" ").filter((w) => w.length > 3));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  return overlap / Math.max(wordsA.size, wordsB.size);
}

export function findSimilarConversation(
  prompt: string,
  excludeId?: string
): ChatConversation | null {
  const conversations = getAllConversations();
  let best: ChatConversation | null = null;
  let bestScore = 0;

  for (const conv of conversations) {
    if (conv.id === excludeId) continue;

    const firstUserMsg = conv.messages.find((m) => m.role === "user");
    const compareText = firstUserMsg?.content || conv.title;
    const score = similarityScore(prompt, compareText);

    if (score > bestScore && score >= 0.7) {
      bestScore = score;
      best = conv;
    }

    for (const msg of conv.messages) {
      if (msg.type === "search" && msg.session?.prompt) {
        const sessionScore = similarityScore(prompt, msg.session.prompt);
        if (sessionScore > bestScore && sessionScore >= 0.7) {
          bestScore = sessionScore;
          best = conv;
        }
      }
    }
  }

  return best;
}
