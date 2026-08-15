/**
 * نظام الفالديشن المتقدم
 * يتحقق من صحة جميع البيانات قبل الحفظ
 */

export const Validators = {
  // ============================================================
  // التحقق من رقم الهاتف (يبدأ بـ 09 ويتكون من 10 أرقام)
  // ============================================================
  validatePhone(phone) {
    if (!phone) return { valid: true, cleaned: '', message: '' };
    
    // إزالة المسافات والشرطات
    const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
    
    // التحقق: 10 أرقام، تبدأ بـ 09
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
    
    // يمكن تخصيص هذا حسب نظام الترقيم في البلد
    // مثال: ABC-123 أو 123-ABC
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
    
    if (num > 99999999999999999999999999999) {
      return { valid: false, message: 'السعر كبير جداً' };
    }
    
    return { valid: true, value: num, message: '' };
  },

  // ============================================================
  // التحقق من المبلغ المدفوع
  // ============================================================
  validatePaidAmount(amount, total) {
    const num = Number(amount);
    
    if (isNaN(num) || num < 0) {
      return { valid: false, message: 'المبلغ المدفوع يجب أن يكون رقماً موجباً' };
    }
    
    if (num > total) {
      return { valid: false, message: 'المبلغ المدفوع لا يمكن أن يتجاوز الإجمالي' };
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
  // البحث المتقدم (دعم 50,000+ زبون)
  // ============================================================
  searchCustomers(customers, query, limit = 20) {
    if (!query || query.trim() === '') {
      return customers.slice(0, limit);
    }
    
    const q = query.trim().toLowerCase();
    
    // بحث سريع باستخدام فهرس
    const results = [];
    const seen = new Set();
    
    // بحث في الاسم
    for (const c of customers) {
      if (seen.has(c.id)) continue;
      if (c.name.toLowerCase().includes(q)) {
        results.push(c);
        seen.add(c.id);
        if (results.length >= limit) break;
      }
    }
    
    // إذا لم نجد نتائج كافية، ابحث في رقم الهاتف
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
    const TOLERANCE = 0.01;
    
    // التحقق من أن المدفوعات لا تتجاوز المبيعات
    if (data.totalSales !== undefined && data.totalPayments !== undefined) {
      if (data.totalPayments > data.totalSales + TOLERANCE) {
        errors.push('إجمالي المدفوعات لا يمكن أن يتجاوز إجمالي المبيعات');
      }
    }
    
    return { 
      valid: errors.length === 0, 
      errors 
    };
  }

,



  // ============================================================
  // التحقق من صحة البيع (فالديشن متقدم)
  // ============================================================
  validateSale(data) {
    const errors = [];
    const TOLERANCE = 0.01; // ← نفس هامش الخطأ العشري المستخدم بـ SaleService

    if (!data.customerId) {
      errors.push('الزبون مطلوب');
    }
    
    if (!data.vehicleId) {
      errors.push('السيارة مطلوبة');
    }
    
    if (!data.materialId) {
      errors.push('المادة مطلوبة');
    }
    
    // التحقق من الكمية
    const qty = Number(data.quantity);
    if (isNaN(qty) || qty <= 0) {
      errors.push('الكمية يجب أن تكون أكبر من صفر');
    }
    
    // التحقق من السعر
    const price = Number(data.pricePerUnit);
    if (isNaN(price) || price <= 0) {
      errors.push('السعر يجب أن يكون أكبر من صفر');
    }
    
    // حساب الإجمالي – مقرّب فوراً حتى لا تتسبب أخطاء الفاصلة العائمة
    // (مثال: 0.1 * 3 = 0.30000000000000004 بدون تقريب) برفض مدفوعات صحيحة
    const total = Number((qty * price).toFixed(2));
    
    // التحقق من المدفوع
    const paid = Number(Number(data.paidAmount || 0).toFixed(2));
    if (paid < 0) {
      errors.push('المدفوع لا يمكن أن يكون سالباً');
    }
    
    // TOLERANCE هنا ضرورية: بدونها أي فرق عشري صغير جداً (0.001) كان
    // يُظهر خطأ "المدفوع يتجاوز الإجمالي" حتى لو المستخدم دفع المبلغ بالضبط
    if (paid > total + TOLERANCE) {
      errors.push('المدفوع لا يمكن أن يتجاوز الإجمالي');
    }

    const remainingBalance = Number((total - paid).toFixed(2));
    
    return { 
      valid: errors.length === 0, 
      errors,
      data: {
        ...data,
        quantity: qty,
        pricePerUnit: price,
        paidAmount: paid,
        totalAmount: total,
        remainingBalance: remainingBalance < 0 ? 0 : remainingBalance
      }
    };
  }





  
};

export default Validators;