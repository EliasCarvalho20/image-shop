/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import { generateEditedImage, generateFilteredImage, generateAdjustedImage, generateAutoEnhancedImage, generateExpandedImage, generateUpscaledImage, generateComposedImage } from './services/geminiService';
import Header from './components/Header';
import Spinner from './components/Spinner';
import FilterPanel from './components/FilterPanel';
import AdjustmentPanel from './components/AdjustmentPanel';
import CropPanel from './components/CropPanel';
import ResizePanel from './components/ResizePanel';
import AdvancedPanel from './components/AdvancedPanel';
import ComposePanel from './components/ComposePanel';
import ComparisonSlider from './components/ComparisonSlider';
import { UndoIcon, RedoIcon, EyeIcon, ZoomInIcon, ZoomOutIcon, ResetViewIcon, DownloadIcon, MagicWandIcon, CollectionIcon } from './components/icons';
import StartScreen from './components/StartScreen';
import Filmstrip from './components/Filmstrip';

// Helper to convert a data URL string to a File object
const dataURLtoFile = (dataurl: string, filename: string): File => {
    const arr = dataurl.split(',');
    if (arr.length < 2) throw new Error("Invalid data URL");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Could not parse MIME type from data URL");

    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, {type:mime});
}

type Tab = 'retouch' | 'compose' | 'crop' | 'resize' | 'adjust' | 'filters' | 'advanced';

// Represents the state of a single image, including its edit history
type ImageState = {
  id: string;
  history: File[];
  historyIndex: number;
  isProcessing: boolean;
  error: string | null;
  name: string;
};


// --- Zoom/Pan Controls Component ---
interface ZoomPanControlsProps {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
}
const ZoomPanControls: React.FC<ZoomPanControlsProps> = ({ scale, onZoomIn, onZoomOut, onResetView }) => {
  return (
    <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1 bg-gray-900/60 border border-gray-700/80 rounded-lg p-1 backdrop-blur-sm animate-fade-in">
      <button onClick={onZoomOut} className="p-2 text-gray-300 hover:text-white hover:bg-white/10 rounded-md transition-colors" aria-label="Zoom out">
        <ZoomOutIcon className="w-5 h-5" />
      </button>
      <div className="px-3 py-2 text-sm font-semibold text-gray-200 w-16 text-center tabular-nums">
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
  );
};


