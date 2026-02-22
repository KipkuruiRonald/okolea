#!/usr/bin/env python3
"""
Migration script to add details column to audit_logs table.
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import engine
from sqlalchemy import text


def add_details_column():
    """Add details column to audit_logs table"""
    try:
        with engine.connect() as conn:
            # Check if column already exists
            check = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='audit_logs' AND column_name='details'
            """)).fetchone()
            
            if not check:
                # Add the column
                conn.execute(text("""
                    ALTER TABLE audit_logs 
                    ADD COLUMN details TEXT
                """))
                conn.commit()
                print("[OK] Added details column to audit_logs table")
            else:
                print("[OK] details column already exists")
                
    except Exception as e:
        print(f"[ERROR] {e}")


if __name__ == "__main__":
    add_details_column()
