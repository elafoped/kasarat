// src/presentation/components/Sales.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../../core/database';
import { formatCurrency, formatDate } from '../utils/formatters';
import { SaleService } from '../../domain/services/SaleService';
import CustomerSearch from './CustomerSearch';
import { Validators } from '../../core/validation';
import { MIN_BALANCE } from '../../core/constants';

// دالة تقريب محلية
function round2(num) {
  const n = Number(num);
  if (isNaN(n)) return 0;
  const rounded = Number(n.toFixed(2));
  if (Math.abs(rounded) < MIN_BALANCE) return 0;
  return rounded;
}

function Sales({ success, error, warning, settings, onRefresh }) {
  // ============================================================
  // البيانات الأساسية
  // ============================================================
  const [sales, setSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  // ============================================================
  // الفلترة
  // ============================================================
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    customerId: '',
    materialId: '',
    vehicleId: '',
    status: 'all',
    minAmount: '',
    maxAmount: '',
    search: ''
  });

  // ============================================================
  // نموذج البيع
  // ============================================================
  const [showModal, setShowModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [editingSale, setEditingSale] = useState(null);
  const [formData, setFormData] = useState({
    customerId: '',
    vehicleId: '',
    materialId: '',
    quantity: 1,
    pricePerUnit: 0,
    paidAmount: 0,
    notes: ''
  });

  // ============================================================
  // نموذج الدفعة الجديدة
  // ============================================================
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentErrors, setPaymentErrors] = useState({});
  const [selectedPaymentCustomer, setSelectedPaymentCustomer] = useState(null);
  const [customerDebtDetails, setCustomerDebtDetails] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    customerId: '',
    amount: 0,
    method: 'نقدي',
    notes: '',
    paymentDate: new Date().toISOString().split('T')[0]
  });

  // ============================================================
  // الإضافة السريعة
  // ============================================================
