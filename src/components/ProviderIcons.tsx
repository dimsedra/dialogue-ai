import React from 'react';
import Image from 'next/image';

import alibabaIcon from '@/img/icon/alibaba.svg';
import basetenIcon from '@/img/icon/baseten.svg';
import claudeIcon from '@/img/icon/claude.svg';
import cohereIcon from '@/img/icon/cohere.svg';
import deepinfraIcon from '@/img/icon/deepinfra.svg';
import deepseekIcon from '@/img/icon/deepseek.svg';
import fireworksIcon from '@/img/icon/fireworks.svg';
import geminiIcon from '@/img/icon/gemini.svg';
import grokIcon from '@/img/icon/grok.svg';
import groqIcon from '@/img/icon/groq.svg';
import huggingFaceIcon from '@/img/icon/hugging-face.svg';
import lmStudioIcon from '@/img/icon/lm-studio.svg';
import minimaxIcon from '@/img/icon/minimax.svg';
import mistralIcon from '@/img/icon/mistral.svg';
import moonshotIcon from '@/img/icon/moonshot.svg';
import ollamaIcon from '@/img/icon/ollama.svg';
import openaiIcon from '@/img/icon/openai.svg';
import opencodeIcon from '@/img/icon/opencode.svg';
import openrouterIcon from '@/img/icon/openrouter.svg';
import togetherAiIcon from '@/img/icon/together-ai.svg';
import zhipuIcon from '@/img/icon/zhipu.svg';

const providerMap: Record<string, any> = {
  alibaba: alibabaIcon,
  baseten: basetenIcon,
  anthropic: claudeIcon,
  cohere: cohereIcon,
  deepinfra: deepinfraIcon,
  deepseek: deepseekIcon,
  fireworks: fireworksIcon,
  gemini: geminiIcon,
  xai: grokIcon,
  groq: groqIcon,
  huggingface: huggingFaceIcon,
  lmstudio: lmStudioIcon,
  "local-gguf": lmStudioIcon,
  minimax: minimaxIcon,
  mistral: mistralIcon,
  moonshotai: moonshotIcon,
  ollama: ollamaIcon,
  openai: openaiIcon,
  opencode: opencodeIcon,
  openrouter: openrouterIcon,
  togetherai: togetherAiIcon,
  zhipu: zhipuIcon,
};

export const GenericProviderIcon = ({ initials, ...props }: any) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24" {...props}>
    <rect width="24" height="24" rx="6" fill="#1a1814" stroke="currentColor" strokeWidth="1.5" />
    <text x="12" y="16" fontSize="11" fontWeight="bold" textAnchor="middle" fill="currentColor">{initials}</text>
  </svg>
);

export function getProviderIcon(providerId: string) {
  const iconSrc = providerMap[providerId];
  if (iconSrc) {
    return (props: any) => (
      <Image 
        src={iconSrc} 
        alt={providerId} 
        width={24} 
        height={24} 
        className={props.className} 
      />
    );
  }
  
  return (props: any) => <GenericProviderIcon initials={providerId.slice(0,2).toUpperCase()} {...props} />;
}
