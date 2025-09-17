# OCR Document Management System

Vietnamese and English OCR web application with document management.

## Features

- OCR processing for Vietnamese and English text
- Document management with folders
- Search and export functionality
- User authentication and analytics

## Tech Stack

- **Backend**: FastAPI, MySQL, Tesseract OCR
- **Frontend**: React 18
- **Infrastructure**: Docker, Docker Compose

## Prerequisites

- Docker (20.10+)
- Docker Compose (2.0+)
- Git

## Getting Started

### 1. Clone Repository
```bash
git clone <repository-url>
cd ocr-app
```

### 2. Start Services
```bash
# Build and start all containers
docker-compose up --build

# Or run in background
docker-compose up --build -d
```

### 3. Access Application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

### 4. First Time Setup
1. Open http://localhost:3000
2. Create a new user account
3. Upload an image for OCR processing
4. Test document management features

### 5. Stop Application
```bash
# Stop all services
docker-compose down

# Stop and remove data
docker-compose down -v
```

## Troubleshooting

### Backend Issues
- Check logs: `docker-compose logs backend`
- Restart backend: `docker-compose restart backend`
- Test API: Visit http://localhost:8000/docs

### Frontend Issues
- Check logs: `docker-compose logs frontend`
- Restart frontend: `docker-compose restart frontend`

### Database Issues
- Check MySQL: `docker-compose logs db`
- Reset database: `docker-compose down -v && docker-compose up`

## Development

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm start
```

## Configuration

Default settings in `backend/config.py`:
- Debug mode: Enabled (shows API docs)
- Database: MySQL on port 3306
- OCR languages: Vietnamese + English
- Rate limiting: 10 requests/minute

## API Endpoints

### Authentication
- `POST /signup` - Register user
- `POST /token` - Login
- `POST /signout` - Logout

### Documents
- `POST /ocr` - Upload image for OCR
- `GET /documents` - List documents
- `PUT /documents/{id}` - Update document
- `DELETE /documents/{id}` - Delete document

### Organization
- `POST /folders` - Create folder
- `GET /folders` - List folders
- `PUT /documents/{id}/folders` - Manage folders

### Search & Analytics
- `POST /search` - Search documents
- `GET /analytics` - User analytics

## License

MIT
