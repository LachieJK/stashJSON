from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db, User
from app.schemas import APIKeyCreate, APIKeyResponse
from app.utils import generate_api_key, hash_api_key

router = APIRouter(prefix="/auth", tags=["authentication"])

@router.post("/generate-key", response_model=APIKeyResponse, status_code=201)
async def generate_new_api_key(
    key_request: APIKeyCreate = None,
    db: Session = Depends(get_db)
):
    """
    Generate a new API key for a user.

    **IMPORTANT**: Store this API key securely! It will only be shown once.

    Optionally provide an email for recovery purposes (recommended but not required).
    """
    # Generate API key
    api_key = generate_api_key()
    api_key_hash = hash_api_key(api_key)

    # Create user record (only store the hash, never the plain key)
    new_user = User(
        api_key_hash=api_key_hash,
        email=key_request.email if key_request else None
    )

    db.add(new_user)
    db.commit()

    return APIKeyResponse(
        api_key=api_key,
        message="API key generated successfully. Store this securely - it won't be shown again!"
    )
