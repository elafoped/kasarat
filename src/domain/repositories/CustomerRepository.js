import { db } from '../../core/database'
import { Customer } from '../entities/Customer'

export class CustomerRepository {
  static async getAll() {
    const data = await db.getAll('customers')
    return data.map(d => new Customer(d))
  }

  static async getById(id) {
    const data = await db.get('customers', id)
    return data ? new Customer(data) : null
  }

  static async create(data) {
    const customer = new Customer(data)
    customer.validate()
    const id = await db.add('customers', customer.toJSON())
    return id
  }

  static async update(id, data) {
    const existing = await db.get('customers', id)
    if (!existing) throw new Error('الزبون غير موجود')
    const customer = new Customer({ ...existing, ...data, updatedAt: new Date().toISOString() })
    customer.validate()
    await db.put('customers', customer.toJSON())
    return customer
  }

  static async delete(id) {
    const sales = await db.getByIndex('sales', 'customerId', id)
    if (sales.length > 0) throw new Error('لا يمكن حذف زبون لديه مبيعات')
    await db.delete('customers', id)
    return true
  }

  static async getByPhone(phone) {
    const data = await db.getByIndex('customers', 'phone', phone)
    return data.map(d => new Customer(d))
  }
}