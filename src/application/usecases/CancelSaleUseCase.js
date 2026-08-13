import { SaleService } from '../../domain/services/SaleService'

export class CancelSaleUseCase {
  static async execute(saleId, reason = '') {
    if (!saleId) throw new Error('معرف البيع مطلوب')
    if (!reason || reason.trim() === '') {
      throw new Error('سبب الإلغاء مطلوب')
    }
    
    await SaleService.cancelSale(saleId, reason.trim())
    return true
  }
}