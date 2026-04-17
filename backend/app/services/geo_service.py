import httpx

NIGERIA_CODES = {"NG", "NGA"}


async def get_country_from_ip(ip: str) -> str | None:
    """Return ISO 3166-1 alpha-2 country code from IP address."""
    if ip in ("127.0.0.1", "::1", "testclient"):
        return None
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"https://ipapi.co/{ip}/country/")
            if resp.status_code == 200:
                code = resp.text.strip()
                return code if len(code) == 2 else None
    except Exception:
        pass
    return None


def get_payment_provider(country_code: str | None) -> str:
    """Route Nigeria to Paystack, everyone else to Stripe."""
    if country_code and country_code.upper() in NIGERIA_CODES:
        return "paystack"
    return "stripe"


def is_nigeria(country_code: str | None) -> bool:
    return country_code is not None and country_code.upper() in NIGERIA_CODES
