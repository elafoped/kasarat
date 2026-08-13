export class Invoice {
  constructor(data = {}) {
    this.id = data.id || null
    this.invoiceNumber = data.invoiceNumber || ''
    this.customerId = data.customerId || null
    this.vehicleId = data.vehicleId || null
    this.materialId = data.materialId || null
    this.quantity = data.quantity || 0
    this.pricePerUnit = data.pricePerUnit || 0
    this.totalAmount = data.totalAmount || 0
    this.paidAmount = data.paidAmount || 0
    this.remainingBalance = data.remainingBalance || 0
    this.saleId = data.saleId || null
    this.notes = data.notes || ''
    this.status = data.status || 'active'
    this.invoiceDate = data.invoiceDate || new Date().toISOString()
    this.createdAt = data.createdAt || new Date().toISOString()
    this.updatedAt = data.updatedAt || null
  }

  validate() {
    if (!this.invoiceNumber) throw new Error('رقم الفاتورة مطلوب')
    if (!this.customerId) throw new Error('الزبون مطلوب')
    if (this.quantity <= 0) throw new Error('الكمية يجب أن تكون أكبر من صفر')
    if (this.pricePerUnit <= 0) throw new Error('السعر يجب أن يكون أكبر من صفر')
    return true
  }

  toJSON() {
    return {
      id: this.id,
      invoiceNumber: this.invoiceNumber,
      customerId: this.customerId,
      vehicleId: this.vehicleId,
      materialId: this.materialId,
      quantity: this.quantity,
      pricePerUnit: this.pricePerUnit,
      totalAmount: this.totalAmount,
      paidAmount: this.paidAmount,
      remainingBalance: this.remainingBalance,
      saleId: this.saleId,
      notes: this.notes,
      status: this.status,
      invoiceDate: this.invoiceDate,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    }
  }
}