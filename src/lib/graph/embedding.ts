import path from 'path';
import { env, pipeline } from '@huggingface/transformers';

// 1. Force offline mode to prevent runtime downloads
env.allowRemoteModels = false;

// 2. Point to our local bundled models directory
env.localModelPath = path.join(process.cwd(), 'src', 'lib', 'models');

// 3. Singleton pipeline instance
let extractorPromise: Promise<any> | null = null;

const getExtractor = async () => {
  if (!extractorPromise) {
    // Model Xenova/multilingual-e5-small is pre-downloaded to src/lib/models/Xenova/multilingual-e5-small
    extractorPromise = pipeline('feature-extraction', 'Xenova/multilingual-e5-small');
  }
  return extractorPromise;
};

/**
 * Generates a 384-dimensional embedding vector for a given text using
 * the offline bundled Xenova/multilingual-e5-small model.
 */
export const getLocalEmbedding = async (text: string): Promise<number[]> => {
  const extractor = await getExtractor();
  
  // Compute embedding using mean pooling and normalization
  const output = await extractor(text, { 
    pooling: 'mean', 
    normalize: true 
  });
  
  // output.data is a Float32Array. Convert to standard JS array for DB operations
  return Array.from(output.data);
};
