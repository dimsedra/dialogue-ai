import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Image, X, Upload, Link, Eye, EyeOff, Brush, Trash2, Sparkles, Check, RotateCcw } from "lucide-react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

export interface DashboardBgSettings {
  url?: string;
  storageId?: string;
  opacity: number;
  blur: number;
  grain: number;
  vfxEnabled: boolean;
  vfxColor: string;
  cardBg: string;
  cardOpacity: number;
  cardBlur: number;
  cardBorder: string;
  primaryText: string;
  secondaryText: string;
  accentColor: string;
  cardStyle: "glass" | "solid";
}

const COLOR_DEFAULTS = {
  vfxColor: "#d4a373",
  cardBg: "#1a1814",
  cardBorder: "#2a2723",
  primaryText: "#f2efeb",
  secondaryText: "#a8a29e",
  accentColor: "#d4a373",
} as const;

interface DashboardBgEditorProps {
  isOpen: boolean;
  onClose: () => void;
  settings: DashboardBgSettings;
  onSave: (settings: DashboardBgSettings) => void;
}

export function DashboardBgEditor({ isOpen, onClose, settings, onSave }: DashboardBgEditorProps) {
  const [localUrl, setLocalUrl] = useState(settings.url || "");
  const [localStorageId, setLocalStorageId] = useState<string | undefined>(settings.storageId);
  const [localOpacity, setLocalOpacity] = useState(settings.opacity);
  const [localBlur, setLocalBlur] = useState(settings.blur);
  const [localGrain, setLocalGrain] = useState(settings.grain);
  const [localVfxEnabled, setLocalVfxEnabled] = useState(settings.vfxEnabled);
  const [localVfxColor, setLocalVfxColor] = useState(settings.vfxColor);
  const [localCardBg, setLocalCardBg] = useState(settings.cardBg);
  const [localCardOpacity, setLocalCardOpacity] = useState(settings.cardOpacity);
  const [localCardBlur, setLocalCardBlur] = useState(settings.cardBlur);
  const [localCardBorder, setLocalCardBorder] = useState(settings.cardBorder);
  const [localPrimaryText, setLocalPrimaryText] = useState(settings.primaryText);
  const [localSecondaryText, setLocalSecondaryText] = useState(settings.secondaryText);
  const [localAccentColor, setLocalAccentColor] = useState(settings.accentColor);
  const [localCardStyle, setLocalCardStyle] = useState<"glass" | "solid">(settings.cardStyle);
  const [inputMode, setInputMode] = useState<"url" | "upload">("url");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const generateUploadUrl = useMutation(api.messages.generateUploadUrl);
  const saveImage = useMutation(api.images.save);
  const deleteImage = useMutation(api.images.remove);
  const userImages = useQuery(api.images.list);

  const buildSettings = () => ({
    url: localUrl || undefined,
    storageId: localStorageId,
    opacity: localOpacity,
    blur: localBlur,
    grain: localGrain,
    vfxEnabled: localVfxEnabled,
    vfxColor: localVfxColor,
    cardBg: localCardBg,
    cardOpacity: localCardOpacity,
    cardBlur: localCardBlur,
    cardBorder: localCardBorder,
    primaryText: localPrimaryText,
    secondaryText: localSecondaryText,
    accentColor: localAccentColor,
    cardStyle: localCardStyle,
  });

  const latestRef = useRef(buildSettings());
  latestRef.current = buildSettings();
  const prevIsOpen = useRef(isOpen);

  useEffect(() => {
    if (isOpen && !prevIsOpen.current) {
      setLocalUrl(settings.url || "");
      setLocalStorageId(settings.storageId);
      setLocalOpacity(settings.opacity);
      setLocalBlur(settings.blur);
      setLocalGrain(settings.grain);
      setLocalVfxEnabled(settings.vfxEnabled);
      setLocalVfxColor(settings.vfxColor);
      setLocalCardBg(settings.cardBg);
      setLocalCardOpacity(settings.cardOpacity);
      setLocalCardBlur(settings.cardBlur);
      setLocalCardBorder(settings.cardBorder);
      setLocalPrimaryText(settings.primaryText);
      setLocalSecondaryText(settings.secondaryText);
      setLocalAccentColor(settings.accentColor);
      setLocalCardStyle(settings.cardStyle);
    }
    prevIsOpen.current = isOpen;
  }, [isOpen, settings]);

  const autoSave = (overrides?: Partial<ReturnType<typeof buildSettings>>) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => onSave({ ...latestRef.current, ...overrides }), 80);
  };

  const handleRemove = () => {
    setLocalUrl("");
    setLocalStorageId(undefined);
    onSave({
      opacity: 30, blur: 0, grain: 0,
      vfxEnabled: true, vfxColor: "#d4a373",
      cardBg: "#1a1814", cardOpacity: 100, cardBlur: 0, cardBorder: "#2a2723",
      primaryText: "#f2efeb", secondaryText: "#a8a29e",
      accentColor: "#d4a373", cardStyle: "glass",
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;

    setIsUploading(true);
    try {
      const postUrl = await generateUploadUrl();
      const result = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await result.json();
      setLocalStorageId(storageId);
      const convexSite = (process.env.NEXT_PUBLIC_CONVEX_SITE_URL || process.env.NEXT_PUBLIC_CONVEX_URL || "").replace(".cloud", ".site");
      const url = `${convexSite}/api/storage?id=${storageId}`;
      setLocalUrl(url);
      await saveImage({ storageId: storageId as any, fileName: file.name, fileType: file.type });
      autoSave({ storageId: storageId as any, url });
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 z-[200]"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-80 z-[201] bg-[#1a1814] border-l border-[#2a2723] shadow-[-20px_0_40px_rgba(0,0,0,0.5)] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2723]">
              <div className="flex items-center gap-2.5">
                <Brush className="w-4 h-4 text-[#d4a373]" />
                <span className="text-xs font-bold uppercase tracking-widest text-[#f2efeb]">Dashboard</span>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-[#2a2723] text-[#a8a29e] transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
              {/* Background */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Image className="w-3.5 h-3.5 text-[#d4a373]" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#a8a29e]">Background</span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setInputMode("url")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                      inputMode === "url"
                        ? "bg-[#d4a373] text-[#0f0e0c]"
                        : "bg-[#0f0e0c] text-[#a8a29e] hover:text-[#f2efeb] border border-[#2a2723]"
                    }`}
                  >
                    <Link className="w-3 h-3" />
                    URL
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                      inputMode === "upload"
                        ? "bg-[#d4a373] text-[#0f0e0c]"
                        : "bg-[#0f0e0c] text-[#a8a29e] hover:text-[#f2efeb] border border-[#2a2723]"
                    }`}
                  >
                    <Upload className="w-3 h-3" />
                    Upload
                  </button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                {inputMode === "url" && (
                  <input
                    name="bg-url"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    value={localUrl}
                    onChange={(e) => { setLocalUrl(e.target.value); autoSave(); }}
                    placeholder="Paste image URL..."
                    className="w-full bg-[#0f0e0c] border border-[#2a2723] rounded-lg px-3 py-2 text-xs text-[#f2efeb] placeholder:text-[#a8a29e]/30 focus:outline-none focus:border-[#d4a373]/40 transition-all"
                  />
                )}

                {isUploading && (
                  <p className="text-[10px] text-[#d4a373] animate-pulse">Uploading...</p>
                )}

              {/* Gallery */}
              {userImages && userImages.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Image className="w-3.5 h-3.5 text-[#d4a373]" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#a8a29e]">Gallery</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {userImages.map((img) => {
                      const isActive = img.storageId === localStorageId;
                      return (
                        <div key={img._id} className="relative group">
                          <button
                            onClick={() => {
                              const sid = img.storageId as any;
                              const url = img.url || "";
                              setLocalStorageId(sid);
                              setLocalUrl(url);
                              autoSave({ storageId: sid, url });
                            }}
                            className={`w-full aspect-video rounded-lg overflow-hidden border-2 transition-all ${
                              isActive ? "border-[#d4a373] ring-1 ring-[#d4a373]" : "border-[#2a2723] hover:border-[#a8a29e]"
                            }`}
                          >
                            {img.url ? (
                              <img
                                src={img.url}
                                alt={img.fileName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-[#0f0e0c]">
                                <Image className="w-4 h-4 text-[#2a2723]" />
                              </div>
                            )}
                            {isActive && (
                              <div className="absolute top-1 right-1 bg-[#d4a373] rounded-full p-0.5">
                                <Check className="w-2.5 h-2.5 text-[#0f0e0c]" />
                              </div>
                            )}
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              let sid = localStorageId;
                              let url = localUrl;
                              if (isActive) {
                                sid = undefined;
                                url = "";
                                setLocalStorageId(undefined);
                                setLocalUrl("");
                              }
                              await deleteImage({ imageId: img._id });
                              autoSave({ storageId: sid, url: url || undefined });
                            }}
                            className="absolute top-1 left-1 p-1 rounded-md bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80"
                          >
                            <Trash2 className="w-3 h-3 text-white" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Opacity Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#a8a29e]">Opacity</span>
                  <span className="text-[10px] text-[#a8a29e] font-mono">{localOpacity}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                    value={localOpacity}
                    onChange={(e) => { setLocalOpacity(Number(e.target.value)); autoSave(); }}
                  className="w-full h-1.5 rounded-full appearance-none bg-[#2a2723] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#d4a373] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg"
                />
              </div>

              {/* Blur Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Eye className="w-3.5 h-3.5 text-[#a8a29e]" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#a8a29e]">Blur</span>
                  </div>
                  <span className="text-[10px] text-[#a8a29e] font-mono">{localBlur}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                    value={localBlur}
                    onChange={(e) => { setLocalBlur(Number(e.target.value)); autoSave(); }}
                  className="w-full h-1.5 rounded-full appearance-none bg-[#2a2723] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#d4a373] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg"
                />
              </div>

              {/* Grain Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <EyeOff className="w-3.5 h-3.5 text-[#a8a29e]" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#a8a29e]">Grain</span>
                  </div>
                  <span className="text-[10px] text-[#a8a29e] font-mono">{localGrain}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                    value={localGrain}
                    onChange={(e) => { setLocalGrain(Number(e.target.value)); autoSave(); }}
                  className="w-full h-1.5 rounded-full appearance-none bg-[#2a2723] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#d4a373] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg"
                />
              </div>

              {/* VFX Glow */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-[#a8a29e]" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#a8a29e]">VFX Glow</span>
                </div>
                <button
                    onClick={() => { const next = !localVfxEnabled; setLocalVfxEnabled(next); autoSave({ vfxEnabled: next }); }}
                  className={`w-9 h-5 rounded-full transition-all relative ${
                    localVfxEnabled ? "bg-[#d4a373]" : "bg-[#2a2723]"
                  }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full bg-[#0f0e0c] absolute top-0.5 transition-all ${
                    localVfxEnabled ? "left-[18px]" : "left-[2px]"
                  }`} />
                </button>
              </div>

              {localVfxEnabled && (
                <div className="space-y-2 pl-5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#a8a29e]">Glow Color</span>
                    {localVfxColor !== COLOR_DEFAULTS.vfxColor && (
                      <button
                        onClick={() => { setLocalVfxColor(COLOR_DEFAULTS.vfxColor); autoSave(); }}
                        className="p-0.5 rounded hover:bg-[#2a2723] text-[#a8a29e] hover:text-[#f2efeb] transition-all"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <input
                    type="color"
                    value={localVfxColor}
                    onChange={(e) => { setLocalVfxColor(e.target.value); autoSave(); }}
                    className="w-full h-9 rounded-lg border border-[#2a2723] cursor-pointer bg-transparent [&::-webkit-color-swatch-wrapper]:p-1 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-none"
                  />
                </div>
              )}

              </div>

              {/* Card Style */}
              <div className="space-y-3 pt-2 border-t border-[#2a2723]/50">
                <div className="flex items-center gap-2">
                  <Brush className="w-3.5 h-3.5 text-[#a8a29e]" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#a8a29e]">Card Style</span>
                </div>

                {/* Glass / Solid Toggle */}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setLocalCardStyle("glass"); autoSave(); }}
                    className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                      localCardStyle === "glass"
                        ? "bg-[#d4a373] text-[#0f0e0c]"
                        : "bg-[#0f0e0c] text-[#a8a29e] hover:text-[#f2efeb] border border-[#2a2723]"
                    }`}
                  >Glass</button>
                  <button
                    onClick={() => { setLocalCardStyle("solid"); autoSave(); }}
                    className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                      localCardStyle === "solid"
                        ? "bg-[#d4a373] text-[#0f0e0c]"
                        : "bg-[#0f0e0c] text-[#a8a29e] hover:text-[#f2efeb] border border-[#2a2723]"
                    }`}
                  >Solid</button>
                </div>

                {localCardStyle === "glass" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#a8a29e]">Backdrop Blur</span>
                      <span className="text-[10px] text-[#a8a29e] font-mono">{localCardBlur}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={localCardBlur}
                      onChange={(e) => { setLocalCardBlur(Number(e.target.value)); autoSave(); }}
                      className="w-full h-1.5 rounded-full appearance-none bg-[#2a2723] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#d4a373] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#a8a29e]">{localCardStyle === "solid" ? "Fill" : "Opacity"}</span>
                    {localCardStyle === "glass" && (
                      <span className="text-[10px] text-[#a8a29e] font-mono">{localCardOpacity}%</span>
                    )}
                  </div>
                  {localCardStyle === "glass" && (
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={localCardOpacity}
                      onChange={(e) => { setLocalCardOpacity(Number(e.target.value)); autoSave(); }}
                      className="w-full h-1.5 rounded-full appearance-none bg-[#2a2723] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#d4a373] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg"
                    />
                  )}
                  <input
                    type="color"
                    value={localCardBg}
                    onChange={(e) => { setLocalCardBg(e.target.value); autoSave(); }}
                    className="w-full h-9 rounded-lg border border-[#2a2723] cursor-pointer bg-transparent [&::-webkit-color-swatch-wrapper]:p-1 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-none"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#a8a29e]">Border</span>
                    {localCardBorder !== COLOR_DEFAULTS.cardBorder && (
                      <button
                        onClick={() => { setLocalCardBorder(COLOR_DEFAULTS.cardBorder); autoSave(); }}
                        className="p-0.5 rounded hover:bg-[#2a2723] text-[#a8a29e] hover:text-[#f2efeb] transition-all"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <input
                    type="color"
                    value={localCardBorder}
                    onChange={(e) => { setLocalCardBorder(e.target.value); autoSave(); }}
                    className="w-full h-9 rounded-lg border border-[#2a2723] cursor-pointer bg-transparent [&::-webkit-color-swatch-wrapper]:p-1 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-none"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#a8a29e]">Primary Text</span>
                    {localPrimaryText !== COLOR_DEFAULTS.primaryText && (
                      <button
                        onClick={() => { setLocalPrimaryText(COLOR_DEFAULTS.primaryText); autoSave(); }}
                        className="p-0.5 rounded hover:bg-[#2a2723] text-[#a8a29e] hover:text-[#f2efeb] transition-all"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <input
                    type="color"
                    value={localPrimaryText}
                    onChange={(e) => { setLocalPrimaryText(e.target.value); autoSave(); }}
                    className="w-full h-9 rounded-lg border border-[#2a2723] cursor-pointer bg-transparent [&::-webkit-color-swatch-wrapper]:p-1 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-none"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#a8a29e]">Secondary Text</span>
                    {localSecondaryText !== COLOR_DEFAULTS.secondaryText && (
                      <button
                        onClick={() => { setLocalSecondaryText(COLOR_DEFAULTS.secondaryText); autoSave(); }}
                        className="p-0.5 rounded hover:bg-[#2a2723] text-[#a8a29e] hover:text-[#f2efeb] transition-all"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <input
                    type="color"
                    value={localSecondaryText}
                    onChange={(e) => { setLocalSecondaryText(e.target.value); autoSave(); }}
                    className="w-full h-9 rounded-lg border border-[#2a2723] cursor-pointer bg-transparent [&::-webkit-color-swatch-wrapper]:p-1 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-none"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#a8a29e]">Accent</span>
                    {localAccentColor !== COLOR_DEFAULTS.accentColor && (
                      <button
                        onClick={() => { setLocalAccentColor(COLOR_DEFAULTS.accentColor); autoSave(); }}
                        className="p-0.5 rounded hover:bg-[#2a2723] text-[#a8a29e] hover:text-[#f2efeb] transition-all"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <input
                    type="color"
                    value={localAccentColor}
                    onChange={(e) => { setLocalAccentColor(e.target.value); autoSave(); }}
                    className="w-full h-9 rounded-lg border border-[#2a2723] cursor-pointer bg-transparent [&::-webkit-color-swatch-wrapper]:p-1 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-none"
                  />
                </div>
              </div>

            </div>

            {/* Footer Actions */}
            <div className="px-5 py-4 border-t border-[#2a2723]">
              {localUrl && (
                <button
                  onClick={handleRemove}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-[#2a2723] text-[#a8a29e] hover:text-red-400 hover:border-red-500/20 transition-all text-[10px] font-bold uppercase tracking-widest"
                >
                  <Trash2 className="w-3 h-3" />
                  Remove Background
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
