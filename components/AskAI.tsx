'use client';

import { useState, useRef, useEffect } from 'react';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || isLoading) return;

    const userQuestion = question.trim();
    setQuestion('');
    setMessages(prev => [...prev, { role: 'user', content: userQuestion }]);
    setIsLoading(true);

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userQuestion }),
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
              <h3>Ask AI</h3>
              <button onClick={() => setIsOpen(false)} className="ask-ai-close" aria-label="Close">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="ask-ai-messages">
              {messages.length === 0 && (
                <div className="ask-ai-empty">
                  <p>Ask anything about your farm data:</p>
                  <div className="ask-ai-suggestions">
                    <button onClick={() => setQuestion('How many fields do I have?')}>How many fields do I have?</button>
                    <button onClick={() => setQuestion('Which probes need repairs?')}>Which probes need repairs?</button>
                    <button onClick={() => setQuestion('Show me a summary of this season')}>Summary of this season</button>
                  </div>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`ask-ai-message ${msg.role}`}>
                  <div className="ask-ai-message-content">{msg.content}</div>
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
