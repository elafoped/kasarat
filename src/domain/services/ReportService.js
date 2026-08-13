import { db } from '../../core/database';

export const ReportService = {
  async getSalesReport(from, to, groupBy = 'week') {
    let sales = await db.getAll('sales');
    sales = sales.filter(s => s.status !== 'cancelled');

    if (from) sales = sales.filter(s => s.saleDate && s.saleDate >= from);
    if (to) sales = sales.filter(s => s.saleDate && s.saleDate <= to + 'T23:59:59');

    const grouped = this._groupByDate(sales, 'saleDate', groupBy);
    
    return Object.keys(grouped).map(key => ({
      period: key,
      ...this._summarizeSales(grouped[key])
    }));
  },

  async getExpensesReport(from, to, groupBy = 'week') {
    let expenses = await db.getAll('expenses');

    if (from) expenses = expenses.filter(e => e.date && e.date >= from);
    if (to) expenses = expenses.filter(e => e.date && e.date <= to + 'T23:59:59');

    const grouped = this._groupByDate(expenses, 'date', groupBy);
    
    return Object.keys(grouped).map(key => ({
      period: key,
      count: grouped[key].length,
      total: grouped[key].reduce((sum, e) => sum + (e.amount || 0), 0),
      byCategory: this._groupByCategory(grouped[key])
    }));
  },

  async getInventoryReport() {
    const materials = await db.getAll('materials');
    const movements = await db.getAll('inventory_movements');

    return materials.map(m => {
      const materialMovements = movements.filter(mv => mv.materialId === m.id);
      const lastMovement = materialMovements
        .sort((a, b) => (b.movementDate || '').localeCompare(a.movementDate || ''))[0];

      return {
        id: m.id,
        name: m.name,
        category: m.category || 'غير مصنف',
        unit: m.unit || '-',
        currentQuantity: m.currentQuantity || 0,
        minStock: m.minStock || 0,
        status: (m.currentQuantity || 0) < (m.minStock || 0) ? 'منخفض' : 'جيد',
        lastMovement: lastMovement ? {
          date: lastMovement.movementDate,
          type: lastMovement.type,
          quantity: lastMovement.quantity
        } : null,
        totalIn: materialMovements
          .filter(mv => mv.type === 'purchase' || mv.type === 'add')
          .reduce((sum, mv) => sum + (mv.quantity || 0), 0),
        totalOut: materialMovements
          .filter(mv => mv.type === 'sale_out' || mv.type === 'subtract')
          .reduce((sum, mv) => sum + (mv.quantity || 0), 0)
      };
    });
  },

  async getCustomersReport() {
    const customers = await db.getAll('customers');
    const sales = await db.getAll('sales');
    const payments = await db.getAll('payments');

    return customers.map(c => {
      const customerSales = sales.filter(s => s.customerId === c.id && s.status !== 'cancelled');
      const customerPayments = payments.filter(p => p.customerId === c.id && p.status !== 'cancelled');

      const totalSales = customerSales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
      const totalPayments = customerPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

      return {
        id: c.id,
        name: c.name,
        phone: c.phone || '-',
        totalSales,
        totalPayments,
        balance: totalSales - totalPayments,
        salesCount: customerSales.length,
        lastSale: customerSales.length > 0 ? 
          customerSales.sort((a, b) => (b.saleDate || '').localeCompare(a.saleDate || ''))[0].saleDate :
          null
      };
    });
  },

  _groupByDate(items, dateKey, groupBy) {
    const groups = {};
    items.forEach(item => {
      const d = new Date(item[dateKey]);
      let key;
      if (groupBy === 'day') key = d.toISOString().slice(0, 10);
      else if (groupBy === 'week') {
        const start = new Date(d);
        start.setDate(d.getDate() - d.getDay());
        key = start.toISOString().slice(0, 10);
      } else if (groupBy === 'month') {
        key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      } else if (groupBy === 'year') {
        key = String(d.getFullYear());
      } else key = d.toISOString().slice(0, 10);

      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  },

  _summarizeSales(items) {
    return {
      count: items.length,
      total: items.reduce((sum, s) => sum + (s.totalAmount || 0), 0),
      paid: items.reduce((sum, s) => sum + (s.paidAmount || 0), 0),
      balance: items.reduce((sum, s) => sum + (s.remainingBalance || 0), 0)
    };
  },

  _groupByCategory(items) {
    const categories = {};
    items.forEach(item => {
      const cat = item.category || 'أخرى';
      if (!categories[cat]) categories[cat] = 0;
      categories[cat] += item.amount || 0;
    });
    return categories;
  }
};