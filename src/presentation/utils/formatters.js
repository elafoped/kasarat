// src/utils/formatters.js
import { MIN_BALANCE } from '../../core/constants';
// ============================================================
// تنسيق التاريخ
// ============================================================
export const formatDate = (date) => {
  if (!date) return '-';
  try {
    const d = new Date(date);
    return d.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric'
    });
  } catch {
    return '-';
  }
};

// ============================================================
// تنسيق التاريخ والوقت
// ============================================================
export const formatDateTime = (date) => {
  if (!date) return '-';
  try {
    const d = new Date(date);
    return d.toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '-';
  }
};

// ============================================================
// تنسيق العملة – يستخدم نفس عتبة MIN_BALANCE المستخدمة في
// SaleService.js و Sales.jsx لضمان التطابق في كل مكان
// (لا يوجد تعارض بين "0" في الجدول و"0.02" في نافذة الدفع مثلاً)
// ============================================================
export const formatCurrency = (value, currency = 'ل.س') => {
  if (value === undefined || value === null || isNaN(value)) {
    return `0 ${currency}`;
  }
  const num = Number(value);
  if (!isFinite(num)) return `0 ${currency}`;

  // تقريب أولاً لتفادي أخطاء الفاصلة العائمة (0.009999999...)
  let rounded = Number(num.toFixed(2));

  // نفس عتبة round2 في باقي النظام، وليس رقماً منفصلاً
  if (Math.abs(rounded) < MIN_BALANCE) rounded = 0;

  if (rounded % 1 === 0) {
    return `${rounded} ${currency}`;
  }
  return `${rounded.toFixed(2)} ${currency}`;
};

// ============================================================
// تنسيق الأرقام (إضافة فواصل للأرقام الكبيرة)
// ============================================================
export const formatNumber = (num) => {
  if (num === undefined || num === null || isNaN(num)) return '0';
  return Number(num).toLocaleString('ar-EG');
};

// ============================================================
// اختصار النص الطويل
// ============================================================
export const truncateText = (text, maxLength = 30) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

// ============================================================
// تنسيق النسبة المئوية
// ============================================================
export const formatPercentage = (value) => {
  const n = Number(value);
  if (isNaN(n)) return '0%';
  return n.toFixed(1) + '%';
};