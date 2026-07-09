from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db, User
from app.schemas import APIKeyCreate, APIKeyResponse
from app.utils import generate_api_key, hash_api_key
from app.auth import verify_api_key

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


@router.delete("/revoke-key", status_code=204)
async def revoke_api_key(
    current_user: User = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """
    Revoke (delete) the current API key and associated user account.

    This will:
    - Delete the user account
    - Delete all associated workspaces
    - Delete all associated documents
    - Cannot be undone!

    Requires the API key to be provided in the X-API-Key header.
    """
    # Delete user (cascade will handle workspaces and documents)
    db.delete(current_user)
    db.commit()

    return None
