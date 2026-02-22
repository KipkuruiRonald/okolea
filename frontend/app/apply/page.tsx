'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { 
  CreditCard, 
  DollarSign, 
  Calendar, 
  CheckCircle, 
  AlertCircle,
  ArrowRight,
  Loader2,
  Shield,
  Clock,
  Percent
} from 'lucide-react';
import Link from 'next/link';
import GlassCard from '@/components/GlassCard';
import { AuthGuard } from '@/components/AuthGuard';
import { loansApi } from '@/lib/api';
import { isAdmin, useAuth } from '@/context/AuthContext';
import { 
  validateFullName, 
  validateIdNumber, 
  validatePhoneNumber, 
  validateMonthlyIncome,
  validateEmploymentStatus,
  validateLoanPurpose,
  validateTermsAccepted 
} from '@/lib/validation';
import { maskPhoneNumber } from '@/lib/utils';

const loanOptions = [
  { amount: 500, term: '9 days', interest: '4.9%', totalDue: 'KSh 525', eligible: true },
  { amount: 1000, term: '9 days', interest: '4.9%', totalDue: 'KSh 1,049', eligible: true },
  { amount: 1500, term: '9 days', interest: '4.9%', totalDue: 'KSh 1,574', eligible: false },
  { amount: 2000, term: '9 days', interest: '4.9%', totalDue: 'KSh 2,098', eligible: false },
  { amount: 3000, term: '15 days', interest: '5.9%', totalDue: 'KSh 3,177', eligible: false },
  { amount: 5000, term: '15 days', interest: '5.9%', totalDue: 'KSh 5,295', eligible: false },
  { amount: 10000, term: '30 days', interest: '6.9%', totalDue: 'KSh 10,690', eligible: false },
  { amount: 15000, term: '30 days', interest: '6.9%', totalDue: 'KSh 16,035', eligible: false },
];

const purposes = [
  'Business Expansion',
  'Emergency Expenses',
  'School Fees',
  'Medical Bills',
  'Home Improvement',
  'Debt Consolidation',
  'Personal Needs',
  'Other'
];

export default function ApplyPage() {
  return (
    <AuthGuard>
      <ApplyPageContent />
    </AuthGuard>
  );
}

