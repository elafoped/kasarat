export const config = {
  VERSION: '4.0.0',
  
  DB: {
    NAME: 'CrusherManagementDB',
    VERSION: 8,
    STORES: [
      'customers', 'vehicles', 'materials', 'sales', 
      'payments', 'invoices', 'inventory_movements', 
      'audit_logs', 'expenses', 'counters', 'users'
    ]
  },

  BUSINESS: {
    CURRENCY: 'ل.س',  // ← ليرة سورية
    COMPANY_NAME: 'منشأة الكسارات',
    INVOICE_PREFIX: 'INV'
  },

  get settings() {
    try {
      const stored = localStorage.getItem('app_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          companyName: parsed.companyName || this.BUSINESS.COMPANY_NAME,
          currency: parsed.currency || this.BUSINESS.CURRENCY
        };
      }
      return { 
        companyName: this.BUSINESS.COMPANY_NAME, 
        currency: this.BUSINESS.CURRENCY 
      };
    } catch {
      return { 
        companyName: this.BUSINESS.COMPANY_NAME, 
        currency: this.BUSINESS.CURRENCY 
      };
    }
  },

  set settings(val) {
    try {
      localStorage.setItem('app_settings', JSON.stringify({
        companyName: val.companyName || this.BUSINESS.COMPANY_NAME,
        currency: val.currency || this.BUSINESS.CURRENCY
      }));
    } catch (e) {
      console.warn('فشل حفظ الإعدادات:', e);
    }
  },

  // ============================================================
  // توليد رقم فاتورة
  // ============================================================
  generateInvoiceNumber() {
    const now = new Date();
    const d = now.getFullYear().toString().slice(2) +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');
    const r = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    return `${this.BUSINESS.INVOICE_PREFIX}-${d}-${r}`;
  },

  // ============================================================
  // دوال مساعدة للتنسيق
  // ============================================================
  todayStr() {
    return new Date().toISOString().slice(0, 10);
  },

  nowISO() {
    return new Date().toISOString();
  },

  // ============================================================
  // تنسيق التاريخ - مع التحقق من القيم
  // ============================================================
  formatDate(d) {
    if (!d) return '-';
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return '-';
      return dt.toLocaleDateString('ar-EG', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    } catch {
      return '-';
    }
  },

  formatDateTime(d) {
    if (!d) return '-';
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return '-';
      return dt.toLocaleString('ar-EG', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return '-';
    }
  },

  // ============================================================
  // تنسيق العملة - مع التحقق من القيم
  // ============================================================
  formatCurrency(amount) {
    // التحقق من أن المبلغ رقم صحيح
    const num = Number(amount);
    if (isNaN(num) || !isFinite(num)) {
      return `0.00 ${this.settings.currency}`;
    }
    return num.toFixed(2) + ' ' + this.settings.currency;
  },

  // ============================================================
  // أدوات تحليلية
  // ============================================================
  getPeriodDates(period) {
    const now = new Date();
    let fromDate = new Date(0);
    let label = 'الكل';

    switch (period) {
      case 'day':
        fromDate = new Date(now);
        fromDate.setHours(0, 0, 0, 0);
        label = 'اليوم';
        break;
      case 'week':
        fromDate = new Date(now);
        fromDate.setDate(now.getDate() - now.getDay());
        fromDate.setHours(0, 0, 0, 0);
        label = 'هذا الأسبوع';
        break;
      case 'month':
        fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
        label = 'هذا الشهر';
        break;
      case 'year':
        fromDate = new Date(now.getFullYear(), 0, 1);
        label = 'هذه السنة';
        break;
      default:
        fromDate = new Date(0);
        label = 'الكل';
    }

    return {
      fromDate: fromDate.toISOString().split('T')[0],
      toDate: now.toISOString().split('T')[0],
      label
    };
  },

  calculatePercentage(part, total) {
    if (total === 0 || !total) return 0;
    const numPart = Number(part);
    const numTotal = Number(total);
    if (isNaN(numPart) || isNaN(numTotal)) return 0;
    return (numPart / numTotal) * 100;
  },

  formatLargeNumber(num) {
    const n = Number(num);
    if (isNaN(n)) return '0';
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  }
};