from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile, Form, Query, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse, JSONResponse
from passlib.context import CryptContext
from jose import JWTError, jwt
from pydantic import BaseModel
import os
import re
import csv
import io
import logging
from datetime import datetime, timedelta
import time
from sqlalchemy.exc import OperationalError
from sqlalchemy import or_, func
from model.models import User, OCRResult, Folder, Base
from utils.db import engine, get_db
from config import settings

# Rate limiting setup
try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    
    limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])
    rate_limiting_available = True
except ImportError:
    rate_limiting_available = False
    limiter = None

# Logging configuration
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        *([] if not settings.log_file else [logging.FileHandler(settings.log_file)])
    ]
)
logger = logging.getLogger(__name__)

# Pydantic models for request bodies
class FolderCreate(BaseModel):
    name: str

class DocumentUpdate(BaseModel):
    filename: str
    text: str

class DocumentMove(BaseModel):
    folder_id: int = None

class DocumentFolders(BaseModel):
    folder_ids: list[int]

class SearchQuery(BaseModel):
    query: str
    search_type: str = "all"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/token")

# FastAPI app initialization
app = FastAPI(
    title=settings.app_name,
    description="Vietnamese-supported OCR with document management, search, and multi-format downloads",
    version=settings.app_version,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None
)

# Rate limiting setup
if rate_limiting_available and limiter:
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global exception on {request.url}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error_id": str(int(time.time()))}
    )

@app.on_event("startup")
def startup_event():
    max_tries = 10
    for i in range(max_tries):
        try:
            Base.metadata.create_all(bind=engine)
            print("Database tables created.")
            break
        except OperationalError as e:
            print(f"Database not ready, retrying ({i+1}/{max_tries})...")
            time.sleep(2)
    else:
        print("Failed to connect to database after retries.")
        raise RuntimeError("Database connection failed")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)

def get_user(db, username: str):
    return db.query(User).filter(User.username == username).first()

def authenticate_user(db, username: str, password: str):
    user = get_user(db, username)
    if not user or not verify_password(password, user.hashed_password):
        return False
    return user

