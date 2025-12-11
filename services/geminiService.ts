import { GoogleGenAI, Type } from "@google/genai";
import { HandData } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

const modelId = "gemini-2.5-flash"; // Fast model for near real-time

const SYSTEM_INSTRUCTION = `
Identify the state of the hand in the image.
- "OPEN": Fingers are extended/spread.
- "CLOSED": Fingers are curled into a fist.
- "UNKNOWN": No hand visible or unclear.

Return JSON with state and center x,y coordinates (0-1).
`;

export const analyzeFrame = async (base64Image: string): Promise<HandData> => {
  if (!apiKey) {
    console.warn("No API Key provided");
    return { state: 'UNKNOWN', x: 0.5, y: 0.5 };
  }

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: {
        parts: [
          { inlineData: { mimeType: "image/jpeg", data: base64Image } },
          { text: "Hand state?" }
        ]
      },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            state: { type: Type.STRING, enum: ['OPEN', 'CLOSED', 'UNKNOWN'] },
            x: { type: Type.NUMBER },
            y: { type: Type.NUMBER }
          },
          required: ['state', 'x', 'y']
        }
      }
    });

    if (response.text) {
      const data = JSON.parse(response.text) as HandData;
      return data;
    }
  } catch (error) {
    // console.error("Gemini Vision Error:", error); 
    // Suppress heavy logging in production loop
  }

  return { state: 'UNKNOWN', x: 0.5, y: 0.5 };
};