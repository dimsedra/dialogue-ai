"use client";

import { useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy, Check } from "lucide-react";

interface LazyCodeBlockProps {
  codeString: string;
  language: string;
}

export function LazyCodeBlock({ codeString, language }: LazyCodeBlockProps) {
  const [copied, setCopied] = useState(false);

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
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="p-1.5 rounded-lg bg-[#1a1814] border border-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] hover:border-[#d4a373]/30 transition-all shadow-xl cursor-pointer"
          title="Copy Code"
        >
          {copied ? (
            <Check className="w-3 h-3 text-emerald-500" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
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
          boxShadow: "inset 0 2px 4px rgba(0,0,0,0.3)",
        }}
        codeTagProps={{
          style: {
            fontFamily: "inherit",
            background: "transparent",
          },
        }}
      >
        {codeString}
      </SyntaxHighlighter>
    </div>
  );
}
