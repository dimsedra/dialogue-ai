import fs from 'fs/promises';
import path from 'path';

const MODEL_ID = "Xenova/multilingual-e5-small";
const DEST_DIR = path.join(process.cwd(), "src", "lib", "models", MODEL_ID);

const FILES_TO_DOWNLOAD = [
  "config.json",
  "tokenizer_config.json",
  "tokenizer.json",
  "special_tokens_map.json",
  "onnx/model_quantized.onnx",
  "onnx/model.onnx"
];

async function downloadModel() {
  console.log(`Starting download for ${MODEL_ID}...`);
  
  for (const file of FILES_TO_DOWNLOAD) {
    const url = `https://huggingface.co/${MODEL_ID}/resolve/main/${file}`;
    const destPath = path.join(DEST_DIR, file);
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    
    console.log(`Downloading ${file}...`);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await fs.writeFile(destPath, buffer);
      console.log(`✅ Saved: ${file} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
    } catch (e) {
      console.error(`❌ Failed to download ${file}:`, e.message);
    }
  }
  
  console.log("\n🎉 All model files downloaded successfully!");
  console.log(`Location: ${DEST_DIR}`);
}

downloadModel().catch(console.error);
