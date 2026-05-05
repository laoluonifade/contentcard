"""Flip `brand_kit.template_design_lookup` for one or more brands.

Per-brand override of TEMPLATE_DESIGN_LOOKUP_ENABLED. Use this for
staged rollout: flip one canary brand, watch the metrics, then flip
the global env var on Render once you trust the signal.

The script always prints what it found and what it would change BEFORE
applying. Pass `--apply` to actually write. Without it, the script is a
dry-run.

Usage:
  # Dry-run by name match (substring, case-insensitive)
  python scripts/flip_template_design_lookup.py --brand-name "Acme"
  # Apply the flip
  python scripts/flip_template_design_lookup.py --brand-name "Acme" --apply
  # Turn it off again
  python scripts/flip_template_design_lookup.py --brand-name "Acme" --apply --off
  # Flip by exact id
  python scripts/flip_template_design_lookup.py --brand-id <uuid> --apply
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select
from sqlalchemy.orm.attributes import flag_modified

from app.db.database import AsyncSessionLocal
from app.models.brand import Brand


KEY = "template_design_lookup"


async def _find_brands(db, *, name: str | None, brand_id: str | None) -> list[Brand]:
    q = select(Brand)
    if brand_id:
        q = q.where(Brand.id == brand_id)
    elif name:
        q = q.where(Brand.name.ilike(f"%{name}%"))
    else:
        return []
    return list((await db.execute(q)).scalars().all())


def _current_value(brand: Brand) -> object:
    kit = brand.brand_kit if isinstance(brand.brand_kit, dict) else {}
    return kit.get(KEY)


async def main(args: argparse.Namespace) -> int:
    target_value = False if args.off else True

    async with AsyncSessionLocal() as db:
        brands = await _find_brands(db, name=args.brand_name, brand_id=args.brand_id)
        if not brands:
            print("no brand match")
            return 1
        print(f"found {len(brands)} brand(s):")
        for b in brands:
            cur = _current_value(b)
            print(f"  {b.id}  {b.name!r:30s}  current={cur!r}  -> target={target_value}")

        if not args.apply:
            print("\nDry run. Re-run with --apply to write.")
            return 0

        if len(brands) > 1 and not args.allow_multi:
            print("\nrefusing to flip more than one brand without --allow-multi")
            return 2

        for b in brands:
            kit = dict(b.brand_kit or {})
            kit[KEY] = target_value
            b.brand_kit = kit
            flag_modified(b, "brand_kit")
        await db.commit()
        print(f"\nflipped {len(brands)} brand(s) to {target_value}")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    g = parser.add_mutually_exclusive_group(required=True)
    g.add_argument("--brand-id", help="Exact brand UUID")
    g.add_argument("--brand-name", help="Substring match on brand name (case-insensitive)")
    parser.add_argument("--apply", action="store_true",
                        help="Actually write. Default is dry-run.")
    parser.add_argument("--off", action="store_true",
                        help="Set the flag to False instead of True (revert).")
    parser.add_argument("--allow-multi", action="store_true",
                        help="Permit flipping more than one brand at once.")
    args = parser.parse_args()
    raise SystemExit(asyncio.run(main(args)))
