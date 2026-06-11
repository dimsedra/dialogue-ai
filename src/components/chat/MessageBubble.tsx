import React from "react";
import { 
  User, Bot, Check, ExternalLink, File as FileIcon, ChevronDown, ChevronUp, Calendar, CheckCircle2, Flame,
  Edit3, Trash2, Search, Sparkles, Layers, HelpCircle
} from "lucide-react";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { ToolCall } from "./types";
import { ToolCard } from "./ToolCard";
import { useSmoothText } from "./useSmoothText";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "../ai-elements/reasoning";
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
  ChainOfThoughtContent,
  ChainOfThoughtSearchResults,
  ChainOfThoughtSearchResult,
} from "../ai-elements/chain-of-thought";
import { useTimeFormat } from "../../hooks/useTimeFormat";
import { formatTime } from "../panel/utils";

// Code blocks pull in react-syntax-highlighter (~250 KB). Lazy-load so the
// heavy highlighter only ships when a code block actually renders.
const LazyCodeBlock = dynamic(
  () => import("./LazyCodeBlock").then((m) => m.LazyCodeBlock),
  {
    ssr: false,
    loading: () => (
      <pre className="bg-[#0f0e0c] border border-[#2a2723] rounded-2xl p-5 text-sm font-mono text-[#a8a29e] overflow-x-auto">
        <code>Loading…</code>
      </pre>
    ),
  },
);

const escapeCurrency = (text: string) => {
  return text.replace(/(?<!\\)\$(\s*\d)/g, '\\$$$1');
};

