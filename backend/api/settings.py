from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Any
from datetime import datetime, timedelta
import json

from core.database import get_db
from models.models import User, UserRole, UserProfile, UserSettings, SystemSettings, NotificationPreference, Loan, Transaction, CreditScoreHistory
from schemas.schemas import UserResponse, CreditScoreTrendResponse
from api.auth import get_current_user, require_role
from core.config import settings

router = APIRouter()


# ============================================================================
# USER SETTINGS ENDPOINTS
# ============================================================================

@router.get("/profile")
async def get_user_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get user profile with all extended information"""
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    
    if not profile:
        # Create default profile if doesn't exist
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    
    # Also get notification preferences
    notif_prefs = db.query(NotificationPreference).filter(
        NotificationPreference.user_id == current_user.id
    ).first()
    
    return {
        "user": {
            "id": current_user.id,
            "email": current_user.email,
            "full_name": current_user.full_name,
            "username": current_user.username,
            "role": current_user.role.value if current_user.role else None,
        },
        "profile": {
            "phone": profile.phone,
            "national_id": profile.national_id,
            "date_of_birth": profile.date_of_birth.isoformat() if profile.date_of_birth else None,
            "location": profile.location,
            "address": profile.address,
            "kyc_status": profile.kyc_status,
            "kyc_verified_at": profile.kyc_verified_at.isoformat() if profile.kyc_verified_at else None,
            "kyc_rejection_reason": profile.kyc_rejection_reason,
            "mpesa_phone": profile.mpesa_phone,
            "mpesa_verified": profile.mpesa_verified,
            "preferred_loan_amount": profile.preferred_loan_amount,
            "preferred_term_days": profile.preferred_term_days,
            "auto_repay": profile.auto_repay,
        },
        "notification_preferences": {
            "email_enabled": notif_prefs.email_enabled if notif_prefs else True,
            "email_for_loans": notif_prefs.email_for_loans if notif_prefs else True,
            "email_for_payments": notif_prefs.email_for_payments if notif_prefs else True,
            "email_for_marketing": notif_prefs.email_for_marketing if notif_prefs else False,
            "push_enabled": notif_prefs.push_enabled if notif_prefs else True,
            "sms_enabled": notif_prefs.sms_enabled if notif_prefs else False,
            "quiet_hours_enabled": notif_prefs.quiet_hours_enabled if notif_prefs else False,
            "quiet_hours_start": notif_prefs.quiet_hours_start if notif_prefs else "22:00",
            "quiet_hours_end": notif_prefs.quiet_hours_end if notif_prefs else "07:00",
        } if notif_prefs else None
    }


@router.put("/profile")
async def update_user_profile(
    profile_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update user profile information"""
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)
    
    # Check if KYC is verified - if so, restrict updates
    if profile.kyc_status == "VERIFIED":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Profile is locked. Please contact support to update verified information."
        )
    
    # Update profile fields
    if "full_name" in profile_data:
        # Also update the user's full_name in the users table
        current_user.full_name = profile_data["full_name"]
    if "phone" in profile_data:
        profile.phone = profile_data["phone"]
    if "national_id" in profile_data:
        profile.national_id = profile_data["national_id"]
    if "date_of_birth" in profile_data and profile_data["date_of_birth"]:
        from datetime import datetime
        profile.date_of_birth = datetime.fromisoformat(profile_data["date_of_birth"])
    if "location" in profile_data:
        profile.location = profile_data["location"]
    if "address" in profile_data:
        profile.address = profile_data["address"]
    if "mpesa_phone" in profile_data:
        profile.mpesa_phone = profile_data["mpesa_phone"]
    if "preferred_loan_amount" in profile_data:
        profile.preferred_loan_amount = profile_data["preferred_loan_amount"]
    if "preferred_term_days" in profile_data:
        profile.preferred_term_days = profile_data["preferred_term_days"]
    if "auto_repay" in profile_data:
        profile.auto_repay = profile_data["auto_repay"]
    
    db.commit()
    db.refresh(profile)
    
    return {"message": "Profile updated successfully", "profile": profile}


