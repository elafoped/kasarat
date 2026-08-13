export class Vehicle {
  constructor(data = {}) {
    this.id = data.id || null
    this.plateNumber = data.plateNumber || ''
    this.customerId = data.customerId || null
    this.type = data.type || ''
    this.notes = data.notes || ''
    this.createdAt = data.createdAt || new Date().toISOString()
    this.updatedAt = data.updatedAt || null
  }

  validate() {
    if (!this.plateNumber || this.plateNumber.trim() === '') {
      throw new Error('رقم اللوحة مطلوب')
    }
    if (!this.customerId) throw new Error('الزبون مطلوب')
    return true
  }

  toJSON() {
    return {
      id: this.id,
      plateNumber: this.plateNumber,
      customerId: this.customerId,
      type: this.type,
      notes: this.notes,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    }
  }
}