from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import json

from app.database import get_db, Bin, User
from app.schemas import BinCreate, BinUpdate, BinResponse
from app.auth import verify_api_key
from app.utils import generate_bin_id

router = APIRouter(prefix="/bins", tags=["bins"])

# API: Create Bin
@router.post("/", response_model=BinResponse, status_code=201)
async def create_bin(
    bin_data: BinCreate,
    user: User = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """
    Create a new bin with JSON data.
    Requires valid API key in X-API-Key header.
    """
    # Generate unique bin ID
    bin_id = generate_bin_id()

    # Check if ID already exists (very unlikely, but let's be safe)
    while db.query(Bin).filter(Bin.id == bin_id).first():
        bin_id = generate_bin_id()

    # Create bin
    new_bin = Bin(
        id=bin_id,
        api_key=user.api_key,
        json_data=json.dumps(bin_data.json_data),
        is_public=bin_data.is_public
    )

    db.add(new_bin)
    db.commit()
    db.refresh(new_bin)

    return BinResponse(
        id=new_bin.id,
        json_data=json.loads(new_bin.json_data),
        is_public=new_bin.is_public,
        created_at=new_bin.created_at,
        updated_at=new_bin.updated_at
    )

# API: Get Bin
@router.get("/{bin_id}", response_model=BinResponse)
async def get_bin(
    bin_id: str,
    user: User = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """
    Retrieve a bin by ID.
    - Must own the bin OR bin must be public
    - Requires valid API key in X-API-Key header
    """
    bin = db.query(Bin).filter(Bin.id == bin_id).first()

    if not bin:
        raise HTTPException(status_code=404, detail="Bin not found")

    # Check access: must be owner OR bin must be public
    if bin.api_key != user.api_key and not bin.is_public:
        raise HTTPException(status_code=403, detail="Access denied")

    return BinResponse(
        id=bin.id,
        json_data=json.loads(bin.json_data),
        is_public=bin.is_public,
        created_at=bin.created_at,
        updated_at=bin.updated_at
    )

# API: Update Bin
@router.put("/{bin_id}", response_model=BinResponse)
async def update_bin(
    bin_id: str,
    bin_update: BinUpdate,
    user: User = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """
    Update a bin's JSON data and/or public status.
    Must own the bin.
    """
    bin = db.query(Bin).filter(Bin.id == bin_id).first()

    if not bin:
        raise HTTPException(status_code=404, detail="Bin not found")

    # Must be owner to update
    if bin.api_key != user.api_key:
        raise HTTPException(status_code=403, detail="Access denied")

    # Update fields if provided
    if bin_update.json_data is not None:
        bin.json_data = json.dumps(bin_update.json_data)

    if bin_update.is_public is not None:
        bin.is_public = bin_update.is_public

    db.commit()
    db.refresh(bin)

    return BinResponse(
        id=bin.id,
        json_data=json.loads(bin.json_data),
        is_public=bin.is_public,
        created_at=bin.created_at,
        updated_at=bin.updated_at
    )

# API: Delete Bin
@router.delete("/{bin_id}", status_code=204)
async def delete_bin(
    bin_id: str,
    user: User = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """
    Delete a bin.
    Must own the bin.
    """
    bin = db.query(Bin).filter(Bin.id == bin_id).first()

    if not bin:
        raise HTTPException(status_code=404, detail="Bin not found")

    # Must be owner to delete
    if bin.api_key != user.api_key:
        raise HTTPException(status_code=403, detail="Access denied")

    db.delete(bin)
    db.commit()

    return None
