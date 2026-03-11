import React, { useState, useRef, useEffect } from 'react';
import { Lesson, AnalysisResultData, AIAgent, Document as DocType } from '../types';
import { analyzeSubmission, decode, decodeAudioData } from '../services/geminiService';
import AnalysisResult from './AnalysisResult';
import { BackIcon, LoadingSpinnerIcon, VideoRecorderIcon, PlayCircleIcon, SendIcon, StopCircleIcon, UploadIcon, FileAudioIcon, FileImageIcon, FileDocIcon, FileTextIcon, MonitorIcon } from './icons';
import { translations } from '../translations';

const AudioPlayer = ({ base64Data, onEnded }: { base64Data: string; onEnded: () => void }) => {
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

    useEffect(() => {
        const playAudio = async () => {
            try {
                if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                }
                const audioContext = audioContextRef.current;
                const audioBuffer = await decodeAudioData(decode(base64Data), audioContext, 24000, 1);
                const source = audioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(audioContext.destination);
                source.onended = onEnded;
                source.start();
                audioSourceRef.current = source;
            } catch (e) {
                console.error("Failed to play audio", e);
                onEnded();
            }
        };

        playAudio();

        return () => {
            audioSourceRef.current?.stop();
            audioContextRef.current?.close();
        };
    }, [base64Data, onEnded]);

    return null;
};

interface LessonViewProps {
  lesson: Lesson;
  agent: AIAgent;
  onBack: () => void;
  language: string;
}

type RecordingState = 'idle' | 'recording' | 'recorded' | 'analyzing' | 'error' | 'success';

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

