from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
import json

from app.database import get_db, Document, DocumentVersion, User, WorkspaceTemplate
from app.schemas import DocumentCreate, DocumentUpdate, DocumentResponse, DocumentVersionResponse, DocumentWithVersionsResponse
from app.auth import verify_api_key
from app.utils import generate_document_id
from app.template_validator import validate_json_against_schema

router = APIRouter(prefix="/document", tags=["documents"])


def validate_document_against_workspace_template(db: Session, workspace_id: str, json_data: dict) -> None:
    """
    Validate document JSON data against workspace template if it exists.
    Raises HTTPException if validation fails.
    """
    if not workspace_id:
        return  # No workspace, no validation needed

    template = db.query(WorkspaceTemplate).filter(
        WorkspaceTemplate.workspace_id == workspace_id
    ).first()

    if not template:
        return  # No template, no validation needed

    # Parse schema and validate
    schema = json.loads(template.json_schema)
    is_valid, error_message = validate_json_against_schema(json_data, schema)

    if not is_valid:
        raise HTTPException(
            status_code=400,
            detail=f"Document does not match workspace template: {error_message}"
        )


# API: Create Document
@router.post("", response_model=DocumentResponse, status_code=201)
async def create_document(
    document_data: DocumentCreate,
    user: User = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """
    Create a new document with JSON data.
    Requires valid API key in X-API-Key header.
    If workspace_id is provided, validates against workspace template if it exists.
    """
    # Validate against workspace template if workspace is specified
    if document_data.workspace_id:
        validate_document_against_workspace_template(
            db, document_data.workspace_id, document_data.json_data
        )

    # Generate unique document ID
    document_id = generate_document_id()

    # Check if ID already exists (very unlikely, but let's be safe)
    while db.query(Document).filter(Document.id == document_id).first():
        document_id = generate_document_id()

    # Create document with version 1
    new_document = Document(
        id=document_id,
        user_id=user.id,
        workspace_id=document_data.workspace_id,
        json_data=json.dumps(document_data.json_data),
        is_public=document_data.is_public,
        version=1
    )

    db.add(new_document)
    db.commit()
    db.refresh(new_document)

    return DocumentResponse(
        id=new_document.id,
        json_data=json.loads(new_document.json_data),
        is_public=new_document.is_public,
        version=new_document.version,
        created_at=new_document.created_at,
        updated_at=new_document.updated_at
    )

# API: Get Document (latest version)
@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(
    document_id: str,
    db: Session = Depends(get_db),
    x_api_key: str = Header(None, alias="X-API-Key")
):
    """
    Retrieve a document by ID.
    - Public documents: No authentication required
    - Private documents: Must own the document (requires valid API key)
    """
    document = db.query(Document).filter(Document.id == document_id).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # If document is public, allow access without authentication
    if document.is_public:
        return DocumentResponse(
            id=document.id,
            json_data=json.loads(document.json_data),
            is_public=document.is_public,
            version=document.version,
            created_at=document.created_at,
            updated_at=document.updated_at
        )

    # For private documents, require authentication
    if not x_api_key:
        raise HTTPException(status_code=401, detail="API key required for private documents")

    # Verify the API key
    from app.utils import hash_api_key
    api_key_hash = hash_api_key(x_api_key)
    user = db.query(User).filter(User.api_key_hash == api_key_hash).first()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid API key")

    # Check if user owns the document
    if document.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    return DocumentResponse(
        id=document.id,
        json_data=json.loads(document.json_data),
        is_public=document.is_public,
        version=document.version,
        created_at=document.created_at,
        updated_at=document.updated_at
    )

# API: Update Document (Full Replacement)
@router.put("/{document_id}", response_model=DocumentResponse)
async def update_document(
    document_id: str,
    document_update: DocumentUpdate,
    user: User = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """
    Fully replace a document's JSON data and/or public status.
    Must own the document.
    """
    document = db.query(Document).filter(Document.id == document_id).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Must be owner to update
    if document.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Validate against workspace template if document is in a workspace
    if document_update.json_data is not None and document.workspace_id:
        validate_document_against_workspace_template(
            db, document.workspace_id, document_update.json_data
        )

    # Save current version to history before updating
    if document_update.json_data is not None:
        version_snapshot = DocumentVersion(
            document_id=document.id,
            json_data=document.json_data,
            version=document.version
        )
        db.add(version_snapshot)

        # Update document with new data and increment version
        document.json_data = json.dumps(document_update.json_data)
        document.version += 1

    if document_update.is_public is not None:
        document.is_public = document_update.is_public

    db.commit()
    db.refresh(document)

    return DocumentResponse(
        id=document.id,
        json_data=json.loads(document.json_data),
        is_public=document.is_public,
        version=document.version,
        created_at=document.created_at,
        updated_at=document.updated_at
    )

# API: Patch Document (Partial Update)
@router.patch("/{document_id}", response_model=DocumentResponse)
async def patch_document(
    document_id: str,
    document_update: DocumentUpdate,
    user: User = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """
    Partially update a document's JSON data (merges with existing data).
    Must own the document.
    Validates merged result against workspace template if applicable.
    """
    document = db.query(Document).filter(Document.id == document_id).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Must be owner to update
    if document.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Save current version to history and merge JSON data if provided (partial update)
    if document_update.json_data is not None:
        existing_data = json.loads(document.json_data)
        merged_data = {**existing_data, **document_update.json_data}

        # Validate merged data against workspace template if document is in a workspace
        if document.workspace_id:
            validate_document_against_workspace_template(
                db, document.workspace_id, merged_data
            )

        # Save version snapshot
        version_snapshot = DocumentVersion(
            document_id=document.id,
            json_data=document.json_data,
            version=document.version
        )
        db.add(version_snapshot)

        document.json_data = json.dumps(merged_data)
        document.version += 1

    if document_update.is_public is not None:
        document.is_public = document_update.is_public

    db.commit()
    db.refresh(document)

    return DocumentResponse(
        id=document.id,
        json_data=json.loads(document.json_data),
        is_public=document.is_public,
        version=document.version,
        created_at=document.created_at,
        updated_at=document.updated_at
    )

# API: Delete Document
@router.delete("/{document_id}", status_code=204)
async def delete_document(
    document_id: str,
    user: User = Depends(verify_api_key),
    db: Session = Depends(get_db)
):
    """
    Delete a document.
    Must own the document.
    """
    document = db.query(Document).filter(Document.id == document_id).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Must be owner to delete
    if document.user_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    db.delete(document)
    db.commit()

    return None

# API: Get All Versions
@router.get("/{document_id}/versions", response_model=list[DocumentVersionResponse])
async def get_document_versions(
    document_id: str,
    db: Session = Depends(get_db),
    x_api_key: str = Header(None, alias="X-API-Key")
):
    """
    Get all version history for a document.
    - Public documents: No authentication required
    - Private documents: Must own the document
    """
    document = db.query(Document).filter(Document.id == document_id).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Check authentication for private documents
    if not document.is_public:
        if not x_api_key:
            raise HTTPException(status_code=401, detail="API key required for private documents")

        from app.utils import hash_api_key
        api_key_hash = hash_api_key(x_api_key)
        user = db.query(User).filter(User.api_key_hash == api_key_hash).first()

        if not user or document.user_id != user.id:
            raise HTTPException(status_code=403, detail="Access denied")

    # Get all versions
    versions = db.query(DocumentVersion).filter(DocumentVersion.document_id == document_id).order_by(DocumentVersion.version).all()

    return [
        DocumentVersionResponse(
            id=v.id,
            document_id=v.document_id,
            json_data=json.loads(v.json_data),
            version=v.version,
            created_at=v.created_at
        )
        for v in versions
    ]

# API: Get Specific Version
@router.get("/{document_id}/v{version}", response_model=DocumentVersionResponse)
async def get_document_version(
    document_id: str,
    version: int,
    db: Session = Depends(get_db),
    x_api_key: str = Header(None, alias="X-API-Key")
):
    """
    Get a specific version of a document.
    - Public documents: No authentication required
    - Private documents: Must own the document
    """
    document = db.query(Document).filter(Document.id == document_id).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Check authentication for private documents
    if not document.is_public:
        if not x_api_key:
            raise HTTPException(status_code=401, detail="API key required for private documents")

        from app.utils import hash_api_key
        api_key_hash = hash_api_key(x_api_key)
        user = db.query(User).filter(User.api_key_hash == api_key_hash).first()

        if not user or document.user_id != user.id:
            raise HTTPException(status_code=403, detail="Access denied")

    # Get specific version
    document_version = db.query(DocumentVersion).filter(
        DocumentVersion.document_id == document_id,
        DocumentVersion.version == version
    ).first()

    if not document_version:
        raise HTTPException(status_code=404, detail=f"Version {version} not found")

    return DocumentVersionResponse(
        id=document_version.id,
        document_id=document_version.document_id,
        json_data=json.loads(document_version.json_data),
        version=document_version.version,
        created_at=document_version.created_at
    )
