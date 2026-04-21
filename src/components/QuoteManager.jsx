import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';

function QuoteManager({ quotes, onClose, userId }) {
    const [editingIndex, setEditingIndex] = useState(null);
    const [newQuote, setNewQuote] = useState('');
    const [editText, setEditText] = useState('');

    const addQuote = async (e) => {
        e.preventDefault();
        if (newQuote.trim()) {
            try {
                await addDoc(collection(db, 'quotes'), {
                    text: newQuote.trim(),
                    createdAt: new Date(),
                    userId: userId
                });
                setNewQuote('');
            } catch (error) {
                console.error("Error adding quote: ", error);
            }
        }
    };

    const deleteQuote = async (quote) => {
        if (!quote.id || quote.id.startsWith('default-')) {
            alert("Default quotes cannot be deleted. Add your own quotes to manage them!");
            return;
        }
        try {
            await deleteDoc(doc(db, 'quotes', quote.id));
        } catch (error) {
            console.error("Error deleting quote: ", error);
        }
    };

    const startEdit = (index) => {
        const quote = quotes[index];
        if (!quote.id || quote.id.startsWith('default-')) {
            alert("Default quotes cannot be edited. Add your own quotes to manage them!");
            return;
        }
        setEditingIndex(index);
        setEditText(quote.text);
    };

    const saveEdit = async (id) => {
        try {
            const quoteRef = doc(db, 'quotes', id);
            await updateDoc(quoteRef, {
                text: editText.trim()
            });
            setEditingIndex(null);
        } catch (error) {
            console.error("Error updating quote: ", error);
        }
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
                    {quotes.map((q, index) => {
                        const isDefault = !q.id || q.id.startsWith('default-');
                        const text = q.text || q;

                        return (
                            <li key={q.id || index} className="quote-item">
                                {editingIndex === index ? (
                                    <div className="edit-container">
                                        <input
                                            type="text"
                                            value={editText}
                                            onChange={(e) => setEditText(e.target.value)}
                                            autoFocus
                                        />
                                        <button onClick={() => saveEdit(q.id)}>Save</button>
                                        <button onClick={() => setEditingIndex(null)}>Cancel</button>
                                    </div>
                                ) : (
                                    <>
                                        <span className="quote-text">{text} {isDefault && <small>(Default)</small>}</span>
                                        {!isDefault && (
                                            <div className="quote-actions">
                                                <button onClick={() => startEdit(index)}>Edit</button>
                                                <button className="delete-btn" onClick={() => deleteQuote(q)}>Delete</button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
}

export default QuoteManager;
