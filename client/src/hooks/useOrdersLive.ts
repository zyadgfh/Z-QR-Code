import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../stores/auth';

export type OrderItem = {
  item_id: string;
  name: string;
  name_en: string | null;
  qty: number;
  unit_price: number;
  options: { group_name: string; option_name: string; price_delta: number }[];
  line_total: number;
};

export type Order = {
  id: string;
  table_number: number | null;
  service?: 'dine_in' | 'takeaway' | 'delivery';
  branch_name?: string | null;
  loyalty_points_used?: number;
  loyalty_discount?: number;
  points_earned?: number;
  customer_phone?: string | null;
  note: string;
  total: number;
  subtotal?: number;
  discount_code?: string | null;
  discount_amount?: number;
  delivery_fee?: number;
  tax_percent?: number;
  tax_total?: number;
  tip?: number;
  status: 'pending' | 'preparing' | 'ready' | 'done';
  eta_minutes: number | null;
  created_at: number;
  accepted_at: number | null;
  items: OrderItem[];
};

const POLL_MS = 4000;

/**
 * طلبات المحل لحظيًا (F-01): بث SSE كإشارة تحديث + استقصاء رخيص بـ ETag
 * (304 بلا جسم) كقناة احتياطية دائمة — يعمل في Vercel وRender معًا.
 */
export function useOrdersLive() {
  const token = useAuth((s) => s.token);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [live, setLive] = useState(false);
  const etag = useRef<string | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (!token || inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch('/api/shop/orders', {
        headers: {
          authorization: `Bearer ${token}`,
          ...(etag.current ? { 'if-none-match': etag.current } : {}),
        },
      });
      if (res.status === 304) {
        setError(null);
        return;
      }
      if (!res.ok) throw new Error('فشل تحميل الطلبات');
      etag.current = res.headers.get('etag');
      setOrders((await res.json()) as Order[]);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      inFlight.current = false;
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    load();
    // البث اللحظي: إشارة تغيير → تحميل فوري ( reconnect تلقائي عند الانقطاع)
    const es = new EventSource(`/api/shop/orders/stream?t=${encodeURIComponent(token)}`);
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = () => load();
    // قناة احتياطية رخيصة (ETag → 304 غالبًا)
    const poll = setInterval(load, POLL_MS);
    return () => {
      es.close();
      clearInterval(poll);
    };
  }, [token, load]);

  return { orders, error, load, live };
}
