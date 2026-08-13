import React, { useState } from 'react'

function Modal() {
  const [isOpen, setIsOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  const open = (title, html) => {
    setTitle(title)
    setContent(html)
    setIsOpen(true)
  }

  const close = () => {
    setIsOpen(false)
  }

  return (
    <div className={`modal-overlay ${isOpen ? 'open' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) close() }}>
      <div className="modal-box">
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={close}>✕</button>
        </div>
        <div className="modal-body" dangerouslySetInnerHTML={{ __html: content }} />
      </div>
    </div>
  )
}

export default Modal