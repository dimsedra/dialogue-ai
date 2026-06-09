import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Image, X, Upload, Link, Eye, EyeOff, Brush, Trash2, Sparkles, Check, RotateCcw } from "lucide-react";
import { usePbUserImagesList, usePbImageSave, usePbImageDelete } from "@/pb-compat";
import { PageStyleSettings, COLOR_DEFAULTS } from "../../utils/color";

interface PageCustomizerProps {
  isOpen: boolean;
  onClose: () => void;
  settings: PageStyleSettings;
  onUpdate: (updates: Partial<PageStyleSettings>) => void;
  pageName?: string;
}

export function PageCustomizer({ isOpen, onClose, settings, onUpdate, pageName = "Dashboard" }: PageCustomizerProps) {
  const [inputMode, setInputMode] = useState<"url" | "upload">("url");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const saveImage = usePbImageSave();
  const deleteImage = usePbImageDelete();
  const userImages = usePbUserImagesList();

  const handleRemove = () => {
    onUpdate({
      url: undefined,
      storageId: undefined,
      opacity: 30,
      blur: 0,
      grain: 0,
      vfxEnabled: true,
      vfxColor: "#d4a373",
      cardBg: "#1a1814",
      cardOpacity: 100,
      cardBlur: 0,
      cardBorder: "#2a2723",
      primaryText: "#f2efeb",
      secondaryText: "#a8a29e",
      accentColor: "#d4a373",
      cardStyle: "glass",
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;

    setIsUploading(true);
    try {
      const { storageId, url } = await saveImage({ file });
      onUpdate({ storageId, url });
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setIsUploading(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 z-200"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-80 z-201 bg-[#1a1814] border-l border-[#2a2723] shadow-[-20px_0_40px_rgba(0,0,0,0.5)] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2723]">
              <div className="flex items-center gap-2.5">
                <Brush className="w-4 h-4 text-[#d4a373]" />
                <span className="text-xs font-bold uppercase tracking-widest text-[#f2efeb]">{pageName}</span>
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
                    value={settings.url || ""}
                    onChange={(e) => onUpdate({ url: e.target.value || undefined })}
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
                        const isActive = img.storageId === settings.storageId;
                        return (
                          <div key={img._id} className="relative group">
                            <button
                              onClick={() => {
                                onUpdate({ storageId: img.storageId, url: img.url || undefined });
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
                                let updates: Partial<PageStyleSettings> = {};
                                if (isActive) {
                                  updates = { storageId: undefined, url: undefined };
                                }
                                await deleteImage({ imageId: img._id });
                                onUpdate(updates);
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
                    <span className="text-[10px] text-[#a8a29e] font-mono">{settings.opacity}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.opacity}
                    onChange={(e) => onUpdate({ opacity: Number(e.target.value) })}
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
                    <span className="text-[10px] text-[#a8a29e] font-mono">{settings.blur}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.blur}
                    onChange={(e) => onUpdate({ blur: Number(e.target.value) })}
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
                    <span className="text-[10px] text-[#a8a29e] font-mono">{settings.grain}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.grain}
                    onChange={(e) => onUpdate({ grain: Number(e.target.value) })}
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
                    onClick={() => onUpdate({ vfxEnabled: !settings.vfxEnabled })}
                    className={`w-9 h-5 rounded-full transition-all relative ${
                      settings.vfxEnabled ? "bg-[#d4a373]" : "bg-[#2a2723]"
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full bg-[#0f0e0c] absolute top-0.5 transition-all ${
                      settings.vfxEnabled ? "left-4.5" : "left-0.5"
                    }`} />
                  </button>
                </div>

                {settings.vfxEnabled && (
                  <div className="space-y-2 pl-5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#a8a29e]">Glow Color</span>
                      {settings.vfxColor !== COLOR_DEFAULTS.vfxColor && (
                        <button
                          onClick={() => onUpdate({ vfxColor: COLOR_DEFAULTS.vfxColor })}
                          className="p-0.5 rounded hover:bg-[#2a2723] text-[#a8a29e] hover:text-[#f2efeb] transition-all"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <input
                      type="color"
                      value={settings.vfxColor}
                      onChange={(e) => onUpdate({ vfxColor: e.target.value })}
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
                    onClick={() => onUpdate({ cardStyle: "glass" })}
                    className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                      settings.cardStyle === "glass"
                        ? "bg-[#d4a373] text-[#0f0e0c]"
                        : "bg-[#0f0e0c] text-[#a8a29e] hover:text-[#f2efeb] border border-[#2a2723]"
                    }`}
                  >Glass</button>
                  <button
                    onClick={() => onUpdate({ cardStyle: "solid" })}
                    className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                      settings.cardStyle === "solid"
                        ? "bg-[#d4a373] text-[#0f0e0c]"
                        : "bg-[#0f0e0c] text-[#a8a29e] hover:text-[#f2efeb] border border-[#2a2723]"
                    }`}
                  >Solid</button>
                </div>

                {settings.cardStyle === "glass" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#a8a29e]">Backdrop Blur</span>
                      <span className="text-[10px] text-[#a8a29e] font-mono">{settings.cardBlur}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={settings.cardBlur}
                      onChange={(e) => onUpdate({ cardBlur: Number(e.target.value) })}
                      className="w-full h-1.5 rounded-full appearance-none bg-[#2a2723] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#d4a373] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#a8a29e]">{settings.cardStyle === "solid" ? "Fill" : "Opacity"}</span>
                    {settings.cardStyle === "glass" && (
                      <span className="text-[10px] text-[#a8a29e] font-mono">{settings.cardOpacity}%</span>
                    )}
                  </div>
                  {settings.cardStyle === "glass" && (
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={settings.cardOpacity}
                      onChange={(e) => onUpdate({ cardOpacity: Number(e.target.value) })}
                      className="w-full h-1.5 rounded-full appearance-none bg-[#2a2723] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#d4a373] [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg"
                    />
                  )}
                  <input
                    type="color"
                    value={settings.cardBg}
                    onChange={(e) => onUpdate({ cardBg: e.target.value })}
                    className="w-full h-9 rounded-lg border border-[#2a2723] cursor-pointer bg-transparent [&::-webkit-color-swatch-wrapper]:p-1 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-none"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#a8a29e]">Border</span>
                    {settings.cardBorder !== COLOR_DEFAULTS.cardBorder && (
                      <button
                        onClick={() => onUpdate({ cardBorder: COLOR_DEFAULTS.cardBorder })}
                        className="p-0.5 rounded hover:bg-[#2a2723] text-[#a8a29e] hover:text-[#f2efeb] transition-all"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <input
                    type="color"
                    value={settings.cardBorder}
                    onChange={(e) => onUpdate({ cardBorder: e.target.value })}
                    className="w-full h-9 rounded-lg border border-[#2a2723] cursor-pointer bg-transparent [&::-webkit-color-swatch-wrapper]:p-1 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-none"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#a8a29e]">Primary Text</span>
                    {settings.primaryText !== COLOR_DEFAULTS.primaryText && (
                      <button
                        onClick={() => onUpdate({ primaryText: COLOR_DEFAULTS.primaryText })}
                        className="p-0.5 rounded hover:bg-[#2a2723] text-[#a8a29e] hover:text-[#f2efeb] transition-all"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <input
                    type="color"
                    value={settings.primaryText}
                    onChange={(e) => onUpdate({ primaryText: e.target.value })}
                    className="w-full h-9 rounded-lg border border-[#2a2723] cursor-pointer bg-transparent [&::-webkit-color-swatch-wrapper]:p-1 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-none"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#a8a29e]">Secondary Text</span>
                    {settings.secondaryText !== COLOR_DEFAULTS.secondaryText && (
                      <button
                        onClick={() => onUpdate({ secondaryText: COLOR_DEFAULTS.secondaryText })}
                        className="p-0.5 rounded hover:bg-[#2a2723] text-[#a8a29e] hover:text-[#f2efeb] transition-all"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <input
                    type="color"
                    value={settings.secondaryText}
                    onChange={(e) => onUpdate({ secondaryText: e.target.value })}
                    className="w-full h-9 rounded-lg border border-[#2a2723] cursor-pointer bg-transparent [&::-webkit-color-swatch-wrapper]:p-1 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-none"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#a8a29e]">Accent</span>
                    {settings.accentColor !== COLOR_DEFAULTS.accentColor && (
                      <button
                        onClick={() => onUpdate({ accentColor: COLOR_DEFAULTS.accentColor })}
                        className="p-0.5 rounded hover:bg-[#2a2723] text-[#a8a29e] hover:text-[#f2efeb] transition-all"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <input
                    type="color"
                    value={settings.accentColor}
                    onChange={(e) => onUpdate({ accentColor: e.target.value })}
                    className="w-full h-9 rounded-lg border border-[#2a2723] cursor-pointer bg-transparent [&::-webkit-color-swatch-wrapper]:p-1 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-none"
                  />
                </div>
              </div>

            </div>

            {/* Footer Actions */}
            <div className="px-5 py-4 border-t border-[#2a2723]">
              {settings.url && (
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
    </AnimatePresence>,
    document.body
  );
}
