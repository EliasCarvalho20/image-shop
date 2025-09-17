/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useEffect, useRef } from 'react';
import { DownloadIcon } from './icons';

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const DownloadModal: React.FC<DownloadModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  const handleClickOutside = (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
      onClose();
    }
  };
  
  const handleConfirmClick = () => {
      onConfirm();
  };

  if (!isOpen) return null;

  return (
    <div 
        className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center animate-fade-in"
        onClick={handleClickOutside}
        aria-modal="true"
        role="dialog"
    >
      <div 
        ref={modalRef} 
        className="bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-6 w-full max-w-md flex flex-col gap-6"
      >
        <h2 className="text-2xl font-bold text-gray-100 text-center">Download Image</h2>

        <div className="text-center p-4 bg-gray-900/50 rounded-lg">
            <p className="text-sm text-gray-400">Your image will be downloaded as a PNG file for the best quality.</p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4">
            <button
                onClick={onClose}
                className="text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base"
            >
                Cancel
            </button>
            <button
                onClick={handleConfirmClick}
                className="flex items-center justify-center gap-2 bg-gradient-to-br from-green-600 to-green-500 text-white font-bold py-3 px-5 rounded-md transition-all duration-300 ease-in-out shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base"
            >
                <DownloadIcon className="w-5 h-5" />
                Download
            </button>
        </div>
      </div>
    </div>
  );
};

export default DownloadModal;