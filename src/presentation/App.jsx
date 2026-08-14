import React, { useState, useEffect } from 'react';
import { db } from '../core/database';
import { config } from '../core/config';
import { useToast } from '../application/hooks/useToast';

// مكونات الصفحات
import Dashboard from './components/Dashboard';
import Customers from './components/Customers';
import Vehicles from './components/Vehicles';
import Materials from './components/Materials';
import Sales from './components/Sales';
import Payments from './components/Payments';
import Debts from './components/Debts';
import Invoices from './components/Invoices';
import Expenses from './components/Expenses';
import Reports from './components/Reports';
import Backup from './components/Backup';
import Settings from './components/Settings';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Toast from './components/Toast';

const PAGES = {
  dashboard: { id: 'dashboard', icon: '📊', label: 'الرئيسية', component: Dashboard },
    sales: { id: 'sales', icon: '💰', label: 'المبيعات', component: Sales },

  customers: { id: 'customers', icon: '👤', label: 'الزبائن', component: Customers },
  vehicles: { id: 'vehicles', icon: '🚗', label: 'السيارات', component: Vehicles },
  materials: { id: 'materials', icon: '🧱', label: 'المواد', component: Materials },
  payments: { id: 'payments', icon: '💵', label: 'الدفعات', component: Payments },
  debts: { id: 'debts', icon: '📋', label: 'الفواتير و الديون', component: Debts },
  expenses: { id: 'expenses', icon: '💸', label: 'المصروفات', component: Expenses },
  reports: { id: 'reports', icon: '📈', label: 'التقارير', component: Reports },
  backup: { id: 'backup', icon: '💾', label: 'النسخ الاحتياطي', component: Backup },
  settings: { id: 'settings', icon: '⚙️', label: 'الإعدادات', component: Settings },
};

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toasts, showToast, success, error, warning, info } = useToast();
  const [settings, setSettings] = useState(config.settings);
  const [refreshKey, setRefreshKey] = useState(0);

  // مستخدم افتراضي (مدير) - بدون تسجيل دخول
  const user = { id: 1, name: 'مدير النظام', role: 'admin' };

  useEffect(() => {
    initApp();
  }, []);

  const initApp = async () => {
    try {
      setLoading(true);
      await db.init();
      console.log('✅ قاعدة البيانات جاهزة');

      // ============================================================
      // إنشاء مستخدم افتراضي إذا لم يوجد
      // ============================================================
      const users = await db.getAll('users');
      if (users.length === 0) {
        // إنشاء مستخدم مدير افتراضي
        const hash = await hashPassword('admin123');
        await db.add('users', {
          username: 'admin',
          passwordHash: hash,
          name: 'مدير النظام',
          role: 'admin',
          active: true,
          createdAt: new Date().toISOString()
        });
        console.log('✅ تم إنشاء مستخدم افتراضي (admin/admin123)');
      }

      setLoading(false);
    } catch (error) {
      console.error('فشل تهيئة التطبيق:', error);
      error('خطأ في تهيئة النظام: ' + error.message);
      setLoading(false);
    }
  };

  // ============================================================
  // دالة مساعدة لتشفير كلمة المرور (للمستخدم الافتراضي)
  // ============================================================
  const hashPassword = async (password) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + 'crusher_secure_salt_2026');
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const navigateTo = (pageId) => {
    if (PAGES[pageId]) {
      setCurrentPage(pageId);
      setSidebarOpen(false);
      setRefreshKey(prev => prev + 1);
    }
  };

  const updateSettings = (newSettings) => {
    config.settings = newSettings;
    setSettings(newSettings);
    success('تم حفظ الإعدادات');
  };

  const refreshCurrentPage = () => {
    setRefreshKey(prev => prev + 1);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <span>جاري تهيئة النظام...</span>
      </div>
    );
  }

  const CurrentComponent = PAGES[currentPage]?.component || Dashboard;

  return (
    <div className="app-container">
      <Sidebar 
        pages={PAGES} 
        currentPage={currentPage} 
        navigateTo={navigateTo} 
        isOpen={sidebarOpen} 
        onToggle={() => setSidebarOpen(!sidebarOpen)} 
      />
      
      <div className="main-wrapper">
        <Header 
          currentPage={currentPage} 
          pages={PAGES} 
          user={user}
          onLogout={() => {}} // لا يوجد تسجيل خروج
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} 
        />
        
        <div className="page-content">
          <CurrentComponent 
            key={refreshKey}
            showToast={showToast}
            success={success}
            error={error}
            warning={warning}
            info={info}
            settings={settings} 
            currentUser={user}
            onUpdateSettings={updateSettings}
            onRefresh={refreshCurrentPage}
          />
        </div>
      </div>
      
      <Toast toasts={toasts} />
    </div>
  );
}

export default App;