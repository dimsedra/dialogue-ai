# Local AI Center & Managed GGUF Model Loader

This document outlines the architecture and UI design for the **Local AI Center** in Dialogue, enabling a seamless local LLM experience. Instead of requiring users to manually configure and run external terminal CLI sessions or third-party servers (like LM Studio or Ollama), Dialogue natively loads and runs local GGUF models directly within the application process while retaining external server integration as a fallback.

---

## 1. The Core Vision: Dual-Mode Architecture

The settings panel will feature a dedicated **Local AI Center** page offering two operational modes:

```
[ Local Model Provider Selection ]
◉ Managed GGUF Mode (Dialogue Native)
  ├─ Model Path: [ C:/Users/Max/models/llama-3b.gguf ]  [ Browse... ]
  ├─ Context Size:  [ 4096 ]
  └─ GPU Layers:    [ 99   ] (99 = Auto-Offload all)
  
◯ External Server Mode (Ollama / LM Studio / LocalAI)
  └─ Connection URL: [ http://localhost:11434 ] [ Test Connection ]
```

### Mode A: Managed GGUF Mode (Default & Recommended)
*   **Engine**: Loaded programmatically using `@lgrammel/llama-cpp-provider` (which wraps `node-llama-cpp`).
*   **Behavior**: When a chat session starts or on application boot, the app launches a background Node.js runner process to load the GGUF file from the user's selected disk path.
*   **Memory Management**: When Dialogue is minimized or idle for a configurable duration, it calls `model.dispose()` to immediately free up system RAM and GPU VRAM, reloading the model dynamically on window focus.

### Mode B: External Server Mode (Power User Fallback)
*   **Behavior**: If the user already runs system-wide daemons (such as Ollama on port `11434` or LM Studio on `1234`), Dialogue bypasses its native loader and forwards queries to the external HTTP API, preventing redundant memory usage.

---

## 2. Settings UI & User Experience

The Settings Page under **Local AI** will contain the following components:

### A. Model Path Input & Native File Picker
*   **The Path Field**: A read-only text input showing the absolute file path of the active `.gguf` file.
*   **Browse Button**: Triggers the Electron native file selection dialog (via preload IPC bridge) to let the user select a file without typing paths:
    ```typescript
    // In preload.js:
    // contextBridge.exposeInMainWorld('electronAPI', {
    //   openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
    // })
    
    // In React component:
    const selectedPath = await window.electronAPI.openFileDialog();
    ```
*   **Copy Button**: A quick-action icon next to the path field to let users copy the active model path to their clipboard.

### B. Hardware Configuration Tuning
To let users optimize inference speed based on their machine specifications:
*   **Context Size**: Input number (default: `4096`).
*   **GPU Layers**: Input number (default: `99`). Controls how many model layers are offloaded to the GPU (CUDA on Windows, Metal on macOS, Vulkan on others). `0` disables GPU acceleration.
*   **Threads**: Input number (default: `4`). Number of CPU threads dedicated to processing.

### C. Live Status Indicator & State Machine
A status badge displays the current state of the local LLM runner:
*   ⚪ **Unloaded**: No model loaded (saves memory).
*   🟡 **Loading (X%)**: Model is being read from disk and loaded into VRAM. A friendly progress loader is displayed.
*   🟢 **Ready**: Model is loaded and active. Shows VRAM allocation metrics (e.g. *"Loaded in 4.2GB VRAM"*).
*   🔴 **Error**: Displays loading failures (e.g. *"CUDA Out of Memory"* or *"Invalid GGUF File"*).

---

## 3. Crash Isolation & Stability

Running large GGUF files (3GB–8GB) inside the same process as Next.js carries risks. If a model encounters a C++ level segmentation fault or Out-Of-Memory (OOM) exception, it will crash the entire Next.js sidecar server.

### Isolation Strategy
To prevent this, Dialogue runs the `node-llama-cpp` loader in an **isolated sidecar process**:
1.  Electron spawns a lightweight background Node script (`llm-runner.js`) on startup.
2.  Next.js communicates with `llm-runner.js` over a local WebSocket or HTTP port.
3.  If the local model crashes due to memory limits, only the runner process dies. Next.js catches the network drop, displays an error alert in the chat interface, and provides a **"Restart Local Engine"** button to reload the model.

---

## 4. Hardware Profiler (llmfit Integration)

To guide users before they load or download a model:
*   **Hardware Sniffing**: Uses Node's `systeminformation` package to check total system RAM and GPU VRAM.
*   **Fit Badges**: Calculates model size requirements against VRAM:
    *   🟢 **Perfect Fit**: Fits fully in VRAM (fastest speed).
    *   🟡 **Partial Fit**: Fits partially in VRAM, spills over to CPU RAM (slower).
    *   🔴 **Too Large**: Exceeds combined RAM/VRAM, showing a warning to prevent system freezes.
