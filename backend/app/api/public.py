import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.demo_request import DemoRequest
from app.services.guest_preview_service import (
    check_rate_limit,
    generate_guest_preview_posts,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/public", tags=["public"])


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45] or None
    if request.client:
        return (request.client.host or "")[:45] or None
    return None


class DemoRequestCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=200)
    email: EmailStr
    company: str = Field(..., min_length=2, max_length=300)
    role: str = Field(..., min_length=2, max_length=120)
    team_size: str = Field(..., min_length=2, max_length=80)
    message: str | None = Field(default=None, max_length=4000)


@router.post("/demo-request", status_code=201)
async def create_demo_request(
    body: DemoRequestCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Public marketing form: book a demo (no authentication)."""
    fn = body.full_name.strip()
    co = body.company.strip()
    rl = body.role.strip()
    ts = body.team_size.strip()
    msg = (body.message or "").strip() or None
    if len(fn) < 2 or len(co) < 2 or len(rl) < 2 or len(ts) < 2:
        raise HTTPException(status_code=400, detail="Please complete all required fields.")
    if msg and not re.search(r"[a-zA-Z0-9]", msg):
        raise HTTPException(status_code=400, detail="Message must contain readable text if provided.")

    row = DemoRequest(
        full_name=fn[:200],
        email=str(body.email).strip().lower()[:255],
        company=co[:300],
        role=rl[:120],
        team_size=ts[:80],
        message=msg,
        source="demo_page",
        ip_address=_client_ip(request),
        user_agent=(request.headers.get("user-agent") or "")[:500] or None,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    logger.info("demo_request id=%s email=%s company=%s", row.id, row.email, row.company)
    return {"ok": True, "id": row.id}


# ── Guest preview generation (logged-out dashboard tour) ─────────────────────


class GuestPreviewRequest(BaseModel):
    brand_name: str = Field(..., min_length=1, max_length=120)
    website: str = Field(..., min_length=4, max_length=200)
    intent: str | None = Field(default=None, max_length=20)


def _normalize_website(value: str) -> str:
    s = (value or "").strip()
    if not s:
        return s
    if not re.match(r"^https?://", s, re.IGNORECASE):
        s = f"https://{s}"
    return s[:200]


@router.post("/guest-preview-generate", status_code=200)
async def guest_preview_generate(
    body: GuestPreviewRequest,
    request: Request,
):
    """Generate 8 preview social posts for a logged-out visitor.

    Returns 2 posts each for Instagram, Facebook, Twitter/X, LinkedIn.
    No images: the frontend uses brand-coloured gradient placeholders.
    Rate-limited per IP (best-effort, in-process).
    """
    ip = _client_ip(request)
    if not check_rate_limit(ip):
        raise HTTPException(
            status_code=429,
            detail="Too many preview generations from this IP. Please try again later.",
        )

    brand_name = body.brand_name.strip()
    if len(brand_name) < 1:
        raise HTTPException(status_code=400, detail="Brand name is required.")
    website = _normalize_website(body.website)
    if "." not in website:
        raise HTTPException(status_code=400, detail="Please include a valid website URL.")
    intent = (body.intent or "").strip().lower() or None

    try:
        posts = await generate_guest_preview_posts(
            brand_name=brand_name,
            website=website,
            intent=intent,
        )
    except ValueError as exc:
        logger.warning("guest preview validation failed: %s", exc)
        raise HTTPException(status_code=502, detail="Preview generation returned an unexpected response. Please try again.")
    except Exception as exc:
        logger.exception("guest preview generation failed: %s", exc)
        raise HTTPException(status_code=502, detail="Preview generation is temporarily unavailable.")

    return {"ok": True, "posts": posts}
