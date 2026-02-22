#!/usr/bin/env python3
"""
Migration script to add REJECTED status to loan status enum.
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import engine
from sqlalchemy import text


def add_rejected_status():
    """Add REJECTED to loan status options"""
    try:
        with engine.connect() as conn:
            # Check current enum values
            result = conn.execute(text("""
                SELECT enumlabel 
                FROM pg_enum 
                WHERE enumtypid = (
                    SELECT oid FROM pg_type 
                    WHERE typname = 'loanstatus'
                )
            """)).fetchall()
            
            existing_values = [row[0] for row in result]
            print(f"Existing loan status values: {existing_values}")
            
            # Add REJECTED if not exists
            if 'REJECTED' not in existing_values:
                conn.execute(text("""
                    ALTER TYPE loanstatus ADD VALUE 'REJECTED'
                """))
                conn.commit()
                print("[OK] Added REJECTED to loan status enum")
            else:
                print("[OK] REJECTED already exists in loan status enum")
                
    except Exception as e:
        print(f"[INFO] {e}")
        print("[INFO] This might be because the enum already has the value or PostgreSQL version doesn't support ALTER TYPE")


if __name__ == "__main__":
    add_rejected_status()
