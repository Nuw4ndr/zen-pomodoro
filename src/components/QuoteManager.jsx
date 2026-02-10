import React, { useState } from 'react';

function QuoteManager({ quotes, onUpdate, onClose }) {
    const [editingIndex, setEditingIndex] = useState(null);
    const [newQuote, setNewQuote] = useState('');
    const [editText, setEditText] = useState('');

    const addQuote = (e) => {
        e.preventDefault();
        if (newQuote.trim()) {
            onUpdate([...quotes, newQuote.trim()]);
            setNewQuote('');
        }
    };

    const deleteQuote = (index) => {
        const updated = quotes.filter((_, i) => i !== index);
        onUpdate(updated);
    };

    const startEdit = (index) => {
        setEditingIndex(index);
        setEditText(quotes[index]);
    };

    const saveEdit = (index) => {
        const updated = [...quotes];
        updated[index] = editText.trim();
        onUpdate(updated);
        setEditingIndex(null);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Manage Quotes</h3>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>

                <form onSubmit={addQuote} className="add-quote-form">
                    <input
                        type="text"
                        placeholder="Add a new focus quote..."
                        value={newQuote}
                        onChange={(e) => setNewQuote(e.target.value)}
                    />
                    <button type="submit" className="add-btn">Add</button>
                </form>

                <ul className="quote-list">
                    {quotes.map((q, index) => (
                        <li key={index} className="quote-item">
                            {editingIndex === index ? (
                                <div className="edit-container">
                                    <input
                                        type="text"
                                        value={editText}
                                        onChange={(e) => setEditText(e.target.value)}
                                        autoFocus
                                    />
                                    <button onClick={() => saveEdit(index)}>Save</button>
                                    <button onClick={() => setEditingIndex(null)}>Cancel</button>
                                </div>
                            ) : (
                                <>
                                    <span className="quote-text">{q}</span>
                                    <div className="quote-actions">
                                        <button onClick={() => startEdit(index)}>Edit</button>
                                        <button className="delete-btn" onClick={() => deleteQuote(index)}>Delete</button>
                                    </div>
                                </>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

export default QuoteManager;
