import { config } from './config';

class Database {
  constructor() {
    this.db = null;
    this.isReady = false;
    this.cache = new Map();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(config.DB.NAME, config.DB.VERSION);
      
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        config.DB.STORES.forEach(storeName => {
          if (!db.objectStoreNames.contains(storeName)) {
            // ============================================================
            // إنشاء المخزن مع keyPath 'id' و autoIncrement
            // ============================================================
            const store = db.createObjectStore(storeName, { 
              keyPath: 'id', 
              autoIncrement: true 
            });
            
            // إنشاء الفهارس
            if (['vehicles', 'sales', 'payments', 'invoices'].includes(storeName)) {
              store.createIndex('customerId', 'customerId', { unique: false });
            }
            if (storeName === 'sales') {
              store.createIndex('invoiceNumber', 'invoiceNumber', { unique: true });
              store.createIndex('saleDate', 'saleDate', { unique: false });
              store.createIndex('materialId', 'materialId', { unique: false });
              store.createIndex('vehicleId', 'vehicleId', { unique: false });
              store.createIndex('status', 'status', { unique: false });
            }
            if (storeName === 'invoices') {
              store.createIndex('invoiceNumber', 'invoiceNumber', { unique: true });
              store.createIndex('saleId', 'saleId', { unique: false });
              store.createIndex('status', 'status', { unique: false });
            }
            if (storeName === 'payments') {
              store.createIndex('paymentDate', 'paymentDate', { unique: false });
              store.createIndex('saleId', 'saleId', { unique: false });
              store.createIndex('status', 'status', { unique: false });
            }
            if (storeName === 'inventory_movements') {
              store.createIndex('materialId', 'materialId', { unique: false });
              store.createIndex('movementDate', 'movementDate', { unique: false });
            }
            if (storeName === 'expenses') {
              store.createIndex('date', 'date', { unique: false });
              store.createIndex('category', 'category', { unique: false });
            }
            if (storeName === 'materials') {
              store.createIndex('name', 'name', { unique: false });
            }
            if (storeName === 'users') {
              store.createIndex('username', 'username', { unique: true });
            }
            if (storeName === 'counters') {
              store.createIndex('key', 'key', { unique: true });
            }
            if (storeName === 'vehicles') {
              store.createIndex('plateNumber', 'plateNumber', { unique: false });
            }
          }
        });
      };

      req.onsuccess = (e) => {
        this.db = e.target.result;
        this.isReady = true;
        resolve(this.db);
      };