@router.get("/preferences")
async def get_user_preferences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get user app preferences"""
    user_settings = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    
    if not user_settings:
        user_settings = UserSettings(user_id=current_user.id)
        db.add(user_settings)
        db.commit()
        db.refresh(user_settings)
    
    return {
        "theme": user_settings.theme,
        "language": user_settings.language,
        "currency": user_settings.currency,
        "profile_public": user_settings.profile_public,
        "show_balance": user_settings.show_balance,
        "marketing_emails": user_settings.marketing_emails,
    }


@router.put("/preferences")
async def update_user_preferences(
    preferences: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update user app preferences"""
    user_settings = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    
    if not user_settings:
        user_settings = UserSettings(user_id=current_user.id)
        db.add(user_settings)
    
    # Update preference fields
    if "theme" in preferences:
        user_settings.theme = preferences["theme"]
    if "language" in preferences:
        user_settings.language = preferences["language"]
    if "currency" in preferences:
        user_settings.currency = preferences["currency"]
    if "profile_public" in preferences:
        user_settings.profile_public = preferences["profile_public"]
    if "show_balance" in preferences:
        user_settings.show_balance = preferences["show_balance"]
    if "marketing_emails" in preferences:
        user_settings.marketing_emails = preferences["marketing_emails"]
    
    db.commit()
    db.refresh(user_settings)
    
    return {"message": "Preferences updated successfully", "preferences": user_settings}


