export class Sale {
  constructor(data = {}) {
    this.id = data.id || null;
    this.customerId = data.customerId || null;
    this.vehicleId = data.vehicleId || null;
    this.materialId = data.materialId || null;
    this.quantity = data.quantity || 0;
    this.pricePerUnit = data.pricePerUnit || 0;
    this.totalAmount = data.totalAmount || 0;
    this.paidAmount = data.paidAmount || 0;
    this.remainingBalance = data.remainingBalance || 0;
    this.invoiceNumber = data.invoiceNumber || '';
    this.notes = data.notes || '';
    this.status = data.status || 'active';
    this.saleDate = data.saleDate || new Date().toISOString();
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || null;
    this.cancelledAt = data.cancelledAt || null;
    this.cancellationReason = data.cancellationReason || '';
  }

  validate() {
    if (!this.customerId) throw new Error('الزبون مطلوب');
    if (!this.vehicleId) throw new Error('السيارة مطلوبة');
    if (!this.materialId) throw new Error('المادة مطلوبة');
    if (this.quantity <= 0) throw new Error('الكمية يجب أن تكون أكبر من صفر');
    if (this.pricePerUnit <= 0) throw new Error('السعر يجب أن يكون أكبر من صفر');
    if (this.paidAmount < 0) throw new Error('المدفوع لا يمكن أن يكون سالباً');
    if (this.paidAmount > this.totalAmount) {
      throw new Error('المدفوع لا يمكن أن يتجاوز الإجمالي');
    }
    return true;
  }

  isFullyPaid() {
    return this.remainingBalance <= 0;
  }

  toJSON() {
    return {
      id: this.id,
      customerId: this.customerId,
      vehicleId: this.vehicleId,
      materialId: this.materialId,
      quantity: this.quantity,
      pricePerUnit: this.pricePerUnit,
      totalAmount: this.totalAmount,
      paidAmount: this.paidAmount,
      remainingBalance: this.remainingBalance,
      invoiceNumber: this.invoiceNumber,
      notes: this.notes,
      status: this.status,
      saleDate: this.saleDate,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      cancelledAt: this.cancelledAt,
      cancellationReason: this.cancellationReason
    };
  }
}