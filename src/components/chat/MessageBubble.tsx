import React, { useState } from "react";
import { User, Bot, Copy, Check, ExternalLink, File as FileIcon, ChevronDown, ChevronUp, Calendar, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { ToolCall } from "./types";
import { ToolCard } from "./ToolCard";

const COLLAPSE_THRESHOLD = 3;

const TOOL_BADGE_COLORS: Record<string, string> = {
  addTask: "bg-[#d4a373]", // Gold
  updateTask: "bg-orange-400", // Orange
  completeTask: "bg-emerald-400", // Emerald
  deleteTask: "bg-slate-400", // Slate
  addEvent: "bg-[#8b5cf6]", // Purple
  updateEvent: "bg-indigo-400", // Indigo
  updateEventOccurrence: "bg-amber-400", // Amber
  deleteEvent: "bg-rose-400", // Rose
  searchWeb: "bg-[#3b82f6]", // Blue
  multiSearch: "bg-[#3b82f6]", // Blue
  updateUserBio: "bg-emerald-400", // Emerald
  saveSemanticMemory: "bg-emerald-400", // Emerald
  triggerReflection: "bg-[#d4a373]", // Gold
};

function ToolCallGroup({ calls, isLargeViewport, msgId }: { calls: ToolCall[]; isLargeViewport: boolean; msgId: string }) {
  const [expanded, setExpanded] = useState(isLargeViewport);

  return (
    <div className="mt-3 w-full space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-[#1f1d19] border border-[#2a2723] hover:border-[#d4a373]/30 transition-all text-left shadow-sm group cursor-pointer"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-5 h-5 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
            <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" />
          </div>
          <span className="text-[12px] font-bold text-[#f2efeb] truncate">
            {calls.length} Actions Completed
          </span>
          <div className="flex items-center gap-1 pl-1 shrink-0">
            {calls.slice(0, 5).map((call, idx) => (
              <div
                key={idx}
                className={`w-1.5 h-1.5 rounded-full ${TOOL_BADGE_COLORS[call.name] || "bg-[#d4a373]"}`}
              />
            ))}
            {calls.length > 5 && (
              <span className="text-[9px] font-bold text-[#a8a29e] pl-0.5">+{calls.length - 5}</span>
            )}
          </div>
        </div>
        <div className="p-1 rounded-lg bg-black/20 text-[#a8a29e] group-hover:text-[#d4a373] transition-colors shrink-0">
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="space-y-3 overflow-hidden"
          >
            {calls.map((tc, idx) => (
              <ToolCard key={`${msgId}_tool_${idx}`} toolCall={tc} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface MessageBubbleProps {
  msg: {
    _id: string;
    author: string;
    text: string;
    timestamp: number;
    toolCall?: unknown;
    toolCalls?: unknown[];
    attachments?: Array<{
      storageId: string;
      fileName?: string;
      fileType?: string;
    }>;
    storageId?: string;
    fileName?: string;
    fileType?: string;
    scope?: {
      type: "date" | "task" | "event";
      id: string;
      title: string;
    };
  };
  isLargeViewport: boolean;
}

export const MessageBubble = React.memo(function MessageBubble({ msg, isLargeViewport }: MessageBubbleProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  return (
    <motion.div
      key={msg._id}
      id={`msg-${msg._id}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col space-y-3 py-6 lg:py-8 border-b border-[#2a2723]/15 last:border-b-0 w-full min-w-0"
    >
      {/* Sender Header Row */}
      <div className="flex items-center gap-2.5">
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
          {msg.author === "User" ? "You" : "Dialogue"}
        </span>
        <span className="text-[9px] text-[#a8a29e]/40 font-bold tracking-widest uppercase">
          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Message Content Area */}
      <div className={`relative w-full ml-2.5 pl-6 min-w-0 ${
        msg.author === "AI" ? "border-l border-[#d4a373]/15" : ""
      }`}>
        {/* Scope Badge (if any) */}
        {msg.scope && (
          <div className="flex mb-3">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#d4a373]/10 border border-[#d4a373]/20 text-[#d4a373]">
              {msg.scope.type === "date" ? <Calendar className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
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
              fileType: msg.fileType || "application/octet-stream"
            });
          }
          
          if (allAtts.length === 0) return null;

          return (
            <div className="flex flex-wrap gap-2 mb-3">
              {allAtts.map((att, idx) => (
                <div key={idx} className="group relative">
                  {att.fileType?.startsWith("image/") ? (
                    <div 
                      onClick={() => window.open(`${(process.env.NEXT_PUBLIC_CONVEX_SITE_URL || process.env.NEXT_PUBLIC_CONVEX_URL)?.replace(".cloud", ".site")}/api/storage?id=${att.storageId}`, "_blank")}
                      className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-xl overflow-hidden border border-[#d4a373]/20 shadow-lg bg-black/40 hover:border-[#d4a373]/40 transition-all cursor-pointer"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img 
                        src={`${(process.env.NEXT_PUBLIC_CONVEX_SITE_URL || process.env.NEXT_PUBLIC_CONVEX_URL)?.replace(".cloud", ".site")}/api/storage?id=${att.storageId}`} 
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
                      onClick={() => window.open(`${(process.env.NEXT_PUBLIC_CONVEX_SITE_URL || process.env.NEXT_PUBLIC_CONVEX_URL)?.replace(".cloud", ".site")}/api/storage?id=${att.storageId}`, "_blank")}
                      className="flex items-center gap-2 p-2 rounded-xl border max-w-[200px] bg-[#1a1814] border-[#2a2723] hover:border-[#d4a373]/30 transition-all cursor-pointer"
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
              ))}
            </div>
          );
        })()}

        {/* Text Body */}
        {msg.author === "User" ? (
          <p className="text-sm lg:text-[15px] leading-relaxed lg:leading-[1.7] text-[#f2efeb] whitespace-pre-wrap font-sans min-w-0">{msg.text}</p>
        ) : (
          <div className="text-sm lg:text-[15px] leading-relaxed lg:leading-[1.7] text-[#f2efeb] font-sans prose prose-invert prose-sm max-w-none w-full min-w-0">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={{
                p: ({ children }) => <p className="mb-4 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-4 mb-4 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-4 mb-4 space-y-1">{children}</ol>,
                li: ({ children }) => <li className="text-[#a8a29e]">{children}</li>,
                strong: ({ children }) => <strong className="text-[#d4a373] font-bold">{children}</strong>,
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
                    <div className="relative">
                      <div className="absolute top-0 right-4 -translate-y-1/2 flex items-center gap-2 z-10">
                        {language && (
                          <div className="px-2.5 py-1 rounded-lg bg-[#1a1814] border border-[#d4a373]/20 text-[9px] font-black uppercase tracking-[0.2em] text-[#d4a373] shadow-xl">
                            {language}
                          </div>
                        )}
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(codeString);
                            setCopiedCode(codeString);
                            setTimeout(() => setCopiedCode(null), 2000);
                          }}
                          className="p-1.5 rounded-lg bg-[#1a1814] border border-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] hover:border-[#d4a373]/30 transition-all shadow-xl cursor-pointer"
                          title="Copy Code"
                        >
                          {copiedCode === codeString ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                      <SyntaxHighlighter
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        style={vscDarkPlus as any}
                        language={language}
                        PreTag="div"
                        customStyle={{
                          margin: 0,
                          padding: "1.25rem",
                          background: "#0f0e0c",
                          borderRadius: "1.5rem",
                          border: "1px solid #2a2723",
                          fontSize: "0.85rem",
                          lineHeight: "1.6",
                          boxShadow: "inset 0 2px 4px rgba(0,0,0,0.3)"
                        }}
                        codeTagProps={{
                          style: {
                            fontFamily: "inherit",
                            background: "transparent"
                          }
                        }}
                        {...props}
                      >
                        {codeString}
                      </SyntaxHighlighter>
                    </div>
                  );
                },
                table: ({ children }) => (
                  <div className="overflow-x-auto mb-6">
                    <table className="w-full text-sm border-collapse">{children}</table>
                  </div>
                ),
                thead: ({ children }) => <thead className="border-b border-[#2a2723]">{children}</thead>,
                tbody: ({ children }) => <tbody className="divide-y divide-[#2a2723]">{children}</tbody>,
                tr: ({ children }) => <tr className="hover:bg-[#1f1d19]/50 transition-colors">{children}</tr>,
                th: ({ children }) => <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-[#d4a373]">{children}</th>,
                td: ({ children }) => <td className="px-3 py-2 text-[#a8a29e]">{children}</td>,
              }}
            >
              {msg.text}
            </ReactMarkdown>
          </div>
        )}

        {/* Consolidated Tool Calls with Progressive Disclosure */}
        {msg.author === "AI" && (msg.toolCalls || msg.toolCall) ? ((): React.ReactNode => {
          const allToolCalls = (
            (msg.toolCalls as ToolCall[]) ||
            (msg.toolCall ? [msg.toolCall as ToolCall] : [])
          ).filter(Boolean);

          if (allToolCalls.length === 0) return null;

          if (allToolCalls.length < COLLAPSE_THRESHOLD) {
            return (
              <div className="space-y-3 mt-3 w-full">
                {allToolCalls.map((tc, idx) => (
                  <ToolCard key={`${msg._id}_tool_${idx}`} toolCall={tc} />
                ))}
              </div>
            );
          }

          return <ToolCallGroup calls={allToolCalls} isLargeViewport={isLargeViewport} msgId={msg._id} />;
        })() : null}
      </div>
    </motion.div>
  );
});
