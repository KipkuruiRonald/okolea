from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, cast, String
from typing import List, Optional
from datetime import datetime
import uuid

from core.database import get_db
from models.models import User, UserRole, AuditLog, Loan, LoanStatus, Transaction, TransactionType, TransactionStatus, Notification, NotificationType, NotificationPriority, SystemSettings, UserProfile
from schemas.schemas import AuditLogResponse, UserResponse, AdminUserResponse
from api.auth import get_current_user, require_role

router = APIRouter()

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Require admin role"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


# Stats endpoint
@router.get("/stats")
async def get_admin_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Get admin dashboard statistics"""
    try:
        # Count active loans
        active_loans = db.query(Loan).filter(Loan.status == 'ACTIVE').count()
        
        # Count pending loans
        pending_loans = db.query(Loan).filter(Loan.status == 'PENDING').count()
        
        # Count total users
        total_users = db.query(User).count()
        
        # Calculate default rate
        total_loans = db.query(Loan).count()
        defaulted_loans = db.query(Loan).filter(Loan.status == 'DEFAULTED').count()
        default_rate = (defaulted_loans / total_loans * 100) if total_loans > 0 else 0
        
        # Calculate portfolio value (sum of total_due for active loans)
        portfolio_value = db.query(func.sum(Loan.total_due)).filter(Loan.status == 'ACTIVE').scalar() or 0
        
        # Calculate disbursed today (sum of principal for loans created today)
        from datetime import datetime, timedelta
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        disbursed_today = db.query(func.sum(Loan.principal)).filter(Loan.created_at >= today_start).scalar() or 0
        
        return {
            "active_loans": active_loans,
            "pending_approvals": pending_loans,
            "total_users": total_users,
            "default_rate": round(default_rate, 2),
            "portfolio_value": float(portfolio_value),
            "disbursed_today": float(disbursed_today),
            "user_tiers": {},
        }
    except Exception as e:
        print(f"ERROR in get_admin_stats: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pending-approvals", response_model=List[dict])
async def get_pending_approvals(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    """Get all pending loan applications"""
    try:
        loans = db.query(Loan).filter(Loan.status == 'PENDING').offset(skip).limit(limit).all()
        
        result = []
        for loan in loans:
            borrower = db.query(User).filter(User.id == loan.borrower_id).first() if loan.borrower_id else None
            result.append({
                "id": loan.id,
                "loan_id": loan.loan_id,
                "borrower_name": borrower.full_name if borrower else "Unknown",
                "borrower_id": loan.borrower_id,
                "principal": loan.principal,
                "interest_rate": loan.interest_rate,
                "term_days": loan.term_days,
                "total_due": loan.total_due,
                "status": loan.status.value if loan.status else None,
                "submitted_at": loan.created_at.isoformat() if loan.created_at else None,
                "due_date": loan.due_date.isoformat() if loan.due_date else None,
                "borrower": {
                    "full_name": borrower.full_name if borrower else "Unknown",
                    "email": borrower.email if borrower else "",
                } if borrower else None,
            })
        
        return result
    except Exception as e:
        print(f"ERROR in get_pending_approvals: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/loans/{loan_id}/approve")
async def approve_loan(
    loan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    """Approve a loan application"""
    try:
        loan = db.query(Loan).filter(Loan.id == loan_id).first()
        
        if not loan:
            raise HTTPException(status_code=404, detail="Loan not found")
        
        loan.status = LoanStatus.ACTIVE
        
        # Create disbursement transaction for the loan
        tx_id = f"TXN-{uuid.uuid4().hex[:12].upper()}"
        disbursement = Transaction(
            transaction_id=tx_id,
            borrower_id=loan.borrower_id,
            loan_id=loan.id,
            type=TransactionType.DISBURSEMENT,
            amount=loan.principal,
            remaining_balance=loan.total_due,
            status=TransactionStatus.CONFIRMED,
            confirmed_at=datetime.utcnow()
        )
        db.add(disbursement)
        
        db.commit()
        
        # Create audit log
        audit = AuditLog(
            user_id=current_user.id,
            action='LOAN_APPROVED',
            entity_type='Loan',
            entity_id=str(loan_id),
            old_value='PENDING',
            new_value='ACTIVE',
            details=f'Loan {loan.loan_id} approved by admin {current_user.username}'
        )
        db.add(audit)
        
        # Create notification for borrower
        notification = Notification(
            user_id=loan.borrower_id,
            type=NotificationType.LOAN_APPROVED,
            title="Loan Approved ✓",
            message=f"Your loan application for KSh {loan.principal:,.0f} has been approved. Funds will be disbursed to your M-Pesa shortly.",
            priority=NotificationPriority.HIGH,
            related_entity_type="LOAN",
            related_entity_id=loan.id
        )
        db.add(notification)
        db.commit()
        
        return {"message": "Loan approved successfully", "loan_id": loan_id}
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR in approve_loan: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/loans/{loan_id}/reject")
async def reject_loan(
    loan_id: int,
    reason: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    """Reject a loan application"""
    try:
        loan = db.query(Loan).filter(Loan.id == loan_id).first()
        
        if not loan:
            raise HTTPException(status_code=404, detail="Loan not found")
        
        loan.status = LoanStatus.REJECTED
        db.commit()
        
        # Create audit log
        audit = AuditLog(
            user_id=current_user.id,
            action='LOAN_REJECTED',
            entity_type='Loan',
            entity_id=loan_id,
            details=f'Loan {loan.loan_id} rejected: {reason}'
        )
        db.add(audit)
        
        # Create notification for borrower
        rejection_message = reason if reason else "Your application did not meet our current lending criteria."
        notification = Notification(
            user_id=loan.borrower_id,
            type=NotificationType.LOAN_DECLINED,
            title="Loan Application Update",
            message=f"Your loan application for KSh {loan.principal:,.0f} has been reviewed. {rejection_message} If you have questions, please contact support.",
            priority=NotificationPriority.MEDIUM,
            related_entity_type="LOAN",
            related_entity_id=loan.id
        )
        db.add(notification)
        db.commit()
        
        return {"message": "Loan rejected", "loan_id": loan_id, "reason": reason}
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR in reject_loan: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/loans")
async def get_admin_loans(
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    """Get all loans with optional status filter"""
    try:
        query = db.query(Loan)
        
        if status:
            query = query.filter(Loan.status == status.upper())
        
        loans = query.offset(skip).limit(limit).all()
        
        result = []
        for loan in loans:
            borrower = db.query(User).filter(User.id == loan.borrower_id).first() if loan.borrower_id else None
            result.append({
                "id": loan.id,
                "loan_id": loan.loan_id,
                "borrower_name": borrower.full_name if borrower else "Unknown",
                "borrower_id": loan.borrower_id,
                "principal": loan.principal,
                "interest_rate": loan.interest_rate,
                "term_days": loan.term_days,
                "total_due": loan.total_due,
                "status": loan.status.value if loan.status else None,
                "due_date": loan.due_date.isoformat() if loan.due_date else None,
                "created_at": loan.created_at.isoformat() if loan.created_at else None,
                "updated_at": loan.updated_at.isoformat() if loan.updated_at else None,
            })
        
        return result
    except Exception as e:
        print(f"ERROR in get_admin_loans: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/loans/{loan_id}/mark-default")
async def mark_loan_default(
    loan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    """Mark a loan as defaulted"""
    try:
        loan = db.query(Loan).filter(Loan.id == loan_id).first()
        
        if not loan:
            raise HTTPException(status_code=404, detail="Loan not found")
        
        loan.status = 'DEFAULTED'
        db.commit()
        
        # Create audit log
        audit = AuditLog(
            user_id=current_user.id,
            action='LOAN_DEFAULTED',
            entity_type='Loan',
            entity_id=loan_id,
            details=f'Loan {loan.loan_id} marked as defaulted'
        )
        db.add(audit)
        db.commit()
        
        return {"message": "Loan marked as defaulted", "loan_id": loan_id}
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR in mark_loan_default: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users", response_model=List[AdminUserResponse])
async def get_all_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    """Get all users with KYC status (Admin only)"""
    try:
        users = db.query(User).offset(skip).limit(limit).all()
        
        # Build response with KYC status from UserProfile
        result = []
        for user in users:
            # Get KYC status from UserProfile
            profile = db.query(UserProfile).filter(UserProfile.user_id == user.id).first()
            
            user_dict = {
                "id": user.id,
                "email": user.email,
                "username": user.username,
                "full_name": user.full_name,
                "phone": user.phone,
                "national_id": user.national_id,
                "date_of_birth": user.date_of_birth,
                "location": user.location,
                "role": user.role.value if user.role else None,
                "is_active": user.is_active,
                "is_verified": profile.kyc_status == "VERIFIED" if profile else False,
                "last_login": user.last_login,
                "last_login_ip": user.last_login_ip,
                "login_count": user.login_count,
                "credit_tier": user.credit_tier,
                "credit_score": user.credit_score,
                "perfect_repayment_streak": user.perfect_repayment_streak,
                "current_limit": user.current_limit,
                "max_limit_achieved": user.max_limit_achieved,
                "borrowing_blocked": user.borrowing_blocked,
                "created_at": user.created_at,
                "updated_at": user.updated_at,
                "kyc_status": profile.kyc_status if profile and profile.kyc_status else "PENDING",
            }
            result.append(user_dict)
        
        return result
    except Exception as e:
        print(f"ERROR in get_all_users: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/kyc/verify/{user_id}")
async def verify_user_kyc(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Verify a user's KYC (Admin only)"""
    try:
        print(f"\n🔵 [KYC VERIFY] ====== START =====")
        print(f"🔵 [KYC VERIFY] User ID: {user_id}")
        print(f"🔵 [KYC VERIFY] Current admin: {current_user.id} - {current_user.username}")
        
        # Find user profile (KYC status is stored in UserProfile)
        profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        if not profile:
            # Create profile if doesn't exist
            profile = UserProfile(user_id=user_id, kyc_status="PENDING")
            db.add(profile)
            db.commit()
            db.refresh(profile)
            print(f"🔵 [KYC VERIFY] Created new profile for user {user_id}")
        
        print(f"🔵 [KYC VERIFY] Current KYC status: {profile.kyc_status}")
        
        # Update profile
        profile.kyc_status = "VERIFIED"
        profile.kyc_verified_at = datetime.utcnow()
        
        print(f"🔵 [KYC VERIFY] New KYC status set to: {profile.kyc_status}")
        print(f"🔵 [KYC VERIFY] Verified at: {profile.kyc_verified_at}")
        
        # Commit changes - THIS IS CRITICAL
        db.commit()
        print(f"✅ [KYC VERIFY] Database committed successfully")
        
        # Refresh to get latest data
        db.refresh(profile)
        print(f"✅ [KYC VERIFY] Final KYC status: {profile.kyc_status}")
        
        # Create audit log
        user = db.query(User).filter(User.id == user_id).first()
        audit = AuditLog(
            user_id=current_user.id,
            action='KYC_VERIFIED',
            entity_type='User',
            entity_id=str(user_id),
            details=f"User {user.full_name if user else user_id} KYC verified by admin"
        )
        db.add(audit)
        db.commit()
        print(f"✅ [KYC VERIFY] Audit log created")
        
        print(f"✅ [KYC VERIFY] ====== SUCCESS =====\n")
        return {"message": "User KYC verified successfully", "kyc_status": profile.kyc_status}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"🔴 [KYC VERIFY] ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/kyc/reject/{user_id}")
