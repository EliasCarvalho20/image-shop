/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useState, memo } from 'react';
import Spinner from './Spinner';

type ImageState = {
  id: string;
  history: File[];
  historyIndex: number;
  isProcessing: boolean;
  error: string | null;
  name: string;
};

interface FilmstripProps {
  images: ImageState[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

const Thumbnail: React.FC<{ imageState: ImageState, isActive: boolean, onClick: () => void }> = memo(({ imageState, isActive, onClick }) => {
    const [objectUrl, setObjectUrl] = useState<string | null>(null);
    const lastImageFile = imageState.history[imageState.historyIndex];

    useEffect(() => {
        let url: string | null = null;
        if (lastImageFile) {
            url = URL.createObjectURL(lastImageFile);
            setObjectUrl(url);
        }
        
        return () => {
            if (url) {
                URL.revokeObjectURL(url);
            }
        };
    }, [lastImageFile]);

    return (
        <button 
            onClick={onClick}
            className={`relative flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden transition-all duration-200 border-2 ${isActive ? 'border-blue-500 scale-105 shadow-lg' : 'border-transparent hover:border-gray-500'}`}
            aria-label={`Select image ${imageState.name}`}
            aria-current={isActive}
        >
            {objectUrl && <img src={objectUrl} alt={imageState.name} className="w-full h-full object-cover" />}
            
             {imageState.isProcessing && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-white animate-fade-in">
                    <Spinner />
                </div>
            )}
            
            {imageState.error && (
                <div className="absolute inset-0 bg-red-900/80 flex items-center justify-center text-center text-white animate-fade-in">
                    <p className="text-xs font-semibold">Error</p>
                </div>
            )}
        </button>
    );
});


const Filmstrip: React.FC<FilmstripProps> = ({ images, currentIndex, onSelect }) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 bg-gray-900/70 backdrop-blur-lg border-t border-gray-700/80">
        <div className="w-full max-w-7xl mx-auto p-3">
             <div className="flex items-center gap-3 overflow-x-auto pb-2">
                {images.map((image, index) => (
                    <Thumbnail
                        key={image.id}
                        imageState={image}
                        isActive={index === currentIndex}
                        onClick={() => onSelect(index)}
                    />
                ))}
            </div>
        </div>
    </div>
  );
};

export default Filmstrip;