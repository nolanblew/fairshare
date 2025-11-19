import { GoogleGenAI, Type } from "@google/genai";
import { ParseResult } from "../types";

const apiKey = process.env.API_KEY;

if (!apiKey) {
  console.error("API_KEY is missing from environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export const parseReceiptImage = async (base64Image: string): Promise<ParseResult> => {
  try {
    // Clean the base64 string if it has a header
    const cleanBase64 = base64Image.replace(/^data:image\/(png|jpg|jpeg|webp);base64,/, "");

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: cleanBase64,
            },
          },
          {
            text: "Analyze this receipt. Extract all purchasable items with their prices. Extract the total tax amount. If there is a 'Tip', 'Gratuity', or 'Service Charge' explicitly included in the total, extract that amount as well. If tax or tip aren't explicitly separated, return 0 for them. Ignore dates, addresses, and card details. Return the data in JSON format.",
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: "The name of the item" },
                  price: { type: Type.NUMBER, description: "The price of the item" },
                },
                required: ["name", "price"],
              },
            },
            tax: { type: Type.NUMBER, description: "The total tax amount" },
            tip: { type: Type.NUMBER, description: "The included tip or gratuity amount, if any" },
          },
          required: ["items", "tax"],
        },
      },
    });

    if (response.text) {
      const result = JSON.parse(response.text) as ParseResult;
      return result;
    }

    throw new Error("Empty response from Gemini");
  } catch (error) {
    console.error("Error parsing receipt:", error);
    throw error;
  }
};