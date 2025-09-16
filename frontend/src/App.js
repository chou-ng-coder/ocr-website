import React, { useState, useEffect } from 'react';
import './App.css';

const API_URL = 'http://localhost:8000';

function App() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(localStorage.getItem('authToken') || '');
  const [ocrText, setOcrText] = useState('');
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState('');
  const [showSignUp, setShowSignUp] = useState(false);
  const [ocrHistory, setOcrHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [folders, setFolders] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [editingDocument, setEditingDocument] = useState(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [managingFolders, setManagingFolders] = useState(null); // For multi-folder management
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchType, setSearchType] = useState('all');
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadDocId, setDownloadDocId] = useState(null);
  const [downloadFilename, setDownloadFilename] = useState('');
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsData, setAnalyticsData] = useState(null);

  const handleSignup = async (e) => {
    e.preventDefault();
    const form = new FormData();
    form.append('username', username);
    form.append('password', password);
    const res = await fetch(`${API_URL}/signup`, {
      method: 'POST',
      body: form
    });
    const data = await res.json();
    setMessage(data.msg || data.detail);
    if (data.msg) setShowSignUp(false);
  };

  const handleSignin = async (e) => {
    e.preventDefault();
    const form = new FormData();
    form.append('username', username);
    form.append('password', password);
    const res = await fetch(`${API_URL}/token`, {
      method: 'POST',
      body: form
    });
    const data = await res.json();
    if (data.access_token) {
      setToken(data.access_token);
      localStorage.setItem('authToken', data.access_token);
      setMessage('Signed in!');
    } else {
      setMessage(data.detail);
    }
  };

  const handleSignout = () => {
    setToken('');
    localStorage.removeItem('authToken');
    setOcrText('');
    setOcrHistory([]);
    setShowHistory(false);
    setShowLibrary(false);
    setShowAnalytics(false);
    setFolders([]);
    setCurrentFolder(null);
    setEditingDocument(null);
    setAnalyticsData(null);
    setMessage('Signed out.');
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage('Text copied to clipboard!');
      setTimeout(() => setMessage(''), 2000);
    } catch (err) {
      setMessage('Failed to copy text.');
    }
  };

  const updateDocument = async (docId, newFilename, newText) => {
    try {
      const res = await fetch(`${API_URL}/ocr/${docId}/update`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          filename: newFilename,
          text: newText
        })
      });
      
      if (res.ok) {
        setMessage('Document updated successfully!');
        fetchOcrHistory();
        setEditingDocument(null);
      } else {
        setMessage('Failed to update document.');
      }
    } catch (error) {
      setMessage('Failed to update document.');
    }
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    
    try {
      const res = await fetch(`${API_URL}/folders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: newFolderName })
      });
      
      if (res.ok) {
        setMessage('Folder created successfully!');
        setNewFolderName('');
        fetchFolders();
      } else {
        setMessage('Failed to create folder.');
      }
    } catch (error) {
      setMessage('Failed to create folder.');
    }
  };

  const fetchFolders = async () => {
    try {
      const res = await fetch(`${API_URL}/folders`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.folders) {
        setFolders(data.folders);
      }
    } catch (error) {
      setMessage('Failed to fetch folders.');
    }
  };

  const moveDocumentToFolder = async (docId, folderId) => {
    try {
      const res = await fetch(`${API_URL}/ocr/${docId}/move`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ folder_id: folderId })
      });
      
      if (res.ok) {
        setMessage('Document moved successfully!');
        fetchOcrHistory();
      } else {
        setMessage('Failed to move document.');
      }
    } catch (error) {
      setMessage('Failed to move document.');
    }
  };

  // Multi-folder management functions
  const manageDocumentFolders = async (docId, folderIds) => {
    try {
      const res = await fetch(`${API_URL}/ocr/${docId}/folders`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ folder_ids: folderIds })
      });
      
      if (res.ok) {
        const data = await res.json();
        setMessage(`Document folders updated! Now in ${data.folders.length} folder(s).`);
        fetchOcrHistory();
        setManagingFolders(null);
      } else {
        setMessage('Failed to update document folders.');
      }
    } catch (error) {
      setMessage('Failed to update document folders.');
    }
  };

  const toggleDocumentFolder = (docId, folderId, currentFolders) => {
    const isInFolder = currentFolders.some(f => f.id === folderId);
    let newFolderIds;
    
    if (isInFolder) {
      // Remove from folder
      newFolderIds = currentFolders.filter(f => f.id !== folderId).map(f => f.id);
    } else {
      // Add to folder
      newFolderIds = [...currentFolders.map(f => f.id), folderId];
    }
    
    manageDocumentFolders(docId, newFolderIds);
  };

  // Delete Functions
  const deleteDocument = async (docId, filename) => {
    if (!window.confirm(`Are you sure you want to delete "${filename}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`${API_URL}/ocr/${docId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        setMessage(`Document "${filename}" deleted successfully!`);
        fetchOcrHistory();
        setEditingDocument(null); // Close editing if this document was being edited
      } else {
        setMessage('Failed to delete document.');
      }
    } catch (error) {
      setMessage('Failed to delete document.');
    }
  };

  const deleteFolder = async (folderId, folderName) => {
    if (!window.confirm(`Are you sure you want to delete folder "${folderName}"? Documents in this folder will be moved to "No folder".`)) {
      return;
    }

    try {
      const res = await fetch(`${API_URL}/folders/${folderId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        setMessage(`Folder "${folderName}" deleted successfully! ${data.documents_moved} documents moved to "No folder".`);
        fetchFolders();
        fetchOcrHistory();
      } else {
        setMessage('Failed to delete folder.');
      }
    } catch (error) {
      setMessage('Failed to delete folder.');
    }
  };

  // Download and Search Functions
  const downloadDocument = async (docId, filename, format = 'txt') => {
    try {
      const res = await fetch(`${API_URL}/ocr/${docId}/download?format=${format}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // Set appropriate file extension based on format
        const baseFilename = filename.split('.')[0];
        a.download = `${baseFilename}.${format}`;
        
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        setMessage(`Document "${filename}" downloaded as ${format.toUpperCase()} successfully!`);
      } else {
        setMessage('Failed to download document.');
      }
    } catch (error) {
      setMessage('Failed to download document.');
    }
  };

  // Show download format selection modal
  const showDownloadOptions = (docId, filename) => {
    setDownloadDocId(docId);
    setDownloadFilename(filename);
    setShowDownloadModal(true);
  };

  // Handle format selection and download
  const handleFormatDownload = (format) => {
    setShowDownloadModal(false);
    downloadDocument(downloadDocId, downloadFilename, format);
    setDownloadDocId(null);
    setDownloadFilename('');
  };

  // Analytics Functions
  const fetchAnalytics = async () => {
    if (!token) {
      setMessage('Please sign in to view analytics.');
      return;
    }
    
    try {
      const res = await fetch(`${API_URL}/analytics/dashboard`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data);
        setMessage('');
      } else if (res.status === 401) {
        setMessage('Session expired. Please sign in again.');
        handleSignout();
      } else {
        const errorData = await res.json().catch(() => ({}));
        setMessage(`Failed to fetch analytics: ${errorData.detail || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Analytics fetch error:', error);
      setMessage('Failed to fetch analytics. Please check your connection.');
    }
  };

  const toggleAnalytics = () => {
    if (!token) {
      setMessage('Please sign in to view analytics.');
      return;
    }
    
    if (!showAnalytics) {
      fetchAnalytics();
    }
    setShowAnalytics(!showAnalytics);
    setShowHistory(false);
    setShowLibrary(false);
  };

  const searchDocuments = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(`${API_URL}/ocr/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          query: searchQuery.trim(),
          search_type: searchType
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results);
        setMessage(`Found ${data.total} document(s) matching "${data.query}"`);
      } else {
        setMessage('Search failed.');
        setSearchResults([]);
      }
    } catch (error) {
      setMessage('Search failed.');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Auto-search when query changes (with debounce)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (searchQuery.trim()) {
        searchDocuments();
      } else {
        setSearchResults([]);
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, searchType]);

  const fetchOcrHistory = async () => {
    try {
      const res = await fetch(`${API_URL}/ocr/history`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.results) {
        setOcrHistory(data.results);
      }
    } catch (error) {
      setMessage('Failed to fetch OCR history.');
    }
  };

  const handleOcr = async (e) => {
    e.preventDefault();
    if (!file) return setMessage('Please select a file.');
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_URL}/ocr`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: form
    });
    const data = await res.json();
    if (data.extracted_text !== undefined) {
      setOcrText(data.extracted_text);
      setMessage('OCR completed successfully!');
      // Refresh history after successful OCR
      if (showHistory) {
        fetchOcrHistory();
      }
    } else {
      setMessage(data.detail || 'OCR processing failed.');
    }
  };

  const toggleHistory = () => {
    if (!showHistory) {
      fetchOcrHistory();
    }
    setShowHistory(!showHistory);
    setShowLibrary(false);
    setShowAnalytics(false);
  };

  const toggleLibrary = () => {
    if (!showLibrary) {
      fetchOcrHistory();
      fetchFolders();
    }
    setShowLibrary(!showLibrary);
    setShowHistory(false);
    setShowAnalytics(false);
  };

  return (
    <div className="ocr-container">
      <h2>FastAPI OCR App</h2>
      {!token ? (
        <>
          {showSignUp ? (
            <>
              <form onSubmit={handleSignup} className="auth-form">
                <h3>Sign Up</h3>
                <input
                  type="text"
                  name="username"
                  placeholder="Username"
                  className="input-block"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                />
                <input
                  type="password"
                  name="password"
                  placeholder="Password"
                  className="input-block"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <button type="submit">Sign Up</button>
              </form>
              <div style={{textAlign:'center'}}>
                Already have an account?{' '}
                <button type="button" style={{background:'none',color:'#2563eb',border:'none',cursor:'pointer',padding:0}} onClick={()=>{setShowSignUp(false);setMessage('')}}>
                  Sign In
                </button>
              </div>
            </>
          ) : (
            <>
              <form onSubmit={handleSignin} className="auth-form">
                <h3>Sign In</h3>
                <input
                  type="text"
                  name="username"
                  placeholder="Username"
                  className="input-block"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                />
                <input
                  type="password"
                  name="password"
                  placeholder="Password"
                  className="input-block"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <button type="submit">Sign In</button>
              </form>
              <div style={{textAlign:'center'}}>
                Don't have an account?{' '}
                <button type="button" style={{background:'none',color:'#2563eb',border:'none',cursor:'pointer',padding:0}} onClick={()=>{setShowSignUp(true);setMessage('')}}>
                  Sign Up
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <button onClick={handleSignout}>Sign Out</button>
            <div>
              <button onClick={toggleHistory} style={{ 
                background: showHistory ? '#dc3545' : '#2563eb', 
                color: 'white', 
                border: 'none', 
                padding: '8px 16px', 
                borderRadius: '4px', 
                cursor: 'pointer',
                marginRight: '8px'
              }}>
                {showHistory ? 'Hide History' : 'View History'}
              </button>
              <button onClick={toggleLibrary} style={{ 
                background: showLibrary ? '#dc3545' : '#28a745', 
                color: 'white', 
                border: 'none', 
                padding: '8px 16px', 
                borderRadius: '4px', 
                cursor: 'pointer'
              }}>
                {showLibrary ? 'Hide Library' : 'Document Library'}
              </button>
              <button onClick={toggleAnalytics} style={{ 
                background: showAnalytics ? '#dc3545' : '#ffc107', 
                color: showAnalytics ? 'white' : 'black', 
                border: 'none', 
                padding: '8px 16px', 
                borderRadius: '4px', 
                cursor: 'pointer',
                marginLeft: '8px'
              }}>
                {showAnalytics ? 'Hide Analytics' : '📊 Analytics'}
              </button>
            </div>
          </div>
          
          {/* Search Section */}
          <div style={{ marginBottom: 20, border: '1px solid #ccc', borderRadius: '4px', padding: '16px' }}>
            <h3>🔍 Search Documents</h3>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ 
                  flex: 1,
                  minWidth: '200px',
                  padding: '8px 12px', 
                  border: '1px solid #ddd', 
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              />
              <select 
                value={searchType}
                onChange={(e) => setSearchType(e.target.value)}
                style={{ 
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px'
                }}
              >
                <option value="all">All (filename + content)</option>
                <option value="filename">Filename only</option>
                <option value="content">Content only</option>
              </select>
              <button 
                onClick={searchDocuments}
                disabled={!searchQuery.trim() || isSearching}
                style={{ 
                  padding: '8px 16px',
                  background: isSearching ? '#6c757d' : '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isSearching ? 'not-allowed' : 'pointer',
                  fontSize: '14px'
                }}
              >
                {isSearching ? '🔄 Searching...' : '🔍 Search'}
              </button>
            </div>
            
            {/* Search Results */}
            {searchResults.length > 0 && (
              <div>
                <h4>Search Results ({searchResults.length} found)</h4>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', 
                  gap: '16px',
                  maxHeight: '400px',
                  overflowY: 'auto'
                }}>
                  {searchResults.map((result) => (
                    <div key={result.id} style={{ 
                      border: '1px solid #eee', 
                      borderRadius: '4px', 
                      padding: '12px', 
                      backgroundColor: '#fffbf0'
                    }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                        📄 {result.filename} (ID: {result.id})
                      </div>
                      <div style={{ 
                        backgroundColor: 'white', 
                        border: '1px solid #ddd', 
                        borderRadius: '2px', 
                        padding: '8px',
                        fontSize: '14px',
                        maxHeight: '120px',
                        overflowY: 'auto',
                        marginBottom: '8px'
                      }}>
                        {result.text || 'No text extracted'}
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        <button 
                          onClick={() => copyToClipboard(result.text)}
                          className="btn-copy"
                        >
                          Copy
                        </button>
                        <button 
                          onClick={() => showDownloadOptions(result.id, result.filename)}
                          className="btn-download"
                        >
                          Download
                        </button>
                        <button 
                          onClick={() => setEditingDocument({id: result.id, filename: result.filename, text: result.text})}
                          className="btn-edit"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {searchQuery && searchResults.length === 0 && !isSearching && (
              <div style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
                No documents found matching "{searchQuery}"
              </div>
            )}
          </div>
          
          {showHistory && (
            <div style={{ marginBottom: 20, border: '1px solid #ccc', borderRadius: '4px', padding: '16px' }}>
              <h3>OCR History ({ocrHistory.length} results)</h3>
              {ocrHistory.length === 0 ? (
                <p>No OCR results yet.</p>
              ) : (
                <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', 
                    gap: '16px' 
                  }}>
                    {ocrHistory.map((result) => (
                      <div key={result.id} style={{ 
                        border: '1px solid #eee', 
                        borderRadius: '4px', 
                        padding: '12px', 
                        backgroundColor: '#f9f9f9'
                      }}>
                        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                          📄 {result.filename} (ID: {result.id})
                        </div>
                        <div style={{ 
                          backgroundColor: 'white', 
                          border: '1px solid #ddd', 
                          borderRadius: '2px', 
                          padding: '8px',
                          fontSize: '14px',
                          maxHeight: '200px',
                          overflowY: 'auto',
                          marginBottom: '8px'
                        }}>
                          {result.text || 'No text extracted'}
                        </div>
                        <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                          <button 
                            onClick={() => copyToClipboard(result.text)}
                            className="btn-copy"
                          >
                            Copy
                          </button>
                          <button 
                            onClick={() => setOcrText(result.text)}
                            className="btn-load"
                          >
                            Load
                          </button>
                          <button 
                            onClick={() => showDownloadOptions(result.id, result.filename)}
                            className="btn-download"
                          >
                              Download
                          </button>
                          <button 
                            onClick={() => deleteDocument(result.id, result.filename)}
                            className="btn-delete"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {showAnalytics && analyticsData && (
            <div style={{ marginBottom: 20, border: '1px solid #ccc', borderRadius: '4px', padding: '16px' }}>
              <h3>📊 Analytics Dashboard</h3>
              
              {/* Overview Cards */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                gap: '16px',
                marginBottom: '20px'
              }}>
                <div style={{ 
                  background: '#e3f2fd', 
                  padding: '16px', 
                  borderRadius: '8px', 
                  textAlign: 'center',
                  border: '1px solid #2196f3'
                }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1976d2' }}>
                    {analyticsData.overview.total_documents}
                  </div>
                  <div style={{ fontSize: '14px', color: '#666' }}>Total Documents</div>
                </div>
                
                <div style={{ 
                  background: '#e8f5e8', 
                  padding: '16px', 
                  borderRadius: '8px', 
                  textAlign: 'center',
                  border: '1px solid #4caf50'
                }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#388e3c' }}>
                    {analyticsData.overview.documents_this_month}
                  </div>
                  <div style={{ fontSize: '14px', color: '#666' }}>This Month</div>
                </div>
                
                <div style={{ 
                  background: '#fff3e0', 
                  padding: '16px', 
                  borderRadius: '8px', 
                  textAlign: 'center',
                  border: '1px solid #ff9800'
                }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f57c00' }}>
                    {analyticsData.overview.total_folders}
                  </div>
                  <div style={{ fontSize: '14px', color: '#666' }}>Total Folders</div>
                </div>
                
                <div style={{ 
                  background: '#fce4ec', 
                  padding: '16px', 
                  borderRadius: '8px', 
                  textAlign: 'center',
                  border: '1px solid #e91e63'
                }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#c2185b' }}>
                    {Math.round(analyticsData.overview.total_text_characters / 1000)}K
                  </div>
                  <div style={{ fontSize: '14px', color: '#666' }}>Characters Extracted</div>
                </div>
              </div>
              
              {/* Folder Distribution */}
              {analyticsData.folder_distribution.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h4>📁 Documents by Folder</h4>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                    gap: '8px' 
                  }}>
                    {analyticsData.folder_distribution.map((folder, index) => (
                      <div key={index} style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        padding: '8px 12px',
                        background: '#f5f5f5',
                        borderRadius: '4px',
                        border: '1px solid #ddd'
                      }}>
                        <span>📁 {folder.folder_name}</span>
                        <span style={{ fontWeight: 'bold', color: '#2196f3' }}>
                          {folder.document_count} docs
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* File Formats */}
              {Object.keys(analyticsData.file_formats).length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                  <h4>📄 File Formats</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {Object.entries(analyticsData.file_formats).map(([format, count]) => (
                      <div key={format} style={{ 
                        padding: '6px 12px',
                        background: '#e1f5fe',
                        borderRadius: '16px',
                        fontSize: '12px',
                        border: '1px solid #0288d1'
                      }}>
                        <strong>{format.toUpperCase()}</strong>: {count}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Recent Activity */}
              {analyticsData.recent_activity.length > 0 && (
                <div>
                  <h4>🕒 Recent Activity</h4>
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {analyticsData.recent_activity.map((activity) => (
                      <div key={activity.id} style={{ 
                        padding: '8px 12px',
                        marginBottom: '4px',
                        background: '#f9f9f9',
                        borderRadius: '4px',
                        border: '1px solid #eee'
                      }}>
                        <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                          📄 {activity.filename}
                        </div>
                        <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                          {activity.text_preview || 'No text preview'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Performance Metrics */}
              <div style={{ 
                marginTop: '20px', 
                padding: '12px', 
                background: '#f0f8ff', 
                borderRadius: '4px',
                border: '1px solid #4fc3f7'
              }}>
                <h4>⚡ Performance Insights</h4>
                <div style={{ fontSize: '14px' }}>
                  <div>📊 Average documents per folder: <strong>{analyticsData.performance_metrics.documents_per_folder}</strong></div>
                  <div>📝 Text extraction efficiency: <strong>{analyticsData.performance_metrics.text_efficiency}</strong></div>
                  <div>📈 Average text length: <strong>{analyticsData.overview.avg_text_length_per_document} characters</strong></div>
                </div>
              </div>
            </div>
          )}
          
          {showLibrary && (
            <div style={{ marginBottom: 20, border: '1px solid #ccc', borderRadius: '4px', padding: '16px' }}>
              <h3>📚 Document Library</h3>
              
              {/* Create New Folder */}
              <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
                <h4>Create New Folder</h4>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Folder name"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    style={{ 
                      flex: 1, 
                      padding: '6px 12px', 
                      border: '1px solid #ddd', 
                      borderRadius: '4px' 
                    }}
                  />
                  <button 
                    onClick={createFolder}
                    style={{
                      background: '#007bff',
                      color: 'white',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Create Folder
                  </button>
                </div>
              </div>

              {/* Folders */}
              {folders.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <h4>📁 Folders</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {folders.map((folder) => (
                      <div key={folder.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <button
                          onClick={() => setCurrentFolder(folder)}
                          style={{
                            background: currentFolder?.id === folder.id ? '#007bff' : '#e9ecef',
                            color: currentFolder?.id === folder.id ? 'white' : 'black',
                            border: 'none',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          📁 {folder.name}
                        </button>
                        <button
                          onClick={() => deleteFolder(folder.id, folder.name)}
                          style={{
                            background: '#dc3545',
                            color: 'white',
                            border: 'none',
                            padding: '4px 6px',
                            borderRadius: '2px',
                            cursor: 'pointer',
                            fontSize: '10px'
                          }}
                          title={`Delete folder "${folder.name}"`}
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                    {currentFolder && (
                      <button
                        onClick={() => setCurrentFolder(null)}
                        style={{
                          background: '#6c757d',
                          color: 'white',
                          border: 'none',
                          padding: '8px 12px',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Show All
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Documents */}
              <h4>📄 Documents {currentFolder ? `in "${currentFolder.name}"` : ''}</h4>
              {ocrHistory.length === 0 ? (
                <p>No documents yet.</p>
              ) : (
                <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', 
                    gap: '16px' 
                  }}>
                    {ocrHistory
                      .filter(doc => !currentFolder || (doc.folders && doc.folders.some(f => f.id === currentFolder.id)))
                      .map((result) => (
                      <div key={result.id} style={{ 
                        border: '1px solid #eee', 
                        borderRadius: '4px', 
                        padding: '12px', 
                        backgroundColor: '#f9f9f9'
                      }}>
                      {editingDocument?.id === result.id ? (
                        // Edit Mode
                        <div>
                          <input
                            type="text"
                            value={editingDocument.filename}
                            onChange={(e) => setEditingDocument({...editingDocument, filename: e.target.value})}
                            style={{ 
                              width: '100%', 
                              marginBottom: '8px', 
                              padding: '4px 8px',
                              border: '1px solid #ddd',
                              borderRadius: '2px'
                            }}
                          />
                          <textarea
                            value={editingDocument.text}
                            onChange={(e) => setEditingDocument({...editingDocument, text: e.target.value})}
                            style={{ 
                              width: '100%', 
                              height: '120px', 
                              marginBottom: '8px',
                              padding: '8px',
                              border: '1px solid #ddd',
                              borderRadius: '2px'
                            }}
                          />
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button 
                              onClick={() => updateDocument(result.id, editingDocument.filename, editingDocument.text)}
                              className="btn-save"
                            >
                              ✅ Save
                            </button>
                            <button 
                              onClick={() => setEditingDocument(null)}
                              className="btn-cancel"
                            >
                              ❌ Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        // View Mode
                        <div>
                          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                            📄 {result.filename} (ID: {result.id})
                          </div>
                          <div style={{ 
                            backgroundColor: 'white', 
                            border: '1px solid #ddd', 
                            borderRadius: '2px', 
                            padding: '8px',
                            fontSize: '14px',
                            maxHeight: '200px',
                            overflowY: 'auto',
                            marginBottom: '8px'
                          }}>
                            {result.text || 'No text extracted'}
                          </div>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            <button 
                              onClick={() => copyToClipboard(result.text)}
                              className="btn-copy"
                            >
                              Copy
                            </button>
                            <button 
                              onClick={() => setEditingDocument({id: result.id, filename: result.filename, text: result.text})}
                              className="btn-edit"
                            >
                              Edit
                            </button>
                            <button 
                              onClick={() => showDownloadOptions(result.id, result.filename)}
                              className="btn-download"
                            >
                              Download
                            </button>
                            <button 
                              onClick={() => deleteDocument(result.id, result.filename)}
                              className="btn-delete"
                            >
                              Delete
                            </button>
                            {folders.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                
                                {managingFolders?.id === result.id ? (
                                  /* Multi-folder management mode */
                                  <div style={{ 
                                    border: '1px solid #ddd', 
                                    borderRadius: '4px', 
                                    padding: '8px',
                                    backgroundColor: '#f8f9fa'
                                  }}>
                                    <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '4px' }}>
                                      Manage Folders:
                                    </div>
                                    {folders.map(folder => {
                                      const isInFolder = result.folders?.some(f => f.id === folder.id) || false;
                                      return (
                                        <div key={folder.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                                          <input
                                            type="checkbox"
                                            checked={isInFolder}
                                            onChange={() => toggleDocumentFolder(result.id, folder.id, result.folders || [])}
                                            style={{ marginRight: '4px' }}
                                          />
                                          <span style={{ fontSize: '11px' }}>📁 {folder.name}</span>
                                        </div>
                                      );
                                    })}
                                    <button
                                      onClick={() => setManagingFolders(null)}
                                      style={{
                                        fontSize: '10px',
                                        padding: '2px 6px',
                                        background: '#6c757d',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '2px',
                                        cursor: 'pointer',
                                        marginTop: '4px'
                                      }}
                                    >
                                      Done
                                    </button>
                                  </div>
                                ) : (
                                  /* Simple folder management button */
                                  <button
                                    onClick={() => setManagingFolders({id: result.id, folders: result.folders || []})}
                                    className="btn-manage-folders"
                                  >
                                    📁 Manage Folders
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          <form onSubmit={handleOcr} style={{ marginTop: 16 }}>
            <h3>Upload Image</h3>
            <input type="file" accept="image/*" onChange={e => setFile(e.target.files[0])} required />
            <button type="submit">Upload</button>
          </form>
          {ocrText && (
            <div style={{ marginTop: 16 }}>
              <h4>Extracted Text:</h4>
              <textarea value={ocrText} readOnly rows={6} style={{ width: '100%' }} />
            </div>
          )}
        </>
      )}
      {message && <div className="message">{message}</div>}

      {/* Download Format Selection Modal */}
      {showDownloadModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '24px',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            maxWidth: '400px',
            width: '90%'
          }}>
            <h3 style={{ margin: '0 0 20px 0', textAlign: 'center' }}>
              Choose Download Format
            </h3>
            <p style={{ margin: '0 0 20px 0', textAlign: 'center', color: '#666' }}>
              Select format for: {downloadFilename}
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* TXT Format Option */}
              <button
                onClick={() => handleFormatDownload('txt')}
                style={{
                  padding: '16px',
                  border: '2px solid #007bff',
                  borderRadius: '8px',
                  backgroundColor: '#f8f9fa',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textAlign: 'left'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#007bff';
                  e.target.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = '#f8f9fa';
                  e.target.style.color = 'black';
                }}
              >
                <div style={{ fontWeight: 'bold', fontSize: '16px' }}>📄 TXT - Plain Text</div>
                <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>
                  Simple text file format, readable in any text editor
                </div>
              </button>

              {/* CSV Format Option */}
              <button
                onClick={() => handleFormatDownload('csv')}
                style={{
                  padding: '16px',
                  border: '2px solid #28a745',
                  borderRadius: '8px',
                  backgroundColor: '#f8f9fa',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textAlign: 'left'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#28a745';
                  e.target.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = '#f8f9fa';
                  e.target.style.color = 'black';
                }}
              >
                <div style={{ fontWeight: 'bold', fontSize: '16px' }}>📊 CSV - Spreadsheet</div>
                <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>
                  Structured data format, opens in Excel or Google Sheets
                </div>
              </button>

              {/* PDF Format Option */}
              <button
                onClick={() => handleFormatDownload('pdf')}
                style={{
                  padding: '16px',
                  border: '2px solid #dc3545',
                  borderRadius: '8px',
                  backgroundColor: '#f8f9fa',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  textAlign: 'left'
                }}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = '#dc3545';
                  e.target.style.color = 'white';
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = '#f8f9fa';
                  e.target.style.color = 'black';
                }}
              >
                <div style={{ fontWeight: 'bold', fontSize: '16px' }}>📋 PDF - Document</div>
                <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.8 }}>
                  Professional document format, perfect for sharing and printing
                </div>
              </button>
            </div>

            {/* Cancel Button */}
            <div style={{ marginTop: '20px', textAlign: 'center' }}>
              <button
                onClick={() => setShowDownloadModal(false)}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  color: '#666'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
