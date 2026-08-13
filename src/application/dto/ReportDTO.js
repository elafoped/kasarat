export class ReportDTO {
  constructor(data) {
    this.data = data
    this.generatedAt = new Date().toISOString()
  }

  toJSON() {
    return {
      data: this.data,
      generatedAt: this.generatedAt
    }
  }
}