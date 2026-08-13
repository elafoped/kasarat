export class SaleDTO {
  constructor(sale) {
    this.id = sale.id
    this.invoiceNumber = sale.invoiceNumber
    this.customerId = sale.customerId
    this.vehicleId = sale.vehicleId
    this.materialId = sale.materialId
    this.quantity = sale.quantity
    this.pricePerUnit = sale.pricePerUnit
    this.totalAmount = sale.totalAmount
    this.paidAmount = sale.paidAmount
    this.remainingBalance = sale.remainingBalance
    this.status = sale.status
    this.saleDate = sale.saleDate
    this.notes = sale.notes
  }

  static fromEntity(sale) {
    return new SaleDTO(sale)
  }

  static fromEntities(sales) {
    return sales.map(s => new SaleDTO(s))
  }
}