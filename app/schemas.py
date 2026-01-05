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
    version: int  # Current version number
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class BinVersionResponse(BaseModel):
    id: str
    bin_id: str  # Reference to parent bin
    json_data: dict
    version: int
    created_at: datetime

    class Config:
        from_attributes = True

class BinWithVersionsResponse(BaseModel):
    id: str
    json_data: dict
    is_public: bool
    version: int  # Current version
    created_at: datetime
    updated_at: datetime
    versions: list[BinVersionResponse] = []  # All historical versions

    class Config:
        from_attributes = True
