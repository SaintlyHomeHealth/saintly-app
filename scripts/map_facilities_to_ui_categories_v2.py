#!/usr/bin/env python3
"""
V2: UI mapping with name-based refinements + Hospice -> Other (UI gap) + hospice_only extract.
Reads refined_facilities.csv.
"""

from __future__ import annotations

import csv
import re
import sys
from collections import Counter
from pathlib import Path

# Import v1 map_row from sibling module
sys.path.insert(0, str(Path(__file__).resolve().parent))
from map_facilities_to_ui_categories import map_row  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "refined_facilities.csv"
OUT_FINAL = ROOT / "final_facilities_mapped_v2.csv"
OUT_REMAPPED = ROOT / "remapped_rows_v2.csv"
OUT_SUMMARY = ROOT / "mapping_summary_v2.csv"
OUT_HOSPICE = ROOT / "hospice_only.csv"


def refine_ui_type_by_name(name: str, base: str) -> str:
    """
    Override base UI type when Business Name contains specialty / program keywords.
    Precedence: cardio/neuro/oncology -> pulmonology -> nephrology -> podiatry ->
    orthopedic (spine/joint/sports med) -> home visit -> case management.
    """
    n = name.upper()

    if "CARDIO" in n or "CARDIAC" in n:
        return "Cardiology Office"
    if "NEURO" in n:
        return "Neurology Office"
    if "ONCOLOGY" in n or "CANCER" in n:
        return "Oncology Office"
    if "PULMONARY" in n or re.search(r"\bPULMO\b", n):
        return "Pulmonology Office"
    if "NEPHRO" in n or "KIDNEY" in n:
        return "Nephrology Office"
    if "PODIATRY" in n or re.search(r"\bFOOT\b", n) or "ANKLE" in n:
        return "Podiatry Office"
    if any(
        k in n
        for k in (
            "SPINE",
            "JOINT",
            "SPORTS MED",
            "MUSCULOSKELETAL",
        )
    ):
        return "Orthopedic Office"
    if (
        "HOME VISIT" in n
        or "HOME VISITS" in n
        or "HOUSECALL" in n
        or "HOUSE CALL" in n
        or "MOBILE PHYSICIAN" in n
    ):
        return "Home Visit Physician Group"
    if any(
        k in n
        for k in (
            "CASE MANAGEMENT",
            "DISCHARGE PLANNING",
            "SOCIAL WORK",
        )
    ):
        return "Case Management Office"

    return base


def apply_hospice_ui_gap(ui_type: str) -> str:
    """Remap Hospice to Other when UI dropdown does not list Hospice."""
    if ui_type == "Hospice":
        return "Other"
    return ui_type


def main() -> None:
    if not SRC.is_file():
        raise SystemExit(f"Missing {SRC}")

    rows_final: list[dict[str, str]] = []
    rows_hospice: list[dict[str, str]] = []
    remapped: list[dict[str, str]] = []

    fields = [
        "Business Name",
        "Address",
        "Phone Number",
        "Facility Type",
        "Priority",
    ]

    with SRC.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row.get("Business Name") or ""
            src_type = (row.get("Facility Type") or "").strip()
            priority = row.get("Priority") or ""

            base = map_row(src_type, name)
            refined = refine_ui_type_by_name(name, base)
            final = apply_hospice_ui_gap(refined)

            out = {
                "Business Name": name,
                "Address": row.get("Address") or "",
                "Phone Number": row.get("Phone Number") or "",
                "Facility Type": final,
                "Priority": priority,
            }
            rows_final.append(out)

            if base == "Hospice":
                rows_hospice.append(
                    {
                        "Business Name": name,
                        "Address": row.get("Address") or "",
                        "Phone Number": row.get("Phone Number") or "",
                        "Facility Type": "Hospice",
                        "Priority": priority,
                    }
                )

            if final != base:
                remapped.append(
                    {
                        **out,
                        "Previous Facility Type (v1 base)": base,
                        "After name refinement": refined,
                        "Hospice remapped to Other": "yes"
                        if base == "Hospice" and final == "Other"
                        else "no",
                    }
                )

    counts = Counter(r["Facility Type"] for r in rows_final)

    with OUT_FINAL.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows_final)

    remapped_fields = fields + [
        "Previous Facility Type (v1 base)",
        "After name refinement",
        "Hospice remapped to Other",
    ]
    with OUT_REMAPPED.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=remapped_fields)
        w.writeheader()
        w.writerows(remapped)

    ui_inventory = [
        "Hospital",
        "Rehab Hospital",
        "Skilled Nursing Facility",
        "Assisted Living",
        "Independent Living",
        "Wound Clinic",
        "Primary Care Office",
        "Cardiology Office",
        "Neurology Office",
        "Orthopedic Office",
        "Podiatry Office",
        "Nephrology Office",
        "Pulmonology Office",
        "Oncology Office",
        "Pain Management",
        "Case Management Office",
        "Home Visit Physician Group",
        "Hospice",
        "Other",
    ]
    with OUT_SUMMARY.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Facility Type", "Count"])
        for ft in ui_inventory:
            w.writerow([ft, counts.get(ft, 0)])
        extra = sorted(k for k in counts if k not in ui_inventory)
        for ft in extra:
            w.writerow([ft, counts[ft]])

    with OUT_HOSPICE.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows_hospice)

    print(f"Wrote {len(rows_final)} -> {OUT_FINAL}")
    print(f"Hospice-only ({len(rows_hospice)}) -> {OUT_HOSPICE}")
    print(f"Remapped / audit rows ({len(remapped)}) -> {OUT_REMAPPED}")
    print(f"Summary -> {OUT_SUMMARY}")


if __name__ == "__main__":
    main()
