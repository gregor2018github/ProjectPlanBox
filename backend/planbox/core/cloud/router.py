"""HTTP routes for Google Drive sync, mounted at ``/api/cloud``."""

import html

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

from planbox.core.auth.deps import AuthDep, ClientHostDep
from planbox.core.auth.schemas import Confirm
from planbox.core.cloud.deps import CloudServiceDep
from planbox.core.cloud.models import CloudDevice, CloudStatus, Download, Upload
from planbox.core.cloud.schemas import (
    CloudConnectOut,
    CloudDeviceOut,
    CloudDownloadOut,
    CloudMergeOut,
    CloudStatusOut,
    CloudSyncOut,
    CloudUploadOut,
)
from planbox.core.data.document import import_out
from planbox.core.errors import DomainError

router = APIRouter(prefix="/cloud", tags=["core"])

CALLBACK = "cloud_callback"


def _status(status: CloudStatus) -> CloudStatusOut:
    return CloudStatusOut.model_validate(status, from_attributes=True)


def _device(device: CloudDevice) -> CloudDeviceOut:
    return CloudDeviceOut.model_validate(device, from_attributes=True)


def _upload(upload: Upload) -> CloudUploadOut:
    return CloudUploadOut(uploaded_at=upload.uploaded_at, size=upload.size)


def _download(download: Download) -> CloudDownloadOut:
    return CloudDownloadOut(
        devices=[
            CloudMergeOut(
                device=_device(m.device),
                status=m.status,
                error=m.error,
                result=None if m.report is None else import_out(m.report),
            )
            for m in download.devices
        ]
    )


@router.get("")
def get_cloud(service: CloudServiceDep) -> CloudStatusOut:
    """Whether Google Drive sync is set up and connected here, and when it last ran."""
    return _status(service.status())


@router.get("/devices")
def list_cloud_devices(service: CloudServiceDep) -> list[CloudDeviceOut]:
    """The devices that keep a file in Google Drive (asks Google)."""
    return [_device(d) for d in service.devices()]


@router.post("/connect")
def connect_cloud(
    _: Confirm, service: CloudServiceDep, request: Request, auth: AuthDep, client: ClientHostDep
) -> CloudConnectOut:
    """Starts signing in to Google Drive: open ``auth_url`` in a browser (this PC only)."""
    auth.require_local(client)
    redirect_uri = str(request.url_for(CALLBACK))
    url = service.start_sign_in(redirect_uri)
    return CloudConnectOut(auth_url=url, status=_status(service.status()))


@router.get("/callback", name=CALLBACK, include_in_schema=False)
def cloud_callback(
    service: CloudServiceDep,
    state: str = "",
    code: str | None = None,
    error: str | None = None,
) -> HTMLResponse:
    """Where Google sends the browser back after signing in.

    A GET because Google redirects here; the one-time ``state`` from the
    sign-in PlanBox started is what keeps other sites from using it.
    """
    try:
        service.finish_sign_in(state, code, error)
    except DomainError as exc:
        return _page("Not connected", exc.detail, status=400)
    return _page(
        "Connected to Google Drive",
        "PlanBox can now sync through Google Drive. Close this tab and go back to PlanBox.",
    )


@router.post("/disconnect")
def disconnect_cloud(_: Confirm, service: CloudServiceDep) -> CloudStatusOut:
    """Signs this device out of Google Drive (the files there stay)."""
    return _status(service.sign_out())


@router.post("/upload")
def upload_cloud(_: Confirm, service: CloudServiceDep) -> CloudUploadOut:
    """Replaces this device's file in Google Drive with a fresh export."""
    return _upload(service.upload())


@router.post("/download")
def download_cloud(_: Confirm, service: CloudServiceDep) -> CloudDownloadOut:
    """Merges the other devices' files into this database (newer versions win)."""
    return _download(service.download())


@router.post("/sync")
def sync_cloud(_: Confirm, service: CloudServiceDep) -> CloudSyncOut:
    """Merges the other devices' files, then uploads this device's."""
    download, upload = service.sync()
    return CloudSyncOut(download=_download(download), upload=_upload(upload))


def _page(title: str, message: str, status: int = 200) -> HTMLResponse:
    body = (
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width, initial-scale=1'>"
        f"<title>PlanBox: {html.escape(title)}</title>"
        "<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:15vh auto;"
        "padding:0 1rem;color:#1f2328;background:#fafafa}"
        "@media(prefers-color-scheme:dark){body{color:#e6e6e6;background:#161616}}</style>"
        f"</head><body><h1>{html.escape(title)}</h1><p>{html.escape(message)}</p></body></html>"
    )
    return HTMLResponse(body, status_code=status, headers={"Cache-Control": "no-store"})
