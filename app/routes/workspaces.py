from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db, Workspace, Document, User
from app.schemas import WorkspaceCreate, WorkspaceUpdate, WorkspaceResponse, DocumentResponse
from app.auth import verify_api_key

router = APIRouter(prefix="/workspace", tags=["workspaces"])

#API: Create Workspace
@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
def create_workspace(
    workspace: WorkspaceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_api_key)
):
    """
    Create a new workspace for organizing documents.
    """
    new_workspace = Workspace(
        name=workspace.name,
        user_id=current_user.id
    )

    db.add(new_workspace)
    db.commit()
    db.refresh(new_workspace)

    return WorkspaceResponse(
        id=new_workspace.id,
        name=new_workspace.name,
        created_at=new_workspace.created_at,
        updated_at=new_workspace.updated_at,
        document_count=0
    )


# API: List Workspaces owned by User
@router.get("", response_model=List[WorkspaceResponse])
def list_workspaces(
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_api_key)
):
    """
    List all workspaces for the authenticated user.
    """
    workspaces = db.query(Workspace).filter(Workspace.user_id == current_user.id).all()

    # Include document count for each workspace
    result = []
    for workspace in workspaces:
        document_count = db.query(Document).filter(Document.workspace_id == workspace.id).count()
        result.append(WorkspaceResponse(
            id=workspace.id,
            name=workspace.name,
            created_at=workspace.created_at,
            updated_at=workspace.updated_at,
            document_count=document_count
        ))

    return result


# API: Get Workspace by ID
@router.get("/{workspace_id}", response_model=WorkspaceResponse)
def get_workspace(
    workspace_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_api_key)
):
    """
    Get a specific workspace by ID.
    """
    workspace = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.user_id == current_user.id
    ).first()

    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    document_count = db.query(Document).filter(Document.workspace_id == workspace.id).count()

    return WorkspaceResponse(
        id=workspace.id,
        name=workspace.name,
        created_at=workspace.created_at,
        updated_at=workspace.updated_at,
        document_count=document_count
    )


# API: List all Documents in Workspace, limited to the first 25
@router.get("/{workspace_id}/documents", response_model=List[DocumentResponse])
def list_workspace_documents(
    workspace_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_api_key)
):
    """
    Fetch all documents inside a specific workspace.
    """
    # Verify workspace belongs to user
    workspace = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.user_id == current_user.id
    ).first()

    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    # Fetch the first 25 documents in the workspace, sorted by newest first
    documents = db.query(Document).filter(Document.workspace_id == workspace_id).order_by(Document.created_at.desc()).limit(25).all()

    workspace_docs = []
    for doc in documents:
        workspace_docs.append(
            DocumentResponse(
                id=doc.id,
                json_data=eval(doc.json_data),
                is_public=doc.is_public,
                version=doc.version,
                created_at=doc.created_at,
                updated_at=doc.updated_at
            )
        )

    return workspace_docs


# API: From the passed in Document ID, fetch the next 25 Documents in the Workspace
@router.get("/{workspace_id}/documents/{last_document_id}", response_model=List[DocumentResponse])
def get_next_documents(
    workspace_id: str,
    last_document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_api_key)
):
    """
    Fetch the next 25 documents in a workspace after the given document ID.
    """
    # Verify workspace belongs to user
    workspace = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.user_id == current_user.id
    ).first()

    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    # Get the created_at timestamp of the last document for cursor-based pagination
    last_document = db.query(Document).filter(
        Document.id == last_document_id,
        Document.workspace_id == workspace_id
    ).first()

    if not last_document:
        raise HTTPException(status_code=404, detail="Last document not found in workspace")

    # Fetch the next 25 documents in the workspace after the last_document's created_at, sorted by newest first
    documents = db.query(Document).filter(
        Document.workspace_id == workspace_id,
        Document.created_at < last_document.created_at
    ).order_by(Document.created_at.desc()).limit(25).all()

    next_docs = []
    for doc in documents:
        next_docs.append(
            DocumentResponse(
                id=doc.id,
                json_data=eval(doc.json_data),
                is_public=doc.is_public,
                version=doc.version,
                created_at=doc.created_at,
                updated_at=doc.updated_at
            )
        )

    return next_docs


# API: Get Workspace Document from Workspace ID and Document ID
@router.get("/{workspace_id}/document/{document_id}", response_model=DocumentResponse)
def get_workspace_document(
    workspace_id: str,
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_api_key)
):
    """
    Fetch a specific document inside a specific workspace.
    """
    # Verify workspace belongs to user
    workspace = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.user_id == current_user.id
    ).first()

    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    # Fetch document in the workspace
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.workspace_id == workspace_id,
        Document.user_id == current_user.id
    ).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found in workspace")

    return DocumentResponse(
        id=document.id,
        json_data=eval(document.json_data),
        is_public=document.is_public,
        version=document.version,
        created_at=document.created_at,
        updated_at=document.updated_at
    )


# API: Update Workspace Name
@router.put("/{workspace_id}", response_model=WorkspaceResponse)
def update_workspace_name(
    workspace_id: str,
    workspace_update: WorkspaceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_api_key)
):
    """
    Update the name of a workspace.
    """
    workspace = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.user_id == current_user.id
    ).first()

    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    workspace.name = workspace_update.name
    db.commit()
    db.refresh(workspace)

    document_count = db.query(Document).filter(Document.workspace_id == workspace.id).count()

    return WorkspaceResponse(
        id=workspace.id,
        name=workspace.name,
        created_at=workspace.created_at,
        updated_at=workspace.updated_at,
        document_count=document_count
    )


# API: Remove Document from Workspace
@router.delete("/{workspace_id}/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_document_from_workspace(
    workspace_id: str,
    document_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_api_key)
):
    """
    Remove a document from a workspace (sets workspace_id to NULL, doesn't delete document).
    """
    # Verify workspace belongs to user
    workspace = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.user_id == current_user.id
    ).first()

    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    # Find document in workspace
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.workspace_id == workspace_id,
        Document.user_id == current_user.id
    ).first()

    if not document:
        raise HTTPException(status_code=404, detail="Document not found in workspace")

    # Remove from workspace (set to NULL instead of deleting)
    document.workspace_id = None
    db.commit()

    return None


# API: Delete Workspace
@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workspace(
    workspace_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(verify_api_key)
):
    """
    Delete a workspace. Documents in the workspace will have their workspace_id set to NULL.
    """
    workspace = db.query(Workspace).filter(
        Workspace.id == workspace_id,
        Workspace.user_id == current_user.id
    ).first()

    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    # Set all documents' workspace_id to NULL before deleting workspace
    db.query(Document).filter(Document.workspace_id == workspace_id).update({"workspace_id": None})

    db.delete(workspace)
    db.commit()

    return None
