
import React, { useState, useEffect } from 'react';
import { ProductionItem, ExportConfig } from '../types';
import { generateSheetSVG } from '../utils/export';

interface ProductionModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ProductionItem[];
  onRemoveItem: (id: string) => void;
}

const DownloadIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
);

const TrashIcon = () => (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
);

const ProductionModal: React.FC<ProductionModalProps> = ({ isOpen, onClose, items, onRemoveItem }) => {
  const [config, setConfig] = useState<ExportConfig>({
    format: 'SVG',
    addBridges: true,
    inverted: false, // Default to False (Black lines on transparent). True = Print mode (White on Black)
    bridgeSizeMm: 0.5,
    sheetWidth: 210, // A4
    sheetHeight: 297,
    itemSize: 50,
    spacing: 5
  });

  const [svgPreview, setSvgPreview] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
        const svg = generateSheetSVG(items, config);
        setSvgPreview(svg);
    }
  }, [items, config, isOpen]);

  const handleDownload = () => {
      const blob = new Blob([svgPreview], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `opticlab_production_${new Date().toISOString().slice(0,10)}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-[#0a0a0a] border border-white/10 w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl flex overflow-hidden">
        
        {/* LEFT: Configuration & List */}
        <div className="w-1/3 border-r border-white/10 flex flex-col bg-white/5">
            <div className="p-4 border-b border-white/10 flex justify-between items-center">
                <h2 className="text-sm font-bold text-science-400 uppercase tracking-widest">OpticFab Queue</h2>
                <span className="text-[10px] bg-science-900/50 text-science-300 px-2 py-1 rounded-full border border-science-800/30">{items.length} Items</span>
            </div>

            {/* Config Form */}
            <div className="p-4 border-b border-white/10 space-y-4 overflow-y-auto">
                <div>
                    <label className="text-[10px] text-gray-500 uppercase font-bold block mb-2">Export Mode</label>
                    <div className="flex bg-black/40 p-1 rounded border border-white/10">
                        <button 
                            onClick={() => setConfig({...config, inverted: false, addBridges: true})}
                            className={`flex-1 py-1.5 text-[10px] rounded transition-all ${!config.inverted ? 'bg-emerald-600 text-white shadow' : 'text-gray-500'}`}
                        >
                            LASER CUT / ETCH
                        </button>
                        <button 
                            onClick={() => setConfig({...config, inverted: true, addBridges: false})}
                            className={`flex-1 py-1.5 text-[10px] rounded transition-all ${config.inverted ? 'bg-white text-black shadow' : 'text-gray-500'}`}
                        >
                            PRINT / NEGATIVE
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-[9px] text-gray-500 uppercase block mb-1">Sheet W (mm)</label>
                        <input type="number" value={config.sheetWidth} onChange={e => setConfig({...config, sheetWidth: parseInt(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded p-1.5 text-xs text-white" />
                    </div>
                    <div>
                        <label className="text-[9px] text-gray-500 uppercase block mb-1">Sheet H (mm)</label>
                        <input type="number" value={config.sheetHeight} onChange={e => setConfig({...config, sheetHeight: parseInt(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded p-1.5 text-xs text-white" />
                    </div>
                    <div>
                        <label className="text-[9px] text-gray-500 uppercase block mb-1">Item Size (mm)</label>
                        <input type="number" value={config.itemSize} onChange={e => setConfig({...config, itemSize: parseInt(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded p-1.5 text-xs text-white" />
                    </div>
                    <div>
                        <label className="text-[9px] text-gray-500 uppercase block mb-1">Spacing (mm)</label>
                        <input type="number" value={config.spacing} onChange={e => setConfig({...config, spacing: parseInt(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded p-1.5 text-xs text-white" />
                    </div>
                </div>
                
                {!config.inverted && (
                    <div>
                        <label className="text-[9px] text-gray-500 uppercase block mb-1">Bridge Size (mm)</label>
                        <input type="number" step="0.1" value={config.bridgeSizeMm} onChange={e => setConfig({...config, bridgeSizeMm: parseFloat(e.target.value)})} className="w-full bg-black/40 border border-white/10 rounded p-1.5 text-xs text-white" />
                        <p className="text-[9px] text-gray-600 mt-1 italic">Keeps center pieces attached for stencils.</p>
                    </div>
                )}
            </div>

            {/* Queue List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {items.length === 0 && (
                    <div className="text-center py-10 text-gray-600 text-xs italic">Queue is empty.<br/>Add apertures from the main panel.</div>
                )}
                {items.map((item) => (
                    <div key={item.id} className="flex justify-between items-center bg-black/20 p-2 rounded border border-white/5 group hover:border-science-500/30 transition-colors">
                        <div>
                            <div className="text-xs font-bold text-gray-300">{item.name}</div>
                            <div className="text-[10px] text-gray-500 font-mono">{item.aperture.type} • {item.aperture.diameter}mm</div>
                        </div>
                        <button onClick={() => onRemoveItem(item.id)} className="text-gray-600 hover:text-red-400 p-1">
                            <TrashIcon />
                        </button>
                    </div>
                ))}
            </div>
        </div>

        {/* RIGHT: Preview */}
        <div className="flex-1 flex flex-col bg-[#111] relative">
            <div className="absolute top-4 right-4 flex gap-2 z-10">
                <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-bold border border-white/10 transition-colors">
                    Close
                </button>
                <button onClick={handleDownload} className="px-4 py-2 rounded-lg bg-science-600 hover:bg-science-500 text-white text-xs font-bold shadow-lg shadow-science-900/50 flex items-center gap-2 transition-colors">
                    <DownloadIcon /> Export SVG
                </button>
            </div>

            <div className="flex-1 overflow-auto flex items-center justify-center p-8 bg-tech-grid">
                <div 
                    className="bg-white shadow-2xl transition-all duration-500 origin-center"
                    style={{ 
                        width: `${config.sheetWidth}mm`, 
                        height: `${config.sheetHeight}mm`,
                        // Scale visually to fit screen if needed, simplified here
                        transform: 'scale(0.8)' 
                    }}
                    dangerouslySetInnerHTML={{ __html: svgPreview }}
                />
            </div>
            
            <div className="p-2 bg-black border-t border-white/10 text-[10px] text-gray-500 font-mono text-center">
                SHEET PREVIEW • {config.sheetWidth}mm x {config.sheetHeight}mm • VECTOR OUTPUT
            </div>
        </div>
      </div>
    </div>
  );
};

export default ProductionModal;
