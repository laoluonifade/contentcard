from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    APP_NAME: str = "ContentCard"
    APP_ENV: str = "development"
    SECRET_KEY: str = "changeme-in-production-at-least-32-chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days

    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/contentcard"

    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""

    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_STARTER: str = ""
    STRIPE_PRICE_SMB: str = ""
    STRIPE_PRICE_PRO: str = ""

    PAYSTACK_SECRET_KEY: str = ""
    PAYSTACK_PUBLIC_KEY: str = ""

    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""

    BANNERBEAR_API_KEY: str = ""
    BANNERBEAR_TEMPLATE_COVER: str = ""
    BANNERBEAR_TEMPLATE_CONTENT: str = ""
    BANNERBEAR_TEMPLATE_QUOTE: str = ""

    FREE_TRIAL_DAYS: int = 14
    FRONTEND_URL: str = "http://localhost:5173"

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
