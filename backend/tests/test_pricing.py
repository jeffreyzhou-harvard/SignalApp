from app.pricing import cost_of, UNIT_COST

def test_follower_cost():
    assert cost_of("followers", 100) == 1.00

def test_post_read_cost():
    assert round(cost_of("post", 10), 4) == 0.05

def test_unknown_resource_is_free():
    assert cost_of("mystery", 5) == 0.0
