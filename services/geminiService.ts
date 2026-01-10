import { GoogleGenAI } from "@google/genai";
import { Transaction, CategorySummary } from '../types';

export const analyzeFinances = async (
  transactions: Transaction[],
  categorySummary: CategorySummary[]
): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Prepare data for the prompt (limit recent transactions to save tokens)
    const recentTransactions = transactions.slice(0, 20);
    const totalSpent = transactions.reduce((sum, t) => sum + t.amount, 0);

    const prompt = `
      Act as a financial analyst for a retail store owner in Thailand.
      Analyze the following expense data and provide insights in Thai Language (ภาษาไทย).

      **Data Context:**
      Total Spending: ${totalSpent.toLocaleString()} THB
      Top Categories: ${JSON.stringify(categorySummary)}
      Recent Transactions Sample: ${JSON.stringify(recentTransactions)}

      **Please provide:**
      1. A summary of the spending habits.
      2. Identify the biggest cost drivers.
      3. Anomalies or unusual spending (if any obvious ones appear in the sample).
      4. Suggest 2-3 actionable tips to reduce costs based on these categories.

      Keep the tone professional yet encouraging for a small business owner.
      Format the response with clear headings and bullet points.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    return response.text || "ไม่สามารถวิเคราะห์ข้อมูลได้ในขณะนี้";
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return "เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI (Error connecting to AI Analysis).";
  }
};