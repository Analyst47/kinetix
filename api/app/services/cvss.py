from dataclasses import dataclass
from decimal import Decimal

from cvss import CVSS3, CVSS4
from cvss.exceptions import CVSSError

from app.errors import ApiError


@dataclass(frozen=True)
class CvssResult:
    version: str
    vector: str
    score: Decimal
    severity: str


def score_vector(vector: str) -> CvssResult:
    """Validate a CVSS 4.0 or 3.x vector and compute its base score."""
    vector = vector.strip()
    try:
        if vector.startswith("CVSS:4.0/"):
            c4 = CVSS4(vector)
            return CvssResult("4.0", c4.clean_vector(), Decimal(str(c4.base_score)), c4.severity)
        if vector.startswith(("CVSS:3.0/", "CVSS:3.1/")):
            c3 = CVSS3(vector)
            return CvssResult(
                vector[5:8], c3.clean_vector(), Decimal(str(c3.base_score)), c3.severities()[0]
            )
    except CVSSError as exc:
        raise ApiError(422, "invalid_cvss", f"That CVSS vector is not valid: {exc}") from exc
    raise ApiError(
        422, "invalid_cvss", "Use a CVSS 4.0 or 3.1 vector, starting CVSS:4.0/ or CVSS:3.1/."
    )
