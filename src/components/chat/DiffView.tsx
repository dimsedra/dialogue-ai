import { ArrowDown } from "lucide-react";
import { format } from "date-fns";
import { DiffViewProps } from "./types";

export const DiffView = ({ label, oldVal, newVal, type = "text" }: DiffViewProps) => {
  if (newVal === undefined || oldVal === newVal) return null;
  
  const formatValue = (v: string | number | boolean | undefined | null) => {
    if (v === undefined || v === null) return "None";
    if (type === "date") {
      try {
        return format(new Date(v as string | number), "MMM d, HH:mm");
      } catch {
        return String(v);
      }
    }
    return String(v);
  };

  return (
    <div className="flex items-center gap-2 text-[10px] py-1">
      <span className="text-[#a8a29e] font-medium uppercase tracking-wider w-16">{label}:</span>
      <div className="flex items-center gap-1.5 overflow-hidden">
        <span className="text-[#a8a29e]/50 line-through truncate max-w-20">{formatValue(oldVal)}</span>
        <ArrowDown className="w-2.5 h-2.5 -rotate-90 text-[#d4a373]/40" />
        <span className={`font-bold truncate max-w-25 ${
          type === "priority" ? (
            newVal === "high" ? "text-red-400" :
            newVal === "medium" ? "text-orange-400" :
            "text-blue-400"
          ) : "text-[#f2efeb]"
        }`}>{formatValue(newVal)}</span>
      </div>
    </div>
  );
};
