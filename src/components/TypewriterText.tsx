import { useState, useRef, useEffect } from 'react';
import { Text } from 'react-native';

export function TypewriterText({
  text,
  style,
  interval = 22,
  forceComplete = false,
  onComplete,
}: {
  text:            string;
  style?:          object;
  interval?:       number;
  forceComplete?:  boolean;
  onComplete?:     () => void;
}) {
  const [displayed, setDisplayed] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  useEffect(() => {
    if (!text) {
      setDisplayed('');
      return;
    }

    if (interval === 0 || forceComplete) {
      setDisplayed(text);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      onCompleteRef.current?.();
      return;
    }

    setDisplayed('');
    let i = 0;
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
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [interval, text, forceComplete]);

  return <Text style={style}>{displayed}</Text>;
}
