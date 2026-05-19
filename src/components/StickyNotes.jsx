import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, addDoc, deleteDoc, doc, updateDoc, where, orderBy } from 'firebase/firestore';

// Colors for the sticky notes
const NOTE_COLORS = [
    'rgba(255, 234, 167, 0.9)', // Yellow
    'rgba(162, 155, 254, 0.9)', // Purple
    'rgba(116, 185, 255, 0.9)', // Blue
    'rgba(85, 239, 196, 0.9)',  // Green
    'rgba(250, 177, 160, 0.9)', // Orange
    'rgba(255, 118, 117, 0.9)', // Red/Pink
];

function StickyNotes({ userId }) {
    const [notes, setNotes] = useState([]);
    const [error, setError] = useState(null);
    const [isAdding, setIsAdding] = useState(false);
    const [newNoteText, setNewNoteText] = useState('');
    const [editingNoteId, setEditingNoteId] = useState(null);
    const [editNoteText, setEditNoteText] = useState('');
    
    const [isExpanded, setIsExpanded] = useState(() => {
        const saved = localStorage.getItem('notesExpanded');
        return saved !== 'false'; // Default to true
    });
    const panelRef = useRef(null);

    useEffect(() => {
        if (!userId) {
            setNotes([]);
            return;
        }

        const q = query(
            collection(db, 'notes'),
            where('userId', '==', userId)
        );

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const notesArray = [];
            querySnapshot.forEach((doc) => {
                notesArray.push({ id: doc.id, ...doc.data() });
            });
            
            // Sort in memory to avoid needing a composite index in Firestore
            notesArray.sort((a, b) => {
                const timeA = a.createdAt?.seconds || 0;
                const timeB = b.createdAt?.seconds || 0;
                return timeB - timeA; // Descending (newest first)
            });

            setNotes(notesArray);
        }, (error) => {
            console.error("Error fetching notes: ", error);
            setError(error.message);
        });

        return () => unsubscribe();
    }, [userId]);

    const addNote = async (extractList = false) => {
        if (!newNoteText.trim()) {
            setIsAdding(false);
            return;
        }
        
        try {
            if (extractList) {
                const lines = newNoteText.trim().split('\n');
                const listItems = [];
                // Matches -, *, or + bullet points, ignoring leading/trailing spaces
                const bulletRegex = /^\s*[-*+]\s+(.*)/;
                
                for (const line of lines) {
                    const match = line.match(bulletRegex);
                    if (match) {
                        listItems.push(match[1].trim());
                    }
                }
                
                if (listItems.length > 0) {
                    const promises = listItems.map(itemText => {
                        const randomColor = NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)];
                        return addDoc(collection(db, 'notes'), {
                            text: itemText,
                            userId: userId,
                            createdAt: new Date(),
                            color: randomColor
                        });
                    });
                    await Promise.all(promises);
                } else {
                    // Fallback if no bullet points found
                    const randomColor = NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)];
                    await addDoc(collection(db, 'notes'), {
                        text: newNoteText.trim(),
                        userId: userId,
                        createdAt: new Date(),
                        color: randomColor
                    });
                }
            } else {
                const randomColor = NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)];
                await addDoc(collection(db, 'notes'), {
                    text: newNoteText.trim(),
                    userId: userId,
                    createdAt: new Date(),
                    color: randomColor
                });
            }
            
            setNewNoteText('');
            setIsAdding(false);
        } catch (error) {
            console.error("Error adding note: ", error);
            setError(error.message);
        }
    };

    const deleteNote = async (id) => {
        try {
            await deleteDoc(doc(db, 'notes', id));
        } catch (error) {
            console.error("Error deleting note: ", error);
            setError(error.message);
        }
    };

    const startEditing = (note) => {
        setEditingNoteId(note.id);
        setEditNoteText(note.text);
    };

    const saveEdit = async (id) => {
        if (!editNoteText.trim()) return;
        try {
            await updateDoc(doc(db, 'notes', id), {
                text: editNoteText.trim(),
                updatedAt: new Date()
            });
            setEditingNoteId(null);
        } catch (error) {
            console.error("Error updating note: ", error);
            setError(error.message);
        }
    };

    const changeColor = async (id, color) => {
        try {
            await updateDoc(doc(db, 'notes', id), { color });
        } catch (error) {
            console.error("Error updating color: ", error);
            setError(error.message);
        }
    };

    if (!userId) {
        return (
            <div className="sticky-notes-panel" ref={panelRef}>
                 <div className="notes-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }} onClick={() => {
                        setIsExpanded(prev => {
                            const next = !prev;
                            localStorage.setItem('notesExpanded', next);
                            return next;
                        });
                    }}>
                        <span style={{ fontSize: '0.8rem', transition: 'transform 0.3s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                        <h3 style={{ margin: 0 }}>Sticky Notes</h3>
                    </div>
                </div>
                {isExpanded && <div className="empty-state">Please login to view and create notes.</div>}
            </div>
        );
    }

    return (
        <div className="sticky-notes-panel" ref={panelRef}>
            <div className="notes-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }} onClick={() => {
                    setIsExpanded(prev => {
                        const next = !prev;
                        localStorage.setItem('notesExpanded', next);
                        return next;
                    });
                }}>
                    <span style={{ fontSize: '0.8rem', transition: 'transform 0.3s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                    <h3 style={{ margin: 0 }}>Sticky Notes</h3>
                </div>
                <button className="add-note-btn" onClick={() => setIsExpanded(true) || setIsAdding(true)} title="Add a new note">+</button>
            </div>
            
            {isExpanded && (
                <>
                    {error && <div className="error-message"><p>⚠️ {error}</p></div>}
                    
                    <div className="notes-grid">
                {isAdding && (
                    <div className="sticky-note new-note" style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}>
                        <textarea
                            autoFocus
                            value={newNoteText}
                            onChange={(e) => setNewNoteText(e.target.value)}
                            placeholder="Type your note here... (Markdown supported)&#10;Paste a list and click 'Extract List' to create multiple notes."
                            rows="6"
                            className="edit-note-textarea"
                        />
                        <div className="note-actions">
                            <button onClick={() => addNote(false)} className="note-btn save">Save</button>
                            <button onClick={() => addNote(true)} className="note-btn save" style={{ backgroundColor: 'rgba(116, 185, 255, 0.3)', borderColor: 'rgba(116, 185, 255, 0.6)' }} title="Create a note for each bullet point">Extract List</button>
                            <button onClick={() => { setIsAdding(false); setNewNoteText(''); }} className="note-btn cancel">Cancel</button>
                        </div>
                    </div>
                )}
                {notes.map(note => (
                    <div key={note.id} className="sticky-note" style={{ backgroundColor: note.color || NOTE_COLORS[0] }}>
                        {editingNoteId === note.id ? (
                            <>
                                <textarea
                                    autoFocus
                                    value={editNoteText}
                                    onChange={(e) => setEditNoteText(e.target.value)}
                                    rows="6"
                                    className="edit-note-textarea"
                                />
                                <div className="note-actions">
                                    <button onClick={() => saveEdit(note.id)} className="note-btn save">Save</button>
                                    <button onClick={() => setEditingNoteId(null)} className="note-btn cancel">Cancel</button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="note-content" onDoubleClick={() => startEditing(note)}>
                                    {note.text}
                                </div>
                                <div className="note-footer">
                                    <div className="color-picker-mini">
                                        {NOTE_COLORS.map(c => (
                                            <span 
                                                key={c} 
                                                className="color-dot" 
                                                style={{ backgroundColor: c }}
                                                onClick={() => changeColor(note.id, c)}
                                            />
                                        ))}
                                    </div>
                                    <div className="note-controls">
                                        <button onClick={() => startEditing(note)} title="Edit">✎</button>
                                        <button onClick={() => deleteNote(note.id)} title="Delete">×</button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>
            </>
            )}
        </div>
    );
}

export default StickyNotes;
