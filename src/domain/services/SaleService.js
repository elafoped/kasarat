import { db } from '../../core/database';
import { config } from '../../core/config';
import { Sale, Invoice } from '../entities';

export const SaleService = {
  // ============================================================
  // إنشاء بيع مع معاملة كاملة
  // ============================================================
  async createSale(data) {
    const sale = new Sale(data);
    sale.validate();

    const material = await db.get('materials', sale.materialId);
    if (!material) throw new Error('المادة غير موجودة');
    if ((material.currentQuantity || 0) < sale.quantity) {
      throw new Error(`المخزون غير كافٍ (المتاح: ${material.currentQuantity})`);
    }

    sale.totalAmount = sale.quantity * sale.pricePerUnit;
    sale.remainingBalance = sale.totalAmount - sale.paidAmount;
    if (sale.remainingBalance < 0) throw new Error('المدفوع لا يمكن أن يتجاوز الإجمالي');

    const counter = await db.getNextCounter('invoice_number');
    const year = new Date().getFullYear();
    sale.invoiceNumber = `${config.BUSINESS.INVOICE_PREFIX}-${year}-${String(counter.value).padStart(6, '0')}`;

    const now = new Date().toISOString();

    return await db.transaction(
      ['sales', 'invoices', 'payments', 'materials', 'inventory_movements', 'audit_logs'],
      async (tx) => {
        // 1. تحديث المخزون
        const newQty = material.currentQuantity - sale.quantity;
        await tx.materials.put({ ...material, currentQuantity: newQty, updatedAt: now });

        // 2. حركة المخزون
        await tx.inventory_movements.add({
          materialId: sale.materialId,
          type: 'sale_out',
          quantity: sale.quantity,
          reason: `بيع - ${sale.invoiceNumber}`,
          movementDate: now,
          reference: sale.invoiceNumber
        });

        // 3. سجل البيع
        const saleId = await tx.sales.add(sale.toJSON());

        // 4. الفاتورة (تُنشأ تلقائياً)
        const invoice = new Invoice({
          invoiceNumber: sale.invoiceNumber,
          customerId: sale.customerId,
          vehicleId: sale.vehicleId,
          materialId: sale.materialId,
          quantity: sale.quantity,
          pricePerUnit: sale.pricePerUnit,
          totalAmount: sale.totalAmount,
          paidAmount: sale.paidAmount,
          remainingBalance: sale.remainingBalance,
          saleId: saleId,
          notes: sale.notes,
          invoiceDate: now,
          createdAt: now
        });
        await tx.invoices.add(invoice.toJSON());

        // 5. الدفعة (إذا وجدت)
        if (sale.paidAmount > 0) {
          await tx.payments.add({
            customerId: sale.customerId,
            amount: sale.paidAmount,
            paymentDate: now,
            method: data.paymentMethod || 'نقدي',
            notes: `دفعة للبيع ${sale.invoiceNumber}`,
            saleId: saleId,
            status: 'active',
            createdAt: now
          });
        }

        // 6. سجل التدقيق
        await tx.audit_logs.add({
          action: 'sale_created',
          entity: 'sale',
          entityId: saleId,
          details: `بيع جديد: ${sale.invoiceNumber}`,
          timestamp: now,
          userId: 'system'
        });

        return saleId;
      }
    );
  },

  // ============================================================
  // إلغاء بيع (عكس جميع التأثيرات)
  // ============================================================
async cancelSale(saleId, reason) {
    const sale = await db.get('sales', saleId);
    if (!sale) throw new Error('البيع غير موجود');
    if (sale.status === 'cancelled') throw new Error('البيع ملغى بالفعل');

    const material = await db.get('materials', sale.materialId);
    if (!material) throw new Error('المادة غير موجودة');

    const now = new Date().toISOString();

    return await db.transaction(
      ['sales', 'invoices', 'payments', 'materials', 'inventory_movements', 'audit_logs'],
      async (tx) => {
        // 1. استعادة المخزون
        const newQty = material.currentQuantity + sale.quantity;
        await tx.materials.put({ ...material, currentQuantity: newQty, updatedAt: now });

        // 2. حركة استرجاع
        await tx.inventory_movements.add({
          materialId: sale.materialId,
          type: 'sale_cancel',
          quantity: sale.quantity,
          reason: `إلغاء بيع - ${sale.invoiceNumber}` + (reason ? ` (${reason})` : ''),
          movementDate: now,
          reference: sale.invoiceNumber
        });

        // 3. تحديث حالة البيع
        await tx.sales.put({
          ...sale,
          status: 'cancelled',
          updatedAt: now,
          cancelledAt: now,
          cancellationReason: reason || ''
        });

        // ============================================================
        // 4. إلغاء الفواتير المرتبطة - مهم جداً
        // ============================================================
        const invoices = await tx.invoices.getByIndex('saleId', saleId);
        for (const inv of invoices) {
          await tx.invoices.put({
            ...inv,
            status: 'cancelled',
            updatedAt: now,
            cancelledAt: now,
            cancellationReason: reason || ''
          });
          console.log(`✅ تم إلغاء الفاتورة: ${inv.invoiceNumber}`);
        }

        // ============================================================
        // 5. إلغاء الدفعات المرتبطة - مهم جداً
        // ============================================================
        const payments = await tx.payments.getByIndex('saleId', saleId);
        for (const p of payments) {
          await tx.payments.put({
            ...p,
            status: 'cancelled',
            updatedAt: now,
            cancelledAt: now,
            cancellationReason: reason || ''
          });
          console.log(`✅ تم إلغاء الدفعة: ${p.id}`);
        }

        // 6. سجل التدقيق
        await tx.audit_logs.add({
          action: 'sale_cancelled',
          entity: 'sale',
          entityId: saleId,
          details: `إلغاء بيع: ${sale.invoiceNumber}`,
          timestamp: now,
          userId: 'system'
        });

        return true;
      }
    );
  },

  // ============================================================
  // الحصول على مبيعات العميل
  // ============================================================
  async getCustomerSales(customerId) {
    return await db.getByIndex('sales', 'customerId', customerId);
  },

  // ============================================================
  // حساب رصيد العميل
  // ============================================================
  async getCustomerBalance(customerId) {
    const sales = await this.getCustomerSales(customerId);
    const payments = await db.getByIndex('payments', 'customerId', customerId);
    
    const totalSales = sales
      .filter(s => s.status !== 'cancelled')
      .reduce((sum, s) => sum + (s.totalAmount || 0), 0);
    
    const totalPayments = payments
      .filter(p => p.status !== 'cancelled')
      .reduce((sum, p) => sum + (p.amount || 0), 0);
    
    return {
      totalSales,
      totalPayments,
      balance: totalSales - totalPayments
    };
  },

  // ============================================================
  // تقرير المبيعات
  // ============================================================
  async getSalesReport(from, to, groupBy) {
    let sales = await db.getAll('sales');
    sales = sales.filter(s => s.status !== 'cancelled');

    if (from) sales = sales.filter(s => s.saleDate && s.saleDate >= from);
    if (to) sales = sales.filter(s => s.saleDate && s.saleDate <= to + 'T23:59:59');

    const groups = {};
    sales.forEach(s => {
      const d = new Date(s.saleDate);
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
      groups[key].push(s);
    });

    const result = {};
    for (const key in groups) {
      const items = groups[key];
      result[key] = {
        count: items.length,
        total: items.reduce((sum, s) => sum + (s.totalAmount || 0), 0),
        paid: items.reduce((sum, s) => sum + (s.paidAmount || 0), 0),
        balance: items.reduce((sum, s) => sum + (s.remainingBalance || 0), 0)
      };
    }

    return result;
  }
};