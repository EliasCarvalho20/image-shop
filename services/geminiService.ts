/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

/**
 * Awaits a promise and retries it on failure with exponential backoff.
 * This is useful for handling transient network errors or temporary server issues (like 500 errors).
 * @param fn The async function to execute.
 * @param retries Number of retries.
 * @param initialDelay Initial delay in ms.
 * @returns The result of the async function.
 */
const withRetry = async <T>(
    fn: () => Promise<T>, 
    retries = 3, 
    initialDelay = 1000
): Promise<T> => {
    let lastError: Error | undefined;
    let delay = initialDelay;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;
            // Don't retry on client-side errors that won't resolve on their own.
            // This is a basic check; a more sophisticated check might inspect a status code if available.
            if (error instanceof Error && error.message.includes("blocked")) {
                console.error("Request blocked, not retrying.", error);
                throw error;
            }
            console.warn(`API call attempt ${i + 1} of ${retries} failed. Retrying in ${delay}ms...`, error);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
        }
    }
    console.error("All retry attempts failed.");
    throw lastError ?? new Error("All retry attempts failed.");
};


// Helper function to convert a File object to a Gemini API Part
const fileToPart = async (file: File): Promise<{ inlineData: { mimeType: string; data: string; } }> => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
    
    const arr = dataUrl.split(',');
    if (arr.length < 2) throw new Error("Invalid data URL");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Could not parse MIME type from data URL");
    
    const mimeType = mimeMatch[1];
    const data = arr[1];
    return { inlineData: { mimeType, data } };
};

// Helper to get image dimensions from a File object
const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
        const imageUrl = URL.createObjectURL(file);
        const image = new Image();
        image.src = imageUrl;
        image.onload = () => {
            URL.revokeObjectURL(imageUrl);
            resolve({ width: image.naturalWidth, height: image.naturalHeight });
        };
        image.onerror = (err) => {
            URL.revokeObjectURL(imageUrl);
            reject(err);
        };
    });
};

const handleApiResponse = (
    response: GenerateContentResponse,
    context: string // e.g., "edit", "filter", "adjustment"
): string => {
    // 1. Check for prompt blocking first
    if (response.promptFeedback?.blockReason) {
        const { blockReason, blockReasonMessage } = response.promptFeedback;
        const errorMessage = `Request was blocked. Reason: ${blockReason}. ${blockReasonMessage || ''}`;
        console.error(errorMessage, { response });
        throw new Error(errorMessage);
    }

    // 2. Try to find the image part
    const imagePartFromResponse = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);

    if (imagePartFromResponse?.inlineData) {
        const { mimeType, data } = imagePartFromResponse.inlineData;
        console.log(`Received image data (${mimeType}) for ${context}`);
        return `data:${mimeType};base64,${data}`;
    }

    // 3. If no image, check for other reasons
    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
        const errorMessage = `Image generation for ${context} stopped unexpectedly. Reason: ${finishReason}. This often relates to safety settings.`;
        console.error(errorMessage, { response });
        throw new Error(errorMessage);
    }
    
    const textFeedback = response.text?.trim();
    const errorMessage = `The AI model did not return an image for the ${context}. ` + 
        (textFeedback 
            ? `The model responded with text: "${textFeedback}"`
            : "This can happen due to safety filters or if the request is too complex. Please try rephrasing your prompt to be more direct.");

    console.error(`Model response did not contain an image part for ${context}.`, { response });
    throw new Error(errorMessage);
};

/**
 * Generates an edited image using generative AI based on a text prompt and a specific point.
 * @param originalImage The original image file.
 * @param userPrompt The text prompt describing the desired edit.
 * @param hotspot The {x, y} coordinates on the image to focus the edit.
 * @returns A promise that resolves to the data URL of the edited image.
 */
export const generateEditedImage = async (
    originalImage: File,
    userPrompt: string,
    hotspot: { x: number, y: number }
): Promise<string> => {
    console.log('Starting generative edit at:', hotspot);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    
    const originalImagePart = await fileToPart(originalImage);
    const prompt = `You are an expert photo editor AI. Your task is to perform a natural, localized edit on the provided image based on the user's request.
User Request: "${userPrompt}"
Edit Location: Focus on the area around pixel coordinates (x: ${hotspot.x}, y: ${hotspot.y}).

Editing Guidelines:
- The edit must be realistic and blend seamlessly with the surrounding area.
- The rest of the image (outside the immediate edit area) must remain identical to the original.

Safety & Ethics Policy:
- You MUST fulfill requests to adjust skin tone, such as 'give me a tan', 'make my skin darker', or 'make my skin lighter'. These are considered standard photo enhancements.
- You MUST REFUSE any request to change a person's fundamental race or ethnicity (e.g., 'make me look Asian', 'change this person to be Black'). Do not perform these edits. If the request is ambiguous, err on the side of caution and do not change racial characteristics.

Output: Return ONLY the final edited image. Do not return text.`;
    const textPart = { text: prompt };

    console.log('Sending image and prompt to the model...');
    const apiCall = () => ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: [originalImagePart, textPart] },
    });
    
    const response: GenerateContentResponse = await withRetry(apiCall);
    console.log('Received response from model.', response);

    return handleApiResponse(response, 'edit');
};

