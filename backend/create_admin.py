#!/usr/bin/env python3
import sys
import getpass
from auth import init_auth_db, create_user, get_user_by_username

def main():
    print("=" * 60)
    print("PPE Vision Safety - Admin User Initialization")
    print("=" * 60)
    
    init_auth_db()

    try:
        username = input("Enter admin username: ").strip()
        if not username:
            print("Error: Username cannot be empty.")
            sys.exit(1)

        existing = get_user_by_username(username)
        if existing:
            print(f"Error: User '{username}' already exists. Refusing to overwrite.")
            sys.exit(1)

        password = getpass.getpass("Enter admin password (min 8 chars): ")
        if len(password) < 8:
            print("Error: Password must be at least 8 characters long.")
            sys.exit(1)

        confirm = getpass.getpass("Confirm admin password: ")
        if password != confirm:
            print("Error: Passwords do not match.")
            sys.exit(1)

        create_user(username, password, role="admin")
        print(f"Success: Administrator '{username}' created successfully.")

    except Exception as e:
        print(f"Error creating admin: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
