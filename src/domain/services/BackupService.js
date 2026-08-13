import { db } from '../../core/database';
import { config } from '../../core/config';

export const BackupService = {
  // ============================================================
  // تصدير نسخة احتياطية كاملة
  // ============================================================
  async export() {
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

    // حفظ نسخة في localStorage مؤقتاً
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
  // استعادة نسخة احتياطية
  // ============================================================
  async import(backupData) {
    if (!backupData || !backupData.data) {
      throw new Error('ملف غير صالح: لا يحتوي على بيانات');
    }

    // التحقق من صحة الملف
    if (backupData.version && backupData.version < '3.0.0') {
      throw new Error('إصدار الملف قديم جداً، يرجى تحديث النظام');
    }

    // التحقق من المجموع الاختباري
    const checksum = this._generateChecksum(backupData.data);
    if (backupData.checksum && checksum !== backupData.checksum) {
      throw new Error('⚠️ الملف تالف أو تم التلاعب به');
    }

    // استعادة البيانات
    const stores = ['customers', 'vehicles', 'materials', 'sales', 
                    'payments', 'invoices', 'expenses', 'inventory_movements',
                    'users', 'audit_logs'];

    for (const store of stores) {
      if (backupData.data[store]) {
        try {
          await db.clear(store);
          for (const item of backupData.data[store]) {
            await db.add(store, item);
          }
        } catch (e) {
          console.warn(`فشل استعادة ${store}:`, e);
        }
      }
    }

    // استعادة الإعدادات
    if (backupData.settings) {
      config.settings = backupData.settings;
    }

    // تسجيل عملية الاستعادة
    try {
      await db.add('audit_logs', {
        action: 'backup_restored',
        entity: 'system',
        entityId: 'backup',
        details: `تم استعادة النسخة الاحتياطية من ${backupData.exportedAt || 'تاريخ غير معروف'}`,
        timestamp: new Date().toISOString(),
        userId: 'system'
      });
    } catch (e) {}

    return true;
  },

  // ============================================================
  // حفظ النسخة الاحتياطية كملف JSON
  // ============================================================
  async saveToFile(backup) {
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    return true;
  },

  // ============================================================
  // قراءة ملف نسخ احتياطي
  // ============================================================
  async readFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const backup = JSON.parse(e.target.result);
          resolve(backup);
        } catch (err) {
          reject(new Error('الملف غير صحيح'));
        }
      };
      reader.onerror = () => reject(new Error('فشل قراءة الملف'));
      reader.readAsText(file);
    });
  },

  // ============================================================
  // توليد مجموع اختباري
  // ============================================================
  _generateChecksum(data) {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  },

  // ============================================================
  // حفظ في LocalStorage (نسخة احتياطية سريعة)
  // ============================================================
  saveToLocalStorage(backup) {
    try {
      localStorage.setItem('quick_backup', JSON.stringify(backup));
      localStorage.setItem('quick_backup_date', new Date().toISOString());
      return true;
    } catch (e) {
      console.warn('فشل حفظ النسخة السريعة:', e);
      return false;
    }
  },

  // ============================================================
  // استعادة من LocalStorage
  // ============================================================
  restoreFromLocalStorage() {
    try {
      const data = localStorage.getItem('quick_backup');
      if (!data) return null;
      return JSON.parse(data);
    } catch (e) {
      return null;
    }
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
  // تنظيف النسخ القديمة (للتخزين المحلي)
  // ============================================================
  cleanupOldBackups(maxBackups = 5) {
    try {
      const keys = Object.keys(localStorage);
      const backupKeys = keys.filter(k => k.startsWith('backup_'));
      
      if (backupKeys.length > maxBackups) {
        // ترتيب حسب التاريخ
        backupKeys.sort((a, b) => {
          const dateA = localStorage.getItem(a + '_date') || '';
          const dateB = localStorage.getItem(b + '_date') || '';
          return dateA.localeCompare(dateB);
        });
        
        // حذف النسخ القديمة
        const toDelete = backupKeys.slice(0, backupKeys.length - maxBackups);
        for (const key of toDelete) {
          localStorage.removeItem(key);
          localStorage.removeItem(key + '_date');
        }
      }
    } catch (e) {
      console.warn('فشل تنظيف النسخ القديمة:', e);
    }
  },

  // ============================================================
  // تصدير إلى Google Drive (API)
  // ============================================================
  async exportToDrive(backup, accessToken) {
    // هذا يتطلب تفعيل Google Drive API
    // سنقوم بتنفيذها لاحقاً
    return { success: false, message: 'قيد التطوير' };
  },

  // ============================================================
  // تصدير إلى Dropbox (API)
  // ============================================================
  async exportToDropbox(backup, accessToken) {
    // هذا يتطلب تفعيل Dropbox API
    return { success: false, message: 'قيد التطوير' };
  }
};