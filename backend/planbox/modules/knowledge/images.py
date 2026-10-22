"""Images on pages: files in ``<data>/images``, kept on this PC only.

Images are not rows, so exports, backups and Google Drive sync do not carry
them (the owner's choice, 2026-10-22): a page synced to another device shows
its images as missing there. A file is named ``<uuidv7>.<ext>`` and never
changes, so pages refer to it by URL and browsers may cache it forever.
Files are never deleted, so undoing any page change finds its images again.
"""

import base64
import binascii
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from planbox.core.errors import NotFound, ValidationFailed
from planbox.core.ids import new_id

type ImageType = Literal["image/png", "image/jpeg", "image/gif", "image/webp"]

MAX_IMAGE_BYTES = 20 * 1024 * 1024
URL_PREFIX = "/api/knowledge/images/"
_EXTENSIONS: dict[str, str] = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
}
_MEDIA_TYPES = {ext: media for media, ext in _EXTENSIONS.items()}
_NAME = re.compile(r"[0-9a-f-]{36}\.(png|jpg|gif|webp)")


@dataclass(frozen=True, slots=True)
class StoredImage:
    """A file in the image folder and how to serve it."""

    path: Path
    media_type: str


def _looks_like(data: bytes, media_type: str) -> bool:
    """Checks the file's signature, so the stored type is the real one (no SVG, no HTML)."""
    if media_type == "image/png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if media_type == "image/jpeg":
        return data.startswith(b"\xff\xd8\xff")
    if media_type == "image/gif":
        return data.startswith((b"GIF87a", b"GIF89a"))
    return data[:4] == b"RIFF" and data[8:12] == b"WEBP"


class ImageStore:
    """Saves and finds page images in one folder."""

    def __init__(self, folder: Path) -> None:
        self._folder = folder

    def save(self, data_base64: str, media_type: ImageType) -> str:
        """Saves an image and returns its URL.

        Raises:
            ValidationFailed: If the data is not base64, too large, or not that type of image.
        """
        if len(data_base64) > MAX_IMAGE_BYTES * 4 // 3 + 4:
            raise ValidationFailed("Images are at most 20 MB.")
        try:
            data = base64.b64decode(data_base64, validate=True)
        except binascii.Error as exc:
            raise ValidationFailed("The image data is not valid base64.") from exc
        if not data:
            raise ValidationFailed("The image is empty.")
        if len(data) > MAX_IMAGE_BYTES:
            raise ValidationFailed("Images are at most 20 MB.")
        if not _looks_like(data, media_type):
            raise ValidationFailed("The file is not the image type it claims to be.")
        name = f"{new_id()}.{_EXTENSIONS[media_type]}"
        self._folder.mkdir(parents=True, exist_ok=True)
        partial = self._folder / f"{name}.partial"
        partial.write_bytes(data)
        partial.replace(self._folder / name)
        return URL_PREFIX + name

    def find(self, name: str) -> StoredImage:
        """The stored file for a name from an image URL.

        Raises:
            NotFound: If the name is malformed or no such image is on this PC.
        """
        match = _NAME.fullmatch(name)
        path = self._folder / name
        if match is None or not path.is_file():
            raise NotFound("No image with this name on this PC.")
        return StoredImage(path, _MEDIA_TYPES[match.group(1)])
