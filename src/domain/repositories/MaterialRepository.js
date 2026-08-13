import { db } from '../../core/database'
import { Material } from '../entities/Material'

export class MaterialRepository {
  static async getAll() {
    const data = await db.getAll('materials')
    return data.map(d => new Material(d))
  }

  static async getById(id) {
    const data = await db.get('materials', id)
    return data ? new Material(data) : null
  }

  static async create(data) {
    const material = new Material(data)
    material.validate()
    const id = await db.add('materials', material.toJSON())
    return id
  }

  static async update(id, data) {
    const existing = await db.get('materials', id)
    if (!existing) throw new Error('المادة غير موجودة')
    const material = new Material({ ...existing, ...data, updatedAt: new Date().toISOString() })
    material.validate()
    await db.put('materials', material.toJSON())
    return material
  }

  static async delete(id) {
    const sales = await db.getByIndex('sales', 'materialId', id)
    if (sales.length > 0) throw new Error('لا يمكن حذف مادة لها مبيعات')
    await db.delete('materials', id)
    return true
  }

  static async updateStock(id, quantity, type) {
    const material = await this.getById(id)
    if (!material) throw new Error('المادة غير موجودة')
    
    let newQuantity = material.currentQuantity
    if (type === 'add') newQuantity += quantity
    else if (type === 'subtract') newQuantity -= quantity
    else newQuantity = quantity

    if (newQuantity < 0) throw new Error('الكمية لا يمكن أن تكون سالبة')
    
    material.currentQuantity = newQuantity
    await db.put('materials', material.toJSON())
    return material
  }
}