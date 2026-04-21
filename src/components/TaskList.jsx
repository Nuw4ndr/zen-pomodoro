import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import {
    collection,
    addDoc,
    onSnapshot,
    query,
    deleteDoc,
    doc,
    updateDoc,
    orderBy,
    where
} from 'firebase/firestore';

function TaskList({ userId }) {
    const [tasks, setTasks] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [error, setError] = useState(null);
    const [draggedTaskId, setDraggedTaskId] = useState(null);
    const [dragOverTaskId, setDragOverTaskId] = useState(null);
    
    // Tag and Edit State
    const [filterTag, setFilterTag] = useState('');
    const [editingTaskId, setEditingTaskId] = useState(null);
    const [editValue, setEditValue] = useState('');
    const [editSummaryValue, setEditSummaryValue] = useState('');

    // Summary expand/collapse state
    const [expandedSummaryIds, setExpandedSummaryIds] = useState(new Set());

    const toggleSummary = (id) => {
        setExpandedSummaryIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const formatSummaryDate = (ts) => {
        if (!ts) return null;
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const day = days[d.getDay()];
        const date = d.getDate();
        const month = months[d.getMonth()];
        const year = d.getFullYear();
        let hours = d.getHours();
        const minutes = d.getMinutes().toString().padStart(2, '0');
        const ampm = hours >= 12 ? 'pm' : 'am';
        hours = hours % 12 || 12;
        return `${day} ${date} ${month} ${year} at ${hours}:${minutes} ${ampm}`;
    };

    // Archive State
    const [showArchive, setShowArchive] = useState(false);

    // Vote sort: 'none' (default order), 'desc' (highest first), 'asc' (lowest first)
    const [voteSortOrder, setVoteSortOrder] = useState('none');

    const cycleVoteSort = () => {
        setVoteSortOrder(prev => {
            if (prev === 'none') return 'desc';
            if (prev === 'desc') return 'asc';
            return 'none';
        });
    };

    const voteSortLabel = voteSortOrder === 'desc' ? '↓ Highest first'
        : voteSortOrder === 'asc' ? '↑ Lowest first'
        : 'Sort by votes';

    // --- Vote Logic ---
    const voteTask = async (id, delta) => {
        try {
            const task = tasks.find(t => t.id === id);
            if (!task) return;
            const currentVotes = task.votes || 0;
            const taskRef = doc(db, 'tasks', id);
            await updateDoc(taskRef, { votes: currentVotes + delta });
            setError(null);
        } catch (err) {
            console.error("Error voting on task: ", err);
            setError(`Failed to vote: ${err.message}`);
        }
    };

    // Compute the priority background style for a task based on its votes
    const getTaskPriorityStyle = (task) => {
        const votes = task.votes || 0;
        const allVotes = tasks.map(t => t.votes || 0);
        const maxVotes = Math.max(...allVotes, 0);
        const minVotes = Math.min(...allVotes, 0);
        const range = maxVotes - minVotes;

        if (range === 0 || votes === 0) return {};

        // Normalize: 0 = no highlight, 1 = max highlight
        const intensity = (votes - minVotes) / range;

        // Gold-tinted glow for high-priority, slightly darker for negative votes
        if (votes > 0) {
            return {
                background: `rgba(212, 163, 86, ${0.03 + intensity * 0.18})`,
                borderColor: `rgba(212, 163, 86, ${0.08 + intensity * 0.25})`,
            };
        } else {
            const negIntensity = (minVotes - votes) / (Math.abs(minVotes) || 1);
            return {
                background: `rgba(0, 0, 0, ${0.02 + negIntensity * 0.08})`,
                opacity: 1 - negIntensity * 0.15,
            };
        }
    };

    const extractTags = (text) => {
        const tagRegex = /#(\w+)/g;
        const tags = [];
        let match;
        while ((match = tagRegex.exec(text)) !== null) {
            tags.push(match[1]);
        }
        return [...new Set(tags)]; // Unique tags
    };

    // Listen to tasks in real-time
    useEffect(() => {
        if (!userId) {
            setTasks([]);
            return;
        }

        // We fetch all tasks and sort them in-memory to handle cases where 'order' is missing
        const q = query(
            collection(db, 'tasks'),
            where('userId', '==', userId)
        );

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const tasksArray = [];
            querySnapshot.forEach((doc) => {
                tasksArray.push({ id: doc.id, ...doc.data() });
            });

            // Sort logic: order (asc), then createdAt (desc) for stability
            tasksArray.sort((a, b) => {
                const orderA = a.order !== undefined ? a.order : Number.MAX_SAFE_INTEGER;
                const orderB = b.order !== undefined ? b.order : Number.MAX_SAFE_INTEGER;

                if (orderA !== orderB) {
                    return orderA - orderB;
                }

                // Fallback to createdAt (newest first)
                const timeA = a.createdAt?.seconds || 0;
                const timeB = b.createdAt?.seconds || 0;
                return timeB - timeA;
            });

            setTasks(tasksArray);
            setError(null);
        }, (err) => {
            console.error("Error listening to tasks: ", err);
            setError(err.message);
        });

        return () => unsubscribe();
    }, [userId]);

    const addTask = async (e) => {
        e.preventDefault();
        if (inputValue.trim()) {
            try {
                // To put new tasks at the top, we want the smallest 'order' value
                const minOrder = tasks.length > 0
                    ? Math.min(...tasks.map(t => t.order ?? 0))
                    : 0;

                await addDoc(collection(db, 'tasks'), {
                    text: inputValue.trim(),
                    completed: false,
                    createdAt: new Date(),
                    userId: userId,
                    order: minOrder - 100, // Subtracting 100 to leave space for future insertions
                    tags: extractTags(inputValue),
                    votes: 0,
                    summary: ''
                });
                setInputValue('');
                setError(null);
            } catch (err) {
                console.error("Error adding task: ", err);
                setError(`Failed to add task: ${err.message}`);
            }
        }
    };

    // --- Drag and Drop Logic ---

    const handleDragStart = (e, taskId) => {
        setDraggedTaskId(taskId);
        e.dataTransfer.effectAllowed = 'move';
        // HTML5 drag and drop custom ghost image logic can be added here if needed
    };

    const handleDragOver = (e, taskId) => {
        e.preventDefault();
        if (taskId !== dragOverTaskId) {
            setDragOverTaskId(taskId);
        }
    };

    const handleDrop = async (e, targetTaskId) => {
        e.preventDefault();
        const taskId = draggedTaskId;
        setDraggedTaskId(null);
        setDragOverTaskId(null);

        if (taskId === targetTaskId) return;

        const draggedTaskIndex = tasks.findIndex(t => t.id === taskId);
        const targetTaskIndex = tasks.findIndex(t => t.id === targetTaskId);

        if (draggedTaskIndex === -1 || targetTaskIndex === -1) return;

        let newOrder;
        if (targetTaskIndex === 0) {
            // Dropped at the top
            newOrder = (tasks[0].order ?? 0) - 100;
        } else if (targetTaskIndex === tasks.length - 1 && targetTaskIndex > draggedTaskIndex) {
            // Dropped at the bottom
            newOrder = (tasks[tasks.length - 1].order ?? 0) + 100;
        } else {
            // Dropped between two items or above an item
            // If dragging down, target index is the one we want to be ABOVE
            // If dragging up, target index is the one we want to be BELOW
            const prevTask = targetTaskIndex > draggedTaskIndex
                ? tasks[targetTaskIndex]
                : tasks[targetTaskIndex - 1];
            const nextTask = targetTaskIndex > draggedTaskIndex
                ? tasks[targetTaskIndex + 1]
                : tasks[targetTaskIndex];

            const prevOrder = prevTask?.order ?? (tasks[0].order ?? 0) - 100;
            const nextOrder = nextTask?.order ?? (tasks[tasks.length - 1].order ?? 0) + 100;

            newOrder = (prevOrder + nextOrder) / 2;
        }

        try {
            const taskRef = doc(db, 'tasks', taskId);
            await updateDoc(taskRef, { order: newOrder });
        } catch (err) {
            console.error("Error updating task order: ", err);
            setError(`Failed to reorder: ${err.message}`);
        }
    };

    const toggleTask = async (id, completed) => {
        try {
            const taskRef = doc(db, 'tasks', id);
            const updates = { completed: !completed };
            // Auto-archive when marking as completed
            if (!completed) {
                updates.archived = true;
                updates.archivedAt = new Date();
            }
            await updateDoc(taskRef, updates);
            setError(null);
        } catch (err) {
            console.error("Error toggling task: ", err);
            setError(`Failed to update task: ${err.message}`);
        }
    };

    const archiveTask = async (id) => {
        try {
            const taskRef = doc(db, 'tasks', id);
            await updateDoc(taskRef, {
                archived: true,
                archivedAt: new Date()
            });
            setError(null);
        } catch (err) {
            console.error("Error archiving task: ", err);
            setError(`Failed to archive task: ${err.message}`);
        }
    };

    const restoreTask = async (id) => {
        try {
            const taskRef = doc(db, 'tasks', id);
            await updateDoc(taskRef, {
                archived: false,
                completed: false,
                archivedAt: null
            });
            setError(null);
        } catch (err) {
            console.error("Error restoring task: ", err);
            setError(`Failed to restore task: ${err.message}`);
        }
    };

    const deleteTask = async (id) => {
        try {
            await deleteDoc(doc(db, 'tasks', id));
            setError(null);
        } catch (err) {
            console.error("Error deleting task: ", err);
            setError(`Failed to delete task: ${err.message}`);
        }
    };

    const startEditing = (task) => {
        setEditingTaskId(task.id);
        setEditValue(task.text);
        setEditSummaryValue(task.summary || '');
    };

    const updateTask = async (id, newText, newSummary) => {
        if (!newText.trim()) return;
        try {
            const taskRef = doc(db, 'tasks', id);
            const task = tasks.find(t => t.id === id);
            const prevSummary = task?.summary || '';
            const updates = {
                text: newText.trim(),
                tags: extractTags(newText),
                summary: newSummary.trim()
            };
            // Only update the timestamp if the summary actually changed
            if (newSummary.trim() !== prevSummary) {
                updates.summaryUpdatedAt = new Date();
            }
            await updateDoc(taskRef, updates);
            setEditingTaskId(null);
            setError(null);
        } catch (err) {
            console.error("Error updating task: ", err);
            setError(`Failed to update task: ${err.message}`);
        }
    };

    // Separate active and archived tasks
    const activeTasks = tasks.filter(t => !t.archived);
    const archivedTasks = tasks.filter(t => t.archived);

    const baseTasks = showArchive ? archivedTasks : activeTasks;
    const allTags = [...new Set(baseTasks.flatMap(t => t.tags || []))].sort();

    const filteredTasks = (() => {
        let result = filterTag
            ? baseTasks.filter(t => (t.tags || []).includes(filterTag))
            : [...baseTasks];

        if (voteSortOrder === 'desc') {
            result.sort((a, b) => (b.votes || 0) - (a.votes || 0));
        } else if (voteSortOrder === 'asc') {
            result.sort((a, b) => (a.votes || 0) - (b.votes || 0));
        }

        return result;
    })();

    return (
        <div className="task-list-container">
            <div className="section-header">
                <h3>{showArchive ? 'Archive' : 'Tasks'}</h3>
                <div className="section-header-actions">
                    <button
                        className={`archive-toggle-btn ${showArchive ? 'active' : ''}`}
                        onClick={() => { setShowArchive(prev => !prev); setFilterTag(''); }}
                        title={showArchive ? 'Back to Tasks' : `Show Archive (${archivedTasks.length})`}
                    >
                        {showArchive ? '⬅️ Tasks' : `📁 Archive${archivedTasks.length > 0 ? ` (${archivedTasks.length})` : ''}`}
                    </button>
                    {!showArchive && (
                        <button
                            className={`vote-sort-btn ${voteSortOrder !== 'none' ? 'active' : ''}`}
                            onClick={cycleVoteSort}
                            title={voteSortLabel}
                        >
                            {voteSortOrder === 'desc' ? '🔥 ↓' : voteSortOrder === 'asc' ? '🧊 ↑' : '⇅'}
                        </button>
                    )}
                </div>
            </div>
            {!showArchive && (
                <form onSubmit={addTask} className="task-form">
                    <input
                        type="text"
                        placeholder={userId ? "What are you working on? (Use #tags for projects)" : "Please login to add tasks"}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        disabled={!userId}
                    />
                    <button type="submit" className="add-task-btn" disabled={!userId}>+</button>
                </form>
            )}

            {allTags.length > 0 && (
                <div className="tag-filter-bar">
                    <button 
                        className={`tag-filter-btn ${filterTag === '' ? 'active' : ''}`}
                        onClick={() => setFilterTag('')}
                    >
                        All
                    </button>
                    {allTags.map(tag => (
                        <button
                            key={tag}
                            className={`tag-filter-btn ${filterTag === tag ? 'active' : ''}`}
                            onClick={() => setFilterTag(tag)}
                        >
                            #{tag}
                        </button>
                    ))}
                </div>
            )}

            {error && (
                <div className="error-message">
                    <p>⚠️ {error.includes('index') ? 'Syncing your data...' : 'Connection error'}</p>
                </div>
            )}

            <ul className="tasks">
                {filteredTasks.map((task) => (
                    <li
                        key={task.id}
                        className={`task-item ${task.completed ? 'completed' : ''} ${draggedTaskId === task.id ? 'dragging' : ''} ${dragOverTaskId === task.id ? 'drag-over' : ''}`}
                        style={getTaskPriorityStyle(task)}
                        draggable={!!userId && !editingTaskId}
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        onDragOver={(e) => handleDragOver(e, task.id)}
                        onDrop={(e) => handleDrop(e, task.id)}
                        onDragLeave={() => setDragOverTaskId(null)}
                    >
                        <div className="drag-handle" title="Drag to reorder">⋮⋮</div>
                        
                        {editingTaskId === task.id ? (
                            <form 
                                className="edit-task-form" 
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    updateTask(task.id, editValue, editSummaryValue);
                                }}
                            >
                                <div className="edit-task-fields">
                                    <input
                                        type="text"
                                        className="edit-task-title"
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        autoFocus
                                        placeholder="Task name"
                                        onKeyDown={(e) => e.key === 'Escape' && setEditingTaskId(null)}
                                    />
                                    <textarea
                                        className="edit-task-summary"
                                        value={editSummaryValue}
                                        onChange={(e) => setEditSummaryValue(e.target.value)}
                                        placeholder="Summary / status update (optional)…"
                                        rows={2}
                                        onKeyDown={(e) => e.key === 'Escape' && setEditingTaskId(null)}
                                    />
                                </div>
                                <div className="edit-task-buttons">
                                    <button type="submit" className="save-btn">Save</button>
                                    <button type="button" className="cancel-btn" onClick={() => setEditingTaskId(null)}>Cancel</button>
                                </div>
                            </form>
                        ) : showArchive ? (
                            <>
                                <div className="task-content-wrapper">
                                    <span className="task-text">{task.text}</span>
                                    {expandedSummaryIds.has(task.id) && task.summary && (
                                        <div className="task-summary-block">
                                            <p className="task-summary">{task.summary}</p>
                                            {task.summaryUpdatedAt && (
                                                <span className="task-summary-date">Updated {formatSummaryDate(task.summaryUpdatedAt)}</span>
                                            )}
                                        </div>
                                    )}
                                    {task.tags && task.tags.length > 0 && (
                                        <div className="task-tags">
                                            {task.tags.map(tag => (
                                                <span 
                                                    key={tag} 
                                                    className="tag"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setFilterTag(tag);
                                                    }}
                                                >
                                                    #{tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="task-actions archive-actions">
                                    {task.summary && (
                                        <button
                                            className={`summary-toggle-btn ${expandedSummaryIds.has(task.id) ? 'active' : ''}`}
                                            onClick={() => toggleSummary(task.id)}
                                            title={expandedSummaryIds.has(task.id) ? 'Hide summary' : 'Show summary'}
                                        >📝</button>
                                    )}
                                    <button className="restore-btn" onClick={() => restoreTask(task.id)} title="Restore task">📤</button>
                                    <button className="delete-btn" onClick={() => deleteTask(task.id)} title="Delete permanently">×</button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="task-vote-controls">
                                    <button
                                        className="vote-btn vote-up"
                                        onClick={() => voteTask(task.id, 1)}
                                        title="Vote up — this task matters"
                                    >
                                        👍
                                    </button>
                                    <span className={`vote-count ${(task.votes || 0) > 0 ? 'positive' : (task.votes || 0) < 0 ? 'negative' : ''}`}>
                                        {task.votes || 0}
                                    </span>
                                    <button
                                        className="vote-btn vote-down"
                                        onClick={() => voteTask(task.id, -1)}
                                        title="Vote down — less important today"
                                    >
                                        👎
                                    </button>
                                </div>
                                <div className="task-content-wrapper" onClick={() => toggleTask(task.id, task.completed)}>
                                    <span className="task-text">{task.text}</span>
                                    {expandedSummaryIds.has(task.id) && task.summary && (
                                        <div className="task-summary-block">
                                            <p className="task-summary">{task.summary}</p>
                                            {task.summaryUpdatedAt && (
                                                <span className="task-summary-date">Updated {formatSummaryDate(task.summaryUpdatedAt)}</span>
                                            )}
                                        </div>
                                    )}
                                    {task.tags && task.tags.length > 0 && (
                                        <div className="task-tags">
                                            {task.tags.map(tag => (
                                                <span 
                                                    key={tag} 
                                                    className="tag"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setFilterTag(tag);
                                                    }}
                                                >
                                                    #{tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="task-actions">
                                    {task.summary && (
                                        <button
                                            className={`summary-toggle-btn ${expandedSummaryIds.has(task.id) ? 'active' : ''}`}
                                            onClick={(e) => { e.stopPropagation(); toggleSummary(task.id); }}
                                            title={expandedSummaryIds.has(task.id) ? 'Hide summary' : 'Show summary'}
                                        >📝</button>
                                    )}
                                    <button className="archive-btn" onClick={() => archiveTask(task.id)} title="Archive task">📥</button>
                                    <button className="edit-btn" onClick={() => startEditing(task)} title="Edit task">✎</button>
                                    <button className="delete-btn" onClick={() => deleteTask(task.id)} title="Delete task">×</button>
                                </div>
                            </>
                        )}
                    </li>
                ))}
            </ul>
            {filteredTasks.length === 0 && (
                <p className="empty-state">
                    {showArchive
                        ? (filterTag ? `No archived tasks with tag #${filterTag}` : 'No archived tasks. Clean slate!')
                        : (filterTag ? `No tasks with tag #${filterTag}` : 'No tasks yet. Stay focused!')
                    }
                </p>
            )}
        </div>
    );
}

export default TaskList;