@router.put("/notifications")
async def update_notification_preferences(
    notif_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update user notification preferences"""
    notif_prefs = db.query(NotificationPreference).filter(
        NotificationPreference.user_id == current_user.id
    ).first()
    
    if not notif_prefs:
        notif_prefs = NotificationPreference(user_id=current_user.id)
        db.add(notif_prefs)
    
    # Update notification preferences
    if "email_enabled" in notif_data:
        notif_prefs.email_enabled = notif_data["email_enabled"]
    if "email_for_loans" in notif_data:
        notif_prefs.email_for_loans = notif_data["email_for_loans"]
    if "email_for_payments" in notif_data:
        notif_prefs.email_for_payments = notif_data["email_for_payments"]
    if "email_for_marketing" in notif_data:
        notif_prefs.email_for_marketing = notif_data["email_for_marketing"]
    if "push_enabled" in notif_data:
        notif_prefs.push_enabled = notif_data["push_enabled"]
    if "push_for_loans" in notif_data:
        notif_prefs.push_for_loans = notif_data["push_for_loans"]
    if "push_for_payments" in notif_data:
        notif_prefs.push_for_payments = notif_data["push_for_payments"]
    if "sms_enabled" in notif_data:
        notif_prefs.sms_enabled = notif_data["sms_enabled"]
    if "sms_for_critical" in notif_data:
        notif_prefs.sms_for_critical = notif_data["sms_for_critical"]
    if "quiet_hours_enabled" in notif_data:
        notif_prefs.quiet_hours_enabled = notif_data["quiet_hours_enabled"]
    if "quiet_hours_start" in notif_data:
        notif_prefs.quiet_hours_start = notif_data["quiet_hours_start"]
    if "quiet_hours_end" in notif_data:
        notif_prefs.quiet_hours_end = notif_data["quiet_hours_end"]
    
    db.commit()
    db.refresh(notif_prefs)
    
    return {"message": "Notification preferences updated successfully"}


# ============================================================================
# ADMIN SYSTEM SETTINGS ENDPOINTS
# ============================================================================

@router.get("/system")
async def get_system_settings(
    category: Optional[str] = Query(None, description="Filter by category"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    """Get system settings (admin only)"""
    query = db.query(SystemSettings)
    
    if category:
        query = query.filter(SystemSettings.category == category)
    
    settings_list = query.all()
    
    # Group by category
    grouped = {}
    for s in settings_list:
        if s.category not in grouped:
            grouped[s.category] = []
        
        value = s.setting_value
        if s.setting_type == "number":
            try:
                value = float(s.setting_value) if "." in s.setting_value else int(s.setting_value)
            except:
                value = s.setting_value
        elif s.setting_type == "boolean":
            value = s.setting_value.lower() == "true"
        elif s.setting_type == "json":
            try:
                value = json.loads(s.setting_value)
            except:
                value = s.setting_value
        
        grouped[s.category].append({
            "key": s.setting_key,
            "value": value,
            "type": s.setting_type,
            "description": s.description,
            "is_editable": s.is_editable,
        })
    
    # If no settings exist, return defaults
    if not settings_list:
        return _get_default_system_settings()
    
    return grouped


@router.put("/system")
async def update_system_settings(
    settings_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    """Update system settings (admin only)"""
    updates = settings_data.get("settings", [])
    
    if not updates:
        return {"message": "No settings to update"}
    
    try:
        for item in updates:
            key = item.get("key")
            value = item.get("value")
            category = item.get("category", "general")
            
            if not key:
                continue
            
            # Find existing setting
            setting = db.query(SystemSettings).filter(
                SystemSettings.category == category,
                SystemSettings.setting_key == key
            ).first()
            
            if not setting:
                # Create new setting
                setting = SystemSettings(
                    category=category,
                    setting_key=key,
                    is_editable=True,
                    description=f"{key} setting for {category}"
                )
                db.add(setting)
            
            # Determine type and convert value
            if isinstance(value, bool):
                setting.setting_type = "boolean"
                setting.setting_value = str(value).lower()
            elif isinstance(value, (int, float)):
                setting.setting_type = "number"
                setting.setting_value = str(value)
            elif isinstance(value, dict):
                setting.setting_type = "json"
                setting.setting_value = json.dumps(value)
            else:
                setting.setting_type = "string"
                setting.setting_value = str(value)
        
        # Commit all changes
        db.commit()
        
        # Refresh to ensure changes are loaded
        for item in updates:
            key = item.get("key")
            category = item.get("category", "general")
            setting = db.query(SystemSettings).filter(
                SystemSettings.category == category,
                SystemSettings.setting_key == key
            ).first()
            if setting:
                db.refresh(setting)
        
        return {"message": "System settings updated successfully"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to update settings: {str(e)}"
        )


@router.get("/system/categories")
async def get_setting_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    """Get list of setting categories"""
    return [
        {"id": "general", "name": "General Settings", "icon": "Globe"},
        {"id": "loan", "name": "Loan Settings", "icon": "CreditCard"},
        {"id": "payment", "name": "Payment Gateway", "icon": "Wallet"},
        {"id": "security", "name": "Security", "icon": "Shield"},
        {"id": "notification", "name": "Notifications", "icon": "Bell"},
        {"id": "tier", "name": "Tier Configuration", "icon": "TrendingUp"},
        {"id": "risk", "name": "Risk Management", "icon": "AlertTriangle"},
        {"id": "integration", "name": "API & Integration", "icon": "Plug"},
    ]


def _get_default_system_settings():
    """Return default system settings structure"""
    return {
        "general": [
            {"key": "site_name", "value": "Okoleo", "type": "string", "description": "Platform name", "is_editable": True},
            {"key": "support_email", "value": "support@okoleo.com", "type": "string", "description": "Support email", "is_editable": True},
            {"key": "timezone", "value": "Africa/Nairobi", "type": "string", "description": "System timezone", "is_editable": True},
            {"key": "maintenance_mode", "value": False, "type": "boolean", "description": "Enable maintenance mode", "is_editable": True},
        ],
        "loan": [
            {"key": "default_interest_rate", "value": 4.0, "type": "number", "description": "Default annual interest rate (%)", "is_editable": True},
            {"key": "penalty_rate", "value": 6.8, "type": "number", "description": "Late payment penalty rate (%)", "is_editable": True},
            {"key": "term_days", "value": 9, "type": "number", "description": "Default loan term in days", "is_editable": True},
            {"key": "min_loan_amount", "value": 500, "type": "number", "description": "Minimum loan amount (KSh)", "is_editable": True},
            {"key": "max_loan_amount", "value": 15000, "type": "number", "description": "Maximum loan amount (KSh)", "is_editable": True},
            {"key": "processing_fee", "value": 0, "type": "number", "description": "Processing fee", "is_editable": True},
        ],
        "payment": [
            {"key": "mpesa_enabled", "value": True, "type": "boolean", "description": "Enable M-Pesa payments", "is_editable": True},
            {"key": "mpesa_shortcode", "value": "", "type": "string", "description": "M-Pesa shortcode", "is_editable": True},
            {"key": "mpesa_consumer_key", "value": "", "type": "string", "description": "M-Pesa consumer key", "is_editable": True},
            {"key": "crb_enabled", "value": True, "type": "boolean", "description": "Enable CRB checks", "is_editable": True},
            {"key": "auto_disbursement", "value": True, "type": "boolean", "description": "Auto-disburse approved loans", "is_editable": True},
        ],
        "security": [
            {"key": "two_factor_required", "value": False, "type": "boolean", "description": "Require 2FA for all users", "is_editable": True},
            {"key": "session_timeout", "value": 30, "type": "number", "description": "Session timeout (minutes)", "is_editable": True},
            {"key": "password_min_length", "value": 8, "type": "number", "description": "Minimum password length", "is_editable": True},
        ],
        "notification": [
            {"key": "email_notifications", "value": True, "type": "boolean", "description": "Enable email notifications", "is_editable": True},
            {"key": "sms_notifications", "value": True, "type": "boolean", "description": "Enable SMS notifications", "is_editable": True},
            {"key": "push_notifications", "value": False, "type": "boolean", "description": "Enable push notifications", "is_editable": True},
        ],
        "tier": [
            {"key": "tier_1_limit", "value": 500, "type": "number", "description": "Tier 1 loan limit", "is_editable": True},
            {"key": "tier_2_limit", "value": 1000, "type": "number", "description": "Tier 2 loan limit", "is_editable": True},
            {"key": "tier_3_limit", "value": 2000, "type": "number", "description": "Tier 3 loan limit", "is_editable": True},
            {"key": "tier_4_limit", "value": 3500, "type": "number", "description": "Tier 4 loan limit", "is_editable": True},
            {"key": "tier_5_limit", "value": 5000, "type": "number", "description": "Tier 5 loan limit", "is_editable": True},
            {"key": "tier_6_limit", "value": 7500, "type": "number", "description": "Tier 6 loan limit", "is_editable": True},
            {"key": "tier_7_limit", "value": 10000, "type": "number", "description": "Tier 7 loan limit", "is_editable": True},
            {"key": "tier_8_limit", "value": 15000, "type": "number", "description": "Tier 8 loan limit", "is_editable": True},
        ],
        "risk": [
            {"key": "min_credit_score", "value": 150, "type": "number", "description": "Minimum credit score", "is_editable": True},
            {"key": "fraud_threshold", "value": 0.8, "type": "number", "description": "Fraud detection threshold", "is_editable": True},
            {"key": "auto_approve_score", "value": 700, "type": "number", "description": "Auto-approve credit score threshold", "is_editable": True},
        ],
        "integration": [
            {"key": "near_enabled", "value": True, "type": "boolean", "description": "Enable NEAR blockchain", "is_editable": True},
            {"key": "near_network", "value": "testnet", "type": "string", "description": "NEAR network (testnet/mainnet)", "is_editable": True},
            {"key": "api_rate_limit", "value": 100, "type": "number", "description": "API rate limit per minute", "is_editable": True},
        ],
    }


# ============================================================================
# USER ACCOUNT ENDPOINTS
# ============================================================================

from core.security import get_password_hash, verify_password
from models.models import Loan
from fastapi.responses import JSONResponse, Response
from fpdf import FPDF
from datetime import datetime


@router.put("/password")
async def change_password(
    password_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Change user password"""
    current_password = password_data.get("current_password")
    new_password = password_data.get("new_password")
    
    if not current_password or not new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current and new password are required"
        )
    
    # Verify current password
    if not verify_password(current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )
    
    # Validate new password
    if len(new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters"
        )
    
    # Update password
    current_user.hashed_password = get_password_hash(new_password)
    db.commit()
    
    return {"message": "Password changed successfully"}


