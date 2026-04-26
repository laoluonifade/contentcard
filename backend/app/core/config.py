from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    APP_NAME: str = "ContentCard"
    APP_ENV: str = "development"
    SECRET_KEY: str = "changeme-in-production-at-least-32-chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days

    DATABASE_URL: str = "postgresql+asyncpg://postgres:password@localhost:5432/contentcard"

    OPENAI_API_KEY: str = ""
    IMAGE_MODEL: str = "gpt-image-1"
    IMAGE_COUNT: int = 1  # images generated per post; increase for selection layer

    PAYSTACK_SECRET_KEY: str = ""
    PAYSTACK_PUBLIC_KEY: str = ""

    # Stripe — used for users outside Nigeria
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PUBLISHABLE_KEY: str = ""
    # Set pre-created Stripe Price IDs from the Stripe dashboard (price_xxx)
    STRIPE_PRICE_STARTER: str = ""
    STRIPE_PRICE_SMB: str = ""
    STRIPE_PRICE_PRO: str = ""

    CLOUDINARY_CLOUD_NAME: str = ""
    CLOUDINARY_API_KEY: str = ""
    CLOUDINARY_API_SECRET: str = ""
    # When True, logo upload also requests Cloudinary AI background removal (paid add-on). Local edge-based stripping always runs first.
    CLOUDINARY_LOGO_AI_BG_REMOVAL: bool = False

    BANNERBEAR_API_KEY: str = ""
    BANNERBEAR_TEMPLATE_COVER: str = ""
    BANNERBEAR_TEMPLATE_CONTENT: str = ""
    BANNERBEAR_TEMPLATE_QUOTE: str = ""
    BANNERBEAR_TEMPLATE_HOOK: str = ""
    BANNERBEAR_TEMPLATE_PROMO: str = ""
    BANNERBEAR_TEMPLATE_EDU: str = ""
    BANNERBEAR_TEMPLATE_TESTIMONIAL: str = ""
    BANNERBEAR_TEMPLATE_HIRING: str = ""
    BANNERBEAR_TEMPLATE_TEXT_POSTER: str = ""
    BANNERBEAR_TEMPLATE_PRODUCT_HERO: str = ""
    BANNERBEAR_TEMPLATE_DATA_CARD: str = ""
    BANNERBEAR_TEMPLATE_ANNOUNCEMENT: str = ""
    BANNERBEAR_TEMPLATE_STORY_CAROUSEL: str = ""
    BANNERBEAR_TEMPLATE_ILLUSTRATION_EDITORIAL: str = ""

    FREE_TRIAL_DAYS: int = 14
    FRONTEND_URL: str = "http://localhost:5173"
    # Max workspaces a single user may own when agency_mode is enabled (guardrail).
    AGENCY_MAX_OWNED_WORKSPACES: int = 50
    QUALITY_GATE_ENABLED: bool = True
    QUALITY_GATE_MIN_SCORE: float = 0.66
    QUALITY_GATE_MAX_RETRIES: int = 2
    MAX_REAL_PEOPLE_SHARE: float = 0.35

    # AI cost optimization (safe-by-default rollout flags)
    AI_COST_OPTIMIZATION_ENABLED: bool = True
    AI_CACHE_ENABLED: bool = True
    AI_MODEL_ROUTING_ENABLED: bool = True
    AI_STRICT_TOKEN_BUDGET_ENABLED: bool = True
    AI_LOW_COST_PREP_MODE: bool = True
    AI_IMAGE_VARIANT_MIN_MODE: bool = True
    AI_HIGH_QUALITY_FINAL_ONLY: bool = True

    OPENAI_HIGH_QUALITY_MODEL: str = "gpt-4o"
    OPENAI_LOW_COST_MODEL: str = "gpt-4o-mini"

    AI_MAX_OUTPUT_TOKENS_DEFAULT: int = 2000
    AI_PREP_MAX_OUTPUT_TOKENS: int = 1100
    AI_BRAND_COACH_MAX_OUTPUT_TOKENS: int = 1800
    AI_MONTHLY_PLAN_MAX_OUTPUT_TOKENS: int = 6000
    AI_CAPTION_MAX_OUTPUT_TOKENS: int = 900
    AI_TRENDS_MAX_OUTPUT_TOKENS: int = 1500

    AI_MAX_INPUT_CHARS_PER_MESSAGE: int = 12000
    AI_MAX_INPUT_CHARS_TOTAL: int = 70000
    AI_CHAT_SUMMARY_TRIGGER_MESSAGES: int = 14
    AI_CHAT_SUMMARY_KEEP_LAST_MESSAGES: int = 10

    AI_CACHE_TTL_CHAT_SEC: int = 900          # 15 min — text generation dedup window
    AI_CACHE_TTL_DETERMINISTIC_SEC: int = 1800 # 30 min — image generation dedup window (was 4 h)
    AI_TRANSIENT_RETRY_MAX: int = 1

    # Rough cost modelling for telemetry (USD / 1K tokens)
    AI_LOW_COST_MODEL_INPUT_PER_1K_USD: float = 0.00015
    AI_LOW_COST_MODEL_OUTPUT_PER_1K_USD: float = 0.0006
    AI_HIGH_QUALITY_MODEL_INPUT_PER_1K_USD: float = 0.005
    AI_HIGH_QUALITY_MODEL_OUTPUT_PER_1K_USD: float = 0.015

    SOCIAL_AUTOPILOT_GLOBAL_KILL_SWITCH: bool = False
    SOCIAL_AUTOPILOT_MIN_QUALITY_SCORE: float = 0.66
    SOCIAL_DEDUPE_WINDOW_DAYS: int = 30
    SOCIAL_WEBHOOK_SECRET: str = ""
    SOCIAL_N8N_BASE_URL: str = ""
    SOCIAL_OAUTH_STATE_SECRET: str = ""
    SOCIAL_OAUTH_CALLBACK_BASE_URL: str = ""
    META_CLIENT_ID: str = ""
    META_CLIENT_SECRET: str = ""
    LINKEDIN_CLIENT_ID: str = ""
    LINKEDIN_CLIENT_SECRET: str = ""
    SOCIAL_N8N_TOKEN_SINK_PATH: str = "/webhook/contentcard/social/oauth-token"

    SHOPIFY_CLIENT_ID: str = ""
    SHOPIFY_CLIENT_SECRET: str = ""
    SHOPIFY_SCOPES: str = "read_products,read_themes,read_content"
    SHOPIFY_OAUTH_STATE_SECRET: str = ""
    SHOPIFY_OAUTH_CALLBACK_URL: str = ""
    APP_BASE_URL: str = "http://localhost:5173"
    API_BASE_URL: str = "http://localhost:8000"
    SHOPIFY_AUTH_ENABLED: bool = True

    # Gmail SMTP — use a Google App Password (not your regular password).
    # Enable 2FA on the Gmail account, then generate an App Password at
    # https://myaccount.google.com/apppasswords
    GMAIL_USER: str = ""               # e.g. hello@contentcard.co
    GMAIL_APP_PASSWORD: str = ""       # 16-char App Password from Google
    GMAIL_FROM_NAME: str = "ContentCard"
    GMAIL_SMTP_HOST: str = "smtp.gmail.com"
    GMAIL_SMTP_PORT: int = 587

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
