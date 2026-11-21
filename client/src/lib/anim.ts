/**
 * محرك الحركات — GSAP بلمسة آبل.
 * كل الدوال تحترم prefers-reduced-motion وتتحول لظهور بسيط بلا حركة.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export { gsap };

function reduced() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** ظهور تدريجي للأقسام عند التمرير — للعناصر ذات data-reveal */
export function revealSections(root: HTMLElement | null) {
  if (!root || reduced()) return;
  root.querySelectorAll('[data-reveal]').forEach((el) => {
    gsap.fromTo(el, { opacity: 0, y: 20 }, {
      opacity: 1, y: 0, duration: 0.55, ease: 'power2.out',
      scrollTrigger: { trigger: el, start: 'top 94%', once: true },
    });
  });
}

/** دخول متدرج للبطاقات — للعناصر ذات data-card داخل الحاوية */
export function staggerCards(container: HTMLElement | null) {
  if (!container || reduced()) return;
  const cards = container.querySelectorAll('[data-card]');
  if (!cards.length) return;
  gsap.fromTo(cards, { opacity: 0, y: 14, scale: 0.985 }, {
    opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'power2.out', stagger: 0.05,
    clearProps: 'transform,opacity',
  });
}

/** دخول الشيت السفلي بحركة زنبركية ناعمة */
export function sheetIn(el: HTMLElement | null) {
  if (!el || reduced()) return;
  gsap.fromTo(el, { opacity: 0, y: 30, scale: 0.96 },
    { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'back.out(1.55)' });
}

/** ظهور عنصر بنبضة مرنة (أيقونة النجاح مثلًا) */
export function popIn(el: HTMLElement | null) {
  if (!el || reduced()) return;
  gsap.fromTo(el, { scale: 0.5, opacity: 0 },
    { scale: 1, opacity: 1, duration: 0.6, ease: 'elastic.out(1, 0.5)', clearProps: 'transform,opacity' });
}

/** نبضة هالة متكررة (بطاقة الطلب المنتظر المرفوض) */
export function haloPulse(el: HTMLElement) {
  if (reduced()) return;
  gsap.fromTo(el, { boxShadow: '0 0 0 0 rgba(245,158,11,0.45)' },
    { boxShadow: '0 0 0 16px rgba(245,158,11,0)', duration: 1.5, repeat: -1, ease: 'power1.out' });
}

/** ظهور هادئ لكل الحاوية عند تحميل الصفحة */
export function fadeInUp(el: HTMLElement | null) {
  if (!el || reduced()) return;
  gsap.fromTo(el, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', clearProps: 'transform,opacity' });
}
