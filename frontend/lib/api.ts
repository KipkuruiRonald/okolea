import axios, { AxiosInstance, AxiosError } from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor for adding auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Unauthorized - clear all auth data and redirect to login
      localStorage.removeItem('access_token')
      localStorage.removeItem('okoleo_auth')
      sessionStorage.clear()
      if (typeof window !== 'undefined') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// Auth API
export const authApi = {
  login: async (username: string, password: string) => {
    const formData = new FormData()
    formData.append('username', username)
    formData.append('password', password)
    
    const response = await api.post('/api/auth/login', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },
  
  register: async (data: any) => {
    const response = await api.post('/api/auth/register', data)
    return response.data
  },
  
  getCurrentUser: async () => {
    const response = await api.get('/api/auth/me')
    return response.data
  },
  
  logout: async () => {
    // Clear token before making request
    localStorage.removeItem('access_token');
    try {
      const response = await api.post('/api/auth/logout')
      return response.data
    } catch {
      // Even if server call fails, logout locally
      return { success: true }
    }
  },
}

// Loans API
export const loansApi = {
  getAll: async (skip = 0, limit = 100) => {
    const response = await api.get('/api/loans', { params: { skip, limit } })
    return response.data
  },
  
  getById: async (loanId: number) => {
    const response = await api.get(`/api/loans/${loanId}`)
    return response.data
  },
  
  create: async (data: any) => {
    const response = await api.post('/api/loans/apply', data)
    return response.data
  },
  
  createBulk: async (loans: any[]) => {
    const response = await api.post('/api/loans/bulk', { loans })
    return response.data
  },
  
  update: async (loanId: number, data: any) => {
    const response = await api.put(`/api/loans/${loanId}`, data)
    return response.data
  },
  
  getRiskExplanation: async (loanId: number) => {
    const response = await api.get(`/api/loans/${loanId}/risk-explanation`)
    return response.data
  },
  
  // Get user's own loans
  getMyLoans: async (skip = 0, limit = 100) => {
    try {
      const response = await api.get('/api/loans/my-loans', { params: { skip, limit } })
      return response.data
    } catch (error: any) {
      console.error('Error fetching my loans:', error.response?.data || error.message)
      throw error
    }
  },

  // Search loans (users see own, admins see all)
  search: async (query: string, status?: string, skip = 0, limit = 50) => {
    const params: any = { q: query, skip, limit }
    if (status) params.status = status
    const response = await api.get('/api/loans/search', { params })
    return response.data
  },
  
  // Get recent loans (empty search fallback)
  getRecent: async (skip = 0, limit = 10) => {
    try {
      const response = await api.get('/api/loans/recent', { params: { skip, limit } })
      return response.data
    } catch (error: any) {
      console.error('Error fetching recent loans:', error.response?.data || error.message)
      throw error
    }
  },
  
  // Get user activities
  getActivities: async (skip = 0, limit = 50) => {
    const response = await api.get('/api/loans/activities', { params: { skip, limit } })
    return response.data
  },
  
  // Log user activity
  logActivity: async (action: string, details?: string) => {
    const response = await api.post('/api/loans/log-activity', { action, details })
    return response.data
  },
}

// Transactions API
export const transactionsApi = {
  initiate: async (data: any) => {
    console.log('[PAYMENT DEBUG] Initiating payment with data:', JSON.stringify(data, null, 2));
    try {
      const response = await api.post('/api/transactions', data);
      console.log('[PAYMENT DEBUG] Payment successful:', response.data);
      return response.data;
    } catch (error: any) {
      // Log detailed error information
      console.error('[PAYMENT DEBUG] Payment failed with error:');
      console.error('[PAYMENT DEBUG] Error response status:', error.response?.status);
      console.error('[PAYMENT DEBUG] Error response data:', error.response?.data);
      console.error('[PAYMENT DEBUG] Error response detail:', error.response?.data?.detail);
      console.error('[PAYMENT DEBUG] Full error object:', error);
      
      // Re-throw the error so the caller can handle it
      throw error;
    }
  },
  
  getAll: async (skip = 0, limit = 100) => {
    const response = await api.get('/api/transactions', { params: { skip, limit } })
    return response.data
  },
  
  getById: async (transactionId: number) => {
    const response = await api.get(`/api/transactions/${transactionId}`)
    return response.data
  },
  
  // Search transactions (users see own, admins see all)
  search: async (query: string, status?: string, skip = 0, limit = 50) => {
    const params: any = { q: query, skip, limit }
    if (status) params.status = status
    const response = await api.get('/api/transactions/search', { params })
    return response.data
  },
  
  // Get recent transactions (empty search fallback)
  getRecent: async (skip = 0, limit = 10) => {
    const response = await api.get('/api/transactions/recent', { params: { skip, limit } })
    return response.data
  },
}

// Admin API
export const adminApi = {
  getAllUsers: async (skip = 0, limit = 100) => {
    const response = await api.get('/api/admin/users', { params: { skip, limit } })
    return response.data
  },
  
  getAuditLogs: async (entityType?: string, skip = 0, limit = 100) => {
    const response = await api.get('/api/admin/audit-logs', {
      params: { entity_type: entityType, skip, limit },
    })
    return response.data
  },
  
  getLoanAuditLogs: async (loanId: number) => {
    const response = await api.get(`/api/admin/audit-logs/loan/${loanId}`)
    return response.data
  },
  
  updateUserStatus: async (userId: number, isActive: boolean) => {
    const response = await api.put(`/api/admin/users/${userId}/status`, null, {
      params: { is_active: isActive },
    })
    return response.data
  },
  
  // Admin Dashboard Stats
  getStats: async () => {
    const response = await api.get('/api/admin/stats')
    return response.data
  },
  
  // Pending Approvals
  getPendingApprovals: async (skip = 0, limit = 50) => {
    const response = await api.get('/api/admin/pending-approvals', { params: { skip, limit } })
    return response.data
  },
  
  approveLoan: async (loanId: number) => {
    const response = await api.post(`/api/admin/loans/${loanId}/approve`)
    return response.data
  },
  
  rejectLoan: async (loanId: number, reason: string) => {
    const response = await api.post(`/api/admin/loans/${loanId}/reject`, { reason })
    return response.data
  },
  
  // Loan Management
  getAllLoans: async (status?: string, skip = 0, limit = 100) => {
    const response = await api.get('/api/admin/loans', { params: { status, skip, limit } })
    return response.data
  },
  
  sendReminder: async (loanId: number) => {
    const response = await api.post(`/api/admin/loans/${loanId}/reminder`)
    return response.data
  },
  
  applyPenalty: async (loanId: number) => {
    const response = await api.post(`/api/admin/loans/${loanId}/penalty`)
    return response.data
  },
  
  markDefault: async (loanId: number) => {
    const response = await api.post(`/api/admin/loans/${loanId}/mark-default`)
    return response.data
  },
  
  // CRB Management
  getCRBReports: async (status?: string, skip = 0, limit = 50) => {
    const response = await api.get('/api/admin/crb/reports', { params: { status, skip, limit } })
    return response.data
  },
  
  submitCRBReport: async (reportId: number) => {
    const response = await api.post(`/api/admin/crb/reports/${reportId}/submit`)
    return response.data
  },
  
  bulkSubmitCRB: async (reportIds: number[]) => {
    const response = await api.post('/api/admin/crb/bulk-submit', { report_ids: reportIds })
    return response.data
  },
  
  // System Settings
  getSettings: async () => {
    const response = await api.get('/api/admin/settings')
    return response.data
  },
  
  updateSettings: async (settings: any) => {
    const response = await api.put('/api/admin/settings', settings)
    return response.data
  },
  
  // Activity Feed
  getActivityFeed: async (limit = 20) => {
    const response = await api.get('/api/admin/activity-feed', { params: { limit } })
    return response.data
  },
  
  // Admin Search Functions
  searchUsers: async (query: string, skip = 0, limit = 50) => {
    const response = await api.get('/api/admin/search/users', {
      params: { q: query, skip, limit },
    })
    return response.data
  },
  
  searchLoans: async (query: string, status?: string, skip = 0, limit = 50) => {
    const params: any = { q: query, skip, limit }
    if (status) params.status = status
    const response = await api.get('/api/admin/search/loans', { params })
    return response.data
  },
  
  searchTransactions: async (query: string, status?: string, skip = 0, limit = 50) => {
    const params: any = { q: query, skip, limit }
    if (status) params.status = status
    const response = await api.get('/api/admin/search/transactions', { params })
    return response.data
  },
  
  searchAll: async (query: string, filter?: string, skip = 0, limit = 20) => {
    const params: any = { q: query, skip, limit }
    if (filter) params.filter = filter
    const response = await api.get('/api/admin/search/all', { params })
    return response.data
  },
}

// Health check
export const healthCheck = async () => {
  const response = await api.get('/health')
  return response.data
}

// Global Search API
export const searchApi = {
  global: async (query: string, filter?: string, skip = 0, limit = 20) => {
    const params: any = { q: query, skip, limit }
    if (filter) params.filter = filter
    const response = await api.get('/api/search', { params })
    return response.data
  }
}

// Notifications API
export const notificationsApi = {
  getAll: async (skip = 0, limit = 20, includeRead = false) => {
    const response = await api.get('/api/notifications', {
      params: { skip, limit, include_read: includeRead },
    })
    return response.data
  },
  
  getUnreadCount: async () => {
    const response = await api.get('/api/notifications/unread')
    return response.data
  },
  
  markAsRead: async (notificationIds: number[]) => {
    const response = await api.post('/api/notifications/mark-read', {
      notification_ids: notificationIds,
    })
    return response.data
  },
  
  markAllAsRead: async () => {
    const response = await api.post('/api/notifications/mark-all-read')
    return response.data
  },
  
  delete: async (notificationId: number) => {
    const response = await api.delete(`/api/notifications/${notificationId}`)
    return response.data
  },
  
  getPreferences: async () => {
    const response = await api.get('/api/notifications/preferences')
    return response.data
  },
  
  updatePreferences: async (preferences: any) => {
    const response = await api.put('/api/notifications/preferences', preferences)
    return response.data
  },
  
  getTypes: async () => {
    const response = await api.get('/api/notifications/types')
    return response.data
  },
}

// Settings API (User & Admin)
export const settingsApi = {
  // User Profile
  getProfile: async () => {
    const response = await api.get('/api/settings/profile')
    return response.data
  },
  
  updateProfile: async (profileData: any) => {
    const response = await api.put('/api/settings/profile', profileData)
    return response.data
  },

  // Credit Score Trend
  getCreditScoreTrend: async () => {
    const response = await api.get('/api/settings/credit-score/trend')
    return response.data
  },
  
  // User Preferences
  getPreferences: async () => {
    const response = await api.get('/api/settings/preferences')
    return response.data
  },
  
  updatePreferences: async (preferences: any) => {
    const response = await api.put('/api/settings/preferences', preferences)
    return response.data
  },
  
  // Notification Preferences
  updateNotificationPreferences: async (notifData: any) => {
    const response = await api.put('/api/settings/notifications', notifData)
    return response.data
  },
  
  // Password Change
  updatePassword: async (data: { current_password: string; new_password: string }) => {
    const response = await api.put('/api/settings/password', data)
    return response.data
  },
  
  // Delete Account
  deleteAccount: async () => {
    const response = await api.delete('/api/settings/delete')
    return response.data
  },
  
  // Export User Data
  exportData: async () => {
    const response = await api.get('/api/settings/export-data', {
      responseType: 'blob'
    })
    return response.data
  },
  
  // Admin System Settings
  getSystemSettings: async (category?: string) => {
    const params = category ? { category } : {}
    const response = await api.get('/api/settings/system', { params })
    return response.data
  },
  
  updateSystemSettings: async (settings: any) => {
    const response = await api.put('/api/settings/system', { settings })
    return response.data
  },
  
  getSettingCategories: async () => {
    const response = await api.get('/api/settings/system/categories')
    return response.data
  },
}

export default api