const [quickAdd, setQuickAdd] = useState({
  customer: { name: '', phone: '', address: '' },
  vehicle: { plateNumber: '', type: '' },
  material: {
    name: '',
    category: '',
    unit: '',
    price: 0,
    currentQuantity: 0,    // ← الكمية الأولية
    minStock: 0            // ← الحد الأدنى
  }
});
  const [showQuickCustomer, setShowQuickCustomer] = useState(false);
  const [showQuickVehicle, setShowQuickVehicle] = useState(false);
  const [showQuickMaterial, setShowQuickMaterial] = useState(false);

  // ============================================================
  // حساب القيم
  // ============================================================
  const total = (formData.quantity || 0) * (formData.pricePerUnit || 0);
  const remaining = total - (formData.paidAmount || 0);

  // ============================================================
  // تحميل البيانات
  // ============================================================
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [salesData, customersData, vehiclesData, materialsData, paymentsData] = await Promise.all([
        db.getAll('sales').catch(() => []),
        db.getAll('customers').catch(() => []),
        db.getAll('vehicles').catch(() => []),
        db.getAll('materials').catch(() => []),
        db.getAll('payments').catch(() => [])
      ]);
      setSales(salesData || []);
      setCustomers(customersData || []);
      setVehicles(vehiclesData || []);
      setMaterials(materialsData || []);
      setPayments(paymentsData || []);
    } catch (e) {
      console.error('خطأ في تحميل البيانات:', e);
      setSales([]);
      setCustomers([]);
      setVehicles([]);
      setMaterials([]);
      setPayments([]);
      if (error) error('خطأ في تحميل البيانات: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ============================================================
  // السيارات المفلترة حسب الزبون
  // ============================================================
  const getFilteredVehicles = useCallback(() => {
    if (!formData.customerId) return vehicles || [];
    return (vehicles || []).filter(v => v.customerId === parseInt(formData.customerId));
  }, [vehicles, formData.customerId]);

  // ============================================================
  // دوال الإضافة السريعة
  // ============================================================
  const handleQuickAddCustomer = async () => {
    const { name, phone, address } = quickAdd.customer;
    if (!name.trim()) { if (warning) warning('اسم الزبون مطلوب'); return; }
    try {
      const newCustomer = {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        createdAt: new Date().toISOString()
      };
      const id = await db.add('customers', newCustomer);
      const added = { ...newCustomer, id };
      setCustomers(prev => [...prev, added]);
      setFormData(prev => ({ ...prev, customerId: id }));
      setShowQuickCustomer(false);
      setQuickAdd(prev => ({ ...prev, customer: { name: '', phone: '', address: '' } }));
      if (success) success('✅ تم إضافة الزبون بنجاح');
    } catch (e) { if (error) error('❌ خطأ: ' + e.message); }
  };

  const handleQuickAddVehicle = async () => {
    const { plateNumber, type } = quickAdd.vehicle;
    if (!plateNumber.trim()) { if (warning) warning('رقم اللوحة مطلوب'); return; }
    if (!formData.customerId) { if (warning) warning('يجب اختيار زبون أولاً'); return; }
    try {
      const newVehicle = {
        plateNumber: plateNumber.trim(),
        customerId: parseInt(formData.customerId),
        type: type.trim(),
        createdAt: new Date().toISOString()
      };
      const id = await db.add('vehicles', newVehicle);
      const added = { ...newVehicle, id };
      setVehicles(prev => [...prev, added]);
      setFormData(prev => ({ ...prev, vehicleId: id }));
      setShowQuickVehicle(false);
      setQuickAdd(prev => ({ ...prev, vehicle: { plateNumber: '', type: '' } }));
      if (success) success('✅ تم إضافة السيارة بنجاح');
    } catch (e) { if (error) error('❌ خطأ: ' + e.message); }
  };

 const handleQuickAddMaterial = async () => {
  const { name, category, unit, price, currentQuantity, minStock } = quickAdd.material;
  
  // التحقق من الحقول الإجبارية
  if (!name.trim()) { if (warning) warning('اسم المادة مطلوب'); return; }
  if (price <= 0) { if (warning) warning('السعر يجب أن يكون أكبر من صفر'); return; }
  // الكمية والحد الأدنى اختياريان (يمكن أن يكونا 0)
  
  try {
    const newMaterial = {
      name: name.trim(),
      category: category.trim() || 'عام',
      unit: unit.trim() || 'قطعة',
      price: Number(price),
      currentQuantity: Number(currentQuantity) || 0,
      minStock: Number(minStock) || 0,
      createdAt: new Date().toISOString()
    };
    const id = await db.add('materials', newMaterial);
    const added = { ...newMaterial, id };
    
    setMaterials(prev => [...prev, added]);
    setFormData(prev => ({ ...prev, materialId: id, pricePerUnit: added.price }));
    setShowQuickMaterial(false);
    setQuickAdd(prev => ({
      ...prev,
      material: { name: '', category: '', unit: '', price: 0, currentQuantity: 0, minStock: 0 }
    }));
    if (success) success('✅ تم إضافة المادة بنجاح');
  } catch (e) {
    if (error) error('❌ خطأ: ' + e.message);
  }
};

  // ============================================================
  // دوال نموذج البيع
  // ============================================================
  const openEditModal = (sale) => {
    setEditingSale(sale);
    setFormData({
      customerId: sale.customerId || '',
      vehicleId: sale.vehicleId || '',
      materialId: sale.materialId || '',
      quantity: sale.quantity || 1,
      pricePerUnit: sale.pricePerUnit || 0,
      paidAmount: sale.paidAmount || 0,
      notes: sale.notes || ''
    });
    setErrors({});
    setShowModal(true);
  };

  const openAddModal = () => {
    setEditingSale(null);
    setFormData({
      customerId: '',
      vehicleId: '',
      materialId: '',
      quantity: 1,
      pricePerUnit: 0,
      paidAmount: 0,
      notes: ''
    });
    setErrors({});
    setShowModal(true);
  };

  const closeModal = () => {
    if (isSubmitting) return;
    setShowModal(false);
    setEditingSale(null);
    setErrors({});
    setShowQuickCustomer(false);
    setShowQuickVehicle(false);
    setShowQuickMaterial(false);
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.customerId) newErrors.customerId = 'الزبون مطلوب';
    if (!formData.vehicleId) newErrors.vehicleId = 'السيارة مطلوبة';
    if (!formData.materialId) newErrors.materialId = 'المادة مطلوبة';
    if (formData.quantity <= 0) newErrors.quantity = 'الكمية يجب أن تكون أكبر من صفر';
    if (formData.pricePerUnit <= 0) newErrors.pricePerUnit = 'السعر يجب أن يكون أكبر من صفر';
    if (formData.paidAmount < 0) newErrors.paidAmount = 'المدفوع لا يمكن أن يكون سالباً';
    if (formData.paidAmount > total) newErrors.paidAmount = 'المدفوع لا يمكن أن يتجاوز الإجمالي';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    setErrors({});
    if (!validateForm()) {
      const firstError = Object.values(errors)[0];
      if (warning) warning(firstError);
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const saleData = {
        customerId: parseInt(formData.customerId),
        vehicleId: parseInt(formData.vehicleId),
        materialId: parseInt(formData.materialId),
        quantity: Number(formData.quantity),
        pricePerUnit: Number(formData.pricePerUnit),
        paidAmount: Number(formData.paidAmount) || 0,
        notes: formData.notes,
        paymentMethod: 'نقدي'
      };
      const validation = Validators.validateSale(saleData);
      if (!validation.valid) {
        validation.errors.forEach(err => warning(err));
        return;
      }
      const validatedData = validation.data;
      if (editingSale) {
        await SaleService.updateSale(editingSale.id, validatedData);
        if (success) success('✅ تم تعديل البيع بنجاح');
      } else {
        await SaleService.createSale(validatedData);
        if (success) success('✅ تم تسجيل البيع وإنشاء الفاتورة والدفعة تلقائياً');
      }
      setShowModal(false);
      setEditingSale(null);
      setFormData({ customerId: '', vehicleId: '', materialId: '', quantity: 1, pricePerUnit: 0, paidAmount: 0, notes: '' });
      setErrors({});
      await loadData();
      if (onRefresh) onRefresh();
    } catch (e) {
      if (error) error('❌ خطأ: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelSale = async (id) => {
    const reason = window.prompt('أدخل سبب الإلغاء:');
    if (reason === null) return;
    if (!reason.trim()) { if (warning) warning('السبب مطلوب'); return; }
    try {
      await SaleService.cancelSale(id, reason.trim());
      if (success) success('✅ تم إلغاء البيع والفواتير والدفعات المرتبطة');
      await loadData();
      if (onRefresh) onRefresh();
    } catch (e) { if (error) error('❌ خطأ: ' + e.message); }
  };

  // ============================================================
  // حساب ديون الزبون (إصدار كامل)
  // ============================================================
  const calculateCustomerDebt = useCallback((customerId) => {
    const customerSales = (sales || []).filter(s => s.customerId === customerId && s.status === 'active');
    const totalSales = customerSales.reduce((sum, s) => sum + round2(s.totalAmount || 0), 0);
    const totalPaid = customerSales.reduce((sum, s) => sum + round2(s.paidAmount || 0), 0);
    let totalRemaining = round2(totalSales - totalPaid);
    if (totalRemaining < MIN_BALANCE) totalRemaining = 0;

    const unpaidInvoices = customerSales
      .filter(s => round2(s.remainingBalance || 0) > MIN_BALANCE)
      .map(s => ({
        invoiceNumber: s.invoiceNumber || '#' + s.id,
        date: s.saleDate,
        total: round2(s.totalAmount || 0),
        paid: round2(s.paidAmount || 0),
        remaining: round2(s.remainingBalance || 0),
        id: s.id
      }));

    return {
      customerId,
      totalSales: round2(totalSales),
      totalPaid: round2(totalPaid),
      remaining: totalRemaining,
      unpaidInvoices,
      invoiceCount: customerSales.length,
      paymentCount: 0
    };
  }, [sales]);

  // ============================================================
  // دوال الدفعة الجديدة
  // ============================================================
  const handlePaymentCustomerSelect = (customer) => {
    setSelectedPaymentCustomer(customer);
    setPaymentForm(prev => ({
      ...prev,
      customerId: customer?.id || ''
    }));
    if (paymentErrors.customerId) {
      setPaymentErrors({ ...paymentErrors, customerId: '' });
    }
    if (customer) {
      const debt = calculateCustomerDebt(customer.id);
      setCustomerDebtDetails(debt);
    } else {
      setCustomerDebtDetails(null);
    }
  };

  const openPaymentModal = () => {
    setSelectedPaymentCustomer(null);
    setCustomerDebtDetails(null);
    setPaymentForm({
      customerId: '',
      amount: 0,
      method: 'نقدي',
      notes: '',
      paymentDate: new Date().toISOString().split('T')[0]
    });
    setPaymentErrors({});
    setShowPaymentModal(true);
  };

  const closePaymentModal = () => {
    if (paymentSubmitting) return;
    setShowPaymentModal(false);
    setSelectedPaymentCustomer(null);
    setCustomerDebtDetails(null);
    setPaymentErrors({});
  };

  const validatePaymentForm = () => {
    const newErrors = {};
    if (!paymentForm.customerId) newErrors.customerId = 'الزبون مطلوب';
    if (paymentForm.amount <= 0) newErrors.amount = 'المبلغ يجب أن يكون أكبر من صفر';
    if (customerDebtDetails) {
      if (customerDebtDetails.remaining < MIN_BALANCE) {
        newErrors.amount = 'لا يوجد رصيد مستحق (أقل من 0.05 ل.س)';
      } else if (paymentForm.amount > customerDebtDetails.remaining + 0.01) {
        newErrors.amount = `المبلغ (${formatCurrency(paymentForm.amount, settings?.currency || 'ل.س')}) يتجاوز الرصيد المتبقي (${formatCurrency(customerDebtDetails.remaining, settings?.currency || 'ل.س')})`;
      }
    }
    setPaymentErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handlePaymentSubmit = async () => {
    setPaymentErrors({});
    if (!validatePaymentForm()) {
      const firstError = Object.values(paymentErrors)[0];
      if (warning) warning(firstError);
      return;
    }
    if (paymentSubmitting) return;
    setPaymentSubmitting(true);
    try {
      await SaleService.recordPayment({
        customerId: parseInt(paymentForm.customerId),
        amount: Number(paymentForm.amount),
        method: paymentForm.method,
        notes: paymentForm.notes || '',
        paymentDate: paymentForm.paymentDate || new Date().toISOString()
      });
      if (success) success('✅ تم تسجيل الدفعة وتوزيعها على الفواتير تلقائياً');

      const [salesData, paymentsData] = await Promise.all([
        db.getAll('sales').catch(() => []),
        db.getAll('payments').catch(() => [])
      ]);
      setSales(salesData || []);
      setPayments(paymentsData || []);

      const [customersData, vehiclesData, materialsData] = await Promise.all([
        db.getAll('customers').catch(() => []),
        db.getAll('vehicles').catch(() => []),
        db.getAll('materials').catch(() => [])
      ]);
      setCustomers(customersData || []);
      setVehicles(vehiclesData || []);
      setMaterials(materialsData || []);

      if (selectedPaymentCustomer) {
        const debt = calculateCustomerDebt(selectedPaymentCustomer.id);
        setCustomerDebtDetails(debt);
      }

      setShowPaymentModal(false);
      setSelectedPaymentCustomer(null);
      setCustomerDebtDetails(null);
      setPaymentForm({
        customerId: '',
        amount: 0,
        method: 'نقدي',
        notes: '',
        paymentDate: new Date().toISOString().split('T')[0]
      });

      if (onRefresh) onRefresh();
    } catch (e) {
      if (e.message && e.message.includes('تم حذف الرصيد المتبقي الصغير')) {
        if (warning) warning('⚠️ ' + e.message);
        await loadData();
      } else {
        if (error) error('❌ خطأ: ' + e.message);
      }
    } finally {
      setPaymentSubmitting(false);
    }
  };

  // ============================================================
  // طباعة الفاتورة
  // ============================================================
  const printInvoice = (sale) => {
    const customer = (customers || []).find(c => c.id === sale.customerId);
    const material = (materials || []).find(m => m.id === sale.materialId);
    const vehicle = (vehicles || []).find(v => v.id === sale.vehicleId);
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) { if (warning) warning('الرجاء السماح للنوافذ المنبثقة'); return; }
    const currency = settings?.currency || 'ل.س';
    const companyName = settings?.companyName || 'منشأة الكسارات';
    const bal = Number(sale.totalAmount || 0) - Number(sale.paidAmount || 0);
    const html = `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>فاتورة ${sale.invoiceNumber}</title>
    <style>body{font-family:'Cairo',sans-serif;padding:2rem;direction:rtl;}
    .invoice{max-width:800px;margin:0 auto;border:1px solid #ddd;padding:2rem;border-radius:8px;}
    .header{display:flex;justify-content:space-between;border-bottom:2px solid #333;padding-bottom:1rem;margin-bottom:1.5rem;}
    .company-name{font-size:1.5rem;font-weight:bold;color:#1e40af;}
    .details{display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;margin-bottom:1.5rem;}
    table{width:100%;border-collapse:collapse;margin:1rem 0;}
    th,td{padding:0.5rem;border-bottom:1px solid #eee;text-align:right;}
    th{background:#f3f4f6;font-weight:bold;}
    .total{display:flex;justify-content:flex-end;font-size:1.2rem;font-weight:bold;margin-top:1rem;padding-top:1rem;border-top:2px solid #333;}
    .total .row{display:flex;justify-content:space-between;padding:0.2rem 0;}
    .text-danger{color:#dc2626;}.text-success{color:#059669;}
    .footer{margin-top:2rem;text-align:center;color:#666;font-size:0.8rem;border-top:1px solid #ddd;padding-top:1rem;}
    .status{display:inline-block;padding:0.2rem 0.8rem;border-radius:999px;font-size:0.8rem;font-weight:bold;}
    .status-active{background:#d1fae5;color:#065f46;}
    .status-unpaid{background:#fee2e2;color:#991b1b;}
    .status-cancelled{background:#f3f4f6;color:#6b7280;}
    </style></head><body>
    <div class="invoice"><div class="header"><div><div class="company-name">${companyName}</div><div style="font-size:0.8rem;color:#666;">نظام إدارة الكسارات</div></div>
    <div style="text-align:left;"><div><strong>رقم الفاتورة:</strong> ${sale.invoiceNumber || '#' + sale.id}</div>
    <div><strong>التاريخ:</strong> ${formatDate(sale.saleDate)}</div>
    <div><strong>الحالة:</strong> <span class="status ${sale.status === 'active' ? (bal > 0 ? 'status-unpaid' : 'status-active') : 'status-cancelled'}">${sale.status === 'active' ? (bal > 0 ? '⏳ غير مكتملة' : '✅ مدفوعة') : '❌ ملغى'}</span></div></div></div>
    <div class="details"><div><strong>الزبون:</strong> ${customer ? customer.name : 'غير معروف'}</div><div><strong>الهاتف:</strong> ${customer ? customer.phone : '-'}</div>
    <div><strong>السيارة:</strong> ${vehicle ? vehicle.plateNumber : 'غير معروف'}</div><div><strong>المادة:</strong> ${material ? material.name : 'غير معروف'}</div></div>
    <table><thead><tr><th>البيان</th><th>الكمية</th><th>سعر الوحدة</th><th>الإجمالي</th></tr></thead>
    <tbody><tr><td>${material ? material.name : 'غير معروف'}</td><td>${sale.quantity || 0}</td><td>${formatCurrency(sale.pricePerUnit, currency)}</td><td>${formatCurrency(sale.totalAmount, currency)}</td></tr></tbody></table>
    <div class="total"><div><div class="row"><span>الإجمالي:</span><span>${formatCurrency(sale.totalAmount, currency)}</span></div>
    <div class="row"><span>المدفوع:</span><span>${formatCurrency(sale.paidAmount, currency)}</span></div>
    <div class="row" style="font-size:1.3rem;color:${bal > 0 ? '#dc2626' : '#059669'};"><span>المتبقي:</span><span>${formatCurrency(bal, currency)}</span></div></div></div>
    ${sale.notes ? `<div style="margin-top:1rem;padding-top:1rem;border-top:1px solid #eee;"><strong>ملاحظات:</strong> ${sale.notes}</div>` : ''}
    <div class="footer">${companyName} - نسخة مطبوعة ${new Date().toLocaleString('ar-EG')}</div></div>
    <script>window.onload=function(){window.print();setTimeout(window.close,1000);};<\/script></body></html>`;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // ============================================================
  // دالة الفلترة (مع حماية المصفوفات)
  // ============================================================
  const getFilteredSales = useCallback(() => {
    let filtered = [...(sales || [])];
    if (filters.search) {
      const q = filters.search.trim().toLowerCase();
      filtered = filtered.filter(s => {
        if (!q) return true;
        const c = (customers || []).find(a => a.id === s.customerId);
        const m = (materials || []).find(a => a.id === s.materialId);
        const v = (vehicles || []).find(a => a.id === s.vehicleId);
        return (s.invoiceNumber || '').toLowerCase().includes(q) ||
          (c && c.name && c.name.toLowerCase().includes(q)) ||
          (m && m.name && m.name.toLowerCase().includes(q)) ||
          (v && v.plateNumber && v.plateNumber.toLowerCase().includes(q));
      });
    }
    if (filters.dateFrom) filtered = filtered.filter(s => s.saleDate && s.saleDate >= filters.dateFrom);
    if (filters.dateTo) filtered = filtered.filter(s => s.saleDate && s.saleDate <= filters.dateTo + 'T23:59:59');
    if (filters.customerId) filtered = filtered.filter(s => s.customerId === parseInt(filters.customerId));
    if (filters.materialId) filtered = filtered.filter(s => s.materialId === parseInt(filters.materialId));
    if (filters.vehicleId) filtered = filtered.filter(s => s.vehicleId === parseInt(filters.vehicleId));
    if (filters.status === 'active') filtered = filtered.filter(s => s.status === 'active');
    else if (filters.status === 'cancelled') filtered = filtered.filter(s => s.status === 'cancelled');
    else if (filters.status === 'unpaid') filtered = filtered.filter(s => s.status === 'active' && Number(s.remainingBalance || 0) > 0.001);
    if (filters.minAmount) {
      const min = parseFloat(filters.minAmount);
      if (!isNaN(min)) filtered = filtered.filter(s => Number(s.totalAmount || 0) >= min);
    }
    if (filters.maxAmount) {
      const max = parseFloat(filters.maxAmount);
      if (!isNaN(max)) filtered = filtered.filter(s => Number(s.totalAmount || 0) <= max);
    }
    return filtered;
  }, [sales, customers, materials, vehicles, filters]);

  const filteredSales = loading ? [] : getFilteredSales();
  const filteredVehicles = getFilteredVehicles();

  const clearFilters = () => {
    setFilters({
      dateFrom: '', dateTo: '', customerId: '', materialId: '', vehicleId: '',
      status: 'all', minAmount: '', maxAmount: '', search: ''
    });
  };

  const getCustomerName = (id) => {
    const c = (customers || []).find(c => c.id === id);
    return c ? c.name : 'غير معروف';
  };
  const getMaterialName = (id) => {
    const m = (materials || []).find(m => m.id === id);
    return m ? m.name : 'غير معروف';
  };
  const getVehiclePlate = (id) => {
    const v = (vehicles || []).find(v => v.id === id);
    return v ? v.plateNumber : 'غير معروف';
  };

  // ============================================================
  // التصيير (مع حماية كل المصفوفات)
  // ============================================================
  return (
    <div className="page-section active">
      {/* شريط الفلترة */}
      <div className="card" style={{ marginBottom: '0.5rem', padding: '0.4rem 0.6rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.3rem' }}>
          {/* بحث */}
          <div className="search-box" style={{ flex: '2 1 150px', minWidth: '120px' }}>
            <span>🔍</span>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="بحث..."
              style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem' }}
            />
          </div>

          {/* التاريخ من */}
          <input
            type="date"
            className="form-control"
            style={{ width: '110px', padding: '0.15rem 0.3rem', fontSize: '0.75rem' }}
            value={filters.dateFrom}
            onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
            title="من تاريخ"
          />
          <span style={{ fontSize: '0.7rem' }}>→</span>

          {/* التاريخ إلى */}
          <input
            type="date"
            className="form-control"
            style={{ width: '110px', padding: '0.15rem 0.3rem', fontSize: '0.75rem' }}
            value={filters.dateTo}
            onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
            title="إلى تاريخ"
          />

          {/* الحالة */}
          <select
            className="form-control"
            style={{ width: '100px', padding: '0.15rem 0.3rem', fontSize: '0.75rem' }}
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            <option value="all">📋 الكل</option>
            <option value="active">✅ نشط</option>
            <option value="cancelled">❌ ملغى</option>
            <option value="unpaid">⏳ غير مكتمل</option>
          </select>

          {/* الزبون */}
          <select
            className="form-control"
            style={{ width: '120px', padding: '0.15rem 0.3rem', fontSize: '0.75rem' }}
            value={filters.customerId}
            onChange={(e) => setFilters({ ...filters, customerId: e.target.value })}
          >
            <option value="">👤 الزبون</option>
            {(customers || []).map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* المادة */}
          <select
            className="form-control"
            style={{ width: '120px', padding: '0.15rem 0.3rem', fontSize: '0.75rem' }}
            value={filters.materialId}
            onChange={(e) => setFilters({ ...filters, materialId: e.target.value })}
          >
            <option value="">🧱 المادة</option>
            {(materials || []).map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>

          {/* السيارة */}
          <select
            className="form-control"
            style={{ width: '110px', padding: '0.15rem 0.3rem', fontSize: '0.75rem' }}
            value={filters.vehicleId}
            onChange={(e) => setFilters({ ...filters, vehicleId: e.target.value })}
          >
            <option value="">🚗 السيارة</option>
            {(vehicles || []).map(v => (
              <option key={v.id} value={v.id}>{v.plateNumber}</option>
            ))}
          </select>

          {/* المبلغ – من */}
          <input
            type="number"
            className="form-control"
            style={{ width: '70px', padding: '0.15rem 0.3rem', fontSize: '0.75rem' }}
            placeholder="من"
            value={filters.minAmount}
            onChange={(e) => setFilters({ ...filters, minAmount: e.target.value })}
          />
          <span style={{ fontSize: '0.7rem' }}>→</span>

          {/* المبلغ – إلى */}
          <input
            type="number"
            className="form-control"
            style={{ width: '70px', padding: '0.15rem 0.3rem', fontSize: '0.75rem' }}
            placeholder="إلى"
            value={filters.maxAmount}
            onChange={(e) => setFilters({ ...filters, maxAmount: e.target.value })}
          />

          {/* زر مسح الفلترة */}
          <button
            className="btn btn-outline btn-xs"
            onClick={clearFilters}
            style={{ padding: '0.1rem 0.5rem', fontSize: '0.7rem' }}
          >
            ✖ مسح
          </button>

          {/* زر تحديث */}
          <button
            className="btn btn-outline btn-xs"
            onClick={loadData}
            style={{ padding: '0.1rem 0.5rem', fontSize: '0.7rem' }}
          >
            🔄
          </button>

          {/* عدد النتائج */}
          <span style={{ fontSize: '0.7rem', color: 'var(--gray-500)', whiteSpace: 'nowrap' }}>
            📊 {filteredSales?.length || 0} من {sales?.length || 0}
          </span>
        </div>
      </div>

      {/* شريط الأدوات */}
      <div className="toolbar" style={{ marginBottom: '0.5rem' }}>
        <button className="btn btn-primary btn-sm" onClick={openAddModal}>💰 بيع جديد</button>
        <button className="btn btn-success btn-sm" onClick={openPaymentModal}>💵 دفعة جديدة</button>
        <div className="spacer"></div>
        <span className="text-muted" style={{ fontSize: '0.7rem' }}>
          {(sales || []).filter(s => s.status === 'active').length} مبيعات نشطة
        </span>
      </div>

      {/* إحصائيات سريعة */}
      <div className="stats-mini" style={{ marginBottom: '0.5rem', fontSize: '0.8rem' }}>
        <div className="stat-item">
          <div className="label">💰 إجمالي المبيعات</div>
          <div className="value">{sales?.length || 0}</div>
        </div>
        <div className="stat-item success">
          <div className="label">✅ النشطة</div>
          <div className="value">{(sales || []).filter(s => s.status === 'active').length}</div>
        </div>
        <div className="stat-item">
          <div className="label">📊 النتائج المفلترة</div>
          <div className="value">{filteredSales?.length || 0}</div>
        </div>
      </div>

      {/* جدول المبيعات */}
      <div className="card" style={{ padding: '0.25rem' }}>
        <div className="table-wrap" style={{ overflowX: 'auto', fontSize: '0.7rem' }}>
          <table style={{ fontSize: '0.7rem' }}>
            <thead>
              <tr>
                <th style={{ padding: '0.2rem 0.3rem' }}>#الفاتورة</th>
                <th style={{ padding: '0.2rem 0.3rem' }}>التاريخ</th>
                <th style={{ padding: '0.2rem 0.3rem' }}>الزبون</th>
                <th style={{ padding: '0.2rem 0.3rem' }}>المادة</th>
                <th style={{ padding: '0.2rem 0.3rem' }}>السيارة</th>
                <th style={{ padding: '0.2rem 0.3rem' }}>الكمية</th>
                <th style={{ padding: '0.2rem 0.3rem' }}>سعر الوحدة</th>
                <th style={{ padding: '0.2rem 0.3rem' }}>الإجمالي</th>
                <th style={{ padding: '0.2rem 0.3rem' }}>المدفوع</th>
                <th style={{ padding: '0.2rem 0.3rem' }}>المتبقي</th>
                <th style={{ padding: '0.2rem 0.3rem' }}>ملاحظات</th>
                <th style={{ padding: '0.2rem 0.3rem' }}>الحالة</th>
                <th style={{ padding: '0.2rem 0.3rem' }}>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="13" className="text-center" style={{ padding: '0.3rem' }}>⏳ جاري التحميل...</td></tr>
              ) : filteredSales.length === 0 ? (
                <tr><td colSpan="13" className="text-center" style={{ padding: '0.3rem' }}>
                  {Object.values(filters).some(f => f !== '' && f !== 'all') ? '🔍 لا توجد نتائج' : '📭 لا توجد مبيعات'}
                </td></tr>
              ) : (
                filteredSales.sort((a, b) => (b.saleDate || '').localeCompare(a.saleDate || '')).map(s => {
                  const bal = Number(s.totalAmount || 0) - Number(s.paidAmount || 0);
                  const isUnpaid = bal > 0.001 && s.status === 'active';
                  return (
                    <tr key={s.id} className={s.status === 'cancelled' ? 'status-cancelled' : ''}
                      style={isUnpaid ? { background: '#fee2e2' } : {}}>
                      <td style={{ padding: '0.2rem 0.3rem' }}><strong>{s.invoiceNumber || '#' + s.id}</strong></td>
                      <td style={{ padding: '0.2rem 0.3rem' }}>{formatDate(s.saleDate)}</td>
                      <td style={{ padding: '0.2rem 0.3rem' }}>{getCustomerName(s.customerId)}</td>
                      <td style={{ padding: '0.2rem 0.3rem' }}>{getMaterialName(s.materialId)}</td>
                      <td style={{ padding: '0.2rem 0.3rem' }}>{getVehiclePlate(s.vehicleId)}</td>
                      <td style={{ padding: '0.2rem 0.3rem' }}>{s.quantity || 0}</td>
                      <td style={{ padding: '0.2rem 0.3rem' }}>{formatCurrency(s.pricePerUnit, settings?.currency || 'ل.س')}</td>
                      <td style={{ padding: '0.2rem 0.3rem' }}>{formatCurrency(s.totalAmount, settings?.currency || 'ل.س')}</td>
                      <td style={{ padding: '0.2rem 0.3rem' }}>{formatCurrency(s.paidAmount, settings?.currency || 'ل.س')}</td>
                      <td style={{ padding: '0.2rem 0.3rem', color: bal > 0.001 ? '#dc2626' : '#059669', fontWeight: 'bold' }}>
                        {formatCurrency(bal, settings?.currency || 'ل.س')}
                      </td>
                      <td style={{ padding: '0.2rem 0.3rem', maxWidth: '80px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {s.notes || '-'}
                      </td>
                      <td style={{ padding: '0.2rem 0.3rem' }}>
                        <span className={`badge-status ${s.status === 'active' ? (isUnpaid ? 'badge-warning' : 'badge-success') : 'badge-danger'}`} style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem' }}>
                          {s.status === 'active' ? (isUnpaid ? '⏳ غير مكتملة' : '✅ مدفوعة') : '❌ ملغى'}
                        </span>
                      </td>
                      <td style={{ padding: '0.2rem 0.3rem' }}>
                        {s.status === 'active' && (
                          <>
                            <button className="btn btn-primary btn-xs" onClick={() => printInvoice(s)} title="طباعة" style={{ padding: '0.05rem 0.3rem', fontSize: '0.6rem' }}>🖨️</button>
                            <button className="btn btn-danger btn-xs" onClick={() => handleCancelSale(s.id)} title="إلغاء" style={{ padding: '0.05rem 0.3rem', fontSize: '0.6rem' }}>❌</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ============================================================ */}
      {/* Modal البيع */}
      {/* ============================================================ */}
      {showModal && (
        <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget && !isSubmitting) closeModal(); }}>
          <div className="modal-box" style={{ maxWidth: '850px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <h3>{editingSale ? '✏️ تعديل بيع' : '💰 بيع جديد'}</h3>
              <button className="modal-close" onClick={closeModal} disabled={isSubmitting}>✕</button>
            </div>
            <div className="modal-body">
              {/* ===== الزبون ===== */}
              <div className="form-group">
                <label>الزبون <span className="required">*</span></label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <select
                    className={`form-control ${errors.customerId ? 'is-invalid' : ''}`}
                    value={formData.customerId}
                    onChange={(e) => {
                      setFormData({ ...formData, customerId: e.target.value, vehicleId: '' });
                      if (errors.customerId) setErrors({ ...errors, customerId: '' });
                    }}
                    disabled={isSubmitting}
                    style={{ flex: 1 }}
                  >
                    <option value="">-- اختر زبون --</option>
                    {(customers || []).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowQuickCustomer(true)} disabled={isSubmitting}>➕ جديد</button>
                </div>
                {errors.customerId && <div className="error-text">{errors.customerId}</div>}
                {showQuickCustomer && (
                  <div style={{ marginTop: '0.5rem', padding: '0.5rem', border: '1px solid var(--gray-300)', borderRadius: 'var(--radius)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <input className="form-control" placeholder="الاسم *" value={quickAdd.customer.name}
                        onChange={(e) => setQuickAdd(prev => ({ ...prev, customer: { ...prev.customer, name: e.target.value } }))} />
                      <input className="form-control" placeholder="الهاتف" value={quickAdd.customer.phone}
                        onChange={(e) => setQuickAdd(prev => ({ ...prev, customer: { ...prev.customer, phone: e.target.value } }))} />
                      <input className="form-control" placeholder="العنوان" value={quickAdd.customer.address}
                        onChange={(e) => setQuickAdd(prev => ({ ...prev, customer: { ...prev.customer, address: e.target.value } }))} />
                    </div>
                    <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-success btn-sm" onClick={handleQuickAddCustomer} disabled={isSubmitting}>💾 إضافة</button>
                      <button className="btn btn-outline btn-sm" onClick={() => setShowQuickCustomer(false)}>إلغاء</button>
                    </div>
                  </div>
                )}
              </div>

              {/* ===== السيارة ===== */}
              <div className="form-group">
                <label>السيارة <span className="required">*</span></label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <select
                    className={`form-control ${errors.vehicleId ? 'is-invalid' : ''}`}
                    value={formData.vehicleId}
                    onChange={(e) => {
                      setFormData({ ...formData, vehicleId: e.target.value });
                      if (errors.vehicleId) setErrors({ ...errors, vehicleId: '' });
                    }}
                    disabled={isSubmitting || !formData.customerId}
                    style={{ flex: 1 }}
                  >
                    <option value="">-- اختر سيارة --</option>
                    {(filteredVehicles || []).length === 0 ? (
                      <option value="" disabled>⚠️ لا توجد سيارات لهذا الزبون</option>
                    ) : (
                      (filteredVehicles || []).map(v => (
                        <option key={v.id} value={v.id}>🚗 {v.plateNumber} {v.type ? `(${v.type})` : ''}</option>
                      ))
                    )}
                  </select>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowQuickVehicle(true)} disabled={isSubmitting || !formData.customerId}>➕ جديد</button>
                </div>
                {errors.vehicleId && <div className="error-text">{errors.vehicleId}</div>}
                {!formData.customerId && <div className="helper-text">⚠️ اختر زبون أولاً لإضافة سيارة</div>}
                {showQuickVehicle && (
                  <div style={{ marginTop: '0.5rem', padding: '0.5rem', border: '1px solid var(--gray-300)', borderRadius: 'var(--radius)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <input className="form-control" placeholder="رقم اللوحة *" value={quickAdd.vehicle.plateNumber}
                        onChange={(e) => setQuickAdd(prev => ({ ...prev, vehicle: { ...prev.vehicle, plateNumber: e.target.value } }))} />
                      <input className="form-control" placeholder="النوع" value={quickAdd.vehicle.type}
                        onChange={(e) => setQuickAdd(prev => ({ ...prev, vehicle: { ...prev.vehicle, type: e.target.value } }))} />
                    </div>
                    <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-success btn-sm" onClick={handleQuickAddVehicle} disabled={isSubmitting}>💾 إضافة</button>
                      <button className="btn btn-outline btn-sm" onClick={() => setShowQuickVehicle(false)}>إلغاء</button>
                    </div>
                  </div>
                )}
              </div>

              {/* ===== المادة ===== */}
              <div className="form-group">
                <label>المادة <span className="required">*</span></label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <select
                    className={`form-control ${errors.materialId ? 'is-invalid' : ''}`}
                    value={formData.materialId}
                    onChange={(e) => {
                      const mid = parseInt(e.target.value);
                      const material = (materials || []).find(m => m.id === mid);
                      setFormData({ ...formData, materialId: mid, pricePerUnit: material?.price || 0 });
                      if (errors.materialId) setErrors({ ...errors, materialId: '' });
                      if (errors.stock) setErrors({ ...errors, stock: '' });
                    }}
                    disabled={isSubmitting}
                    style={{ flex: 1 }}
                  >
                    <option value="">-- اختر مادة --</option>
                    {(materials || []).map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} (المخزون: {m.currentQuantity || 0} {m.unit || ''})
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowQuickMaterial(true)} disabled={isSubmitting}>➕ جديد</button>
                </div>
                {errors.materialId && <div className="error-text">{errors.materialId}</div>}
                {errors.stock && <div className="error-text text-danger">{errors.stock}</div>}
             {showQuickMaterial && (
  <div style={{ marginTop: '0.5rem', padding: '0.75rem', border: '1px solid var(--gray-300)', borderRadius: 'var(--radius)', background: 'var(--gray-50)' }}>
    <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '0.9rem' }}>➕ إضافة مادة جديدة</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
      {/* الاسم */}
      <div>
        <label style={{ fontSize: '0.75rem', color: 'var(--gray-600)' }}>الاسم <span style={{ color: 'red' }}>*</span></label>
        <input className="form-control" placeholder="مثال: أسمنت" value={quickAdd.material.name}
          onChange={(e) => setQuickAdd(prev => ({ ...prev, material: { ...prev.material, name: e.target.value } }))} />
      </div>
      {/* التصنيف */}
      <div>
        <label style={{ fontSize: '0.75rem', color: 'var(--gray-600)' }}>التصنيف</label>
        <input className="form-control" placeholder="مثال: بناء" value={quickAdd.material.category}
          onChange={(e) => setQuickAdd(prev => ({ ...prev, material: { ...prev.material, category: e.target.value } }))} />
      </div>
      {/* الوحدة */}
      <div>
        <label style={{ fontSize: '0.75rem', color: 'var(--gray-600)' }}>الوحدة</label>
        <input className="form-control" placeholder="طن، كيس، متر..." value={quickAdd.material.unit}
          onChange={(e) => setQuickAdd(prev => ({ ...prev, material: { ...prev.material, unit: e.target.value } }))} />
      </div>
      {/* السعر */}
      <div>
        <label style={{ fontSize: '0.75rem', color: 'var(--gray-600)' }}>السعر <span style={{ color: 'red' }}>*</span></label>
        <input className="form-control" type="number" step="0.01" min="0" placeholder="مثال: 5000" value={quickAdd.material.price}
          onChange={(e) => setQuickAdd(prev => ({ ...prev, material: { ...prev.material, price: parseFloat(e.target.value) || 0 } }))} />
      </div>
      {/* الكمية الأولية */}
      <div>
        <label style={{ fontSize: '0.75rem', color: 'var(--gray-600)' }}>الكمية الأولية</label>
        <input className="form-control" type="number" step="0.01" min="0" placeholder="المخزون الابتدائي" value={quickAdd.material.currentQuantity}
          onChange={(e) => setQuickAdd(prev => ({ ...prev, material: { ...prev.material, currentQuantity: parseFloat(e.target.value) || 0 } }))} />
      </div>
      {/* الحد الأدنى */}
      <div>
        <label style={{ fontSize: '0.75rem', color: 'var(--gray-600)' }}>الحد الأدنى للمخزون</label>
        <input className="form-control" type="number" step="0.01" min="0" placeholder="مثال: 10" value={quickAdd.material.minStock}
          onChange={(e) => setQuickAdd(prev => ({ ...prev, material: { ...prev.material, minStock: parseFloat(e.target.value) || 0 } }))} />
      </div>
    </div>
    <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
      <button className="btn btn-success btn-sm" onClick={handleQuickAddMaterial} disabled={isSubmitting}>💾 إضافة</button>
      <button className="btn btn-outline btn-sm" onClick={() => { setShowQuickMaterial(false); setQuickAdd(prev => ({ ...prev, material: { name: '', category: '', unit: '', price: 0, currentQuantity: 0, minStock: 0 } })); }}>إلغاء</button>
    </div>
    <div style={{ fontSize: '0.7rem', color: 'var(--gray-500)', marginTop: '0.25rem' }}>
      <span style={{ color: 'red' }}>*</span> الحقول الإجبارية.
    </div>
  </div>
)}
              </div>

              {/* ===== الكمية والسعر ===== */}
              <div className="form-row">
                <div className="form-group">
                  <label>الكمية <span className="required">*</span></label>
                  <input className={`form-control ${errors.quantity ? 'is-invalid' : ''}`} type="number" step="0.01" min="0.01"
                    value={formData.quantity} onChange={(e) => { setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 }); if (errors.quantity) setErrors({ ...errors, quantity: '' }); }} disabled={isSubmitting} />
                  {errors.quantity && <div className="error-text">{errors.quantity}</div>}
                </div>
                <div className="form-group">
                  <label>سعر الوحدة <span className="required">*</span></label>
                  <input className={`form-control ${errors.pricePerUnit ? 'is-invalid' : ''}`} type="number" step="0.01" min="0.01"
                    value={formData.pricePerUnit} onChange={(e) => { setFormData({ ...formData, pricePerUnit: parseFloat(e.target.value) || 0 }); if (errors.pricePerUnit) setErrors({ ...errors, pricePerUnit: '' }); }} disabled={isSubmitting} />
                  {errors.pricePerUnit && <div className="error-text">{errors.pricePerUnit}</div>}
                </div>
              </div>

              {/* ===== الإجمالي والدفع ===== */}
              <div style={{ background: total > 0 ? 'var(--primary-50)' : 'var(--gray-50)', padding: '0.5rem', borderRadius: 'var(--radius)', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1rem' }}>
                  <span>💰 الإجمالي:</span><span>{formatCurrency(total, settings?.currency || 'ل.س')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.3rem' }}>
                  <span>💵 المدفوع:</span>
                  <input className={`form-control ${errors.paidAmount ? 'is-invalid' : ''}`} style={{ width: '150px', display: 'inline-block' }}
                    type="number" step="0.01" min="0" value={formData.paidAmount}
                    onChange={(e) => { setFormData({ ...formData, paidAmount: parseFloat(e.target.value) || 0 }); if (errors.paidAmount) setErrors({ ...errors, paidAmount: '' }); }} disabled={isSubmitting} />
                </div>
                {errors.paidAmount && <div className="error-text">{errors.paidAmount}</div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '1rem', marginTop: '0.3rem', paddingTop: '0.3rem', borderTop: '1px solid var(--gray-200)', color: remaining > 0.001 ? 'var(--danger-600)' : 'var(--success)' }}>
                  <span>📋 المتبقي:</span><span>{formatCurrency(remaining, settings?.currency || 'ل.س')}</span>
                </div>
              </div>

              {/* ===== ملاحظات ===== */}
              <div className="form-group">
                <label>ملاحظات</label>
                <textarea className="form-control" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows="2" placeholder="ملاحظات إضافية" disabled={isSubmitting} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={closeModal} disabled={isSubmitting}>إلغاء</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={isSubmitting || remaining < 0 || filteredVehicles.length === 0}>
                {isSubmitting ? '⏳ جاري الحفظ...' : editingSale ? '💾 تحديث' : '💾 حفظ البيع'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* Modal الدفعة الجديدة */}
      {/* ============================================================ */}
      {showPaymentModal && (
        <div className="modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget && !paymentSubmitting) closePaymentModal(); }}>
          <div className="modal-box" style={{ maxWidth: '700px' }}>
            <div className="modal-header">
              <h3>💵 دفعة جديدة</h3>
              <button className="modal-close" onClick={closePaymentModal} disabled={paymentSubmitting}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>الزبون <span className="required">*</span></label>
                <CustomerSearch
                  customers={customers}
                  onSelect={handlePaymentCustomerSelect}
                  selectedCustomer={selectedPaymentCustomer}
                  placeholder="ابحث عن زبون..."
                  required={true}
                />
                {paymentErrors.customerId && <div className="error-text">{paymentErrors.customerId}</div>}
              </div>

              {customerDebtDetails && (
                <div style={{ 
                  background: customerDebtDetails.remaining > 0.001 ? '#fef2f2' : '#d1fae5',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius)',
                  marginBottom: '0.75rem',
                  border: `1px solid ${customerDebtDetails.remaining > 0.001 ? '#fca5a5' : '#6ee7b7'}`
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '0.3rem' }}>
                    📋 تفاصيل ديون {selectedPaymentCustomer?.name}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', fontSize: '0.9rem' }}>
                    <div><strong>إجمالي المشتريات:</strong> {formatCurrency(customerDebtDetails.totalSales, settings?.currency || 'ل.س')}</div>
                    <div><strong>المدفوع:</strong> {formatCurrency(customerDebtDetails.totalPaid, settings?.currency || 'ل.س')}</div>
                    <div style={{ color: customerDebtDetails.remaining > 0.001 ? '#dc2626' : '#059669', fontWeight: 'bold' }}>
                      <strong>المتبقي:</strong> {formatCurrency(customerDebtDetails.remaining, settings?.currency || 'ل.س')}
                    </div>
                  </div>
                  {customerDebtDetails.unpaidInvoices.length > 0 && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '0.2rem' }}>📄 الفواتير غير المكتملة:</div>
                      <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                            <th style={{ textAlign: 'right', padding: '0.2rem 0.3rem' }}>رقم الفاتورة</th>
                            <th style={{ textAlign: 'right', padding: '0.2rem 0.3rem' }}>التاريخ</th>
                            <th style={{ textAlign: 'right', padding: '0.2rem 0.3rem' }}>المبلغ</th>
                            <th style={{ textAlign: 'right', padding: '0.2rem 0.3rem' }}>المدفوع</th>
                            <th style={{ textAlign: 'right', padding: '0.2rem 0.3rem' }}>المتبقي</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customerDebtDetails.unpaidInvoices.map((inv, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                              <td style={{ padding: '0.2rem 0.3rem' }}>{inv.invoiceNumber}</td>
                              <td style={{ padding: '0.2rem 0.3rem' }}>{formatDate(inv.date)}</td>
                              <td style={{ padding: '0.2rem 0.3rem' }}>{formatCurrency(inv.total, settings?.currency || 'ل.س')}</td>
                              <td style={{ padding: '0.2rem 0.3rem' }}>{formatCurrency(inv.paid, settings?.currency || 'ل.س')}</td>
                              <td style={{ padding: '0.2rem 0.3rem', color: '#dc2626', fontWeight: 'bold' }}>{formatCurrency(inv.remaining, settings?.currency || 'ل.س')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

            <div className="form-group">
  <label>المبلغ <span className="required">*</span></label>
  <input 
    className={`form-control no-spinner ${paymentErrors.amount ? 'is-invalid' : ''}`}
    type="number" 
    step="0.0" 
    min="0.0"
    value={paymentForm.amount}
    onChange={(e) => { 
      const val = parseFloat(e.target.value) || 0;
      setPaymentForm({ ...paymentForm, amount: val });
      if (paymentErrors.amount) setPaymentErrors({ ...paymentErrors, amount: '' });
    }}
    disabled={paymentSubmitting} 
    placeholder="أدخل المبلغ" 
  />
  {paymentErrors.amount && <div className="error-text">{paymentErrors.amount}</div>}
  {customerDebtDetails && customerDebtDetails.remaining > 0.001 && (
    <div className="helper-text" style={{ color: 'var(--gray-500)' }}>
      💡 الحد الأقصى للدفع: {formatCurrency(customerDebtDetails.remaining, settings?.currency || 'ل.س')}
    </div>
  )}
</div>
              <div className="form-group">
                <label>طريقة الدفع</label>
                <select className="form-control" value={paymentForm.method}
                  onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })} disabled={paymentSubmitting}>
                  <option value="نقدي">💰 نقدي</option>
                  <option value="تحويل بنكي">🏦 تحويل بنكي</option>
                  <option value="شيك">📄 شيك</option>
                  <option value="بطاقة">💳 بطاقة</option>
                </select>
              </div>

              <div className="form-group">
                <label>تاريخ الدفع</label>
                <input className="form-control" type="date" value={paymentForm.paymentDate}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} disabled={paymentSubmitting} />
              </div>

              <div className="form-group">
                <label>ملاحظات</label>
                <textarea className="form-control" value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  rows="2" placeholder="ملاحظات إضافية" disabled={paymentSubmitting} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={closePaymentModal} disabled={paymentSubmitting}>إلغاء</button>
              <button className="btn btn-success" onClick={handlePaymentSubmit} disabled={paymentSubmitting || !customerDebtDetails || customerDebtDetails.remaining <= 0.001}>
                {paymentSubmitting ? '⏳ جاري الحفظ...' : '💾 تسجيل الدفعة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Sales;