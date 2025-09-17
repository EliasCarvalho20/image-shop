/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useCallback } from 'react';
import { UploadIcon, LayersIcon } from './icons';

interface ComposePanelProps {
  onApplyCompose: (complementImage: File, prompt: string) => void;
  isLoading: boolean;
}

const ComposePanel: React.FC<ComposePanelProps> = ({ onApplyCompose, isLoading }) => {
  const [complementImage, setComplementImage] = useState<File | null>(null);
  const [complementImageUrl, setComplementImageUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleFileChange = useCallback((file: File | null) => {
    if (file) {
      setComplementImage(file);
      const url = URL.createObjectURL(file);
      if (complementImageUrl) {
        URL.revokeObjectURL(complementImageUrl);
      }
      setComplementImageUrl(url);
    }
  }, [complementImageUrl]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileChange(e.target.files[0]);
    }
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleApply = () => {
    if (complementImage && prompt.trim()) {
      onApplyCompose(complementImage, prompt);
    }
  };

  return (
    <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 flex flex-col gap-4 animate-fade-in backdrop-blur-sm">
      <h3 className="text-lg font-semibold text-center text-gray-300">Compose Images</h3>
      <p className="text-sm text-gray-400 text-center -mt-2">Upload a second image to add it to your main image.</p>
      
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <label htmlFor="complement-upload" className="block text-sm font-medium text-gray-400 mb-2">Complement Image</label>
          {complementImageUrl ? (
            <div className="relative group">
              <img src={complementImageUrl} alt="Complement preview" className="w-full h-48 object-contain rounded-lg bg-black/20" />
              <div 
                className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-lg"
                onClick={() => document.getElementById('complement-upload')?.click()}
              >
                <span className="text-white font-semibold">Change Image</span>
              </div>
            </div>
          ) : (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
              onDragLeave={() => setIsDraggingOver(false)}
              className={`relative block w-full h-48 rounded-lg border-2 ${isDraggingOver ? 'border-blue-400' : 'border-dashed border-gray-600'} p-12 text-center hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
            >
              <UploadIcon className="mx-auto h-12 w-12 text-gray-500" />
              <span className="mt-2 block text-sm font-medium text-gray-400">
                Drag & drop a file or <button onClick={() => document.getElementById('complement-upload')?.click()} className="font-semibold text-blue-400 hover:text-blue-300">click to upload</button>
              </span>
            </div>
          )}
          <input id="complement-upload" type="file" className="hidden" accept="image/*" onChange={handleFileInputChange} />
        </div>
        
        <div className="flex-1 flex flex-col gap-2">
          <label htmlFor="compose-prompt" className="block text-sm font-medium text-gray-400">Instructions</label>
          <textarea
            id="compose-prompt"
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., 'add the cat onto the sofa in the living room'"
            className="flex-grow bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-4 focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60 text-base"
            disabled={isLoading || !complementImage}
          />
        </div>
      </div>

      <button
        onClick={handleApply}
        disabled={isLoading || !complementImage || !prompt.trim()}
        className="w-full mt-2 bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-gray-600 disabled:to-gray-500 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
      >
        <LayersIcon className="w-5 h-5" />
        Compose Images
      </button>
    </div>
  );
};

export default ComposePanel;
