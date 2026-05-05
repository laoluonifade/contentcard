"""Idempotent seed for the McDonald's demo fixture.

Loads `DEMO_BRAND_KIT` and `DEMO_IDEAS` into the current DB so the demo
render job (PR 1.7) and admin browse drawer (PR 1.8) have something
real to point at without dragging the user-facing onboarding flow.

The fixture is stored as an admin-only Brand row marked with
`is_demo_fixture=True` (column added in PR 1.7's migration; for now we
guard with a name match on 'McDonald's' + a sentinel in brand_kit).

Re-running is safe; fields are upserted.

PR 1.5 of `docs/PR-plan-premium-social-template-library.md`.

Usage:
  python scripts/seed_template_demo_mcdonalds.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

# Allow running as `python scripts/...` from the backend root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import AsyncSessionLocal
from app.models.brand import Brand
from app.seed.demo_mcdonalds import DEMO_BRAND_KIT, DEMO_IDEAS


DEMO_BRAND_NAME = "McDonald's"
DEMO_FIXTURE_SENTINEL = "__contentcard_admin_demo_fixture__"


async def upsert_demo_brand(db: AsyncSession) -> Brand:
    """Create or update the McDonald's admin demo brand row.

    The row is identified by name + a sentinel key in brand_kit; running
    twice does not duplicate.
    """
    rows = (
        await db.execute(
            select(Brand).where(Brand.name == DEMO_BRAND_NAME)
        )
    ).scalars().all()

    target: Brand | None = None
    for r in rows:
        kit = r.brand_kit or {}
        if isinstance(kit, dict) and kit.get(DEMO_FIXTURE_SENTINEL):
            target = r
            break

    kit_payload = dict(DEMO_BRAND_KIT)
    kit_payload[DEMO_FIXTURE_SENTINEL] = True

    if target is None:
        target = Brand(
            name=DEMO_BRAND_NAME,
            industry=DEMO_BRAND_KIT["industry_key"],
            sub_industry=DEMO_BRAND_KIT["sub_industry"],
            brand_kit=kit_payload,
        )
        db.add(target)
        await db.flush()
        action = "created"
    else:
        target.industry = DEMO_BRAND_KIT["industry_key"]
        target.sub_industry = DEMO_BRAND_KIT["sub_industry"]
        target.brand_kit = kit_payload
        action = "updated"

    return target, action


async def main() -> int:
    async with AsyncSessionLocal() as db:
        try:
            brand, action = await upsert_demo_brand(db)
            await db.commit()
        except Exception:
            await db.rollback()
            raise
    print(
        f"demo brand {action}: id={brand.id} name={brand.name!r}"
        f"  ideas_loaded={len(DEMO_IDEAS)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
