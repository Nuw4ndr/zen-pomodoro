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
    where,
    serverTimestamp
} from 'firebase/firestore';

function PlaylistManager({ userId }) {
    const [playlists, setPlaylists] = useState([]);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingPlaylist, setEditingPlaylist] = useState(null);
    const [expandedPlaylist, setExpandedPlaylist] = useState(null);
    const [songs, setSongs] = useState({});

    // New Playlist Form State
    const [newPlaylist, setNewPlaylist] = useState({
        title: '',
        description: '',
        author: '',
        link: ''
    });

    // New Song Form State
    const [newSong, setNewSong] = useState({
        title: '',
        link: ''
    });

    const [activeEmbed, setActiveEmbed] = useState(null);
    const [error, setError] = useState(null);

    // Helper to convert YT Music links to Embed links
    const getYoutubeEmbedLink = (url) => {
        if (!url) return null;
        try {
            const urlObj = new URL(url);
            if (urlObj.hostname.includes('youtube.com')) {
                const listId = urlObj.searchParams.get('list');
                const videoId = urlObj.searchParams.get('v');

                if (listId) {
                    return `https://www.youtube.com/embed/videoseries?list=${listId}&autoplay=1`;
                } else if (videoId) {
                    return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
                }
            }
        } catch (e) {
            console.error("Invalid URL:", url);
        }
        return null;
    };

    // Listen to playlists
    useEffect(() => {
        if (!userId) {
            setPlaylists([]);
            return;
        }

        const q = query(
            collection(db, 'playlists'),
            where('userId', '==', userId),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const playlistsArray = [];
            querySnapshot.forEach((doc) => {
                playlistsArray.push({ id: doc.id, ...doc.data() });
            });
            setPlaylists(playlistsArray);
            setError(null);
        }, (err) => {
            console.error("Error listening to playlists: ", err);
            setError(err.message);
        });

        return () => unsubscribe();
    }, [userId]);

    // Listen to songs for the expanded playlist
    useEffect(() => {
        if (!expandedPlaylist || !userId) return;

        const q = query(
            collection(db, 'playlists', expandedPlaylist, 'songs'),
            orderBy('createdAt', 'asc')
        );

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const songsArray = [];
            querySnapshot.forEach((doc) => {
                songsArray.push({ id: doc.id, ...doc.data() });
            });
            setSongs(prev => ({ ...prev, [expandedPlaylist]: songsArray }));
        }, (err) => {
            console.error("Error listening to songs: ", err);
        });

        return () => unsubscribe();
    }, [expandedPlaylist, userId]);

    const handleAddPlaylist = async (e) => {
        e.preventDefault();
        if (!newPlaylist.title.trim()) return;

        try {
            await addDoc(collection(db, 'playlists'), {
                ...newPlaylist,
                userId,
                createdAt: serverTimestamp()
            });
            setNewPlaylist({ title: '', description: '', author: '', link: '' });
            setShowAddForm(false);
            setError(null);
        } catch (err) {
            console.error("Error adding playlist: ", err);
            setError(err.message);
        }
    };

    const handleUpdatePlaylist = async (e) => {
        e.preventDefault();
        if (!editingPlaylist.title.trim()) return;

        try {
            const playlistRef = doc(db, 'playlists', editingPlaylist.id);
            await updateDoc(playlistRef, {
                title: editingPlaylist.title,
                description: editingPlaylist.description,
                author: editingPlaylist.author,
                link: editingPlaylist.link
            });
            setEditingPlaylist(null);
            setError(null);
        } catch (err) {
            console.error("Error updating playlist: ", err);
            setError(err.message);
        }
    };

    const handleDeletePlaylist = async (id) => {
        if (!window.confirm("Are you sure you want to delete this playlist?")) return;
        try {
            await deleteDoc(doc(db, 'playlists', id));
            setError(null);
        } catch (err) {
            console.error("Error deleting playlist: ", err);
            setError(err.message);
        }
    };

    const handleAddSong = async (e, playlistId) => {
        e.preventDefault();
        if (!newSong.title.trim() || !newSong.link.trim()) return;

        try {
            await addDoc(collection(db, 'playlists', playlistId, 'songs'), {
                ...newSong,
                createdAt: serverTimestamp()
            });
            setNewSong({ title: '', link: '' });
            setError(null);
        } catch (err) {
            console.error("Error adding song: ", err);
            setError(err.message);
        }
    };

    const handleDeleteSong = async (playlistId, songId) => {
        try {
            await deleteDoc(doc(db, 'playlists', playlistId, 'songs', songId));
            setError(null);
        } catch (err) {
            console.error("Error deleting song: ", err);
            setError(err.message);
        }
    };

    return (
        <div className="playlist-manager">
            <div className="section-header">
                <h3>YouTube Music Playlists</h3>
                <button
                    className="icon-btn add-btn"
                    onClick={() => setShowAddForm(!showAddForm)}
                    disabled={!userId}
                >
                    {showAddForm ? '×' : '+'}
                </button>
            </div>

            {error && <div className="error-message">⚠️ {error}</div>}

            {activeEmbed && (
                <div className="active-player-section">
                    <div className="player-wrapper">
                        <iframe
                            src={activeEmbed}
                            title="YouTube Music Player"
                            frameBorder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                        ></iframe>
                        <button className="close-player" onClick={() => setActiveEmbed(null)}>×</button>
                    </div>
                </div>
            )}

            {showAddForm && (
                <form onSubmit={handleAddPlaylist} className="playlist-form">
                    <input
                        type="text"
                        placeholder="Playlist Title"
                        value={newPlaylist.title}
                        onChange={e => setNewPlaylist({ ...newPlaylist, title: e.target.value })}
                        required
                    />
                    <input
                        type="text"
                        placeholder="Author"
                        value={newPlaylist.author}
                        onChange={e => setNewPlaylist({ ...newPlaylist, author: e.target.value })}
                    />
                    <textarea
                        placeholder="Description"
                        value={newPlaylist.description}
                        onChange={e => setNewPlaylist({ ...newPlaylist, description: e.target.value })}
                    />
                    <input
                        type="url"
                        placeholder="YouTube Music Link"
                        value={newPlaylist.link}
                        onChange={e => setNewPlaylist({ ...newPlaylist, link: e.target.value })}
                    />
                    <button type="submit" className="submit-btn">Create Playlist</button>
                </form>
            )}

            <div className="playlists-list">
                {playlists.map(playlist => (
                    <div key={playlist.id} className={`playlist-card ${expandedPlaylist === playlist.id ? 'expanded' : ''}`}>
                        {editingPlaylist?.id === playlist.id ? (
                            <form onSubmit={handleUpdatePlaylist} className="playlist-form edit">
                                <input
                                    type="text"
                                    value={editingPlaylist.title}
                                    onChange={e => setEditingPlaylist({ ...editingPlaylist, title: e.target.value })}
                                />
                                <input
                                    type="text"
                                    value={editingPlaylist.author}
                                    onChange={e => setEditingPlaylist({ ...editingPlaylist, author: e.target.value })}
                                />
                                <textarea
                                    value={editingPlaylist.description}
                                    onChange={e => setEditingPlaylist({ ...editingPlaylist, description: e.target.value })}
                                />
                                <input
                                    type="url"
                                    value={editingPlaylist.link}
                                    onChange={e => setEditingPlaylist({ ...editingPlaylist, link: e.target.value })}
                                />
                                <div className="edit-actions">
                                    <button type="submit">Save</button>
                                    <button type="button" onClick={() => setEditingPlaylist(null)}>Cancel</button>
                                </div>
                            </form>
                        ) : (
                            <div className="playlist-info">
                                <div className="playlist-main" onClick={() => setExpandedPlaylist(expandedPlaylist === playlist.id ? null : playlist.id)}>
                                    <h4>{playlist.title}</h4>
                                    <span className="author">by {playlist.author || 'Unknown'}</span>
                                    {playlist.description && <p className="description">{playlist.description}</p>}
                                    <div className="playlist-links">
                                        {playlist.link && (
                                            <button 
                                                className="btn-play" 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setActiveEmbed(getYoutubeEmbedLink(playlist.link));
                                                }}
                                            >
                                                ▶ Play Playlist
                                            </button>
                                        )}
                                        {playlist.link && <a href={playlist.link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="yt-link">Open in YT Music</a>}
                                    </div>
                                </div>
                                <div className="playlist-actions">
                                    <button onClick={() => setEditingPlaylist(playlist)} className="icon-btn edit-btn">✎</button>
                                    <button onClick={() => handleDeletePlaylist(playlist.id)} className="icon-btn delete-btn">×</button>
                                </div>
                            </div>
                        )}

                        {expandedPlaylist === playlist.id && (
                            <div className="songs-section">
                                <h5>Songs</h5>
                                <ul className="songs-list">
                                    {(songs[playlist.id] || []).map(song => (
                                        <li key={song.id} className="song-item">
                                            <div className="song-info">
                                                <button 
                                                    className="btn-play-song"
                                                    onClick={() => setActiveEmbed(getYoutubeEmbedLink(song.link))}
                                                >
                                                    ▶
                                                </button>
                                                <a href={song.link} target="_blank" rel="noopener noreferrer" className="song-link">
                                                    {song.title}
                                                </a>
                                            </div>
                                            <button onClick={() => handleDeleteSong(playlist.id, song.id)} className="icon-btn delete-btn">×</button>
                                        </li>
                                    ))}
                                </ul>
                                <form onSubmit={(e) => handleAddSong(e, playlist.id)} className="song-form">
                                    <input
                                        type="text"
                                        placeholder="Song Title"
                                        value={newSong.title}
                                        onChange={e => setNewSong({ ...newSong, title: e.target.value })}
                                        required
                                    />
                                    <input
                                        type="url"
                                        placeholder="YT Music Song Link"
                                        value={newSong.link}
                                        onChange={e => setNewSong({ ...newSong, link: e.target.value })}
                                        required
                                    />
                                    <button type="submit" className="add-song-btn">+</button>
                                </form>
                            </div>
                        )}
                    </div>
                ))}
            </div>
            {!userId && <p className="message">Please sign in to manage playlists.</p>}
            {userId && playlists.length === 0 && !showAddForm && <p className="message">No playlists yet. Create one!</p>}
        </div>
    );
}

export default PlaylistManager;
