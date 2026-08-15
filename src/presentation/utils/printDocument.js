// ============================================================
// أداة طباعة موحّدة لكل التطبيق
// ============================================================
// ⚠️ لا تستخدم window.open() للطباعة — هذا كان سبب عطل الطباعة
// بالتطبيق المكتبي (Electron أو أي غلاف مشابه بعد التغليف بالجيت
// هب): البيئات المكتبية تمنع فتح نوافذ متصفح جديدة افتراضياً
// لأسباب أمنية، فكانت window.open() ترجع null أو تُمنع بصمت.
//
// الحل: نبني مستند الطباعة داخل iframe مخفي بنفس الصفحة الحالية
// ثم نستدعي iframe.contentWindow.print() — بالضبط نفس آلية
// window.print() المستخدمة بصفحة "التقارير" (Reports.jsx) التي
// تشتغل بكل البيئات لأنها لا تفتح نافذة جديدة إطلاقاً.
// ============================================================

export function printHtmlDocument(html) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const remove = () => {
    if (iframe.parentNode) {
      iframe.parentNode.removeChild(iframe);
    }
  };

  try {
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();
  } catch (e) {
    console.error('خطأ في تجهيز مستند الطباعة:', e);
    remove();
    return;
  }

  iframe.onload = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      console.error('تعذّرت الطباعة:', e);
    }
  };

  // ننظف الـ iframe بعد إغلاق نافذة الطباعة (إن أُطلق الحدث)
  try {
    iframe.contentWindow.onafterprint = remove;
  } catch (e) {
    // تجاهل - بعض البيئات لا تدعم هذا الحدث
  }

  // تنظيف احتياطي بكل الأحوال حتى لا يتراكم عدة iframes بالصفحة
  // (مهلة كافية للمستخدم ليتفاعل مع نافذة الطباعة)
  setTimeout(remove, 60000);
}
