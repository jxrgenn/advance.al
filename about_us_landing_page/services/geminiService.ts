import { GoogleGenAI } from "@google/genai";

// Define the expected interface for the injected aistudio object locally
interface AIStudio {
  hasSelectedApiKey: () => Promise<boolean>;
  openSelectKey: () => Promise<void>;
}

export const ensureApiKeySelected = async () => {
  // Use type assertion to access aistudio on window to avoid global type conflicts
  const win = window as unknown as { aistudio?: AIStudio };

  if (win.aistudio && win.aistudio.hasSelectedApiKey && win.aistudio.openSelectKey) {
    const hasKey = await win.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      await win.aistudio.openSelectKey();
      // Re-check after dialog
      return await win.aistudio.hasSelectedApiKey();
    }
    return true;
  }
  return true; // Fallback if not in the specific environment
};

export const generateVideoAsset = async (actionDescription: string): Promise<string | null> => {
  try {
    // 1. Create a new instance with the potentially updated key
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // 2. Strict style prompt for consistency - Optimized for Video
    const prompt = `
      A 3D cartoon animation of a cute stylized human character with round features, 
      wearing a bright orange hoodie and dark blue pants. 
      The character is performing this action: ${actionDescription}.
      The style is claymorphism, toy-like aesthetics, soft studio lighting, 
      minimal white background. 
      High resolution, 3D blender render style.
    `;

    console.log("Starting video generation...");

    // 3. Initiate Video Generation
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '16:9' // Veo supports 16:9 or 9:16
      }
    });

    // 4. Poll for completion
    // Veo takes a moment, so we loop until done.
    while (!operation.done) {
      console.log("Generating video... waiting 5s");
      await new Promise(resolve => setTimeout(resolve, 5000));
      operation = await ai.operations.getVideosOperation({ operation: operation });
    }

    // 5. Extract Video URI
    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    
    if (!videoUri) {
      throw new Error("No video URI returned");
    }

    // 6. Fetch the actual video bytes using the API Key
    // We need to append the key to the download link as per documentation
    const videoResponse = await fetch(`${videoUri}&key=${process.env.API_KEY}`);
    const videoBlob = await videoResponse.blob();
    
    // 7. Create a local URL for the video player
    return URL.createObjectURL(videoBlob);

  } catch (error) {
    console.error("Failed to generate video asset:", error);
    return null;
  }
};

// Legacy image function kept if needed
export const generateCharacterAsset = async (actionDescription: string): Promise<string | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `3d render of a cute stylized cartoon human character, wearing a bright orange hoodie and dark blue pants, Action: ${actionDescription}, soft studio lighting, isometric view, 3d illustration, minimal white background, 4k`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: prompt }] },
    });

    const base64Image = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    return base64Image ? `data:image/png;base64,${base64Image}` : null;
  } catch (error) {
    return null;
  }
};