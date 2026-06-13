import { useEffect, useState } from 'react';

interface CaseNotesProps {
  noteKey: string | null;
}

function readCaseNote(key: string | null): string {
  if (!key) return '';
  try { return localStorage.getItem(key) ?? ''; }
  catch { return ''; }
}

function writeCaseNote(key: string, text: string): void {
  try { localStorage.setItem(key, text); } catch {}
}

export function CaseNotes({ noteKey }: CaseNotesProps) {
  const [caseNote, setCaseNote] = useState('');
  const [loadedNoteKey, setLoadedNoteKey] = useState<string | null>(null);

  useEffect(() => {
    setCaseNote(readCaseNote(noteKey));
    setLoadedNoteKey(noteKey);
  }, [noteKey]);

  // Debounced write: 300ms after last keystroke
  useEffect(() => {
    if (!noteKey || loadedNoteKey !== noteKey) return;
    const t = window.setTimeout(() => writeCaseNote(noteKey, caseNote), 300);
    return () => window.clearTimeout(t);
  }, [caseNote, loadedNoteKey, noteKey]);

  return (
    <div className="case-notes">
      <div className="case-notes-head">
        <div>
          <div className="section-label">案情速记</div>
          <p>仅保存在本机,不会公开给其他玩家。</p>
        </div>
        <span>{caseNote.length} 字</span>
      </div>
      <textarea
        className="input case-notes-input"
        value={caseNote}
        onChange={(e) => setCaseNote(e.target.value)}
        placeholder="时间线、矛盾点、想追问的人..."
      />
    </div>
  );
}
