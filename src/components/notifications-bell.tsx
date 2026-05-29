"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useState, useRef, useEffect } from "react";
import { Bell, Check, Calendar, CheckSquare, BellOff, Info } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";

export function NotificationBell() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const notifications = useQuery(api.notifications.listUnread) || [];
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleMarkAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await markAllRead();
  };

  const handleItemClick = async (id: any, actionUrl?: string) => {
    await markRead({ ids: [id] });
    setIsOpen(false);
    if (actionUrl) {
      router.push(actionUrl);
    }
  };

  // Render descriptive icons for notification types
  const getIcon = (type: string) => {
    switch (type) {
      case "event_remind":
        return <Calendar className="w-4 h-4 text-[#d4a373] shrink-0" />;
      case "habit_remind":
        return <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-blue-400 shrink-0" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 lg:p-2.5 rounded-xl bg-[#1a1814] border border-[#2a2723] text-[#a8a29e] hover:text-[#d4a373] hover:border-[#d4a373]/30 transition-all flex items-center justify-center shadow-lg active:scale-95 shrink-0"
        title="Notifications"
      >
        <Bell className="w-4 h-4 lg:w-5 lg:h-5" />
        
        <AnimatePresence>
          {notifications.length > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-1.5 -right-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-rose-500 text-[9px] font-black text-white shadow-md shadow-rose-900/50"
            >
              {notifications.length}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* Popover Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 mt-3 w-80 rounded-xl bg-[#1a1814]/95 border border-[#2a2723] shadow-2xl backdrop-blur-xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2723]/30 bg-[#0f0e0c]/50">
              <h3 className="font-bold text-[#f2efeb] text-xs uppercase tracking-widest">
                Reminders
              </h3>
              {notifications.length > 0 && (
                <button
                  onClick={handleMarkAll}
                  className="text-[9px] font-black text-[#d4a373] hover:text-[#c39262] uppercase tracking-wider flex items-center gap-1 transition-colors"
                >
                  <Check className="w-3 h-3" /> Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto divide-y divide-[#2a2723]/30 custom-scrollbar">
              {notifications.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-center px-4">
                  <div className="w-8 h-8 rounded-full bg-[#2a2723]/30 flex items-center justify-center">
                    <BellOff className="w-4 h-4 text-[#a8a29e]/50" />
                  </div>
                  <span className="text-[10px] font-bold text-[#a8a29e] uppercase tracking-wider">
                    All caught up
                  </span>
                  <p className="text-[9px] text-[#a8a29e]/60 max-w-44 leading-relaxed">
                    No pending event reminders or habits to log.
                  </p>
                </div>
              ) : (
                notifications.map((item) => (
                  <button
                    key={item._id}
                    onClick={() => handleItemClick(item._id, item.actionUrl)}
                    className="w-full p-4 hover:bg-[#2a2723]/20 transition-all text-left flex items-start gap-3 border-none group focus:outline-none"
                  >
                    <div className="p-1.5 rounded-lg bg-[#0f0e0c] border border-[#2a2723]/30 group-hover:border-[#d4a373]/20 transition-all shrink-0">
                      {getIcon(item.type)}
                    </div>
                    
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-[#f2efeb] text-xs truncate">
                          {item.title}
                        </span>
                        <span className="text-[9px] text-[#a8a29e] shrink-0 font-medium">
                          {new Date(item.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="text-[#a8a29e] text-[10px] leading-relaxed break-words">
                        {item.message}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
