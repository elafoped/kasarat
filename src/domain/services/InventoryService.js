import { db } from '../../core/database'
import { Material } from '../entities/Material'

export class InventoryService {
  static async adjustStock(materialId, quantity, type, reason = '') {
    const material = await db.get('materials', materialId)
    if (!material) throw new Error('المادة غير موجودة')
    
    let newQuantity = material.currentQuantity || 0
    
    if (type === 'add') newQuantity += quantity
    else if (type === 'subtract') newQuantity -= quantity
    else if (type === 'set') newQuantity = quantity
    
    if (newQuantity < 0) throw new Error('الكمية لا يمكن أن تكون سالبة')
    
    await db.put('materials', { ...material, currentQuantity: newQuantity, updatedAt: new Date().toISOString() })
    
    await db.add('inventory_movements', {
      materialId,
      type,
      quantity,
      reason: reason || `تعديل المخزون (${type})`,
      movementDate: new Date().toISOString()
    })
    
    return newQuantity
  }

  static async getMovements(materialId, from, to) {
    let movements = await db.getByIndex('inventory_movements', 'materialId', materialId)
    
    if (from) movements = movements.filter(m => m.movementDate && m.movementDate >= from)
    if (to) movements = movements.filter(m => m.movementDate && m.movementDate <= to + 'T23:59:59')
    
    return movements.sort((a, b) => (b.movementDate || '').localeCompare(a.movementDate || ''))
  }

  static async getLowStockMaterials() {
    const materials = await db.getAll('materials')
    return materials.filter(m => (m.currentQuantity || 0) < (m.minStock || 0))
  }

  static async getInventoryReport() {
    const materials = await db.getAll('materials')
    const movements = await db.getAll('inventory_movements')
    
    return materials.map(m => {
      const materialMovements = movements.filter(mv => mv.materialId === m.id)
      const totalIn = materialMovements
        .filter(mv => mv.type === 'add' || mv.type === 'purchase' || mv.type === 'إدخال')
        .reduce((sum, mv) => sum + (mv.quantity || 0), 0)
      const totalOut = materialMovements
        .filter(mv => mv.type === 'subtract' || mv.type === 'sale_out' || mv.type === 'إخراج')
        .reduce((sum, mv) => sum + (mv.quantity || 0), 0)
      
      return {
        id: m.id,
        name: m.name,
        category: m.category || 'غير مصنف',
        unit: m.unit || '-',
        currentQuantity: m.currentQuantity || 0,
        minStock: m.minStock || 0,
        status: (m.currentQuantity || 0) < (m.minStock || 0) ? 'منخفض' : 'جيد',
        totalIn,
        totalOut,
        netChange: totalIn - totalOut
      }
    })
  }
}