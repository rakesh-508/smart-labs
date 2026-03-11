/* ───────────────────────────────────────────────────────
   Smart Lab – Chat Interface Component
   Student chat input + agent response display
   with markdown-like rendering
   ─────────────────────────────────────────────────────── */

import { useState, useRef, useEffect } from 'react';
import type { ChatMessage } from '../../types';

interface Props {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  isProcessing: boolean;
}

/** Simple markdown-ish renderer: bold, code, newlines */
function renderContent(content: string) {
  const parts = content.split(/(\*\*.*?\*\*|`.*?`|\n)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    if (part === '\n') {
      return <br key={i} />;
    }
    return <span key={i}>{part}</span>;
  });
}

const QUICK_ACTIONS = [
  'Take a lemon',
  'Roll the lemon',
  'Take a galvanized nail',
  'Take copper wire',
  'Insert nail into lemon',
  'Insert copper into lemon',
  'Take an LED',
  'Connect nail to LED',
  'Connect copper to LED',
  'Complete the circuit',
  'Add another lemon',
  'Show the reactions',
  'Calculate the voltage',
];

export default function ChatInterface({ messages, onSend, isProcessing }: Props) {
  const [input, setInput] = useState('');
  const [showQuickActions, setShowQuickActions] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isProcessing) return;
    onSend(trimmed);
    setInput('');
    setShowQuickActions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleQuickAction = (action: string) => {
    onSend(action);
    setShowQuickActions(false);
  };

  return (
    <>
      <div className="chat-header">
        🤖 Lab Assistant
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          AI-Powered
        </span>
      </div>

      <div className="chat-messages">
        {messages.map(msg => (
          <div key={msg.id} className={`chat-message ${msg.role}`}>
            {renderContent(msg.content)}

            {/* Attachments */}
            {msg.attachments && msg.attachments.length > 0 && (
              <div style={{ marginTop: 8 }}>
                {msg.attachments.map((att, i) => (
                  <div key={i} style={{
                    background: 'rgba(0,0,0,0.2)',
                    padding: '6px 10px',
                    borderRadius: 6,
                    marginTop: 4,
                    fontSize: '0.75rem',
                  }}>
                    <span style={{ color: 'var(--text-muted)' }}>{att.label}</span>
                    {att.type === 'formula' && (
                      <div style={{ fontFamily: 'Courier New', marginTop: 2, color: 'var(--info)' }}>
                        {att.content}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div style={{
              fontSize: '0.65rem',
              color: msg.role === 'student' ? 'rgba(255,255,255,0.5)' : 'var(--text-muted)',
              marginTop: 4,
            }}>
              {msg.timestamp.toLocaleTimeString()}
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="chat-message agent" style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>
            🔄 Processing...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      {showQuickActions && (
        <div style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--border)',
          maxHeight: 200,
          overflowY: 'auto',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
        }}>
          {QUICK_ACTIONS.map(action => (
            <button
              key={action}
              onClick={() => handleQuickAction(action)}
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
                padding: '4px 10px',
                borderRadius: 12,
                fontSize: '0.75rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                (e.target as HTMLElement).style.borderColor = 'var(--accent)';
                (e.target as HTMLElement).style.color = 'var(--accent)';
              }}
              onMouseLeave={e => {
                (e.target as HTMLElement).style.borderColor = 'var(--border)';
                (e.target as HTMLElement).style.color = 'var(--text-secondary)';
              }}
            >
              {action}
            </button>
          ))}
        </div>
      )}

      <div className="chat-input-area">
        <button
          onClick={() => setShowQuickActions(!showQuickActions)}
          style={{
            background: showQuickActions ? 'var(--accent)' : 'var(--bg-tertiary)',
            border: 'none',
            color: showQuickActions ? 'white' : 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '10px',
            borderRadius: 10,
            fontSize: '1rem',
          }}
          title="Quick actions"
        >
          ⚡
        </button>
        <input
          className="chat-input"
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Tell me what to do... e.g. 'Take a lemon'"
          disabled={isProcessing}
        />
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={isProcessing || !input.trim()}
        >
          Send
        </button>
      </div>
    </>
  );
}
