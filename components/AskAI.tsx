'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function AskAI() {
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const copyTranscript = () => {
    const transcript = messages
      .map(msg => `${msg.role === 'user' ? 'You' : 'AI'}: ${msg.content}`)
      .join('\n\n');
    navigator.clipboard.writeText(transcript);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isLoading) return;

    const userQuestion = question.trim();
    setQuestion('');
    setMessages(prev => [...prev, { role: 'user', content: userQuestion }]);
    setIsLoading(true);

    try {
      // Send conversation history for context
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: userQuestion,
          history: messages, // Include previous messages for conversation memory
        }),
      });

      const data = await response.json();

      if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}` }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.answer }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Failed to connect. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="ask-ai-fab"
        aria-label="Ask AI"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="10" r="1" fill="currentColor" />
          <circle cx="8" cy="10" r="1" fill="currentColor" />
          <circle cx="16" cy="10" r="1" fill="currentColor" />
        </svg>
      </button>

      {/* Chat Panel (Bottom Sheet on mobile) */}
      {isOpen && (
        <>
          <div className="ask-ai-backdrop" onClick={() => setIsOpen(false)} />
          <div className="ask-ai-panel">
            <div className="ask-ai-header">
              <h3>AI</h3>
              <div className="ask-ai-header-buttons">
                {messages.length > 0 && (
                  <button onClick={copyTranscript} className="ask-ai-copy" aria-label="Copy transcript" title="Copy transcript">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                )}
                <button onClick={() => setIsOpen(false)} className="ask-ai-close" aria-label="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              </div>
            </div>

            <div className="ask-ai-messages">
              {messages.map((msg, i) => (
                <div key={i} className={`ask-ai-message ${msg.role}`}>
                  <div className="ask-ai-message-content">
                    {msg.role === 'assistant' ? (
                      <ReactMarkdown
                        components={{
                          a: ({ href, children }) => (
                            <a href={href} target="_blank" rel="noopener noreferrer">
                              {children}
                            </a>
                          ),
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      msg.content
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="ask-ai-message assistant">
                  <div className="ask-ai-message-content ask-ai-loading">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="ask-ai-input-form">
              <input
                ref={inputRef}
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a question..."
                disabled={isLoading}
              />
              <button type="submit" disabled={isLoading || !question.trim()}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </form>
          </div>
        </>
      )}
    </>
  );
}
