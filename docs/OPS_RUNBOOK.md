# دفتر العمليات التشغيلية — Runbook
> مرجع المهام التشغيلية خارج الكود · محدث مع الدفعة D1 (الأساس الأمني)

## 1) SEC-05 — حساب خدمة Firebase بأقل صلاحية

حساب الخدمة الحالي (`elmohandes7stock`) يعمل بدور واسع. للتقييد:

```bash
# 1. أنشئ حساب خدمة جديد بأقل صلاحية (Firestore + Storage على هذا المشروع فقط)
gcloud iam service-accounts create qrmenu-runtime \
  --display-name="QR Menu Runtime (least privilege)"

gcloud projects add-iam-policy-binding elmohandes7stock \
  --member="serviceAccount:qrmenu-runtime@elmohandes7stock.iam.gserviceaccount.com" \
  --role="roles/datastore.user"

gcloud projects add-iam-policy-binding elmohandes7stock \
  --member="serviceAccount:qrmenu-runtime@elmohandes7stock.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# 2. مفتاح جديد بصيغة JSON → أضفه لـ Vercel (FIREBASE_SERVICE_ACCOUNT_B64) ثم احذف مفتاح الحساب القديم
gcloud iam service-accounts keys create sa-new.json \
  --iam-account=qrmenu-runtime@elmohandes7stock.iam.gserviceaccount.com
```

**تدوير المفاتيح (كل 90 يومًا)**: أنشئ مفتاحًا جديدًا → حدّث Vercel → تحقق من /api/health → احذف المفتاح القديم:
```bash
gcloud iam service-accounts keys list --iam-account=qrmenu-runtime@elmohandes7stock.iam.gserviceaccount.com
gcloud iam service-accounts keys delete KEY_ID --iam-account=qrmenu-runtime@elmohandes7stock.iam.gserviceaccount.com
```

## 2) ARCH-04 — النسخ الاحتياطي وPITR

```bash
# تفعيل PITR (استعادة لأي لحظة خلال 7 أيام)
gcloud firestore databases update --enable-pitr

# تصدير مجدول يومي (أنشئ Cloud Scheduler job يدعو هذا الأمر عبر Cloud Function/Run job)
gcloud firestore export gs://elmohandes7stock-backups/firestore-$(date +%F) \
  --collection-ids=shops,users,memberships,items,categories,option_groups,options,orders,settings,user_sessions

# اختبار استعادة ربع سنوي (بيئة منفصلة)
gcloud firestore import gs://elmohandes7stock-backups/firestore-YYYY-MM-DD
```
**إجراء الاستعادة**: أنشئ مشروعًا مؤقتًا → استورد → قارن عدد المستندات → أعد التوجيه إن لزم. موثق كتدريب في تقويم الفريق.

## 3) ARCH-02 — Upstash Redis (حدود معدل مشتركة + إبطال جلسات فوري)

1. أنشئ حسابًا مجانيًا على upstash.com → قاعدة بيانات (منطقة أقرب: eur أو me).
2. انسخ **REST URL** و**REST Token** → أضفهما في Vercel:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
3. أعِد النشر. بدون هذه المتغيرات يعمل النظام بالوضع المحلي (حدود لكل نسخة) تلقائيًا.

المفاتيح المستخدمة: `rl:*` (عدادات المعدل) · `sess_revoked:{jti}` (إبطال جلسة) · `sess_seen:{jti}` (خمول 30 دقيقة منزلق).

## 4) NOTIF-03 — البريد المعاملاتي (Resend)

1. أنشئ حساب resend.com → أضف الدومين → أضف سجلات SPF/DKIM المطلوبة عند مزود الدومين.
2. أنشئ API Key → أضفه في Vercel:
   - `RESEND_API_KEY`
   - `MAIL_FROM="QR Menu <noreply@yourdomain.com>"`
3. بدون المفاتيح: الرسائل تُطبع في سجل الخادم (`[mail:console]`) — مناسب للتطوير فقط.

## 5) SEC-03 — التحقق بخطوتين (TOTP)

- مفروض افتراضيًا على owner + platform_admin عبر `MFA_ENFORCED=1` (الافتراضي). للإيقاف المؤقت في حالات الطوارئ فقط: `MFA_ENFORCED=0` على Vercel ثم إعادة نشر.
- **مالك مقفول خارج تطبيق المصادق**: يفقد الأكواد؟ المسار: يستخدم كود استرداد، وإن نفدت → تُصدر أكوادًا جديدة من حساب أدمن المنصة عبر تعديل مباشر (يُفعّل لاحقًا مع SEC-04 سجل التدقيق). لحين ذلك: توثيقًا يمكن رفع `mfa_enabled=false` يدويًا في Firestore لمستند `users/{id}` بعد تحقق هاتفي من المالك.
- الرموز تعمل مع أي تطبيق TOTP (Google Authenticator، Authy، 1Password).

## 6) متغيرات البيئة — المرجع الكامل
| المتغير | إلزامي؟ | الغرض |
|---|---|---|
| DB_ADAPTER | نعم | `firestore` (إنتاج) / `memory` (تطوير) |
| JWT_SECRET | نعم | توقيع التوكنات + فلفلة تجزئة أكواد الاسترداد/الرموز |
| FIREBASE_SERVICE_ACCOUNT_B64 | نعم (firestore) | حساب الخدمة (انظر §1 للأقل صلاحية) |
| FIREBASE_STORAGE_BUCKET | نعم (firestore) | مخزن الصور |
| GEMINI_API_KEY | للاستيراد AI | مفاتيح Gemini (خادمي حصريًا) |
| CORS_ORIGIN | عند فصل النطاقين | قائمة نطاقات الواجهة |
| UPSTASH_REDIS_REST_URL/TOKEN | مستحسن | §3 |
| RESEND_API_KEY / MAIL_FROM | مستحسن | §4 |
| MFA_ENFORCED | افتراضي 1 | §5 |
