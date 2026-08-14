import { db } from '../../core/database';
import { SaleService } from './SaleService';

// ============================================================
// ⚠️ هذه الخدمة "منسوخة" ومهجورة عملياً: كانت تكتب دفعات مباشرة
// بـ db.add بدون أي تحديث لـ sales.paidAmount / remainingBalance
// أو invoices، وبدون أي تقريب (round2/MIN_BALANCE). لو استُخدمت
// بالخطأ بمكان جديد بالمستقبل، كانت رح تُنتج بالضبط نفس مشكلة
// "الأرقام غير المتطابقة" اللي ظهرت بصفحة الدفعات.
//
// الآن هي مجرد واجهة تفويض (delegate) لـ SaleService، حتى لا
// تبقى مصدر بيانات موازٍ ومتضارب. لا تضف منطقاً جديداً هنا —
// أي منطق مالي يجب أن يكون بـ SaleService فقط (مصدر الحقيقة الوحيد).
// ============================================================
export const PaymentService = {
  async createPayment(data) {
    return await SaleService.recordPayment({
      customerId: data.customerId,
      amount: data.amount,
      method: data.method,
      notes: data.notes,
      paymentDate: data.paymentDate
    });
  },

  async cancelPayment(id, reason = '') {
    return await SaleService.cancelPaymentAndRestoreBalance(id, reason);
  },

  async getCustomerBalance(customerId) {
    const result = await SaleService.getCustomerBalance(customerId);
    return result.balance;
  },

  async getAll() {
    return await db.getAll('payments');
  }
};