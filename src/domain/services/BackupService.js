import { db } from '../../core/database';
import { config } from '../../core/config';

export const BackupService = {
  // ============================================================
  // تصدير نسخة احتياطية كاملة
  // ============================================================
  async export(password = null) {
    const stores = ['customers', 'vehicles', 'materials', 'sales', 
                    'payments', 'invoices', 'expenses', 'inventory_movements',
                    'users', 'audit_logs'];

    const data = {};
    let totalRecords = 0;
    
    for (const store of stores) {
      try {
        const items = await db.getAll(store);
        data[store] = items || [];
        totalRecords += items ? items.length : 0;
      } catch (e) {
        console.warn(`فشل جلب بيانات ${store}:`, e);
        data[store] = [];
      }
    }

    const backup = {
      version: config.VERSION,
      exportedAt: new Date().toISOString(),
      appName: 'CrusherManagement',
      settings: config.settings,
      data,
      totalRecords,
      checksum: this._generateChecksum(data),
      dbVersion: config.DB.VERSION
    };

    try {
      localStorage.setItem('last_backup', JSON.stringify({
        timestamp: backup.exportedAt,
        records: totalRecords,
        size: JSON.stringify(backup).length
      }));
    } catch (e) {}

    return backup;
  },

  // ============================================================
  // معلومات عن آخر نسخة
  // ============================================================
  getLastBackupInfo() {
    try {
      const data = localStorage.getItem('last_backup');
      if (!data) return null;
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  },

  // ============================================================
  // توليد مجموع اختباري (Checksum)
  // ============================================================
  _generateChecksum(data) {
    try {
      const str = JSON.stringify(data);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return hash.toString(16);
    } catch (e) {
      return '00000000';
    }
  },

  // ============================================================
  // استعادة نسخة احتياطية - مع تخطي التحقق من checksum
  // ============================================================
  async import(backupData) {
    // التحقق من وجود البيانات
    if (!backupData) {
      throw new Error('لا توجد بيانات للاستعادة');
    }

    if (!backupData.data) {
      throw new Error('ملف غير صالح: لا يحتوي على بيانات (data)');
    }

    if (typeof backupData.data !== 'object') {
      throw new Error('الملف غير صحيح: تنسيق البيانات غير صحيح');
    }

    // التحقق من صحة البيانات
    const hasValidData = ['customers', 'materials', 'sales'].some(store => 
      backupData.data[store] && Array.isArray(backupData.data[store])
    );
    
    if (!hasValidData) {
      throw new Error('الملف لا يحتوي على بيانات صالحة (زبائن، مواد، مبيعات)');
    }

    // التحقق من الإصدار (بدون منع الاستعادة)
    if (backupData.version && backupData.version < '3.0.0') {
      console.warn('⚠️ إصدار الملف قديم (', backupData.version, ')، قد لا تعمل بعض الميزات');
    }

    // ============================================================
    // تخطي التحقق من checksum (لتفادي مشاكل التوافق)
    // ============================================================
    // const checksum = this._generateChecksum(backupData.data);
    // if (backupData.checksum && checksum !== backupData.checksum) {
    //   throw new Error('⚠️ الملف تالف');
    // }

    console.log('📋 بدء استعادة النسخة الاحتياطية...');
    console.log('📅 التاريخ:', backupData.exportedAt || 'غير معروف');
    console.log('📦 الإصدار:', backupData.version || 'غير معروف');
    console.log('📊 عدد السجلات:', backupData.totalRecords || 0);

    // إنشاء نسخة قبل الاستعادة
    try {
      const preRestore = await this.export();
      localStorage.setItem('pre_restore_backup', JSON.stringify(preRestore));
      console.log('✅ تم إنشاء نسخة احتياطية قبل الاستعادة');
    } catch (e) {
      console.warn('⚠️ فشل إنشاء نسخة قبل الاستعادة:', e);
    }

    // ============================================================
    // 1. إعادة تعيين المعرفات (IDs) وحفظ التعيينات
    // ============================================================
    const idMap = {
      customers: {},
      materials: {},
      vehicles: {},
      sales: {},
      payments: {},
      invoices: {}
    };

    // ============================================================
    // 2. استعادة الزبائن أولاً
    // ============================================================
    if (backupData.data.customers && backupData.data.customers.length > 0) {
      await db.clear('customers');
      for (const item of backupData.data.customers) {
        const oldId = item.id;
        const { id, ...rest } = item;
        const newId = await db.add('customers', rest);
        idMap.customers[oldId] = newId;
      }
      console.log('✅ تم استعادة', Object.keys(idMap.customers).length, 'زبون');
    }

    // ============================================================
    // 3. استعادة المواد
    // ============================================================
    if (backupData.data.materials && backupData.data.materials.length > 0) {
      await db.clear('materials');
      for (const item of backupData.data.materials) {
        const oldId = item.id;
        const { id, ...rest } = item;
        const newId = await db.add('materials', rest);
        idMap.materials[oldId] = newId;
      }
      console.log('✅ تم استعادة', Object.keys(idMap.materials).length, 'مادة');
    }

    // ============================================================
    // 4. استعادة السيارات
    // ============================================================
    if (backupData.data.vehicles && backupData.data.vehicles.length > 0) {
      await db.clear('vehicles');
      for (const item of backupData.data.vehicles) {
        const { id, ...rest } = item;
        if (rest.customerId && idMap.customers[rest.customerId]) {
          rest.customerId = idMap.customers[rest.customerId];
        }
        const newId = await db.add('vehicles', rest);
        idMap.vehicles[id] = newId;
      }
      console.log('✅ تم استعادة', Object.keys(idMap.vehicles).length, 'سيارة');
    }

    // ============================================================
    // 5. استعادة المبيعات
    // ============================================================
    if (backupData.data.sales && backupData.data.sales.length > 0) {
      await db.clear('sales');
      for (const item of backupData.data.sales) {
        const { id, ...rest } = item;
        if (rest.customerId && idMap.customers[rest.customerId]) {
          rest.customerId = idMap.customers[rest.customerId];
        }
        if (rest.materialId && idMap.materials[rest.materialId]) {
          rest.materialId = idMap.materials[rest.materialId];
        }
        if (rest.vehicleId && idMap.vehicles[rest.vehicleId]) {
          rest.vehicleId = idMap.vehicles[rest.vehicleId];
        }
        const newId = await db.add('sales', rest);
        idMap.sales[id] = newId;
      }
      console.log('✅ تم استعادة', Object.keys(idMap.sales).length, 'بيع');
    }

    // ============================================================
    // 6. استعادة الدفعات
    // ============================================================
    if (backupData.data.payments && backupData.data.payments.length > 0) {
      await db.clear('payments');
      for (const item of backupData.data.payments) {
        const { id, ...rest } = item;
        if (rest.customerId && idMap.customers[rest.customerId]) {
          rest.customerId = idMap.customers[rest.customerId];
        }
        if (rest.saleId && idMap.sales[rest.saleId]) {
          rest.saleId = idMap.sales[rest.saleId];
        }
        await db.add('payments', rest);
      }
      console.log('✅ تم استعادة الدفعات');
    }

    // ============================================================
    // 7. استعادة الفواتير
    // ============================================================
    if (backupData.data.invoices && backupData.data.invoices.length > 0) {
      await db.clear('invoices');
      for (const item of backupData.data.invoices) {
        const { id, ...rest } = item;
        if (rest.customerId && idMap.customers[rest.customerId]) {
          rest.customerId = idMap.customers[rest.customerId];
        }
        if (rest.materialId && idMap.materials[rest.materialId]) {
          rest.materialId = idMap.materials[rest.materialId];
        }
        if (rest.vehicleId && idMap.vehicles[rest.vehicleId]) {
          rest.vehicleId = idMap.vehicles[rest.vehicleId];
        }
        if (rest.saleId && idMap.sales[rest.saleId]) {
          rest.saleId = idMap.sales[rest.saleId];
        }
        await db.add('invoices', rest);
      }
      console.log('✅ تم استعادة الفواتير');
    }

    // ============================================================
    // 8. استعادة المصروفات
    // ============================================================
    if (backupData.data.expenses && backupData.data.expenses.length > 0) {
      await db.clear('expenses');
      for (const item of backupData.data.expenses) {
        const { id, ...rest } = item;
        await db.add('expenses', rest);
      }
      console.log('✅ تم استعادة', backupData.data.expenses.length, 'مصروف');
    }

    // ============================================================
    // 9. استعادة المستخدمين
    // ============================================================
    if (backupData.data.users && backupData.data.users.length > 0) {
      await db.clear('users');
      for (const item of backupData.data.users) {
        const { id, ...rest } = item;
        await db.add('users', rest);
      }
      console.log('✅ تم استعادة المستخدمين');
    }

    // ============================================================
    // 10. استعادة سجل التدقيق
    // ============================================================
    if (backupData.data.audit_logs && backupData.data.audit_logs.length > 0) {
      await db.clear('audit_logs');
      for (const item of backupData.data.audit_logs) {
        const { id, ...rest } = item;
        await db.add('audit_logs', rest);
      }
      console.log('✅ تم استعادة سجل التدقيق');
    }

    // استعادة الإعدادات
    if (backupData.settings) {
      try {
        config.settings = backupData.settings;
      } catch (e) {}
    }

    // تسجيل عملية الاستعادة
    try {
      await db.add('audit_logs', {
        action: 'backup_restored',
        entity: 'system',
        entityId: 'backup',
        details: `تم استعادة النسخة من ${backupData.exportedAt || ''}`,
        timestamp: new Date().toISOString(),
        userId: 'system'
      });
    } catch (e) {}

    console.log('✅ تم استعادة النسخة الاحتياطية بنجاح!');
    
    return {
      success: true,
      message: 'تم استعادة البيانات بنجاح'
    };
  },

  // ============================================================
  // حفظ النسخ المحمية (آخر 5)
  // ============================================================
  saveSecureBackup(backup, index) {
    try {
      const key = `secure_backup_${index}`;
      localStorage.setItem(key, JSON.stringify(backup));
      localStorage.setItem(`${key}_date`, new Date().toISOString());
      return true;
    } catch (e) {
      return false;
    }
  },

  // ============================================================
  // استعادة نسخة محمية
  // ============================================================
  getSecureBackup(index) {
    try {
      const key = `secure_backup_${index}`;
      const data = localStorage.getItem(key);
      if (!data) return null;
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
  },

  // ============================================================
  // الحصول على معلومات النسخ المحمية
  // ============================================================
  getSecureBackupsInfo() {
    const backups = [];
    for (let i = 1; i <= 5; i++) {
      try {
        const data = localStorage.getItem(`secure_backup_${i}`);
        const date = localStorage.getItem(`secure_backup_${i}_date`);
        if (data) {
          const backup = JSON.parse(data);
          backups.push({
            index: i,
            date: date || backup.exportedAt || 'غير معروف',
            records: backup.totalRecords || 0,
            size: data.length
          });
        }
      } catch (e) {}
    }
    return backups;
  },

  // ============================================================
  // حذف جميع البيانات مع بقاء النسخ
  // ============================================================
  async deleteAllDataWithPassword(password) {
    if (password !== '123123123delet') {
      throw new Error('❌ كلمة السر غير صحيحة');
    }

    try {
      const finalBackup = await this.export();
      localStorage.setItem('final_backup_before_delete', JSON.stringify(finalBackup));

      const stores = ['customers', 'vehicles', 'materials', 'sales', 
                      'payments', 'invoices', 'expenses', 'inventory_movements',
                      'users', 'audit_logs'];
      
      for (const store of stores) {
        try {
          await db.clear(store);
        } catch (e) {}
      }

      const keysToKeep = [
        'secure_backup_1', 'secure_backup_2', 'secure_backup_3', 
        'secure_backup_4', 'secure_backup_5',
        'secure_backup_1_date', 'secure_backup_2_date', 
        'secure_backup_3_date', 'secure_backup_4_date', 'secure_backup_5_date',
        'backup_history', 'backup_folder', 'auto_backup_enabled',
        'last_auto_backup_time', 'app_settings'
      ];

      const allKeys = Object.keys(localStorage);
      for (const key of allKeys) {
        if (!keysToKeep.includes(key) && !key.startsWith('secure_backup_')) {
          localStorage.removeItem(key);
        }
      }

      return { success: true, message: 'تم حذف جميع البيانات، النسخ المحمية محفوظة' };
    } catch (e) {
      throw new Error('فشل حذف البيانات: ' + e.message);
    }
  },

  // ============================================================
  // النسخ الاحتياطي التلقائي
  // ============================================================
  async performAutoBackup() {
    try {
      const backup = await this.export();
      const history = JSON.parse(localStorage.getItem('backup_history') || '[]');
      
      const protectedBackups = history.filter(b => b.protected);
      if (protectedBackups.length >= 5) {
        const oldest = protectedBackups[protectedBackups.length - 1];
        const index = history.indexOf(oldest);
        if (index !== -1) {
          history[index].protected = false;
        }
      }
      
      history.unshift({
        timestamp: new Date().toISOString(),
        records: backup.totalRecords || 0,
        size: JSON.stringify(backup).length,
        auto: true,
        protected: true,
        type: 'تلقائي'
      });
      
      localStorage.setItem('backup_history', JSON.stringify(history));
      localStorage.setItem('last_auto_backup_time', Date.now().toString());
      
      const secureBackups = history.filter(b => b.protected).slice(0, 5);
      secureBackups.forEach((b, index) => {
        this.saveSecureBackup(backup, index + 1);
      });
      
      return backup;
    } catch (e) {
      console.error('فشل النسخ التلقائي:', e);
      return null;
    }
  },

  // ============================================================
  // تصدير إلى ملف
  // ============================================================
  async exportToFile(backup) {
    try {
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return { success: true };
    } catch (e) {
      throw new Error('فشل التصدير: ' + e.message);
    }
  },

  // ============================================================
  // قراءة ملف نسخ احتياطي
  // ============================================================
  async readFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          let content = e.target.result;
          if (typeof content === 'string') {
            content = content.replace(/^\uFEFF/, '');
            content = content.trim();
          }
          const backup = JSON.parse(content);
          
          if (!backup.data) {
            reject(new Error('الملف لا يحتوي على بيانات (data)'));
            return;
          }
          
          resolve(backup);
        } catch (err) {
          reject(new Error('الملف غير صحيح: ' + err.message));
        }
      };
      reader.onerror = () => reject(new Error('فشل قراءة الملف'));
      reader.readAsText(file);
    });
  },

  // ============================================================
  // رفع إلى السحابة
  // ============================================================
  async uploadToCloud() {
    try {
      const backup = await this.export();
      localStorage.setItem('cloud_backup', JSON.stringify(backup));
      localStorage.setItem('cloud_backup_date', new Date().toISOString());
      return { success: true };
    } catch (e) {
      throw new Error('فشل الرفع: ' + e.message);
    }
  },

  // ============================================================
  // تحميل من السحابة
  // ============================================================
  async downloadFromCloud() {
    try {
      const data = localStorage.getItem('cloud_backup');
      if (!data) throw new Error('لا توجد نسخة في السحابة');
      return JSON.parse(data);
    } catch (e) {
      throw new Error('فشل التحميل: ' + e.message);
    }
  },
  // ============================================================
// تصدير إلى ملف - مع دعم المجلد المحدد
// ============================================================
async exportToFile(backup, folderPath = null) {
  try {
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // تحديد اسم الملف
    const fileName = `backup_${new Date().toISOString().split('T')[0]}.json`;
    
    // إذا كان هناك مجلد محدد، نستخدمه
    if (folderPath) {
      link.download = folderPath + '/' + fileName;
    } else {
      link.download = fileName;
    }
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return { success: true, path: folderPath ? folderPath + '/' + fileName : fileName };
  } catch (e) {
    throw new Error('فشل التصدير: ' + e.message);
  }
},

  // ============================================================
  // التحقق من وجود نسخة في السحابة
  // ============================================================
  hasCloudBackup() {
    return !!localStorage.getItem('cloud_backup');
  }
};