import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, addDoc, deleteDoc, doc, updateDoc, where, writeBatch } from 'firebase/firestore';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragOverlay
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Colors for the sticky notes
const NOTE_COLORS = [
    'rgba(255, 234, 167, 0.9)', // Yellow
    'rgba(162, 155, 254, 0.9)', // Purple
    'rgba(116, 185, 255, 0.9)', // Blue
    'rgba(85, 239, 196, 0.9)',  // Green
    'rgba(250, 177, 160, 0.9)', // Orange
    'rgba(255, 118, 117, 0.9)', // Red/Pink
];

function SortableNote({ 
    note, 
    editingNoteId, 
    startEditing, 
    saveEdit, 
    setEditingNoteId, 
    editNoteText, 
    setEditNoteText, 
    changeColor, 
    deleteNote, 
    NOTE_COLORS 
}) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: note.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        backgroundColor: note.color || NOTE_COLORS[0],
        opacity: isDragging ? 0 : 1,
        zIndex: isDragging ? 100 : 'auto',
        position: 'relative',
        cursor: isDragging ? 'grabbing' : 'grab',
    };

    return (
        <div 
            ref={setNodeRef} 
            style={style} 
            className={`sticky-note ${isDragging ? 'dragging' : ''}`}
            {...attributes}
            {...listeners}
        >
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
    );
}

