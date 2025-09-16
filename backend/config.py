from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    # Security
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    # Database
    database_url: str = "mysql+pymysql://root:rootpassword@db:3306/ocrdb"
    
    # Application
    app_name: str = "OCR Document Processing API"
    app_version: str = "1.0.0"
    debug: bool = False
    
    # Logging
    log_level: str = "INFO"
    log_file: Optional[str] = None
    
    # Rate limiting
    rate_limit_per_minute: int = 10
    
    # OCR Settings
    max_file_size_mb: int = 10
    supported_languages: str = "vie+eng"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

# Global settings instance
settings = Settings()