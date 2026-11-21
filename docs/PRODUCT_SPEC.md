# Build Prompt: QR Menu & Ordering SaaS for Small Food Shops

> Paste this whole file into the AI coding assistant that will build the product.
> **[DECIDED]** = decided by the product owner. **[RECOMMENDED]** / **[ASSUMPTION]** = suggested by the spec writer: follow them unless the owner objects. Section 15 lists what to confirm.

## ملخص بالعربي (للمراجعة)

- المنتج: نظام منيو QR وطلبات للكافيهات والمطاعم ومحلات الأكل الصغيرة، يُباع باشتراك شهري لكل محل.
- النسخة الأولى: منيو + طلب من الترابيزة (داخل المحل فقط)، بدون دفع أونلاين وبدون دليفري.
- صاحب المحل يستقبل الطلبات في لوحة تحكم تفاعلية لحظية مع تنبيه صوتي متكرر، ويقبل الطلب ويحدد الوقت المتوقع للعميل.
- المنيو يُدخل يدويًا أو برفع صورة المنيو ليستخرج الـ AI الأصناف والأسعار (مع مراجعة قبل النشر).
- الأصناف: اسم وسعر وصورة + أحجام وإضافات + ملاحظة حرة على الطلب. لغة المنيو يحددها كل محل.
- الربح: تجربة 13 يوم ثم اشتراك إجباري (حوالي 300 جنيه/شهر)، وبعد الانتهاء قفل كامل لحد الدفع. التحصيل يدوي في النسخة الأولى.
- الصلاحيات: مالك المحل + موظفين (استقبال الطلبات فقط) + أدمن للمنصة (صاحب المشروع).
- أول عملاء: معارف وأقارب أصحاب محلات أكل.

---

## 1. Your role and working rules

You are a senior full-stack engineer building this product end to end.

- Build in the phases of Section 13. **Finish a phase, test it, report, then continue.** Do not start the next phase with the current one broken.
- Do not add features outside Section 4 ("In scope"). If something seems missing, list it in your report instead of building it.
- Ask a question only when you are truly blocked; otherwise pick the simplest option that satisfies this spec and state your choice.
- Cost-sensitive: prefer free tiers (hosting, database, storage, AI API). Tell the owner before adding any paid dependency. **[ASSUMPTION]**
- Never put secret keys in client code. All AI calls and privileged operations run server-side.

## 2. Product overview [DECIDED]

A multi-tenant SaaS. Each food shop gets a digital menu reachable by QR code on each table. Customers browse the menu on their phone and send an order to the shop. The shop sees orders live in a dashboard.

- Target customers: all small food businesses (independent cafes, restaurants, small food shops).
- Currency: Egyptian pound (EGP). Arabic-first market.
- Customers do **not** create accounts and do **not** pay online.
- Business model: 13-day free trial per shop, then a mandatory monthly subscription (about 300 EGP, configurable).

## 3. Actors and permissions

| Actor | Can do |
|---|---|
| Customer (anonymous) | View a shop's menu, build a cart, send an order, see the confirmation/time message |
| Shop owner | Everything for their own shop: menu, settings, tables/QR, orders, staff accounts, subscription status |
| Staff | **Only** receive and handle orders (view, accept with time, change stage). No menu, settings, staff, or subscription access |
| Platform admin (the product owner) | See all shops, activate subscriptions manually, lock/unlock shops, edit price and payment instructions |

Strict tenant isolation: a user of shop A must never read or write data of shop B.

## 4. v1 scope

### In scope [DECIDED]
1. QR code per table; the table number comes from the QR URL.
2. Customer menu page and cart; order with item options and a free-text note.
3. **Dine-in orders only.**
4. Shop dashboard: live orders, repeating sound alert, accept with time, order stages.
5. Handling of orders nobody accepts (Section 6.3).
6. Menu management: manual entry **and** AI import from a menu photo (Section 7).
7. Per-shop settings including menu language and a required contact phone number.
8. Owner + staff accounts (Section 3).
9. 13-day trial, then full lock until paid; manual payment activation by the platform admin (Section 8, 9).

### Out of scope (do not build)
- Online payment by customers.
- Takeaway and delivery orders (planned for a later version).
- WhatsApp notifications (planned for a later version; the dashboard alert is the v1 channel).
- Online payment gateway for subscriptions (planned for a later version).
- Showing order stages to the customer.
- Analytics/reports, multi-branch, loyalty, coupons, reviews. (Not discussed: do not build unless asked.)

## 5. Customer flow

