"""Bound JSON before validation; never echo untrusted request bodies in errors."""

import json
import math

from starlette.responses import JSONResponse

MAX_BODY_BYTES = 262144


def reject_constant(_value):
    raise ValueError("JSON sayıları sonlu olmalı.")


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("JSON içinde yinelenen alan var.")
        result[key] = value
    return result


class JsonBounds:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        original_send = send

        async def private_response(message):
            if message["type"] == "http.response.start":
                message = {
                    **message,
                    "headers": [
                        (key, value)
                        for key, value in message.get("headers", [])
                        if key.lower() != b"cache-control"
                    ]
                    + [(b"cache-control", b"no-store")],
                }
            await original_send(message)

        if scope["type"] == "http":
            send = private_response
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH"}:
            return await self.app(scope, receive, send)

        async def fail(status, detail):
            await JSONResponse({"detail": detail}, status_code=status)(
                scope, receive, send
            )

        headers = dict(scope.get("headers", []))
        if (
            headers.get(b"content-type", b"").split(b";")[0].strip().lower()
            != b"application/json"
        ):
            return await fail(415, "İstek application/json biçiminde olmalı.")
        try:
            length = int(headers.get(b"content-length", b"0"))
            if length < 0:
                return await fail(400, "Geçersiz istek uzunluğu.")
        except ValueError:
            return await fail(400, "Geçersiz istek uzunluğu.")
        if length > MAX_BODY_BYTES:
            return await fail(413, "Proje isteği en fazla 256 KiB olabilir.")
        parts, size = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > MAX_BODY_BYTES:
                return await fail(413, "Proje isteği en fazla 256 KiB olabilir.")
            parts.append(chunk)
            if not message.get("more_body", False):
                break
        body = b"".join(parts)
        if body:
            try:
                parsed = json.loads(
                    body,
                    parse_constant=reject_constant,
                    object_pairs_hook=unique_object,
                )
                stack = [(parsed, 0)]
                nodes = 0
                while stack:
                    value, depth = stack.pop()
                    nodes += 1
                    if depth > 32 or nodes > 20000:
                        raise ValueError("JSON yapısı çok karmaşık.")
                    if isinstance(value, float) and not math.isfinite(value):
                        raise ValueError("JSON sayıları sonlu olmalı.")
                    if isinstance(value, (list, dict)):
                        stack.extend(
                            (item, depth + 1)
                            for item in (
                                value.values() if isinstance(value, dict) else value
                            )
                        )
            except (ValueError, UnicodeError, RecursionError):
                return await fail(
                    422,
                    "Geçersiz JSON: sonlu sayılar, benzersiz alanlar ve sınırlı iç içe yapı gerekli.",
                )
        consumed = False

        async def replay():
            nonlocal consumed
            if consumed:
                return await receive()
            consumed = True
            return {"type": "http.request", "body": body, "more_body": False}

        return await self.app(scope, replay, send)
