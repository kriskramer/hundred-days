import { Alert, Platform } from 'react-native';
import type { AlertButton } from 'react-native';

type ConfirmActionOptions = {
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

function getWebConfirm(): ((message?: string) => boolean) | null {
  const confirm = (globalThis as typeof globalThis & {
    confirm?: (message?: string) => boolean;
  }).confirm;

  return typeof confirm === 'function' ? confirm : null;
}

export function confirmAction(
  title: string,
  message: string,
  onConfirm: () => void,
  options: ConfirmActionOptions = {},
): void {
  const {
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    destructive = false,
  } = options;

  if (Platform.OS === 'web' || typeof document !== 'undefined') {
    const confirm = getWebConfirm();
    if (!confirm || confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }

  const buttons: AlertButton[] = [
    { text: cancelText, style: 'cancel' },
    {
      text: confirmText,
      style: destructive ? 'destructive' : 'default',
      onPress: onConfirm,
    },
  ];

  Alert.alert(title, message, buttons);
}
