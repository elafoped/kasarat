import { ReportService } from '../../domain/services/ReportService'

export class GenerateReportUseCase {
  static async execute({ type, from, to, groupBy = 'week', customerId = null }) {
    switch (type) {
      case 'sales':
        return await ReportService.getSalesReport(from, to, groupBy)
      
      case 'expenses':
        return await ReportService.getExpensesReport(from, to, groupBy)
      
      case 'inventory':
        return await ReportService.getInventoryReport()
      
      case 'customers':
        return await ReportService.getCustomersReport()
      
      case 'customer':
        if (!customerId) throw new Error('معرف الزبون مطلوب')
        return await ReportService.getCustomerReport(customerId, from, to)
      
      default:
        throw new Error(`نوع التقرير غير معروف: ${type}`)
    }
  }
}