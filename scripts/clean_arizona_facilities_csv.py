#!/usr/bin/env python3
"""
Clean State_Licensed_Medical_Facilities_in_Arizona.csv for CRM import.
Excludes home health agencies, deduplicates, categorizes facility type and priority.
"""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path


def norm_ws(s: str) -> str:
    return " ".join(s.split()).strip()


def is_home_health_row(row: dict[str, str]) -> bool:
    """Exclude HHA / home care agencies (name + license fields)."""
    type_ = (row.get("TYPE") or "").upper()
    subtype = (row.get("SUBTYPE") or "").upper()
    category = (row.get("Category") or "").upper()
    icon = (row.get("Icon_Category") or "").upper()
    lic_type = (row.get("LICENSE_TYPE") or "").upper()
    medicare_type = (row.get("MEDICARE_TYPE") or "").upper()
    fac_type_id = (row.get("FACILITY_TYPE_ID") or "").strip()

    if fac_type_id == "51":  # HOME HEALTH AGENCY in this dataset
        return True
    if "HOME HEALTH" in type_ or type_.endswith(" HHA") or type_ == "HHA":
        return True
    if subtype == "HHA" or "HOME HEALTH" in subtype:
        return True
    if "HOME HEALTH" in category or "HOME HEALTH" in icon:
        return True
    if lic_type == "HHA":
        return True

    name = (row.get("FACILITY_NAME") or "")
    n = name.lower()

    # Phrase patterns (avoid matching unrelated "care" alone)
    if re.search(r"\bhome\s*health(care)?\b", n):
        return True
    if re.search(r"\bhome\s*care\b", n):
        return True
    if re.search(r"\bin[\s-]*home\s*care\b", n):
        return True
    if re.search(r"\bhomecare\b", n):
        return True
    if re.search(r"\bat\s+home\s+(health|care|healthcare)\b", n):
        return True
    if re.search(r"\bprivate\s+duty\s+(nursing|care)\b", n):
        return True
    # Common HHA naming
    if "home health" in n or "home care agency" in n:
        return True

    return False


def clean_phone(raw: str | None) -> str:
    if not raw:
        return ""
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    if len(digits) == 10:
        return digits
    return ""


def format_phone_digits(digits: str) -> str:
    if len(digits) == 10:
        return f"{digits[:3]}-{digits[3:6]}-{digits[6:]}"
    return digits


def build_address(row: dict[str, str]) -> str:
    full = norm_ws(row.get("N_FULLADDR") or "")
    if full:
        # Normalize comma spacing
        full = re.sub(r"\s*,\s*", ", ", full)
        full = re.sub(r"\s+", " ", full)
        return full

    street = norm_ws(row.get("ADDRESS") or row.get("N_ADDRESS") or "")
    city = norm_ws(row.get("CITY") or row.get("N_CITY") or "")
    st = norm_ws(row.get("N_STATE") or "AZ")
    z = norm_ws(row.get("ZIP") or row.get("N_ZIP") or "")
    z4 = norm_ws(row.get("N_ZIP4") or "")
    if z and z4 and len(z4) == 4:
        z = f"{z}-{z4}"
    parts = [p for p in [street, f"{city}, {st} {z}".strip() if city or z else ""] if p]
    if not parts:
        return ""
    if len(parts) == 2:
        return f"{parts[0]}, {parts[1]}"
    return parts[0]


def clean_business_name(raw: str | None) -> str:
    if not raw:
        return ""
    s = norm_ws(raw)
    # Strip common surrounding quotes from CSV
    if (s.startswith('"') and s.endswith('"')) or (s.startswith("'") and s.endswith("'")):
        s = s[1:-1]
    return norm_ws(s)


def categorize_facility(name: str) -> str:
    """First matching rule wins (user order)."""
    n = name.upper()

    if any(
        k in n
        for k in ("HOSPITAL", "MEDICAL CENTER", "REGIONAL MEDICAL")
    ):
        return "Hospital"
    if any(
        k in n
        for k in ("SKILLED NURSING", "NURSING CENTER", " SNF", "SNF ", "(SNF)", " SNF,")
    ) or re.search(r"\bSNF\b", n):
        return "Skilled Nursing Facility (SNF)"
    if any(
        k in n
        for k in (
            "REHAB",
            "REHABILITATION",
            "PHYSICAL THERAPY",
        )
    ) or re.search(r"\bPT\b", n) or re.search(r"\bOT\b", n):
        return "Rehab"
    if "ORTHO" in n or "ORTHOPEDIC" in n:
        return "Orthopedic"
    if "WOUND" in n:
        return "Wound Care"
    if any(
        k in n
        for k in ("ASSISTED LIVING", "SENIOR LIVING", "MEMORY CARE")
    ):
        return "Assisted Living"
    if "HOSPICE" in n:
        return "Hospice"

    return "Other Medical"


def priority_for(facility_type: str) -> str:
    if facility_type in (
        "Hospital",
        "Skilled Nursing Facility (SNF)",
        "Rehab",
        "Orthopedic",
        "Wound Care",
    ):
        return "High"
    if facility_type in ("Assisted Living", "Hospice"):
        return "Medium"
    return "Low"


def row_is_valid(name: str, address: str, phone_digits: str) -> bool:
    if not name:
        return False
    if not address:
        return False
    # Require at least city/state hint or zip in address
    if not re.search(r"\bAZ\b", address, re.I) and not re.search(r"\d{5}", address):
        return False
    return True


def main() -> int:
    src = Path(
        sys.argv[1]
        if len(sys.argv) > 1
        else "/Users/paulvonasek/Desktop/State_Licensed_Medical_Facilities_in_Arizona.csv"
    )
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parents[1]

    rows_out: list[dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()

    with src.open(newline="", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if is_home_health_row(row):
                continue

            name = clean_business_name(row.get("FACILITY_NAME"))
            address = norm_ws(build_address(row))
            phone_digits = clean_phone(row.get("Telephone"))
            phone_display = format_phone_digits(phone_digits) if phone_digits else ""

            if not row_is_valid(name, address, phone_digits):
                continue

            fac_type = categorize_facility(name)
            pri = priority_for(fac_type)

            dedup_key = (
                name.lower(),
                re.sub(r"\s+", " ", address.lower()),
                phone_digits,
            )
            if dedup_key in seen:
                continue
            seen.add(dedup_key)

            rows_out.append(
                {
                    "Business Name": name,
                    "Address": address,
                    "Phone Number": phone_display,
                    "Facility Type": fac_type,
                    "Priority": pri,
                }
            )

    # Stable sort: priority High/Medium/Low then name
    pri_order = {"High": 0, "Medium": 1, "Low": 2}
    rows_out.sort(
        key=lambda r: (pri_order.get(r["Priority"], 9), r["Business Name"].lower())
    )

    main_csv = out_dir / "arizona_facilities_crm_clean.csv"
    high_csv = out_dir / "high_priority_facilities.csv"
    fieldnames = [
        "Business Name",
        "Address",
        "Phone Number",
        "Facility Type",
        "Priority",
    ]

    with main_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows_out)

    high_rows = [r for r in rows_out if r["Priority"] == "High"]
    with high_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(high_rows)

    print(f"Wrote {len(rows_out)} rows to {main_csv}")
    print(f"Wrote {len(high_rows)} high-priority rows to {high_csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