async def reject_user_kyc(
    user_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Reject a user's KYC with reason (Admin only)"""
    try:
        print(f"\n🔵 [KYC REJECT] ====== START =====")
        print(f"🔵 [KYC REJECT] User ID: {user_id}")
        
        data = await request.json()
        reason = data.get("reason", "No reason provided")
        
        print(f"🔵 [KYC REJECT] Reason: {reason}")
        
        # Find user profile (KYC status is stored in UserProfile)
        profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
        if not profile:
            # Create profile if doesn't exist
            profile = UserProfile(user_id=user_id, kyc_status="PENDING")
            db.add(profile)
            db.commit()
            db.refresh(profile)
            print(f"🔵 [KYC REJECT] Created new profile for user {user_id}")
        
        print(f"🔵 [KYC REJECT] Current KYC status: {profile.kyc_status}")
        
        profile.kyc_status = "REJECTED"
        profile.kyc_rejection_reason = reason
        
        print(f"🔵 [KYC REJECT] New KYC status set to: {profile.kyc_status}")
        print(f"🔵 [KYC REJECT] Rejection reason: {profile.kyc_rejection_reason}")
        
        db.commit()
        print(f"✅ [KYC REJECT] Database committed successfully")
        
        # Create audit log
        user = db.query(User).filter(User.id == user_id).first()
        audit = AuditLog(
            user_id=current_user.id,
            action='KYC_REJECTED',
            entity_type='User',
            entity_id=str(user_id),
            details=f"User {user.full_name if user else user_id} KYC rejected: {reason}"
        )
        db.add(audit)
        db.commit()
        print(f"✅ [KYC REJECT] Audit log created")
        
        print(f"✅ [KYC REJECT] ====== SUCCESS =====\n")
        return {"message": "User KYC rejected", "reason": reason}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"🔴 [KYC REJECT] ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audit-logs")
