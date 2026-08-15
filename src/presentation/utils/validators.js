// src/core/validation.js

/**
 * نظام الفالديشن المتقدم
 * يتحقق من صحة جميع البيانات قبل الحفظ
 */

// ============================================================
// قيمة التسامح لتجاهل فروق التقريب البسيطة
// ============================================================
const TOLERANCE = 0.01;

// ============================================================
// دالة مساعدة للتحقق من أن القيمة قريبة من الصفر
// ============================================================
function isEffectivelyZero(val) {
  return Math.abs(val) < TOLERANCE;
}

export const Validators = {
  // ============================================================
  // التحقق من رقم الهاتف (يبدأ بـ 09 ويتكون من 10 أرقام)
  // ============================================================
  validatePhone(phone) {
    if (!phone) return { valid: true, cleaned: '', message: '' };
    
    const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
    
    if (!/^09\d{8}$/.test(cleaned)) {
      return { 
        valid: false, 
        cleaned: cleaned, 
        message: 'رقم الهاتف يجب أن يبدأ بـ 09 ويتكون من 10 أرقام (مثال: 0912345678)' 
      };
    }
    
    return { valid: true, cleaned, message: '' };
  },

  // ============================================================
  // التحقق من رقم اللوحة
  // ============================================================
  validatePlateNumber(plate) {
    if (!plate || plate.trim() === '') {
      return { valid: false, message: 'رقم اللوحة مطلوب' };
    }
    
    const cleaned = plate.trim().toUpperCase();
    
    if (!/^[A-Z0-9\-]{3,10}$/.test(cleaned)) {
      return { 
        valid: false, 
        message: 'رقم اللوحة غير صحيح (مثال: ABC-123)' 
      };
    }
    
    return { valid: true, cleaned, message: '' };
  },

  // ============================================================
  // التحقق من اسم الزبون
  // ============================================================
  validateCustomerName(name) {
    if (!name || name.trim() === '') {
      return { valid: false, message: 'اسم الزبون مطلوب' };
    }
    
    const cleaned = name.trim();
    
    if (cleaned.length < 2) {
      return { valid: false, message: 'اسم الزبون يجب أن يكون حرفين على الأقل' };
    }
    
    if (cleaned.length > 100) {
      return { valid: false, message: 'اسم الزبون طويل جداً (حد أقصى 100 حرف)' };
    }
    
    return { valid: true, cleaned, message: '' };
  },

  // ============================================================
  // التحقق من اسم المادة
  // ============================================================
  validateMaterialName(name) {
    if (!name || name.trim() === '') {
      return { valid: false, message: 'اسم المادة مطلوب' };
    }
    
    const cleaned = name.trim();
    
    if (cleaned.length < 2) {
      return { valid: false, message: 'اسم المادة يجب أن يكون حرفين على الأقل' };
    }
    
    return { valid: true, cleaned, message: '' };
  },

  // ============================================================
  // التحقق من السعر
  // ============================================================
  validatePrice(price) {
    const num = Number(price);
    
    if (isNaN(num) || num < 0) {
      return { valid: false, message: 'السعر يجب أن يكون رقماً موجباً' };
    }
    
    if (num > 999999999999999) {
      return { valid: false, message: 'السعر كبير جداً' };
    }
    
    return { valid: true, value: num, message: '' };
  },

  // ============================================================
  // التحقق من المبلغ المدفوع (مع تسامح)
  // ============================================================
  validatePaidAmount(amount, total) {
    const num = Number(amount);
    const totalNum = Number(total);
    
    if (isNaN(num) || num < 0) {
      return { valid: false, message: 'المبلغ المدفوع يجب أن يكون رقماً موجباً' };
    }
    
    // السماح بفارق بسيط بسبب التقريب
    if (num > totalNum + TOLERANCE) {
      return { 
        valid: false, 
        message: `المبلغ المدفوع (${num}) لا يمكن أن يتجاوز الإجمالي (${totalNum})` 
      };
    }
    
    return { valid: true, value: num, message: '' };
  },

  // ============================================================
  // التحقق من المصروف
  // ============================================================
  validateExpense(data) {
    const errors = [];
    
    if (!data.date) {
      errors.push('التاريخ مطلوب');
    }
    
    if (!data.category || data.category.trim() === '') {
      errors.push('التصنيف مطلوب');
    }
    
    const amount = this.validatePrice(data.amount);
    if (!amount.valid) {
      errors.push(amount.message);
    }
    
    return { 
      valid: errors.length === 0, 
      errors,
      data: {
        ...data,
        amount: amount.value || data.amount
      }
    };
  },

  // ============================================================
  // البحث المتقدم عن الزبائن
  // ============================================================
  searchCustomers(customers, query, limit = 20) {
    if (!query || query.trim() === '') {
      return customers.slice(0, limit);
    }
    
    const q = query.trim().toLowerCase();
    const results = [];
    const seen = new Set();
    
    for (const c of customers) {
      if (seen.has(c.id)) continue;
      if (c.name.toLowerCase().includes(q)) {
        results.push(c);
        seen.add(c.id);
        if (results.length >= limit) break;
      }
    }
    
    if (results.length < limit) {
      for (const c of customers) {
        if (seen.has(c.id)) continue;
        if (c.phone && c.phone.includes(q)) {
          results.push(c);
          seen.add(c.id);
          if (results.length >= limit) break;
        }
      }
    }
    
    return results;
  },

  // ============================================================
  // التحقق من صحة التاريخ
  // ============================================================
  validateDate(date) {
    if (!date) {
      return { valid: false, message: 'التاريخ مطلوب' };
    }
    
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      return { valid: false, message: 'التاريخ غير صحيح' };
    }
    
    return { valid: true, value: date, message: '' };
  },

  // ============================================================
  // التحقق من الحسابات المالية
  // ============================================================
  validateFinancial(data) {
    const errors = [];
    
    if (data.totalSales !== undefined && data.totalPayments !== undefined) {
      if (data.totalPayments > data.totalSales + TOLERANCE) {
        errors.push('إجمالي المدفوعات لا يمكن أن يتجاوز إجمالي المبيعات');
      }
    }
    
    return { 
      valid: errors.length === 0, 
      errors 
    };
  },

  // ============================================================
  // التحقق من صحة البيع (مع تسامح للتقريب)
  // ============================================================
  validateSale(data) {
    const errors = [];
    
    if (!data.customerId) {
      errors.push('الزبون مطلوب');
    }
    
    if (!data.vehicleId) {
      errors.push('السيارة مطلوبة');
    }
    
    if (!data.materialId) {
      errors.push('المادة مطلوبة');
    }
    
    const qty = Number(data.quantity);
    if (isNaN(qty) || qty <= 0) {
      errors.push('الكمية يجب أن تكون أكبر من صفر');
    }
    
    const price = Number(data.pricePerUnit);
    if (isNaN(price) || price <= 0) {
      errors.push('السعر يجب أن يكون أكبر من صفر');
    }
    
    // حساب الإجمالي
    const total = qty * price;
    const paid = Number(data.paidAmount) || 0;
    
    if (paid < 0) {
      errors.push('المدفوع لا يمكن أن يكون سالباً');
    }
    
    // السماح بفارق بسيط بسبب التقريب
    if (paid > total + TOLERANCE) {
      errors.push('المدفوع لا يمكن أن يتجاوز الإجمالي');
    }
    
    // ضبط المدفوع إذا كان الفرق بسيطاً
    let adjustedPaid = paid;
    if (paid > total && paid - total <= TOLERANCE) {
      adjustedPaid = total;
    }
    
    return { 
      valid: errors.length === 0, 
      errors,
      data: {
        ...data,
        quantity: qty,
        pricePerUnit: price,
        paidAmount: adjustedPaid,
        totalAmount: total,
        remainingBalance: total - adjustedPaid
      }
    };
  }
};

export default Validators;