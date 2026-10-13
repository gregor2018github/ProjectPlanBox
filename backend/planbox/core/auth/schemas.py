"""HTTP shapes for phone access."""

from typing import Literal

from pydantic import BaseModel, Field


class SessionOut(BaseModel):
    """Whether this device may use PlanBox."""

    signed_in: bool
    local: bool = Field(description="True on the PC running PlanBox (never needs to sign in).")
    phone_access: bool = Field(description="Whether phone access is turned on.")


class SignIn(BaseModel):
    """A pairing code typed on the phone, e.g. ``ABCD-EFGH``."""

    code: str = Field(min_length=1, max_length=32)


class Confirm(BaseModel):
    """Body of an action without parameters (a JSON body keeps it same-site only).

    Attributes:
        confirm: Must be ``true``.
    """

    confirm: Literal[True]


class PairingOut(BaseModel):
    """A pairing code to type on the phone."""

    code: str = Field(description="Shown as ABCD-EFGH.")
    expires_at: str


class PhoneAccessOut(BaseModel):
    """Phone access as this PC sees it."""

    enabled: bool
    urls: list[str] = Field(description="What to open on the phone.")
    tls: bool = Field(description="Whether the phone connection uses https.")
    pairing: PairingOut | None = Field(description="The code currently shown, if any.")
