#!/usr/bin/env python3
"""
Second-pass: Maricopa-only referral targets for Saintly Home Health.
Reads State_Licensed_Medical_Facilities_in_Arizona.csv (full columns).
"""

from __future__ import annotations

import csv
import re
import sys
from collections import Counter
from pathlib import Path

# Reuse logic from sibling module (script dir is on sys.path when executed)
from clean_arizona_facilities_csv import (
    build_address,
    clean_business_name,
    clean_phone,
    format_phone_digits,
    is_home_health_row,
    norm_ws,
)

MARICOPA_CITIES = frozenset(
    {
        "PHOENIX",
        "MESA",
        "CHANDLER",
        "GILBERT",
        "SCOTTSDALE",
        "TEMPE",
        "GLENDALE",
        "PEORIA",
        "SURPRISE",
        "AVONDALE",
        "GOODYEAR",
        "BUCKEYE",
        "SUN CITY",
        "SUN CITY WEST",
        "EL MIRAGE",
        "TOLLESON",
        "LITCHFIELD PARK",
        "PARADISE VALLEY",
        "FOUNTAIN HILLS",
        "QUEEN CREEK",
        "CAVE CREEK",
        "CAREFREE",
    }
)

# TYPE values that are almost never strong home-health referral sources
EXCLUDE_TYPES_EXACT = frozenset(
    {
        "COUNSELING",
        "END STAGE RENAL DISEASE FACILITIES",
        "BEHAVIORAL HEALTH INPATIENT FACILITY",
        "PORTABLE X-RAY SUPPLIERS",
        "ABORTION CLINIC",
        "OUTPATIENT TREATMENT CENTER / ABORTION CLINIC",
        "ORGAN PROCUREMENT ORGANIZATIONS",
        "SUBSTANCE ABUSE TRANSITIONAL",
        "BH SPECIALIZED TRANSITIONAL FACILITY",
        "COMMUNITY MENTAL HEALTH CENTERS",
        "RECOVERY CARE CENTER",
    }
)

OTP_TYPE = "OUTPATIENT TREATMENT CENTER"


def normalize_county(raw: str) -> str:
    s = norm_ws(raw or "").upper().replace(" COUNTY", "").strip()
    return s


def city_from_row(row: dict[str, str]) -> str:
    c = norm_ws(row.get("CITY") or row.get("N_CITY") or "")
    return c.upper()


def parse_city_from_fulladdr(full: str) -> str:
    """Extract city before ', AZ' (avoids false positives like 'MESA' in 'HARDSCRABBLE MESA')."""
    if not full:
        return ""
    m = re.search(r",\s*([A-Za-z][A-Za-z\s\-']+?)\s*,\s*AZ\s", full, re.I)
    if m:
        return norm_ws(m.group(1)).upper()
    return ""


def is_maricopa(row: dict[str, str]) -> bool:
    county = normalize_county(row.get("COUNTY") or "")
    n_county = normalize_county(row.get("N_COUNTY") or "").replace(" COUNTY", "").strip()
    if county == "MARICOPA" or n_county == "MARICOPA":
        return True

    city = city_from_row(row)
    if city in MARICOPA_CITIES:
        return True
    if city.startswith("PHOENIX"):
        return True

    parsed = parse_city_from_fulladdr(row.get("N_FULLADDR") or "")
    if not parsed:
        parsed = parse_city_from_fulladdr(row.get("ADDRESS") or "")
    if parsed in MARICOPA_CITIES or parsed.startswith("PHOENIX"):
        return True

    return False


def combined_signals(row: dict[str, str], name: str) -> str:
    parts = [
        name,
        row.get("TYPE") or "",
        row.get("SUBTYPE") or "",
        row.get("LICENSE_TYPE") or "",
        row.get("LICENSE_SUBTYPE") or "",
        row.get("MEDICARE_TYPE") or "",
        row.get("Category") or "",
        row.get("Icon_Category") or "",
    ]
    return " ".join(parts).upper()


