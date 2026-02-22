'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { 
  Wallet, 
  Calendar, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  DollarSign,
  CreditCard,
  ArrowRight,
  RefreshCw,
  Download,
  Filter,
  Loader2,
  Search,
  X
} from 'lucide-react';
import Link from 'next/link';
import GlassCard from '@/components/GlassCard';
import { loansApi } from '@/lib/api';
import { getErrorMessage, maskPhoneNumber } from '@/lib/utils';
import { useAuth, isAdmin } from '@/context/AuthContext';
import { exportLoansToPDF } from '@/lib/pdfExport';

// Custom debounce hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

interface Loan {
  id: number;
  loan_id: string;
  originator_id: number;
  principal: number;
  interest_rate: number;
  term_days: number;
  total_due: number;
  outstanding_balance?: number;
  current_outstanding?: number;
  phone_number?: string;
  due_date: string;
  payment_date?: string;
  late_days: number;
  late_penalty_amount?: number;
  status: 'PENDING' | 'ACTIVE' | 'SETTLED' | 'REJECTED' | 'DEFAULTED';
  risk_score?: number;
  risk_grade?: string;
  created_at: string;
}

interface LoanSummary {
  active_loans: number;
  total_outstanding: number;
  total_repaid: number;
  next_payment: number;
  next_due_date: string;
  perfect_repayment_streak: number;
}

