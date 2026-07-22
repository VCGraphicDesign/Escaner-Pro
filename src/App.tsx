import { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Download,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Crop,
  Camera,
  ArrowLeft,
  Calendar,
  Lock,
  FileText,
  Sliders,
  Type,
  Layers,
  Search,
  ChevronDown,
} from 'lucide-react';

import {
  getAllDocumentProjects,
  saveDocumentProject,
  deleteDocumentProject,
} from './services/db';
import type { DocumentProject, ScannedPage, TextLayer } from './services/db';

import { CameraScanner } from './components/CameraScanner';
import { PerspectiveCropper } from './components/PerspectiveCropper';
import { TextLayerEditor } from './components/TextLayerEditor';
import { SaveDialog } from './components/SaveDialog';
import { processPageImage } from './components/ImageProcessor';

function App() {
  const [screen, setScreen] = useState<'home' | 'scan' | 'crop' | 'edit'>('home');
  const [documents, setDocuments] = useState<DocumentProject[]>([]);
  const [activeProject, setActiveProject] = useState<DocumentProject | null>(null);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [tempImageSrc, setTempImageSrc] = useState<string>('');
  const [showSaveDialog, setShowSaveDialog] = useState<boolean>(false);
  
  // Editor panel tabs: 'filters' | 'text'
  const [activeTab, setActiveTab] = useState<'filters' | 'text'>('filters');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isNewScanForExistingDoc, setIsNewScanForExistingDoc] = useState<boolean>(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const getActiveFilterPreset = (page: ScannedPage): string => {
    if (page.binarize) return 'bw';
    if (page.grayscale) return 'gray';
    if (page.shadowRemoval) {
      if (page.contrast > 10) return 'magic';
      return 'lighten';
    }
    return 'original';
  };

  const applyFilterPreset = (page: ScannedPage, preset: string) => {
    let updates: Partial<ScannedPage> = {};
    if (preset === 'original') {
      updates = { binarize: false, shadowRemoval: false, grayscale: false, brightness: 0, contrast: 0 };
    } else if (preset === 'magic') {
      updates = { binarize: false, shadowRemoval: true, grayscale: false, brightness: 6, contrast: 18 };
    } else if (preset === 'lighten') {
      updates = { binarize: false, shadowRemoval: true, grayscale: false, brightness: 12, contrast: 0 };
    } else if (preset === 'bw') {
      updates = { binarize: true, shadowRemoval: true, grayscale: false, binarizeThreshold: 10 };
    } else if (preset === 'gray') {
      updates = { binarize: false, shadowRemoval: false, grayscale: true, brightness: 0, contrast: 0 };
    }
    triggerImageProcessing(page, updates);
  };

  const filteredDocuments = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalDocuments = documents.length;
  const totalPages = documents.reduce((acc, doc) => acc + doc.pages.length, 0);

  // Load documents on mounted
  const loadDocuments = async () => {
    try {
      const docs = await getAllDocumentProjects();
      setDocuments(docs);
    } catch (err) {
      console.error('Error fetching documents from local storage:', err);
    }
  };

  useEffect(() => {
    let active = true;
    const initLoad = async () => {
      try {
        const docs = await getAllDocumentProjects();
        if (active) {
          setDocuments(docs);
        }
      } catch (err) {
        console.error('Error fetching documents from local storage:', err);
      }
    };
    initLoad();
    return () => {
      active = false;
    };
  }, []);

  // Return to Home list dashboard
  const handleGoHome = async () => {
    if (activeProject) {
      await saveDocumentProject(activeProject);
    }
    setActiveProject(null);
    loadDocuments();
    setScreen('home');
  };

  // Create a brand new project and open camera
  const handleStartNewDocument = () => {
    const newDoc: DocumentProject = {
      id: `doc-${Date.now()}`,
      name: `Escaneo_${new Date().toLocaleDateString('es-ES').replace(/\//g, '_')}`,
      createdAt: Date.now(),
      pages: [],
    };
    setActiveProject(newDoc);
    setIsNewScanForExistingDoc(false);
    setScreen('scan');
  };

  // Trigger camera scanner for current active document
  const handleAddPage = () => {
    setIsNewScanForExistingDoc(true);
    setScreen('scan');
  };

  // Snapshot captured callback
  const handleImageCaptured = (base64: string) => {
    setTempImageSrc(base64);
    setScreen('crop');
  };

  // Vertex crop aligned confirmed callback
  const handleCropComplete = async (cropPoints: { x: number; y: number }[]) => {
    if (!activeProject) return;

    setIsProcessing(true);
    try {
      // 1. Map new page metadata
      const newPageId = `page-${Date.now()}`;
      
      const newPage: ScannedPage = {
        id: newPageId,
        originalImage: tempImageSrc,
        processedImage: '', // will be set below
        rotate: 0,
        cropPoints,
        brightness: 0,
        contrast: 0,
        binarize: true, // Default clean doc threshold binarization
        binarizeThreshold: 10,
        shadowRemoval: true, // Default shadow cleanup
        grayscale: false,
        texts: [],
      };

      // 2. Perform initial CV processing pipeline warp perspectiva -> shadows -> binarize
      const processed = await processPageImage(
        newPage.originalImage,
        newPage.cropPoints,
        newPage.rotate,
        newPage.brightness,
        newPage.contrast,
        newPage.binarize,
        newPage.shadowRemoval,
        newPage.grayscale,
        newPage.binarizeThreshold
      );

      newPage.processedImage = processed;

      // 3. Save into project pages array
      let updatedPages = [...activeProject.pages];
      if (isNewScanForExistingDoc) {
        updatedPages.push(newPage);
      } else {
        updatedPages = [newPage]; // First page of new project
      }

      const updatedProj: DocumentProject = {
        ...activeProject,
        pages: updatedPages,
      };

      setActiveProject(updatedProj);
      await saveDocumentProject(updatedProj);
      setActivePageIndex(updatedPages.length - 1);
      setScreen('edit');
    } catch (err) {
      console.error('Error creating page processed image:', err);
    } finally {
      setIsProcessing(false);
      setTempImageSrc('');
    }
  };

  // Delete document
  const handleDeleteDocument = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('¿Estás seguro de que quieres eliminar este documento?')) {
      await deleteDocumentProject(id);
      loadDocuments();
    }
  };

  // Open an existing project
  const handleOpenDocument = (proj: DocumentProject) => {
    setActiveProject(proj);
    setActivePageIndex(0);
    setScreen('edit');
  };

  // Re-run CV processing when edit filters values shifts
  const triggerImageProcessing = async (
    page: ScannedPage,
    updates: Partial<ScannedPage>
  ) => {
    if (!activeProject) return;
    setIsProcessing(true);

    const merged = { ...page, ...updates };

    try {
      const processed = await processPageImage(
        merged.originalImage,
        merged.cropPoints,
        merged.rotate,
        merged.brightness,
        merged.contrast,
        merged.binarize,
        merged.shadowRemoval,
        merged.grayscale,
        merged.binarizeThreshold
      );

      const updatedPages = activeProject.pages.map((p, idx) => {
        if (idx === activePageIndex) {
          return {
            ...p,
            ...updates,
            processedImage: processed,
          };
        }
        return p;
      });

      const updatedProj = { ...activeProject, pages: updatedPages };
      setActiveProject(updatedProj);
      await saveDocumentProject(updatedProj);
    } catch (err) {
      console.error('Cv re-process error:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Rotation CW 90deg incrementor
  const handleRotateCurrentPage = () => {
    if (!activeProject) return;
    const page = activeProject.pages[activePageIndex];
    const newRotation = (page.rotate + 90) % 360;
    triggerImageProcessing(page, { rotate: newRotation });
  };

  // Delete page from project
  const handleDeleteCurrentPage = async (indexToDelete: number) => {
    if (!activeProject) return;
    if (activeProject.pages.length <= 1) {
      alert('Un documento debe tener al menos una página.');
      return;
    }

    if (confirm('¿Deseas eliminar esta página de tu documento?')) {
      const updatedPages = activeProject.pages.filter((_, idx) => idx !== indexToDelete);
      const updatedProj = { ...activeProject, pages: updatedPages };
      setActiveProject(updatedProj);
      await saveDocumentProject(updatedProj);
      // Re-map focus index
      setActivePageIndex(Math.max(0, indexToDelete - 1));
    }
  };

  // Re-order page position to the left
  const movePageLeft = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeProject || idx === 0) return;
    const updated = [...activeProject.pages];
    // swap
    const temp = updated[idx];
    updated[idx] = updated[idx - 1];
    updated[idx - 1] = temp;

    const updatedProj = { ...activeProject, pages: updated };
    setActiveProject(updatedProj);
    saveDocumentProject(updatedProj);
    setActivePageIndex(idx - 1);
  };

  // Re-order page position to the right
  const movePageRight = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeProject || idx === activeProject.pages.length - 1) return;
    const updated = [...activeProject.pages];
    // swap
    const temp = updated[idx];
    updated[idx] = updated[idx + 1];
    updated[idx + 1] = temp;

    const updatedProj = { ...activeProject, pages: updated };
    setActiveProject(updatedProj);
    saveDocumentProject(updatedProj);
    setActivePageIndex(idx + 1);
  };

  // Callback from Text layer editor widget
  const handleTextLayerChange = (updatedTexts: TextLayer[]) => {
    if (!activeProject) return;
    const updatedPages = activeProject.pages.map((p, idx) => {
      if (idx === activePageIndex) {
        return {
          ...p,
          texts: updatedTexts,
        };
      }
      return p;
    });

    const updatedProj = { ...activeProject, pages: updatedPages };
    setActiveProject(updatedProj);
    saveDocumentProject(updatedProj);
  };

  // Toggle Edit screen again
  const handleCropAgain = () => {
    if (!activeProject) return;
    const page = activeProject.pages[activePageIndex];
    setTempImageSrc(page.originalImage);
    // Remove the current active page since we are going to crop it and push it as a replacement
    const updatedPages = activeProject.pages.filter((_, idx) => idx !== activePageIndex);
    setActiveProject({ ...activeProject, pages: updatedPages });
    setIsNewScanForExistingDoc(true); // this will insert it back
    setScreen('crop');
  };

  const activePage = activeProject?.pages[activePageIndex];

  return (
    <div className="editor-container animate-fade-in">
      
      {/* 1. HOME SCREEN */}
      {screen === 'home' && (
        <div className="home-container">
          
          {/* Header section */}
          <header className="header-section">
            <div>
              <h1 className="brand-title">
                Escaner-Pro
                <span className="brand-badge">
                  <Lock className="w-3.5 h-3.5" />
                  Local & Privado
                </span>
              </h1>
              <p className="brand-subtitle">
                Tus archivos procesados 100% en tu dispositivo. Sin nubes, seguro y privado.
              </p>
            </div>
            
            <button
              onClick={handleStartNewDocument}
              className="btn btn-primary"
            >
              <Camera className="w-5 h-5" />
              Escanear documento
            </button>
          </header>

          {/* Stats Summary Panel */}
          <section className="stats-container">
            <div className="stats-card">
              <div className="stats-icon-wrapper">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="stats-value">{totalDocuments}</div>
                <div className="stats-label">Documentos</div>
              </div>
            </div>

            <div className="stats-card">
              <div className="stats-icon-wrapper">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <div className="stats-value">{totalPages}</div>
                <div className="stats-label">Páginas</div>
              </div>
            </div>
          </section>

          {/* Search bar control */}
          <div className="search-bar-container">
            <Search className="search-icon w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar documento por nombre..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>

          {/* Documents Grid Dashboard */}
          <main style={{ flexGrow: 1 }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px', color: '#e5e7eb', textAlign: 'left' }}>
              Buzón de Escaneos
            </h2>

            {filteredDocuments.length > 0 ? (
              <div className="doc-grid">
                {filteredDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => handleOpenDocument(doc)}
                    className="doc-card"
                  >
                    {/* Thumbnail box */}
                    <div className="thumbnail-container">
                      {doc.pages[0]?.processedImage ? (
                        <img
                          src={doc.pages[0].processedImage}
                          alt={doc.name}
                          className="thumbnail-img"
                        />
                      ) : (
                        <FileText className="w-12 h-12" style={{ color: 'var(--text-muted)' }} />
                      )}
                      
                      {/* Badge length */}
                      <span className="pages-badge">
                        {doc.pages.length} {doc.pages.length === 1 ? 'pág' : 'págs'}
                      </span>
                    </div>

                    {/* Meta info */}
                    <div className="doc-meta">
                      <h3 className="doc-title" title={doc.name}>
                        {doc.name}
                      </h3>
                      <div className="doc-date">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(doc.createdAt).toLocaleDateString('es-ES', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>

                    {/* Floating delete button */}
                    <button
                      onClick={(e) => handleDeleteDocument(doc.id, e)}
                      className="doc-delete-btn"
                      title="Eliminar documento"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <FileText className="empty-state-icon" />
                <h3 className="empty-state-title">
                  {searchQuery ? 'Sin resultados' : 'No hay documentos escaneados'}
                </h3>
                <p className="empty-state-desc">
                  {searchQuery 
                    ? 'No se encontraron documentos que coincidan con tu búsqueda.' 
                    : 'Comienza a digitalizar tus facturas, recibos o apuntes presionando el botón superior.'}
                </p>
                {!searchQuery && (
                  <button
                    onClick={handleStartNewDocument}
                    className="btn btn-secondary"
                  >
                    Capturar hoja
                  </button>
                )}
              </div>
            )}
          </main>
        </div>
      )}

      {/* 2. SCAN SCREEN */}
      {screen === 'scan' && (
        <CameraScanner
          onCapture={handleImageCaptured}
          onCancel={handleGoHome}
        />
      )}

      {/* 3. CROP SCREEN */}
      {screen === 'crop' && (
        <PerspectiveCropper
          imageSrc={tempImageSrc}
          onCropComplete={handleCropComplete}
          onCancel={handleGoHome}
        />
      )}

      {/* 4. EDIT SCREEN */}
      {screen === 'edit' && activeProject && activePage && (
        <div className="editor-container">
          {/* Top Navbar */}
          <div className="top-navbar">
            <div className="navbar-left">
              <button
                onClick={handleGoHome}
                className="btn btn-secondary"
                style={{ padding: '8px 12px' }}
                title="Volver"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              
              <div style={{ textAlign: 'left' }}>
                <input
                  type="text"
                  value={activeProject.name}
                  onChange={(e) => {
                    const renamed = { ...activeProject, name: e.target.value };
                    setActiveProject(renamed);
                    saveDocumentProject(renamed);
                  }}
                  className="navbar-doc-title"
                />
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', paddingLeft: '4px' }}>
                  Página {activePageIndex + 1} de {activeProject.pages.length}
                </div>
              </div>
            </div>

            <div className="navbar-right">
              <button
                onClick={handleCropAgain}
                className="btn btn-secondary"
                style={{ padding: '8px 12px' }}
                title="Ajustar recorte"
              >
                <Crop className="w-4 h-4" />
                <span className="text-xs" style={{ display: 'none' }}>Recortar</span>
              </button>

              <button
                onClick={handleRotateCurrentPage}
                className="btn btn-secondary"
                style={{ padding: '8px 12px' }}
                title="Rotar 90"
              >
                <RotateCw className="w-4 h-4" />
                <span className="text-xs" style={{ display: 'none' }}>Girar</span>
              </button>

              <button
                onClick={() => setShowSaveDialog(true)}
                className="btn btn-primary"
                style={{ padding: '8px 16px' }}
              >
                <Download className="w-4 h-4" />
                <span className="text-xs">Guardar</span>
              </button>
            </div>
          </div>

          {/* Main workspace */}
          <div className="workspace-split">
            
            {/* Left Preview Workspace */}
            <div className="preview-workspace">
              <div className="image-wrapper">
                
                {isProcessing && (
                  <div className="processing-overlay">
                    <div className="processing-spinner" />
                    <span className="processing-text">Digitalizando documento...</span>
                    <div className="laser-line" />
                  </div>
                )}

                <img
                  src={activePage.processedImage}
                  alt="Processed Document Page"
                  className="preview-img"
                  draggable={false}
                />

                {/* Editable layers wrapper */}
                <TextLayerEditor
                  texts={activePage.texts}
                  onChange={handleTextLayerChange}
                  imageWidth={500}
                  imageHeight={707}
                  active={activeTab === 'text'}
                />
              </div>
            </div>

            {/* Right Editing Control Sidebar */}
            <div className="sidebar-controls">
              
              {/* Tab Header Selector */}
              <div className="tab-header">
                <button
                  type="button"
                  onClick={() => setActiveTab('filters')}
                  className={`tab-btn ${activeTab === 'filters' ? 'active' : ''}`}
                >
                  <Sliders className="w-4 h-4" />
                  Filtros Limpieza
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('text')}
                  className={`tab-btn ${activeTab === 'text' ? 'active' : ''}`}
                >
                  <Type className="w-4 h-4" />
                  Texto Editable
                </button>
              </div>

              {/* Side Panels contents */}
              <div className="panel-content">

                {activeTab === 'filters' && (
                  <>
                    <h4 className="panel-title">
                      Filtros Rápidos
                    </h4>
                    
                    <div className="filter-grid">
                      {/* Original preset */}
                      <div 
                        onClick={() => applyFilterPreset(activePage, 'original')}
                        className={`filter-card ${getActiveFilterPreset(activePage) === 'original' ? 'active' : ''}`}
                        title="Sin filtro"
                      >
                        <div className="filter-icon-box">
                          <Sliders className="w-4 h-4" />
                        </div>
                        <span className="filter-label">Original</span>
                      </div>

                      {/* Magic Color preset */}
                      <div 
                        onClick={() => applyFilterPreset(activePage, 'magic')}
                        className={`filter-card ${getActiveFilterPreset(activePage) === 'magic' ? 'active' : ''}`}
                        title="Mejora automática de contraste y sombras"
                      >
                        <div className="filter-icon-box">
                          <Camera className="w-4 h-4" />
                        </div>
                        <span className="filter-label">Mágico</span>
                      </div>

                      {/* Lighten preset */}
                      <div 
                        onClick={() => applyFilterPreset(activePage, 'lighten')}
                        className={`filter-card ${getActiveFilterPreset(activePage) === 'lighten' ? 'active' : ''}`}
                        title="Elimina sombras leves"
                      >
                        <div className="filter-icon-box">
                          <Lock className="w-4 h-4" />
                        </div>
                        <span className="filter-label">Aclarar</span>
                      </div>

                      {/* B&W Clean preset */}
                      <div 
                        onClick={() => applyFilterPreset(activePage, 'bw')}
                        className={`filter-card ${getActiveFilterPreset(activePage) === 'bw' ? 'active' : ''}`}
                        title="Blanco y Negro limpio tipo fax"
                      >
                        <div className="filter-icon-box">
                          <FileText className="w-4 h-4" />
                        </div>
                        <span className="filter-label">B&N Limpio</span>
                      </div>

                      {/* Grayscale preset */}
                      <div 
                        onClick={() => applyFilterPreset(activePage, 'gray')}
                        className={`filter-card ${getActiveFilterPreset(activePage) === 'gray' ? 'active' : ''}`}
                        title="Escala de grises estándar"
                      >
                        <div className="filter-icon-box">
                          <Layers className="w-4 h-4" />
                        </div>
                        <span className="filter-label">Grises</span>
                      </div>
                    </div>

                    {/* Advanced toggle collapsible */}
                    <div 
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="advanced-toggle"
                    >
                      <span className="advanced-toggle-label">Ajustes Manuales</span>
                      <ChevronDown className={`advanced-toggle-icon w-4 h-4 ${showAdvanced ? 'open' : ''}`} />
                    </div>

                    {showAdvanced && (
                      <div className="advanced-content animate-zoom-in">
                        {/* Threshold Slider (if binarize is active) */}
                        {activePage.binarize ? (
                          <div className="slider-group">
                            <div className="slider-info">
                              <span>Umbral de Limpieza</span>
                              <span className="slider-value">{activePage.binarizeThreshold}</span>
                            </div>
                            <input
                              type="range"
                              min="1"
                              max="28"
                              value={activePage.binarizeThreshold}
                              onChange={(e) => {
                                const val = parseInt(e.target.value);
                                triggerImageProcessing(activePage, { binarizeThreshold: val });
                              }}
                              className="w-full"
                            />
                            <span className="slider-desc">
                              Valores más bajos remueven arrugas leves; valores más altos hacen el texto negro más grueso.
                            </span>
                          </div>
                        ) : (
                          <div className="advanced-content" style={{ border: 'none', marginTop: 0 }}>
                            {/* Brightness slider */}
                            <div className="slider-group">
                              <div className="slider-info">
                                <span>Brillo</span>
                                <span className="slider-value">{activePage.brightness}</span>
                              </div>
                              <input
                                type="range"
                                min="-50"
                                max="50"
                                value={activePage.brightness}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  triggerImageProcessing(activePage, { brightness: val });
                                }}
                                className="w-full"
                              />
                            </div>

                            {/* Contrast slider */}
                            <div className="slider-group" style={{ marginTop: '12px' }}>
                              <div className="slider-info">
                                <span>Contraste</span>
                                <span className="slider-value">{activePage.contrast}</span>
                              </div>
                              <input
                                type="range"
                                min="-50"
                                max="50"
                                value={activePage.contrast}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value);
                                  triggerImageProcessing(activePage, { contrast: val });
                                }}
                                className="w-full"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {activeTab === 'text' && (
                  <div className="text-editor-placeholder">
                    <Type className="text-placeholder-icon w-10 h-10 animate-pulse" />
                    <h5 className="text-placeholder-title">Editor de firmas y texto</h5>
                    <p className="text-placeholder-desc">
                      Presiona el botón flotante inferior de tu documento para agregar texto en cualquier lugar. Doble clic sobre él para escribir.
                    </p>
                  </div>
                )}

              </div>
            </div>

          </div>

          {/* Bottom Pages Strip */}
          <div className="bottom-strip">
            <div className="bottom-strip-header">
              <span>Páginas del documento</span>
              <span>{activeProject.pages.length} {activeProject.pages.length === 1 ? 'pág' : 'págs'}</span>
            </div>

            <div className="bottom-strip-list">
              {activeProject.pages.map((p, idx) => {
                const isActive = idx === activePageIndex;
                return (
                  <div
                    key={p.id}
                    onClick={() => setActivePageIndex(idx)}
                    className={`bottom-strip-item ${isActive ? 'active' : ''}`}
                  >
                    <img
                      src={p.processedImage}
                      alt={`Page ${idx + 1}`}
                      className="bottom-strip-img"
                    />
                    <div className="bottom-strip-num">{idx + 1}</div>

                    <div className="bottom-strip-actions">
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={(e) => movePageLeft(idx, e)}
                          className="bottom-action-btn"
                          title="Mover a la izquierda"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCurrentPage(idx);
                        }}
                        className="bottom-action-btn"
                        title="Eliminar página"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      {idx < activeProject.pages.length - 1 && (
                        <button
                          type="button"
                          onClick={(e) => movePageRight(idx, e)}
                          className="bottom-action-btn"
                          title="Mover a la derecha"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              <button
                onClick={handleAddPage}
                className="bottom-add-btn"
              >
                <Plus className="w-5 h-5" />
                <span style={{ fontSize: '9px', fontWeight: 'bold' }}>Añadir</span>
              </button>
            </div>
          </div>

          {/* Export dialog */}
          {showSaveDialog && (
            <SaveDialog
              pages={activeProject.pages}
              defaultName={activeProject.name}
              onConfirm={() => {
                setShowSaveDialog(false);
                handleGoHome();
              }}
              onCancel={() => setShowSaveDialog(false)}
            />
          )}

        </div>
      )}

    </div>
  );
}

export default App;