@router.delete("/delete")
async def delete_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete user account and all associated data"""
    user_id = current_user.id
    
    # Delete related records
    db.query(UserProfile).filter(UserProfile.user_id == user_id).delete()
    db.query(UserSettings).filter(UserSettings.user_id == user_id).delete()
    db.query(NotificationPreference).filter(NotificationPreference.user_id == user_id).delete()
    
    # Delete user
    db.delete(current_user)
    db.commit()
    
    return {"message": "Account deleted successfully"}


@router.get("/export-data")
async def export_user_data(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Export all user data as PDF"""
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    settings = db.query(UserSettings).filter(UserSettings.user_id == current_user.id).first()
    loans = db.query(Loan).filter(Loan.borrower_id == current_user.id).all()
    transactions = db.query(Transaction).filter(Transaction.borrower_id == current_user.id).all()
    
    # Create PDF
    pdf = FPDF()
    pdf.add_page()
    
    # Title
    pdf.set_font('Arial', 'B', 16)
    pdf.cell(0, 10, 'Okoleo - User Data Export', 0, 1, 'C')
    pdf.ln(5)
    
    # User Information
    pdf.set_font('Arial', 'B', 12)
    pdf.cell(0, 10, 'User Information', 0, 1)
    pdf.set_font('Arial', '', 10)
    pdf.cell(50, 7, 'User ID:', 0)
    pdf.cell(0, 7, str(current_user.id), 0, 1)
    pdf.cell(50, 7, 'Email:', 0)
    pdf.cell(0, 7, current_user.email or '', 0, 1)
    pdf.cell(50, 7, 'Username:', 0)
    pdf.cell(0, 7, current_user.username or '', 0, 1)
    pdf.cell(50, 7, 'Full Name:', 0)
    pdf.cell(0, 7, current_user.full_name or '', 0, 1)
    pdf.cell(50, 7, 'Phone:', 0)
    pdf.cell(0, 7, current_user.phone or '', 0, 1)
    pdf.cell(50, 7, 'Role:', 0)
    pdf.cell(0, 7, current_user.role.value if current_user.role else '', 0, 1)
    pdf.cell(50, 7, 'Credit Tier:', 0)
    pdf.cell(0, 7, current_user.credit_tier or '', 0, 1)
    pdf.cell(50, 7, 'Credit Score:', 0)
    pdf.cell(0, 7, str(current_user.credit_score) if current_user.credit_score else '0', 0, 1)
    pdf.cell(50, 7, 'Current Limit:', 0)
    pdf.cell(0, 7, f"KSh {current_user.current_limit:,.2f}" if current_user.current_limit else 'KSh 0.00', 0, 1)
    pdf.cell(50, 7, 'Member Since:', 0)
    pdf.cell(0, 7, current_user.created_at.strftime('%Y-%m-%d') if current_user.created_at else '', 0, 1)
    pdf.ln(5)
    
    # Profile Information
    if profile:
        pdf.set_font('Arial', 'B', 12)
        pdf.cell(0, 10, 'Profile Information', 0, 1)
        pdf.set_font('Arial', '', 10)
        if profile.national_id:
            pdf.cell(50, 7, 'National ID:', 0)
            pdf.cell(0, 7, profile.national_id or '', 0, 1)
        if profile.date_of_birth:
            pdf.cell(50, 7, 'Date of Birth:', 0)
            pdf.cell(0, 7, profile.date_of_birth.strftime('%Y-%m-%d') if profile.date_of_birth else '', 0, 1)
        if profile.location:
            pdf.cell(50, 7, 'Location:', 0)
            pdf.cell(0, 7, profile.location or '', 0, 1)
        if profile.address:
            pdf.cell(50, 7, 'Address:', 0)
            pdf.cell(0, 7, profile.address or '', 0, 1)
        pdf.ln(5)
    
    # Loans Information
    pdf.set_font('Arial', 'B', 12)
    pdf.cell(0, 10, 'Loan History', 0, 1)
    
    if loans:
        pdf.set_font('Arial', 'B', 9)
        pdf.cell(20, 7, 'Loan ID', 1)
        pdf.cell(25, 7, 'Principal', 1)
        pdf.cell(25, 7, 'Total Due', 1)
        pdf.cell(20, 7, 'Term Days', 1)
        pdf.cell(30, 7, 'Status', 1)
        pdf.cell(30, 7, 'Due Date', 1)
        pdf.cell(30, 7, 'Created', 1)
        pdf.ln()
        
        pdf.set_font('Arial', '', 8)
        for loan in loans:
            pdf.cell(20, 6, str(loan.loan_id) if loan.loan_id else '', 1)
            pdf.cell(25, 6, f"KSh {loan.principal:,.0f}" if loan.principal else 'KSh 0', 1)
            pdf.cell(25, 6, f"KSh {loan.total_due:,.0f}" if loan.total_due else 'KSh 0', 1)
            pdf.cell(20, 6, str(loan.term_days) if loan.term_days else '0', 1)
            pdf.cell(30, 6, loan.status.value if loan.status else '', 1)
            pdf.cell(30, 6, loan.due_date.strftime('%Y-%m-%d') if loan.due_date else '', 1)
            pdf.cell(30, 6, loan.created_at.strftime('%Y-%m-%d') if loan.created_at else '', 1)
            pdf.ln()
    else:
        pdf.set_font('Arial', '', 10)
        pdf.cell(0, 7, 'No loan history found.', 0, 1)
    
    pdf.ln(5)
    
    # Transactions Information
    pdf.set_font('Arial', 'B', 12)
    pdf.cell(0, 10, 'Transaction History', 0, 1)
    
    if transactions:
        pdf.set_font('Arial', 'B', 9)
        pdf.cell(25, 7, 'Amount', 1)
        pdf.cell(40, 7, 'Type', 1)
        pdf.cell(30, 7, 'Status', 1)
        pdf.cell(50, 7, 'Date', 1)
        pdf.ln()
        
        pdf.set_font('Arial', '', 8)
        for txn in transactions[:50]:  # Limit to 50 most recent
            pdf.cell(25, 6, f"KSh {txn.amount:,.0f}" if txn.amount else 'KSh 0', 1)
            pdf.cell(40, 6, txn.transaction_type.value if txn.transaction_type else '', 1)
            pdf.cell(30, 6, txn.status.value if txn.status else '', 1)
            pdf.cell(50, 6, txn.created_at.strftime('%Y-%m-%d %H:%M') if txn.created_at else '', 1)
            pdf.ln()
    else:
        pdf.set_font('Arial', '', 10)
        pdf.cell(0, 7, 'No transactions found.', 0, 1)
    
    pdf.ln(10)
    
    # Footer
    pdf.set_font('Arial', 'I', 8)
    pdf.cell(0, 10, f'Exported on: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}', 0, 1, 'C')
    pdf.cell(0, 5, 'Generated by Okoleo Loan App', 0, 1, 'C')
    
    # Return PDF as response
    pdf_output = pdf.output(dest='S').encode('latin-1')
    
    return Response(
        content=pdf_output,
        media_type='application/pdf',
        headers={"Content-Disposition": f"attachment; filename=okoleo-user-data-{current_user.id}.pdf"}
    )


