"""Build holiday context strings for month generation (user country + dismissals)."""

from __future__ import annotations

from datetime import date
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.holidays import get_country_holidays, get_global_holidays
from app.models.holiday import UserDismissedHoliday


def _in_month(iso: str, year: int, month: int) -> bool:
    try:
        d = date.fromisoformat(iso[:10])
    except ValueError:
        return False
    return d.year == year and d.month == month


async def dismissed_holiday_pairs(db: AsyncSession, user_id: str) -> set[tuple[str, str]]:
    r = await db.execute(select(UserDismissedHoliday).where(UserDismissedHoliday.user_id == user_id))
    rows = r.scalars().all()
    return {(row.holiday_date, row.holiday_name) for row in rows}


async def build_month_holiday_context(
    db: AsyncSession,
    user_id: str,
    country_code: str | None,
    year: int,
    month: int,
    *,
    include_holidays: bool,
) -> str:
    """
    Returns a short block for the AI planner. Empty if user opted out or no holidays.
    """
    if not include_holidays:
        return ""

    holidays = get_global_holidays(year)
    if country_code:
        cc = country_code.strip().upper()
        country = get_country_holidays(year, cc)
        gkeys = {(h["date"], h["name"]) for h in holidays}
        holidays += [h for h in country if (h["date"], h["name"]) not in gkeys]

    dismissed = await dismissed_holiday_pairs(db, user_id)
    in_month = []
    for h in holidays:
        if not _in_month(h["date"], year, month):
            continue
        if (h["date"], h["name"]) in dismissed:
            continue
        in_month.append(h)

    if not in_month:
        return ""

    in_month.sort(key=lambda x: x["date"])
    lines = [f"- {h['date']}: {h['name']} ({h.get('type', 'global')})" for h in in_month]
    cc_note = f"User country (for local relevance): {country_code}." if country_code else ""
    return (
        f"=== PUBLIC HOLIDAYS & OBSERVANCES THIS MONTH (PRIORITY) ===\n"
        f"{cc_note}\n"
        "These dates take priority over any other content_type assignment.\n"
        "RULES:\n"
        "1. If a posting date in your schedule falls ON one of the dates listed below, that post MUST be a holiday-themed post — celebrate, acknowledge, or tie the brand's offering to the holiday. The holiday overrides whatever content_type you would otherwise have picked for that date.\n"
        "2. If a posting date falls within 2 days BEFORE a listed holiday, you may run a teaser / countdown / preparation post for it.\n"
        "3. The on-image headline + visual must reflect the holiday (e.g. \"Happy Workers' Day\" with celebratory composition), not a generic brand promo with the date in the corner.\n"
        "4. Respect the brand industry and guardrails — never force a holiday tie-in that would be tonally off (e.g. a SaaS brand on a religious observance should be respectful, not promotional).\n"
        "5. Use the listed date EXACTLY as the post date. Do not move a holiday to a non-holiday date.\n"
        "Holidays in this month:\n"
        + "\n".join(lines)
    )