1. Customer scans the table QR. URL shape **[RECOMMENDED]**: `/{shop-slug}/t/{table-number}`.
2. Menu page loads fast on mobile (categories, items with photo, name, price). Language is the shop's chosen language.
3. Tapping an item opens its options (Section 7.1), then adds it to the cart.
4. Cart screen: items, options, total, one free-text note for the whole order, "Send order" button.
5. After sending: show "waiting for the shop to confirm" (Arabic copy in Section 14).
6. When the shop accepts: show **only** the estimated time set by the shop, worded as approximate ("تقريبًا N دقيقة"). The customer does **not** see the stages (preparing/ready/done).
7. If the order is still pending **3 minutes** after it was sent: show a busy message with the shop's phone number to call. The order stays pending and valid. [DECIDED]
8. The customer can reload the page and still see their order state. **[RECOMMENDED]** Use an unguessable order id kept in the URL or browser storage.
9. If the shop is locked (Section 8), the menu shows a polite "temporarily unavailable" page and ordering is disabled.

## 6. Shop dashboard

An interactive, live page. **[DECIDED]**

### 6.1 Live orders
- New orders appear instantly without refresh (realtime; polling fallback).
- Each order shows: table number, items with options, note, total, time since sent.

### 6.2 Alerts and stages
- A **sound alert repeats** while at least one order is pending, until it is accepted. [DECIDED]
- Browsers block autoplay audio: include an "Enable sound" button the user taps once, and warn if sound is off. The dashboard must stay open on a device in the shop.
- Stages, visible to owner and staff only: **New (جديد) → Preparing (قيد التحضير) → Ready (جاهز) → Done (تم)**.
- **Accepting** an order = moving it from New to Preparing **and** entering the estimated time in minutes for this order. This time is what the customer sees. [DECIDED: time is set by the owner per order on acceptance]

### 6.3 Orders nobody accepts
- The order stays pending, the sound keeps repeating, and after 3 minutes the customer sees the busy message with the shop's phone number. [DECIDED]
- The shop phone number is a **required** field in shop settings.

## 7. Menu management

### 7.1 Manual entry [DECIDED]
- Categories (ordered) and items: name, price, photo, optional description.
- Item options:
  - **Sizes and extras** (e.g. large size, extra sugar). Model as option groups per item: group name, single-select or multi-select, required or optional, and options with a price delta (can be 0).
  - A size is typically a required single-select group; extras are typically an optional multi-select group.
- One free-text **note per order** (not per item).
- Item availability toggle (hide/disable an item without deleting it). **[ASSUMPTION]** Tiny feature, include.

### 7.2 AI import from a menu photo [DECIDED]
- Owner uploads a photo (or several) of a printed menu.
- A vision-capable AI extracts categories, items, prices, and sizes if visible.
- **Mandatory review step [RECOMMENDED]:** show the extracted data in an editable table; nothing is published until the owner confirms. The AI can misread prices, so never auto-publish.
- Run the AI call server-side. Use a free-tier vision model if one is good enough; tell the owner before using a paid one. Handle failures with a clear Arabic error and fall back to manual entry.

### 7.3 Menu language [DECIDED]
- Each shop chooses its menu language in its own settings (at least Arabic and English), with correct RTL/LTR layout.
- Store item and category names so a second language can be added later (e.g. optional `name_en`).

## 8. Subscription, trial and locking

- Trial: **13 days** from shop creation. After that a paid subscription is mandatory. [DECIDED]
- Price: about **300 EGP/month**, stored as a configurable platform setting (not hard-coded). [DECIDED]
- **Full lock** when the trial or paid period ends: the customer menu and ordering are both closed until payment. [DECIDED]
- Locked-state behavior **[RECOMMENDED]**:
  - Customers see a polite, branded "temporarily unavailable" page.
  - The owner can still log in and sees a renewal page with the payment instructions and their status.
  - Staff see a clear "subscription expired, contact the owner" message.
  - The order endpoint must reject orders for locked shops **server-side**, not only in the UI.
- Warn the owner before expiry (dashboard banner at 3 days and 1 day before). **[RECOMMENDED]**
- Payment collection is **manual in v1** [DECIDED]: the shop transfers money (e.g. InstaPay or Vodafone Cash) and the platform admin activates the subscription. Payment instructions text is editable by the platform admin.

## 9. Platform admin panel

- List all shops with: name, owner contact, trial end date, paid-until date, status (trial / active / locked).
- Action "Mark as paid": extends the paid period by one month (from the later of now or the current paid-until date). **[RECOMMENDED]**
- Manual lock/unlock of a shop.
- Edit the displayed price and the payment instructions text.
- Protected by a dedicated admin role; never reachable by shop users.

## 10. Data model [RECOMMENDED]

Adapt as needed, but keep tenant isolation and server-side price calculation.

