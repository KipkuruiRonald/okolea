'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import AdminLayout from '@/components/AdminLayout';
import { 
  Users, 
  FileText, 
  TrendingUp, 
  DollarSign, 
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Send,
  Phone,
  Eye,
  Loader2,
  RefreshCw,
  Activity,
  Shield,
  CreditCard,
  BarChart3
} from 'lucide-react';

// Types
interface AdminStats {
  active_loans: number;
  pending_approvals: number;
  total_users: number;
  default_rate: number;
  portfolio_value: number;
  disbursed_today: number;
}

interface PendingApproval {
  id: number;
  loan_id: string;
  borrower_name: string;
  principal: number;
  status: string;
  submitted_at: string;
}

interface ActivityItem {
  id: number;
  action: string;
  title: string;
  description: string;
  user_name?: string;
  created_at: string;
}

// Audit log interface based on your model
interface AuditLog {
  id: number;
  loan_id: number | null;
  user_id: number | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value: string | null;
  new_value: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch data from API
  const fetchData = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      // Fetch stats
      const statsRes = await fetch('http://localhost:8000/api/admin/stats', { headers });
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      } else {
        console.error('Stats fetch failed:', await statsRes.text());
      }

      // Fetch pending approvals
      const approvalsRes = await fetch('http://localhost:8000/api/admin/pending-approvals', { headers });
      if (approvalsRes.ok) {
        const approvalsData = await approvalsRes.json();
        // Check if response is array or has items property
        if (Array.isArray(approvalsData)) {
          setPendingApprovals(approvalsData.slice(0, 5));
        } else if (approvalsData.items && Array.isArray(approvalsData.items)) {
          setPendingApprovals(approvalsData.items.slice(0, 5));
        } else {
          setPendingApprovals([]);
        }
      } else {
        console.error('Approvals fetch failed:', await approvalsRes.text());
      }

      // Fetch audit logs for activity
      const logsRes = await fetch('http://localhost:8000/api/admin/audit-logs?limit=5', { headers });
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        console.log('Audit logs response:', logsData); // Debug log
        
        // Handle different response formats
        let logsArray: AuditLog[] = [];
        
        if (logsData.items && Array.isArray(logsData.items)) {
          logsArray = logsData.items;
        } else if (Array.isArray(logsData)) {
          logsArray = logsData;
        } else if (logsData && typeof logsData === 'object') {
          logsArray = [logsData];
        }
        
        // Transform to activity items
        const activityItems = logsArray.map((log: AuditLog) => ({
          id: log.id,
          action: log.action,
          title: log.action.replace(/_/g, ' '),
          description: generateDescription(log),
          user_name: log.user_id ? `User #${log.user_id}` : 'System',
          created_at: formatTimeAgo(log.created_at),
        }));
        
        setActivities(activityItems);
      } else {
        console.error('Audit logs fetch failed:', await logsRes.text());
      }
    } catch (err) {
      console.error('Failed to fetch admin data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Helper function to generate description from audit log
  const generateDescription = (log: AuditLog): string => {
    if (log.old_value && log.new_value) {
      return `${log.entity_type} changed: ${truncate(log.old_value)} → ${truncate(log.new_value)}`;
    }
    if (log.entity_type && log.entity_id) {
      return `${log.entity_type} #${log.entity_id} ${log.action.replace(/_/g, ' ').toLowerCase()}`;
    }
    return log.action.replace(/_/g, ' ');
  };

  // Helper function to truncate long values
  const truncate = (str: string, maxLength: number = 30): string => {
    if (!str) return '';
    return str.length > maxLength ? str.substring(0, maxLength) + '...' : str;
  };

  // Helper function to format time ago
  const formatTimeAgo = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    
    return date.toLocaleDateString();
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Handle approve/reject actions
  const handleApprove = async (loanId: number) => {
    try {
      const token = localStorage.getItem('access_token');
      await fetch(`http://localhost:8000/api/admin/loans/${loanId}/approve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      fetchData();
    } catch (err) {
      console.error('Failed to approve loan:', err);
    }
  };

  const handleReject = async (loanId: number) => {
    try {
      const token = localStorage.getItem('access_token');
      await fetch(`http://localhost:8000/api/admin/loans/${loanId}/reject`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      fetchData();
    } catch (err) {
      console.error('Failed to reject loan:', err);
    }
  };

  // Stats cards
  const statsCards = [
    { title: 'Active Loans', value: stats?.active_loans?.toString() || '0', change: '+12%', trend: 'up' as const, icon: FileText, color: '#3E3D39' },
    { title: 'Disbursed Today', value: `KSh ${(stats?.disbursed_today || 0).toLocaleString()}`, change: '+8%', trend: 'up' as const, icon: DollarSign, color: '#3E3D39' },
    { title: 'Default Rate', value: `${stats?.default_rate || 0}%`, change: '-0.5%', trend: 'down' as const, icon: TrendingUp, color: '#6D7464' },
    { title: 'Total Users', value: stats?.total_users?.toString() || '0', change: '+5%', trend: 'up' as const, icon: Users, color: '#3E3D39' },
  ];

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'LOAN_APPROVED': return <CheckCircle className="w-4 h-4" style={{ color: '#6D7464' }} />;
      case 'PAYMENT_RECEIVED': return <DollarSign className="w-4 h-4" style={{ color: '#C4A995' }} />;
      case 'USER_REGISTERED': return <Users className="w-4 h-4" style={{ color: '#3E3D39' }} />;
      case 'LOAN_REJECTED': return <XCircle className="w-4 h-4" style={{ color: '#3E3D39' }} />;
      default: return <Activity className="w-4 h-4" style={{ color: '#6D7464' }} />;
    }
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
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#050505' }}>
              Admin Dashboard
            </h1>
            <p className="text-sm mt-1" style={{ color: '#3E3D39' }}>
              Welcome back! Here&apos;s what&apos;s happening with your platform.
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors hover:opacity-80"
            style={{ backgroundColor: '#3E3D39', color: '#D4C8B5' }}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {statsCards.map((stat, index) => (
            <motion.div
              key={stat.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="rounded-2xl p-6"
              style={{ backgroundColor: '#D5BFA4', border: '1px solid #B4A58B' }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium" style={{ color: '#6D7464' }}>
                    {stat.title}
                  </p>
                  <p className="text-2xl font-bold mt-1" style={{ color: '#050505' }}>
                    {stat.value}
                  </p>
                  <div className="flex items-center gap-1 mt-2">
                    {stat.trend === 'up' ? (
                      <ArrowUpRight className="w-4 h-4" style={{ color: '#6D7464' }} />
                    ) : (
                      <ArrowDownRight className="w-4 h-4" style={{ color: stat.trend === 'down' ? '#6D7464' : '#3E3D39' }} />
                    )}
                    <span 
                      className="text-xs font-medium"
                      style={{ color: stat.trend === 'up' ? '#6D7464' : '#3E3D39' }}
                    >
                      {stat.change}
                    </span>
                    <span className="text-xs" style={{ color: '#6D7464' }}>
                      vs last month
                    </span>
                  </div>
                </div>
                <div 
                  className="p-3 rounded-xl"
                  style={{ backgroundColor: '#C4A995' }}
                >
                  <stat.icon className="w-6 h-6" style={{ color: stat.color }} />
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Pending Approvals */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="rounded-2xl p-6"
            style={{ backgroundColor: '#D5BFA4', border: '1px solid #B4A58B' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5" style={{ color: '#3E3D39' }} />
                <h2 className="text-lg font-bold" style={{ color: '#050505' }}>
                  Pending Approvals ({pendingApprovals.length})
                </h2>
              </div>
              <Link 
                href="/admin/approvals"
                className="text-sm font-medium hover:underline"
                style={{ color: '#3E3D39' }}
              >
                View All
              </Link>
            </div>

            <div className="space-y-3">
              {pendingApprovals.slice(0, 4).map((approval: any) => (
                  <div 
                    key={approval.id}
                    className="flex items-center justify-between p-3 rounded-xl"
                    style={{ backgroundColor: '#C4A995' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate" style={{ color: '#050505' }}>
                          {approval.borrower_name}
                        </p>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: '#6D7464' }}>
                        {approval.submitted_at || 'Recently'}
                      </p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-sm font-bold" style={{ color: '#050505' }}>
                        KSh {approval.principal?.toLocaleString() || '0'}
                      </p>
                      <div className="flex gap-1 mt-1">
                        <button 
                          onClick={() => handleApprove(approval.id)}
                          className="p-1.5 rounded-lg transition-opacity hover:opacity-80"
                          style={{ backgroundColor: '#6D7464', color: '#D4C8B5' }}
                          title="Approve"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleReject(approval.id)}
                          className="p-1.5 rounded-lg transition-opacity hover:opacity-80"
                          style={{ backgroundColor: '#3E3D39', color: '#D4C8B5' }}
                        title="Reject"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {pendingApprovals.length === 0 ? <p className="text-center py-4" style={{ color: '#6D7464' }}>No pending approvals</p> : null}
            </div>

          </motion.div>

          {/* Activity Feed */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="rounded-2xl p-6"
            style={{ backgroundColor: '#D5BFA4', border: '1px solid #B4A58B' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5" style={{ color: '#3E3D39' }} />
                <h2 className="text-lg font-bold" style={{ color: '#050505' }}>
                  Recent Activity
                </h2>
              </div>
              <Link 
                href="/admin/audit"
                className="text-sm font-medium hover:underline"
                style={{ color: '#3E3D39' }}
              >
                View All
              </Link>
            </div>

            <div className="space-y-3">
              {activities.length > 0 ? (
                activities.map((activity: any) => (
                  <div 
                    key={activity.id}
                    className="flex gap-3 p-3 rounded-xl"
                    style={{ backgroundColor: '#C4A995' }}
                  >
                    <div 
                      className="p-2 rounded-xl h-fit"
                      style={{ backgroundColor: '#CABAA1' }}
                    >
                      {getActivityIcon(activity.action)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: '#050505' }}>
                        {activity.title}
                      </p>
                      <p className="text-xs mt-0.5 truncate" style={{ color: '#3E3D39' }}>
                        {activity.description}
                      </p>
                      <p className="text-xs mt-1" style={{ color: '#6D7464' }}>
                        {activity.created_at}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center py-4" style={{ color: '#6D7464' }}>
                  No recent activity
                </p>
              )}
            </div>
          </motion.div>
        </div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="rounded-2xl p-6"
          style={{ backgroundColor: '#D5BFA4', border: '1px solid #B4A58B' }}
        >
          <h2 className="text-lg font-bold mb-4" style={{ color: '#050505' }}>
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'All Users', icon: Users, href: '/admin/users', color: '#3E3D39' },
              { label: 'Loan Reports', icon: BarChart3, href: '/admin/loans', color: '#3E3D39' },
              { label: 'CRB Upload', icon: Shield, href: '/admin/crb', color: '#3E3D39' },
              { label: 'Analytics', icon: FileText, href: '/admin/analytics', color: '#3E3D39' },
            ].map((action) => (
              <Link key={action.label} href={action.href}>
                <div 
                  className="flex flex-col items-center justify-center p-4 rounded-xl transition-colors hover:opacity-80"
                  style={{ backgroundColor: '#C4A995' }}
                >
                  <action.icon className="w-6 h-6 mb-2" style={{ color: action.color }} />
                  <span className="text-xs font-medium text-center" style={{ color: '#050505' }}>
                    {action.label}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </motion.div>

        {/* Quick Stats Links */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Users', value: stats?.total_users || 0, href: '/admin/users', icon: Users },
            { label: 'Loans', value: stats?.active_loans || 0, href: '/admin/loans', icon: FileText },
            { label: 'Pending', value: stats?.pending_approvals || 0, href: '/admin/approvals', icon: Clock },
            { label: 'Analytics', value: 'View', href: '/admin/analytics', icon: BarChart3 },
            { label: 'CRB', value: 'Manage', href: '/admin/crb', icon: Shield },
            { label: 'Settings', value: 'Configure', href: '/admin/settings', icon: Activity },
          ].map((item) => (
            <Link key={item.label} href={item.href}>
              <div 
                className="p-4 rounded-xl text-center transition-colors hover:opacity-80"
                style={{ backgroundColor: '#C4A995' }}
              >
                <item.icon className="w-5 h-5 mx-auto mb-1" style={{ color: '#3E3D39' }} />
                <p className="text-xs" style={{ color: '#6D7464' }}>{item.label}</p>
                <p className="text-sm font-bold" style={{ color: '#050505' }}>{item.value}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
