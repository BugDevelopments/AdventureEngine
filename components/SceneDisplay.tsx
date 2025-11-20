import React, { useState } from 'react';
import { Hotspot } from '../types';

interface SceneDisplayProps {
  imageUrl: string | null;
  isLoading: boolean;
  loadingMessage: string;
  hotspots: Hotspot[];
  onSceneClick: (x: number, y: number, targetName?: string) => void;
}

export const SceneDisplay: React.FC<SceneDisplayProps> = ({ 
  imageUrl, 
  isLoading, 
  loadingMessage,
  hotspots,
  onSceneClick
}) => {
  const [hoveredHotspot, setHoveredHotspot] = useState<string | null>(null);
  const [containerRect, setContainerRect] = useState<DOMRect | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setContainerRect(rect);
    
    // Calculate mouse percentage
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    // Check intersection
    const hit = hotspots.find(h => 
      h && h.box && Array.isArray(h.box) && h.box.length === 4 &&
      y >= h.box[0] && x >= h.box[1] && y <= h.box[2] && x <= h.box[3]
    );
    
    setHoveredHotspot(hit ? hit.name : null);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRect) return;
    const x = ((e.clientX - containerRect.left) / containerRect.width) * 100;
    const y = ((e.clientY - containerRect.top) / containerRect.height) * 100;

    // Check intersection
    const hit = hotspots.find(h => 
      h && h.box && Array.isArray(h.box) && h.box.length === 4 &&
      y >= h.box[0] && x >= h.box[1] && y <= h.box[2] && x <= h.box[3]
    );

    onSceneClick(x, y, hit?.name);
  };

  return (
    <div 
      className="w-full h-full bg-black relative overflow-hidden group cursor-crosshair select-none"
      onMouseMove={handleMouseMove}
      onClick={handleClick}
    >
      {imageUrl ? (
        <img 
          src={imageUrl} 
          alt="Scene" 
          className={`w-full h-full object-fill image-pixelated transition-opacity duration-500 ${isLoading ? 'opacity-50 grayscale' : 'opacity-100'}`}
          style={{ imageRendering: 'pixelated' }}
          draggable={false}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-[#0a0a0a]">
          <div className="text-green-900 animate-pulse text-6xl">NO SIGNAL</div>
        </div>
      )}

      {/* Debug: Show Hotspots (Optional: make outline transparent usually) */}
      {hotspots.map((h, i) => {
        // Safety check before rendering
        if (!h || !Array.isArray(h.box) || h.box.length < 4) return null;
        
        return (
          <div
            key={i}
            style={{
              top: `${h.box[0]}%`,
              left: `${h.box[1]}%`,
              height: `${h.box[2] - h.box[0]}%`,
              width: `${h.box[3] - h.box[1]}%`,
            }}
            className={`absolute z-20 border-2 ${hoveredHotspot === h.name ? 'border-green-400 bg-green-400/20' : 'border-transparent'} transition-colors`}
          >
             {hoveredHotspot === h.name && (
               <span className="absolute -top-6 left-0 bg-black text-green-400 text-xs px-1 border border-green-600 uppercase whitespace-nowrap z-50">
                 {h.name}
               </span>
             )}
          </div>
        );
      })}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-40 backdrop-blur-sm pointer-events-none">
          <div className="bg-blue-900 border-2 border-gray-400 p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-md text-center">
             <p className="text-white font-bold uppercase text-xl animate-pulse mb-2">Processing...</p>
             <p className="text-yellow-300 text-sm">{loadingMessage}</p>
          </div>
        </div>
      )}

      {/* Hover Label for Mouse */}
      {hoveredHotspot && !isLoading && (
         <div className="absolute bottom-2 right-2 text-green-400 font-bold text-xl bg-black/50 px-2 pointer-events-none">
           {hoveredHotspot}
         </div>
      )}
    </div>
  );
};