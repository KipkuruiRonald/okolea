"""
Migration script to add KYC columns to user_profiles table
Run this script to add the missing KYC verification columns
"""
import psycopg2

def add_kyc_columns():
    """Add KYC columns to user_profiles table"""
    try:
        # Database connection - update these if different
        conn = psycopg2.connect(
            host="localhost",
            database="okoleo_db",
            user="okoleo_user",
            password="325813",
            port="5432"
        )
        
        cur = conn.cursor()
        print("Adding KYC columns to user_profiles table...")
        
        # Add columns
        cur.execute("""
            ALTER TABLE user_profiles 
            ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(20) DEFAULT 'PENDING'
        """)
        print("[+] Added kyc_status column")
        
        cur.execute("""
            ALTER TABLE user_profiles 
            ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMP
        """)
        print("[+] Added kyc_verified_at column")
        
        cur.execute("""
            ALTER TABLE user_profiles 
            ADD COLUMN IF NOT EXISTS kyc_verified_by INTEGER
        """)
        print("[+] Added kyc_verified_by column")
        
        cur.execute("""
            ALTER TABLE user_profiles 
            ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT
        """)
        print("[+] Added kyc_rejection_reason column")
        
        # Create index for faster queries
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_user_profiles_kyc_status 
            ON user_profiles(kyc_status)
        """)
        print("[+] Created index on kyc_status")
        
        conn.commit()
        
        # Verify columns were added
        cur.execute("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'user_profiles'
            AND column_name LIKE 'kyc_%'
            ORDER BY column_name
        """)
        
        columns = cur.fetchall()
        print("\nKYC columns in user_profiles:")
        for col in columns:
            print(f"  • {col[0]} ({col[1]}) nullable: {col[2]}")
        
        cur.close()
        conn.close()
        print("\nSUCCESS: Migration completed successfully!")
        
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    add_kyc_columns()
