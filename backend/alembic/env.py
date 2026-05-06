import asyncio
import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.db.database import Base, _normalize_db_url  # noqa: E402
from app.models import *  # noqa: F401, F403, E402
from app.core.config import settings  # noqa: E402


config = context.config

# Render's DATABASE_URL comes through as `postgresql://user:pass@host/db?sslmode=require`,
# but env.py drives an *async* engine via `asyncio.run`. Without the
# `+asyncpg` driver alembic loads psycopg2 and explodes with
#   "The asyncio extension requires an async driver to be used.
#    The loaded 'psycopg2' is not async."
# That is the failure mode that broke every preDeployCommand on Render
# from the day this service launched — the reason 20260505_03 (and any
# other migration) never landed without a manual ALTER. Normalize via
# the same helper the runtime engine uses so alembic + runtime are in
# lockstep, and pass `ssl=True` as connect_args because asyncpg doesn't
# understand libpq's `sslmode` query param.
_normalized_url, _connect_args = _normalize_db_url(settings.DATABASE_URL)
config.set_main_option("sqlalchemy.url", _normalized_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    # Use create_async_engine directly so we can thread `connect_args`
    # (asyncpg's `ssl=True`) through. `async_engine_from_config` reads
    # the .ini section but doesn't accept connect_args, which is why
    # the prior implementation couldn't drive Render's TLS-required
    # endpoint.
    connectable = create_async_engine(
        _normalized_url,
        poolclass=pool.NullPool,
        connect_args=_connect_args,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
