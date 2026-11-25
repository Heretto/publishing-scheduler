"""Shared SlowAPI rate-limiter instance.

Import `limiter` wherever route-level rate limiting is needed, and import
`setup_limiter` to wire the limiter into the FastAPI app.
"""

from starlette.requests import Request

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware


def _client_ip(request: Request) -> str:
    """Return the real client IP, peeling back one X-Forwarded-For hop.

    When the app runs behind a reverse proxy (nginx, load balancer) the TCP
    peer is the proxy, not the browser.  X-Forwarded-For carries the original
    IP as its first value.  We trust only the leftmost entry — anything beyond
    that can be forged by the client — and fall back to the TCP peer when the
    header is absent (direct connections, local dev).

    In production, restrict which IPs may set X-Forwarded-For by configuring
    the reverse proxy to strip the header from untrusted clients before it
    reaches this service.
    """
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


limiter = Limiter(key_func=_client_ip)


def setup_limiter(app):
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)
