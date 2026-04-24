import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class ShopifyConnectionStatus(str, enum.Enum):
    CONNECTED = "connected"
    REVOKED = "revoked"
    ERROR = "error"


class ShopifyConnection(Base):
    __tablename__ = "shopify_connections"
    __table_args__ = (UniqueConstraint("shop_domain", name="uq_shopify_connections_shop_domain"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False, index=True)
    workspace_id: Mapped[str] = mapped_column(String, ForeignKey("workspaces.id"), nullable=False, index=True)
    brand_id: Mapped[str | None] = mapped_column(String, ForeignKey("brands.id"), nullable=True, index=True)
    shop_domain: Mapped[str] = mapped_column(String(255), nullable=False)
    access_token_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    scope: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[ShopifyConnectionStatus] = mapped_column(
        SAEnum(ShopifyConnectionStatus), default=ShopifyConnectionStatus.CONNECTED, nullable=False
    )
    metadata: Mapped[dict | None] = mapped_column(JSON, default=dict)
    connected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ShopifyProductSnapshot(Base):
    __tablename__ = "shopify_product_snapshots"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "brand_id",
            "shop_domain",
            "product_id",
            name="uq_shopify_product_snapshot_identity",
        ),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id: Mapped[str] = mapped_column(String, ForeignKey("workspaces.id"), nullable=False, index=True)
    brand_id: Mapped[str] = mapped_column(String, ForeignKey("brands.id"), nullable=False, index=True)
    shop_domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    product_id: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    handle: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    primary_image_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    price_min: Mapped[str | None] = mapped_column(String(32), nullable=True)
    price_max: Mapped[str | None] = mapped_column(String(32), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    product_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    tags: Mapped[list | None] = mapped_column(JSON, default=list)
    status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
