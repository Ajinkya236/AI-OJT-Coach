import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Lesson, AnalysisResultData, Document, AIAgent } from "../types";

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result as string;
      resolve(base64data.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2, delay = 2000): Promise<T> {
  let lastError: any;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const isRateLimit = error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED');
      if (isRateLimit && i < maxRetries) {
        console.warn(`Rate limit hit, retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

const documentToText = (doc: Document): string => {
  try {
    if (doc.type.startsWith('text/')) {
        const textContent = atob(doc.content);
        return `\n\n--- Document: ${doc.name} ---\n${textContent}\n--- End Document ---`;
    }
  } catch (e) {
    console.error(`Could not decode document ${doc.name}:`, e);
  }
  return `\n\n--- A document named "${doc.name}" of type "${doc.type}" was also provided. ---`;
}

export async function analyzeSubmission(
  lesson: Lesson,
  agent: AIAgent,
  submissionBlob: Blob,
  language: string,
): Promise<AnalysisResultData> {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const languageMap: { [key: string]: string } = { en: 'English', hi: 'Hindi', ta: 'Tamil', mr: 'Marathi', bn: 'Bengali' };
  const languageName = languageMap[language] || 'English';

  let knowledgeContext = '';
  let internalInstruction = '';

  if (lesson.type === 'internal') {
      knowledgeContext = `
        **Internal Knowledge Context:**
        ${lesson.knowledge.text}
        ${lesson.knowledge.documents.map(documentToText).join('')}
      `;
      internalInstruction = "You MUST ONLY use the provided 'Internal Knowledge Context' to evaluate the learner's response. Do not use any external knowledge or make assumptions beyond what is given in the context."
  }
  
  const basePrompt = `
    You are an expert AI evaluator. Your instructions for this evaluation are below:
    --- AGENT INSTRUCTIONS ---
    ${agent.instructions}
    --- END AGENT INSTRUCTIONS ---

    **Question Asked to the Learner:**
    """${lesson.question}"""

    ${knowledgeContext}

    **Your Task:**
    Analyze the learner's file submission based on the AGENT INSTRUCTIONS and provide a response in a valid JSON format.
    Do not include any text, markdown, or code block formatting outside of the JSON object.
    The feedback text in the 'feedback' array MUST be in ${languageName}.
    ${internalInstruction}
  `;
  
  const textPart = { text: basePrompt };
  const parts: any[] = [textPart];

  if (lesson.submissionType === 'document' || lesson.submissionType === 'text') {
      if (submissionBlob.type.startsWith('text/')) {
          const textContent = await submissionBlob.text();
          const promptLabel = lesson.submissionType === 'text' ? "Learner's Submitted Text Response" : "Learner's Submitted Document Content";
          parts.push({ text: `\n\n**${promptLabel}:**\n---\n${textContent}\n---` });
      } else {
          // For unsupported document types
          parts.push({ text: `\n\n**Note:** The learner submitted a document of type "${submissionBlob.type}". The content of this file cannot be read for analysis. Please evaluate based on the fact that a file of this type was submitted, if the agent instructions require it.` });
      }
  } else {
      // For video, audio, image
      const submissionBase64 = await blobToBase64(submissionBlob);
      parts.push({ inlineData: { mimeType: submissionBlob.type, data: submissionBase64 } });
  }

  let responseSchema: any;
  if (agent.isSalesCoach) {
      responseSchema = {
        type: Type.OBJECT,
        properties: {
          scores: {
            type: Type.OBJECT,
            properties: {
              tone: { type: Type.NUMBER, description: "Score for tone from 0-100. For non-audio/video submissions where tone cannot be assessed, this score should reflect clarity and professionalism of the text, or be set to a neutral 50." },
              content: { type: Type.NUMBER, description: 'Score for content alignment from 0-100' },
              approach: { type: Type.NUMBER, description: "Score for sales approach from 0-100. For non-audio/video submissions, this should be based on the structure and persuasiveness of the text." },
            },
            required: ['tone', 'content', 'approach'],
          },
          feedback: {
            type: Type.ARRAY,
            items: { type: Type.STRING, description: `An actionable feedback point in ${languageName}.` }
          }
        },
        required: ['scores', 'feedback'],
      };
  } else {
      responseSchema = {
          type: Type.OBJECT,
          properties: {
              feedback: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING, description: `An actionable feedback point based on the instructions, in ${languageName}.` }
              }
          },
          required: ['feedback']
      };
  }

  const genAIResponse = await withRetry(() => ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: { parts: parts },
    config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
    }
  }));
  
  const responseJsonText = genAIResponse.text;
  const parsedResult: AnalysisResultData = JSON.parse(responseJsonText);

  if (agent.isSalesCoach && parsedResult.scores) {
    const { tone, content, approach } = parsedResult.scores;
    const { weightages, passingScore } = lesson;

    if (weightages && passingScore !== undefined) {
      const finalScore = (tone * weightages.tone) / 100 + (content * weightages.content) / 100 + (approach * weightages.approach) / 100;
      const passed = finalScore >= passingScore;
      return { ...parsedResult, finalScore: Math.round(finalScore), passed };
    }
  }

  return parsedResult;
}

export async function generateSpeech(text: string): Promise<string> {
   if (!process.env.API_KEY) throw new Error("API_KEY environment variable not set");
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Say it clearly and encouragingly: ${text}` }] }],
    config: { responseModalities: [Modality.AUDIO] },
  }));
  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("No audio data received from API.");
  return base64Audio;
}

export async function generateSampleAudio(lesson: Lesson, agent: AIAgent): Promise<string> {
  if (!process.env.API_KEY) throw new Error("API_KEY environment variable not set");
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  let idealAnswerPrompt = `You are an expert. A learner needs a sample answer for a task.
   The task is: "${lesson.question}".
   The evaluation criteria are: "${agent.instructions}"
   Generate a clear, concise, and ideal spoken answer for the learner.`;
   
  if (lesson.type === 'internal') {
      const knowledgeContext = `${lesson.knowledge.text} ${lesson.knowledge.documents.map(documentToText).join('')}`;
      idealAnswerPrompt = `You are an expert employee. Based ONLY on the following internal knowledge, generate a clear, concise, and ideal spoken answer for the question.
      Knowledge: """${knowledgeContext}"""
      Question: "${lesson.question}"`
  }
  
  const textResponse = await withRetry(() => ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: idealAnswerPrompt,
  }));
  const idealAnswerText = textResponse.text;

  return await generateSpeech(idealAnswerText);
}

export function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}