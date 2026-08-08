from pydantic import BaseModel
from typing import Any


class RawUser(BaseModel):
    user_id: str
    fetched_at: str
    data: dict[str, Any]      # verbatim X user object


class RawTweet(BaseModel):
    tweet_id: str
    author_id: str
    fetched_at: str
    data: dict[str, Any]      # verbatim X tweet object
