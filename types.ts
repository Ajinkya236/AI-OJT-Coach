export enum UserRole {
  Admin = 'ADMIN',
  Learner = 'LEARNER',
}

export interface Weightages {
  tone: number;
  content: number;
  approach: number;
}

export interface Document {
  name: string;
  type: string;
  content: string; // base64 encoded content
}

export interface AIAgent {
  id: string;
  title: string;
  instructions: string;
  isSalesCoach: boolean; // Special flag for the default agent
}

export interface Lesson {
  id:string;
  title: string;
  question: string;
  type: 'internal' | 'external';
  submissionType: 'video' | 'audio' | 'image' | 'document' | 'text';
  agentId: string;
  knowledge: {
    documents: Document[];
    text: string;
  };
  weightages?: Weightages;
  passingScore?: number;
  attemptsAllowed: number;
  sampleAudioData?: string;
}


export interface AnalysisScores {
  tone: number;
  content: number;
  approach: number;
}

export interface AnalysisResultData {
  feedback: string[];
  scores?: AnalysisScores;
  finalScore?: number;
  passed?: boolean;
}