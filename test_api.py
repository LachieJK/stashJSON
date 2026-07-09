#!/usr/bin/env python3
"""
StashJSON API Tester
A simple script to test the StashJSON API with formatted output.
"""

import requests
import json
from typing import Optional, Dict, Any
from rich.console import Console
from rich.panel import Panel
from rich.syntax import Syntax
from rich.table import Table

console = Console()

# Configuration
BASE_URL = "http://localhost:8000"
API_KEY: Optional[str] = None


def print_response(response: requests.Response, title: str = "Response"):
    """Pretty print API response with status, headers, and body."""

    # Status panel
    status_color = "green" if 200 <= response.status_code < 300 else "red" if response.status_code >= 400 else "yellow"
    console.print(Panel(
        f"[{status_color}]{response.status_code} {response.reason}[/{status_color}]",
        title=f"[bold cyan]{title}[/bold cyan]",
        border_style="cyan"
    ))

    # Response body
    try:
        json_data = response.json()
        json_str = json.dumps(json_data, indent=2)
        syntax = Syntax(json_str, "json", theme="monokai", line_numbers=False)
        console.print(Panel(syntax, title="[bold yellow]Response Body[/bold yellow]", border_style="yellow"))
    except:
        console.print(Panel(response.text, title="[bold yellow]Response Body[/bold yellow]", border_style="yellow"))

    console.print()


def print_error(message: str):
    """Print error message."""
    console.print(f"[bold red]Error:[/bold red] {message}\n")


def print_success(message: str):
    """Print success message."""
    console.print(f"[bold green]✓[/bold green] {message}\n")


# ============ AUTH ENDPOINTS ============

def generate_api_key(email: Optional[str] = None) -> Optional[str]:
    """Generate a new API key."""
    console.print("[bold blue]Generating API Key...[/bold blue]")

    payload = {}
    if email:
        payload["email"] = email

    response = requests.post(f"{BASE_URL}/auth/generate-key", json=payload)
    print_response(response, "POST /auth/generate-key")

    if response.status_code == 201:
        data = response.json()
        api_key = data.get("api_key")
        print_success(f"API Key generated: {api_key}")
        return api_key
    else:
        print_error("Failed to generate API key")
        return None


def revoke_api_key():
    """Revoke (delete) the current API key and all associated data."""
    if not API_KEY:
        print_error("API key not set. Generate one first.")
        return

    console.print("[bold blue]Revoking API Key...[/bold blue]")

    headers = {"X-API-Key": API_KEY}
    response = requests.delete(f"{BASE_URL}/auth/revoke-key", headers=headers)
    print_response(response, "DELETE /auth/revoke-key")

    if response.status_code == 204:
        print_success("API Key revoked successfully. All associated data deleted.")
    else:
        print_error("Failed to revoke API key")


# ============ DOCUMENT ENDPOINTS ============

def create_document(json_data: Dict[Any, Any], is_public: bool = False, workspace_id: Optional[str] = None) -> Optional[str]:
    """Create a new document."""
    if not API_KEY:
        print_error("API key not set. Generate one first.")
        return None

    console.print("[bold blue]Creating Document...[/bold blue]")

    payload = {
        "json_data": json_data,
        "is_public": is_public
    }
    if workspace_id:
        payload["workspace_id"] = workspace_id

    headers = {"X-API-Key": API_KEY}
    response = requests.post(f"{BASE_URL}/document", json=payload, headers=headers)
    print_response(response, "POST /document")

    if response.status_code == 201:
        doc_id = response.json().get("id")
        print_success(f"Document created with ID: {doc_id}")
        return doc_id
    else:
        print_error("Failed to create document")
        return None


def get_document(document_id: str, use_api_key: bool = True):
    """Get a document by ID."""
    console.print(f"[bold blue]Getting Document {document_id}...[/bold blue]")

    headers = {"X-API-Key": API_KEY} if use_api_key and API_KEY else {}
    response = requests.get(f"{BASE_URL}/document/{document_id}", headers=headers)
    print_response(response, f"GET /document/{document_id}")


