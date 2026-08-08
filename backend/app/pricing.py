UNIT_COST: dict[str, float] = {
    "followers": 0.010, "following": 0.010, "user": 0.010,
    "post": 0.005, "engager": 0.010,      # liking_users / retweeted_by return users
    "post_create": 0.015, "post_create_url": 0.200,
    "grok_card": 0.0,                      # negligible; tracked at 0 for v1
}

def cost_of(resource: str, count: int) -> float:
    return round(UNIT_COST.get(resource, 0.0) * count, 6)
