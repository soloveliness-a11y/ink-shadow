import type { ClientIntent } from "@mmg/schema";
import { useState } from 'react';
import { THEORY_MAX } from '../../lib/limits.js';
import { counterColor } from './ChatTab.js';

interface TheoryTabProps {
  myTheory?: string;
  send: (intent: ClientIntent) => void;
}

export function TheoryTab({ myTheory, send }: TheoryTabProps) {
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // 已提交：显示只读视图
  if (myTheory || submitted) {
    return (
      <div className="theory-submitted">
        <div className="theory-submitted-head">
          <span className="badge badge-teal">已提交</span>
          <span className="theory-submitted-hint">推理已锁定,揭晓时将与真相对照</span>
        </div>
        {myTheory && <p className="theory-submitted-text">{myTheory}</p>}
      </div>
    );
  }

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    send({ kind: 'submitTheory', text: trimmed.slice(0, THEORY_MAX) });
    setSubmitted(true);
  };

  return (
    <div className="theory-composer">
      <div className="theory-composer-head">
        <div className="section-label">写下你的推理</div>
        <p>你认为谁是凶手？动机和手法是什么？提交后不可修改。</p>
      </div>
      <textarea
        className="input theory-textarea"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, THEORY_MAX))}
        placeholder="根据目前掌握的线索,写下你的推理过程..."
        rows={8}
      />
      <div className="theory-composer-bar">
        <div className="composer-counter" style={{ color: counterColor(text.length, THEORY_MAX) }}>
          {text.length}/{THEORY_MAX}
        </div>
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="btn btn-primary btn-sm"
        >
          提交推理
        </button>
      </div>
    </div>
  );
}
