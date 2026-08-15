// src/domain/services/SaleService.js
import { db } from '../../core/database';
import { config } from '../../core/config';
import { Sale, Invoice } from '../entities';
import { MIN_BALANCE } from '../../core/constants';

// ============================================================
// دالة تقريب دقيقة – تستخدم لجميع العمليات الحسابية
// ============================================================
function round2(num) {
  const n = Number(num);
  if (isNaN(n)) return 0;
  return Number(n.toFixed(2));
}

const TOLERANCE = 0.01;

// ============================================================
// ⭐ الدالة المركزية الوحيدة لحساب paidAmount / remainingBalance
// كل مكان بالكود لازم يمرّ من هنا، بدون استثناء.
// إذا الفرق بين total و paid أصغر من MIN_BALANCE:
//   → paid يُجبر ليساوي total تماماً، و remaining = 0
// هذا يمنع بقاء فروقات عشرية وهمية زي 18394999.97
// ============================================================
function finalizeAmounts(total, paid) {
  const t = round2(total);
  let p = round2(paid);

  if (p > t + TOLERANCE) {
    throw new Error(`المدفوع (${p}) يتجاوز الإجمالي (${t})`);
  }

  let remaining = round2(t - p);

  if (remaining <= MIN_BALANCE) {
    p = t;          // ← هذا هو التصحيح الذي كان ناقصاً
    remaining = 0;
  }

  return { paidAmount: p, remainingBalance: remaining };
}

