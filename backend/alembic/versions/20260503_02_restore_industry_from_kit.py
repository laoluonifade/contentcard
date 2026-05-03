"""restore brand industry / sub_industry from brand_kit when corrupted by old canonicaliser

Revision ID: 20260503_02
Revises: 20260503_01
Create Date: 2026-05-03

The Brand Kit save endpoint used to run every value through a backend-only
INDUSTRY_TAXONOMY ("Technology / SaaS / Finance & Fintech / ...") that
shared zero values with the frontend dropdown ("Fashion Store / Food
Store / ..."). Result: any user who saved their Brand Kit had their
industry / sub_industry silently rewritten to "Technology" / "SaaS" (the
hardcoded final fallback). On the next reload the dropdown couldn't show
the value (no matching <option>) so the user saw the field as empty and
refilled it — only for the next save to overwrite it again. Loop.

This migration restores the original picks where we still have them on
record. The onboarding endpoint (`POST /onboarding/quick-start`) saves
the user's pick to `brand.brand_kit.onboarding_category` /
`brand.brand_kit.onboarding_sub_category` BEFORE creating the brand,
which means we have an audit trail for everyone who came in via the
new flow.

For each brand:
  - if `brand.industry` is one of the old backend-taxonomy values, AND
    `brand.brand_kit.onboarding_category` exists, copy the kit value back
    into `brand.industry`.
  - same for `brand.sub_industry` ← `brand.brand_kit.onboarding_sub_category`.

Brands that pre-date the kit-stamping (very early users, manual SQL
inserts, admin-created rows) won't be recovered — they need an admin to
re-pick. Those are visible in logs / reports because their kit is missing
the `onboarding_category` field.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "20260503_02"
down_revision: Union[str, None] = "20260503_01"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Values written by the now-deleted backend taxonomy. We only restore over
# these — we don't touch rows whose industry already matches the new
# (frontend-aligned) taxonomy or some other custom value the user typed.
_OLD_INDUSTRIES = (
    "Technology",
    "Finance & Fintech",
    "E-commerce & Retail",
    "Health & Wellness",
    "Education",
    "Real Estate",
    "Food & Beverage",
    "Travel & Hospitality",
    "Professional Services",
    "Media & Entertainment",
)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        # Postgres: brand_kit is JSONB so we can read keys directly.
        op.execute(
            f"""
            UPDATE brands
               SET industry = brand_kit ->> 'onboarding_category',
                   sub_industry = brand_kit ->> 'onboarding_sub_category'
             WHERE brand_kit IS NOT NULL
               AND brand_kit ? 'onboarding_category'
               AND brand_kit ? 'onboarding_sub_category'
               AND industry IN ({", ".join("'" + i.replace("'", "''") + "'" for i in _OLD_INDUSTRIES)})
            """
        )
    else:
        # SQLite (test DB): brand_kit is TEXT-encoded JSON. Match by
        # substring; the worst-case false positive is restoring a row
        # whose new industry happens to equal the old name verbatim,
        # which is fine — the value coming out of the kit is still the
        # user's original pick.
        for legacy in _OLD_INDUSTRIES:
            op.execute(
                f"""
                UPDATE brands
                   SET industry = json_extract(brand_kit, '$.onboarding_category'),
                       sub_industry = json_extract(brand_kit, '$.onboarding_sub_category')
                 WHERE brand_kit LIKE '%"onboarding_category"%'
                   AND brand_kit LIKE '%"onboarding_sub_category"%'
                   AND industry = '{legacy.replace("'", "''")}'
                """
            )


def downgrade() -> None:
    # We can't reconstruct the wrong-but-canonicalised values we
    # overwrote — we'd need to re-run the old taxonomy logic and we
    # deliberately deleted it. Leaving this as a no-op so a downgrade
    # restores the schema, not the buggy data.
    pass
