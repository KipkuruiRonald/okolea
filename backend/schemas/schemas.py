from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, List
from datetime import datetime
from models.models import LoanStatus, TransactionStatus, TransactionType, NotificationType, NotificationPriority


# ============================================================================
# USER SCHEMAS
# ============================================================================

class UserBase(BaseModel):
    """Base user schema - simplified for loan app"""
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=100)
    full_name: str = Field(..., min_length=1, max_length=255)
    phone: str  # Required for M-Pesa, SMS notifications, CRB checks
    national_id: Optional[str] = None
    date_of_birth: Optional[datetime] = None
    location: Optional[str] = None


class UserCreate(UserBase):
    """Schema for user registration - SIMPLIFIED for loan app"""
    password: str = Field(..., min_length=8)
    
    @validator('phone', check_fields=False)
    def validate_phone(cls, v):
        if not v:
            raise ValueError('Phone number is required')
        # Remove any spaces or dashes
        v = v.replace(' ', '').replace('-', '')
        # Validate Kenyan phone format
        if v.startswith('0') and len(v) == 10 and v[1:].isdigit():
            return v  # Valid 07XXXXXXXX format
        elif v.startswith('+254') and len(v) == 13 and v[4:].isdigit():
            return v  # Valid +254XXXXXXXXX format
        elif v.startswith('254') and len(v) == 12 and v.isdigit():
            return f"+{v}"  # Convert 254XXXXXXXXX to +254XXXXXXXXX
        else:
            raise ValueError('Phone must be in format: 0712345678 or +254712345678')
    
    @validator('password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not any(char.isdigit() for char in v):
            raise ValueError('Password must contain at least one number')
        if not any(char.isupper() for char in v):
            raise ValueError('Password must contain at least one uppercase letter')
        return v
    
    class Config:
        json_schema_extra = {
            "example": {
                "email": "john@example.com",
                "username": "johnkamau",
                "full_name": "John Kamau",
                "phone": "0712345678",
                "password": "Password123"
            }
        }


class UserUpdate(BaseModel):
    """Schema for updating user info"""
    full_name: Optional[str] = None
    is_active: Optional[bool] = None


# ============================================================
# OKOLEO CREDIT STATUS SCHEMA (Section 2.1)
# ============================================================
class CreditStatusResponse(BaseModel):
    """Response containing user's credit tier and limit status"""
    credit_tier: int = Field(..., ge=1, le=8)
    credit_score: int = Field(..., ge=0)
    current_limit: float = Field(..., ge=0)
    max_limit_achieved: float = Field(..., ge=0)
    perfect_repayment_streak: int = Field(default=0, ge=0)
    borrowing_blocked: bool = False
    block_expiry: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class UserResponse(UserBase):
    """User response schema - simplified for loan app"""
    id: int
    role: str  # Include role for access control
    is_active: bool
    
    # Login tracking
    last_login: Optional[datetime] = None
    last_login_ip: Optional[str] = None
    login_count: int = 0
    
    # Credit fields
    credit_tier: int = 1
    credit_score: int = 150
    perfect_repayment_streak: int = 0
    current_limit: float = 500.0
    max_limit_achieved: float = 500.0
    borrowing_blocked: bool = False
    
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class AdminUserResponse(BaseModel):
    """Admin user response schema with all user fields"""
    id: int
    email: str
    username: str
    full_name: str
    phone: Optional[str] = None
    national_id: Optional[str] = None
    date_of_birth: Optional[datetime] = None
    location: Optional[str] = None
    role: str
    is_active: bool
    is_verified: bool = False
    
    # Login tracking
    last_login: Optional[datetime] = None
    last_login_ip: Optional[str] = None
    login_count: int = 0
    
    # Credit fields
    credit_tier: int = 1
    credit_score: int = 150
    perfect_repayment_streak: int = 0
    current_limit: float = 500.0
    max_limit_achieved: float = 500.0
    borrowing_blocked: bool = False
    
    # KYC status
    kyc_status: str = "PENDING"
    
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# ============================================================================
# AUTH SCHEMAS
# ============================================================================

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: Optional[int] = None


class LoginRequest(BaseModel):
    username: str
    password: str


# ============================================================================
# LOAN SCHEMAS
# ============================================================================

# ============================================================
# OKOLEO 9-DAY LOAN BASE (Section 1.1)
# ============================================================
class LoanBase(BaseModel):
    """Base schema for Okoleo 9-day loan product"""
    principal: float = Field(..., gt=0, le=15000)  # KSh, max 15000
    interest_rate: float = Field(default=0.04, gt=0, lt=1)  # 4% annual
    term_days: int = Field(default=9, ge=9, le=9)  # Fixed 9-day term
    processing_fee: float = Field(default=0.0, ge=0)  # Flat fee


class LoanCreate(LoanBase):
    """Schema for creating a new 9-day loan"""
    loan_id: str = Field(..., min_length=1, max_length=100)


class LoanBulkUpload(BaseModel):
    loans: List[LoanCreate]


class LoanUpdate(BaseModel):
    status: Optional[LoanStatus] = None
    late_days: Optional[int] = Field(None, ge=0)
    payment_date: Optional[datetime] = None
    perfect_repayment: Optional[bool] = None


# ============================================================
# OKOLEO LOAN RESPONSE (Section 1.3)
# ============================================================
class LoanResponse(BaseModel):
    """Response schema for 9-day loan"""
    id: int
    loan_id: str
    borrower_id: int
    
    # 9-day loan parameters
    principal: float
    interest_rate: float
    term_days: int
    processing_fee: float
    interest_amount: float
    total_due: float
    due_date: Optional[datetime] = None
    payment_date: Optional[datetime] = None
    late_days: int = 0
    perfect_repayment: bool = False
    late_penalty_amount: float = 0.0
    
    # Outstanding balance - calculated from transactions
    outstanding_balance: Optional[float] = None
    
    # Status
    status: LoanStatus
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# Simplified loan response for list views
class LoanListItem(BaseModel):
    """Simplified loan response for list views"""
    id: int
    loan_id: str
    principal: float
    total_due: float
    interest_rate: float
    term_days: int
    status: str  # Using string instead of enum for simpler serialization
    due_date: Optional[str] = None
    created_at: Optional[str] = None
    payment_date: Optional[str] = None
    perfect_repayment: bool = False
    late_days: int = 0
    interest_amount: float = 0.0
    processing_fee: float = 0.0
    outstanding_balance: Optional[float] = None  # Calculated from transactions
    phone_number: Optional[str] = None  # Phone number for repayment
    
    class Config:
        from_attributes = True


class LoanListResponse(BaseModel):
    """Response schema for paginated loan list"""
    items: List[LoanListItem]
    total: int
    skip: int
    limit: int


class TransactionListResponse(BaseModel):
    """Response schema for paginated transaction list"""
    items: List["TransactionResponse"]
    total: int
    skip: int
    limit: int

    class Config:
        from_attributes = True


class LoanDetailResponse(LoanResponse):
    originator: UserResponse
    transactions: List["TransactionResponse"] = []


# ============================================================
# OKOLEO CALCULATION SCHEMAS (Section 1.3)
# ============================================================
class LoanQuoteRequest(BaseModel):
    """Request to calculate loan quote"""
    principal: float = Field(..., gt=0, le=15000)


class LoanQuoteResponse(BaseModel):
    """Response with loan quote calculation"""
    principal: float
    interest_rate: float  # Annual rate
    term_days: int = 9
    interest_amount: float
    processing_fee: float
    total_due: float
    due_date: datetime
    late_penalty_amount: float  # 6.8% of principal
    
    class Config:
        from_attributes = True


class RepaymentRequest(BaseModel):
    """Request for loan repayment"""
    payment_amount: float = Field(..., gt=0)


class RepaymentResponse(BaseModel):
    """Response after repayment processing"""
    loan_id: str
    payment_amount: float
    payment_date: datetime
    late_days: int
    penalty_applied: float
    perfect_repayment: bool
    new_credit_score: Optional[int] = None
    new_tier: Optional[int] = None
    new_limit: Optional[float] = None


# ============================================================================
# TRANSACTION SCHEMAS
# ============================================================================

class TransactionBase(BaseModel):
    """Base schema for transactions - simplified for loan payments"""
    amount: float = Field(..., ge=0)
    type: TransactionType = Field(default=TransactionType.REPAYMENT)


class TransactionCreate(TransactionBase):
    borrower_id: Optional[int] = None  # Optional - derived from authenticated user
    loan_id: int
    phone_number: str = Field(..., description="Confirmed phone number for verification")


class TransactionInitiate(BaseModel):
    """Schema for initiating a payment"""
    loan_id: int
    amount: float = Field(..., gt=0)
    phone_number: str = Field(..., description="Confirmed phone number for verification")


class TransactionResponse(TransactionBase):
    id: int
    transaction_id: str
    borrower_id: int
    loan_id: int
    remaining_balance: Optional[float] = None
    status: TransactionStatus
    initiated_at: datetime
    confirmed_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# Credit Score History Schema
class CreditScoreHistoryResponse(BaseModel):
    id: int
    user_id: int
    score: int
    tier: int
    change_reason: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class CreditScoreTrendResponse(BaseModel):
    current_score: int
    previous_month_score: Optional[int] = None
    change: int
    change_percent: float
    trend: str


# ============================================================================
# AUDIT SCHEMAS
# ============================================================================

class AuditLogResponse(BaseModel):
    id: int
    action: str
    entity_type: str
    entity_id: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


# ============================================================================
# HEALTH CHECK SCHEMA
# ============================================================================

class HealthCheck(BaseModel):
    """Health check response - simplified"""
    status: str
    version: str
    database: str


# ============================================================================
# NOTIFICATION SCHEMAS
# ============================================================================

class NotificationResponse(BaseModel):
    """Response schema for notification"""
    id: int
    user_id: int
    type: NotificationType
    title: str
    message: str
    priority: NotificationPriority
    is_read: bool
    read_at: Optional[datetime] = None
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[int] = None
    is_delivered: bool
    delivered_at: Optional[datetime] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class NotificationCreate(BaseModel):
    """Schema for creating a notification"""
    user_id: int
    type: NotificationType
    title: str = Field(..., min_length=1, max_length=255)
    message: str = Field(..., min_length=1)
    priority: NotificationPriority = NotificationPriority.MEDIUM
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[int] = None


class NotificationMarkRead(BaseModel):
    """Schema for marking notifications as read"""
    notification_ids: List[int] = Field(..., min_items=1)


class NotificationPreferenceResponse(BaseModel):
    """Response schema for notification preferences"""
    id: int
    user_id: int
    email_enabled: bool
    email_for_loans: bool
    email_for_payments: bool
    email_for_marketing: bool
    push_enabled: bool
    push_for_loans: bool
    push_for_payments: bool
    push_for_marketing: bool
    sms_enabled: bool
    sms_for_critical: bool
    quiet_hours_enabled: bool
    quiet_hours_start: str
    quiet_hours_end: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class NotificationPreferenceUpdate(BaseModel):
    """Schema for updating notification preferences"""
    email_enabled: Optional[bool] = None
    email_for_loans: Optional[bool] = None
    email_for_payments: Optional[bool] = None
    email_for_marketing: Optional[bool] = None
    push_enabled: Optional[bool] = None
    push_for_loans: Optional[bool] = None
    push_for_payments: Optional[bool] = None
    push_for_marketing: Optional[bool] = None
    sms_enabled: Optional[bool] = None
    sms_for_critical: Optional[bool] = None
    quiet_hours_enabled: Optional[bool] = None
    quiet_hours_start: Optional[str] = None
    quiet_hours_end: Optional[str] = None


class NotificationUnreadCount(BaseModel):
    """Response for unread notification count"""
    unread_count: int


class NotificationListResponse(BaseModel):
    """Response for paginated notifications"""
    notifications: List[NotificationResponse]
    total: int
    unread_count: int


# Update forward references
LoanDetailResponse.model_rebuild()
TransactionListResponse.model_rebuild()
