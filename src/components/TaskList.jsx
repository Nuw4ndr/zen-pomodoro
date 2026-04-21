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

    // Listen to tasks in real-time
    useEffect(() => {
        if (!userId) {
            setTasks([]);
            return;
        }

        const q = query(
            collection(db, 'tasks'),
            where('userId', '==', userId),
            orderBy('createdAt', 'desc')
        );
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const tasksArray = [];
            querySnapshot.forEach((doc) => {
                tasksArray.push({ id: doc.id, ...doc.data() });
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
                await addDoc(collection(db, 'tasks'), {
                    text: inputValue.trim(),
                    completed: false,
                    createdAt: new Date(),
                    userId: userId
                });
                setInputValue('');
                setError(null);
            } catch (err) {
                console.error("Error adding task: ", err);
                setError(`Failed to add task: ${err.message}`);
            }
        }
    };

    const toggleTask = async (id, completed) => {
        try {
            const taskRef = doc(db, 'tasks', id);
            await updateDoc(taskRef, {
                completed: !completed
            });
            setError(null);
        } catch (err) {
            console.error("Error toggling task: ", err);
            setError(`Failed to update task: ${err.message}`);
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

    return (
        <div className="task-list-container">
            <h3>Tasks</h3>
            <form onSubmit={addTask} className="task-form">
                <input
                    type="text"
                    placeholder={userId ? "What are you working on?" : "Please login to add tasks"}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    disabled={!userId}
                />
                <button type="submit" className="add-task-btn" disabled={!userId}>+</button>
            </form>

            {error && (
                <div className="error-message">
                    <p>⚠️ {error.includes('index') ? 'Syncing your data...' : 'Connection error'}</p>
                </div>
            )}

            <ul className="tasks">
                {tasks.map((task) => (
                    <li key={task.id} className={`task-item ${task.completed ? 'completed' : ''}`}>
                        <span onClick={() => toggleTask(task.id, task.completed)}>{task.text}</span>
                        <button className="delete-btn" onClick={() => deleteTask(task.id)}>×</button>
                    </li>
                ))}
            </ul>
            {tasks.length === 0 && <p className="empty-state">No tasks yet. Stay focused!</p>}
        </div>
    );
}

export default TaskList;