- `shops`: id, slug, name, phone (required), menu_language, table_count, logo (optional), created_at, trial_ends_at, paid_until, locked (bool)
- `memberships`: user_id, shop_id, role (`owner` | `staff`)
- `categories`: id, shop_id, name, sort_order
- `items`: id, shop_id, category_id, name, description, price, photo_url, available, sort_order
- `option_groups`: id, item_id, name, selection (`single` | `multi`), required
- `options`: id, group_id, name, price_delta
- `orders`: id, shop_id, table_number, note, total, status (`pending` | `preparing` | `ready` | `done`), eta_minutes, created_at, accepted_at
- `order_items`: id, order_id, item_snapshot (name, unit price, chosen options, quantity, line total)
- `platform_settings`: monthly_price, payment_instructions
- Platform admin identified by a separate role/flag.

## 11. Tech stack [RECOMMENDED]

- Frontend: React (e.g. Vite) with full RTL support and a mobile-first customer UI.
- Backend: Supabase (Postgres, Auth, Realtime, Storage, Edge Functions) with Row Level Security.
- Hosting: Vercel (frontend) + Supabase.
- The stack choice is **neutral**: if you know a clearly better option for these requirements and constraints, use it and justify it in one short paragraph.

## 12. Non-functional requirements

- **Security:** RLS on every tenant table; staff limited by role; admin separated; no trust in client-sent prices.
- **Order submission** must be validated server-side: shop is active (not locked), items exist and are available, chosen options are valid, **totals recomputed from the database**, table number within `1..table_count`. Add basic rate limiting against spam orders.
- **Privacy:** do not collect customer personal data (no login, no phone).
- **Performance:** customer menu loads quickly on weak mobile networks (optimized images, minimal JS).
- **QR codes:** the owner sets the number of tables; the system generates one QR per table and a printable page/PDF.
- **Reliability:** realtime with polling fallback so a dropped connection never hides a pending order.

## 13. Build order (phases) and acceptance criteria

1. **Foundation:** auth, shops, roles (owner/staff/admin), multi-tenancy with RLS, shop settings, manual menu CRUD with option groups.
   *Done when:* two test shops cannot see each other's data (tested), and a menu with sizes/extras can be created.
2. **Customer ordering:** public menu page, options, cart, note, order submission with server-side validation, QR generation per table.
   *Done when:* scanning a table QR leads to the right shop and table, and a tampered price is rejected.
3. **Live dashboard:** realtime orders, repeating sound with "Enable sound" button, accept with time, stages, 3-minute busy message with shop phone, staff accounts.
   *Done when:* a new order alerts within seconds, acceptance shows the time to the customer, and a staff user cannot open menu/settings.
4. **Subscription:** 13-day trial, full lock, locked pages, expiry warnings, platform admin panel with manual activation.
   *Done when:* a shop past its trial cannot receive orders (verified server-side) and "Mark as paid" unlocks it.
5. **AI menu import:** photo upload, extraction, editable review table, publish on confirm.
   *Done when:* a sample menu photo becomes a reviewed menu and no data is published without confirmation.
6. **Hardening and release:** test checklist below, README, deployment.

### Test checklist (must pass before release)
- Tenant isolation (cross-shop read/write attempts fail).
- Price tampering and invalid options rejected.
- Locked shop rejects orders at the API level.
- Pending order: sound repeats, 3-minute message appears with the correct phone.
- Staff permissions enforced by the backend, not just hidden buttons.
- RTL and LTR menus render correctly on small phones.

## 14. Arabic UI copy (starting point)

- Order sent: `تم إرسال طلبك، في انتظار تأكيد المحل`
- Order accepted: `تم قبول طلبك، الوقت المتوقع تقريبًا {n} دقيقة`
- Still pending after 3 minutes: `المحل مشغول حاليًا، للتواصل اتصل على {phone}`
- Locked shop (customer): `المنيو غير متاح مؤقتًا`
- Enable sound: `فعّل صوت التنبيه`
- Trial ending (owner): `تنتهي فترتك التجريبية بعد {n} يوم، فعّل اشتراكك لتستمر الخدمة`

## 15. Assumptions to confirm with the owner

These were not decided explicitly. Implement the default and list them in your first report:

1. Shops **self-register** (email + password) and the 13-day trial starts at registration; the platform admin can also lock/unlock.
2. The shop owner creates staff accounts.
3. Dashboard UI language is Arabic (RTL).
4. "Accept" moves an order to Preparing and records the time in minutes.
5. Item availability toggle is included (Section 7.1).
6. Subscription renewal adds one month per manual activation.

## 16. Deliverables and reporting

- Working code in a Git repository with a clear README (setup, env vars, deploy steps).
- SQL migrations and RLS policies, plus seed data for two demo shops.
- After each phase, a short report: what was built, how it was tested, assumptions made, and anything blocked.
- Keep every decision from this file; if you must deviate, say so explicitly and why.