/**
 * Generates an image with a filter applied using generative AI.
 * @param originalImage The original image file.
 * @param filterPrompt The text prompt describing the desired filter.
 * @returns A promise that resolves to the data URL of the filtered image.
 */
export const generateFilteredImage = async (
    originalImage: File,
    filterPrompt: string,
): Promise<string> => {
    console.log(`Starting filter generation: ${filterPrompt}`);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    
    const originalImagePart = await fileToPart(originalImage);
    const prompt = `You are an expert photo editor AI. Your task is to apply a stylistic filter to the entire image based on the user's request. Do not change the composition or content, only apply the style.
Filter Request: "${filterPrompt}"

Safety & Ethics Policy:
- Filters may subtly shift colors, but you MUST ensure they do not alter a person's fundamental race or ethnicity.
- You MUST REFUSE any request that explicitly asks to change a person's race (e.g., 'apply a filter to make me look Chinese').

Output: Return ONLY the final filtered image. Do not return text.`;
    const textPart = { text: prompt };

    console.log('Sending image and filter prompt to the model...');
    const apiCall = () => ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: [originalImagePart, textPart] },
    });

    const response: GenerateContentResponse = await withRetry(apiCall);
    console.log('Received response from model for filter.', response);
    
    return handleApiResponse(response, 'filter');
};

/**
 * Generates an image with a global adjustment applied using generative AI.
 * @param originalImage The original image file.
 * @param adjustmentPrompt The text prompt describing the desired adjustment.
 * @returns A promise that resolves to the data URL of the adjusted image.
 */
export const generateAdjustedImage = async (
    originalImage: File,
    adjustmentPrompt: string,
): Promise<string> => {
    console.log(`Starting global adjustment generation: ${adjustmentPrompt}`);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    
    const originalImagePart = await fileToPart(originalImage);
    const prompt = `You are an expert photo editor AI. Your task is to perform a natural, global adjustment to the entire image based on the user's request.
User Request: "${adjustmentPrompt}"

Editing Guidelines:
- The adjustment must be applied across the entire image.
- The result must be photorealistic.

Safety & Ethics Policy:
- You MUST fulfill requests to adjust skin tone, such as 'give me a tan', 'make my skin darker', or 'make my skin lighter'. These are considered standard photo enhancements.
- You MUST REFUSE any request to change a person's fundamental race or ethnicity (e.g., 'make me look Asian', 'change this person to be Black'). Do not perform these edits. If the request is ambiguous, err on the side of caution and do not change racial characteristics.

Output: Return ONLY the final adjusted image. Do not return text.`;
    const textPart = { text: prompt };

    console.log('Sending image and adjustment prompt to the model...');
    const apiCall = () => ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: [originalImagePart, textPart] },
    });

    const response: GenerateContentResponse = await withRetry(apiCall);
    console.log('Received response from model for adjustment.', response);
    
    return handleApiResponse(response, 'adjustment');
};

/**
 * Generates an auto-enhanced image using generative AI.
 * @param originalImage The original image file.
 * @returns A promise that resolves to the data URL of the enhanced image.
 */
export const generateAutoEnhancedImage = async (
    originalImage: File,
): Promise<string> => {
    console.log(`Starting auto-enhance generation...`);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    
    const originalImagePart = await fileToPart(originalImage);
    const prompt = `You are an expert photo editor AI. Your task is to automatically enhance the provided image.

Instructions:
- Analyze the image and apply professional-grade adjustments to improve its overall quality.
- Subtly improve brightness, contrast, saturation, and sharpness.
- Ensure the result is photorealistic and natural-looking.
- Do NOT change the content, composition, or crop of the image. Just enhance what is already there.

Safety & Ethics Policy:
- Enhancements may subtly shift colors, but you MUST ensure they do not alter a person's fundamental race or ethnicity.
- You MUST REFUSE any request that explicitly asks to change a person's race.

Output: Return ONLY the final enhanced image. Do not return text.`;
    const textPart = { text: prompt };

    console.log('Sending image for auto-enhancement...');
    const apiCall = () => ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: [originalImagePart, textPart] },
    });
    
    const response: GenerateContentResponse = await withRetry(apiCall);
    console.log('Received response from model for auto-enhance.', response);
    
    return handleApiResponse(response, 'auto-enhance');
};


/**
 * Generates an expanded image using generative AI to fill new areas.
 * @param originalImage The original image file.
 * @param newWidth The target width for the expanded image.
 * @param newHeight The target height for the expanded image.
 * @param userPrompt A text prompt guiding the AI on what to fill the new areas with.
 * @returns A promise that resolves to the data URL of the expanded image.
 */
