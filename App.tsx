import React, { useState } from 'react';
import { Lesson, UserRole, AIAgent } from './types';
import AdminDashboard from './components/AdminDashboard';
import LearnerDashboard from './components/LearnerDashboard';
import { AdminIcon, LearnerIcon, LogoIcon } from './components/icons';
import { translations } from './translations';

const salesAgentInstructions = `
You are an expert sales pitch coach. Your task is to analyze a learner's submission based on visual, auditory, and content-based criteria. The submission can be a video, audio, image, or document. Adapt your analysis to the submission type.

**Your Task:**
Analyze the learner's submission and provide a response in a valid JSON format. Do not include any text, markdown, or code block formatting outside of the JSON object.

**Multimodal Analysis Guidelines:**
- **For Video/Audio:**
  - **Visuals (Video only):** Analyze the learner's body language, facial expressions, eye contact with the camera, and overall presence. Do they appear confident and engaging?
  - **Audio:** Analyze the learner's tone of voice, clarity, speaking pace, and enthusiasm.
- **For Documents/Images:**
  - Analyze the provided text or image for clarity, professionalism, and persuasiveness.
- **Content (All types):** Analyze the content for accuracy, relevance to the question, and persuasiveness.

**Scoring Criteria (0-100):**
- **Tone Score:** For video/audio, evaluate vocal tone and visual expression. For text, evaluate the professionalism and clarity of the writing. For images, assess the visual tone. A high score reflects confidence and appropriateness.
- **Content Score:** Evaluate the accuracy, completeness, and relevance of the answer based on the submission's content. For 'internal' lessons, this score MUST be based strictly on the provided 'Internal Knowledge Context'.
- **Approach Score:** Assess the overall structure, clarity, and professionalism. For text/audio, this is the logical flow. For image/video, this is composition and visual impact.

**Feedback (Array of strings):**
Provide at least 3-4 actionable feedback points relevant to the submission type. Each point should be a string in the array.
`;

const initialAgents: AIAgent[] = [
    {
        id: 'default-sales-coach',
        title: 'Sales Pitch Coach',
        instructions: salesAgentInstructions,
        isSalesCoach: true,
    }
]

const initialLessons: Lesson[] = [
    {
        id: '1',
        title: 'Quantum Laptop - Internal Specs',
        question: 'A customer asks about the technical specifications of the new Quantum Laptop. Explain the key hardware features based on the internal spec sheet.',
        type: 'internal',
        submissionType: 'video',
        agentId: 'default-sales-coach',
        knowledge: {
          documents: [],
          text: 'The Quantum Laptop features a 13th Gen Intel Core i9 processor, 32GB of DDR5 RAM, a 1TB NVMe SSD, and a 14-inch OLED display with a 120Hz refresh rate. Battery life is rated for 20 hours of typical use.'
        },
        weightages: { tone: 30, content: 50, approach: 20 },
        passingScore: 80,
        attemptsAllowed: 3,
    },
    {
        id: '2',
        title: 'EcoFresh Water Filters - General Pitch',
        question: 'Sell me an "EcoFresh" water filter. Why should I buy it?',
        type: 'external',
        submissionType: 'video',
        agentId: 'default-sales-coach',
        knowledge: { documents: [], text: '' },
        weightages: { tone: 25, content: 45, approach: 30 },
        passingScore: 70,
        attemptsAllowed: 3,
    },
    {
        id: '3',
        title: 'JioAirFiber - Value Proposition',
        question: 'Explain the main advantages of JioAirFiber over traditional broadband.',
        type: 'external',
        submissionType: 'video',
        agentId: 'default-sales-coach',
        knowledge: { documents: [], text: '' },
        weightages: { tone: 20, content: 50, approach: 30 },
        passingScore: 70,
        attemptsAllowed: 3,
    }
];

export default function App() {
  const [role, setRole] = useState<UserRole>(UserRole.Learner);
  const [lessons, setLessons] = useState<Lesson[]>(initialLessons);
  const [aiAgents, setAIAgents] = useState<AIAgent[]>(initialAgents);
  const [language, setLanguage] = useState('en');

  const addLesson = (lesson: Omit<Lesson, 'id'>) => {
    const newLesson: Lesson = {
      ...lesson,
      id: new Date().toISOString(),
    };
    setLessons(prev => [newLesson, ...prev]);
  };

  const addAgent = (agent: Omit<AIAgent, 'id' | 'isSalesCoach'>) => {
    const newAgent: AIAgent = {
      ...agent,
      id: new Date().toISOString(),
      isSalesCoach: false,
    };
    setAIAgents(prev => [...prev, newAgent]);
  }

  const updateLesson = (updatedLesson: Lesson) => {
    setLessons(prevLessons => 
      prevLessons.map(lesson => 
        lesson.id === updatedLesson.id ? updatedLesson : lesson
      )
    );
  };
  
  const t = translations[language];

  return (
    <div className="min-h-screen bg-slate-900 text-gray-200 font-sans">
      <header className="bg-slate-950/70 backdrop-blur-sm sticky top-0 z-50 shadow-lg shadow-cyan-500/10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <LogoIcon />
              <h1 className="text-xl md:text-2xl font-bold text-white">{t.appTitle}</h1>
            </div>
            <div className="flex items-center space-x-4">
               <div className="bg-slate-800 rounded-md">
                 <select 
                    onChange={(e) => setLanguage(e.target.value)} 
                    value={language}
                    className="bg-transparent border-0 text-white text-sm rounded-md focus:ring-0"
                    aria-label="Select Language"
                 >
                    <option value="en">English</option>
                    <option value="hi">हिन्दी</option>
                    <option value="ta">தமிழ்</option>
                    <option value="mr">मराठी</option>
                    <option value="bn">বাংলা</option>
                 </select>
               </div>
              <div className="bg-slate-800 p-1 rounded-full flex items-center space-x-1">
                <button
                  onClick={() => setRole(UserRole.Learner)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-full flex items-center space-x-2 transition-colors duration-300 ${
                    role === UserRole.Learner ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:bg-slate-700'
                  }`}
                >
                  <LearnerIcon />
                  <span>{t.learner}</span>
                </button>
                <button
                  onClick={() => setRole(UserRole.Admin)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-full flex items-center space-x-2 transition-colors duration-300 ${
                    role === UserRole.Admin ? 'bg-violet-500 text-white' : 'text-gray-400 hover:bg-slate-700'
                  }`}
                >
                  <AdminIcon />
                  <span>{t.admin}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {role === UserRole.Admin ? (
          <AdminDashboard 
            lessons={lessons} 
            addLesson={addLesson} 
            updateLesson={updateLesson} 
            aiAgents={aiAgents}
            addAgent={addAgent}
            language={language}
          />
        ) : (
          <LearnerDashboard lessons={lessons} aiAgents={aiAgents} language={language}/>
        )}
      </main>
    </div>
  );
}