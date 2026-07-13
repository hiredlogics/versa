"use client";

import { useState, useEffect } from "react";
import { Plus, MessageSquare, Trash2, Users, Loader2 } from "lucide-react";
import clsx from "clsx";

export interface ConversationSummary {
  id: string;
  title: string;
  industry: string | null;
  openToWork: boolean;
  leadCount: number;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ChatHistorySidebarProps {
  activeId: string | null;
  pendingIds?: string[];
  onSelect: (id: string) => void;
  onNewChat: () => void;
  refreshKey?: number;
}

export default function ChatHistorySidebar({
  activeId,
  pendingIds = [],
  onSelect,
  onNewChat,
  refreshKey = 0,
}: ChatHistorySidebarProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadHistory();
  }, [refreshKey]);

  async function loadHistory() {
    try {
      const res = await fetch("/api/chat");
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm("Delete this conversation?")) return;
    await fetch(`/api/chat?id=${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) onNewChat();
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  return (
    <aside className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex flex-col">
      <div className="p-3 border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-800 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {loading ? (
          <p className="text-xs text-gray-400 px-3 py-2">Loading history...</p>
        ) : conversations.length === 0 ? (
          <p className="text-xs text-gray-400 px-3 py-2">No conversations yet</p>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.id}
              type="button"
              onClick={() => onSelect(conv.id)}
              className={clsx(
                "w-full group flex items-start gap-2 px-3 py-2.5 rounded-lg text-left transition-colors",
                activeId === conv.id
                  ? "bg-emerald-100 dark:bg-emerald-900/30"
                  : "hover:bg-gray-100 dark:hover:bg-gray-800"
              )}
            >
              <MessageSquare
                className={clsx(
                  "w-4 h-4 mt-0.5 flex-shrink-0",
                  activeId === conv.id ? "text-emerald-600" : "text-gray-400"
                )}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p
                    className={clsx(
                      "text-sm truncate flex-1",
                      activeId === conv.id
                        ? "font-medium text-emerald-800 dark:text-emerald-300"
                        : "text-gray-700 dark:text-gray-300"
                    )}
                  >
                    {conv.title}
                  </p>
                  {pendingIds.includes(conv.id) && (
                    <Loader2 className="w-3 h-3 animate-spin text-emerald-600 flex-shrink-0" />
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {conv.industry && conv.industry !== "Any" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      {conv.industry}
                    </span>
                  )}
                  {conv.openToWork && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                      Open to work
                    </span>
                  )}
                  <span className="text-xs text-gray-400">{formatDate(conv.updatedAt)}</span>
                  {conv.leadCount > 0 && (
                    <span className="text-xs text-gray-400 flex items-center gap-0.5">
                      <Users className="w-3 h-3" />
                      {conv.leadCount}
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => handleDelete(e, conv.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
