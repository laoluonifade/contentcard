"""Idempotent seed for the v1 generic premium template library.

Inserts (or updates) the 42-template seed defined in
`app/seed/template_designs/v1_generic_premium.py`.

Idempotency key: (intent_family, post_type, art_direction_variant,
carousel_group_id, slide_index). Re-running with the same fixture is a
no-op except for `updated_at`. Re-running after the fixture changes
upserts only the diffed fields.

PR 2.1 of `docs/PR-plan-premium-social-template-library.md`.

Usage:
  python scripts/seed_template_designs_v1.py
  python scripts/seed_template_designs_v1.py --rerender-demos
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.database import AsyncSessionLocal
from app.seed.template_designs.v1_generic_premium import upsert_v1
from app.services.template_design.demo_render_job import render_demo_for_all_active


async def main(rerender_demos: bool) -> int:
    async with AsyncSessionLocal() as db:
        try:
            result = await upsert_v1(db)
        except Exception:
            await db.rollback()
            raise

        print("v1 generic premium seed result:")
        for k, v in result.items():
            print(f"  {k}: {v}")

        if rerender_demos:
            processed, with_payload = await render_demo_for_all_active(db)
            print(
                f"  demo renders: processed={processed} with_payload={with_payload}"
            )
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--rerender-demos",
        action="store_true",
        help="After seeding, run the demo render job for every active row.",
    )
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(rerender_demos=args.rerender_demos)))
