/**
 * كيانات المجال - تمثل قواعد العمل الأساسية
 */

// ============================================================
// كيان الزبون
// ============================================================
export class Customer {
  constructor(data) {
    this.id = data.id || null;
    this.name = data.name || '';
    this.phone = data.phone || '';
    this.address = data.address || '';
    this.notes = data.notes || '';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || null;
  }

  validate() {
    if (!this.name || this.name.trim() === '') {
      throw new Error('اسم الزبون مطلوب');
    }
    if (this.phone) {
      const clean = this.phone.replace(/[\s\-]/g, '');
      if (!/^\d{10}$/.test(clean) || !/^(05|5)/.test(clean)) {
        throw new Error('رقم الهاتف يجب أن يكون 10 أرقام ويبدأ بـ 05');
      }
    }
    return true;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      phone: this.phone,
      address: this.address,
      notes: this.notes,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

// ============================================================
// كيان المادة (المخزون)
// ============================================================
export class Material {
  constructor(data) {
    this.id = data.id || null;
    this.name = data.name || '';
    this.category = data.category || '';
    this.unit = data.unit || '';
    this.price = data.price || 0;
    this.currentQuantity = data.currentQuantity || 0;
    this.minStock = data.minStock || 0;
    this.notes = data.notes || '';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || null;
  }

  validate() {
    if (!this.name || this.name.trim() === '') {
      throw new Error('اسم المادة مطلوب');
    }
    if (this.price < 0) {
      throw new Error('السعر لا يمكن أن يكون سالباً');
    }
    if (this.currentQuantity < 0) {
      throw new Error('الكمية لا يمكن أن تكون سالبة');
    }
    if (this.minStock < 0) {
      throw new Error('الحد الأدنى لا يمكن أن يكون سالباً');
    }
    return true;
  }

  isLowStock() {
    return this.currentQuantity < this.minStock;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      unit: this.unit,
      price: this.price,
      currentQuantity: this.currentQuantity,
      minStock: this.minStock,
      notes: this.notes,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

// ============================================================
// كيان البيع
// ============================================================
export class Sale {
  constructor(data) {
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

// ============================================================
// كيان الفاتورة
// ============================================================
export class Invoice {
  constructor(data) {
    this.id = data.id || null;
    this.invoiceNumber = data.invoiceNumber || '';
    this.customerId = data.customerId || null;
    this.vehicleId = data.vehicleId || null;
    this.materialId = data.materialId || null;
    this.quantity = data.quantity || 0;
    this.pricePerUnit = data.pricePerUnit || 0;
    this.totalAmount = data.totalAmount || 0;
    this.paidAmount = data.paidAmount || 0;
    this.remainingBalance = data.remainingBalance || 0;
    this.saleId = data.saleId || null;
    this.notes = data.notes || '';
    this.status = data.status || 'active';
    this.invoiceDate = data.invoiceDate || new Date().toISOString();
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || null;
  }

  validate() {
    if (!this.invoiceNumber) throw new Error('رقم الفاتورة مطلوب');
    if (!this.customerId) throw new Error('الزبون مطلوب');
    if (this.quantity <= 0) throw new Error('الكمية يجب أن تكون أكبر من صفر');
    if (this.pricePerUnit <= 0) throw new Error('السعر يجب أن يكون أكبر من صفر');
    return true;
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
    };
  }
}