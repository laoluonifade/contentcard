"""
One-off script: resync the OpenAI Assistant + Vector Store for every brand.

Run on Render via the Shell tab:
    python scripts/resync_all_brands.py

Or target a single brand:
    python scripts/resync_all_brands.py --brand-id <uuid>
"""
import asyncio
import argparse
import logging
import sys
import os

# Make sure app modules resolve when run from the backend/ directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


async def resync(brand_id: str | None = None):
    from sqlalchemy import select
    from app.db.database import AsyncSessionLocal
    from app.models.brand import Brand
    from app.services import openai_assistant_service as oas

    async with AsyncSessionLocal() as db:
        if brand_id:
            result = await db.execute(select(Brand).where(Brand.id == brand_id))
            brands = [result.scalar_one_or_none()]
            if not brands[0]:
                logger.error(f"Brand {brand_id} not found")
                return
        else:
            result = await db.execute(select(Brand))
            brands = result.scalars().all()

        logger.info(f"Resyncing {len(brands)} brand(s)…")

        for brand in brands:
            try:
                if brand.openai_assistant_id:
                    await oas.update_brand_assistant(brand)
                    logger.info(f"  ✓ Updated assistant for '{brand.name}' ({brand.id})")
                else:
                    assistant_id, vs_id = await oas.create_brand_assistant(brand)
                    brand.openai_assistant_id = assistant_id
                    brand.openai_vector_store_id = vs_id
                    await db.commit()
                    logger.info(f"  ✓ Created assistant for '{brand.name}' ({brand.id})")
            except Exception as e:
                logger.error(f"  ✗ Failed for '{brand.name}' ({brand.id}): {e}")

    logger.info("Done.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--brand-id", default=None, help="Resync a single brand by ID")
    args = parser.parse_args()
    asyncio.run(resync(args.brand_id))
