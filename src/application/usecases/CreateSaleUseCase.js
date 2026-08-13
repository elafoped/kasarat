import { SaleService } from '../../domain/services/SaleService'
import { Validators } from '../../core/validation'

export class CreateSaleUseCase {
  static async execute(data) {
    // التحقق من صحة البيانات
    const validation = Validators.validateSale(data)
    if (!validation.valid) {
      throw new Error(validation.errors[Object.keys(validation.errors)[0]])
    }
    
    // تنفيذ إنشاء البيع
    const saleId = await SaleService.createSale(data)
    
    return saleId
  }
}