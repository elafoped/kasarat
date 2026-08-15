import { db } from './database';
import { config } from './config';

class Security {
  constructor() {
    this.currentUser = null;
    this.session = null;
    this.loginAttempts = new Map();
    this.SESSION_KEY = 'crusher_session_v4';
    this.MAX_ATTEMPTS = 5;
    this.LOCKOUT_TIME = 15 * 60 * 1000; // 15 دقيقة
    this.SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 ساعة
  }

  // ============================================================
  // تشفير كلمة المرور (SHA-256)
  // ============================================================
  async hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'crusher_secure_salt_2026');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ============================================================
  // تسجيل الدخول
  // ============================================================
  async login(username, password) {
    // 1. التحقق من محاولات الدخول الفاشلة
    const attempts = this.loginAttempts.get(username) || { count: 0, lockedUntil: 0 };
    
    if (attempts.lockedUntil > Date.now()) {
      const remaining = Math.ceil((attempts.lockedUntil - Date.now()) / 60000);
      throw new Error(`⛔ الحساب مقفل لمدة ${remaining} دقيقة`);
    }

    // 2. البحث عن المستخدم
    const users = await db.getAll('users');
    const user = users.find(u => u.username === username);
    
    if (!user) {
      this._recordFailedAttempt(username);
      throw new Error('❌ اسم المستخدم غير موجود');
    }

    // 3. التحقق من كلمة المرور
    const hash = await this.hashPassword(password);
    if (user.passwordHash !== hash) {
      this._recordFailedAttempt(username);
      throw new Error('❌ كلمة المرور غير صحيحة');
    }

    // 4. التحقق من حالة الحساب
    if (user.active === false) {
      throw new Error('⛔ هذا الحساب غير نشط، يرجى التواصل مع المدير');
    }

    // 5. تسجيل الدخول ناجح
    this.loginAttempts.delete(username);
    this.currentUser = user;
    
    // إنشاء جلسة
    this.session = {
      userId: user.id,
      username: user.username,
      role: user.role,
      expiresAt: Date.now() + this.SESSION_DURATION,
      createdAt: new Date().toISOString()
    };

    // حفظ الجلسة
    localStorage.setItem(this.SESSION_KEY, JSON.stringify(this.session));
    
    // تسجيل في سجل التدقيق
    await db.add('audit_logs', {
      action: 'login',
      entity: 'user',
      entityId: user.id,
      details: `✅ تسجيل دخول: ${user.username} (${user.role})`,
      timestamp: new Date().toISOString(),
      userId: user.id
    });

    return user;
  }

  // ============================================================
  // تسجيل محاولة فاشلة
  // ============================================================
  _recordFailedAttempt(username) {
    const attempts = this.loginAttempts.get(username) || { count: 0, lockedUntil: 0 };
    attempts.count += 1;
    
    if (attempts.count >= this.MAX_ATTEMPTS) {
      attempts.lockedUntil = Date.now() + this.LOCKOUT_TIME;
    }
    
    this.loginAttempts.set(username, attempts);
    
    // تسجيل المحاولة الفاشلة
    db.add('audit_logs', {
      action: 'login_failed',
      entity: 'user',
      entityId: null,
      details: `❌ محاولة دخول فاشلة: ${username} (المحاولة ${attempts.count})`,
      timestamp: new Date().toISOString(),
      userId: null
    }).catch(() => {});
  }

  // ============================================================
  // تهيئة الجلسة (عند تحميل التطبيق)
  // ============================================================
  async init() {
    const sessionData = localStorage.getItem(this.SESSION_KEY);
    
    if (sessionData) {
      try {
        const session = JSON.parse(sessionData);
        
        // التحقق من صلاحية الجلسة
        if (session.expiresAt > Date.now()) {
          const user = await db.get('users', session.userId);
          
          if (user && user.active !== false) {
            this.currentUser = user;
            this.session = session;
            return { authenticated: true, user };
          }
        }
      } catch (e) {
        console.warn('جلسة غير صالحة:', e);
      }
      
      localStorage.removeItem(this.SESSION_KEY);
    }

    // التحقق من وجود مستخدمين
    const users = await db.getAll('users');
    if (users.length === 0) {
      return { authenticated: false, needsSetup: true };
    }
    
    return { authenticated: false, needsSetup: false };
  }

  // ============================================================
  // إنشاء مستخدم جديد
  // ============================================================
  async createUser(username, password, name, role) {
    // التحقق من وجود المستخدم
    const users = await db.getAll('users');
    if (users.find(u => u.username === username)) {
      throw new Error('❌ اسم المستخدم موجود بالفعل');
    }

    // التحقق من قوة كلمة المرور
    if (!password || password.length < 4) {
      throw new Error('❌ كلمة المرور يجب أن تكون 4 أحرف على الأقل');
    }

    // تشفير كلمة المرور
    const hash = await this.hashPassword(password);
    
    const user = {
      username: username.trim(),
      passwordHash: hash,
      name: name?.trim() || username.trim(),
      role: role || 'user',
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: null
    };

    const id = await db.add('users', user);
    
    // تسجيل في سجل التدقيق
    await db.add('audit_logs', {
      action: 'user_created',
      entity: 'user',
      entityId: id,
      details: `👤 تم إنشاء مستخدم: ${username} (${role})`,
      timestamp: new Date().toISOString(),
      userId: this.currentUser?.id || 'system'
    });

    return { ...user, id };
  }

  // ============================================================
  // تحديث مستخدم
  // ============================================================
  async updateUser(id, data) {
    const user = await db.get('users', id);
    if (!user) throw new Error('المستخدم غير موجود');

    // منع تغيير دور المدير الأخير
    if (user.role === 'admin' && data.role !== 'admin') {
      const admins = (await db.getAll('users')).filter(u => u.role === 'admin');
      if (admins.length === 1 && admins[0].id === id) {
        throw new Error('❌ لا يمكن تغيير دور المدير الأخير');
      }
    }

    const updated = {
      ...user,
      ...data,
      updatedAt: new Date().toISOString()
    };

    await db.put('users', updated);
    
    await db.add('audit_logs', {
      action: 'user_updated',
      entity: 'user',
      entityId: id,
      details: `✏️ تحديث مستخدم: ${user.username}`,
      timestamp: new Date().toISOString(),
      userId: this.currentUser?.id || 'system'
    });

    return updated;
  }

  // ============================================================
  // حذف مستخدم
  // ============================================================
  async deleteUser(id) {
    const user = await db.get('users', id);
    if (!user) throw new Error('المستخدم غير موجود');

    // منع حذف المدير الأخير
    if (user.role === 'admin') {
      const admins = (await db.getAll('users')).filter(u => u.role === 'admin');
      if (admins.length === 1) {
        throw new Error('❌ لا يمكن حذف المدير الأخير');
      }
    }

    // منع حذف الحساب الحالي
    if (this.currentUser && this.currentUser.id === id) {
      throw new Error('❌ لا يمكن حذف حسابك الحالي');
    }

    await db.delete('users', id);
    
    await db.add('audit_logs', {
      action: 'user_deleted',
      entity: 'user',
      entityId: id,
      details: `🗑️ حذف مستخدم: ${user.username}`,
      timestamp: new Date().toISOString(),
      userId: this.currentUser?.id || 'system'
    });

    return true;
  }

  // ============================================================
  // تغيير كلمة المرور
  // ============================================================
  async changePassword(userId, oldPassword, newPassword) {
    const user = await db.get('users', userId);
    if (!user) throw new Error('المستخدم غير موجود');

    // التحقق من كلمة المرور الحالية
    const oldHash = await this.hashPassword(oldPassword);
    if (user.passwordHash !== oldHash) {
      throw new Error('❌ كلمة المرور الحالية غير صحيحة');
    }

    // التحقق من قوة كلمة المرور الجديدة
    if (!newPassword || newPassword.length < 4) {
      throw new Error('❌ كلمة المرور الجديدة يجب أن تكون 4 أحرف على الأقل');
    }

    // تحديث كلمة المرور
    const newHash = await this.hashPassword(newPassword);
    await db.put('users', {
      ...user,
      passwordHash: newHash,
      updatedAt: new Date().toISOString()
    });

    await db.add('audit_logs', {
      action: 'password_changed',
      entity: 'user',
      entityId: userId,
      details: `🔑 تغيير كلمة المرور: ${user.username}`,
      timestamp: new Date().toISOString(),
      userId: this.currentUser?.id || 'system'
    });

    return true;
  }

  // ============================================================
  // تسجيل الخروج
  // ============================================================
  async logout() {
    if (this.currentUser) {
      await db.add('audit_logs', {
        action: 'logout',
        entity: 'user',
        entityId: this.currentUser.id,
        details: `🚪 تسجيل خروج: ${this.currentUser.username}`,
        timestamp: new Date().toISOString(),
        userId: this.currentUser.id
      }).catch(() => {});
    }
    
    this.currentUser = null;
    this.session = null;
    localStorage.removeItem(this.SESSION_KEY);
  }

  // ============================================================
  // التحقق من الصلاحيات
  // ============================================================
  hasPermission(permission) {
    if (!this.currentUser) return false;
    
    const role = this.currentUser.role;
    const permissions = {
      admin: ['*'],
      manager: ['view_dashboard', 'manage_customers', 'manage_vehicles', 'manage_materials', 
                'manage_sales', 'manage_payments', 'view_invoices', 'manage_expenses', 'view_reports'],
      accountant: ['view_dashboard', 'manage_payments', 'view_invoices', 'view_reports', 'manage_expenses'],
      warehouse: ['view_dashboard', 'manage_materials', 'view_sales'],
      user: ['view_dashboard']
    };

    const userPermissions = permissions[role] || [];
    return userPermissions.includes('*') || userPermissions.includes(permission);
  }

  // ============================================================
  // هل المستخدم مدير؟
  // ============================================================
  isAdmin() {
    return this.currentUser?.role === 'admin';
  }

  // ============================================================
  // الحصول على المستخدم الحالي
  // ============================================================
  getCurrentUser() {
    return this.currentUser;
  }

  // ============================================================
  // الحصول على الجلسة الحالية
  // ============================================================
  getSession() {
    return this.session;
  }

  // ============================================================
  // إعادة تعيين جميع المستخدمين (للحالات الطارئة)
  // ============================================================
  async resetAllUsers() {
    await db.clear('users');
    localStorage.removeItem(this.SESSION_KEY);
    this.currentUser = null;
    this.session = null;
    
    await db.add('audit_logs', {
      action: 'users_reset',
      entity: 'system',
      entityId: 'all_users',
      details: '🔄 تم إعادة تعيين جميع المستخدمين',
      timestamp: new Date().toISOString(),
      userId: 'system'
    });
  }
}

export const security = new Security();