/**
 * Página principal - Lista de documentos escaneados
 */

import { useState, useEffect } from 'react';
import { Camera, FileText, Calendar, Trash2, Search, Lock } from 'lucide-react';
import { getAllDocumentProjects, deleteDocumentProject } from '../services/documentStore';
import type { DocumentProject } from '../services/documentStore';
import { logger } from '../utils/logger';

interface HomePageProps {
  onStartNewDocument: () => void;
  onOpenDocument: (doc: DocumentProject) => void;
}

export function HomePage({ onStartNewDocument, onOpenDocument }: HomePageProps) {
  const [documents, setDocuments] = useState<DocumentProject[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const totalDocuments = documents.length;
  const totalPages = documents.reduce((acc, doc) => acc + doc.pages.length, 0);

  const filteredDocuments = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const loadDocuments = async () => {
    try {
      const docs = await getAllDocumentProjects();
      setDocuments(docs);
    } catch (err) {
      logger.error('Error cargando documentos', err);
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
        logger.error('Error cargando documentos', err);
      }
    };
    initLoad();
    return () => {
      active = false;
    };
  }, []);

  const handleDeleteDocument = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('¿Estás seguro de que quieres eliminar este documento?')) {
      await deleteDocumentProject(id);
      loadDocuments();
    }
  };

  return (
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
          onClick={onStartNewDocument}
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
            <FileText className="w-5 h-5" />
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
                onClick={() => onOpenDocument(doc)}
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
                onClick={onStartNewDocument}
                className="btn btn-secondary"
              >
                Capturar hoja
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
