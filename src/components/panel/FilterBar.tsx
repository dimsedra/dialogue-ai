import { Search, Filter, ArrowUpDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface FilterBarProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  showFilters: boolean;
  setShowFilters: (show: boolean) => void;
  sortBy: string;
  setSortBy: (sort: "date" | "priority" | "category") => void;
}

export function FilterBar({
  searchQuery,
  setSearchQuery,
  showFilters,
  setShowFilters,
  sortBy,
  setSortBy,
}: FilterBarProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1 relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#a8a29e]/40 group-focus-within:text-[#d4a373] transition-colors" />
          <input
            type="text"
            name="panel-search-filter"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-full bg-[#0f0e0c] border border-[#2a2723] rounded-xl pl-9 pr-4 py-2 text-xs text-[#f2efeb] focus:outline-none focus:border-[#d4a373]/30 transition-all"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`p-2 rounded-xl border transition-all ${
            showFilters
              ? "bg-[#d4a373]/10 border-[#d4a373]/30 text-[#d4a373]"
              : "bg-[#0f0e0c] border-[#2a2723] text-[#a8a29e] hover:text-[#f2efeb]"
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
        </button>
      </div>

      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-3 bg-[#0f0e0c] border border-[#2a2723] rounded-xl flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-3 h-3 text-[#a8a29e]/40" />
                <span className="text-[10px] font-bold text-[#a8a29e]/60 uppercase tracking-widest">Sort by</span>
              </div>
              <div className="flex gap-1">
                {(["date", "priority", "category"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSortBy(s)}
                    className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${
                      sortBy === s ? "bg-[#2a2723] text-[#d4a373]" : "text-[#a8a29e] hover:text-[#f2efeb]"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
