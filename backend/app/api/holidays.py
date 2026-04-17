"""
Holidays API
– GET  /holidays?year=YYYY          → list of holidays for the user's country + global
– POST /holidays/dismiss             → dismiss a holiday (hide from calendar)
– DELETE /holidays/dismiss           → un-dismiss a holiday (restore it)
"""

from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.db.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.holiday import UserDismissedHoliday

router = APIRouter(prefix="/holidays", tags=["holidays"])


# ── Calendar math helpers ──────────────────────────────────────────────────

def easter_sunday(year: int) -> date:
    """Meeus/Jones/Butcher algorithm for Gregorian Easter."""
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    ld = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * ld) // 451
    month = (h + ld - 7 * m + 114) // 31
    day = ((h + ld - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def nth_weekday(year: int, month: int, n: int, weekday: int) -> date:
    """n-th occurrence of weekday (Mon=0 … Sun=6) in month.
    Use n=-1 for the last occurrence."""
    if n > 0:
        first = date(year, month, 1)
        offset = (weekday - first.weekday()) % 7
        return first + timedelta(days=offset + (n - 1) * 7)
    # last occurrence
    last = date(year, month + 1, 1) - timedelta(days=1) if month < 12 else date(year, 12, 31)
    offset = (last.weekday() - weekday) % 7
    return last - timedelta(days=offset)


def monday_on_or_before(year: int, month: int, day: int) -> date:
    """Last Monday on or before the given date."""
    d = date(year, month, day)
    return d - timedelta(days=d.weekday())  # Monday = 0


# ── Holiday builders ───────────────────────────────────────────────────────

def _h(d: date, name: str, htype: str = "global") -> dict:
    return {"date": d.isoformat(), "name": name, "type": htype}


def get_global_holidays(year: int) -> list[dict]:
    e = easter_sunday(year)
    mothers_day = nth_weekday(year, 5, 2, 6)   # 2nd Sunday May
    fathers_day = nth_weekday(year, 6, 3, 6)   # 3rd Sunday June
    thanksgiving_us = nth_weekday(year, 11, 4, 3)  # 4th Thursday November
    black_friday = thanksgiving_us + timedelta(days=1)

    return [
        _h(date(year, 1, 1),   "New Year's Day"),
        _h(date(year, 2, 14),  "Valentine's Day"),
        _h(date(year, 3, 8),   "International Women's Day"),
        _h(e - timedelta(days=2), "Good Friday"),
        _h(e,                  "Easter Sunday"),
        _h(e + timedelta(days=1), "Easter Monday"),
        _h(date(year, 4, 22),  "Earth Day"),
        _h(date(year, 5, 1),   "International Workers' Day"),
        _h(mothers_day,        "Mother's Day"),
        _h(date(year, 6, 5),   "World Environment Day"),
        _h(fathers_day,        "Father's Day"),
        _h(date(year, 6, 30),  "World Social Media Day"),
        _h(date(year, 8, 12),  "International Youth Day"),
        _h(date(year, 10, 31), "Halloween"),
        _h(black_friday,       "Black Friday"),
        _h(date(year, 12, 24), "Christmas Eve"),
        _h(date(year, 12, 25), "Christmas Day"),
        _h(date(year, 12, 26), "Boxing Day"),
        _h(date(year, 12, 31), "New Year's Eve"),
    ]


# Static (fixed-date) country-specific holidays.
# Christmas/New Year already in global; only include country-unique ones.
_STATIC: dict[str, list[tuple]] = {
    "NG": [  # Nigeria
        (5, 1,  "Workers Day"),
        (6, 12, "Democracy Day"),
        (10, 1, "Independence Day"),
    ],
    "GH": [  # Ghana
        (1, 7,  "Constitution Day"),
        (3, 6,  "Independence Day"),
        (5, 1,  "Workers Day"),
        (7, 1,  "Republic Day"),
        (9, 21, "Kwame Nkrumah Memorial Day"),
    ],
    "ZA": [  # South Africa
        (3, 21, "Human Rights Day"),
        (4, 27, "Freedom Day"),
        (5, 1,  "Workers Day"),
        (6, 16, "Youth Day"),
        (8, 9,  "National Women's Day"),
        (9, 24, "Heritage Day"),
        (12, 16, "Day of Reconciliation"),
    ],
    "KE": [  # Kenya
        (5, 1,  "Labour Day"),
        (6, 1,  "Madaraka Day"),
        (10, 10, "Huduma Day"),
        (10, 20, "Mashujaa Day"),
        (12, 12, "Jamhuri Day"),
    ],
    "TZ": [  # Tanzania
        (1, 12, "Zanzibar Revolution Day"),
        (4, 26, "Union Day"),
        (5, 1,  "Workers Day"),
        (7, 7,  "Saba Saba Day"),
        (8, 8,  "Nane Nane Day"),
        (10, 14, "Mwalimu Nyerere Day"),
        (12, 9,  "Independence Day"),
    ],
    "UG": [  # Uganda
        (1, 26, "Liberation Day"),
        (5, 1,  "Workers Day"),
        (6, 3,  "Martyrs Day"),
        (6, 9,  "Heroes Day"),
        (10, 9, "Independence Day"),
    ],
    "ZW": [  # Zimbabwe
        (4, 18, "Independence Day"),
        (5, 1,  "Workers Day"),
        (5, 25, "Africa Day"),
        (8, 11, "Heroes Day"),
        (8, 12, "Defence Forces Day"),
        (12, 22, "Unity Day"),
    ],
    "RW": [  # Rwanda
        (1, 2,  "Public Holiday"),
        (2, 1,  "Heroes Day"),
        (4, 7,  "Genocide Memorial Day"),
        (5, 1,  "Labour Day"),
        (7, 4,  "Liberation Day"),
        (8, 15, "Assumption Day"),
    ],
    "MW": [  # Malawi
        (1, 15, "John Chilembwe Day"),
        (3, 3,  "Martyrs Day"),
        (5, 1,  "Workers Day"),
        (5, 14, "Kamuzu Day"),
        (7, 6,  "Independence Day"),
    ],
    "CM": [  # Cameroon
        (2, 11, "Youth Day"),
        (5, 1,  "Labour Day"),
        (5, 20, "National Day"),
    ],
    "ET": [  # Ethiopia
        (1, 7,  "Ethiopian Christmas"),
        (1, 19, "Epiphany"),
        (3, 2,  "Victory of Adwa"),
        (5, 1,  "Workers Day"),
        (5, 5,  "Patriots Victory Day"),
        (9, 11, "Ethiopian New Year"),
        (9, 27, "Finding of the True Cross"),
    ],
    "EG": [  # Egypt
        (1, 7,  "Orthodox Christmas"),
        (1, 25, "Revolution Day"),
        (4, 25, "Sinai Liberation Day"),
        (5, 1,  "Labour Day"),
        (7, 23, "Revolution Day (1952)"),
        (10, 6, "Armed Forces Day"),
    ],
    "US": [  # United States
        (6, 19, "Juneteenth"),
        (7, 4,  "Independence Day"),
        (11, 11, "Veterans Day"),
    ],
    "GB": [  # United Kingdom
        (3, 17, "St Patrick's Day (N. Ireland)"),
        (11, 5, "Guy Fawkes Night"),
    ],
    "IE": [  # Ireland
        (3, 17, "St Patrick's Day"),
        (6, 2,  "June Bank Holiday"),
        (10, 28, "October Bank Holiday"),
    ],
    "CA": [  # Canada
        (7, 1,  "Canada Day"),
        (11, 11, "Remembrance Day"),
    ],
    "AU": [  # Australia
        (1, 26, "Australia Day"),
        (4, 25, "ANZAC Day"),
    ],
    "NZ": [  # New Zealand
        (2, 6,  "Waitangi Day"),
        (4, 25, "ANZAC Day"),
        (6, 3,  "King's Birthday"),
        (10, 28, "Labour Day"),
    ],
    "IN": [  # India
        (1, 26, "Republic Day"),
        (8, 15, "Independence Day"),
        (10, 2, "Gandhi Jayanti"),
    ],
    "SG": [  # Singapore
        (2, 1,  "Chinese New Year"),
        (5, 1,  "Labour Day"),
        (8, 9,  "National Day"),
        (11, 1, "Deepavali"),
    ],
    "PH": [  # Philippines
        (4, 9,  "Araw ng Kagitingan"),
        (5, 1,  "Labour Day"),
        (6, 12, "Independence Day"),
        (8, 21, "Ninoy Aquino Day"),
        (11, 1, "All Saints Day"),
        (11, 30, "Bonifacio Day"),
        (12, 30, "Rizal Day"),
    ],
    "PK": [  # Pakistan
        (3, 23, "Pakistan Day"),
        (8, 14, "Independence Day"),
        (11, 9, "Iqbal Day"),
    ],
    "AE": [  # UAE
        (12, 1, "Commemoration Day"),
        (12, 2, "National Day"),
        (12, 3, "National Day Holiday"),
    ],
    "SA": [  # Saudi Arabia
        (2, 22, "Founding Day"),
        (9, 23, "National Day"),
    ],
    "DE": [  # Germany
        (5, 1,  "Tag der Arbeit"),
        (10, 3, "German Unity Day"),
        (11, 1, "All Saints Day"),
    ],
    "FR": [  # France
        (5, 1,  "Labour Day"),
        (5, 8,  "Victory in Europe Day"),
        (7, 14, "Bastille Day"),
        (11, 1, "All Saints Day"),
        (11, 11, "Armistice Day"),
    ],
    "IT": [  # Italy
        (1, 6,  "Epiphany"),
        (4, 25, "Liberation Day"),
        (5, 1,  "Labour Day"),
        (6, 2,  "Republic Day"),
        (11, 1, "All Saints Day"),
        (12, 8, "Immaculate Conception"),
    ],
    "ES": [  # Spain
        (1, 6,  "Epiphany"),
        (5, 1,  "Labour Day"),
        (10, 12, "National Day"),
        (11, 1, "All Saints Day"),
        (12, 6, "Constitution Day"),
        (12, 8, "Immaculate Conception"),
    ],
    "NL": [  # Netherlands
        (4, 27, "King's Day"),
        (5, 5,  "Liberation Day"),
    ],
    "BR": [  # Brazil
        (1, 25, "São Paulo Day (SP)"),
        (4, 21, "Tiradentes Day"),
        (5, 1,  "Workers Day"),
        (9, 7,  "Independence Day"),
        (10, 12, "Our Lady of Aparecida"),
        (11, 2, "Day of the Dead"),
        (11, 15, "Republic Day"),
        (11, 20, "Black Consciousness Day"),
    ],
    "MX": [  # Mexico
        (2, 5,  "Constitution Day"),
        (3, 21, "Benito Juárez Day"),
        (5, 1,  "Labour Day"),
        (9, 16, "Independence Day"),
        (11, 2, "Day of the Dead"),
        (11, 20, "Revolution Day"),
    ],
    "AR": [  # Argentina
        (5, 25, "National Day"),
        (7, 9,  "Independence Day"),
        (8, 17, "San Martín Day"),
        (10, 12, "Day of Respect for Cultural Diversity"),
        (11, 20, "National Sovereignty Day"),
        (12, 8, "Immaculate Conception"),
    ],
    "CO": [  # Colombia
        (7, 20, "Independence Day"),
        (8, 7,  "Battle of Boyacá"),
        (10, 12, "Día de la Raza"),
        (11, 1, "All Saints Day"),
        (11, 11, "Independence of Cartagena"),
    ],
    "ZM": [  # Zambia
        (3, 12, "Youth Day"),
        (5, 1,  "Labour Day"),
        (5, 25, "Africa Day"),
        (7, 4,  "Heroes Day"),
        (7, 5,  "Unity Day"),
        (8, 1,  "Farmers Day"),
        (10, 24, "Independence Day"),
    ],
    "LS": [  # Lesotho
        (3, 11, "Moshoeshoe Day"),
        (5, 2,  "King's Birthday"),
        (7, 17, "King Letsie III's Birthday"),
        (10, 4, "Independence Day"),
    ],
    "BW": [  # Botswana
        (7, 1,  "Sir Seretse Khama Day"),
        (7, 19, "President's Day"),
        (9, 30, "Botswana Day"),
    ],
    "NA": [  # Namibia
        (3, 21, "Independence Day"),
        (5, 4,  "Cassinga Day"),
        (5, 25, "Africa Day"),
        (8, 26, "Heroes Day"),
        (12, 10, "Human Rights Day"),
    ],
}


def get_country_holidays(year: int, country_code: str) -> list[dict]:
    """Return static + computed holidays for a specific country."""
    cc = (country_code or "").upper()
    result: list[dict] = []

    # Static fixed-date holidays
    for month, day, name in _STATIC.get(cc, []):
        try:
            result.append(_h(date(year, month, day), name, "country"))
        except ValueError:
            pass  # invalid date for this year (e.g. Feb 30)

    # Computed/variable country holidays
    result.extend(_computed_country(year, cc))

    return result


def _computed_country(year: int, cc: str) -> list[dict]:
    """Variable date holidays per country."""
    result = []

    if cc == "US":
        result += [
            _h(nth_weekday(year, 1, 3, 0), "Martin Luther King Jr. Day", "country"),
            _h(nth_weekday(year, 2, 3, 0), "Presidents' Day", "country"),
            _h(nth_weekday(year, 5, -1, 0), "Memorial Day", "country"),
            _h(nth_weekday(year, 9, 1, 0), "Labor Day", "country"),
            _h(nth_weekday(year, 10, 2, 0), "Columbus Day", "country"),
            _h(nth_weekday(year, 11, 4, 3), "Thanksgiving Day", "country"),
        ]
    elif cc == "CA":
        result += [
            _h(nth_weekday(year, 2, 3, 0), "Family Day", "country"),
            _h(monday_on_or_before(year, 5, 25), "Victoria Day", "country"),
            _h(nth_weekday(year, 8, 1, 0), "Civic Holiday", "country"),
            _h(nth_weekday(year, 9, 1, 0), "Labour Day", "country"),
            _h(nth_weekday(year, 10, 2, 0), "Thanksgiving Day", "country"),
        ]
    elif cc in ("GB", "IE"):
        result += [
            _h(nth_weekday(year, 5, 1, 0), "Early May Bank Holiday", "country"),
            _h(nth_weekday(year, 5, -1, 0), "Spring Bank Holiday", "country"),
            _h(nth_weekday(year, 8, -1, 0), "Summer Bank Holiday", "country"),
        ]
    elif cc == "AU":
        result += [
            _h(nth_weekday(year, 6, 2, 0), "King's Birthday", "country"),
            _h(nth_weekday(year, 11, 1, 1), "Melbourne Cup Day", "country"),
        ]
    elif cc == "NZ":
        result += [
            _h(nth_weekday(year, 10, 4, 0), "Labour Day", "country"),
        ]
    elif cc == "IN":
        # Holi is variable (lunar) — approximate March dates for near future
        holi_approx = {2025: (3, 14), 2026: (3, 3), 2027: (3, 22)}
        if year in holi_approx:
            result.append(_h(date(year, *holi_approx[year]), "Holi", "country"))
        # Diwali approximate dates
        diwali_approx = {2025: (10, 20), 2026: (11, 9), 2027: (10, 29)}
        if year in diwali_approx:
            result.append(_h(date(year, *diwali_approx[year]), "Diwali", "country"))
    elif cc == "ZA":
        # Family Day = Easter Monday
        e = easter_sunday(year)
        result.append(_h(e + timedelta(days=1), "Family Day", "country"))
    elif cc == "MX":
        result += [
            _h(nth_weekday(year, 2, 1, 0), "Constitution Day", "country"),
            _h(nth_weekday(year, 3, 3, 0), "Benito Juárez Day", "country"),
        ]
    elif cc == "BR":
        # Carnival (48 days before Easter)
        e = easter_sunday(year)
        carnival = e - timedelta(days=48)
        result.append(_h(carnival, "Carnival", "country"))
        result.append(_h(carnival - timedelta(days=1), "Carnival Eve", "country"))
        result.append(_h(e - timedelta(days=47), "Carnival Tuesday", "country"))

    return result


# ── API endpoints ────────────────────────────────────────────────────────────

class DismissRequest(BaseModel):
    date: str    # "YYYY-MM-DD"
    name: str


@router.get("")
async def list_holidays(
    year: int = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return global + country holidays for the given year, minus dismissed ones."""
    from datetime import datetime
    if not year:
        year = datetime.utcnow().year

    # Build holidays list
    holidays = get_global_holidays(year)
    if current_user.country_code:
        country = get_country_holidays(year, current_user.country_code)
        # Deduplicate: skip country entries whose (date, name) already appear globally
        global_keys = {(h["date"], h["name"]) for h in holidays}
        holidays += [h for h in country if (h["date"], h["name"]) not in global_keys]

    # Sort by date
    holidays.sort(key=lambda h: h["date"])

    # Fetch dismissed dates for this user
    result = await db.execute(
        select(UserDismissedHoliday.holiday_date, UserDismissedHoliday.holiday_name)
        .where(UserDismissedHoliday.user_id == current_user.id)
    )
    dismissed = {(row.holiday_date, row.holiday_name) for row in result.fetchall()}

    # Annotate each holiday with dismissed status
    for h in holidays:
        h["dismissed"] = (h["date"], h["name"]) in dismissed

    return holidays


@router.post("/dismiss", status_code=204)
async def dismiss_holiday(
    body: DismissRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Hide a holiday from the user's calendar."""
    # Upsert: skip if already dismissed
    existing = await db.execute(
        select(UserDismissedHoliday).where(
            UserDismissedHoliday.user_id == current_user.id,
            UserDismissedHoliday.holiday_date == body.date,
            UserDismissedHoliday.holiday_name == body.name,
        )
    )
    if not existing.scalar_one_or_none():
        db.add(UserDismissedHoliday(
            user_id=current_user.id,
            holiday_date=body.date,
            holiday_name=body.name,
        ))
        await db.commit()


@router.delete("/dismiss", status_code=204)
async def undismiss_holiday(
    body: DismissRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Restore a previously dismissed holiday."""
    await db.execute(
        delete(UserDismissedHoliday).where(
            UserDismissedHoliday.user_id == current_user.id,
            UserDismissedHoliday.holiday_date == body.date,
            UserDismissedHoliday.holiday_name == body.name,
        )
    )
    await db.commit()
