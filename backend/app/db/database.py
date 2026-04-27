from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings


def _normalize_database_url(url: str) -> str:
    """Coerce a DATABASE_URL to the asyncpg form SQLAlchemy expects.

    Render and most managed Postgres providers hand out URLs that start with
    ``postgres://`` or ``postgresql://`` and may carry ``?sslmode=require``.
    The async engine needs the ``postgresql+asyncpg`` dialect, and asyncpg
    does not accept ``sslmode`` as a query parameter (it's a libpq concept).
    Normalize both so a paste-from-dashboard URL just works.
    """
    if not url:
        return url
    parts = urlsplit(url)
    scheme = parts.scheme
    if scheme == "postgres":
        scheme = "postgresql+asyncpg"
    elif scheme == "postgresql":
        scheme = "postgresql+asyncpg"
    # Drop libpq-only query params asyncpg silently ignores or rejects.
    if parts.query:
        kept = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k.lower() != "sslmode"]
        query = urlencode(kept)
    else:
        query = ""
    return urlunsplit((scheme, parts.netloc, parts.path, query, parts.fragment))


_DATABASE_URL = _normalize_database_url(settings.DATABASE_URL)
engine = create_async_engine(_DATABASE_URL, echo=False, pool_pre_ping=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