async def get_audit_logs(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    entity_type: Optional[str] = None,
    action: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    """Get audit logs (Admin only)"""
    try:
        query = db.query(AuditLog)
        
        if entity_type:
            query = query.filter(AuditLog.entity_type == entity_type)
        
        if action:
            query = query.filter(AuditLog.action == action)
        
        # Get total count for pagination
        total = query.count()
        
        # Get paginated results
        logs = query.order_by(AuditLog.created_at.desc()).offset(skip).limit(limit).all()
        
        # Format response based on actual AuditLog model fields
        items = []
        for log in logs:
            log_dict = {
                "id": log.id,
                "loan_id": log.loan_id,
                "user_id": log.user_id,
                "action": log.action,
                "entity_type": log.entity_type,
                "entity_id": log.entity_id,
                "old_value": log.old_value,
                "new_value": log.new_value,
                "ip_address": log.ip_address,
                "user_agent": log.user_agent,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            items.append(log_dict)
        
        return {
            "items": items,
            "total": total,
            "skip": skip,
            "limit": limit
        }
    except Exception as e:
        print(f"ERROR in get_audit_logs: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audit-logs/loan/{loan_id}")
async def get_loan_audit_logs(
    loan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    """Get audit logs for a specific loan (Admin only)"""
    try:
        logs = db.query(AuditLog)\
            .filter(AuditLog.loan_id == loan_id)\
            .order_by(AuditLog.created_at.desc())\
            .all()
        
        result = []
        for log in logs:
            # Try to convert entity_id to int if possible
            entity_id_value = log.entity_id
            if entity_id_value:
                try:
                    entity_id_value = int(entity_id_value)
                except (ValueError, TypeError):
                    entity_id_value = entity_id_value
            
            result.append({
                "id": log.id,
                "loan_id": log.loan_id,
                "user_id": log.user_id,
                "action": log.action,
                "entity_type": log.entity_type,
                "entity_id": entity_id_value,
                "details": log.details,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            })
        
        return result
    except Exception as e:
        print(f"ERROR in get_loan_audit_logs: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/users/{user_id}/status")
async def update_user_status(
    user_id: int,
    is_active: bool,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    """Activate or deactivate a user (Admin only)"""
    try:
        user = db.query(User).filter(User.id == user_id).first()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        user.is_active = is_active
        db.commit()
        
        return {"message": f"User {user.username} {'activated' if is_active else 'deactivated'} successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR in update_user_status: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# SEARCH ENDPOINTS (Admin only)
# ============================================================================

@router.get("/search/users")
async def search_users(
    q: str = Query("", description="Search query"),
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    """
    Search users by name, email, phone, or national_id (Admin only)
    """
    try:
        search_term = f"%{q}%"
        
        # Build query with filters
        query = db.query(User).filter(
            or_(
                func.lower(User.full_name).like(func.lower(search_term)),
                func.lower(User.email).like(func.lower(search_term)),
                User.phone.like(search_term),
                User.national_id.like(search_term)
            )
        )
        
        # Get total count
        total = query.count()
        
        # Get paginated results
        users = query.offset(skip).limit(limit).all()
        
        # Get loan counts for each user
        result = []
        for user in users:
            loan_count = db.query(Loan).filter(Loan.borrower_id == user.id).count()
            total_borrowed = db.query(func.sum(Loan.principal)).filter(Loan.borrower_id == user.id).scalar() or 0
            
            result.append({
                "id": user.id,
                "full_name": user.full_name,
                "email": user.email,
                "phone": user.phone,
                "national_id": user.national_id,
                "role": user.role.value if user.role else None,
                "is_active": user.is_active,
                "credit_tier": user.credit_tier,
                "credit_score": user.credit_score,
                "current_limit": user.current_limit,
                "created_at": user.created_at.isoformat() if user.created_at else None,
                "loan_count": loan_count,
                "total_borrowed": float(total_borrowed),
            })
        
        return {
            "items": result,
            "total": total,
            "skip": skip,
            "limit": limit
        }
    except Exception as e:
        print(f"ERROR in search_users: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search/loans")
async def search_loans(
    q: str = Query("", description="Search query"),
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    """
    Search loans by loan_id, amount, status, or borrower name (Admin only)
    """
    try:
        search_term = f"%{q}%"
        
        # Build query with joins
        query = db.query(
            Loan,
            User.full_name.label("borrower_name"),
            User.email.label("borrower_email"),
            User.phone.label("borrower_phone")
        ).join(
            User, Loan.borrower_id == User.id
        ).filter(
            or_(
                Loan.loan_id.like(search_term),
                cast(Loan.principal, String).like(search_term),
                Loan.status.like(func.upper(search_term)),
                func.lower(User.full_name).like(func.lower(search_term)),
                User.email.like(search_term),
                User.phone.like(search_term)
            )
        )
        
        # Apply status filter if provided
        if status:
            query = query.filter(Loan.status == status.upper())
        
        # Get total count
        total = query.count()
        
        # Get paginated results
        results = query.offset(skip).limit(limit).all()
        
        # Format response
        loans = []
        for loan, borrower_name, borrower_email, borrower_phone in results:
            loans.append({
                "id": loan.id,
                "loan_id": loan.loan_id,
                "borrower_id": loan.borrower_id,
                "borrower_name": borrower_name,
                "borrower_email": borrower_email,
                "borrower_phone": borrower_phone,
                "principal": loan.principal,
                "total_due": loan.total_due,
                "interest_rate": loan.interest_rate,
                "term_days": loan.term_days,
                "status": loan.status.value if loan.status else None,
                "due_date": loan.due_date.isoformat() if loan.due_date else None,
                "created_at": loan.created_at.isoformat() if loan.created_at else None,
            })
        
        return {
            "items": loans,
            "total": total,
            "skip": skip,
            "limit": limit
        }
    except Exception as e:
        print(f"ERROR in search_loans: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search/transactions")
async def search_transactions(
    q: str = Query("", description="Search query"),
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    """
    Search transactions by transaction_id, amount, type, or user name (Admin only)
    """
    try:
        search_term = f"%{q}%"
        
        # Build query with joins
        query = db.query(
            Transaction,
            User.full_name.label("borrower_name"),
        ).join(
            User, Transaction.borrower_id == User.id
        )
        
        # Apply search filter
        if q:
            query = query.filter(
                or_(
                    Transaction.transaction_id.like(search_term),
                    cast(Transaction.amount, String).like(search_term),
                    func.lower(User.full_name).like(func.lower(search_term))
                )
            )
        
        # Apply status filter if provided
        if status:
            query = query.filter(Transaction.status == status.upper())
        
        # Get total count
        total = query.count()
        
        # Get paginated results
        results = query.offset(skip).limit(limit).all()
        
        # Format response
        transactions = []
        for txn, borrower_name in results:
            transactions.append({
                "id": txn.id,
                "transaction_id": txn.transaction_id,
                "borrower_id": txn.borrower_id,
                "borrower_name": borrower_name,
                "loan_id": txn.loan_id,
                "amount": txn.amount,
                "status": txn.status.value if txn.status else None,
                "initiated_at": txn.initiated_at.isoformat() if txn.initiated_at else None,
                "confirmed_at": txn.confirmed_at.isoformat() if txn.confirmed_at else None,
            })
        
        return {
            "items": transactions,
            "total": total,
            "skip": skip,
            "limit": limit
        }
    except Exception as e:
        print(f"ERROR in search_transactions: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search/all")
async def search_all(
    q: str = Query("", description="Search query"),
    filter: Optional[str] = Query(None, description="Filter type: users, loans, transactions"),
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN]))
):
    """
    Comprehensive search across all entities (Admin only)
    """
    try:
        search_term = f"%{q}%"
        results = {"users": [], "loans": [], "transactions": []}
        
        # Search users if no filter or filter is 'users'
        if not filter or filter == "users":
            user_query = db.query(User).filter(
                or_(
                    func.lower(User.full_name).like(func.lower(search_term)),
                    func.lower(User.email).like(func.lower(search_term)),
                    User.phone.like(search_term)
                )
            ).limit(limit)
            
            results["users"] = [
                {
                    "id": u.id,
                    "full_name": u.full_name,
                    "email": u.email,
                    "phone": u.phone,
                    "role": u.role.value if u.role else None,
                    "type": "user"
                }
                for u in user_query.all()
            ]
        
        # Search loans if no filter or filter is 'loans'
        if not filter or filter == "loans":
            loan_query = db.query(
                Loan,
                User.full_name.label("borrower_name")
            ).join(
                User, Loan.borrower_id == User.id
            ).filter(
                or_(
                    Loan.loan_id.like(search_term),
                    cast(Loan.principal, String).like(search_term),
                    func.lower(User.full_name).like(func.lower(search_term))
                )
            ).limit(limit)
            
            results["loans"] = [
                {
                    "id": l.id,
                    "loan_id": l.loan_id,
                    "borrower_name": borrower_name,
                    "principal": l.principal,
                    "status": l.status.value if l.status else None,
                    "type": "loan"
                }
                for l, borrower_name in loan_query.all()
            ]
        
        # Search transactions if no filter or filter is 'transactions'
        if not filter or filter == "transactions":
            txn_query = db.query(
                Transaction,
                User.full_name.label("borrower_name")
            ).join(
                User, Transaction.borrower_id == User.id
            ).filter(
                or_(
                    Transaction.transaction_id.like(search_term),
                    cast(Transaction.amount, String).like(search_term)
                )
            ).limit(limit)
            
            results["transactions"] = [
                {
                    "id": t.id,
                    "transaction_id": t.transaction_id,
                    "borrower_name": buyer_name,
                    "amount": t.amount,
                    "status": t.status.value if t.status else None,
                    "type": "transaction"
                }
                for t, buyer_name in txn_query.all()
            ]
        
        return results
    except Exception as e:
        print(f"ERROR in search_all: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# TIER SETTINGS ENDPOINTS
# ============================================================================

# Default tier configuration
DEFAULT_TIER_CONFIG = {
    "tiers": [
        {
            "level": 1,
            "name": "Bronze",
            "min_score": 0,
            "max_score": 199,
            "loan_limit": 500.0,
            "interest_rate": 4.0,
            "processing_fee": 25,
            "requirements": "Initial tier for new users",
            "color": "#CD7F32"
        },
        {
            "level": 2,
            "name": "Silver",
            "min_score": 200,
            "max_score": 349,
            "loan_limit": 1000.0,
            "interest_rate": 3.9,
            "processing_fee": 23,
            "requirements": "3+ on-time payments",
            "color": "#C0C0C0"
        },
        {
            "level": 3,
            "name": "Silver",
            "min_score": 350,
            "max_score": 499,
            "loan_limit": 2000.0,
            "interest_rate": 3.8,
            "processing_fee": 20,
            "requirements": "5+ on-time payments",
            "color": "#C0C0C0"
        },
        {
            "level": 4,
            "name": "Gold",
            "min_score": 500,
            "max_score": 649,
            "loan_limit": 3500.0,
            "interest_rate": 3.7,
            "processing_fee": 18,
            "requirements": "90% on-time rate",
            "color": "#FFD700"
        },
        {
            "level": 5,
            "name": "Gold",
            "min_score": 650,
            "max_score": 799,
            "loan_limit": 5000.0,
            "interest_rate": 3.5,
            "processing_fee": 15,
            "requirements": "5+ loans, 90% on-time",
            "color": "#FFD700"
        },
        {
            "level": 6,
            "name": "Platinum",
            "min_score": 800,
            "max_score": 899,
            "loan_limit": 7500.0,
            "interest_rate": 3.3,
            "processing_fee": 12,
            "requirements": "Perfect streak",
            "color": "#E5E4E2"
        },
        {
            "level": 7,
            "name": "Platinum",
            "min_score": 900,
            "max_score": 1000,
            "loan_limit": 10000.0,
            "interest_rate": 3.2,
            "processing_fee": 10,
            "requirements": "10+ loans, perfect streak",
            "color": "#E5E4E2"
        },
        {
            "level": 8,
            "name": "Diamond",
            "min_score": 1001,
            "max_score": 9999,
            "loan_limit": 15000.0,
            "interest_rate": 3.0,
            "processing_fee": 0,
            "requirements": "Perfect repayment history",
            "color": "#B9F2FF"
        }
    ]
}


def validate_tier_config(config: dict) -> bool:
    """Validate tier configuration"""
    if 'tiers' not in config:
        raise HTTPException(status_code=400, detail="Missing 'tiers' key in config")
    
    required_fields = ['level', 'name', 'min_score', 'max_score', 'loan_limit']
    
    for tier in config['tiers']:
        for field in required_fields:
            if field not in tier:
                raise HTTPException(status_code=400, detail=f"Missing field {field} in tier config")
        
        # Ensure score ranges don't overlap
        if tier['min_score'] >= tier['max_score']:
            raise HTTPException(status_code=400, detail=f"Invalid score range for {tier['name']}")
    
    # Ensure tiers are in order
    tiers = sorted(config['tiers'], key=lambda x: x['level'])
    for i in range(len(tiers) - 1):
        if tiers[i]['max_score'] != tiers[i+1]['min_score'] - 1:
            # Allow gaps for now, just warn
            pass
    
    return True


@router.get("/tier-settings")
async def get_tier_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Get current tier configuration"""
    try:
        settings = db.query(SystemSettings).filter(
            SystemSettings.category == "tier_config",
            SystemSettings.setting_key == "tiers"
        ).first()
        
        if not settings:
            # Return default configuration
            return DEFAULT_TIER_CONFIG
        
        import json
        return json.loads(settings.setting_value)
    except Exception as e:
        print(f"ERROR in get_tier_settings: {str(e)}")
        import traceback
        traceback.print_exc()
        return DEFAULT_TIER_CONFIG


@router.put("/tier-settings")
async def update_tier_settings(
    tier_config: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Update tier configuration"""
    try:
        # Validate the configuration
        validate_tier_config(tier_config)
        
        import json
        
        # Save to database
        setting = db.query(SystemSettings).filter(
            SystemSettings.category == "tier_config",
            SystemSettings.setting_key == "tiers"
        ).first()
        
        if not setting:
            setting = SystemSettings(
                category="tier_config",
                setting_key="tiers",
                setting_type="json",
                description="Tier configuration for borrower credit tiers"
            )
            db.add(setting)
        
        setting.setting_value = json.dumps(tier_config)
        db.commit()
        
        return {"message": "Tier settings updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"ERROR in update_tier_settings: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tier-distribution")
async def get_tier_distribution(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Get count of users in each tier"""
    try:
        distribution = db.query(
            User.credit_tier,
            func.count(User.id).label('count')
        ).group_by(User.credit_tier).all()
        
        result = {}
        for tier, count in distribution:
            result[f"tier_{tier}"] = count
        
        # Include all tiers even if count is 0
        for i in range(1, 9):
            if f"tier_{i}" not in result:
                result[f"tier_{i}"] = 0
        
        return result
    except Exception as e:
        print(f"ERROR in get_tier_distribution: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# KYC VERIFICATION ADMIN ENDPOINTS
# ============================================================================

@router.get("/kyc/pending")
async def get_pending_kyc(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Get all users pending KYC verification"""
    profiles = db.query(UserProfile).filter(
        UserProfile.kyc_status == "SUBMITTED"
    ).all()
    
    result = []
    for profile in profiles:
        user = db.query(User).filter(User.id == profile.user_id).first()
        if user:
            result.append({
                "user_id": user.id,
                "email": user.email,
                "full_name": user.full_name,
                "phone": profile.phone,
                "national_id": profile.national_id,
                "date_of_birth": profile.date_of_birth.isoformat() if profile.date_of_birth else None,
                "location": profile.location,
                "address": profile.address,
                "kyc_submitted_at": profile.updated_at.isoformat() if profile.updated_at else None,
            })
    
    return result


@router.post("/kyc/verify/{user_id}")
async def verify_kyc(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Verify a user's KYC"""
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    
    if not profile:
        raise HTTPException(status_code=404, detail="User profile not found")
    
    if profile.kyc_status == "VERIFIED":
        raise HTTPException(status_code=400, detail="User is already verified")
    
    from datetime import datetime
    profile.kyc_status = "VERIFIED"
    profile.kyc_verified_at = datetime.utcnow()
    profile.kyc_rejection_reason = None
    
    db.commit()
    db.refresh(profile)
    
    return {
        "message": f"User {user_id} KYC verified successfully",
        "kyc_status": profile.kyc_status,
        "kyc_verified_at": profile.kyc_verified_at.isoformat()
    }


@router.post("/kyc/reject/{user_id}")
async def reject_kyc(
    user_id: int,
    rejection_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Reject a user's KYC with reason"""
    profile = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    
    if not profile:
        raise HTTPException(status_code=404, detail="User profile not found")
    
    reason = rejection_data.get("reason", "Your documents could not be verified")
    
    profile.kyc_status = "REJECTED"
    profile.kyc_rejection_reason = reason
    profile.kyc_verified_at = None
    
    db.commit()
    db.refresh(profile)
    
    return {
        "message": f"User {user_id} KYC rejected",
        "kyc_status": profile.kyc_status,
        "kyc_rejection_reason": reason
    }
