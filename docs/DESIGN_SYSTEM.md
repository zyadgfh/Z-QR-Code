# نظام التصميم المركزي — Z-QR-Code (D7)

> السلطة التصميمية: **apple-design-skill** (github.com/tzzs/apple-design-skill) — المبادئ الثمانية (Purpose, Agency, Responsibility, Familiarity, Flexibility, Simplicity, Craft, Delight) وLiquid Glass.
> الهندسة الحركية: **greensock/gsap-skills** (الرسمي) — gsap-react (scope + ctx.revert)، gsap-core (easing/stagger/autoAlpha)، احترام prefers-reduced-motion.
> الترجمة: مبادئ آبل بهوية المنصة نفسها (teal خليطي + أسطح رمادية محايدة) — لا نسخ واجهات آبل حرفيًا.

## التوكنات (client/src/index.css `:root` / `html.dark`)
| التوكن | فاتح | داكن |
|---|---|---|
| `--bg` | #f5f5f7 | #1c1c1e |
| `--surface` | #ffffff | #2c2c2e |
| `--surface-2/3` | #f5f5f7 / #ebebed | #1c1c1e / #3a3a3c |
| `--text` / `--text-2` / `--text-muted` | #1d1d1f / #48484d / #8e8e93 | #f2f2f7 / #d1d1d6 / #8e8e93 |
| `--border` | rgba(0,0,0,.07) | rgba(255,255,255,.09) |
| `--accent` / `--accent-strong` | #0f766e / #115e59 | #2dd4bf / #5eead4 |
| `--glass-*` | زجاج فاتح 72/82% | زجاج داكن 72/82% |
| `--shadow-apple` | ناعم فاتح | ناعم داكن |

## آلية المظهر
- كلاس `.dark` على `<html>` — مخزن `client/src/lib/theme.ts` (zustand): `light|dark|system` محفوظ `qm-theme`، متابعة حية لتغير تفضيل النظام.
- **قلب المظهر**: تجاوزات utilities (`dark .bg-white …`) كـCSS غير طبقي يتغلب على طبقات Tailwind v4 — كل الصفحات القائمة تتحول داكنة دون تعديل ملف-بملف، بلا مصدر حقيقة ثانٍ.
- مبدّل Segmented (☀/🌙/🖥) في ترويسة اللوحة + Toast تأكيد.

## الحركة (GSAP)
- النظام القائم `lib/anim.ts`: revealSections/staggerCards/sheetIn/popIn/haloPulse/fadeInUp/shake — قواعد gsap-skills مطبقة: أهداف عبر عناصر/نطاق، حركات من-إلى قصيرة (0.5s±)، eases built-in، بلا مستمعات عائمة، وتوقف كامل تحت reduced-motion.
- مقترح الترقية: `gsap.matchMedia()` بدل الفحص اليدوي (gsap-core).

## المكوّنات المعيارية (ui.tsx)
Btn · Input · Select · Textarea · Field/Label · Card/CardHead · Modal (sheetIn) · Chip · StatusChip · Spinner · **+D7**: Switch (iOS-style, aria switch) · Segmented · EmptyState · Skeleton · Toaster (toast store — ردود عالمية فوق الطبقات).

## الحالات الموحدة
default/hover/active/focus-visible(حلقة `--ring`)/disabled/loading(Spinner/Skeleton)/success(Ok/toast)/error(Err هزة).

## ما هو نافذ لاحقًا (مقترح، غير منفذ)
Lazy-loading اللوحات · ترحيل تدريجي لأصناف token صريحة · الرسوم البيانية بمكتبة خفيفة بثيمين.
