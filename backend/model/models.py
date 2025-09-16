from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import Column, Integer, String, Text, ForeignKey, Table
from sqlalchemy.dialects.mysql import LONGBLOB
from sqlalchemy.orm import relationship

Base = declarative_base()

document_folder_association = Table(
    'document_folders',
    Base.metadata,
    Column('document_id', Integer, ForeignKey('ocr_results.id'), primary_key=True),
    Column('folder_id', Integer, ForeignKey('folders.id'), primary_key=True)
)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True)
    hashed_password = Column(String(128))
    ocr_results = relationship("OCRResult", back_populates="owner")
    folders = relationship("Folder", back_populates="owner")

class Folder(Base):
    __tablename__ = "folders"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255))
    owner_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", back_populates="folders")
    documents = relationship("OCRResult", secondary=document_folder_association, back_populates="folders")

class OCRResult(Base):
    __tablename__ = "ocr_results"
    id = Column(Integer, primary_key=True, index=True)
    image_data = Column(LONGBLOB)
    image_filename = Column(String(255))
    text = Column(Text)
    owner_id = Column(Integer, ForeignKey("users.id"))
    folder_id = Column(Integer, ForeignKey("folders.id"), nullable=True)
    owner = relationship("User", back_populates="ocr_results")
    folders = relationship("Folder", secondary=document_folder_association, back_populates="documents")
