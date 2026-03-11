import React, { useState, useEffect } from 'react';
import { AIAgent, Lesson } from '../types';
import LessonView from './LessonView';
import { ArrowRightIcon, LockIcon } from './icons';
import { translations } from '../translations';

interface LearnerDashboardProps {
  lessons: Lesson[];
  aiAgents: AIAgent[];
  language: string;
}

interface AttemptInfo {
  count: number;
  lastAttemptTimestamp: number;
}

const CooldownTimer: React.FC<{ timeLeft: number; language: string }> = ({ timeLeft, language }) => {
    const [time, setTime] = useState(timeLeft);
    const t = translations[language];

    useEffect(() => {
        if (timeLeft <= 0) return;
        const timer = setInterval(() => {
            setTime(prev => Math.max(0, prev - 1000));
        }, 1000);
        return () => clearInterval(timer);
    }, [timeLeft]);

    const hours = Math.floor(time / (1000 * 60 * 60));
    const minutes = Math.floor((time % (1000 * 60 * 60)) / (1000 * 60));

    return <span className="text-sm font-bold">{`${hours}${t.hoursUnit} ${minutes}${t.minutesUnit}`}</span>
}

export default function LearnerDashboard({ lessons, aiAgents, language }: LearnerDashboardProps) {
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [attemptData, setAttemptData] = useState<Record<string, AttemptInfo>>({});
  const t = translations[language];

  useEffect(() => {
    try {
        const storedData = localStorage.getItem('lessonAttempts');
        if (storedData) {
            setAttemptData(JSON.parse(storedData));
        }
    } catch(e) {
        console.error("Failed to parse attempt data from localStorage", e);
    }
  }, [selectedLesson]);


  if (selectedLesson) {
    const selectedAgent = aiAgents.find(agent => agent.id === selectedLesson.agentId);
    if (!selectedAgent) {
        return <div>Error: Agent for this lesson not found.</div>
    }
    return <LessonView lesson={selectedLesson} agent={selectedAgent} onBack={() => setSelectedLesson(null)} language={language} />;
  }
  
  const TWENTY_FOUR_HOURS_IN_MS = 24 * 60 * 60 * 1000;

  return (
    <div>
      <h2 className="text-3xl font-bold text-cyan-400 mb-6">{t.availableLessons}</h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {lessons.map(lesson => {
            const lessonAttemptInfo = attemptData[lesson.id] || { count: 0, lastAttemptTimestamp: 0 };
            const timeSinceLastAttempt = Date.now() - lessonAttemptInfo.lastAttemptTimestamp;
            
            let currentAttemptCount = lessonAttemptInfo.count;
            if (currentAttemptCount >= lesson.attemptsAllowed && timeSinceLastAttempt > TWENTY_FOUR_HOURS_IN_MS) {
                currentAttemptCount = 0; // Visually reset attempts if cooldown is over
            }
            
            const attemptsRemaining = lesson.attemptsAllowed - currentAttemptCount;
            const isExhausted = attemptsRemaining <= 0;
            
            let isLocked = false;
            let cooldownTimeRemaining = 0;

            if(isExhausted) {
                if(timeSinceLastAttempt < TWENTY_FOUR_HOURS_IN_MS) {
                    isLocked = true;
                    cooldownTimeRemaining = TWENTY_FOUR_HOURS_IN_MS - timeSinceLastAttempt;
                }
            }

            return (
              <div 
                key={lesson.id}
                className={`bg-slate-800 rounded-xl border ${isLocked ? 'border-red-500/30' : 'border-slate-700 hover:border-cyan-500/50'} shadow-lg p-6 flex flex-col justify-between transition-all duration-300 ${isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer transform hover:-translate-y-1 group'}`}
                onClick={() => !isLocked && setSelectedLesson(lesson)}
              >
                <div>
                  <h3 className="text-lg font-bold text-cyan-300">{lesson.title}</h3>
                  <p className="text-sm text-gray-400 mt-2 line-clamp-3">{lesson.question}</p>
                </div>
                <div className="mt-6 flex justify-between items-center">
                    {isLocked ? (
                        <div className="flex items-center space-x-2 text-red-400">
                           <LockIcon />
                           <CooldownTimer timeLeft={cooldownTimeRemaining} language={language} />
                        </div>
                    ) : (
                        <span className="text-sm font-semibold text-gray-400">
                            {t.attemptsRemaining}: {attemptsRemaining}/{lesson.attemptsAllowed}
                        </span>
                    )}

                    {!isLocked && (
                      <span className="text-sm font-semibold text-cyan-400 flex items-center space-x-2">
                          <span>{t.startPractice}</span>
                          <ArrowRightIcon className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                      </span>
                    )}
                </div>
              </div>
            )
        })}
      </div>
    </div>
  );
}