def should_exclude(name_u: str, type_u: str, signals_u: str) -> bool:
    """Exclude / Not Useful — behavioral-only, counseling, lab/imaging/pharmacy/dialysis/DME, OTP, etc."""
    if type_u in EXCLUDE_TYPES_EXACT:
        return True

    if "ABORTION" in type_u:
        return True

    # Behavioral / psychiatric / opioid treatment programs
    if re.search(r"\bBEHAVIORAL\b", name_u) or re.search(
        r"\b(PSYCHIATRIC|PSYCHIATRY)\b", name_u
    ):
        return True
    if re.search(
        r"\b(METHADONE|SUBOXONE|OPIOID TREATMENT|SUBSTANCE ABUSE)\b", name_u
    ):
        return True

    # Dental / vet
    if re.search(r"\b(DENTAL|DENTISTRY|ORTHODONT|PERIODONT|ENDODONT)\b", name_u):
        return True
    if re.search(r"\bVETERINARY\b", name_u):
        return True

    # Dialysis / ESRD (name)
    if re.search(r"\bDIALYSIS\b", name_u) or "DIALYSIS" in type_u:
        return True

    # Standalone lab / imaging / pharmacy (heuristic)
    if re.search(
        r"\b(QUEST DIAGNOSTICS|LABCORP|SONORA QUEST)\b",
        name_u,
    ):
        return True
    if re.search(
        r"\b(OPEN MRI|MRI CENTER|CT CENTER|RADIOLOGY ONLY)\b",
        name_u,
    ):
        return True
    # Imaging / radiology as primary business (narrow)
    if re.search(
        r"^(ARIZONA )?DIAGNOSTIC IMAGING|IMAGING CENTER OF |RADIOLOGY ASSOCIATES OF ",
        name_u,
    ):
        return True

    if re.search(r"\bPHARMACY\b", name_u) and "HOSPITAL" not in name_u:
        return True

    if re.search(
        r"\b(DME|DURABLE MEDICAL|HOME MEDICAL EQUIPMENT)\b",
        signals_u,
    ):
        return True

    # OTP: exclude unless name suggests referral relevance
    if type_u == OTP_TYPE or type_u.startswith(OTP_TYPE + " "):
        rescue = any(
            k in name_u
            for k in (
                "HOSPITAL",
                "MEDICAL CENTER",
                "REGIONAL MEDICAL",
                "REHAB",
                "REHABILITATION",
                "WOUND",
                "ORTHOPEDIC",
                "ORTHO ",
                " ORTHO",
                "ORTHO,",
                "SKILLED NURSING",
                "NURSING FACILITY",
                " SNF",
                "PHYSICAL THERAPY",
                "CARDIAC",
                "INFUSION",
                "ONCOLOGY",
                "CANCER CENTER",
                "HOSPICE",
                "ASSISTED LIVING",
                "MEMORY CARE",
                "SURGERY CENTER",
                "SURGICAL CENTER",
                "TRANSPLANT",
                "NEUROLOGY",
                "PULMONARY",
                "VASCULAR",
            )
        )
        if not rescue:
            return True

    # Pure counseling in name
    if re.search(r"\bCOUNSELING\b", name_u) and "HOSPITAL" not in name_u:
        return True

    return False


def categorize_referral(
    row: dict[str, str], name: str, signals_u: str, type_u: str, subtype_u: str
) -> str:
    """Return facility type label (non-excluded rows only)."""
    n = name.upper()

    # TYPE-first hints (license columns)
    if type_u == "HOSPICE" or "HOSPICE" in subtype_u:
        return "Hospice"
    if any(
        x in type_u or x in subtype_u
        for x in (
            "SKILLED NURSING",
            "NURSING FACILITY",
            "LONG TERM CARE",
            "LONG-TERM CARE",
        )
    ) or re.search(r"\bSNF\b", subtype_u):
        return "Skilled Nursing / Nursing Facility"
    if any(x in type_u for x in ("ASSISTED LIVING", "MEMORY CARE", "SENIOR LIVING")):
        return "Assisted Living / Memory Care"
    if type_u == "OUTPATIENT PHYSICAL THERAPY/SPEECH PATHOLOGY SERVICES":
        return "Rehab / Inpatient Rehab"
    if type_u == "COMPREHENSIVE OUTPATIENT REHABILITATION FACILITIES":
        return "Rehab / Inpatient Rehab"

    # Name + signals (order)
    if any(
        k in n or k in signals_u
        for k in ("HOSPITAL", "MEDICAL CENTER", "REGIONAL MEDICAL")
    ):
        return "Hospital"
    if any(
        k in n or k in signals_u
        for k in (
            "SKILLED NURSING",
            "NURSING FACILITY",
            "LONG-TERM CARE",
            "LONG TERM CARE",
            "NURSING CENTER",
        )
    ) or re.search(r"\bSNF\b", n):
        return "Skilled Nursing / Nursing Facility"
    if any(
        k in n
        for k in (
            "ASSISTED LIVING",
            "MEMORY CARE",
            "SENIOR LIVING",
        )
    ):
        return "Assisted Living / Memory Care"
    if "HOSPICE" in n or "HOSPICE" in signals_u:
        return "Hospice"
    if any(
        k in n or k in signals_u
        for k in (
            "REHAB",
            "REHABILITATION",
            "PHYSICAL THERAPY",
            "INPATIENT REHAB",
        )
    ) or re.search(r"\bPT\b", n) or re.search(r"\bOT\b", n):
        return "Rehab / Inpatient Rehab"
    if "ORTHO" in n or "ORTHOPEDIC" in n:
        return "Orthopedic"
    if "WOUND" in n or "HYPERBARIC" in n:
        return "Wound Care"

    # ASC / surgery — other medical (still referrers)
    if "AMBULATORY SURGICAL" in type_u or "SURGERY CENTER" in type_u:
        return "Other Medical"

    return "Other Medical"


