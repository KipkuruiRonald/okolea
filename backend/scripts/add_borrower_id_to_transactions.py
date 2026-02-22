#!/usr/bin/env python3
"""
Migration script to add borrower_id column to transactions table.
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import engine
from sqlalchemy import text


def add_borrower_id_column():
    """Add borrower_id column to transactions table"""
    try:
        with engine.connect() as conn:
            # Check if column already exists
            check = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='transactions' AND column_name='borrower_id'
            """)).fetchone()
            
            if not check:
                # Add the column
                conn.execute(text("""
                    ALTER TABLE transactions 
                    ADD COLUMN borrower_id INTEGER REFERENCES users(id)
                """))
                conn.commit()
                print("[OK] Added borrower_id column to transactions table")
            else:
                print("[OK] borrower_id column already exists")
                
            # Create index for performance
            try:
                conn.execute(text("""
                    CREATE INDEX IF NOT EXISTS idx_transactions_borrower_id 
                    ON transactions(borrower_id)
                """))
                conn.commit()
                print("[OK] Created index on borrower_id")
            except:
                print("[INFO] Index may already exist")
                
    except Exception as e:
        print(f"[ERROR] {e}")


if __name__ == "__main__":
    add_borrower_id_column()
