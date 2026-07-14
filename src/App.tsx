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
} from 'lucide-react';

import {
  getAllDocumentProjects,
  saveDocumentProject,
  deleteDocumentProject,
} from './services/db';
import type { DocumentProject, ScannedPage } from './services/db';

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
    loadDocuments();
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
  const handleTextLayerChange = (updatedTexts: any[]) => {
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative">
      
      {/* 1. HOME SCREEN */}
      {screen === 'home' && (
        <div className="flex-1 flex flex-col w-full max-w-4xl mx-auto px-4 py-8">
          
          {/* Header section */}
          <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-10 border-b border-slate-900 pb-6 w-full">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white m-0 flex items-center gap-2">
                Document Scanner
                <span className="text-xs font-semibold bg-cyan-950 border border-cyan-800 text-cyan-400 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-[0_0_10px_rgba(34,211,238,0.1)]">
                  <Lock className="w-3.5 h-3.5" />
                  Local & Privado
                </span>
              </h1>
              <p className="text-slate-400 text-sm mt-1">
                Tus archivos procesados 100% en el dispositivo. Sin nubes, seguro de por vida.
              </p>
            </div>
            
            <button
              onClick={handleStartNewDocument}
              className="btn btn-primary px-5 py-3 rounded-xl flex items-center justify-center gap-2 font-semibold shadow-lg hover:bg-cyan-500 transition-all transform active:scale-95 flex-shrink-0"
            >
              <Camera className="w-5 h-5" />
              Escanear documento
            </button>
          </header>

          {/* Documents Grid Dashboard */}
          <main className="flex-grow">
            <h2 className="text-xl font-bold mb-4 text-slate-200">Buzón de Escaneos</h2>

            {documents.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => handleOpenDocument(doc)}
                    className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-4 flex flex-col gap-4 shadow-md hover:shadow-lg transition-all cursor-pointer relative group"
                  >
                    {/* Thumbnail box */}
                    <div className="aspect-[1/1.4] w-full bg-slate-950 rounded-xl overflow-hidden shadow-inner flex items-center justify-center relative">
                      {doc.pages[0]?.processedImage ? (
                        <img
                          src={doc.pages[0].processedImage}
                          alt={doc.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <FileText className="w-12 h-12 text-slate-700" />
                      )}
                      
                      {/* Badge length */}
                      <span className="absolute bottom-2.5 right-2.5 bg-slate-950/80 backdrop-blur-sm text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded text-slate-300">
                        {doc.pages.length} {doc.pages.length === 1 ? 'pág' : 'págs'}
                      </span>
                    </div>

                    {/* Meta info */}
                    <div className="flex flex-col text-left">
                      <h3 className="font-semibold text-slate-200 text-sm truncate mr-6" title={doc.name}>
                        {doc.name}
                      </h3>
                      <div className="flex items-center gap-1.5 text-slate-400 text-xs mt-1">
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
                      className="absolute top-6 right-6 bg-slate-950/80 hover:bg-red-500 opacity-0 group-hover:opacity-100 p-2 rounded-lg text-slate-400 hover:text-white transition-all shadow-md"
                      title="Eliminar documento"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-20 bg-slate-900/30 border-2 border-dashed border-slate-800 rounded-3xl p-6">
                <FileText className="w-16 h-16 text-slate-700 mb-4" />
                <h3 className="text-lg font-semibold text-slate-300">No hay documentos escaneados</h3>
                <p className="text-slate-500 text-sm max-w-sm mb-6">
                  Comienza a digitalizar tus facturas, recibos o apuntes presionando el botón superior.
                </p>
                <button
                  onClick={handleStartNewDocument}
                  className="btn btn-secondary px-5 py-2.5 rounded-xl text-slate-300 font-medium"
                >
                  Capturar hoja
                </button>
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
        <div className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-950">
          {/* Top Navbar */}
          <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between z-20">
            <div className="flex items-center gap-3">
              <button
                onClick={handleGoHome}
                className="btn btn-secondary p-2.5 rounded-lg text-slate-300 hover:text-white flex items-center justify-center"
                title="Volver"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              
              <div className="text-left">
                <input
                  type="text"
                  value={activeProject.name}
                  onChange={(e) => {
                    const renamed = { ...activeProject, name: e.target.value };
                    setActiveProject(renamed);
                    saveDocumentProject(renamed);
                  }}
                  className="bg-transparent text-slate-100 font-bold border-b border-transparent hover:border-slate-700 focus:border-cyan-500 focus:outline-none text-sm px-1 py-0.5 truncate max-w-[150px] sm:max-w-[280px]"
                />
                <div className="text-[10px] text-slate-400 px-1">
                  Página {activePageIndex + 1} de {activeProject.pages.length}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCropAgain}
                className="btn btn-secondary p-2.5 rounded-lg text-slate-300 hover:text-white flex items-center gap-1.5"
                title="Re-recortar"
              >
                <Crop className="w-4 h-4" />
                <span className="text-xs hidden sm:inline">Recortar</span>
              </button>

              <button
                onClick={handleRotateCurrentPage}
                className="btn btn-secondary p-2.5 rounded-lg text-slate-300 hover:text-white flex items-center gap-1.5"
                title="Rotar 90"
              >
                <RotateCw className="w-4 h-4" />
                <span className="text-xs hidden sm:inline">Girar</span>
              </button>

              <button
                onClick={() => setShowSaveDialog(true)}
                className="btn btn-primary px-4 py-2.5 rounded-lg text-slate-900 bg-cyan-400 hover:bg-cyan-500 font-semibold flex items-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span className="text-xs">Guardar</span>
              </button>
            </div>
          </div>

          {/* Main workspace (Splits into Image Preview vs right sidebar) */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
            
            {/* Left Preview Workspace */}
            <div className="flex-grow flex items-center justify-center p-6 bg-slate-950 overflow-auto relative">
              <div className="relative inline-block shadow-[0_10px_35px_rgba(0,0,0,0.5)] border border-slate-900 max-h-[50vh] md:max-h-[70vh]">
                
                {isProcessing && (
                  <div className="absolute inset-0 bg-slate-950/65 backdrop-blur-sm flex flex-col items-center justify-center z-50 rounded-lg">
                    <span className="animate-spin inline-block w-8 h-8 border-4 border-cyan-400 border-t-transparent rounded-full mb-3" />
                    <span className="text-xs text-cyan-400 font-medium">Binarizando imagen...</span>
                  </div>
                )}

                <img
                  src={activePage.processedImage}
                  alt="Processed Document Page"
                  className="w-auto h-auto max-h-[50vh] md:max-h-[70vh] object-contain rounded-md"
                  draggable={false}
                />

                {/* Editable layers wrapper */}
                <TextLayerEditor
                  texts={activePage.texts}
                  onChange={handleTextLayerChange}
                  imageWidth={500} // Mock size limits, layout auto calculates relative percentages
                  imageHeight={707} // Mock size A4 aspect ratio 1:1.414
                  active={activeTab === 'text'}
                />
              </div>
            </div>

            {/* Right Editing Control Sidebar */}
            <div className="w-full md:w-80 bg-slate-900 border-t md:border-t-0 md:border-b-0 md:border-l border-slate-800 flex flex-col overflow-y-auto">
              
              {/* Tab Header Selector */}
              <div className="flex border-b border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('filters')}
                  className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors ${
                    activeTab === 'filters'
                      ? 'border-b-2 border-cyan-400 text-cyan-400 bg-cyan-950/10'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sliders className="w-4 h-4" />
                  Filtros Limpieza
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('text')}
                  className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors ${
                    activeTab === 'text'
                      ? 'border-b-2 border-cyan-400 text-cyan-400 bg-cyan-950/10'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Type className="w-4 h-4" />
                  Texto Editable
                </button>
              </div>

              {/* Side Panels contents */}
              <div className="p-6 flex-grow flex flex-col gap-6">

                {activeTab === 'filters' && (
                  <>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800 pb-2">
                      Ajustes del Documento
                    </h4>
                    
                    {/* Binarization Toggle Clean B&W */}
                    <div className="flex items-center justify-between bg-slate-950 p-4 rounded-xl border border-slate-850">
                      <div className="text-left">
                        <span className="text-sm font-semibold text-slate-200 block">Blanco y Negro Limpio</span>
                        <span className="text-[10px] text-slate-400">Elimina sombras y arrugas de papel</span>
                      </div>
                      
                      <button
                        onClick={() => {
                          const val = !activePage.binarize;
                          triggerImageProcessing(activePage, { binarize: val });
                        }}
                        className={`w-11 h-6 rounded-full p-1 transition-colors ${
                          activePage.binarize ? 'bg-cyan-500' : 'bg-slate-700'
                        }`}
                      >
                        <div
                          className={`bg-slate-900 w-4 h-4 rounded-full shadow-md transform transition-transform ${
                            activePage.binarize ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Shadow removal toggle */}
                    {!activePage.binarize && (
                      <div className="flex items-center justify-between bg-slate-950 p-4 rounded-xl border border-slate-850">
                        <div className="text-left">
                          <span className="text-sm font-semibold text-slate-200 block">Eliminar Sombras</span>
                          <span className="text-[10px] text-slate-400">Aplanamiento de iluminación</span>
                        </div>
                        <button
                          onClick={() => {
                            const val = !activePage.shadowRemoval;
                            triggerImageProcessing(activePage, { shadowRemoval: val });
                          }}
                          className={`w-11 h-6 rounded-full p-1 transition-colors ${
                            activePage.shadowRemoval ? 'bg-cyan-500' : 'bg-slate-700'
                          }`}
                        >
                          <div
                            className={`bg-slate-900 w-4 h-4 rounded-full shadow-md transform transition-transform ${
                              activePage.shadowRemoval ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    )}

                    {/* Grayscale toggle */}
                    {!activePage.binarize && (
                      <div className="flex items-center justify-between bg-slate-950 p-4 rounded-xl border border-slate-850">
                        <div className="text-left">
                          <span className="text-sm font-semibold text-slate-200 block">Escala de Grises</span>
                          <span className="text-[10px] text-slate-400">Convertir foto a gris</span>
                        </div>
                        <button
                          onClick={() => {
                            const val = !activePage.grayscale;
                            triggerImageProcessing(activePage, { grayscale: val });
                          }}
                          className={`w-11 h-6 rounded-full p-1 transition-colors ${
                            activePage.grayscale ? 'bg-cyan-500' : 'bg-slate-700'
                          }`}
                        >
                          <div
                            className={`bg-slate-900 w-4 h-4 rounded-full shadow-md transform transition-transform ${
                              activePage.grayscale ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    )}

                    {/* Sliders adjustments */}
                    {activePage.binarize ? (
                      /* Binarization C Constant threshold slider */
                      <div className="flex flex-col gap-2.5">
                        <div className="flex justify-between text-xs font-semibold text-slate-400">
                          <span>UMBRAL DE LIMPIEZA</span>
                          <span className="text-cyan-400">{activePage.binarizeThreshold}</span>
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
                          className="w-full accent-cyan-400 h-1.5 bg-slate-850 rounded-lg appearance-none cursor-pointer"
                        />
                        <span className="text-[9px] text-slate-500 leading-normal text-left">
                          Valores más bajos remueven arrugas leves; valores más altos hacen el texto negro más grueso.
                        </span>
                      </div>
                    ) : (
                      /* Brightness / Contrast Sliders */
                      <div className="flex flex-col gap-5">
                        <div className="flex flex-col gap-2.5">
                          <div className="flex justify-between text-xs font-semibold text-slate-400">
                            <span>BRILLO</span>
                            <span className="text-cyan-400">{activePage.brightness}</span>
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
                            className="w-full accent-cyan-400 h-1.5 bg-slate-850 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>

                        <div className="flex flex-col gap-2.5">
                          <div className="flex justify-between text-xs font-semibold text-slate-400">
                            <span>CONTRASTE</span>
                            <span className="text-cyan-400">{activePage.contrast}</span>
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
                            className="w-full accent-cyan-400 h-1.5 bg-slate-850 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}

                {activeTab === 'text' && (
                  <div className="flex-grow flex flex-col items-center justify-center p-4 border border-dashed border-slate-800 rounded-2xl bg-slate-950/30">
                    <Type className="w-12 h-12 text-slate-650 mb-3 animate-pulse" />
                    <h5 className="font-semibold text-slate-350 text-sm">Editor de texto</h5>
                    <p className="text-slate-500 text-xs mt-1 text-center leading-relaxed">
                      Presiona el botón flotante inferior de tu documento para agregar texto arrastrable en cualquier lugar. Doble clic para escribir.
                    </p>
                  </div>
                )}

              </div>
            </div>

          </div>

          {/* Bottom Pages Horizontal Thumbnails Strip Selector */}
          <div className="p-4 bg-slate-900 border-t border-slate-805 flex flex-col gap-3 z-10">
            <div className="flex justify-between items-center text-xs font-bold text-slate-400">
              <span className="flex items-center gap-1">
                <Layers className="w-4 h-4" />
                PÁGINAS DEL DOCUMENTO
              </span>
              <span>{activeProject.pages.length} {activeProject.pages.length === 1 ? 'página' : 'páginas'}</span>
            </div>

            <div className="flex items-center gap-4 overflow-x-auto py-1 scrollbar-thin">
              
              {/* Pages thumbnails */}
              {activeProject.pages.map((p, idx) => {
                const isActive = idx === activePageIndex;
                return (
                  <div
                    key={p.id}
                    onClick={() => setActivePageIndex(idx)}
                    className={`flex-shrink-0 w-20 aspect-[1/1.4] bg-slate-950 border rounded-xl overflow-hidden cursor-pointer relative group flex flex-col justify-between ${
                      isActive ? 'border-cyan-400 ring-2 ring-cyan-500/30 scale-95' : 'border-slate-850 hover:border-slate-700'
                    }`}
                  >
                    <img
                      src={p.processedImage}
                      alt={`Page ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />

                    {/* Page numbering badge */}
                    <div className="absolute top-1 left-1 bg-slate-950/80 backdrop-blur-sm text-[9px] font-bold px-1.5 py-0.5 rounded text-slate-300">
                      {idx + 1}
                    </div>

                    {/* Quick page actions buttons */}
                    <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 transition-opacity">
                      
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={(e) => movePageLeft(idx, e)}
                          className="bg-slate-900 hover:bg-cyan-500 text-white p-1 rounded transition-colors"
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
                        className="bg-slate-900 hover:bg-red-500 text-white p-1 rounded transition-colors"
                        title="Eliminar página"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      {idx < activeProject.pages.length - 1 && (
                        <button
                          type="button"
                          onClick={(e) => movePageRight(idx, e)}
                          className="bg-slate-900 hover:bg-cyan-500 text-white p-1 rounded transition-colors"
                          title="Mover a la derecha"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )}

                    </div>
                  </div>
                );
              })}

              {/* Add page slot card */}
              <button
                onClick={handleAddPage}
                className="flex-shrink-0 w-20 aspect-[1/1.4] bg-slate-950 border border-dashed border-slate-800 hover:border-cyan-500/50 rounded-xl flex flex-col items-center justify-center gap-1 text-slate-500 hover:text-cyan-400 transition-colors"
              >
                <Plus className="w-6 h-6" />
                <span className="text-[10px] font-bold">Añadir</span>
              </button>

            </div>
          </div>

          {/* Export dialog prompt */}
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
