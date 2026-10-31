import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

const native = Capacitor.isNativePlatform();

export type Buzz = 'light' | 'medium' | 'heavy' | 'error';

/** Light buzz on hits, heavy on death. Native uses the Taptic engine; Android web falls back to vibrate(). */
export function buzz(kind: Buzz) {
  if (native) {
    if (kind === 'error') void Haptics.notification({ type: NotificationType.Error }).catch(() => {});
    else
      void Haptics.impact({
        style: kind === 'light' ? ImpactStyle.Light : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Heavy,
      }).catch(() => {});
    return;
  }
  const ms = { light: 10, medium: 25, heavy: 60, error: [80, 60, 120] }[kind];
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
}