def update_document(document_id: str, json_data: Optional[Dict[Any, Any]] = None, is_public: Optional[bool] = None):
    """Update a document (full replacement)."""
    if not API_KEY:
        print_error("API key not set. Generate one first.")
        return

    console.print(f"[bold blue]Updating Document {document_id}...[/bold blue]")

    payload = {}
    if json_data is not None:
        payload["json_data"] = json_data
    if is_public is not None:
        payload["is_public"] = is_public

    headers = {"X-API-Key": API_KEY}
    response = requests.put(f"{BASE_URL}/document/{document_id}", json=payload, headers=headers)
    print_response(response, f"PUT /document/{document_id}")


def patch_document(document_id: str, json_data: Dict[Any, Any]):
    """Patch a document (partial update/merge)."""
    if not API_KEY:
        print_error("API key not set. Generate one first.")
        return

    console.print(f"[bold blue]Patching Document {document_id}...[/bold blue]")

    payload = {"json_data": json_data}
    headers = {"X-API-Key": API_KEY}
    response = requests.patch(f"{BASE_URL}/document/{document_id}", json=payload, headers=headers)
    print_response(response, f"PATCH /document/{document_id}")


def delete_document(document_id: str):
    """Delete a document."""
    if not API_KEY:
        print_error("API key not set. Generate one first.")
        return

    console.print(f"[bold blue]Deleting Document {document_id}...[/bold blue]")

    headers = {"X-API-Key": API_KEY}
    response = requests.delete(f"{BASE_URL}/document/{document_id}", headers=headers)
    print_response(response, f"DELETE /document/{document_id}")


def get_document_versions(document_id: str):
    """Get all versions of a document."""
    if not API_KEY:
        print_error("API key not set. Generate one first.")
        return

    console.print(f"[bold blue]Getting Document Versions for {document_id}...[/bold blue]")

    headers = {"X-API-Key": API_KEY}
    response = requests.get(f"{BASE_URL}/document/{document_id}/versions", headers=headers)
    print_response(response, f"GET /document/{document_id}/versions")


def get_document_version(document_id: str, version: int):
    """Get a specific version of a document."""
    if not API_KEY:
        print_error("API key not set. Generate one first.")
        return

    console.print(f"[bold blue]Getting Document {document_id} Version {version}...[/bold blue]")

    headers = {"X-API-Key": API_KEY}
    response = requests.get(f"{BASE_URL}/document/{document_id}/v{version}", headers=headers)
    print_response(response, f"GET /document/{document_id}/v{version}")


# ============ WORKSPACE ENDPOINTS ============

def create_workspace(name: str) -> Optional[str]:
    """Create a new workspace."""
    if not API_KEY:
        print_error("API key not set. Generate one first.")
        return None

    console.print("[bold blue]Creating Workspace...[/bold blue]")

    payload = {"name": name}
    headers = {"X-API-Key": API_KEY}
    response = requests.post(f"{BASE_URL}/workspace", json=payload, headers=headers)
    print_response(response, "POST /workspace")

    if response.status_code == 201:
        workspace_id = response.json().get("id")
        print_success(f"Workspace created with ID: {workspace_id}")
        return workspace_id
    else:
        print_error("Failed to create workspace")
        return None


def list_workspaces():
    """List all workspaces."""
    if not API_KEY:
        print_error("API key not set. Generate one first.")
        return

    console.print("[bold blue]Listing Workspaces...[/bold blue]")

    headers = {"X-API-Key": API_KEY}
    response = requests.get(f"{BASE_URL}/workspace", headers=headers)
    print_response(response, "GET /workspace")


