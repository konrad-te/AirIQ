import { useEffect, useState } from 'react'
import './FeedbackComposer.css'

export default function FeedbackComposer({
  label = 'Was it helpful?',
  note = 'Optional: tell us what worked well or what felt off.',
  busy = false,
  savedVote = '',
  error = '',
  onSubmit = null,
  savedMessage = 'Thanks. Your feedback was saved.',
}) {
  const [draftVote, setDraftVote] = useState('')
  const [draftText, setDraftText] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (savedVote && !error) {
      setDraftVote(savedVote)
      setDraftText('')
      setIsOpen(false)
    }
  }, [savedVote, error])

  const activeVote = isOpen ? draftVote : savedVote
  const helpfulSelected = activeVote === 'helpful'
  const notHelpfulSelected = activeVote === 'not_helpful'
  const isSubmitted = Boolean(savedVote)

  const handleStart = (vote) => {
    if (isSubmitted) return
    setDraftVote(vote)
    setIsOpen(true)
  }

  const handleCancel = () => {
    setDraftVote('')
    setDraftText('')
    setIsOpen(false)
  }

  const handleSubmit = () => {
    if (!draftVote || typeof onSubmit !== 'function') return
    onSubmit(draftVote, draftText.trim())
  }

  return (
    <div className="feedback-composer">
      <div className="feedback-composer__copy">
        <span className="feedback-composer__label">{label}</span>
        <span className="feedback-composer__note">{note}</span>
      </div>

      <div className="feedback-composer__actions">
        <button
          type="button"
          className={`feedback-composer__vote-btn${helpfulSelected ? ' feedback-composer__vote-btn--active' : ''}`}
          onClick={() => handleStart('helpful')}
          disabled={busy || isSubmitted}
        >
          Helpful
        </button>
        <button
          type="button"
          className={`feedback-composer__vote-btn feedback-composer__vote-btn--negative${notHelpfulSelected ? ' feedback-composer__vote-btn--active' : ''}`}
          onClick={() => handleStart('not_helpful')}
          disabled={busy || isSubmitted}
        >
          Not helpful
        </button>
      </div>

      {isOpen && !isSubmitted ? (
        <div className="feedback-composer__editor">
          <textarea
            className="feedback-composer__textarea"
            value={draftText}
            onChange={(event) => setDraftText(event.target.value)}
            placeholder="Optional: add a short note for the team."
            maxLength={2000}
            rows={3}
            disabled={busy}
          />
          <div className="feedback-composer__editor-actions">
            <button type="button" className="feedback-composer__submit" onClick={handleSubmit} disabled={busy || !draftVote}>
              {busy ? 'Sending...' : 'Send feedback'}
            </button>
            <button type="button" className="feedback-composer__cancel" onClick={handleCancel} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {isSubmitted && !error ? (
        <p className="feedback-composer__status">{savedMessage}</p>
      ) : null}
      {error ? (
        <p className="feedback-composer__error">{error}</p>
      ) : null}
    </div>
  )
}
