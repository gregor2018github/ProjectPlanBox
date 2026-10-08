"""HTTP shapes for shutdown."""

from typing import Literal

from pydantic import BaseModel


class ShutdownIn(BaseModel):
    """Body of a shutdown request.

    Requiring a JSON body means a plain HTML form or a "simple" cross-site
    request cannot trigger a shutdown.

    Attributes:
        confirm: Must be ``true``.
    """

    confirm: Literal[True]


class ShutdownOut(BaseModel):
    """Acknowledgement; the server stops right after sending it.

    Attributes:
        status: Always ``stopping``.
    """

    status: Literal["stopping"]
