"""HTTP shapes for Google Drive sync."""

from typing import Literal

from pydantic import BaseModel, Field

from planbox.core.data.schemas import ImportOut


class CloudStatusOut(BaseModel):
    """Google Drive sync as this device sees it (answered without asking Google)."""

    available: bool = Field(
        description="Whether sync is set up here (an OAuth client on a PC, Google sign-in "
        "on the phone)."
    )
    connected: bool = Field(description="Whether this device is signed in to Google Drive.")
    connecting: bool = Field(description="A sign-in was started and has not finished yet.")
    device_id: str
    device_name: str
    last_upload_at: str | None
    last_download_at: str | None
    error: str | None = Field(description="Why the last sign-in failed, if it did.")


class CloudConnectOut(BaseModel):
    """A started sign-in: open ``auth_url`` (PC), or nothing to open (phone)."""

    auth_url: str | None
    status: CloudStatusOut


class CloudDeviceOut(BaseModel):
    """A device's file in Google Drive."""

    device_id: str
    name: str
    uploaded_at: str
    exported_at: str | None
    app_version: str | None
    size: int = Field(description="Bytes (compressed).")
    this_device: bool


class CloudUploadOut(BaseModel):
    """What an upload did."""

    uploaded_at: str
    size: int = Field(description="Bytes uploaded (compressed).")


class CloudMergeOut(BaseModel):
    """What merging one other device's file did."""

    device: CloudDeviceOut
    status: Literal["merged", "unchanged", "failed"] = Field(
        description="unchanged: merged before and not changed since."
    )
    error: str | None
    result: ImportOut | None


class CloudDownloadOut(BaseModel):
    """What a download did, per other device."""

    devices: list[CloudMergeOut]


class CloudSyncOut(BaseModel):
    """What a sync (download, then upload) did."""

    download: CloudDownloadOut
    upload: CloudUploadOut