function ApplyPageContent() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  // Redirect admins to admin dashboard
  useEffect(() => {
    if (isAuthenticated && user && isAdmin(user)) {
      router.replace('/admin');
    }
  }, [isAuthenticated, user, router]);

  const [selectedLoan, setSelectedLoan] = useState<typeof loanOptions[0] | null>(null);
  const [selectedPurpose, setSelectedPurpose] = useState('');
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [submittedLoan, setSubmittedLoan] = useState<any>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  
  // Auto-populated user data from profile (Full Name and Phone from registration)
  const [userProfileData, setUserProfileData] = useState({
    fullName: '',
    phone: ''
  });
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  // Fetch user profile data on mount
  useEffect(() => {
    if (user) {
      setUserProfileData({
        fullName: user.full_name || '',
        phone: user.phone || ''
      });
      // Also pre-fill the form data
      setFormData(prev => ({
        ...prev,
        fullName: user.full_name || prev.fullName,
        phoneNumber: user.phone || prev.phoneNumber
      }));
      setIsLoadingProfile(false);
    } else {
      setIsLoadingProfile(false);
    }
  }, [user]);

  // KYC Status Check - users must be verified to apply for loans
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [isCheckingKyc, setIsCheckingKyc] = useState(true);

  useEffect(() => {
    const checkKycStatus = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const res = await fetch('http://localhost:8000/api/settings/kyc-status', {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        if (res.ok) {
          const data = await res.json();
          setKycStatus(data.kyc_status);
        }
      } catch (err) {
        console.error('Failed to check KYC status:', err);
        // If we can't check, assume not verified for safety
        setKycStatus('PENDING');
      } finally {
        setIsCheckingKyc(false);
      }
    };
    
    checkKycStatus();
  }, []);

  const [formData, setFormData] = useState({
    fullName: '',
    idNumber: '',
    phoneNumber: '',
    mpesaNumber: '',
    employmentStatus: '',
    monthlyIncome: '',
    termsAccepted: false
  });

  const formatCurrency = (amount: number) => {
    return `KSh ${amount.toLocaleString()}`;
  };

  const calculateTotalDue = (principal: number, interestRate: number) => {
    return principal + (principal * (interestRate / 100));
  };

  // Centralized input change handler for all form fields
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = e.target instanceof HTMLInputElement ? e.target.checked : false;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async () => {
    // RE-VALIDATE ALL FIELDS before submission
    const errors: Record<string, string> = {};
    
    // Validate Step 1 fields
    if (!selectedLoan) {
      errors.amount = 'Please select a loan amount';
    }
    if (!selectedPurpose) {
      errors.purpose = 'Please select a loan purpose';
    }
    
    // Validate Step 2 fields (ALL of them)
    const nameError = validateFullName(formData.fullName);
    if (nameError) errors.fullName = nameError;
    
    const idError = validateIdNumber(formData.idNumber);
    if (idError) errors.idNumber = idError;
    
    const phoneError = validatePhoneNumber(formData.phoneNumber);
    if (phoneError) errors.phoneNumber = phoneError;
    
    if (!formData.mpesaNumber || formData.mpesaNumber.trim() === '') {
      errors.mpesaNumber = 'M-Pesa number is required';
    } else if (!/^(?:\+254|0)[17]\d{8}$/.test(formData.mpesaNumber.replace(/\s/g, ''))) {
      errors.mpesaNumber = 'Please enter a valid M-Pesa number';
    }
    
    if (!formData.employmentStatus) {
      errors.employmentStatus = 'Employment status is required';
    }
    
    const incomeError = validateMonthlyIncome(formData.monthlyIncome);
    if (incomeError) errors.monthlyIncome = incomeError;
    
    // Validate terms
    if (!formData.termsAccepted) {
      errors.terms = 'You must accept the terms and conditions';
    }
    
    // If any errors found, show them and stop
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setFormError('Please fix the errors before submitting');
      // Scroll to top to show errors
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    
    // All validation passed - proceed with real API submission
    setIsSubmitting(true);
    setFormError(null);
    
    try {
      // Prepare loan application data for the new /apply endpoint
      const loanApplicationData = {
        amount: selectedLoan?.amount,
        term_days: selectedLoan?.term ? parseInt(selectedLoan.term.split(' ')[0]) : 9,
        purpose: selectedPurpose,
        full_name: formData.fullName,
        national_id: formData.idNumber,
        phone_number: formData.phoneNumber,
        mpesa_number: formData.mpesaNumber,
        employment_status: formData.employmentStatus,
        monthly_income: parseFloat(formData.monthlyIncome),
        terms_accepted: formData.termsAccepted
      };
      
      // Call the loans API using loansApi (handles auth automatically)
      const result = await loansApi.create(loanApplicationData);
      console.log('Loan application successful:', result);
      
      // Store loan info for reference
      localStorage.setItem('last_loan_id', result.id?.toString() || result.loan_id);
      
      // Store loan details in session for success page
      sessionStorage.setItem('lastLoan', JSON.stringify(result));
      
      // Store submitted loan details for success screen
      setSubmittedLoan(result);
      
      // Show success
      setIsApproved(true);
      
    } catch (error: any) {
      console.error('Loan submission error:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to submit application. Please try again.';
      setFormError(errorMessage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle form submission for each step
  const handleStepSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);
    
    // Validate Step 1: Loan Amount & Purpose
    if (step === 1) {
      const errors: Record<string, string> = {};
      if (!selectedLoan) {
        errors.amount = 'Please select a loan amount';
      }
      if (!selectedPurpose) {
        errors.purpose = 'Please select a loan purpose';
      }
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
    }
    
    // Validate Step 2: Personal Details
    if (step === 2) {
      const errors: Record<string, string> = {};
      
      // Validate that amount was selected in Step 1
      if (!selectedLoan) {
        errors.amount = 'Please select a loan amount in Step 1';
      }
      
      const nameError = validateFullName(formData.fullName);
      if (nameError) errors.fullName = nameError;
      
      const idError = validateIdNumber(formData.idNumber);
      if (idError) errors.idNumber = idError;
      
      const phoneError = validatePhoneNumber(formData.phoneNumber);
      if (phoneError) errors.phoneNumber = phoneError;
      
      if (!formData.mpesaNumber || formData.mpesaNumber.trim() === '') {
        errors.mpesaNumber = 'M-Pesa number is required';
      } else if (!/^(?:\+254|0)[17]\d{8}$/.test(formData.mpesaNumber.replace(/\s/g, ''))) {
        errors.mpesaNumber = 'Please enter a valid M-Pesa number';
      }
      
      if (!formData.employmentStatus) {
        errors.employmentStatus = 'Employment status is required';
      }
      
      const incomeError = validateMonthlyIncome(formData.monthlyIncome);
      if (incomeError) errors.monthlyIncome = incomeError;
      
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
    }
    
    // Validate Step 3: Terms
    if (step === 3) {
      if (!formData.termsAccepted) {
        setFormError('You must accept the terms and conditions to apply');
        return;
      }
    }
    
    if (step < 3) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  };

  if (isApproved) {
  return (
    <div className="space-y-9">
        {/* Success Animation */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
            className="mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mb-6 shadow-lg shadow-amber-500/50"
          >
            <Clock className="h-12 w-12 text-white" />
          </motion.div>

          <h1 className="text-4xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent mb-4">
            Application Submitted!
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 mb-2">
            Your loan application is under review.
          </p>
          <p className="text-lg text-gray-500 dark:text-gray-500 mb-8">
            You will be notified once it is approved or if we need more information.
          </p>

          <GlassCard className="max-w-md mx-auto">
            <div className="space-y-4">
              <div className="flex justify-between items-center py-3 border-b border-gray-200 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Loan Amount</span>
                <span className="font-bold text-gray-900 dark:text-white">
                  {selectedLoan ? formatCurrency(selectedLoan.amount) : 'KSh 0'}
                </span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-gray-200 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Term</span>
                <span className="font-bold text-gray-900 dark:text-white">
                  {selectedLoan?.term}
                </span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-gray-200 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Total Due</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {selectedLoan?.totalDue}
                </span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-gray-200 dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-400">Due Date</span>
                <span className="font-bold text-gray-900 dark:text-white">
                  {new Date(Date.now() + (selectedLoan?.term.includes('9') ? 9 : selectedLoan?.term.includes('15') ? 15 : 30) * 24 * 60 * 60 * 1000).toLocaleDateString('en-KE')}
                </span>
              </div>
              {/* Phone number for repayment - show after loan approval */}
              {submittedLoan?.phone && (
                <div className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                    <CreditCard className="h-4 w-4 inline mr-1" />
                    Registered Phone for Repayment
                  </p>
                  <p className="text-lg font-mono font-bold text-blue-700 dark:text-blue-300 mt-1">
                    {maskPhoneNumber(submittedLoan.phone)}
                  </p>
                  <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">
                    Use this phone number when making repayments
                  </p>
                </div>
              )}
            </div>
          </GlassCard>

          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/myloans">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="rounded-xl bg-gradient-to-r from-blue-600 to-emerald-600 px-8 py-3 font-medium text-white shadow-lg shadow-emerald-500/50"
              >
                View My Loans
              </motion.button>
            </Link>
            <Link href="/">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="rounded-xl border-2 border-gray-300 dark:border-gray-600 px-8 py-3 font-medium text-gray-700 dark:text-gray-300"
              >
                Back to Home
              </motion.button>
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* KYC Verification Required Message */}
      {!isCheckingKyc && kycStatus !== 'VERIFIED' && (
        <GlassCard>
          <div className="text-center py-8">
            <Shield className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              KYC Verification Required
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {kycStatus === 'REJECTED' 
                ? 'Your KYC verification was rejected. Please contact support for assistance.'
                : kycStatus === 'PENDING' || kycStatus === 'SUBMITTED'
                ? 'Your KYC verification is still being processed. Please wait for verification to complete before applying for loans.'
                : 'You must complete KYC verification before applying for loans.'
              }
            </p>
            <Link 
              href="/settings" 
              className="inline-flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Go to Settings
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </div>
        </GlassCard>
      )}

      {/* Show loading while checking KYC */}
      {isCheckingKyc && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Main form content - only show if KYC is verified or still checking */}
      {!isCheckingKyc && kycStatus === 'VERIFIED' && (
        <>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center sm:text-left"
      >
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
          Apply for a Loan
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Quick, simple loans with fair interest rates. Get up to KSh 50,000
        </p>
      </motion.div>

      {/* Progress Steps */}
      <GlassCard>
        <div className="flex items-center justify-between">
          {['Select Amount', 'Your Details', 'Review & Submit'].map((label, index) => (
            <div key={label} className="flex items-center">
              <div className="flex items-center">
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ 
                    scale: step > index ? 1 : 0.8,
                    backgroundColor: step > index ? '#10b981' : step === index + 1 ? '#3b82f6' : '#e5e7eb'
                  }}
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                    step > index 
                      ? 'text-white bg-gradient-to-r from-emerald-500 to-green-500' 
                      : step === index + 1
                      ? 'text-white bg-gradient-to-r from-blue-500 to-blue-600'
                      : 'text-gray-500 bg-gray-200 dark:bg-gray-700'
                  }`}
                >
                  {step > index + 1 ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    index + 1
                  )}
                </motion.div>
                <span className={`ml-3 font-medium hidden sm:inline ${
                  step >= index + 1 
                    ? 'text-gray-900 dark:text-white' 
                    : 'text-gray-500'
                }`}>
                  {label}
                </span>
              </div>
              {index < 2 && (
                <div className={`w-12 sm:w-24 h-1 mx-2 sm:mx-4 rounded ${
                  step > index + 1 
                    ? 'bg-gradient-to-r from-emerald-500 to-green-500' 
                    : 'bg-gray-200 dark:bg-gray-700'
                }`} />
              )}
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Step 1: Loan Amount Selection */}
      {step === 1 && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
        >
          <GlassCard>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <DollarSign className="h-6 w-6 text-blue-600" />
              Choose Your Loan Amount
            </h2>

            {/* Error Display */}
            {fieldErrors.amount && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-600 dark:text-red-400">{fieldErrors.amount}</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {loanOptions.map((loan) => (
                <motion.button
                  key={loan.amount}
                  whileHover={{ scale: selectedLoan?.amount === loan.amount ? 1.02 : 1.05 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => loan.eligible && setSelectedLoan(loan)}
                  disabled={!loan.eligible}
                  className={`
                    relative p-6 rounded-2xl border-2 transition-all duration-300 text-left overflow-visible
                    ${selectedLoan?.amount === loan.amount
                      ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/20 shadow-lg shadow-emerald-500/30'
                      : loan.eligible
                        ? 'border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 bg-white/50 dark:bg-gray-800/50'
                        : 'border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-800/30'
                    }
                  `}
                >
                  {loan.eligible && selectedLoan?.amount === loan.amount && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center"
                    >
                      <CheckCircle className="h-4 w-4 text-white" />
                    </motion.div>
                  )}
                  
                  <div className="mb-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Loan Amount</p>
                    <p className={`text-2xl font-bold ${
                      loan.eligible 
                        ? 'text-gray-900 dark:text-white' 
                        : 'text-gray-400'
                    }`}>
                      {formatCurrency(loan.amount)}
                    </p>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Term</span>
                      <span className="font-medium text-gray-900 dark:text-white">{loan.term}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Interest</span>
                      <span className="font-medium text-gray-900 dark:text-white">{loan.interest}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Total Due</span>
                      <span className={`font-bold ${loan.eligible ? 'text-emerald-600' : 'text-gray-400'}`}>
                        {loan.totalDue}
                      </span>
                    </div>
                  </div>

                  {!loan.eligible && (
                    <div className="flex items-center gap-1 text-xs text-orange-500">
                      <AlertCircle className="h-3 w-3" />
                      <span>Upgrade to unlock</span>
                    </div>
                  )}
                </motion.button>
              ))}
            </div>

            {/* Credit Score Info */}
            <div className="mt-6 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100">Tier 2 Borrower</h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                    Your current credit tier allows loans up to KSh 1,000. Make on-time repayments to unlock higher limits!
                  </p>
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      )}

      {/* Step 2: Personal Details */}
      {step === 2 && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
        >
          <form onSubmit={handleStepSubmit}>
            <GlassCard>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                <CreditCard className="h-6 w-6 text-blue-600" />
                Your Personal Details
              </h2>

              {/* Loan Amount - AUTO-POPULATED from tier selection (Step 1) */}
              <div className="mb-8 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Selected Loan Amount</p>
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                      {selectedLoan ? formatCurrency(selectedLoan.amount) : 'Not selected'}
                    </p>
                  </div>
                  {selectedLoan && (
                    <div className="text-right">
                      <p className="text-xs text-blue-500 dark:text-blue-400">Term</p>
                      <p className="font-medium text-blue-700 dark:text-blue-300">{selectedLoan.term}</p>
                    </div>
                  )}
                </div>
                {!selectedLoan && (
                  <p className="text-xs text-amber-600 mt-2">
                    ⚠️ Please go back to Step 1 and select a loan amount first
                  </p>
                )}
                {/* Hidden field to submit the actual value */}
                <input type="hidden" name="amount" value={selectedLoan?.amount || ''} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Full Name - Auto-populated from user profile (read-only) */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Full Name (as per ID)
                  </label>
                  {isLoadingProfile ? (
                    <div className="w-full px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 animate-pulse">
                      <div className="h-5 bg-gray-300 dark:bg-gray-600 rounded w-1/3"></div>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        name="fullName"
                        value={userProfileData.fullName || formData.fullName}
                        onChange={handleInputChange}
                        placeholder="Enter your full name"
                        required
                        disabled
                        className="w-full px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                      />
                      {!userProfileData.fullName && (
                        <p className="text-xs text-amber-600 mt-1">
                          ⚠️ Please update your name in settings before applying
                        </p>
                      )}
                    </>
                  )}
                  {fieldErrors.fullName && (
                    <p className="text-xs text-red-500">{fieldErrors.fullName}</p>
                  )}
                </div>

                {/* ID Number */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    National ID Number
                  </label>
                  <input
                    type="text"
                    name="idNumber"
                    value={formData.idNumber}
                    onChange={handleInputChange}
                    placeholder="Enter your ID number"
                    required
                    className={`w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-700 border text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                      fieldErrors.idNumber ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'
                    }`}
                  />
                  {fieldErrors.idNumber && (
                    <p className="text-xs text-red-500">{fieldErrors.idNumber}</p>
                  )}
                </div>

                {/* Phone Number - Auto-populated from user profile (read-only) */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Phone Number
                  </label>
                  {isLoadingProfile ? (
                    <div className="w-full px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 animate-pulse">
                      <div className="h-5 bg-gray-300 dark:bg-gray-600 rounded w-1/2"></div>
                    </div>
                  ) : (
                    <>
                      <input
                        type="tel"
                        name="phoneNumber"
                        value={userProfileData.phone || formData.phoneNumber}
                        onChange={handleInputChange}
                        placeholder="07XX XXX XXX"
                        required
                        disabled
                        className="w-full px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                      />
                      {!userProfileData.phone && (
                        <p className="text-xs text-amber-600 mt-1">
                          ⚠️ Please update your phone number in settings before applying
                        </p>
                      )}
                    </>
                  )}
                  {fieldErrors.phoneNumber && (
                    <p className="text-xs text-red-500">{fieldErrors.phoneNumber}</p>
                  )}
                </div>

                {/* M-Pesa Number */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    M-Pesa Number (for disbursement)
                  </label>
                  <input
                    type="tel"
                    name="mpesaNumber"
                    value={formData.mpesaNumber}
                    onChange={handleInputChange}
                    placeholder="07XX XXX XXX"
                    required
                    className={`w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-700 border text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                      fieldErrors.mpesaNumber ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'
                    }`}
                  />
                  {fieldErrors.mpesaNumber && (
                    <p className="text-xs text-red-500">{fieldErrors.mpesaNumber}</p>
                  )}
                </div>

                {/* Employment Status */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Employment Status
                  </label>
                  <select
                    name="employmentStatus"
                    value={formData.employmentStatus}
                    onChange={handleInputChange}
                    required
                    className={`w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-700 border text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                      fieldErrors.employmentStatus ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'
                    }`}
                  >
                    <option value="" className="text-gray-500">Select employment status</option>
                    <option value="employed">Employed</option>
                    <option value="self-employed">Self-Employed</option>
                    <option value="business-owner">Business Owner</option>
                    <option value="freelancer">Freelancer</option>
                    <option value="student">Student</option>
                    <option value="other">Other</option>
                  </select>
                  {fieldErrors.employmentStatus && (
                    <p className="text-xs text-red-500">{fieldErrors.employmentStatus}</p>
                  )}
                </div>

                {/* Monthly Income */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Monthly Income (KES)
                  </label>
                  <input
                    type="number"
                    name="monthlyIncome"
                    value={formData.monthlyIncome}
                    onChange={handleInputChange}
                    placeholder="e.g., 30000"
                    required
                    className={`w-full px-4 py-3 rounded-xl bg-white dark:bg-gray-700 border text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
                      fieldErrors.monthlyIncome ? 'border-red-500' : 'border-gray-200 dark:border-gray-600'
                    }`}
                  />
                  {fieldErrors.monthlyIncome && (
                    <p className="text-xs text-red-500">{fieldErrors.monthlyIncome}</p>
                  )}
                </div>
              </div>

              {/* Loan Purpose */}
              <div className="mt-6 space-y-3">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Loan Purpose
                </label>
                {fieldErrors.purpose && (
                  <p className="text-sm text-red-600 dark:text-red-400">{fieldErrors.purpose}</p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {purposes.map((purpose) => (
                    <motion.button
                      key={purpose}
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedPurpose(purpose)}
                      className={`
                        px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 border-2
                        ${selectedPurpose === purpose
                          ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                          : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-blue-400 dark:hover:border-blue-500'
                        }
                      `}
                    >
                      {purpose}
                    </motion.button>
                  ))}
                </div>
              </div>
            </GlassCard>
          </form>
        </motion.div>
      )}

      {/* Step 3: Review & Submit */}
      {step === 3 && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-6"
        >
          {/* Loan Summary */}
          <GlassCard>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <DollarSign className="h-6 w-6 text-emerald-600" />
              Loan Summary
            </h2>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Amount</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {selectedLoan ? formatCurrency(selectedLoan.amount) : 'KSh 0'}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Term</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {selectedLoan?.term}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Interest</p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                  {selectedLoan?.interest}
                </p>
              </div>
              <div className="p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Due</p>
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {selectedLoan?.totalDue}
                </p>
              </div>
            </div>

            {/* Due Date */}
            <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-blue-50 to-emerald-50 dark:from-blue-900/20 dark:to-emerald-900/20 border border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Repayment Due Date</p>
                    <p className="font-bold text-gray-900 dark:text-white">
                      {new Date(Date.now() + (selectedLoan?.term.includes('9') ? 9 : selectedLoan?.term.includes('15') ? 15 : 30) * 24 * 60 * 60 * 1000).toLocaleDateString('en-KE')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <Clock className="h-4 w-4" />
                  <span>{selectedLoan?.term} term</span>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Personal Details Summary */}
          <GlassCard>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
              <CreditCard className="h-6 w-6 text-blue-600" />
              Your Details
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Full Name</span>
                  <span className="font-medium text-gray-900 dark:text-white">{formData.fullName}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">ID Number</span>
                  <span className="font-medium text-gray-900 dark:text-white">{formData.idNumber}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Phone</span>
                  <span className="font-medium text-gray-900 dark:text-white">{formData.phoneNumber}</span>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">M-Pesa</span>
                  <span className="font-medium text-gray-900 dark:text-white">{formData.mpesaNumber}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Employment</span>
                  <span className="font-medium text-gray-900 dark:text-white capitalize">{formData.employmentStatus}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">Income</span>
                  <span className="font-medium text-gray-900 dark:text-white">{formData.monthlyIncome ? `KSh ${parseInt(formData.monthlyIncome).toLocaleString()}` : '-'}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 p-4 rounded-xl bg-purple-50 dark:bg-purple-900/20">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">Loan Purpose</span>
                <span className="font-medium text-purple-700 dark:text-purple-300">{selectedPurpose}</span>
              </div>
            </div>
          </GlassCard>

          {/* Terms & Conditions */}
          <form onSubmit={handleSubmit}>
            <GlassCard>
              {/* Error Display */}
              {formError && (
                <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
                </div>
              )}
              
              <div className="flex items-start gap-4">
                <input
                  type="checkbox"
                  name="termsAccepted"
                  id="terms"
                  checked={formData.termsAccepted}
                  onChange={handleInputChange}
                  className="mt-1 w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="terms" className="text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                  I agree to the{' '}
                  <a href="#" className="text-blue-600 hover:text-blue-500 underline">Terms of Service</a>
                  {' '}and{' '}
                  <a href="#" className="text-blue-600 hover:text-blue-500 underline">Privacy Policy</a>.
                  I understand that late payments will result in a 6.8% penalty and may affect my credit score.
                </label>
              </div>

              {/* Warning */}
              <div className="mt-4 p-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-orange-600 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-orange-900 dark:text-orange-100">Important Notice</h4>
                    <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                      Please ensure all details are correct. False information may result in loan rejection or legal action.
                    </p>
                  </div>
                </div>
              </div>
            </GlassCard>
          </form>
        </motion.div>
      )}

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        {step > 1 && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setStep(step - 1)}
            className="px-6 py-3 rounded-xl border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
          >
            Back
          </motion.button>
        )}
        
        {step < 3 ? (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setStep(step + 1)}
            disabled={step === 1 && !selectedLoan}
            className={`
              ml-auto flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all
              ${step === 1 && !selectedLoan
                ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-emerald-600 text-white shadow-lg shadow-emerald-500/50'
              }
            `}
          >
            Continue
            <ArrowRight className="h-5 w-5" />
          </motion.button>
        ) : (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSubmit}
            disabled={!formData.termsAccepted || isSubmitting}
            className={`
              ml-auto flex items-center gap-2 px-8 py-3 rounded-xl font-medium transition-all
              ${!formData.termsAccepted
                ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-lg shadow-emerald-500/50'
              }
            `}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle className="h-5 w-5" />
                Submit Application
              </>
            )}
          </motion.button>
        )}
      </div>
      </>)}
    </div>
  );
}