const App: React.FC = () => {
  // --- STATE MANAGEMENT ---
  const [imageList, setImageList] = useState<ImageState[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  
  // Shared state
  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [globalLoadingMessage, setGlobalLoadingMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // UI State
  const [editHotspot, setEditHotspot] = useState<{ x: number, y: number } | null>(null);
  const [displayHotspot, setDisplayHotspot] = useState<{ x: number, y: number } | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('retouch');
  
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>();
  
  const [isComparing, setIsComparing] = useState<boolean>(false);
  const [sliderPosition, setSliderPosition] = useState<number>(50);
  const [isSliderDragging, setIsSliderDragging] = useState<boolean>(false);

  const [scale, setScale] = useState<number>(1);
  const [translate, setTranslate] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
  const [isGrabbing, setIsGrabbing] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{width: number, height: number} | null>(null);

  // Refs
  const imgRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });

  // --- DERIVED STATE ---
  const currentImageState = imageList[currentImageIndex] ?? null;
  const currentImage = currentImageState?.history[currentImageState.historyIndex] ?? null;
  const originalImage = currentImageState?.history[0] ?? null;

  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);

  useEffect(() => {
    // Reset interaction state when switching images
    setEditHotspot(null);
    setDisplayHotspot(null);
    setIsComparing(false);
    setCrop(undefined);
    setCompletedCrop(undefined);
    resetView();
    
    if (currentImage) {
      const url = URL.createObjectURL(currentImage);
      setCurrentImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setCurrentImageUrl(null);
    }
  }, [currentImage]); // Dependency on currentImage directly
  
  useEffect(() => {
    if (originalImage) {
      const url = URL.createObjectURL(originalImage);
      setOriginalImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setOriginalImageUrl(null);
    }
  }, [originalImage]);

  const canUndo = currentImageState && currentImageState.historyIndex > 0;
  const canRedo = currentImageState && currentImageState.historyIndex < currentImageState.history.length - 1;

  // --- CORE FUNCTIONS ---
  const resetView = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);
  
  const resetAllState = useCallback(() => {
      setImageList([]);
      setCurrentImageIndex(0);
      setError(null);
      setPrompt('');
      setEditHotspot(null);
      setDisplayHotspot(null);
      setImageDimensions(null);
      setIsComparing(false);
      setGlobalLoadingMessage(null);
      resetView();
  }, [resetView]);

  const addImageToHistory = useCallback((newImageFile: File, index: number) => {
    setImageList(prevList => {
        const newList = [...prevList];
        const targetImage = newList[index];
        if (targetImage) {
            const newHistory = targetImage.history.slice(0, targetImage.historyIndex + 1);
            newHistory.push(newImageFile);
            newList[index] = {
                ...targetImage,
                history: newHistory,
                historyIndex: newHistory.length - 1,
            };
        }
        return newList;
    });
    setCrop(undefined);
    setCompletedCrop(undefined);
  }, []);

  const handleSingleImageUpload = useCallback((file: File) => {
    resetAllState();
    const newImage: ImageState = {
      id: `${file.name}-${file.lastModified}`,
      name: file.name,
      history: [file],
      historyIndex: 0,
      isProcessing: false,
      error: null,
    };
    setImageList([newImage]);
  }, [resetAllState]);

  const handleMultipleImageUpload = useCallback((files: FileList) => {
    resetAllState();
    const newImages: ImageState[] = Array.from(files).map(file => ({
      id: `${file.name}-${file.lastModified}-${Math.random()}`,
      name: file.name,
      history: [file],
      historyIndex: 0,
      isProcessing: false,
      error: null,
    }));
    setImageList(newImages);
  }, [resetAllState]);
  
  const processImage = async (
      imageState: ImageState,
      imageIndex: number,
      prompt: string,
      serviceFn: (file: File, prompt: string) => Promise<string>,
      operationName: string
  ) => {
      setImageList(prev => prev.map((img, idx) => 
          idx === imageIndex ? { ...img, isProcessing: true, error: null } : img
      ));

      try {
          const currentFile = imageState.history[imageState.historyIndex];
          const resultUrl = await serviceFn(currentFile, prompt);
          const newImageFile = dataURLtoFile(resultUrl, `${operationName}-${Date.now()}.png`);
          
          // Use a functional update to add to history based on the latest state
          setImageList(prevList => {
              const newList = [...prevList];
              const targetImage = newList[imageIndex];
              if (targetImage) {
                  const newHistory = targetImage.history.slice(0, targetImage.historyIndex + 1);
                  newHistory.push(newImageFile);
                  newList[imageIndex] = {
                      ...targetImage,
                      history: newHistory,
                      historyIndex: newHistory.length - 1,
                      isProcessing: false,
                  };
              }
              return newList;
          });

      } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
          console.error(`Batch processing failed for ${imageState.name}:`, err);
          setImageList(prev => prev.map((img, idx) => 
              idx === imageIndex ? { ...img, error: errorMessage, isProcessing: false } : img
          ));
      }
  };


  const handleApplyToAll = useCallback(async (prompt: string, type: 'filter' | 'adjustment') => {
    setIsLoading(true);
    setError(null);
    const serviceFn = type === 'filter' ? generateFilteredImage : generateAdjustedImage;
    
    for (let i = 0; i < imageList.length; i++) {
        setGlobalLoadingMessage(`Processing ${i + 1} of ${imageList.length}...`);
        const imageToProcess = imageList[i];
        await processImage(imageToProcess, i, prompt, serviceFn, type);

        // Add a small delay between processing each image to be kinder to the API, especially in a batch.
        if (i < imageList.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500)); 
        }
    }
    
    setIsLoading(false);
    setGlobalLoadingMessage(null);
  }, [imageList]);

  const handleGenerate = useCallback(async () => {
    if (!currentImage) return;
    if (!prompt.trim()) { setError('Please enter a description for your edit.'); return; }
    if (!editHotspot) { setError('Please click on the image to select an area to edit.'); return; }

    setIsLoading(true);
    setError(null);
    
    try {
        const editedImageUrl = await generateEditedImage(currentImage, prompt, editHotspot);
        const newImageFile = dataURLtoFile(editedImageUrl, `edited-${Date.now()}.png`);
        addImageToHistory(newImageFile, currentImageIndex);
        setEditHotspot(null);
        setDisplayHotspot(null);
        setPrompt('');
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to generate the image. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, prompt, editHotspot, addImageToHistory, currentImageIndex]);
  
  const handleRetouchAll = useCallback(async () => {
    if (!prompt.trim()) {
      setError('Please enter a description for the retouch to apply to all images.');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    for (let i = 0; i < imageList.length; i++) {
        setGlobalLoadingMessage(`Retouching ${i + 1} of ${imageList.length}...`);
        // Use generateAdjustedImage for a global retouch effect on each image.
        await processImage(imageList[i], i, prompt, generateAdjustedImage, 'retouch-all');

        // Add a small delay between processing each image to be kinder to the API, especially in a batch.
        if (i < imageList.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    setIsLoading(false);
    setGlobalLoadingMessage(null);
    setPrompt('');
  }, [imageList, prompt]);

  const handleApplyFilter = useCallback(async (filterPrompt: string) => {
    if (!currentImage) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
        const filteredImageUrl = await generateFilteredImage(currentImage, filterPrompt);
        const newImageFile = dataURLtoFile(filteredImageUrl, `filtered-${Date.now()}.png`);
        addImageToHistory(newImageFile, currentImageIndex);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to apply the filter. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, addImageToHistory, currentImageIndex]);
  
  const handleApplyAdjustment = useCallback(async (adjustmentPrompt: string) => {
    if (!currentImage) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
        const adjustedImageUrl = await generateAdjustedImage(currentImage, adjustmentPrompt);
        const newImageFile = dataURLtoFile(adjustedImageUrl, `adjusted-${Date.now()}.png`);
        addImageToHistory(newImageFile, currentImageIndex);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to apply the adjustment. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, addImageToHistory, currentImageIndex]);

  const handleAutoEnhance = useCallback(async () => {
    if (!currentImage) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
        const enhancedImageUrl = await generateAutoEnhancedImage(currentImage);
        const newImageFile = dataURLtoFile(enhancedImageUrl, `enhanced-${Date.now()}.png`);
        addImageToHistory(newImageFile, currentImageIndex);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to auto-enhance the image. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, addImageToHistory, currentImageIndex]);

  const handleApplyCompose = useCallback(async (complementImage: File, userPrompt: string) => {
    if (!currentImage) return;
    setIsLoading(true);
    setError(null);
    try {
        const composedImageUrl = await generateComposedImage(currentImage, complementImage, userPrompt);
        const newImageFile = dataURLtoFile(composedImageUrl, `composed-${Date.now()}.png`);
        addImageToHistory(newImageFile, currentImageIndex);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to compose the images. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, addImageToHistory, currentImageIndex]);

  const handleApplyCrop = useCallback(() => {
    if (!completedCrop || !imgRef.current) {
        setError('Please select an area to crop.');
        return;
    }

    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    
    canvas.width = completedCrop.width;
    canvas.height = completedCrop.height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        setError('Could not process the crop.');
        return;
    }

    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = completedCrop.width * pixelRatio;
    canvas.height = completedCrop.height * pixelRatio;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      completedCrop.width,
      completedCrop.height,
    );
    
    const croppedImageUrl = canvas.toDataURL('image/png');
    const newImageFile = dataURLtoFile(croppedImageUrl, `cropped-${Date.now()}.png`);
    addImageToHistory(newImageFile, currentImageIndex);

  }, [completedCrop, addImageToHistory, currentImageIndex]);

  const handleApplyResize = useCallback(async (newWidth: number, newHeight: number) => {
    if (!currentImage) return;
    setIsLoading(true);
    setError(null);
    try {
      const imageUrl = URL.createObjectURL(currentImage);
      const image = new Image();
      image.src = imageUrl;
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      canvas.width = newWidth;
      canvas.height = newHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');
      
      ctx.drawImage(image, 0, 0, newWidth, newHeight);
      URL.revokeObjectURL(imageUrl);
      
      const resizedDataUrl = canvas.toDataURL('image/png');
      const newImageFile = dataURLtoFile(resizedDataUrl, `resized-${Date.now()}.png`);
      addImageToHistory(newImageFile, currentImageIndex);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`Failed to resize image. ${errorMessage}`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [currentImage, addImageToHistory, currentImageIndex]);

  const handleApplyExpand = useCallback(async (newWidth: number, newHeight: number, prompt: string) => {
    if (!currentImage) return;
    setIsLoading(true);
    setError(null);
    try {
      const expandedImageUrl = await generateExpandedImage(currentImage, newWidth, newHeight, prompt);
      const newImageFile = dataURLtoFile(expandedImageUrl, `expanded-${Date.now()}.png`);
      addImageToHistory(newImageFile, currentImageIndex);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`Failed to expand the image. ${errorMessage}`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [currentImage, addImageToHistory, currentImageIndex]);

  const handleApplyUpscale = useCallback(async (scaleFactor: number) => {
    if (!currentImage) return;
    setIsLoading(true);
    setError(null);
    try {
      const upscaledImageUrl = await generateUpscaledImage(currentImage, scaleFactor);
      const newImageFile = dataURLtoFile(upscaledImageUrl, `upscaled-${Date.now()}.png`);
      addImageToHistory(newImageFile, currentImageIndex);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`Failed to upscale the image. ${errorMessage}`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [currentImage, addImageToHistory, currentImageIndex]);

  const handleUndo = useCallback(() => {
    if (canUndo) {
        setImageList(prev => prev.map((img, idx) => 
            idx === currentImageIndex ? { ...img, historyIndex: img.historyIndex - 1 } : img
        ));
    }
  }, [canUndo, currentImageIndex]);
  
  const handleRedo = useCallback(() => {
    if (canRedo) {
        setImageList(prev => prev.map((img, idx) => 
            idx === currentImageIndex ? { ...img, historyIndex: img.historyIndex + 1 } : img
        ));
    }
  }, [canRedo, currentImageIndex]);

  const handleReset = useCallback(() => {
    if (currentImageState && currentImageState.history.length > 0) {
        setImageList(prev => prev.map((img, idx) => 
            idx === currentImageIndex ? { ...img, historyIndex: 0 } : img
        ));
        setError(null);
    }
  }, [currentImageState, currentImageIndex]);

  const handleDownload = useCallback(async () => {
    if (!currentImage) return;

    setIsLoading(true);

    try {
        const imageUrl = URL.createObjectURL(currentImage);
        const image = new Image();
        image.src = imageUrl;
        await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = (err) => reject(err);
        });
        URL.revokeObjectURL(imageUrl);

        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error("Could not get canvas context. Your browser may not support this feature.");
        }
        ctx.drawImage(image, 0, 0);

        const mimeType = 'image/png';
        const finalDataUrl = canvas.toDataURL(mimeType);
        
        const link = document.createElement('a');
        link.href = finalDataUrl;
        
        const originalName = currentImage.name.replace(/\.[^/.]+$/, "") || 'download';
        link.download = `${originalName}-pixshop-edited.png`;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to process image for download. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage]);
  
  const handleToggleCompare = () => {
      setIsComparing(prev => !prev);
      setSliderPosition(50);
  };

  const handleSetActiveTab = (tab: Tab) => {
    if (tab === 'crop' || tab === 'resize') {
        resetView();
    }
    setActiveTab(tab);
  };
  
  const handleZoom = (direction: 'in' | 'out') => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    
    const rect = viewport.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const zoomFactor = 1.2;
    const oldScale = scale;
    const newScale = direction === 'in' ? oldScale * zoomFactor : oldScale / zoomFactor;
    const clampedScale = Math.max(0.2, Math.min(newScale, 5));

    const newTranslateX = centerX - (centerX - translate.x) * (clampedScale / oldScale);
    const newTranslateY = centerY - (centerY - translate.y) * (clampedScale / oldScale);
    
    setScale(clampedScale);
    setTranslate({ x: newTranslateX, y: newTranslateY });
  };
  
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (activeTab === 'crop' || activeTab === 'resize' || isComparing) return;
    e.preventDefault();
    const viewport = viewportRef.current;
    if (!viewport) return;

    const rect = viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = 1.1;
    const oldScale = scale;
    const newScale = e.deltaY < 0 ? oldScale * zoomFactor : oldScale / zoomFactor;
    const clampedScale = Math.max(0.2, Math.min(newScale, 5));

    const newTranslateX = mouseX - (mouseX - translate.x) * (clampedScale / oldScale);
    const newTranslateY = mouseY - (mouseY - translate.y) * (clampedScale / oldScale);
    
    setScale(clampedScale);
    setTranslate({ x: newTranslateX, y: newTranslateY });
  };

  useEffect(() => {
    const getClientX = (e: MouseEvent | TouchEvent): number => {
        if (e instanceof MouseEvent) {
            return e.clientX;
        }
        return e.touches[0]?.clientX ?? 0;
    };

    const handleMove = (e: MouseEvent | TouchEvent) => {
        if (!isSliderDragging || !imageContainerRef.current) return;

        const rect = imageContainerRef.current.getBoundingClientRect();
        const clientX = getClientX(e);
        if (clientX === 0 && e instanceof TouchEvent && e.touches.length === 0) return;

        const x = clientX - rect.left;
        let newPosition = (x / rect.width) * 100;
        newPosition = Math.max(0, Math.min(100, newPosition));
        setSliderPosition(newPosition);
    };

    const handleEnd = () => {
        setIsSliderDragging(false);
    };

    if (isSliderDragging) {
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleEnd);
        window.addEventListener('touchmove', handleMove);
        window.addEventListener('touchend', handleEnd);
    }

    return () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleEnd);
        window.removeEventListener('touchmove', handleMove);
        window.removeEventListener('touchend', handleEnd);
    };
  }, [isSliderDragging]);
  
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;

    if (isComparing) {
        setIsSliderDragging(true);
        if (imageContainerRef.current) {
            const rect = imageContainerRef.current.getBoundingClientRect();
            const x = e.clientX - rect.left;
            let newPosition = (x / rect.width) * 100;
            newPosition = Math.max(0, Math.min(100, newPosition));
            setSliderPosition(newPosition);
        }
        e.preventDefault();
        return;
    }
    
    if (activeTab === 'retouch') {
        const viewport = viewportRef.current;
        const img = imgRef.current;
        if (!viewport || !img) return;

        const viewportRect = viewport.getBoundingClientRect();
        const clickX = e.clientX - viewportRect.left;
        const clickY = e.clientY - viewportRect.top;

        const pointOnImageX = (clickX - translate.x) / scale;
        const pointOnImageY = (clickY - translate.y) / scale;
        
        const { clientWidth, clientHeight } = img;
        
        if (pointOnImageX >= 0 && pointOnImageX <= clientWidth && pointOnImageY >= 0 && pointOnImageY <= clientHeight) {
            setDisplayHotspot({ x: pointOnImageX, y: pointOnImageY });
    
            const { naturalWidth, naturalHeight } = img;
            const scaleToNaturalX = naturalWidth / clientWidth;
            const scaleToNaturalY = naturalHeight / clientHeight;
    
            const originalX = Math.round(pointOnImageX * scaleToNaturalX);
            const originalY = Math.round(pointOnImageY * scaleToNaturalY);
    
            setEditHotspot({ x: originalX, y: originalY });
        }
    }

    if (activeTab === 'crop' || activeTab === 'resize') return;
    isPanning.current = true;
    panStart.current = {
      x: e.clientX - translate.x,
      y: e.clientY - translate.y,
    };
    setIsGrabbing(true);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isComparing) {
        setIsSliderDragging(true);
        if (imageContainerRef.current && e.touches[0]) {
            const rect = imageContainerRef.current.getBoundingClientRect();
            const x = e.touches[0].clientX - rect.left;
            let newPosition = (x / rect.width) * 100;
            newPosition = Math.max(0, Math.min(100, newPosition));
            setSliderPosition(newPosition);
        }
        e.preventDefault();
        return;
    }
  };
  
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning.current) return;
    const newTranslateX = e.clientX - panStart.current.x;
    const newTranslateY = e.clientY - panStart.current.y;
    setTranslate({ x: newTranslateX, y: newTranslateY });
  };
  
  const handleMouseUpOrLeave = () => {
    isPanning.current = false;
    setIsGrabbing(false);
  };
  
  const getCursor = () => {
    if (activeTab === 'crop' || activeTab === 'resize') return 'default';
    if (isGrabbing) return 'grabbing';
    if (isComparing) return 'ew-resize';
    if (activeTab === 'retouch') return 'crosshair';
    return 'grab';
  };

  const renderContent = () => {
    if (error) {
       return (
           <div className="text-center animate-fade-in bg-red-500/10 border border-red-500/20 p-8 rounded-lg max-w-2xl mx-auto flex flex-col items-center gap-4">
            <h2 className="text-2xl font-bold text-red-300">An Error Occurred</h2>
            <p className="text-md text-red-400">{error}</p>
            <button
                onClick={() => setError(null)}
                className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-lg text-md transition-colors"
              >
                Try Again
            </button>
          </div>
        );
    }

    if (imageList.length === 0) {
      return (
          <StartScreen 
              onSingleFileSelect={handleSingleImageUpload} 
              onMultipleFileSelect={handleMultipleImageUpload}
          />
      );
    }
    
    const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const { naturalWidth, naturalHeight } = e.currentTarget;
        setImageDimensions({ width: naturalWidth, height: naturalHeight });
    };

    const imageElement = (
        <img
            ref={imgRef}
            key={`main-${currentImageUrl}`}
            src={currentImageUrl ?? ''}
            alt="Current"
            onLoad={onImageLoad}
            style={{
              clipPath: isComparing ? `inset(0 ${100 - sliderPosition}% 0 0)` : 'none',
            }}
            className={`absolute top-0 left-0 w-full h-auto object-contain max-h-[60vh] rounded-xl pointer-events-none`}
        />
    );

    return (
      <div className="w-full max-w-7xl mx-auto flex flex-col items-center gap-6 animate-fade-in">
        <div 
            ref={viewportRef}
            className="relative w-full shadow-2xl rounded-xl overflow-hidden bg-black/20"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
            onTouchStart={handleTouchStart}
            style={{ cursor: getCursor() }}
        >
            {(isLoading || globalLoadingMessage) && (
                <div className="absolute inset-0 bg-black/70 z-50 flex flex-col items-center justify-center gap-4 animate-fade-in">
                    <Spinner />
                    <p className="text-gray-300">{globalLoadingMessage || 'AI is working its magic...'}</p>
                </div>
            )}
            
            {activeTab === 'crop' ? (
              <ReactCrop 
                crop={crop} 
                onChange={c => setCrop(c)} 
                onComplete={c => setCompletedCrop(c)}
                aspect={aspect}
                className="max-h-[60vh]"
              >
                <img 
                    ref={imgRef}
                    key={`crop-${currentImageUrl}`}
                    src={currentImageUrl ?? ''} 
                    alt="Crop this image"
                    onLoad={onImageLoad}
                    className="w-full h-auto object-contain max-h-[60vh] rounded-xl"
                />
              </ReactCrop>
            ) : (
                <>
                <div 
                    className="w-full h-full"
                    style={{ 
                        transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`, 
                        transformOrigin: 'top left' 
                    }}
                >
                    <div className="relative" ref={imageContainerRef}>
                        {originalImageUrl && (
                            <img
                                key={originalImageUrl}
                                src={originalImageUrl}
                                alt="Original"
                                className="w-full h-auto object-contain max-h-[60vh] rounded-xl pointer-events-none"
                            />
                        )}
                        {imageElement}
                        
                        {isComparing && canUndo && (
                           <ComparisonSlider position={sliderPosition} />
                        )}

                        {displayHotspot && !isLoading && activeTab === 'retouch' && (
                            <div 
                                className="absolute rounded-full w-6 h-6 bg-blue-500/50 border-2 border-white pointer-events-none -translate-x-1/2 -translate-y-1/2 z-10"
                                style={{ left: `${displayHotspot.x}px`, top: `${displayHotspot.y}px` }}
                            >
                                <div className="absolute inset-0 rounded-full w-6 h-6 animate-ping bg-blue-400"></div>
                            </div>
                        )}
                    </div>
                </div>
                {activeTab !== 'resize' && !isComparing && <ZoomPanControls onZoomIn={() => handleZoom('in')} onZoomOut={() => handleZoom('out')} onResetView={resetView} scale={scale} />}
                </>
            )}
        </div>
        
        <div className="w-full bg-gray-800/80 border border-gray-700/80 rounded-lg p-2 flex items-center justify-center gap-2 backdrop-blur-sm">
            {(['retouch', 'compose', 'crop', 'resize', 'adjust', 'filters', 'advanced'] as Tab[]).map(tab => (
                 <button
                    key={tab}
                    onClick={() => handleSetActiveTab(tab)}
                    className={`w-full capitalize font-semibold py-3 px-5 rounded-md transition-all duration-200 text-base ${
                        activeTab === tab 
                        ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg shadow-cyan-500/40' 
                        : 'text-gray-300 hover:text-white hover:bg-white/10'
                    }`}
                >
                    {tab}
                </button>
            ))}
        </div>
        
        <div className="w-full">
            {activeTab === 'retouch' && (
                <div className="flex flex-col items-center gap-4">
                    <p className="text-md text-gray-400">
                      {imageList.length > 1
                          ? 'For a precise edit, click an image area. For a broad change, just type and apply to all.'
                          : (editHotspot ? 'Great! Now describe your localized edit below.' : 'Click an area on the image to make a precise edit.')
                      }
                    </p>
                    <div className="w-full flex flex-col items-center gap-4">
                        <input
                            type="text"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={
                              imageList.length > 1 
                                ? "e.g., 'remove skin blemishes', then apply to all"
                                : (editHotspot ? "e.g., 'change my shirt color to blue'" : "First click a point on the image")
                            }
                            className="flex-grow bg-gray-800 border border-gray-700 text-gray-200 rounded-lg p-5 text-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isLoading}
                        />
                        <div className="w-full flex flex-col sm:flex-row items-center gap-2">
                            <button 
                                onClick={handleGenerate}
                                className="w-full bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-5 px-8 text-lg rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                                disabled={isLoading || !prompt.trim() || !editHotspot}
                            >
                                Apply to Current
                            </button>
                            {imageList.length > 1 && (
                                <button 
                                    onClick={handleRetouchAll}
                                    className="w-full bg-gradient-to-br from-green-600 to-green-500 text-white font-bold py-5 px-8 text-lg rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner disabled:from-green-800 disabled:to-green-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
                                    disabled={isLoading || !prompt.trim()}
                                >
                                    <CollectionIcon className="w-5 h-5" />
                                    Apply to All
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {activeTab === 'compose' && <ComposePanel onApplyCompose={handleApplyCompose} isLoading={isLoading} />}
            {activeTab === 'crop' && <CropPanel onApplyCrop={handleApplyCrop} onSetAspect={setAspect} isLoading={isLoading} isCropping={!!completedCrop?.width && completedCrop.width > 0} />}
            {activeTab === 'resize' && imageDimensions && (
                <ResizePanel 
                    imageWidth={imageDimensions.width}
                    imageHeight={imageDimensions.height}
                    onApplyResize={handleApplyResize}
                    onApplyExpand={handleApplyExpand}
                    onApplyUpscale={handleApplyUpscale}
                    isLoading={isLoading}
                />
            )}
            {activeTab === 'adjust' && <AdjustmentPanel onApplyAdjustment={handleApplyAdjustment} onApplyToAll={(p) => handleApplyToAll(p, 'adjustment')} isLoading={isLoading} batchMode={imageList.length > 1} />}
            {activeTab === 'filters' && <FilterPanel onApplyFilter={handleApplyFilter} onApplyToAll={(p) => handleApplyToAll(p, 'filter')} isLoading={isLoading} batchMode={imageList.length > 1} />}
            {activeTab === 'advanced' && <AdvancedPanel onApplyAdjustment={handleApplyAdjustment} onApplyToAll={(p) => handleApplyToAll(p, 'adjustment')} isLoading={isLoading} batchMode={imageList.length > 1}/>}
        </div>
        
        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <button 
                onClick={handleUndo}
                disabled={!canUndo || isLoading}
                className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-white/5"
                aria-label="Undo last action"
            >
                <UndoIcon className="w-5 h-5 mr-2" />
                Undo
            </button>
            <button 
                onClick={handleRedo}
                disabled={!canRedo || isLoading}
                className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-white/5"
                aria-label="Redo last action"
            >
                <RedoIcon className="w-5 h-5 mr-2" />
                Redo
            </button>
            
            <div className="h-6 w-px bg-gray-600 mx-1 hidden sm:block"></div>

            {canUndo && (
                <button 
                  onClick={handleToggleCompare}
                  className={`flex items-center justify-center text-center border font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out active:scale-95 text-base ${
                      isComparing 
                        ? 'bg-blue-600 text-white border-transparent shadow-md shadow-blue-500/30' 
                        : 'bg-white/10 border-white/20 text-gray-200 hover:bg-white/20 hover:border-white/30'
                  }`}
                  aria-label="Toggle comparison slider"
              >
                  <EyeIcon className="w-5 h-5 mr-2" />
                  Compare
              </button>
            )}

            <button
                onClick={handleAutoEnhance}
                disabled={isLoading}
                className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-white/5"
                aria-label="Auto enhance image"
            >
                <MagicWandIcon className="w-5 h-5 mr-2" />
                Auto-Enhance
            </button>

            <button 
                onClick={handleReset}
                disabled={!canUndo || isLoading}
                className="text-center bg-transparent border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/10 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-transparent"
              >
                Reset
            </button>
            <button 
                onClick={resetAllState}
                 disabled={isLoading}
                className="text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base"
            >
                Upload New
            </button>

            <button 
                onClick={handleDownload}
                 disabled={isLoading}
                className="flex items-center justify-center flex-grow sm:flex-grow-0 ml-auto bg-gradient-to-br from-green-600 to-green-500 text-white font-bold py-3 px-5 rounded-md transition-all duration-300 ease-in-out shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base"
            >
                <DownloadIcon className="w-5 h-5 mr-2" />
                Download Image
            </button>
        </div>
      </div>
    );
  };
  
  return (
    <div className="min-h-screen text-gray-100 flex flex-col">
      <Header />
      <main className={`flex-grow w-full max-w-[1600px] mx-auto p-4 md:p-8 flex flex-col justify-start ${imageList.length > 0 ? 'items-start' : 'items-center justify-center'}`}>
        {renderContent()}
      </main>
       {imageList.length > 1 && (
        <Filmstrip
          images={imageList}
          currentIndex={currentImageIndex}
          onSelect={setCurrentImageIndex}
        />
      )}
    </div>
  );
};

export default App;