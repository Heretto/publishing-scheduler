#!/usr/bin/env python3
"""Seed the database with the default organisation and initial admin user.

Usage:
    python backend/scripts/seed.py

Environment variables (non-interactive / CI):
    ADMIN_EMAIL     — skip the email prompt
    ADMIN_PASSWORD  — skip the password prompt
"""

import os
import sys
import uuid
import getpass

# ── path setup ────────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
sys.path.insert(0, BACKEND_DIR)

# Load .env before importing settings
from dotenv import load_dotenv
load_dotenv(os.path.join(BACKEND_DIR, ".env"))

# ── imports (after path + env are set) ───────────────────────────────────────
from settings import get_settings                                # noqa: E402
from hop_core.config import configure                            # noqa: E402
from hop_core.db import init_engine, Base, get_engine, get_session_factory  # noqa: E402
from hop_core.models.organization import Organization, OrganizationMember   # noqa: E402
from hop_core.models.user import User                            # noqa: E402
from hop_core.models.enums import OrganizationRole               # noqa: E402
from hop_core.core.security import get_password_hash             # noqa: E402
import models  # noqa: F401, E402 — registers Schedule + JobHistory on Base


# ── helpers ───────────────────────────────────────────────────────────────────

GREEN = "\033[0;32m"
YELLOW = "\033[1;33m"
RESET = "\033[0m"


def info(msg: str) -> None:
    print(f"{GREEN}[seed]{RESET} {msg}")


def warning(msg: str) -> None:
    print(f"{YELLOW}[seed]{RESET} {msg}")


# ── main ──────────────────────────────────────────────────────────────────────

def seed() -> None:
    configure(get_settings)
    s = get_settings()

    init_engine(s.database_url)
    Base.metadata.create_all(bind=get_engine())

    SessionLocal = get_session_factory()
    db = SessionLocal()

    try:
        # ── Organisation ──────────────────────────────────────────────────────
        slug = s.single_org_slug or "publishing-scheduler"
        org = db.query(Organization).filter(Organization.slug == slug).first()

        if org:
            info(f"Organisation already exists: '{org.name}' (slug: {org.slug})")
        else:
            org = Organization(
                id=uuid.uuid4(),
                name="Publishing Scheduler",
                slug=slug,
                is_active=True,
            )
            db.add(org)
            db.commit()
            info(f"Created organisation: '{org.name}' (slug: {org.slug})")

        # ── Admin user ────────────────────────────────────────────────────────
        existing_admin = (
            db.query(User).filter(User.is_superuser.is_(True)).first()
        )

        if existing_admin:
            info(f"Admin user already exists: {existing_admin.email}")
            return

        # Read from env vars first (CI / scripted use), then prompt
        email = os.environ.get("ADMIN_EMAIL") or ""
        password = os.environ.get("ADMIN_PASSWORD") or ""

        if not email:
            print()
            print("No admin user found. Create the initial admin account:")
            email = input("  Admin email: ").strip()

        if not email:
            warning("No email provided — skipping admin creation.")
            warning("Re-run seed.py or use the /api/v1/auth/register endpoint.")
            return

        # Check for duplicate email
        if db.query(User).filter(User.email == email).first():
            warning(f"User '{email}' already exists but is not a superuser.")
            warning("Update is_superuser=True in the database manually if needed.")
            return

        if not password:
            password = getpass.getpass("  Admin password (min 8 chars): ")

        if len(password) < 8:
            print("Password must be at least 8 characters.")
            sys.exit(1)

        admin = User(
            id=uuid.uuid4(),
            email=email,
            password_hash=get_password_hash(password),
            is_active=True,
            is_superuser=True,
            current_organization_id=org.id,
        )
        db.add(admin)
        db.flush()

        membership = OrganizationMember(
            user_id=admin.id,
            organization_id=org.id,
            role=OrganizationRole.ADMIN,
        )
        db.add(membership)
        db.commit()

        info(f"Created admin user: {admin.email}")
        print()
        info("Seed complete.")

    finally:
        db.close()


if __name__ == "__main__":
    seed()
