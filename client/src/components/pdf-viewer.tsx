import { useState, useEffect, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, ExternalLink, Eye, EyeOff } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  url: string;
  filename: string;
}

export function PDFViewer({ url, filename }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [sidebarWidth, setSidebarWidth] = useState(200);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfViewRef = useRef<HTMLDivElement>(null);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  // Sidebar resize handlers
  const handleSidebarResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizingSidebar(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingSidebar || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;

      // Constrain sidebar width between 150px and 400px
      if (newWidth >= 150 && newWidth <= 400) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
    };

    if (isResizingSidebar) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar]);

  // PDF panning handlers
  const handlePanStart = (e: React.MouseEvent) => {
    if (!pdfViewRef.current) return;
    setIsPanning(true);
    setPanStart({
      x: e.clientX + pdfViewRef.current.scrollLeft,
      y: e.clientY + pdfViewRef.current.scrollTop,
    });
  };

  useEffect(() => {
    const handlePanMove = (e: MouseEvent) => {
      if (!isPanning || !pdfViewRef.current) return;

      e.preventDefault();
      const dx = panStart.x - e.clientX;
      const dy = panStart.y - e.clientY;

      pdfViewRef.current.scrollLeft = dx;
      pdfViewRef.current.scrollTop = dy;
    };

    const handlePanEnd = () => {
      setIsPanning(false);
    };

    if (isPanning) {
      document.addEventListener('mousemove', handlePanMove);
      document.addEventListener('mouseup', handlePanEnd);
      document.body.style.cursor = 'grabbing';
    } else {
      document.body.style.cursor = '';
    }

    return () => {
      document.removeEventListener('mousemove', handlePanMove);
      document.removeEventListener('mouseup', handlePanEnd);
      document.body.style.cursor = '';
    };
  }, [isPanning, panStart]);

  const goToPrevPage = () => setCurrentPage(prev => Math.max(prev - 1, 1));
  const goToNextPage = () => setCurrentPage(prev => Math.min(prev + 1, numPages));
  const zoomIn = () => setScale(prev => Math.min(prev + 0.25, 3));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));

  return (
    <div className="w-full h-[600px] bg-muted/30 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 bg-background border-b border-border">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowSidebar(!showSidebar)}
            title={showSidebar ? "Hide thumbnails" : "Show thumbnails"}
          >
            {showSidebar ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={goToPrevPage}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm">
            Page {currentPage} of {numPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={goToNextPage}
            disabled={currentPage >= numPages}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={zoomOut} disabled={scale <= 0.5}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-sm">{Math.round(scale * 100)}%</span>
          <Button size="sm" variant="outline" onClick={zoomIn} disabled={scale >= 3}>
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(url, '_blank')}
          >
            <ExternalLink className="w-4 h-4 mr-1" />
            Open
          </Button>
        </div>
      </div>

      {/* PDF Content */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        {/* Thumbnail Sidebar */}
        {showSidebar && (
          <>
            <div
              className="bg-muted/50 overflow-y-auto border-r border-border"
              style={{ width: `${sidebarWidth}px` }}
            >
              <Document file={url} onLoadSuccess={onDocumentLoadSuccess}>
                {Array.from(new Array(numPages), (_, index) => (
                  <div
                    key={`thumb_${index + 1}`}
                    className={`p-2 cursor-pointer hover:bg-accent transition-colors ${
                      currentPage === index + 1 ? 'bg-accent' : ''
                    }`}
                    onClick={() => setCurrentPage(index + 1)}
                  >
                    <Page
                      pageNumber={index + 1}
                      width={sidebarWidth - 16}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                    <p className="text-xs text-center mt-1">{index + 1}</p>
                  </div>
                ))}
              </Document>
            </div>

            {/* Resizer Handle */}
            <div
              className={`w-1 bg-border hover:bg-primary cursor-col-resize transition-colors ${
                isResizingSidebar ? 'bg-primary' : ''
              }`}
              onMouseDown={handleSidebarResizeStart}
            />
          </>
        )}

        {/* Main PDF View */}
        <div
          ref={pdfViewRef}
          className="flex-1 overflow-auto bg-muted/20 flex items-start justify-center p-4 select-none"
          style={{ cursor: scale > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default' }}
          onMouseDown={scale > 1 ? handlePanStart : undefined}
        >
          <Document file={url}>
            <Page
              pageNumber={currentPage}
              scale={scale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
            />
          </Document>
        </div>
      </div>
    </div>
  );
}
