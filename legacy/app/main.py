from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routes import auth, documents, workspaces

# Initialize FastAPI app
app = FastAPI(
    title="StashJSON API",
    description="Simple JSON document storage system for developers",
    version="1.0.0"
)

# CORS middleware (adjust for production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(workspaces.router)

@app.on_event("startup")
async def startup_event():
    """Initialize database tables on startup"""
    init_db()

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "message": "StashJSON API is running",
        "docs": "/docs",
        "version": "1.0.0"
    }

@app.get("/health")
async def health():
    """Health check endpoint for monitoring"""
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
