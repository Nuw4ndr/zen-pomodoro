import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import {
    collection,
    addDoc,
    onSnapshot,
    query,
    deleteDoc,
    doc,
    updateDoc,
    where
} from 'firebase/firestore';

function TaskList({ userId }) {
    const [tasks, setTasks] = useState([]);
    const [inputValue, setInputValue] = useState('');
    const [error, setError] = useState(null);
    const [draggedTaskId, setDraggedTaskId] = useState(null);
    const [dragOverTaskId, setDragOverTaskId] = useState(null);
    const [isExpanded, setIsExpanded] = useState(() => {
        const saved = localStorage.getItem('tasksExpanded');
        return saved !== 'false'; // Default to true
    });
    
    // Tag and Edit State
    const [filterTags, setFilterTags] = useState([]);
    const [filterDate, setFilterDate] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [editingTaskId, setEditingTaskId] = useState(null);
    const [editValue, setEditValue] = useState('');
    const [editSummaryValue, setEditSummaryValue] = useState('');

    // Summary expand/collapse state
    const [expandedSummaryIds, setExpandedSummaryIds] = useState(new Set());
    const [copiedTaskId, setCopiedTaskId] = useState(null);
    const summaryRef = useRef(null);

    // Note Addition State
    const [addingNoteTaskId, setAddingNoteTaskId] = useState(null);
    const [noteTopic, setNoteTopic] = useState('');
    const [noteContent, setNoteContent] = useState('');
    const [noteDate, setNoteDate] = useState('');
    const [noteTime, setNoteTime] = useState('');
    const noteContentRef = useRef(null);

    // Auto-expand summary textarea
    const adjustTextareaHeight = () => {
        if (summaryRef.current) {
            summaryRef.current.style.height = 'auto';
            summaryRef.current.style.height = summaryRef.current.scrollHeight + 'px';
        }
    };

    // Auto-expand note textarea
    const adjustNoteTextareaHeight = () => {
        if (noteContentRef.current) {
            noteContentRef.current.style.height = 'auto';
            noteContentRef.current.style.height = noteContentRef.current.scrollHeight + 'px';
        }
    };

    useEffect(() => {
        if (editingTaskId) {
            // Use a small timeout to ensure the DOM has rendered the textarea
            const timer = setTimeout(adjustTextareaHeight, 0);
            return () => clearTimeout(timer);
        }
    }, [editSummaryValue, editingTaskId]);

    useEffect(() => {
        if (addingNoteTaskId) {
            const timer = setTimeout(adjustNoteTextareaHeight, 0);
            return () => clearTimeout(timer);
        }
    }, [noteContent, addingNoteTaskId]);

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

    const extractDateString = (ts) => {
        if (!ts) return null;
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
            // eslint-disable-next-line react-hooks/set-state-in-effect
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
        setAddingNoteTaskId(null);
    };

    const startAddingNote = (task) => {
        setAddingNoteTaskId(task.id);
        setNoteTopic('');
        setNoteContent('');
        
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        setNoteDate(`${yyyy}-${mm}-${dd}`);
        
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        setNoteTime(`${hours}:${minutes}`);
        
        setEditingTaskId(null);
    };

    const handleAddNote = async (id, topic, content, customDate, customTime) => {
        if (!topic.trim() || !content.trim()) return;
        try {
            const task = tasks.find(t => t.id === id);
            if (!task) return;

            // Use custom date or fall back to today's date
            const dateStr = customDate || (() => {
                const now = new Date();
                const yyyy = now.getFullYear();
                const mm = String(now.getMonth() + 1).padStart(2, '0');
                const dd = String(now.getDate()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}`;
            })();

            // Format custom time if provided
            let timeStr = '';
            if (customTime) {
                const [hStr, mStr] = customTime.split(':');
                let hours = parseInt(hStr, 10);
                const minutes = mStr;
                const ampm = hours >= 12 ? 'PM' : 'AM';
                hours = hours % 12 || 12;
                const hoursStr = String(hours).padStart(2, '0');
                timeStr = `${hoursStr}:${minutes} ${ampm}`;
            }

            // Omit time from note header if not specified
            const noteHeader = timeStr 
                ? `## ${dateStr} | ${timeStr} | ${topic.trim()}`
                : `## ${dateStr} | ${topic.trim()}`;
            const formattedNote = `${noteHeader}\n${content.trim()}`;

            let updatedSummary = formattedNote;
            if (task.summary && task.summary.trim() !== '') {
                updatedSummary = `${formattedNote}\n\n---\n\n${task.summary.trim()}`;
            }

            const taskRef = doc(db, 'tasks', id);
            await updateDoc(taskRef, {
                summary: updatedSummary,
                summaryUpdatedAt: new Date()
            });

            setAddingNoteTaskId(null);
            setNoteTopic('');
            setNoteContent('');
            setNoteDate('');
            setNoteTime('');
            setError(null);

            setExpandedSummaryIds(prev => {
                const next = new Set(prev);
                next.add(id);
                return next;
            });
        } catch (err) {
            console.error("Error adding note: ", err);
            setError(`Failed to add note: ${err.message}`);
        }
    };

    const renderMarkdown = (text) => {
        if (!text) return null;
        
        const lines = text.split('\n');
        const elements = [];
        let currentList = [];
        
        const parseInline = (str) => {
            const parts = str.split('**');
            return parts.map((part, index) => {
                const key = `inline-${index}`;
                if (index % 2 === 1) {
                    return <strong key={key}>{part}</strong>;
                }
                const subparts = part.split('*');
                return subparts.map((subpart, subindex) => {
                    if (subindex % 2 === 1) {
                        return <em key={`em-${subindex}`}>{subpart}</em>;
                    }
                    return subpart;
                });
            });
        };

        lines.forEach((line, index) => {
            const trimmed = line.trim();
            
            if (trimmed === '---') {
                if (currentList.length > 0) {
                    elements.push(<ul key={`list-${index}`} className="markdown-list">{currentList}</ul>);
                    currentList = [];
                }
                elements.push(<hr key={`hr-${index}`} className="markdown-hr" />);
            } else if (trimmed.startsWith('## ')) {
                if (currentList.length > 0) {
                    elements.push(<ul key={`list-${index}`} className="markdown-list">{currentList}</ul>);
                    currentList = [];
                }
                const headerText = trimmed.substring(3);
                elements.push(<h4 key={`h4-${index}`} className="markdown-h4">{parseInline(headerText)}</h4>);
            } else if (trimmed.startsWith('* ')) {
                const listContent = trimmed.substring(2);
                currentList.push(<li key={`li-${index}`}>{parseInline(listContent)}</li>);
            } else if (trimmed === '') {
                if (currentList.length > 0) {
                    elements.push(<ul key={`list-${index}`} className="markdown-list">{currentList}</ul>);
                    currentList = [];
                }
            } else {
                if (currentList.length > 0) {
                    elements.push(<ul key={`list-${index}`} className="markdown-list">{currentList}</ul>);
                    currentList = [];
                }
                elements.push(<p key={`p-${index}`} className="markdown-p">{parseInline(line)}</p>);
            }
        });
        
        if (currentList.length > 0) {
            elements.push(<ul key="list-final" className="markdown-list">{currentList}</ul>);
        }
        
        return <div className="markdown-container">{elements}</div>;
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

    const handleExportTask = async (task) => {
        const dateStr = formatSummaryDate(task.summaryUpdatedAt || task.createdAt);
        const dateLine = dateStr ? `\nLast Updated: ${dateStr}` : '';
        const textToCopy = `Task Title: ${task.text}${dateLine}\nTask Summary: ${task.summary || ''}`;
        try {
            await navigator.clipboard.writeText(textToCopy);
            setCopiedTaskId(task.id);
            setTimeout(() => setCopiedTaskId(null), 2000);
        } catch (err) {
            console.error('Failed to copy task context: ', err);
            setError(`Failed to copy: ${err.message}`);
        }
    };

    // Separate active and archived tasks
    const activeTasks = tasks.filter(t => !t.archived);
    const archivedTasks = tasks.filter(t => t.archived);

    const baseTasks = showArchive ? archivedTasks : activeTasks;
    const allTags = [...new Set([...baseTasks.flatMap(t => t.tags || []), ...filterTags])].sort();

    const filteredTasks = (() => {
        let result = filterTags.length > 0
            ? baseTasks.filter(t => filterTags.every(tag => (t.tags || []).includes(tag)))
            : [...baseTasks];

        if (filterDate) {
            result = result.filter(t => {
                if (t.summary) {
                    const dateHeaderRegex = /^##\s*(\d{4}-\d{2}-\d{2})/m;
                    if (dateHeaderRegex.test(t.summary)) {
                        const blocks = t.summary.split(/(?:^|\n)\s*---\s*(?:\n|$)/);
                        for (const block of blocks) {
                            const match = block.trim().match(/^##\s*(\d{4}-\d{2}-\d{2})/);
                            if (match && match[1] === filterDate) {
                                return true;
                            }
                        }
                        return false;
                    }
                }
                const ts = t.summaryUpdatedAt || t.createdAt;
                return extractDateString(ts) === filterDate;
            });
        }

        if (searchQuery) {
            const queryLower = searchQuery.toLowerCase();
            result = result.filter(t => {
                const textMatch = (t.text || '').toLowerCase().includes(queryLower);
                const summaryMatch = (t.summary || '').toLowerCase().includes(queryLower);
                return textMatch || summaryMatch;
            });
        }

        if (voteSortOrder === 'desc') {
            result.sort((a, b) => (b.votes || 0) - (a.votes || 0));
        } else if (voteSortOrder === 'asc') {
            result.sort((a, b) => (a.votes || 0) - (b.votes || 0));
        }

        return result;
    })();

    const exportableTasks = (() => {
        let result = filterTags.length > 0
            ? tasks.filter(t => filterTags.every(tag => (t.tags || []).includes(tag)))
            : [...tasks];

        if (filterDate) {
            result = result.filter(t => {
                if (t.summary) {
                    const dateHeaderRegex = /^##\s*(\d{4}-\d{2}-\d{2})/m;
                    if (dateHeaderRegex.test(t.summary)) {
                        const blocks = t.summary.split(/(?:^|\n)\s*---\s*(?:\n|$)/);
                        for (const block of blocks) {
                            const match = block.trim().match(/^##\s*(\d{4}-\d{2}-\d{2})/);
                            if (match && match[1] === filterDate) {
                                return true;
                            }
                        }
                        return false;
                    }
                }
                const ts = t.summaryUpdatedAt || t.createdAt;
                return extractDateString(ts) === filterDate;
            });
        }

        if (searchQuery) {
            const queryLower = searchQuery.toLowerCase();
            result = result.filter(t => {
                const textMatch = (t.text || '').toLowerCase().includes(queryLower);
                const summaryMatch = (t.summary || '').toLowerCase().includes(queryLower);
                return textMatch || summaryMatch;
            });
        }

        if (voteSortOrder === 'desc') {
            result.sort((a, b) => (b.votes || 0) - (a.votes || 0));
        } else if (voteSortOrder === 'asc') {
            result.sort((a, b) => (a.votes || 0) - (b.votes || 0));
        }

        return result;
    })();

    const handleExportFilteredTasks = () => {
        if (exportableTasks.length === 0) return;

        let markdownContent = `# Tasks Export\n\n`;
        exportableTasks.forEach(task => {
            let status = 'Active';
            if (task.completed) {
                status = 'Completed';
            } else if (task.archived) {
                status = 'Archived';
            }

            markdownContent += `## Task Title: ${task.text} [Status: ${status}]\n`;
            markdownContent += `Status: ${status}\n`;
            const dateStr = formatSummaryDate(task.summaryUpdatedAt || task.createdAt);
            if (dateStr) {
                markdownContent += `Last Updated: ${dateStr}\n`;
            }
            if (task.summary) {
                let exportedSummary = task.summary;
                if (filterDate) {
                    const dateHeaderRegex = /^##\s*(\d{4}-\d{2}-\d{2})/m;
                    if (dateHeaderRegex.test(task.summary)) {
                        const blocks = task.summary.split(/(?:^|\n)\s*---\s*(?:\n|$)/);
                        const matchingBlocks = blocks.filter(block => {
                            const trimmed = block.trim();
                            if (!trimmed) return false;
                            const match = trimmed.match(/^##\s*(\d{4}-\d{2}-\d{2})/);
                            return match && match[1] === filterDate;
                        });
                        exportedSummary = matchingBlocks.map(b => b.trim()).filter(Boolean).join('\n\n---\n\n');
                    }
                }
                if (exportedSummary) {
                    markdownContent += `Task Summary: ${exportedSummary}\n`;
                }
            }
            markdownContent += `\n`;
        });

        const blob = new Blob([markdownContent], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        const dateStr = filterDate || new Date().toISOString().split('T')[0];
        const tagStr = filterTags.length > 0 ? `-${filterTags.join('-')}` : '';
        a.download = `tasks-export-${dateStr}${tagStr}.md`;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="task-list-container">
            <div className="section-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }} onClick={() => {
                    setIsExpanded(prev => {
                        const next = !prev;
                        localStorage.setItem('tasksExpanded', next);
                        return next;
                    });
                }}>
                    <span style={{ fontSize: '0.8rem', transition: 'transform 0.3s', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                    <h3 style={{ margin: 0 }}>{showArchive ? 'Archive' : 'Tasks'}</h3>
                </div>
                <div className="section-header-actions">
                    <button
                        className={`archive-toggle-btn ${showArchive ? 'active' : ''}`}
                        onClick={() => { setShowArchive(prev => !prev); }}
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
                    <button
                        className="export-all-btn"
                        onClick={handleExportFilteredTasks}
                        title="Export filtered tasks to Markdown"
                        disabled={exportableTasks.length === 0}
                    >
                        📋 Export All
                    </button>
                </div>
            </div>
            
            {isExpanded && (
                <>
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

            {(allTags.length > 0 || baseTasks.length > 0) && (
                <div className="tag-filter-bar">
                    <button 
                        className={`tag-filter-btn ${filterTags.length === 0 && filterDate === '' && searchQuery === '' ? 'active' : ''}`}
                        onClick={() => { setFilterTags([]); setFilterDate(''); setSearchQuery(''); }}
                    >
                        All
                    </button>
                    {allTags.map(tag => (
                        <button
                            key={tag}
                            className={`tag-filter-btn ${filterTags.includes(tag) ? 'active' : ''}`}
                            onClick={() => {
                                setFilterTags(prev => 
                                    prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                                );
                            }}
                        >
                            #{tag}
                        </button>
                    ))}
                    <div className="filter-controls">
                        <input 
                            type="date" 
                            className="date-filter-input"
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                            title="Filter by date"
                        />
                        <input
                            type="text"
                            className="search-filter-input"
                            placeholder="Search tasks..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            title="Search by person or topic"
                        />
                    </div>
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
                                        ref={summaryRef}
                                        className="edit-task-summary"
                                        value={editSummaryValue}
                                        onChange={(e) => setEditSummaryValue(e.target.value)}
                                        placeholder="Summary / status update (optional)…"
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
                                    <div className="task-header-row">
                                        <div className="task-header-info">
                                            <span className="task-text">{task.text}</span>
                                            <span className="task-header-date">
                                                {formatSummaryDate(task.summaryUpdatedAt || task.createdAt)}
                                            </span>
                                        </div>
                                        <div className="task-actions archive-actions" onClick={(e) => e.stopPropagation()}>
                                            {task.summary && (
                                                <button
                                                    className={`summary-toggle-btn ${expandedSummaryIds.has(task.id) ? 'active' : ''}`}
                                                    onClick={() => toggleSummary(task.id)}
                                                    title={expandedSummaryIds.has(task.id) ? 'Hide summary' : 'Show summary'}
                                                >📝</button>
                                            )}
                                            <div className="task-actions-group">
                                                <button className="restore-btn" onClick={() => restoreTask(task.id)} title="Restore task">📤</button>
                                                <button className="delete-btn" onClick={() => deleteTask(task.id)} title="Delete permanently">×</button>
                                            </div>
                                        </div>
                                    </div>
                                    {expandedSummaryIds.has(task.id) && task.summary && (
                                        <div className="task-summary-block">
                                            {renderMarkdown(task.summary)}
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
                                                        setFilterTags(prev => 
                                                            prev.includes(tag) ? prev : [...prev, tag]
                                                        );
                                                    }}
                                                >
                                                    #{tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}
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
                                    <div className="task-header-row">
                                        <div className="task-header-info">
                                            <span className="task-text">{task.text}</span>
                                            <span className="task-header-date">
                                                {formatSummaryDate(task.summaryUpdatedAt || task.createdAt)}
                                            </span>
                                        </div>
                                        <div className="task-actions" onClick={(e) => e.stopPropagation()}>
                                            {task.summary && (
                                                <button
                                                    className={`summary-toggle-btn ${expandedSummaryIds.has(task.id) ? 'active' : ''}`}
                                                    onClick={(e) => { e.stopPropagation(); toggleSummary(task.id); }}
                                                    title={expandedSummaryIds.has(task.id) ? 'Hide summary' : 'Show summary'}
                                                >📝</button>
                                            )}
                                            <div className="task-actions-group">
                                                <button 
                                                    className={`export-btn ${copiedTaskId === task.id ? 'copied' : ''}`} 
                                                    onClick={(e) => { e.stopPropagation(); handleExportTask(task); }} 
                                                    title="Export to Gemini (Forge Keeper)"
                                                >
                                                    {copiedTaskId === task.id ? '✅' : '📋'}
                                                </button>
                                                <button className="add-note-btn" onClick={(e) => { e.stopPropagation(); startAddingNote(task); }} title="Add note to task">✍️</button>
                                                <button className="archive-btn" onClick={() => archiveTask(task.id)} title="Archive task">📥</button>
                                                <button className="edit-btn" onClick={() => startEditing(task)} title="Edit task">✎</button>
                                                <button className="delete-btn" onClick={() => deleteTask(task.id)} title="Delete task">×</button>
                                            </div>
                                        </div>
                                    </div>
                                    {expandedSummaryIds.has(task.id) && task.summary && (
                                        <div className="task-summary-block">
                                            {renderMarkdown(task.summary)}
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
                                                        setFilterTags(prev => 
                                                            prev.includes(tag) ? prev : [...prev, tag]
                                                        );
                                                    }}
                                                >
                                                    #{tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    {addingNoteTaskId === task.id && (
                                        <form 
                                            className="add-note-inline-form"
                                            onClick={(e) => e.stopPropagation()}
                                            onSubmit={(e) => {
                                                e.preventDefault();
                                                handleAddNote(task.id, noteTopic, noteContent, noteDate, noteTime);
                                            }}
                                        >
                                            <div className="add-note-fields">
                                                <input
                                                    type="text"
                                                    className="add-note-topic"
                                                    value={noteTopic}
                                                    onChange={(e) => setNoteTopic(e.target.value)}
                                                    placeholder="Topic (e.g. Q3 Budget Review)"
                                                    autoFocus
                                                    required
                                                    onKeyDown={(e) => e.key === 'Escape' && setAddingNoteTaskId(null)}
                                                />
                                                
                                                <div className="add-note-meta-row">
                                                    <div className="meta-field">
                                                        <label className="meta-label">Date</label>
                                                        <input
                                                            type="date"
                                                            className="add-note-date"
                                                            value={noteDate}
                                                            onChange={(e) => {
                                                                const selectedDate = e.target.value;
                                                                setNoteDate(selectedDate);
                                                                
                                                                const now = new Date();
                                                                const yyyy = now.getFullYear();
                                                                const mm = String(now.getMonth() + 1).padStart(2, '0');
                                                                const dd = String(now.getDate()).padStart(2, '0');
                                                                const todayStr = `${yyyy}-${mm}-${dd}`;
                                                                if (selectedDate !== todayStr) {
                                                                    setNoteTime('');
                                                                }
                                                            }}
                                                            required
                                                            onKeyDown={(e) => e.key === 'Escape' && setAddingNoteTaskId(null)}
                                                        />
                                                    </div>
                                                    <div className="meta-field">
                                                        <label className="meta-label">Time (optional)</label>
                                                        <div className="time-input-container">
                                                            <input
                                                                type="time"
                                                                className="add-note-time"
                                                                value={noteTime}
                                                                onChange={(e) => setNoteTime(e.target.value)}
                                                                onKeyDown={(e) => e.key === 'Escape' && setAddingNoteTaskId(null)}
                                                            />
                                                            {noteTime && (
                                                                <button
                                                                    type="button"
                                                                    className="clear-time-btn"
                                                                    onClick={() => setNoteTime('')}
                                                                    title="Clear time"
                                                                >
                                                                    ×
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <textarea
                                                    ref={noteContentRef}
                                                    className="add-note-content"
                                                    value={noteContent}
                                                    onChange={(e) => {
                                                        setNoteContent(e.target.value);
                                                        adjustNoteTextareaHeight();
                                                    }}
                                                    placeholder="Note details (supports markdown and multiple lines)..."
                                                    required
                                                    onKeyDown={(e) => e.key === 'Escape' && setAddingNoteTaskId(null)}
                                                />
                                            </div>
                                            <div className="add-note-buttons">
                                                <button type="submit" className="save-btn">Add Note</button>
                                                <button type="button" className="cancel-btn" onClick={() => setAddingNoteTaskId(null)}>Cancel</button>
                                            </div>
                                        </form>
                                    )}
                                </div>
                            </>
                        )}
                    </li>
                ))}
            </ul>
            {filteredTasks.length === 0 && (
                <p className="empty-state">
                    {showArchive
                        ? (filterTags.length > 0 ? `No archived tasks with tags ${filterTags.map(t=>`#${t}`).join(', ')}` : 'No archived tasks. Clean slate!')
                        : (filterTags.length > 0 ? `No tasks with tags ${filterTags.map(t=>`#${t}`).join(', ')}` : 'No tasks yet. Stay focused!')
                    }
                </p>
            )}
            </>
            )}
        </div>
    );
}

export default TaskList;

