export class Payment {
  constructor(data = {}) {
    this.id = data.id || null;
    this.customerId = data.customerId || null;
    this.saleId = data.saleId || null;
    this.amount = data.amount || 0;
    this.paymentDate = data.paymentDate || new Date().toISOString();
    this.method = data.method || 'نقدي';
    this.notes = data.notes || '';
    this.status = data.status || 'active';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || null;
    this.cancelledAt = data.cancelledAt || null;
    this.cancellationReason = data.cancellationReason || '';
  }

  validate() {
    if (!this.customerId) throw new Error('الزبون مطلوب');
    if (!this.amount || this.amount <= 0) {
      throw new Error('المبلغ يجب أن يكون أكبر من صفر');
    }
    return true;
  }

  toJSON() {
    return {
      id: this.id,
      customerId: this.customerId,
      saleId: this.saleId,
      amount: this.amount,
      paymentDate: this.paymentDate,
      method: this.method,
      notes: this.notes,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      cancelledAt: this.cancelledAt,
      cancellationReason: this.cancellationReason
    };
  }
}