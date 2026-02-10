import React, { useState } from 'react';

function TaskList() {
    const [tasks, setTasks] = useState([]);
    const [inputValue, setInputValue] = useState('');

    const addTask = (e) => {
        e.preventDefault();
        if (inputValue.trim()) {
            setTasks([...tasks, { id: Date.now(), text: inputValue, completed: false }]);
            setInputValue('');
        }
    };

    const toggleTask = (id) => {
        setTasks(tasks.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
    };

    const deleteTask = (id) => {
        setTasks(tasks.filter(t => t.id !== id));
    };

    return (
        <div className="task-list-container">
            <h3>Tasks</h3>
            <form onSubmit={addTask} className="task-form">
                <input
                    type="text"
                    placeholder="What are you working on?"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                />
                <button type="submit" className="add-task-btn">+</button>
            </form>

            <ul className="tasks">
                {tasks.map((task) => (
                    <li key={task.id} className={`task-item ${task.completed ? 'completed' : ''}`}>
                        <span onClick={() => toggleTask(task.id)}>{task.text}</span>
                        <button className="delete-btn" onClick={() => deleteTask(task.id)}>×</button>
                    </li>
                ))}
            </ul>
            {tasks.length === 0 && <p className="empty-state">No tasks yet. Stay focused!</p>}
        </div>
    );
}

export default TaskList;
