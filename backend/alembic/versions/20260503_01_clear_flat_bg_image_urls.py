"""clear flat-colour background image URLs from content_items

Revision ID: 20260503_01
Revises: 20260502_02
Create Date: 2026-05-03

Backfill for the flat-colour-PNG bug. Pre-fix, ~2/3 of non-promotional posts
got their `image_url` / `image_urls` set to a Cloudinary-hosted flat brand-
colour PNG (or, due to a key-lookup mismatch, the ContentCard fallback
green #168C5A regardless of the brand's actual primary). The frontend
canvas already paints a brand-coloured background for free when image_urls
is None and layers Badge / Headline / SubHead / CTA on top — but with
those flat PNGs saved, the frontend rendered the green wall instead of
the structured overlay.

This migration NULLs the URLs only on rows that we can prove came from
the flat-bg path: `theme.cc_meta.background_mode` ∈ ('color_block',
'gradient_panel'). Posts that have a real AI-generated image are
untouched. Captions, components, and all other fields are preserved so
the next render attempt (or the frontend canvas alone) produces a
designed text-only proof instead of a green block.

Postgres: uses the JSONB ->> operator on theme. SQLite (used in tests):
falls back to LIKE matching on the JSON-as-text representation.
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "20260503_01"
down_revision: Union[str, None] = "20260502_02"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            """
            UPDATE content_items
               SET image_url = NULL,
                   image_urls = NULL
             WHERE theme IS NOT NULL
               AND theme -> 'cc_meta' ->> 'background_mode'
                   IN ('color_block', 'gradient_panel')
            """
        )
    else:
        # SQLite stores JSON as TEXT; match the JSON path inside the blob.
        op.execute(
            """
            UPDATE content_items
               SET image_url = NULL,
                   image_urls = NULL
             WHERE theme LIKE '%"background_mode": "color_block"%'
                OR theme LIKE '%"background_mode": "gradient_panel"%'
            """
        )


def downgrade() -> None:
    # We can't recover the URLs we cleared — Cloudinary still hosts the
    # source PNGs but the row-level binding is gone. Leaving this as a
    # no-op is the honest behaviour: a downgrade restores the schema, not
    # data we deliberately discarded because it was wrong.
    pass
