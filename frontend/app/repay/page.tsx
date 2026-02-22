'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  DollarSign, 
  Calendar, 
  CheckCircle, 
  Clock,
  Smartphone,
  CreditCard,
  Shield,
  Loader2
} from 'lucide-react';
import { loansApi, transactionsApi } from '@/lib/api';
import { useAuth, isAdmin } from '@/context/AuthContext';
import {  
  validateRequired,
  validatePhoneNumber, 
  validateCardNumber, 
  validateCardExpiry, 
  validateCvv, 
  validateAmount,
  validateLoanId 
} from '@/lib/validation';
import { maskPhoneNumber } from '@/lib/utils';

type PaymentMethod = 'mpesa' | 'card';

// Payment response type
interface PaymentResponse {
  success: boolean;
  transaction_id?: string;
  phone_number?: string;
  amount?: number;
  timestamp?: string;
  confirmation_code?: string;
  message?: string;
}

interface RepaymentFormData {
  loanId: string;
  confirmedPhone: string;
  amount: string;
  paymentMethod: PaymentMethod;
  phoneNumber: string;
  cardNumber: string;
  cardExpiry: string;
  cardCvv: string;
}

export default function RepayPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  // Redirect admins to admin dashboard, redirect unauthenticated to login
  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
    } else if (user && isAdmin(user)) {
      router.replace('/admin');
    }
  }, [isAuthenticated, user, router]);

  const [paymentStep, setPaymentStep] = useState<'form' | 'processing' | 'success'>('form');
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentResponse, setPaymentResponse] = useState<PaymentResponse | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [justPaid, setJustPaid] = useState(false);
  
  const [formData, setFormData] = useState<RepaymentFormData>({
    loanId: '',
    confirmedPhone: '',
    amount: '',
    paymentMethod: 'mpesa',
    phoneNumber: '',
    cardNumber: '',
    cardExpiry: '',
    cardCvv: ''
  });

  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
  const [selectedLoanOutstanding, setSelectedLoanOutstanding] = useState<number>(0);
  const [selectedLoanPhone, setSelectedLoanPhone] = useState<string>('');

  // Fetch loans from API
  useEffect(() => {
    const fetchLoans = async () => {
      try {
        const response = await loansApi.getAll();
        // Filter for active loans only
        const activeLoans = Array.isArray(response) 
          ? response.filter((loan: any) => loan.status === 'ACTIVE')
          : response.items?.filter((loan: any) => loan.status === 'ACTIVE') || [];
        setLoans(activeLoans);
      } catch (error) {
        console.error('Failed to fetch loans:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchLoans();
  }, []);

  // Fetch payment history
  useEffect(() => {
    const fetchPaymentHistory = async () => {
      try {
        const response = await transactionsApi.getRecent(0, 10);
        const history = response.items || response || [];
        // Filter for REPAYMENT transactions only
        const repayments = Array.isArray(history) 
          ? history.filter((tx: any) => tx.type === 'REPAYMENT')
          : [];
        setPaymentHistory(repayments);
      } catch (error) {
        console.error('Failed to fetch payment history:', error);
      }
    };
    fetchPaymentHistory();
  }, []);

  // Calculate summary from real data
  const summary = {
    totalOutstanding: loans.reduce((sum, loan) => sum + (loan.outstanding_balance ?? loan.current_outstanding ?? loan.total_due ?? 0), 0),
    nextPayment: loans.length > 0 ? (loans[0].outstanding_balance ?? loans[0].current_outstanding ?? loans[0].total_due ?? 0) : 0,
    nextDueDate: loans.length > 0 ? loans[0].due_date : null
  };

  const formatCurrency = (amount: number | undefined) => {
    return `KSh ${(amount || 0).toLocaleString()}`;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Update outstanding balance and phone when loan is selected
    if (name === 'loanId') {
      const selectedLoan = loans.find((l: any) => l.loan_id === value);
      if (selectedLoan) {
        // Use outstanding_balance from backend (calculated from transactions)
        setSelectedLoanOutstanding(selectedLoan.outstanding_balance ?? selectedLoan.current_outstanding ?? selectedLoan.total_due ?? 0);
        setSelectedLoanPhone(selectedLoan.phone_number || '');
      } else {
        setSelectedLoanOutstanding(0);
        setSelectedLoanPhone('');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);
    
    // First validate amount against outstanding balance
    const balanceError = validateAgainstBalance(formData.amount, formData.loanId);
    if (balanceError) {
      setFieldErrors({ amount: balanceError });
      return;
    }
    
    // Validate form fields
    const errors: Record<string, string> = {};
    const loanIdError = validateLoanId(formData.loanId);
    if (loanIdError) errors.loanId = loanIdError;
    
    // Validate confirmed phone number matches registered phone
    if (!formData.confirmedPhone) {
      errors.confirmedPhone = 'Phone number is required for verification';
    } else if (selectedLoanPhone && formData.confirmedPhone.replace(/\s/g, '') !== selectedLoanPhone.replace(/\s/g, '')) {
      errors.confirmedPhone = 'Phone number does not match the registered number for this loan';
    }
    
    const amountError = validateAmount(formData.amount, selectedLoanOutstanding < 100 ? 0.01 : 100);
    if (amountError) errors.amount = amountError;
    
    if (formData.paymentMethod === 'mpesa') {
      const phoneError = validatePhoneNumber(formData.phoneNumber);
      if (phoneError) errors.phoneNumber = phoneError;
    } else if (formData.paymentMethod === 'card') {
      const cardError = validateCardNumber(formData.cardNumber);
      if (cardError) errors.cardNumber = cardError;
      
      const expiryError = validateCardExpiry(formData.cardExpiry);
      if (expiryError) errors.cardExpiry = expiryError;
      
      const cvvError = validateCvv(formData.cardCvv);
      if (cvvError) errors.cardCvv = cvvError;
    }
    
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    
    // Find selected loan to get its ID
    const selectedLoan = loans.find((l: any) => l.loan_id === formData.loanId);
    if (!selectedLoan) {
      setFieldErrors({ loanId: 'Please select a loan' });
      return;
    }
    
    // Process payment via API
    setIsProcessing(true);
    setPaymentStep('processing');
    
    try {
      const paymentData = {
        loan_id: selectedLoan.id,
        amount: parseFloat(formData.amount),
        phone_number: formData.confirmedPhone || formData.phoneNumber
      };
      
      const response = await transactionsApi.initiate(paymentData);
      
      // Success - update state
      const paymentResponseData: PaymentResponse = {
        success: true,
        transaction_id: response.transaction_id || response.id,
        amount: parseFloat(formData.amount),
        timestamp: new Date().toISOString(),
        message: 'Payment successful!'
      };
      
      setPaymentResponse(paymentResponseData);
      
      // Update local loan data to reflect new balance
      const updatedLoans = loans.map((loan: any) => {
        if (loan.id === selectedLoan.id) {
          const newOutstanding = (loan.outstanding_balance ?? loan.current_outstanding ?? loan.total_due ?? 0) - parseFloat(formData.amount);
          return {
            ...loan,
            total_due: Math.max(0, newOutstanding),
            current_outstanding: Math.max(0, newOutstanding),
            outstanding_balance: Math.max(0, newOutstanding)
          };
        }
        return loan;
      });
      setLoans(updatedLoans);
      
      setPaymentStep('success');
      setJustPaid(true);
      
      // Show success message and redirect to my-loans page after short delay
      setTimeout(() => {
        router.push('/myloans?paymentSuccess=true');
      }, 2000);
    } catch (error: any) {
      console.error('Payment failed:', error);
      setIsProcessing(false);
      setPaymentStep('form');
      
      // Handle API error
      const errorMessage = error.response?.data?.detail || 'Payment failed. Please try again.';
      setFormError(errorMessage);
    }
  };

  const handleReset = () => {
    setFormData({
      loanId: '',
      confirmedPhone: '',
      amount: '',
      paymentMethod: 'mpesa',
      phoneNumber: '',
      cardNumber: '',
      cardExpiry: '',
      cardCvv: ''
    });
    setPaymentStep('form');
    setPaymentResponse(null);
    setSelectedLoanOutstanding(0);
    setSelectedLoanPhone('');
    
    // Redirect to my-loans with success flag after payment
    if (justPaid) {
      setJustPaid(false);
      router.push('/myloans?paymentSuccess=true');
    }
  };

  // Check if there are any loans with outstanding balance
  const hasOutstandingLoans = loans.length > 0 && loans.some((loan: any) => 
    (loan.outstanding_balance ?? loan.current_outstanding ?? loan.total_due ?? 0) > 0
  );

  // Get outstanding balance for a loan
  const getOutstandingBalance = (loan: any) => 
    loan.outstanding_balance ?? loan.current_outstanding ?? loan.total_due ?? 0;

  // Validate amount against outstanding balance
  const validateAgainstBalance = (amount: string, loanId: string): string | null => {
    const selectedLoan = loans.find((l: any) => l.id.toString() === loanId);
    if (!selectedLoan) return null;
    const outstanding = getOutstandingBalance(selectedLoan);
    const amountNum = parseFloat(amount);
    if (amountNum > outstanding) {
      return `Amount exceeds your outstanding balance of KSh ${outstanding.toFixed(2)}`;
    }
    return null;
  };

  // Show no outstanding loans message
  if (!loading && !hasOutstandingLoans) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200 }}
          className="w-24 h-24 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-6"
        >
          <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400" />
        </motion.div>
        <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--heading-color)' }}>
          All Caught Up!
        </h2>
        <p className="text-lg mb-6" style={{ color: 'var(--text-secondary)' }}>
          You have no outstanding balances to repay.
        </p>
        <Link href="/apply">
          <button className="px-6 py-3 rounded-xl font-medium text-white bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 transition-all">
            Apply for a New Loan
          </button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-9">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-center" style={{ color: 'var(--heading-color)' }}>
          Loan Repayment
        </h1>
        <p className="mt-1 text-sm sm:mt-2 sm:text-base text-center" style={{ color: 'var(--text-secondary)' }}>
          Repay your loans securely
        </p>
      </motion.div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="min-w-0 p-3 rounded-xl border shadow-lg sm:p-4 sm:rounded-2xl"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)' }}
        >
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="shrink-0 p-2 rounded-lg sm:p-3 sm:rounded-xl bg-orange-100 dark:bg-orange-900/30">
              <DollarSign className="h-5 w-5 text-orange-600 dark:text-orange-400 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>Outstanding</p>
              <p className="truncate text-lg font-bold sm:text-2xl" style={{ color: 'var(--text-primary)' }}>
                {formatCurrency(summary.totalOutstanding)}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="min-w-0 p-3 rounded-xl border shadow-lg sm:p-4 sm:rounded-2xl"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)' }}
        >
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="shrink-0 p-2 rounded-lg sm:p-3 sm:rounded-xl bg-blue-100 dark:bg-blue-900/30">
              <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>Due Now</p>
              <p className="truncate text-lg font-bold text-emerald-600 dark:text-emerald-400 sm:text-2xl">
                {formatCurrency(summary.nextPayment)}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="min-w-0 p-3 rounded-xl border shadow-lg sm:p-4 sm:rounded-2xl"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)' }}
        >
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="shrink-0 p-2 rounded-lg sm:p-3 sm:rounded-xl bg-purple-100 dark:bg-purple-900/30">
              <Clock className="h-5 w-5 text-purple-600 dark:text-purple-400 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>Next Due</p>
              <p className="truncate text-base font-bold sm:text-xl" style={{ color: 'var(--text-primary)' }}>
                {summary.nextDueDate ? new Date(summary.nextDueDate).toLocaleDateString('en-KE') : 'N/A'}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="min-w-0 p-3 rounded-xl border shadow-lg sm:p-4 sm:rounded-2xl"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)' }}
        >
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="shrink-0 p-2 rounded-lg sm:p-3 sm:rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
              <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm" style={{ color: 'var(--text-secondary)' }}>Streak</p>
              <p className="truncate text-lg font-bold sm:text-2xl" style={{ color: 'var(--text-primary)' }}>
                {loans.length} active loans
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Main Form */}
      <AnimatePresence mode="wait">
        {paymentStep === 'form' && (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
          >
<form onSubmit={handleSubmit} className="p-6 rounded-2xl border shadow-lg" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)' }}>
              <h2 className="text-xl font-bold mb-6" style={{ color: 'var(--heading-color)' }}>
                Repayment Details
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Loan ID */}
                <div className="space-y-2">
                  <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Loan ID
                  </label>
                  <select
                    name="loanId"
                    value={formData.loanId}
                    onChange={handleInputChange}
                    required
                    className={`w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      fieldErrors.loanId ? 'border-red-500' : ''
                    }`}
                    style={{ backgroundColor: 'var(--input-bg)', borderColor: fieldErrors.loanId ? '#ef4444' : 'var(--input-border)', color: 'var(--text-primary)' }}
                  >
                    <option value="">Select Loan ID</option>
                    {loans.map(loan => (
                      <option key={loan.id} value={loan.loan_id}>
                        {loan.loan_id} - Outstanding: KSh {(loan.outstanding_balance ?? loan.current_outstanding ?? loan.total_due ?? 0).toFixed(2)} | Phone: {maskPhoneNumber(loan.phone_number)}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.loanId && (
                    <p className="text-xs text-red-500">{fieldErrors.loanId}</p>
                  )}
                </div>

                {/* Smart Amount Section - Different UI based on balance */}
                {selectedLoanOutstanding > 0 && (
                  <>
                    {(selectedLoanOutstanding ?? 0) >= 100 ? (
                      /* Normal payment: show input for amounts >= 100 */
                      <div className="space-y-2">
                        <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                          Amount (KSh)
                        </label>
                        <input
                          type="number"
                          name="amount"
                          value={formData.amount}
                          onChange={handleInputChange}
                          placeholder={`Enter amount (min 100, max ${selectedLoanOutstanding.toFixed(2)})`}
                          min={100}
                          max={selectedLoanOutstanding || 0}
                          step="any"
                          required
                          className={`w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            fieldErrors.amount ? 'border-red-500' : ''
                          }`}
                          style={{ backgroundColor: 'var(--input-bg)', borderColor: fieldErrors.amount ? '#ef4444' : 'var(--input-border)', color: 'var(--text-primary)' }}
                        />
                        <p className="text-xs text-gray-500">
                          Min: KSh 100 | Max: KSh {selectedLoanOutstanding.toFixed(2)}
                        </p>
                        <div className="flex justify-between items-center mt-2">
                          <p className="text-sm text-gray-600">
                            Exact amount: KSh {selectedLoanOutstanding.toFixed(2)}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, amount: String(selectedLoanOutstanding) });
                              setTimeout(() => {
                                const input = document.querySelector('input[name="amount"]') as HTMLInputElement;
                                if (input) input.focus();
                              }, 50);
                            }}
                            className="text-sm text-blue-600 hover:underline"
                          >
                            Use exact amount
                          </button>
                        </div>
                        {fieldErrors.amount && (
                          <p className="text-xs text-red-500">{fieldErrors.amount}</p>
                        )}
                      </div>
                    ) : (
                      /* Small balance: show prominent exact amount button */
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
                        <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-3">
                          ⚠️ This loan has a small remaining balance of KSh {selectedLoanOutstanding?.toFixed(2)}.
                          This is below the minimum payment of KSh 100.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            console.log('🔘 Pay Exact Amount button clicked');
                            console.log('💰 selectedLoanOutstanding:', selectedLoanOutstanding);
                            console.log('📦 Current formData.amount:', formData.amount);
                            setFormData({ ...formData, amount: String(selectedLoanOutstanding) });
                            console.log('✅ Updated formData.amount to:', String(selectedLoanOutstanding));
                            // Focus the input after setting the value
                            setTimeout(() => {
                              const input = document.querySelector('input[name="amount"]') as HTMLInputElement;
                              console.log('🎯 Input element:', input);
                              if (input) input.focus();
                            }, 50);
                          }}
                          className="w-full px-4 py-3 bg-yellow-600 text-white rounded-lg font-medium hover:bg-yellow-700 transition-colors"
                        >
                          Pay Exact Amount: KSh {selectedLoanOutstanding?.toFixed(2)}
                        </button>
                        <p className="text-xs text-gray-500 mt-2 text-center">
                          Click the button above to settle this loan completely
                        </p>
                        {/* Visible amount input - users can see and verify the amount */}
                        <div className="mt-3">
                          <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                            Amount (KSh)
                          </label>
                          <input
                            type="number"
                            name="amount"
                            value={formData.amount}
                            onChange={handleInputChange}
                            step="any"
                            min={0}
                            max={selectedLoanOutstanding || 0}
                            required
                            className={`w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              fieldErrors.amount ? 'border-red-500' : ''
                            }`}
                            style={{ backgroundColor: 'var(--input-bg)', borderColor: fieldErrors.amount ? '#ef4444' : 'var(--input-border)', color: 'var(--text-primary)' }}
                            placeholder="Enter amount"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Max: KSh {selectedLoanOutstanding?.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Phone Number Confirmation - Show when loan is selected */}
                {formData.loanId && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-2 md:col-span-2"
                  >
                    <div className="p-3 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
                      <div className="flex items-start gap-2">
                        <Shield className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            Phone Verification Required
                          </p>
                          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                            Enter your registered phone number for this loan to verify your identity
                          </p>
                          {selectedLoanPhone && (
                            <p className="text-xs mt-2 font-medium" style={{ color: 'var(--text-secondary)' }}>
                              Registered phone: <span className="font-mono text-yellow-600 dark:text-yellow-400">{selectedLoanPhone}</span>
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Confirm Phone Number
                    </label>
                    <input
                      type="tel"
                      name="confirmedPhone"
                      value={formData.confirmedPhone}
                      onChange={handleInputChange}
                      placeholder="Enter your registered phone number"
                      required
                      className={`w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-yellow-500 ${
                        fieldErrors.confirmedPhone ? 'border-red-500' : ''
                      }`}
                      style={{ backgroundColor: 'var(--input-bg)', borderColor: fieldErrors.confirmedPhone ? '#ef4444' : 'var(--input-border)', color: 'var(--text-primary)' }}
                    />
                    {fieldErrors.confirmedPhone && (
                      <p className="text-xs text-red-500">{fieldErrors.confirmedPhone}</p>
                    )}
                  </motion.div>
                )}

                {/* Payment Method */}
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Payment Method
                  </label>
                  <div className="grid grid-cols-3 gap-4">
                    {/* M-Pesa */}
                    <label className={`
                      flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all
                      ${formData.paymentMethod === 'mpesa'
                        ? 'border-green-500 bg-green-50/50 dark:bg-green-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-green-300'
                      }
                    `}>
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="mpesa"
                        checked={formData.paymentMethod === 'mpesa'}
                        onChange={handleInputChange}
                        className="sr-only"
                      />
                      <Smartphone className={`h-6 w-6 ${formData.paymentMethod === 'mpesa' ? 'text-green-500' : 'text-gray-500'}`} />
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>M-Pesa</span>
                    </label>

                    {/* Card */}
                    <label className={`
                      flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all
                      ${formData.paymentMethod === 'card'
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-blue-300'
                      }
                    `}>
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="card"
                        checked={formData.paymentMethod === 'card'}
                        onChange={handleInputChange}
                        className="sr-only"
                      />
                      <CreditCard className={`h-6 w-6 ${formData.paymentMethod === 'card' ? 'text-blue-500' : 'text-gray-500'}`} />
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Card</span>
                    </label>
                  </div>
                </div>

                {/* M-Pesa Phone Number */}
                {formData.paymentMethod === 'mpesa' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="space-y-2"
                  >
                    <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      name="phoneNumber"
                      value={formData.phoneNumber}
                      onChange={handleInputChange}
                      placeholder="07XX XXX XXX"
                      required={formData.paymentMethod === 'mpesa'}
                      className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-green-500"
                      style={{ backgroundColor: 'var(--input-bg)', borderColor: fieldErrors.phoneNumber ? '#ef4444' : 'var(--input-border)', color: 'var(--text-primary)' }}
                    />
                    {fieldErrors.phoneNumber && (
                      <p className="text-xs text-red-500">{fieldErrors.phoneNumber}</p>
                    )}
                  </motion.div>
                )}

                {/* Card Details */}
                {formData.paymentMethod === 'card' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                        Card Number
                      </label>
                      <input
                        type="text"
                        name="cardNumber"
                        value={formData.cardNumber}
                        onChange={handleInputChange}
                        placeholder="1234 5678 9012 3456"
                        required={formData.paymentMethod === 'card'}
                        className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500"
                        style={{ backgroundColor: 'var(--input-bg)', borderColor: fieldErrors.cardNumber ? '#ef4444' : 'var(--input-border)', color: 'var(--text-primary)' }}
                      />
                      {fieldErrors.cardNumber && (
                        <p className="text-xs text-red-500">{fieldErrors.cardNumber}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                        Card Expiry
                      </label>
                      <input
                        type="text"
                        name="cardExpiry"
                        value={formData.cardExpiry}
                        onChange={handleInputChange}
                        placeholder="MM/YY"
                        required={formData.paymentMethod === 'card'}
                        className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500"
                        style={{ backgroundColor: 'var(--input-bg)', borderColor: fieldErrors.cardExpiry ? '#ef4444' : 'var(--input-border)', color: 'var(--text-primary)' }}
                      />
                      {fieldErrors.cardExpiry && (
                        <p className="text-xs text-red-500">{fieldErrors.cardExpiry}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                        CVV
                      </label>
                      <input
                        type="text"
                        name="cardCvv"
                        value={formData.cardCvv}
                        onChange={handleInputChange}
                        placeholder="123"
                        required={formData.paymentMethod === 'card'}
                        className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500"
                        style={{ backgroundColor: 'var(--input-bg)', borderColor: fieldErrors.cardCvv ? '#ef4444' : 'var(--input-border)', color: 'var(--text-primary)' }}
                      />
                      {fieldErrors.cardCvv && (
                        <p className="text-xs text-red-500">{fieldErrors.cardCvv}</p>
                      )}
                    </div>
                  </>
                )}
              </div>

                {/* Selected Loan Outstanding Balance */}
              {formData.loanId && selectedLoanOutstanding > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Outstanding Balance:
                    </span>
                    <span className="text-lg font-bold text-orange-600 dark:text-orange-400">
                      {formatCurrency(selectedLoanOutstanding)}
                    </span>
                  </div>
                  {/* Warning for small balances - only show when > 0 and < 100 */}
                  {selectedLoanOutstanding > 0 && selectedLoanOutstanding < 100 && (
                    <div className="mt-3 p-3 rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
                      <p className="text-sm text-yellow-800 dark:text-yellow-200">
                        ⚠️ This loan has a small remaining balance of KSh {selectedLoanOutstanding.toFixed(2)}.
                        This is below the minimum payment of KSh 100. You can pay the exact amount to settle it.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setFormData({ ...formData, amount: String(selectedLoanOutstanding) });
                          setTimeout(() => {
                            const input = document.querySelector('input[name="amount"]') as HTMLInputElement;
                            if (input) input.focus();
                          }, 50);
                        }}
                        className="mt-2 px-4 py-2 bg-yellow-600 text-white rounded-lg text-sm hover:bg-yellow-700"
                      >
                        Pay Exact Amount: KSh {selectedLoanOutstanding.toFixed(2)}
                      </button>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Submit Button */}
              <motion.button
                type="submit"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={isProcessing}
                className="w-full py-4 rounded-xl font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6"
                style={{ backgroundColor: 'var(--button-primary)', color: 'var(--button-text)' }}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <DollarSign className="h-5 w-5" />
                    Pay {formData.amount ? `KSh ${parseFloat(formData.amount).toLocaleString()}` : 'Now'}
                  </>
                )}
              </motion.button>

              {/* Security */}
              <div className="flex items-center justify-center gap-2 mt-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <Shield className="h-4 w-4 text-green-500" />
                <span>Secure encrypted payment</span>
              </div>
            </form>
          </motion.div>
        )}

        {/* Processing State */}
        {paymentStep === 'processing' && (
          <motion.div
            key="processing"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
          >
            <div className="p-12 rounded-2xl border shadow-lg text-center" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)' }}>
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"
              />
              <h3 className="text-xl font-semibold mb-2" style={{ color: 'var(--heading-color)' }}>
                Processing Payment...
              </h3>
              <p style={{ color: 'var(--text-secondary)' }}>
                Please wait while we process your payment
              </p>
            </div>
          </motion.div>
        )}

        {/* Success State */}
        {paymentStep === 'success' && paymentResponse && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
          >
            <div className="p-6 rounded-2xl border shadow-lg" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)' }}>
              <div className="text-center mb-6">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 10 }}
                  className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4"
                >
                  <CheckCircle className="h-10 w-10 text-white" />
                </motion.div>
                <h3 className="text-2xl font-bold" style={{ color: 'var(--heading-color)' }}>
                  Payment Successful!
                </h3>
              </div>

              {/* Transaction Details */}
              <div className="p-4 rounded-xl space-y-3" style={{ backgroundColor: 'var(--bg-card-alt)' }}>
                <div className="flex justify-between">
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Transaction ID</span>
                  <span className="font-mono text-sm" style={{ color: 'var(--text-primary)' }}>
                    {paymentResponse.transaction_id}
                  </span>
                </div>
                {'confirmation_code' in paymentResponse && (
                  <div className="flex justify-between">
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Confirmation Code</span>
                    <span className="font-mono text-sm font-bold text-green-600 dark:text-green-400">
                      {paymentResponse.confirmation_code}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Amount</span>
                  <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                    {formatCurrency(paymentResponse.amount || 0)}
                  </span>
                </div>
              </div>

              {/* Done Button */}
              <motion.button
                type="button"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleReset}
                className="w-full py-4 rounded-xl font-medium shadow-lg mt-6"
                style={{ backgroundColor: 'var(--button-primary)', color: 'var(--button-text)' }}
              >
                Done
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payment History Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="p-6 rounded-2xl border shadow-lg"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-light)' }}
      >
        <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--heading-color)' }}>
          Recent Payments
        </h2>
        
        {paymentHistory.length > 0 ? (
          <div className="space-y-3">
            {paymentHistory.slice(0, 5).map((payment: any, index: number) => (
              <motion.div
                key={payment.id || index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center justify-between p-3 rounded-xl"
                style={{ backgroundColor: 'var(--bg-card-alt)' }}
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                      {formatCurrency(payment.amount)}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {payment.initiated_at ? new Date(payment.initiated_at).toLocaleDateString('en-KE', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      }) : 'Recently'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Remaining
                  </p>
                  <p className="font-bold" style={{ color: 'var(--text-primary)' }}>
                    {formatCurrency(payment.remaining_balance)}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Clock className="h-12 w-12 mx-auto mb-3" style={{ color: 'var(--text-secondary)' }} />
            <p className="text-lg font-medium" style={{ color: 'var(--text-secondary)' }}>
              No payment history yet
            </p>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Your recent payments will appear here
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

