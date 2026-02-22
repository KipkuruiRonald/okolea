#!/usr/bin/env python3
"""
Migration script to add phone_number column to loans table.
This script adds the phone_number field that was added to the Loan model.
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import engine
from sqlalchemy import text


def add_phone_column():
    """Add phone_number column to loans table"""
    try:
        with engine.connect() as conn:
            # Check if column already exists (to avoid errors)
            check = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='loans' AND column_name='phone_number'
            """)).fetchone()
            
            if not check:
                # Add the column
                conn.execute(text("""
                    ALTER TABLE loans 
                    ADD COLUMN phone_number VARCHAR(20)
                """))
                conn.commit()
                print("[OK] Added phone_number column to loans table")
            else:
                print("[OK] phone_number column already exists")
                
            # Also check if there's data we can migrate from users table
            migrate_existing = conn.execute(text("""
                SELECT COUNT(*) FROM loans 
                WHERE phone_number IS NULL OR phone_number = ''
            """)).scalar()
            
            if migrate_existing > 0:
                # Try to migrate phone numbers from users
                conn.execute(text("""
                    UPDATE loans 
                    SET phone_number = (
                        SELECT phone FROM users 
                        WHERE users.id = loans.borrower_id
                    )
                    WHERE phone_number IS NULL OR phone_number = ''
                """))
                conn.commit()
                print(f"[OK] Migrated phone numbers for {migrate_existing} existing loans")
                
    except Exception as e:
        print(f"[ERROR] Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    add_phone_column()
