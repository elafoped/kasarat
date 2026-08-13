// ============================================================
// تنسيق التاريخ
// ============================================================
export const formatDate = (date) => {
  if (!date) return '-';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('ar-EG', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  } catch {
    return '-';
  }
};

export const formatDateTime = (date) => {
  if (!date) return '-';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('ar-EG', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  } catch {
    return '-';
  }
};

// ============================================================
// تنسيق العملة - مع التحقق من القيم
// ============================================================
export const formatCurrency = (amount, currency = 'ل.س') => {
  // التحقق من أن المبلغ رقم صحيح
  const num = Number(amount);
  if (isNaN(num) || !isFinite(num)) {
    return `0.00 ${currency}`;
  }
  return num.toFixed(2) + ' ' + currency;
};

// ============================================================
// تنسيق الأرقام
// ============================================================
export const formatNumber = (num) => {
  const n = Number(num);
  if (isNaN(n)) return '0';
  return n.toLocaleString('ar-EG');
};

// ============================================================
// تنسيق النسبة المئوية
// ============================================================
export const formatPercentage = (value) => {
  const n = Number(value);
  if (isNaN(n)) return '0%';
  return n.toFixed(1) + '%';
};