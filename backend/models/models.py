from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Enum as SQLEnum, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
import enum
from core.database import Base


# ============================================================================
# ENUMS (Simplified for loan app)
# ============================================================================

class UserRole(str, enum.Enum):
    """User role definitions"""
    BORROWER = "BORROWER"
    ADMIN = "ADMIN"


class LoanStatus(str, enum.Enum):
    """Loan lifecycle status"""
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"
    SETTLED = "SETTLED"
    REJECTED = "REJECTED"
    DEFAULTED = "DEFAULTED"


class TransactionStatus(str, enum.Enum):
    """Transaction processing status"""
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    FAILED = "FAILED"


class TransactionType(str, enum.Enum):
    """Transaction type - disbursement or repayment"""
    DISBURSEMENT = "DISBURSEMENT"
    REPAYMENT = "REPAYMENT"


# ============================================================================
# MODELS
# ============================================================================

class User(Base):
    """User model for Okoleo loan app - simplified from marketplace version"""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    
    # ============================================================
    # USER REGISTRATION FIELDS
    # ============================================================
    phone = Column(String(20), unique=True, index=True, nullable=True)
    national_id = Column(String(50), nullable=True)
    date_of_birth = Column(DateTime(timezone=True), nullable=True)
    location = Column(String(255), nullable=True)
    
    # Role for access control
    role = Column(SQLEnum(UserRole), default=UserRole.BORROWER)
    
    is_active = Column(Boolean, default=True)
    
    # ============================================================
    # LOGIN TRACKING FIELDS
    # ============================================================
    last_login = Column(DateTime(timezone=True), nullable=True)
    last_login_ip = Column(String(50), nullable=True)
    login_count = Column(Integer, default=0)
    
    # ============================================================
    # OKOLEO CREDIT LIMIT SYSTEM FIELDS
    # ============================================================
    credit_tier = Column(Integer, default=1)  # 1-8 tier system
    credit_score = Column(Integer, default=150)  # 0-1000+ score
    perfect_repayment_streak = Column(Integer, default=0)  # Consecutive perfect repayments
    current_limit = Column(Float, default=500.0)  # Current loan limit in KSh
    max_limit_achieved = Column(Float, default=500.0)  # Highest limit ever achieved
    
    # Borrowing control fields
    borrowing_blocked = Column(Boolean, default=False)
    block_expiry = Column(DateTime(timezone=True), nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # ============================================================
    # KYC VERIFICATION FIELDS
    # ============================================================
    kyc_status = Column(String(20), default="PENDING")  # PENDING, SUBMITTED, VERIFIED, REJECTED
    kyc_verified_at = Column(DateTime(timezone=True), nullable=True)
    kyc_verified_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    kyc_rejection_reason = Column(Text, nullable=True)
    
    # Relationships
    loans = relationship("Loan", back_populates="borrower", foreign_keys="Loan.borrower_id")
    payments = relationship("Transaction", back_populates="borrower", foreign_keys="Transaction.borrower_id")


class Loan(Base):
    """Loan model for Okoleo 9-day loan product - simplified"""
    __tablename__ = "loans"
    
    id = Column(Integer, primary_key=True, index=True)
    loan_id = Column(String(100), unique=True, index=True, nullable=False)
    borrower_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # ============================================================
    # OKOLEO 9-DAY LOAN PARAMETERS
    # ============================================================
    principal = Column(Float, nullable=False)  # Loan amount in KSh (500-15000)
    interest_rate = Column(Float, default=0.04)  # Annual rate = 4%
    term_days = Column(Integer, default=9)  # Fixed 9-day term
    
    # Phone number for payment verification
    phone_number = Column(String(20), nullable=True)  # Borrower's registered phone
    
    # Fee structure
    processing_fee = Column(Float, default=0.0)  # Flat processing fee
    
    # Calculated fields
    interest_amount = Column(Float, default=0.0)  # Interest for the term
    total_due = Column(Float, nullable=False)  # principal + interest + fees
    
    # Repayment tracking
    due_date = Column(DateTime(timezone=True), nullable=False)
    payment_date = Column(DateTime(timezone=True), nullable=True)
    late_days = Column(Integer, default=0)  # Days past due_date
    perfect_repayment = Column(Boolean, default=False)  # True if paid on/before due_date
    
    # Late penalty (6.8% of principal, not outstanding)
    late_penalty_amount = Column(Float, default=0.0)
    
    # Status
    status = Column(SQLEnum(LoanStatus), default=LoanStatus.PENDING)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    borrower = relationship("User", back_populates="loans", foreign_keys=[borrower_id])
    transactions = relationship("Transaction", back_populates="loan")
    audit_logs = relationship("AuditLog", back_populates="loan")


class Transaction(Base):
    """Transaction model for loan payments - simplified"""
    __tablename__ = "transactions"
    
    id = Column(Integer, primary_key=True, index=True)
    transaction_id = Column(String(100), unique=True, index=True, nullable=False)
    
    borrower_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    loan_id = Column(Integer, ForeignKey("loans.id"), nullable=False)
    
    # Transaction type - DISBURSEMENT (loan given) or REPAYMENT (payment made)
    type = Column(SQLEnum(TransactionType), default=TransactionType.REPAYMENT)
    
    # Payment amount
    amount = Column(Float, nullable=False)
    
    # Remaining balance after this transaction (for repayments)
    remaining_balance = Column(Float, nullable=True)
    
    # Status
    status = Column(SQLEnum(TransactionStatus), default=TransactionStatus.PENDING)
    
    # Timestamps
    initiated_at = Column(DateTime(timezone=True), server_default=func.now())
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    borrower = relationship("User", foreign_keys=[borrower_id])
    loan = relationship("Loan", back_populates="transactions")


class CreditScoreHistory(Base):
    """Track credit score changes over time"""
    __tablename__ = "credit_score_history"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    score = Column(Integer, nullable=False)
    tier = Column(Integer, nullable=False)
    change_reason = Column(String(100), nullable=True)  # e.g., "on_time_payment", "late_payment", "default"
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User", backref="credit_history")


class AuditLog(Base):
    """Comprehensive audit trail"""
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    loan_id = Column(Integer, ForeignKey("loans.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Audit Details
    action = Column(String(100), nullable=False)
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(String(100), nullable=True)
    
    # Changes
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    
    # Detailed information (for rejection reasons, etc.)
    details = Column(Text, nullable=True)
    
    # Context
    ip_address = Column(String(50), nullable=True)
    user_agent = Column(String(255), nullable=True)
    
    # Timestamp
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    loan = relationship("Loan", back_populates="audit_logs")


# ============================================================================
# NOTIFICATION MODELS
# ============================================================================

class NotificationType(str, enum.Enum):
    """Notification type definitions"""
    # User notifications
    LOAN_APPROVED = "LOAN_APPROVED"
    LOAN_DECLINED = "LOAN_DECLINED"
    PAYMENT_DUE_REMINDER = "PAYMENT_DUE_REMINDER"
    CREDIT_LIMIT_INCREASED = "CREDIT_LIMIT_INCREASED"
    TIER_UPGRADE = "TIER_UPGRADE"
    WELCOME_MESSAGE = "WELCOME_MESSAGE"


class NotificationPriority(str, enum.Enum):
    """Notification priority levels"""
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class Notification(Base):
    """Notification model for user alerts - simplified"""
    __tablename__ = "notifications"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Notification content
    type = Column(SQLEnum(NotificationType), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    
    # Priority and status
    priority = Column(SQLEnum(NotificationPriority), default=NotificationPriority.MEDIUM)
    is_read = Column(Boolean, default=False)
    read_at = Column(DateTime(timezone=True), nullable=True)
    
    # Related entity (optional)
    related_entity_type = Column(String(50), nullable=True)
    related_entity_id = Column(Integer, nullable=True)
    
    # Delivery tracking
    is_delivered = Column(Boolean, default=False)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User", foreign_keys=[user_id])


class NotificationPreference(Base):
    """User notification preferences"""
    __tablename__ = "notification_preferences"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    
    # Email preferences
    email_enabled = Column(Boolean, default=True)
    email_for_loans = Column(Boolean, default=True)
    email_for_payments = Column(Boolean, default=True)
    email_for_marketing = Column(Boolean, default=False)
    
    # Push preferences
    push_enabled = Column(Boolean, default=True)
    push_for_loans = Column(Boolean, default=True)
    push_for_payments = Column(Boolean, default=True)
    push_for_marketing = Column(Boolean, default=False)
    
    # SMS preferences (optional)
    sms_enabled = Column(Boolean, default=False)
    sms_for_critical = Column(Boolean, default=True)
    
    # Quiet hours
    quiet_hours_enabled = Column(Boolean, default=False)
    quiet_hours_start = Column(String(5), default="22:00")  # HH:MM format
    quiet_hours_end = Column(String(5), default="07:00")  # HH:MM format
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    user = relationship("User")


# ============================================================================
# USER PROFILE & SETTINGS MODELS
# ============================================================================

class UserProfile(Base):
    """Extended user profile information"""
    __tablename__ = "user_profiles"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    
    # Personal Information
    phone = Column(String(20), nullable=True)
    national_id = Column(String(50), nullable=True)
    date_of_birth = Column(DateTime(timezone=True), nullable=True)
    location = Column(String(255), nullable=True)
    address = Column(Text, nullable=True)
    
    # KYC Status
    kyc_status = Column(String(20), default="PENDING")  # PENDING, SUBMITTED, VERIFIED, REJECTED
    kyc_verified_at = Column(DateTime(timezone=True), nullable=True)
    kyc_rejection_reason = Column(Text, nullable=True)
    
    # Payment Methods
    mpesa_phone = Column(String(20), nullable=True)
    mpesa_verified = Column(Boolean, default=False)
    
    # Loan Preferences
    preferred_loan_amount = Column(Float, nullable=True)
    preferred_term_days = Column(Integer, default=9)
    auto_repay = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    user = relationship("User", foreign_keys=[user_id])


class UserSettings(Base):
    """User application preferences"""
    __tablename__ = "user_settings"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    
    # App Preferences
    theme = Column(String(20), default="light")  # light, dark, system
    language = Column(String(10), default="en")  # en, sw
    currency = Column(String(10), default="KES")  # KES, USD
    
    # Privacy Settings
    profile_public = Column(Boolean, default=False)
    show_balance = Column(Boolean, default=True)
    
    # Communication
    marketing_emails = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    user = relationship("User", foreign_keys=[user_id])


class SystemSettings(Base):
    """System-wide configuration settings (admin controlled)"""
    __tablename__ = "system_settings"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Category
    category = Column(String(50), nullable=False)  # general, loan, payment, security, notification
    
    # Key-Value Storage
    setting_key = Column(String(100), nullable=False)
    setting_value = Column(Text, nullable=True)
    setting_type = Column(String(20), default="string")  # string, number, boolean, json
    
    # Metadata
    description = Column(Text, nullable=True)
    is_editable = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Unique constraint
    __table_args__ = (
        UniqueConstraint('category', 'setting_key', name='uq_system_settings_category_key'),
    )
