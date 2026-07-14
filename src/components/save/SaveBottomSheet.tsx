import React, { useState } from 'react';
import { Download, FileText, Image as ImageIcon, X } from 'lucide-react';
import { jsPDF } from 'jspdf';
import type { ScannedPage } from '../../services/documentStore';

interface SaveDialogProps {
  pages: ScannedPage[];
  defaultName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const SaveDialog: React.FC<SaveDialogProps> = ({
  pages,
  defaultName,
  onConfirm,
  onCancel,
}) => {
  const [fileName, setFileName] = useState(() => defaultName || `Documento_${Date.now()}`);
  const [format, setFormat] = useState<'pdf' | 'jpg' | 'png'>('pdf');
  const [isExporting, setIsExporting] = useState(false);

  // Trigger base64 download in browser
  const downloadUrl = (url: string, extension: string, suffix = '') => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${fileName}${suffix}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExport = async () => {
    if (pages.length === 0) return;
    setIsExporting(true);

    try {
      if (format === 'pdf') {
        const doc = new jsPDF({
          orientation: 'portrait',
          unit: 'px',
          format: 'a4',
        });

        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        for (let i = 0; i < pages.length; i++) {
          const page = pages[i];
          if (i > 0) doc.addPage();

          // Scale and add image back into letter shape
          doc.addImage(page.processedImage, 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');

          // Bake text layers into PDF coordinates
          page.texts.forEach((text) => {
            const fontScale = (text.size / 400) * pageWidth;
            doc.setFontSize(fontScale);
            doc.setTextColor(text.color);
            // Center texts horizontally on coordinates
            doc.text(text.text, (text.x / 100) * pageWidth, (text.y / 100) * pageHeight, {
              align: 'center',
            });
          });
        }

        // Save PDF file in browser client-side
        doc.save(`${fileName}.pdf`);

      } else {
        // If image format: download individual pages (or multiple pages sequentially)
        pages.forEach((page, idx) => {
          const extension = format;
          const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
          
          if (page.texts.length > 0) {
            // Bake text items onto canvas to output with text burnt-in
            const img = new Image();
            img.src = page.processedImage;
            img.onload = () => {
              const canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth;
              canvas.height = img.naturalHeight;
              
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0);
                // Draw text labels
                page.texts.forEach((text) => {
                  const fontSize = (text.size / 400) * canvas.width;
                  ctx.fillStyle = text.color;
                  ctx.font = `bold ${fontSize}px sans-serif`;
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'middle';
                  ctx.fillText(text.text, (text.x / 100) * canvas.width, (text.y / 100) * canvas.height);
                });
                
                const url = canvas.toDataURL(mimeType, 0.90);
                const pageSuffix = pages.length > 1 ? `_página_${idx + 1}` : '';
                downloadUrl(url, extension, pageSuffix);
              }
            };
          } else {
            const pageSuffix = pages.length > 1 ? `_página_${idx + 1}` : '';
            downloadUrl(page.processedImage, extension, pageSuffix);
          }
        });
      }

      setIsExporting(false);
      onConfirm();
    } catch (err) {
      console.error('Error during document export:', err);
      setIsExporting(false);
    }
  };

  return (
    <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center pointer-events-auto z-[60] p-4">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-[420px] rounded-2xl shadow-[0_15px_30px_rgba(0,0,0,0.6)] text-left flex flex-col overflow-hidden animate-zoom-in">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-200">Exportar documento</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 flex flex-col gap-5">
          {/* Filename Input */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Nombre del archivo
            </label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className="bg-slate-950 text-white rounded-lg border border-slate-800 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 px-4 py-3 text-sm outline-none transition-all w-full"
              placeholder="e.g. Recibo_Compra"
            />
          </div>

          {/* Formats Selector */}
          <div className="flex flex-col gap-2.5">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Formato de descarga
            </label>
            
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setFormat('pdf')}
                className={`py-3.5 px-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  format === 'pdf'
                    ? 'border-cyan-400 bg-cyan-950/20 text-cyan-400'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-950 text-slate-400'
                }`}
              >
                <FileText className="w-6 h-6" />
                <span className="text-xs font-semibold">PDF Doc</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('jpg')}
                className={`py-3.5 px-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  format === 'jpg'
                    ? 'border-cyan-400 bg-cyan-950/20 text-cyan-400'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-950 text-slate-400'
                }`}
              >
                <ImageIcon className="w-6 h-6" />
                <span className="text-xs font-semibold">Imagen JPG</span>
              </button>

              <button
                type="button"
                onClick={() => setFormat('png')}
                className={`py-3.5 px-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all ${
                  format === 'png'
                    ? 'border-cyan-400 bg-cyan-950/20 text-cyan-400'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-950 text-slate-400'
                }`}
              >
                <ImageIcon className="w-6 h-6" />
                <span className="text-xs font-semibold">Imagen PNG</span>
              </button>
            </div>
          </div>

          <div className="text-slate-500 text-xs text-center border-t border-slate-800 mt-2 pt-4">
            Total a exportar: <strong className="text-slate-300 font-semibold">{pages.length}</strong> {pages.length === 1 ? 'página' : 'páginas'}
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-4">
          <button
            onClick={onCancel}
            type="button"
            className="btn btn-secondary flex-1 py-3 text-sm font-semibold rounded-xl text-slate-400"
          >
            Atrás
          </button>
          
          <button
            onClick={handleExport}
            disabled={isExporting || !fileName.trim()}
            className="btn btn-primary flex-1 py-3 text-sm font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-cyan-500 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isExporting ? (
              <span className="animate-spin inline-block w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {isExporting ? 'Procesando...' : 'Descargar'}
          </button>
        </div>
      </div>
    </div>
  );
};