# ============================================================================
# CREDIT SCORE TREND ENDPOINT
# ============================================================================

@router.get("/credit-score/trend", response_model=CreditScoreTrendResponse)
async def get_credit_score_trend(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get credit score comparison vs previous month"""
    
    # Calculate date range
    today = datetime.utcnow()
    first_day_current_month = today.replace(day=1)
    # Previous month is the month before first_day_current_month
    if first_day_current_month.month == 1:
        first_day_prev_month = datetime(first_day_current_month.year - 1, 12, 1)
    else:
        first_day_prev_month = datetime(
            first_day_current_month.year, 
            first_day_current_month.month - 1, 
            1
        )
    
    # Get score from previous month
    prev_month_score = db.query(CreditScoreHistory.score)\
        .filter(
            CreditScoreHistory.user_id == current_user.id,
            CreditScoreHistory.created_at < first_day_current_month,
            CreditScoreHistory.created_at >= first_day_prev_month
        )\
        .order_by(CreditScoreHistory.created_at.desc())\
        .first()
    
    current_score = current_user.credit_score
    
    if prev_month_score:
        change = current_score - prev_month_score
        change_percent = (change / prev_month_score) * 100 if prev_month_score > 0 else 0
    else:
        # No previous data - check if there's any history at all
        earliest_record = db.query(CreditScoreHistory)\
            .filter(CreditScoreHistory.user_id == current_user.id)\
            .order_by(CreditScoreHistory.created_at.asc())\
            .first()
        
        if earliest_record and earliest_record.created_at < first_day_current_month:
            # Has history but not in previous month
            change = current_score - earliest_record.score
            change_percent = (change / earliest_record.score) * 100 if earliest_record.score > 0 else 0
        else:
            change = 0
            change_percent = 0
    
    return {
        "current_score": current_score,
        "previous_month_score": prev_month_score if prev_month_score else None,
        "change": change,
        "change_percent": round(change_percent, 1),
        "trend": "up" if change > 0 else "down" if change < 0 else "neutral"
    }


# ============================================================================
# KYC VERIFICATION ENDPOINTS
# ============================================================================

@router.get("/kyc-status")
async def get_kyc_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get user KYC verification status"""
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    
    if not profile:
        profile = UserProfile(user_id=current_user.id, kyc_status="PENDING")
        db.add(profile)
        db.commit()
        db.refresh(profile)
    
    return {
        "kyc_status": profile.kyc_status,
        "kyc_verified_at": profile.kyc_verified_at.isoformat() if profile.kyc_verified_at else None,
        "kyc_rejection_reason": profile.kyc_rejection_reason,
    }


@router.post("/kyc-submit")
async def submit_for_kyc_verification(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Submit profile for KYC verification"""
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    
    if not profile:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)
    
    # Check if already verified
    if profile.kyc_status == "VERIFIED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account is already verified"
        )
    
    # Validate required fields before submission
    required_fields = ["phone", "national_id", "date_of_birth", "location", "address"]
    missing_fields = []
    for field in required_fields:
        if not getattr(profile, field):
            missing_fields.append(field)
    
    if missing_fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Please complete all required fields before submission. Missing: {', '.join(missing_fields)}"
        )
    
    # Update status to submitted
    profile.kyc_status = "SUBMITTED"
    db.commit()
    db.refresh(profile)
    
    return {
        "message": "Profile submitted for verification. You will be notified once your account is verified.",
        "kyc_status": profile.kyc_status
    }
