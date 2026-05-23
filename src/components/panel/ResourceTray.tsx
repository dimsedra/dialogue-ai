import { Link, FileText, Paperclip } from "lucide-react";
import { motion } from "framer-motion";

interface Resource {
  type: "url" | "document";
  title: string;
  url: string;
  summary?: string;
  linkedAt: number;
}

const resourceIcons = {
  url: Link,
  document: FileText,
};

export function ResourceTray({ resources }: { resources: Resource[] }) {
  if (resources.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-[#a8a29e]/40">
        <Paperclip className="w-3 h-3" />
        <span>Linked Resources ({resources.length})</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {resources.map((r, i) => {
          const Icon = resourceIcons[r.type];
          return (
            <motion.a
              key={i}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.05 }}
              href={r.type === "url" ? r.url : undefined}
              target={r.type === "url" ? "_blank" : undefined}
              rel={r.type === "url" ? "noopener noreferrer" : undefined}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#0f0e0c] border border-[#2a2723] hover:border-[#d4a373]/30 hover:bg-[#d4a373]/5 transition-all group cursor-pointer"
            >
              <div className="p-1 rounded-lg bg-[#d4a373]/10 text-[#d4a373]/60 group-hover:text-[#d4a373] transition-colors">
                <Icon className="w-3 h-3" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] text-[#f2efeb] font-medium truncate max-w-[120px] group-hover:text-[#d4a373] transition-colors">
                  {r.title}
                </span>
                <span className="text-[8px] text-[#a8a29e]/40 font-medium uppercase tracking-wider">
                  {r.type === "url" ? "Link" : "Document"}
                </span>
              </div>
              {r.summary && (
                <div className="hidden lg:block max-w-[160px] border-l border-[#2a2723] pl-2 ml-1">
                  <p className="text-[10px] text-[#a8a29e]/60 leading-snug line-clamp-2">{r.summary}</p>
                </div>
              )}
            </motion.a>
          );
        })}
      </div>
    </div>
  );
}
