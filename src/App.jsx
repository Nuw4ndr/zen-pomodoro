import React, { useState, useEffect, useRef } from 'react';
import TaskList from './components/TaskList';
import PlaylistManager from './components/PlaylistManager';
import QuoteManager from './components/QuoteManager';
import { db, auth, googleProvider } from './firebase';
import { collection, onSnapshot, query, addDoc, getDocs, where } from 'firebase/firestore';
import { signInWithPopup, signOut, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import './App.css';

const MODES = {
  POMODORO: { label: 'Pomodoro', minutes: 25 },
  SHORT_BREAK: { label: 'Short Break', minutes: 5 },
  LONG_BREAK: { label: 'Long Break', minutes: 15 },
};

const DEFAULT_QUOTES = [
  "Focus is a matter of deciding what things you're not going to do.",
  "The successful warrior is the average man, with laser-like focus.",
  "Concentrate all your thoughts upon the work at hand.",
  "Focus on being productive instead of busy.",
  "What you focus on expands.",
  "Starve your distractions, feed your focus.",
  "Focus without distraction on a cognitively demanding task.",
  "Your focus determines your reality.",
  "The only way to do great work is to love what you do.",
  "One way to keep momentum going is to have constantly greater goals."
];

function App() {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
  const [mode, setMode] = useState('POMODORO');
  const [timeLeft, setTimeLeft] = useState(MODES.POMODORO.minutes * 60);
  const [isActive, setIsActive] = useState(false);
  const [quotes, setQuotes] = useState([]);
  const [quote, setQuote] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showPlaylists, setShowPlaylists] = useState(() => localStorage.getItem('showPlaylists') !== 'false');
  const [user, setUser] = useState(null);
  const audioRef = useRef(null);

  // Handle theme changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        signInAnonymously(auth).catch(err => console.error("Guest login failed:", err));
      }
    });
    return () => unsubscribe();
  }, []);

  // Listen to quotes from Firestore
  useEffect(() => {
    if (!user) {
      setQuotes(DEFAULT_QUOTES.map((text, index) => ({ id: `default-${index}`, text })));
      return;
    }

    const q = query(
      collection(db, 'quotes'),
      where('userId', '==', user.uid)
    );
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      if (querySnapshot.empty) {
        // Seed default quotes if empty for this user
        seedDefaultQuotes(user.uid);
        setQuotes(DEFAULT_QUOTES.map((text, index) => ({ id: `default-${index}`, text })));
      } else {
        const quotesArray = [];
        querySnapshot.forEach((doc) => {
          quotesArray.push({ id: doc.id, ...doc.data() });
        });
        setQuotes(quotesArray);
      }
    }, (error) => {
      console.error("Error listening to quotes: ", error);
    });

    return () => unsubscribe();
  }, [user]);

  const seedDefaultQuotes = async (userId) => {
    try {
      // Check again if empty before seeding to avoid duplicates
      const q = query(collection(db, 'quotes'), where('userId', '==', userId));
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        for (const text of DEFAULT_QUOTES) {
          await addDoc(collection(db, 'quotes'), {
            text,
            createdAt: new Date(),
            isDefault: true,
            userId: userId
          });
        }
      }
    } catch (error) {
      console.error("Error seeding quotes: ", error);
    }
  };

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Error logging in: ", error);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error logging out: ", error);
    }
  };

  useEffect(() => {
    let interval = null;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((time) => time - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      clearInterval(interval);
      setIsActive(false);
      if (audioRef.current) {
        audioRef.current.play();
      }
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft]);

  const toggleTimer = () => {
    if (!isActive) {
      const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
      setQuote(randomQuote?.text || randomQuote || 'Stay focused!');
    }
    setIsActive(!isActive);
  };

  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(MODES[mode].minutes * 60);
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    setIsActive(false);
    setTimeLeft(MODES[newMode].minutes * 60);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="app-container">
      <header>
        <h1>ZenPomodoro</h1>
        <div className="header-actions">
          <button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button
            className={`theme-toggle ${showPlaylists ? 'active' : ''}`}
            onClick={() => {
              setShowPlaylists(prev => {
                localStorage.setItem('showPlaylists', !prev);
                return !prev;
              });
            }}
            title={showPlaylists ? 'Hide playlists' : 'Show playlists'}
          >
            🎵
          </button>
          <div className="auth-controls">
            {user ? (
              <div className="user-info">
                {user.isAnonymous ? (
                  <>
                    <span className="guest-badge">Guest Mode</span>
                    <button className="auth-btn highlight" onClick={login}>Login with Google</button>
                  </>
                ) : (
                  <>
                    <span>{user.displayName}</span>
                    <button className="auth-btn" onClick={logout}>Logout</button>
                  </>
                )}
              </div>
            ) : (
              <span className="loading-auth">Connecting...</span>
            )}
          </div>
        </div>
      </header>

      <main className="glass-card timer-card compact">
          <button className="settings-btn" onClick={() => setShowSettings(true)} title="Manage Quotes">
            ⚙️
          </button>
          <div className="timer-row">
            <div className="mode-selector">
              {Object.keys(MODES).map((m) => (
                <button
                  key={m}
                  className={`mode-btn ${mode === m ? 'active' : ''}`}
                  onClick={() => switchMode(m)}
                >
                  {MODES[m].label}
                </button>
              ))}
            </div>

            <div className="timer-display">
              <span>{formatTime(timeLeft)}</span>
            </div>

            <div className="controls">
              <button className="primary-btn" onClick={toggleTimer}>
                {isActive ? 'Pause' : 'Start'}
              </button>
              <button className="secondary-btn" onClick={resetTimer}>
                Reset
              </button>
            </div>
          </div>

          {quote && <p className="quote fade-in">"{quote}"</p>}
        </main>

      <div className={`main-content ${!showPlaylists ? 'tasks-only' : ''}`}>
        <TaskList userId={user?.uid} />
        {showPlaylists && <PlaylistManager userId={user?.uid} />}
      </div>

      {showSettings && (
        <QuoteManager
          quotes={quotes}
          onUpdate={setQuotes}
          onClose={() => setShowSettings(false)}
          userId={user?.uid}
        />
      )}

      {/* Hidden audio element for notification */}
      <audio
        ref={audioRef}
        src="https://assets.mixkit.co/sfx/preview/mixkit-gentle-bell-notification-934.mp3"
      />
    </div>
  );
}

export default App;
