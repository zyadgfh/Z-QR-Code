/**
 * محرك الحركات — GSAP بلمسة آبل.
 * الترقية لـ gsap.matchMedia() (توصية gsap-skills الرسمية): كل حركة تُسجل تحت
 * الاستعلام (prefers-reduced-motion: no-preference) — عند تفعيل تقليل الحركة
 * لا تُسجل أصلًا، وكل دالة ترجع سياقًا له revert() ليستدعاه المستدعي في cleanup.
 * الاستدعاء داخل useEffect: return animFn(el) — التنظيف تلقائي.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export { gsap };

const MOTION_OK = '(prefers-reduced-motion: no-preference)';

/** ظهور تدريجي للأقسام عند التمرير — للعناصر ذات data-reveal */
export function revealSections(root: HTMLElement | null) {
  if (!root) return null;
  const mm = gsap.matchMedia();
  mm.add(MOTION_OK, () => {
    root.querySelectorAll('[data-reveal]').forEach((el) => {
      gsap.fromTo(el, { opacity: 0, y: 20 }, {
        opacity: 1, y: 0, duration: 0.55, ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 94%', once: true },
      });
    });
  });
  return mm;
}

/** دخول متدرج للبطاقات — للعناصر ذات data-card داخل الحاوية */
export function staggerCards(container: HTMLElement | null) {
  if (!container) return null;
  const cards = container.querySelectorAll('[data-card]');
  if (!cards.length) return null;
  const mm = gsap.matchMedia();
  mm.add(MOTION_OK, () => {
    gsap.fromTo(cards, { opacity: 0, y: 14, scale: 0.985 }, {
      opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'power2.out', stagger: 0.05,
      clearProps: 'transform,opacity',
    });
  });
  return mm;
}

/** دخول الشيت السفلي بحركة زنبركية ناعمة */
export function sheetIn(el: HTMLElement | null) {
  if (!el) return null;
  const mm = gsap.matchMedia();
  mm.add(MOTION_OK, () => {
    gsap.fromTo(el, { opacity: 0, y: 30, scale: 0.96 },
      { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: 'back.out(1.55)' });
  });
  return mm;
}

/** ظهور عنصر بنبضة مرنة (أيقونة النجاح مثلًا) */
export function popIn(el: HTMLElement | null) {
  if (!el) return null;
  const mm = gsap.matchMedia();
  mm.add(MOTION_OK, () => {
    gsap.fromTo(el, { scale: 0.5, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.6, ease: 'elastic.out(1, 0.5)', clearProps: 'transform,opacity' });
  });
  return mm;
}

/** نبضة هالة متكررة (بطاقة الطلب المنتظر) — إلزامية التنظيف عبر mm.revert() */
export function haloPulse(el: HTMLElement) {
  const mm = gsap.matchMedia();
  mm.add(MOTION_OK, () => {
    gsap.fromTo(el, { boxShadow: '0 0 0 0 rgba(245,158,11,0.45)' },
      { boxShadow: '0 0 0 16px rgba(245,158,11,0)', duration: 1.5, repeat: -1, ease: 'power1.out' });
  });
  return mm;
}

/** هزة أفقية خفيفة (رسائل الخطأ بأسلوب iOS) */
export function shake(el: HTMLElement | null) {
  if (!el) return null;
  const mm = gsap.matchMedia();
  mm.add(MOTION_OK, () => {
    gsap.fromTo(el, { x: 0 }, {
      x: 0, duration: 0.45, ease: 'power1.out',
      keyframes: [{ x: -7 }, { x: 6 }, { x: -4 }, { x: 2 }, { x: 0 }],
    });
  });
  return mm;
}

/** ظهور هادئ لكل الحاوية عند تحميل الصفحة */
export function fadeInUp(el: HTMLElement | null) {
  if (!el) return null;
  const mm = gsap.matchMedia();
  mm.add(MOTION_OK, () => {
    gsap.fromTo(el, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', clearProps: 'transform,opacity' });
  });
  return mm;
}