export default function MyLoansPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  // Redirect admins to admin dashboard
  useEffect(() => {
    if (isAuthenticated && user && isAdmin(user)) {
      router.replace('/admin');
    }
  }, [isAuthenticated, user, router]);

  const [loans, setLoans] = useState<Loan[]>([]);
  const [summary, setSummary] = useState<LoanSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const searchParams = useSearchParams();
  
  // Debounce search query
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Fetch loans from API
  const fetchLoans = useCallback(async (query: string = '', status: string = 'all') => {
    try {
      setError(null);
      
      // Call the new /api/loans/my-loans endpoint using loansApi
      const data = await loansApi.getMyLoans();
      
      // Filter by status if needed
      let filteredLoans = data;
      if (status && status !== 'all') {
        filteredLoans = data.filter((loan: Loan) => loan.status === status);
      }
      
      // Filter by search query if needed
      if (query) {
        const lowerQuery = query.toLowerCase();
        filteredLoans = filteredLoans.filter((loan: Loan) => 
          loan.loan_id?.toLowerCase().includes(lowerQuery) ||
          loan.principal?.toString().includes(lowerQuery)
        );
      }
      
      setLoans(filteredLoans);
      
      // Calculate summary
      calculateSummary(filteredLoans);
    } catch (err: any) {
      console.error('Failed to fetch loans:', err);
      setError(getErrorMessage(err, 'Failed to load loans. Please try again.'));
      setLoans([]);
    } finally {
      setLoading(false);
      setSearching(false);
    }
  }, []);

  // Calculate summary from loans
  const calculateSummary = (loanData: Loan[]) => {
    const activeLoans = loanData.filter((l: Loan) => l.status === 'ACTIVE');
    const settledLoans = loanData.filter((l: Loan) => l.status === 'SETTLED');
    
    const totalOutstanding = activeLoans.reduce((sum: number, l: Loan) => sum + (l.outstanding_balance ?? l.current_outstanding ?? l.total_due), 0);
    const totalRepaid = settledLoans.reduce((sum: number, l: Loan) => sum + l.total_due, 0);
    
    // Find next due date - use outstanding_balance for next payment
    const nextLoan = activeLoans.sort((a: Loan, b: Loan) => 
      new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    )[0];
    
    setSummary({
      active_loans: activeLoans.length,
      total_outstanding: totalOutstanding,
      total_repaid: totalRepaid,
      next_payment: nextLoan ? (nextLoan.outstanding_balance ?? nextLoan.current_outstanding ?? nextLoan.total_due) : 0,
      next_due_date: nextLoan?.due_date || '',
      perfect_repayment_streak: 1,
    });
  };

  // Initial load
  useEffect(() => {
    fetchLoans();
    
    // Set up polling for active loans to update outstanding balances
    const interval = setInterval(() => {
      fetchLoans(debouncedSearch, statusFilter);
    }, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(interval);
  }, [fetchLoans, debouncedSearch, statusFilter]);

  // Handle search with debounce
  useEffect(() => {
    setSearching(true);
    fetchLoans(debouncedSearch, statusFilter);
  }, [debouncedSearch, statusFilter, fetchLoans]);

  // Refresh when page becomes visible (e.g., user returns from payment)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchLoans(debouncedSearch, statusFilter);
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchLoans, debouncedSearch, statusFilter]);

  // Handle payment success - refresh when returning from repay page
  useEffect(() => {
    if (searchParams.get('paymentSuccess') === 'true') {
      fetchLoans(debouncedSearch, statusFilter);
      router.replace('/myloans');
    }
  }, [searchParams, router, fetchLoans, debouncedSearch, statusFilter]);

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchLoans(searchQuery, statusFilter);
    setIsRefreshing(false);
  };

  // Handle export
  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Fetch loans data
      const loans = await loansApi.getAll(0, 100);
      
      if (!loans || loans.length === 0) {
        alert('No loans to export');
        return;
      }
      
      // Calculate summary
      const totalOutstanding = loans.reduce((sum: number, loan: any) => {
        return sum + (loan.total_due || 0);
      }, 0);
      
      const activeLoans = loans.filter((l: any) => l.status === 'ACTIVE').length;
      const pendingLoans = loans.filter((l: any) => l.status === 'PENDING').length;
      const completedLoans = loans.filter((l: any) => l.status === 'PAID' || l.status === 'COMPLETED').length;
      
      const summary = {
        total_outstanding: totalOutstanding,
        active_loans: activeLoans,
        pending_loans: pendingLoans,
        completed_loans: completedLoans,
      };
      
      // Export to PDF
      exportLoansToPDF(loans, summary);
    } catch (err) {
      console.error('Error exporting:', err);
      alert('Failed to export. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Clear search
  const clearSearch = () => {
    setSearchQuery('');
  };

  const formatCurrency = (amount: number) => {
    return `KSh ${(amount || 0).toLocaleString()}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200';
      case 'SETTLED':
        return 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400 border-gray-200';
      case 'DEFAULTED':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200';
      case 'REJECTED':
        return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200';
      case 'PENDING':
        return 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-200';
      default:
        return 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return <Clock className="h-4 w-4 text-green-600" />;
      case 'SETTLED':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'DEFAULTED':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case 'REJECTED':
        return <X className="h-4 w-4 text-red-600" />;
      case 'PENDING':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      default:
        return <Wallet className="h-4 w-4" />;
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600 dark:text-gray-400">Loading your loans...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && loans.length === 0) {
    return (
      <div className="space-y-6">
        <GlassCard>
          <div className="text-center py-12">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Error Loading Loans
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleRefresh}
              className="rounded-xl bg-gradient-to-r from-blue-600 to-emerald-600 px-6 py-3 text-white font-medium"
            >
              Try Again
            </motion.button>
          </div>
        </GlassCard>
      </div>
    );
  }

  const filteredLoans = loans;

  return (
    <div className="space-y-9">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div className="text-center sm:text-left">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            My Loans
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Track and manage your active loans
          </p>
        </div>
        <div className="flex gap-3 justify-center sm:justify-end">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleRefresh}
            disabled={isRefreshing || searching}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all disabled:opacity-50"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">{isExporting ? 'Exporting...' : 'Export'}</span>
          </motion.button>
        </div>
      </motion.div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <GlassCard className="h-full">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 rounded-lg sm:p-3">
                <Wallet className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Active Loans</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                  {summary?.active_loans || 0}
                </p>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <GlassCard className="h-full">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 rounded-lg sm:p-3">
                <DollarSign className="h-5 w-5 sm:h-6 sm:w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Outstanding</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                  {formatCurrency(summary?.total_outstanding || 0)}
                </p>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <GlassCard className="h-full">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 rounded-lg sm:p-3">
                <CheckCircle className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Total Repaid</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                  {formatCurrency(summary?.total_repaid || 0)}
                </p>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <GlassCard className="h-full">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-2 rounded-lg sm:p-3">
                <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Next Due</p>
                <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                  {(summary?.active_loans ?? 0) > 0 ? formatCurrency(summary?.next_payment || 0) : '-'}
                </p>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      </div>

      {/* Next Payment Alert */}
      {summary?.next_due_date && (summary?.active_loans ?? 0) > 0 && (
        <GlassCard>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-500">
                <Calendar className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">
                  Next Payment Due
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {formatCurrency(summary.next_payment)} on {new Date(summary.next_due_date).toLocaleDateString('en-KE')}
                </p>
              </div>
            </div>
            <Link href="/repay">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-emerald-600 text-white font-medium shadow-lg shadow-emerald-500/50"
              >
                <CreditCard className="h-5 w-5" />
                Repay Now
              </motion.button>
            </Link>
          </div>
        </GlassCard>
      )}

      {/* Search and Filter */}
      <GlassCard>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          {/* Search Input */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search loans..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-10 py-2 sm:py-3 rounded-xl bg-white/50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                <X className="h-4 w-4 text-gray-400" />
              </button>
            )}
            {searching && (
              <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
            )}
          </div>
          
          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl bg-white/50 dark:bg-gray-700/50 px-4 py-3 text-gray-900 dark:text-white backdrop-blur-sm outline-none border border-gray-200 dark:border-gray-600"
            >
              <option value="all">All Loans</option>
              <option value="ACTIVE">Active</option>
              <option value="SETTLED">Settled</option>
              <option value="PENDING">Pending</option>
              <option value="DEFAULTED">Defaulted</option>
            </select>
          </div>
        </div>
      </GlassCard>

      {/* Results Count */}
      <div className="text-sm text-gray-600 dark:text-gray-400">
        {searchQuery ? (
          <span>Found {filteredLoans.length} loan{filteredLoans.length !== 1 ? 's' : ''} matching &quot;{searchQuery}&quot;</span>
        ) : (
          <span>Showing {filteredLoans.length} loan{filteredLoans.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Loans List */}
      {filteredLoans.length === 0 ? (
        <GlassCard>
          <div className="text-center py-12">
            <Wallet className="h-16 w-16 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              {searchQuery ? 'No loans found' : 'No loans yet'}
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {searchQuery 
                ? `No loans matching "${searchQuery}". Try a different search term.`
                : "You haven't taken any loans yet"
              }
            </p>
            {!searchQuery && (
              <Link href="/apply">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="rounded-xl bg-gradient-to-r from-blue-600 to-emerald-600 px-6 py-3 text-white font-medium shadow-lg shadow-emerald-500/50"
                >
                  Apply for a Loan
                </motion.button>
              </Link>
            )}
          </div>
        </GlassCard>
      ) : (
        <div className="space-y-4">
          {filteredLoans.map((loan, index) => {
            const dueDate = new Date(loan.due_date);
            const today = new Date();
            const daysRemaining = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            
            return (
              <motion.div
                key={loan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
              >
                <GlassCard className="hover:shadow-xl transition-all duration-300">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    {/* Left: Loan Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                          {loan.loan_id}
                        </h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 ${getStatusColor(loan.status)}`}>
                          {getStatusIcon(loan.status)}
                          {loan.status}
                        </span>
                      </div>

                      {/* Pending status message */}
                      {loan.status === 'PENDING' && (
                        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                          <p className="text-sm text-yellow-800 dark:text-yellow-200">
                            ⏳ Your application is under review. You will be notified once it is approved or if we need additional information.
                          </p>
                        </div>
                      )}

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                        <div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Principal</p>
                          <p className="text-lg font-bold text-gray-900 dark:text-white">
                            {formatCurrency(loan.principal)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Interest</p>
                          <p className="text-lg font-bold text-gray-900 dark:text-white">
                            {loan.interest_rate}%
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Due</p>
                          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(loan.total_due)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Outstanding</p>
                          <p className="text-lg font-bold text-orange-600 dark:text-orange-400">
                            {formatCurrency(loan.outstanding_balance ?? loan.current_outstanding ?? loan.total_due)}
                          </p>
                        </div>
                      </div>

                      {/* Phone number for active loans */}
                      {loan.status === 'ACTIVE' && loan.phone_number && (
                        <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                          <p className="text-xs text-blue-700 dark:text-blue-300 flex items-center gap-1">
                            📱 Registered phone: {maskPhoneNumber(loan.phone_number)} (use for repayment)
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Right: Dates & Action */}
                    <div className="flex flex-col sm:flex-row lg:flex-col gap-4 lg:items-end">
                      <div className="flex gap-6 sm:gap-8 lg:gap-0 lg:flex-col lg:space-y-2">
                        <div className="text-right lg:text-left">
                          <p className="text-sm text-gray-600 dark:text-gray-400">Due Date</p>
                          <p className={`font-medium ${daysRemaining <= 3 && loan.status === 'ACTIVE' ? 'text-orange-600' : 'text-gray-900 dark:text-white'}`}>
                            {dueDate.toLocaleDateString('en-KE')}
                          </p>
                        </div>
                        {loan.status === 'ACTIVE' && daysRemaining > 0 && (
                          <div className="text-right lg:text-left">
                            <p className="text-sm text-gray-600 dark:text-gray-400">Days Remaining</p>
                            <p className={`font-bold ${daysRemaining <= 3 ? 'text-orange-600' : 'text-emerald-600'}`}>
                              {daysRemaining} days
                            </p>
                          </div>
                        )}
                      </div>

                      {loan.status === 'ACTIVE' && (
                        <Link href="/repay">
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 text-white font-medium shadow-lg shadow-emerald-500/50"
                          >
                            <CreditCard className="h-5 w-5" />
                            Repay
                            <ArrowRight className="h-4 w-4" />
                          </motion.button>
                        </Link>
                      )}
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Payment Streak */}
      {summary && summary.perfect_repayment_streak > 0 && (
        <GlassCard>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-gradient-to-br from-yellow-400 to-orange-500">
                <CheckCircle className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">
                  Perfect Repayment Streak
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {summary.perfect_repayment_streak} on-time payments
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Keep it up!</p>
              <p className="text-lg font-bold text-emerald-600">+40 credit points</p>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
