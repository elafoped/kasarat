import React, { useState, useEffect } from 'react';

function Login({ onLogin, needsSetup, onSetupComplete, error: toastError }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [attempts, setAttempts] = useState(0);

  // ============================================================
  // معالجة تسجيل الدخول
  // ============================================================
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!username.trim()) {
      setError('يرجى إدخال اسم المستخدم');
      return;
    }
    
    if (!password || password.length < 4) {
      setError('كلمة المرور يجب أن تكون 4 أحرف على الأقل');
      return;
    }

    setLoading(true);

    try {
      if (needsSetup) {
        // وضع الإعداد الأولي - إنشاء حساب المدير
        await onSetupComplete(username.trim(), password);
        setError('✅ تم إنشاء حساب المدير بنجاح. يرجى تسجيل الدخول.');
        setPassword('');
        setLoading(false);
        return;
      }

      // تسجيل الدخول العادي
      await onLogin(username.trim(), password);
      setError('');
      
    } catch (err) {
      setError(err.message || 'حدث خطأ في تسجيل الدخول');
      setAttempts(prev => prev + 1);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // إعادة تعيين كلمة المرور (للمدير فقط)
  // ============================================================
  const handleResetPassword = () => {
    if (!window.confirm('⚠️ سيتم حذف جميع المستخدمين. هل أنت متأكد؟')) {
      return;
    }
    
    const confirmText = prompt('للتأكيد، اكتب كلمة "إعادة تعيين"');
    if (confirmText !== 'إعادة تعيين') {
      setError('تم إلغاء العملية');
      return;
    }
    
    // تنفيذ إعادة التعيين
    window.location.reload();
  };

  return (
    <div className="login-page">
      <div className="login-box">
        {/* الشعار */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '3rem' }}>⛰️</div>
          <h2 style={{ marginTop: '0.5rem' }}>نظام إدارة الكسارات</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--gray-500)' }}>
            {needsSetup ? '🔧 الإعداد الأولي' : '🔐 تسجيل الدخول'}
          </p>
        </div>

        {/* رسالة الإعداد */}
        {needsSetup && (
          <div className="setup-warning">
            ⚠️ لم يتم إعداد مستخدم مدير بعد.<br />
            قم بإنشاء حساب المدير الأول.
          </div>
        )}

        {/* رسالة الخطأ */}
        {error && (
          <div className="error-msg" style={{ 
            padding: '0.5rem', 
            borderRadius: 'var(--radius)',
            background: error.includes('✅') ? 'var(--secondary-50)' : 'var(--danger-50)',
            color: error.includes('✅') ? 'var(--secondary-700)' : 'var(--danger-700)',
            marginBottom: '1rem'
          }}>
            {error}
          </div>
        )}

        {/* نموذج تسجيل الدخول */}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>👤 اسم المستخدم</label>
            <input
              className="form-control"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="أدخل اسم المستخدم"
              required
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>🔑 كلمة المرور</label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-control"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور"
                required
                disabled={loading}
                style={{ paddingLeft: '2.5rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  left: '0.5rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--gray-500)',
                  fontSize: '1rem'
                }}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button
            className="btn btn-primary btn-block"
            type="submit"
            disabled={loading}
            style={{ marginTop: '0.5rem' }}
          >
            {loading ? (
              <span>⏳ جاري التحقق...</span>
            ) : needsSetup ? (
              '🔧 إنشاء حساب المدير'
            ) : (
              '🚀 تسجيل الدخول'
            )}
          </button>
        </form>

        {/* روابط إضافية */}
        <div style={{ marginTop: '1rem', textAlign: 'center' }}>
          {!needsSetup && (
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                handleResetPassword();
              }}
              style={{ fontSize: '0.85rem', color: 'var(--gray-500)' }}
            >
              🔄 نسيت كلمة المرور؟
            </a>
          )}
          
          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--gray-400)' }}>
            {needsSetup ? 'الإصدار 4.0 · الإعداد الأولي' : `الإصدار 4.0 · محلي بالكامل`}
          </div>
          
          {attempts > 0 && !needsSetup && (
            <div style={{ marginTop: '0.25rem', fontSize: '0.7rem', color: 'var(--danger-400)' }}>
              محاولات فاشلة: {attempts}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Login;