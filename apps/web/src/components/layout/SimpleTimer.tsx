import { useEffect, useRef } from 'react';

interface Props {
  active?: boolean;
  duration?: number;
  repeats?: number;
  onComplete?: (payload: { repeat: number; repeatsTotal: number }) => void;
  [key: string]: unknown;
}

export function SimpleTimer({ active = false, duration = 10, repeats = 1, onComplete }: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatCountRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    function clear() {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    }

    if (!active) {
      clear();
      repeatCountRef.current = 0;
      return;
    }

    function schedule() {
      timerRef.current = setTimeout(() => {
        repeatCountRef.current += 1;
        onCompleteRef.current?.({ repeat: repeatCountRef.current, repeatsTotal: repeats });
        if (repeatCountRef.current < repeats) schedule();
        else timerRef.current = null;
      }, duration * 1000);
    }

    repeatCountRef.current = 0;
    schedule();

    return clear;
  }, [active, duration, repeats]);

  return null;
}
