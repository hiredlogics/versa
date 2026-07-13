"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Sparkles,
  Loader2,
  Search,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import type { ChatConversation, ChatMessage } from "@/lib/types";
import LeadTable from "./LeadTable";
import ChatHistorySidebar from "./ChatHistorySidebar";

const EXAMPLE_PROMPTS = [
  "Find people open to work in SaaS — software engineers and product managers in the US",
  "Looking for job seekers open to opportunities in FinTech, must have email",
  "Find SaaS founders in the United States at 10-500 employee companies",
];

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi! I'm your AI Lead Finder. Tell me who you're looking for — founders, decision makers, or people **open to work**.\n\nI'll find leads via Apollo, **prioritize those with email**, score them, and save everything to history.\n\nThen keep chatting: draft outreach emails, LinkedIn messages, or help tailor your resume for outreach.",
  type: "text",
  createdAt: new Date().toISOString(),
};

export default function ChatInterface() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [conversationLeads, setConversationLeads] = useState<ChatConversation["leads"]>([]);
  const [title, setTitle] = useState("New chat");
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [pendingConversationIds, setPendingConversationIds] = useState<string[]>([]);
  const [historyRefresh, setHistoryRefresh] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    activeConversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const cancelPendingRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  }, []);

  const applyConversationToView = useCallback((conversation: ChatConversation) => {
    setConversationId(conversation.id);
    setTitle(conversation.title);
    setConversationLeads(conversation.leads || []);
    setMessages(conversation.messages.length > 0 ? conversation.messages : [WELCOME_MESSAGE]);
    setInput("");
  }, []);

  const startNewChat = useCallback(() => {
    cancelPendingRequest();
    setConversationId(null);
    setMessages([WELCOME_MESSAGE]);
    setConversationLeads([]);
    setTitle("New chat");
    setInput("");
    setIsLoadingChat(false);
  }, [cancelPendingRequest]);

  const loadConversation = useCallback(
    async (id: string) => {
      if (!id) return;
      cancelPendingRequest();
      setIsLoadingChat(true);

      try {
        const res = await fetch(`/api/chat/${encodeURIComponent(id)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load conversation");

        if (data.conversation && activeConversationIdRef.current === id) {
          applyConversationToView(data.conversation);
        }
      } catch (error) {
        console.error("Load conversation error:", error);
      } finally {
        setIsLoadingChat(false);
      }
    },
    [cancelPendingRequest, applyConversationToView]
  );

  async function sendMessage(text: string, options?: { forceSearch?: boolean }) {
    if (!text.trim() || isLoading) return;

    cancelPendingRequest();

    const startedConversationId = conversationId;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
      type: "text",
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    if (startedConversationId) {
      setPendingConversationIds((prev) =>
        prev.includes(startedConversationId) ? prev : [...prev, startedConversationId]
      );
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: startedConversationId,
          message: text.trim(),
          forceSearch: options?.forceSearch,
        }),
        signal: abortController.signal,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      const resultConversationId: string = data.conversation.id;

      setPendingConversationIds((prev) =>
        prev.filter((id) => id !== startedConversationId && id !== resultConversationId)
      );

      // Only update the visible chat if user is still on the same conversation
      const stillOnSameChat =
        activeConversationIdRef.current === startedConversationId;

      if (stillOnSameChat) {
        applyConversationToView(data.conversation);
      }

      setHistoryRefresh((k) => k + 1);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setPendingConversationIds((prev) =>
          startedConversationId ? prev.filter((id) => id !== startedConversationId) : prev
        );
        return;
      }

      const stillOnSameChat =
        activeConversationIdRef.current === startedConversationId;

      if (stillOnSameChat) {
        const errMsg = error instanceof Error ? error.message : "Something went wrong";
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: errMsg,
            type: "text",
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  }

  function handleSelectConversation(id: string) {
    if (id === conversationId) return;
    activeConversationIdRef.current = id;
    setConversationId(id);
    loadConversation(id);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const showExamples = messages.length <= 1 && !conversationId;
  const showLoading = isLoading || isLoadingChat;

  return (
    <div className="flex h-full">
      <ChatHistorySidebar
        activeId={conversationId}
        pendingIds={pendingConversationIds}
        onSelect={handleSelectConversation}
        onNewChat={startNewChat}
        refreshKey={historyRefresh}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800 px-6 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
              {title}
            </h2>
            {conversationLeads.length > 0 && (
              <p className="text-xs text-emerald-600">
                {conversationLeads.length} leads in this conversation
              </p>
            )}
          </div>
          {isLoading && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Working...
            </span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
          {messages.map((message, i) => (
            <MessageBubble
              key={message.id}
              message={message}
              conversationId={conversationId}
              previousUserMessage={
                message.role === "assistant" && messages[i - 1]?.role === "user"
                  ? messages[i - 1].content
                  : undefined
              }
              onOpenDuplicate={(id) => handleSelectConversation(id)}
              onForceSearch={(text) => sendMessage(text, { forceSearch: true })}
            />
          ))}

          {isLoading && (
            <div className="flex gap-3 max-w-4xl mx-auto">
              <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-3">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Finding leads...
                  </p>
                  <p className="text-xs text-gray-500">
                    Fetching all matching leads — switch chats anytime, runs in background
                  </p>
                </div>
              </div>
            </div>
          )}

          {isLoadingChat && !isLoading && (
            <div className="flex justify-center py-4">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {showExamples && !showLoading && (
          <div className="px-4 pb-2 max-w-4xl mx-auto w-full">
            <p className="text-xs text-gray-500 mb-2">Try an example:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {EXAMPLE_PROMPTS.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setInput(example)}
                  className="text-left text-xs p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-colors text-gray-600 dark:text-gray-400"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {conversationLeads.length > 0 && !showLoading && (
          <div className="px-4 pb-2 max-w-4xl mx-auto w-full">
            <p className="text-xs text-gray-500 mb-2">Continue the conversation:</p>
            <div className="flex flex-wrap gap-2">
              {[
                "Draft a cold outreach email for the top lead",
                "Write a LinkedIn message to connect",
                "Help me tailor my resume for these companies",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => sendMessage(suggestion)}
                  className="text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-700 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 text-gray-600 dark:text-gray-400 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-gray-200 dark:border-gray-800 p-4">
          <div className="max-w-4xl mx-auto">
            <div className="relative flex items-end gap-2 bg-gray-100 dark:bg-gray-800 rounded-2xl p-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  conversationLeads.length > 0
                    ? "Ask about your leads, draft outreach, or search for more..."
                    : "Describe the leads you want to find..."
                }
                rows={1}
                disabled={isLoading}
                className="flex-1 resize-none bg-transparent px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 focus:outline-none max-h-32"
                style={{ minHeight: "40px" }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = Math.min(target.scrollHeight, 128) + "px";
                }}
              />
              <button
                type="button"
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isLoading}
                className="flex-shrink-0 w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                ) : (
                  <Send className="w-4 h-4 text-white" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  conversationId,
  previousUserMessage,
  onOpenDuplicate,
  onForceSearch,
}: {
  message: ChatMessage;
  conversationId: string | null;
  previousUserMessage?: string;
  onOpenDuplicate: (id: string) => void;
  onForceSearch: (text: string) => void;
}) {
  if (message.id === "welcome") {
    return (
      <div className="flex gap-3 max-w-4xl mx-auto">
        <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%]">
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex gap-3 max-w-4xl mx-auto ${
        message.role === "user" ? "justify-end" : "justify-start"
      }`}
    >
      {message.role === "assistant" && (
        <div className="w-8 h-8 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
      )}

      <div className={`max-w-[85%] ${message.role === "user" ? "" : "space-y-3"}`}>
        {message.role === "user" ? (
          <div className="bg-emerald-600 text-white rounded-2xl rounded-tr-sm px-4 py-3">
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          </div>
        ) : (
          <>
            <div
              className={`rounded-2xl rounded-tl-sm px-4 py-3 ${
                message.type === "duplicate"
                  ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
                  : "bg-gray-100 dark:bg-gray-800"
              }`}
            >
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {message.content}
              </p>

              {message.type === "duplicate" && message.duplicateOf && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenDuplicate(message.duplicateOf!.conversationId)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Open &quot;{message.duplicateOf.title}&quot;
                  </button>
                  <button
                    type="button"
                    onClick={() => previousUserMessage && onForceSearch(previousUserMessage)}
                    disabled={!previousUserMessage}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Search anyway
                  </button>
                </div>
              )}

              {message.session?.criteria && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                    <Search className="w-3 h-3" /> AI → Apollo filters
                  </p>
                  {message.session.criteria.searchIntent && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 italic">
                      {message.session.criteria.searchIntent}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {(message.session.criteria.apollo?.personLocations ||
                      [message.session.criteria.country]).map((loc) => (
                      <Tag key={loc} label={loc} />
                    ))}
                    {message.session.criteria.apollo?.qKeywords && (
                      <Tag label={`keywords: ${message.session.criteria.apollo.qKeywords}`} />
                    )}
                    {message.session.criteria.jobTitles.map((t) => (
                      <Tag key={t} label={t} />
                    ))}
                    <Tag
                      label={`${message.session.criteria.companySizeMin}-${message.session.criteria.companySizeMax} employees`}
                    />
                  </div>
                </div>
              )}
            </div>

            {message.session && message.session.leads.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {message.session.leads.length} leads found
                  </span>
                </div>
                <LeadTable
                  leads={message.session.leads}
                  compact
                  showAll
                  conversationId={conversationId || undefined}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
      {label}
    </span>
  );
}
