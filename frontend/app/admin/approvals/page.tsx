'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import AdminLayout from '@/components/AdminLayout';
import { 
  Search, 
  Filter, 
  CheckCircle, 
  XCircle, 
  Eye, 
  FileText,
  Loader2,
  User,
  DollarSign,
  Calendar,
  TrendingUp,
  AlertTriangle,
  RefreshCw,
  Send,
  Check,
  X,
  Clock
} from 'lucide-react';

interface LoanApplication {
  id: number;
  loan_id: string;
  borrower_name: string;
  borrower_id?: number;
  principal: number;
  interest_rate: number;
  tenure_months: number;
  monthly_emi: number;
  status: string;
  risk_score?: number;
  risk_grade?: string;
  submitted_at?: string;
  borrower?: {
    full_name: string;
    email: string;
  };
}

export default function PendingApprovalsPage() {
  const [applications, setApplications] = useState<LoanApplication[]>([]);
  const [filteredApps, setFilteredApps] = useState<LoanApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedApp, setSelectedApp] = useState<LoanApplication | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [filterRisk, setFilterRisk] = useState<string>('all');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectingAppId, setRejectingAppId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Fetch applications from API
  const fetchApplications = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch('http://localhost:8000/api/admin/pending-approvals', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setApplications(data);
        setFilteredApps(data);
      }
    } catch (err) {
      console.error('Failed to fetch applications:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, []);

  // Filter applications
  useEffect(() => {
    let filtered = applications;

    // Filter by risk
    if (filterRisk !== 'all') {
      if (filterRisk === 'low') {
        filtered = filtered.filter(app => (app.risk_score || 0) >= 70);
      } else if (filterRisk === 'medium') {
        filtered = filtered.filter(app => (app.risk_score || 0) >= 50 && (app.risk_score || 0) < 70);
      } else if (filterRisk === 'high') {
        filtered = filtered.filter(app => (app.risk_score || 0) < 50);
      }
    }

    // Filter by search
    if (searchQuery) {
      filtered = filtered.filter(app =>
        app.borrower_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.loan_id?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    setFilteredApps(filtered);
  }, [searchQuery, filterRisk, applications]);

  // Handle refresh
  const handleRefresh = () => {
    setRefreshing(true);
    fetchApplications();
  };

  // Handle approve
  const handleApprove = async (appId: number) => {
    setProcessingId(appId);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`http://localhost:8000/api/admin/loans/${appId}/approve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        // Add a small delay to ensure database transaction completes
        await new Promise(resolve => setTimeout(resolve, 300));
        // Refresh the data
        await fetchApplications();
        setApplications(prev => prev.filter(app => app.id !== appId));
        setSelectedApp(null);
        setToast({ message: 'Loan approved successfully! Borrower has been notified.', type: 'success' });
        setTimeout(() => setToast(null), 3000);
      }
    } catch (err) {
      console.error('Failed to approve:', err);
      setToast({ message: 'Failed to approve loan', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setProcessingId(null);
    }
  };

  // Open reject modal
  const openRejectModal = (appId: number) => {
    setRejectingAppId(appId);
    setRejectReason('');
    setShowRejectModal(true);
  };

  // Handle reject with reason
  const handleReject = async () => {
    if (!rejectingAppId) return;
    setProcessingId(rejectingAppId);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`http://localhost:8000/api/admin/loans/${rejectingAppId}/reject`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: rejectReason })
      });
      if (res.ok) {
        // Add a small delay to ensure database transaction completes
        await new Promise(resolve => setTimeout(resolve, 300));
        // Refresh the data
        await fetchApplications();
        setApplications(prev => prev.filter(app => app.id !== rejectingAppId));
        setSelectedApp(null);
        setShowRejectModal(false);
        setToast({ message: 'Loan rejected successfully. Feedback sent to borrower.', type: 'success' });
        setTimeout(() => setToast(null), 3000);
      }
    } catch (err) {
      console.error('Failed to reject:', err);
      setToast({ message: 'Failed to reject loan', type: 'error' });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setProcessingId(null);
      setRejectingAppId(null);
    }
  };

  // Handle bulk approve
  const handleBulkApprove = async () => {
    setProcessingId(-1);
    try {
      const token = localStorage.getItem('access_token');
      const successIds: number[] = [];
      const failedItems: { loanId: number; error: string }[] = [];
      
      // Process loans sequentially with individual error handling
      for (const app of filteredApps) {
        try {
          const response = await fetch(`http://localhost:8000/api/admin/loans/${app.id}/approve`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
          });
          
          if (response.ok) {
            successIds.push(app.id);
          } else {
            const errorText = await response.text();
            failedItems.push({ loanId: app.id, error: errorText });
            console.error(`Loan ${app.id} failed:`, errorText);
          }
          
          // Small delay between approvals to avoid race conditions
          await new Promise(resolve => setTimeout(resolve, 200));
          
        } catch (err: any) {
          failedItems.push({ loanId: app.id, error: err?.message || 'Unknown error' });
          console.error(`Loan ${app.id} error:`, err);
        }
      }
      
      // Add delay to ensure database transactions complete
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Refresh the data
      await fetchApplications();
      
      // Show result summary
      if (failedItems.length > 0) {
        console.error('Failed approvals:', failedItems);
      }
      
    } catch (err: any) {
      console.error('Failed to bulk approve:', err);
    } finally {
      setProcessingId(null);
    }
  };

  const getRiskColor = (score?: number) => {
    if (!score) return '#6D7464';
    if (score >= 70) return '#6D7464';
    if (score >= 50) return '#CABAA1';
    return '#3E3D39';
  };

  const getRiskLabel = (score?: number) => {
    if (!score) return 'N/A';
    if (score >= 70) return 'Low Risk';
    if (score >= 50) return 'Medium Risk';
    return 'High Risk';
  };

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
        {/* Toast notification */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          } text-white`}>
            {toast.message}
          </div>
        )}

        {/* Reject Modal */}
        {showRejectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4 shadow-2xl">
              <h3 className="text-xl font-bold mb-4" style={{ color: '#050505' }}>
                Reject Loan Application
              </h3>
              <p className="mb-4 text-sm" style={{ color: '#3E3D39' }}>
                Please provide a reason for rejecting this loan application. This will be sent to the borrower.
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter rejection reason..."
                className="w-full px-4 py-3 rounded-xl border resize-none"
                style={{ borderColor: '#D4C8B5', minHeight: '120px' }}
                autoFocus
              />
              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={() => setShowRejectModal(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium"
                  style={{ backgroundColor: '#E5E0D8', color: '#050505' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={processingId !== null}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-white"
                  style={{ backgroundColor: '#3E3D39' }}
                >
                  {processingId ? 'Rejecting...' : 'Reject Loan'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#050505' }}>
              Pending Approvals
            </h1>
            <p className="text-sm mt-1" style={{ color: '#3E3D39' }}>
              Review and approve loan applications
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors hover:opacity-80"
              style={{ backgroundColor: '#D5BFA4', color: '#050505', border: '1px solid #B4A58B' }}
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {filteredApps.length > 0 && (
              <button
                onClick={handleBulkApprove}
                disabled={processingId !== null}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors hover:opacity-80"
                style={{ backgroundColor: '#6D7464', color: '#D4C8B5' }}
              >
                <Check className="w-4 h-4" />
                Approve All ({filteredApps.length})
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Pending', value: applications.length, icon: Clock, color: '#CABAA1' },
            { label: 'Low Risk', value: applications.filter(a => (a.risk_score || 0) >= 70).length, icon: CheckCircle, color: '#6D7464' },
            { label: 'Medium Risk', value: applications.filter(a => (a.risk_score || 0) >= 50 && (a.risk_score || 0) < 70).length, icon: AlertTriangle, color: '#CABAA1' },
            { label: 'High Risk', value: applications.filter(a => (a.risk_score || 0) < 50).length, icon: XCircle, color: '#3E3D39' },
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="rounded-xl p-4"
              style={{ backgroundColor: '#D5BFA4', border: '1px solid #B4A58B' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <stat.icon className="w-4 h-4" style={{ color: stat.color }} />
                <p className="text-xs" style={{ color: '#6D7464' }}>{stat.label}</p>
              </div>
              <p className="text-2xl font-bold" style={{ color: '#050505' }}>{stat.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div 
            className="flex-1 flex items-center gap-2 px-4 py-3 rounded-xl"
            style={{ backgroundColor: '#D5BFA4', border: '1px solid #B4A58B' }}
          >
            <Search className="w-5 h-5" style={{ color: '#6D7464' }} />
            <input
              type="text"
              placeholder="Search by name or loan ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: '#050505' }}
            />
          </div>
          <select
            value={filterRisk}
            onChange={(e) => setFilterRisk(e.target.value)}
            className="px-4 py-3 rounded-xl text-sm outline-none"
            style={{ backgroundColor: '#D5BFA4', color: '#050505', border: '1px solid #B4A58B' }}
          >
            <option value="all">All Risk Levels</option>
            <option value="low">Low Risk (70+)</option>
            <option value="medium">Medium Risk (50-69)</option>
            <option value="high">High Risk (&lt;50)</option>
          </select>
        </div>

        {/* Applications Table */}
        <div 
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: '#D5BFA4', border: '1px solid #B4A58B' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ backgroundColor: '#C4A995' }}>
                  <th className="text-left p-4 text-sm font-medium" style={{ color: '#050505' }}>Borrower</th>
                  <th className="text-left p-4 text-sm font-medium" style={{ color: '#050505' }}>Amount</th>
                  <th className="text-left p-4 text-sm font-medium" style={{ color: '#050505' }}>Tenure</th>
                  <th className="text-left p-4 text-sm font-medium" style={{ color: '#050505' }}>EMI</th>
                  <th className="text-left p-4 text-sm font-medium" style={{ color: '#050505' }}>Risk Score</th>
                  <th className="text-left p-4 text-sm font-medium" style={{ color: '#050505' }}>Submitted</th>
                  <th className="text-right p-4 text-sm font-medium" style={{ color: '#050505' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredApps.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center" style={{ color: '#6D7464' }}>
                      No pending applications found
                    </td>
                  </tr>
                ) : (
                  filteredApps.map((app) => (
                    <motion.tr
                      key={app.id}
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
                              {app.borrower_name}
                            </p>
                            <p className="text-xs" style={{ color: '#6D7464' }}>
                              {app.loan_id}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <p className="text-sm font-medium" style={{ color: '#050505' }}>
                          KSh {app.principal?.toLocaleString()}
                        </p>
                      </td>
                      <td className="p-4">
                        <p className="text-sm" style={{ color: '#050505' }}>
                          {app.tenure_months} months
                        </p>
                      </td>
                      <td className="p-4">
                        <p className="text-sm" style={{ color: '#050505' }}>
                          KSh {app.monthly_emi?.toLocaleString()}
                        </p>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div 
                            className="px-2 py-1 rounded-lg text-xs font-bold"
                            style={{ backgroundColor: getRiskColor(app.risk_score), color: '#D4C8B5' }}
                          >
                            {app.risk_score || 'N/A'}
                          </div>
                          <span className="text-xs" style={{ color: getRiskColor(app.risk_score) }}>
                            {getRiskLabel(app.risk_score)}
                          </span>
                        </div>
                      </td>
                      <td className="p-4">
                        <p className="text-xs" style={{ color: '#6D7464' }}>
                          {app.submitted_at ? new Date(app.submitted_at).toLocaleDateString() : 'Recently'}
                        </p>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSelectedApp(app)}
                            className="p-2 rounded-lg transition-colors hover:opacity-80"
                            style={{ backgroundColor: '#CABAA1', color: '#050505' }}
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleApprove(app.id)}
                            disabled={processingId === app.id}
                            className="p-2 rounded-lg transition-colors hover:opacity-80"
                            style={{ backgroundColor: '#6D7464', color: '#D4C8B5' }}
                            title="Approve"
                          >
                            {processingId === app.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => openRejectModal(app.id)}
                            disabled={processingId === app.id}
                            className="p-2 rounded-lg transition-colors hover:opacity-80"
                            style={{ backgroundColor: '#3E3D39', color: '#D4C8B5' }}
                            title="Reject"
                          >
                            {processingId === app.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <XCircle className="w-4 h-4" />
                            )}
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

        {/* Detail Modal */}
        <AnimatePresence>
          {selectedApp && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
              onClick={() => setSelectedApp(null)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-lg rounded-2xl overflow-hidden"
                style={{ backgroundColor: '#D5BFA4' }}
              >
                <div className="p-6" style={{ borderBottom: '1px solid #B4A58B' }}>
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold" style={{ color: '#050505' }}>
                      Loan Application Details
                    </h2>
                    <button
                      onClick={() => setSelectedApp(null)}
                      className="p-2 rounded-xl"
                      style={{ backgroundColor: '#C4A995' }}
                    >
                      <XCircle className="w-5 h-5" style={{ color: '#6D7464' }} />
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  {/* Borrower Info */}
                  <div className="p-4 rounded-xl" style={{ backgroundColor: '#C4A995' }}>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#CABAA1' }}>
                        <User className="w-6 h-6" style={{ color: '#050505' }} />
                      </div>
                      <div>
                        <p className="font-medium" style={{ color: '#050505' }}>{selectedApp.borrower_name}</p>
                        <p className="text-sm" style={{ color: '#6D7464' }}>{selectedApp.borrower?.email || selectedApp.loan_id}</p>
                      </div>
                    </div>
                  </div>

                  {/* Loan Details */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl" style={{ backgroundColor: '#C4A995' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <DollarSign className="w-4 h-4" style={{ color: '#3E3D39' }} />
                        <span className="text-xs font-medium" style={{ color: '#6D7464' }}>Principal</span>
                      </div>
                      <p className="text-lg font-bold" style={{ color: '#050505' }}>KSh {selectedApp.principal?.toLocaleString()}</p>
                    </div>
                    <div className="p-4 rounded-xl" style={{ backgroundColor: '#C4A995' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="w-4 h-4" style={{ color: '#3E3D39' }} />
                        <span className="text-xs font-medium" style={{ color: '#6D7464' }}>Tenure</span>
                      </div>
                      <p className="text-lg font-bold" style={{ color: '#050505' }}>{selectedApp.tenure_months} months</p>
                    </div>
                    <div className="p-4 rounded-xl" style={{ backgroundColor: '#C4A995' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4" style={{ color: '#3E3D39' }} />
                        <span className="text-xs font-medium" style={{ color: '#6D7464' }}>Interest Rate</span>
                      </div>
                      <p className="text-lg font-bold" style={{ color: '#050505' }}>{selectedApp.interest_rate}%</p>
                    </div>
                    <div className="p-4 rounded-xl" style={{ backgroundColor: '#C4A995' }}>
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="w-4 h-4" style={{ color: '#3E3D39' }} />
                        <span className="text-xs font-medium" style={{ color: '#6D7464' }}>Monthly EMI</span>
                      </div>
                      <p className="text-lg font-bold" style={{ color: '#050505' }}>KSh {selectedApp.monthly_emi?.toLocaleString()}</p>
                    </div>
                  </div>

                  {/* Risk Assessment */}
                  <div className="p-4 rounded-xl" style={{ backgroundColor: '#C4A995' }}>
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle className="w-4 h-4" style={{ color: getRiskColor(selectedApp.risk_score) }} />
                      <span className="text-sm font-medium" style={{ color: '#050505' }}>Risk Assessment</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-2xl font-bold" style={{ color: getRiskColor(selectedApp.risk_score) }}>
                          {selectedApp.risk_score || 'N/A'}
                        </p>
                        <p className="text-xs" style={{ color: '#6D7464' }}>Risk Score</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold" style={{ color: getRiskColor(selectedApp.risk_score) }}>
                          {selectedApp.risk_grade || getRiskLabel(selectedApp.risk_score)}
                        </p>
                        <p className="text-xs" style={{ color: '#6D7464' }}>Risk Grade</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="p-6 pt-0 flex gap-3">
                  <button
                    onClick={() => openRejectModal(selectedApp.id)}
                    disabled={processingId === selectedApp.id}
                    className="flex-1 py-3 rounded-xl font-medium transition-colors hover:opacity-80 flex items-center justify-center gap-2"
                    style={{ backgroundColor: '#3E3D39', color: '#D4C8B5' }}
                  >
                    {processingId === selectedApp.id ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <XCircle className="w-5 h-5" />
                    )}
                    Reject
                  </button>
                  <button
                    onClick={() => handleApprove(selectedApp.id)}
                    disabled={processingId === selectedApp.id}
                    className="flex-1 py-3 rounded-xl font-medium transition-colors hover:opacity-80 flex items-center justify-center gap-2"
                    style={{ backgroundColor: '#6D7464', color: '#D4C8B5' }}
                  >
                    {processingId === selectedApp.id ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <CheckCircle className="w-5 h-5" />
                    )}
                    Approve
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
