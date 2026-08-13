import { db } from '../../core/database';
import { Payment } from '../entities';

export const PaymentService = {
  async createPayment(data) {
    const payment = new Payment(data);
    payment.validate();
    
    // التحقق من أن المبلغ لا يتجاوز الرصيد
    const balance = await this.getCustomerBalance(payment.customerId);
    if (payment.amount > balance) {
      throw new Error(`المبلغ المدفوع (${payment.amount}) يتجاوز الرصيد المتبقي (${balance})`);
    }
    
    const id = await db.add('payments', payment.toJSON());
    
    await db.add('audit_logs', {
      action: 'payment_created',
      entity: 'payment',
      entityId: id,
      details: `دفعة جديدة: ${payment.amount}`,
      timestamp: new Date().toISOString(),
      userId: 'system'
    });
    
    return id;
  },

  async cancelPayment(id, reason = '') {
    const payment = await db.get('payments', id);
    if (!payment) throw new Error('الدفعة غير موجودة');
    if (payment.status === 'cancelled') throw new Error('الدفعة ملغاة بالفعل');
    
    const updated = {
      ...payment,
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
      cancellationReason: reason || ''
    };
    
    await db.put('payments', updated);
    
    await db.add('audit_logs', {
      action: 'payment_cancelled',
      entity: 'payment',
      entityId: id,
      details: `إلغاء دفعة: ${payment.amount}`,
      timestamp: new Date().toISOString(),
      userId: 'system'
    });
    
    return true;
  },

  async getCustomerBalance(customerId) {
    const payments = await db.getByIndex('payments', 'customerId', customerId);
    const sales = await db.getByIndex('sales', 'customerId', customerId);
    
    const totalSales = sales
      .filter(s => s.status !== 'cancelled')
      .reduce((sum, s) => sum + (s.totalAmount || 0), 0);
    
    const totalPayments = payments
      .filter(p => p.status !== 'cancelled')
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    
    return totalSales - totalPayments;
  },

  async getAll() {
    return await db.getAll('payments');
  }
};