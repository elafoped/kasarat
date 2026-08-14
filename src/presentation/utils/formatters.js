// src/utils/formatters.js

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
// تنسيق العملة – يعرض المبلغ مقرباً لرقمين عشريين
// (لتجنب أخطاء الفاصلة العائمة مثل 0.009999999776)
// ============================================================
export const formatCurrency = (value, currency = 'ل.س') => {
  if (value === undefined || value === null || isNaN(value)) {
    return `0 ${currency}`;
  }
  const num = Number(value);
  if (!isFinite(num)) return `0 ${currency}`;
  // تجاهل الفروق الصغيرة جداً
  if (Math.abs(num) < 0.005) return `0 ${currency}`;
  const rounded = Number(num.toFixed(2));
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