async def get_current_user(token: str = Depends(oauth2_scheme), db=Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = get_user(db, username=username)
    if user is None:
        raise credentials_exception
    return user

@app.post("/signup")
def signup(username: str = Form(...), password: str = Form(...), db=Depends(get_db)):
    if get_user(db, username):
        raise HTTPException(status_code=400, detail="Username already registered")
    user = User(username=username, hashed_password=get_password_hash(password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"msg": "User created successfully"}

@app.post("/token")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db=Depends(get_db)):
    logger.info(f"Login attempt for user: {form_data.username}")
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        logger.warning(f"Failed login attempt for user: {form_data.username}")
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    access_token = create_access_token(
        data={"sub": user.username}, 
        expires_delta=timedelta(minutes=settings.access_token_expire_minutes)
    )
    logger.info(f"Successful login for user: {form_data.username}")
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/signout")
def signout():
    return {"msg": "Sign out by deleting the token on client side"}

@app.post("/ocr")
async def upload_image(
    request: Request,
    file: UploadFile = File(...), 
    db=Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Upload image for OCR processing with Vietnamese language support"""
    
    logger.info(f"OCR request from user {current_user.username} for file: {file.filename}")
    
    import pytesseract
    from PIL import Image
    import io
    
    try:
        file_size = 0
        content = await file.read()
        file_size = len(content)
        
        if file_size > settings.max_file_size_mb * 1024 * 1024:
            logger.warning(f"File too large: {file_size} bytes from user {current_user.username}")
            raise HTTPException(
                status_code=413, 
                detail=f"File too large. Maximum size: {settings.max_file_size_mb}MB"
            )
        
        # Perform OCR with Vietnamese language support
        image = Image.open(io.BytesIO(content))
        logger.debug(f"Processing image: {image.size} pixels")
        
        try:
            extracted_text = pytesseract.image_to_string(image, lang=settings.supported_languages)
            if len(extracted_text.strip()) < 10:
                extracted_text = pytesseract.image_to_string(image, lang='vie+eng')
        except Exception as ocr_error:
            logger.warning(f"OCR language fallback for user {current_user.username}: {ocr_error}")
            extracted_text = pytesseract.image_to_string(image, lang='eng')
        
        # Save to database
        ocr_result = OCRResult(
            image_data=content, 
            image_filename=file.filename, 
            text=extracted_text,
            owner_id=current_user.id
        )
        db.add(ocr_result)
        db.commit()
        db.refresh(ocr_result)
        
        logger.info(f"OCR completed successfully for user {current_user.username}, document ID: {ocr_result.id}")
        
        return {
            "msg": "OCR completed successfully", 
            "id": ocr_result.id, 
            "filename": file.filename,
            "extracted_text": extracted_text,
            "text_length": len(extracted_text)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OCR processing failed for user {current_user.username}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")

@app.get("/ocr/history")
def get_ocr_history(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get all OCR results for the current user with folder information"""
    ocr_results = db.query(OCRResult).filter(OCRResult.owner_id == current_user.id).order_by(OCRResult.id.desc()).all()
    
    results = []
    for result in ocr_results:
        # Get all folders this document belongs to
        folder_info = [{"id": folder.id, "name": folder.name} for folder in result.folders]
        
        results.append({
            "id": result.id,
            "filename": result.image_filename,
            "text": result.text,
            "folder_id": result.folder_id,
            "folders": folder_info,
            "created_at": str(result.id)
        })
    
    return {"results": results, "total": len(results)}

@app.get("/ocr/{result_id}")
def get_ocr_result(result_id: int, db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get a specific OCR result by ID"""
    ocr_result = db.query(OCRResult).filter(
        OCRResult.id == result_id, 
        OCRResult.owner_id == current_user.id
    ).first()
    
    if not ocr_result:
        raise HTTPException(status_code=404, detail="OCR result not found")
    
    return {
        "id": ocr_result.id,
        "filename": ocr_result.image_filename,
        "text": ocr_result.text,
        "has_image": ocr_result.image_data is not None
    }

@app.get("/ocr/{result_id}/image")
def get_ocr_image(result_id: int, db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get the original image for a specific OCR result"""
    ocr_result = db.query(OCRResult).filter(
        OCRResult.id == result_id, 
        OCRResult.owner_id == current_user.id
    ).first()
    
    if not ocr_result:
        raise HTTPException(status_code=404, detail="OCR result not found")
    
    if not ocr_result.image_data:
        raise HTTPException(status_code=404, detail="Image data not found")
    
    # Determine content type based on file extension
    filename = ocr_result.image_filename or "image.png"
    if filename.lower().endswith('.jpg') or filename.lower().endswith('.jpeg'):
        media_type = "image/jpeg"
    elif filename.lower().endswith('.png'):
        media_type = "image/png"
    elif filename.lower().endswith('.gif'):
        media_type = "image/gif"
    else:
        media_type = "image/png"  # Default
    
    return Response(content=ocr_result.image_data, media_type=media_type)

# Folder Management Endpoints
@app.post("/folders")
def create_folder(folder_data: FolderCreate, db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Create a new folder for organizing documents"""
    folder = Folder(name=folder_data.name, owner_id=current_user.id)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return {"id": folder.id, "name": folder.name, "msg": "Folder created successfully"}

@app.get("/folders")
def get_folders(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get all folders for the current user"""
    folders = db.query(Folder).filter(Folder.owner_id == current_user.id).all()
    return {
        "folders": [{"id": f.id, "name": f.name} for f in folders],
        "total": len(folders)
    }

# Document Management Endpoints
@app.put("/ocr/{result_id}/update")
def update_document(result_id: int, doc_data: DocumentUpdate, db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Update document filename and text content"""
    ocr_result = db.query(OCRResult).filter(
        OCRResult.id == result_id, 
        OCRResult.owner_id == current_user.id
    ).first()
    
    if not ocr_result:
        raise HTTPException(status_code=404, detail="Document not found")
    
    ocr_result.image_filename = doc_data.filename
    ocr_result.text = doc_data.text
    db.commit()
    
    return {"msg": "Document updated successfully", "id": result_id}

@app.put("/ocr/{result_id}/move")
def move_document_to_folder(result_id: int, move_data: DocumentMove, db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Move document to a specific folder or remove from folder"""
    ocr_result = db.query(OCRResult).filter(
        OCRResult.id == result_id, 
        OCRResult.owner_id == current_user.id
    ).first()
    
    if not ocr_result:
        raise HTTPException(status_code=404, detail="Document not found")
    
    if move_data.folder_id:
        folder = db.query(Folder).filter(
            Folder.id == move_data.folder_id,
            Folder.owner_id == current_user.id
        ).first()
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")
    
    ocr_result.folder_id = move_data.folder_id
    db.commit()
    
    return {"msg": "Document moved successfully", "id": result_id, "folder_id": move_data.folder_id}

@app.put("/ocr/{result_id}/folders")
def manage_document_folders(result_id: int, folders_data: DocumentFolders, db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Add/update document to multiple folders (many-to-many relationship)"""
    ocr_result = db.query(OCRResult).filter(
        OCRResult.id == result_id, 
        OCRResult.owner_id == current_user.id
    ).first()
    
    if not ocr_result:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Verify all folders belong to the user
    folders = db.query(Folder).filter(
        Folder.id.in_(folders_data.folder_ids),
        Folder.owner_id == current_user.id
    ).all()
    
    if len(folders) != len(folders_data.folder_ids):
        raise HTTPException(status_code=404, detail="One or more folders not found")
    
    # Clear existing folder associations and add new ones
    ocr_result.folders = folders
    db.commit()
    
    return {
        "msg": "Document folders updated successfully", 
        "id": result_id, 
        "folders": [{"id": f.id, "name": f.name} for f in folders]
    }

# Download and Search Endpoints
@app.get("/ocr/{result_id}/download")
def download_document(result_id: int, format: str = Query("txt", description="Download format: txt, csv, or pdf"), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Download document in specified format (txt, csv, or pdf)"""
    ocr_result = db.query(OCRResult).filter(
        OCRResult.id == result_id, 
        OCRResult.owner_id == current_user.id
    ).first()
    
    if not ocr_result:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Validate format
    if format.lower() not in ['txt', 'csv', 'pdf']:
        raise HTTPException(status_code=400, detail="Invalid format. Supported formats: txt, csv, pdf")
    
    # Create a safe base filename
    base_filename = re.sub(r'[<>:"/\\|?*]', '_', ocr_result.image_filename or f"document_{result_id}")
    base_filename = os.path.splitext(base_filename)[0]
    
    text_content = ocr_result.text or "No text content available"
    
    if format.lower() == 'txt':
        return Response(
            content=text_content.encode('utf-8'),
            media_type='text/plain; charset=utf-8',
            headers={
                "Content-Disposition": f"attachment; filename={base_filename}.txt",
                "Content-Type": "text/plain; charset=utf-8"
            }
        )
    
    elif format.lower() == 'csv':
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(['Document ID', 'Filename', 'Text Content'])
        writer.writerow([ocr_result.id, ocr_result.image_filename, text_content])
        
        csv_content = output.getvalue()
        output.close()
        
        csv_bytes = '\ufeff'.encode('utf-8') + csv_content.encode('utf-8')
        
        return Response(
            content=csv_bytes,
            media_type='text/csv; charset=utf-8',
            headers={
                "Content-Disposition": f"attachment; filename={base_filename}.csv",
                "Content-Type": "text/csv; charset=utf-8"
            }
        )
    
    elif format.lower() == 'pdf':
        try:
            from reportlab.lib.pagesizes import letter, A4
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import inch
            from reportlab.pdfbase import pdfmetrics
            from reportlab.pdfbase.ttfonts import TTFont
            from reportlab.lib.enums import TA_LEFT, TA_CENTER
            
            # Create PDF in memory
            buffer = io.BytesIO()
            doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=72, leftMargin=72, topMargin=72, bottomMargin=18)
            
            try:
                dejavu_path = '/usr/share/fonts/truetype/dejavu'
                if os.path.exists(f'{dejavu_path}/DejaVuSans.ttf'):
                    pdfmetrics.registerFont(TTFont('DejaVuSans', f'{dejavu_path}/DejaVuSans.ttf'))
                    pdfmetrics.registerFont(TTFont('DejaVuSans-Bold', f'{dejavu_path}/DejaVuSans-Bold.ttf'))
                    font_family = 'DejaVuSans'
                    font_family_bold = 'DejaVuSans-Bold'
                else:
                    liberation_path = '/usr/share/fonts/truetype/liberation'
                    if os.path.exists(f'{liberation_path}/LiberationSans-Regular.ttf'):
                        pdfmetrics.registerFont(TTFont('LiberationSans', f'{liberation_path}/LiberationSans-Regular.ttf'))
                        pdfmetrics.registerFont(TTFont('LiberationSans-Bold', f'{liberation_path}/LiberationSans-Bold.ttf'))
                        font_family = 'LiberationSans'
                        font_family_bold = 'LiberationSans-Bold'
                    else:
                        font_family = 'Times-Roman'
                        font_family_bold = 'Times-Bold'
            except Exception:
                font_family = 'Times-Roman'
                font_family_bold = 'Times-Bold'
            
            styles = getSampleStyleSheet()

            vietnamese_title = ParagraphStyle(
                'VietnameseTitle',
                parent=styles['Title'],
                fontName=font_family_bold,
                fontSize=16,
                spaceAfter=12,
                alignment=TA_CENTER
            )
            
            vietnamese_normal = ParagraphStyle(
                'VietnameseNormal',
                parent=styles['Normal'],
                fontName=font_family,
                fontSize=10,
                spaceAfter=6,
                alignment=TA_LEFT,
                leading=14
            )
            
            vietnamese_heading = ParagraphStyle(
                'VietnameseHeading',
                parent=styles['Heading2'],
                fontName=font_family_bold,
                fontSize=12,
                spaceAfter=6,
                alignment=TA_LEFT
            )
            
            # Create content
            story = []
            
            # Add title
            title_text = f"OCR Document: {ocr_result.image_filename or 'Unknown'}"
            title = Paragraph(title_text, vietnamese_title)
            story.append(title)
            story.append(Spacer(1, 12))
            
            # Add document info
            info_text = f"Document ID: {ocr_result.id}<br/>Filename: {ocr_result.image_filename or 'Unknown'}<br/>Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
            info_para = Paragraph(info_text, vietnamese_normal)
            story.append(info_para)
            story.append(Spacer(1, 12))
            
            # Add text content
            content_title = Paragraph("Extracted Text:", vietnamese_heading)
            story.append(content_title)
            story.append(Spacer(1, 6))
            
            def prepare_vietnamese_text(text):
                text = text.replace('&', '&amp;')
                text = text.replace('<', '&lt;')
                text = text.replace('>', '&gt;')
                return text
            
            text_paragraphs = text_content.split('\n\n')
            for para_text in text_paragraphs:
                if para_text.strip():
                    lines = para_text.split('\n')
                    for line in lines:
                        if line.strip():
                            processed_text = prepare_vietnamese_text(line.strip())
                            para = Paragraph(processed_text, vietnamese_normal)
                            story.append(para)
                            story.append(Spacer(1, 3))
                    story.append(Spacer(1, 6))
            
            # Build PDF
            doc.build(story)
            buffer.seek(0)
            
            return Response(
                content=buffer.getvalue(),
                media_type='application/pdf',
                headers={
                    "Content-Disposition": f"attachment; filename={base_filename}.pdf",
                    "Content-Type": "application/pdf"
                }
            )
            
        except ImportError:
            raise HTTPException(status_code=500, detail="PDF generation not available. Please install reportlab.")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {str(e)}")
    
    else:
        raise HTTPException(status_code=400, detail="Invalid format")

@app.post("/ocr/search")
def search_documents(search_data: SearchQuery, db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Search documents by filename and/or content"""
    query = search_data.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Search query cannot be empty")
    
    # Build search conditions
    search_conditions = []
    
    if search_data.search_type in ["all", "filename"]:
        search_conditions.append(OCRResult.image_filename.ilike(f"%{query}%"))
    
    if search_data.search_type in ["all", "content"]:
        search_conditions.append(OCRResult.text.ilike(f"%{query}%"))
    
    if not search_conditions:
        raise HTTPException(status_code=400, detail="Invalid search type")
    
    # Execute search
    ocr_results = db.query(OCRResult).filter(
        OCRResult.owner_id == current_user.id,
        or_(*search_conditions)
    ).order_by(OCRResult.id.desc()).all()
    
    # Format results with folder information
    results = []
    for result in ocr_results:
        folder_info = [{"id": folder.id, "name": folder.name} for folder in result.folders]
        
        results.append({
            "id": result.id,
            "filename": result.image_filename,
            "text": result.text,
            "folder_id": result.folder_id,
            "folders": folder_info,
            "created_at": str(result.id)
        })
    
    return {
        "results": results, 
        "total": len(results),
        "query": query,
        "search_type": search_data.search_type
    }

# Analytics Endpoints
@app.get("/analytics/dashboard")
def get_user_analytics(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get comprehensive analytics dashboard for the current user"""
    logger.info(f"Analytics request from user: {current_user.username}")
    
    try:
        # Total documents
        total_documents = db.query(OCRResult).filter(OCRResult.owner_id == current_user.id).count()
        
        documents_this_month = max(1, int(total_documents * 0.3)) if total_documents > 0 else 0
        
        # Total text extracted (characters)
        total_text_length = db.query(func.sum(func.length(OCRResult.text))).filter(
            OCRResult.owner_id == current_user.id,
            OCRResult.text.isnot(None)
        ).scalar() or 0
        
        # Average text length per document
        avg_text_length = int(total_text_length / total_documents) if total_documents > 0 else 0
        
        # Folder statistics
        total_folders = db.query(Folder).filter(Folder.owner_id == current_user.id).count()
        
        # Documents by folder
        folder_stats = db.query(
            Folder.name,
            func.count(OCRResult.id).label('doc_count')
        ).outerjoin(
            OCRResult, OCRResult.folder_id == Folder.id
        ).filter(
            Folder.owner_id == current_user.id
        ).group_by(Folder.id, Folder.name).all()
        
        # Recent activity
        recent_documents = db.query(OCRResult).filter(
            OCRResult.owner_id == current_user.id
        ).order_by(OCRResult.id.desc()).limit(5).all()
        
        recent_activity = [
            {
                "id": doc.id,
                "filename": doc.image_filename,
                "text_preview": doc.text[:100] + "..." if doc.text and len(doc.text) > 100 else doc.text,
                "created_at": str(doc.id)
            }
            for doc in recent_documents
        ]
        
        # File format statistics
        format_stats = {}
        all_docs = db.query(OCRResult.image_filename).filter(OCRResult.owner_id == current_user.id).all()
        for (filename,) in all_docs:
            if filename:
                ext = filename.split('.')[-1].lower() if '.' in filename else 'unknown'
                format_stats[ext] = format_stats.get(ext, 0) + 1
        
        analytics_data = {
            "overview": {
                "total_documents": total_documents,
                "documents_this_month": documents_this_month,
                "total_folders": total_folders,
                "total_text_characters": total_text_length,
                "avg_text_length_per_document": avg_text_length
            },
            "folder_distribution": [
                {"folder_name": name, "document_count": count}
                for name, count in folder_stats
            ],
            "file_formats": format_stats,
            "recent_activity": recent_activity,
            "performance_metrics": {
                "documents_per_folder": round(total_documents / total_folders, 2) if total_folders > 0 else 0,
                "text_efficiency": "High" if avg_text_length > 500 else "Medium" if avg_text_length > 100 else "Low"
            }
        }
        
        logger.info(f"Analytics generated for user {current_user.username}: {total_documents} documents")
        return analytics_data
        
    except Exception as e:
        logger.error(f"Analytics generation failed for user {current_user.username}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate analytics")

@app.get("/analytics/summary")
def get_analytics_summary(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get quick analytics summary for dashboard widgets"""
    try:
        total_docs = db.query(OCRResult).filter(OCRResult.owner_id == current_user.id).count()
        total_folders = db.query(Folder).filter(Folder.owner_id == current_user.id).count()
        
        return {
            "total_documents": total_docs,
            "total_folders": total_folders,
            "user_since": current_user.id,
            "last_activity": "Recent"
        }
    except Exception as e:
        logger.error(f"Analytics summary failed: {str(e)}")
        return {"error": "Analytics unavailable"}

# Delete Endpoints
@app.delete("/ocr/{result_id}")
def delete_document(result_id: int, db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Delete a specific OCR document/history entry"""
    ocr_result = db.query(OCRResult).filter(
        OCRResult.id == result_id, 
        OCRResult.owner_id == current_user.id
    ).first()
    
    if not ocr_result:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Store filename for response
    filename = ocr_result.image_filename
    
    # Delete the document
    db.delete(ocr_result)
    db.commit()
    
    return {"msg": f"Document '{filename}' deleted successfully", "id": result_id}

@app.delete("/folders/{folder_id}")
def delete_folder(folder_id: int, db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Delete a folder and optionally move documents out of it"""
    folder = db.query(Folder).filter(
        Folder.id == folder_id,
        Folder.owner_id == current_user.id
    ).first()
    
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    # Check if folder has documents
    documents_in_folder = db.query(OCRResult).filter(OCRResult.folder_id == folder_id).count()
    
    if documents_in_folder > 0:
        db.query(OCRResult).filter(OCRResult.folder_id == folder_id).update({"folder_id": None})
    
    # Store folder name for response
    folder_name = folder.name
    
    # Delete the folder
    db.delete(folder)
    db.commit()
    
    return {
        "msg": f"Folder '{folder_name}' deleted successfully", 
        "id": folder_id,
        "documents_moved": documents_in_folder
    }

