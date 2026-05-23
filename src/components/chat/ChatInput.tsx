import React, { useState, useRef, useCallback, useEffect } from "react";
import { Send, X, PlusCircle, ChevronsUpDown, File as FileIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Id } from "../../../convex/_generated/dataModel";

interface ChatInputProps {
  activeSessionId: Id<"chatSessions"> | null;
  isLargeViewport: boolean;
  keyboardOffset: number;
  onSend: (text: string, files: File[]) => Promise<void>;
  onChatInputResize?: (offset: number) => void;
}

export const ChatInput = React.memo(function ChatInput({
  activeSessionId,
  isLargeViewport,
  keyboardOffset,
  onSend,
  onChatInputResize,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<{ [name: string]: string }>({});
  const [isUploading, setIsUploading] = useState(false);
  const [isScrollable, setIsScrollable] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInputResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const maxHeight = isMobile ? 84 : 160;
    el.style.height = "auto";
    const nextHeight = Math.min(Math.max(el.scrollHeight, 56), maxHeight);
    el.style.height = `${nextHeight}px`;
    setIsScrollable(el.scrollHeight > maxHeight);
    onChatInputResize?.(Math.max(0, nextHeight - 56));
  }, [onChatInputResize]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isTouchDevice = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    if (e.key === "Enter" && !e.shiftKey && !isTouchDevice) {
      e.preventDefault();
      if (input.trim() || selectedFiles.length > 0) {
        handleSubmit();
      }
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && selectedFiles.length === 0) || !activeSessionId || isUploading) return;

    const userText = input.trim();
    const currentFiles = [...selectedFiles];
    setInput("");
    setSelectedFiles([]);
    setIsUploading(true);
    if (textareaRef.current) {
      textareaRef.current.style.height = "56px";
      setIsScrollable(false);
      onChatInputResize?.(0);
    }

    try {
      await onSend(userText, currentFiles);
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setIsUploading(false);
    }
  };

  // File preview effect
  useEffect(() => {
    const newPreviews: { [name: string]: string } = {};
    const cleanupUrls: string[] = [];

    selectedFiles.forEach(file => {
      if (file.type.startsWith("image/")) {
        const url = URL.createObjectURL(file);
        newPreviews[file.name] = url;
        cleanupUrls.push(url);
      }
    });

    setPreviews(newPreviews);
    return () => cleanupUrls.forEach(url => URL.revokeObjectURL(url));
  }, [selectedFiles]);

  return (
    <footer 
      style={{ 
        bottom: isLargeViewport ? 0 : `${keyboardOffset}px`,
      }}
      className="absolute left-0 right-0 px-3 py-4 lg:p-8 bg-linear-to-t from-[#0f0e0c] via-[#0f0e0c]/95 to-transparent z-40 transition-none"
    >
      {/* Attachment Tray */}
      <AnimatePresence>
        {selectedFiles.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: 15, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.9 }}
            className="flex flex-wrap gap-3 mb-3 lg:mb-4 ml-1 lg:mx-auto lg:max-w-4xl"
          >
            {selectedFiles.map((file, idx) => (
              <div key={`${file.name}-${idx}`} className="relative group/thumb">
                <div className="w-16 h-16 lg:w-20 lg:h-20 bg-[#1a1814]/80 backdrop-blur-2xl rounded-2xl border border-[#d4a373]/30 shadow-2xl flex flex-col items-center justify-center overflow-hidden group-hover/thumb:border-[#d4a373]/50 transition-all">
                  {previews[file.name] ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img 
                      src={previews[file.name]} 
                      alt="Preview" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 p-2 text-center">
                      <FileIcon className="w-6 h-6 text-[#d4a373]" />
                      <span className="text-[8px] font-black uppercase tracking-widest text-[#a8a29e] truncate w-full px-1">
                        {file.name.split('.').pop()}
                      </span>
                    </div>
                  )}
                  
                  {/* Delete Overlay */}
                  <button 
                    onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== idx))}
                    className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-100 lg:opacity-0 lg:group-hover/thumb:opacity-100 transition-opacity"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
                
                {/* Filename Tag (Floating) */}
                <div className="absolute top-0 left-full ml-3 px-3 py-2 bg-[#1a1814]/90 backdrop-blur-xl rounded-xl border border-[#2a2723] shadow-xl pointer-events-none opacity-0 group-hover/thumb:opacity-100 transition-all -translate-x-2 group-hover/thumb:translate-x-0 hidden lg:block whitespace-nowrap z-70">
                  <p className="text-[10px] font-bold text-[#f2efeb]">{file.name}</p>
                  <p className="text-[8px] text-[#a8a29e] uppercase tracking-widest font-medium">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmit} className="relative group max-w-4xl mx-auto">
        <div className="absolute inset-0 bg-[#d4a373]/5 blur-2xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity" />
        
        <input
          type="file"
          ref={fileInputRef}
          multiple
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            setSelectedFiles(prev => [...prev, ...files]);
            e.target.value = ""; // Reset to allow re-uploading the same file
          }}
          className="hidden"
        />
        
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="absolute left-2 lg:left-3 top-7 -translate-y-1/2 p-2 rounded-lg text-[#a8a29e] hover:text-[#d4a373] hover:bg-[#d4a373]/10 transition-all z-10"
          disabled={isUploading || !activeSessionId}
        >
          <PlusCircle className={`w-5 h-5 ${isUploading ? 'animate-spin' : ''}`} />
        </button>

        <textarea
          ref={textareaRef}
          name="dialogue-chat-input"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="sentences"
          spellCheck={false}
          rows={1}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setTimeout(handleInputResize, 0);
          }}
          onKeyDown={handleKeyDown}
          placeholder={!activeSessionId ? "Select a conversation" : isUploading ? "Uploading file..." : "Ask Dialogue..."}
          disabled={!activeSessionId || isUploading}
          style={{ minHeight: "56px" }}
          className="relative w-full bg-[#1a1814]/90 backdrop-blur-xl border border-[#2a2723] text-[#f2efeb] pl-12 lg:pl-14 pr-16 lg:pr-20 py-4 rounded-4xl focus:outline-none focus:border-[#d4a373]/40 focus:ring-1 focus:ring-[#d4a373]/20 transition-shadow duration-300 placeholder:text-[#a8a29e]/30 text-sm lg:text-[15px] shadow-2xl resize-none leading-relaxed outline-none scrollbar-none [&::-webkit-scrollbar]:hidden"
        />
        
        <div className="absolute right-2 lg:right-2.5 top-7 -translate-y-1/2 flex items-center gap-1 z-10">
          {isScrollable && (
            <ChevronsUpDown className="w-4 h-4 text-[#a8a29e]/50 animate-pulse hidden sm:block" />
          )}
          <button
            type="submit"
            disabled={(!input.trim() && selectedFiles.length === 0) || !activeSessionId || isUploading}
            className="p-2 lg:p-2.5 rounded-lg lg:rounded-xl bg-[#d4a373] text-[#0f0e0c] hover:bg-[#c39262] transition-all shadow-xl shadow-[#d4a373]/10 disabled:opacity-0 disabled:scale-90"
          >
            {isUploading ? (
              <div className="w-4 h-4 border-2 border-[#0f0e0c]/30 border-t-[#0f0e0c] rounded-full animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
            )}
          </button>
        </div>
      </form>
      <p className="mt-2 text-center text-[8px] lg:text-[9px] text-[#a8a29e]/20 uppercase tracking-[0.4em] font-bold">Dialogue Interface v1.0.4</p>
    </footer>
  );
});