def referral_priority(facility_type: str) -> str:
    if facility_type == "Exclude / Not Useful":
        return "X"
    if facility_type in (
        "Hospital",
        "Rehab / Inpatient Rehab",
        "Skilled Nursing / Nursing Facility",
        "Orthopedic",
        "Wound Care",
    ):
        return "A"
    if facility_type in ("Assisted Living / Memory Care", "Hospice"):
        return "B"
    if facility_type == "Other Medical":
        return "C"
    return "X"


def row_is_valid(name: str, address: str) -> bool:
    if not name or not address:
        return False
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
            if not is_maricopa(row):
                continue

            name = clean_business_name(row.get("FACILITY_NAME"))
            address = norm_ws(build_address(row))
            phone_digits = clean_phone(row.get("Telephone"))
            phone_display = format_phone_digits(phone_digits) if phone_digits else ""

            if not row_is_valid(name, address):
                continue

            dedup_key = (
                name.lower(),
                re.sub(r"\s+", " ", address.lower()),
                phone_digits,
            )
            if dedup_key in seen:
                continue
            seen.add(dedup_key)

            name_u = name.upper()
            type_u = (row.get("TYPE") or "").strip().upper()
            subtype_u = (row.get("SUBTYPE") or "").strip().upper()
            signals_u = combined_signals(row, name)

            excluded = should_exclude(name_u, type_u, signals_u)
            if excluded:
                fac_type = "Exclude / Not Useful"
            else:
                fac_type = categorize_referral(row, name, signals_u, type_u, subtype_u)

            pri = referral_priority(fac_type)

            rows_out.append(
                {
                    "Business Name": name,
                    "Address": address,
                    "Phone Number": phone_display,
                    "Facility Type": fac_type,
                    "Referral Priority": pri,
                }
            )

    # Sort: A, B, C, X then name
    order = {"A": 0, "B": 1, "C": 2, "X": 3}
    rows_out.sort(
        key=lambda r: (order.get(r["Referral Priority"], 9), r["Business Name"].lower())
    )

    targets = [r for r in rows_out if r["Referral Priority"] in ("A", "B")]
    excluded_file_rows = [r for r in rows_out if r["Referral Priority"] in ("C", "X")]

    maricopa_csv = out_dir / "maricopa_referral_targets.csv"
    excluded_csv = out_dir / "excluded_or_low_value.csv"
    summary_csv = out_dir / "facility_summary_counts.csv"

    fieldnames = [
        "Business Name",
        "Address",
        "Phone Number",
        "Facility Type",
        "Referral Priority",
    ]

    with maricopa_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(targets)

    with excluded_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(excluded_file_rows)

    # Summary counts
    by_type = Counter(r["Facility Type"] for r in rows_out)
    by_pri = Counter(r["Referral Priority"] for r in rows_out)
    all_types = [
        "Hospital",
        "Rehab / Inpatient Rehab",
        "Skilled Nursing / Nursing Facility",
        "Assisted Living / Memory Care",
        "Hospice",
        "Orthopedic",
        "Wound Care",
        "Other Medical",
        "Exclude / Not Useful",
    ]
    with summary_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Group", "Key", "Count"])
        w.writerow(["Referral Priority", "TOTAL", len(rows_out)])
        for k in ("A", "B", "C", "X"):
            w.writerow(["Referral Priority", k, by_pri.get(k, 0)])
        w.writerow([])
        w.writerow(["Facility Type", "Key", "Count"])
        for k in all_types:
            w.writerow(["Facility Type", k, by_type.get(k, 0)])

    print(f"Total Maricopa (deduped): {len(rows_out)}")
    print(f"  maricopa_referral_targets (A+B): {len(targets)}")
    print(f"  excluded_or_low_value (C+X): {len(excluded_file_rows)}")
    print(f"Wrote {maricopa_csv}, {excluded_csv}, {summary_csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
