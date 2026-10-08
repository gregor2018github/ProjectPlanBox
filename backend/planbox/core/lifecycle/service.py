"""Shutdown use case."""

from collections.abc import Callable

from planbox.core.errors import Conflict

type ShutdownHook = Callable[[], None]
"""Asks the running server to stop gracefully; installed by the launcher."""


class LifecycleService:
    """Decides whether the server can be stopped from the app, and stops it."""

    def __init__(self, request_shutdown: ShutdownHook | None) -> None:
        self._request_shutdown = request_shutdown

    @property
    def can_shutdown(self) -> bool:
        """True when a launcher (main.py / serve.py) installed a shutdown hook."""
        return self._request_shutdown is not None

    def shutdown_hook(self) -> ShutdownHook:
        """Returns the hook to call once the response has been sent.

        Raises:
            Conflict: If this server was not started by a launcher that allows it
                (for example the dev server, which ``dev.py`` controls).
        """
        if self._request_shutdown is None:
            raise Conflict("This server cannot be shut down from the app. Stop it where it runs.")
        return self._request_shutdown
