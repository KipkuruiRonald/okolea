'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  User, Bell, Shield, Wallet, Moon, Sun, Mail, Phone, MapPin, Save, 
  Loader2, CheckCircle, CreditCard, Lock, Eye, EyeOff, Globe, AlertCircle, X, Download, Trash2, Clock, XCircle
} from 'lucide-react';
import GlassCard from '@/components/GlassCard';
import AccordionSection from '@/components/AccordionSection';
import { AuthGuard } from '@/components/AuthGuard';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useTheme } from '../providers';
import { settingsApi } from '@/lib/api';
import { validateProfile, validatePasswordChange, ValidationResult } from '@/lib/validation';
import { getErrorMessage } from '@/lib/utils';

// Utility function to mask phone number
const maskPhone = (phone: string): string => {
  if (!phone) return '';
  // Remove any spaces or dashes
  const cleaned = phone.replace(/[\s-]/g, '');
  if (cleaned.length < 4) return cleaned;
  // Show first 4 digits and last 3 digits, mask the middle
  return cleaned.slice(0, 4) + '***' + cleaned.slice(-3);
};

// Utility function to mask National ID
const maskNationalId = (id: string): string => {
  if (!id) return '';
  if (id.length < 4) return id;
  // Show first 4 digits, mask the rest
  return id.slice(0, 4) + '****';
};

// Utility function to format date for HTML5 date input (YYYY-MM-DD)
const formatDateForInput = (dateString: string | null | undefined): string => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  } catch {
    return '';
  }
};

type TabType = 'profile' | 'security' | 'notifications' | 'payment' | 'preferences' | 'privacy';

export default function SettingsPage() {
  return (
    <AuthGuard>
      <SettingsContent />
    </AuthGuard>
  );
}

