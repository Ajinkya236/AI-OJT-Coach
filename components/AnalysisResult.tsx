
import React, { useState, useEffect, useRef } from 'react';
import { AnalysisResultData, Lesson, AIAgent } from '../types';
import { CheckCircleIcon, RefreshIcon, SpeakerIcon, StopCircleIcon, ThumbsDownIcon, ThumbsUpIcon, XCircleIcon, LoadingSpinnerIcon } from './icons';
import { generateSpeech, decode, decodeAudioData } from '../services/geminiService';
import { translations } from '../translations';


interface AnalysisResultProps {
  result: AnalysisResultData;
  lesson: Lesson;
  agent: AIAgent;
  onTryAgain: () => void;
  language: string;
}

const CustomTooltip = ({ active, payload, label, language }: any) => {
    const t = translations[language];
    if (active && payload && payload.length) {
        return (
            <div className="bg-slate-700 p-2 border border-slate-600 rounded-md shadow-lg">
                <p className="label text-white font-bold">{`${t[label.toLowerCase()]} : ${payload[0].value}`}</p>
            </div>
        );
    }
    return null;
};

export default function AnalysisResult({ result, lesson, agent, onTryAgain, language }: AnalysisResultProps) {
  const [recharts, setRecharts] = useState<any>((window as any).Recharts);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const autoPlayed = useRef(false);
  
  const t = translations[language];
  const hasScore = agent.isSalesCoach && result.scores && result.finalScore !== undefined && result.passed !== undefined && lesson.passingScore !== undefined;

  useEffect(() => {
    if (recharts) return;

    const intervalId = setInterval(() => {
      if ((window as any).Recharts) {
        setRecharts((window as any).Recharts);
        clearInterval(intervalId);
      }
    }, 100);

    return () => clearInterval(intervalId);
  }, [recharts]);

  const handleSpeak = async () => {
    if (isSpeaking) {
        audioSourceRef.current?.stop();
        setIsSpeaking(false);
        return;
    }

    setIsLoadingAudio(true);
    try {
        const textToSpeak = result.feedback.join('. ');
        const audioData = await generateSpeech(textToSpeak);
        
        if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const audioContext = audioContextRef.current;

        const audioBuffer = await decodeAudioData(
            decode(audioData),
            audioContext,
            24000,
            1
        );

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.onended = () => {
          setIsSpeaking(false);
          audioSourceRef.current = null;
        }
        source.start();
        
        audioSourceRef.current = source;
        setIsSpeaking(true);
    } catch (e) {
        console.error("Failed to play audio", e);
        alert("Sorry, could not play the audio feedback.");
    } finally {
        setIsLoadingAudio(false);
    }
  };

  useEffect(() => {
    if (!autoPlayed.current && result) {
      autoPlayed.current = true;
      handleSpeak();
    }
    // Cleanup audio context and source on unmount
    return () => {
        audioSourceRef.current?.stop();
        if (audioContextRef.current?.state !== 'closed') {
          audioContextRef.current?.close();
        }
    }
  }, [result]);

  const data = hasScore ? [
    { subject: 'Tone', score: result.scores!.tone, fullMark: 100 },
    { subject: 'Content', score: result.scores!.content, fullMark: 100 },
    { subject: 'Approach', score: result.scores!.approach, fullMark: 100 },
  ] : [];
  
  const renderChart = () => {
    if (!recharts) {
      return <div className="flex items-center justify-center h-full text-gray-400">Loading Chart...</div>;
    }
    
    const { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip } = recharts;

    return (
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
            <PolarGrid stroke="#475569" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: '#cbd5e1', fontSize: 14 }} tickFormatter={(value) => t[value.toLowerCase()]} />
            <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#475569" />
            <Radar name={t.yourScore} dataKey="score" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.6} />
            <Tooltip content={<CustomTooltip language={language} />} />
            <Legend formatter={(value) => t[value.replace(/\s/g, '').toLowerCase()]}/>
        </RadarChart>
      </ResponsiveContainer>
    );
  };


  return (
    <div className="bg-slate-800/50 rounded-lg p-6 md:p-8 border border-slate-700">
        <h2 className="text-3xl font-bold text-center text-white mb-2">{t.analysisComplete}</h2>
        <p className="text-center text-gray-400 mb-8">{t.analysisCompleteDesc(lesson.title)}</p>

        {hasScore && (
          <div className="grid md:grid-cols-3 gap-8 items-center">
              <div className="md:col-span-1 flex flex-col items-center justify-center space-y-4">
                  <div className={`relative w-40 h-40 rounded-full flex items-center justify-center ${result.passed ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                      <div className={`absolute inset-0 border-8 rounded-full ${result.passed ? 'border-green-500' : 'border-red-500'}`}></div>
                      <span className="text-5xl font-bold text-white">{result.finalScore}</span>
                      <span className="absolute bottom-6 text-lg text-gray-300">/ 100</span>
                  </div>
                  <div className={`flex items-center space-x-2 px-4 py-2 rounded-full text-lg font-semibold ${result.passed ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                      {result.passed ? <CheckCircleIcon /> : <XCircleIcon />}
                      <span>{t.status}: {result.passed ? t.passed : t.failed}</span>
                  </div>
                  <p className="text-sm text-gray-400">{t.passingScore}: {lesson.passingScore}</p>
              </div>
              <div className="md:col-span-2 h-80">
                  {renderChart()}
              </div>
          </div>
        )}

        <div className={hasScore ? "mt-12" : "mt-0"}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-semibold text-cyan-300">{t.actionableFeedback}</h3>
              <button 
                onClick={handleSpeak} 
                disabled={isLoadingAudio}
                className="p-2 rounded-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label={isSpeaking ? 'Stop feedback' : 'Read feedback aloud'}
              >
                  {isLoadingAudio ? <LoadingSpinnerIcon className="w-5 h-5 animate-spin" /> : isSpeaking ? <StopCircleIcon /> : <SpeakerIcon />}
              </button>
            </div>
            <ul className="space-y-3">
                {result.feedback.map((item, index) => (
                    <li key={index} className="flex items-start space-x-3 p-3 bg-slate-800 rounded-md">
                        {item.toLowerCase().includes('great') || item.toLowerCase().includes('well done') || item.toLowerCase().includes('good') ?
                          <ThumbsUpIcon className="w-5 h-5 text-green-400 mt-1 flex-shrink-0" />
                          :
                          <ThumbsDownIcon className="w-5 h-5 text-yellow-400 mt-1 flex-shrink-0" />
                        }
                        <p className="text-gray-300">{item}</p>
                    </li>
                ))}
            </ul>
        </div>

        <div className="mt-12 text-center">
            <button onClick={onTryAgain} className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 px-6 rounded-lg flex items-center justify-center space-x-2 transition-all transform hover:scale-105 mx-auto">
                <RefreshIcon />
                <span>{t.tryAgain}</span>
            </button>
        </div>
    </div>
  );
}