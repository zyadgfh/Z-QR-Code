import { create } from 'zustand';

/**
 * إشعارات فورية (Toasts) — رد فعل مرئي موحد لكل إجراء حرج.
 * تُعرض عبر <Toaster/> في الجذر وتُستدعى بـ toast(msg, kind).
 */

export type ToastKind = 'ok' | 'error' | 'info';
type Toast = { id: number; msg: string; kind: ToastKind };

type ToastState = {
  items: Toast[];
  push: (msg: string, kind?: ToastKind) => void;
  dismiss: (id: number) => void;
};

let seq = 1;

export const useToasts = create<ToastState>((set, get) => ({
  items: [],
  push: (msg, kind = 'ok') => {
    const id = seq++;
    set({ items: [...get().items, { id, msg, kind }] });
    setTimeout(() => get().dismiss(id), 3200);
  },
  dismiss: (id) => set({ items: get().items.filter((t) => t.id !== id) }),
}));

export function toast(msg: string, kind?: ToastKind) {
  useToasts.getState().push(msg, kind);
}
