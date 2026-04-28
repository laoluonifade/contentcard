import logging
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

logger = logging.getLogger(__name__)


def _normalize_db_url(url: str) -> tuple[str, dict]:
    """Coerce Render/Heroku DATABASE_URL forms to asyncpg-compatible URL + args.

    Render's dashboard hands out URLs that start with ``postgres://`` and often
    carry ``?sslmode=require``. SQLAlchemy 2 dropped the ``postgres://`` alias
    and asyncpg doesn't understand libpq's ``sslmode`` param — both must be
    rewritten before the URL reaches the engine.
    """
    if not url:
        return url, {}

    if url.startswith("postgres://"):
        url = "postgresql+asyncpg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://") and "+asyncpg" not in url.split("://", 1)[0]:
        url = "postgresql+asyncpg://" + url[len("postgresql://"):]

    connect_args: dict = {}
    parts = urlsplit(url)
    if parts.query:
        q = dict(parse_qsl(parts.query, keep_blank_values=True))
        sslmode = q.pop("sslmode", None)
        if sslmode and sslmode.lower() in ("require", "verify-ca", "verify-full", "prefer", "allow"):
            connect_args["ssl"] = True
        new_query = urlencode(q)
        url = urlunsplit((parts.scheme, parts.netloc, parts.path, new_query, parts.fragment))

    return url, connect_args


_db_url, _connect_args = _normalize_db_url(settings.DATABASE_URL)

# Log the resolved host (never the credentials) so deploy failures point to
# the actual hostname the engine is dialling.
try:
    _host = urlsplit(_db_url).hostname or "<missing-host>"
    logger.info("Postgres engine target host=%s ssl=%s", _host, bool(_connect_args.get("ssl")))
except Exception:
    pass

engine = create_async_engine(
    _db_url,
    echo=False,
    pool_pre_ping=True,
    connect_args=_connect_args,
)
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