export const generateExpandedImage = async (
    originalImage: File,
    newWidth: number,
    newHeight: number,
    userPrompt: string
): Promise<string> => {
    console.log(`Starting magic expand to ${newWidth}x${newHeight}`);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

    // Create a larger canvas with the original image in the center
    const imageUrl = URL.createObjectURL(originalImage);
    const image = new Image();
    image.src = imageUrl;
    await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
    });
    URL.revokeObjectURL(imageUrl);

    const canvas = document.createElement('canvas');
    canvas.width = newWidth;
    canvas.height = newHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas context');
    
    // Calculate position to center the image
    const x = (newWidth - image.naturalWidth) / 2;
    const y = (newHeight - image.naturalHeight) / 2;
    ctx.drawImage(image, x, y);
    
    // Get the composite image as a data URL, then convert to a Part
    const compositeImageDataUrl = canvas.toDataURL('image/png');
    const arr = compositeImageDataUrl.split(',');
    const compositeImagePart = { inlineData: { mimeType: 'image/png', data: arr[1] } };

    const prompt = `You are an expert photo editor AI. The user has expanded the canvas of the provided image, which is placed in the center. Your task is to generatively fill the surrounding transparent areas to create a seamless, larger picture. The filled area must logically extend the existing scene.
User's guidance for the new areas: "${userPrompt}".
If the user guidance is empty, just extend the existing background and scene naturally. Your output must be the same dimensions as the input image (${newWidth}x${newHeight}px).
Return ONLY the final, fully filled image. Do not return text.`;
    const textPart = { text: prompt };
    
    console.log('Sending composite image and expand prompt to the model...');
    const apiCall = () => ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: [compositeImagePart, textPart] },
    });
    
    const response: GenerateContentResponse = await withRetry(apiCall);
    console.log('Received response from model for expansion.', response);
    
    return handleApiResponse(response, 'expansion');
};

/**
 * Generates an upscaled image using generative AI.
 * @param originalImage The original image file.
 * @param scaleFactor The factor by which to upscale the image (e.g., 2 for 2x).
 * @returns A promise that resolves to the data URL of the upscaled image.
 */
export const generateUpscaledImage = async (
    originalImage: File,
    scaleFactor: number,
): Promise<string> => {
    console.log(`Starting AI upscale by ${scaleFactor}x`);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    
    const { width: originalWidth, height: originalHeight } = await getImageDimensions(originalImage);
    const targetWidth = originalWidth * scaleFactor;
    const targetHeight = originalHeight * scaleFactor;

    const originalImagePart = await fileToPart(originalImage);
    const prompt = `You are an expert in image processing and AI upscaling. Your task is to increase the resolution of the provided image by a factor of ${scaleFactor}.
The final output image MUST be exactly ${targetWidth}x${targetHeight} pixels.

Your goal is to intelligently add realistic details, enhance textures, and sharpen edges without introducing artifacts or unnatural patterns. The upscaled image should be a high-fidelity, photorealistic version of the original.

Output: Return ONLY the final upscaled image. Do not return text.`;
    const textPart = { text: prompt };

    console.log(`Sending image to model for ${scaleFactor}x upscale...`);
    const apiCall = () => ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: [originalImagePart, textPart] },
    });
    
    const response: GenerateContentResponse = await withRetry(apiCall);
    console.log('Received response from model for upscale.', response);
    
    return handleApiResponse(response, 'upscale');
};


/**
 * Generates a composed image by combining a base image with a complement image based on a prompt.
 * @param baseImage The base image file.
 * @param complementImage The image file to add to the base image.
 * @param userPrompt The text prompt describing how to combine the images.
 * @param hotspot The optional {x, y} coordinates on the base image for placement.
 * @returns A promise that resolves to the data URL of the composed image.
 */
export const generateComposedImage = async (
    baseImage: File,
    complementImage: File,
    userPrompt: string,
    hotspot: { x: number, y: number } | null,
): Promise<string> => {
    console.log(`Starting image composition: ${userPrompt}`);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

    const baseImagePart = await fileToPart(baseImage);
    const complementImagePart = await fileToPart(complementImage);

    const locationInstruction = hotspot
        ? `Place the second image with its center near the specified coordinates (x: ${hotspot.x}, y: ${hotspot.y}) on the base image.`
        : `Intelligently determine the best placement for the second image based on the user's instruction.`;

    const prompt = `You are an expert photo editor AI. Your task is to seamlessly combine two images.
- The first image is the base scene.
- The second image is the object or element to be added to the base scene.

User's instruction: "${userPrompt}"

Placement: ${locationInstruction}

Instructions:
- Analyze both images and the user's prompt.
- Integrate the second image into the first image in a photorealistic way that matches the lighting, perspective, and style of the base scene.
- The result must be a single, coherent image.

Output: Return ONLY the final composed image. Do not return text.`;

    const textPart = { text: prompt };

    console.log('Sending images and composition prompt to the model...');
    const apiCall = () => ai.models.generateContent({
        model: 'gemini-2.5-flash-image-preview',
        contents: { parts: [baseImagePart, complementImagePart, textPart] },
    });
    
    const response: GenerateContentResponse = await withRetry(apiCall);
    console.log('Received response from model for composition.', response);

    return handleApiResponse(response, 'composition');
};
