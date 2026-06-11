import { Platform } from 'react-native';
import type { ViewStyle } from 'react-native';

const isWeb = Platform.OS === 'web' || typeof document !== 'undefined';

export const NATIVE_ANIMATED_DRIVER = !isWeb;


interface ShadowStyleOptions {
  color: string;
  offsetX: number;
  offsetY: number;
  opacity: number;
  radius: number;
  elevation?: number;
}

function toBoxShadowColor(color: string, opacity: number): string {
  const normalized = color.trim();

  if (normalized.startsWith('rgba(')) {
    const channels = normalized.slice(5, -1).split(',').map(part => part.trim());
    if (channels.length === 4) {
      return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${opacity})`;
    }
  }

  if (normalized.startsWith('rgb(')) {
    const channels = normalized.slice(4, -1).split(',').map(part => part.trim());
    if (channels.length === 3) {
      return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${opacity})`;
    }
  }

  if (normalized.startsWith('#')) {
    const hex = normalized.slice(1);
    const expanded = hex.length === 3
      ? hex.split('').map(char => char + char).join('')
      : hex;

    if (expanded.length === 6) {
      const red = parseInt(expanded.slice(0, 2), 16);
      const green = parseInt(expanded.slice(2, 4), 16);
      const blue = parseInt(expanded.slice(4, 6), 16);
      return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
    }
  }

  return normalized;
}

export function createShadowStyle({
  color,
  offsetX,
  offsetY,
  opacity,
  radius,
  elevation = 0,
}: ShadowStyleOptions): ViewStyle {
  if (isWeb) {
    return {
      boxShadow: `${offsetX}px ${offsetY}px ${radius}px ${toBoxShadowColor(color, opacity)}`,
    };
  }

  return {
    elevation,
    shadowColor: color,
    shadowOffset: { width: offsetX, height: offsetY },
    shadowOpacity: opacity,
    shadowRadius: radius,
  };
}
