import { useState, useEffect, useRef } from "react";

export function useSmoothText(targetText: string, isTyping: boolean) {
  const [displayedText, setDisplayedText] = useState(targetText);
  
  const targetTextRef = useRef(targetText);
  const displayedTextRef = useRef(displayedText);
  const isTypingRef = useRef(isTyping);
  const rafRef = useRef<number | null>(null);

  targetTextRef.current = targetText;
  isTypingRef.current = isTyping;

  useEffect(() => {
    const animate = () => {
      const target = targetTextRef.current;
      const current = displayedTextRef.current;
      const typing = isTypingRef.current;

      if (!typing) {
        if (current !== target) {
          displayedTextRef.current = target;
          setDisplayedText(target);
        }
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      if (current === target) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }

      // Only smooth stream if we are appending
      if (target.startsWith(current)) {
        const diff = target.length - current.length;
        // Calculate dynamic chunk size to catch up if we are far behind
        // Min 1 char, max half the diff, to ensure smooth rapid streaming
        const charsToAdvance = Math.min(diff, Math.max(1, Math.floor(diff / 4)));
        const nextText = target.slice(0, current.length + charsToAdvance);
        
        displayedTextRef.current = nextText;
        setDisplayedText(nextText);
      } else {
        // If the text completely changed (not an append), snap to it
        displayedTextRef.current = target;
        setDisplayedText(target);
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []); // Run once to start the loop

  return displayedText;
}