function SettingsContent() {
  const { theme, toggleTheme } = useTheme();
  const { logout, refreshUser } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const firstErrorRef = useRef<HTMLInputElement>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [kycStatus, setKycStatus] = useState<string>('PENDING');
  const [submitting, setSubmitting] = useState(false);
  const [loadingKyc, setLoadingKyc] = useState(true);

  // Determine if fields should be editable based on KYC status
  // Fields are EDITABLE when kyc_status === 'PENDING' or 'REJECTED'
  // Fields are LOCKED when kyc_status === 'SUBMITTED' or 'VERIFIED'
  const isEditable = kycStatus === 'PENDING' || kycStatus === 'REJECTED';
  const isFieldsLocked = !isEditable;
  
  // Track unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Mobile detection for responsive layout
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // User data from API
  const [userData, setUserData] = useState<any>({
    full_name: '',
    email: '',
    phone: '',
    national_id: '',
    date_of_birth: '',
    location: '',
    address: '',
    mpesa_phone: '',
    preferred_loan_amount: 500,
    preferred_term_days: 9,
    auto_repay: true,
  });
  
  // Preferences
  const [preferences, setPreferences] = useState({
    theme: 'light',
    language: 'en',
    currency: 'KES',
    profile_public: false,
    show_balance: true,
    marketing_emails: false,
  });
  
  // Notification preferences
  const [notifPrefs, setNotifPrefs] = useState({
    email_enabled: true,
    email_for_loans: true,
    email_for_payments: true,
    email_for_marketing: false,
    push_enabled: true,
    sms_enabled: false,
    quiet_hours_enabled: false,
    quiet_hours_start: '22:00',
    quiet_hours_end: '07:00',
  });
  
  // Security
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: '',
  });

  // Load initial data
  useEffect(() => {
    loadUserData();
    fetchKycStatus();
  }, []);

  const fetchKycStatus = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch('http://localhost:8000/api/settings/kyc-status', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        setKycStatus(data.kyc_status || 'PENDING');
      }
    } catch (err) {
      console.error('Failed to fetch KYC status:', err);
    } finally {
      setLoadingKyc(false);
    }
  };

  const handleSubmitForVerification = async () => {
    console.log('Submitting KYC with status:', kycStatus);
    console.log('User data being submitted:', userData);
    
    setSubmitting(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch('http://localhost:8000/api/settings/kyc-submit', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('KYC Submit Response status:', res.status);
      
      if (res.ok) {
        const data = await res.json();
        console.log('KYC Submit Success:', data);
        setKycStatus('SUBMITTED');
        alert('Profile submitted for verification! You will be notified once verified.');
      } else {
        const errorText = await res.text();
        console.error('KYC Submit Error response:', errorText);
        alert(`Failed to submit: ${errorText}`);
      }
    } catch (err) {
      console.error('KYC Submit exception:', err);
      alert('Failed to submit for verification. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const loadUserData = async () => {
    setLoading(true);
    setError(null);
    try {
      const profileData = await settingsApi.getProfile();
      
      if (profileData.user) {
        setUserData((prev: any) => ({
          ...prev,
          full_name: profileData.user.full_name || '',
          email: profileData.user.email || '',
          ...profileData.profile,
        }));
      }
      
      if (profileData.notification_preferences) {
        setNotifPrefs(profileData.notification_preferences);
      }
      
      const prefsData = await settingsApi.getPreferences();
      setPreferences({
        theme: prefsData.theme || 'light',
        language: prefsData.language || 'en',
        currency: prefsData.currency || 'KES',
        profile_public: prefsData.profile_public || false,
        show_balance: prefsData.show_balance || true,
        marketing_emails: prefsData.marketing_emails || false,
      });
    } catch (err: any) {
      console.error('Failed to load settings:', err);
      setError('Failed to load settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    setFieldErrors({});
    setSuccessMessage(null);
    
    // Validate based on active tab
    let validation: ValidationResult = { isValid: true, errors: {} };
    
    if (activeTab === 'profile') {
      validation = validateProfile({
        full_name: userData.full_name,
        email: userData.email,
        phone: userData.phone,
        national_id: userData.national_id,
      });
    } else if (activeTab === 'security' && showPasswordForm) {
      validation = validatePasswordChange({
        current_password: passwords.current,
        new_password: passwords.new,
        confirm_password: passwords.confirm,
      });
    }
    
    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      // Focus on first error field
      const firstErrorField = Object.keys(validation.errors)[0];
      if (firstErrorField) {
        const element = document.querySelector(`[name="${firstErrorField}"]`) as HTMLInputElement;
        if (element) element.focus();
      }
      return;
    }
    
    setSaving(true);
    try {
      if (activeTab === 'security' && showPasswordForm) {
        await settingsApi.updatePassword({
          current_password: passwords.current,
          new_password: passwords.new,
        });
        setSuccessMessage('Password updated successfully!');
        setPasswords({ current: '', new: '', confirm: '' });
        setShowPasswordForm(false);
        markAsSaved();
      } else {
        await settingsApi.updateProfile(userData);
        await settingsApi.updatePreferences(preferences);
        await settingsApi.updateNotificationPreferences(notifPrefs);
        
        // Refresh user context to update the user state
        await refreshUser();
        
        // Reload data from backend to verify and get fresh data
        await loadUserData();
        
        setSuccessMessage('Settings saved successfully!');
      }
      
      markAsSaved();
    } catch (err: any) {
      console.error('Failed to save settings:', err);
      const errorMsg = getErrorMessage(err, 'Failed to save settings. Please try again.');
      setError(errorMsg);
    } finally {
      setSaving(false);
    }
  };
  
  // Handle delete account
  const handleDeleteAccount = async () => {
    try {
      await settingsApi.deleteAccount();
      logout();
      router.push('/register');
    } catch (err: any) {
      console.error('Delete account error:', err);
      setError(getErrorMessage(err, 'Failed to delete account. Please try again.'));
    }
    setShowDeleteConfirm(false);
  };
  
  // Handle download data
  const handleDownloadData = async () => {
    try {
      setSaving(true);
      const blob = await settingsApi.exportData();
      
      if (!blob) {
        throw new Error('No data received');
      }
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `okoleo-data-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setSuccessMessage('Data downloaded successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error('Download data error:', err);
      setError(err.message || 'Failed to download data. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  
  // Mark changes as saved
  const markAsSaved = () => {
    setHasUnsavedChanges(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleInputChange = (field: string, value: any) => {
    setUserData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handlePrefChange = (field: string, value: any) => {
    setPreferences(prev => ({ ...prev, [field]: value }));
    // Apply theme change immediately
    if (field === 'theme' && value !== theme) {
      toggleTheme();
    }
  };

  const handleNotifChange = (field: string, value: any) => {
    setNotifPrefs(prev => ({ ...prev, [field]: value }));
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'payment', label: 'Payment', icon: CreditCard },
    { id: 'preferences', label: 'Preferences', icon: Globe },
    { id: 'privacy', label: 'Privacy', icon: Lock },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-tan" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h1 className="text-4xl font-bold text-tan text-center">
          Settings
        </h1>
        <p className="mt-2 text-nearblack/60 dark:text-cream/60 text-center">
          Manage your account preferences and security
        </p>
      </motion.div>

      {/* KYC Status Banner */}
      {!loadingKyc && (
        <>
          {kycStatus === 'PENDING' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-6">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Shield className="w-6 h-6 text-yellow-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-yellow-800 text-lg">Complete Your Profile Verification</h3>
                  <p className="text-yellow-700 mt-1">
                    Please review your information below. Once you submit, an admin will verify your account.
                  </p>
                  <div className="mt-4">
                    <button
                      onClick={handleSubmitForVerification}
                      disabled={submitting}
                      className="px-6 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        'Submit for Verification'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {kycStatus === 'SUBMITTED' && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Clock className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-blue-800">Verification Pending</h3>
                  <p className="text-blue-600 mt-1">
                    Your profile has been submitted for verification. An admin will review your information shortly.
                  </p>
                </div>
              </div>
            </div>
          )}

          {kycStatus === 'VERIFIED' && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-green-800">Profile Verified</h3>
                  <p className="text-green-600 mt-1">
                    Your account has been verified. Thank you for completing the verification process.
                  </p>
                </div>
              </div>
            </div>
          )}

          {kycStatus === 'REJECTED' && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-red-100 rounded-lg">
                  <XCircle className="w-6 h-6 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-red-800">Verification Rejected</h3>
                  <p className="text-red-600 mt-1">
                    Your profile verification was rejected. Please contact support for more information.
                  </p>
                  <button
                    onClick={handleSubmitForVerification}
                    className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Resubmit for Verification
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-tan/20 border border-tan">
          <AlertCircle className="w-5 h-5 text-darkgray" />
          <p className="text-sm text-darkgray">{error}</p>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Mobile: Horizontal Scrollable Tabs */}
        {isMobile && (
          <div className="w-full -mx-4 px-4">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab.id
                      ? 'bg-darkgray text-cream'
                      : 'bg-tan text-nearblack dark:text-cream'
                  }`}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Desktop: Sidebar Tabs */}
        {!isMobile && (
          <div className="lg:w-64 flex-shrink-0">
            <GlassCard>
              <nav className="space-y-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as TabType)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${
                      activeTab === tab.id
                        ? 'bg-darkgray text-cream'
                        : 'text-nearblack dark:text-cream hover:bg-tan'
                    }`}
                  >
                    <tab.icon className="w-5 h-5" />
                    <span className="font-medium">{tab.label}</span>
                  </button>
                ))}
              </nav>
            </GlassCard>
            
            {/* Desktop Save Button */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full mt-4 flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium bg-darkgray text-cream hover:bg-darkgray/80 disabled:opacity-50 transition-colors"
            >
              {saving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : saved ? (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Saved!
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 space-y-6 pb-24 lg:pb-6">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <GlassCard>
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-warmgray">
                  <User className="h-6 w-6 text-tan" />
                  <h2 className="text-xl font-bold text-nearblack dark:text-cream">
                    Profile Information
                  </h2>
                </div>

                <div className="space-y-4">
                  {/* Basic Information Accordion */}
                  <AccordionSection 
                    title="Basic Information" 
                    icon={<User className="w-5 h-5" />}
                    defaultOpen={true}
                  >
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-nearblack dark:text-cream mb-2">
                          <Lock className="inline h-4 w-4 mr-1" />
                          Full Name
                          <span className="ml-2 text-xs text-nearblack/50">(Read-only - verified at registration)</span>
                        </label>
                        <input
                          name="full_name"
                          value={userData.full_name || ''}
                          readOnly={isFieldsLocked}
                          onChange={(e) => !isFieldsLocked && setUserData({...userData, full_name: e.target.value})}
                          className={`w-full rounded-xl px-4 py-3 outline-none ${
                            isFieldsLocked 
                              ? 'bg-tan text-nearblack/60 cursor-not-allowed' 
                              : 'bg-cream text-nearblack focus:ring-2 focus:ring-blue-500'
                          }`}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-nearblack dark:text-cream mb-2">
                            <Lock className="inline h-4 w-4 mr-1" />
                            Email Address
                            <span className="ml-2 text-xs text-nearblack/50">(Used for login)</span>
                          </label>
                          <input
                            type="email"
                            value={userData.email || ''}
                            readOnly={isFieldsLocked}
                            onChange={(e) => !isFieldsLocked && setUserData({...userData, email: e.target.value})}
                            className={`w-full rounded-xl px-4 py-3 outline-none ${
                              isFieldsLocked 
                                ? 'bg-tan text-nearblack/60 cursor-not-allowed' 
                                : 'bg-cream text-nearblack focus:ring-2 focus:ring-blue-500'
                            }`}
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-nearblack dark:text-cream mb-2">
                            <Lock className="inline h-4 w-4 mr-1" />
                            Phone Number
                            <span className="ml-2 text-xs text-nearblack/50">(Verified at registration)</span>
                          </label>
                          <input
                            type="tel"
                            name="phone"
                            value={isFieldsLocked ? maskPhone(userData.phone || '') : userData.phone}
                            readOnly={isFieldsLocked}
                            onChange={(e) => !isFieldsLocked && setUserData({...userData, phone: e.target.value})}
                            placeholder={isFieldsLocked ? "" : "+2547XXXXXXXX"}
                            className={`w-full rounded-xl px-4 py-3 outline-none ${
                              isFieldsLocked 
                                ? 'bg-tan text-nearblack/60 cursor-not-allowed' 
                                : 'bg-cream text-nearblack focus:ring-2 focus:ring-blue-500'
                            }`}
                          />
                        </div>
                      </div>
                    </div>
                  </AccordionSection>

                  {/* Personal Details Accordion */}
                  <AccordionSection 
                    title="Personal Details" 
                    icon={<Shield className="w-5 h-5" />}
                    defaultOpen={false}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-nearblack dark:text-cream mb-2">
                          <Lock className="inline h-4 w-4 mr-1" />
                          National ID
                          <span className="ml-2 text-xs text-nearblack/50">(Legal requirement)</span>
                        </label>
                        <input
                          type="text"
                          name="national_id"
                          value={isFieldsLocked ? maskNationalId(userData.national_id || '') : userData.national_id}
                          readOnly={isFieldsLocked}
                          onChange={(e) => !isFieldsLocked && setUserData({...userData, national_id: e.target.value})}
                          placeholder={isFieldsLocked ? "" : "1234****"}
                          className={`w-full rounded-xl px-4 py-3 outline-none font-mono ${
                            isFieldsLocked 
                              ? 'bg-tan text-nearblack/60 cursor-not-allowed' 
                              : 'bg-cream text-nearblack focus:ring-2 focus:ring-blue-500'
                          }`}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-nearblack dark:text-cream mb-2">
                          <Lock className="inline h-4 w-4 mr-1" />
                          Date of Birth
                          <span className="ml-2 text-xs text-nearblack/50">(Verified at registration)</span>
                        </label>
                        <input
                          type="date"
                          value={formatDateForInput(userData.date_of_birth)}
                          readOnly={isFieldsLocked}
                          onChange={(e) => !isFieldsLocked && setUserData({...userData, date_of_birth: e.target.value})}
                          className={`w-full rounded-xl px-4 py-3 outline-none ${
                            isFieldsLocked 
                              ? 'bg-tan text-nearblack/60 cursor-not-allowed' 
                              : 'bg-cream text-nearblack focus:ring-2 focus:ring-blue-500'
                          }`}
                        />
                      </div>
                    </div>
                  </AccordionSection>

                  {/* Location & Address Accordion */}
                  <AccordionSection 
                    title="Location & Address" 
                    icon={<MapPin className="w-5 h-5" />}
                    defaultOpen={false}
                  >
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-nearblack dark:text-cream mb-2">
                          <MapPin className="inline h-4 w-4 mr-1" />
                          Location
                        </label>
                        <input
                          type="text"
                          value={userData.location || ''}
                          onChange={(e) => handleInputChange('location', e.target.value)}
                          placeholder="Nairobi, Kenya"
                          className="w-full rounded-xl bg-beige px-4 py-3 text-nearblack placeholder-nearblack/40 outline-none border border-warmgray focus:border-darkgray"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-nearblack dark:text-cream mb-2">
                          Address
                        </label>
                        <textarea
                          value={userData.address || ''}
                          onChange={(e) => handleInputChange('address', e.target.value)}
                          rows={3}
                          placeholder="Enter your address"
                          className="w-full rounded-xl bg-beige px-4 py-3 text-nearblack placeholder-nearblack/40 outline-none border border-warmgray focus:border-darkgray resize-none"
                        />
                      </div>
                    </div>
                  </AccordionSection>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* Security Tab */}
          {activeTab === 'security' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <GlassCard>
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-warmgray">
                  <Shield className="h-6 w-6 text-tan" />
                  <h2 className="text-xl font-bold text-nearblack dark:text-cream">
                    Security Settings
                  </h2>
                </div>

                <div className="space-y-4">
                  {/* Change Password Accordion */}
                  <AccordionSection 
                    title="Change Password" 
                    icon={<Lock className="w-5 h-5" />}
                    defaultOpen={false}
                  >
                    <div className="space-y-4">
                      {!showPasswordForm ? (
                        <button
                          onClick={() => setShowPasswordForm(true)}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-darkgray text-cream hover:bg-darkgray/80 transition-colors"
                        >
                          <Lock className="w-4 h-4" />
                          Change Password
                        </button>
                      ) : (
                        <div className="space-y-4 p-4 rounded-xl bg-tan">
                          <div>
                            <label className="block text-sm font-medium text-nearblack dark:text-cream mb-2">
                              Current Password
                            </label>
                            <input
                              type="password"
                              name="current_password"
                              value={passwords.current}
                              onChange={(e) => {
                                setPasswords(prev => ({ ...prev, current: e.target.value }));
                                if (fieldErrors.current_password) {
                                  setFieldErrors(prev => ({ ...prev, current_password: '' }));
                                }
                              }}
                              className={`w-full rounded-xl bg-beige px-4 py-3 text-nearblack outline-none border ${
                                fieldErrors.current_password ? 'border-red-500' : 'border-warmgray focus:border-darkgray'
                              }`}
                            />
                            {fieldErrors.current_password && (
                              <p className="mt-1 text-xs text-red-500">{fieldErrors.current_password}</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-nearblack dark:text-cream mb-2">
                              New Password
                            </label>
                            <input
                              type="password"
                              name="new_password"
                              value={passwords.new}
                              onChange={(e) => {
                                setPasswords(prev => ({ ...prev, new: e.target.value }));
                                if (fieldErrors.new_password) {
                                  setFieldErrors(prev => ({ ...prev, new_password: '' }));
                                }
                              }}
                              className={`w-full rounded-xl bg-beige px-4 py-3 text-nearblack outline-none border ${
                                fieldErrors.new_password ? 'border-red-500' : 'border-warmgray focus:border-darkgray'
                              }`}
                            />
                            {fieldErrors.new_password && (
                              <p className="mt-1 text-xs text-red-500">{fieldErrors.new_password}</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-nearblack dark:text-cream mb-2">
                              Confirm New Password
                            </label>
                            <input
                              type="password"
                              name="confirm_password"
                              value={passwords.confirm}
                              onChange={(e) => {
                                setPasswords(prev => ({ ...prev, confirm: e.target.value }));
                                if (fieldErrors.confirm_password) {
                                  setFieldErrors(prev => ({ ...prev, confirm_password: '' }));
                                }
                              }}
                              className={`w-full rounded-xl bg-beige px-4 py-3 text-nearblack outline-none border ${
                                fieldErrors.confirm_password ? 'border-red-500' : 'border-warmgray focus:border-darkgray'
                              }`}
                            />
                            {fieldErrors.confirm_password && (
                              <p className="mt-1 text-xs text-red-500">{fieldErrors.confirm_password}</p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setShowPasswordForm(false);
                                setPasswords({ current: '', new: '', confirm: '' });
                                setFieldErrors({});
                              }}
                              className="px-4 py-2 rounded-xl text-nearblack hover:bg-beige transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleSave}
                              disabled={saving}
                              className="px-4 py-2 rounded-xl bg-darkgray text-cream hover:bg-darkgray/80 disabled:opacity-50 transition-colors flex items-center gap-2"
                            >
                              {saving ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                'Update Password'
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </AccordionSection>

                  {/* Two Factor Auth Accordion */}
                  <AccordionSection 
                    title="Two-Factor Authentication" 
                    icon={<Shield className="w-5 h-5" />}
                    defaultOpen={false}
                  >
                    <div className="flex items-center justify-between p-4 rounded-xl bg-tan">
                      <div>
                        <h3 className="font-semibold text-nearblack dark:text-cream">
                          Two-Factor Authentication
                        </h3>
                        <p className="text-sm text-nearblack/60">
                          Add an extra layer of security to your account
                        </p>
                      </div>
                      <button className="px-4 py-2 rounded-xl bg-darkgray text-cream hover:bg-darkgray/80 transition-colors">
                        Enable
                      </button>
                    </div>
                  </AccordionSection>

                  {/* Active Sessions Accordion */}
                  <AccordionSection 
                    title="Active Sessions" 
                    icon={<Shield className="w-5 h-5" />}
                    isActive={true}
                    badge={2}
                    defaultOpen={false}
                  >
                    <div className="flex items-center justify-between p-4 rounded-xl bg-tan">
                      <div>
                        <h3 className="font-semibold text-nearblack dark:text-cream">
                          Active Sessions
                        </h3>
                        <p className="text-sm text-nearblack/60">
                          Manage your logged in devices
                        </p>
                      </div>
                      <button className="px-4 py-2 rounded-xl text-tan hover:bg-beige transition-colors">
                        View All
                      </button>
                    </div>
                  </AccordionSection>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <GlassCard>
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-warmgray">
                  <Bell className="h-6 w-6 text-tan" />
                  <h2 className="text-xl font-bold text-nearblack dark:text-cream">
                    Notification Preferences
                  </h2>
                </div>

                <div className="space-y-4">
                  {/* Email Notifications Accordion */}
                  <AccordionSection 
                    title="Email Notifications" 
                    icon={<Mail className="w-5 h-5" />}
                    defaultOpen={true}
                  >
                    <div className="space-y-3">
                      <label className="flex items-center justify-between p-4 rounded-xl bg-tan cursor-pointer">
                        <span className="text-nearblack dark:text-cream">Enable Email Notifications</span>
                        <input
                          type="checkbox"
                          checked={notifPrefs.email_enabled}
                          onChange={(e) => handleNotifChange('email_enabled', e.target.checked)}
                          className="w-5 h-5 rounded text-darkgray"
                        />
                      </label>
                      <label className="flex items-center justify-between p-4 rounded-xl bg-tan cursor-pointer">
                        <span className="text-nearblack dark:text-cream">Loan Updates</span>
                        <input
                          type="checkbox"
                          checked={notifPrefs.email_for_loans}
                          onChange={(e) => handleNotifChange('email_for_loans', e.target.checked)}
                          disabled={!notifPrefs.email_enabled}
                          className="w-5 h-5 rounded text-darkgray disabled:opacity-50"
                        />
                      </label>
                      <label className="flex items-center justify-between p-4 rounded-xl bg-tan cursor-pointer">
                        <span className="text-nearblack dark:text-cream">Payment Reminders</span>
                        <input
                          type="checkbox"
                          checked={notifPrefs.email_for_payments}
                          onChange={(e) => handleNotifChange('email_for_payments', e.target.checked)}
                          disabled={!notifPrefs.email_enabled}
                          className="w-5 h-5 rounded text-darkgray disabled:opacity-50"
                        />
                      </label>
                      <label className="flex items-center justify-between p-4 rounded-xl bg-tan cursor-pointer">
                        <span className="text-nearblack dark:text-cream">Marketing Emails</span>
                        <input
                          type="checkbox"
                          checked={notifPrefs.email_for_marketing}
                          onChange={(e) => handleNotifChange('email_for_marketing', e.target.checked)}
                          disabled={!notifPrefs.email_enabled}
                          className="w-5 h-5 rounded text-darkgray disabled:opacity-50"
                        />
                      </label>
                    </div>
                  </AccordionSection>

                  {/* Push Notifications Accordion */}
                  <AccordionSection 
                    title="Push Notifications" 
                    icon={<Bell className="w-5 h-5" />}
                    defaultOpen={false}
                  >
                    <label className="flex items-center justify-between p-4 rounded-xl bg-tan cursor-pointer">
                      <span className="text-nearblack dark:text-cream">Enable Push Notifications</span>
                      <input
                        type="checkbox"
                        checked={notifPrefs.push_enabled}
                        onChange={(e) => handleNotifChange('push_enabled', e.target.checked)}
                        className="w-5 h-5 rounded text-darkgray"
                      />
                    </label>
                  </AccordionSection>

                  {/* SMS Notifications Accordion */}
                  <AccordionSection 
                    title="SMS Notifications" 
                    icon={<Phone className="w-5 h-5" />}
                    defaultOpen={false}
                  >
                    <label className="flex items-center justify-between p-4 rounded-xl bg-tan cursor-pointer">
                      <span className="text-nearblack dark:text-cream">Enable SMS Notifications (Critical only)</span>
                      <input
                        type="checkbox"
                        checked={notifPrefs.sms_enabled}
                        onChange={(e) => handleNotifChange('sms_enabled', e.target.checked)}
                        className="w-5 h-5 rounded text-darkgray"
                      />
                    </label>
                  </AccordionSection>

                  {/* Quiet Hours Accordion */}
                  <AccordionSection 
                    title="Quiet Hours" 
                    icon={<Bell className="w-5 h-5" />}
                    defaultOpen={false}
                  >
                    <div className="space-y-4">
                      <label className="flex items-center justify-between p-4 rounded-xl bg-tan cursor-pointer mb-4">
                        <span className="text-nearblack dark:text-cream">Enable Quiet Hours</span>
                        <input
                          type="checkbox"
                          checked={notifPrefs.quiet_hours_enabled}
                          onChange={(e) => handleNotifChange('quiet_hours_enabled', e.target.checked)}
                          className="w-5 h-5 rounded text-darkgray"
                        />
                      </label>
                      {notifPrefs.quiet_hours_enabled && (
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-nearblack dark:text-cream mb-2">
                              Start Time
                            </label>
                            <input
                              type="time"
                              value={notifPrefs.quiet_hours_start}
                              onChange={(e) => handleNotifChange('quiet_hours_start', e.target.value)}
                              className="w-full rounded-xl bg-beige px-4 py-3 text-nearblack outline-none border border-warmgray focus:border-darkgray"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-nearblack dark:text-cream mb-2">
                              End Time
                            </label>
                            <input
                              type="time"
                              value={notifPrefs.quiet_hours_end}
                              onChange={(e) => handleNotifChange('quiet_hours_end', e.target.value)}
                              className="w-full rounded-xl bg-beige px-4 py-3 text-nearblack outline-none border border-warmgray focus:border-darkgray"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </AccordionSection>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* Payment Tab */}
          {activeTab === 'payment' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <GlassCard>
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-warmgray">
                  <CreditCard className="h-6 w-6 text-tan" />
                  <h2 className="text-xl font-bold text-nearblack dark:text-cream">
                    Payment Methods
                  </h2>
                </div>

                <div className="space-y-4">
                  {/* M-Pesa Accordion */}
                  <AccordionSection 
                    title="M-Pesa" 
                    icon={<CreditCard className="w-5 h-5" />}
                    badge="Connected"
                    defaultOpen={true}
                  >
                    <div className="p-4 rounded-xl bg-tan">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-olivegray flex items-center justify-center">
                            <span className="text-cream font-bold">M</span>
                          </div>
                          <div>
                            <h3 className="font-semibold text-nearblack dark:text-cream">M-Pesa</h3>
                            <p className="text-sm text-nearblack/60">Mobile Money Payments</p>
                          </div>
                        </div>
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-olivegray/20 text-olivegray">
                          Connected
                        </span>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-nearblack dark:text-cream mb-2">
                          M-Pesa Phone Number
                        </label>
                        <input
                          type="tel"
                          value={userData.mpesa_phone || ''}
                          onChange={(e) => handleInputChange('mpesa_phone', e.target.value)}
                          placeholder="+254712345678"
                          className="w-full rounded-xl bg-beige px-4 py-3 text-nearblack placeholder-nearblack/40 outline-none border border-warmgray focus:border-darkgray"
                        />
                      </div>
                    </div>
                  </AccordionSection>

                  {/* Loan Preferences Accordion */}
                  <AccordionSection 
                    title="Loan Preferences" 
                    icon={<Wallet className="w-5 h-5" />}
                    defaultOpen={false}
                  >
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-nearblack dark:text-cream mb-2">
                          Preferred Loan Amount (KSh)
                        </label>
                        <input
                          type="number"
                          value={userData.preferred_loan_amount}
                          onChange={(e) => handleInputChange('preferred_loan_amount', parseFloat(e.target.value))}
                          min={500}
                          max={15000}
                          className="w-full rounded-xl bg-beige px-4 py-3 text-nearblack outline-none border border-warmgray focus:border-darkgray"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-nearblack dark:text-cream mb-2">
                          Preferred Term (Days)
                        </label>
                        <select
                          value={userData.preferred_term_days}
                          onChange={(e) => handleInputChange('preferred_term_days', parseInt(e.target.value))}
                          className="w-full rounded-xl bg-beige px-4 py-3 text-nearblack outline-none border border-warmgray focus:border-darkgray"
                        >
                          <option value={9}>9 Days</option>
                          <option value={18}>18 Days</option>
                          <option value={27}>27 Days</option>
                        </select>
                      </div>
                      <label className="flex items-center justify-between p-4 rounded-xl bg-tan cursor-pointer">
                        <div>
                          <span className="text-nearblack dark:text-cream">Auto-Repay</span>
                          <p className="text-sm text-nearblack/60">Automatically repay loans when due</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={userData.auto_repay}
                          onChange={(e) => handleInputChange('auto_repay', e.target.checked)}
                          className="w-5 h-5 rounded text-darkgray"
                        />
                      </label>
                    </div>
                  </AccordionSection>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* Preferences Tab */}
          {activeTab === 'preferences' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <GlassCard>
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-warmgray">
                  <Globe className="h-6 w-6 text-tan" />
                  <h2 className="text-xl font-bold text-nearblack dark:text-cream">
                    App Preferences
                  </h2>
                </div>

                <div className="space-y-4">
                  {/* Appearance Accordion */}
                  <AccordionSection 
                    title="Appearance" 
                    icon={<Sun className="w-5 h-5" />}
                    defaultOpen={true}
                  >
                    <div className="grid grid-cols-3 gap-4">
                      <button
                        onClick={() => handlePrefChange('theme', 'light')}
                        className={`p-4 rounded-xl border-2 transition-colors ${
                          preferences.theme === 'light'
                            ? 'border-darkgray bg-tan'
                            : 'border-warmgray hover:border-taupe'
                        }`}
                      >
                        <Sun className="w-6 h-6 mx-auto mb-2 text-olivegray" />
                        <p className="text-sm font-medium text-nearblack dark:text-cream">Light</p>
                      </button>
                      <button
                        onClick={() => handlePrefChange('theme', 'dark')}
                        className={`p-4 rounded-xl border-2 transition-colors ${
                          preferences.theme === 'dark'
                            ? 'border-darkgray bg-tan'
                            : 'border-warmgray hover:border-taupe'
                        }`}
                      >
                        <Moon className="w-6 h-6 mx-auto mb-2 text-sagegray" />
                        <p className="text-sm font-medium text-nearblack dark:text-cream">Dark</p>
                      </button>
                      <button
                        onClick={() => handlePrefChange('theme', 'system')}
                        className={`p-4 rounded-xl border-2 transition-colors ${
                          preferences.theme === 'system'
                            ? 'border-darkgray bg-tan'
                            : 'border-warmgray hover:border-taupe'
                        }`}
                      >
                        <Globe className="w-6 h-6 mx-auto mb-2 text-nearblack/60" />
                        <p className="text-sm font-medium text-nearblack dark:text-cream">System</p>
                      </button>
                    </div>
                  </AccordionSection>

                  {/* Language Accordion */}
                  <AccordionSection 
                    title="Language" 
                    icon={<Globe className="w-5 h-5" />}
                    defaultOpen={false}
                  >
                    <select
                      value={preferences.language}
                      onChange={(e) => handlePrefChange('language', e.target.value)}
                      className="w-full rounded-xl bg-beige px-4 py-3 text-nearblack outline-none border border-warmgray focus:border-darkgray"
                    >
                      <option value="en">English</option>
                      <option value="sw">Swahili</option>
                    </select>
                  </AccordionSection>

                  {/* Currency Accordion */}
                  <AccordionSection 
                    title="Currency" 
                    icon={<Wallet className="w-5 h-5" />}
                    defaultOpen={false}
                  >
                    <select
                      value={preferences.currency}
                      onChange={(e) => handlePrefChange('currency', e.target.value)}
                      className="w-full rounded-xl bg-beige px-4 py-3 text-nearblack outline-none border border-warmgray focus:border-darkgray"
                    >
                      <option value="KES">KSh - Kenyan Shilling</option>
                      <option value="USD">$ - US Dollar</option>
                    </select>
                  </AccordionSection>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* Privacy Tab */}
          {activeTab === 'privacy' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <GlassCard>
                <div className="flex items-center gap-3 mb-6 pb-4 border-b border-warmgray">
                  <Lock className="h-6 w-6 text-tan" />
                  <h2 className="text-xl font-bold text-nearblack dark:text-cream">
                    Privacy Settings
                  </h2>
                </div>

                <div className="space-y-4">
                  {/* Privacy Options Accordion */}
                  <AccordionSection 
                    title="Privacy Options" 
                    icon={<Lock className="w-5 h-5" />}
                    defaultOpen={true}
                  >
                    <div className="space-y-4">
                      <label className="flex items-center justify-between p-4 rounded-xl bg-tan cursor-pointer">
                        <div>
                          <span className="text-nearblack dark:text-cream font-medium">Public Profile</span>
                          <p className="text-sm text-nearblack/60">Allow others to see your profile</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={preferences.profile_public}
                          onChange={(e) => handlePrefChange('profile_public', e.target.checked)}
                          className="w-5 h-5 rounded text-darkgray"
                        />
                      </label>

                      <label className="flex items-center justify-between p-4 rounded-xl bg-tan cursor-pointer">
                        <div>
                          <span className="text-nearblack dark:text-cream font-medium">Show Balance</span>
                          <p className="text-sm text-nearblack/60">Display your account balance</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={preferences.show_balance}
                          onChange={(e) => handlePrefChange('show_balance', e.target.checked)}
                          className="w-5 h-5 rounded text-darkgray"
                        />
                      </label>

                      <label className="flex items-center justify-between p-4 rounded-xl bg-tan cursor-pointer">
                        <div>
                          <span className="text-nearblack dark:text-cream font-medium">Marketing Communications</span>
                          <p className="text-sm text-nearblack/60">Receive promotional offers</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={preferences.marketing_emails}
                          onChange={(e) => handlePrefChange('marketing_emails', e.target.checked)}
                          className="w-5 h-5 rounded text-darkgray"
                        />
                      </label>
                    </div>
                  </AccordionSection>

                  {/* Danger Zone Accordion */}
                  <AccordionSection 
                    title="Danger Zone" 
                    icon={<AlertCircle className="w-5 h-5" />}
                    defaultOpen={false}
                  >
                    <div className="space-y-4">
                      {/* Download Data Button */}
                      <button 
                        onClick={handleDownloadData}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-warmgray hover:bg-tan transition-colors"
                      >
                        <Download className="w-5 h-5" />
                        <span className="text-nearblack dark:text-cream font-medium">Download My Data</span>
                      </button>
                      
                      {/* Delete Account */}
                      {!showDeleteConfirm ? (
                        <button 
                          onClick={() => setShowDeleteConfirm(true)}
                          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-red-500 text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                          <span className="font-medium">Delete Account</span>
                        </button>
                      ) : (
                        <div className="p-4 rounded-xl border border-red-500 bg-red-50">
                          <p className="text-red-600 font-medium mb-3">
                            Are you sure? This action cannot be undone.
                          </p>
                          <div className="flex gap-3">
                            <button 
                              onClick={handleDeleteAccount}
                              disabled={saving}
                              className="flex-1 px-4 py-2 rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
                            >
                              Yes, Delete
                            </button>
                            <button 
                              onClick={() => setShowDeleteConfirm(false)}
                              className="flex-1 px-4 py-2 rounded-xl border border-warmgray text-nearblack font-medium hover:bg-tan transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </AccordionSection>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* Mobile: Sticky Save Button */}
          {isMobile && (
            <div className="fixed bottom-0 left-0 right-0 p-4 bg-cream dark:bg-nearblack border-t border-warmgray z-50">
              <button
                onClick={handleSave}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium bg-darkgray text-cream hover:bg-darkgray/80 disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : saved ? (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Saved!
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
