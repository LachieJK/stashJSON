from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
import json

from app.database import get_db, Bin, BinVersion, User
from app.schemas import BinCreate, BinUpdate, BinResponse, BinVersionResponse, BinWithVersionsResponse
from app.auth import verify_api_key
from app.utils import generate_bin_id

router = APIRouter(prefix="/bins", tags=["bins"])

# API: Create Bin
@router.post("/bin", response_model=BinResponse, status_code=201)
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

    # Create bin with version 1
    new_bin = Bin(
        id=bin_id,
        user_id=user.id,
        json_data=json.dumps(bin_data.json_data),
        is_public=bin_data.is_public,
        version=1
    )

    db.add(new_bin)
    db.commit()
    db.refresh(new_bin)

    return BinResponse(
        id=new_bin.id,
        json_data=json.loads(new_bin.json_data),
        is_public=new_bin.is_public,
        version=new_bin.version,
        created_at=new_bin.created_at,
        updated_at=new_bin.updated_at
    )

# API: Get Bin (latest version)
@router.get("/bin/{bin_id}", response_model=BinResponse)
async def get_bin(
    bin_id: str,
    db: Session = Depends(get_db),
    x_api_key: str = Header(None, alias="X-API-Key")
):
    """
    Retrieve a bin by ID.
    - Public bins: No authentication required
    - Private bins: Must own the bin (requires valid API key)
    """
    bin = db.query(Bin).filter(Bin.id == bin_id).first()

    if not bin:
        raise HTTPException(status_code=404, detail="Bin not found")

    # If bin is public, allow access without authentication
    if bin.is_public:
        return BinResponse(
            id=bin.id,
            json_data=json.loads(bin.json_data),
            is_public=bin.is_public,
            version=bin.version,
            created_at=bin.created_at,
            updated_at=bin.updated_at
        )

    # For private bins, require authentication
    if not x_api_key:
        raise HTTPException(status_code=401, detail="API key required for private bins")

    # Verify the API key
    from app.utils import hash_api_key
    api_key_hash = hash_api_key(x_api_key)
    user = db.query(User).filter(User.api_key_hash == api_key_hash).first()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid API key")

    # Check if user owns the bin
    if bin.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    return BinResponse(
        id=bin.id,
        json_data=json.loads(bin.json_data),
        is_public=bin.is_public,
        version=bin.version,
        created_at=bin.created_at,
        updated_at=bin.updated_at
    )

