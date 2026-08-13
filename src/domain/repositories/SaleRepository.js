import { db } from '../../core/database'
import { Sale } from '../entities/Sale'

export class SaleRepository {
  static async getAll() {
    const data = await db.getAll('sales')
    return data.map(d => new Sale(d))
  }

  static async getById(id) {
    const data = await db.get('sales', id)
    return data ? new Sale(data) : null
  }

  static async create(data) {
    const sale = new Sale(data)
    sale.validate()
    const id = await db.add('sales', sale.toJSON())
    return id
  }

  static async update(id, data) {
    const existing = await db.get('sales', id)
    if (!existing) throw new Error('البيع غير موجود')
    const sale = new Sale({ ...existing, ...data, updatedAt: new Date().toISOString() })
    sale.validate()
    await db.put('sales', sale.toJSON())
    return sale
  }

  static async delete(id) {
    await db.delete('sales', id)
    return true
  }

  static async getByCustomer(customerId) {
    const data = await db.getByIndex('sales', 'customerId', customerId)
    return data.map(d => new Sale(d))
  }

  static async getByMaterial(materialId) {
    const data = await db.getByIndex('sales', 'materialId', materialId)
    return data.map(d => new Sale(d))
  }

  static async getByDateRange(from, to) {
    let sales = await this.getAll()
    if (from) sales = sales.filter(s => s.saleDate && s.saleDate >= from)
    if (to) sales = sales.filter(s => s.saleDate && s.saleDate <= to + 'T23:59:59')
    return sales
  }
}