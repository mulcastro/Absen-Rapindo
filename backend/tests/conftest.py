import base64
import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings, get_settings
from app.db import Base, get_db
from app.main import app


@pytest.fixture(scope="session")
def postgres_url() -> str:
    value = os.getenv("TEST_DATABASE_URL", "")
    if not value:
        pytest.skip("TEST_DATABASE_URL PostgreSQL belum tersedia")
    url = make_url(value)
    if not url.drivername.startswith("postgresql") or not (url.database or "").endswith("_test"):
        pytest.fail("TEST_DATABASE_URL wajib PostgreSQL dan nama database harus berakhir _test")
    return value


@pytest.fixture()
def db(postgres_url: str) -> Generator[Session, None, None]:
    engine = create_engine(postgres_url)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    with factory() as session:
        yield session
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture()
def client(db: Session):
    def override_db():
        yield db

    settings = Settings(
        app_env="test",
        database_url="postgresql+psycopg://unused",
        session_secret="test-secret-that-is-at-least-32-characters",
        cookie_secure=False,
        trusted_origins="http://testserver",
        max_request_bytes=1_000_000,
        encryption_key_base64=base64.b64encode(b"t" * 32).decode(),
        encryption_key_id="test-key",
    )
    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
