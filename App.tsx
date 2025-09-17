/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import JSZip from 'jszip';
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
import { UndoIcon, RedoIcon, EyeIcon, DownloadIcon, MagicWandIcon, CollectionIcon } from './components/icons';
import StartScreen from './components/StartScreen';
import Filmstrip from './components/Filmstrip';
import ViewportToolbar from './components/ViewportToolbar';

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
type InteractionMode = 'pan' | 'select';

// Represents the state of a single image, including its edit history
type ImageState = {
  id: string;
  history: File[];
  historyIndex: number;
  isProcessing: boolean;
  error: string | null;
  name: string;
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
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('select');
  
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
  const [isAnimatingEdit, setIsAnimatingEdit] = useState(false);
  const [isFilmstripVisible, setIsFilmstripVisible] = useState(true);

  // Refs
  const imgRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });
  const urlToRevokeRef = useRef<string | null>(null);

  // --- DERIVED STATE ---
  const currentImageState = imageList[currentImageIndex] ?? null;
  const currentImage = currentImageState?.history[currentImageState.historyIndex] ?? null;
  const originalImage = currentImageState?.history[0] ?? null;

  // URL State Management
  const [visibleImageUrl, setVisibleImageUrl] = useState<string | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);

  // Effect to reset UI state ONLY when switching to a different image
  useEffect(() => {
    setEditHotspot(null);
    setDisplayHotspot(null);
    setIsComparing(false);
    setCrop(undefined);
    setCompletedCrop(undefined);
    resetView();
  }, [currentImageState?.id]); // A stable ID is a great dependency for this

  // Effect to preload the current image and update its visible URL to prevent flickering
  useEffect(() => {
    let newUrl: string | null = null;
    let isCancelled = false;

    const preloadAndUpdate = async () => {
        if (!currentImage) {
            setVisibleImageUrl(prevUrl => {
                if (prevUrl && prevUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(prevUrl);
                }
                return null;
            });
            return;
        }

        newUrl = URL.createObjectURL(currentImage);

        // Preload the image in memory before showing it
        const image = new Image();
        image.src = newUrl;
        
        try {
            await image.decode();
            if (!isCancelled) {
                setVisibleImageUrl(prevUrl => {
                    // Schedule the *previous* URL for revocation, don't revoke it immediately.
                    if (prevUrl && prevUrl.startsWith('blob:')) {
                        urlToRevokeRef.current = prevUrl;
                    }
                    return newUrl;
                });
            } else {
                // If a new image was selected before this one finished loading, clean up the created URL
                URL.revokeObjectURL(newUrl);
            }
        } catch(error) {
            console.error("Failed to preload image.", error);
            if (!isCancelled) {
                setVisibleImageUrl(prevUrl => {
                    if (prevUrl && prevUrl.startsWith('blob:')) {
                       urlToRevokeRef.current = prevUrl;
                    }
                    return newUrl;
                });
            } else {
                 if (newUrl) URL.revokeObjectURL(newUrl);
            }
        }
    };
    
    preloadAndUpdate();

    return () => {
        isCancelled = true;
    };
  }, [currentImage]);
  
  // Effect for the original image URL, used in comparison mode
  useEffect(() => {
    if (originalImage) {
      const url = URL.createObjectURL(originalImage);
      setOriginalImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setOriginalImageUrl(null);
    }
  }, [originalImage]);

  // Set a sensible default interaction mode when the active tool tab changes.
  useEffect(() => {
    if (activeTab === 'retouch' || activeTab === 'compose') {
        setInteractionMode('select');
    } else {
        setInteractionMode('pan');
    }
  }, [activeTab]);

  // Keyboard navigation for batch mode
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (imageList.length <= 1) return; // Only in batch mode
          if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
              return; // Don't navigate if user is typing
          }

          if (e.key === 'ArrowRight') {
              setCurrentImageIndex(i => (i + 1) % imageList.length);
          } else if (e.key === 'ArrowLeft') {
              setCurrentImageIndex(i => (i - 1 + imageList.length) % imageList.length);
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [imageList.length]);

  const canUndo = currentImageState && currentImageState.historyIndex > 0;
  const canRedo = currentImageState && currentImageState.historyIndex < currentImageState.history.length - 1;

  // --- CORE FUNCTIONS ---
  
  // Triggers a brief animation to provide feedback on image changes.
  const onEditComplete = useCallback(() => {
      setIsAnimatingEdit(true);
      setTimeout(() => {
          setIsAnimatingEdit(false);
      }, 500); // Must match animation duration in CSS
  }, []);

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
    onEditComplete();
  }, [onEditComplete]);

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

          // Animate if the currently viewed image was the one being processed.
          if (imageIndex === currentImageIndex) {
            onEditComplete();
          }

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
        await processImage(imageList[i], i, prompt, generateAdjustedImage, 'retouch-all');

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
        const composedImageUrl = await generateComposedImage(currentImage, complementImage, userPrompt, editHotspot);
        const newImageFile = dataURLtoFile(composedImageUrl, `composed-${Date.now()}.png`);
        addImageToHistory(newImageFile, currentImageIndex);
        setEditHotspot(null);
        setDisplayHotspot(null);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to compose the images. ${errorMessage}`);
        console.error(err);
    } finally {
        setIsLoading(false);
    }
  }, [currentImage, addImageToHistory, currentImageIndex, editHotspot]);

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
        onEditComplete();
    }
  }, [canUndo, currentImageIndex, onEditComplete]);
  
  const handleRedo = useCallback(() => {
    if (canRedo) {
        setImageList(prev => prev.map((img, idx) => 
            idx === currentImageIndex ? { ...img, historyIndex: img.historyIndex + 1 } : img
        ));
        onEditComplete();
    }
  }, [canRedo, currentImageIndex, onEditComplete]);

  const handleReset = useCallback(() => {
    if (currentImageState && currentImageState.history.length > 0) {
        setImageList(prev => prev.map((img, idx) => 
            idx === currentImageIndex ? { ...img, historyIndex: 0 } : img
        ));
        setError(null);
        onEditComplete();
    }
  }, [currentImageState, currentImageIndex, onEditComplete]);

  const handleDownload = useCallback(async () => {
    if (!currentImage) return;

    try {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(currentImage);
      
      const originalName = currentImage.name.replace(/\.[^/.]+$/, "") || 'download';
      link.download = `${originalName}-pixshop-edited.png`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
        
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to process image for download. ${errorMessage}`);
        console.error(err);
    }
  }, [currentImage]);

  const handleDownloadAll = useCallback(async () => {
    if (imageList.length <= 1) return;

    setIsLoading(true);
    setGlobalLoadingMessage("Preparing zip file...");
    setError(null);

    try {
      const zip = new JSZip();
      for (let i = 0; i < imageList.length; i++) {
        const imageState = imageList[i];
        const currentVersion = imageState.history[imageState.historyIndex];
        const originalName = currentVersion.name.replace(/\.[^/.]+$/, "") || `image-${i}`;
        const fileName = `${originalName}-pixshop-edited.png`;
        setGlobalLoadingMessage(`Zipping ${i+1} of ${imageList.length}: ${fileName}`);
        zip.file(fileName, currentVersion);
      }
      
      const content = await zip.generateAsync({ type: "blob" });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = "pixshop-edited-images.zip";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

    } catch(err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`Failed to create zip file. ${errorMessage}`);
      console.error(err);
    } finally {
      setIsLoading(false);
      setGlobalLoadingMessage(null);
    }
  }, [imageList]);
  
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
    
    if (interactionMode === 'select' && (activeTab === 'retouch' || activeTab === 'compose')) {
        const img = imgRef.current;
        const imageContainer = imageContainerRef.current;
        if (!img || !imageContainer) return;

        // --- Calculate AI Hotspot (relative to original image file) ---

        // 1. Get the real on-screen position and size of the <img> element.
        //    getBoundingClientRect() correctly accounts for all CSS transforms (scale, translate).
        const imgRect = img.getBoundingClientRect();
        const { width: renderedWidth, height: renderedHeight } = imgRect;
        if (renderedWidth === 0 || renderedHeight === 0) return;

        // 2. Get click position relative to the on-screen <img> element.
        const clickXInImgTag = e.clientX - imgRect.left;
        const clickYInImgTag = e.clientY - imgRect.top;

        // 3. Account for letterboxing within the <img> element due to 'object-contain'.
        const { naturalWidth, naturalHeight } = img;
        const naturalAspectRatio = naturalWidth / naturalHeight;
        const renderedAspectRatio = renderedWidth / renderedHeight;

        let visibleImageWidth, visibleImageHeight, offsetX, offsetY;
        if (naturalAspectRatio > renderedAspectRatio) { // Wider than container -> letterbox top/bottom
            visibleImageWidth = renderedWidth;
            visibleImageHeight = renderedWidth / naturalAspectRatio;
            offsetX = 0;
            offsetY = (renderedHeight - visibleImageHeight) / 2;
        } else { // Taller than container -> letterbox left/right
            visibleImageHeight = renderedHeight;
            visibleImageWidth = renderedHeight * naturalAspectRatio;
            offsetX = (renderedWidth - visibleImageWidth) / 2;
            offsetY = 0;
        }

        // 4. Find click position relative to the actual visible image content.
        const clickXOnVisible = clickXInImgTag - offsetX;
        const clickYOnVisible = clickYInImgTag - offsetY;

        // 5. Check if the click was outside the visible image (in the letterbox area).
        if (clickXOnVisible < 0 || clickXOnVisible > visibleImageWidth || clickYOnVisible < 0 || clickYOnVisible > visibleImageHeight) {
            return; 
        }

        // 6. Convert the click on the visible (and scaled) image back to the original image's coordinates.
        const scaleFactorFromNaturalToVisible = visibleImageWidth / naturalWidth;
        const originalX = Math.round(clickXOnVisible / scaleFactorFromNaturalToVisible);
        const originalY = Math.round(clickYOnVisible / scaleFactorFromNaturalToVisible);
        
        setEditHotspot({ x: originalX, y: originalY });

        // --- Calculate Display Hotspot (for the blue dot UI) ---

        // 1. Get the on-screen position of the container that holds the image and the hotspot dot.
        const containerRect = imageContainer.getBoundingClientRect();

        // 2. Get click position relative to this container.
        const clickXInContainer = e.clientX - containerRect.left;
        const clickYInContainer = e.clientY - containerRect.top;
        
        // 3. The container is scaled by the 'scale' state. To position the dot inside the
        //    unscaled container, we reverse the scaling effect on the click coordinates.
        const displayX = clickXInContainer / scale;
        const displayY = clickYInContainer / scale;

        setDisplayHotspot({ x: displayX, y: displayY });

        return; // This was a hotspot click, not a pan.
    }

    if (activeTab !== 'crop' && activeTab !== 'resize') {
        isPanning.current = true;
        panStart.current = {
          x: e.clientX - translate.x,
          y: e.clientY - translate.y,
        };
        setIsGrabbing(true);
    }
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
      if (isComparing) return 'ew-resize';
      if (interactionMode === 'select' && (activeTab === 'retouch' || activeTab === 'compose')) return 'crosshair';
      if (isGrabbing) return 'grabbing';
      return 'grab';
  };

  const renderEditor = () => {
    // This handler now safely revokes the old blob URL after the new one is loaded.
    const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        if (urlToRevokeRef.current) {
            URL.revokeObjectURL(urlToRevokeRef.current);
            urlToRevokeRef.current = null;
        }
        const { naturalWidth, naturalHeight } = e.currentTarget;
        setImageDimensions(prevDims => {
            if (prevDims?.width === naturalWidth && prevDims?.height === naturalHeight) {
                return prevDims;
            }
            return { width: naturalWidth, height: naturalHeight };
        });
    };

    return (
      <div className="flex flex-col md:flex-row min-h-screen">
          <aside className="w-full md:w-[28rem] flex-shrink-0 bg-gray-900/50 border-r border-gray-700/50 flex flex-col p-4 gap-4 max-h-screen">
              <Header />
              
              <nav aria-label="Editing Tools">
                <div role="tablist" className="w-full bg-gray-800/80 border border-gray-700/80 rounded-lg p-2 grid grid-cols-2 gap-2 backdrop-blur-sm">
                    {(['retouch', 'compose', 'crop', 'resize', 'adjust', 'filters', 'advanced'] as Tab[]).map(tab => (
                         <button
                            key={tab}
                            onClick={() => handleSetActiveTab(tab)}
                            role="tab"
                            aria-selected={activeTab === tab}
                            aria-controls="panel-content"
                            className={`w-full capitalize font-semibold py-4 px-5 rounded-md transition-all duration-200 text-base ${
                                activeTab === tab 
                                ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg shadow-cyan-500/40' 
                                : 'text-gray-300 hover:text-white hover:bg-white/10'
                            } ${tab === 'advanced' ? 'col-span-2' : ''}`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
              </nav>
              
              <div id="panel-content" role="tabpanel" className="flex-grow min-h-0 overflow-y-auto">
                  {activeTab === 'retouch' && (
                      <div className="flex flex-col items-center gap-5">
                          <p className="text-base text-gray-300">
                            {imageList.length > 1
                                ? 'For a precise edit, click an image area. For a broad change, just type and apply to all.'
                                : (editHotspot ? 'Great! Now describe your localized edit below.' : 'Click an area on the image to make a precise edit.')
                            }
                          </p>
                          {editHotspot && !isLoading && (
                            <div className="w-full text-center p-2 bg-gray-900/50 rounded-lg animate-fade-in border border-gray-700/80">
                                <span className="text-sm font-medium text-gray-300">Target Coordinates: </span>
                                <span className="text-sm font-mono text-blue-300">{editHotspot.x}, {editHotspot.y}</span>
                            </div>
                          )}
                          <div className="w-full flex flex-col items-center gap-4">
                              <input
                                  type="text"
                                  value={prompt}
                                  onChange={(e) => setPrompt(e.target.value)}
                                  placeholder={
                                    imageList.length > 1 
                                      ? "e.g., 'remove skin blemishes'"
                                      : (editHotspot ? "e.g., 'change shirt to blue'" : "First click a point")
                                  }
                                  className="flex-grow bg-gray-800 border border-gray-700 text-gray-200 rounded-lg p-4 text-base focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60"
                                  disabled={isLoading}
                              />
                              <div className="w-full flex flex-col items-center gap-3">
                                  <button 
                                      onClick={handleGenerate}
                                      className="w-full bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-6 text-base rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                                      disabled={isLoading || !prompt.trim() || !editHotspot}
                                  >
                                      Apply to Current
                                  </button>
                                  {imageList.length > 1 && (
                                      <button 
                                          onClick={handleRetouchAll}
                                          className="w-full bg-gradient-to-br from-green-600 to-green-500 text-white font-bold py-4 px-6 text-base rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner disabled:from-green-800 disabled:to-green-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
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
                  {activeTab === 'compose' && <ComposePanel onApplyCompose={handleApplyCompose} isLoading={isLoading} hotspot={editHotspot} />}
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

              <div className="flex-shrink-0 pt-4 border-t border-gray-700/50 flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                        onClick={handleUndo}
                        disabled={!canUndo || isLoading}
                        className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-4 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-white/5"
                        aria-label="Undo last action"
                    >
                        <UndoIcon className="w-5 h-5 mr-2" />
                        Undo
                    </button>
                    <button 
                        onClick={handleRedo}
                        disabled={!canRedo || isLoading}
                        className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-4 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-white/5"
                        aria-label="Redo last action"
                    >
                        <RedoIcon className="w-5 h-5 mr-2" />
                        Redo
                    </button>
                  </div>

                  <button
                      onClick={handleAutoEnhance}
                      disabled={isLoading}
                      className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-4 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-white/5"
                      aria-label="Auto enhance image"
                  >
                      <MagicWandIcon className="w-5 h-5 mr-2" />
                      Auto-Enhance
                  </button>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                        onClick={handleReset}
                        disabled={!canUndo || isLoading}
                        className="text-center bg-transparent border border-white/20 text-gray-200 font-semibold py-3 px-4 rounded-md transition-all duration-200 ease-in-out hover:bg-white/10 hover:border-white/30 active:scale-95 text-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-transparent"
                      >
                        Reset
                    </button>
                    <button 
                        onClick={resetAllState}
                         disabled={isLoading}
                        className="text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-4 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-sm"
                    >
                        Upload New
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-1 gap-3">
                    <button 
                        onClick={handleDownload}
                         disabled={isLoading}
                        className="flex items-center justify-center w-full bg-gradient-to-br from-green-600 to-green-500 text-white font-bold py-3 px-5 rounded-md transition-all duration-300 ease-in-out shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-sm"
                    >
                        <DownloadIcon className="w-5 h-5 mr-2" />
                        Download Image
                    </button>
                    {imageList.length > 1 && (
                      <button 
                          onClick={handleDownloadAll}
                           disabled={isLoading}
                          className="flex items-center justify-center w-full bg-gradient-to-br from-teal-600 to-teal-500 text-white font-bold py-3 px-5 rounded-md transition-all duration-300 ease-in-out shadow-lg shadow-teal-500/20 hover:shadow-xl hover:shadow-teal-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-sm"
                      >
                          <CollectionIcon className="w-5 h-5 mr-2" />
                          Download All
                      </button>
                    )}
                  </div>
              </div>
          </aside>
          
          <main className="flex-grow w-0 flex items-center justify-center p-4 md:p-8">
              <div 
                  ref={viewportRef}
                  className="relative w-full h-full shadow-2xl rounded-xl overflow-hidden bg-black/20 flex items-center justify-center"
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

                  <ViewportToolbar
                      interactionMode={interactionMode}
                      onSetInteractionMode={setInteractionMode}
                      isPanModeAvailable={activeTab === 'retouch' || activeTab === 'compose'}
                      scale={scale}
                      onZoomIn={() => handleZoom('in')}
                      onZoomOut={() => handleZoom('out')}
                      onResetView={resetView}
                      isComparing={isComparing}
                      onToggleCompare={handleToggleCompare}
                      canCompare={canUndo}
                  />
                  
                  {activeTab === 'crop' ? (
                    <ReactCrop 
                      crop={crop} 
                      onChange={c => setCrop(c)} 
                      onComplete={c => setCompletedCrop(c)}
                      aspect={aspect}
                      className="flex items-center justify-center"
                    >
                      <img 
                          ref={imgRef}
                          key={`crop-${currentImageState?.id}`}
                          src={visibleImageUrl ?? ''} 
                          alt="Crop this image"
                          onLoad={onImageLoad}
                          style={{ maxHeight: '80vh' }}
                          className="w-auto h-auto object-contain rounded-xl"
                      />
                    </ReactCrop>
                  ) : (
                      <>
                      <div 
                          className="w-full h-full flex items-center justify-center"
                          style={{ 
                              transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`, 
                              transformOrigin: 'center center' 
                          }}
                      >
                          <div className="relative" ref={imageContainerRef}>
                              {/* The original image is always rendered to act as a stable base for size calculations */}
                              {originalImageUrl && (
                                  <img
                                      key={`original-${currentImageState?.id}`}
                                      src={originalImageUrl}
                                      alt="Original"
                                      style={{ 
                                        maxHeight: '80vh',
                                        // When not comparing, it's hidden but still sizes the container
                                        visibility: (isComparing && canUndo) ? 'visible' : 'hidden'
                                      }}
                                      className="w-auto h-auto object-contain rounded-xl pointer-events-none"
                                  />
                              )}
                              {/* The visible image is absolutely positioned to overlay the original */}
                              {visibleImageUrl && (
                                <img
                                    ref={imgRef}
                                    key={`main-${currentImageState?.id}`}
                                    src={visibleImageUrl}
                                    alt="Current"
                                    onLoad={onImageLoad}
                                    style={{
                                      clipPath: isComparing && canUndo ? `inset(0 ${100 - sliderPosition}% 0 0)` : 'none',
                                      maxHeight: '80vh',
                                    }}
                                    className={`absolute inset-0 w-full h-full object-contain pointer-events-none ${isAnimatingEdit ? 'animate-image-appear' : ''}`}
                                />
                              )}
                              
                              {isComparing && canUndo && (
                                 <ComparisonSlider position={sliderPosition} />
                              )}

                              {displayHotspot && !isLoading && (activeTab === 'retouch' || activeTab === 'compose') && (
                                  <div 
                                      key={`${displayHotspot.x}-${displayHotspot.y}`}
                                      className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-10 h-10"
                                      style={{ left: `${displayHotspot.x}px`, top: `${displayHotspot.y}px` }}
                                  >
                                      {/* Ripple animates from center outwards */}
                                      <div 
                                          className="absolute w-full h-full rounded-full border-2 border-blue-400"
                                          style={{ animation: 'hotspot-select-ripple 0.6s ease-out forwards' }}
                                      ></div>
                                      {/* The persistent center dot */}
                                      <div 
                                          className="absolute rounded-full w-6 h-6 bg-blue-500/60 border-2 border-white shadow-lg"
                                      ></div>
                                  </div>
                              )}
                          </div>
                      </div>
                      </>
                  )}
              </div>
          </main>
      </div>
    );
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
        <div className="min-h-screen flex flex-col items-center justify-center">
            <StartScreen 
                onSingleFileSelect={handleSingleImageUpload} 
                onMultipleFileSelect={handleMultipleImageUpload}
            />
        </div>
      );
    }
    
    return renderEditor();
  };
  
  return (
    <div className="min-h-screen text-gray-100">
      {renderContent()}
      {imageList.length > 1 && (
        <Filmstrip
          images={imageList}
          currentIndex={currentImageIndex}
          onSelect={setCurrentImageIndex}
          isVisible={isFilmstripVisible}
          onToggleVisibility={() => setIsFilmstripVisible(v => !v)}
        />
      )}
    </div>
  );
};

export default App;