import { useEffect } from 'react';

/**
 * خروج تلقائي بعد خمول (لا تفاعل مستخدم) — SEC-02.
 * الطلبات الشبكية الدورية (استقصاء الطلبات) لا تُحسب تفاعلًا.
 */
export function useIdleLogout(onIdle: () => void, minutes = 30) {
  useEffect(() => {
    const ms = minutes * 60_000;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(onIdle, ms);
    };
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutes]);
}
