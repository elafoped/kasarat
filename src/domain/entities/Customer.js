export class Customer {
  constructor(data = {}) {
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