      req.onerror = (e) => reject(e.target.error);
    });
  }

  // ============================================================
  // add - مع التأكد من عدم وجود id مكرر
  // ============================================================
  async add(store, data) {
    if (!this.isReady) throw new Error('قاعدة البيانات غير جاهزة');
    
    // ============================================================
    // إزالة أي id موجود لضمان استخدام autoIncrement
    // ============================================================
    const { id, ...cleanData } = data;
    
    const entity = { 
      ...cleanData, 
      createdAt: new Date().toISOString() 
    };
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).add(entity);
      req.onsuccess = () => { 
        this.cache.delete(store); 
        resolve(req.result); 
      };
      req.onerror = (e) => {
        console.error('خطأ في الإضافة:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  // ============================================================
  // put - مع التأكد من وجود id
  // ============================================================
  async put(store, data) {
    if (!this.isReady) throw new Error('قاعدة البيانات غير جاهزة');
    
    // التأكد من وجود id
    if (!data.id) {
      throw new Error('لا يمكن التحديث بدون معرف (id)');
    }
    
    const entity = { 
      ...data, 
      updatedAt: new Date().toISOString() 
    };
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).put(entity);
      req.onsuccess = () => { 
        this.cache.delete(store); 
        resolve(req.result); 
      };
      req.onerror = (e) => {
        console.error('خطأ في التحديث:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  // ============================================================
  // get
  // ============================================================
  async get(store, id) {
    if (!this.isReady) throw new Error('قاعدة البيانات غير جاهزة');
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => {
        console.error('خطأ في الجلب:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  // ============================================================
  // getAll
  // ============================================================
  async getAll(store) {
    if (!this.isReady) throw new Error('قاعدة البيانات غير جاهزة');
    if (this.cache.has(store)) return this.cache.get(store);
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => { 
        this.cache.set(store, req.result); 
        resolve(req.result); 
      };
      req.onerror = (e) => {
        console.error('خطأ في جلب الكل:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  // ============================================================
  // delete
  // ============================================================
  async delete(store, id) {
    if (!this.isReady) throw new Error('قاعدة البيانات غير جاهزة');
    this.cache.delete(store);
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = (e) => {
        console.error('خطأ في الحذف:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  // ============================================================
  // clear
  // ============================================================
  async clear(store) {
    if (!this.isReady) throw new Error('قاعدة البيانات غير جاهزة');
    this.cache.delete(store);
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(store, 'readwrite');
      const req = tx.objectStore(store).clear();
      req.onsuccess = () => resolve();
      req.onerror = (e) => {
        console.error('خطأ في المسح:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  // ============================================================
  // getByIndex - مع التحقق من وجود الفهرس
  // ============================================================
  async getByIndex(store, index, value) {
    if (!this.isReady) throw new Error('قاعدة البيانات غير جاهزة');
    
    return new Promise((resolve, reject) => {
      try {
        const tx = this.db.transaction(store, 'readonly');
        const objectStore = tx.objectStore(store);
        
        // التحقق من وجود الفهرس
        if (!objectStore.indexNames.contains(index)) {
          console.warn(`⚠️ الفهرس "${index}" غير موجود في المخزن "${store}"`);
          // الحل الاحتياطي: جلب الكل والتصفية
          const req = objectStore.getAll();
          req.onsuccess = () => {
            const results = req.result.filter(item => item[index] === value);
            resolve(results);
          };
          req.onerror = () => reject(req.error);
          return;
        }
        
        const req = objectStore.index(index).getAll(value);
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => {
          console.error('خطأ في البحث بالفهرس:', e.target.error);
          reject(e.target.error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  // ============================================================
  // transaction
  // ============================================================
  async transaction(stores, callback) {
    if (!this.isReady) throw new Error('قاعدة البيانات غير جاهزة');
    
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(stores, 'readwrite');
      const helpers = {};
      
      stores.forEach(s => {
        const store = tx.objectStore(s);
        helpers[s] = {
          add: (data) => {
            // إزالة id للتأكد من استخدام autoIncrement
            const { id, ...cleanData } = data;
            return new Promise((res, rej) => {
              const req = store.add(cleanData);
              req.onsuccess = () => { this.cache.delete(s); res(req.result); };
              req.onerror = () => { rej(req.error); };
            });
          },
          put: (data) => {
            if (!data.id) {
              return Promise.reject(new Error('لا يمكن التحديث بدون معرف (id)'));
            }
            return new Promise((res, rej) => {
              const req = store.put(data);
              req.onsuccess = () => { this.cache.delete(s); res(req.result); };
              req.onerror = () => { rej(req.error); };
            });
          },
          delete: (id) => {
            return new Promise((res, rej) => {
              const req = store.delete(id);
              req.onsuccess = () => { this.cache.delete(s); res(); };
              req.onerror = () => { rej(req.error); };
            });
          },
          get: (id) => {
            return new Promise((res, rej) => {
              const req = store.get(id);
              req.onsuccess = () => res(req.result);
              req.onerror = () => rej(req.error);
            });
          },
          getAll: () => {
            return new Promise((res, rej) => {
              const req = store.getAll();
              req.onsuccess = () => res(req.result);
              req.onerror = () => rej(req.error);
            });
          },
          getByIndex: (idx, val) => {
            return new Promise((res, rej) => {
              try {
                if (!store.indexNames.contains(idx)) {
                  // إذا لم يكن الفهرس موجوداً، استخدم التصفية اليدوية
                  const req = store.getAll();
                  req.onsuccess = () => {
                    const results = req.result.filter(item => item[idx] === val);
                    res(results);
                  };
                  req.onerror = () => rej(req.error);
                  return;
                }
                const req = store.index(idx).getAll(val);
                req.onsuccess = () => res(req.result);
                req.onerror = () => rej(req.error);
              } catch (e) { rej(e); }
            });
          }
        };
      });

      try {
        const result = callback(helpers);
        tx.oncomplete = () => resolve(result);
        tx.onerror = (e) => {
          console.error('خطأ في المعاملة:', e.target.error);
          reject(e.target.error);
        };
      } catch (e) {
        tx.abort();
        reject(e);
      }
    });
  }

  // ============================================================
  // getNextCounter
  // ============================================================
  async getNextCounter(key) {
    const counters = await this.getAll('counters');
    let counter = counters.find(c => c.key === key);
    if (!counter) {
      counter = { key, value: 1 };
      const id = await this.add('counters', counter);
      return { value: 1, id };
    }
    const value = counter.value;
    await this.put('counters', { ...counter, value: value + 1 });
    return { value, id: counter.id };
  }
}

export const db = new Database();