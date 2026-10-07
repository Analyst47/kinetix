"""Loose version ordering good enough to pick the highest fixed version across advisories."""

import re


def _key(version: str) -> tuple:
    core, _, pre = version.lstrip("v").partition("-")
    nums = tuple(int(p) if p.isdigit() else 0 for p in re.split(r"[.+]", core)[:4])
    # A release sorts after its pre-releases.
    return (*nums, 0 if pre else 1, pre)


def highest_fix(versions: list[str | None]) -> str | None:
    real = [v for v in versions if v]
    return max(real, key=_key) if real else None
