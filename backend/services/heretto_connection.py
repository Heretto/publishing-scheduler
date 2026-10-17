"""The organization's Heretto connection — the account V2 talks to Heretto as.

A Heretto connection is a hop-core credential of type ``heretto`` (server URL,
username, API token), added under Credentials. Each organization uses its one
connection; if it has several, the first by name wins and a warning is logged.
There is no fallback to .env: without a connection, Heretto calls fail with
NO_CONNECTION_MESSAGE.
"""

import logging
from dataclasses import dataclass
from typing import Annotated
from urllib.parse import urlparse
from uuid import UUID

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from hop_core.agents.references import HERETTO_CREDENTIAL_TYPE, heretto_connections
from hop_core.api.dependencies import CurrentUserContext, get_current_active_user_with_org
from hop_core.core.security import decrypt_credentials
from hop_core.db import get_db
from hop_core.models.credential import Credential

from settings import get_settings

logger = logging.getLogger(__name__)

NO_CONNECTION_MESSAGE = "No Heretto connection. Add one under Credentials."


class NoHerettoConnection(Exception):
    """The organization has no usable Heretto connection."""


@dataclass(frozen=True)
class HerettoConnection:
    id: str
    name: str
    host: str
    username: str
    token: str

    @property
    def auth(self) -> tuple[str, str]:
        # Heretto takes HTTP Basic with the API token as the password.
        return (self.username, self.token)

    @property
    def org(self) -> str:
        """CCMS content-path org: HERETTO_ORG, else the host's first label."""
        return get_settings().heretto_org or self.host.split(".")[0]

    @property
    def api_base_url(self) -> str:
        return f"https://{self.host}/ezdnxtgen/api/v2"

    @property
    def ccms_base_url(self) -> str:
        return f"https://{self.host}/rest"

    @property
    def search_base_url(self) -> str:
        return f"https://{self.host}/ezdnxtgen/api"


def _host(server_url: str) -> str:
    """'https://acme.heretto.com/' → 'acme.heretto.com'."""
    url = server_url.strip()
    parsed = urlparse(url if "://" in url else f"https://{url}")
    return (parsed.hostname or "").lower()


def _from_credential(credential: Credential) -> HerettoConnection:
    try:
        payload = decrypt_credentials(credential.encrypted_data)
    except Exception as exc:
        raise NoHerettoConnection(
            f"The Heretto connection '{credential.name}' can't be read. Edit it under Credentials."
        ) from exc
    host = _host(str(payload.get("server_url") or ""))
    username = str(payload.get("username") or "")
    token = str(payload.get("token") or "")
    if not (host and username and token):
        raise NoHerettoConnection(
            f"The Heretto connection '{credential.name}' is incomplete. Edit it under Credentials."
        )
    return HerettoConnection(
        id=str(credential.id), name=credential.name, host=host, username=username, token=token,
    )


def get_heretto_connection(organization_id, db: Session) -> HerettoConnection:
    """The organization's Heretto connection, or raise NoHerettoConnection."""
    # Schedules store org_id as a string (models.UUIDType); hop-core's
    # Credential.organization_id column needs a UUID.
    if not isinstance(organization_id, UUID):
        organization_id = UUID(str(organization_id))
    credentials = heretto_connections(organization_id, db)  # ordered by name
    if not credentials:
        raise NoHerettoConnection(NO_CONNECTION_MESSAGE)
    if len(credentials) > 1:
        logger.warning(
            "Organization %s has %d Heretto connections; using '%s'",
            organization_id, len(credentials), credentials[0].name,
        )
    return _from_credential(credentials[0])


def all_heretto_connections(db: Session) -> list[HerettoConnection]:
    """Every organization's Heretto connection, skipping unreadable ones."""
    connections = []
    for credential in (
        db.query(Credential)
        .filter(Credential.type == HERETTO_CREDENTIAL_TYPE)
        .order_by(Credential.name)
        .all()
    ):
        try:
            connections.append(_from_credential(credential))
        except NoHerettoConnection as exc:
            logger.warning("Skipping Heretto connection %s: %s", credential.id, exc)
    return connections


def org_heretto_connection(
    ctx: Annotated[CurrentUserContext, Depends(get_current_active_user_with_org)],
    db: Annotated[Session, Depends(get_db)],
) -> HerettoConnection:
    """Route dependency: the caller's organization's connection, or 409."""
    try:
        return get_heretto_connection(ctx.organization_id, db)
    except NoHerettoConnection as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


Conn = Annotated[HerettoConnection, Depends(org_heretto_connection)]
