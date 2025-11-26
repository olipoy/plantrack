import React, { useState } from 'react';
import { ArrowLeft, FileText, ExternalLink } from 'lucide-react';

interface PdfOverlayProjectViewProps {
  project: {
    id: string;
    name: string;
    document_template_id: string;
    created_at?: string;
    createdAt?: Date;
    [key: string]: any;
  };
  onBack: () => void;
}

export const PdfOverlayProjectView: React.FC<PdfOverlayProjectViewProps> = ({
  project,
  onBack
}) => {
  const [showPdfModal, setShowPdfModal] = useState(false);

  const handleExtractFields = () => {
    console.log('Extract fields placeholder - not implemented yet');
    alert('Fältextraheringsfunktionen kommer snart!');
  };

  const handleViewPdf = () => {
    console.log('View PDF placeholder - not implemented yet');
    setShowPdfModal(true);
  };

  const formatDate = (date: string | Date | undefined): string => {
    if (!date) return 'Okänt datum';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('sv-SE');
  };

  return (
    <div className="h-full bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-6">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
          <div className="w-10" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-4">
          {/* PDF Template Info */}
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <div className="flex items-start mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">PDF-mall uppladdad</h2>
                <p className="text-sm text-gray-600">
                  Uppladdad {formatDate(project.created_at || project.createdAt)}
                </p>
              </div>
            </div>

            <button
              onClick={handleViewPdf}
              className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <ExternalLink className="w-5 h-5 mr-2" />
              Visa PDF
            </button>
          </div>

          {/* Field Extraction Section */}
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">
              Extrahera formulärfält från PDF
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Identifiera automatiskt formulärfält i din uppladdade PDF-mall.
            </p>
            <button
              onClick={handleExtractFields}
              className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Extrahera fält
            </button>
          </div>

          {/* Form Fields Section */}
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Formulärfält</h2>
            <div className="bg-gray-50 rounded-lg p-6 text-center">
              <p className="text-gray-600 text-sm">
                Inga fält ännu. Extrahera fält för att börja.
              </p>
            </div>
          </div>

          {/* Coming Soon Features */}
          <div className="bg-white rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Kommande funktioner</h2>
            <div className="space-y-3">
              <button
                disabled
                className="w-full px-4 py-3 bg-gray-200 text-gray-500 rounded-lg cursor-not-allowed flex items-center justify-center"
              >
                <span className="mr-2">🎤</span>
                Fyll i med röst (kommer snart)
              </button>
              <button
                disabled
                className="w-full px-4 py-3 bg-gray-200 text-gray-500 rounded-lg cursor-not-allowed flex items-center justify-center"
              >
                <span className="mr-2">📄</span>
                Generera ifyllt PDF-dokument (kommer snart)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* PDF Modal */}
      {showPdfModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">PDF-förhandsgranskning</h2>
              <button
                onClick={() => setShowPdfModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-6">
              <div className="bg-gray-100 rounded-lg p-8 text-center">
                <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">
                  PDF-visning kommer snart. För tillfället används mallens ID: {project.document_template_id}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
