export class Expense {
  constructor(data = {}) {
    this.id = data.id || null
    this.date = data.date || new Date().toISOString().split('T')[0]
    this.category = data.category || ''
    this.amount = data.amount || 0
    this.description = data.description || ''
    this.createdAt = data.createdAt || new Date().toISOString()
    this.updatedAt = data.updatedAt || null
  }

  validate() {
    if (!this.date) throw new Error('التاريخ مطلوب')
    if (!this.category || this.category.trim() === '') {
      throw new Error('التصنيف مطلوب')
    }
    if (!this.amount || this.amount <= 0) {
      throw new Error('المبلغ يجب أن يكون أكبر من صفر')
    }
    return true
  }

  toJSON() {
    return {
      id: this.id,
      date: this.date,
      category: this.category,
      amount: this.amount,
      description: this.description,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    }
  }
}