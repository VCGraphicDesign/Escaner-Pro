/**
 * Página de edición - Filtros, texto y gestión de páginas
 */

import { useState } from 'react';
import { ArrowLeft, Crop, RotateCw, Download, Sliders, Type, ChevronLeft, ChevronRight, Trash2, Plus } from 'lucide-react';
import type { DocumentProject, TextLayer as TextLayerType } from '../services/documentStore';
import { SaveDialog } from '../components/save/SaveBottomSheet';
import { TextLayerEditor } from '../components/edit/layers/TextLayer';
import { logger } from '../utils/logger';

interface EditPageProps {
  project: DocumentProject;
  activePageIndex: number;
  onGoHome: () => void;
  onUpdateProject: (project: DocumentProject) => void;
  onCropAgain: () => void;
  onAddPage: () => void;
}

export function EditPage({
  project,
  activePageIndex,
  onGoHome,
  onUpdateProject,
  onCropAgain,
  onAddPage,
}: EditPageProps) {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [activeTab, setActiveTab] = useState<'filters' | 'text'>('filters');

  const activePage = project.pages[activePageIndex];

  const handleRotateCurrentPage = () => {
    // Lógica de rotación
    logger.info('Rotar página', activePageIndex);
  };

  const handleDeleteCurrentPage = async (indexToDelete: number) => {
    if (project.pages.length <= 1) {
      alert('Un documento debe tener al menos una página.');
      return;
    }

    if (confirm('¿Deseas eliminar esta página de tu documento?')) {
      const updatedPages = project.pages.filter((_, idx) => idx !== indexToDelete);
      const updatedProj = { ...project, pages: updatedPages };
      onUpdateProject(updatedProj);
    }
  };

  const movePageLeft = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (idx === 0) return;
    const updated = [...project.pages];
    const temp = updated[idx];
    updated[idx] = updated[idx - 1];
    updated[idx - 1] = temp;
    const updatedProj = { ...project, pages: updated };
    onUpdateProject(updatedProj);
  };

  const movePageRight = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (idx === project.pages.length - 1) return;
    const updated = [...project.pages];
    const temp = updated[idx];
    updated[idx] = updated[idx + 1];
    updated[idx + 1] = temp;
    const updatedProj = { ...project, pages: updated };
    onUpdateProject(updatedProj);
  };

  const handleTextLayerChange = (updatedTexts: TextLayerType[]) => {
    const updatedPages = project.pages.map((p, idx) => {
      if (idx === activePageIndex) {
        return {
          ...p,
          texts: updatedTexts,
        };
      }
      return p;
    });
    const updatedProj = { ...project, pages: updatedPages };
    onUpdateProject(updatedProj);
  };

  return (
    <div className="editor-container">
      {/* Top Navbar */}
      <div className="top-navbar">
        <div className="navbar-left">
          <button
            onClick={onGoHome}
            className="btn btn-secondary"
            style={{ padding: '8px 12px' }}
            title="Volver"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <div style={{ textAlign: 'left' }}>
            <input
              type="text"
              value={project.name}
              onChange={(e) => {
                const renamed = { ...project, name: e.target.value };
                onUpdateProject(renamed);
              }}
              className="navbar-doc-title"
            />
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', paddingLeft: '4px' }}>
              Página {activePageIndex + 1} de {project.pages.length}
            </div>
          </div>
        </div>

        <div className="navbar-right">
          <button
            onClick={onCropAgain}
            className="btn btn-secondary"
            style={{ padding: '8px 12px' }}
            title="Ajustar recorte"
          >
            <Crop className="w-4 h-4" />
          </button>

          <button
            onClick={handleRotateCurrentPage}
            className="btn btn-secondary"
            style={{ padding: '8px 12px' }}
            title="Rotar 90"
          >
            <RotateCw className="w-4 h-4" />
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
            {false && (
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
              <div className="text-editor-placeholder">
                <Sliders className="text-placeholder-icon w-10 h-10 animate-pulse" />
                <h5 className="text-placeholder-title">Panel de filtros</h5>
                <p className="text-placeholder-desc">
                  Controles de brillo, contraste y filtros de imagen.
                </p>
              </div>
            )}

            {activeTab === 'text' && (
              <div className="text-editor-placeholder">
                <Type className="text-placeholder-icon w-10 h-10 animate-pulse" />
                <h5 className="text-placeholder-title">Editor de firmas y texto</h5>
                <p className="text-placeholder-desc">
                  Presiona el botón flotante inferior de tu documento para agregar texto en cualquier lugar.
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
          <span>{project.pages.length} {project.pages.length === 1 ? 'pág' : 'págs'}</span>
        </div>

        <div className="bottom-strip-list">
          {project.pages.map((p, idx) => {
            const isActive = idx === activePageIndex;
            return (
              <div
                key={p.id}
                onClick={() => {/* setActivePageIndex(idx) */}}
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

                  {idx < project.pages.length - 1 && (
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
            onClick={onAddPage}
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
          pages={project.pages}
          defaultName={project.name}
          onConfirm={() => {
            setShowSaveDialog(false);
            onGoHome();
          }}
          onCancel={() => setShowSaveDialog(false)}
        />
      )}
    </div>
  );
}
