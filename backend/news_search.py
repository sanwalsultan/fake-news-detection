
import asyncio
import time

import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

GDELT_API = "https://api.gdeltproject.org/api/v2/doc/doc"

# Respect GDELT's request limit
REQUEST_INTERVAL = 7.0

# Cache successful results for 10 minutes
CACHE_DURATION = 600

_cache = {}
_last_request = 0.0
_request_lock = asyncio.Lock()


@router.get("/search-news")
async def search_news(
    query: str = Query(min_length=3, max_length=200)
):
    global _last_request

    query = " ".join(query.split())
    cache_key = query.lower()

    if len(query) < 3:
        raise HTTPException(
            status_code=400,
            detail="Search query is too short."
        )

    async with _request_lock:

        # Return cached results when available
        cached = _cache.get(cache_key)

        if cached:
            age = time.monotonic() - cached["timestamp"]

            if age < CACHE_DURATION:
                return cached["result"]

        # Limit the frequency of outgoing requests
        elapsed = time.monotonic() - _last_request
        wait_time = max(0, REQUEST_INTERVAL - elapsed)

        if wait_time > 0:
            await asyncio.sleep(wait_time)

        params = {
            "query": query,
            "mode": "ArtList",
            "maxrecords": 5,
            "format": "json",
            "timespan": "3m"
        }

        _last_request = time.monotonic()

        try:
            async with httpx.AsyncClient(
                timeout=30,
                follow_redirects=True
            ) as client:

                response = await client.get(
                    GDELT_API,
                    params=params
                )

            response_text = response.text.lower()

            # GDELT may return a text rate-limit warning
            rate_limited = (
                response.status_code == 429
                or "limit requests to one every 5 seconds"
                in response_text
            )

            if rate_limited:
                raise HTTPException(
                    status_code=429,
                    detail=(
                        "GDELT is rate-limiting requests. "
                        "Please try again shortly."
                    )
                )

            response.raise_for_status()

            try:
                data = response.json()
            except ValueError:
                raise HTTPException(
                    status_code=502,
                    detail=(
                        "GDELT returned a non-JSON response."
                    )
                )

        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"External news service error: {exc}"
            )

        articles = []

        for item in data.get("articles", []):
            articles.append({
                "title": item.get("title"),
                "source": item.get("domain"),
                "url": item.get("url"),
                "date": item.get("seendate")
            })

        result = {
            "query": query,
            "articles": articles,
            "total": len(articles),
            "verification_status": "NOT_VERIFIED",
            "message": (
                "These are related articles, "
                "not verified facts."
            )
        }

        # Prevent unlimited cache growth
        if len(_cache) >= 200:
            _cache.clear()

        _cache[cache_key] = {
            "timestamp": time.monotonic(),
            "result": result
        }

        return result
