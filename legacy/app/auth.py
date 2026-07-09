from fastapi import Header, HTTPException, Depends
from sqlalchemy.orm import Session
from app.database import get_db, User
from app.utils import hash_api_key

async def verify_api_key(
    x_api_key: str = Header(..., description="API Key for authentication"),
    db: Session = Depends(get_db)
) -> User:
    """
    Verify API key from header and return the associated user.
    Raises 401 if invalid.
    """
    if not x_api_key:
        raise HTTPException(status_code=401, detail="API key is required")

    # Hash the provided API key
    api_key_hash = hash_api_key(x_api_key)

    # Look up user by hashed API key
    user = db.query(User).filter(User.api_key_hash == api_key_hash).first()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid API key")

    return user
