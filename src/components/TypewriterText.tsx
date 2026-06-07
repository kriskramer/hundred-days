import { useState, useRef, useEffect } from 'react';
import { Text } from 'react-native';

export function TypewriterText({
  text,
  style,
  interval = 22,
  delay = 0,
  forceComplete = false,
  onComplete,
}: {
  text:            string;
  style?:          object;
  interval?:       number;
  delay?:          number;
  forceComplete?:  boolean;
  onComplete?:     () => void;
}) {
  const [displayed, setDisplayed] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef(onComplete);
  const displayedRef = useRef(displayed);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  useEffect(() => {
    displayedRef.current = displayed;
  }, [displayed]);

  useEffect(() => {
    if (!text) {
      setDisplayed('');
      displayedRef.current = '';
      return;
    }

    if (interval === 0 || forceComplete) {
      setDisplayed(text);
      displayedRef.current = text;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      onCompleteRef.current?.();
      return;
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const startIndex = text.startsWith(displayedRef.current) ? displayedRef.current.length : 0;
    if (startIndex === 0) {
      setDisplayed('');
      displayedRef.current = '';
    }

    const start = () => {
      let i = startIndex;
      if (i >= text.length) {
        onCompleteRef.current?.();
        return;
      }
      intervalRef.current = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          onCompleteRef.current?.();
        }
      }, interval);
    };

    if (delay > 0) {
      timeoutRef.current = setTimeout(start, delay);
    } else {
      start();
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current)  clearTimeout(timeoutRef.current);
    };
  }, [interval, delay, text, forceComplete]);

  return <Text style={style}>{displayed}</Text>;
}
