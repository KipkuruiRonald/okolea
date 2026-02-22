// Validation utility functions for the Okoleo Loan App

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
}

// Profile Validation
export function validateProfile(data: {
  full_name?: string;
  email?: string;
  phone?: string;
  national_id?: string;
}): ValidationResult {
  const errors: Record<string, string> = {};

  // Full Name validation
  if (!data.full_name || data.full_name.trim() === '') {
    errors.full_name = 'Name is required';
  } else if (data.full_name.trim().length < 2) {
    errors.full_name = 'Name must be at least 2 characters';
  } else if (data.full_name.trim().length > 50) {
    errors.full_name = 'Name must be less than 50 characters';
  } else if (!/^[A-Za-z\s]+$/.test(data.full_name.trim())) {
    errors.full_name = 'Name can only contain letters and spaces';
  }

  // Email validation
  if (!data.email || data.email.trim() === '') {
    errors.email = 'Email is required';
  } else if (!/^\S+@\S+\.\S+$/.test(data.email.trim())) {
    errors.email = 'Invalid email format';
  }

  // Phone validation (Kenyan format)
  if (!data.phone || data.phone.trim() === '') {
    errors.phone = 'Phone number is required';
  } else if (!/^(?:\+254|0)[17]\d{8}$/.test(data.phone.replace(/\s/g, ''))) {
    errors.phone = 'Please enter a valid phone number';
  }

  // National ID validation (Kenyan ID - 7-8 digits)
  if (!data.national_id || data.national_id.trim() === '') {
    errors.national_id = 'National ID is required';
  } else if (!/^\d{7,8}$/.test(data.national_id.trim())) {
    errors.national_id = 'National ID must be 7-8 digits';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

// Security (Password) Validation
export function validatePasswordChange(data: {
  current_password?: string;
  new_password?: string;
  confirm_password?: string;
}): ValidationResult {
  const errors: Record<string, string> = {};

  // Current Password
  if (!data.current_password || data.current_password === '') {
    errors.current_password = 'Current password is required';
  }

  // New Password
  if (!data.new_password || data.new_password === '') {
    errors.new_password = 'New password is required';
  } else {
    if (data.new_password.length < 8) {
      errors.new_password = 'Password must be at least 8 characters';
    }
    if (!/\d/.test(data.new_password)) {
      errors.new_password = 'Password must contain at least one number';
    }
    if (!/[A-Z]/.test(data.new_password)) {
      errors.new_password = 'Password must contain at least one uppercase letter';
    }
    // Check if same as current
    if (data.current_password && data.new_password === data.current_password) {
      errors.new_password = 'New password must be different from current password';
    }
  }

  // Confirm Password
  if (!data.confirm_password || data.confirm_password === '') {
    errors.confirm_password = 'Please confirm your password';
  } else if (data.new_password !== data.confirm_password) {
    errors.confirm_password = 'Passwords do not match';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

// Loan Application Validation
export function validateLoanApplication(data: {
  amount?: number | string;
  purpose?: string;
  creditLimit?: number;
}): ValidationResult {
  const errors: Record<string, string> = {};
  const amount = typeof data.amount === 'string' ? parseFloat(data.amount) : data.amount;
  const creditLimit = data.creditLimit || 1000;

  // Amount validation
  if (!amount || isNaN(amount)) {
    errors.amount = 'Amount is required';
  } else {
    // For new users, only allow 500 or 1000
    if (amount !== 500 && amount !== 1000) {
      errors.amount = 'Amount must be KSh 500 or KSh 1,000 for new users';
    }
    if (amount > creditLimit) {
      errors.amount = `Amount cannot exceed your credit limit of KSh ${creditLimit.toLocaleString()}`;
    }
    if (amount < 500) {
      errors.amount = 'Minimum loan amount is KSh 500';
    }
  }

  // Purpose validation
  if (!data.purpose || data.purpose.trim() === '') {
    errors.purpose = 'Purpose is required';
  } else if (data.purpose.trim().length < 3) {
    errors.purpose = 'Purpose must be at least 3 characters';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

// Admin Loan Settings Validation
export function validateLoanSettings(data: {
  interest_rate?: number | string;
  penalty_rate?: number | string;
  term_days?: number | string;
}): ValidationResult {
  const errors: Record<string, string> = {};

  // Interest Rate
  const interestRate = typeof data.interest_rate === 'string' ? parseFloat(data.interest_rate) : data.interest_rate;
  if (interestRate === undefined || interestRate === null || isNaN(interestRate)) {
    errors.interest_rate = 'Interest rate is required';
  } else if (interestRate < 1 || interestRate > 10) {
    errors.interest_rate = 'Interest rate must be between 1% and 10%';
  } else if (!/^\d+(\.\d{1,2})?$/.test(String(interestRate))) {
    errors.interest_rate = 'Interest rate can have max 2 decimal places';
  }

  // Penalty Rate
  const penaltyRate = typeof data.penalty_rate === 'string' ? parseFloat(data.penalty_rate) : data.penalty_rate;
  if (penaltyRate === undefined || penaltyRate === null || isNaN(penaltyRate)) {
    errors.penalty_rate = 'Penalty rate is required';
  } else if (penaltyRate < 1 || penaltyRate > 10) {
    errors.penalty_rate = 'Penalty rate must be between 1% and 10%';
  } else if (!/^\d+(\.\d{1,2})?$/.test(String(penaltyRate))) {
    errors.penalty_rate = 'Penalty rate can have max 2 decimal places';
  }

  // Term Days
  const termDays = typeof data.term_days === 'string' ? parseInt(data.term_days) : data.term_days;
  if (termDays === undefined || termDays === null || isNaN(termDays)) {
    errors.term_days = 'Term days is required';
  } else if (!Number.isInteger(termDays)) {
    errors.term_days = 'Term days must be a whole number';
  } else if (termDays < 7 || termDays > 30) {
    errors.term_days = 'Term days must be between 7 and 30 days';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

// Email validation helper
export function isValidEmail(email: string): boolean {
  return /^\S+@\S+\.\S+$/.test(email.trim());
}

// Phone validation helper (Kenyan)
export function isValidKenyanPhone(phone: string): boolean {
  return /^(?:\+254|0)[17]\d{8}$/.test(phone.replace(/\s/g, ''));
}

// Password strength checker
export function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
} {
  let score = 0;
  
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 2) return { score, label: 'Weak', color: 'red' };
  if (score <= 4) return { score, label: 'Medium', color: 'yellow' };
  return { score, label: 'Strong', color: 'green' };
}

// Full Name validation (for apply form)
export function validateFullName(name: string): string | null {
  if (!name || name.trim() === '') {
    return 'Full name is required';
  }
  if (name.trim().length < 2) {
    return 'Full name must be at least 2 characters';
  }
  if (name.trim().length > 50) {
    return 'Full name must be less than 50 characters';
  }
  if (!/^[A-Za-z\s]+$/.test(name.trim())) {
    return 'Full name can only contain letters and spaces';
  }
  return null;
}

// ID Number validation (Kenyan ID)
export function validateIdNumber(id: string): string | null {
  if (!id || id.trim() === '') {
    return 'ID number is required';
  }
  if (!/^\d{7,8}$/.test(id.trim())) {
    return 'ID number must be 7-8 digits';
  }
  return null;
}

// Phone Number validation (Kenyan)
export function validatePhoneNumber(phone: string): string | null {
  if (!phone || phone.trim() === '') {
    return 'Phone number is required';
  }
  if (!/^(?:\+254|0)[17]\d{8}$/.test(phone.replace(/\s/g, ''))) {
    return 'Please enter a valid phone number';
  }
  return null;
}

// Monthly Income validation
export function validateMonthlyIncome(income: string): string | null {
  if (!income || income.trim() === '') {
    return 'Monthly income is required';
  }
  const numIncome = parseFloat(income);
  if (isNaN(numIncome) || numIncome < 0) {
    return 'Please enter a valid income amount';
  }
  return null;
}

// Employment Status validation
export function validateEmploymentStatus(status: string): string | null {
  if (!status || status.trim() === '') {
    return 'Employment status is required';
  }
  return null;
}

// Loan Purpose validation
export function validateLoanPurpose(purpose: string): string | null {
  if (!purpose || purpose.trim() === '') {
    return 'Loan purpose is required';
  }
  if (purpose.trim().length < 3) {
    return 'Purpose must be at least 3 characters';
  }
  return null;
}

// Terms Accepted validation
export function validateTermsAccepted(accepted: boolean): string | null {
  if (!accepted) {
    return 'You must accept the terms and conditions';
  }
  return null;
}

// Required field validation
export function validateRequired(value: string, fieldName: string): string | null {
  if (!value || value.trim() === '') {
    return `${fieldName} is required`;
  }
  return null;
}

// Amount validation for payments (minimum KSh 100)
export function validateAmount(amount: string, minAmount: number = 100): string | null {
  if (!amount || amount.trim() === '') {
    return 'Amount is required';
  }
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return 'Please enter a valid amount';
  }
  if (numAmount < minAmount) {
    return `Minimum amount is KSh ${minAmount.toLocaleString()}`;
  }
  return null;
}

// Card Number validation (basic)
export function validateCardNumber(cardNumber: string): string | null {
  if (!cardNumber || cardNumber.trim() === '') {
    return 'Card number is required';
  }
  const cleanNumber = cardNumber.replace(/\s/g, '');
  if (!/^\d{16}$/.test(cleanNumber)) {
    return 'Card number must be 16 digits';
  }
  return null;
}

// Card Expiry validation
export function validateCardExpiry(expiry: string): string | null {
  if (!expiry || expiry.trim() === '') {
    return 'Expiry date is required';
  }
  if (!/^\d{2}\/\d{2}$/.test(expiry)) {
    return 'Use format MM/YY';
  }
  return null;
}

// CVV validation
export function validateCvv(cvv: string): string | null {
  if (!cvv || cvv.trim() === '') {
    return 'CVV is required';
  }
  if (!/^\d{3,4}$/.test(cvv)) {
    return 'CVV must be 3-4 digits';
  }
  return null;
}

// Loan ID validation
export function validateLoanId(loanId: string): string | null {
  if (!loanId || loanId.trim() === '') {
    return 'Loan ID is required';
  }
  return null;
}
