// src/domain/services/SaleService.js
import { db } from '../../core/database';
import { config } from '../../core/config';
import { Sale, Invoice } from '../entities';
import { MIN_BALANCE } from '../../core/constants'; // ✅ استيراد الثابت

// ============================================================
// دالة تقريب دقيقة – تستخدم لجميع العمليات الحسابية
// ============================================================
function round2(num) {
  const n = Number(num);
  if (isNaN(n)) return 0;
  const rounded = Number(n.toFixed(2));
  if (Math.abs(rounded) < MIN_BALANCE) return 0;
  return rounded;
}

function isZero(num) {
  return Math.abs(num) < MIN_BALANCE;
}

// التحقق من أن القيمة صفرية ضمن التسامح
function isZero(num) {
  return Math.abs(num) < 0.01;
}

const TOLERANCE = 0.01;

export const SaleService = {
  // ============================================================
  // 1. إنشاء بيع
  // ============================================================
  async createSale(data) {
    const sale = new Sale(data);
    sale.validate();

    const material = await db.get('materials', sale.materialId);
    if (!material) throw new Error('المادة غير موجودة');
    if ((material.currentQuantity || 0) < sale.quantity) {
      throw new Error(`المخزون غير كافٍ (المتاح: ${material.currentQuantity})`);
    }

    // تقريب الكميات قبل الضرب
    const qty = round2(sale.quantity);
    const price = round2(sale.pricePerUnit);
    const paid = round2(sale.paidAmount);

    sale.totalAmount = round2(qty * price);
    // إذا كان المدفوع أكبر بقليل من الإجمالي، نعدله
    let finalPaid = paid;
    if (paid > sale.totalAmount && paid - sale.totalAmount < TOLERANCE) {
      finalPaid = sale.totalAmount;
    }
    sale.paidAmount = finalPaid;
    sale.remainingBalance = round2(sale.totalAmount - finalPaid);
    // إذا كان الرصيد سالباً بقليل، نجعله صفراً
    if (sale.remainingBalance < 0 && sale.remainingBalance > -TOLERANCE) {
      sale.remainingBalance = 0;
    }
    if (sale.remainingBalance < -TOLERANCE) {
      throw new Error(`المدفوع (${sale.paidAmount}) يتجاوز الإجمالي (${sale.totalAmount})`);
    }

    const counter = await db.getNextCounter('invoice_number');
    const year = new Date().getFullYear();
    sale.invoiceNumber = `${config.BUSINESS.INVOICE_PREFIX}-${year}-${String(counter.value).padStart(6, '0')}`;

    const now = new Date().toISOString();

    return await db.transaction(
      ['sales', 'invoices', 'payments', 'materials', 'inventory_movements', 'audit_logs'],
      async (tx) => {
        // تقريب المخزون الجديد
        const newQty = round2(material.currentQuantity - sale.quantity);
        await tx.materials.put({ ...material, currentQuantity: newQty, updatedAt: now });

        await tx.inventory_movements.add({
          materialId: sale.materialId,
          type: 'sale_out',
          quantity: sale.quantity,
          reason: `بيع - ${sale.invoiceNumber}`,
          movementDate: now,
          reference: sale.invoiceNumber
        });

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

    const material = await db.get('materials', sale.materialId);
    if (!material) throw new Error('المادة غير موجودة');

    const now = new Date().toISOString();

    return await db.transaction(
      ['sales', 'invoices', 'payments', 'materials', 'inventory_movements', 'audit_logs'],
      async (tx) => {
        const newQty = round2(material.currentQuantity + sale.quantity);
        await tx.materials.put({ ...material, currentQuantity: newQty, updatedAt: now });

        await tx.inventory_movements.add({
          materialId: sale.materialId,
          type: 'sale_cancel',
          quantity: sale.quantity,
          reason: `إلغاء بيع - ${sale.invoiceNumber}` + (reason ? ` (${reason})` : ''),
          movementDate: now,
          reference: sale.invoiceNumber
        });

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
    const materialChanged = newMaterialId !== sale.materialId;

    const oldMaterial = await db.get('materials', sale.materialId);
    if (!oldMaterial) throw new Error('المادة الأصلية غير موجودة');

    const newMaterial = materialChanged ? await db.get('materials', newMaterialId) : oldMaterial;
    if (!newMaterial) throw new Error('المادة الجديدة غير موجودة');

    const oldQuantity = sale.quantity;
    const newQuantity = data.quantity !== undefined ? data.quantity : oldQuantity;
    const quantityDiff = round2(newQuantity - oldQuantity);

    // التحقق من توفر المخزون
    if (materialChanged) {
      if (round2(newMaterial.currentQuantity || 0) < round2(newQuantity - TOLERANCE)) {
        throw new Error(`المخزون غير كافٍ في المادة الجديدة (المتاح: ${newMaterial.currentQuantity})`);
      }
    } else if (quantityDiff > TOLERANCE && round2(newMaterial.currentQuantity || 0) < round2(quantityDiff - TOLERANCE)) {
      throw new Error(`المخزون غير كافٍ (المتاح: ${newMaterial.currentQuantity})`);
    }

    const newPricePerUnit = data.pricePerUnit !== undefined ? data.pricePerUnit : sale.pricePerUnit;
    const newTotal = round2(newQuantity * newPricePerUnit);
    let newPaid = data.paidAmount !== undefined ? round2(data.paidAmount) : round2(sale.paidAmount);
    // ضبط المدفوع إذا كان أكبر بقليل من الإجمالي
    if (newPaid > newTotal && newPaid - newTotal < TOLERANCE) {
      newPaid = newTotal;
    }
    if (newPaid > newTotal + TOLERANCE) {
      throw new Error(`المدفوع (${newPaid}) يتجاوز الإجمالي (${newTotal})`);
    }
    let newRemaining = round2(newTotal - newPaid);
    if (newRemaining < 0 && newRemaining > -TOLERANCE) {
      newRemaining = 0;
    }

    const now = new Date().toISOString();

    return await db.transaction(
      ['sales', 'invoices', 'payments', 'materials', 'inventory_movements', 'audit_logs'],
      async (tx) => {
        // تحديث المخزون
        if (materialChanged) {
          await tx.materials.put({
            ...oldMaterial,
            currentQuantity: round2((oldMaterial.currentQuantity || 0) + oldQuantity),
            updatedAt: now
          });
          await tx.inventory_movements.add({
            materialId: oldMaterial.id,
            type: 'sale_update_return',
            quantity: oldQuantity,
            reason: `إرجاع مخزون بسبب تغيير مادة البيع ${sale.invoiceNumber}`,
            movementDate: now,
            reference: sale.invoiceNumber
          });

          await tx.materials.put({
            ...newMaterial,
            currentQuantity: round2((newMaterial.currentQuantity || 0) - newQuantity),
            updatedAt: now
          });
          await tx.inventory_movements.add({
            materialId: newMaterial.id,
            type: 'sale_update',
            quantity: newQuantity,
            reason: `تعديل بيع (تغيير المادة) ${sale.invoiceNumber}`,
            movementDate: now,
            reference: sale.invoiceNumber
          });
        } else if (Math.abs(quantityDiff) > TOLERANCE) {
          await tx.materials.put({
            ...newMaterial,
            currentQuantity: round2((newMaterial.currentQuantity || 0) - quantityDiff),
            updatedAt: now
          });
          await tx.inventory_movements.add({
            materialId: newMaterial.id,
            type: 'sale_update',
            quantity: quantityDiff,
            reason: `تعديل بيع ${sale.invoiceNumber}`,
            movementDate: now,
            reference: sale.invoiceNumber
          });
        }

        // تحديث البيع
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

        // تحديث الفاتورة
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

        // تحديث الدفعات المرتبطة
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
  // 4. تسجيل دفعة عامة مع توزيع FIFO وتقريب كل عملية حسابية
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
          .filter(s => s.remaining > 0) // نجمع جميع الديون الموجبة
          .sort((a, b) => (a.saleDate || '').localeCompare(b.saleDate || ''));

        const totalRemaining = round2(
          unpaidSales.reduce((sum, s) => sum + s.remaining, 0)
        );

        // إذا كان الرصيد الكلي أقل من MIN_BALANCE، نعتبره صفراً ونحذفه
        if (totalRemaining < MIN_BALANCE) {
          // حذف جميع الديون الصغيرة من قاعدة البيانات
          for (const sale of unpaidSales) {
            await tx.sales.put({
              ...sale,
              paidAmount: sale.totalAmount,
              remainingBalance: 0,
              updatedAt: now
            });
            const invoices = await tx.invoices.getByIndex('saleId', sale.id);
            for (const inv of invoices) {
              await tx.invoices.put({
                ...inv,
                paidAmount: inv.totalAmount,
                remainingBalance: 0,
                updatedAt: now
              });
            }
          }
          throw new Error('تم حذف الرصيد المتبقي الصغير (أقل من 0.05 ل.س) تلقائياً');
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

          const newSalePaid = round2((sale.paidAmount || 0) + allocated);
          let newSaleRemaining = round2((sale.totalAmount || 0) - newSalePaid);
          
          // ⚡ إذا أصبح الرصيد أقل من MIN_BALANCE، نجعله صفراً ونحذفه من الداتا
          if (newSaleRemaining < MIN_BALANCE) {
            newSaleRemaining = 0;
          }

          await tx.sales.put({
            ...sale,
            paidAmount: newSalePaid,
            remainingBalance: newSaleRemaining,
            updatedAt: now
          });

          const invoices = await tx.invoices.getByIndex('saleId', sale.id);
          for (const inv of invoices) {
            let invRemaining = round2((inv.totalAmount || 0) - newSalePaid);
            if (invRemaining < MIN_BALANCE) {
              invRemaining = 0;
            }
            await tx.invoices.put({
              ...inv,
              paidAmount: newSalePaid,
              remainingBalance: invRemaining,
              updatedAt: now
            });
          }

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
      balance: balance
    };
  },

  // ============================================================
  // 6. دالة تنظيف يدوية – لحذف جميع الديون الصغيرة دفعة واحدة
  // (يمكن استدعاؤها من الإعدادات أو تشغيلها تلقائياً)
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
      // حذف الرصيد من البيع
      await db.put('sales', {
        ...sale,
        paidAmount: sale.totalAmount,
        remainingBalance: 0,
        updatedAt: now
      });

      // حذف الرصيد من الفواتير المرتبطة
      const invoices = await db.getByIndex('invoices', 'saleId', sale.id);
      for (const inv of invoices) {
        await db.put('invoices', {
          ...inv,
          paidAmount: inv.totalAmount,
          remainingBalance: 0,
          updatedAt: now
        });
      }

      // تسجيل عملية التنظيف
      await db.add('audit_logs', {
        action: 'cleanup_tiny_debt',
        entity: 'sale',
        entityId: sale.id,
        details: `تم حذف رصيد صغير (${sale.totalAmount - sale.paidAmount}) من الفاتورة ${sale.invoiceNumber}`,
        timestamp: now,
        userId: 'system'
      });

      cleanedCount++;
    }

    return {
      cleaned: cleanedCount,
      message: `تم حذف ${cleanedCount} ديون صغيرة (أقل من ${MIN_BALANCE} ل.س)`
    };
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
    if (isZero(balance)) balance = 0;

    return {
      totalSales: round2(totalSales),
      totalPayments: round2(totalPayments),
      balance: balance
    };
  },

  // ============================================================
  // 6. تقرير المبيعات
  // ============================================================
  async getSalesReport(from, to, groupBy) {
    // ... (نفس الكود السابق مع استخدام round2)
  }
};