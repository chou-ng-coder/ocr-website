# 📄 OCR Document Management System

Vietnamese + English OCR web application with document management, folder organization, search, and analytics.

## 🚀 Features
- Multi-language OCR (Tesseract: `vie` + `eng`)
- JWT authentication with bcrypt
- Document & folder management
- Full-text search (filename & content)
- Analytics dashboard (users & docs stats)
- Export results (PDF/CSV)
- Rate limiting & logging

## 🏗️ Tech Stack
- **Backend**: FastAPI (Python 3.8+), MySQL 8.0, SQLAlchemy ORM  
- **Frontend**: React 18  
- **OCR Engine**: Tesseract + Pillow  
- **Auth**: JWT tokens  
- **Infra**: Docker + Docker Compose  

## 📁 Project Structure
```bash
ocr-app/
├── backend/
├── frontend/
├── docker-compose.yml
└── .env
```


## 🔧 API Highlights
- **Auth**: `/signup`, `/token`, `/signout`
- **OCR**: `/ocr` (upload + extract text)
- **Documents**: `/documents`, `/documents/{id}`, `/documents/{id}/download`
- **Folders**: `/folders`, `/documents/{id}/folders`
- **Search & Analytics**: `/search`, `/analytics`, `/search/export`

## ⚙️ Quick Start
```bash
git clone <repo>
cd ocr-app
docker-compose up --build
```
- Frontend → http://localhost:3000
- Backend API → http://localhost:8000
- API Docs → http://localhost:8000/docs

## 🔒 Security
- Password hashing (bcrypt)
- JWT-based authentication
- File upload validation & size limits
- SQL injection prevention via SQLAlchemy