function StickyNotes({ userId }) {
    const [notes, setNotes] = useState([]);
    const [error, setError] = useState(null);
    const [isAdding, setIsAdding] = useState(false);
    const [newNoteText, setNewNoteText] = useState('');
    const [editingNoteId, setEditingNoteId] = useState(null);
    const [editNoteText, setEditNoteText] = useState('');
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [activeId, setActiveId] = useState(null);
    
    const [isExpanded, setIsExpanded] = useState(() => {
        const saved = localStorage.getItem('notesExpanded');
        return saved !== 'false'; // Default to true
    });
    const panelRef = useRef(null);
    const confirmTimeoutRef = useRef(null);

    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: {
                distance: 5,
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 250,
                tolerance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Clean up timeout on unmount
    useEffect(() => {
        return () => {
            if (confirmTimeoutRef.current) {
                clearTimeout(confirmTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!userId) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
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
            
            // Sort in memory: custom order first (ascending), then fallback to createdAt descending
            notesArray.sort((a, b) => {
                if (a.order !== undefined && b.order !== undefined) {
                    return a.order - b.order;
                }
                if (a.order !== undefined) return -1;
                if (b.order !== undefined) return 1;
                const timeA = a.createdAt?.seconds || 0;
                const timeB = b.createdAt?.seconds || 0;
                return timeB - timeA;
            });

            setNotes(notesArray);
        }, (error) => {
            console.error("Error fetching notes: ", error);
            setError(error.message);
        });

        return () => unsubscribe();
    }, [userId]);

    const getNextOrder = (atBeginning = true) => {
        if (notes.length === 0) return 0;
        const orders = notes.map(n => n.order).filter(o => o !== undefined);
        if (orders.length === 0) return 0;
        return atBeginning ? Math.min(...orders) - 1 : Math.max(...orders) + 1;
    };

    const addNote = async (extractList = false) => {
        if (!newNoteText.trim()) {
            setIsAdding(false);
            return;
        }
        
        try {
            if (extractList) {
                const lines = newNoteText.trim().split('\n');
                const listItems = [];
                const bulletRegex = /^\s*(?:[-*+]|[0-9]+\.|\[\s*[xX]?\s*\])\s*(?:\[\s*[xX]?\s*\])?\s*(.*)/;
                
                for (const line of lines) {
                    const match = line.match(bulletRegex);
                    if (match) {
                        const text = (match[1] || '').trim();
                        if (text) {
                            listItems.push(text);
                        }
                    }
                }
                
                if (listItems.length > 0) {
                    let startOrder = getNextOrder(true);
                    const promises = listItems.map((itemText, i) => {
                        const randomColor = NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)];
                        return addDoc(collection(db, 'notes'), {
                            text: itemText,
                            userId: userId,
                            createdAt: new Date(),
                            color: randomColor,
                            order: startOrder + i
                        });
                    });
                    await Promise.all(promises);
                } else {
                    const randomColor = NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)];
                    await addDoc(collection(db, 'notes'), {
                        text: newNoteText.trim(),
                        userId: userId,
                        createdAt: new Date(),
                        color: randomColor,
                        order: getNextOrder(true)
                    });
                }
            } else {
                const randomColor = NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)];
                await addDoc(collection(db, 'notes'), {
                    text: newNoteText.trim(),
                    userId: userId,
                    createdAt: new Date(),
                    color: randomColor,
                    order: getNextOrder(true)
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

    const clearAllNotes = async () => {
        if (notes.length === 0) return;
        try {
            const batch = writeBatch(db);
            notes.forEach(note => {
                const noteRef = doc(db, 'notes', note.id);
                batch.delete(noteRef);
            });
            await batch.commit();
            setError(null);
        } catch (error) {
            console.error("Error clearing notes: ", error);
            setError(error.message);
        }
    };

    const handleClearClick = () => {
        if (!showClearConfirm) {
            setShowClearConfirm(true);
            if (confirmTimeoutRef.current) {
                clearTimeout(confirmTimeoutRef.current);
            }
            confirmTimeoutRef.current = setTimeout(() => {
                setShowClearConfirm(false);
            }, 4000);
        } else {
            if (confirmTimeoutRef.current) {
                clearTimeout(confirmTimeoutRef.current);
            }
            clearAllNotes();
            setShowClearConfirm(false);
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

    const handleDragStart = (event) => {
        setActiveId(event.active.id);
    };

    const handleDragEnd = async (event) => {
        const { active, over } = event;
        setActiveId(null);
        if (!over || active.id === over.id) return;

        const oldIndex = notes.findIndex(item => item.id === active.id);
        const newIndex = notes.findIndex(item => item.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
            const reorderedNotes = arrayMove(notes, oldIndex, newIndex);
            setNotes(reorderedNotes);

            try {
                const batch = writeBatch(db);
                reorderedNotes.forEach((note, index) => {
                    const noteRef = doc(db, 'notes', note.id);
                    batch.update(noteRef, { order: index });
                });
                await batch.commit();
            } catch (err) {
                console.error("Error updating note order in database:", err);
                setError(err.message);
            }
        }
    };

    const handleDragCancel = () => {
        setActiveId(null);
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {isExpanded && notes.length > 0 && (
                        <button 
                            className={`clear-board-btn ${showClearConfirm ? 'confirming' : ''}`}
                            onClick={handleClearClick}
                            title={showClearConfirm ? 'Click again to confirm deletion of all notes' : 'Clear all sticky notes'}
                        >
                            {showClearConfirm ? '⚠️ Confirm Clear?' : '🗑️ Clear Board'}
                        </button>
                    )}
                    <button className="add-note-btn" onClick={() => setIsExpanded(true) || setIsAdding(true)} title="Add a new note">+</button>
                </div>
            </div>
            
            {isExpanded && (
                <>
                    {error && <div className="error-message"><p>⚠️ {error}</p></div>}
                    
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onDragCancel={handleDragCancel}
                    >
                        <SortableContext
                            items={notes.map(n => n.id)}
                            strategy={rectSortingStrategy}
                        >
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
                                    <SortableNote
                                        key={note.id}
                                        note={note}
                                        editingNoteId={editingNoteId}
                                        startEditing={startEditing}
                                        saveEdit={saveEdit}
                                        setEditingNoteId={setEditingNoteId}
                                        editNoteText={editNoteText}
                                        setEditNoteText={setEditNoteText}
                                        changeColor={changeColor}
                                        deleteNote={deleteNote}
                                        NOTE_COLORS={NOTE_COLORS}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                        <DragOverlay adjustScale={true}>
                            {activeId ? (
                                <div 
                                    className="sticky-note" 
                                    style={{ 
                                        backgroundColor: notes.find(n => n.id === activeId)?.color || NOTE_COLORS[0],
                                        boxShadow: '0 15px 30px rgba(0, 0, 0, 0.3)',
                                        cursor: 'grabbing',
                                        transform: 'rotate(0deg)',
                                        margin: 0
                                    }}
                                >
                                    <div className="note-content">
                                        {notes.find(n => n.id === activeId)?.text}
                                    </div>
                                </div>
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                </>
            )}
        </div>
    );
}

export default StickyNotes;