def get_workspace(workspace_id: str):
    """Get a specific workspace."""
    if not API_KEY:
        print_error("API key not set. Generate one first.")
        return

    console.print(f"[bold blue]Getting Workspace {workspace_id}...[/bold blue]")

    headers = {"X-API-Key": API_KEY}
    response = requests.get(f"{BASE_URL}/workspace/{workspace_id}", headers=headers)
    print_response(response, f"GET /workspace/{workspace_id}")


def list_workspace_documents(workspace_id: str):
    """List documents in a workspace."""
    if not API_KEY:
        print_error("API key not set. Generate one first.")
        return

    console.print(f"[bold blue]Listing Documents in Workspace {workspace_id}...[/bold blue]")

    headers = {"X-API-Key": API_KEY}
    response = requests.get(f"{BASE_URL}/workspace/{workspace_id}/documents", headers=headers)
    print_response(response, f"GET /workspace/{workspace_id}/documents")


def update_workspace(workspace_id: str, name: str):
    """Update workspace name."""
    if not API_KEY:
        print_error("API key not set. Generate one first.")
        return

    console.print(f"[bold blue]Updating Workspace {workspace_id}...[/bold blue]")

    payload = {"name": name}
    headers = {"X-API-Key": API_KEY}
    response = requests.put(f"{BASE_URL}/workspace/{workspace_id}", json=payload, headers=headers)
    print_response(response, f"PUT /workspace/{workspace_id}")


def remove_document_from_workspace(workspace_id: str, document_id: str):
    """Remove a document from a workspace."""
    if not API_KEY:
        print_error("API key not set. Generate one first.")
        return

    console.print(f"[bold blue]Removing Document {document_id} from Workspace {workspace_id}...[/bold blue]")

    headers = {"X-API-Key": API_KEY}
    response = requests.delete(f"{BASE_URL}/workspace/{workspace_id}/documents/{document_id}", headers=headers)
    print_response(response, f"DELETE /workspace/{workspace_id}/documents/{document_id}")


def delete_workspace(workspace_id: str):
    """Delete a workspace."""
    if not API_KEY:
        print_error("API key not set. Generate one first.")
        return

    console.print(f"[bold blue]Deleting Workspace {workspace_id}...[/bold blue]")

    headers = {"X-API-Key": API_KEY}
    response = requests.delete(f"{BASE_URL}/workspace/{workspace_id}", headers=headers)
    print_response(response, f"DELETE /workspace/{workspace_id}")


# ============ WORKSPACE TEMPLATE ENDPOINTS ============

def create_workspace_template(workspace_id: str, json_schema: Dict[Any, Any]):
    """Create or update a workspace template."""
    if not API_KEY:
        print_error("API key not set. Generate one first.")
        return

    console.print(f"[bold blue]Creating/Updating Template for Workspace {workspace_id}...[/bold blue]")

    payload = {"json_schema": json_schema}
    headers = {"X-API-Key": API_KEY}
    response = requests.put(f"{BASE_URL}/workspace/{workspace_id}/template", json=payload, headers=headers)
    print_response(response, f"PUT /workspace/{workspace_id}/template")


def get_workspace_template(workspace_id: str):
    """Get workspace template."""
    if not API_KEY:
        print_error("API key not set. Generate one first.")
        return

    console.print(f"[bold blue]Getting Template for Workspace {workspace_id}...[/bold blue]")

    headers = {"X-API-Key": API_KEY}
    response = requests.get(f"{BASE_URL}/workspace/{workspace_id}/template", headers=headers)
    print_response(response, f"GET /workspace/{workspace_id}/template")


def delete_workspace_template(workspace_id: str):
    """Delete workspace template."""
    if not API_KEY:
        print_error("API key not set. Generate one first.")
        return

    console.print(f"[bold blue]Deleting Template for Workspace {workspace_id}...[/bold blue]")

    headers = {"X-API-Key": API_KEY}
    response = requests.delete(f"{BASE_URL}/workspace/{workspace_id}/template", headers=headers)
    print_response(response, f"DELETE /workspace/{workspace_id}/template")


