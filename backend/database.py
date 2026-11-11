"""SQLite locally; PostgreSQL when DATABASE_URL is provided (e.g. Supabase)."""
import os
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import DateTime, Float, Integer, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

ROOT = Path(__file__).resolve().parent
DEFAULT_DATABASE_URL = f"sqlite:///{(ROOT / 'predictions.db').as_posix()}"
DATABASE_URL = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)

# Accept standard postgres URL formats and use the installed psycopg v3 driver.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len("postgres://"):]
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len("postgresql://"):]

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite:") else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


class Prediction(Base):
    __tablename__ = "predictions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    preview: Mapped[str] = mapped_column(String(240))
    label: Mapped[str] = mapped_column(String(8), index=True)
    score: Mapped[float] = mapped_column(Float)


def initialize_database():
    Base.metadata.create_all(bind=engine)