const markdownComponents = {
  p: ({ children }: any) => <p className="mb-4 last:mb-0">{children}</p>,
  ul: ({ children }: any) => <ul className="list-disc pl-4 mb-4 space-y-1">{children}</ul>,
  ol: ({ children }: any) => <ol className="list-decimal pl-4 mb-4 space-y-1">{children}</ol>,
  li: ({ children }: any) => <li className="text-[#a8a29e]">{children}</li>,
  strong: ({ children }: any) => <strong className="text-[#d4a373] font-bold">{children}</strong>,
  pre: ({ children }: React.ComponentPropsWithoutRef<'pre'>) => {
    return (
      <div className="relative my-6 group/code min-w-0">
        {children}
      </div>
    );
  },
  code: ({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'>) => {
    const match = /language-(\w+)/.exec(className || "");
    const isInline = !className;

    if (isInline) {
      return (
        <code className="bg-[#0f0e0c] px-1.5 py-0.5 rounded text-[#d4a373] font-mono text-[13px]" {...props}>
          {children}
        </code>
      );
    }

    const language = match ? match[1] : "text";
    const codeString = String(children).replace(/\n$/, "");

    return (
      <LazyCodeBlock codeString={codeString} language={language} />
    );
  },
  table: ({ children }: any) => (
    <div className="overflow-x-auto mb-6">
      <table className="w-full text-sm border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }: any) => <thead className="border-b border-[#2a2723]">{children}</thead>,
  tbody: ({ children }: any) => <tbody className="divide-y divide-[#2a2723]">{children}</tbody>,
  tr: ({ children }: any) => <tr className="hover:bg-[#1f1d19]/50 transition-colors">{children}</tr>,
  th: ({ children }: any) => <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-[#d4a373]">{children}</th>,
  td: ({ children }: any) => <td className="px-3 py-2 text-[#a8a29e]">{children}</td>,
};

const TOOL_ICONS: Record<string, any> = {
  addTask: CheckCircle2,
  updateTask: Edit3,
  completeTask: Check,
  deleteTask: Trash2,
  addEvent: Calendar,
  updateEvent: Calendar,
  updateEventOccurrence: Calendar,
  deleteEvent: Calendar,
  searchWeb: Search,
  multiSearch: Search,
  updateUserBio: Sparkles,
  saveSemanticMemory: Sparkles,
  deleteSemanticMemory: Trash2,
  listWorkspaces: Layers,
  create_habit: Flame,
  log_habit: Flame,
  get_habit_consistency: Flame,
  fetchUrl: ExternalLink,
  searchHistoricalEntities: Search,
};

function getToolStepLabel(toolCall: ToolCall): string {
  const { name, args } = toolCall;
  const a = args as any;
  switch (name) {
    case "addTask":
      return `Creating task: "${a.text || "Untitled"}"`;
    case "updateTask":
      return `Updating task: "${a.titleHint || a.text || "Untitled"}"`;
    case "completeTask":
      return `Completing task: "${a.titleHint || "Task"}"`;
    case "deleteTask":
      return `Deleting task: "${a.titleHint || "Task"}"`;
    case "addEvent":
      return `Scheduling event: "${a.title || "Untitled"}"`;
    case "updateEvent":
      return `Updating event: "${a.titleHint || "Event"}"`;
    case "deleteEvent":
      return `Deleting event: "${a.titleHint || "Event"}"`;
    case "searchWeb":
      return `Researching web: "${a.query || ""}"`;
    case "multiSearch":
      return `Running broad research queries`;
    case "updateUserBio":
      return `Updating profile biography`;
    case "saveSemanticMemory":
      return `Retaining new semantic memory`;
    case "deleteSemanticMemory":
      return `Deleting semantic memory`;
    case "listWorkspaces":
      return `Listing user workspaces`;
    case "create_habit":
      return `Creating new habit: "${a.name || "Untitled"}"`;
    case "log_habit":
      return `Logging habit execution: "${a.titleHint || "Habit"}"`;
    case "get_habit_consistency":
      return `Checking habit consistency metrics`;
    case "fetchUrl":
      return `Reading content from: ${a.url || ""}`;
    case "searchHistoricalEntities":
      return `Searching historical completed tasks/events`;
    default:
      return name
        .replace(/_/g, " ")
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (str) => str.toUpperCase());
  }
}

function extractDomains(resultText?: string): string[] {
  if (!resultText) return [];
  const urlRegex = /https?:\/\/(?:www\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+)/gi;
  const domains = new Set<string>();
  let match;
  while ((match = urlRegex.exec(resultText)) !== null) {
    if (match[1]) {
      domains.add(match[1].toLowerCase());
    }
  }
  return Array.from(domains);
}


interface MessageBubbleProps {
  msg: {
    _id: string;
    author: string;
    text: string;
    reasoning?: string;
    parts?: Array<{
      type: "text" | "reasoning";
      text?: string;
      reasoning?: string;
    }>;
    timestamp: number;
    toolCall?: unknown;
    toolCalls?: unknown[];
    attachments?: Array<{
      storageId: string;
      fileName?: string;
      fileType?: string;
      url?: string;
    }>;
    storageId?: string;
    fileName?: string;
    fileType?: string;
    scope?: {
      type: "date" | "task" | "event" | "habit";
      id: string;
      title: string;
    };
  };
  isLargeViewport: boolean;
  agentName?: string;
  isStreaming?: boolean;
}

export const MessageBubble = React.memo(function MessageBubble({ msg, isLargeViewport, agentName, isStreaming = false }: MessageBubbleProps) {
  const smoothedText = useSmoothText(msg.text, isStreaming);
  const timeFormat = useTimeFormat();
  return (
    <motion.div
      key={msg._id}
      id={`msg-${msg._id}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col py-6 lg:py-8 border-b border-[#2a2723]/15 last:border-b-0 w-full min-w-0"
    >
      <div className={`flex flex-col space-y-3 w-fit max-w-[85%] ${
        msg.author === "User" ? "ml-auto" : "mr-auto"
      }`}>
      {/* Sender Header Row */}
      <div className={`flex items-center gap-2.5 ${msg.author === "User" ? "flex-row-reverse" : ""}`}>
        <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 shadow-sm border ${
          msg.author === "User" 
            ? "bg-[#1f1d19] border-[#2a2723]" 
            : "bg-[#d4a373] border-[#d4a373]/20"
        }`}>
          {msg.author === "User" 
            ? <User className="w-3 h-3 text-[#a8a29e]" /> 
            : <Bot className="w-3 h-3 text-[#0f0e0c]" />
          }
        </div>
        <span className={`text-[10px] font-black uppercase tracking-[0.25em] ${
          msg.author === "User" ? "text-[#a8a29e]/60" : "text-[#d4a373]"
        }`}>
          {msg.author === "User" ? "You" : (agentName || "Dialogue")}
        </span>
        <span className="text-[9px] text-[#a8a29e]/40 font-bold tracking-widest uppercase">
          {formatTime(msg.timestamp, timeFormat)}
        </span>
      </div>

      {/* Message Content Area */}
      <div className={`relative min-w-0 ${
        msg.author === "User"
          ? "mr-2.5 pr-6"
          : "ml-2.5 pl-6 border-l border-[#d4a373]/15"
      }`}>
        {/* Scope Badge (if any) */}
        {msg.scope && (
          <div className="flex mb-3">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#d4a373]/10 border border-[#d4a373]/20 text-[#d4a373]">
              {msg.scope.type === "date" ? <Calendar className="w-3.5 h-3.5" /> : msg.scope.type === "habit" ? <Flame className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              <span className="text-[11px] font-bold uppercase tracking-widest">{msg.scope.title}</span>
            </div>
          </div>
        )}

        {/* Unified Attachment Rendering */}
        {((): React.ReactNode => {
          const allAtts = [...(msg.attachments || [])];
          if (msg.storageId && !allAtts.some(a => a.storageId === msg.storageId)) {
            allAtts.push({
              storageId: msg.storageId,
              fileName: msg.fileName || "File",
              fileType: msg.fileType || "application/octet-stream",
              url: (msg as any).url,
            });
          }
          
          if (allAtts.length === 0) return null;

          return (
            <div className="flex flex-wrap gap-2 mb-3">
              {allAtts.map((att, idx) => {
                const fileUrl = (att as any).url || `${(process.env.NEXT_PUBLIC_CONVEX_SITE_URL || process.env.NEXT_PUBLIC_CONVEX_URL)?.replace(".cloud", ".site")}/api/storage?id=${att.storageId}`;
                
                return (
                  <div key={idx} className="group relative">
                    {att.fileType?.startsWith("image/") ? (
                      <div 
                        onClick={() => window.open(fileUrl, "_blank")}
                        className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-xl overflow-hidden border border-[#d4a373]/20 shadow-lg bg-black/40 hover:border-[#d4a373]/40 transition-all cursor-pointer"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={fileUrl} 
                          alt={att.fileName || "Attached image"} 
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <div className="p-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20">
                            <ExternalLink className="w-4 h-4 text-white" />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div 
                        onClick={() => window.open(fileUrl, "_blank")}
                        className="flex items-center gap-2 p-2 rounded-xl border max-w-50 bg-[#1a1814] border-[#2a2723] hover:border-[#d4a373]/30 transition-all cursor-pointer"
                      >
                        <div className="w-8 h-8 rounded-lg bg-[#1a1814] flex items-center justify-center border border-[#2a2723] shrink-0">
                          <FileIcon className="w-4 h-4 text-[#d4a373]" />
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-[11px] font-bold text-[#f2efeb] truncate">{att.fileName || "File"}</p>
                        <p className="text-[9px] text-[#a8a29e] uppercase tracking-widest truncate">{att.fileType?.split("/")[1] || "Document"}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          );
        })()}

        {/* Text Body */}
        {msg.author === "User" ? (
          <p className="text-sm lg:text-[15px] leading-relaxed lg:leading-[1.7] text-[#f2efeb] whitespace-pre-wrap wrap-break-word font-sans min-w-0">{msg.text}</p>
        ) : (
          <div className="text-sm lg:text-[15px] leading-relaxed lg:leading-[1.7] text-[#f2efeb] font-sans prose prose-invert prose-sm max-w-none wrap-break-word w-full min-w-0">
            {/* Thinking placeholder — shown only when still streaming with absolutely nothing generated yet */}
            {isStreaming && !msg.text && !msg.reasoning && (
              <div className="flex items-center gap-3 py-1 mb-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#d4a373]/60 animate-bounce [animation-delay:-0.32s]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-[#d4a373]/60 animate-bounce [animation-delay:-0.16s]" />
                  <div className="w-1.5 h-1.5 rounded-full bg-[#d4a373]/60 animate-bounce" />
                </div>
                <span className="text-[11px] text-[#a8a29e]/50 font-medium tracking-wide animate-pulse">Thinking…</span>
              </div>
            )}
            
            {((): React.ReactNode => {
              if (msg.parts && msg.parts.length > 0) {
                let textCharIndex = 0;
                return msg.parts.map((part, i) => {
                  if (part.type === "reasoning") {
                    const partText = part.text || (part as any).reasoning || "";
                    if (!partText) return null;
                    return (
                      <Reasoning 
                        key={i} 
                        className="w-full mb-4" 
                        isStreaming={isStreaming && i === msg.parts!.length - 1}
                      >
                        <ReasoningTrigger />
                        <ReasoningContent>{partText}</ReasoningContent>
                      </Reasoning>
                    );
                  }
                  if (part.type === "text") {
                    const partText = part.text || "";
                    if (!partText) return null;
                    
                    const startIdx = textCharIndex;
                    const endIdx = startIdx + partText.length;
                    textCharIndex = endIdx;
                    
                    const renderedText = smoothedText.slice(startIdx, endIdx);
                    
                    return (
                      <ReactMarkdown
                        key={i}
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        components={markdownComponents}
                      >
                        {escapeCurrency(renderedText)}
                      </ReactMarkdown>
                    );
                  }
                  return null;
                });
              }

              // Fallback for database records
              return (
                <>
                  {msg.reasoning && (
                    <Reasoning className="w-full mb-4" isStreaming={false}>
                      <ReasoningTrigger />
                      <ReasoningContent>{msg.reasoning}</ReasoningContent>
                    </Reasoning>
                  )}
                  {msg.text && (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm, remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      components={markdownComponents}
                    >
                      {escapeCurrency(smoothedText)}
                    </ReactMarkdown>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Consolidated Tool Calls rendered as ChainOfThought, collapsed by default */}
        {msg.author === "AI" && (msg.toolCalls || msg.toolCall) ? ((): React.ReactNode => {
          const allToolCalls = (
            (msg.toolCalls as ToolCall[]) ||
            (msg.toolCall ? [msg.toolCall as ToolCall] : [])
          ).filter(Boolean);

          if (allToolCalls.length === 0) return null;

          const completedCount = allToolCalls.filter(tc => tc.result !== undefined).length;

          return (
            <ChainOfThought className="mt-4" defaultOpen={false}>
              <ChainOfThoughtHeader>
                <div className="flex items-center gap-2">
                  <span>Chain of Thought</span>
                  <span className="text-[9px] bg-[#d4a373]/10 text-[#d4a373] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                    {completedCount}/{allToolCalls.length} Steps
                  </span>
                </div>
              </ChainOfThoughtHeader>
              <ChainOfThoughtContent>
                <div className="space-y-4 pl-1 pt-1.5">
                  {allToolCalls.map((tc, idx) => {
                    const Icon = TOOL_ICONS[tc.name] || HelpCircle;
                    const label = getToolStepLabel(tc);
                    const isComplete = tc.result !== undefined;
                    const status = isComplete ? "complete" : (isStreaming ? "active" : "pending");
                    const domains = (tc.name === "searchWeb" || tc.name === "multiSearch") 
                      ? extractDomains(tc.result as any) 
                      : [];

                    return (
                      <ChainOfThoughtStep
                        key={idx}
                        icon={Icon}
                        label={label}
                        status={status}
                      >
                        {domains.length > 0 && (
                          <ChainOfThoughtSearchResults className="mt-1.5">
                            {domains.slice(0, 3).map((domain, dIdx) => (
                              <ChainOfThoughtSearchResult key={dIdx}>
                                {domain}
                              </ChainOfThoughtSearchResult>
                            ))}
                          </ChainOfThoughtSearchResults>
                        )}
                        <div className="mt-2.5">
                          <ToolCard toolCall={tc} />
                        </div>
                      </ChainOfThoughtStep>
                    );
                  })}
                </div>
              </ChainOfThoughtContent>
            </ChainOfThought>
          );
        })() : null}
      </div>
    </div>
    </motion.div>
  );
}, (prev, next) => {
  return (
    prev.msg._id === next.msg._id &&
    prev.msg.text === next.msg.text &&
    prev.msg.reasoning === next.msg.reasoning &&
    prev.isLargeViewport === next.isLargeViewport &&
    prev.agentName === next.agentName &&
    prev.isStreaming === next.isStreaming &&
    (prev.msg.toolCalls?.length ?? 0) === (next.msg.toolCalls?.length ?? 0)
  );
});
