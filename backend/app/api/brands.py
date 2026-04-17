from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.database import get_db
from app.models.brand import Brand
from app.models.workspace import WorkspaceMember, WorkspaceRole
from app.models.user import User
from app.core.dependencies import get_current_user
from app.schemas.brand import BrandCreate, BrandUpdate, BrandOut
import cloudinary
import cloudinary.uploader
from app.core.config import settings

cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
)

router = APIRouter(prefix="/workspaces/{workspace_id}/brands", tags=["brands"])


async def _check_member(workspace_id: str, user_id: str, db: AsyncSession) -> WorkspaceMember:
    r = await db.execute(select(WorkspaceMember).where(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user_id,
    ))
    m = r.scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=403, detail="Not a workspace member")
    return m


@router.get("", response_model=list[BrandOut])
async def list_brands(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_member(workspace_id, current_user.id, db)
    result = await db.execute(select(Brand).where(Brand.workspace_id == workspace_id))
    return [BrandOut.model_validate(b) for b in result.scalars().all()]


@router.post("", response_model=BrandOut, status_code=201)
async def create_brand(
    workspace_id: str,
    body: BrandCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    m = await _check_member(workspace_id, current_user.id, db)
    if m.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.EDITOR):
        raise HTTPException(status_code=403, detail="Editor access required")

    brand = Brand(workspace_id=workspace_id, **body.model_dump())
    db.add(brand)
    await db.commit()
    await db.refresh(brand)
    return BrandOut.model_validate(brand)


@router.get("/{brand_id}", response_model=BrandOut)
async def get_brand(
    workspace_id: str, brand_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_member(workspace_id, current_user.id, db)
    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    return BrandOut.model_validate(brand)


@router.put("/{brand_id}", response_model=BrandOut)
async def update_brand(
    workspace_id: str, brand_id: str, body: BrandUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    m = await _check_member(workspace_id, current_user.id, db)
    if m.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.EDITOR):
        raise HTTPException(status_code=403, detail="Editor access required")

    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    for key, val in body.model_dump(exclude_none=True).items():
        setattr(brand, key, val)

    await db.commit()
    await db.refresh(brand)
    return BrandOut.model_validate(brand)


@router.delete("/{brand_id}", status_code=204)
async def delete_brand(
    workspace_id: str, brand_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    m = await _check_member(workspace_id, current_user.id, db)
    if m.role not in (WorkspaceRole.OWNER, WorkspaceRole.ADMIN):
        raise HTTPException(status_code=403, detail="Admin required")

    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    await db.delete(brand)
    await db.commit()


@router.post("/{brand_id}/logo", response_model=dict)
async def upload_logo(
    workspace_id: str, brand_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _check_member(workspace_id, current_user.id, db)
    r = await db.execute(select(Brand).where(Brand.id == brand_id, Brand.workspace_id == workspace_id))
    brand = r.scalar_one_or_none()
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")

    contents = await file.read()
    result = cloudinary.uploader.upload(
        contents,
        folder=f"contentcard/brands/{brand_id}",
        public_id="logo",
        overwrite=True,
        resource_type="image",
    )
    brand.logo_url = result["secure_url"]
    await db.commit()
    return {"logo_url": brand.logo_url}