export default function LessonView({ lesson, agent, onBack, language }: LessonViewProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResultData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlayingSample, setIsPlayingSample] = useState(false);
  const [showSampleText, setShowSampleText] = useState(false);
  const [submittedFile, setSubmittedFile] = useState<{url: string, blob: Blob, doc?: DocType} | null>(null);
  const [responseText, setResponseText] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  
  const t = translations[language];
  const isMediaSubmission = ['video', 'audio', 'videoStream', 'screenShare'].includes(lesson.submissionType);
  const samplePitch = t.samplePitches?.[lesson.id];

  const startRecording = async () => {
    try {
      let stream: MediaStream;
      if (lesson.submissionType === 'screenShare') {
        stream = await navigator.mediaDevices.getDisplayMedia({ 
            video: true,
            audio: true 
        });
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ 
            audio: true, 
            video: lesson.submissionType === 'video' || lesson.submissionType === 'videoStream'
        });
      }

      if ((lesson.submissionType === 'video' || lesson.submissionType === 'videoStream' || lesson.submissionType === 'screenShare') && videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.play();
      }
      
      const mimeType = (lesson.submissionType === 'audio') ? 'audio/webm' : 'video/webm';
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
      recordedChunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        setSubmittedFile({ url: URL.createObjectURL(blob), blob });
        setRecordingState('recorded');
        stream.getTracks().forEach(track => track.stop());
        if (videoPreviewRef.current) {
            videoPreviewRef.current.srcObject = null;
        }
      };

      mediaRecorderRef.current.start();
      setRecordingState('recording');
    } catch (err) {
      console.error("Error accessing media devices.", err);
      setError("Could not access camera or microphone. Please check permissions.");
      setRecordingState('error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const doc = {
        name: file.name,
        type: file.type,
        content: await blobToBase64(file),
      };
      setSubmittedFile({url: URL.createObjectURL(file), blob: file, doc});
      setRecordingState('recorded');
    }
  };

  const handleRetake = () => {
      setRecordingState('idle');
      setAnalysisResult(null);
      setError(null);
      setSubmittedFile(null);
      setResponseText('');
  }

  const handleSubmitForAnalysis = async () => {
    let submissionBlob: Blob | null = submittedFile?.blob || null;

    if (lesson.submissionType === 'text') {
        if (!responseText.trim()) {
            setError("Response text cannot be empty.");
            setRecordingState('error');
            return;
        }
        submissionBlob = new Blob([responseText], { type: 'text/plain' });
    }
    
    if (!submissionBlob) {
        setError("No file or text to submit.");
        setRecordingState('error');
        return;
    }
    
    try {
      const attemptData = JSON.parse(localStorage.getItem('lessonAttempts') || '{}');
      let lessonAttempt = attemptData[lesson.id] || { count: 0, lastAttemptTimestamp: 0 };
      const twentyFourHoursInMillis = 24 * 60 * 60 * 1000;
      const timeSinceLastAttempt = Date.now() - lessonAttempt.lastAttemptTimestamp;
      if (lessonAttempt.count >= lesson.attemptsAllowed && timeSinceLastAttempt > twentyFourHoursInMillis) {
          lessonAttempt.count = 1;
      } else {
          lessonAttempt.count += 1;
      }
      lessonAttempt.lastAttemptTimestamp = Date.now();
      attemptData[lesson.id] = lessonAttempt;
      localStorage.setItem('lessonAttempts', JSON.stringify(attemptData));
    } catch (e) {
      console.error("Failed to update attempt data in localStorage", e);
    }
    
    setRecordingState('analyzing');
    setError(null);
    try {
      if (submissionBlob.size === 0) throw new Error("Submission is empty.");
      const result = await analyzeSubmission(lesson, agent, submissionBlob, language);
      setAnalysisResult(result);
      setRecordingState('success');
    } catch (err) {
      console.error("Analysis failed:", err);
      const errorMessage = err instanceof Error ? err.message : "An unknown error occurred.";
      setError(`Failed to analyze your submission. ${errorMessage}. Please try again.`);
      setRecordingState('error');
    }
  };
  
  const SubmissionIcon = { 
    video: VideoRecorderIcon, 
    videoStream: VideoRecorderIcon,
    screenShare: MonitorIcon,
    audio: FileAudioIcon, 
    image: FileImageIcon, 
    document: FileDocIcon, 
    text: FileTextIcon 
  }[lesson.submissionType];
  const submissionTitle = { 
    video: t.pitchRecording, 
    videoStream: t.videoStream,
    screenShare: t.screenShare,
    audio: t.audioRecording, 
    image: t.imageSubmission, 
    document: t.documentSubmission, 
    text: t.textSubmission 
  }[lesson.submissionType];
  const submissionAccept = { image: 'image/*', document: '.pdf,.doc,.docx,.txt' }[lesson.submissionType] || undefined;


  const renderSubmissionUI = () => {
    if (lesson.submissionType === 'text') {
        return (
             <div className="flex flex-col items-center">
                <div className="w-full max-w-2xl bg-slate-800/50 rounded-lg p-6 border border-slate-700">
                    <h3 className="text-lg font-bold text-cyan-300 flex items-center space-x-2 mb-3"><SubmissionIcon /><span>{submissionTitle}</span></h3>
                    <textarea 
                        value={responseText}
                        onChange={(e) => setResponseText(e.target.value)}
                        rows={10}
                        className="w-full bg-slate-900 border border-slate-600 rounded-md p-3 text-white focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                        placeholder={t.textResponsePlaceholder}
                    />
                    <div className="flex items-center justify-end space-x-4 mt-4">
                        {responseText.trim() && (
                            <button onClick={handleRetake} className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                                {t.retake}
                            </button>
                        )}
                        <button 
                            onClick={handleSubmitForAnalysis} 
                            disabled={!responseText.trim()}
                            className="bg-violet-600 hover:bg-violet-500 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center space-x-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                            <SendIcon /><span>{t.submitForAnalysis}</span>
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col items-center">
            <div className="w-full max-w-2xl bg-slate-800/50 rounded-lg p-6 border border-slate-700">
                <h3 className="text-lg font-bold text-cyan-300 flex items-center space-x-2 mb-3"><SubmissionIcon /><span>{submissionTitle}</span></h3>
                
                {/* Preview Area */}
                <div className="aspect-video bg-black rounded-md flex items-center justify-center mb-4 overflow-hidden relative">
                    {(lesson.submissionType === 'video' || lesson.submissionType === 'videoStream' || lesson.submissionType === 'screenShare') && (recordingState === 'recording' || recordingState === 'idle') && <video ref={videoPreviewRef} muted className="w-full h-full object-cover" />}
                    {(lesson.submissionType === 'video' || lesson.submissionType === 'videoStream' || lesson.submissionType === 'screenShare') && recordingState === 'recorded' && submittedFile && <video controls src={submittedFile.url} className="w-full h-full object-contain" />}
                    
                    {lesson.submissionType === 'audio' && recordingState === 'recording' && <div className="text-white text-lg animate-pulse">{t.recording}</div>}
                    {lesson.submissionType === 'audio' && recordingState === 'recorded' && submittedFile && <audio controls src={submittedFile.url} className="w-3/4"></audio>}

                    {(lesson.submissionType === 'image' || lesson.submissionType === 'document') && recordingState === 'recorded' && submittedFile?.doc && (
                        lesson.submissionType === 'image' ? 
                        <img src={submittedFile.url} alt="submission preview" className="w-full h-full object-contain" /> :
                        <div className="text-center text-white p-4">
                            <FileDocIcon className="w-16 h-16 mx-auto mb-2 text-slate-500" />
                            <p className="font-semibold">{submittedFile.doc.name}</p>
                        </div>
                    )}
                    
                    {recordingState === 'idle' && (
                        <div className="absolute text-gray-500 text-center">
                            {(lesson.submissionType === 'video' || lesson.submissionType === 'videoStream') && t.cameraPreview}
                            {lesson.submissionType === 'screenShare' && t.screenPreview}
                            {lesson.submissionType === 'audio' && t.audioPreview}
                            {(lesson.submissionType === 'image' || lesson.submissionType === 'document') && t.filePreview}
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-center space-x-4">
                    {recordingState === 'idle' && ( isMediaSubmission ? (
                        <button onClick={startRecording} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center space-x-2 transition-all transform hover:scale-105">
                            <SubmissionIcon /><span>{t.startRecording.replace('Video', t[lesson.submissionType])}</span>
                        </button>
                    ) : (
                        <label className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center space-x-2 transition-all transform hover:scale-105 cursor-pointer">
                            <UploadIcon /><span>{t.uploadFile}</span>
                            <input type="file" className="hidden" onChange={handleFileChange} accept={submissionAccept}/>
                        </label>
                    ))}
                    {recordingState === 'recording' && (
                        <button onClick={stopRecording} className="w-full bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center space-x-2 transition-all animate-pulse">
                            <StopCircleIcon /><span>{t.stopRecording}</span>
                        </button>
                    )}
                    {recordingState === 'recorded' && (
                        <>
                            <button onClick={handleRetake} className="w-1/2 bg-slate-600 hover:bg-slate-500 text-white font-bold py-3 px-4 rounded-lg transition-colors">
                                {t.retake}
                            </button>
                            <button onClick={handleSubmitForAnalysis} className="w-1/2 bg-violet-600 hover:bg-violet-500 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center space-x-2 transition-all transform hover:scale-105">
                                <SendIcon /><span>{t.submitForAnalysis}</span>
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
  };

  const renderContent = () => {
    switch (recordingState) {
        case 'success':
            return <AnalysisResult result={analysisResult!} lesson={lesson} agent={agent} onTryAgain={handleRetake} language={language} />;
        case 'analyzing':
            return (
                <div className="text-center p-8 bg-slate-800/50 rounded-lg">
                    <LoadingSpinnerIcon className="w-12 h-12 mx-auto animate-spin text-cyan-400" />
                    <h3 className="mt-4 text-xl font-semibold">{t.analyzing}</h3>
                    <p className="text-gray-400 mt-2">{t.analyzingDesc.replace('video performance', 'submission')}</p>
                </div>
            );
        case 'error':
            return (
                <div className="text-center p-8 bg-red-900/20 border border-red-500 rounded-lg">
                    <h3 className="text-xl font-semibold text-red-400">{t.errorOccurred}</h3>
                    <p className="text-gray-300 mt-2">{error}</p>
                    <button onClick={handleRetake} className="mt-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded">
                        {t.tryAgain}
                    </button>
                </div>
            );
        default:
            return renderSubmissionUI();
    }
  }


  return (
    <div>
      {isPlayingSample && lesson.sampleAudioData && (
        <AudioPlayer base64Data={lesson.sampleAudioData} onEnded={() => setIsPlayingSample(false)} />
      )}

      <button onClick={onBack} className="flex items-center space-x-2 text-cyan-400 hover:text-cyan-300 font-semibold mb-4">
        <BackIcon />
        <span>{t.backToLessons}</span>
      </button>
      
      {recordingState !== 'success' && (
        <div className="mb-8 p-6 bg-slate-800 rounded-lg border border-slate-700">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-white mb-2">{lesson.title}</h2>
                <p className="text-gray-400">{lesson.question}</p>
              </div>
              <div className="flex-shrink-0 ml-4 space-x-2">
                {agent.isSalesCoach && samplePitch && (
                    <button 
                        onClick={() => setShowSampleText(p => !p)}
                        className="bg-slate-700 hover:bg-slate-600 text-violet-300 font-semibold py-2 px-3 rounded-lg flex items-center space-x-2 transition-colors">
                        <FileTextIcon />
                        <span>{showSampleText ? t.hideSamplePitch : t.showSamplePitch}</span>
                    </button>
                )}
                {lesson.sampleAudioData && ['video', 'audio', 'videoStream', 'screenShare'].includes(lesson.submissionType) && (
                    <button 
                        onClick={() => setIsPlayingSample(p => !p)}
                        disabled={isPlayingSample}
                        className="bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-300 font-semibold py-2 px-3 rounded-lg flex items-center space-x-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                        {isPlayingSample ? <StopCircleIcon/> : <PlayCircleIcon />}
                        <span>{isPlayingSample ? t.playingSample : t.listenToSample}</span>
                    </button>
                )}
              </div>
            </div>
            {showSampleText && samplePitch && (
                <div className="mt-4 pt-4 border-t border-slate-700">
                    <h4 className="font-semibold text-violet-300 mb-2">{t.samplePitch}</h4>
                    <blockquote className="border-l-4 border-violet-500 pl-4 py-2 bg-slate-900/50 rounded-r-md">
                        <p className="text-gray-300 italic whitespace-pre-wrap">{samplePitch}</p>
                    </blockquote>
                </div>
            )}
        </div>
      )}

      {renderContent()}
    </div>
  );
}