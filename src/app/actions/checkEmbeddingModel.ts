"use server";
import fs from 'fs/promises';
import path from 'path';

export async function checkEmbeddingModel() {
  try {
    const modelPath = path.join(
      process.cwd(),
      'src',
      'lib',
      'models',
      'Xenova',
      'multilingual-e5-small',
      'onnx',
      'model_quantized.onnx'
    );
    await fs.access(modelPath);
    return true;
  } catch (error) {
    return false;
  }
}
