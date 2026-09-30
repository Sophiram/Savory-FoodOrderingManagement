import os
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import List


class Settings(BaseSettings):
    # App
    app_name: str = "Savory Food Ordering API"
    environment: str = "development"
    debug: bool = True
    port: int = 8000

    # Supabase connection
    supabase_url: str = "https://wsxjdgopuddumunewrzy.supabase.co"
    supabase_service_role_key: str = ""
    supabase_anon_key: str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndzeGpkZ29wdWRkdW11bmV3cnp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDkwNzAsImV4cCI6MjEwNTQ4NTA3MH0.CFpi8QJidQfeKAnBgXbgPv8bYWyA8hbv9qeD_UQVgj4"
    supabase_jwt_secret: str = ""

    # Database Mode: "auto", "supabase", or "sqlite"
    # In "auto", if service role key is available and valid it uses Supabase, otherwise falls back to SQLite or anon Supabase
    db_mode: str = "auto"
    sqlite_db_path: str = "savory.db"

    # KHQR / Bakong payment
    khqr_base_url: str = "https://api-bakong.nbc.gov.kh"
    khqr_token: str = ""
    khqr_account: str = "sorn_sophiram@bkrt"
    khqr_merchant_name: str = "SAVORY RESTAURANT"
    bakong_store_label: str = "Savory"
    khqr_usd_to_khr_rate: int = 4100

    # Notifications
    notification_bot_token: str = ""
    notification_chat_id: str = ""
    discord_webhook_url: str = ""

    # CORS
    cors_origins: str = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def has_valid_service_role_key(self) -> bool:
        k = self.supabase_service_role_key.strip()
        return bool(k and "your-service-role" not in k and len(k) > 20)


@lru_cache
def get_settings() -> Settings:
    return Settings()
