export const isValidPhone = (phone) => {
  if (!phone) return true
  const clean = phone.replace(/[\s\-]/g, '')
  return /^\d{10}$/.test(clean) && /^(05|5)/.test(clean)
}

export const isValidEmail = (email) => {
  if (!email) return true
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export const isPositiveNumber = (value) => {
  return value !== undefined && value !== null && Number(value) > 0
}

export const isNonNegativeNumber = (value) => {
  return value !== undefined && value !== null && Number(value) >= 0
}