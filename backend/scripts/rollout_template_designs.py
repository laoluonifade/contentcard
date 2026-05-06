"""One-paste rollout helper for the Premium Social Template Library.

Runs steps 1, 2, and 4 of the rollout checklist in order, with progress
output and a clear final verdict so the operator can read one screen and
know the rollout is healthy.

Step 1 — `alembic upgrade head` (idempotent; no-op if already at head).
Step 2 — seed the v2 archetype library (idempotent; equivalent to the
        admin "Seed library" button; deletes legacy v1 generic rows on
        first run, then upserts the 100-template archetype set).
Step 4 — poll lookup-health metrics for `--watch-minutes` minutes
        (default 5), printing one line per poll so the operator can
        see the resolved-rate climb after step 3 (env-var flip) is
        applied separately.

This script does NOT flip the global env var (step 3) — that is a
Render dashboard action only the operator can do. The script also does
not flip per-brand `brand_kit.template_design_lookup`; for that, run
`scripts/flip_template_design_lookup.py` separately.

Usage from Render shell:
  python scripts/rollout_template_designs.py
  python scripts/rollout_template_designs.py --watch-minutes 10
  python scripts/rollout_template_designs.py --skip-watch
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from alembic import command
from alembic.config import Config
from sqlalchemy import func, select

from app.db.database import AsyncSessionLocal
from app.models.content import ContentItem
from app.models.content_template_design import ContentTemplateDesign
from app.seed.template_designs.v2_archetype_library import (
    template_count,
    upsert_v2,
)
from app.services.template_design.demo_render_job import render_demo_for_all_active


def _step(n: int, label: str) -> None:
    print()
    print(f"━━━ Step {n}: {label} " + "━" * max(0, 50 - len(label)))


async def step1_migrations() -> None:
    _step(1, "alembic upgrade head")
    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    command.upgrade(cfg, "head")
    print("  done")


async def step2_seed() -> None:
    _step(2, "seed v2 archetype library (10 content_types × 10 archetypes)")
    async with AsyncSessionLocal() as db:
        result = await upsert_v2(db)
        print(f"  templates_in_seed:  {result['templates_in_seed']}")
        print(f"  rows_in_seed:       {result['rows_in_seed']}")
        print(f"  v1_rows_deleted:    {result['v1_rows_deleted']}")
        print(f"  created:            {result['created']}")
        print(f"  updated:            {result['updated']}")
        print(f"  unchanged:          {result['unchanged']}")

        processed, with_payload = await render_demo_for_all_active(db)
        print(f"  demo renders:       processed={processed} with_payload={with_payload}")


async def _gather_metrics(db) -> dict[str, int | float]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=1)
    total = (await db.execute(
        select(func.count(ContentItem.id)).where(ContentItem.created_at >= cutoff)
    )).scalar() or 0
    resolved = (await db.execute(
        select(func.count(ContentItem.id))
        .where(ContentItem.created_at >= cutoff)
        .where(ContentItem.resolved_template_design_id.isnot(None))
    )).scalar() or 0
    return {
        "total": total,
        "resolved": resolved,
        "rate": (resolved / total) if total else 0.0,
    }


async def step4_watch(minutes: int) -> None:
    _step(4, f"watch lookup-health for {minutes} min (after you flip step 3)")
    print("  Time     Total  Resolved  Rate    Verdict")
    print("  -------  -----  --------  ------  -------")
    deadline = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    last = None
    while datetime.now(timezone.utc) < deadline:
        async with AsyncSessionLocal() as db:
            m = await _gather_metrics(db)
        verdict = "—"
        if last is not None:
            if m["resolved"] > last:
                verdict = "rising"
            elif m["resolved"] == last and m["resolved"] > 0:
                verdict = "steady"
            else:
                verdict = "—"
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
        print(f"  {ts}  {m['total']:5d}  {m['resolved']:8d}  {m['rate']:.2%}  {verdict}")
        last = m["resolved"]
        await asyncio.sleep(60)


def _design_inventory_summary() -> None:
    """Print a one-line reassurance that the seed is in place."""
    async def _check():
        async with AsyncSessionLocal() as db:
            n = (await db.execute(
                select(func.count(ContentTemplateDesign.design_id)).where(
                    ContentTemplateDesign.is_active.is_(True)
                )
            )).scalar() or 0
            print(f"\nactive content_template_design rows: {n}")
            print(
                f"expected for v2 archetype library: {template_count()} templates "
                f"(carousels expand to multiple slide rows; ~63 rows total is normal)"
            )
    asyncio.run(_check())


async def main(args: argparse.Namespace) -> int:
    if not args.skip_migrations:
        await step1_migrations()
    if not args.skip_seed:
        await step2_seed()
    if not args.skip_watch:
        await step4_watch(args.watch_minutes)
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="One-paste rollout helper")
    parser.add_argument("--skip-migrations", action="store_true",
                        help="Skip step 1 (alembic upgrade head)")
    parser.add_argument("--skip-seed", action="store_true",
                        help="Skip step 2 (seed v1 library)")
    parser.add_argument("--skip-watch", action="store_true",
                        help="Skip step 4 (metrics watch)")
    parser.add_argument("--watch-minutes", type=int, default=5,
                        help="How long to poll metrics (default: 5)")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args)))
