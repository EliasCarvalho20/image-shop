/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect } from 'react';
import { LockClosedIcon, LockOpenIcon, ResizeIcon, MagicWandIcon, UpscaleIcon } from './icons';

interface ResizePanelProps {
  imageWidth: number;
  imageHeight: number;
  onApplyResize: (width: number, height: number) => void;
  onApplyExpand: (width: number, height: number, prompt: string) => void;
  onApplyUpscale: (scaleFactor: number) => void;
  isLoading: boolean;
}

type Mode = 'scale' | 'expand' | 'upscale';

const ResizePanel: React.FC<ResizePanelProps> = ({
  imageWidth,
  imageHeight,
  onApplyResize,
  onApplyExpand,
  onApplyUpscale,
  isLoading,
}) => {
  const [mode, setMode] = useState<Mode>('scale');
  const [width, setWidth] = useState(imageWidth);
  const [height, setHeight] = useState(imageHeight);
  const [keepAspectRatio, setKeepAspectRatio] = useState(true);
  const [expandPrompt, setExpandPrompt] = useState('');
  const [scaleFactor, setScaleFactor] = useState(2);

  // Reset local state when the source image dimensions change
  useEffect(() => {
    setWidth(imageWidth);
    setHeight(imageHeight);
  }, [imageWidth, imageHeight]);

  const handleWidthChange = (newWidth: number) => {
    setWidth(newWidth);
    if (keepAspectRatio) {
      const aspectRatio = imageWidth / imageHeight;
      setHeight(Math.round(newWidth / aspectRatio));
    }
  };

  const handleHeightChange = (newHeight: number) => {
    setHeight(newHeight);
    if (keepAspectRatio) {
      const aspectRatio = imageWidth / imageHeight;
      setWidth(Math.round(newHeight * aspectRatio));
    }
  };

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    // Reset dimensions to original when switching modes to avoid confusion
    setWidth(imageWidth);
    setHeight(imageHeight);
    setKeepAspectRatio(true);
  };

  const handleApply = () => {
    if (mode === 'scale') {
      onApplyResize(width, height);
    } else if (mode === 'expand') {
      onApplyExpand(width, height, expandPrompt);
    } else {
      onApplyUpscale(scaleFactor);
    }
  };
  
  const isApplyDisabled = isLoading || (mode === 'scale' && width === imageWidth && height === imageHeight);
  const isExpandInvalid = width < imageWidth || height < imageHeight;

  return (
    <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-6 flex flex-col gap-5 animate-fade-in backdrop-blur-sm">
      <div className="p-1 bg-gray-900/50 rounded-lg flex w-full">
        <button
          onClick={() => handleModeChange('scale')}
          className={`w-1/3 py-2 px-4 rounded-md text-base font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${mode === 'scale' ? 'bg-blue-600 text-white shadow' : 'text-gray-300 hover:bg-white/10'}`}
        >
          <ResizeIcon className="w-5 h-5" />
          Scale
        </button>
        <button
          onClick={() => handleModeChange('expand')}
          className={`w-1/3 py-2 px-4 rounded-md text-base font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${mode === 'expand' ? 'bg-blue-600 text-white shadow' : 'text-gray-300 hover:bg-white/10'}`}
        >
          <MagicWandIcon className="w-5 h-5" />
          Magic Expand
        </button>
        <button
          onClick={() => handleModeChange('upscale')}
          className={`w-1/3 py-2 px-4 rounded-md text-base font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${mode === 'upscale' ? 'bg-blue-600 text-white shadow' : 'text-gray-300 hover:bg-white/10'}`}
        >
          <UpscaleIcon className="w-5 h-5" />
          AI Upscale
        </button>
      </div>
      
      {mode !== 'upscale' && (
        <div className="animate-fade-in">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-5 pt-5">
            <div className="flex-1 w-full">
                <label htmlFor="width" className="block text-sm font-medium text-gray-400 mb-1">Width</label>
                <div className="relative">
                    <input
                        id="width"
                        type="number"
                        value={width}
                        onChange={(e) => handleWidthChange(parseInt(e.target.value) || 0)}
                        min={mode === 'expand' ? imageWidth : 1}
                        className="w-full bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-3 pr-12 focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                        disabled={isLoading}
                    />
                    <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-500">px</span>
                </div>
            </div>
            
            <div className="self-center pt-6">
                <button 
                    onClick={() => setKeepAspectRatio(!keepAspectRatio)}
                    className="p-3 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors text-gray-300 hover:text-white"
                    aria-label={keepAspectRatio ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
                >
                    {keepAspectRatio ? <LockClosedIcon className="w-5 h-5" /> : <LockOpenIcon className="w-5 h-5" />}
                </button>
            </div>

            <div className="flex-1 w-full">
                <label htmlFor="height" className="block text-sm font-medium text-gray-400 mb-1">Height</label>
                 <div className="relative">
                    <input
                        id="height"
                        type="number"
                        value={height}
                        onChange={(e) => handleHeightChange(parseInt(e.target.value) || 0)}
                        min={mode === 'expand' ? imageHeight : 1}
                        className="w-full bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-3 pr-12 focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                        disabled={isLoading}
                    />
                     <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-gray-500">px</span>
                </div>
            </div>
          </div>
          {mode === 'expand' && (
            <div className="flex flex-col gap-2 animate-fade-in pt-2 mt-4">
                <label htmlFor="expandPrompt" className="block text-sm font-medium text-gray-400">
                    Describe what to fill the new area with (optional)
                </label>
                <input
                    id="expandPrompt"
                    type="text"
                    value={expandPrompt}
                    onChange={(e) => setExpandPrompt(e.target.value)}
                    placeholder="e.g., continue the sandy beach and blue sky"
                    className="w-full bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none transition"
                    disabled={isLoading}
                />
                 {isExpandInvalid && <p className="text-sm text-yellow-400 text-center mt-2">New dimensions must be larger than original.</p>}
            </div>
          )}
        </div>
      )}

      {mode === 'upscale' && (
        <div className="flex flex-col items-center gap-4 pt-4 animate-fade-in">
            <h3 className="text-lg font-semibold text-gray-300">AI Upscale</h3>
            <p className="text-sm text-gray-400 -mt-2">Intelligently increase image resolution and detail.</p>
            
            <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-400">Scale Factor:</span>
                {[2, 4].map(factor => (
                    <button
                        key={factor}
                        onClick={() => setScaleFactor(factor)}
                        disabled={isLoading}
                        className={`px-6 py-2 rounded-md text-base font-semibold transition-all duration-200 active:scale-95 disabled:opacity-50 ${
                            scaleFactor === factor
                            ? 'bg-gradient-to-br from-blue-600 to-blue-500 text-white shadow-md shadow-blue-500/20' 
                            : 'bg-white/10 hover:bg-white/20 text-gray-200'
                        }`}
                    >
                        {factor}x
                    </button>
                ))}
            </div>

            <div className="text-center mt-4 p-4 bg-gray-900/50 rounded-lg w-full max-w-sm">
                <p className="text-gray-400 text-sm">Original: <span className="font-mono text-gray-200">{imageWidth} x {imageHeight}</span></p>
                <p className="text-blue-300 text-md font-semibold">New Size: <span className="font-mono text-white">{imageWidth * scaleFactor} x {imageHeight * scaleFactor}</span></p>
            </div>
        </div>
      )}

      <button
        onClick={handleApply}
        disabled={isApplyDisabled || (mode === 'expand' && isExpandInvalid)}
        className="w-full mt-4 bg-gradient-to-br from-green-600 to-green-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-gray-600 disabled:to-gray-500 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
      >
        Apply {mode === 'scale' ? 'Scale' : mode === 'expand' ? 'Expand' : 'Upscale'}
      </button>
    </div>
  );
};

export default ResizePanel;
