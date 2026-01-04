# StashJSON - Simple JSON Bin Storage

A lightweight JSON storage system for developers. Store, retrieve, update, and delete JSON data via a simple REST API.

## Quick Start with Docker

### Prerequisites

- Docker Desktop installed
- Docker Compose (included with Docker Desktop)

### 1. Start the Application

```bash
# Clone or navigate to the project directory
cd stashJSON

# Start both PostgreSQL and the API
docker-compose up -d

# View logs (optional)
docker-compose logs -f
```

That's it! The application will:

- Start PostgreSQL on port 5432
- Start the API on port 8000
- Start pgAdmin on port 5050
- Automatically create database tables
- Enable hot-reload for development

### 2. Verify It's Running

Visit `http://localhost:8000` - you should see:

```json
{
  "message": "StashJSON API is running",
  "docs": "/docs",
  "version": "1.0.0"
}
```

Visit `http://localhost:8000/docs` for interactive API documentation!

### 3. Access pgAdmin

1. Open `http://localhost:5050` in your browser
2. Login with:

   - **Email**: `admin@test.com`
   - **Password**: `admin`

3. Add your database server:
   - Right-click "Servers" → "Register" → "Server"
   - **General tab**:
     - Name: `StashJSON DB` (or any name you like)
   - **Connection tab**:
     - Host: `postgres` (this is the Docker service name)
     - Port: `5432`
     - Database: `stashjson_db`
     - Username: `stashjson_user`
     - Password: `stashjson_password`
   - Click "Save"

Now you can browse your database, run queries, and manage data through pgAdmin!

### 4. Stop the Application

```bash
# Stop containers
docker-compose down

# Stop and remove volumes (deletes database data)
docker-compose down -v
```

---

## Alternative: Manual Setup (Without Docker)

<details>
<summary>Click to expand manual setup instructions</summary>

### Prerequisites

- Python 3.9+
- PostgreSQL 12+
- pgAdmin (already installed)

### 1. Set Up PostgreSQL Database

Since you have pgAdmin installed, let's create the database:

1. **Open pgAdmin** and connect to your local PostgreSQL server
2. **Create a new database**:

   - Right-click on "Databases" → "Create" → "Database"
   - Name: `stashjson_db`
   - Owner: Create a new user or use `postgres`

3. **Create a database user** (optional but recommended):
   - Right-click on "Login/Group Roles" → "Create" → "Login/Group Role"
   - General tab → Name: `stashjson_user`
   - Definition tab → Password: `your_password_here`
   - Privileges tab → Enable "Can login?"

**Alternative: Using Terminal**

```bash
# Connect to PostgreSQL
psql postgres

# Create database and user
CREATE DATABASE stashjson_db;
CREATE USER stashjson_user WITH PASSWORD 'your_password_here';
GRANT ALL PRIVILEGES ON DATABASE stashjson_db TO stashjson_user;

# Exit
\q
```

### 2. Set Up Python Environment

```bash
# Create virtual environment
python3 -m venv venv

# Activate it
source venv/bin/activate  # On macOS/Linux

# Install dependencies
pip install -r requirements.txt
```

### 3. Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Edit .env with your database credentials
# Update DATABASE_URL with your actual password
```

Your `.env` should look like:

```
DATABASE_URL=postgresql://stashjson_user:your_password_here@localhost:5432/stashjson_db
APP_ENV=development
```

### 4. Run the Application

```bash
# From project root
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`

### 5. Test It Out

Visit `http://localhost:8000/docs` for interactive API documentation!

</details>

---

## API Usage

### 1. Generate an API Key

```bash
curl -X POST "http://localhost:8000/auth/generate-key" \
  -H "Content-Type: application/json" \
  -d '{"email": "optional@example.com"}'
```

**Response:**

```json
{
  "api_key": "your-generated-api-key-here",
  "message": "API key generated successfully. Store this securely - it won't be shown again!"
}
```

⚠️ **IMPORTANT**: Save this API key! You'll need it for all subsequent requests.

### 2. Create a Bin

```bash
curl -X POST "http://localhost:8000/bins/" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d '{
    "json_data": {"hello": "world", "test": true},
    "is_public": false
  }'
```

### 3. Get a Bin

```bash
curl -X GET "http://localhost:8000/bins/{bin_id}" \
  -H "X-API-Key: your-api-key-here"
```

### 4. Update a Bin

```bash
curl -X PUT "http://localhost:8000/bins/{bin_id}" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d '{
    "json_data": {"updated": "data"},
    "is_public": true
  }'
```

### 5. Delete a Bin

```bash
curl -X DELETE "http://localhost:8000/bins/{bin_id}" \
  -H "X-API-Key: your-api-key-here"
```

## Project Structure

```
stashJSON/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app setup
│   ├── config.py            # Configuration management
│   ├── database.py          # Database models and connection
│   ├── schemas.py           # Pydantic models for validation
│   ├── auth.py              # Authentication middleware
│   ├── utils.py             # Utility functions
│   └── routes/
│       ├── __init__.py
│       ├── auth.py          # API key generation endpoints
│       └── bins.py          # CRUD endpoints for bins
├── .dockerignore            # Docker ignore file
├── .env.example             # Example environment config
├── .gitignore
├── docker-compose.yml       # Docker Compose configuration
├── Dockerfile               # Docker image definition
├── requirements.txt         # Python dependencies
└── README.md
```

## Docker Commands

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f api          # API logs only
docker-compose logs -f postgres     # Database logs only
docker-compose logs -f pgadmin      # pgAdmin logs only
docker-compose logs -f              # All logs

# Restart services
docker-compose restart

# Stop services
docker-compose down

# Rebuild after code changes (if needed)
docker-compose up -d --build

# Access PostgreSQL directly (via CLI)
docker exec -it stashjson_db psql -U stashjson_user -d stashjson_db

# View running containers
docker-compose ps
```

## Accessing Services

- **API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **pgAdmin**: http://localhost:5050 (login: admin@admin.com / admin)
- **PostgreSQL**: localhost:5432 (connect from pgAdmin using host: `postgres`)

## Features

✅ **Phase 1 Complete** - Core API working locally:

- ✅ POST /bins - Create bin
- ✅ GET /bins/{id} - Read bin
- ✅ PUT /bins/{id} - Update bin
- ✅ DELETE /bins/{id} - Delete bin
- ✅ Local PostgreSQL database
- ✅ Simple API key authentication (hashed in DB)
- ✅ Public/private bin support
- ✅ Timestamps for creation and updates

## Roadmap

### Phase 2: Deploy to AWS (not optimized)

- Deploy to EC2 or ECS
- Use RDS PostgreSQL
- Basic production setup

### Phase 3+: Optimizations & Features

- CloudFront caching
- Redis layer (ElastiCache)
- S3 for large/cold JSON
- Rate limiting
- Usage analytics
- Paid plans
- Size limits per tier
- Email recovery for API keys

---

## Ideal Architecture (Future)

```
Client
↓
CloudFront (cheap global cache)
↓
ALB
↓
Stateless API (ECS / Fargate or EC2 ASG)
↓
Redis (ElastiCache)
↓
RDS Postgres (Multi-AZ)
↓
S3 (for large / cold JSON)
```
