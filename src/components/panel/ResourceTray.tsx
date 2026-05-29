import { Link, FileText, Paperclip, ExternalLink } from "lucide-react";

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

  const formatUrl = (url: string) => {
    try {
      const u = new URL(url);
      return u.hostname.replace("www.", "");
    } catch {
      return url;
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-[#a8a29e]/40">
        <Paperclip className="w-3 h-3" />
        <span>Linked Resources ({resources.length})</span>
      </div>
      <div className="space-y-1">
        {resources.map((r, i) => {
          const Icon = resourceIcons[r.type];
          return (
            <a
              key={i}
              href={r.url || undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 px-2 py-1.5 rounded-xl bg-[#0f0e0c] border border-[#2a2723] hover:border-[#d4a373]/30 hover:bg-[#d4a373]/5 transition-all group cursor-pointer"
            >
              <div className="p-1 rounded-lg bg-[#d4a373]/10 text-[#d4a373]/60 group-hover:text-[#d4a373] transition-colors shrink-0 mt-0.5">
                <Icon className="w-3 h-3" />
              </div>
              <div className="flex flex-col min-w-0 gap-0.5 flex-1">
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-[#f2efeb] font-medium truncate group-hover:text-[#d4a373] transition-colors">
                    {r.title}
                  </span>
                  {r.type === "url" && (
                    <ExternalLink className="w-2 h-2 text-[#a8a29e]/30 shrink-0" />
                  )}
                </div>
                {r.summary && (
                  <p className="text-[10px] text-[#a8a29e]/50 leading-snug line-clamp-1">{r.summary}</p>
                )}
                {r.type === "url" ? (
                  <span className="text-[7px] text-[#a8a29e]/25 font-medium truncate">{formatUrl(r.url)}</span>
                ) : (
                  <span className="text-[7px] text-[#a8a29e]/30 font-medium uppercase tracking-wider">Document</span>
                )}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
