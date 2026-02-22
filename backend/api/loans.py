from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, cast, String, func
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta
import random
import logging

logger = logging.getLogger(__name__)

from core.database import get_db
from models.models import User, UserRole, Loan, AuditLog, UserProfile
from schemas.schemas import (
    LoanCreate, LoanResponse, LoanDetailResponse, LoanBulkUpload,
    LoanUpdate, LoanListItem, LoanListResponse
)
from api.auth import get_current_user
from api.transactions import calculate_outstanding_balance

router = APIRouter()


def check_admin(user: User) -> bool:
    """Check if user is admin"""
    return user.role == UserRole.ADMIN


def check_loan_ownership(loan: Loan, user: User) -> bool:
    """Check if user owns the loan (is the borrower)"""
    return loan.borrower_id == user.id


@router.post("/", response_model=LoanResponse, status_code=status.HTTP_201_CREATED)
async def create_loan(
    loan_data: LoanCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new loan (any authenticated user)"""
    loan_service = request.app.state.loan_service
    
    try:
        loan = await loan_service.create_loan(db, loan_data, current_user.id)
        return loan
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create loan: {str(e)}"
        )


# ============================================================
# LOAN APPLICATION ENDPOINT (User-facing)
# ============================================================

class LoanApplicationSchema(BaseModel):
    """Schema for loan application from user form"""
    amount: float
    term_days: int
    purpose: str
    full_name: str
    national_id: str
    phone_number: str
    mpesa_number: str
    employment_status: str
    monthly_income: float
    terms_accepted: bool


@router.post("/apply", response_model=dict, status_code=status.HTTP_201_CREATED)
async def apply_for_loan(
    application: LoanApplicationSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Save loan application to database - requires KYC verification"""
    
    # Check KYC status from UserProfile - only VERIFIED users can apply for loans
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first()
    
    # Determine KYC status: prefer UserProfile, fallback to User model
    kyc_status = profile.kyc_status if profile else current_user.kyc_status
    
    if not kyc_status or kyc_status != "VERIFIED":
        kyc_message = "KYC verification required before applying for loans."
        if kyc_status == "REJECTED":
            kyc_message = "Your KYC verification was rejected. Please contact support for assistance."
        elif kyc_status == "PENDING" or kyc_status == "SUBMITTED":
            kyc_message = "Your KYC verification is still being processed. Please wait for verification to complete before applying for loans."
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=kyc_message
        )
    
    # Log incoming data for debugging
    print(f"[LOAN APPLY] Received application: {application.dict()}")
    print(f"[LOAN APPLY] Current user: {current_user.id}")
    
    # Calculate loan details
    interest_rate = 0.04  # 4% annual
    daily_rate = interest_rate / 365
    interest_amount = application.amount * daily_rate * application.term_days
    total_due = application.amount + interest_amount
    due_date = datetime.utcnow() + timedelta(days=application.term_days)
    
    # Generate unique loan ID
    loan_id = f"OKL-{datetime.utcnow().strftime('%Y%m%d')}-{current_user.id}-{random.randint(1000, 9999)}"
    
    # Check if loan_id already exists
    existing = db.query(Loan).filter(Loan.loan_id == loan_id).first()
    if existing:
        loan_id = f"OKL-{datetime.utcnow().strftime('%Y%m%d')}-{current_user.id}-{random.randint(1000, 9999)}"
    
    # Create loan record with ACTIVE status (auto-approve for demo)
    try:
        loan = Loan(
            loan_id=loan_id,
            borrower_id=current_user.id,
            phone_number=current_user.phone,  # Store borrower's registered phone
            principal=application.amount,
            interest_rate=interest_rate,
            term_days=application.term_days,
            processing_fee=0.0,
            interest_amount=interest_amount,
            total_due=total_due,
            due_date=due_date,
            status="PENDING",  # Requires admin approval
            perfect_repayment=False,
            late_days=0,
            late_penalty_amount=0.0,
            created_at=datetime.utcnow()
        )
        
        db.add(loan)
        db.commit()
        db.refresh(loan)
        print(f"[LOAN APPLY] Loan created successfully: {loan.id}")
    except Exception as e:
        print(f"[LOAN APPLY] Error creating loan: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
        raise
    
    # Log activity
    try:
        audit_log = AuditLog(
            user_id=current_user.id,
            action="LOAN_APPLIED",
            details=f"Applied for KSh {application.amount}",
            entity_type="LOAN"
        )
        db.add(audit_log)
        db.commit()
    except Exception as e:
        print(f"[LOAN APPLY] Warning: Could not create audit log: {e}")
        db.rollback()
    
    return {
        "success": True,
        "loan_id": loan.loan_id,
        "message": "Loan application submitted successfully",
        "amount": loan.principal,
        "total_due": loan.total_due,
        "due_date": loan.due_date.isoformat() if loan.due_date else None,
        "id": loan.id,
        "phone": loan.phone_number  # Return phone for display
    }


@router.post("/bulk", response_model=List[LoanResponse], status_code=status.HTTP_201_CREATED)
async def create_loans_bulk(
    bulk_data: LoanBulkUpload,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create multiple loans in bulk (admin only)"""
    # Only admins can create loans in bulk
    if not check_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bulk loan creation is admin-only"
        )
    
    loan_service = request.app.state.loan_service
    
    try:
        loans = await loan_service.create_loans_bulk(db, bulk_data.loans, current_user.id)
        return loans
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Bulk upload failed: {str(e)}"
        )


# ============================================================
# SPECIFIC ROUTES - These MUST come before parameterized routes
# ============================================================

@router.get("/my-loans", response_model=List[LoanListItem])
async def get_my_loans_v2(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all loans for the current user"""
    logger.info(f"[MY-LOANS] User: {current_user.id}, skip: {skip}, limit: {limit}")
    
    loans = db.query(Loan).filter(
        Loan.borrower_id == current_user.id
    ).order_by(Loan.created_at.desc()).offset(skip).limit(limit).all()
    
    # Import the calculation function
    from api.transactions import calculate_outstanding_balance
    
    # Convert to Pydantic models with calculated outstanding_balance
    result = []
    for loan in loans:
        outstanding = calculate_outstanding_balance(db, loan)
        result.append(
            LoanListItem(
                id=loan.id,
                loan_id=loan.loan_id,
                principal=loan.principal,
                total_due=loan.total_due,
                interest_rate=loan.interest_rate,
                term_days=loan.term_days,
                status=loan.status.value if loan.status else "UNKNOWN",
                due_date=loan.due_date.isoformat() if loan.due_date else None,
                created_at=loan.created_at.isoformat() if loan.created_at else None,
                payment_date=loan.payment_date.isoformat() if loan.payment_date else None,
                perfect_repayment=loan.perfect_repayment,
                late_days=loan.late_days,
                interest_amount=loan.interest_amount,
                processing_fee=loan.processing_fee,
                outstanding_balance=outstanding,
                phone_number=loan.phone_number
            )
        )
    
    return result


@router.get("/recent", response_model=LoanListResponse)
async def get_recent_loans(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get recent loans for current user (empty search fallback)
    """
    logger.info(f"[RECENT_LOANS] User: {current_user.id}, skip: {skip}, limit: {limit}")
    
    if check_admin(current_user):
        loans = db.query(Loan).order_by(Loan.created_at.desc()).offset(skip).limit(limit).all()
    else:
        loans = db.query(Loan).filter(
            Loan.borrower_id == current_user.id
        ).order_by(Loan.created_at.desc()).offset(skip).limit(limit).all()
    
    # Import the calculation function
    from api.transactions import calculate_outstanding_balance
    
    # Convert to Pydantic models
    items = []
    for loan in loans:
        outstanding = calculate_outstanding_balance(db, loan)
        items.append(
            LoanListItem(
                id=loan.id,
                loan_id=loan.loan_id,
                principal=loan.principal,
                total_due=loan.total_due,
                interest_rate=loan.interest_rate,
                term_days=loan.term_days,
                status=loan.status.value if loan.status else "UNKNOWN",
                due_date=loan.due_date.isoformat() if loan.due_date else None,
                created_at=loan.created_at.isoformat() if loan.created_at else None,
                payment_date=loan.payment_date.isoformat() if loan.payment_date else None,
                perfect_repayment=loan.perfect_repayment,
                late_days=loan.late_days,
                interest_amount=loan.interest_amount,
                processing_fee=loan.processing_fee,
                outstanding_balance=outstanding,
                phone_number=loan.phone_number
            )
        )
    
    return LoanListResponse(
        items=items,
        total=len(loans),
        skip=skip,
        limit=limit
    )


@router.get("/search", response_model=LoanListResponse)
async def search_loans(
    q: str = Query(default="", description="Search query"),
    status: str = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Search loans for current user.
    
    - Regular users can only see their own loans
    - Admins can see all loans
    """
    logger.info(f"[SEARCH_LOANS] User: {current_user.id}, q: {q}, status: {status}, skip: {skip}, limit: {limit}")
    
    search_term = f"%{q}%"
    
    # Base query depending on user role
    if check_admin(current_user):
        # Admins see all loans
        query = db.query(Loan)
    else:
        # Regular users see only their loans
        query = db.query(Loan).filter(Loan.borrower_id == current_user.id)
    
    # Apply search filter
    if q:
        query = query.filter(
            or_(
                Loan.loan_id.like(search_term),
                cast(Loan.principal, String).like(search_term),
                Loan.status.cast(String).like(func.upper(search_term))
            )
        )
    
    # Apply status filter
    if status:
        query = query.filter(Loan.status == status.upper())
    
    # Get total count
    total = query.count()
    
    # Get paginated results
    loans = query.order_by(Loan.created_at.desc()).offset(skip).limit(limit).all()
    
    # Convert to Pydantic models
    items = [
        LoanListItem(
            id=loan.id,
            loan_id=loan.loan_id,
            principal=loan.principal,
            total_due=loan.total_due,
            interest_rate=loan.interest_rate,
            term_days=loan.term_days,
            status=loan.status.value if loan.status else "UNKNOWN",
            due_date=loan.due_date.isoformat() if loan.due_date else None,
            created_at=loan.created_at.isoformat() if loan.created_at else None,
            payment_date=loan.payment_date.isoformat() if loan.payment_date else None,
            perfect_repayment=loan.perfect_repayment,
            late_days=loan.late_days,
            interest_amount=loan.interest_amount,
            processing_fee=loan.processing_fee
        )
        for loan in loans
    ]
    
    return LoanListResponse(
        items=items,
        total=total,
        skip=skip,
        limit=limit
    )


@router.get("/", response_model=List[LoanResponse])
async def get_my_loans(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=1000),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get loans for current user"""
    logger.info(f"[GET_LOANS] User: {current_user.id}, skip: {skip}, limit: {limit}")
    
    loan_service = request.app.state.loan_service
    
    if check_admin(current_user):
        # Admins see all loans
        loans = db.query(Loan).offset(skip).limit(limit).all()
    else:
        # Regular users see their own loans
        loans = loan_service.get_loans_by_borrower(db, current_user.id, skip, limit)
    
    # Calculate outstanding balance for each loan
    for loan in loans:
        loan.outstanding_balance = calculate_outstanding_balance(db, loan)
    
    return loans


# Also handle route without trailing slash (prevents redirect that loses auth token)
@router.get("", response_model=List[LoanResponse])
async def get_my_loans_no_slash(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=1000),
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get loans for current user (no trailing slash)"""
    logger.info(f"[GET_LOANS] User: {current_user.id}, skip: {skip}, limit: {limit}")
    
    loan_service = request.app.state.loan_service
    
    if check_admin(current_user):
        # Admins see all loans
        loans = db.query(Loan).offset(skip).limit(limit).all()
    else:
        # Regular users see their own loans
        loans = loan_service.get_loans_by_borrower(db, current_user.id, skip, limit)
    
    # Calculate outstanding balance for each loan
    for loan in loans:
        loan.outstanding_balance = calculate_outstanding_balance(db, loan)
    
    return loans


# ============================================================
# PARAMETERIZED ROUTES - These MUST come after specific routes
# ============================================================

@router.get("/{loan_id}", response_model=LoanDetailResponse)
async def get_loan(
    loan_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get loan details by ID"""
    loan_service = request.app.state.loan_service
    loan = loan_service.get_loan_by_id(db, loan_id)
    
    if not loan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Loan not found"
        )
    
    # Check access permissions - admins see all, users see their own
    if not check_admin(current_user) and not check_loan_ownership(loan, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Calculate outstanding balance
    loan.outstanding_balance = calculate_outstanding_balance(db, loan)
    
    return loan


@router.put("/{loan_id}", response_model=LoanResponse)
async def update_loan(
    loan_id: int,
    update_data: LoanUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update loan details"""
    # Only admins can update loans
    if not check_admin(current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can update loans"
        )
    
    loan_service = request.app.state.loan_service
    
    try:
        loan = loan_service.get_loan_by_id(db, loan_id)
        if not loan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Loan not found"
            )
        
        updated_loan = loan_service.update_loan(db, loan_id, update_data, current_user.id)
        return updated_loan
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/activities", tags=["Activities"])
async def get_user_activities(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get user activities (audit logs) for the current user.
    Returns loan applications, repayments, and other user actions.
    """
    # Get activities where user_id matches current user
    # This includes loan audit logs and user actions
    activities = db.query(AuditLog).filter(
        AuditLog.user_id == current_user.id
    ).order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()
    
    # Also get activities for loans owned by this user
    user_loans = db.query(Loan).filter(Loan.borrower_id == current_user.id).all()
    loan_ids = [loan.id for loan in user_loans]
    
    if loan_ids:
        loan_activities = db.query(AuditLog).filter(
            AuditLog.loan_id.in_(loan_ids)
        ).order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()
        
        # Combine and deduplicate
        all_activities = {a.id: a for a in activities}
        for activity in loan_activities:
            if activity.id not in all_activities:
                all_activities[activity.id] = activity
        
        # Sort by created_at desc and limit
        sorted_activities = sorted(
            all_activities.values(),
            key=lambda x: x.created_at,
            reverse=True
        )[skip:skip + limit]
        
        return sorted_activities
    
    return activities


# ============================================================================
# ACTIVITY LOGGING
# ============================================================================

class ActivityLogCreate(BaseModel):
    action: str
    details: str = None

@router.post("/log-activity", tags=["Activities"])
async def log_user_activity(
    activity_data: ActivityLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Log a user activity to the audit log"""
    audit_log = AuditLog(
        user_id=current_user.id,
        action=activity_data.action,
        details=activity_data.details,
        entity_type="USER_ACTIVITY"
    )
    db.add(audit_log)
    db.commit()
    db.refresh(audit_log)
    
    return {"message": "Activity logged", "id": audit_log.id}
