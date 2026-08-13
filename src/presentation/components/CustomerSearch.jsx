import React, { useState, useEffect, useRef } from 'react';
import { Validators } from '../../core/validation';

function CustomerSearch({ 
  customers = [], 
  onSelect, 
  placeholder = 'ابحث عن زبون...',
  selectedCustomer = null,
  required = false,
  className = ''
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(selectedCustomer);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const searchTimeout = useRef(null);

  // تحديث الحقل عند تغيير الزبون المحدد من الخارج
  useEffect(() => {
    if (selectedCustomer) {
      setSelected(selectedCustomer);
      setQuery(selectedCustomer.name);
    } else {
      setSelected(null);
      setQuery('');
    }
  }, [selectedCustomer]);

  // إغلاق القائمة عند النقر خارج المكون
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // البحث مع تأخير (Debounce)
  const handleSearch = (value) => {
    setQuery(value);
    
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }
    
    if (!value || value.trim() === '') {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }
    
    setLoading(true);
    
    searchTimeout.current = setTimeout(() => {
      const results = Validators.searchCustomers(customers, value, 20);
      setSuggestions(results);
      setIsOpen(results.length > 0);
      setLoading(false);
    }, 300);
  };

  // اختيار زبون
  const handleSelect = (customer) => {
    setSelected(customer);
    setQuery(customer.name);
    setIsOpen(false);
    setSuggestions([]);
    
    if (onSelect) {
      onSelect(customer);
    }
  };

  // إلغاء التحديد
  const handleClear = () => {
    setSelected(null);
    setQuery('');
    setIsOpen(false);
    setSuggestions([]);
    
    if (onSelect) {
      onSelect(null);
    }
  };

  // التركيز على الحقل
  const handleFocus = () => {
    if (query && query.trim() !== '' && suggestions.length > 0) {
      setIsOpen(true);
    }
  };

  // لوحة المفاتيح
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.blur();
    }
    if (e.key === 'Enter' && suggestions.length > 0) {
      handleSelect(suggestions[0]);
    }
  };

  return (
    <div className={`customer-search ${className}`} ref={wrapperRef}>
      <div className="customer-search-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          className={`form-control ${required && !selected ? 'is-invalid' : ''}`}
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
        />
        {selected && (
          <button 
            className="customer-search-clear" 
            onClick={handleClear}
            type="button"
            title="إلغاء التحديد"
          >
            ✕
          </button>
        )}
        {loading && (
          <span className="customer-search-loading">
            <span className="spinner-small"></span>
          </span>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="customer-search-suggestions">
          {suggestions.map(customer => (
            <div
              key={customer.id}
              className="customer-search-item"
              onClick={() => handleSelect(customer)}
            >
              <div className="customer-search-item-name">
                <strong>{customer.name}</strong>
                {customer.phone && (
                  <span className="customer-search-item-phone">📱 {customer.phone}</span>
                )}
              </div>
              {customer.address && (
                <div className="customer-search-item-address">
                  📍 {customer.address}
                </div>
              )}
            </div>
          ))}
          {suggestions.length >= 20 && (
            <div className="customer-search-more">
              ... هناك المزيد من النتائج ({customers.length} زبون)
            </div>
          )}
        </div>
      )}

      {selected && (
        <div className="customer-search-selected">
          <span className="badge-status badge-success">
            ✅ {selected.name} {selected.phone && `📱 ${selected.phone}`}
          </span>
        </div>
      )}
    </div>
  );
}

export default CustomerSearch;