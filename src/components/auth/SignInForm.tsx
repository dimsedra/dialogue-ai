"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { isPbBackend } from "@/pb-compat";
import { useAuth } from "@/pb-compat/auth";
import { Bot, Mail, Lock, ArrowRight, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function SignInForm() {
  const { signIn: convexSignIn } = useAuthActions();
  const { signIn: pbSignIn, signUp: pbSignUp } = useAuth();
  const [step, setStep] = useState<"signIn" | "signUp">("signIn");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    try {
      if (isPbBackend()) {
        const email = formData.get("email") as string;
        const password = formData.get("password") as string;
        if (step === "signIn") {
          await pbSignIn(email, password);
        } else {
          await pbSignUp(email, password, password);
        }
      } else {
        await convexSignIn("password", formData);
      }
    } catch (e: any) {
      console.error(e);
      // Try to parse PB error message if available
      const errMsg = e?.response?.message || "Invalid email or password. Please try again.";
      setError(isPbBackend() ? errMsg : "Invalid email or password. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0f0e0c] flex items-center justify-center p-6 select-none overflow-hidden relative">
      {/* Decorative Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#d4a373]/5 blur-[120px] rounded-full" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#d4a373]/5 blur-[120px] rounded-full" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-[#d4a373]/20 blur-2xl rounded-full" />
            <div className="relative bg-[#1a1814] border border-[#d4a373]/20 p-4 rounded-3xl">
              <Bot className="w-10 h-10 text-[#d4a373]" />
            </div>
          </div>
          <h1 className="text-3xl font-black text-zinc-100 tracking-tight mb-2 italic">Dialogue</h1>
          <p className="text-zinc-500 text-sm font-medium tracking-wide">Productivity reimagined through conversation.</p>
        </div>

        <div className="bg-[#1a1814] border border-[#2a2723] rounded-4xl p-8 shadow-2xl shadow-black/50">
          <div className="flex gap-1 bg-[#0f0e0c] p-1 rounded-2xl mb-8 border border-[#2a2723]">
            <button
              onClick={() => setStep("signIn")}
              className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-widest rounded-xl transition-all ${step === "signIn" ? "bg-[#d4a373] text-[#0f0e0c]" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              Sign In
            </button>
            <button
              onClick={() => setStep("signUp")}
              className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-widest rounded-xl transition-all ${step === "signUp" ? "bg-[#d4a373] text-[#0f0e0c]" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-1">Email Address</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-[#d4a373] transition-colors" />
                <input
                  name="email"
                  type="email"
                  required
                  placeholder="name@example.com"
                  className="w-full bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 focus:ring-0 rounded-2xl py-4 pl-12 pr-4 text-sm text-zinc-200 placeholder:text-zinc-700 transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 ml-1">Password</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within:text-[#d4a373] transition-colors" />
                <input
                  name="password"
                  type="password"
                  required
                  placeholder="••••••••"
                  className="w-full bg-[#0f0e0c] border border-[#2a2723] focus:border-[#d4a373]/50 focus:ring-0 rounded-2xl py-4 pl-12 pr-4 text-sm text-zinc-200 placeholder:text-zinc-700 transition-all"
                />
              </div>
            </div>

            <input name="flow" type="hidden" value={step} />

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-red-400 text-[11px] font-medium text-center bg-red-400/10 py-2 rounded-xl border border-red-400/20"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#d4a373] hover:bg-[#e5b383] disabled:bg-[#d4a373]/50 text-[#0f0e0c] font-black uppercase tracking-[0.2em] text-xs py-4 rounded-2xl transition-all shadow-lg shadow-[#d4a373]/10 flex items-center justify-center gap-2 group mt-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  {step === "signIn" ? "Enter Workspace" : "Create Account"}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-8 text-center text-[10px] text-zinc-600 font-bold uppercase tracking-[0.3em]">
          Securely powered by Convex Auth
        </p>
      </motion.div>
    </div>
  );
}
