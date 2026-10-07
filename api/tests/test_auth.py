from tests.conftest import PASSWORD, make_client, register


def test_register_sets_httponly_session_and_returns_owner_membership(client):
    r = client.post(
        "/api/v1/auth/register",
        json={
            "email": "Fahim@Example.com",
            "name": "Fahim Abrar",
            "password": PASSWORD,
            "organization_name": "Fahim's lab",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["user"]["email"] == "fahim@example.com"
    assert body["organizations"] == [
        {"slug": "fahim-s-lab", "name": "Fahim's lab", "role": "owner"}
    ]
    cookie = r.headers["set-cookie"]
    assert "kx_session=" in cookie and "HttpOnly" in cookie and "SameSite=lax" in cookie
    assert "password" not in r.text


def test_short_password_is_rejected(client):
    r = client.post(
        "/api/v1/auth/register",
        json={"email": "a@example.com", "name": "A", "password": "short", "organization_name": "A"},
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_request"


def test_duplicate_email_is_rejected(client):
    register(client)
    other = make_client()
    r = other.post(
        "/api/v1/auth/register",
        json={
            "email": "FAHIM@example.com",
            "name": "X",
            "password": PASSWORD,
            "organization_name": "X",
        },
    )
    assert r.status_code == 409


def test_login_failure_does_not_reveal_whether_account_exists(client):
    register(client)
    anon = make_client()
    wrong = anon.post(
        "/api/v1/auth/login", json={"email": "fahim@example.com", "password": "nope-nope-nope"}
    )
    unknown = anon.post(
        "/api/v1/auth/login", json={"email": "ghost@example.com", "password": "nope-nope-nope"}
    )
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_login_me_logout_cycle(client):
    register(client)
    c = make_client()
    assert c.get("/api/v1/auth/me").status_code == 401
    assert (
        c.post(
            "/api/v1/auth/login", json={"email": "fahim@example.com", "password": PASSWORD}
        ).status_code
        == 200
    )
    assert c.get("/api/v1/auth/me").json()["user"]["name"] == "Fahim Abrar"
    assert c.post("/api/v1/auth/logout").status_code == 204
    assert c.get("/api/v1/auth/me").status_code == 401


def test_logout_revokes_server_side_even_if_cookie_is_replayed(client):
    register(client)
    token = client.cookies.get("kx_session")
    client.post("/api/v1/auth/logout")
    replay = make_client()
    replay.cookies.set("kx_session", token)
    assert replay.get("/api/v1/auth/me").status_code == 401


def test_unsafe_requests_require_csrf_token(client):
    register(client)
    r = client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": "forged"})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "csrf_failed"


def test_cross_origin_post_is_refused(client):
    register(client)
    r = client.post("/api/v1/auth/logout", headers={"Origin": "https://evil.example"})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "bad_origin"


def test_sessions_can_be_listed_and_revoked(client):
    register(client)
    other = make_client()
    other.post("/api/v1/auth/login", json={"email": "fahim@example.com", "password": PASSWORD})
    sessions = client.get("/api/v1/auth/sessions").json()
    assert len(sessions) == 2
    mine = [s for s in sessions if s["current"]]
    theirs = [s for s in sessions if not s["current"]]
    assert len(mine) == len(theirs) == 1
    assert client.delete(f"/api/v1/auth/sessions/{theirs[0]['id']}").status_code == 204
    assert other.get("/api/v1/auth/me").status_code == 401


def test_login_is_rate_limited(client):
    register(client)
    c = make_client()
    codes = [
        c.post(
            "/api/v1/auth/login", json={"email": "fahim@example.com", "password": "wrong-password"}
        ).status_code
        for _ in range(11)
    ]
    assert codes[:10] == [401] * 10
    assert codes[10] == 429


def test_security_headers_present(client):
    r = client.get("/api/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["cache-control"] == "no-store"
