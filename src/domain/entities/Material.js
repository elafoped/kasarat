export class Material {
  constructor(data = {}) {
    this.id = data.id || null
    this.name = data.name || ''
    this.category = data.category || ''
    this.unit = data.unit || ''
    this.price = data.price || 0
    this.notes = data.notes || ''
    this.createdAt = data.createdAt || new Date().toISOString()
    this.updatedAt = data.updatedAt || null
  }

  validate() {
    if (!this.name || this.name.trim() === '') {
      throw new Error('اسم المادة مطلوب')
    }
    if (this.price < 0) throw new Error('السعر لا يمكن أن يكون سالباً')
    return true
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      unit: this.unit,
      price: this.price,
      notes: this.notes,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    }
  }
}
