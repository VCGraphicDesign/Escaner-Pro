/**
 * Componente principal de la aplicación
 * Gestiona el enrutamiento y el estado global
 */

import { useState } from 'react';
import type { DocumentProject, ScannedPage } from './services/documentStore';
import { saveDocumentProject } from './services/documentStore';
import { processPageImage } from './services/imageProcessor';
import { HomePage } from './pages/HomePage';
import { ScanPage } from './pages/ScanPage';
import { CleanPage } from './pages/CleanPage';
import { EditPage } from './pages/EditPage';
import { logger } from './utils/logger';

type Screen = 'home' | 'scan' | 'crop' | 'edit';

function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [activeProject, setActiveProject] = useState<DocumentProject | null>(null);
  const [activePageIndex, setActivePageIndex] = useState<number>(0);
  const [tempImageSrc, setTempImageSrc] = useState<string>('');
  const [isNewScanForExistingDoc, setIsNewScanForExistingDoc] = useState<boolean>(false);

  // Return to Home list dashboard
  const handleGoHome = async () => {
    if (activeProject) {
      await saveDocumentProject(activeProject);
    }
    setActiveProject(null);
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

  // Open an existing project
  const handleOpenDocument = (proj: DocumentProject) => {
    setActiveProject(proj);
    setActivePageIndex(0);
    setScreen('edit');
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

    try {
      const newPageId = `page-${Date.now()}`;
      
      const newPage: ScannedPage = {
        id: newPageId,
        originalImage: tempImageSrc,
        processedImage: '',
        rotate: 0,
        cropPoints,
        brightness: 0,
        contrast: 0,
        binarize: true,
        binarizeThreshold: 10,
        shadowRemoval: true,
        grayscale: false,
        texts: [],
      };

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

      let updatedPages = [...activeProject.pages];
      if (isNewScanForExistingDoc) {
        updatedPages.push(newPage);
      } else {
        updatedPages = [newPage];
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
      logger.error('Error creando página procesada', err);
    } finally {
      setTempImageSrc('');
    }
  };

  // Toggle Edit screen again
  const handleCropAgain = () => {
    if (!activeProject) return;
    const page = activeProject.pages[activePageIndex];
    setTempImageSrc(page.originalImage);
    const updatedPages = activeProject.pages.filter((_, idx) => idx !== activePageIndex);
    setActiveProject({ ...activeProject, pages: updatedPages });
    setIsNewScanForExistingDoc(true);
    setScreen('crop');
  };

  const handleUpdateProject = (project: DocumentProject) => {
    setActiveProject(project);
    saveDocumentProject(project);
  };

  return (
    <div className="editor-container animate-fade-in">
      {screen === 'home' && (
        <HomePage
          onStartNewDocument={handleStartNewDocument}
          onOpenDocument={handleOpenDocument}
        />
      )}

      {screen === 'scan' && (
        <ScanPage
          onCapture={handleImageCaptured}
          onCancel={handleGoHome}
        />
      )}

      {screen === 'crop' && (
        <CleanPage
          imageSrc={tempImageSrc}
          onCropComplete={handleCropComplete}
          onCancel={handleGoHome}
        />
      )}

      {screen === 'edit' && activeProject && (
        <EditPage
          project={activeProject}
          activePageIndex={activePageIndex}
          onGoHome={handleGoHome}
          onUpdateProject={handleUpdateProject}
          onCropAgain={handleCropAgain}
          onAddPage={handleAddPage}
        />
      )}
    </div>
  );
}

export default App;
