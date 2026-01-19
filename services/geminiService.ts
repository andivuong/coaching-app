
import { GoogleGenAI, Type } from "@google/genai";
import { DayRecord } from "../types";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
  console.warn("Kein Gemini API Key gesetzt – AI deaktiviert.");
}

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;


export const getAICoachInsights = async (dayRecord: DayRecord): Promise<string> => {
  const workoutSummary = dayRecord.workouts.map(w => 
    `${w.exerciseName}: ${w.sets.map(s => `${s.reps}x${s.weight}kg`).join(', ')}`
  ).join('\n');

  const nutritionSummary = dayRecord.nutrition 
    ? `Macros: P:${dayRecord.nutrition.protein}g, C:${dayRecord.nutrition.carbs}g, F:${dayRecord.nutrition.fat}g (Total: ${dayRecord.nutrition.calories} kcal)`
    : "Keine Ernährungsdaten vorhanden.";

  const prompt = `
    Handle als spezialisierter Fitness-Coach. Analysiere das heutige Training und die Ernährung des Benutzers:
    
    Datum: ${dayRecord.date}
    Training:
    ${workoutSummary || "Kein Training aufgezeichnet."}
    
    Ernährung:
    ${nutritionSummary}
    
    Gib eine kurze, motivierende Einschätzung (max 150 Wörter) auf Deutsch. 
    Achte auf das Verhältnis von Protein zu Kalorien und ob das Training intensiv war.
    Schlage eine kleine Verbesserung für morgen vor.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text || "Coach konnte keine Analyse erstellen.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Fehler bei der Verbindung zum KI-Coach.";
  }
};

export const parseWorkoutPlan = async (text: string): Promise<string[]> => {
  const prompt = `
    Extrahiere aus dem folgenden Text eine Liste von Fitness-Übungen in der richtigen Reihenfolge.
    Gib NUR die Namen der Übungen als Liste zurück, getrennt durch Zeilenumbrüche.
    Ignoriere Sätze, Wiederholungen oder Smalltalk. Max. 8 Übungen.
    Text: "${text}"
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            exercises: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          }
        }
      }
    });
    
    const result = JSON.parse(response.text || '{"exercises": []}');
    return result.exercises || [];
  } catch (error) {
    console.error("Gemini Parse Error:", error);
    return text.split(/[,\n]/).map(s => s.trim()).filter(s => s.length > 0).slice(0, 8);
  }
};

export const getExerciseInstructions = async (exerciseName: string): Promise<{ execution: string, tips: string[] }> => {
  const prompt = `
    Gib eine extrem kurze und knackige Anleitung für die Übung "${exerciseName}" auf Deutsch.
    Struktur:
    1. Ausführung (1-2 Sätze)
    2. 3 wichtige Tipps/Checkpoints worauf man achten muss.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            execution: { type: Type.STRING, description: "Kurze Beschreibung der Ausführung" },
            tips: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "Liste von 3 kurzen Tipps"
            }
          },
          required: ["execution", "tips"]
        }
      }
    });
    
    return JSON.parse(response.text || '{"execution": "Keine Info verfügbar.", "tips": []}');
  } catch (error) {
    console.error("Gemini Instructions Error:", error);
    return { execution: "Informationen konnten nicht geladen werden.", tips: ["Technik prüfen", "Langsame Ausführung", "Volle ROM nutzen"] };
  }
};

export const getExerciseCorrection = async (input: string): Promise<string | null> => {
  if (input.length < 3) return null;
  const prompt = `
    Prüfe ob der Übungsname "${input}" einen Tippfehler hat oder ungenau ist. 
    Wenn er sehr nah an einer gängigen Fitness-Übung ist, gib nur den korrekten Namen zurück. 
    Wenn er korrekt ist, gib "OK" zurück.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    const text = response.text?.trim();
    return text === "OK" ? null : text;
  } catch (error) {
    return null;
  }
};