# API: Update Bin (Full Replacement)
@router.put("/bin/{bin_id}", response_model=BinResponse)
async def update_bin(
    bin_id: str,
    bin_update: BinUpdate,
    user: User = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """
    Fully replace a bin's JSON data and/or public status.
    Must own the bin.
    """
    bin = db.query(Bin).filter(Bin.id == bin_id).first()

    if not bin:
        raise HTTPException(status_code=404, detail="Bin not found")

    # Must be owner to update
    if bin.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Save current version to history before updating
    if bin_update.json_data is not None:
        version_snapshot = BinVersion(
            bin_id=bin.id,
            json_data=bin.json_data,
            version=bin.version
        )
        db.add(version_snapshot)

        # Update bin with new data and increment version
        bin.json_data = json.dumps(bin_update.json_data)
        bin.version += 1

    if bin_update.is_public is not None:
        bin.is_public = bin_update.is_public

    db.commit()
    db.refresh(bin)

    return BinResponse(
        id=bin.id,
        json_data=json.loads(bin.json_data),
        is_public=bin.is_public,
        version=bin.version,
        created_at=bin.created_at,
        updated_at=bin.updated_at
    )

# API: Patch Bin (Partial Update)
@router.patch("/bin/{bin_id}", response_model=BinResponse)
async def patch_bin(
    bin_id: str,
    bin_update: BinUpdate,
    user: User = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """
    Partially update a bin's JSON data (merges with existing data).
    Must own the bin.
    """
    bin = db.query(Bin).filter(Bin.id == bin_id).first()

    if not bin:
        raise HTTPException(status_code=404, detail="Bin not found")

    # Must be owner to update
    if bin.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Save current version to history and merge JSON data if provided (partial update)
    if bin_update.json_data is not None:
        version_snapshot = BinVersion(
            bin_id=bin.id,
            json_data=bin.json_data,
            version=bin.version
        )
        db.add(version_snapshot)

        existing_data = json.loads(bin.json_data)
        existing_data.update(bin_update.json_data)
        bin.json_data = json.dumps(existing_data)
        bin.version += 1

    if bin_update.is_public is not None:
        bin.is_public = bin_update.is_public

    db.commit()
    db.refresh(bin)

    return BinResponse(
        id=bin.id,
        json_data=json.loads(bin.json_data),
        is_public=bin.is_public,
        version=bin.version,
        created_at=bin.created_at,
        updated_at=bin.updated_at
    )

# API: Delete Bin
@router.delete("/bin/{bin_id}", status_code=204)
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
    if bin.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    db.delete(bin)
    db.commit()

    return None

# API: Get All Versions
@router.get("/bin/{bin_id}/versions", response_model=list[BinVersionResponse])
async def get_bin_versions(
    bin_id: str,
    db: Session = Depends(get_db),
    x_api_key: str = Header(None, alias="X-API-Key")
):
    """
    Get all version history for a bin.
    - Public bins: No authentication required
    - Private bins: Must own the bin
    """
    bin = db.query(Bin).filter(Bin.id == bin_id).first()

    if not bin:
        raise HTTPException(status_code=404, detail="Bin not found")

    # Check authentication for private bins
    if not bin.is_public:
        if not x_api_key:
            raise HTTPException(status_code=401, detail="API key required for private bins")

        from app.utils import hash_api_key
        api_key_hash = hash_api_key(x_api_key)
        user = db.query(User).filter(User.api_key_hash == api_key_hash).first()

        if not user or bin.user_id != user.id:
            raise HTTPException(status_code=403, detail="Access denied")

    # Get all versions
    versions = db.query(BinVersion).filter(BinVersion.bin_id == bin_id).order_by(BinVersion.version).all()

    return [
        BinVersionResponse(
            id=v.id,
            bin_id=v.bin_id,
            json_data=json.loads(v.json_data),
            version=v.version,
            created_at=v.created_at
        )
        for v in versions
    ]

# API: Get Specific Version
@router.get("/bin/{bin_id}/v{version}", response_model=BinVersionResponse)
async def get_bin_version(
    bin_id: str,
    version: int,
    db: Session = Depends(get_db),
    x_api_key: str = Header(None, alias="X-API-Key")
):
    """
    Get a specific version of a bin.
    - Public bins: No authentication required
    - Private bins: Must own the bin
    """
    bin = db.query(Bin).filter(Bin.id == bin_id).first()

    if not bin:
        raise HTTPException(status_code=404, detail="Bin not found")

    # Check authentication for private bins
    if not bin.is_public:
        if not x_api_key:
            raise HTTPException(status_code=401, detail="API key required for private bins")

        from app.utils import hash_api_key
        api_key_hash = hash_api_key(x_api_key)
        user = db.query(User).filter(User.api_key_hash == api_key_hash).first()

        if not user or bin.user_id != user.id:
            raise HTTPException(status_code=403, detail="Access denied")

    # Get specific version
    bin_version = db.query(BinVersion).filter(
        BinVersion.bin_id == bin_id,
        BinVersion.version == version
    ).first()

    if not bin_version:
        raise HTTPException(status_code=404, detail=f"Version {version} not found")

    return BinVersionResponse(
        id=bin_version.id,
        bin_id=bin_version.bin_id,
        json_data=json.loads(bin_version.json_data),
        version=bin_version.version,
        created_at=bin_version.created_at
    )
