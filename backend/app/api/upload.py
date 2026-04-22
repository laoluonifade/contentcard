from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from app.core.dependencies import get_current_user
from app.models.user import User
from app.core.config import settings
import cloudinary
import cloudinary.uploader

cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
)

router = APIRouter(prefix="/upload", tags=["upload"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/heic"}
ALLOWED_PREP_VIDEO_TYPES = {"video/mp4", "video/quicktime", "video/webm"}
MAX_SIZE_MB = 20
MAX_PREP_VIDEO_MB = 120


@router.post("/photo")
async def upload_photo(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")

    contents = await file.read()
    if len(contents) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File too large. Max {MAX_SIZE_MB}MB.")

    result = cloudinary.uploader.upload(
        contents,
        folder=f"contentcard/uploads/{current_user.id}",
        resource_type="image",
        transformation=[{"quality": "auto", "fetch_format": "auto"}],
    )
    return {"url": result["secure_url"], "public_id": result["public_id"]}


@router.post("/prep-asset")
async def upload_prep_asset(
    file: UploadFile = File(...),
    asset_kind: str = Form("auto"),  # auto | screenshot | recording
    current_user: User = Depends(get_current_user),
):
    content_type = str(file.content_type or "").lower()
    inferred_kind = "recording" if content_type.startswith("video/") else "screenshot"
    kind = inferred_kind if asset_kind == "auto" else str(asset_kind or "").strip().lower()
    if kind not in {"screenshot", "recording"}:
        raise HTTPException(status_code=400, detail="asset_kind must be auto, screenshot, or recording")

    contents = await file.read()
    if kind == "recording":
        if content_type not in ALLOWED_PREP_VIDEO_TYPES:
            raise HTTPException(status_code=400, detail=f"Unsupported recording type: {content_type}")
        if len(contents) > MAX_PREP_VIDEO_MB * 1024 * 1024:
            raise HTTPException(status_code=413, detail=f"Recording too large. Max {MAX_PREP_VIDEO_MB}MB.")
        result = cloudinary.uploader.upload(
            contents,
            folder=f"contentcard/prep/{current_user.id}",
            resource_type="video",
        )
        return {"url": result["secure_url"], "public_id": result["public_id"], "kind": "recording"}

    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported screenshot type: {content_type}")
    if len(contents) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Screenshot too large. Max {MAX_SIZE_MB}MB.")
    result = cloudinary.uploader.upload(
        contents,
        folder=f"contentcard/prep/{current_user.id}",
        resource_type="image",
        transformation=[{"quality": "auto", "fetch_format": "auto"}],
    )
    return {"url": result["secure_url"], "public_id": result["public_id"], "kind": "screenshot"}