export const SaleService = {
  // ============================================================
  // 1. إنشاء بيع
  // ============================================================
  async createSale(data) {
    const sale = new Sale(data);
    sale.validate();

    const material = await db.get('materials', sale.materialId);
    if (!material) throw new Error('المادة غير موجودة');

    const qty = round2(sale.quantity);
    const price = round2(sale.pricePerUnit);
    sale.totalAmount = round2(qty * price);

    const { paidAmount, remainingBalance } = finalizeAmounts(sale.totalAmount, sale.paidAmount);
    sale.paidAmount = paidAmount;
    sale.remainingBalance = remainingBalance;

    const counter = await db.getNextCounter('invoice_number');
    const year = new Date().getFullYear();
    sale.invoiceNumber = `${config.BUSINESS.INVOICE_PREFIX}-${year}-${String(counter.value).padStart(6, '0')}`;

    const now = new Date().toISOString();

    return await db.transaction(
      ['sales', 'invoices', 'payments', 'audit_logs'],
      async (tx) => {
        const saleId = await tx.sales.add(sale.toJSON());

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
  // 2. إلغاء بيع
  // ============================================================
  async cancelSale(saleId, reason) {
    const sale = await db.get('sales', saleId);
    if (!sale) throw new Error('البيع غير موجود');
    if (sale.status === 'cancelled') throw new Error('البيع ملغى بالفعل');

    const now = new Date().toISOString();

    return await db.transaction(
      ['sales', 'invoices', 'payments', 'audit_logs'],
      async (tx) => {
        await tx.sales.put({
          ...sale,
          status: 'cancelled',
          updatedAt: now,
          cancelledAt: now,
          cancellationReason: reason || ''
        });

        const invoices = await tx.invoices.getByIndex('saleId', saleId);
        for (const inv of invoices) {
          await tx.invoices.put({
            ...inv,
            status: 'cancelled',
            updatedAt: now,
            cancelledAt: now,
            cancellationReason: reason || ''
          });
        }

        const payments = await tx.payments.getByIndex('saleId', saleId);
        for (const p of payments) {
          await tx.payments.put({
            ...p,
            status: 'cancelled',
            updatedAt: now,
            cancelledAt: now,
            cancellationReason: reason || ''
          });
        }

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
  // 3. تحديث بيع
  // ============================================================
  async updateSale(saleId, data) {
    const sale = await db.get('sales', saleId);
    if (!sale) throw new Error('البيع غير موجود');
    if (sale.status === 'cancelled') throw new Error('لا يمكن تعديل بيع ملغى');

    const newMaterialId = data.materialId !== undefined ? data.materialId : sale.materialId;

    const newQuantity = data.quantity !== undefined ? data.quantity : sale.quantity;

    const newPricePerUnit = data.pricePerUnit !== undefined ? data.pricePerUnit : sale.pricePerUnit;
    const newTotal = round2(newQuantity * newPricePerUnit);
    const rawPaid = data.paidAmount !== undefined ? round2(data.paidAmount) : round2(sale.paidAmount);

    const { paidAmount: newPaid, remainingBalance: newRemaining } = finalizeAmounts(newTotal, rawPaid);

    const now = new Date().toISOString();

    return await db.transaction(
      ['sales', 'invoices', 'payments', 'audit_logs'],
      async (tx) => {
        const updatedSale = {
          ...sale,
          customerId: data.customerId !== undefined ? data.customerId : sale.customerId,
          vehicleId: data.vehicleId !== undefined ? data.vehicleId : sale.vehicleId,
          materialId: newMaterialId,
          quantity: newQuantity,
          pricePerUnit: newPricePerUnit,
          totalAmount: newTotal,
          paidAmount: newPaid,
          remainingBalance: newRemaining,
          notes: data.notes !== undefined ? data.notes : sale.notes,
          updatedAt: now
        };
        await tx.sales.put(updatedSale);

        const invoices = await tx.invoices.getByIndex('saleId', saleId);
        for (const inv of invoices) {
          await tx.invoices.put({
            ...inv,
            customerId: updatedSale.customerId,
            vehicleId: updatedSale.vehicleId,
            materialId: updatedSale.materialId,
            quantity: newQuantity,
            pricePerUnit: newPricePerUnit,
            totalAmount: newTotal,
            paidAmount: newPaid,
            remainingBalance: newRemaining,
            notes: updatedSale.notes,
            updatedAt: now
          });
        }

        const paymentsForSale = await tx.payments.getByIndex('saleId', saleId);
        const activePayments = paymentsForSale.filter(p => p.status === 'active');
        const totalPaidBefore = round2(activePayments.reduce((sum, p) => sum + (p.amount || 0), 0));

        if (newPaid > totalPaidBefore + TOLERANCE) {
          await tx.payments.add({
            customerId: updatedSale.customerId,
            amount: round2(newPaid - totalPaidBefore),
            paymentDate: now,
            method: data.paymentMethod || 'نقدي',
            notes: `دفعة إضافية لتعديل البيع ${sale.invoiceNumber}`,
            saleId: saleId,
            status: 'active',
            createdAt: now
          });
        } else if (newPaid < totalPaidBefore - TOLERANCE) {
          let excess = round2(totalPaidBefore - newPaid);
          const sortedByDate = [...activePayments].sort((a, b) =>
            (b.paymentDate || b.createdAt || '').localeCompare(a.paymentDate || a.createdAt || '')
          );
          for (const p of sortedByDate) {
            if (excess <= TOLERANCE) break;
            const pAmount = p.amount || 0;
            if (pAmount <= excess + TOLERANCE) {
              await tx.payments.put({
                ...p,
                status: 'cancelled',
                updatedAt: now,
                cancelledAt: now,
                cancellationReason: `تعديل البيع ${sale.invoiceNumber} - تخفيض المدفوع`
              });
              excess = round2(excess - pAmount);
            } else {
              await tx.payments.put({
                ...p,
                amount: round2(pAmount - excess),
                updatedAt: now
              });
              excess = 0;
            }
          }
        }

        await tx.audit_logs.add({
          action: 'sale_updated',
          entity: 'sale',
          entityId: saleId,
          details: `تعديل بيع: ${sale.invoiceNumber}`,
          timestamp: now,
          userId: 'system'
        });

        return saleId;
      }
    );
  },

  // ============================================================
  // 4. تسجيل دفعة عامة مع توزيع FIFO
  // ============================================================
  async recordPayment({ customerId, amount, method, notes, paymentDate }) {
    if (!customerId) throw new Error('الزبون مطلوب');
    const payAmount = round2(amount);
    if (!payAmount || payAmount <= 0) throw new Error('المبلغ يجب أن يكون أكبر من صفر');

    const now = new Date().toISOString();
    const payDate = paymentDate || now;

    return await db.transaction(
      ['sales', 'invoices', 'payments', 'audit_logs'],
      async (tx) => {
        const allSales = await tx.sales.getByIndex('customerId', customerId);
        const unpaidSales = allSales
          .filter(s => s.status === 'active')
          .map(s => {
            const remaining = round2((s.totalAmount || 0) - (s.paidAmount || 0));
            return { ...s, remaining };
          })
          .filter(s => s.remaining > 0)
          .sort((a, b) => (a.saleDate || '').localeCompare(b.saleDate || ''));

        const totalRemaining = round2(unpaidSales.reduce((sum, s) => sum + s.remaining, 0));

        if (totalRemaining < MIN_BALANCE) {
          for (const sale of unpaidSales) {
            const { paidAmount, remainingBalance } = finalizeAmounts(sale.totalAmount, sale.totalAmount);
            await tx.sales.put({ ...sale, paidAmount, remainingBalance, updatedAt: now });
            const invoices = await tx.invoices.getByIndex('saleId', sale.id);
            for (const inv of invoices) {
              await tx.invoices.put({ ...inv, paidAmount: inv.totalAmount, remainingBalance: 0, updatedAt: now });
            }
          }
          throw new Error(`تم حذف الرصيد المتبقي الصغير (أقل من ${MIN_BALANCE} ل.س) تلقائياً`);
        }

        if (payAmount > totalRemaining + TOLERANCE) {
          throw new Error(`المبلغ (${payAmount}) يتجاوز إجمالي الرصيد المتبقي (${totalRemaining})`);
        }

        let remainingToAllocate = payAmount;
        const createdPaymentIds = [];
        const touchedInvoices = [];

        for (const sale of unpaidSales) {
          if (remainingToAllocate <= TOLERANCE) break;

          const saleRemaining = sale.remaining;
          const allocated = round2(Math.min(saleRemaining, remainingToAllocate));
          if (allocated <= TOLERANCE) continue;

          const rawPaid = round2((sale.paidAmount || 0) + allocated);
          // ⭐ نفس الدالة المركزية → paidAmount يُصحّح تلقائياً إذا الفرق صغير
          const { paidAmount: newSalePaid, remainingBalance: newSaleRemaining } =
            finalizeAmounts(sale.totalAmount, rawPaid);

          await tx.sales.put({
            ...sale,
            paidAmount: newSalePaid,
            remainingBalance: newSaleRemaining,
            updatedAt: now
          });

          const invoices = await tx.invoices.getByIndex('saleId', sale.id);
          for (const inv of invoices) {
            const { paidAmount: invPaid, remainingBalance: invRemaining } =
              finalizeAmounts(inv.totalAmount, newSalePaid);
            await tx.invoices.put({
              ...inv,
              paidAmount: invPaid,
              remainingBalance: invRemaining,
              updatedAt: now
            });
          }

          if (allocated >= MIN_BALANCE) {
            const paymentId = await tx.payments.add({
              customerId,
              saleId: sale.id,
              amount: allocated,
              paymentDate: payDate,
              method: method || 'نقدي',
              notes: notes || `دفعة لـ ${sale.invoiceNumber}`,
              status: 'active',
              createdAt: now
            });
            createdPaymentIds.push(paymentId);
            touchedInvoices.push(sale.invoiceNumber || `#${sale.id}`);
          }

          remainingToAllocate = round2(remainingToAllocate - allocated);
        }

        await tx.audit_logs.add({
          action: 'payment_recorded',
          entity: 'payment',
          entityId: customerId,
          details: `دفعة بقيمة ${payAmount} موزعة على: ${touchedInvoices.join(', ')}`,
          timestamp: now,
          userId: 'system'
        });

        return { paymentIds: createdPaymentIds, allocatedTo: touchedInvoices };
      }
    );
  },

  // ============================================================
  // 4.5 إلغاء دفعة مع إعادة المبلغ لرصيد البيع/الفاتورة المرتبطة
  // (تستخدمها صفحة الدفعات بدل الحذف المباشر أو التعديل اليدوي على
  // جدول payments لوحده، حتى لا يبقى الرصيد "مدفوعاً" بشكل وهمي)
  // ============================================================
  async cancelPaymentAndRestoreBalance(paymentId, reason) {
    const payment = await db.get('payments', paymentId);
    if (!payment) throw new Error('الدفعة غير موجودة');
    if (payment.status === 'cancelled') throw new Error('الدفعة ملغاة بالفعل');

    const now = new Date().toISOString();

    return await db.transaction(
      ['sales', 'invoices', 'payments', 'audit_logs'],
      async (tx) => {
        if (payment.saleId) {
          const sale = await tx.sales.get(payment.saleId);
          if (sale) {
            const rawPaid = round2((sale.paidAmount || 0) - (payment.amount || 0));
            const { paidAmount: newPaid, remainingBalance: newRemaining } =
              finalizeAmounts(sale.totalAmount, Math.max(rawPaid, 0));

            await tx.sales.put({ ...sale, paidAmount: newPaid, remainingBalance: newRemaining, updatedAt: now });

            const invoices = await tx.invoices.getByIndex('saleId', sale.id);
            for (const inv of invoices) {
              const { paidAmount: invPaid, remainingBalance: invRemaining } =
                finalizeAmounts(inv.totalAmount, newPaid);
              await tx.invoices.put({ ...inv, paidAmount: invPaid, remainingBalance: invRemaining, updatedAt: now });
            }
          }
        }
        // إذا لم تكن الدفعة مرتبطة ببيع محدد (دفعة قديمة قبل هذا الإصلاح)،
        // لا يمكننا معرفة أي فاتورة نعيد لها المبلغ تلقائياً بأمان.
        // في هذه الحالة يُنصح بتشغيل SaleService.recordPayment من جديد
        // يدوياً لتوزيع المبلغ الصحيح بعد الإلغاء.

        await tx.payments.put({
          ...payment,
          status: 'cancelled',
          updatedAt: now,
          cancelledAt: now,
          cancellationReason: reason || ''
        });

        await tx.audit_logs.add({
          action: 'payment_cancelled',
          entity: 'payment',
          entityId: paymentId,
          details: `إلغاء دفعة بقيمة ${payment.amount} وإعادتها لرصيد الفاتورة`,
          timestamp: now,
          userId: 'system'
        });

        return true;
      }
    );
  },

  // ============================================================
  // 5. حساب رصيد العميل
  // ============================================================
  async getCustomerBalance(customerId) {
    const sales = await db.getByIndex('sales', 'customerId', customerId);
    const payments = await db.getByIndex('payments', 'customerId', customerId);

    const totalSales = sales
      .filter(s => s.status !== 'cancelled')
      .reduce((sum, s) => sum + round2(s.totalAmount || 0), 0);

    const totalPayments = payments
      .filter(p => p.status !== 'cancelled')
      .reduce((sum, p) => sum + round2(p.amount || 0), 0);

    let balance = round2(totalSales - totalPayments);
    if (balance < MIN_BALANCE) balance = 0;

    return {
      totalSales: round2(totalSales),
      totalPayments: round2(totalPayments),
      balance
    };
  },

  // ============================================================
  // 6. تنظيف يدوي – لحذف/تصحيح كل الديون الصغيرة دفعة واحدة
  // شغّلها مرة واحدة الآن لتصحيح السجلات القديمة الموجودة أصلاً بقاعدة البيانات
  // ============================================================
  async cleanupTinyDebts() {
    const allSales = await db.getAll('sales');
    const tinySales = allSales.filter(s => {
      const remaining = round2((s.totalAmount || 0) - (s.paidAmount || 0));
      return s.status === 'active' && remaining > 0 && remaining < MIN_BALANCE;
    });

    if (tinySales.length === 0) {
      return { cleaned: 0, message: 'لا توجد ديون صغيرة للحذف' };
    }

    const now = new Date().toISOString();
    let cleanedCount = 0;

    for (const sale of tinySales) {
      await db.put('sales', {
        ...sale,
        paidAmount: sale.totalAmount,
        remainingBalance: 0,
        updatedAt: now
      });

      const invoices = await db.getByIndex('invoices', 'saleId', sale.id);
      for (const inv of invoices) {
        await db.put('invoices', {
          ...inv,
          paidAmount: inv.totalAmount,
          remainingBalance: 0,
          updatedAt: now
        });
      }

      await db.add('audit_logs', {
        action: 'cleanup_tiny_debt',
        entity: 'sale',
        entityId: sale.id,
        details: `تم تصحيح رصيد صغير (${round2(sale.totalAmount - sale.paidAmount)}) من الفاتورة ${sale.invoiceNumber}`,
        timestamp: now,
        userId: 'system'
      });

      cleanedCount++;
    }

    return {
      cleaned: cleanedCount,
      message: `تم تصحيح ${cleanedCount} فاتورة (فروقات أصغر من ${MIN_BALANCE} ل.س)`
    };
  },

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
        total: round2(items.reduce((sum, s) => sum + round2(s.totalAmount || 0), 0)),
        paid: round2(items.reduce((sum, s) => sum + round2(s.paidAmount || 0), 0)),
        balance: round2(items.reduce((sum, s) => sum + round2(s.remainingBalance || 0), 0))
      };
    }
    return result;
  }
};