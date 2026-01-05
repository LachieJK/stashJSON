import hashlib
import secrets

def generate_api_key() -> str:
    """Generate a random 32-character API key"""
    return secrets.token_urlsafe(32)[:32]

def hash_api_key(api_key: str) -> str:
    """Hash an API key for secure storage"""
    return hashlib.sha256(api_key.encode()).hexdigest()

def generate_document_id() -> str:
    """Generate a random 16-character document ID"""
    return secrets.token_urlsafe(12)[:16]
