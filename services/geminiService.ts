
import { GoogleGenAI, Type, Schema, Modality } from "@google/genai";
import { AdventureResponse, Hotspot } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const GAME_SYSTEM_INSTRUCTION = `
You are the game engine for a classic 1980s LucasArts point-and-click adventure (like Monkey Island, Maniac Mansion).
Your goal is to maintain a CONSISTENT world state.

Rules:
1. **Scene IDs**: Assign a unique 'scene_id' to every location (e.g., "tavern_interior", "forest_path_1"). 
2. **Consistency**: If the user is in the same location and performs a non-destructive action (like "Look at lamp"), keep the SAME 'scene_id' and set 'trigger_visual_update' to FALSE.
3. **Navigation**: If the user walks to a new area, change the 'scene_id'. 
4. **Visual Updates**: Only set 'trigger_visual_update' to TRUE if:
   - The player enters a new room.
   - The player significantly changes the room (e.g., "Open door" revealing a new view, "Smash window").
   - Picking up a small item should usually NOT trigger a full redraw, just remove it from 'interactables'.
5. **Interactables**: crucial! list 3-6 specific, clickable items seen in the description.

Response JSON Format:
{
  "narrative": "Narrative text response (max 3 sentences). Witty, atmospheric.",
  "scene_id": "unique_id_for_current_location",
  "visual_description": "Description for the artist (even if not updating).",
  "trigger_visual_update": boolean,
  "interactables": ["door", "key", "lamp"],
  "inventory_add": "item_name" (optional),
  "inventory_remove": "item_name" (optional),
  "is_game_over": boolean
}
`;

const responseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    narrative: { type: Type.STRING },
    scene_id: { type: Type.STRING },
    visual_description: { type: Type.STRING },
    trigger_visual_update: { type: Type.BOOLEAN },
    interactables: { type: Type.ARRAY, items: { type: Type.STRING } },
    inventory_add: { type: Type.STRING },
    inventory_remove: { type: Type.STRING },
    is_game_over: { type: Type.BOOLEAN },
  },
  required: ["narrative", "scene_id", "visual_description", "trigger_visual_update", "interactables"],
};

export const generateAdventureStart = async (theme: string): Promise<AdventureResponse> => {
  const prompt = `Start a new adventure game. Theme: "${theme}". 
  Set the scene. Describe the style as "Pixel art style, 8-bit, c64 palette".
  Create the first room with a unique scene_id.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: GAME_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response");
    return JSON.parse(text) as AdventureResponse;
  } catch (error) {
    console.error("Error generating start:", error);
    // Fallback
    return {
      narrative: "The system is rebooting...",
      scene_id: "error_room",
      visual_description: "Static screen",
      trigger_visual_update: true,
      interactables: []
    };
  }
};

export const processGameAction = async (
  action: string, 
  historyContext: string, 
  inventory: string[],
  currentSceneId: string | null
): Promise<AdventureResponse> => {
  const prompt = `
  Current Inventory: ${JSON.stringify(inventory)}
  Current Scene ID: ${currentSceneId}
  Recent History: ${historyContext}
  User Action: "${action}"
  
  Determine the outcome. 
  If the user moves, change scene_id. 
  If visual changes significantly, set trigger_visual_update: true.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: GAME_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response");
    return JSON.parse(text) as AdventureResponse;
  } catch (error) {
    console.error("Error processing action:", error);
    return {
      narrative: "I didn't quite get that.",
      scene_id: currentSceneId || "unknown",
      visual_description: "No change.",
      trigger_visual_update: false,
      interactables: []
    };
  }
};

export const generateSceneImage = async (visualDescription: string): Promise<string | null> => {
  const enhancedPrompt = `Classic lucasarts adventure game screenshot, pixel art, c64 color palette, dithering, retro, wide shot. Scene: ${visualDescription}`;
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: { parts: [{ text: enhancedPrompt }] },
      config: {
        responseModalities: [Modality.IMAGE],
      },
    });
    
    const part = response.candidates?.[0]?.content?.parts?.[0];
    if (part && part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
    return null;
  } catch (error) {
    console.error("Error generating image:", error);
    return null;
  }
};

export const detectSceneHotspots = async (imageBase64: string, items: string[]): Promise<Hotspot[]> => {
  if (items.length === 0) return [];
  const base64Data = imageBase64.split(',')[1]; // Strip header

  const prompt = `
    Pixel Art Analysis.
    Locate these items: ${items.join(', ')}.
    Return JSON with "hotspots" array. Each has "name" and "box" [ymin, xmin, ymax, xmax] (0-100).
  `;

  const hotspotSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      hotspots: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            box: { type: Type.ARRAY, items: { type: Type.INTEGER } }
          }
        }
      }
    }
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Data } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: hotspotSchema
      }
    });

    const text = response.text;
    if (!text) return [];
    const result = JSON.parse(text);
    const rawHotspots = result.hotspots || [];
    
    return rawHotspots.filter((h: any) => h && h.name && Array.isArray(h.box) && h.box.length === 4);
  } catch (error) {
    console.error("Error detecting hotspots:", error);
    return [];
  }
};

export const generateNarratorAudio = async (text: string): Promise<string | null> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: {
        parts: [{ text: text }] 
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Fenrir' },
          },
        },
      },
    });

    const part = response.candidates?.[0]?.content?.parts?.[0];
    if (part && part.inlineData) {
      return part.inlineData.data;
    }
    return null;
  } catch (error) {
    console.error("Error generating audio:", error);
    return null;
  }
};
