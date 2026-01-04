from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

# API Key Generation
class APIKeyCreate(BaseModel):
    email: Optional[str] = None

class APIKeyResponse(BaseModel):
    api_key: str
    message: str

# Bin Models
class BinCreate(BaseModel):
    json_data: dict
    is_public: bool = False

class BinUpdate(BaseModel):
    json_data: Optional[dict] = None
    is_public: Optional[bool] = None

class BinResponse(BaseModel):
    id: str
    json_data: dict
    is_public: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