# ============ EXAMPLE USAGE ============

def run_full_demo():
    """Run a full demo of the API."""
    global API_KEY

    console.print("\n[bold magenta]═══════════════════════════════════════════[/bold magenta]")
    console.print("[bold magenta]       StashJSON API Full Demo              [/bold magenta]")
    console.print("[bold magenta]═══════════════════════════════════════════[/bold magenta]\n")

    # 1. Generate API Key
    console.print("[bold cyan]Step 1: Generate API Key[/bold cyan]")
    API_KEY = generate_api_key(email="demo@example.com")
    if not API_KEY:
        return

    # 2. Create a workspace
    console.print("[bold cyan]Step 2: Create Workspace[/bold cyan]")
    workspace_id = create_workspace("My Demo Workspace")
    if not workspace_id:
        return

    # 3. Create a template for the workspace
    console.print("[bold cyan]Step 3: Create Workspace Template[/bold cyan]")
    schema = {
        "type": "object",
        "properties": {
            "name": {"type": "string"},
            "age": {"type": "number"},
            "email": {"type": "string", "format": "email"}
        },
        "required": ["name", "email"]
    }
    create_workspace_template(workspace_id, schema)

    # 4. Create a document that matches the template
    console.print("[bold cyan]Step 4: Create Document (matches template)[/bold cyan]")
    doc_data = {
        "name": "John Doe",
        "age": 30,
        "email": "john@example.com"
    }
    doc_id = create_document(doc_data, is_public=False, workspace_id=workspace_id)
    if not doc_id:
        return

    # 5. Get the document
    console.print("[bold cyan]Step 5: Get Document[/bold cyan]")
    get_document(doc_id)

    # 6. Update the document
    console.print("[bold cyan]Step 6: Update Document (PUT)[/bold cyan]")
    updated_data = {
        "name": "John Doe",
        "age": 31,
        "email": "john.doe@example.com"
    }
    update_document(doc_id, json_data=updated_data)

    # 7. Patch the document
    console.print("[bold cyan]Step 7: Patch Document (PATCH)[/bold cyan]")
    patch_data = {"age": 32}
    patch_document(doc_id, patch_data)

    # 8. Get document versions
    console.print("[bold cyan]Step 8: Get Document Versions[/bold cyan]")
    get_document_versions(doc_id)

    # 9. List workspace documents
    console.print("[bold cyan]Step 9: List Workspace Documents[/bold cyan]")
    list_workspace_documents(workspace_id)

    # 10. List all workspaces
    console.print("[bold cyan]Step 10: List All Workspaces[/bold cyan]")
    list_workspaces()

    # 11. Cleanup
    console.print("\n[bold magenta]═══════════════════════════════════════════[/bold magenta]")
    console.print("[bold magenta]          Cleanup Phase                     [/bold magenta]")
    console.print("[bold magenta]═══════════════════════════════════════════[/bold magenta]\n")

    console.print("[bold cyan]Cleanup 1: Revoke API Key (deletes everything)[/bold cyan]")
    revoke_api_key()

    console.print("\n[bold green]✓ Demo completed successfully![/bold green]")
    console.print("[bold green]✓ All test data cleaned up (including API key)![/bold green]\n")

    console.print("\n[bold green]✓ Demo completed successfully![/bold green]")
    console.print("[bold green]✓ All test data cleaned up![/bold green]\n")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "demo":
        run_full_demo()
    else:
        console.print("\n[bold yellow]StashJSON API Tester[/bold yellow]")
        console.print("Import this file and use the functions, or run with 'demo' argument:\n")
        console.print("  [cyan]python test_api.py demo[/cyan]\n")
        console.print("Or use interactively:")
        console.print("  [cyan]from test_api import *[/cyan]")
        console.print("  [cyan]API_KEY = generate_api_key()[/cyan]")
        console.print("  [cyan]doc_id = create_document({'key': 'value'})[/cyan]\n")
