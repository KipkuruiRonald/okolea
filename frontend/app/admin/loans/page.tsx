'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AdminLayout from '@/components/AdminLayout';
import { 
  Search, 
  Eye, 
  AlertTriangle, 
  CheckCircle,
  XCircle,
  Loader2,
  DollarSign,
  Calendar,
  TrendingUp,
  Send,
  User,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface Loan {
  id: number;
  loan_id: string;
  borrower_id: number;
  borrower_name: string;
  borrower_email?: string;
  borrower_phone?: string;
  principal: number;
  interest_rate: number;
  term_days: number;
  total_due: number;
  outstanding_balance: number;
  phone_number: string;
  status: 'PENDING' | 'ACTIVE' | 'SETTLED' | 'REJECTED' | 'DEFAULTED';
  due_date: string;
  created_at: string;
  updated_at?: string;
  payment_date?: string;
  late_days: number;
  perfect_repayment?: boolean;
}

type TabType = 'all' | 'pending' | 'active' | 'settled' | 'defaulted';

export default function LoanMonitoringPage() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [filteredLoans, setFilteredLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [processing, setProcessing] = useState(false);
  const [sendingReminder, setSendingReminder] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Fetch loans from API
  useEffect(() => {
    const fetchLoans = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const res = await fetch('http://localhost:8000/api/admin/loans', {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          // Handle both array and paginated responses
          const loansData = Array.isArray(data) ? data : data.items || [];
          setLoans(loansData);
          setFilteredLoans(loansData);
        }
      } catch (err) {
        console.error('Failed to fetch loans:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLoans();
  }, []);

  // Filter loans
  useEffect(() => {
    let filtered = loans;

    // Filter by tab
    if (activeTab !== 'all') {
      filtered = filtered.filter(loan => loan.status === activeTab.toUpperCase());
    }

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(loan =>
        loan.borrower_name.toLowerCase().includes(query) ||
        loan.loan_id?.toLowerCase().includes(query) ||
        loan.borrower_phone?.includes(query)
      );
    }

    setFilteredLoans(filtered);
    setCurrentPage(1); // Reset to first page on filter change
  }, [activeTab, searchQuery, loans]);

  // Pagination
  const totalPages = Math.ceil(filteredLoans.length / itemsPerPage);
  const paginatedLoans = filteredLoans.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Handle mark as default
  const handleMarkDefault = async (loanId: number) => {
    setProcessing(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`http://localhost:8000/api/admin/loans/${loanId}/mark-default`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        setLoans(prev => prev.map(l => 
          l.id === loanId ? { ...l, status: 'DEFAULTED' } : l
        ));
        setSelectedLoan(null);
      }
    } catch (err) {
      console.error('Failed to mark as default:', err);
    } finally {
      setProcessing(false);
    }
  };

  // Handle send reminder
  const handleSendReminder = async (loanId: number) => {
    setSendingReminder(loanId);
    try {
      const token = localStorage.getItem('access_token');
      await fetch(`http://localhost:8000/api/admin/loans/${loanId}/remind`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      alert('Reminder sent successfully!');
    } catch (err) {
      console.error('Failed to send reminder:', err);
      alert('Failed to send reminder');
    } finally {
      setSendingReminder(null);
    }
  };

  const getStatusColor = (loan: Loan): string => {
    switch (loan.status) {
      case 'DEFAULTED':
        return '#3E3D39';
      case 'REJECTED':
        return '#3E3D39';
      case 'ACTIVE':
        return loan.late_days > 0 ? '#CABAA1' : '#6D7464';
      case 'PENDING':
        return '#CABAA1';
      case 'SETTLED':
        return '#6D7464';
      default:
        return '#6D7464';
    }
  };

  const getStatusLabel = (loan: Loan): string => {
    if (loan.status === 'ACTIVE' && loan.late_days > 0) {
      return `Late (${loan.late_days} day${loan.late_days > 1 ? 's' : ''})`;
    }
    if (loan.status === 'PENDING') return 'Pending';
    if (loan.status === 'ACTIVE') return 'Active';
    if (loan.status === 'SETTLED') return 'Settled';
    if (loan.status === 'DEFAULTED') return 'Defaulted';
    if (loan.status === 'REJECTED') return 'Rejected';
    return loan.status;
  };

  // Calculate real stats from loan data
  const totalPrincipal = loans.reduce((sum, loan) => sum + loan.principal, 0);
  const totalOutstanding = loans.reduce((sum, loan) => sum + (loan.outstanding_balance || 0), 0);
  const activeLateCount = loans.filter(l => l.status === 'ACTIVE' && l.late_days > 0).length;

  const stats = [
    { 
      label: 'Total Disbursed', 
      value: `KSh ${(totalPrincipal / 1000000).toFixed(1)}M`, 
      icon: DollarSign 
    },
    { 
      label: 'Outstanding', 
      value: `KSh ${(totalOutstanding / 1000000).toFixed(1)}M`, 
      icon: TrendingUp 
    },
    { 
      label: 'Active Loans', 
      value: loans.filter(l => l.status === 'ACTIVE').length.toString(), 
      icon: CheckCircle 
    },
    { 
      label: 'Late Payments', 
      value: activeLateCount.toString(), 
      icon: AlertTriangle 
    },
  ];

  const tabs: { id: TabType; label: string; count: number }[] = [
    { id: 'all', label: 'All Loans', count: loans.length },
    { id: 'pending', label: 'Pending', count: loans.filter(l => l.status === 'PENDING').length },
    { id: 'active', label: 'Active', count: loans.filter(l => l.status === 'ACTIVE').length },
    { id: 'settled', label: 'Settled', count: loans.filter(l => l.status === 'SETTLED').length },
    { id: 'defaulted', label: 'Defaulted', count: loans.filter(l => l.status === 'DEFAULTED').length },
  ];

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#3E3D39' }} />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#050505' }}>
              Loan Monitoring
            </h1>
            <p className="text-sm mt-1" style={{ color: '#3E3D39' }}>
              Track and manage all loan accounts
            </p>
          </div>
          <div className="flex gap-2">
            <span 
              className="px-3 py-1.5 rounded-xl text-sm font-medium"
              style={{ backgroundColor: '#D5BFA4', color: '#050505' }}
            >
              {filteredLoans.length} Loans
            </span>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="rounded-xl p-4"
              style={{ backgroundColor: '#D5BFA4', border: '1px solid #B4A58B' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <stat.icon className="w-4 h-4" style={{ color: '#3E3D39' }} />
                <p className="text-xs" style={{ color: '#6D7464' }}>{stat.label}</p>
              </div>
              <p className="text-xl font-bold" style={{ color: '#050505' }}>{stat.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors"
              style={{
                backgroundColor: activeTab === tab.id ? '#3E3D39' : '#D5BFA4',
                color: activeTab === tab.id ? '#D4C8B5' : '#050505',
                border: activeTab === tab.id ? 'none' : '1px solid #B4A58B',
              }}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {/* Search */}
        <div 
          className="flex items-center gap-2 px-4 py-3 rounded-xl"
          style={{ backgroundColor: '#D5BFA4', border: '1px solid #B4A58B' }}
        >
          <Search className="w-5 h-5" style={{ color: '#6D7464' }} />
          <input
            type="text"
            placeholder="Search by name, loan ID, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: '#050505' }}
          />
        </div>

        {/* Loans Table */}
        <div 
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: '#D5BFA4', border: '1px solid #B4A58B' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: '#C4A995' }}>
                  <th className="text-left p-4 text-sm font-medium" style={{ color: '#050505' }}>Borrower</th>
                  <th className="text-left p-4 text-sm font-medium" style={{ color: '#050505' }}>Principal</th>
                  <th className="text-left p-4 text-sm font-medium" style={{ color: '#050505' }}>Outstanding</th>
                  <th className="text-left p-4 text-sm font-medium" style={{ color: '#050505' }}>Due Date</th>
                  <th className="text-left p-4 text-sm font-medium" style={{ color: '#050505' }}>Late Days</th>
                  <th className="text-left p-4 text-sm font-medium" style={{ color: '#050505' }}>Status</th>
                  <th className="text-right p-4 text-sm font-medium" style={{ color: '#050505' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLoans.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center" style={{ color: '#6D7464' }}>
                      No loans found
                    </td>
                  </tr>
                ) : (
                  paginatedLoans.map((loan) => (
                    <motion.tr
                      key={loan.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="border-t"
                      style={{ borderColor: '#B4A58B' }}
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-10 h-10 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: '#CABAA1' }}
                          >
                            <User className="w-5 h-5" style={{ color: '#050505' }} />
                          </div>
                          <div>
                            <p className="text-sm font-medium" style={{ color: '#050505' }}>
                              {loan.borrower_name}
                            </p>
                            <p className="text-xs" style={{ color: '#6D7464' }}>
                              {loan.loan_id}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <p className="text-sm" style={{ color: '#050505' }}>
                          KSh {loan.principal?.toLocaleString()}
                        </p>
                      </td>
                      <td className="p-4">
                        <p className="text-sm font-medium" style={{ color: '#050505' }}>
                          KSh {loan.outstanding_balance?.toLocaleString()}
                        </p>
                      </td>
                      <td className="p-4">
                        <p className="text-sm" style={{ color: '#050505' }}>
                          {loan.due_date ? new Date(loan.due_date).toLocaleDateString() : '-'}
                        </p>
                      </td>
                      <td className="p-4">
                        <p className="text-sm font-medium" style={{ color: loan.late_days > 0 ? '#3E3D39' : '#050505' }}>
                          {loan.late_days || 0}
                        </p>
                      </td>
                      <td className="p-4">
                        <span 
                          className="px-2 py-1 rounded-lg text-xs font-medium"
                          style={{ backgroundColor: getStatusColor(loan), color: '#D4C8B5' }}
                        >
                          {getStatusLabel(loan)}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleSendReminder(loan.id)}
                            disabled={sendingReminder === loan.id}
                            className="p-2 rounded-lg transition-colors hover:opacity-80"
                            style={{ backgroundColor: '#CABAA1', color: '#050505' }}
                            title="Send Reminder"
                          >
                            {sendingReminder === loan.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => setSelectedLoan(loan)}
                            className="p-2 rounded-lg transition-colors hover:opacity-80"
                            style={{ backgroundColor: '#CABAA1', color: '#050505' }}
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: '#6D7464' }}>
              Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredLoans.length)} of {filteredLoans.length} loans
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg transition-colors"
                style={{ 
                  backgroundColor: currentPage === 1 ? '#C4A995' : '#D5BFA4',
                  color: currentPage === 1 ? '#6D7464' : '#050505',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                }}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className="w-10 h-10 rounded-lg text-sm font-medium transition-colors"
                  style={{ 
                    backgroundColor: currentPage === page ? '#3E3D39' : '#D5BFA4',
                    color: currentPage === page ? '#D4C8B5' : '#050505'
                  }}
                >
                  {page}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg transition-colors"
                style={{ 
                  backgroundColor: currentPage === totalPages ? '#C4A995' : '#D5BFA4',
                  color: currentPage === totalPages ? '#6D7464' : '#050505',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                }}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Detail Modal */}
        <AnimatePresence>
          {selectedLoan && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
              onClick={() => setSelectedLoan(null)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-lg rounded-2xl shadow-xl overflow-hidden"
                style={{ backgroundColor: '#D5BFA4' }}
              >
                <div className="p-6" style={{ borderBottom: '1px solid #B4A58B' }}>
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold" style={{ color: '#050505' }}>
                      Loan Details
                    </h2>
                    <button
                      onClick={() => setSelectedLoan(null)}
                      className="p-2 rounded-xl"
                      style={{ backgroundColor: '#C4A995' }}
                    >
                      <XCircle className="w-5 h-5" style={{ color: '#6D7464' }} />
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  {/* Borrower Info */}
                  <div 
                    className="p-4 rounded-xl"
                    style={{ backgroundColor: '#C4A995' }}
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-12 h-12 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: '#CABAA1' }}
                      >
                        <User className="w-6 h-6" style={{ color: '#050505' }} />
                      </div>
                      <div>
                        <p className="font-medium" style={{ color: '#050505' }}>
                          {selectedLoan.borrower_name}
                        </p>
                        <p className="text-sm" style={{ color: '#6D7464' }}>
                          {selectedLoan.loan_id}
                        </p>
                      </div>
                      <span 
                        className="ml-auto px-2 py-1 rounded-lg text-xs font-medium"
                        style={{ backgroundColor: getStatusColor(selectedLoan), color: '#D4C8B5' }}
                      >
                        {getStatusLabel(selectedLoan)}
                      </span>
                    </div>
                  </div>

                  {/* Loan Details Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl" style={{ backgroundColor: '#C4A995' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <DollarSign className="w-4 h-4" style={{ color: '#3E3D39' }} />
                        <span className="text-xs font-medium" style={{ color: '#6D7464' }}>Principal</span>
                      </div>
                      <p className="text-lg font-bold" style={{ color: '#050505' }}>
                        KSh {selectedLoan.principal?.toLocaleString()}
                      </p>
                    </div>
                    <div className="p-4 rounded-xl" style={{ backgroundColor: '#C4A995' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4" style={{ color: '#3E3D39' }} />
                        <span className="text-xs font-medium" style={{ color: '#6D7464' }}>Outstanding</span>
                      </div>
                      <p className="text-lg font-bold" style={{ color: '#050505' }}>
                        KSh {selectedLoan.outstanding_balance?.toLocaleString()}
                      </p>
                    </div>
                    <div className="p-4 rounded-xl" style={{ backgroundColor: '#C4A995' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="w-4 h-4" style={{ color: '#3E3D39' }} />
                        <span className="text-xs font-medium" style={{ color: '#6D7464' }}>Interest Rate</span>
                      </div>
                      <p className="text-lg font-bold" style={{ color: '#050505' }}>
                        {selectedLoan.interest_rate}%
                      </p>
                    </div>
                    <div className="p-4 rounded-xl" style={{ backgroundColor: '#C4A995' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="w-4 h-4" style={{ color: '#3E3D39' }} />
                        <span className="text-xs font-medium" style={{ color: '#6D7464' }}>Term Days</span>
                      </div>
                      <p className="text-lg font-bold" style={{ color: '#050505' }}>
                        {selectedLoan.term_days} days
                      </p>
                    </div>
                    <div className="p-4 rounded-xl" style={{ backgroundColor: '#C4A995' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="w-4 h-4" style={{ color: '#3E3D39' }} />
                        <span className="text-xs font-medium" style={{ color: '#6D7464' }}>Due Date</span>
                      </div>
                      <p className="text-lg font-bold" style={{ color: '#050505' }}>
                        {selectedLoan.due_date ? new Date(selectedLoan.due_date).toLocaleDateString() : '-'}
                      </p>
                    </div>
                    <div className="p-4 rounded-xl" style={{ backgroundColor: '#C4A995' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4" style={{ color: '#3E3D39' }} />
                        <span className="text-xs font-medium" style={{ color: '#6D7464' }}>Late Days</span>
                      </div>
                      <p className="text-lg font-bold" style={{ color: selectedLoan.late_days > 0 ? '#3E3D39' : '#6D7464' }}>
                        {selectedLoan.late_days || 0}
                      </p>
                    </div>
                  </div>

                  {/* Phone Number */}
                  <div className="p-4 rounded-xl" style={{ backgroundColor: '#C4A995' }}>
                    <p className="text-sm font-medium" style={{ color: '#050505' }}>Phone Number</p>
                    <p className="text-lg" style={{ color: '#6D7464' }}>
                      {selectedLoan.phone_number || selectedLoan.borrower_phone || '-'}
                    </p>
                  </div>

                  {/* Late Days Action */}
                  {selectedLoan.status === 'ACTIVE' && selectedLoan.late_days > 0 && (
                    <div className="p-4 rounded-xl" style={{ backgroundColor: '#C4A995' }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium" style={{ color: '#050505' }}>
                            This loan is {selectedLoan.late_days} day{selectedLoan.late_days > 1 ? 's' : ''} overdue
                          </p>
                        </div>
                        <button
                          onClick={() => handleMarkDefault(selectedLoan.id)}
                          disabled={processing}
                          className="px-4 py-2 rounded-xl text-sm font-medium"
                          style={{ backgroundColor: '#3E3D39', color: '#D4C8B5' }}
                        >
                          {processing ? 'Processing...' : 'Mark Default'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="p-6 pt-0 flex gap-3">
                  <button
                    onClick={() => handleSendReminder(selectedLoan.id)}
                    disabled={sendingReminder === selectedLoan.id}
                    className="flex-1 py-3 rounded-xl font-medium transition-colors hover:opacity-80 flex items-center justify-center gap-2"
                    style={{ backgroundColor: '#C4A995', color: '#050505' }}
                  >
                    {sendingReminder === selectedLoan.id ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                    Send Reminder
                  </button>
                  <button
                    onClick={() => setSelectedLoan(null)}
                    className="flex-1 py-3 rounded-xl font-medium transition-colors hover:opacity-80"
                    style={{ backgroundColor: '#3E3D39', color: '#D4C8B5' }}
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AdminLayout>
  );
}
