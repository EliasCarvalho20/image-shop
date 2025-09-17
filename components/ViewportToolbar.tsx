/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { HandPanIcon, BullseyeIcon, ZoomInIcon, ZoomOutIcon, ResetViewIcon, EyeIcon } from './icons';

interface ViewportToolbarProps {
  interactionMode: 'pan' | 'select';
  onSetInteractionMode: (mode: 'pan' | 'select') => void;
  isPanModeAvailable: boolean;
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  isComparing: boolean;
  onToggleCompare: () => void;
  canCompare: boolean;
}

const ViewportToolbar: React.FC<ViewportToolbarProps> = ({
  interactionMode,
  onSetInteractionMode,
  isPanModeAvailable,
  scale,
  onZoomIn,
  onZoomOut,
  onResetView,
  isComparing,
  onToggleCompare,
  canCompare,
}) => {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-4 bg-gray-900/60 border border-gray-700/80 rounded-lg p-1 backdrop-blur-sm animate-fade-in">
      {isPanModeAvailable && (
        <div className="flex items-center gap-1 p-1 bg-black/20 rounded-md">
          <button 
            onClick={() => onSetInteractionMode('select')} 
            className={`p-2 rounded-md transition-colors ${interactionMode === 'select' ? 'text-white bg-blue-600' : 'text-gray-300 hover:text-white hover:bg-white/10'}`} 
            aria-label="Select tool"
            title="Select Tool (for hotspots)"
          >
            <BullseyeIcon className="w-5 h-5" />
          </button>
          <button 
            onClick={() => onSetInteractionMode('pan')} 
            className={`p-2 rounded-md transition-colors ${interactionMode === 'pan' ? 'text-white bg-blue-600' : 'text-gray-300 hover:text-white hover:bg-white/10'}`}
            aria-label="Pan tool"
            title="Pan Tool (drag to move image)"
          >
            <HandPanIcon className="w-5 h-5" />
          </button>
        </div>
      )}
      
      <div className="flex items-center gap-1">
        <button onClick={onZoomOut} className="p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-md transition-colors" aria-label="Zoom out">
          <ZoomOutIcon className="w-5 h-5" />
        </button>
        <div className="px-3 py-1 text-sm font-semibold text-gray-200 w-16 text-center tabular-nums">
          {Math.round(scale * 100)}%
        </div>
        <button onClick={onZoomIn} className="p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-md transition-colors" aria-label="Zoom in">
          <ZoomInIcon className="w-5 h-5" />
        </button>
        <div className="w-px h-6 bg-gray-600 mx-1"></div>
        <button onClick={onResetView} className="p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-md transition-colors" aria-label="Reset view">
          <ResetViewIcon className="w-5 h-5" />
        </button>
      </div>

      {canCompare && (
        <>
        <div className="w-px h-6 bg-gray-600"></div>
        <button 
          onClick={onToggleCompare} 
          className={`p-2 rounded-md transition-colors flex items-center gap-2 ${isComparing ? 'text-white bg-blue-600' : 'text-gray-300 hover:text-white hover:bg-white/10'}`}
          aria-label="Compare with original"
          title="Compare with original"
        >
          <EyeIcon className="w-5 h-5" />
        </button>
        </>
      )}
    </div>
  );
};

export default ViewportToolbar;
