import React, { useState, useEffect, useRef } from 'react';
import { Lesson, Weightages, Document, AIAgent } from '../types';
import { PlusIcon, BrainCircuitIcon, LoadingSpinnerIcon, AudioWaveIcon, UploadIcon, TrashIcon, FileTextIcon, BotIcon } from './icons';
import { translations } from '../translations';
import { generateSampleAudio } from '../services/geminiService';

interface AdminDashboardProps {
  lessons: Lesson[];
  addLesson: (lesson: Omit<Lesson, 'id' | 'sampleAudioData'>) => void;
  updateLesson: (lesson: Lesson) => void;
  aiAgents: AIAgent[];
  addAgent: (agent: Omit<AIAgent, 'id' | 'isSalesCoach'>) => void;
  language: string;
}

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

const AgentCreator: React.FC<{ addAgent: (agent: Omit<AIAgent, 'id' | 'isSalesCoach'>) => void, onDone: () => void, language: string }> = ({ addAgent, onDone, language }) => {
    const [title, setTitle] = useState('');
    const [instructions, setInstructions] = useState('');
    const t = translations[language];

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !instructions.trim()) {
            alert(t.errorAgentTitleInstructions);
            return;
        }
        addAgent({ title, instructions });
        onDone();
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 w-full max-w-2xl">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <h3 className="text-xl font-semibold text-violet-300">{t.createNewAgent}</h3>
                    <div>
                        <label htmlFor="agent-title" className="block text-sm font-medium text-gray-300 mb-1">{t.agentTitle}</label>
                        <input type="text" id="agent-title" value={title} onChange={(e) => setTitle(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                            placeholder={t.agentTitlePlaceholder} />
                    </div>
                    <div>
                        <label htmlFor="agent-instructions" className="block text-sm font-medium text-gray-300 mb-1">{t.agentInstructions}</label>
                        <textarea id="agent-instructions" rows={8} value={instructions} onChange={(e) => setInstructions(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                            placeholder={t.agentInstructionsPlaceholder} />
                    </div>
                    <div className="flex justify-end space-x-3">
                        <button type="button" onClick={onDone} className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-md font-semibold transition-colors">{t.cancel}</button>
                        <button type="submit" className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-md font-semibold transition-colors flex items-center space-x-2">
                            <PlusIcon />
                            <span>{t.createAgent}</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const LessonCreator: React.FC<{ addLesson: (lesson: Omit<Lesson, 'id' | 'sampleAudioData'>) => void, aiAgents: AIAgent[], onDone: () => void, language: string }> = ({ addLesson, aiAgents, onDone, language }) => {
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [type, setType] = useState<'internal' | 'external'>('external');
  const [submissionType, setSubmissionType] = useState<'video' | 'audio' | 'image' | 'document' | 'text'>('video');
  const [agentId, setAgentId] = useState<string>(aiAgents[0]?.id || '');
  const [knowledgeText, setKnowledgeText] = useState('');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [weightages, setWeightages] = useState<Weightages>({ tone: 34, content: 33, approach: 33 });
  const [passingScore, setPassingScore] = useState(75);
  const [attemptsAllowed, setAttemptsAllowed] = useState(3);
  
  const t = translations[language];
  const selectedAgent = aiAgents.find(agent => agent.id === agentId);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const newDocs: Document[] = await Promise.all(
        files.map(async file => ({
          name: file.name,
          type: file.type,
          content: await blobToBase64(file),
        }))
      );
      setDocuments(prev => [...prev, ...newDocs]);
    }
  };

  const removeDocument = (docName: string) => {
    setDocuments(prev => prev.filter(doc => doc.name !== docName));
  };

  const handleWeightChange = (field: keyof Weightages, value: number) => {
    const otherFields = (['tone', 'content', 'approach'] as const).filter(f => f !== field);
    const currentValue = weightages[field];
    const diff = value - currentValue;
    let newWeights = { ...weightages, [field]: value };
    const remainingToDistribute = -diff;
    let distribution = Math.floor(remainingToDistribute / 2);
    let remainder = remainingToDistribute % 2;
    newWeights[otherFields[0]] += distribution;
    newWeights[otherFields[1]] += distribution + remainder;
    const total = newWeights.tone + newWeights.content + newWeights.approach;
    if (total !== 100) {
        const adjustment = 100 - total;
        const fieldToAdjust = otherFields.find(f => newWeights[f] + adjustment >= 0 && newWeights[f] + adjustment <= 100) || field;
        if(fieldToAdjust) newWeights[fieldToAdjust] += adjustment;
    }
    Object.keys(newWeights).forEach(keyStr => {
        const key = keyStr as keyof Weightages;
        if(newWeights[key] < 0) newWeights[key] = 0;
        if(newWeights[key] > 100) newWeights[key] = 100;
    });
    setWeightages(newWeights);
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !question.trim()) {
        alert(t.errorTitleQuestion);
        return;
    }
    if (type === 'internal' && documents.length === 0 && !knowledgeText.trim()) {
        alert(t.errorInternalKnowledge);
        return;
    }

    const lessonData: Omit<Lesson, 'id' | 'sampleAudioData'> = {
        title,
        question,
        type,
        submissionType,
        agentId,
        knowledge: { documents, text: knowledgeText },
        attemptsAllowed,
    };

    if (selectedAgent?.isSalesCoach) {
        lessonData.weightages = weightages;
        lessonData.passingScore = passingScore;
    }

    addLesson(lessonData);
    onDone();
  };

  return (
    <div className="bg-slate-800/50 rounded-lg p-6 mb-8 border border-slate-700">
      <form onSubmit={handleSubmit} className="space-y-6">
        <h3 className="text-xl font-semibold text-violet-300">{t.createNewLesson}</h3>
        
        <div className="grid md:grid-cols-2 gap-6">
            <div>
                <label htmlFor="title" className="block text-sm font-medium text-gray-300 mb-1">{t.lessonTitle}</label>
                <input type="text" id="title" value={title} onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                    placeholder={t.lessonTitlePlaceholder}/>
            </div>
            <div>
                <label htmlFor="agent" className="block text-sm font-medium text-gray-300 mb-1">{t.aiAgent}</label>
                <select id="agent" value={agentId} onChange={(e) => setAgentId(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-violet-500 focus:border-violet-500">
                    {aiAgents.map(agent => <option key={agent.id} value={agent.id}>{agent.title}</option>)}
                </select>
            </div>
        </div>
        
        <div>
          <label htmlFor="question" className="block text-sm font-medium text-gray-300 mb-1">{t.question}</label>
          <textarea id="question" rows={3} value={question} onChange={(e) => setQuestion(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
            placeholder={t.questionPlaceholder}/>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
            <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">{t.lessonType}</label>
                <div className="flex space-x-4">
                    <label className="flex items-center space-x-2 cursor-pointer">
                        <input type="radio" name="lessonType" value="external" checked={type === 'external'} onChange={() => setType('external')} className="form-radio bg-slate-700 text-violet-500 focus:ring-violet-500"/>
                        <span>{t.external}</span>
                    </label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                        <input type="radio" name="lessonType" value="internal" checked={type === 'internal'} onChange={() => setType('internal')} className="form-radio bg-slate-700 text-violet-500 focus:ring-violet-500"/>
                        <span>{t.internal}</span>
                    </label>
                </div>
            </div>
            <div>
                <label htmlFor="submissionType" className="block text-sm font-medium text-gray-300 mb-1">{t.submissionType}</label>
                <select id="submissionType" value={submissionType} onChange={(e) => setSubmissionType(e.target.value as any)} className="w-full bg-slate-900 border border-slate-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-violet-500 focus:border-violet-500">
                    <option value="video">{t.video}</option>
                    <option value="audio">{t.audio}</option>
                    <option value="image">{t.image}</option>
                    <option value="document">{t.document}</option>
                    <option value="text">{t.text}</option>
                </select>
            </div>
        </div>

        {type === 'internal' && (
            <div className="space-y-4 p-4 bg-slate-900/50 border border-slate-700 rounded-lg">
                <h4 className="font-semibold text-violet-400">{t.internalKnowledge}</h4>
                <div>
                    <label htmlFor="documents" className="block text-sm font-medium text-gray-300 mb-1 flex items-center space-x-2"><UploadIcon /> <span>{t.uploadDocuments}</span></label>
                    <input type="file" id="documents" multiple onChange={handleFileChange} className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-violet-500/20 file:text-violet-300 hover:file:bg-violet-500/30"/>
                    <div className="mt-2 space-y-2">
                      {documents.map(doc => (
                        <div key={doc.name} className="flex items-center justify-between bg-slate-800 p-2 rounded text-sm">
                            <span className="truncate">{doc.name}</span>
                            <button type="button" onClick={() => removeDocument(doc.name)} className="ml-2 text-red-400 hover:text-red-300">
                                <TrashIcon />
                            </button>
                        </div>
                      ))}
                    </div>
                </div>
                <div>
                    <label htmlFor="knowledgeText" className="block text-sm font-medium text-gray-300 mb-1 flex items-center space-x-2"><FileTextIcon/> <span>{t.addTextKnowledge}</span></label>
                    <textarea id="knowledgeText" rows={4} value={knowledgeText} onChange={(e) => setKnowledgeText(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                        placeholder={t.addTextKnowledgePlaceholder}/>
                </div>
            </div>
        )}

        {selectedAgent?.isSalesCoach && (
            <div className="space-y-6 pt-4 border-t border-slate-700">
                <div className="grid md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">{t.scoringWeightages}</label>
                    <div className="space-y-3">
                    {Object.keys(weightages).map(key => {
                        const k = key as keyof Weightages;
                        return (
                            <div key={k}>
                                <div className="flex justify-between text-sm">
                                    <span className="capitalize text-gray-400">{t[k]}</span>
                                    <span className="font-semibold text-violet-300">{weightages[k]}%</span>
                                </div>
                                <input type="range" min="0" max="100" value={weightages[k]} onChange={(e) => handleWeightChange(k, parseInt(e.target.value))}
                                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer range-thumb-violet-500"/>
                            </div>
                        )
                    })}
                    </div>
                </div>
                <div>
                    <label htmlFor="passingScore" className="block text-sm font-medium text-gray-300 mb-2">{t.passingScore}</label>
                    <div className="flex items-center space-x-4">
                        <input type="range" id="passingScore" min="0" max="100" value={passingScore} onChange={(e) => setPassingScore(parseInt(e.target.value))}
                        className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer range-thumb-violet-500"/>
                        <span className="font-semibold text-violet-300 text-lg w-12 text-center">{passingScore}</span>
                    </div>
                </div>
                </div>
            </div>
        )}

         <div>
              <label htmlFor="attemptsAllowed" className="block text-sm font-medium text-gray-300 mb-2">{t.attemptsAllowed}</label>
              <div className="flex items-center space-x-4">
                <input type="range" id="attemptsAllowed" min="1" max="10" value={attemptsAllowed} onChange={(e) => setAttemptsAllowed(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer range-thumb-violet-500"/>
                <span className="font-semibold text-violet-300 text-lg w-12 text-center">{attemptsAllowed}</span>
              </div>
            </div>

        <div className="flex justify-end space-x-3">
          <button type="button" onClick={onDone} className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-md font-semibold transition-colors">{t.cancel}</button>
          <button type="submit" className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-md font-semibold transition-colors flex items-center space-x-2">
            <PlusIcon />
            <span>{t.createLesson}</span>
          </button>
        </div>
      </form>
    </div>
  );
};


export default function AdminDashboard({ lessons, addLesson, updateLesson, aiAgents, addAgent, language }: AdminDashboardProps) {
  const [isCreatorVisible, setIsCreatorVisible] = useState(false);
  const [isAgentCreatorVisible, setIsAgentCreatorVisible] = useState(false);
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const initialGenerationTriggered = useRef(false);

  const t = translations[language];
  
  const handleGenerateAudio = async (lesson: Lesson) => {
    setGenerating(prev => ({...prev, [lesson.id]: true}));
    try {
        const agent = aiAgents.find(a => a.id === lesson.agentId);
        if (!agent) throw new Error("Agent not found for this lesson");
        const audioData = await generateSampleAudio(lesson, agent);
        updateLesson({ ...lesson, sampleAudioData: audioData });
    } catch (error) {
        console.error("Audio generation failed:", error);
        alert(`Failed to generate audio for "${lesson.title}". Please try again. Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
        setGenerating(prev => ({...prev, [lesson.id]: false}));
    }
  };

  useEffect(() => {
    if (lessons.length > 0 && !initialGenerationTriggered.current) {
      initialGenerationTriggered.current = true;
      lessons.forEach(lesson => {
        if (!lesson.sampleAudioData && (lesson.submissionType === 'video' || lesson.submissionType === 'audio')) {
          handleGenerateAudio(lesson);
        }
      });
    }
  }, [lessons]);

  const getAgentTitle = (agentId: string) => aiAgents.find(a => a.id === agentId)?.title || 'Unknown Agent';

  return (
    <div>
      {isAgentCreatorVisible && <AgentCreator addAgent={addAgent} onDone={() => setIsAgentCreatorVisible(false)} language={language} />}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-violet-400">{t.adminDashboard}</h2>
        <button
          onClick={() => setIsCreatorVisible(!isCreatorVisible)}
          className="bg-violet-600 hover:bg-violet-500 text-white font-bold py-2 px-4 rounded-lg flex items-center space-x-2 transition-transform duration-300 ease-in-out transform hover:scale-105"
        >
          <PlusIcon />
          <span>{isCreatorVisible ? t.closeCreator : t.newLesson}</span>
        </button>
      </div>
      
      {isCreatorVisible && <LessonCreator addLesson={addLesson} aiAgents={aiAgents} onDone={() => setIsCreatorVisible(false)} language={language} />}
      
      <div className="grid lg:grid-cols-3 gap-8 mt-8">
        <div className="lg:col-span-2 space-y-4">
            <h3 className="text-2xl font-semibold text-gray-300">{t.existingLessons} ({lessons.length})</h3>
            {lessons.map(lesson => (
            <div key={lesson.id} className="bg-slate-800 p-4 rounded-lg shadow-md border border-slate-700">
                <div className="flex justify-between items-start gap-4">
                <div>
                    <h4 className="font-bold text-lg text-violet-300">{lesson.title}</h4>
                    <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${lesson.type === 'internal' ? 'bg-amber-500/20 text-amber-300' : 'bg-sky-500/20 text-sky-300'}`}>{t[lesson.type]}</span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-700">{t[lesson.submissionType]}</span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-700">{getAgentTitle(lesson.agentId)}</span>
                    </div>
                </div>
                <div className="flex-shrink-0">
                    {(lesson.submissionType === 'video' || lesson.submissionType === 'audio') && (
                        generating[lesson.id] ? (
                        <div className="flex items-center space-x-2 text-cyan-300" title="Generating audio...">
                            <LoadingSpinnerIcon className="w-5 h-5 animate-spin" />
                            <span className="text-xs">{t.generating}</span>
                        </div>
                        ) : lesson.sampleAudioData ? (
                        <AudioWaveIcon className="text-cyan-400" />
                        ) : (
                        <button 
                            onClick={() => handleGenerateAudio(lesson)}
                            className="flex items-center space-x-2 text-sm bg-slate-700 hover:bg-slate-600 text-violet-300 font-semibold py-1 px-3 rounded-lg transition-colors"
                        >
                            <BrainCircuitIcon className="w-4 h-4" />
                            <span>{t.generateSample}</span>
                        </button>
                        )
                    )}
                </div>
                </div>
                <p className="text-sm text-gray-400 mt-2 line-clamp-2">{lesson.question}</p>
            </div>
            ))}
        </div>

        <div className="lg:col-span-1">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-2xl font-semibold text-gray-300">{t.aiAgents} ({aiAgents.length})</h3>
                <button
                    onClick={() => setIsAgentCreatorVisible(true)}
                    className="bg-slate-700 hover:bg-slate-600 text-violet-300 font-bold py-1 px-3 rounded-lg flex items-center space-x-2 text-sm"
                >
                    <PlusIcon />
                    <span>{t.newAgent}</span>
                </button>
            </div>
            <div className="space-y-3">
                {aiAgents.map(agent => (
                    <div key={agent.id} className="bg-slate-800 p-3 rounded-lg border border-slate-700">
                        <div className="flex items-center space-x-3">
                            <BotIcon className="w-6 h-6 text-violet-400 flex-shrink-0" />
                            <div>
                                <h4 className="font-semibold text-violet-300">{agent.title}</h4>
                                <p className="text-xs text-gray-400 line-clamp-2">{agent.instructions}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
}